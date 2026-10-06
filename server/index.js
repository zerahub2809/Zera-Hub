import express from 'express';
import dns from 'node:dns';
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
const initialData={users:[],messages:[],posts:[],reports:[],moderationActions:[],notifications:[],pushSubscriptions:[],connections:[],jobs:[],applications:[],aiConversations:[],adminLoginActivity:[],adminAuditLogs:[],siteConfig:{brandName:'ZERA HUB',tagline:'Grow Ideas. Build Tomorrow.',logoUrl:'/assets/WhatsApp%20Image%202026-09-21%20at%2010.07.22%20AM.jpeg',contactEmail:'zerahub@outlook.com',socials:{facebook:'https://www.facebook.com/share/1BDT7JfvXm/',instagram:'https://www.instagram.com/zerahub2026/',x:'https://x.com/zerahub2809'}}};
let memoryState=null;
let mongoStateCollection=null;
let durableState=null;
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

const save=async(db)=>{
  const next=JSON.parse(JSON.stringify(db));
  try{
    if(mongoStateCollection){
      await mongoStateCollection.replaceOne({_id:'primary'},{...next,_id:'primary'},{upsert:true});
      durableState=next;
      memoryState=next;
      try{
        fs.writeFileSync(dataFile,JSON.stringify(next,null,2));
      }catch(err){
        console.error('Local database mirror save error:',err.message);
      }
      return;
    }
    fs.writeFileSync(dataFile,JSON.stringify(next,null,2));
    durableState=next;
    memoryState=next;
  }catch(err){
    memoryState=durableState?JSON.parse(JSON.stringify(durableState)):readLocalData();
    console.error('Durable database save failed:',err.message);
    throw err;
  }
};

const app=express();
const httpServer=createServer(app);

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
const JWT_SECRET=process.env.JWT_SECRET||'ZERA_HUB_9vK7xQ2mL8pR4tY6wN3cF8sJ1dG5hB0zA7uE2kP9xV6mT4qW8rC3yL5nS0fH7';
const vapidPublicKey=process.env.VAPID_PUBLIC_KEY||'';
const vapidPrivateKey=process.env.VAPID_PRIVATE_KEY||'';
let webPush=null;
try{webPush=(await import('web-push')).default;}catch(error){/* optional */}
if(vapidPublicKey&&vapidPrivateKey&&webPush)webPush.setVapidDetails(process.env.VAPID_SUBJECT||'mailto:zerahub@outlook.com',vapidPublicKey,vapidPrivateKey);
const asyncRoute=handler=>(req,res,next)=>Promise.resolve(handler(req,res,next)).catch(next);
app.use(helmet({crossOriginResourcePolicy:{policy:'cross-origin'},crossOriginOpenerPolicy:false}));
app.use(cors({origin:allowClientOrigin,credentials:true,methods:['GET','POST','PUT','PATCH','DELETE','OPTIONS'],allowedHeaders:['Content-Type','Authorization','Accept','X-Requested-With']}));
app.options('*',cors({origin:allowClientOrigin,credentials:true}));
app.use(express.json({limit:'2mb'}));
app.use('/uploads',express.static(uploadDir));
app.use('/assets',express.static(root));
const authLimiter=rateLimit({windowMs:15*60*1000,max:200,standardHeaders:true,legacyHeaders:false});
const aiLimiter=rateLimit({windowMs:15*60*1000,max:100,standardHeaders:true,legacyHeaders:false});
const reportLimiter=rateLimit({windowMs:15*60*1000,max:30,standardHeaders:true,legacyHeaders:false});
app.use('/api/auth',authLimiter);
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

function tokenFor(user){return jwt.sign({id:user.id,role:user.role||'user',email:user.role==='admin'?user.email:undefined},JWT_SECRET,{expiresIn:'7d'});}
function auth(req,res,next){const raw=req.headers.authorization||'';const token=raw.startsWith('Bearer ')?raw.slice(7):null;if(!token)return res.status(401).json({error:'Authentication required'});try{req.user=jwt.verify(token,JWT_SECRET);if(req.user.role!=='admin'){const db=load();const account=db.users.find(user=>user.id===req.user.id);if(!account)return res.status(401).json({error:'Account session is no longer valid'});if(account.status==='restricted'&&account.restrictedUntil&&Date.parse(account.restrictedUntil)<=Date.now()){account.status='active';account.restrictedUntil=null;save(db).then(()=>next(),next);return;}if(account.status!=='active')return res.status(403).json({error:account.status==='restricted'?'Account temporarily restricted':'Account suspended'});}next();}catch(error){if(error?.name==='JsonWebTokenError'||error?.name==='TokenExpiredError')return res.status(401).json({error:'Invalid or expired session'});next(error);}}
function areConnected(firstId,secondId){return (load().connections||[]).some(connection=>connection.status==='accepted'&&((connection.requesterId===firstId&&connection.recipientId===secondId)||(connection.requesterId===secondId&&connection.recipientId===firstId)));}
io.use((socket,next)=>{
  try{
    const claims=jwt.verify(socket.handshake.auth?.token,JWT_SECRET);
    if(typeof claims.id!=='string'||claims.role==='admin')return next(new Error('Authentication required'));
    const account=load().users.find(user=>user.id===claims.id&&user.status==='active');
    if(!account)return next(new Error('Account session is no longer valid'));
    socket.data.userId=account.id;
    next();
  }catch{
    next(new Error('Authentication required'));
  }
});
function admin(req,res,next){auth(req,res,()=>{const configuredEmail=String(process.env.ADMIN_EMAIL||'').trim().toLowerCase();const tokenEmail=String(req.user.email||'').trim().toLowerCase();if(req.user.role!=='admin'||!configuredEmail||tokenEmail!==configuredEmail)return res.status(403).json({error:'Admin access required'});next();});}
function recordAdminEvent(db,req,action,details){db.adminAuditLogs||=[];db.adminAuditLogs.push({id:crypto.randomUUID(),action,adminEmail:req.user.email||'Administrator',details,createdAt:new Date().toISOString()});if(db.adminAuditLogs.length>500)db.adminAuditLogs.shift();}
function riskText(text=''){const t=text.toLowerCase();let score=0;const flags=[];const rules=[[/\b(send|pay)\s+(me|us)\s+(crypto|usdt|bitcoin)\b/g,30,'crypto payment request'],[/\b(password|otp|verification code)\b/g,25,'credential request'],[/\b(guaranteed|double your money|100% profit)\b/g,30,'unrealistic financial claim'],[/\bfree money|cash giveaway|investment opportunity\b/g,15,'promotional risk'],[/https?:\/\/[^\s]+/g,5,'external link'],[/\b(bit\.ly|tinyurl\.com|t\.co|is\.gd|cutt\.ly)\b/g,20,'shortened external link']];for(const [re,pts,label] of rules){re.lastIndex=0;if(re.test(t)){score+=pts;flags.push(label);}re.lastIndex=0;}if((t.match(/https?:\/\//g)||[]).length>3){score+=20;flags.push('link burst');}if(/(.)\1{8,}/.test(t)){score+=10;flags.push('repetitive character pattern');}const letters=text.match(/[A-Za-z]/g)||[];const capitals=letters.filter(character=>character===character.toUpperCase()).length;if(letters.length>=30&&capitals/letters.length>0.8){score+=10;flags.push('excessive capitalization');}return {score,flags,level:score>=60?'critical':score>=35?'high':score>=20?'medium':'low'};}
function publicUser(u){const lastSeenAt=u.lastSeenAt||null;return {id:u.id,name:u.name,username:u.username,role:u.role,accountType:u.accountType,bio:u.bio||'',skills:u.skills||[],avatar:u.avatar||'',status:u.status,verified:!!u.verified,lastSeenAt,online:!!lastSeenAt&&Date.now()-Date.parse(lastSeenAt)<90000,createdAt:u.createdAt};}
async function notifyUser(userId,type,title,body,data={}){
  const db=load();
  db.notifications||=[];
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
      suspendedUsers:users.filter(user=>['suspended','restricted','disabled'].includes(user.status)).length,
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
app.patch('/api/notifications/read',auth,asyncRoute(async(req,res)=>{const fromUserId=req.body?.fromUserId;if(fromUserId!==undefined&&typeof fromUserId!=='string')return res.status(400).json({error:'fromUserId must be text'});const db=load();const now=new Date().toISOString();for(const item of db.notifications||[])if(item.userId===req.user.id&&!item.readAt&&(!fromUserId||(item.type==='message'&&item.data?.fromUserId===fromUserId)))item.readAt=now;await save(db);res.json({ok:true});}));
app.get('/api/push/public-key',(req,res)=>res.json({publicKey:vapidPublicKey&&webPush?vapidPublicKey:null}));
app.post('/api/push/subscribe',auth,asyncRoute(async(req,res)=>{if(!vapidPublicKey||!vapidPrivateKey||!webPush)return res.status(503).json({error:'Browser push is not configured on this server'});const subscription=req.body?.subscription;if(!subscription||typeof subscription.endpoint!=='string'||typeof subscription.keys?.p256dh!=='string'||typeof subscription.keys?.auth!=='string')return res.status(400).json({error:'A valid push subscription is required'});const db=load();db.pushSubscriptions||=[];const current=db.pushSubscriptions.find(item=>item.userId===req.user.id&&item.subscription.endpoint===subscription.endpoint);if(current)current.subscription=subscription;else db.pushSubscriptions.push({id:crypto.randomUUID(),userId:req.user.id,subscription,createdAt:new Date().toISOString()});await save(db);res.status(201).json({ok:true});}));
app.delete('/api/push/subscribe',auth,asyncRoute(async(req,res)=>{const endpoint=req.body?.endpoint;if(typeof endpoint!=='string')return res.status(400).json({error:'Subscription endpoint is required'});const db=load();db.pushSubscriptions=(db.pushSubscriptions||[]).filter(item=>item.userId!==req.user.id||item.subscription.endpoint!==endpoint);await save(db);res.json({ok:true});}));
app.post('/api/auth/signup',asyncRoute(async(req,res)=>{const {name,username,email,password,accountType='developer'}=req.body||{};if(!name||!username||!email||!password)return res.status(400).json({error:'Name, username, email and password are required'});if(password.length<8)return res.status(400).json({error:'Password must be at least 8 characters'});const db=load();if(db.users.some(u=>u.email.toLowerCase()===email.toLowerCase()||u.username.toLowerCase()===username.toLowerCase()))return res.status(409).json({error:'An account with those details already exists'});const user={id:crypto.randomUUID(),name:name.trim(),username:username.trim().replace(/^@/,''),email:email.trim().toLowerCase(),passwordHash:await bcrypt.hash(password,12),accountType:accountType==='hire'?'hire':'developer',role:'user',status:'active',verified:false,bio:'',skills:[],createdAt:new Date().toISOString()};db.users.push(user);await save(db);res.status(201).json({token:tokenFor(user),user:publicUser(user)});}));
app.post('/api/auth/login',asyncRoute(async(req,res)=>{const {email,password}=req.body||{};const db=load();const user=db.users.find(u=>u.email===String(email||'').trim().toLowerCase()||u.username.toLowerCase()===String(email||'').trim().toLowerCase());if(user?.status==='restricted'&&user.restrictedUntil&&Date.parse(user.restrictedUntil)<=Date.now()){user.status='active';user.restrictedUntil=null;await save(db);}if(!user||!(await bcrypt.compare(password||'',user.passwordHash))||user.status!=='active')return res.status(401).json({error:'Invalid email or password'});res.json({token:tokenFor(user),user:publicUser(user)});}));
app.get('/api/users',auth,(req,res)=>{const db=load();res.json(db.users.filter(u=>u.status==='active').map(publicUser));});
app.get('/api/users/:id',auth,(req,res)=>{const u=load().users.find(x=>x.id===req.params.id);if(!u)return res.status(404).json({error:'User not found'});res.json(publicUser(u));});
app.patch('/api/profile',auth,asyncRoute(async(req,res)=>{const db=load();const u=db.users.find(x=>x.id===req.user.id);if(!u)return res.status(404).json({error:'User not found'});for(const k of ['name','bio','skills','avatar'])if(req.body[k]!==undefined)u[k]=req.body[k];await save(db);res.json(publicUser(u));}));
app.post('/api/messages',auth,asyncRoute(async(req,res)=>{const {toUserId,body}=req.body||{};if(!toUserId||typeof body!=='string'||!body.trim())return res.status(400).json({error:'Recipient and message are required'});const risk=riskText(body);const db=load();const message={id:crypto.randomUUID(),fromUserId:req.user.id,toUserId,body:body.trim(),imageUrl:'',createdAt:new Date().toISOString(),sentAt:new Date().toISOString(),deliveredAt:null,readAt:null,risk};if(risk.level==='critical'||risk.level==='high'){db.moderationActions.push({id:crypto.randomUUID(),type:'message_blocked',userId:req.user.id,reason:risk.flags,createdAt:new Date().toISOString()});await save(db);return res.status(422).json({error:'Message blocked by ZERA Trust & Safety',risk});}db.messages.push(message);await save(db);io.to(toUserId).emit('message:new',message);await notifyUser(toUserId,'message','New message',`${publicUser(db.users.find(item=>item.id===req.user.id)||{id:req.user.id,name:'Developer',username:'developer',createdAt:message.createdAt}).name} sent you a message.`,{url:`/messages?user=${encodeURIComponent(req.user.id)}`,fromUserId:req.user.id});res.status(201).json(message);}));
app.get('/api/messages/:userId',auth,asyncRoute(async(req,res)=>{const db=load();const now=new Date().toISOString();const messages=db.messages.filter(message=>(message.fromUserId===req.user.id&&message.toUserId===req.params.userId)||(message.toUserId===req.user.id&&message.fromUserId===req.params.userId));const delivered=messages.filter(message=>message.toUserId===req.user.id&&!message.deliveredAt);for(const message of delivered)message.deliveredAt=now;if(delivered.length)await save(db);res.json(messages);}));
app.patch('/api/messages/:userId/read',auth,asyncRoute(async(req,res)=>{const db=load();const readAt=new Date().toISOString();const messages=db.messages.filter(message=>message.fromUserId===req.params.userId&&message.toUserId===req.user.id&&!message.readAt);const messageIds=messages.map(message=>message.id);if(messageIds.length){messages.forEach(message=>{message.readAt=readAt});await save(db);io.to(req.params.userId).emit('message:read',{readerId:req.user.id,messageIds,readAt});}res.json({messageIds,readAt});}));
app.post('/api/posts',auth,asyncRoute(async(req,res)=>{const {content}=req.body||{};if(!content?.trim())return res.status(400).json({error:'Post content is required'});const risk=riskText(content);const db=load();if(risk.level==='critical'||risk.level==='high'){db.moderationActions.push({id:crypto.randomUUID(),type:'post_blocked',userId:req.user.id,reason:risk.flags,createdAt:new Date().toISOString()});await save(db);return res.status(422).json({error:'Post blocked by ZERA Trust & Safety',risk});}const post={id:crypto.randomUUID(),userId:req.user.id,content:content.trim(),createdAt:new Date().toISOString()};db.posts.unshift(post);await save(db);res.status(201).json(post);}));
app.get('/api/posts',(req,res)=>{const db=load();res.json(db.posts.slice(0,50).map(p=>({...p,user:publicUser(db.users.find(u=>u.id===p.userId)||{id:p.userId,name:'ZERA member',username:'member',role:'user',status:'active',createdAt:p.createdAt})})));});
app.post('/api/reports',auth,asyncRoute(async(req,res)=>{const {targetType,targetId,targetUserId,reason,details=''}=req.body||{};const type=targetType||'user';const id=targetId||targetUserId;if(!['user','profile','post','comment','job'].includes(type)||typeof id!=='string'||!id.trim()||typeof reason!=='string'||!reason.trim())return res.status(400).json({error:'A valid target, target type and reason are required'});if((type==='user'||type==='profile')&&id===req.user.id)return res.status(400).json({error:'You cannot report your own account'});if(typeof details!=='string'||details.length>2000)return res.status(400).json({error:'Report details must be under 2,000 characters'});const db=load();const comments=(db.posts||[]).flatMap(post=>(post.comments||[]).flatMap(comment=>[comment,...(comment.replies||[])]));const exists=(type==='user'||type==='profile')?db.users.some(user=>user.id===id):type==='post'?(db.posts||[]).some(post=>post.id===id):type==='comment'?comments.some(comment=>comment.id===id):(db.jobs||[]).some(job=>job.id===id);if(!exists)return res.status(404).json({error:'Reported content was not found'});db.reports||=[];if(db.reports.some(report=>report.reporterId===req.user.id&&(report.targetType||'user')===type&&(report.targetId||report.targetUserId)===id&&report.status==='open'))return res.status(409).json({error:'You already have an open report for this item'});const report={id:crypto.randomUUID(),reporterId:req.user.id,targetType:type,targetId:id,targetUserId:type==='user'||type==='profile'?id:undefined,reason:reason.trim().slice(0,120),details:details.trim(),status:'open',createdAt:new Date().toISOString()};db.reports.push(report);await save(db);res.status(201).json({ok:true,id:report.id});}));
const upload=multer({storage:multer.diskStorage({destination:uploadDir,filename:(req,file,cb)=>cb(null,`${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g,'_')}`)}),limits:{fileSize:2*1024*1024},fileFilter:(req,file,cb)=>cb(null,['image/jpeg','image/png','image/gif','image/webp','image/avif'].includes(file.mimetype))});
const imageExtensions={'image/jpeg':'.jpg','image/png':'.png','image/gif':'.gif','image/webp':'.webp','image/avif':'.avif'};
const communityUpload=multer({storage:multer.diskStorage({destination:uploadDir,filename:(req,file,cb)=>cb(null,`${Date.now()}-${crypto.randomUUID()}${imageExtensions[file.mimetype]||'.img'}`)}),limits:{fileSize:2*1024*1024},fileFilter:(req,file,cb)=>cb(null,Boolean(imageExtensions[file.mimetype]))});
const audioExtensions={'audio/webm':'.webm','audio/ogg':'.ogg','audio/mp4':'.m4a','audio/mpeg':'.mp3','audio/wav':'.wav','audio/x-wav':'.wav','audio/aac':'.aac','audio/3gpp':'.3gp'};
const voiceUpload=multer({storage:multer.diskStorage({destination:uploadDir,filename:(req,file,cb)=>cb(null,`${Date.now()}-${crypto.randomUUID()}${audioExtensions[file.mimetype.split(';')[0]]||'.audio'}`)}),limits:{fileSize:12*1024*1024},fileFilter:(req,file,cb)=>cb(null,Boolean(audioExtensions[file.mimetype.split(';')[0]]))});
function validImageSignature(file){const bytes=fs.readFileSync(file.path);if(file.mimetype==='image/jpeg')return bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;if(file.mimetype==='image/png')return bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));if(file.mimetype==='image/gif')return bytes.subarray(0,6).toString('ascii').startsWith('GIF8');if(file.mimetype==='image/webp')return bytes.subarray(0,4).toString('ascii')==='RIFF'&&bytes.subarray(8,12).toString('ascii')==='WEBP';if(file.mimetype==='image/avif')return bytes.subarray(4,12).toString('ascii').includes('ftyp')&&/avif|avis|mif1/.test(bytes.subarray(8,16).toString('ascii'));return false;}
app.post('/api/profile/avatar',auth,communityUpload.single('avatar'),asyncRoute(async(req,res)=>{if(!req.file)return res.status(400).json({error:'A valid image file is required'});if(!validImageSignature(req.file)){fs.unlinkSync(req.file.path);return res.status(415).json({error:'The uploaded file is not a supported image'});}const db=load();const user=db.users.find(item=>item.id===req.user.id);if(!user){fs.unlinkSync(req.file.path);return res.status(404).json({error:'User not found'});}user.avatar=`/uploads/${req.file.filename}`;await save(db);res.json(publicUser(user));}));
app.post('/api/profile/chat-wallpaper',auth,communityUpload.single('image'),asyncRoute(async(req,res)=>{if(!req.file)return res.status(400).json({error:'A valid image file is required'});if(!validImageSignature(req.file)){fs.unlinkSync(req.file.path);return res.status(415).json({error:'The uploaded file is not a supported image'});}const db=load();const user=db.users.find(item=>item.id===req.user.id);if(!user){fs.unlinkSync(req.file.path);return res.status(404).json({error:'User not found'});}user.preferences||={};user.preferences.chatWallpaper='custom';user.preferences.chatWallpaperImage=`/uploads/${req.file.filename}`;await save(db);res.status(201).json({chatWallpaper:'custom',chatWallpaperImage:user.preferences.chatWallpaperImage});}));
app.post('/api/messages/:userId/image',auth,communityUpload.single('image'),asyncRoute(async(req,res)=>{if(!req.file)return res.status(400).json({error:'A valid image file is required'});if(!validImageSignature(req.file)){fs.unlinkSync(req.file.path);return res.status(415).json({error:'The uploaded file is not a supported image'});}const db=load();const recipient=db.users.find(item=>item.id===req.params.userId&&item.status==='active');if(!recipient){fs.unlinkSync(req.file.path);return res.status(404).json({error:'Recipient not found'});}const message={id:crypto.randomUUID(),fromUserId:req.user.id,toUserId:req.params.userId,body:'',imageUrl:`/uploads/${req.file.filename}`,createdAt:new Date().toISOString(),sentAt:new Date().toISOString(),deliveredAt:null,readAt:null};db.messages.push(message);await save(db);io.to(req.params.userId).emit('message:new',message);await notifyUser(req.params.userId,'message','New image message','You received an image message.',{url:`/messages?user=${encodeURIComponent(req.user.id)}`,fromUserId:req.user.id});res.status(201).json(message);}));
app.post('/api/messages/:userId/voice',auth,voiceUpload.single('voice'),asyncRoute(async(req,res)=>{if(!req.file)return res.status(400).json({error:'A supported voice recording is required'});const durationSeconds=Number(req.body?.durationSeconds);if(!Number.isFinite(durationSeconds)||durationSeconds<=0||durationSeconds>180){fs.unlinkSync(req.file.path);return res.status(400).json({error:'Voice messages must be between 1 and 180 seconds'});}const db=load();const recipient=db.users.find(item=>item.id===req.params.userId&&item.status==='active');if(!recipient){fs.unlinkSync(req.file.path);return res.status(404).json({error:'Recipient not found'});}const message={id:crypto.randomUUID(),fromUserId:req.user.id,toUserId:req.params.userId,body:'',imageUrl:'',voiceUrl:`/uploads/${req.file.filename}`,durationSeconds,createdAt:new Date().toISOString(),sentAt:new Date().toISOString(),deliveredAt:null,readAt:null};db.messages.push(message);await save(db);io.to(req.params.userId).emit('message:new',message);await notifyUser(req.params.userId,'message','New voice message','You received a voice message.',{url:`/messages?user=${encodeURIComponent(req.user.id)}`,fromUserId:req.user.id});res.status(201).json(message);}));
app.use('/api/community',createCommunityRouter({auth,load,save,publicUser,upload:communityUpload,riskText}));
app.post('/api/admin/login',asyncRoute(async(req,res)=>{const {email,password}=req.body||{};const attemptedEmail=String(email||'').slice(0,254);const adminEmail=attemptedEmail.toLowerCase();if(!process.env.ADMIN_EMAIL||!process.env.ADMIN_PASSWORD)return res.status(503).json({error:'Admin credentials are not configured on the server'});const db=load();db.adminLoginActivity||=[];if(adminEmail!==process.env.ADMIN_EMAIL.toLowerCase()||password!==process.env.ADMIN_PASSWORD){db.adminLoginActivity.push({id:crypto.randomUUID(),attemptedEmail,success:false,createdAt:new Date().toISOString()});if(db.adminLoginActivity.length>200)db.adminLoginActivity.shift();await save(db);return res.status(401).json({error:'Invalid admin credentials'});}db.adminLoginActivity.push({id:crypto.randomUUID(),adminEmail:process.env.ADMIN_EMAIL,success:true,createdAt:new Date().toISOString()});if(db.adminLoginActivity.length>200)db.adminLoginActivity.shift();await save(db);const user={id:'admin',role:'admin',email:process.env.ADMIN_EMAIL};res.json({token:tokenFor(user),user:{id:'admin',email:process.env.ADMIN_EMAIL,role:'admin'}});}));
app.get('/api/admin/overview',admin,(req,res)=>res.json(adminOverview(load())));
app.get('/api/admin/security',admin,(req,res)=>{const db=load();res.json({loginActivity:(db.adminLoginActivity||[]).slice().reverse(),auditLogs:(db.adminAuditLogs||[]).slice().reverse()});});
app.patch('/api/admin/users/:id',admin,asyncRoute(async(req,res)=>{const db=load();const u=db.users.find(x=>x.id===req.params.id);if(!u)return res.status(404).json({error:'User not found'});const allowed=['active','warning','review_required','restricted','suspended','disabled'];if(!allowed.includes(req.body.status))return res.status(400).json({error:`Status must be one of: ${allowed.join(', ')}`});if(typeof req.body.reason!=='string'||!req.body.reason.trim())return res.status(400).json({error:'A reason is required for account moderation'});const previousStatus=u.status;const previousModerationState=u.moderationState||'';if(['warning','review_required'].includes(req.body.status)){u.status='active';u.moderationState=req.body.status;u.restrictedUntil=null;}else{u.status=req.body.status;u.moderationState='';u.restrictedUntil=req.body.status==='restricted'?new Date(Date.now()+24*60*60*1000).toISOString():null;}u.moderationReason=req.body.reason.trim().slice(0,500);u.moderatedAt=new Date().toISOString();if(previousStatus!==u.status||previousModerationState!==u.moderationState){db.moderationActions||=[];db.moderationActions.push({id:crypto.randomUUID(),type:`user_${req.body.status}`,userId:u.id,reason:u.moderationReason,adminEmail:req.user.email,createdAt:u.moderatedAt});recordAdminEvent(db,req,'user_moderation_changed',`${u.id}: ${previousStatus}/${previousModerationState||'none'} to ${u.status}/${u.moderationState||'none'}; ${u.moderationReason}`);}await save(db);res.json({...publicUser(u),moderationState:u.moderationState,restrictedUntil:u.restrictedUntil});}));
app.patch('/api/admin/verification-requests/:id',admin,asyncRoute(async(req,res)=>{if(!['approved','rejected'].includes(req.body?.status))return res.status(400).json({error:'Status must be approved or rejected'});const db=load();const user=db.users.find(item=>item.id===req.params.id&&item.verificationRequestAt);if(!user)return res.status(404).json({error:'Verification request not found'});user.verified=req.body.status==='approved';user.verificationRequestAt=null;user.verificationReviewedAt=new Date().toISOString();user.verificationReviewedBy=req.user.email;recordAdminEvent(db,req,'verification_request_reviewed',`${user.id}: ${req.body.status}`);await save(db);await notifyUser(user.id,'account_update',user.verified?'Profile verified':'Verification request reviewed',user.verified?'Your profile has been verified.':'Your verification request was not approved. You may update your profile and request another review.',{url:'/profile'});res.json(publicUser(user));}));
app.patch('/api/admin/site-config',admin,asyncRoute(async(req,res)=>{const db=load();const allowed=['brandName','tagline','logoUrl','contactEmail'];for(const k of allowed)if(req.body[k]!==undefined)db.siteConfig[k]=req.body[k];if(req.body.socials)db.siteConfig.socials={...db.siteConfig.socials,...req.body.socials};recordAdminEvent(db,req,'website_settings_updated','Updated public website configuration');await save(db);res.json(db.siteConfig);}));
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
        const {_id,...state}=storedState;
        const local=readLocalData();
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
      }else{
        await mongoStateCollection.insertOne({...memoryState,_id:'primary'});
      }
    }
    httpServer.listen(PORT,()=>console.log(`ZERA HUB API running on http://localhost:${PORT}`));
  }catch(error){
    console.error('Backend startup error:',error.message);
    httpServer.listen(PORT,()=>console.log(`ZERA HUB API running on fallback on http://localhost:${PORT}`));
  }
}
startServer();
