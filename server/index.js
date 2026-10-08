import express from 'express';
import dns from 'node:dns';
import tls from 'node:tls';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { once } from 'node:events';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { connectDatabase } from './config/database.js';
import { createPlatformRouter } from './routes/platform.js';
import { createCommunityRouter } from './routes/community.js';
import { createAIRouter } from './routes/ai.js';
import { createGmailOAuthRouter, sendPasswordResetEmail as sendGmailPasswordResetEmail } from './services/gmailOAuth.js';

const __filename=fileURLToPath(import.meta.url);
const __dirname=path.dirname(__filename);
dotenv.config({path:path.resolve(__dirname,'..','.env')});
dns.setServers(['8.8.8.8','1.1.1.1']);
const root=path.resolve(__dirname,'..');
const distDir=path.join(root,'dist');
const frontendIndex=path.join(distDir,'index.html');
const dataDir=path.resolve(process.env.DATA_DIR||path.join(__dirname,'data'));
const dataFile=path.join(dataDir,'db.json');
const uploadDir=path.join(dataDir,'uploads');
const legacyDataFile=path.join(__dirname,'data','db.json');
const legacyUploadDir=path.join(__dirname,'uploads');
const initialData={users:[],messages:[],privateChatMedia:[],posts:[],reports:[],moderationActions:[],notifications:[],pushSubscriptions:[],connections:[],jobs:[],applications:[],aiConversations:[],adminLoginActivity:[],adminAuditLogs:[],siteConfig:{brandName:'ZERA HUB',tagline:'Grow Ideas. Build Tomorrow.',logoUrl:'/assets/WhatsApp%20Image%202026-09-21%20at%2010.07.22%20AM.jpeg',contactEmail:'zerahub@outlook.com',socials:{facebook:'https://www.facebook.com/share/1BDT7JfvXm/',instagram:'https://www.instagram.com/zerahub2026/',x:'https://x.com/zerahub2809'},announcement:{enabled:false,text:''}}};
let memoryState=null;
let mongoStateCollection=null;
let durableState=null;
let persistenceQueue=Promise.resolve();
let pendingPersistenceWrites=0;
const passwordResetOverrides=new Map();
fs.mkdirSync(dataDir,{recursive:true});
fs.mkdirSync(uploadDir,{recursive:true});
if(dataFile!==legacyDataFile&&!fs.existsSync(dataFile)&&fs.existsSync(legacyDataFile)){
  fs.copyFileSync(legacyDataFile,dataFile);
}
if(uploadDir!==legacyUploadDir&&fs.existsSync(legacyUploadDir)){
  for(const entry of fs.readdirSync(legacyUploadDir,{withFileTypes:true})){
    if(!entry.isFile())continue;
    const source=path.join(legacyUploadDir,entry.name);
    const destination=path.join(uploadDir,entry.name);
    if(!fs.existsSync(destination))fs.copyFileSync(source,destination);
  }
}

function readLocalData(){
  if(fs.existsSync(dataFile)){
    try{
      const parsed=JSON.parse(fs.readFileSync(dataFile,'utf8'));
      return {...initialData,...parsed,siteConfig:{...initialData.siteConfig,...(parsed.siteConfig||{})}};
    }catch(err){
      console.error('Error reading db.json:',err.message);
      throw new Error('Persistent database file is invalid; refusing to replace it with empty data.');
    }
  }
  return JSON.parse(JSON.stringify(initialData));
}

function mergeRecords(localRecords, databaseRecords){
  const records=new Map();
  for(const record of [...(Array.isArray(localRecords)?localRecords:[]),...(Array.isArray(databaseRecords)?databaseRecords:[])]){
    if(record&&typeof record.id==='string')records.set(record.id,record);
  }
  return [...records.values()];
}

memoryState=readLocalData();
durableState=JSON.parse(JSON.stringify(memoryState));

const load=()=>{
  if(!memoryState)memoryState=readLocalData();
  return memoryState;
};

async function writeLocalDataAtomically(state){
  const temporaryFile=path.join(dataDir,`.db.json.${process.pid}.${randomBytes(8).toString('hex')}.tmp`);
  let replaced=false;
  try{
    await fs.promises.writeFile(temporaryFile,JSON.stringify(state,null,2),{flag:'wx'});
    await fs.promises.rename(temporaryFile,dataFile);
    replaced=true;
  }finally{
    if(!replaced){
      try{await fs.promises.unlink(temporaryFile)}
      catch(error){if(error.code!=='ENOENT')console.error('Could not remove temporary database file:',error.message)}
    }
  }
}

function enqueuePersistence(operation){
  const queued=persistenceQueue.then(operation,operation);
  persistenceQueue=queued.then(()=>undefined,()=>undefined);
  return queued;
}

function applyPasswordResetOverrides(state){
  for(const [userId,override] of passwordResetOverrides){
    const user=state.users?.find(account=>account.id===userId);
    if(!user)continue;
    user.passwordHash=override.passwordHash;
    user.sessionVersion=Math.max(Number(user.sessionVersion||0),override.sessionVersion);
    user._passwordCredentialVersion=Math.max(Number(user._passwordCredentialVersion||0),override.credentialVersion);
    if(override.consumedTokenHashes.has(user.passwordResetTokenHash)){
      delete user.passwordResetTokenHash;
      delete user.passwordResetExpiresAt;
    }
  }
}

function rememberPasswordReset(userId,user,tokenHash){
  const existing=passwordResetOverrides.get(userId);
  const consumedTokenHashes=existing?.consumedTokenHashes||new Set();
  consumedTokenHashes.add(tokenHash);
  passwordResetOverrides.set(userId,{
    passwordHash:user.passwordHash,
    sessionVersion:Number(user.sessionVersion||0),
    credentialVersion:Number(user._passwordCredentialVersion||0),
    consumedTokenHashes,
  });
}

function matchesResetToken(user,tokenHashHex,now=Date.now()){
  const expiresAt=Date.parse(user.passwordResetExpiresAt);
  if(typeof user.passwordResetTokenHash!=='string'||!Number.isFinite(expiresAt)||expiresAt<=now)return false;
  const savedHash=Buffer.from(user.passwordResetTokenHash,'hex');
  const suppliedHash=Buffer.from(tokenHashHex,'hex');
  return savedHash.length===suppliedHash.length&&timingSafeEqual(savedHash,suppliedHash);
}

function mongoStateReplacementPipeline(state){
  const replacement={...state,_id:'primary',_localMirrorMigrationComplete:true};
  const incomingUsers=Array.isArray(state.users)?state.users:[];
  const users={
    $map:{
      input:{$literal:incomingUsers},
      as:'incomingUser',
      in:{
        $let:{
          vars:{
            persistedUser:{
              $arrayElemAt:[
                {$filter:{
                  input:{$ifNull:['$users',[]]},
                  as:'persistedUser',
                  cond:{$eq:['$$persistedUser.id','$$incomingUser.id']},
                }},
                0,
              ],
            },
          },
          in:{
            $let:{
              vars:{
                persistedCredentialsAreNewer:{
                  $gt:[
                    {$ifNull:['$$persistedUser._passwordCredentialVersion',0]},
                    {$ifNull:['$$incomingUser._passwordCredentialVersion',0]},
                  ],
                },
              },
              in:{$mergeObjects:[
                '$$incomingUser',
                {$cond:['$$persistedCredentialsAreNewer',{
                  passwordHash:'$$persistedUser.passwordHash',
                  passwordResetTokenHash:{$ifNull:['$$persistedUser.passwordResetTokenHash',null]},
                  passwordResetExpiresAt:{$ifNull:['$$persistedUser.passwordResetExpiresAt',null]},
                  _passwordCredentialVersion:'$$persistedUser._passwordCredentialVersion',
                },{}]},
                {sessionVersion:{$max:[
                  {$ifNull:['$$persistedUser.sessionVersion',0]},
                  {$ifNull:['$$incomingUser.sessionVersion',0]},
                ]}},
              ]},
            },
          },
        },
      },
    },
  };
  return [{$replaceWith:{$mergeObjects:[{$literal:replacement},{users}]}}];
}

function synchronizePersistedCredentials(state,persistedState){
  const persistedUsers=new Map((persistedState.users||[]).map(user=>[user.id,user]));
  for(const user of state.users||[]){
    const persisted=persistedUsers.get(user.id);
    if(!persisted)continue;
    user.passwordHash=persisted.passwordHash;
    user.sessionVersion=Math.max(Number(user.sessionVersion||0),Number(persisted.sessionVersion||0));
    user._passwordCredentialVersion=Number(persisted._passwordCredentialVersion||0);
    for(const field of ['passwordResetTokenHash','passwordResetExpiresAt']){
      if(persisted[field]===undefined||persisted[field]===null)delete user[field];
      else user[field]=persisted[field];
    }
  }
}

const save=async(db)=>{
  const next=JSON.parse(JSON.stringify(db));
  pendingPersistenceWrites++;
  const persist=async()=>{
    try{
      if(mongoStateCollection){
        await mongoStateCollection.updateOne(
          {_id:'primary'},
          mongoStateReplacementPipeline(next),
          {upsert:true},
        );
        let persistedState=null;
        try{
          persistedState=await mongoStateCollection.findOne({_id:'primary'},{projection:{users:1}});
        }catch(err){
          console.error('Could not refresh persisted credentials after database save:',err.message);
        }
        if(persistedState){
          synchronizePersistedCredentials(next,{users:persistedState.users});
        }
        durableState=JSON.parse(JSON.stringify(next));
        memoryState=next;
        try{
          await writeLocalDataAtomically(durableState);
        }catch(err){
          console.error('Local database mirror save error:',err.message);
        }
        return;
      }
      applyPasswordResetOverrides(next);
      await writeLocalDataAtomically(next);
      durableState=next;
      memoryState=next;
    }catch(err){
      if(pendingPersistenceWrites===1){
        memoryState=durableState?JSON.parse(JSON.stringify(durableState)):readLocalData();
      }
      console.error('Durable database save failed:',err.message);
      throw err;
    }finally{
      pendingPersistenceWrites--;
    }
  };
  return enqueuePersistence(persist);
};

const app=express();
const httpServer=createServer(app);
app.set('trust proxy',1);

const configuredOrigins=new Set([
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:4173',
  'https://zera-hub0.vercel.app',
  ...(process.env.CLIENT_URL||'').split(',').map(origin=>origin.trim()).filter(Boolean),
  ...(process.env.FRONTEND_URL||'').split(',').map(origin=>origin.trim()).filter(Boolean),
]);

function isAllowedOrigin(origin){
  if(!origin)return true;
  if(configuredOrigins.has(origin))return true;
  if(origin.startsWith('http://localhost:')||origin.startsWith('http://127.0.0.1:'))return true;
  if(/^https:\/\/([a-zA-Z0-9_-]+\.)*vercel\.app$/.test(origin))return true;
  if(/^https:\/\/([a-zA-Z0-9_-]+\.)*onrender\.com$/.test(origin))return true;
  return false;
}

const allowClientOrigin=(origin,callback)=>callback(null,isAllowedOrigin(origin));
const io=new Server(httpServer,{cors:{origin:allowClientOrigin,methods:['GET','POST','PUT','PATCH','DELETE','OPTIONS'],credentials:true}});
const PORT=Number(process.env.PORT||4000);
const JWT_SECRET=process.env.JWT_SECRET;
if(!JWT_SECRET||JWT_SECRET.length<32||JWT_SECRET==='replace-with-a-long-random-secret')throw new Error('Set JWT_SECRET to a private random value of at least 32 characters before starting the server.');
const vapidPublicKey=process.env.VAPID_PUBLIC_KEY||'';
const vapidPrivateKey=process.env.VAPID_PRIVATE_KEY||'';
let webPush=null;
try{webPush=(await import('web-push')).default;}catch(error){/* optional */}
if(vapidPublicKey&&vapidPrivateKey&&webPush)webPush.setVapidDetails(process.env.VAPID_SUBJECT||'mailto:zerahub@outlook.com',vapidPublicKey,vapidPrivateKey);
const asyncRoute=handler=>(req,res,next)=>Promise.resolve(handler(req,res,next)).catch(next);
const commonPasswords=new Set([
  'password123!',
  'password1234!',
  'p@ssword123!',
  'p@ssw0rd123!',
  'qwerty123!',
  'qwertyuiop123!',
  'welcome123!',
  'admin123456!',
  'letmein123!',
  'changeme123!',
]);
function passwordPolicyError(password){
  if(typeof password!=='string')return 'Password is required.';
  const missing=[];
  if(password.length<12)missing.push('at least 12 characters');
  if(!/[a-z]/.test(password))missing.push('a lowercase letter');
  if(!/[A-Z]/.test(password))missing.push('an uppercase letter');
  if(!/\d/.test(password))missing.push('a number');
  if(!/[^A-Za-z0-9]/.test(password))missing.push('a special character');
  if(commonPasswords.has(password.toLowerCase()))missing.push('a less common password');
  return missing.length?`Password must include ${missing.join(', ')}.`:null;
}
app.use(helmet({crossOriginResourcePolicy:{policy:'cross-origin'},crossOriginOpenerPolicy:false}));
app.use(cors({origin:allowClientOrigin,credentials:true,methods:['GET','POST','PUT','PATCH','DELETE','OPTIONS'],allowedHeaders:['Content-Type','Authorization','Accept','X-Requested-With','Idempotency-Key']}));
app.options('*',cors({origin:allowClientOrigin,credentials:true}));
app.use(express.json({limit:'2mb'}));
app.use('/uploads',(req,res,next)=>{
  let filename='';
  try{filename=decodeURIComponent(req.path.slice(1))}
  catch{return res.status(404).json({error:'Media not found'})}
  if(!isSafeMediaFilename(filename))return res.status(404).json({error:'Media not found'});
  if(!isPrivateChatMedia(filename)){
    if(isPublicUpload(filename))return next();
    return res.status(404).json({error:'Media not found'});
  }
  auth(req,res,()=>sendPrivateChatMedia(req,res,filename,next));
});
app.use('/uploads',express.static(uploadDir,{setHeaders:(res,filePath)=>{
  const contentType={
    '.webm':'audio/webm',
    '.ogg':'audio/ogg',
    '.m4a':'audio/mp4',
    '.mp3':'audio/mpeg',
    '.wav':'audio/wav',
    '.aac':'audio/aac',
    '.3gp':'audio/3gpp',
  }[path.extname(filePath).toLowerCase()];
  if(contentType)res.setHeader('Content-Type',contentType);
}}));
const rootImageAssets=express.static(root,{dotfiles:'deny',fallthrough:true,index:false});
app.use('/assets',(req,res,next)=>{
  let assetName;
  try{assetName=decodeURIComponent(req.path.slice(1))}
  catch{return res.sendStatus(400)}
  if(!assetName||assetName!==path.basename(assetName)||assetName.includes('..')||! /^[A-Za-z0-9][A-Za-z0-9 ._()-]*\.(?:png|jpe?g|gif|webp|avif|svg)$/i.test(assetName))return next();
  rootImageAssets(req,res,next);
});
const authLimiter=rateLimit({windowMs:15*60*1000,max:200,standardHeaders:true,legacyHeaders:false});
const loginLimiter=rateLimit({windowMs:15*60*1000,max:20,standardHeaders:true,legacyHeaders:false,message:{error:'Too many sign-in attempts. Please wait before trying again.'}});
const signupLimiter=rateLimit({windowMs:60*60*1000,max:10,standardHeaders:true,legacyHeaders:false,message:{error:'Too many account-creation attempts. Please try again later.'}});
const passwordResetLimiter=rateLimit({windowMs:15*60*1000,max:5,standardHeaders:true,legacyHeaders:false,message:{error:'Too many password-reset requests. Please wait before trying again.'}});
const adminLoginLimiter=rateLimit({windowMs:15*60*1000,max:10,standardHeaders:true,legacyHeaders:false,message:{error:'Too many admin sign-in attempts. Please wait before trying again.'}});
const aiLimiter=rateLimit({windowMs:15*60*1000,max:100,standardHeaders:true,legacyHeaders:false});
const reportLimiter=rateLimit({windowMs:15*60*1000,max:30,standardHeaders:true,legacyHeaders:false});
app.use('/api/auth',authLimiter);
app.use('/api/auth/gmail',createGmailOAuthRouter({dataDir}));
app.use('/api/admin/login',authLimiter);
app.use('/api/ai',aiLimiter,createAIRouter({auth,load,save}));
app.use('/api/reports',reportLimiter);
app.use('/api/messages',(req,res,next)=>auth(req,res,()=>{
  const messagePath=req.originalUrl.slice('/api/messages/'.length).split('?')[0].split('/');
  const targetId=req.method==='POST'?(req.body?.toUserId||messagePath[0]):messagePath[0];
  if(!targetId)return next();
  const db=load();
  const connected=(db.connections||[]).some(connection=>
    connection.status==='accepted'&&
    ((connection.requesterId===req.user.id&&connection.recipientId===targetId)||
     (connection.requesterId===targetId&&connection.recipientId===req.user.id)));
  if(!connected)return res.status(403).json({error:'Accept the connection request before messaging'});
  next();
}));
app.get('/api/chat/media/:filename',auth,(req,res,next)=>{
  if(!isSafeMediaFilename(req.params.filename))return res.status(404).json({error:'Media not found'});
  sendPrivateChatMedia(req,res,req.params.filename,next);
});

function tokenFor(user){return jwt.sign({id:user.id,role:user.role||'user',email:user.role==='admin'?user.email:undefined,sessionVersion:Number(user.sessionVersion||0)},JWT_SECRET,{expiresIn:'7d'});}
function accountTypeOf(user){return user.accountType==='hire'?'hire':'developer';}
function accountStatusMessage(status){return status==='restricted'?'Your account is temporarily restricted.':status==='disabled'?'Your account has been disabled.':status==='banned'?'Your account has been banned.':status==='blocked'?'Your account has been blocked.':'Your account has been suspended.';}
function auth(req,res,next){
  const raw=req.headers.authorization||'';
  const token=raw.startsWith('Bearer ')?raw.slice(7):null;
  if(!token)return res.status(401).json({error:'Authentication required'});
  try{
    req.user=jwt.verify(token,JWT_SECRET);
    const db=load();
    if(req.user.role==='admin'){
      if(Number(req.user.sessionVersion||0)!==Number(db.adminSessionVersion||0))return res.status(401).json({error:'Admin session is no longer valid'});
    }else{
      const account=db.users.find(user=>user.id===req.user.id);
      if(!account)return res.status(401).json({error:'Account session is no longer valid'});
      if(Number(req.user.sessionVersion||0)!==Number(account.sessionVersion||0))return res.status(401).json({error:'Account session is no longer valid'});
      req.user.accountType=accountTypeOf(account);
      if(account.status==='restricted'&&account.restrictedUntil&&Date.parse(account.restrictedUntil)<=Date.now()){
        account.status='active';
        account.restrictedUntil=null;
        save(db).then(()=>next(),next);
        return;
      }
      if(account.status!=='active')return res.status(403).json({error:accountStatusMessage(account.status)});
    }
    next();
  }catch(error){
    if(error?.name==='JsonWebTokenError'||error?.name==='TokenExpiredError')return res.status(401).json({error:'Invalid or expired session'});
    next(error);
  }
}
function areConnected(firstId,secondId){return (load().connections||[]).some(connection=>connection.status==='accepted'&&((connection.requesterId===firstId&&connection.recipientId===secondId)||(connection.requesterId===secondId&&connection.recipientId===firstId)));}
function isSafeMediaFilename(filename){
  return typeof filename==='string'&&filename.length<=200&&
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(filename)&&
    filename===path.basename(filename)&&!filename.includes('..');
}
function referencesUpload(value,filename){
  if(typeof value!=='string'||!value.startsWith('/uploads/')||value.startsWith('//'))return false;
  try{
    const pathname=new URL(value,'http://zera-hub.local').pathname;
    return decodeURIComponent(pathname)===`/uploads/${filename}`;
  }catch{
    return false;
  }
}
function isPrivateChatMedia(filename){
  const db=load();
  return (db.privateChatMedia||[]).includes(filename)||
    (db.messages||[]).some(message=>
      referencesUpload(message.imageUrl,filename)||referencesUpload(message.voiceUrl,filename));
}
function isPublicUpload(filename){
  const db=load();
  // Public uploads are served only while referenced by records populated by upload handlers.
  // Profile/preferences APIs reject arbitrary upload paths; unknown files stay non-public.
  return (db.users||[]).some(user=>
    referencesUpload(user.avatar,filename)||
    referencesUpload(user.preferences?.chatWallpaperImage,filename))||
    (db.posts||[]).some(post=>referencesUpload(post.imageUrl,filename))||
    referencesUpload(db.siteConfig?.logoUrl,filename);
}
function sendPrivateChatMedia(req,res,filename,next){
  const db=load();
  const message=(db.messages||[]).find(item=>
    referencesUpload(item.imageUrl,filename)||referencesUpload(item.voiceUrl,filename));
  if(!message)return res.status(404).json({error:'Media not found'});
  if(req.user.id!==message.fromUserId&&req.user.id!==message.toUserId){
    return res.status(403).json({error:'You are not authorized to access this media'});
  }
  const otherUserId=req.user.id===message.fromUserId?message.toUserId:message.fromUserId;
  if(!areConnected(req.user.id,otherUserId)){
    return res.status(403).json({error:'You are not authorized to access this media'});
  }
  const resolvedUploadDir=path.resolve(uploadDir);
  const mediaPath=path.resolve(resolvedUploadDir,filename);
  const relativePath=path.relative(resolvedUploadDir,mediaPath);
  if(!relativePath||relativePath.startsWith(`..${path.sep}`)||path.isAbsolute(relativePath)){
    return res.status(404).json({error:'Media not found'});
  }
  try{
    if(!fs.statSync(mediaPath).isFile())return res.status(404).json({error:'Media not found'});
  }catch(error){
    if(error.code==='ENOENT'||error.code==='ENOTDIR')return res.status(404).json({error:'Media not found'});
    return next(error);
  }
  res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes'});
  const contentType={
    '.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.gif':'image/gif',
    '.webp':'image/webp','.avif':'image/avif',
    '.webm':'audio/webm','.ogg':'audio/ogg','.m4a':'audio/mp4','.mp3':'audio/mpeg',
    '.wav':'audio/wav','.aac':'audio/aac','.3gp':'audio/3gpp',
  }[path.extname(filename).toLowerCase()];
  if(contentType)res.type(contentType);
  res.sendFile(mediaPath,error=>{
    if(!error)return;
    if(res.headersSent)return next(error);
    res.status(404).json({error:'Media not found'});
  });
}
io.use((socket,next)=>{
  try{
    const claims=jwt.verify(socket.handshake.auth?.token,JWT_SECRET);
    if(typeof claims.id!=='string'||claims.role==='admin')return next(new Error('Authentication required'));
    const account=load().users.find(user=>user.id===claims.id&&user.status==='active');
    if(!account||Number(claims.sessionVersion||0)!==Number(account.sessionVersion||0))return next(new Error('Account session is no longer valid'));
    socket.data.userId=account.id;
    socket.data.sessionVersion=Number(account.sessionVersion||0);
    next();
  }catch{
    next(new Error('Authentication required'));
  }
});
io.on('connection',(socket)=>{
  socket.data.accountStatusTimer=setInterval(()=>{
    const db=load();
    const account=db.users.find(user=>user.id===socket.data.userId);
    if(account?.status==='restricted'&&account.restrictedUntil&&Date.parse(account.restrictedUntil)<=Date.now()){
      account.status='active';
      account.restrictedUntil=null;
      save(db).catch(error=>console.error('Could not restore an expired account restriction:',error.message));
      return;
    }
    if(account?.status==='active'&&Number(account.sessionVersion||0)===socket.data.sessionVersion)return;
    const message=account?.status==='active'?'Your account session has ended. Please sign in again.':account?accountStatusMessage(account.status):'Your account session is no longer valid. Please sign in again.';
    socket.emit('session:revoked',{message});
    socket.disconnect(true);
  },15000);
  socket.once('disconnect',()=>clearInterval(socket.data.accountStatusTimer));
});
function admin(req,res,next){auth(req,res,()=>{const configuredEmail=String(process.env.ADMIN_EMAIL||'').trim().toLowerCase();const tokenEmail=String(req.user.email||'').trim().toLowerCase();if(req.user.role!=='admin'||!configuredEmail||tokenEmail!==configuredEmail)return res.status(403).json({error:'Admin access required'});next();});}
function recordAdminEvent(db,req,action,details){db.adminAuditLogs||=[];db.adminAuditLogs.push({id:crypto.randomUUID(),action,adminEmail:req.user.email||'Administrator',details,createdAt:new Date().toISOString()});if(db.adminAuditLogs.length>500)db.adminAuditLogs.shift();}
function riskText(text=''){const t=text.toLowerCase();let score=0;const flags=[];const rules=[[/\b(send|pay)\s+(me|us)\s+(crypto|usdt|bitcoin)\b/g,30,'crypto payment request'],[/\b(password|otp|verification code)\b/g,25,'credential request'],[/\b(guaranteed|double your money|100% profit)\b/g,30,'unrealistic financial claim'],[/\bfree money|cash giveaway|investment opportunity\b/g,15,'promotional risk'],[/https?:\/\/[^\s]+/g,5,'external link'],[/\b(bit\.ly|tinyurl\.com|t\.co|is\.gd|cutt\.ly)\b/g,20,'shortened external link']];for(const [re,pts,label] of rules){re.lastIndex=0;if(re.test(t)){score+=pts;flags.push(label);}re.lastIndex=0;}if((t.match(/https?:\/\//g)||[]).length>3){score+=20;flags.push('link burst');}if(/(.)\1{8,}/.test(t)){score+=10;flags.push('repetitive character pattern');}const letters=text.match(/[A-Za-z]/g)||[];const capitals=letters.filter(character=>character===character.toUpperCase()).length;if(letters.length>=30&&capitals/letters.length>0.8){score+=10;flags.push('excessive capitalization');}return {score,flags,level:score>=60?'critical':score>=35?'high':score>=20?'medium':'low'};}
function publicUser(u){const lastSeenAt=u.lastSeenAt||null;return {id:u.id,name:u.name,username:u.username,role:u.role,accountType:u.accountType,bio:u.bio||'',skills:u.skills||[],avatar:u.avatar||'',status:u.status,verified:!!u.verified,lastSeenAt,online:!!lastSeenAt&&Date.now()-Date.parse(lastSeenAt)<90000,createdAt:u.createdAt};}
async function notifyUser(userId,type,title,body,data={}){
  const db=load();
  db.notifications||=[];
  if(type==='message'&&typeof data.messageId==='string'){
    const existing=db.notifications.find(item=>item.userId===userId&&item.type==='message'&&item.data?.messageId===data.messageId);
    if(existing)return existing;
  }
  const actorId=data.userId||data.fromUserId;
  const actor=actorId?db.users.find(item=>item.id===actorId):null;
  const notification={id:crypto.randomUUID(),userId,type,title,body,data,actor:actor?publicUser(actor):null,createdAt:new Date().toISOString(),readAt:null};
  db.notifications.push(notification);
  if(db.notifications.length>5000)db.notifications.splice(0,db.notifications.length-5000);
  await save(db);
  io.to(userId).emit('notification:new',notification);
  if(vapidPublicKey&&vapidPrivateKey&&webPush){
    const subscriptions=(db.pushSubscriptions||[]).filter(item=>item.userId===userId);
    for(const item of subscriptions){
      try{
        await webPush.sendNotification(item.subscription,JSON.stringify({title,body,url:data.url||'/app'}));
      }catch(error){
        if(error.statusCode===404||error.statusCode===410){
          db.pushSubscriptions=db.pushSubscriptions.filter(saved=>saved.id!==item.id);
        }else console.error('Push notification delivery failed:',error.message);
      }
    }
    await save(db);
  }
  return notification;
}
function adminOverview(db){
  const users=Array.isArray(db.users)?db.users:[];
  const reports=Array.isArray(db.reports)?db.reports:[];
  const moderationActions=Array.isArray(db.moderationActions)?db.moderationActions:[];
  const jobs=Array.isArray(db.jobs)?db.jobs:[];
  const applications=Array.isArray(db.applications)?db.applications:[];
  const posts=Array.isArray(db.posts)?db.posts:[];
  const messages=Array.isArray(db.messages)?db.messages:[];
  const projects=users.flatMap(user=>(Array.isArray(user.profile?.projects)?user.profile.projects:[]).map(project=>({...project,username:user.username,userId:user.id})));
  const comments=posts.flatMap(post=>(Array.isArray(post.comments)?post.comments:[]).flatMap(comment=>[comment,...(Array.isArray(comment.replies)?comment.replies:[])]));
  const siteConfig={...initialData.siteConfig,...(db.siteConfig&&typeof db.siteConfig==='object'?db.siteConfig:{})};
  return {
    users:users.map(user=>({...publicUser(user),moderationState:user.moderationState||'',restrictedUntil:user.restrictedUntil||null,verificationRequestAt:user.verificationRequestAt||null})),
    reports,
    moderationActions,
    verificationRequests:users.filter(user=>user.verificationRequestAt&&!user.verified).map(user=>({...publicUser(user),verificationRequestAt:user.verificationRequestAt})),
    siteConfig,
    jobs:jobs.map(job=>({id:job.id,title:job.title,organization:job.organization,status:job.status,ownerId:job.ownerId,createdAt:job.createdAt})),
    applications:applications.map(application=>({id:application.id,jobId:application.jobId,applicantId:application.applicantId,status:application.status,createdAt:application.createdAt})),
    projects,
    posts:posts.map(post=>({id:post.id,userId:post.userId,content:post.content,category:post.category,status:post.moderationStatus||'visible',createdAt:post.createdAt,comments:(Array.isArray(post.comments)?post.comments:[]).map(comment=>({id:comment.id,content:comment.content,status:comment.moderationStatus||'visible',userId:comment.userId,replies:(Array.isArray(comment.replies)?comment.replies:[]).map(reply=>({id:reply.id,content:reply.content,status:reply.moderationStatus||'visible',userId:reply.userId}))}))})),
    stats:{
      users:users.length,
      developers:users.filter(user=>user.accountType==='developer').length,
      hirers:users.filter(user=>user.accountType==='hire').length,
      messages:messages.length,
      posts:posts.length,
      projects:projects.length,
      jobs:jobs.length,
      applications:applications.length,
      comments:comments.length,
      openReports:reports.filter(report=>report.status==='open').length,
      activeUsers:users.filter(user=>user.status==='active').length,
      suspendedUsers:users.filter(user=>['suspended','restricted','disabled','blocked','banned'].includes(user.status)).length,
      pendingReports:reports.filter(report=>report.status==='open').length,
    },
  };
}
app.use('/api/platform',createPlatformRouter({auth,load,save,publicUser,notifyUser}));
app.get('/api/health',(req,res)=>res.json({ok:true,name:'ZERA HUB API',timestamp:new Date().toISOString()}));
app.get('/api/site-config',(req,res)=>res.json(load().siteConfig));
app.get('/api/auth/me',auth,(req,res)=>{
  const db=load();
  const user=db.users.find(u=>u.id===req.user.id);
  if(!user)return res.status(404).json({error:'User not found'});
  res.json({user:publicUser(user)});
});
app.post('/api/presence',auth,asyncRoute(async(req,res)=>{const db=load();const user=db.users.find(item=>item.id===req.user.id);if(!user)return res.status(404).json({error:'User not found'});user.lastSeenAt=new Date().toISOString();await save(db);res.json({lastSeenAt:user.lastSeenAt});}));
app.get('/api/notifications',auth,(req,res)=>{const db=load();res.json((db.notifications||[]).filter(item=>item.userId===req.user.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,100));});
app.patch('/api/notifications/read',auth,asyncRoute(async(req,res)=>{const fromUserId=req.body?.fromUserId;const notificationId=req.body?.notificationId;if(fromUserId!==undefined&&typeof fromUserId!=='string')return res.status(400).json({error:'fromUserId must be text'});if(notificationId!==undefined&&(typeof notificationId!=='string'||!notificationId.trim()))return res.status(400).json({error:'notificationId must be non-empty text'});const db=load();const now=new Date().toISOString();for(const item of db.notifications||[])if(item.userId===req.user.id&&!item.readAt&&(notificationId!==undefined?item.id===notificationId:!fromUserId||(item.type==='message'&&item.data?.fromUserId===fromUserId)))item.readAt=now;await save(db);res.json({ok:true});}));
app.get('/api/push/public-key',(req,res)=>res.json({publicKey:vapidPublicKey&&webPush?vapidPublicKey:null}));
app.post('/api/push/subscribe',auth,asyncRoute(async(req,res)=>{if(!vapidPublicKey||!vapidPrivateKey||!webPush)return res.status(503).json({error:'Browser push is not configured on this server'});const subscription=req.body?.subscription;if(!subscription||typeof subscription.endpoint!=='string'||typeof subscription.keys?.p256dh!=='string'||typeof subscription.keys?.auth!=='string')return res.status(400).json({error:'A valid push subscription is required'});const db=load();db.pushSubscriptions||=[];const current=db.pushSubscriptions.find(item=>item.userId===req.user.id&&item.subscription.endpoint===subscription.endpoint);if(current)current.subscription=subscription;else db.pushSubscriptions.push({id:crypto.randomUUID(),userId:req.user.id,subscription,createdAt:new Date().toISOString()});await save(db);res.status(201).json({ok:true});}));
app.delete('/api/push/subscribe',auth,asyncRoute(async(req,res)=>{const endpoint=req.body?.endpoint;if(typeof endpoint!=='string')return res.status(400).json({error:'Subscription endpoint is required'});const db=load();db.pushSubscriptions=(db.pushSubscriptions||[]).filter(item=>item.userId!==req.user.id||item.subscription.endpoint!==endpoint);await save(db);res.json({ok:true});}));
function smtpReplyReader(socket){
  let buffer='';
  let pendingLines=[];
  const replies=[];
  const waiters=[];
  let failure=null;
  const finish=()=>{
    while(waiters.length&&replies.length)waiters.shift()(replies.shift());
  };
  socket.setEncoding('utf8');
  socket.on('data',chunk=>{
    buffer+=chunk;
    let lineEnd;
    while((lineEnd=buffer.indexOf('\n'))!==-1){
      const line=buffer.slice(0,lineEnd).replace(/\r$/,'');
      buffer=buffer.slice(lineEnd+1);
      pendingLines.push(line);
      if(/^\d{3} /.test(line)){
        const lines=pendingLines;
        pendingLines=[];
        replies.push({code:Number(line.slice(0,3)),text:lines.join('\n')});
        finish();
      }
    }
  });
  socket.on('error',error=>{failure=error;while(waiters.length)waiters.shift()(null,error);});
  socket.on('close',()=>{if(!failure){failure=new Error('SMTP connection closed unexpectedly');while(waiters.length)waiters.shift()(null,failure);}});
  return ()=>failure?Promise.reject(failure):replies.length?Promise.resolve(replies.shift()):new Promise((resolve,reject)=>waiters.push((reply,error)=>error?reject(error):resolve(reply)));
}
async function sendPasswordResetEmail(email,link){
  const username=process.env.GMAIL_USER;
  const password=process.env.GMAIL_APP_PASSWORD;
  const from=process.env.PASSWORD_RESET_FROM||username;
  if(!username||!password||!from||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from))throw new Error('Gmail SMTP password-reset email is not configured');
  const socket=tls.connect({host:'smtp.gmail.com',port:465,servername:'smtp.gmail.com',rejectUnauthorized:true});
  socket.setTimeout(15000,()=>socket.destroy(new Error('Gmail SMTP connection timed out')));
  const nextReply=smtpReplyReader(socket);
  const expect=async(expected,command)=>{
    if(command)socket.write(`${command}\r\n`);
    const reply=await nextReply();
    if(reply.code!==expected)throw new Error(`Gmail SMTP rejected a command (${reply.code})`);
  };
  try{
    await once(socket,'secureConnect');
    await expect(220);
    await expect(250,'EHLO zera-hub.local');
    const credentials=Buffer.from(`\0${username}\0${password.replace(/\s/g,'')}`).toString('base64');
    await expect(235,`AUTH PLAIN ${credentials}`);
    await expect(250,`MAIL FROM:<${from}>`);
    await expect(250,`RCPT TO:<${email}>`);
    await expect(354,'DATA');
    const subject=Buffer.from('Reset your ZERA HUB password','utf8').toString('base64');
    const body=Buffer.from(`We received a request to reset your ZERA HUB password.\n\nOpen this link to choose a new password (valid for one hour):\n${link}\n\nIf you did not request this, you can ignore this email.`,'utf8').toString('base64').match(/.{1,76}/g).join('\r\n');
    const message=[
      `From: <${from}>`,
      `To: <${email}>`,
      `Subject: =?UTF-8?B?${subject}?=`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      body,
    ].join('\r\n').replace(/(^|\r\n)\./g,'$1..');
    socket.write(`${message}\r\n.\r\n`);
    await expect(250);
    await expect(221,'QUIT');
  } finally {
    socket.destroy();
  }
}
app.post('/api/auth/signup',signupLimiter,asyncRoute(async(req,res)=>{const {name,username,email,password,accountType='developer'}=req.body||{};if(!name||!username||!email||!password)return res.status(400).json({error:'Name, username, email and password are required'});if(!['developer','hire'].includes(accountType))return res.status(400).json({error:'Account type must be developer or hire'});const passwordError=passwordPolicyError(password);if(passwordError)return res.status(400).json({error:passwordError});const db=load();if(db.users.some(u=>u.email.toLowerCase()===email.toLowerCase()||u.username.toLowerCase()===username.toLowerCase()))return res.status(409).json({error:'An account with those details already exists'});const user={id:crypto.randomUUID(),name:name.trim(),username:username.trim().replace(/^@/,''),email:email.trim().toLowerCase(),passwordHash:await bcrypt.hash(password,12),accountType,role:'user',status:'active',verified:false,bio:'',skills:[],createdAt:new Date().toISOString()};db.users.push(user);await save(db);res.status(201).json({token:tokenFor(user),user:publicUser(user)});}));
app.post('/api/auth/password-reset',passwordResetLimiter,asyncRoute(async(req,res)=>{
  if(!process.env.GMAIL_OAUTH_CLIENT_ID||!process.env.GMAIL_OAUTH_CLIENT_SECRET)return res.status(503).json({error:'Gmail API OAuth client is not configured on this server'});
  const email=String(req.body?.email||'').trim().toLowerCase();
  if(email&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
    const db=load();
    const user=db.users.find(item=>item.email===email);
    if(user){
      const token=randomBytes(32).toString('hex');
      user.passwordResetTokenHash=createHash('sha256').update(token).digest('hex');
      user.passwordResetExpiresAt=new Date(Date.now()+60*60*1000).toISOString();
      user._passwordCredentialVersion=Number(user._passwordCredentialVersion||0)+1;
      await save(db);
      const frontend=(process.env.CLIENT_URL||'http://localhost:5173').split(',')[0].trim().replace(/\/+$/,'');
      try{
        await sendGmailPasswordResetEmail({dataDir,email:user.email,link:`${frontend}/reset-password?token=${encodeURIComponent(token)}`});
      }catch(error){
        delete user.passwordResetTokenHash;
        delete user.passwordResetExpiresAt;
        await save(db);
        console.error('Password reset email delivery failed:',error.message);
      }
    }
  }
  res.json({message:'If an account exists for that email, a password-reset link will be sent.'});
}));
app.post('/api/auth/password-reset/confirm',asyncRoute(async(req,res)=>{
  const token=typeof req.body?.token==='string'?req.body.token:'';
  const password=typeof req.body?.password==='string'?req.body.password:'';
  if(!token)return res.status(400).json({error:'A valid reset token is required'});
  const passwordError=passwordPolicyError(password);
  if(passwordError)return res.status(400).json({error:passwordError});
  const tokenHashHex=createHash('sha256').update(token).digest('hex');
  const db=load();
  const user=db.users.find(item=>matchesResetToken(item,tokenHashHex));
  if(!user)return res.status(400).json({error:'This password-reset link is invalid or expired. Request a new link.'});
  const passwordHash=await bcrypt.hash(password,12);
  const consumed=await enqueuePersistence(async()=>{
    const currentUser=memoryState.users.find(item=>item.id===user.id);
    if(!currentUser||!matchesResetToken(currentUser,tokenHashHex))return false;
    const nextSessionVersion=Number(currentUser.sessionVersion||0)+1;
    if(mongoStateCollection){
      const consumedAt=new Date().toISOString();
      const result=await mongoStateCollection.updateOne(
        {
          _id:'primary',
          users:{$elemMatch:{
            id:currentUser.id,
            passwordResetTokenHash:tokenHashHex,
            passwordResetExpiresAt:{$gt:consumedAt},
          }},
        },
        {
          $set:{'users.$.passwordHash':passwordHash},
          $inc:{
            'users.$.sessionVersion':1,
            'users.$._passwordCredentialVersion':1,
          },
          $unset:{'users.$.passwordResetTokenHash':'','users.$.passwordResetExpiresAt':''},
        },
      );
      if(result.matchedCount!==1)return false;
      currentUser.passwordHash=passwordHash;
      currentUser.sessionVersion=nextSessionVersion;
      currentUser._passwordCredentialVersion=Number(currentUser._passwordCredentialVersion||0)+1;
      delete currentUser.passwordResetTokenHash;
      delete currentUser.passwordResetExpiresAt;
      durableState=JSON.parse(JSON.stringify(memoryState));
      try{
        await writeLocalDataAtomically(durableState);
      }catch(error){
        console.error('Local database mirror save error after password reset:',error.message);
      }
      return true;
    }
    const next=JSON.parse(JSON.stringify(memoryState));
    const nextUser=next.users.find(item=>item.id===currentUser.id);
    if(!nextUser||!matchesResetToken(nextUser,tokenHashHex))return false;
    nextUser.passwordHash=passwordHash;
    nextUser.sessionVersion=nextSessionVersion;
    nextUser._passwordCredentialVersion=Number(nextUser._passwordCredentialVersion||0)+1;
    delete nextUser.passwordResetTokenHash;
    delete nextUser.passwordResetExpiresAt;
    await writeLocalDataAtomically(next);
    currentUser.passwordHash=passwordHash;
    currentUser.sessionVersion=nextSessionVersion;
    currentUser._passwordCredentialVersion=Number(currentUser._passwordCredentialVersion||0)+1;
    delete currentUser.passwordResetTokenHash;
    delete currentUser.passwordResetExpiresAt;
    rememberPasswordReset(currentUser.id,currentUser,tokenHashHex);
    durableState=next;
    return true;
  });
  if(!consumed)return res.status(400).json({error:'This password-reset link is invalid or expired. Request a new link.'});
  res.json({ok:true});
}));
app.post('/api/auth/login',loginLimiter,asyncRoute(async(req,res)=>{const {email,password,accountType}=req.body||{};if(accountType!==undefined&&!['developer','hire'].includes(accountType))return res.status(400).json({error:'Account type must be developer or hire'});const db=load();const user=db.users.find(u=>u.email===String(email||'').trim().toLowerCase()||u.username.toLowerCase()===String(email||'').trim().toLowerCase());if(user?.status==='restricted'&&user.restrictedUntil&&Date.parse(user.restrictedUntil)<=Date.now()){user.status='active';user.restrictedUntil=null;await save(db);}if(typeof password!=='string'||!user||!(await bcrypt.compare(password,user.passwordHash)))return res.status(401).json({error:'Invalid email or password'});if(user.status!=='active')return res.status(403).json({error:accountStatusMessage(user.status)});if(accountType&&accountTypeOf(user)!==accountType)return res.status(403).json({error:`This account is registered as a ${accountTypeOf(user)==='hire'?'hirer':'developer'}. Sign in through the matching account area.`});res.json({token:tokenFor(user),user:publicUser(user)});}));
app.post('/api/auth/logout',auth,asyncRoute(async(req,res)=>{
  const db=load();
  if(req.user.role==='admin')db.adminSessionVersion=Number(db.adminSessionVersion||0)+1;
  else{
    const account=db.users.find(user=>user.id===req.user.id);
    if(!account)return res.status(401).json({error:'Account session is no longer valid'});
    account.sessionVersion=Number(account.sessionVersion||0)+1;
  }
  await save(db);
  res.json({ok:true});
}));
app.get('/api/users',auth,(req,res)=>{const db=load();res.json(db.users.filter(u=>u.status==='active').map(publicUser));});
app.get('/api/users/:id',auth,(req,res)=>{const u=load().users.find(x=>x.id===req.params.id);if(!u)return res.status(404).json({error:'User not found'});res.json(publicUser(u));});
app.patch('/api/profile',auth,asyncRoute(async(req,res)=>{const db=load();const u=db.users.find(x=>x.id===req.user.id);if(!u)return res.status(404).json({error:'User not found'});if(req.body.avatar!==undefined&&req.body.avatar!==u.avatar&&req.body.avatar!=='')return res.status(400).json({error:'Upload a profile image using the avatar upload endpoint'});for(const k of ['name','bio','skills','avatar'])if(req.body[k]!==undefined)u[k]=req.body[k];await save(db);res.json(publicUser(u));}));
app.post('/api/messages',auth,asyncRoute(async(req,res)=>{const idempotency=messageRequestKey(req,res);if(!idempotency)return;if(idempotency.existing)return res.json(idempotency.existing);const {toUserId,body}=req.body||{};if(!toUserId||typeof body!=='string'||!body.trim())return res.status(400).json({error:'Recipient and message are required'});const risk=riskText(body);const db=load();const message={id:crypto.randomUUID(),fromUserId:req.user.id,toUserId,body:body.trim(),imageUrl:'',createdAt:new Date().toISOString(),sentAt:new Date().toISOString(),deliveredAt:null,readAt:null,risk,...(idempotency.key?{clientRequestId:idempotency.key}:{})};if(risk.level==='critical'||risk.level==='high'){db.moderationActions.push({id:crypto.randomUUID(),type:'message_blocked',userId:req.user.id,reason:risk.flags,createdAt:new Date().toISOString()});await save(db);return res.status(422).json({error:'Message blocked by ZERA Trust & Safety',risk});}db.messages.push(message);await save(db);io.to(toUserId).emit('message:new',message);const sender=db.users.find(item=>item.id===req.user.id);const senderName=sender?.name||'A ZERA HUB member';await notifyUser(toUserId,'message',`New message from ${senderName}`,message.body.replace(/\s+/g,' ').slice(0,120),{url:`/messages?user=${encodeURIComponent(req.user.id)}&message=${encodeURIComponent(message.id)}`,fromUserId:req.user.id,messageId:message.id});res.status(201).json(message);}));
app.get('/api/messages/:userId',auth,asyncRoute(async(req,res)=>{const db=load();const now=new Date().toISOString();const messages=db.messages.filter(message=>(message.fromUserId===req.user.id&&message.toUserId===req.params.userId)||(message.toUserId===req.user.id&&message.fromUserId===req.params.userId));const delivered=messages.filter(message=>message.toUserId===req.user.id&&!message.deliveredAt);for(const message of delivered)message.deliveredAt=now;if(delivered.length)await save(db);res.json(messages);}));
app.patch('/api/messages/:userId/read',auth,asyncRoute(async(req,res)=>{const db=load();const readAt=new Date().toISOString();const messages=db.messages.filter(message=>message.fromUserId===req.params.userId&&message.toUserId===req.user.id&&!message.readAt);const messageIds=messages.map(message=>message.id);if(messageIds.length){messages.forEach(message=>{message.readAt=readAt});await save(db);io.to(req.params.userId).emit('message:read',{readerId:req.user.id,messageIds,readAt});}res.json({messageIds,readAt});}));
app.delete('/api/messages/:userId/:messageId',auth,asyncRoute(async(req,res)=>{
  const db=load();
  const index=db.messages.findIndex(message=>message.id===req.params.messageId&&message.fromUserId===req.user.id&&message.toUserId===req.params.userId);
  if(index<0)return res.status(404).json({error:'Message not found or you do not have permission to delete it'});
  const [message]=db.messages.splice(index,1);
  db.privateChatMedia||=[];
  for(const mediaUrl of [message.voiceUrl,message.imageUrl]){
    if(typeof mediaUrl!=='string'||!mediaUrl.startsWith('/uploads/'))continue;
    const filename=mediaUrl.slice('/uploads/'.length);
    if(isSafeMediaFilename(filename)&&!db.privateChatMedia.includes(filename))db.privateChatMedia.push(filename);
  }
  db.notifications=(db.notifications||[]).filter(item=>item.data?.messageId!==message.id);
  await save(db);
  for(const mediaUrl of [message.voiceUrl,message.imageUrl]){
    if(typeof mediaUrl!=='string'||!mediaUrl.startsWith('/uploads/'))continue;
    const mediaPath=path.join(uploadDir,path.basename(mediaUrl));
    if((db.messages||[]).some(item=>item.voiceUrl===mediaUrl||item.imageUrl===mediaUrl)||!fs.existsSync(mediaPath))continue;
    try{fs.unlinkSync(mediaPath);}catch(error){console.error('Deleted message media could not be removed:',error.message);}
  }
  const event={messageId:message.id,fromUserId:message.fromUserId,toUserId:message.toUserId};
  io.to(message.fromUserId).emit('message:deleted',event);
  io.to(message.toUserId).emit('message:deleted',event);
  res.json({ok:true});
}));
app.post('/api/posts',auth,asyncRoute(async(req,res)=>{const {content}=req.body||{};if(!content?.trim())return res.status(400).json({error:'Post content is required'});const risk=riskText(content);const db=load();if(risk.level==='critical'||risk.level==='high'){db.moderationActions.push({id:crypto.randomUUID(),type:'post_blocked',userId:req.user.id,reason:risk.flags,createdAt:new Date().toISOString()});await save(db);return res.status(422).json({error:'Post blocked by ZERA Trust & Safety',risk});}const post={id:crypto.randomUUID(),userId:req.user.id,content:content.trim(),createdAt:new Date().toISOString()};db.posts.unshift(post);await save(db);res.status(201).json(post);}));
app.get('/api/posts',(req,res)=>{const db=load();res.json(db.posts.slice(0,50).map(p=>({...p,user:publicUser(db.users.find(u=>u.id===p.userId)||{id:p.userId,name:'ZERA member',username:'member',role:'user',status:'active',createdAt:p.createdAt})})));});
app.post('/api/reports',auth,asyncRoute(async(req,res)=>{const {targetType,targetId,targetUserId,reason,details=''}=req.body||{};const type=targetType||'user';const id=targetId||targetUserId;if(!['user','profile','post','comment','job'].includes(type)||typeof id!=='string'||!id.trim()||typeof reason!=='string'||!reason.trim())return res.status(400).json({error:'A valid target, target type and reason are required'});if((type==='user'||type==='profile')&&id===req.user.id)return res.status(400).json({error:'You cannot report your own account'});if(typeof details!=='string'||details.length>2000)return res.status(400).json({error:'Report details must be under 2,000 characters'});const db=load();const comments=(db.posts||[]).flatMap(post=>(post.comments||[]).flatMap(comment=>[comment,...(comment.replies||[])]));const exists=(type==='user'||type==='profile')?db.users.some(user=>user.id===id):type==='post'?(db.posts||[]).some(post=>post.id===id):type==='comment'?comments.some(comment=>comment.id===id):(db.jobs||[]).some(job=>job.id===id);if(!exists)return res.status(404).json({error:'Reported content was not found'});db.reports||=[];if(db.reports.some(report=>report.reporterId===req.user.id&&(report.targetType||'user')===type&&(report.targetId||report.targetUserId)===id&&report.status==='open'))return res.status(409).json({error:'You already have an open report for this item'});const report={id:crypto.randomUUID(),reporterId:req.user.id,targetType:type,targetId:id,targetUserId:type==='user'||type==='profile'?id:undefined,reason:reason.trim().slice(0,120),details:details.trim(),status:'open',createdAt:new Date().toISOString()};db.reports.push(report);await save(db);res.status(201).json({ok:true,id:report.id});}));
const upload=multer({storage:multer.diskStorage({destination:uploadDir,filename:(req,file,cb)=>cb(null,`${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g,'_')}`)}),limits:{fileSize:2*1024*1024},fileFilter:(req,file,cb)=>cb(null,['image/jpeg','image/png','image/gif','image/webp','image/avif'].includes(file.mimetype))});
const imageExtensions={'image/jpeg':'.jpg','image/png':'.png','image/gif':'.gif','image/webp':'.webp','image/avif':'.avif'};
const communityUpload=multer({storage:multer.diskStorage({destination:uploadDir,filename:(req,file,cb)=>cb(null,`${Date.now()}-${crypto.randomUUID()}${imageExtensions[file.mimetype]||'.img'}`)}),limits:{fileSize:2*1024*1024},fileFilter:(req,file,cb)=>cb(null,Boolean(imageExtensions[file.mimetype]))});
const audioFormats={
  'audio/webm':{extension:'.webm'},
  'audio/ogg':{extension:'.ogg'},
  'audio/mp4':{extension:'.m4a'},
  'audio/m4a':{extension:'.m4a'},
  'audio/x-m4a':{extension:'.m4a'},
  'audio/mpeg':{extension:'.mp3'},
  'audio/wav':{extension:'.wav'},
  'audio/x-wav':{extension:'.wav'},
  'audio/aac':{extension:'.aac'},
  'audio/3gpp':{extension:'.3gp'},
};
const audioExtensions=Object.fromEntries(Object.entries(audioFormats).map(([type,format])=>[type,format.extension]));
const voiceUpload=multer({
  storage:multer.diskStorage({destination:uploadDir,filename:(req,file,cb)=>cb(null,`${Date.now()}-${crypto.randomUUID()}.upload`)}),
  limits:{fileSize:12*1024*1024},
  fileFilter:(req,file,cb)=>{
    const declaredType=file.mimetype.split(';')[0].toLowerCase();
    cb(null,Boolean(audioFormats[declaredType])||declaredType==='application/octet-stream');
  },
});
function receiveVoiceUpload(req,res,next){
  voiceUpload.single('voice')(req,res,error=>{
    if(!error)return next();
    const tooLarge=error instanceof multer.MulterError&&error.code==='LIMIT_FILE_SIZE';
    console.error('Voice upload middleware failed',{code:error.code||error.name,message:error.message});
    return res.status(tooLarge?413:400).json({error:tooLarge?'Voice messages cannot exceed 12 MB.':'The voice recording could not be uploaded. Please try again.'});
  });
}
function inspectAudioFile(file){
  const bytes=fs.readFileSync(file.path);
  if(!bytes.length)throw new Error('Uploaded voice recording is empty');
  if(bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])))return {bytes,mimeType:'audio/webm'};
  if(bytes.subarray(0,4).toString('ascii')==='OggS')return {bytes,mimeType:'audio/ogg'};
  if(bytes.subarray(0,4).toString('ascii')==='RIFF'&&bytes.subarray(8,12).toString('ascii')==='WAVE'){
    if(bytes.length<44||bytes.readUInt32LE(4)+8!==bytes.length)throw new Error('Uploaded WAV recording has an invalid RIFF length');
    let format=null;
    let dataLength=0;
    let offset=12;
    while(offset+8<=bytes.length){
      const chunkName=bytes.subarray(offset,offset+4).toString('ascii');
      const chunkLength=bytes.readUInt32LE(offset+4);
      const chunkStart=offset+8;
      const chunkEnd=chunkStart+chunkLength;
      if(chunkEnd>bytes.length)throw new Error('Uploaded WAV recording contains a truncated chunk');
      if(chunkName==='fmt '){
        if(chunkLength<16)throw new Error('Uploaded WAV recording has an incomplete format header');
        format={
          encoding:bytes.readUInt16LE(chunkStart),
          channels:bytes.readUInt16LE(chunkStart+2),
          sampleRate:bytes.readUInt32LE(chunkStart+4),
          byteRate:bytes.readUInt32LE(chunkStart+8),
          blockAlign:bytes.readUInt16LE(chunkStart+12),
          bitsPerSample:bytes.readUInt16LE(chunkStart+14),
        };
      }else if(chunkName==='data'){
        dataLength=chunkLength;
      }
      offset=chunkEnd+(chunkLength%2);
    }
    if(!format||format.encoding!==1||![1,2].includes(format.channels)||format.bitsPerSample!==16||
      format.sampleRate<8000||format.sampleRate>192000||
      format.blockAlign!==format.channels*2||format.byteRate!==format.sampleRate*format.blockAlign||
      dataLength<=0||dataLength%format.blockAlign!==0){
      throw new Error('Uploaded WAV recording is not valid 16-bit PCM audio');
    }
    return {bytes,mimeType:'audio/wav'};
  }
  if(bytes.length>=12&&bytes.subarray(4,8).toString('ascii')==='ftyp'){
    const brand=bytes.subarray(8,12).toString('ascii');
    return {bytes,mimeType:/^(3gp|3g2)/.test(brand)?'audio/3gpp':'audio/mp4'};
  }
  if(bytes.subarray(0,3).toString('ascii')==='ID3'||(bytes.length>=2&&bytes[0]===0xff&&(bytes[1]&0xe0)===0xe0&&(bytes[1]&0x06)!==0))return {bytes,mimeType:'audio/mpeg'};
  if(bytes.length>=2&&bytes[0]===0xff&&(bytes[1]&0xf6)===0xf0)return {bytes,mimeType:'audio/aac'};
  throw new Error(`Uploaded voice recording has an unsupported or invalid audio container (declared ${file.mimetype||'unknown'})`);
}
function storedVoiceDetails(message){
  if(typeof message.voiceUrl!=='string'||!message.voiceUrl.startsWith('/uploads/'))throw new Error('Stored voice message does not have a valid upload URL');
  const storedPath=path.join(uploadDir,path.basename(message.voiceUrl));
  const bytes=fs.readFileSync(storedPath);
  const audio=inspectAudioFile({path:storedPath,mimetype:message.voiceMimeType||''});
  if(!bytes.length||audio.mimeType!==message.voiceMimeType)throw new Error('Stored voice message format no longer matches its message record');
  return {voiceSizeBytes:bytes.length,voiceSha256:createHash('sha256').update(bytes).digest('hex')};
}
function messageRequestKey(req,res){
  const key=req.get('Idempotency-Key');
  if(key===undefined)return {key:null,existing:null};
  if(!/^[a-zA-Z0-9:_-]{1,128}$/.test(key)){
    res.status(400).json({error:'Idempotency-Key must contain 1 to 128 letters, numbers, colons, underscores, or hyphens'});
    return null;
  }
  const existing=load().messages.find(message=>message.fromUserId===req.user.id&&message.clientRequestId===key);
  return {key,existing};
}
function validImageSignature(file){const bytes=fs.readFileSync(file.path);if(file.mimetype==='image/jpeg')return bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;if(file.mimetype==='image/png')return bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));if(file.mimetype==='image/gif')return bytes.subarray(0,6).toString('ascii').startsWith('GIF8');if(file.mimetype==='image/webp')return bytes.subarray(0,4).toString('ascii')==='RIFF'&&bytes.subarray(8,12).toString('ascii')==='WEBP';if(file.mimetype==='image/avif')return bytes.subarray(4,12).toString('ascii').includes('ftyp')&&/avif|avis|mif1/.test(bytes.subarray(8,16).toString('ascii'));return false;}
app.post('/api/profile/avatar',auth,communityUpload.single('avatar'),asyncRoute(async(req,res)=>{if(!req.file)return res.status(400).json({error:'A valid image file is required'});if(!validImageSignature(req.file)){fs.unlinkSync(req.file.path);return res.status(415).json({error:'The uploaded file is not a supported image'});}const db=load();const user=db.users.find(item=>item.id===req.user.id);if(!user){fs.unlinkSync(req.file.path);return res.status(404).json({error:'User not found'});}user.avatar=`/uploads/${req.file.filename}`;await save(db);res.json(publicUser(user));}));
app.post('/api/profile/chat-wallpaper',auth,communityUpload.single('image'),asyncRoute(async(req,res)=>{if(!req.file)return res.status(400).json({error:'A valid image file is required'});if(!validImageSignature(req.file)){fs.unlinkSync(req.file.path);return res.status(415).json({error:'The uploaded file is not a supported image'});}const db=load();const user=db.users.find(item=>item.id===req.user.id);if(!user){fs.unlinkSync(req.file.path);return res.status(404).json({error:'User not found'});}user.preferences||={};user.preferences.chatWallpaper='custom';user.preferences.chatWallpaperImage=`/uploads/${req.file.filename}`;await save(db);res.status(201).json({chatWallpaper:'custom',chatWallpaperImage:user.preferences.chatWallpaperImage});}));
app.post('/api/messages/:userId/image',auth,communityUpload.single('image'),asyncRoute(async(req,res)=>{if(!req.file)return res.status(400).json({error:'A valid image file is required'});if(!validImageSignature(req.file)){fs.unlinkSync(req.file.path);return res.status(415).json({error:'The uploaded file is not a supported image'});}const idempotency=messageRequestKey(req,res);if(!idempotency){fs.unlinkSync(req.file.path);return;}if(idempotency.existing){fs.unlinkSync(req.file.path);return res.json(idempotency.existing);}const db=load();const recipient=db.users.find(item=>item.id===req.params.userId&&item.status==='active');if(!recipient){fs.unlinkSync(req.file.path);return res.status(404).json({error:'Recipient not found'});}const message={id:crypto.randomUUID(),fromUserId:req.user.id,toUserId:req.params.userId,body:'',imageUrl:`/uploads/${req.file.filename}`,createdAt:new Date().toISOString(),sentAt:new Date().toISOString(),deliveredAt:null,readAt:null,...(idempotency.key?{clientRequestId:idempotency.key}:{})};db.privateChatMedia||=[];db.privateChatMedia.push(req.file.filename);db.messages.push(message);try{await save(db);}catch(error){fs.unlinkSync(req.file.path);throw error;}io.to(req.params.userId).emit('message:new',message);const senderName=db.users.find(item=>item.id===req.user.id)?.name||'A ZERA HUB member';await notifyUser(req.params.userId,'message',`New message from ${senderName}`,'Sent you an image.',{url:`/messages?user=${encodeURIComponent(req.user.id)}&message=${encodeURIComponent(message.id)}`,fromUserId:req.user.id,messageId:message.id});res.status(201).json(message);}));
app.post('/api/messages/:userId/voice',auth,receiveVoiceUpload,asyncRoute(async(req,res)=>{
  if(!req.file)return res.status(400).json({error:'A supported voice recording is required'});
  const cleanup=()=>{if(req.file?.path&&fs.existsSync(req.file.path))fs.unlinkSync(req.file.path);};
  let audio;
  try{
    audio=inspectAudioFile(req.file);
  }catch(error){
    cleanup();
    console.error('Voice upload validation failed:',error.message,{declaredMimeType:req.file.mimetype,bytes:req.file.size});
    return res.status(415).json({error:'The uploaded voice recording is empty, corrupted, or uses an unsupported audio format.'});
  }
  if(req.file.size<=0||audio.bytes.length!==req.file.size){
    cleanup();
    console.error('Voice upload size validation failed',{reportedBytes:req.file.size,storedBytes:audio.bytes.length});
    return res.status(422).json({error:'The uploaded voice recording is empty or incomplete. Please record it again.'});
  }
  const idempotency=messageRequestKey(req,res);
  if(!idempotency){cleanup();return;}
  if(idempotency.existing){
    cleanup();
    try{return res.json({...idempotency.existing,...storedVoiceDetails(idempotency.existing)});}
    catch(error){
      console.error('Could not verify an existing idempotent voice upload:',error.message,{messageId:idempotency.existing.id,url:idempotency.existing.voiceUrl});
      return res.status(500).json({error:'The previously uploaded voice recording could not be verified. Please contact support.'});
    }
  }
  const durationSeconds=Number(req.body?.durationSeconds);
  if(!Number.isFinite(durationSeconds)||durationSeconds<=0||durationSeconds>180){cleanup();return res.status(400).json({error:'Voice messages must be between 1 and 180 seconds'});}
  const db=load();
  const recipient=db.users.find(item=>item.id===req.params.userId&&item.status==='active');
  if(!recipient){cleanup();return res.status(404).json({error:'Recipient not found'});}
  const storedFilename=`${path.basename(req.file.filename,'.upload')}${audioExtensions[audio.mimeType]}`;
  const storedPath=path.join(uploadDir,storedFilename);
  fs.renameSync(req.file.path,storedPath);
  const storedBytes=fs.statSync(storedPath).size;
  if(storedBytes!==audio.bytes.length||storedBytes<=0){
    fs.unlinkSync(storedPath);
    console.error('Stored voice file failed post-write size validation',{url:`/uploads/${storedFilename}`,expectedBytes:audio.bytes.length,storedBytes});
    return res.status(500).json({error:'The voice recording could not be stored completely. Please try again.'});
  }
  const storedAudioBytes=fs.readFileSync(storedPath);
  const uploadedHash=createHash('sha256').update(audio.bytes).digest('hex');
  const storedHash=createHash('sha256').update(storedAudioBytes).digest('hex');
  if(uploadedHash!==storedHash){
    fs.unlinkSync(storedPath);
    console.error('Stored voice file checksum did not match uploaded content',{url:`/uploads/${storedFilename}`,bytes:storedBytes});
    return res.status(500).json({error:'The voice recording changed while being stored. Please try again.'});
  }
  const message={id:crypto.randomUUID(),fromUserId:req.user.id,toUserId:req.params.userId,body:'',imageUrl:'',voiceUrl:`/uploads/${storedFilename}`,voiceMimeType:audio.mimeType,durationSeconds,createdAt:new Date().toISOString(),sentAt:new Date().toISOString(),deliveredAt:null,readAt:null,...(idempotency.key?{clientRequestId:idempotency.key}:{})};
  db.privateChatMedia||=[];
  db.privateChatMedia.push(storedFilename);
  db.messages.push(message);
  try{
    await save(db);
  }catch(error){
    fs.unlinkSync(storedPath);
    throw error;
  }
  console.info('Voice message stored',{messageId:message.id,fromUserId:message.fromUserId,toUserId:message.toUserId,url:message.voiceUrl,mimeType:message.voiceMimeType,bytes:storedBytes,sha256:storedHash});
  io.to(req.params.userId).emit('message:new',message);
  const senderName=db.users.find(item=>item.id===req.user.id)?.name||'A ZERA HUB member';
  await notifyUser(req.params.userId,'message',`New message from ${senderName}`,'Sent you a voice message.',{url:`/messages?user=${encodeURIComponent(req.user.id)}&message=${encodeURIComponent(message.id)}`,fromUserId:req.user.id,messageId:message.id});
  res.status(201).json({...message,voiceSizeBytes:storedBytes,voiceSha256:storedHash});
}));
app.use('/api/community',createCommunityRouter({auth,load,save,publicUser,upload:communityUpload,riskText}));
app.post('/api/admin/login',adminLoginLimiter,asyncRoute(async(req,res)=>{const {email,password}=req.body||{};const attemptedEmail=String(email||'').slice(0,254);const adminEmail=attemptedEmail.toLowerCase();if(!process.env.ADMIN_EMAIL||!process.env.ADMIN_PASSWORD)return res.status(503).json({error:'Admin credentials are not configured on the server'});const db=load();db.adminLoginActivity||=[];const expectedPassword=Buffer.from(process.env.ADMIN_PASSWORD);const providedPassword=Buffer.from(typeof password==='string'?password:'');const passwordMatches=providedPassword.length===expectedPassword.length&&timingSafeEqual(providedPassword,expectedPassword);if(adminEmail!==process.env.ADMIN_EMAIL.toLowerCase()||!passwordMatches){db.adminLoginActivity.push({id:crypto.randomUUID(),attemptedEmail,success:false,createdAt:new Date().toISOString()});if(db.adminLoginActivity.length>200)db.adminLoginActivity.shift();await save(db);return res.status(401).json({error:'Invalid admin credentials'});}db.adminLoginActivity.push({id:crypto.randomUUID(),adminEmail:process.env.ADMIN_EMAIL,success:true,createdAt:new Date().toISOString()});if(db.adminLoginActivity.length>200)db.adminLoginActivity.shift();await save(db);const user={id:'admin',role:'admin',email:process.env.ADMIN_EMAIL,sessionVersion:Number(db.adminSessionVersion||0)};res.json({token:tokenFor(user),user:{id:'admin',email:process.env.ADMIN_EMAIL,role:'admin'}});}));
app.get('/api/admin/overview',admin,(req,res)=>res.json(adminOverview(load())));
app.get('/api/admin/security',admin,(req,res)=>{const db=load();res.json({loginActivity:(db.adminLoginActivity||[]).slice().reverse(),auditLogs:(db.adminAuditLogs||[]).slice().reverse()});});
app.patch('/api/admin/users/:id',admin,asyncRoute(async(req,res)=>{const db=load();const u=db.users.find(x=>x.id===req.params.id);if(!u)return res.status(404).json({error:'User not found'});const allowed=['active','warning','review_required','restricted','suspended','disabled','blocked','banned'];if(!allowed.includes(req.body.status))return res.status(400).json({error:`Status must be one of: ${allowed.join(', ')}`});if(typeof req.body.reason!=='string'||!req.body.reason.trim())return res.status(400).json({error:'A reason is required for account moderation'});const configuredEmail=String(process.env.ADMIN_EMAIL||'').trim().toLowerCase();if(u.id===req.user.id||u.role==='admin'||String(u.email||'').trim().toLowerCase()===configuredEmail)return res.status(403).json({error:'Essential administrator access cannot be moderated through user controls'});const previousStatus=u.status;const previousModerationState=u.moderationState||'';if(['warning','review_required'].includes(req.body.status)){u.status='active';u.moderationState=req.body.status;u.restrictedUntil=null;}else{u.status=req.body.status;u.moderationState='';u.restrictedUntil=req.body.status==='restricted'?new Date(Date.now()+24*60*60*1000).toISOString():null;}u.moderationReason=req.body.reason.trim().slice(0,500);u.moderatedAt=new Date().toISOString();if(previousStatus!==u.status||previousModerationState!==u.moderationState){db.moderationActions||=[];db.moderationActions.push({id:crypto.randomUUID(),type:`user_${req.body.status}`,userId:u.id,reason:u.moderationReason,adminEmail:req.user.email,createdAt:u.moderatedAt});recordAdminEvent(db,req,'user_moderation_changed',`${u.id}: ${previousStatus}/${previousModerationState||'none'} to ${u.status}/${u.moderationState||'none'}; ${u.moderationReason}`);}await save(db);const accountNotice=['warning','review_required'].includes(req.body.status)?`Your account remains active, but its moderation status is ${req.body.status.replace(/_/g,' ')}. Reason: ${u.moderationReason}`:u.status==='active'?'Your account access has been restored.':`${accountStatusMessage(u.status)} Reason: ${u.moderationReason}`;await notifyUser(u.id,'account_update',u.status==='active'?'Account access updated':'Account status updated',accountNotice,{url:'/app'});res.json({...publicUser(u),moderationState:u.moderationState,restrictedUntil:u.restrictedUntil});}));
app.patch('/api/admin/verification-requests/:id',admin,asyncRoute(async(req,res)=>{if(!['approved','rejected'].includes(req.body?.status))return res.status(400).json({error:'Status must be approved or rejected'});const db=load();const user=db.users.find(item=>item.id===req.params.id&&item.verificationRequestAt);if(!user)return res.status(404).json({error:'Verification request not found'});user.verified=req.body.status==='approved';user.verificationRequestAt=null;user.verificationReviewedAt=new Date().toISOString();user.verificationReviewedBy=req.user.email;recordAdminEvent(db,req,'verification_request_reviewed',`${user.id}: ${req.body.status}`);await save(db);await notifyUser(user.id,'account_update',user.verified?'Profile verified':'Verification request reviewed',user.verified?'Your profile has been verified.':'Your verification request was not approved. You may update your profile and request another review.',{url:'/profile'});res.json(publicUser(user));}));
app.patch('/api/admin/site-config',admin,asyncRoute(async(req,res)=>{const db=load();const allowed=['brandName','tagline','logoUrl','contactEmail'];for(const k of allowed)if(req.body[k]!==undefined){if(typeof req.body[k]!=='string'||req.body[k].length>1000)return res.status(400).json({error:`${k} must be text no longer than 1,000 characters`});db.siteConfig[k]=req.body[k];}if(req.body.socials){if(typeof req.body.socials!=='object'||Array.isArray(req.body.socials))return res.status(400).json({error:'socials must be a map of text URLs'});for(const [key,value] of Object.entries(req.body.socials))if(typeof value!=='string'||value.length>1000)return res.status(400).json({error:'Social links must be text URLs no longer than 1,000 characters'});db.siteConfig.socials={...db.siteConfig.socials,...req.body.socials};}if(req.body.announcement!==undefined){const announcement=req.body.announcement;if(!announcement||typeof announcement!=='object'||Array.isArray(announcement)||typeof announcement.enabled!=='boolean'||typeof announcement.text!=='string'||announcement.text.length>500)return res.status(400).json({error:'Announcement requires an enabled flag and text no longer than 500 characters'});db.siteConfig.announcement={enabled:announcement.enabled,text:announcement.text.trim()};}recordAdminEvent(db,req,'website_settings_updated','Updated public website configuration');await save(db);res.json(db.siteConfig);}));
app.post('/api/admin/logo',admin,upload.single('logo'),asyncRoute(async(req,res)=>{if(!req.file)return res.status(400).json({error:'Logo file required'});const db=load();db.siteConfig.logoUrl=`/uploads/${req.file.filename}`;await save(db);res.json(db.siteConfig);}));
app.patch('/api/admin/reports/:id',admin,asyncRoute(async(req,res)=>{const db=load();const r=db.reports.find(x=>x.id===req.params.id);if(!r)return res.status(404).json({error:'Report not found'});if(!['open','reviewed','resolved'].includes(req.body.status))return res.status(400).json({error:'Report status must be open, reviewed, or resolved'});if(typeof req.body.reason!=='string'||!req.body.reason.trim())return res.status(400).json({error:'A reason is required to update a report'});const previousStatus=r.status;r.status=req.body.status;r.reviewedBy=req.user.email;r.reviewedAt=new Date().toISOString();r.reviewReason=req.body.reason.trim().slice(0,500);if(previousStatus!==r.status)recordAdminEvent(db,req,'report_status_changed',`${r.id}: ${previousStatus} to ${r.status}; ${r.reviewReason}`);await save(db);res.json(r);}));
app.patch('/api/admin/records/:type/:id',admin,asyncRoute(async(req,res)=>{const db=load();const {type,id}=req.params;const {status,reason}=req.body||{};if(typeof reason!=='string'||!reason.trim())return res.status(400).json({error:'A reason is required for every moderation action'});let record;if(type==='job'){record=(db.jobs||[]).find(item=>item.id===id);if(!record)return res.status(404).json({error:'Job not found'});if(!['open','closed','removed'].includes(status))return res.status(400).json({error:'Job status must be open, closed, or removed'});record.status=status;}else if(type==='post'){record=(db.posts||[]).find(item=>item.id===id);if(!record)return res.status(404).json({error:'Post not found'});if(!['visible','review_required','hidden'].includes(status))return res.status(400).json({error:'Post status must be visible, review_required, or hidden'});record.moderationStatus=status;}else if(type==='comment'){let parent;for(const post of db.posts||[]){parent=(post.comments||[]).find(item=>item.id===id||(item.replies||[]).some(reply=>reply.id===id));if(parent){record=parent.id===id?parent:parent.replies.find(reply=>reply.id===id);break;}}if(!record)return res.status(404).json({error:'Comment not found'});if(!['visible','review_required','hidden'].includes(status))return res.status(400).json({error:'Comment status must be visible, review_required, or hidden'});record.moderationStatus=status;}else if(type==='application'){record=(db.applications||[]).find(item=>item.id===id);if(!record)return res.status(404).json({error:'Application not found'});if(!['Applied','Reviewing','Shortlisted','Interview','Accepted','Rejected'].includes(status))return res.status(400).json({error:'Unsupported application status'});record.status=status;record.updatedAt=new Date().toISOString();}else return res.status(400).json({error:'Unsupported moderation record type'});record.updatedAt=new Date().toISOString();db.moderationActions||=[];db.moderationActions.push({id:crypto.randomUUID(),type:`${type}_${status}`,targetId:id,reason:reason.trim().slice(0,500),adminEmail:req.user.email,createdAt:record.updatedAt});recordAdminEvent(db,req,`${type}_moderated`,`${id}: ${status}; ${reason.trim().slice(0,500)}`);await save(db);res.json({id,status,reason:reason.trim()});}));
io.on('connection',(socket)=>{
  const clearStatus=()=>{
    if(socket.data.statusTimer)clearTimeout(socket.data.statusTimer);
    if(socket.data.statusPeer&&socket.data.statusType){
      io.to(socket.data.statusPeer).emit('chat:status',{fromUserId:socket.data.userId,status:null});
    }
    socket.data.statusPeer=null;
    socket.data.statusType=null;
    socket.data.statusTimer=null;
  };
  socket.join(socket.data.userId);
  socket.on('chat:status',(payload)=>{
    const peerId=typeof payload?.toUserId==='string'?payload.toUserId:'';
    const status=payload?.status;
    if(status===null){
      if(!peerId||peerId===socket.data.statusPeer)clearStatus();
      return;
    }
    if(!peerId||!['typing','recording'].includes(status)||!areConnected(socket.data.userId,peerId))return;
    if(socket.data.statusPeer&&socket.data.statusPeer!==peerId)clearStatus();
    if(socket.data.statusType!==status||socket.data.statusPeer!==peerId){
      socket.data.statusPeer=peerId;
      socket.data.statusType=status;
      io.to(peerId).emit('chat:status',{fromUserId:socket.data.userId,status});
    }
    if(socket.data.statusTimer)clearTimeout(socket.data.statusTimer);
    socket.data.statusTimer=setTimeout(clearStatus,5000);
  });
  socket.on('disconnect',clearStatus);
});
app.use((error,req,res,next)=>{console.error('Request failed:',error.message);if(res.headersSent)return next(error);res.status(500).json({error:'The request could not be completed.'});});
app.use(express.static(distDir));
app.get('*',(req,res,next)=>{if(req.path.startsWith('/api/')||req.path.startsWith('/uploads/')||path.extname(req.path))return next();res.sendFile(frontendIndex,(error)=>{if(error)next(error);});});

async function startServer(){
  try{
    const connection=await connectDatabase();
    if(connection){
      mongoStateCollection=connection.db.collection('zera_hub_state');
      const storedState=await mongoStateCollection.findOne({_id:'primary'});
      if(storedState){
        const {_id,_localMirrorMigrationComplete,...state}=storedState;
        const local=readLocalData();
        if(_localMirrorMigrationComplete===true){
          memoryState={
            ...initialData,
            ...state,
            siteConfig:{...initialData.siteConfig,...(state.siteConfig||{})},
          };
        }else{
          memoryState={
            ...initialData,
            ...local,
            ...state,
            siteConfig:{...initialData.siteConfig,...(local.siteConfig||{}),...(state.siteConfig||{})},
          };
          for(const field of ['users','messages','posts','reports','moderationActions','notifications','pushSubscriptions','connections','jobs','applications','aiConversations','adminLoginActivity','adminAuditLogs']){
            memoryState[field]=mergeRecords(local[field],state[field]);
          }
          durableState=JSON.parse(JSON.stringify(memoryState));
          await save(memoryState);
        }
        durableState=JSON.parse(JSON.stringify(memoryState));
      }else{
        await mongoStateCollection.insertOne({...memoryState,_id:'primary',_localMirrorMigrationComplete:true});
        durableState=JSON.parse(JSON.stringify(memoryState));
      }
    }
    let migratedAccountTypes=false;
    for(const user of load().users){
      if(user.accountType!=='developer'&&user.accountType!=='hire'){
        user.accountType='developer';
        migratedAccountTypes=true;
      }
    }
    if(migratedAccountTypes)await save(load());
    httpServer.listen(PORT,()=>console.log(`ZERA HUB API running on http://localhost:${PORT}`));
  }catch(error){
    console.error('Backend startup error:',error.message);
    httpServer.listen(PORT,()=>console.log(`ZERA HUB API running on fallback on http://localhost:${PORT}`));
  }
}
startServer();
