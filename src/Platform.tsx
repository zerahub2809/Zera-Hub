import { FormEvent, useEffect, useLayoutEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, BriefcaseBusiness, Check, ExternalLink, Flag, MapPin, Plus, Search, Send, Upload, X } from 'lucide-react';
import './platform.css';

const API = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? 'https://zera-hub-api.onrender.com' : 'http://localhost:4000');
const experienceLevels = ['Entry', 'Intermediate', 'Senior', 'Lead'];
const employmentTypes = ['Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship', 'Temporary'];
const workModes = ['Remote', 'On-site', 'Hybrid'];
const applicationStatuses = ['Applied', 'Reviewing', 'Shortlisted', 'Interview', 'Accepted', 'Rejected'];

type Account = { id: string; name: string; username: string; accountType: string; avatar?: string; bio?: string; skills?: string[]; verified?: boolean; online?: boolean; lastSeenAt?: string | null };
type Project = { name: string; description: string; url: string; role: string };
type Education = { institution: string; qualification: string; fieldOfStudy: string; startDate: string; endDate: string; description: string };
type Certification = { name: string; issuer: string; issuedAt: string; credentialUrl: string };
type ProfileData = {
  id?: string; name: string; username: string; avatar: string; headline: string; bio: string; location: string; country: string;
  verified?: boolean; verificationRequestAt?: string | null; online?: boolean; lastSeenAt?: string | null;
  skills: string[]; languages: string[]; frameworks: string[]; tools: string[]; experienceLevel: string;
  yearsExperience: number | null; education: Education[]; certifications: Certification[]; projects: Project[];
  githubUrl: string; linkedinUrl: string; websiteUrl: string; availability: string; workPreference: string;
};
type ConnectionStatus = 'pending' | 'accepted' | 'rejected';
type ConnectionEntry = {
  id: string;
  user: ProfileData;
  status: ConnectionStatus;
  direction: 'incoming' | 'outgoing' | 'connected';
};
type Job = {
  id: string; title: string; organization: string; description: string; requiredSkills: string[]; experienceLevel: string;
  employmentType: string; workMode: string; location: string; salary: { min: number | null; max: number | null; currency: string; period: string };
  deadline: string; additionalRequirements: string; status: string; createdAt: string; hirer?: Account | null;
};
type Application = { id: string; jobId: string; note: string; status: string; createdAt: string; job?: Job; applicant?: ProfileData | null };

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const token = localStorage.getItem('zera_token');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API}/api/platform${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data as T;
}

async function submitReport(targetType: string, targetId: string, reason: string) {
  const token = localStorage.getItem('zera_token');
  const response = await fetch(`${API}/api/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ targetType, targetId, reason }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Could not submit this report.');
}

function PlatformPage({ eyebrow, title, caption, children }: { eyebrow: string; title: string; caption: string; children: React.ReactNode }) {
  useEffect(() => {
    document.title = `${title} · ZERA HUB`;
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (description) description.content = caption;
  }, [title, caption]);
  return <main className="page platform-page"><div className="container page-inner"><div className="platform-heading"><span className="page-kicker">{eyebrow}</span><h1>{title}</h1><p className="page-caption">{caption}</p></div>{children}</div></main>;
}

function Feedback({ error, loading, empty }: { error: string; loading: boolean; empty?: string }) {
  if (loading) return <div className="platform-feedback" role="status">Loading…</div>;
  if (error) return <div className="platform-feedback platform-error" role="alert">{error}</div>;
  if (empty) return <div className="platform-feedback">{empty}</div>;
  return null;
}

function TextList({ value, onChange, placeholder }: { value: string[]; onChange: (next: string[]) => void; placeholder: string }) {
  return <input value={value.join(', ')} onChange={(event) => onChange(event.target.value.split(',').map((item) => item.trim()).filter(Boolean))} placeholder={placeholder} />;
}

function DeveloperCard({ developer, status, busy, onConnect, onRespond }: {
  developer: ProfileData;
  status?: ConnectionStatus | 'incoming';
  busy: boolean;
  onConnect: () => void;
  onRespond: (status: 'accepted' | 'rejected') => void;
}) {
  return <article className="platform-card developer-result">
    <div className="platform-person">
      <div className="platform-avatar">{developer.avatar ? <img loading="lazy" src={developer.avatar.startsWith('http') ? developer.avatar : `${API}${developer.avatar}`} alt="" /> : developer.name?.slice(0, 1).toUpperCase()}</div>
      <div><h2>{developer.name}{developer.verified && <span className="verification-badge" aria-label="Verified profile"><Check size={11}/></span>}</h2><span>@{developer.username}</span></div>
    </div>
    {developer.headline && <h3>{developer.headline}</h3>}
    <p>{developer.bio || 'Developer building useful digital products.'}</p>
    <div className="platform-meta-row"><span><i className={`platform-presence-dot ${developer.online ? 'online' : ''}`}/>{developer.online ? 'Online' : developer.lastSeenAt ? `Last seen ${new Date(developer.lastSeenAt).toLocaleString()}` : 'Offline'}</span>{developer.experienceLevel && <span>{developer.experienceLevel}</span>}{developer.availability && <span>{developer.availability}</span>}</div>
    {(developer.location || developer.country) && <div className="platform-meta"><MapPin size={14}/>{[developer.location, developer.country].filter(Boolean).join(', ')}</div>}
    <div className="platform-tags">{[...(developer.skills || []), ...(developer.frameworks || [])].slice(0, 7).map((skill) => <span key={skill}>{skill}</span>)}</div>
    <div className="platform-card-actions"><Link className="btn btn-ghost" to={`/developers/${encodeURIComponent(developer.id || '')}`}>View profile <ArrowUpRight size={15}/></Link>
      {status === 'incoming'
        ? <><button className="btn btn-primary" onClick={() => onRespond('accepted')} disabled={busy}>Accept</button><button className="btn btn-ghost" onClick={() => onRespond('rejected')} disabled={busy}>Reject</button></>
        : status === 'accepted'
          ? <><span className="btn btn-ghost">Connected <Check size={15}/></span><Link className="btn btn-primary" to={`/messages?user=${encodeURIComponent(developer.id || '')}`}>Message <Send size={14}/></Link></>
          : status === 'pending'
            ? <button className="btn btn-ghost" disabled>Pending</button>
            : <button className="btn btn-primary" onClick={onConnect} disabled={busy}>Connect <Plus size={15}/></button>}
    </div>
  </article>;
}

export function DeveloperDirectory({ user, onAuth }: { user: Account | null; onAuth: (mode: 'developer' | 'hire' | 'signin') => void }) {
  const { '*': routePart } = useParams();
  const profileId = routePart?.split('/')[0] || '';
  const [developers, setDevelopers] = useState<ProfileData[]>([]);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [filters, setFilters] = useState({ search: '', skill: '', technology: '', experience: '', location: '', availability: '' });
  const [connectionStatuses, setConnectionStatuses] = useState<Record<string, ConnectionEntry>>({});
  const [incomingRequests, setIncomingRequests] = useState<ConnectionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  useLayoutEffect(() => {
    if (profileId) window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [profileId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    if (profileId) {
      setProfile(null);
      request<ProfileData>(`/developers/${encodeURIComponent(profileId)}`)
        .then((result) => { if (active) setProfile(result); })
        .catch((reason: Error) => { if (active) setError(reason.message); })
        .finally(() => { if (active) setLoading(false); });
    } else {
      const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
      request<ProfileData[]>(`/developers${query.size ? `?${query}` : ''}`)
        .then((result) => { if (active) setDevelopers(result); })
        .catch((reason: Error) => { if (active) setError(reason.message); })
        .finally(() => { if (active) setLoading(false); });
    }
    return () => { active = false; };
  }, [filters, profileId]);

  useEffect(() => {
    let active = true;
    if (user) {
      request<{ connections: ConnectionEntry[] }>('/connections')
        .then(({ connections }) => {
          if (!active) return;
          const byUser = Object.fromEntries(connections.map((connection) => [connection.user.id, connection]));
          setConnectionStatuses(byUser);
          setIncomingRequests(connections.filter((connection) => connection.direction === 'incoming'));
        })
        .catch((reason: Error) => { if (active) setError(reason.message); });
    } else {
      setConnectionStatuses({});
      setIncomingRequests([]);
    }
    return () => { active = false; };
  }, [profileId, user]);

  const updateFilter = (key: keyof typeof filters, value: string) => setFilters((current) => ({ ...current, [key]: value }));
  const refreshConnections = async () => {
    if (!user) return;
    const { connections } = await request<{ connections: ConnectionEntry[] }>('/connections');
    setConnectionStatuses(Object.fromEntries(connections.map((connection) => [connection.user.id, connection])));
    setIncomingRequests(connections.filter((connection) => connection.direction === 'incoming'));
  };
  const sendConnectionRequest = async (developerId: string) => {
    if (!user) { onAuth('signin'); return; }
    setActionBusy(true);
    setActionError('');
    try {
      await request(`/connections/${encodeURIComponent(developerId)}`, { method: 'POST' });
      await refreshConnections();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Could not update connection.');
    } finally {
      setActionBusy(false);
    }
  };
  const respondToRequest = async (developerId: string, status: 'accepted' | 'rejected') => {
    setActionBusy(true);
    setActionError('');
    try {
      await request(`/connections/${encodeURIComponent(developerId)}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await refreshConnections();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Could not update connection.');
    } finally {
      setActionBusy(false);
    }
  };
  const reportProfile = async () => {
    if (!user) { onAuth('signin'); return; }
    if (!profile?.id) return;
    const reason = window.prompt('Why are you reporting this developer profile?');
    if (!reason?.trim()) return;
    setActionError('');
    setActionNotice('');
    try {
      await submitReport('profile', profile.id, reason);
      setActionNotice('Report submitted for review.');
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Could not submit this report.'); }
  };

  if (profileId) {
    const profileLinks: Array<[string, string]> = [
      [profile?.githubUrl || '', 'GitHub'],
      [profile?.linkedinUrl || '', 'LinkedIn'],
      [profile?.websiteUrl || '', 'Website'],
    ];
    return <PlatformPage eyebrow="Developer profile" title={profile?.name || 'Developer profile'} caption="A professional profile with skills, work, experience, and ways to connect.">
      <Link className="platform-back" to="/developers"><ArrowLeft size={15}/> All developers</Link>
      <Feedback loading={loading} error={error}/>
      {profile && <section className="platform-profile">
        <div className="platform-profile-hero platform-card">
          <div className="platform-avatar platform-avatar-large">{profile.avatar ? <img loading="lazy" src={profile.avatar.startsWith('http') ? profile.avatar : `${API}${profile.avatar}`} alt="" /> : profile.name?.slice(0, 1).toUpperCase()}</div>
          <div className="platform-profile-title"><span>@{profile.username}</span><h2>{profile.name}{profile.verified && <span className="verification-badge" aria-label="Verified profile"><Check size={11}/></span>}</h2><p>{profile.headline || 'Developer'} · {profile.online ? 'Online' : profile.lastSeenAt ? `Last seen ${new Date(profile.lastSeenAt).toLocaleString()}` : 'Offline'}</p><p>{[profile.location, profile.country].filter(Boolean).join(', ')}</p></div>
          <div className="platform-card-actions">
            {user?.id === profile.id ? <Link to="/profile" className="btn btn-primary">Edit profile</Link> : (() => {
              const connection = connectionStatuses[profile.id || ''];
              if (connection?.direction === 'incoming') return <><button className="btn btn-primary" onClick={() => respondToRequest(profile.id || '', 'accepted')} disabled={actionBusy}>Accept</button><button className="btn btn-ghost" onClick={() => respondToRequest(profile.id || '', 'rejected')} disabled={actionBusy}>Reject</button></>;
              if (connection?.status === 'accepted') return <span className="btn btn-ghost">Connected <Check size={15}/></span>;
              if (connection?.status === 'pending') return <button className="btn btn-ghost" disabled>Pending</button>;
              return <button className="btn btn-primary" onClick={() => sendConnectionRequest(profile.id || '')} disabled={actionBusy}>Connect <Plus size={15}/></button>;
            })()}
            {user?.id !== profile.id && connectionStatuses[profile.id || '']?.status === 'accepted' && <Link className="btn btn-ghost" to={`/messages?user=${encodeURIComponent(profile.id || '')}`}>Message <Send size={14}/></Link>}
            {user?.id !== profile.id && <button className="btn btn-ghost" onClick={reportProfile}><Flag size={14}/> Report profile</button>}
          </div>
        </div>
        {actionError && <p className="platform-error" role="alert">{actionError}</p>}
        {actionNotice && <p className="platform-success" role="status">{actionNotice}</p>}
        <div className="platform-profile-grid">
          <div className="platform-card"><h3>About</h3><p>{profile.bio || 'This developer has not added an about section yet.'}</p><p>{profile.yearsExperience != null ? `${profile.yearsExperience} years of experience` : ''}{profile.experienceLevel ? ` · ${profile.experienceLevel}` : ''}</p></div>
          <div className="platform-card"><h3>Availability</h3><p>{profile.availability || 'Availability not specified'}</p><p>{profile.workPreference || ''}</p></div>
          <div className="platform-card"><h3>Skills & technology</h3><div className="platform-tags">{[...(profile.skills || []), ...(profile.languages || []), ...(profile.frameworks || []), ...(profile.tools || [])].map((item, index) => <span key={`${item}-${index}`}>{item}</span>)}</div></div>
          <div className="platform-card"><h3>Projects</h3>{profile.projects?.length ? profile.projects.map((project, index) => <div className="platform-record" key={`${project.name}-${index}`}><b>{project.name}</b><p>{project.description}</p>{project.role && <small>{project.role}</small>}{project.url && <a href={project.url} target="_blank" rel="noreferrer">View project <ExternalLink size={13}/></a>}</div>) : <p>No projects added yet.</p>}</div>
          <div className="platform-card"><h3>Education</h3>{profile.education?.length ? profile.education.map((item, index) => <div className="platform-record" key={`${item.institution}-${index}`}><b>{item.qualification || item.fieldOfStudy}</b><p>{item.institution}{item.startDate || item.endDate ? ` · ${item.startDate}–${item.endDate}` : ''}</p></div>) : <p>No education listed.</p>}</div>
          <div className="platform-card"><h3>Certifications</h3>{profile.certifications?.length ? profile.certifications.map((item, index) => <div className="platform-record" key={`${item.name}-${index}`}><b>{item.name}</b><p>{item.issuer}{item.issuedAt ? ` · ${item.issuedAt}` : ''}</p></div>) : <p>No certifications listed.</p>}</div>
          <div className="platform-card"><h3>Links</h3><div className="platform-links">{profileLinks.filter(([url]) => url).map(([url, label]) => <a key={label} href={url} target="_blank" rel="noreferrer">{label} <ExternalLink size={13}/></a>)}</div>{!profile.githubUrl && !profile.linkedinUrl && !profile.websiteUrl && <p>No links added.</p>}</div>
        </div>
      </section>}
    </PlatformPage>;
  }

  return <PlatformPage eyebrow="Developer network" title="Find your next collaborator." caption="Discover developers by skills, technologies, experience, location, and availability. Profiles expose professional details—not private account information.">
    <div className="platform-toolbar"><div className="platform-search"><Search size={16}/><input value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} placeholder="Search names, skills, or profiles"/></div><Link className="btn btn-primary" to={user ? '/profile' : '#'} onClick={(event) => { if (!user) { event.preventDefault(); onAuth('developer'); } }}>Build your profile <ArrowUpRight size={15}/></Link></div>
    <div className="platform-filters">
      <label>Skill<input value={filters.skill} onChange={(event) => updateFilter('skill', event.target.value)} placeholder="e.g. TypeScript"/></label>
      <label>Technology<input value={filters.technology} onChange={(event) => updateFilter('technology', event.target.value)} placeholder="Framework or tool"/></label>
      <label>Experience<select value={filters.experience} onChange={(event) => updateFilter('experience', event.target.value)}><option value="">Any level</option>{experienceLevels.map((level) => <option key={level}>{level}</option>)}</select></label>
      <label>Location<input value={filters.location} onChange={(event) => updateFilter('location', event.target.value)} placeholder="City or country"/></label>
      <label>Availability<select value={filters.availability} onChange={(event) => updateFilter('availability', event.target.value)}><option value="">Any</option><option>Available</option><option>Open to opportunities</option><option>Not available</option></select></label>
    </div>
    <Feedback loading={loading} error={error} empty={!developers.some((developer) => developer.id !== user?.id) ? 'No developer profiles match these filters yet.' : undefined}/>
    {user && <section id="connection-requests" className="platform-card platform-connection-requests"><h2>Connection requests</h2>{incomingRequests.length ? incomingRequests.map((connection) => <div className="platform-connection-request" key={connection.id}><span className="platform-request-person"><span className="platform-avatar">{connection.user.avatar ? <img src={connection.user.avatar.startsWith('http') ? connection.user.avatar : `${API}${connection.user.avatar}`} alt=""/> : connection.user.name.slice(0, 1).toUpperCase()}</span><span><b>{connection.user.name}{connection.user.verified && <span className="verification-badge" aria-label="Verified profile"><Check size={11}/></span>}</b><small>@{connection.user.username}</small></span></span><div className="platform-card-actions"><button className="btn btn-primary" onClick={() => respondToRequest(connection.user.id || '', 'accepted')} disabled={actionBusy}>Accept</button><button className="btn btn-ghost" onClick={() => respondToRequest(connection.user.id || '', 'rejected')} disabled={actionBusy}>Reject</button></div></div>) : <p className="platform-hint">No pending connection requests.</p>}</section>}
    {actionError && <p className="platform-error" role="alert">{actionError}</p>}
    <div className="platform-card-grid">{developers.filter((developer) => developer.id !== user?.id).map((developer) => <DeveloperCard key={developer.id} developer={developer} status={connectionStatuses[developer.id || '']?.direction === 'incoming' ? 'incoming' : connectionStatuses[developer.id || '']?.status} busy={actionBusy} onConnect={() => sendConnectionRequest(developer.id || '')} onRespond={(status) => respondToRequest(developer.id || '', status)}/>)}</div>
  </PlatformPage>;
}

const emptyProfile = (): ProfileData => ({
  name: '', username: '', avatar: '', headline: '', bio: '', location: '', country: '', skills: [], languages: [], frameworks: [], tools: [],
  experienceLevel: '', yearsExperience: null, education: [], certifications: [], projects: [], githubUrl: '', linkedinUrl: '',
  websiteUrl: '', availability: '', workPreference: '',
});

export function ProfileEditor({ user, onAuth, onUserUpdated }: { user: Account | null; onAuth: (mode: 'developer' | 'hire' | 'signin') => void; onUserUpdated?: (user: Account) => void }) {
  const [profile, setProfile] = useState<ProfileData>(emptyProfile());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [requestingVerification, setRequestingVerification] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let active = true;
    request<ProfileData & { profile?: Partial<ProfileData> }>('/profile')
      .then((data) => { if (active) setProfile({ ...emptyProfile(), ...data, ...data.profile }); })
      .catch((reason: Error) => { if (active) setError(reason.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user]);
  const setField = <K extends keyof ProfileData>(key: K, value: ProfileData[K]) => setProfile((current) => ({ ...current, [key]: value }));
  const uploadAvatar = async (file: File) => {
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setError('Choose a JPEG, PNG, GIF, WebP, or AVIF image under 2 MB.');
      return;
    }
    setUploadingAvatar(true); setError('');
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const token = localStorage.getItem('zera_token');
      const response = await fetch(`${API}/api/profile/avatar`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: formData });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not upload profile photo.');
      setProfile((current) => ({ ...current, avatar: result.avatar || '' }));
      const updatedUser = { ...user!, avatar: result.avatar || '' };
      localStorage.setItem('zera_user', JSON.stringify(updatedUser));
      onUserUpdated?.(updatedUser);
      setNotice('Profile photo updated.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not upload profile photo.');
    } finally { setUploadingAvatar(false); }
  };
  const requestVerification = async () => {
    setRequestingVerification(true); setError(''); setNotice('');
    try {
      await request('/profile/verification-request', { method: 'POST', body: '{}' });
      setProfile((current) => ({ ...current, verificationRequestAt: new Date().toISOString() }));
      setNotice('Your verification request has been submitted for administrator review.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not request verification.');
    } finally { setRequestingVerification(false); }
  };
  const setRecord = <K extends 'projects' | 'education' | 'certifications'>(key: K, index: number, field: keyof ProfileData[K][number], value: string) => {
    setProfile((current) => ({ ...current, [key]: current[key].map((record, i) => i === index ? { ...record, [field]: value } : record) }));
  };
  const removeRecord = (key: 'projects' | 'education' | 'certifications', index: number) => {
    setProfile((current) => ({ ...current, [key]: current[key].filter((_, i) => i !== index) }));
  };
  const addRecord = (key: 'projects' | 'education' | 'certifications') => {
    const blank = key === 'projects' ? { name: '', description: '', url: '', role: '' } : key === 'education'
      ? { institution: '', qualification: '', fieldOfStudy: '', startDate: '', endDate: '', description: '' }
      : { name: '', issuer: '', issuedAt: '', credentialUrl: '' };
    setProfile((current) => ({ ...current, [key]: [...current[key], blank] }));
  };
  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const saved = await request<ProfileData & { profile?: Partial<ProfileData> }>('/profile', { method: 'PATCH', body: JSON.stringify(profile) });
      setProfile({ ...emptyProfile(), ...saved, ...saved.profile });
      const localUser = { ...user, name: saved.name, username: saved.username, avatar: saved.avatar, bio: saved.bio, skills: saved.skills };
      localStorage.setItem('zera_user', JSON.stringify(localUser));
      onUserUpdated?.(localUser);
      setNotice('Your profile has been saved.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save profile.');
    } finally { setSaving(false); }
  };
  if (!user) return <PlatformPage eyebrow="Your developer profile" title="Sign in to build your profile." caption="Use your existing ZERA HUB account to create and manage your professional profile."><div className="platform-card platform-feedback"><p>Sign in or create an account to continue.</p><button className="btn btn-primary" onClick={() => onAuth('signin')}>Sign in</button></div></PlatformPage>;
  return <PlatformPage eyebrow="Your professional identity" title="Build a profile people can trust." caption="Add the details that help collaborators understand your work. Fields are optional unless clearly needed for your account.">
    <Feedback loading={loading} error={error}/>
    {!loading && !error && <form className="platform-editor platform-card" onSubmit={saveProfile}>
      <div className="platform-form-grid">
        <label>Full name<input value={profile.name} onChange={(event) => setField('name', event.target.value)} required/></label>
        <label>Username<input value={profile.username} onChange={(event) => setField('username', event.target.value)} minLength={3} maxLength={40} required/></label>
        <label>Profile photo URL<input type="url" value={profile.avatar} onChange={(event) => setField('avatar', event.target.value)} placeholder="https://…"/><span className="profile-photo-upload">{profile.avatar && <img src={profile.avatar.startsWith('http') ? profile.avatar : `${API}${profile.avatar}`} alt="Profile preview"/>}<span><Upload size={14}/><input type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/avif" disabled={uploadingAvatar} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAvatar(file); event.target.value = ''; }}/>{uploadingAvatar ? 'Uploading…' : 'Upload profile photo'}</span></span></label>
        <label>Professional headline<input value={profile.headline} onChange={(event) => setField('headline', event.target.value)} placeholder="e.g. Product-focused frontend engineer"/></label>
        <label className="span-2">About<textarea rows={4} value={profile.bio} onChange={(event) => setField('bio', event.target.value)} maxLength={3000}/></label>
        <label>City / region<input value={profile.location} onChange={(event) => setField('location', event.target.value)}/></label>
        <label>Country<input value={profile.country} onChange={(event) => setField('country', event.target.value)}/></label>
        <label>Experience level<select value={profile.experienceLevel} onChange={(event) => setField('experienceLevel', event.target.value)}><option value="">Not specified</option>{experienceLevels.map((level) => <option key={level}>{level}</option>)}</select></label>
        <label>Years of experience<input type="number" min="0" max="80" value={profile.yearsExperience ?? ''} onChange={(event) => setField('yearsExperience', event.target.value === '' ? null : Number(event.target.value))}/></label>
        <label>Skills <small>Separate with commas</small><TextList value={profile.skills} onChange={(value) => setField('skills', value)} placeholder="React, TypeScript"/></label>
        <label>Programming languages<TextList value={profile.languages} onChange={(value) => setField('languages', value)} placeholder="TypeScript, Python"/></label>
        <label>Frameworks<TextList value={profile.frameworks} onChange={(value) => setField('frameworks', value)} placeholder="React, Express"/></label>
        <label>Tools<TextList value={profile.tools} onChange={(value) => setField('tools', value)} placeholder="Git, Docker"/></label>
        <label>Availability<select value={profile.availability} onChange={(event) => setField('availability', event.target.value)}><option value="">Not specified</option><option>Available</option><option>Open to opportunities</option><option>Not available</option></select></label>
        <label>Work preference<select value={profile.workPreference} onChange={(event) => setField('workPreference', event.target.value)}><option value="">Not specified</option>{workModes.map((mode) => <option key={mode}>{mode}</option>)}</select></label>
        <label>GitHub URL<input type="url" value={profile.githubUrl} onChange={(event) => setField('githubUrl', event.target.value)}/></label>
        <label>LinkedIn URL<input type="url" value={profile.linkedinUrl} onChange={(event) => setField('linkedinUrl', event.target.value)}/></label>
        <label className="span-2">Personal website<input type="url" value={profile.websiteUrl} onChange={(event) => setField('websiteUrl', event.target.value)}/></label>
      </div>
      <ProfileRecords title="Portfolio projects" items={profile.projects} onAdd={() => addRecord('projects')} onRemove={(index) => removeRecord('projects', index)} onChange={(index, field, value) => setRecord('projects', index, field as keyof Project, value)} fields={['name', 'description', 'url', 'role']}/>
      <ProfileRecords title="Education" items={profile.education} onAdd={() => addRecord('education')} onRemove={(index) => removeRecord('education', index)} onChange={(index, field, value) => setRecord('education', index, field as keyof Education, value)} fields={['institution', 'qualification', 'fieldOfStudy', 'startDate', 'endDate', 'description']}/>
      <ProfileRecords title="Certifications" items={profile.certifications} onAdd={() => addRecord('certifications')} onRemove={(index) => removeRecord('certifications', index)} onChange={(index, field, value) => setRecord('certifications', index, field as keyof Certification, value)} fields={['name', 'issuer', 'issuedAt', 'credentialUrl']}/>
      <section className="verification-request"><div><b>Profile verification</b><p>{profile.verified ? 'Your profile is verified.' : profile.verificationRequestAt ? 'Your request is awaiting administrator review.' : 'Verification requests are reviewed by a ZERA HUB administrator.'}</p></div>{profile.verified ? <span className="verification-badge"><Check size={11}/></span> : <button type="button" className="btn btn-ghost" onClick={() => void requestVerification()} disabled={requestingVerification || Boolean(profile.verificationRequestAt)}>{requestingVerification ? 'Submitting…' : profile.verificationRequestAt ? 'Pending review' : 'Request verification'}</button>}</section>
      {error && <p className="platform-error" role="alert">{error}</p>}{notice && <p className="platform-success" role="status">{notice}</p>}
      <div className="platform-editor-actions"><button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button><Link className="btn btn-ghost" to={user.accountType === 'developer' ? `/developers/${encodeURIComponent(user.id)}` : '/developers'}>Preview public profile</Link></div>
    </form>}
  </PlatformPage>;
}

function ProfileRecords<T extends object>({ title, items, fields, onAdd, onRemove, onChange }: {
  title: string; items: T[]; fields: Array<Extract<keyof T, string>>; onAdd: () => void; onRemove: (index: number) => void; onChange: (index: number, field: Extract<keyof T, string>, value: string) => void;
}) {
  return <section className="platform-record-editor"><div className="platform-section-title"><h2>{title}</h2><button type="button" className="btn btn-ghost" onClick={onAdd}><Plus size={14}/> Add</button></div>
    {!items.length && <p className="platform-hint">No entries yet. Add one when you are ready.</p>}
    {items.map((item, index) => <div className="platform-record-fields" key={index}><div className="platform-form-grid">{fields.map((field) => <label key={field}>{field.replace(/[A-Z]/g, (letter) => ` ${letter}`).replace(/^./, (letter) => letter.toUpperCase())}{field === 'description' ? <textarea rows={2} value={String(item[field] ?? '')} onChange={(event) => onChange(index, field, event.target.value)}/> : <input value={String(item[field] ?? '')} onChange={(event) => onChange(index, field, event.target.value)}/>}</label>)}</div><button type="button" className="platform-remove" onClick={() => onRemove(index)} aria-label={`Remove ${title.toLowerCase()} entry`}><X size={15}/></button></div>)}
  </section>;
}

const blankJob = () => ({
  title: '', organization: '', description: '', requiredSkills: [] as string[], experienceLevel: 'Intermediate', employmentType: 'Full-time',
  workMode: 'Remote', location: '', salary: { min: '', max: '', currency: '', period: 'year' }, deadline: '', additionalRequirements: '',
});

export function Marketplace({ user, onAuth }: { user: Account | null; onAuth: (mode: 'developer' | 'hire' | 'signin') => void }) {
  const { '*': routePart } = useParams();
  const navigate = useNavigate();
  const parts = (routePart || '').split('/').filter(Boolean);
  const view = parts[0] === 'mine' || parts[0] === 'applications' ? parts[0] : parts[0] ? 'detail' : 'list';
  const jobId = view === 'detail' ? parts[0] : '';
  const [jobs, setJobs] = useState<Job[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [filters, setFilters] = useState({ search: '', skills: '', experience: '', employmentType: '', workMode: '', location: '', minSalary: '', maxSalary: '', currency: '' });
  const [jobForm, setJobForm] = useState(blankJob());
  const [applicationNote, setApplicationNote] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingJob, setEditingJob] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [hasApplied, setHasApplied] = useState(false);
  const [connectedUserIds, setConnectedUserIds] = useState<string[]>([]);

  useEffect(() => {
    if (!user) {
      setConnectedUserIds([]);
      return;
    }
    let active = true;
    request<{ connections: ConnectionEntry[] }>('/connections')
      .then(({ connections }) => {
        if (active) setConnectedUserIds(connections.filter((connection) => connection.status === 'accepted').map((connection) => connection.user.id || ''));
      })
      .catch((reason: Error) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setNotice('');
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
    const path = view === 'mine' ? '/jobs/mine'
      : view === 'applications' ? '/applications/mine'
        : view === 'detail' ? `/jobs/${encodeURIComponent(jobId)}`
          : `/jobs${query.size ? `?${query}` : ''}`;
    request<Job[] | Job | Application[]>(path)
      .then((result) => {
        if (!active) return;
        if (view === 'detail') {
          setJob(result as Job);
          setJobs([]);
        } else if (view === 'applications') {
          setApplications(result as Application[]);
          setJobs([]);
        } else {
          setJobs(result as Job[]);
          setJob(null);
        }
      })
      .catch((reason: Error) => { if (active) setError(reason.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filters, jobId, view]);

  useEffect(() => {
    let active = true;
    if (view === 'detail' && jobId && user) {
      request<Application[]>('/applications/mine').then((rows) => {
        if (active) setHasApplied(rows.some((application) => application.jobId === jobId));
      }).catch(() => {});
    } else setHasApplied(false);
    return () => { active = false; };
  }, [jobId, user, view]);

  useEffect(() => {
    let active = true;
    if (view === 'detail' && job?.hirer?.id === user?.id && job) {
      request<Application[]>(`/jobs/${encodeURIComponent(job.id)}/applications`)
        .then((rows) => { if (active) setApplications(rows); })
        .catch((reason: Error) => { if (active) setError(reason.message); });
    } else setApplications([]);
    return () => { active = false; };
  }, [job, user, view]);

  const updateFilter = (key: keyof typeof filters, value: string) => setFilters((current) => ({ ...current, [key]: value }));
  const createJob = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) { onAuth('signin'); return; }
    setSaving(true); setError(''); setNotice('');
    try {
      const payload = {
        ...jobForm,
        salary: { ...jobForm.salary, min: jobForm.salary.min || null, max: jobForm.salary.max || null },
      };
      const saved = editingJob && job
        ? await request<Job>(`/jobs/${encodeURIComponent(job.id)}`, { method: 'PATCH', body: JSON.stringify(payload) })
        : await request<Job>('/jobs', { method: 'POST', body: JSON.stringify(payload) });
      setShowForm(false); setEditingJob(false); setJobForm(blankJob());
      if (editingJob) setJob(saved);
      else navigate(`/jobs/${encodeURIComponent(saved.id)}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not publish the job.'); }
    finally { setSaving(false); }
  };
  const apply = async () => {
    if (!user) { onAuth('signin'); return; }
    if (!job) return;
    setSaving(true); setError(''); setNotice('');
    try {
      await request(`/jobs/${encodeURIComponent(job.id)}/applications`, { method: 'POST', body: JSON.stringify({ note: applicationNote }) });
      setHasApplied(true); setNotice('Your application has been submitted.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not submit your application.'); }
    finally { setSaving(false); }
  };
  const updateApplicationStatus = async (applicationId: string, status: string) => {
    setError('');
    try {
      const updated = await request<Application>(`/applications/${encodeURIComponent(applicationId)}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setApplications((current) => current.map((item) => item.id === updated.id ? { ...item, status: updated.status } : item));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update application.'); }
  };
  const updateJobStatus = async (status: string) => {
    if (!job) return;
    setError('');
    try {
      const updated = await request<Job>(`/jobs/${encodeURIComponent(job.id)}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setJob(updated); setNotice(`Job listing ${status === 'open' ? 'reopened' : 'closed'}.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update the listing.'); }
  };
  const reportJob = async () => {
    if (!user) { onAuth('signin'); return; }
    if (!job) return;
    const reason = window.prompt('Why are you reporting this job listing?');
    if (!reason?.trim()) return;
    try {
      await submitReport('job', job.id, reason);
      setNotice('Job report submitted for review.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not report this job.'); }
  };
  const applicationClosed = Boolean(job?.deadline && Date.parse(`${job.deadline.slice(0, 10)}T23:59:59.999Z`) < Date.now());
  const formatSalary = (salary?: Job['salary']) => {
    if (!salary || (salary.min == null && salary.max == null)) return 'Compensation not specified';
    const amount = (value: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
    const range = salary.min != null && salary.max != null ? `${amount(salary.min)}–${amount(salary.max)}`
      : salary.min != null ? `From ${amount(salary.min)}` : `Up to ${amount(salary.max!)}`;
    return `${salary.currency ? `${salary.currency} ` : ''}${range}${salary.period ? ` / ${salary.period}` : ''}`;
  };

  return <PlatformPage eyebrow="Global opportunities" title={view === 'detail' ? (job?.title || 'Job details') : view === 'mine' ? 'Your job listings' : view === 'applications' ? 'Your applications' : 'Find work worth doing.'} caption="Search global opportunities, publish roles, and manage applications in one place.">
    <div className="platform-toolbar platform-job-nav">
      <Link className="btn btn-ghost" to="/jobs"><BriefcaseBusiness size={15}/> Browse jobs</Link>
      {user && <><Link className="btn btn-ghost" to="/jobs/mine">Your listings</Link><Link className="btn btn-ghost" to="/jobs/applications">Your applications</Link></>}
      <button className="btn btn-primary" onClick={() => { if (!user) { onAuth('signin'); return; } setEditingJob(false); setShowForm((open) => !open); }}>{showForm ? 'Cancel' : 'Post a job'} <Plus size={15}/></button>
    </div>
    {notice && <p className="platform-success" role="status">{notice}</p>}
    {error && <p className="platform-error" role="alert">{error}</p>}
    {showForm && <form className="platform-card platform-job-form" onSubmit={createJob}>
      <h2>{editingJob ? 'Edit job listing' : 'Publish a global job listing'}</h2>
      <div className="platform-form-grid">
        <label>Job title<input required value={jobForm.title} onChange={(event) => setJobForm({ ...jobForm, title: event.target.value })}/></label>
        <label>Company / organization<input required value={jobForm.organization} onChange={(event) => setJobForm({ ...jobForm, organization: event.target.value })}/></label>
        <label>Experience level<select required value={jobForm.experienceLevel} onChange={(event) => setJobForm({ ...jobForm, experienceLevel: event.target.value })}>{experienceLevels.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Employment type<select required value={jobForm.employmentType} onChange={(event) => setJobForm({ ...jobForm, employmentType: event.target.value })}>{employmentTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Work arrangement<select required value={jobForm.workMode} onChange={(event) => setJobForm({ ...jobForm, workMode: event.target.value })}>{workModes.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Location<input value={jobForm.location} onChange={(event) => setJobForm({ ...jobForm, location: event.target.value })} placeholder="City, region, or worldwide"/></label>
        <label className="span-2">Required skills<TextList value={jobForm.requiredSkills} onChange={(requiredSkills) => setJobForm({ ...jobForm, requiredSkills })} placeholder="React, API design, testing"/></label>
        <label className="span-2">Job description<textarea required rows={5} value={jobForm.description} onChange={(event) => setJobForm({ ...jobForm, description: event.target.value })}/></label>
        <label>Minimum rate / salary<input type="number" min="0" value={jobForm.salary.min} onChange={(event) => setJobForm({ ...jobForm, salary: { ...jobForm.salary, min: event.target.value } })}/></label>
        <label>Maximum rate / salary<input type="number" min="0" value={jobForm.salary.max} onChange={(event) => setJobForm({ ...jobForm, salary: { ...jobForm.salary, max: event.target.value } })}/></label>
        <label>Currency code<input maxLength={3} value={jobForm.salary.currency} onChange={(event) => setJobForm({ ...jobForm, salary: { ...jobForm.salary, currency: event.target.value.toUpperCase() } })} placeholder="USD, EUR, CAD…"/></label>
        <label>Pay period<input value={jobForm.salary.period} onChange={(event) => setJobForm({ ...jobForm, salary: { ...jobForm.salary, period: event.target.value } })} placeholder="hour, month, year, project"/></label>
        <label>Application deadline<input type="date" value={jobForm.deadline} onChange={(event) => setJobForm({ ...jobForm, deadline: event.target.value })}/></label>
        <label className="span-2">Additional requirements<textarea rows={3} value={jobForm.additionalRequirements} onChange={(event) => setJobForm({ ...jobForm, additionalRequirements: event.target.value })}/></label>
      </div><button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editingJob ? 'Save changes' : 'Publish job'}</button>
    </form>}
    {view === 'detail' && <><Feedback loading={loading} error={error}/>{job && <article className="platform-card platform-job-detail">
      <div className="platform-job-heading"><div><span className="eyebrow">{job.organization}</span><h2>{job.title}</h2><p>{job.hirer?.name ? `Posted by ${job.hirer.name}` : ''}</p></div><span className={`platform-status ${job.status}`}>{job.status}</span>{job.hirer?.id !== user?.id && <button className="btn btn-ghost" onClick={reportJob}><Flag size={14}/> Report listing</button>}</div>
      <div className="platform-meta-row"><span>{job.employmentType}</span><span>{job.experienceLevel}</span><span>{job.workMode}</span>{job.location && <span><MapPin size={14}/>{job.location}</span>}</div>
      <p className="platform-salary">{formatSalary(job.salary)}</p><section><h3>Description</h3><p className="platform-long-text">{job.description}</p></section>
      <section><h3>Required skills</h3><div className="platform-tags">{job.requiredSkills.map((skill) => <span key={skill}>{skill}</span>)}</div></section>
      {job.additionalRequirements && <section><h3>Additional requirements</h3><p>{job.additionalRequirements}</p></section>}
      {job.deadline && <p className="platform-meta">Apply by {new Date(job.deadline).toLocaleDateString()}</p>}
      {user?.id === job.hirer?.id ? <div className="platform-owner-actions"><div className="platform-card-actions"><button className="btn btn-ghost" onClick={() => { setJobForm({ title: job.title, organization: job.organization, description: job.description, requiredSkills: job.requiredSkills || [], experienceLevel: job.experienceLevel, employmentType: job.employmentType, workMode: job.workMode, location: job.location || '', salary: { min: job.salary?.min == null ? '' : String(job.salary.min), max: job.salary?.max == null ? '' : String(job.salary.max), currency: job.salary?.currency || '', period: job.salary?.period || '' }, deadline: job.deadline?.slice(0, 10) || '', additionalRequirements: job.additionalRequirements || '' }); setEditingJob(true); setShowForm(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Edit listing</button><button className="btn btn-ghost" onClick={() => updateJobStatus(job.status === 'open' ? 'closed' : 'open')}>{job.status === 'open' ? 'Close listing' : 'Reopen listing'}</button></div><b>{applications.length} applicant{applications.length === 1 ? '' : 's'}</b></div> :
        job.status === 'open' && <div className="platform-apply">{applicationClosed ? <p className="platform-error">The application deadline has passed.</p> : <><label>Application note<textarea rows={3} value={applicationNote} onChange={(event) => setApplicationNote(event.target.value)} placeholder="Introduce yourself and explain why this role interests you."/></label><button className="btn btn-primary" onClick={apply} disabled={saving || hasApplied}>{hasApplied ? 'Application submitted' : saving ? 'Submitting…' : 'Apply for this job'} <ArrowUpRight size={15}/></button></>}</div>}
      {job.hirer && job.hirer.id !== user?.id && connectedUserIds.includes(job.hirer.id) && <Link className="btn btn-ghost platform-hirer-message" to={`/messages?user=${encodeURIComponent(job.hirer.id)}`}>Message hirer <Send size={14}/></Link>}
      {applications.length > 0 && job.hirer?.id === user?.id && <section className="platform-applicants"><h3>Applicants</h3>{applications.map((application) => <article className="platform-applicant" key={application.id}>
        <div><Link to={`/developers/${encodeURIComponent(application.applicant?.id || '')}`}><b>{application.applicant?.name || 'ZERA member'}</b> <span>@{application.applicant?.username}</span></Link><p>{application.note || 'No application note provided.'}</p><div className="platform-tags">{application.applicant?.skills?.slice(0, 5).map((skill) => <span key={skill}>{skill}</span>)}</div>{application.applicant?.id && connectedUserIds.includes(application.applicant.id) && <Link className="platform-applicant-message" to={`/messages?user=${encodeURIComponent(application.applicant.id)}`}>Message applicant <Send size={13}/></Link>}</div>
        <select aria-label={`Application status for ${application.applicant?.name || 'applicant'}`} value={application.status} onChange={(event) => updateApplicationStatus(application.id, event.target.value)}>{applicationStatuses.map((status) => <option key={status}>{status}</option>)}</select>
      </article>)}</section>}
    </article>}</>}
    {view === 'applications' && <><Feedback loading={loading} error={error} empty={!applications.length ? 'You have not applied to any jobs yet.' : undefined}/><div className="platform-card-grid">{applications.map((application) => <article className="platform-card" key={application.id}><span className="platform-status">{application.status}</span><h2>{application.job?.title}</h2><p>{application.job?.organization}</p><p>{application.job?.workMode}{application.job?.location ? ` · ${application.job.location}` : ''}</p><Link className="btn btn-ghost" to={`/jobs/${encodeURIComponent(application.jobId)}`}>View job <ArrowUpRight size={14}/></Link></article>)}</div></>}
    {(view === 'list' || view === 'mine') && <>{view === 'list' && <div className="platform-filters">
      <label className="platform-filter-wide">Search jobs<input value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} placeholder="Title, company, description"/></label>
      <label>Skills<input value={filters.skills} onChange={(event) => updateFilter('skills', event.target.value)} placeholder="e.g. React"/></label>
      <label>Experience<select value={filters.experience} onChange={(event) => updateFilter('experience', event.target.value)}><option value="">Any level</option><option>Any</option>{experienceLevels.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Employment<select value={filters.employmentType} onChange={(event) => updateFilter('employmentType', event.target.value)}><option value="">Any type</option>{employmentTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Work mode<select value={filters.workMode} onChange={(event) => updateFilter('workMode', event.target.value)}><option value="">Any mode</option>{workModes.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Location<input value={filters.location} onChange={(event) => updateFilter('location', event.target.value)} placeholder="Anywhere"/></label>
      <label>Minimum salary<input type="number" min="0" value={filters.minSalary} onChange={(event) => updateFilter('minSalary', event.target.value)}/></label>
      <label>Maximum salary<input type="number" min="0" value={filters.maxSalary} onChange={(event) => updateFilter('maxSalary', event.target.value)}/></label>
      <label>Currency<input maxLength={3} value={filters.currency} onChange={(event) => updateFilter('currency', event.target.value.toUpperCase())} placeholder="USD"/></label>
    </div>}
    <Feedback loading={loading} error={error} empty={!jobs.length ? (view === 'mine' ? 'You have not posted any jobs yet.' : 'No jobs match these filters right now.') : undefined}/>
    <div className="platform-card-grid">{jobs.map((item) => <article className="platform-card platform-job-card" key={item.id}>
      <div className="platform-job-heading"><div><span className="eyebrow">{item.organization}</span><h2>{item.title}</h2></div>{view === 'mine' && <span className={`platform-status ${item.status}`}>{item.status}</span>}</div>
      <div className="platform-meta-row"><span>{item.employmentType}</span><span>{item.experienceLevel}</span><span>{item.workMode}</span>{item.location && <span><MapPin size={13}/>{item.location}</span>}</div>
      <p>{item.description.length > 220 ? `${item.description.slice(0, 220)}…` : item.description}</p>
      <div className="platform-tags">{(item.requiredSkills || []).slice(0, 5).map((skill) => <span key={skill}>{skill}</span>)}</div>
      <div className="platform-job-bottom"><b>{formatSalary(item.salary)}</b><Link className="btn btn-ghost" to={`/jobs/${encodeURIComponent(item.id)}`}>{view === 'mine' ? 'Manage listing' : 'View job'} <ArrowUpRight size={14}/></Link></div>
    </article>)}</div></>}
    {view === 'detail' && !loading && !job && !error && <div className="platform-feedback">This job is no longer available.</div>}
  </PlatformPage>;
}
