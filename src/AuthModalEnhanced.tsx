import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BriefcaseBusiness, Code2, Eye, EyeOff, X } from 'lucide-react';
import { BrandMark } from './BrandMark';
import './auth.css';

const API = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? 'https://zera-hub-api.onrender.com' : 'http://localhost:4000');
type Mode = 'developer' | 'hire' | 'signin' | 'forgot';
type Account = { id: string; name: string; username: string; role: string; accountType: string; status: string; bio?: string; skills?: string[]; avatar?: string; verified?: boolean; online?: boolean; lastSeenAt?: string | null };
type Props = {
  type: 'developer' | 'hire' | 'signin';
  site: { logoUrl?: string } | null;
  onClose: () => void;
  onSignedIn: (account: Account) => void;
};

async function authRequest<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
  return result as T;
}

export function AuthModalEnhanced({ type, site, onClose, onSignedIn }: Props) {
  const [mode, setMode] = useState<Mode>(type);
  const [accountType, setAccountType] = useState<'developer' | 'hire'>(type === 'hire' ? 'hire' : 'developer');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setNotice('');
    setError('');
    try {
      if (mode === 'forgot') {
        const result = await authRequest<{ message: string }>('/api/auth/password-reset', { email });
        setNotice(result.message);
      } else if (mode === 'signin') {
        const result = await authRequest<{ token: string; user: Account }>('/api/auth/login', {
          email,
          password,
          accountType: type === 'signin' ? undefined : accountType,
        });
        localStorage.setItem('zera_token', result.token);
        localStorage.setItem('zera_user', JSON.stringify(result.user));
        onSignedIn(result.user);
        if (window.location.pathname === '/') navigate('/app');
      } else {
        await authRequest('/api/auth/signup', { name, username, email, password, accountType: mode });
        setAccountType(mode);
        setMode('signin');
        setName('');
        setUsername('');
        setPassword('');
        setNotice('Account created successfully. Please sign in.');
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The request could not be completed.');
    } finally {
      setSubmitting(false);
    }
  };

  const closeForgot = () => {
    setMode('signin');
    setError('');
    setNotice('');
  };

  return <div className="modal-backdrop" onClick={onClose}>
    <div className="modal glass" onClick={event => event.stopPropagation()}>
      <button type="button" className="modal-close" onClick={onClose} aria-label="Close"><X/></button>
      <div className="modal-brand"><BrandMark site={site}/></div>
      <div className="modal-icon">{mode === 'hire' || (mode === 'signin' && accountType === 'hire') ? <BriefcaseBusiness/> : <Code2/>}</div>
      <span className="eyebrow">{mode === 'signin' ? 'Welcome back' : mode === 'forgot' ? 'Account recovery' : 'Join ZERA HUB'}</span>
      <h2>{mode === 'forgot' ? 'Reset your password' : mode === 'signin' ? 'Sign in to your workspace' : mode === 'hire' ? 'Sign up to Hire' : 'Sign up as a Developer'}</h2>
      <p>{mode === 'forgot' ? 'Enter your registered email and we’ll send a secure password-reset link.' : mode === 'signin' ? 'Continue to your workspace.' : 'Create your identity and start connecting inside the ecosystem.'}</p>
      {notice && <p className="auth-notice" role="status">{notice}</p>}
      {error && <p className="auth-notice" role="alert">{error}</p>}
      {mode !== 'signin' && mode !== 'forgot' && <div className="auth-role-choice" role="group" aria-label="Choose your account type">
        <button type="button" className={`auth-role-option ${mode === 'developer' ? 'active' : ''}`} aria-pressed={mode === 'developer'} onClick={() => { setMode('developer'); setAccountType('developer'); }}>
          <Code2 size={18}/><span><b>Developer</b><small>Showcase your skills and connect.</small></span>
        </button>
        <button type="button" className={`auth-role-option ${mode === 'hire' ? 'active' : ''}`} aria-pressed={mode === 'hire'} onClick={() => { setMode('hire'); setAccountType('hire'); }}>
          <BriefcaseBusiness size={18}/><span><b>Hiring</b><small>Discover talent and build a team.</small></span>
        </button>
      </div>}
      <form onSubmit={submit}>
        <div className="auth-fields">
          {mode !== 'signin' && mode !== 'forgot' && <>
            <input className="modal-input" name="name" autoComplete="name" placeholder="Full name" value={name} onChange={event => setName(event.target.value)} required/>
            <input className="modal-input" name="username" autoComplete="username" placeholder="Username" value={username} onChange={event => setUsername(event.target.value)} required/>
          </>}
          <input className="modal-input" type="email" name="email" autoComplete="email" placeholder="Email" value={email} onChange={event => setEmail(event.target.value)} required/>
          {mode !== 'forgot' && <span className="auth-password-field">
            <input className="modal-input auth-password-input" type={showPassword ? 'text' : 'password'} name="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} placeholder="Password (8+ characters)" value={password} onChange={event => setPassword(event.target.value)} minLength={mode === 'signin' ? undefined : 8} required/>
            <button className="auth-password-toggle" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onPointerDown={event => event.preventDefault()} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button>
          </span>}
        </div>
        <button className="btn btn-primary modal-submit" type="submit" disabled={submitting}>
          {submitting ? 'Please wait…' : mode === 'forgot' ? 'Send reset link' : mode === 'signin' ? 'Sign in' : 'Sign up'} <ArrowRight size={15}/>
        </button>
      </form>
      {mode === 'signin' && <button type="button" className="switch-mode" onClick={() => { setMode('forgot'); setNotice(''); setError(''); }}>Forgot Password?</button>}
      {mode === 'forgot' && <button type="button" className="switch-mode" onClick={closeForgot}>Back to sign in</button>}
      {mode !== 'forgot' && <button type="button" className="switch-mode" onClick={() => {
        if (mode === 'signin') {
          setMode(accountType);
          setNotice('');
          setError('');
        } else {
          setAccountType(mode);
          setMode('signin');
          setNotice('');
          setError('');
        }
      }}>{mode === 'signin' ? 'Don’t have an account? Sign Up' : 'Already have an account? Sign In'}</button>}
    </div>
  </div>;
}
