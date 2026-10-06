import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {AnimatePresence,motion,useReducedMotion} from 'framer-motion';
import {BrowserRouter,Routes,Route,Link,NavLink,useNavigate,useLocation} from 'react-router-dom';
import {ArrowRight,ArrowUpRight,BrainCircuit,BriefcaseBusiness,Code2,Compass,FileCode2,FolderKanban,Globe2,Home as HomeIcon,Layers3,Mail,Menu,MessageCircle,Network,Plus,Search,Send,ShieldCheck,Sparkles,Terminal,Users,Workflow,X,Instagram,Facebook,Twitter,Settings,LogOut,UserRound,AtSign,Lock,CheckCircle2,AlertTriangle,Upload,BarChart3,Ban,RefreshCw,Bell,ImagePlus,Check,Sun,Moon,ChevronLeft} from 'lucide-react';
import './index.css';
import './visual-refresh.css';
import AdminControlCenter from './AdminControlCenter';
import { DeveloperDirectory, Marketplace, ProfileEditor } from './Platform';
import { CommunityHub } from './Community';
import { ZeraAIWorkspace } from './ZeraAI';
import { BrandMark } from './BrandMark';
import './responsive.css';
import './theme.css';

const API=import.meta.env.VITE_API_URL||(import.meta.env.PROD?'https://zera-hub-api.onrender.com':'http://localhost:4000');
const social={facebook:'https://www.facebook.com/share/1BDT7JfvXm/',instagram:'https://www.instagram.com/zerahub2026/',x:'https://x.com/zerahub2809'};
function setPageMetadata(title:string,description:string){document.title=`${title} · ZERA HUB`;let meta=document.querySelector<HTMLMetaElement>('meta[name="description"]');if(!meta){meta=document.createElement('meta');meta.name='description';document.head.append(meta);}meta.content=description;}

type User={id:string;name:string;username:string;role:string;accountType:string;bio?:string;skills?:string[];avatar?:string;status:string;verified?:boolean;online?:boolean;lastSeenAt?:string|null};
type ChatMessage={id:string;fromUserId:string;toUserId:string;body:string;imageUrl?:string;createdAt:string;sentAt?:string;deliveredAt?:string|null;readAt?:string|null};
type PlatformNotification={id:string;userId:string;type:string;title:string;body:string;data?:Record<string,unknown>;actor?:User|null;createdAt:string;readAt:string|null};
type PushPublicKeyResponse={publicKey:string|null};
type ConnectionListResponse={connections:Array<{id:string;user:User;status:'pending'|'accepted'|'rejected';direction:'incoming'|'outgoing'|'connected'}>};
type ChatPreferencesResponse={chatWallpaper?:string;chatWallpaperImage?:string;theme?:Theme;notificationSound?:boolean};
type Theme='light'|'dark';
function applyTheme(theme:Theme){document.documentElement.dataset.theme=theme;document.body.dataset.theme=theme;localStorage.setItem('zera_theme',theme);const meta=document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');if(meta)meta.content=theme==='light'?'#F7F7F5':'#111315'}
const nav=[['/','Home'],['/about','About'],['/developers','Developers'],['/services','Services'],['/projects','Projects'],['/community','Community'],['/ai','ZERA AI'],['/collaborate','Collaborate'],['/jobs','Jobs'],['/contact','Contact']];
const api=async(path:string,options:RequestInit={})=>{const token=localStorage.getItem('zera_token');const headers=new Headers(options.headers);headers.set('Content-Type','application/json');if(token)headers.set('Authorization',`Bearer ${token}`);const r=await fetch(`${API}${path}`,{...options,headers});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||'Request failed');return data;};
function apiUpload<T>(path:string,formData:FormData):Promise<T>{const headers=new Headers();const token=localStorage.getItem('zera_token');if(token)headers.set('Authorization',`Bearer ${token}`);return fetch(`${API}${path}`,{method:'POST',headers,body:formData}).then(async response=>{const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Upload failed');return data as T})}
function apiTyped<T>(path:string,options:RequestInit={}):Promise<T>{return api(path,options).then((data:unknown)=>data as T)}
function decodeVapidKey(value:string){const padding='='.repeat((4-value.length%4)%4);const raw=atob((value+padding).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(raw,char=>char.charCodeAt(0))}
function UserAvatar({user,className=''}:{user:User;className?:string}){return <span className={`inner-avatar ${className}`}>{user.avatar?<img src={user.avatar.startsWith('http')?user.avatar:`${API}${user.avatar}`} alt=""/>:user.name?.slice(0,1).toUpperCase()}<i className={user.online?'online':'offline'}/></span>}
function VerificationBadge(){return <span className="verification-badge" title="Verified profile" aria-label="Verified profile"><Check size={11}/></span>}
function formatLastSeen(user:User){if(user.online)return 'Online';if(!user.lastSeenAt)return 'Offline';const elapsed=Date.now()-Date.parse(user.lastSeenAt);if(elapsed<3600000)return `Last seen ${Math.max(1,Math.floor(elapsed/60000))}m ago`;if(elapsed<86400000)return `Last seen ${Math.floor(elapsed/3600000)}h ago`;return `Last seen ${new Date(user.lastSeenAt).toLocaleDateString()}`}
function PresenceHeartbeat(){useEffect(()=>{const heartbeat=()=>{if(localStorage.getItem('zera_token'))api('/api/presence',{method:'POST'}).catch(error=>console.error('Could not update account presence:',error))};heartbeat();const timer=window.setInterval(heartbeat,45000);return()=>window.clearInterval(timer)},[]);return null}

function App(){
  const [auth,setAuth]=useState<'developer'|'hire'|'signin'|null>(null);
  const [ai,setAI]=useState(false);
  const [aiPrompt,setAIPrompt]=useState('');
  const [aiContext,setAIContext]=useState('');
  const [site,setSite]=useState<any>(null);
  const [user,setUser]=useState<User|null>(null);
  const location=useLocation();
  const isAdminRoute=location.pathname==='/admindev2809';
  const isMessagesRoute=location.pathname==='/messages';

  const syncUser=()=>{
    const raw=localStorage.getItem('zera_user');
    if(raw){
      try{setUser(JSON.parse(raw));}catch{}
    }else{
      setUser(null);
    }
  };

  useEffect(()=>{
    api('/api/site-config').then(setSite).catch(()=>{});
    syncUser();
    const open=(event:Event)=>{const detail=(event as CustomEvent<{prompt?:string;context?:string}>).detail;setAIPrompt(detail?.prompt||'');setAIContext(detail?.context||'');setAI(true)};
    window.addEventListener('open-zera-ai',open);
    window.addEventListener('zera-authenticated',syncUser);
    window.addEventListener('storage',syncUser);
    return()=>{
      window.removeEventListener('open-zera-ai',open);
      window.removeEventListener('zera-authenticated',syncUser);
      window.removeEventListener('storage',syncUser);
    };
  },[]);

  useEffect(()=>{
    if(!user)return;
    apiTyped<ChatPreferencesResponse>('/api/platform/profile/preferences')
      .then(preferences=>{if(preferences.theme==='light'||preferences.theme==='dark')applyTheme(preferences.theme)})
      .catch(error=>console.error('Could not load account theme preference:',error));
  },[user]);

  useEffect(()=>{
    if(!site?.logoUrl)return;
    const favicon=document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    if(favicon)favicon.href=site.logoUrl.startsWith('http')?site.logoUrl:`${API}${site.logoUrl}`;
  },[site]);

  return <>
    <PresenceHeartbeat/>
    {!isAdminRoute&&!isMessagesRoute&&<Header site={site} user={user} onAuth={setAuth}/>}
    <Routes>
      <Route path="/" element={<Home onAuth={setAuth} onAI={()=>setAI(true)}/>}/>
      <Route path="/about" element={<About/>}/>
      <Route path="/developers/*" element={<DeveloperDirectory user={user} onAuth={setAuth}/>}/>
      <Route path="/services" element={<Services/>}/>
      <Route path="/projects" element={<Projects/>}/>
      <Route path="/community" element={<CommunityHub user={user} onAuth={setAuth}/>}/>
      <Route path="/ai" element={<ZeraAIWorkspace user={user} site={site} onAuth={setAuth}/>}/>
      <Route path="/collaborate" element={<Collaborate/>}/>
      <Route path="/jobs/*" element={<Marketplace user={user} onAuth={setAuth}/>}/>
      <Route path="/contact" element={<Contact/>}/>
      <Route path="/app" element={<AppHome user={user}/>}/>
      <Route path="/messages" element={<Messages user={user}/>}/>
      <Route path="/notifications" element={<NotificationsPage user={user}/>}/>
      <Route path="/profile/*" element={<ProfileEditor user={user} onAuth={setAuth} onUserUpdated={updated=>setUser(current=>current?{...current,...updated}:current)}/>}/>
      <Route path="/admindev2809" element={<AdminControlCenter/>}/>
      <Route path="*" element={<NotFound/>}/>
    </Routes>
    {!isAdminRoute&&!isMessagesRoute&&<Footer site={site}/>}
    <AnimatePresence>{auth&&<AuthModal type={auth} site={site} onClose={()=>setAuth(null)} onSignedIn={account=>{setUser(account);setAuth(null);window.dispatchEvent(new Event('zera-authenticated'))}}/>}</AnimatePresence>
    {ai&&<ZeraAIWorkspace user={user} site={site} onAuth={setAuth} isModal initialPrompt={aiPrompt} initialContext={aiContext} onClose={()=>{setAI(false);setAIPrompt('');setAIContext('')}}/>}
  </>;
}

function Brand({site,compact=false}:{site:any;compact?:boolean}){return <NavLink className="brand" to="/"><BrandMark site={site}/>{!compact&&<span><strong>{site?.brandName||'ZERA HUB'}</strong><small>{site?.tagline||'Grow Ideas. Build Tomorrow.'}</small></span>}</NavLink>}
function LogoMark({site}:{site:any}){return <BrandMark site={site}/>}

function Header({site,user,onAuth}:{site:any;user:User|null;onAuth:(x:any)=>void}){
  const [open,setOpen]=useState(false);
  const [unreadNotifs,setUnreadNotifs]=useState(0);
  const [unreadMsgs,setUnreadMsgs]=useState(0);
  const location=useLocation();
  const token=localStorage.getItem('zera_token');
  const currentUser=user;

  useEffect(()=>{
    if(!token){
      setUnreadNotifs(0);
      setUnreadMsgs(0);
      return;
    }
    const refreshCounts=()=>{
      if(!localStorage.getItem('zera_token'))return;
      apiTyped<PlatformNotification[]>('/api/notifications')
        .then(items=>{
          const notifs=items.filter(item=>!item.readAt);
          setUnreadNotifs(notifs.filter(i=>i.type!=='message').length);
          setUnreadMsgs(notifs.filter(i=>i.type==='message').length);
        })
        .catch(()=>{});
    };
    refreshCounts();
    const timer=window.setInterval(refreshCounts,15000);
    window.addEventListener('zera-authenticated',refreshCounts);
    return()=>{
      window.clearInterval(timer);
      window.removeEventListener('zera-authenticated',refreshCounts);
    };
  },[token,location.pathname]);

  const signOut=()=>{
    localStorage.removeItem('zera_token');
    localStorage.removeItem('zera_user');
    window.dispatchEvent(new Event('zera-authenticated'));
    window.location.assign('/');
  };

  const authenticatedNav = [
    { to: '/app', label: 'Hub', icon: HomeIcon },
    { to: '/community', label: 'Community', icon: Users },
    { to: '/developers', label: 'Developers', icon: Code2 },
    { to: '/developers#connection-requests', label: 'Connections', icon: Network },
    { to: '/messages', label: 'Messages', icon: MessageCircle, badge: unreadMsgs },
    { to: '/notifications', label: 'Notifications', icon: Bell, badge: unreadNotifs },
    { to: '/ai', label: 'ZERA AI', icon: BrainCircuit },
    { to: '/jobs', label: 'Jobs', icon: BriefcaseBusiness },
  ];

  return (
    <header className="header">
      <div className="container header-inner">
        <Brand site={site}/>
        <nav className="desktop-nav">
          {token ? (
            authenticatedNav.map(({to,label,badge}) => (
              <NavLink key={to} className={({isActive})=>isActive?'active':''} to={to}>
                {label}
                {typeof badge === 'number' && badge > 0 ? <span className="nav-badge">{badge > 99 ? '99+' : badge}</span> : null}
              </NavLink>
            ))
          ) : (
            nav.map(([to,label]) => (
              <NavLink key={to} className={({isActive})=>isActive?'active':''} to={to}>
                {label}
              </NavLink>
            ))
          )}
        </nav>
        <div className="header-actions">
          {token && currentUser ? (
            <>
              <NavLink className="header-user-pill hide-mobile" to="/profile" title="View & Edit Profile">
                <UserAvatar user={currentUser}/>
                <span className="header-user-name">{currentUser.name}</span>
                {currentUser.verified && <VerificationBadge/>}
              </NavLink>
              <button className="btn btn-ghost hide-mobile" onClick={signOut}>Sign out</button>
            </>
          ) : (
            <>
              <button className="btn btn-ghost hide-mobile" onClick={()=>onAuth('signin')}>Sign in</button>
              <button className="btn btn-primary hide-mobile" onClick={()=>onAuth('developer')}>Join ZERA <ArrowRight size={16}/></button>
            </>
          )}
          <button className="icon-btn menu-btn" onClick={()=>setOpen(!open)} aria-label="Toggle navigation menu">
            {open ? <X size={20}/> : <Menu size={20}/>}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div className="mobile-menu" initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}}>
            <div className="container mobile-menu-inner">
              {token && currentUser && (
                <div className="mobile-user-card">
                  <UserAvatar user={currentUser}/>
                  <div className="mobile-user-details">
                    <b>{currentUser.name} {currentUser.verified && <VerificationBadge/>}</b>
                    <small>@{currentUser.username}</small>
                  </div>
                </div>
              )}

              <div className="mobile-links-list">
                {token ? (
                  authenticatedNav.map(({to,label,icon:Icon,badge}) => (
                    <NavLink onClick={()=>setOpen(false)} key={to} to={to} className="mobile-nav-link">
                      <span className="mobile-nav-title"><Icon size={17}/> {label}</span>
                      {typeof badge === 'number' && badge > 0 ? <span className="nav-badge">{badge > 99 ? '99+' : badge}</span> : <ArrowUpRight size={14}/>}
                    </NavLink>
                  ))
                ) : (
                  nav.map(([to,label]) => (
                    <NavLink onClick={()=>setOpen(false)} key={to} to={to} className="mobile-nav-link">
                      <span>{label}</span>
                      <ArrowUpRight size={14}/>
                    </NavLink>
                  ))
                )}
              </div>

              <div className="mobile-auth">
                {token ? (
                  <>
                    <NavLink className="btn btn-primary mobile-full-btn" to="/profile" onClick={()=>setOpen(false)}>
                      <UserRound size={16}/> My Profile
                    </NavLink>
                    <button className="btn btn-ghost mobile-full-btn" onClick={signOut}>
                      <LogOut size={16}/> Sign out
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn btn-ghost mobile-full-btn" onClick={()=>{onAuth('signin');setOpen(false)}}>
                      Sign in
                    </button>
                    <button className="btn btn-primary mobile-full-btn" onClick={()=>{onAuth('developer');setOpen(false)}}>
                      Join ZERA <ArrowRight size={15}/>
                    </button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
function Ambient(){return <div className="ambient" aria-hidden><div className="orb orb-a"/><div className="orb orb-b"/><div className="grid-glow"/><div className="stars">{Array.from({length:30}).map((_,i)=><i key={i}/>)}</div></div>}
function Reveal({children,delay=0,className=''}:{children:React.ReactNode;delay?:number;className?:string}){const reduced=useReducedMotion();return <motion.div className={className} initial={reduced?false:{opacity:0,y:25}} whileInView={reduced?undefined:{opacity:1,y:0}} viewport={{once:true,amount:.12}} transition={{duration:.65,delay}}>{children}</motion.div>}
function SectionTitle({eyebrow,title,caption}:{eyebrow:string;title:string;caption:string}){return <Reveal className="section-heading"><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p>{caption}</p></Reveal>}
function Page({children,title,caption,eyebrow,icon:Icon=Sparkles}:{children:React.ReactNode;title:string;caption:string;eyebrow:string;icon?:any}){useEffect(()=>setPageMetadata(title,caption),[title,caption]);return <main className="page"><Ambient/><div className="container page-inner"><Reveal><div className="page-kicker"><Icon size={15}/> {eyebrow}</div><h1>{title}</h1><p className="page-caption">{caption}</p></Reveal>{children}</div></main>}
function Home({onAuth,onAI}:{onAuth:(x:any)=>void;onAI:()=>void}){const reduced=useReducedMotion();useEffect(()=>setPageMetadata('Grow Ideas. Build Tomorrow.','A global technology ecosystem for developers, creators, and people who hire.'),[]);return <main className="home"><section className="hero"><Ambient/><div className="container hero-grid"><div><Reveal><div className="status-pill"><span/> Built for developers, creators & people who hire</div><h1>Grow Ideas.<br/><span>Build Tomorrow.</span></h1><p>A technology ecosystem where developers and the people who need them can connect, chat, share knowledge, collaborate, build and grow.</p><div className="hero-actions"><button className="btn btn-primary btn-lg" onClick={()=>onAuth('developer')}>Sign up as Developer <Code2 size={17}/></button><button className="btn btn-ghost btn-lg" onClick={()=>onAuth('hire')}>Sign up to Hire <BriefcaseBusiness size={17}/></button></div><div className="hero-links"><NavLink to="/developers">Explore developers <ArrowUpRight size={14}/></NavLink><button onClick={onAI}>Meet ZERA AI <BrainCircuit size={14}/></button></div></Reveal></div><Reveal delay={.15}><HeroVisual reduced={!!reduced}/></Reveal></div><div className="container hero-bottom"><span>IDEA</span><i/><span>CONNECT</span><i/><span>BUILD</span><i/><span>COLLABORATE</span><i/><span>GROW</span></div></section><section className="section-space"><div className="container"><SectionTitle eyebrow="One place for the people behind technology" title="Not just a portfolio. Not just a social network." caption="ZERA HUB combines professional discovery, developer community, real conversations, collaboration and AI-powered building into one focused ecosystem."/><div className="card-grid four">{[['Developers','Create a serious profile, show skills, publish projects and connect.',Code2],['People who hire','Find talent, discuss requirements and move projects forward.',BriefcaseBusiness],['Community','Share ideas, code, tools, questions and lessons with other builders.',Users],['ZERA AI','Learn, code, debug, review and reason with your development companion.',BrainCircuit]].map(([t,p,I],i)=><Reveal delay={i*.05} key={t as string}><div className="feature-card"><div className="feature-icon"><I size={19}/></div><h3>{t as string}</h3><p>{p as string}</p><ArrowUpRight size={16}/></div></Reveal>)}</div></div></section><section className="section-band"><div className="container split-callout"><div><span className="eyebrow">The seed behind the name</span><h2>ZERA means the beginning of growth.</h2><p>Every developer starts somewhere. Every product starts as an idea. ZERA HUB is built around that first step — then gives the idea people, tools, knowledge and opportunities to grow.</p></div><div className="seed-visual"><motion.div animate={reduced?undefined:{scale:[1,1.08,1],rotate:[0,4,-4,0]}} transition={{duration:6,repeat:Infinity}}><Sparkles size={38}/></motion.div><span>IDEA → IMPACT</span></div></div></section><section className="section-space"><div className="container"><SectionTitle eyebrow="Start with the right door" title="Choose how you enter ZERA HUB." caption="The platform serves both the people building technology and the people looking for the right talent to build with."/><div className="role-grid"><Reveal><button className="role-card" onClick={()=>onAuth('developer')}><Code2/><span>Developer</span><p>Build your profile, connect, learn, share and find opportunities.</p><ArrowRight/></button></Reveal><Reveal delay={.1}><button className="role-card" onClick={()=>onAuth('hire')}><BriefcaseBusiness/><span>Hire talent</span><p>Discover developers, start conversations and build with the right people.</p><ArrowRight/></button></Reveal></div></div></section></main>}
function HeroVisual({reduced}:{reduced:boolean}){return <motion.div className="hero-visual" animate={reduced?undefined:{rotateX:[0,2,-1,0],rotateY:[0,-2,1,0]}} transition={{duration:10,repeat:Infinity}}><div className="visual-noise"/><div className="visual-ring ring-one"/><div className="visual-ring ring-two"/><div className="visual-ring ring-three"/><motion.div className="core" animate={reduced?undefined:{boxShadow:['0 0 45px rgba(139,92,246,.16)','0 0 105px rgba(34,211,238,.24)','0 0 45px rgba(139,92,246,.16)']}} transition={{duration:4,repeat:Infinity}}><BrainCircuit size={34}/><span>ZERA AI</span><small>BUILD • LEARN • GROW</small></motion.div>{[['DEVELOPER CHAT',MessageCircle,'float-a'],['CODE + DEBUG',FileCode2,'float-b'],['HIRE TALENT',Users,'float-c'],['PROJECTS',FolderKanban,'float-d']].map(([t,I,c])=><motion.div key={t as string} className={`float-card ${c as string}`} animate={reduced?undefined:{y:[0,-8,0]}} transition={{duration:4.5,repeat:Infinity,delay:Math.random()}}><I size={13}/>{t as string}</motion.div>)}</motion.div>}

function About(){return <Page eyebrow="Why ZERA HUB exists" title="A seed can become an ecosystem." caption="ZERA means seed — the beginning of something that can grow. ZERA HUB turns that idea into a technology community built around people, opportunity and creation." icon={Compass}><div className="about-grid"><Reveal><div className="story-card"><span className="eyebrow">Vision</span><h3>To create a connected technology ecosystem where ideas grow into meaningful digital solutions.</h3><p>Developers should not have to move between disconnected spaces just to meet people, show work, learn, collaborate and find opportunities.</p></div></Reveal><Reveal delay={.1}><div className="story-card accent"><span className="eyebrow">Mission</span><h3>Connect developers, creators, companies and individuals with the tools and environment to build.</h3><p>The platform is designed to keep professional identity, community, communication, collaboration and intelligent assistance close together.</p></div></Reveal></div><div className="timeline">{[['01','SEED','The first idea.'],['02','CONNECT','Find people who understand the idea.'],['03','BUILD','Turn conversation into real work.'],['04','GROW','Learn, ship, improve and create impact.']].map(([n,t,p],i)=><Reveal delay={i*.08} key={n}><div><b>{n}</b><span>{t}</span><p>{p}</p></div></Reveal>)}</div></Page>}
function Developers({onAuth}:{onAuth:(x:any)=>void}){const [users,setUsers]=useState<User[]>([]);const [q,setQ]=useState('');useEffect(()=>{api('/api/health').catch(()=>{});const token=localStorage.getItem('zera_token');if(token)api('/api/users').then(setUsers).catch(()=>{});},[]);const list=useMemo(()=>users.filter(u=>(u.name+' '+u.username+' '+(u.skills||[]).join(' ')).toLowerCase().includes(q.toLowerCase())),[users,q]);return <Page eyebrow="Meet the people behind the code" title="Discover developers. Show your work. Connect." caption="Developer profiles are built around skills, projects, experience and what someone is available to build. Public discovery becomes richer as the community grows." icon={Code2}><div className="toolbar"><div className="search-box"><Search size={16}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search developers, skills or frameworks"/></div><button className="btn btn-primary" onClick={()=>onAuth('developer')}>Create developer profile <Plus size={15}/></button></div>{users.length===0?<EmptyState title="Developer discovery is ready" text="Create an account to unlock the live developer directory and start building your professional profile." action="Sign up as Developer" onClick={()=>onAuth('developer')}/>:<div className="developer-grid">{list.map((u,i)=><Reveal delay={i*.04} key={u.id}><div className="developer-card"><div className="avatar">{u.avatar?<img src={u.avatar}/>:u.name.slice(0,1).toUpperCase()}</div><div className="verified">{u.verified&&<CheckCircle2 size={13}/>} {u.status}</div><h3>{u.name}</h3><span>@{u.username}</span><p>{u.bio||'Developer building useful digital products.'}</p><div className="tags">{(u.skills||[]).slice(0,5).map(s=><i key={s}>{s}</i>)}</div><NavLink className="card-link" to={`/messages?user=${u.id}`}>Connect <ArrowUpRight size={14}/></NavLink></div></Reveal>)}</div>}</Page>}
function Services(){return <Page eyebrow="Build something people can use" title="From idea to polished digital experience." caption="Explore the technology paths ZERA HUB is designed to make easier to discover, discuss and start." icon={Layers3}><div className="service-grid">{[['Frontend & Web','Interfaces, dashboards, responsive sites and modern web applications.',Globe2],['Backend & APIs','Services, authentication, data flows and production-ready foundations.',Terminal],['UI / UX','Clear information architecture, interaction design and product thinking.',Sparkles],['AI Development','AI assistants, coding workflows, automation and intelligent product features.',BrainCircuit],['Collaboration','Bring developers, designers and clients into one project context.',Workflow],['Technical Learning','Ask questions, learn concepts and improve through practical guidance.',Compass]].map(([t,p,I],i)=><Reveal key={t as string} delay={i*.05}><div className="service-card"><div className="feature-icon"><I size={18}/></div><h3>{t as string}</h3><p>{p as string}</p></div></Reveal>)}</div></Page>}
function Projects(){return <Page eyebrow="Proof of what can be built" title="Put your work where people can see it." caption="Projects give developers and teams a place to present what they built, how they built it and who helped make it happen." icon={FolderKanban}><div className="project-board"><div className="project-main"><span className="eyebrow">Featured project workspace</span><h3>Build in public. Collaborate privately.</h3><p>Showcase projects, technologies, roles, progress and outcomes. Then move into a private collaboration space when it is time to build.</p><div className="project-metrics"><b><strong>01</strong>Idea</b><b><strong>02</strong>Build</b><b><strong>03</strong>Ship</b></div></div><div className="project-side"><div><Code2/><span>Code</span><small>Share technical work</small></div><div><Users/><span>Team</span><small>Show contributors</small></div><div><RocketIcon/><span>Outcome</span><small>Show what changed</small></div></div></div></Page>}
function RocketIcon(){return <Sparkles/>}
function Community({user}:{user:User|null}){const [posts,setPosts]=useState<any[]>([]);const [content,setContent]=useState('');const load=()=>api('/api/posts').then(setPosts).catch(()=>{});useEffect(()=>{load()},[]);const publish=async()=>{if(!content.trim())return;try{await api('/api/posts',{method:'POST',body:JSON.stringify({content})});setContent('');load()}catch(e:any){alert(e.message)}};return <Page eyebrow="A social space for builders" title="Like a social network — built for technology." caption="Post ideas, share code, ask questions, discuss tools, follow developers and build professional relationships without leaving ZERA HUB." icon={Users}><div className="community-layout"><div><div className="composer"><div className="avatar">{user?.name?.[0]||'Z'}</div><textarea value={content} onChange={e=>setContent(e.target.value)} placeholder={user?'Share an idea, snippet, question or lesson…':'Sign in to publish to the community.'} disabled={!user}/><button className="btn btn-primary" onClick={publish} disabled={!user}><Send size={15}/> Post</button></div>{posts.length===0?<div className="empty-feed"><MessageCircle/><h3>Your developer feed starts here.</h3><p>Community posts, code discussions, tool recommendations and questions will appear here.</p></div>:posts.map(p=><article className="post" key={p.id}><div className="post-head"><div className="avatar">{p.user.name?.[0]}</div><div><b>{p.user.name}</b><span>@{p.user.username} · {new Date(p.createdAt).toLocaleString()}</span></div></div><p>{p.content}</p></article>)}</div><aside className="community-side"><div><ShieldCheck/><b>ZERA Trust</b><p>Safety signals help detect suspicious content and abuse.</p></div><div><FileCode2/><b>Code sharing</b><p>Share snippets and explain how you solved the problem.</p></div><div><Network/><b>Developer network</b><p>Build relationships around skills instead of noise.</p></div></aside></div></Page>}
function AIPage(){return <Page eyebrow="Your development companion" title="Ask. Learn. Code. Debug. Build." caption="ZERA AI is the intelligence layer of ZERA HUB — designed to teach developers, explain technical ideas, write and review code, debug problems and help turn ideas into build plans." icon={BrainCircuit}><div className="ai-page-grid"><div className="ai-pitch"><span className="ai-badge"><Sparkles size={13}/> ZERA AI</span><h3>A developer mentor that stays with the project.</h3><p>Use ZERA AI for frontend, backend, databases, APIs, architecture, debugging, testing, deployment guidance and learning. The production version connects through the secure ZERA HUB server so API secrets never live in the browser.</p><div className="tags">{['Explain','Code','Debug','Review','Teach','Refactor','Plan','Test'].map(x=><i key={x}>{x}</i>)}</div><button className="btn btn-primary" onClick={()=>window.dispatchEvent(new Event('open-zera-ai'))}>Open ZERA AI <ArrowRight size={15}/></button></div><div className="ai-demo"><div className="console-head"><span><i/> ZERA AI workspace</span><small>SECURE SERVER ROUTE</small></div><div className="chat-bubble user">Why is my React state not updating?</div><div className="chat-bubble ai"><BrainCircuit size={15}/> I’ll inspect the likely causes, explain the state lifecycle, then show a corrected pattern.</div><div className="code-block"><span>const</span> [count, setCount] = useState(0);<br/><span>setCount</span>(count + 1);</div><div className="ai-input"><span>Ask ZERA AI anything about building…</span><Send size={15}/></div></div></div></Page>}
function AIModal({onClose}:{onClose:()=>void}){const [message,setMessage]=useState('');const [loading,setLoading]=useState(false);const [items,setItems]=useState<{role:string,text:string}[]>([{role:'ai',text:'I’m ZERA AI. Ask me to explain, teach, write, review or debug something.'}]);const send=async()=>{if(!message.trim())return;const m=message;setMessage('');setItems(x=>[...x,{role:'user',text:m}]);setLoading(true);try{const d=await api('/api/ai/chat',{method:'POST',body:JSON.stringify({message:m})});setItems(x=>[...x,{role:'ai',text:d.reply}]);}catch(e:any){setItems(x=>[...x,{role:'ai',text:e.message}]);}finally{setLoading(false)}};return <div className="modal-backdrop ai-backdrop" onClick={onClose}><div className="ai-modal" onClick={e=>e.stopPropagation()}><div className="ai-modal-head"><div><b><BrainCircuit size={17}/> ZERA AI</b><small>Developer mentor • coding assistant • debugger</small></div><button className="icon-btn" onClick={onClose}><X/></button></div><div className="ai-chat">{items.map((x,i)=><div className={`chat-bubble ${x.role}`} key={i}>{x.role==='ai'&&<BrainCircuit size={14}/>}<span>{x.text}</span></div>)}{loading&&<div className="chat-bubble ai"><span className="typing">Thinking <i/><i/><i/></span></div>}</div><div className="ai-input"><textarea value={message} onChange={e=>setMessage(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}} placeholder="Ask ZERA AI…"/><button onClick={send} disabled={loading}><Send size={17}/></button></div><div className="ai-footnote">Live AI requires <code>OPENAI_API_KEY</code> in the server environment. Never place private API keys in the frontend.</div></div></div>}
function Collaborate(){return <Page eyebrow="Move from conversation to creation" title="Find the right people and build together." caption="Turn messages into projects with shared workspaces, roles, tasks, files, comments and clear project context." icon={Workflow}><div className="collab-grid">{[['Project rooms','Keep conversation, files and decisions together.',FolderKanban],['Roles & permissions','Owner, admin, developer, designer and viewer roles.',ShieldCheck],['Tasks & progress','Move work from idea to done with visible ownership.',CheckCircle2],['Code context','Keep snippets, links and technical decisions close to the project.',FileCode2]].map(([t,p,I],i)=><Reveal delay={i*.06} key={t as string}><div className="feature-card"><I/><h3>{t as string}</h3><p>{p as string}</p></div></Reveal>)}</div></Page>}
function Jobs({onAuth}:{onAuth:(x:any)=>void}){return <Page eyebrow="Skills meet opportunity" title="Find developers. Find work. Find the right fit." caption="A skill-first space for companies and clients to discover developers, discuss work and manage opportunities." icon={BriefcaseBusiness}><div className="jobs-grid"><Reveal><div className="job-card"><BriefcaseBusiness/><span>FOR HIRERS</span><h3>Find the people who can actually build it.</h3><p>Search by skills, frameworks, experience, availability and project fit, then start the conversation inside ZERA HUB.</p><button className="btn btn-primary" onClick={()=>onAuth('hire')}>Sign up to Hire <ArrowRight size={15}/></button></div></Reveal><Reveal delay={.1}><div className="job-card accent"><Code2/><span>FOR DEVELOPERS</span><h3>Turn your skills into opportunities.</h3><p>Build a profile that shows your work, capabilities and availability without pretending to have experience you do not have.</p><button className="btn btn-primary" onClick={()=>onAuth('developer')}>Create Developer Profile <ArrowRight size={15}/></button></div></Reveal></div></Page>}
function Contact(){return <Page eyebrow="Every build starts with a conversation" title="Bring the idea. ZERA HUB helps it move." caption="Reach ZERA HUB directly or join the platform. The public contact details are kept clean behind familiar icons rather than exposed URL text." icon={Mail}><div className="contact-grid"><div className="contact-card"><Mail/><h3>zerahub@outlook.com</h3><p>For company, partnership, support and general ZERA HUB enquiries.</p><a className="btn btn-primary" href="mailto:zerahub@outlook.com">Email ZERA HUB <ArrowRight size={15}/></a></div><div className="contact-card"><span className="eyebrow">Social</span><h3>Follow. Share. Grow with us.</h3><p>Use the official ZERA HUB icons to visit our social channels. The actual links stay hidden behind the interface.</p><div className="social-icons"><a aria-label="Facebook" href={social.facebook} target="_blank" rel="noreferrer"><Facebook/></a><a aria-label="Instagram" href={social.instagram} target="_blank" rel="noreferrer"><Instagram/></a><a aria-label="X" href={social.x} target="_blank" rel="noreferrer"><Twitter/></a></div></div></div></Page>}
function AppHome({user}:{user:User|null}){return <Page eyebrow="Your ZERA workspace" title={user?`Welcome, ${user.name}.`:'Enter the ZERA HUB workspace.'} caption="The application area is where profiles, messages, community, projects, jobs and ZERA AI become personal rather than public marketing sections." icon={UserRound}><div className="app-grid"><NavLink to="/messages" className="app-card"><MessageCircle/><b>Messages</b><span>Chat with developers and hirers.</span></NavLink><NavLink to="/profile" className="app-card"><UserRound/><b>Profile</b><span>Build your developer or hirer identity.</span></NavLink><NavLink to="/community" className="app-card"><Users/><b>Community</b><span>Publish and learn with builders.</span></NavLink><NavLink to="/ai" className="app-card"><BrainCircuit/><b>ZERA AI</b><span>Learn, code and debug.</span></NavLink></div></Page>}
function NotificationsPage({user}:{user:User|null}){
  const [items,setItems]=useState<PlatformNotification[]>([]);
  const [error,setError]=useState('');
  const navigate=useNavigate();
  useEffect(()=>{if(!user)return;let active=true;const refresh=()=>apiTyped<PlatformNotification[]>('/api/notifications').then(next=>{if(active)setItems(next)}).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'Could not load notifications.')});refresh();const timer=window.setInterval(refresh,12000);return()=>{active=false;window.clearInterval(timer)}},[user]);
  const openNotification=async(item:PlatformNotification)=>{
    if(!item.readAt){
      try{await api('/api/notifications/read',{method:'PATCH',body:'{}'});setItems(current=>current.map(notification=>({...notification,readAt:notification.readAt||new Date().toISOString()})))}
      catch(reason){setError(reason instanceof Error?reason.message:'Could not update notifications.')}
    }
    const target=item.data?.url;
    navigate(typeof target==='string'?target:'/app');
  };
  if(!user)return <Page eyebrow="Your updates" title="Sign in to view notifications." caption="Important connection, message, and account updates appear here." icon={Bell}><EmptyState title="Sign in required" text="Your notifications are private to your account."/></Page>;
  const unread=items.filter(item=>!item.readAt);
  const read=items.filter(item=>item.readAt);
  const notificationRow=(item:PlatformNotification)=><button className={`notification-card ${item.readAt?'read':'unread'}`} key={item.id} onClick={()=>void openNotification(item)}>{item.actor?<UserAvatar user={item.actor}/>:<span className="notification-type-icon"><Bell size={16}/></span>}<span className="notification-card-copy"><b>{item.title}{item.actor?.verified&&<VerificationBadge/>}</b><small>{item.body}</small><time>{new Date(item.createdAt).toLocaleString()}</time></span><ArrowUpRight size={16}/></button>;
  return <Page eyebrow="Your updates" title="Notifications" caption="Connection requests, messages, and important account updates in one place." icon={Bell}><div className="notification-page">{error&&<p className="platform-error" role="alert">{error}</p>}{!items.length?<EmptyState title="You’re all caught up" text="When something needs your attention, you’ll find it here."/>:<><section className="notification-group"><h2>Unread <span>{unread.length}</span></h2>{unread.length?unread.map(notificationRow):<p className="notification-empty">No unread notifications.</p>}</section><section className="notification-group"><h2>Earlier</h2>{read.length?read.map(notificationRow):<p className="notification-empty">Earlier notifications will appear here.</p>}</section></>}</div></Page>;
}
function Messages({user}:{user:User|null}){
  const [theme,setTheme]=useState<Theme>(()=>document.documentElement.dataset.theme==='light'?'light':'dark');
  const [users,setUsers]=useState<User[]>([]);
  const [selected,setSelected]=useState<User|null>(null);
  const [messages,setMessages]=useState<ChatMessage[]>([]);
  const [notifications,setNotifications]=useState<PlatformNotification[]>([]);
  const [body,setBody]=useState('');
  const [search,setSearch]=useState('');
  const [loadError,setLoadError]=useState('');
  const [pushNotice,setPushNotice]=useState('');
  const [wallpaper,setWallpaper]=useState('dark-grid');
  const [wallpaperImage,setWallpaperImage]=useState('');
  const [soundOn,setSoundOn]=useState(localStorage.getItem('zera_notification_sound')==='on');
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [image,setImage]=useState<File|null>(null);
  const [imagePreview,setImagePreview]=useState('');
  const imageRef=useRef<HTMLInputElement>(null);
  const wallpaperRef=useRef<HTMLInputElement>(null);
  const messagesRef=useRef<HTMLDivElement>(null);
  const knownNotifications=useRef(new Set<string>());
  const navigate=useNavigate();
  const refreshConnections=()=>api('/api/platform/connections').then((result:ConnectionListResponse)=>{const accepted=result.connections.filter(entry=>entry.status==='accepted').map(entry=>entry.user).filter(account=>account.id!==user?.id);setUsers(accepted);setSelected(current=>current?accepted.find(account=>account.id===current.id)||current:current)});
  useEffect(()=>{if(!user)return;let alive=true;Promise.all([api('/api/platform/connections'),api('/api/notifications'),api('/api/platform/profile/preferences')]).then(([connectionResult,items,prefs]:[ConnectionListResponse,PlatformNotification[],ChatPreferencesResponse])=>{if(!alive)return;setUsers(connectionResult.connections.filter(entry=>entry.status==='accepted').map(entry=>entry.user).filter(account=>account.id!==user.id));setNotifications(items);knownNotifications.current=new Set(items.map(item=>item.id));setWallpaper(prefs.chatWallpaper||'dark-grid');setWallpaperImage(prefs.chatWallpaperImage||'');if(typeof prefs.notificationSound==='boolean'){setSoundOn(prefs.notificationSound);localStorage.setItem('zera_notification_sound',prefs.notificationSound?'on':'off')}const queryUser=new URLSearchParams(window.location.search).get('user');if(queryUser){const target=connectionResult.connections.find(entry=>entry.status==='accepted'&&entry.user.id===queryUser)?.user;if(target)setSelected(target)}}).catch((error:Error)=>setLoadError(error.message));const presence=()=>api('/api/presence',{method:'POST'}).catch(error=>console.error('Could not update account presence:',error));presence();const connectionsTimer=window.setInterval(()=>{refreshConnections().catch(error=>console.error('Could not refresh connected users:',error))},30000);const presenceTimer=window.setInterval(presence,45000);return()=>{alive=false;window.clearInterval(connectionsTimer);window.clearInterval(presenceTimer)}},[user]);
  useEffect(()=>{if(!selected)return;let active=true;api('/api/notifications/read',{method:'PATCH',body:JSON.stringify({fromUserId:selected.id})}).then(()=>setNotifications(items=>items.map(item=>item.type==='message'&&item.data?.fromUserId===selected.id?{...item,readAt:item.readAt||new Date().toISOString()}:item))).catch(error=>console.error('Could not mark conversation notifications read:',error));const refresh=()=>api(`/api/messages/${selected.id}`).then((items:ChatMessage[])=>{if(active)setMessages(items)}).catch((error:Error)=>setLoadError(error.message));refresh();const timer=window.setInterval(refresh,4000);return()=>{active=false;window.clearInterval(timer)}},[selected]);
  useEffect(()=>{if(!user)return;const refresh=()=>api('/api/notifications').then((items:PlatformNotification[])=>{const newest=items.find(item=>!item.readAt&&!knownNotifications.current.has(item.id));items.forEach(item=>knownNotifications.current.add(item.id));if(newest){if(document.hidden&&typeof Notification!=='undefined'&&Notification.permission==='granted')new Notification(newest.title,{body:newest.body,icon:'/favicon.ico'});if(document.hidden&&soundOn&&'AudioContext'in window){try{const context=new AudioContext();const oscillator=context.createOscillator();const gain=context.createGain();oscillator.connect(gain);gain.connect(context.destination);gain.gain.value=.035;oscillator.frequency.value=740;oscillator.start();oscillator.stop(context.currentTime+.12);oscillator.onended=()=>context.close()}catch(error){console.error('Could not play notification sound:',error)}}}setNotifications(items)}).catch((error:Error)=>setLoadError(error.message));const timer=window.setInterval(refresh,12000);return()=>window.clearInterval(timer)},[user,soundOn]);
  useEffect(()=>{if(!image){setImagePreview('');return}const url=URL.createObjectURL(image);setImagePreview(url);return()=>URL.revokeObjectURL(url)},[image]);
  useEffect(()=>{if(messagesRef.current)messagesRef.current.scrollTop=messagesRef.current.scrollHeight},[messages,selected]);
  useEffect(()=>{const observer=new MutationObserver(()=>setTheme(document.documentElement.dataset.theme==='light'?'light':'dark'));observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});return()=>observer.disconnect()},[]);
  const enableNotifications=async()=>{setPushNotice('');const secure=window.isSecureContext||location.hostname==='localhost';const ua=navigator.userAgent;const ios=/iPad|iPhone|iPod/.test(ua);const standalone=window.matchMedia('(display-mode: standalone)').matches||Boolean((navigator as Navigator&{standalone?:boolean}).standalone);if(!secure||!('serviceWorker'in navigator)||!('PushManager'in window)||typeof Notification==='undefined'||(ios&&!standalone)){setPushNotice(ios&&!standalone?'Browser push is available on supported iPhones and iPads when ZERA HUB is installed to the Home Screen. In-app notifications will continue to work.':'Browser or device push notifications are unavailable in this environment. In-app notifications will continue to work.');return}try{const key=await api('/api/push/public-key') as PushPublicKeyResponse;if(!key.publicKey){setPushNotice('Device push is not configured on this server. In-app notifications remain available.');return}let permission=Notification.permission;if(permission==='default')permission=await Notification.requestPermission();if(permission!=='granted'){setPushNotice(permission==='denied'?'Browser notifications are blocked in your browser settings. In-app notifications remain available.':'Notification permission was not granted. In-app notifications remain available.');return}const registration=await navigator.serviceWorker.register('/service-worker.js');const existing=await registration.pushManager.getSubscription();const subscription=existing||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decodeVapidKey(key.publicKey)});await api('/api/push/subscribe',{method:'POST',body:JSON.stringify({subscription})});setPushNotice('Browser notifications are enabled on this device.')}catch(error){console.error('Could not enable browser notifications:',error);setPushNotice('Browser push could not be enabled in this environment. In-app notifications remain available.')}}
  const send=async()=>{if(!selected||(!body.trim()&&!image))return;try{const outgoing:ChatMessage[]=[];if(image){if(!['image/jpeg','image/png','image/gif','image/webp','image/avif'].includes(image.type)||image.size>2*1024*1024)throw new Error('Choose a supported image smaller than 2 MB.');const form=new FormData();form.append('image',image);outgoing.push(await apiUpload<ChatMessage>(`/api/messages/${selected.id}/image`,form))}if(body.trim())outgoing.push(await apiTyped<ChatMessage>('/api/messages',{method:'POST',body:JSON.stringify({toUserId:selected.id,body})}));setMessages(current=>[...current,...outgoing]);setBody('');setImage(null)}catch(error){setLoadError(error instanceof Error?error.message:'Message could not be sent.')}}
  const saveWallpaper=async(value:string)=>{setWallpaper(value);try{await api('/api/platform/profile/preferences',{method:'PATCH',body:JSON.stringify({chatWallpaper:value})})}catch(error){setLoadError(error instanceof Error?error.message:'Wallpaper preference could not be saved.')}}
  const uploadWallpaper=async(file:File)=>{if(!['image/jpeg','image/png','image/gif','image/webp','image/avif'].includes(file.type)||file.size>2*1024*1024){setLoadError('Choose a supported wallpaper image smaller than 2 MB.');return}try{const form=new FormData();form.append('image',file);const result=await apiUpload<{chatWallpaper:string;chatWallpaperImage:string}>('/api/profile/chat-wallpaper',form);setWallpaper(result.chatWallpaper);setWallpaperImage(result.chatWallpaperImage);setLoadError('')}catch(error){setLoadError(error instanceof Error?error.message:'Wallpaper upload failed.')}}
  const changeSound=async(enabled:boolean)=>{setSoundOn(enabled);localStorage.setItem('zera_notification_sound',enabled?'on':'off');try{await api('/api/platform/profile/preferences',{method:'PATCH',body:JSON.stringify({notificationSound:enabled})})}catch(error){console.error('Could not save notification sound preference:',error)}}
  const markNotificationsRead=async()=>{try{await api('/api/notifications/read',{method:'PATCH',body:'{}'});setNotifications(items=>items.map(item=>({...item,readAt:item.readAt||new Date().toISOString()})))}catch(error){setLoadError(error instanceof Error?error.message:'Notifications could not be marked read.')}}
  const visibleUsers=users.filter(account=>`${account.name} ${account.username}`.toLowerCase().includes(search.toLowerCase()));
  const unreadFor=(accountId:string)=>notifications.filter(item=>!item.readAt&&item.type==='message'&&item.data?.fromUserId===accountId).length;
  const wallpaperStyle=wallpaper==='custom'&&wallpaperImage?{backgroundImage:`linear-gradient(rgba(8,13,23,.78),rgba(8,13,23,.78)),url("${wallpaperImage.startsWith('http')?wallpaperImage:`${API}${wallpaperImage}`}")`}:undefined;
  if(!user)return <main className="chat-signin"><MessageCircle size={38}/><h1>Sign in to your conversations</h1><p>Your private chats are available after signing in and connecting with another member.</p><NavLink className="btn btn-primary" to="/">Back to ZERA HUB</NavLink></main>;
  return <><main className={`chat-fullscreen wallpaper-${wallpaper}${selected?' mobile-chat-open':''}`}>
    <header className="chat-topbar"><NavLink className="chat-brand" to="/app"><BrandMark site={null}/><b>ZERA HUB <span>MESSAGES</span></b></NavLink><div className="chat-top-actions"><NavLink to="/notifications" className="chat-top-link"><Bell size={17}/> Notifications {notifications.some(item=>!item.readAt)&&<i/>}</NavLink><NavLink to="/app" className="chat-top-link"><ChevronLeft size={17}/> Hub</NavLink></div></header>
    <div className="chat-workspace"><aside className="chat-conversations"><div className="chat-list-heading"><div><span>YOUR NETWORK</span><h1>Messages</h1></div><button className="chat-settings-button" onClick={()=>setSettingsOpen(value=>!value)} aria-expanded={settingsOpen} title="Chat settings"><Settings size={18}/></button></div><label className="conversation-search"><Search size={16}/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search conversations"/></label>{settingsOpen&&<section className="chat-settings chat-settings-sidebar"><h2>Chat settings</h2><p>Choose a wallpaper, adjust your sounds, or enable supported device notifications.</p></section>}<div className="conversation-list">{visibleUsers.map(account=>{const count=unreadFor(account.id);return <button className={`conversation-item ${selected?.id===account.id?'selected':''}`} onClick={()=>{setSelected(account);setSettingsOpen(false)}} key={account.id}><UserAvatar user={account}/><span className="conversation-copy"><b>{account.name}{account.verified&&<VerificationBadge/>}</b><small>{formatLastSeen(account)}</small></span>{count>0&&<i className="conversation-unread">{count}</i>}</button>})}{!users.length&&<div className="chat-list-empty"><Users size={22}/><b>No conversations yet</b><span>Only accepted connections appear here.</span><NavLink to="/developers">Discover developers</NavLink></div>}{users.length>0&&!visibleUsers.length&&<p className="chat-list-empty">No conversations match that search.</p>}</div></aside>
      <section className="chat-conversation" style={wallpaperStyle}>{selected?<><header className="active-chat-header"><button className="chat-back-button" onClick={()=>setSelected(null)}><ChevronLeft size={20}/></button><UserAvatar user={selected}/><div className="active-chat-person"><h2>{selected.name}{selected.verified&&<VerificationBadge/>}</h2><span><i className={`platform-presence-dot ${selected.online?'online':''}`}/>{formatLastSeen(selected)}</span></div><Link to={`/developers/${encodeURIComponent(selected.id)}`} className="view-chat-profile">View profile <ArrowUpRight size={15}/></Link><button className="chat-settings-button active-settings" onClick={()=>setSettingsOpen(value=>!value)} title="Chat settings"><Settings size={18}/></button></header>{loadError&&<p className="chat-inline-error" role="alert">{loadError}</p>}<div className="chat-message-history" ref={messagesRef}>{messages.length?messages.map(message=><div className={`chat-message-row ${message.fromUserId===user.id?'outgoing':''}`} key={message.id}>{message.fromUserId!==user.id&&<UserAvatar user={selected} className="message-avatar"/>}<article className="chat-message-bubble">{message.body&&<p>{message.body}</p>}{message.imageUrl&&<img className="chat-image" src={message.imageUrl.startsWith('http')?message.imageUrl:`${API}${message.imageUrl}`} alt="Shared in chat"/>}<footer><time>{new Date(message.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</time>{message.fromUserId===user.id&&<span>{message.readAt?'Read':message.deliveredAt?'Delivered':'Sent'}</span>}</footer></article></div>):<div className="chat-empty"><MessageCircle size={34}/><h3>Start the conversation</h3><p>Say hello to {selected.name} and start building something together.</p></div>}</div>{imagePreview&&<div className="chat-image-preview"><img src={imagePreview} alt="Selected image preview"/><button onClick={()=>setImage(null)} aria-label="Remove image"><X size={15}/></button></div>}<form className="chat-composer" onSubmit={event=>{event.preventDefault();void send()}}><input value={body} onChange={event=>setBody(event.target.value)} placeholder="Write a message…" aria-label="Message"/><input ref={imageRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/avif" hidden onChange={event=>setImage(event.target.files?.[0]||null)}/><button type="button" className="chat-attach-button" onClick={()=>imageRef.current?.click()} aria-label="Attach image"><ImagePlus size={19}/></button><button type="submit" className="chat-send-button" disabled={!body.trim()&&!image} aria-label="Send message"><Send size={18}/></button></form></>:<div className="chat-welcome"><MessageCircle size={42}/><h2>Your conversations, in one place.</h2><p>Select an accepted connection to open a private conversation. Chat is available only after a request is accepted.</p>{!users.length&&<NavLink to="/developers" className="btn btn-primary">Discover developers <ArrowUpRight size={15}/></NavLink>}</div>}</section></div>
  </main>{settingsOpen&&<section className="chat-settings-overlay"><header><h2>Chat settings</h2><button onClick={()=>setSettingsOpen(false)} aria-label="Close chat settings"><X size={16}/></button></header><label>Conversation background<select value={wallpaper} onChange={event=>void saveWallpaper(event.target.value)}><option value="dark-grid">Dark grid</option><option value="deep-space">Deep space</option><option value="circuit">Circuit board</option><option value="aurora">Aurora</option><option value="light-grid">Light grid</option><option value="light-circuit">Light circuit</option><option value="solid-white">White</option><option value="solid-midnight">Solid midnight</option><option value="solid-slate">Solid slate</option><option value="gradient-violet">Violet gradient</option><option value="gradient-ocean">Ocean gradient</option><option value="custom">Custom image</option></select></label><button className="chat-upload-wallpaper" onClick={()=>wallpaperRef.current?.click()}><Upload size={14}/> Upload custom background</button><input ref={wallpaperRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/avif" hidden onChange={event=>{const file=event.target.files?.[0];if(file)void uploadWallpaper(file);event.target.value=''}}/><label className="chat-sound-setting"><input type="checkbox" checked={soundOn} onChange={event=>void changeSound(event.target.checked)}/> Notification sound</label><button className="chat-push-setting" onClick={()=>void enableNotifications()}><Bell size={14}/> Enable device notifications</button>{pushNotice&&<p role="status">{pushNotice}</p>}{loadError&&<p className="settings-error" role="alert">{loadError}</p>}{selected&&<Link to={`/developers/${encodeURIComponent(selected.id)}`} className="chat-push-setting">View profile <ArrowUpRight size={14}/></Link>}</section>}</>
}
function LegacyMessages({user}:{user:User|null}){
  const [users,setUsers]=useState<User[]>([]);
  const [selected,setSelected]=useState<User|null>(null);
  const [messages,setMessages]=useState<ChatMessage[]>([]);
  const [body,setBody]=useState('');
  const [loadError,setLoadError]=useState('');
  const [notifications,setNotifications]=useState<PlatformNotification[]>([]);
  const [wallpaper,setWallpaper]=useState('dark-grid');
  const [image,setImage]=useState<File|null>(null);
  const [imagePreview,setImagePreview]=useState('');
  const imageRef=useRef<HTMLInputElement>(null);
  const lastNotification=useRef('');
  useEffect(()=>{if(!user)return;let alive=true;Promise.all([api('/api/platform/connections'),api('/api/notifications'),api('/api/platform/profile/preferences')]).then(([result,items,prefs]:[ConnectionListResponse,PlatformNotification[],ChatPreferencesResponse])=>{if(!alive)return;const connected=result.connections.filter(entry=>entry.status==='accepted').map(entry=>entry.user).filter(account=>account.id!==user.id);setUsers(connected);setNotifications(items);setWallpaper(prefs.chatWallpaper||'dark-grid');const queryUser=new URLSearchParams(window.location.search).get('user');if(queryUser){const target=connected.find(account=>account.id===queryUser);if(target)setSelected(target)}}).catch((error:Error)=>setLoadError(error.message));const presence=()=>api('/api/presence',{method:'POST'}).catch(()=>{});presence();const timer=window.setInterval(presence,45000);return()=>{alive=false;window.clearInterval(timer)}},[user]);
  useEffect(()=>{if(!selected)return;let active=true;const refresh=()=>api(`/api/messages/${selected.id}`).then((items:ChatMessage[])=>{if(active)setMessages(items)}).catch((error:Error)=>setLoadError(error.message));refresh();const timer=window.setInterval(refresh,4000);return()=>{active=false;window.clearInterval(timer)}},[selected]);
  useEffect(()=>{if(!user)return;const refresh=()=>api('/api/notifications').then((items:PlatformNotification[])=>{const newest=items.find(item=>!item.readAt);if(newest&&newest.id!==lastNotification.current){lastNotification.current=newest.id;if(document.hidden&&typeof Notification!=='undefined'&&Notification.permission==='granted')new Notification(newest.title,{body:newest.body,icon:'/favicon.ico'});if(document.hidden&&localStorage.getItem('zera_notification_sound')==='on'&&'AudioContext'in window){try{const audio=new AudioContext();const oscillator=audio.createOscillator();const gain=audio.createGain();oscillator.connect(gain);gain.connect(audio.destination);gain.gain.value=.035;oscillator.frequency.value=740;oscillator.start();oscillator.stop(audio.currentTime+.12);oscillator.onended=()=>audio.close()}catch(error){console.error('Could not play notification sound',error)}}}setNotifications(items)}).catch((error:Error)=>setLoadError(error.message));const timer=window.setInterval(refresh,12000);return()=>window.clearInterval(timer)},[user]);
  useEffect(()=>{if(!image){setImagePreview('');return}const url=URL.createObjectURL(image);setImagePreview(url);return()=>URL.revokeObjectURL(url)},[image]);
  const enableNotifications=async()=>{try{if(!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window))throw new Error('Push notifications are not supported in this browser.');const permission=await Notification.requestPermission();if(permission!=='granted')throw new Error('Notification permission was not granted.');const keyResult:PushPublicKeyResponse=await api('/api/push/public-key');if(!keyResult.publicKey)throw new Error('Browser push is not configured on this server.');const registration=await navigator.serviceWorker.register('/service-worker.js');const subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decodeVapidKey(keyResult.publicKey)});await api('/api/push/subscribe',{method:'POST',body:JSON.stringify({subscription})});setLoadError('Push notifications enabled.')}catch(error){setLoadError(error instanceof Error?error.message:'Could not enable notifications.')}}
  const send=async()=>{if(!selected||(!body.trim()&&!image))return;try{const newMessages:ChatMessage[]=[];if(image){if(!image.type.startsWith('image/')||image.size>2*1024*1024)throw new Error('Choose an image smaller than 2 MB.');const form=new FormData();form.append('image',image);newMessages.push(await apiUpload<ChatMessage>(`/api/messages/${selected.id}/image`,form))}if(body.trim()){const sentMessage:ChatMessage=await api('/api/messages',{method:'POST',body:JSON.stringify({toUserId:selected.id,body})});newMessages.push(sentMessage)}setMessages(items=>[...items,...newMessages]);setBody('');setImage(null)}catch(error){setLoadError(error instanceof Error?error.message:'Message could not be sent.')}}
  const saveWallpaper=async(value:string)=>{setWallpaper(value);try{await api('/api/platform/profile/preferences',{method:'PATCH',body:JSON.stringify({chatWallpaper:value})})}catch(error){setLoadError(error instanceof Error?error.message:'Wallpaper preference could not be saved.')}}
  const markNotificationsRead=async()=>{try{await api('/api/notifications/read',{method:'PATCH',body:'{}'});setNotifications(items=>items.map(item=>({...item,readAt:item.readAt||new Date().toISOString()})))}catch(error){setLoadError(error instanceof Error?error.message:'Notifications could not be marked read.')}}
  if(!user)return <Page eyebrow="Private conversations" title="Sign in to message." caption="Your conversations are private to your account." icon={MessageCircle}><EmptyState title="No session" text="Sign in or create a ZERA HUB account to start chatting."/></Page>;
  return <Page eyebrow="Private conversations" title="Talk to the people building with you." caption="Private conversations are available only after a connection is accepted." icon={MessageCircle}><div className={`messenger wallpaper-${wallpaper}`}>
    <aside className="conversation-sidebar"><div className="conversation-sidebar-head"><h2>Messages</h2><button className="icon-btn notification-enable" onClick={enableNotifications} title="Enable browser notifications"><Bell size={17}/><i>{notifications.filter(item=>!item.readAt).length||''}</i></button></div><div className="notification-panel"><div className="notification-heading"><b>Notifications</b><button onClick={markNotificationsRead}>Mark read</button></div>{notifications.length?notifications.slice(0,4).map(item=><div className={`notification-item ${item.readAt?'read':'unread'}`} key={item.id}>{item.actor&&<UserAvatar user={item.actor}/>}<span className="notification-copy"><b>{item.title}{item.actor?.verified&&<VerificationBadge/>}</b><span>{item.body}</span></span></div>):<p className="chat-empty-small">You’re all caught up.</p>}</div>
      {users.map(account=><button className={`conversation-item ${selected?.id===account.id?'selected':''}`} onClick={()=>setSelected(account)} key={account.id}><UserAvatar user={account}/><span><b>{account.name}{account.verified&&<VerificationBadge/>}</b><small>{formatLastSeen(account)}</small></span></button>)}
      {!users.length&&<div className="chat-empty-small"><Users size={20}/><b>No conversations yet</b><span>Accepted connections appear here.</span></div>}
      <div className="wallpaper-control"><label htmlFor="chat-wallpaper">Chat wallpaper</label><select id="chat-wallpaper" value={wallpaper} onChange={event=>saveWallpaper(event.target.value)}><option value="dark-grid">Dark grid</option><option value="deep-space">Deep space</option><option value="circuit">Circuit</option><option value="aurora">Aurora</option><option value="light-grid">Light grid</option><option value="light-circuit">Light circuit</option></select><label className="sound-toggle"><input type="checkbox" checked={localStorage.getItem('zera_notification_sound')==='on'} onChange={event=>localStorage.setItem('zera_notification_sound',event.target.checked?'on':'off')}/> Notification sound</label></div>
    </aside><section className="chat-panel">{loadError&&<p className="platform-error" role="status">{loadError}</p>}{selected?<><header className="chat-title"><UserAvatar user={selected}/><span><b>{selected.name}{selected.verified&&<VerificationBadge/>}</b><small>{formatLastSeen(selected)}</small></span></header><div className="messages">{messages.map(message=><div key={message.id} className={`msg ${message.fromUserId===user.id?'mine':''}`}>{message.body&&<p>{message.body}</p>}{message.imageUrl&&<img className="chat-image" src={message.imageUrl.startsWith('http')?message.imageUrl:`${API}${message.imageUrl}`} alt="Shared in chat"/>}<footer><time>{new Date(message.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</time>{message.fromUserId===user.id&&<span>{message.readAt?'Read':message.deliveredAt?'Delivered':'Sent'}</span>}</footer></div>)}</div>{imagePreview&&<div className="image-preview"><img src={imagePreview} alt="Preview"/><button onClick={()=>setImage(null)} aria-label="Remove image"><X size={14}/></button></div>}<div className="send-row"><input value={body} onChange={event=>setBody(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void send()}}} placeholder="Write a message…"/><input ref={imageRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/avif" hidden onChange={event=>setImage(event.target.files?.[0]||null)}/><button className="icon-btn" onClick={()=>imageRef.current?.click()} title="Attach image"><ImagePlus size={18}/></button><button className="send-message" onClick={()=>void send()} disabled={!body.trim()&&!image}><Send size={17}/></button></div></>:<div className="chat-empty"><MessageCircle size={34}/><h3>{users.length?'Select a conversation':'No conversations yet'}</h3><p>{users.length?'Choose an accepted connection to start chatting.':'Connect with a developer and accept the request before messaging.'}</p><NavLink to="/developers" className="btn btn-ghost">Discover developers <ArrowUpRight size={14}/></NavLink></div>}</section></div></Page>
}
function Profile({user,setUser}:{user:User|null;setUser:(u:User)=>void}){const [name,setName]=useState(user?.name||'');const [bio,setBio]=useState(user?.bio||'');const [skills,setSkills]=useState((user?.skills||[]).join(', '));if(!user)return <Page eyebrow="Profile" title="Create your ZERA identity." caption="Sign in to manage your profile." icon={UserRound}><EmptyState title="Sign in required" text="Create a developer or hire account first."/></Page>;const save=async()=>{try{const u=await api('/api/profile',{method:'PATCH',body:JSON.stringify({name,bio,skills:skills.split(',').map(x=>x.trim()).filter(Boolean)})});setUser(u);localStorage.setItem('zera_user',JSON.stringify(u));alert('Profile saved.')}catch(e:any){alert(e.message)}};return <Page eyebrow="Your identity" title="Build a profile people can trust." caption="Show what you build, what you know and what you are available for." icon={UserRound}><div className="profile-form"><label>Name<input value={name} onChange={e=>setName(e.target.value)}/></label><label>Bio<textarea value={bio} onChange={e=>setBio(e.target.value)}/></label><label>Skills <small>comma separated</small><input value={skills} onChange={e=>setSkills(e.target.value)}/></label><button className="btn btn-primary" onClick={save}>Save profile <CheckCircle2 size={15}/></button></div></Page>}
function AuthModal({type,site,onClose,onSignedIn}:{type:'developer'|'hire'|'signin';site:any;onClose:()=>void;onSignedIn:(u:User)=>void}){const [mode,setMode]=useState(type);const [name,setName]=useState('');const [username,setUsername]=useState('');const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [notice,setNotice]=useState('');const [submitting,setSubmitting]=useState(false);const submittingRef=useRef(false);const navigate=useNavigate();const submit=async(event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();if(submittingRef.current)return;submittingRef.current=true;setSubmitting(true);setNotice('');const formData=new FormData(event.currentTarget);const formName=String(formData.get('name')||'');const formUsername=String(formData.get('username')||'');const formEmail=String(formData.get('email')||'');const formPassword=String(formData.get('password')||'');try{if(mode==='signin'){const d=await api('/api/auth/login',{method:'POST',body:JSON.stringify({email:formEmail,password:formPassword})});localStorage.setItem('zera_token',d.token);localStorage.setItem('zera_user',JSON.stringify(d.user));onSignedIn(d.user);if(window.location.pathname==='/'){navigate('/app')}}else{await api('/api/auth/signup',{method:'POST',body:JSON.stringify({name:formName,username:formUsername,email:formEmail,password:formPassword,accountType:mode})});setMode('signin');setName('');setUsername('');setPassword('');setNotice('Account created successfully. Please sign in.')}}catch(e:any){alert(e.message)}finally{submittingRef.current=false;setSubmitting(false)}};return <div className="modal-backdrop" onClick={onClose}><div className="modal glass" onClick={e=>e.stopPropagation()}><button type="button" className="modal-close" onClick={onClose}><X/></button><div className="modal-brand"><LogoMark site={site}/></div><div className="modal-icon">{mode==='hire'?<BriefcaseBusiness/>:<Code2/>}</div><span className="eyebrow">{mode==='signin'?'Welcome back':'Join ZERA HUB'}</span><h2>{mode==='signin'?'Sign in to your workspace':mode==='hire'?'Sign up to Hire':'Sign up as a Developer'}</h2><p>{mode==='signin'?'Continue to messages, community, profile and ZERA AI.':'Create your identity and start connecting inside the ecosystem.'}</p>{notice&&<p className="auth-notice" role="status">{notice}</p>}<form onSubmit={submit} onKeyDown={event=>{if(event.key==='Enter'&&event.target instanceof HTMLInputElement){event.preventDefault();event.currentTarget.requestSubmit()}}}><div className="auth-fields">{mode!=='signin'&&<><input className="modal-input" name="name" autoComplete="name" placeholder="Full name" value={name} onChange={e=>setName(e.target.value)} required/><input className="modal-input" name="username" autoComplete="username" placeholder="Username" value={username} onChange={e=>setUsername(e.target.value)} required/></>}<input className="modal-input" type="email" name="email" autoComplete="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} required/><input className="modal-input" type="password" name="password" autoComplete={mode==='signin'?'current-password':'new-password'} placeholder="Password (8+ characters)" value={password} onChange={e=>setPassword(e.target.value)} minLength={mode==='signin'?undefined:8} required/></div><button className="btn btn-primary modal-submit" type="submit" disabled={submitting}>{submitting?(mode==='signin'?'Signing in…':'Creating account…'):(mode==='signin'?'Sign in':'Sign up')} <ArrowRight size={15}/></button></form><button type="button" className="switch-mode" onClick={()=>{setMode(mode==='signin'?'developer':'signin');setNotice('')}}>{mode==='signin'?'Don’t have an account? Sign Up':'Already have an account? Sign In'}</button></div></div>}
function EmptyState({title,text,action,onClick}:{title:string;text:string;action?:string;onClick?:()=>void}){return <div className="empty-state"><Sparkles/><h3>{title}</h3><p>{text}</p>{action&&<button className="btn btn-primary" onClick={onClick}>{action}<ArrowRight size={15}/></button>}</div>}
function NotFound(){return <Page eyebrow="404" title="That page does not exist." caption="Use the navigation to return to the ZERA HUB ecosystem." icon={AlertTriangle}><NavLink className="btn btn-primary" to="/">Back home <ArrowRight size={15}/></NavLink></Page>}
function Admin(){const [email,setEmail]=useState('zerahub@outlook.com');const [password,setPassword]=useState('');const [token,setToken]=useState(localStorage.getItem('zera_admin')||'');const [data,setData]=useState<any>(null);const [status,setStatus]=useState('');const login=async()=>{try{const d=await api('/api/admin/login',{method:'POST',body:JSON.stringify({email,password})});localStorage.setItem('zera_admin',d.token);setToken(d.token)}catch(e:any){alert(e.message)}};useEffect(()=>{if(token){localStorage.setItem('zera_token',token);api('/api/admin/overview').then(setData).catch(()=>{localStorage.removeItem('zera_admin');setToken('')})}},[token]);const act=async(id:string,s:string)=>{await api(`/api/admin/users/${id}`,{method:'PATCH',body:JSON.stringify({status:s})});setData(await api('/api/admin/overview'))};const saveConfig=async()=>{await api('/api/admin/site-config',{method:'PATCH',body:JSON.stringify({brandName:data.siteConfig.brandName,tagline:data.siteConfig.tagline,logoUrl:data.siteConfig.logoUrl,contactEmail:data.siteConfig.contactEmail})});setStatus('Saved');setData(await api('/api/admin/overview'))};if(!token)return <Page eyebrow="Private administration" title="ZERA HUB Admin" caption="The admin area is not linked in the public navigation. It is protected server-side and should use a strong password plus MFA when deployed." icon={Settings}><div className="admin-login"><input className="modal-input" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Admin email"/><input className="modal-input" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Admin password"/><button className="btn btn-primary" onClick={login}>Enter admin <ShieldCheck size={15}/></button></div></Page>;return <Page eyebrow="Private administration" title="ZERA HUB Control Center" caption="Manage users, moderation signals, reports and public brand configuration from one protected area." icon={Settings}><div className="admin-stats">{Object.entries(data.stats).map(([k,v])=><div key={k}><BarChart3/><b>{String(v)}</b><span>{k}</span></div>)}</div><div className="admin-grid"><section className="admin-panel"><div className="panel-head"><h3>Users</h3><RefreshCw onClick={()=>api('/api/admin/overview').then(setData)}/></div>{data.users.map((u:User)=><div className="admin-row" key={u.id}><div><b>{u.name}</b><span>@{u.username} · {u.accountType}</span></div><div className="row-actions"><span className={`status ${u.status}`}>{u.status}</span>{u.status==='active'?<button onClick={()=>act(u.id,'suspended')}><Ban size={14}/> Suspend</button>:<button onClick={()=>act(u.id,'active')}><CheckCircle2 size={14}/> Activate</button>}</div></div>)}</section><section className="admin-panel"><h3>Brand configuration</h3><label>Brand name<input value={data.siteConfig.brandName} onChange={e=>setData({...data,siteConfig:{...data.siteConfig,brandName:e.target.value}})}/></label><label>Tagline<input value={data.siteConfig.tagline} onChange={e=>setData({...data,siteConfig:{...data.siteConfig,tagline:e.target.value}})}/></label><label>Logo URL<input value={data.siteConfig.logoUrl} onChange={e=>setData({...data,siteConfig:{...data.siteConfig,logoUrl:e.target.value}})}/></label><label>Contact email<input value={data.siteConfig.contactEmail} onChange={e=>setData({...data,siteConfig:{...data.siteConfig,contactEmail:e.target.value}})}/></label><button className="btn btn-primary" onClick={saveConfig}>Save changes <Upload size={15}/></button>{status&&<small>{status}</small>}</section></div><section className="admin-panel"><h3>Open reports & moderation</h3>{data.reports.length===0?<p className="muted">No reports yet.</p>:data.reports.map((r:any)=><div className="admin-row" key={r.id}><div><b>{r.reason}</b><span>{r.details||'No details'} · {r.status}</span></div><span className="status open">{r.status}</span></div>)}</section></Page>}
function Footer({site}:{site:any}){return <footer className="footer"><div className="container footer-grid"><div><Brand site={site}/><p className="footer-copy">ZERA HUB — Grow Ideas. Build Tomorrow. A developer-first ecosystem for connection, learning, collaboration, opportunity and intelligent building.</p><div className="social-icons"><a href={social.facebook} target="_blank" rel="noreferrer" aria-label="Facebook"><Facebook/></a><a href={social.instagram} target="_blank" rel="noreferrer" aria-label="Instagram"><Instagram/></a><a href={social.x} target="_blank" rel="noreferrer" aria-label="X"><Twitter/></a></div></div><div><h4>Explore</h4>{nav.slice(1,6).map(([to,label])=><NavLink key={to} to={to}>{label}</NavLink>)}</div><div><h4>Platform</h4><NavLink to="/ai">ZERA AI</NavLink><NavLink to="/messages">Messages</NavLink><NavLink to="/jobs">Jobs</NavLink><NavLink to="/contact">Contact</NavLink></div></div><div className="container footer-bottom"><span>© {new Date().getFullYear()} ZERA HUB</span><span>Built for people who build technology.</span></div></footer>}

window.addEventListener('open-zera-ai',()=>{});
createRoot(document.getElementById('root')!).render(<BrowserRouter><App/></BrowserRouter>);
