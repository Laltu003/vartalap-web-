import { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { sendOtpEmail, verifyOtp } from '../utils/otpService';
import toast from 'react-hot-toast';

const errStyle = { style: { background: '#c0392b', color: '#fff', fontSize: '14px', borderRadius: '10px' } };

// step: 'form' → 'otp' → done
export default function LoginPage() {
  const { login, verifyCredentialsOnly } = useAuth();
  const navigate = useNavigate();
  const otpRefs = useRef([]);

  const [step, setStep] = useState('form');
  const [form, setForm] = useState({ username: '', password: '' });
  const [resolvedEmail, setResolvedEmail] = useState(''); // internal only, never shown
  const [errors, setErrors] = useState({});
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpError, setOtpError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [debugError, setDebugError] = useState(null);

  function validate() {
    const e = {};
    if (!form.username.trim()) e.username = 'Username is required';
    if (!form.password) e.password = 'Password is required';
    else if (form.password.length < 6) e.password = 'Min 6 characters';
    return e;
  }

  // Step 1: Verify username+password (no session created yet) → send OTP
  async function handleSendOtp(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setLoading(true);
    try {
      // Validates credentials without leaving the user signed in.
      // The real session only starts after OTP is verified below.
      const { email } = await verifyCredentialsOnly(form.username.trim(), form.password);

      setResolvedEmail(email);
      await sendOtpEmail(email);
      setStep('otp');
      toast.success(`OTP sent to your registered email 📧`);
      startResendTimer();
      setTimeout(() => otpRefs.current[0]?.focus(), 200);
    } catch (err) {
      console.error(err);
      const fullDump = {
        code: err?.code,
        message: err?.message,
        name: err?.name,
        stringified: (() => { try { return JSON.stringify(err); } catch { return 'unstringifiable'; } })(),
      };
      setDebugError(fullDump);
      if (['auth/user-not-found', 'auth/wrong-password', 'auth/invalid-credential'].includes(err.code)) {
        setErrors({ password: 'Invalid username or password' });
      } else {
        toast.error('Login failed — see details below', errStyle);
      }
    } finally { setLoading(false); }
  }

  // Step 2: Verify OTP → THEN actually sign in (real session starts here)
  async function handleVerify() {
    const code = otp.join('');
    if (code.length < 6) { setOtpError('Enter full 6-digit OTP'); return; }
    const result = verifyOtp(resolvedEmail, code);
    if (!result.valid) {
      setOtpError(result.reason);
      setOtp(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
      return;
    }
    setLoading(true);
    try {
      await login(form.username.trim(), form.password);
      toast.success('Welcome back! 🎉');
      navigate('/');
    } catch (err) {
      console.error(err);
      toast.error('Sign in failed. Try again.', errStyle);
    } finally { setLoading(false); }
  }

  async function handleResend() {
    setLoading(true);
    try {
      await sendOtpEmail(resolvedEmail);
      setOtp(['', '', '', '', '', '']);
      setOtpError('');
      toast.success('New OTP sent! 📧');
      startResendTimer();
      otpRefs.current[0]?.focus();
    } catch {
      toast.error('Failed to resend. Try again.', errStyle);
    } finally { setLoading(false); }
  }

  function startResendTimer() {
    setResendTimer(30);
    const iv = setInterval(() => {
      setResendTimer(t => { if (t <= 1) { clearInterval(iv); return 0; } return t - 1; });
    }, 1000);
  }

  function handleOtpChange(idx, val) {
    if (!/^\d?$/.test(val)) return;
    const next = [...otp];
    next[idx] = val;
    setOtp(next);
    if (val && idx < 5) otpRefs.current[idx + 1]?.focus();
  }

  function handleOtpKeyDown(idx, e) {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) {
      otpRefs.current[idx - 1]?.focus();
    }
  }

  function handleOtpPaste(e) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setOtp(pasted.split(''));
      otpRefs.current[5]?.focus();
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon">💬</div>
          <span className="auth-logo-text">VartaLap</span>
        </div>

        {step === 'form' ? (
          <>
            <h1 className="auth-title">Welcome back</h1>
            <p className="auth-subtitle">Sign in to continue chatting</p>

            <form className="auth-form" onSubmit={handleSendOtp}>
              <div className="form-group">
                <label className="form-label">Username</label>
                <div className={`username-input-wrapper ${errors.username ? 'has-error' : ''}`}>
                  <span className="username-at-prefix">@</span>
                  <input
                    className={`username-input ${errors.username ? 'error' : ''}`}
                    type="text"
                    placeholder="yourname"
                    value={form.username}
                    onChange={e => setForm(p => ({ ...p, username: e.target.value.replace(/\s/g, '') }))}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck="false"
                    autoComplete="username"
                  />
                </div>
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
              </div>

              <button className="btn-primary" type="submit" disabled={loading}>
                {loading ? 'Verifying…' : 'Continue'}
              </button>
            </form>

            {debugError && (
              <div style={{
                marginTop: 16,
                padding: 12,
                background: '#2a1515',
                border: '1px solid #c0392b',
                borderRadius: 8,
                fontSize: 11,
                color: '#ffcccc',
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap',
                maxHeight: 300,
                overflowY: 'auto',
              }}>
                <strong style={{ color: '#fff', display: 'block', marginBottom: 6 }}>
                  Debug — full error details:
                </strong>
                {JSON.stringify(debugError, null, 2)}
              </div>
            )}
          </>
        ) : (
          <>
            <h1 className="auth-title">Check your email</h1>
            <p className="auth-subtitle">Enter the 6-digit code we sent</p>

            <div className="auth-form">
              <div className="form-group">
                <label className="form-label">OTP Code</label>
                <div className="otp-boxes" onPaste={handleOtpPaste}>
                  {otp.map((digit, i) => (
                    <input
                      key={i}
                      ref={el => otpRefs.current[i] = el}
                      className={`otp-box ${otpError ? 'error' : ''}`}
                      type="tel"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={e => handleOtpChange(i, e.target.value)}
                      onKeyDown={e => handleOtpKeyDown(i, e)}
                    />
                  ))}
                </div>
                {otpError && <span className="form-error" style={{ textAlign: 'center', display: 'block', marginTop: '8px' }}>{otpError}</span>}
              </div>

              <button className="btn-primary" onClick={handleVerify} disabled={loading} type="button">
                {loading ? 'Verifying…' : 'Verify & Sign in'}
              </button>

              <div className="otp-resend-row">
                {resendTimer > 0
                  ? <span className="otp-timer">Resend in {resendTimer}s</span>
                  : <button className="btn-ghost" onClick={handleResend} disabled={loading} type="button">
                      Resend OTP
                    </button>
                }
                <button className="btn-ghost" onClick={() => { setStep('form'); setOtp(['','','','','','']); setOtpError(''); }} type="button">
                  ← Back
                </button>
              </div>
            </div>
          </>
        )}

        <p className="auth-switch">
          Don't have an account? <Link to="/register">Create account</Link>
        </p>
      </div>
    </div>
  );
}
