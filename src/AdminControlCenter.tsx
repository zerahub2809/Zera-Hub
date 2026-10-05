import { FormEvent, useEffect, useMemo, useState } from 'react';
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

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';
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
  verified?: boolean;
  createdAt?: string;
};

type AdminData = {
  users: AdminUser[];
  reports: any[];
  moderationActions: any[];
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
  };
};

type SecurityData = { loginActivity: any[]; auditLogs: any[] };
type Section =
  | 'Overview' | 'Users' | 'Developers' | 'Hirers' | 'Projects' | 'Jobs'
  | 'Community' | 'Reports' | 'Moderation' | 'ZERA AI' | 'Website'
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
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
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
  const [data, setData] = useState<AdminData | null>(null);
  const [security, setSecurity] = useState<SecurityData | null>(null);
  const [activeSection, setActiveSection] = useState<Section>('Overview');
  const [search, setSearch] = useState('');
  const [userFilter, setUserFilter] = useState<'all' | 'developer' | 'hire'>('all');
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
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
    return () => document.body.classList.remove('admin-page');
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
        if (!cancelled) setData(response);
      })
      .catch((cause: Error) => {
        if (cancelled) return;
        setError(cause.message);
        setData(null);
        if (/authentication|required|session/i.test(cause.message)) {
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

  const updateUserStatus = async (user: AdminUser) => {
    if (!token) return;
    setBusy(true);
    setError('');
    const status = user.status === 'active' ? 'suspended' : 'active';
    try {
      await request(`/api/admin/users/${user.id}`, token, { method: 'PATCH', body: JSON.stringify({ status }) });
      await loadOverview(token);
      setNotice(`${user.name} is now ${status}.`);
      setSelectedUser(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update this account.');
    } finally {
      setBusy(false);
    }
  };

  const updateReport = async (reportId: string, status: string) => {
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      await request(`/api/admin/reports/${reportId}`, token, { method: 'PATCH', body: JSON.stringify({ status }) });
      await loadOverview(token);
      setNotice('Report status updated.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update the report.');
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
          <div className="admin-brand-mark"><Sparkles size={22} /></div>
          <span className="admin-eyebrow">ZERA HUB · SECURE ACCESS</span>
          <h1>Admin Control Center</h1>
          <p>Sign in with your authorized administrator credentials.</p>
          {error && <div className="admin-alert error"><AlertTriangle size={16} />{error}</div>}
          <label>Administrator email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required /></label>
          <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
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
    { label: 'Projects', value: '—', icon: FolderKanban, tone: 'amber', note: 'Awaiting backend integration' },
    { label: 'Jobs', value: '—', icon: BriefcaseBusiness, tone: 'blue', note: 'Awaiting backend integration' },
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
          <td><button className="admin-member-link" onClick={() => setSelectedUser(user)}><span className="admin-avatar">{user.avatar ? <img src={user.avatar.startsWith('http') ? user.avatar : `${API}${user.avatar}`} alt="" /> : (user.name || 'Z').slice(0, 1).toUpperCase()}</span><span><b>{user.name || 'Unnamed member'}</b><small>@{user.username}</small></span></button></td>
          <td><span className="admin-type">{user.accountType === 'hire' ? 'Hirer' : 'Developer'}</span></td>
          <td>{user.verified ? <span className="admin-verified"><CheckCircle2 size={14} /> Verified</span> : <span className="admin-muted">Not verified</span>}</td>
          <td><span className={`admin-status ${user.status}`}>{user.status}</span></td>
          <td><button className="admin-small-button" onClick={() => setSelectedUser(user)}>View</button></td>
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
          <div className="admin-report-meta"><span>Reported user/content: {report.targetUserId || 'Not specified'}</span><span>Risk: {report.risk?.level || report.riskLevel || 'Not assessed'}</span><span>{formatDate(report.createdAt)}</span></div>
        </div>
        <label className="admin-report-action">Action status<select value={report.status || 'open'} disabled={busy} onChange={(event) => updateReport(report.id, event.target.value)}><option value="open">Open</option><option value="reviewed">Reviewed</option><option value="resolved">Resolved</option></select></label>
      </article>)}</div> : <div className="admin-empty"><Flag size={22} /><b>No reports have been submitted</b><span>New reports will appear here when available.</span></div>}
    </section>
  );

  const renderOverview = () => (
    <>
      <div className="admin-metrics">{metricCards.map(({ label, value, icon: Icon, tone, note }) => <article className="admin-metric" key={label}><div className={`admin-metric-icon ${tone}`}><Icon size={18} /></div><span>{label}</span><b>{value}</b>{note && <small>{note}</small>}</article>)}</div>
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
      <label>Logo URL<input value={data.siteConfig.logoUrl || ''} onChange={(event) => editSiteConfig('logoUrl', event.target.value)} placeholder="https://… or /uploads/…" /></label>
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
    if (activeSection === 'Moderation') return <section className="admin-content-card"><div className="admin-card-heading"><div><span className="admin-eyebrow">TRUST & SAFETY</span><h2>Moderation actions</h2></div><span className="admin-count">{data.moderationActions.length} actions</span></div>{data.moderationActions.length ? <div className="admin-report-list">{data.moderationActions.slice().reverse().map((action, index) => <article className="admin-report" key={action.id || index}><div className="admin-report-icon"><ShieldCheck size={17} /></div><div className="admin-report-main"><div className="admin-report-title"><b>{action.type || 'Moderation action'}</b><span className="admin-status open">recorded</span></div><p>Reason: {Array.isArray(action.reason) ? action.reason.join(', ') : action.reason || 'Not provided'}</p><div className="admin-report-meta"><span>User ID: {action.userId || 'Not specified'}</span><span>Performed by: {action.adminEmail || 'Automated system'}</span><span>{formatDate(action.createdAt)}</span></div></div></article>)}</div> : <div className="admin-empty"><ShieldCheck size={22} /><b>No moderation actions recorded</b><span>Blocked and moderated content events will appear here.</span></div>}</section>;
    if (activeSection === 'Website') return renderWebsite();
    if (activeSection === 'Security' || activeSection === 'Audit Logs') return securityError
      ? <section className="admin-content-card admin-error-state"><AlertTriangle size={23} /><h2>Security records could not be loaded</h2><p>{securityError}</p></section>
      : renderSecurity();
    if (activeSection === 'Settings') return renderSettings();
    if (integrationSections.includes(activeSection)) return renderIntegrationNotice();
    return null;
  };

  return (
    <main className="admin-shell">
      <aside className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="admin-side-brand"><span className="admin-brand-mark"><Sparkles size={17} /></span><span><b>ZERA HUB</b><small>CONTROL CENTER</small></span><button className="admin-sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu"><X size={18} /></button></div>
        <div className="admin-side-label">WORKSPACE</div>
        <nav className="admin-side-nav">{sections.map(({ label, icon: Icon }) => <button key={label} className={activeSection === label ? 'active' : ''} onClick={() => { setActiveSection(label); if (label === 'Developers') setUserFilter('developer'); else if (label === 'Hirers') setUserFilter('hire'); else if (label === 'Users') setUserFilter('all'); setSidebarOpen(false); setError(''); setNotice(''); }}><Icon size={17} /><span>{label}</span>{label === 'Reports' && Boolean(data?.stats.pendingReports) && <i>{data.stats.pendingReports}</i>}</button>)}</nav>
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
      {selectedUser && <div className="admin-modal-backdrop" onClick={() => setSelectedUser(null)}><section className="admin-user-modal" onClick={(event) => event.stopPropagation()}><button className="admin-modal-close" onClick={() => setSelectedUser(null)} aria-label="Close details"><X size={18} /></button><span className="admin-eyebrow">MEMBER PROFILE</span><div className="admin-profile-large">{selectedUser.avatar ? <img src={selectedUser.avatar.startsWith('http') ? selectedUser.avatar : `${API}${selectedUser.avatar}`} alt="" /> : (selectedUser.name || 'Z').slice(0, 1).toUpperCase()}</div><h2>{selectedUser.name || 'Unnamed member'}</h2><p>@{selectedUser.username} · {selectedUser.accountType === 'hire' ? 'Hirer' : 'Developer'}</p><div className="admin-profile-details"><span><b>Account status</b><i className={`admin-status ${selectedUser.status}`}>{selectedUser.status}</i></span><span><b>Verification</b><i>{selectedUser.verified ? 'Verified' : 'Not verified'}</i></span><span><b>Joined</b><i>{formatDate(selectedUser.createdAt)}</i></span></div>{selectedUser.bio && <p className="admin-profile-bio">{selectedUser.bio}</p>}{selectedUser.skills?.length ? <div className="admin-skill-list">{selectedUser.skills.map((skill) => <span key={skill}>{skill}</span>)}</div> : <p className="admin-muted">No skills listed.</p>}<button className={`admin-primary-button ${selectedUser.status === 'active' ? 'danger' : ''}`} disabled={busy} onClick={() => updateUserStatus(selectedUser)}>{selectedUser.status === 'active' ? <><Ban size={16} /> Suspend account</> : <><CheckCircle2 size={16} /> Reactivate account</>}</button></section></div>}
    </main>
  );
}
