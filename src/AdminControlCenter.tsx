import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { Fragment } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Ban,
  Bell,
  BrainCircuit,
  BriefcaseBusiness,
  CheckCircle2,
  Code2,
  Eye,
  EyeOff,
  FileCode2,
  Flag,
  FolderKanban,
  Globe2,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  MessageCircle,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import './admin.css';
import { BrandMark } from './BrandMark';

const API = (import.meta.env.PROD ? 'https://zera-hub-api.onrender.com' : (import.meta.env.VITE_API_URL || 'http://localhost:4000')).replace(/\/+$/, '');
const ADMIN_EMAIL = 'zerahub@outlook.com';

type AdminUser = {
  id: string;
  name: string;
  username: string;
  role: string;
  accountType: string;
  bio?: string;
  skills?: string[];
  avatar?: string;
  status: string;
  moderationState?: string;
  restrictedUntil?: string | null;
  verified?: boolean;
  createdAt?: string;
  verificationRequestAt?: string | null;
};

type AdminData = {
  users: AdminUser[];
  reports: any[];
  verificationRequests: AdminUser[];
  moderationActions: any[];
  projects: any[];
  siteConfig: {
    brandName: string;
    tagline: string;
    logoUrl: string;
    contactEmail: string;
    socials: Record<string, string>;
  };
  stats: {
    users: number;
    developers: number;
    hirers: number;
    activeUsers: number;
    suspendedUsers: number;
    pendingReports: number;
    projects: number;
    jobs: number;
    applications: number;
    comments: number;
  };
  jobs: any[];
  applications: any[];
  posts: any[];
};

type SecurityData = { loginActivity: any[]; auditLogs: any[] };
type Section =
  | 'Overview' | 'Users' | 'Developers' | 'Hirers' | 'Projects' | 'Jobs'
  | 'Community' | 'Reports' | 'Moderation' | 'Verification' | 'ZERA AI' | 'Website'
  | 'Notifications' | 'Security' | 'Audit Logs' | 'Settings';

const sections: { label: Section; icon: typeof LayoutDashboard }[] = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Users', icon: Users },
  { label: 'Developers', icon: Code2 },
  { label: 'Hirers', icon: BriefcaseBusiness },
  { label: 'Projects', icon: FolderKanban },
  { label: 'Jobs', icon: BriefcaseBusiness },
  { label: 'Community', icon: MessageCircle },
  { label: 'Reports', icon: Flag },
  { label: 'Moderation', icon: ShieldCheck },
  { label: 'Verification', icon: CheckCircle2 },
  { label: 'ZERA AI', icon: BrainCircuit },
  { label: 'Website', icon: Globe2 },
  { label: 'Notifications', icon: Bell },
  { label: 'Security', icon: Lock },
  { label: 'Audit Logs', icon: FileCode2 },
  { label: 'Settings', icon: Settings },
];

async function request<T>(path: string, token: string | null, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (path === '/api/admin/overview' && !token) throw new Error('Admin session is missing. Sign in to the Admin Control Center.');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API}${path}`, { ...options, headers });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = data && typeof data.error === 'string' ? data.error : response.statusText;
    throw new Error(`Admin API request failed (${response.status})${detail ? `: ${detail}` : ''}`);
  }
  if (data === null) throw new Error('The admin API returned an invalid response. Confirm the Render backend route is available.');
  return data as T;
}

function formatDate(value?: string) {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString();
}

export default function AdminControlCenter() {
  const [token, setToken] = useState(() => localStorage.getItem('zera_admin'));
  const [email, setEmail] = useState(ADMIN_EMAIL);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [data, setData] = useState<AdminData | null>(null);
  const [security, setSecurity] = useState<SecurityData | null>(null);
  const [activeSection, setActiveSection] = useState<Section>('Overview');
  const [search, setSearch] = useState('');
  const [userFilter, setUserFilter] = useState<'all' | 'developer' | 'hire'>('all');
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [userModerationStatus, setUserModerationStatus] = useState('suspended');
  const [loading, setLoading] = useState(Boolean(token));
  const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [error, setError] = useState('');
  const [securityError, setSecurityError] = useState('');
  const [notice, setNotice] = useState('');

  const loadOverview = async (authToken: string) => {
    const response = await request<AdminData>('/api/admin/overview', authToken);
    setData(response);
  };

  useEffect(() => {
    document.body.classList.add('admin-page');
    const previousTitle = document.title;
    document.title = 'Admin Control Center · ZERA HUB';
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const createdRobots = !robots;
    if (!robots) {
      robots = document.createElement('meta');
      robots.name = 'robots';
      document.head.append(robots);
    }
    const previousRobots = robots.content;
    robots.content = 'noindex, nofollow, noarchive';
    return () => {
      document.body.classList.remove('admin-page');
      document.title = previousTitle;
      if (createdRobots) robots?.remove();
      else if (robots) robots.content = previousRobots;
    };
  }, []);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    request<AdminData>('/api/admin/overview', token)
      .then((response) => {
        if (!response || !Array.isArray(response.users) || !Array.isArray(response.reports) ||
            !Array.isArray(response.moderationActions) || !Array.isArray(response.verificationRequests) || !Array.isArray(response.jobs) ||
            !Array.isArray(response.applications) || !Array.isArray(response.posts) ||
            !Array.isArray(response.projects) || !response.stats || !response.siteConfig) {
          throw new Error('The secured admin API returned an unexpected dashboard data structure.');
        }
        if (!cancelled) setData(response);
      })
      .catch((cause: Error) => {
        if (cancelled) return;
        setError(cause.message);
        setData(null);
        if (cause.message.includes('(401)') || cause.message.includes('(403)') ||
            /authentication|required|session|admin access/i.test(cause.message)) {
          localStorage.removeItem('zera_admin');
          setToken(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (!token || (activeSection !== 'Security' && activeSection !== 'Audit Logs')) return;
    let cancelled = false;
    setSecurity(null);
    setSecurityError('');
    request<SecurityData>('/api/admin/security', token)
      .then((response) => { if (!cancelled) setSecurity(response); })
      .catch((cause: Error) => { if (!cancelled) setSecurityError(cause.message); });
    return () => { cancelled = true; };
  }, [activeSection, token]);

  const filteredUsers = useMemo(() => {
    const users = data?.users || [];
    return users.filter((user) => {
      const roleMatches = userFilter === 'all' || user.accountType === userFilter;
      const query = search.trim().toLowerCase();
      const searchMatches = !query || `${user.name} ${user.username} ${user.accountType} ${user.status}`.toLowerCase().includes(query);
      return roleMatches && searchMatches;
    });
  }, [data, search, userFilter]);

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await request<{ token: string }>('/api/admin/login', null, {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem('zera_admin', response.token);
      setPassword('');
      setToken(response.token);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Admin login failed.');
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      await loadOverview(token);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  const updateUserStatus = async (user: AdminUser, status: string) => {
    if (!token) return;
    const reason = window.prompt(`Enter the reason to set this account to ${status}.`);
    if (!reason?.trim()) return;
    setBusy(true);
    setError('');
    try {
      await request(`/api/admin/users/${user.id}`, token, { method: 'PATCH', body: JSON.stringify({ status, reason }) });
      await loadOverview(token);
      setNotice(`${user.name} is now ${status}.`);
      setSelectedUser({ ...user, status: ['warning','review_required'].includes(status) ? 'active' : status, moderationState: ['warning','review_required'].includes(status) ? status : '' });
      setUserModerationStatus(status === 'active' ? 'active' : status);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update this account.');
    } finally {
      setBusy(false);
    }
  };

  const updateReport = async (reportId: string, status: string) => {
    if (!token) return;
    const reason = window.prompt(`Enter the reason for marking this report ${status}.`);
    if (!reason?.trim()) return;
    setBusy(true);
    setError('');
    try {
      await request(`/api/admin/reports/${reportId}`, token, { method: 'PATCH', body: JSON.stringify({ status, reason }) });
      await loadOverview(token);
      setNotice('Report status updated.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update the report.');
    } finally {
      setBusy(false);
    }
  };

  const updateRecord = async (type: string, id: string, status: string) => {
    if (!token) return;
    const reason = window.prompt(`Enter the reason for setting this ${type} to ${status}.`);
    if (!reason?.trim()) return;
    setBusy(true);
    setError('');
    try {
      await request(`/api/admin/records/${type}/${encodeURIComponent(id)}`, token, {
        method: 'PATCH', body: JSON.stringify({ status, reason }),
      });
      await loadOverview(token);
      setNotice(`${type} moderation status updated.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not update this ${type}.`);
    } finally { setBusy(false); }
  };

  const reviewVerification = async (userId: string, status: 'approved' | 'rejected') => {
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      await request(`/api/admin/verification-requests/${encodeURIComponent(userId)}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await loadOverview(token);
      setNotice(`Verification request ${status}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not review verification request.');
    } finally {
      setBusy(false);
    }
  };

  const saveWebsite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || !data) return;
    setBusy(true);
    setError('');
    try {
      await request('/api/admin/site-config', token, {
        method: 'PATCH',
        body: JSON.stringify(data.siteConfig),
      });
      await loadOverview(token);
      setNotice('Website settings saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save website settings.');
    } finally {
      setBusy(false);
    }
  };

  const uploadLogo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !token) return;
    setBusy(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('logo', file);
      const response = await request<{ logoUrl: string }>('/api/admin/logo', token, {
        method: 'POST',
        body: formData,
      });
      const logoUrl = response.logoUrl;
      setData((current) => current ? { ...current, siteConfig: { ...current.siteConfig, logoUrl } } : current);
      await loadOverview(token);
      setNotice('Logo uploaded successfully.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not upload the logo.');
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  };

  const logout = () => {
    localStorage.removeItem('zera_admin');
    if (localStorage.getItem('zera_token') === token) localStorage.removeItem('zera_token');
    setToken(null);
    setData(null);
    setSecurity(null);
    setError('');
    setActiveSection('Overview');
  };

  if (!token) {
    return (
      <main className="admin-login-screen">
        <div className="admin-login-glow" />
        <form className="admin-login-card" onSubmit={login}>
          <div className="admin-brand-mark"><BrandMark site={null}/></div>
          <span className="admin-eyebrow">ZERA HUB · SECURE ACCESS</span>
          <h1>Admin Control Center</h1>
          <p>Sign in with your authorized administrator credentials.</p>
          {error && <div className="admin-alert error"><AlertTriangle size={16} />{error}</div>}
          <label>Administrator email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required /></label>
          <label>Password<span className="admin-password-field">
            <input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
            <button className="admin-password-toggle" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onPointerDown={(event) => event.preventDefault()} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
          </span></label>
          <button className="admin-primary-button" disabled={busy} type="submit">{busy ? 'Signing in…' : 'Secure sign in'}<ArrowRight size={16} /></button>
          <div className="admin-login-foot"><Lock size={13} /> Protected by server-side administrator authorization</div>
        </form>
      </main>
    );
  }

  const integrationSections: Section[] = ['Projects', 'Jobs', 'Community', 'ZERA AI', 'Notifications'];
  const userSections: Section[] = ['Users', 'Developers', 'Hirers'];

  const metricCards = data ? [
    { label: 'Total users', value: data.stats.users, icon: Users, tone: 'violet' },
    { label: 'Developers', value: data.stats.developers, icon: Code2, tone: 'cyan' },
    { label: 'Hirers', value: data.stats.hirers, icon: BriefcaseBusiness, tone: 'blue' },
    { label: 'Active users', value: data.stats.activeUsers ?? data.users.filter((user) => user.status === 'active').length, icon: CheckCircle2, tone: 'green' },
    { label: 'Suspended users', value: data.stats.suspendedUsers ?? data.users.filter((user) => user.status === 'suspended').length, icon: Ban, tone: 'rose' },
    { label: 'Projects', value: data.stats.projects, icon: FolderKanban, tone: 'amber' },
    { label: 'Jobs', value: data.stats.jobs, icon: BriefcaseBusiness, tone: 'blue' },
    { label: 'Pending reports', value: data.stats.pendingReports ?? data.reports.filter((report) => report.status === 'open').length, icon: Flag, tone: 'rose' },
  ] : [];

  const editSiteConfig = (key: string, value: string) => {
    if (!data) return;
    setData({ ...data, siteConfig: { ...data.siteConfig, [key]: value } });
  };

  const renderUsers = () => (
    <section className="admin-content-card">
      <div className="admin-card-heading">
        <div><span className="admin-eyebrow">DIRECTORY</span><h2>{activeSection}</h2></div>
        <span className="admin-count">{filteredUsers.length} records</span>
      </div>
      <div className="admin-user-tools">
        <label className="admin-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, username, type or status" /></label>
        <div className="admin-filter-tabs">
          {(['all', 'developer', 'hire'] as const).map((filter) => <button key={filter} className={userFilter === filter ? 'selected' : ''} onClick={() => setUserFilter(filter)}>{filter === 'all' ? 'All accounts' : filter === 'hire' ? 'Hirers' : 'Developers'}</button>)}
        </div>
      </div>
      {filteredUsers.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Member</th><th>Account type</th><th>Verification</th><th>Status</th><th /></tr></thead><tbody>
        {filteredUsers.map((user) => <tr key={user.id}>
          <td><button className="admin-member-link" onClick={() => { setSelectedUser(user); setUserModerationStatus(user.moderationState || user.status); }}><span className="admin-avatar">{user.avatar ? <img loading="lazy" src={user.avatar.startsWith('http') ? user.avatar : `${API}${user.avatar}`} alt="" /> : (user.name || 'Z').slice(0, 1).toUpperCase()}</span><span><b>{user.name || 'Unnamed member'}</b><small>@{user.username}</small></span></button></td>
          <td><span className="admin-type">{user.accountType === 'hire' ? 'Hirer' : 'Developer'}</span></td>
          <td>{user.verified ? <span className="admin-verified"><CheckCircle2 size={14} /> Verified</span> : <span className="admin-muted">Not verified</span>}</td>
          <td><span className={`admin-status ${user.moderationState || user.status}`}>{(user.moderationState || user.status).replace(/_/g,' ')}</span></td>
          <td><button className="admin-small-button" onClick={() => { setSelectedUser(user); setUserModerationStatus(user.moderationState || user.status); }}>View</button></td>
        </tr>)}
      </tbody></table></div> : <div className="admin-empty"><Users size={22} /><b>No matching users</b><span>Adjust the search or account filter.</span></div>}
    </section>
  );

  const renderReports = () => (
    <section className="admin-content-card">
      <div className="admin-card-heading"><div><span className="admin-eyebrow">TRUST & SAFETY</span><h2>Reports</h2></div><span className="admin-count">{data?.reports.length || 0} reports</span></div>
      {data?.reports.length ? <div className="admin-report-list">{data.reports.map((report) => <article className="admin-report" key={report.id}>
        <div className="admin-report-icon"><Flag size={17} /></div>
        <div className="admin-report-main"><div className="admin-report-title"><b>{report.reason || report.type || 'User report'}</b><span className={`admin-status ${report.status || 'open'}`}>{report.status || 'open'}</span></div>
          <p>{report.details || 'No additional details were provided.'}</p>
          <div className="admin-report-meta"><span>Target: {report.targetType || 'user'} · {report.targetId || report.targetUserId || 'Not specified'}</span><span>Reporter: {report.reporterId || 'Not specified'}</span><span>Risk: {report.risk?.level || report.riskLevel || 'Not assessed'}</span><span>{formatDate(report.createdAt)}</span></div>
        </div>
        <label className="admin-report-action">Action status<select value={report.status || 'open'} disabled={busy} onChange={(event) => updateReport(report.id, event.target.value)}><option value="open">Open</option><option value="reviewed">Reviewed</option><option value="resolved">Resolved</option></select></label>
      </article>)}</div> : <div className="admin-empty"><Flag size={22} /><b>No reports have been submitted</b><span>New reports will appear here when available.</span></div>}
    </section>
  );

  const renderVerification = () => (
    <section className="admin-content-card">
      <div className="admin-card-heading"><div><span className="admin-eyebrow">PROFILE TRUST</span><h2>Verification requests</h2></div><span className="admin-count">{data?.verificationRequests.length || 0} pending</span></div>
      {data?.verificationRequests.length ? <div className="admin-report-list">{data.verificationRequests.map((user) => <article className="admin-report" key={user.id}>
        <div className="admin-avatar">{user.avatar ? <img src={user.avatar.startsWith('http') ? user.avatar : `${API}${user.avatar}`} alt="" /> : user.name.slice(0, 1).toUpperCase()}</div>
        <div className="admin-report-main"><div className="admin-report-title"><b>{user.name}</b><span>@{user.username}</span></div><p>{user.bio || 'No bio provided.'}</p><div className="admin-report-meta"><span>Submitted {formatDate(user.verificationRequestAt || undefined)}</span><span>{user.skills?.join(', ')}</span></div></div>
        <div className="admin-form-actions"><button className="admin-primary-button" disabled={busy} onClick={() => reviewVerification(user.id, 'approved')}>Approve</button><button className="admin-secondary-button" disabled={busy} onClick={() => reviewVerification(user.id, 'rejected')}>Reject</button></div>
      </article>)}</div> : <div className="admin-empty"><CheckCircle2 size={22}/><b>No verification requests</b><span>Submitted profile verification requests will appear here.</span></div>}
    </section>
  );

  const renderOverview = () => (
    <>
      <div className="admin-metrics">{metricCards.map(({ label, value, icon: Icon, tone }) => <article className="admin-metric" key={label}><div className={`admin-metric-icon ${tone}`}><Icon size={18} /></div><span>{label}</span><b>{value}</b></article>)}</div>
      <div className="admin-overview-grid">
        <section className="admin-content-card admin-overview-users"><div className="admin-card-heading"><div><span className="admin-eyebrow">LATEST ACCOUNTS</span><h2>Recently joined</h2></div><button className="admin-text-button" onClick={() => setActiveSection('Users')}>View users <ArrowRight size={14} /></button></div>
          {data?.users.slice(-5).reverse().length ? data.users.slice(-5).reverse().map((user) => <div className="admin-recent-user" key={user.id}><span className="admin-avatar">{(user.name || 'Z').slice(0, 1).toUpperCase()}</span><div><b>{user.name || 'Unnamed member'}</b><small>@{user.username} · {user.accountType === 'hire' ? 'Hirer' : 'Developer'}</small></div><span className={`admin-status ${user.status}`}>{user.status}</span></div>) : <div className="admin-empty"><Users size={20} /><b>No user accounts yet</b><span>Registered members will appear here.</span></div>}
        </section>
        <section className="admin-content-card"><div className="admin-card-heading"><div><span className="admin-eyebrow">TRUST & SAFETY</span><h2>Reports queue</h2></div><button className="admin-text-button" onClick={() => setActiveSection('Reports')}>Review <ArrowRight size={14} /></button></div>
          {data?.reports.filter((report) => report.status === 'open').slice(0, 4).map((report) => <div className="admin-queue-item" key={report.id}><Flag size={15} /><span><b>{report.reason || report.type || 'User report'}</b><small>{report.details || 'No details'} · {formatDate(report.createdAt)}</small></span><span className="admin-status open">open</span></div>)}
          {!data?.reports.some((report) => report.status === 'open') && <div className="admin-empty compact"><CheckCircle2 size={20} /><b>Nothing pending</b><span>No open reports right now.</span></div>}
        </section>
      </div>
    </>
  );

  const renderWebsite = () => data ? <section className="admin-content-card admin-website-card">
    <div className="admin-card-heading"><div><span className="admin-eyebrow">PUBLIC BRAND</span><h2>Website configuration</h2></div><Globe2 size={19} /></div>
    <p className="admin-section-description">These values are served by the existing site configuration API and update the public website branding.</p>
    <form onSubmit={saveWebsite} className="admin-website-form">
      <label>Brand name<input value={data.siteConfig.brandName || ''} onChange={(event) => editSiteConfig('brandName', event.target.value)} /></label>
      <label>Tagline<input value={data.siteConfig.tagline || ''} onChange={(event) => editSiteConfig('tagline', event.target.value)} /></label>
      <div className="admin-logo-upload-row">
        <label className="admin-logo-upload-label">Logo URL<input value={data.siteConfig.logoUrl || ''} onChange={(event) => editSiteConfig('logoUrl', event.target.value)} placeholder="https://… or /uploads/…" /></label>
        <label className="admin-upload-button"><input type="file" accept="image/*" onChange={uploadLogo} />Upload logo</label>
      </div>
      <label>Contact email<input type="email" value={data.siteConfig.contactEmail || ''} onChange={(event) => editSiteConfig('contactEmail', event.target.value)} /></label>
      <h3>Social links</h3>
      {Object.entries(data.siteConfig.socials || {}).map(([key, value]) => <label key={key}>{key}<input value={value} onChange={(event) => setData({ ...data, siteConfig: { ...data.siteConfig, socials: { ...data.siteConfig.socials, [key]: event.target.value } } })} /></label>)}
      <div className="admin-form-actions"><button className="admin-primary-button" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save website settings'}<CheckCircle2 size={16} /></button>{notice && <span className="admin-success">{notice}</span>}</div>
    </form>
  </section> : null;

  const renderSecurity = () => (
    <section className="admin-content-card">
      <div className="admin-card-heading"><div><span className="admin-eyebrow">ACCESS & ACTIONS</span><h2>{activeSection === 'Security' ? 'Login activity' : 'Admin audit logs'}</h2></div><button className="admin-icon-button" onClick={() => setSecurity(null)} aria-label="Reload logs"><RefreshCw size={16} /></button></div>
      {!security ? <div className="admin-loading"><span className="admin-spinner" />Loading security records…</div> : (() => {
        const records = activeSection === 'Security' ? security.loginActivity : security.auditLogs;
        return records.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Event</th><th>Administrator / attempt</th><th>Details</th><th>Date / time</th></tr></thead><tbody>{records.map((record, index) => <tr key={record.id || index}><td>{record.action || (record.success ? 'Successful login' : 'Failed login')}</td><td>{record.adminEmail || record.attemptedEmail || 'Administrator'}</td><td>{record.details || (record.success === false ? 'Login denied' : '—')}</td><td>{formatDate(record.createdAt)}</td></tr>)}</tbody></table></div> : <div className="admin-empty"><Lock size={21} /><b>No recorded activity</b><span>Events will be listed here as they occur.</span></div>;
      })()}
    </section>
  );

  const renderManagedRecords = () => {
    if (!data) return null;
    const renderEntry = (type: string, record: any, title: string, description: string, status: string, options: string[]) => (
      <article className="admin-report" key={`${type}-${record.id}`}>
        <div className="admin-report-icon"><ShieldCheck size={17} /></div>
        <div className="admin-report-main"><div className="admin-report-title"><b>{title}</b><span className={`admin-status ${status}`}>{status}</span></div>
          <p>{description || 'No additional content.'}</p><div className="admin-report-meta"><span>ID: {record.id}</span><span>{formatDate(record.createdAt)}</span></div>
        </div>
        <label className="admin-report-action">Moderation status<select value={status} disabled={busy} onChange={(event) => updateRecord(type, record.id, event.target.value)}>{options.map((option) => <option key={option} value={option}>{option.replace(/_/g, ' ')}</option>)}</select></label>
      </article>
    );
    if (activeSection === 'Jobs') return <><section className="admin-content-card"><div className="admin-card-heading"><div><span className="admin-eyebrow">HIRING MARKETPLACE</span><h2>Job listings</h2></div><span className="admin-count">{data.jobs.length} records</span></div>{data.jobs.length ? <div className="admin-report-list">{data.jobs.map((job) => renderEntry('job', job, job.title, `${job.organization} · Owner ${job.ownerId}`, job.status, ['open','closed','removed']))}</div> : <div className="admin-empty"><BriefcaseBusiness size={22}/><b>No job listings</b><span>Backend job listings will appear here.</span></div>}</section><section className="admin-content-card"><div className="admin-card-heading"><div><span className="admin-eyebrow">APPLICATION REVIEW</span><h2>Applications</h2></div><span className="admin-count">{data.applications.length} records</span></div>{data.applications.length ? <div className="admin-report-list">{data.applications.map((application) => renderEntry('application', application, `Application for ${application.jobId}`, `Applicant ${application.applicantId}`, application.status, ['Applied','Reviewing','Shortlisted','Interview','Accepted','Rejected']))}</div> : <div className="admin-empty"><Users size={22}/><b>No applications</b><span>Applications will appear here when submitted.</span></div>}</section></>;
    if (activeSection === 'Community') return <section className="admin-content-card"><div className="admin-card-heading"><div><span className="admin-eyebrow">COMMUNITY SAFETY</span><h2>Community posts</h2></div><span className="admin-count">{data.posts.length} posts</span></div>{data.posts.length ? <div className="admin-report-list">{data.posts.map((post) => <Fragment key={post.id}>{renderEntry('post', post, post.category || 'Community post', post.content, post.status, ['visible','review_required','hidden'])}{post.comments.flatMap((comment: any) => [comment, ...comment.replies]).map((comment: any) => renderEntry('comment', comment, 'Comment / reply', comment.content, comment.status, ['visible','review_required','hidden']))}</Fragment>)}</div> : <div className="admin-empty"><MessageCircle size={22}/><b>No community content</b><span>Community posts will appear here.</span></div>}</section>;
    const projects = data.projects;
    return <section className="admin-content-card"><div className="admin-card-heading"><div><span className="admin-eyebrow">DEVELOPER PORTFOLIOS</span><h2>Projects</h2></div><span className="admin-count">{data.stats.projects} projects</span></div>{projects.length ? <div className="admin-report-list">{projects.map((project: any, index: number) => <article className="admin-report" key={`${project.name}-${index}`}><div className="admin-report-icon"><FolderKanban size={17}/></div><div className="admin-report-main"><div className="admin-report-title"><b>{project.name}</b></div><p>{project.description}</p><div className="admin-report-meta"><span>Owner: {project.username || 'Developer'}</span>{project.url && <a href={project.url} target="_blank" rel="noreferrer">View project</a>}</div></div></article>)}</div> : <div className="admin-empty"><FolderKanban size={22}/><b>No portfolio projects</b><span>Developer profile projects will appear here.</span></div>}</section>;
  };

  const renderIntegrationNotice = () => (
    <section className="admin-content-card admin-integration-card">
      <div className="admin-integration-icon"><BrainCircuit size={22} /></div>
      <span className="admin-eyebrow">BACKEND INTEGRATION PENDING</span>
      <h2>{activeSection} management is not connected yet</h2>
      <p>This project does not currently store or expose administrator endpoints for {activeSection.toLowerCase()}. No sample records or placeholder metrics are being shown. Connect the appropriate data model and secured API before enabling management actions.</p>
      <span className="admin-integration-tag"><Lock size={13} /> No mock data · no client-side-only actions</span>
    </section>
  );

  const renderSettings = () => (
    <section className="admin-content-card admin-settings-card">
      <span className="admin-eyebrow">ADMIN ACCOUNT</span><h2>Control center settings</h2>
      <p>Signed in as <b>{email || ADMIN_EMAIL}</b>. Administrator credentials are validated by the server and are not stored in this dashboard.</p>
      <button className="admin-secondary-button" onClick={logout}><LogOut size={16} /> Sign out of admin</button>
    </section>
  );

  const renderContent = () => {
    if (loading) return <div className="admin-content-card admin-loading"><span className="admin-spinner" />Loading secure dashboard data…</div>;
    if (!data) return <div className="admin-content-card admin-error-state"><AlertTriangle size={23} /><h2>Dashboard data could not be loaded</h2><p>{error || 'The secured admin API did not return dashboard data.'}</p><button className="admin-secondary-button" onClick={refresh}><RefreshCw size={15} /> Retry</button></div>;
    if (userSections.includes(activeSection)) return renderUsers();
    if (activeSection === 'Overview') return renderOverview();
    if (activeSection === 'Reports') return renderReports();
    if (activeSection === 'Verification') return renderVerification();
    if (activeSection === 'Moderation') return <section className="admin-content-card"><div className="admin-card-heading"><div><span className="admin-eyebrow">TRUST & SAFETY</span><h2>Moderation actions</h2></div><span className="admin-count">{data.moderationActions.length} actions</span></div>{data.moderationActions.length ? <div className="admin-report-list">{data.moderationActions.slice().reverse().map((action, index) => <article className="admin-report" key={action.id || index}><div className="admin-report-icon"><ShieldCheck size={17} /></div><div className="admin-report-main"><div className="admin-report-title"><b>{action.type || 'Moderation action'}</b><span className="admin-status open">recorded</span></div><p>Reason: {Array.isArray(action.reason) ? action.reason.join(', ') : action.reason || 'Not provided'}</p><div className="admin-report-meta"><span>User ID: {action.userId || 'Not specified'}</span><span>Performed by: {action.adminEmail || 'Automated system'}</span><span>{formatDate(action.createdAt)}</span></div></div></article>)}</div> : <div className="admin-empty"><ShieldCheck size={22} /><b>No moderation actions recorded</b><span>Blocked and moderated content events will appear here.</span></div>}</section>;
    if (activeSection === 'Website') return renderWebsite();
    if (activeSection === 'Security' || activeSection === 'Audit Logs') return securityError
      ? <section className="admin-content-card admin-error-state"><AlertTriangle size={23} /><h2>Security records could not be loaded</h2><p>{securityError}</p></section>
      : renderSecurity();
    if (activeSection === 'Settings') return renderSettings();
    if (activeSection === 'Projects' || activeSection === 'Jobs' || activeSection === 'Community') return renderManagedRecords();
    if (integrationSections.includes(activeSection)) return renderIntegrationNotice();
    return null;
  };

  return (
    <main className="admin-shell">
      <aside className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="admin-side-brand"><span className="admin-brand-mark"><BrandMark site={data?.siteConfig || null}/></span><span><b>ZERA HUB</b><small>CONTROL CENTER</small></span><button className="admin-sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu"><X size={18} /></button></div>
        <div className="admin-side-label">WORKSPACE</div>
        <nav className="admin-side-nav">{sections.map(({ label, icon: Icon }) => <button key={label} className={activeSection === label ? 'active' : ''} onClick={() => { setActiveSection(label); if (label === 'Developers') setUserFilter('developer'); else if (label === 'Hirers') setUserFilter('hire'); else if (label === 'Users') setUserFilter('all'); setSidebarOpen(false); setError(''); setNotice(''); }}><Icon size={17} /><span>{label}</span>{label === 'Reports' && Boolean(data?.stats?.pendingReports) && <i>{data?.stats?.pendingReports}</i>}</button>)}</nav>
        <div className="admin-sidebar-bottom"><div className="admin-online"><span /> API connected</div><button onClick={logout}><LogOut size={16} /> Sign out</button></div>
      </aside>
      {sidebarOpen && <button className="admin-sidebar-scrim" onClick={() => setSidebarOpen(false)} aria-label="Close navigation" />}
      <div className="admin-main">
        <header className="admin-topbar"><div className="admin-topbar-left"><button className="admin-menu-button" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><Menu size={19} /></button><div><span className="admin-breadcrumb">ZERA HUB <b>/</b> {activeSection}</span><small>Operations and platform health</small></div></div><div className="admin-top-actions"><span className="admin-secure-badge"><ShieldCheck size={14} /> SECURE SESSION</span><button className="admin-icon-button" onClick={refresh} aria-label="Refresh dashboard" disabled={loading}><RefreshCw size={16} /></button><button className="admin-profile-button" onClick={logout}><span className="admin-profile-avatar">Z</span><span><b>Administrator</b><small>{ADMIN_EMAIL}</small></span><LogOut size={15} /></button></div></header>
        <div className="admin-page-content">
          <div className="admin-page-heading"><div><span className="admin-eyebrow">PRIVATE ADMINISTRATION</span><h1>{activeSection}</h1><p>{activeSection === 'Overview' ? 'A clear view of your ZERA HUB platform.' : `Manage ${activeSection.toLowerCase()} using secured, backend-backed controls.`}</p></div></div>
          {error && data && <div className="admin-alert error"><AlertTriangle size={16} />{error}<button onClick={() => setError('')} aria-label="Dismiss error"><X size={15} /></button></div>}
          {notice && activeSection !== 'Website' && <div className="admin-alert success"><CheckCircle2 size={16} />{notice}<button onClick={() => setNotice('')} aria-label="Dismiss notice"><X size={15} /></button></div>}
          {renderContent()}
          <footer className="admin-footer"><span>© {new Date().getFullYear()} ZERA HUB</span><span>Secure operations console <BarChart3 size={13} /></span></footer>
        </div>
      </div>
      {selectedUser && <div className="admin-modal-backdrop" onClick={() => setSelectedUser(null)}><section className="admin-user-modal" onClick={(event) => event.stopPropagation()}><button className="admin-modal-close" onClick={() => setSelectedUser(null)} aria-label="Close details"><X size={18} /></button><span className="admin-eyebrow">MEMBER PROFILE</span><div className="admin-profile-large">{selectedUser.avatar ? <img loading="lazy" src={selectedUser.avatar.startsWith('http') ? selectedUser.avatar : `${API}${selectedUser.avatar}`} alt="" /> : (selectedUser.name || 'Z').slice(0, 1).toUpperCase()}</div><h2>{selectedUser.name || 'Unnamed member'}</h2><p>@{selectedUser.username} · {selectedUser.accountType === 'hire' ? 'Hirer' : 'Developer'}</p><div className="admin-profile-details"><span><b>Account status</b><i className={`admin-status ${selectedUser.status}`}>{selectedUser.status}</i></span><span><b>Moderation state</b><i className={`admin-status ${selectedUser.moderationState || 'active'}`}>{(selectedUser.moderationState || 'none').replace(/_/g,' ')}</i></span><span><b>Verification</b><i>{selectedUser.verified ? 'Verified' : 'Not verified'}</i></span><span><b>Joined</b><i>{formatDate(selectedUser.createdAt)}</i></span></div>{selectedUser.bio && <p className="admin-profile-bio">{selectedUser.bio}</p>}{selectedUser.skills?.length ? <div className="admin-skill-list">{selectedUser.skills.map((skill) => <span key={skill}>{skill}</span>)}</div> : <p className="admin-muted">No skills listed.</p>}<label>Moderation status<select value={userModerationStatus} disabled={busy} onChange={(event) => setUserModerationStatus(event.target.value)}>{['active','warning','review_required','restricted','suspended','disabled'].map((status) => <option key={status} value={status}>{status.replace(/_/g,' ')}</option>)}</select></label><button className={`admin-primary-button ${['restricted','suspended','disabled'].includes(userModerationStatus) ? 'danger' : ''}`} disabled={busy || (userModerationStatus === (selectedUser.moderationState || selectedUser.status))} onClick={() => updateUserStatus(selectedUser,userModerationStatus)}><ShieldCheck size={16} /> Apply moderation status</button></section></div>}
    </main>
  );
}
