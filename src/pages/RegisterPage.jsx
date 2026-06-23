import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { sendOtpEmail, verifyOtp } from '../utils/otpService';
import { checkUsernameAvailable, normalizeUsername } from '../hooks/useChat';
import { useDebounce } from '../hooks/useDebounce';
import toast from 'react-hot-toast';

const errStyle = { style: { background: '#c0392b', color: '#fff', fontSize: '14px', borderRadius: '10px' } };

// Allowed: letters, numbers, underscore, dot — same family as Instagram usernames
const USERNAME_REGEX = /^[a-zA-Z0-9_.]{3,20}$/;

// step: 'form' → 'otp' → done
export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef();
  const otpRefs = useRef([]);

  const [step, setStep] = useState('form');
  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '' });
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [errors, setErrors] = useState({});
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpError, setOtpError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [debugError, setDebugError] = useState(null);

  // ── Username availability state ──────────────────────────
  // status: 'idle' | 'checking' | 'available' | 'taken' | 'invalid'
  const [usernameStatus, setUsernameStatus] = useState('idle');
  const debouncedUsername = useDebounce(form.username, 450);

  useEffect(() => {
    const raw = debouncedUsername.trim();
    if (!raw) { setUsernameStatus('idle'); return; }
    if (!USERNAME_REGEX.test(raw)) { setUsernameStatus('invalid'); return; }

    let cancelled = false;
    setUsernameStatus('checking');
    checkUsernameAvailable(raw).then(isAvailable => {
      if (cancelled) return;
      setUsernameStatus(isAvailable ? 'available' : 'taken');
    }).catch(() => {
      if (!cancelled) setUsernameStatus('idle');
    });

    return () => { cancelled = true; };
  }, [debouncedUsername]);

  function handleAvatarChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Image must be under 2MB', errStyle); return; }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  function validate() {
    const e = {};
    const uname = form.username.trim();
    if (!uname) e.username = 'Username is required';
    else if (!USERNAME_REGEX.test(uname)) e.username = '3-20 chars: letters, numbers, _ or . only';
    else if (usernameStatus === 'taken') e.username = 'Username already taken';
    else if (usernameStatus === 'checking') e.username = 'Still checking availability…';

    if (!form.email.trim()) e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Enter a valid email';

    if (!form.password) e.password = 'Password is required';
    else if (form.password.length < 6) e.password = 'Min 6 characters';
    if (form.password !== form.confirm) e.confirm = "Passwords don't match";
    return e;
  }

  // Step 1: Validate form → send OTP
  async function handleSendOtp(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setLoading(true);
    try {
      // Final race-condition guard right before OTP is sent
      const stillAvailable = await checkUsernameAvailable(form.username.trim());
      if (!stillAvailable) {
        setErrors({ username: 'Username was just taken — try another' });
        setUsernameStatus('taken');
        setLoading(false);
        return;
      }
      await sendOtpEmail(form.email, form.username);
      setStep('otp');
      toast.success(`OTP sent to your email 📧`);
      startResendTimer();
      setTimeout(() => otpRefs.current[0]?.focus(), 200);
    } catch (err) {
      console.error('OTP Send Error:', err);
      // Dump every possible field — EmailJS errors can carry the real
      // message in different places depending on failure type (status,
      // text, message, or just a plain string).
      const fullDump = {
        status: err?.status,
        text: err?.text,
        message: err?.message,
        name: err?.name,
        stack: err?.stack,
        stringified: (() => { try { return JSON.stringify(err); } catch { return 'unstringifiable'; } })(),
        toString: (() => { try { return String(err); } catch { return 'unstringable'; } })(),
      };
      setDebugError(fullDump);
      toast.error('OTP send failed — see details below', { ...errStyle, duration: 5000 });
    } finally { setLoading(false); }
  }

  // Step 2: Verify OTP → create Firebase account
  async function handleVerify() {
    const code = otp.join('');
    if (code.length < 6) { setOtpError('Enter full 6-digit OTP'); return; }

    // Debug: show exactly what we're checking against
    console.log('Verifying OTP for email:', JSON.stringify(form.email));
    console.log('localStorage OTP store:', localStorage.getItem('vartalap_otp_store'));

    const result = verifyOtp(form.email, code);
    if (!result.valid) {
      setOtpError(`${result.reason} (checking: "${form.email}")`);
      setOtp(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
      return;
    }
    setOtpError('');
    setLoading(true);
    try {
      await register(form.username.trim(), form.email, form.password, avatarFile);
      toast.success('Account created! Welcome 🎉');
      navigate('/');
    } catch (err) {
      console.error(err);
      let msg = 'Registration failed. Try again.';
      if (err.code === 'auth/email-already-in-use') msg = 'Email already registered.';
      else if (err.code === 'auth/username-taken') msg = 'Username was just taken — try another.';
      toast.error(msg, errStyle);
      if (err.code === 'auth/username-taken') setStep('form');
    } finally { setLoading(false); }
  }

  async function handleResend() {
    setLoading(true);
    try {
      await sendOtpEmail(form.email, form.username);
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

  // ── Username field visual indicator ──────────────────────
  function renderUsernameIndicator() {
    if (!form.username.trim()) return null;
    switch (usernameStatus) {
      case 'checking':
        return <span className="username-indicator checking">Checking…</span>;
      case 'available':
        return <span className="username-indicator available">✅ Available</span>;
      case 'taken':
        return <span className="username-indicator taken">❌ Taken</span>;
      case 'invalid':
        return <span className="username-indicator invalid">⚠️ Invalid format</span>;
      default:
        return null;
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
            <h1 className="auth-title">Create account</h1>
            <p className="auth-subtitle">Start chatting with your friends</p>

            <form className="auth-form" onSubmit={handleSendOtp}>
              <div className="avatar-upload">
                <div className="avatar-preview">
                  {avatarPreview
                    ? <img src={avatarPreview} alt="avatar" />
                    : <div className="avatar-placeholder">👤</div>}
                </div>
                <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatarChange} style={{ display: 'none' }} />
                <button type="button" className="avatar-upload-btn" onClick={() => fileRef.current.click()}>
                  📷 Upload photo (optional)
                </button>
              </div>

              <div className="form-group">
                <label className="form-label">Username</label>
                <div className={`username-input-wrapper ${errors.username || usernameStatus === 'taken' || usernameStatus === 'invalid' ? 'has-error' : ''} ${usernameStatus === 'available' ? 'has-success' : ''}`}>
                  <span className="username-at-prefix">@</span>
                  <input
                    className={`username-input ${errors.username || usernameStatus === 'taken' || usernameStatus === 'invalid' ? 'error' : ''} ${usernameStatus === 'available' ? 'success' : ''}`}
                    type="text"
                    placeholder="yourname"
                    value={form.username}
                    onChange={e => setForm(p => ({ ...p, username: e.target.value.replace(/\s/g, '') }))}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck="false"
                  />
                </div>
                {renderUsernameIndicator()}
                {errors.username && <span className="form-error">{errors.username}</span>}
                <span className="form-hint">This is how others will find and identify you</span>
              </div>

              <div className="form-group">
                <label className="form-label">Email</label>
                <input className={`form-input ${errors.email ? 'error' : ''}`} type="email" placeholder="you@example.com"
                  value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
                {errors.email && <span className="form-error">{errors.email}</span>}
                <span className="form-hint">Used only for account security & verification — never shown publicly</span>
              </div>

              <div className="form-group">
                <label className="form-label">Password</label>
                <input className={`form-input ${errors.password ? 'error' : ''}`} type="password" placeholder="Min 6 characters"
                  value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} />
                {errors.password && <span className="form-error">{errors.password}</span>}
              </div>

              <div className="form-group">
                <label className="form-label">Confirm Password</label>
                <input className={`form-input ${errors.confirm ? 'error' : ''}`} type="password" placeholder="Repeat password"
                  value={form.confirm} onChange={e => setForm(p => ({ ...p, confirm: e.target.value }))} />
                {errors.confirm && <span className="form-error">{errors.confirm}</span>}
              </div>

              <button className="btn-primary" type="submit" disabled={loading || usernameStatus === 'checking'}>
                {loading ? 'Sending OTP…' : 'Send OTP to Email'}
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
            <h1 className="auth-title">Verify Email</h1>
            <p className="auth-subtitle">Enter the 6-digit code sent to</p>
            <p className="otp-email-display">{form.email}</p>

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
                {loading ? 'Creating account…' : 'Verify & Create Account'}
              </button>

              <div className="otp-resend-row">
                {resendTimer > 0
                  ? <span className="otp-timer">Resend in {resendTimer}s</span>
                  : <button className="btn-ghost" onClick={handleResend} disabled={loading} type="button">
                      Resend OTP
                    </button>
                }
                <button className="btn-ghost" onClick={() => { setStep('form'); setOtp(['','','','','','']); setOtpError(''); }} type="button">
                  ← Edit details
                </button>
              </div>
            </div>
          </>
        )}

        <p className="auth-switch">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
