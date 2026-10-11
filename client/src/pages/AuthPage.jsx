import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import './AuthPage.css';

export default function AuthPage() {
  const { user, loading, login, register } = useAuth();
  const [mode, setMode] = useState('login');

  // Already logged in — send to app
  if (!loading && user) return <Navigate to="/" replace />;

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-brand__icon" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="32" height="32" rx="8" fill="currentColor" />
              <path d="M8 10h16v10a2 2 0 01-2 2H10a2 2 0 01-2-2V10z"
                fill="white" fillOpacity="0.9"/>
              <circle cx="12" cy="15" r="1.5" fill="currentColor"/>
              <circle cx="16" cy="15" r="1.5" fill="currentColor"/>
              <circle cx="20" cy="15" r="1.5" fill="currentColor"/>
            </svg>
          </div>
          <h1 className="auth-brand__name">PulseChat</h1>
          <p className="auth-brand__tagline">Real-time messaging for everyone</p>
        </div>

        <div className="auth-tabs" role="tablist">
          <button role="tab" aria-selected={mode === 'login'}
            className={`auth-tab ${mode === 'login' ? 'auth-tab--active' : ''}`}
            onClick={() => setMode('login')}>
            Sign in
          </button>
          <button role="tab" aria-selected={mode === 'register'}
            className={`auth-tab ${mode === 'register' ? 'auth-tab--active' : ''}`}
            onClick={() => setMode('register')}>
            Create account
          </button>
        </div>

        {mode === 'login'
          ? <LoginForm login={login} />
          : <RegisterForm register={register} />}
      </div>
    </div>
  );
}

// ── Login form ────────────────────────────────────────────────────────────────
function LoginForm({ login }) {
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleChange = (e) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(form);
      // Navigation is handled by the auth guard in AppLayout
    } catch (err) {
      setError(err.message || 'Login failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      {error && <p className="form-error form-error--banner" role="alert">{error}</p>}

      <div className="form-group">
        <label htmlFor="login-email" className="form-label">Email</label>
        <input id="login-email" name="email" type="email" className="form-input"
          placeholder="you@example.com" autoComplete="email"
          value={form.email} onChange={handleChange} required />
      </div>

      <div className="form-group">
        <label htmlFor="login-password" className="form-label">Password</label>
        <input id="login-password" name="password" type="password" className="form-input"
          placeholder="••••••••" autoComplete="current-password"
          value={form.password} onChange={handleChange} required />
      </div>

      <button type="submit" className="btn btn--primary btn--full" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

// ── Register form ─────────────────────────────────────────────────────────────
function RegisterForm({ register }) {
  const [form, setForm] = useState({
    displayName: '', email: '', username: '', password: '', confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const handleChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setFieldErrors((fe) => ({ ...fe, [e.target.name]: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    if (form.password !== form.confirmPassword) {
      setFieldErrors({ confirmPassword: 'Passwords do not match.' });
      return;
    }

    setBusy(true);
    try {
      await register({
        email: form.email,
        username: form.username,
        password: form.password,
        displayName: form.displayName,
      });
    } catch (err) {
      if (err.errors?.length) {
        const fe = {};
        err.errors.forEach(({ field, message }) => { fe[field] = message; });
        setFieldErrors(fe);
      } else {
        setError(err.message || 'Registration failed.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      {error && <p className="form-error form-error--banner" role="alert">{error}</p>}

      <div className="form-group">
        <label htmlFor="reg-displayName" className="form-label">Display name</label>
        <input id="reg-displayName" name="displayName" type="text" className="form-input"
          placeholder="Your name" autoComplete="name"
          value={form.displayName} onChange={handleChange} />
        {fieldErrors.displayName && <span className="form-error">{fieldErrors.displayName}</span>}
      </div>

      <div className="form-group">
        <label htmlFor="reg-email" className="form-label">Email</label>
        <input id="reg-email" name="email" type="email"
          className={`form-input ${fieldErrors.email ? 'is-error' : ''}`}
          placeholder="you@example.com" autoComplete="email"
          value={form.email} onChange={handleChange} required />
        {fieldErrors.email && <span className="form-error">{fieldErrors.email}</span>}
      </div>

      <div className="form-group">
        <label htmlFor="reg-username" className="form-label">Username</label>
        <input id="reg-username" name="username" type="text"
          className={`form-input ${fieldErrors.username ? 'is-error' : ''}`}
          placeholder="yourname" autoComplete="username"
          value={form.username} onChange={handleChange} required />
        <span className="form-hint">3–30 chars · letters, numbers, _ . -</span>
        {fieldErrors.username && <span className="form-error">{fieldErrors.username}</span>}
      </div>

      <div className="form-group">
        <label htmlFor="reg-password" className="form-label">Password</label>
        <input id="reg-password" name="password" type="password"
          className={`form-input ${fieldErrors.password ? 'is-error' : ''}`}
          placeholder="Min 8 chars, 1 uppercase, 1 number"
          autoComplete="new-password"
          value={form.password} onChange={handleChange} required />
        {fieldErrors.password && <span className="form-error">{fieldErrors.password}</span>}
      </div>

      <div className="form-group">
        <label htmlFor="reg-confirm" className="form-label">Confirm password</label>
        <input id="reg-confirm" name="confirmPassword" type="password"
          className={`form-input ${fieldErrors.confirmPassword ? 'is-error' : ''}`}
          placeholder="••••••••" autoComplete="new-password"
          value={form.confirmPassword} onChange={handleChange} required />
        {fieldErrors.confirmPassword && <span className="form-error">{fieldErrors.confirmPassword}</span>}
      </div>

      <button type="submit" className="btn btn--primary btn--full" disabled={busy}>
        {busy ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  );
}
