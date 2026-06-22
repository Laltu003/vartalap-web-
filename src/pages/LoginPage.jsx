import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import logo from '../assets/logo.svg';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  function validate() {
    const e = {};
    if (!form.username.trim()) e.username = 'Username is required';
    if (!form.password) e.password = 'Password is required';
    else if (form.password.length < 6) e.password = 'Password must be 6+ characters';
    return e;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setLoading(true);
    try {
      await login(form.username, form.password);
      navigate('/');
    } catch (err) {
      const msg = err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential'
        ? 'Invalid username or password'
        : 'Login failed. Please try again.';
      toast.error(msg, { style: { background: '#c0392b', color: '#fff', fontSize: '14px', borderRadius: '10px' } });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon"><img src={logo} alt="VartaLap" /></div>
          <span className="auth-logo-text">VartaLap</span>
        </div>
        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-subtitle">Sign in to continue chatting</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Username</label>
            <input
              className={`form-input ${errors.username ? 'error' : ''}`}
              type="text"
              placeholder="your_username"
              value={form.username}
              onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
              autoCapitalize="none"
              autoComplete="username"
            />
            {errors.username && <span className="form-error">{errors.username}</span>}
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              className={`form-input ${errors.password ? 'error' : ''}`}
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
              autoComplete="current-password"
            />
            {errors.password && <span className="form-error">{errors.password}</span>}
            <div style={{ textAlign: 'right', marginTop: 4 }}>
              <Link to="/forgot-password" style={{ fontSize: 13, color: 'var(--teal-700)', fontWeight: 500, textDecoration: 'none' }}>
                Forgot password?
              </Link>
            </div>
          </div>

          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="auth-switch">
          Don't have an account?{' '}
          <Link to="/register">Create account</Link>
        </p>
      </div>
    </div>
  );
}
