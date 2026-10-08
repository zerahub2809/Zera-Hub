import { FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, Lock } from 'lucide-react';
import { assessPassword } from './passwordPolicy';
import './auth.css';

const API = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? 'https://zera-hub-api.onrender.com' : 'http://localhost:4000');

export function PasswordResetPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const token = searchParams.get('token') || '';
  const passwordAssessment = assessPassword(password);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    if (password !== confirmation) {
      setError('The passwords do not match.');
      return;
    }
    if (!passwordAssessment.valid) {
      setError('Choose a password that meets the strength requirements.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch(`${API}/api/auth/password-reset/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'The password could not be reset.');
      setComplete(true);
      window.setTimeout(() => navigate('/'), 1500);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The password could not be reset.');
    } finally {
      setSubmitting(false);
    }
  };

  return <main className="page"><div className="container page-inner">
    <div className="platform-card auth-reset-card">
      <Lock size={24}/>
      <h1>Set a new password</h1>
      {!token ? <p className="platform-error" role="alert">This reset link is missing its token. Request a new link from sign in.</p>
        : complete ? <p className="auth-notice" role="status">Your password was reset. Return to sign in.</p>
          : <form onSubmit={submit}>
            <label>New password<span className="auth-reset-password-field">
              <input className="auth-reset-password-input" type={showPassword ? 'text' : 'password'} autoComplete="new-password" autoCapitalize="none" spellCheck={false} minLength={12} required value={password} onChange={event => setPassword(event.target.value)}/>
              <button className="auth-reset-password-toggle" type="button" aria-label={showPassword ? 'Hide new password' : 'Show new password'} aria-pressed={showPassword} onPointerDown={event => event.preventDefault()} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button>
            </span></label>
            {password && <div className={`password-strength password-strength-${passwordAssessment.strength.toLowerCase()}`} aria-live="polite">
              <span>Password strength: <b>{passwordAssessment.strength}</b></span>
              <small>{passwordAssessment.feedback}</small>
            </div>}
            <label>Confirm new password<span className="auth-reset-password-field">
              <input className="auth-reset-password-input" type={showConfirmation ? 'text' : 'password'} autoComplete="new-password" autoCapitalize="none" spellCheck={false} minLength={12} required value={confirmation} onChange={event => setConfirmation(event.target.value)}/>
              <button className="auth-reset-password-toggle" type="button" aria-label={showConfirmation ? 'Hide confirmation password' : 'Show confirmation password'} aria-pressed={showConfirmation} onPointerDown={event => event.preventDefault()} onClick={() => setShowConfirmation(value => !value)}>{showConfirmation ? <EyeOff size={18}/> : <Eye size={18}/>}</button>
            </span></label>
            {error && <p className="platform-error" role="alert">{error}</p>}
            <button className="btn btn-primary" type="submit" disabled={submitting || !passwordAssessment.valid}>{submitting ? 'Updating…' : 'Update password'} <ArrowRight size={15}/></button>
          </form>}
      <Link to="/">Return to ZERA HUB</Link>
    </div>
  </div></main>;
}
