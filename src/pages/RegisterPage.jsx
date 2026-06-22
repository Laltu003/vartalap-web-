import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { generateOtp, sendOtpEmail } from '../utils/emailOtp';
import toast from 'react-hot-toast';
import logo from '../assets/logo.svg';

const errorToast = { style: { background: '#c0392b', color: '#fff', fontSize: '14px', borderRadius: '10px' } };

export default function RegisterPage() {
  const { isUsernameAvailable, completeRegistration } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef();

  const [step, setStep] = useState('details'); // 'details' | 'otp'
  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '' });
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  // OTP state
  const [otpInput, setOtpInput] = useState('');
  const [generatedOtp, setGeneratedOtp] = useState(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  function handleAvatarChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB', errorToast);
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  function validate() {
    const e = {};
    if (!form.username.trim()) e.username = 'Username is required';
    else if (form.username.length < 3) e.username = 'Username must be 3+ characters';
    else if (!/^[a-zA-Z0-9_.]+$/.test(form.username)) e.username = 'Only letters, numbers, _ and . allowed';
    if (!form.email.trim()) e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Enter a valid email';
    if (!form.password) e.password = 'Password is required';
    else if (form.password.length < 6) e.password = 'Password must be 6+ characters';
    if (form.password !== form.confirm) e.confirm = "Passwords don't match";
    return e;
  }

  async function handleSendOtp(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setLoading(true);
    try {
      const available = await isUsernameAvailable(form.username);
      if (!available) {
        setErrors({ username: 'This username is already taken' });
        setLoading(false);
        return;
      }

      const code = generateOtp();
      await sendOtpEmail(form.email, form.username, code);
      setGeneratedOtp(code);
      setStep('otp');
      setResendCooldown(30);
      toast.success(`OTP sent to ${form.email}`);
    } catch (err) {
      console.error(err);
      toast.error('Could not send verification email. Please try again.', errorToast);
    } finally {
      setLoading(false);
    }
  }

  async function handleResendOtp() {
    if (resendCooldown > 0) return;
    setLoading(true);
    try {
      const code = generateOtp();
      await sendOtpEmail(form.email, form.username, code);
      setGeneratedOtp(code);
      setResendCooldown(30);
      toast.success('New OTP sent!');
    } catch {
      toast.error('Failed to resend OTP.', errorToast);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e) {
    e.preventDefault();
    if (otpInput.trim() !== generatedOtp) {
      toast.error('Incorrect code. Please try again.', errorToast);
      return;
    }
    setVerifying(true);
    try {
      await completeRegistration({
        email: form.email,
        password: form.password,
        username: form.username,
        avatarFile,
      });
      toast.success('Account created! Welcome 🎉');
      navigate('/');
    } catch (err) {
      console.error(err);
      const msg = err.code === 'auth/email-already-in-use'
        ? 'This email is already registered.'
        : err.message === 'username-taken'
        ? 'That username was just taken. Please go back and pick another.'
        : 'Registration failed. Please try again.';
      toast.error(msg, errorToast);
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon"><img src={logo} alt="VartaLap" /></div>
          <span className="auth-logo-text">VartaLap</span>
        </div>

        {step === 'details' && (
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
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  className="avatar-upload-btn"
                  onClick={() => fileRef.current.click()}
                >
                  📷 Upload photo (optional)
                </button>
              </div>

              <div className="form-group">
                <label className="form-label">Username</label>
                <input
                  className={`form-input ${errors.username ? 'error' : ''}`}
                  type="text"
                  placeholder="e.g. laltu_003"
                  value={form.username}
                  onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
                  autoCapitalize="none"
                />
                {errors.username && <span className="form-error">{errors.username}</span>}
              </div>

              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  className={`form-input ${errors.email ? 'error' : ''}`}
                  type="email"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                />
                {errors.email && <span className="form-error">{errors.email}</span>}
              </div>

              <div className="form-group">
                <label className="form-label">Password</label>
                <input
                  className={`form-input ${errors.password ? 'error' : ''}`}
                  type="password"
                  placeholder="Min 6 characters"
                  value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                />
                {errors.password && <span className="form-error">{errors.password}</span>}
              </div>

              <div className="form-group">
                <label className="form-label">Confirm Password</label>
                <input
                  className={`form-input ${errors.confirm ? 'error' : ''}`}
                  type="password"
                  placeholder="Repeat password"
                  value={form.confirm}
                  onChange={e => setForm(p => ({ ...p, confirm: e.target.value }))}
                />
                {errors.confirm && <span className="form-error">{errors.confirm}</span>}
              </div>

              <button className="btn-primary" type="submit" disabled={loading}>
                {loading ? 'Sending code…' : 'Send verification code'}
              </button>
            </form>

            <p className="auth-switch">
              Already have an account?{' '}
              <Link to="/login">Sign in</Link>
            </p>
          </>
        )}

        {step === 'otp' && (
          <>
            <h1 className="auth-title">Verify your email</h1>
            <p className="auth-subtitle">
              We sent a 6-digit code to<br /><strong>{form.email}</strong>
            </p>

            <form className="auth-form" onSubmit={handleVerifyOtp}>
              <div className="form-group">
                <label className="form-label">Verification code</label>
                <input
                  className="form-input"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="••••••"
                  value={otpInput}
                  onChange={e => setOtpInput(e.target.value.replace(/\D/g, ''))}
                  style={{ textAlign: 'center', fontSize: 22, letterSpacing: 6 }}
                  autoFocus
                />
              </div>

              <button className="btn-primary" type="submit" disabled={verifying || otpInput.length !== 6}>
                {verifying ? 'Verifying…' : 'Verify & create account'}
              </button>
            </form>

            <p className="auth-switch">
              Didn't get the code?{' '}
              {resendCooldown > 0
                ? <span style={{ color: 'var(--text-muted)' }}>Resend in {resendCooldown}s</span>
                : <a onClick={handleResendOtp}>Resend code</a>}
            </p>
            <p className="auth-switch">
              <a onClick={() => setStep('details')}>← Edit details</a>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
