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

const __filename=fileURLToPath(import.meta.url);
const __dirname=path.dirname(__filename);
dotenv.config({path:path.resolve(__dirname,'..','.env')});
dns.setServers(['8.8.8.8','1.1.1.1']);
const root=path.resolve(__dirname,'..');
const dataFile=path.join(__dirname,'data','db.json');
const uploadDir=path.join(__dirname,'uploads');
fs.mkdirSync(uploadDir,{recursive:true});
const load=()=>JSON.parse(fs.readFileSync(dataFile,'utf8'));
const save=(db)=>fs.writeFileSync(dataFile,JSON.stringify(db,null,2));
const app=express();
const httpServer=createServer(app);
const io=new Server(httpServer,{cors:{origin:process.env.CLIENT_URL||'http://localhost:5173',methods:['GET','POST']}});
const PORT=Number(process.env.PORT||4000);
const JWT_SECRET=process.env.JWT_SECRET||'development-only-change-me';
app.use(helmet({crossOriginResourcePolicy:{policy:'cross-origin'}}));
app.use(cors({origin:process.env.CLIENT_URL||'http://localhost:5173'}));
app.use(express.json({limit:'1mb'}));
app.use('/uploads',express.static(uploadDir));
const authLimiter=rateLimit({windowMs:15*60*1000,max:100,standardHeaders:true,legacyHeaders:false});
app.use('/api/auth',authLimiter);
app.use('/api/admin/login',authLimiter);

function tokenFor(user){return jwt.sign({id:user.id,role:user.role||'user',email:user.role==='admin'?user.email:undefined},JWT_SECRET,{expiresIn:'7d'});}
function auth(req,res,next){const raw=req.headers.authorization||'';const token=raw.startsWith('Bearer ')?raw.slice(7):null;if(!token)return res.status(401).json({error:'Authentication required'});try{req.user=jwt.verify(token,JWT_SECRET);next();}catch{return res.status(401).json({error:'Invalid or expired session'});}}
function admin(req,res,next){auth(req,res,()=>{if(req.user.role!=='admin')return res.status(403).json({error:'Admin access required'});next();});}
function recordAdminEvent(db,req,action,details){db.adminAuditLogs||=[];db.adminAuditLogs.push({id:crypto.randomUUID(),action,adminEmail:req.user.email||'Administrator',details,createdAt:new Date().toISOString()});if(db.adminAuditLogs.length>500)db.adminAuditLogs.shift();}
function riskText(text=''){const t=text.toLowerCase();let score=0;const flags=[];const rules=[[/\b(send|pay)\s+(me|us)\s+(crypto|usdt|bitcoin)\b/g,30,'crypto payment request'],[/\b(password|otp|verification code)\b/g,25,'credential request'],[/\b(guaranteed|double your money|100% profit)\b/g,30,'unrealistic financial claim'],[/\bfree money|cash giveaway|investment opportunity\b/g,15,'promotional risk'],[/https?:\/\/[^\s]+/g,5,'external link']];for(const [re,pts,label] of rules){if(re.test(t)){score+=pts;flags.push(label);}}if((t.match(/https?:\/\//g)||[]).length>3){score+=20;flags.push('link burst');}return {score,flags,level:score>=60?'critical':score>=35?'high':score>=20?'medium':'low'};}
function publicUser(u){return {id:u.id,name:u.name,username:u.username,role:u.role,accountType:u.accountType,bio:u.bio||'',skills:u.skills||[],avatar:u.avatar||'',status:u.status,verified:!!u.verified,createdAt:u.createdAt};}
app.get('/api/health',(req,res)=>res.json({ok:true,name:'ZERA HUB API'}));
app.get('/api/site-config',(req,res)=>res.json(load().siteConfig));
app.post('/api/auth/signup',async(req,res)=>{const {name,username,email,password,accountType='developer'}=req.body||{};if(!name||!username||!email||!password)return res.status(400).json({error:'Name, username, email and password are required'});if(password.length<8)return res.status(400).json({error:'Password must be at least 8 characters'});const db=load();if(db.users.some(u=>u.email.toLowerCase()===email.toLowerCase()||u.username.toLowerCase()===username.toLowerCase()))return res.status(409).json({error:'An account with those details already exists'});const user={id:crypto.randomUUID(),name,username,email:email.toLowerCase(),passwordHash:await bcrypt.hash(password,12),accountType:accountType==='hire'?'hire':'developer',role:'user',status:'active',verified:false,bio:'',skills:[],createdAt:new Date().toISOString()};db.users.push(user);save(db);res.status(201).json({token:tokenFor(user),user:publicUser(user)});});
app.post('/api/auth/login',async(req,res)=>{const {email,password}=req.body||{};const db=load();const user=db.users.find(u=>u.email===String(email||'').toLowerCase());if(!user||!(await bcrypt.compare(password||'',user.passwordHash))||user.status!=='active')return res.status(401).json({error:'Invalid email or password'});res.json({token:tokenFor(user),user:publicUser(user)});});
app.get('/api/users',auth,(req,res)=>{const db=load();res.json(db.users.filter(u=>u.status==='active').map(publicUser));});
app.get('/api/users/:id',auth,(req,res)=>{const u=load().users.find(x=>x.id===req.params.id);if(!u)return res.status(404).json({error:'User not found'});res.json(publicUser(u));});
app.patch('/api/profile',auth,(req,res)=>{const db=load();const u=db.users.find(x=>x.id===req.user.id);if(!u)return res.status(404).json({error:'User not found'});for(const k of ['name','bio','skills','avatar'])if(req.body[k]!==undefined)u[k]=req.body[k];save(db);res.json(publicUser(u));});
app.post('/api/messages',auth,(req,res)=>{const {toUserId,body}=req.body||{};if(!toUserId||!body?.trim())return res.status(400).json({error:'Recipient and message are required'});const risk=riskText(body);const db=load();const message={id:crypto.randomUUID(),fromUserId:req.user.id,toUserId,body:body.trim(),createdAt:new Date().toISOString(),risk};if(risk.level==='critical'||risk.level==='high'){db.moderationActions.push({id:crypto.randomUUID(),type:'message_blocked',userId:req.user.id,reason:risk.flags,createdAt:new Date().toISOString()});save(db);return res.status(422).json({error:'Message blocked by ZERA Trust & Safety',risk});}db.messages.push(message);save(db);io.to(toUserId).emit('message:new',message);res.status(201).json(message);});
app.get('/api/messages/:userId',auth,(req,res)=>{const db=load();res.json(db.messages.filter(m=>(m.fromUserId===req.user.id&&m.toUserId===req.params.userId)||(m.toUserId===req.user.id&&m.fromUserId===req.params.userId)));});
app.post('/api/posts',auth,(req,res)=>{const {content}=req.body||{};if(!content?.trim())return res.status(400).json({error:'Post content is required'});const risk=riskText(content);const db=load();if(risk.level==='critical'||risk.level==='high'){db.moderationActions.push({id:crypto.randomUUID(),type:'post_blocked',userId:req.user.id,reason:risk.flags,createdAt:new Date().toISOString()});save(db);return res.status(422).json({error:'Post blocked by ZERA Trust & Safety',risk});}const post={id:crypto.randomUUID(),userId:req.user.id,content:content.trim(),createdAt:new Date().toISOString()};db.posts.unshift(post);save(db);res.status(201).json(post);});
app.get('/api/posts',(req,res)=>{const db=load();res.json(db.posts.slice(0,50).map(p=>({...p,user:publicUser(db.users.find(u=>u.id===p.userId)||{id:p.userId,name:'ZERA member',username:'member',role:'user',status:'active',createdAt:p.createdAt})})));});
app.post('/api/reports',auth,(req,res)=>{const {targetUserId,reason,details=''}=req.body||{};if(!targetUserId||!reason)return res.status(400).json({error:'Target and reason are required'});const db=load();db.reports.push({id:crypto.randomUUID(),reporterId:req.user.id,targetUserId,reason,details,status:'open',createdAt:new Date().toISOString()});save(db);res.status(201).json({ok:true});});
const upload=multer({storage:multer.diskStorage({destination:uploadDir,filename:(req,file,cb)=>cb(null,`${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g,'_')}`)}),limits:{fileSize:2*1024*1024}});
app.post('/api/admin/login',async(req,res)=>{const {email,password}=req.body||{};const attemptedEmail=String(email||'').slice(0,254);const adminEmail=attemptedEmail.toLowerCase();if(!process.env.ADMIN_EMAIL||!process.env.ADMIN_PASSWORD)return res.status(503).json({error:'Admin credentials are not configured on the server'});const db=load();db.adminLoginActivity||=[];if(adminEmail!==process.env.ADMIN_EMAIL.toLowerCase()||password!==process.env.ADMIN_PASSWORD){db.adminLoginActivity.push({id:crypto.randomUUID(),attemptedEmail,success:false,createdAt:new Date().toISOString()});if(db.adminLoginActivity.length>200)db.adminLoginActivity.shift();save(db);return res.status(401).json({error:'Invalid admin credentials'});}db.adminLoginActivity.push({id:crypto.randomUUID(),adminEmail:process.env.ADMIN_EMAIL,success:true,createdAt:new Date().toISOString()});if(db.adminLoginActivity.length>200)db.adminLoginActivity.shift();save(db);const user={id:'admin',role:'admin',email:process.env.ADMIN_EMAIL};res.json({token:tokenFor(user),user:{id:'admin',email:process.env.ADMIN_EMAIL,role:'admin'}});});
app.get('/api/admin/overview',admin,(req,res)=>{const db=load();res.json({users:db.users.map(publicUser),reports:db.reports,moderationActions:db.moderationActions,siteConfig:db.siteConfig,stats:{users:db.users.length,developers:db.users.filter(u=>u.accountType==='developer').length,hirers:db.users.filter(u=>u.accountType==='hire').length,messages:db.messages.length,posts:db.posts.length,openReports:db.reports.filter(r=>r.status==='open').length,activeUsers:db.users.filter(u=>u.status==='active').length,suspendedUsers:db.users.filter(u=>u.status==='suspended').length,pendingReports:db.reports.filter(r=>r.status==='open').length}});});
app.get('/api/admin/security',admin,(req,res)=>{const db=load();res.json({loginActivity:(db.adminLoginActivity||[]).slice().reverse(),auditLogs:(db.adminAuditLogs||[]).slice().reverse()});});
app.patch('/api/admin/users/:id',admin,(req,res)=>{const db=load();const u=db.users.find(x=>x.id===req.params.id);if(!u)return res.status(404).json({error:'User not found'});if(['active','suspended','disabled'].includes(req.body.status)){const previousStatus=u.status;u.status=req.body.status;if(previousStatus!==u.status)recordAdminEvent(db,req,'user_status_changed',`${u.id}: ${previousStatus} to ${u.status}`);}save(db);res.json(publicUser(u));});
app.patch('/api/admin/site-config',admin,(req,res)=>{const db=load();const allowed=['brandName','tagline','logoUrl','contactEmail'];for(const k of allowed)if(req.body[k]!==undefined)db.siteConfig[k]=req.body[k];if(req.body.socials)db.siteConfig.socials={...db.siteConfig.socials,...req.body.socials};recordAdminEvent(db,req,'website_settings_updated','Updated public website configuration');save(db);res.json(db.siteConfig);});
app.post('/api/admin/logo',admin,upload.single('logo'),(req,res)=>{if(!req.file)return res.status(400).json({error:'Logo file required'});const db=load();db.siteConfig.logoUrl=`/uploads/${req.file.filename}`;save(db);res.json(db.siteConfig);});
app.patch('/api/admin/reports/:id',admin,(req,res)=>{const db=load();const r=db.reports.find(x=>x.id===req.params.id);if(!r)return res.status(404).json({error:'Report not found'});if(!['open','reviewed','resolved'].includes(req.body.status))return res.status(400).json({error:'Report status must be open, reviewed, or resolved'});const previousStatus=r.status;r.status=req.body.status;if(previousStatus!==r.status)recordAdminEvent(db,req,'report_status_changed',`${r.id}: ${previousStatus} to ${r.status}`);save(db);res.json(r);});
app.post('/api/ai/chat',auth,async(req,res)=>{const {message,context=''}=req.body||{};if(!message?.trim())return res.status(400).json({error:'Message required'});const risk=riskText(message);if(risk.level==='critical')return res.status(422).json({error:'Request blocked by ZERA Trust & Safety'});if(!process.env.OPENAI_API_KEY)return res.json({reply:'ZERA AI is connected to the ZERA HUB interface, but its live AI key has not been configured yet. Add OPENAI_API_KEY to .env, restart the server, and I can answer technical questions, teach concepts, write code, review code and debug errors.'});try{const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${process.env.OPENAI_API_KEY}`},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-5-mini',instructions:'You are ZERA AI, the developer mentor and coding assistant inside ZERA HUB. Be accurate, practical, beginner-friendly when needed, and strong at frontend, backend, databases, cybersecurity fundamentals, debugging, architecture, testing and deployment. Never claim to have executed code you did not execute. Protect secrets and credentials.',input:`User message:\n${message}\n\nContext:\n${context}`})});if(!r.ok)throw new Error('AI provider error');const data=await r.json();const text=data.output_text||data.output?.flatMap(x=>x.content||[]).map(x=>x.text||'').join('')||'I could not produce a response right now.';res.json({reply:text});}catch(e){res.status(502).json({error:'ZERA AI is temporarily unavailable. Check the server API configuration.'});}});
io.on('connection',(socket)=>{socket.on('identify',(userId)=>{if(userId)socket.join(userId);});});
app.get('*',(req,res,next)=>{if(req.path.startsWith('/api/')||req.path.startsWith('/uploads/'))return next();res.sendFile(path.join(root,'dist','index.html'));});
async function startServer(){
  try{
    await connectDatabase();
    httpServer.listen(PORT,()=>console.log(`ZERA HUB API running on http://localhost:${PORT}`));
  }catch(error){
    console.error('Backend startup failed:',error.message);
    if(error.cause?.code)console.error('MongoDB failure code:',error.cause.code);
    process.exitCode=1;
    httpServer.close();
  }
}
startServer();
