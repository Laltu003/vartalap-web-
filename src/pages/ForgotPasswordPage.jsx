import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { generateOtp, sendOtpEmail } from '../utils/emailOtp';
import toast from 'react-hot-toast';
import logo from '../assets/logo.svg';

const errorToast = { style: { background: '#c0392b', color: '#fff', fontSize: '14px', borderRadius: '10px' } };

export default function ForgotPasswordPage() {
  const { resolveEmailFromIdentifier, sendPasswordReset } = useAuth();

  const [step, setStep] = useState('identify'); // 'identify' | 'otp' | 'done'
  const [identifier, setIdentifier] = useState('');
  const [resolvedEmail, setResolvedEmail] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [generatedOtp, setGeneratedOtp] = useState(null);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  async function handleIdentify(e) {
    e.preventDefault();
    if (!identifier.trim()) {
      toast.error('Please enter your username or email');
      return;
    }
    setLoading(true);
    try {
      const email = await resolveEmailFromIdentifier(identifier);
      if (!email) {
        toast.error('No account found with that username or email', errorToast);
        return;
      }

      const code = generateOtp();
      await sendOtpEmail(email, identifier, code);
      setResolvedEmail(email);
      setGeneratedOtp(code);
      setStep('otp');
      setResendCooldown(30);
      toast.success(`Verification code sent to ${email}`);
    } catch (err) {
      console.error(err);
      toast.error('Something went wrong. Please try again.', errorToast);
    } finally {
      setLoading(false);
    }
  }

  async function handleResendOtp() {
    if (resendCooldown > 0) return;
    setLoading(true);
    try {
      const code = generateOtp();
      await sendOtpEmail(resolvedEmail, identifier, code);
      setGeneratedOtp(code);
      setResendCooldown(30);
      toast.success('New code sent!');
    } catch {
      toast.error('Failed to resend code.', errorToast);
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
      await sendPasswordReset(resolvedEmail);
      setStep('done');
    } catch (err) {
      console.error(err);
      toast.error('Could not send the reset link. Please try again.', errorToast);
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

        {step === 'identify' && (
          <>
            <h1 className="auth-title">Reset your password</h1>
            <p className="auth-subtitle">Enter your username or email to get started</p>

            <form className="auth-form" onSubmit={handleIdentify}>
              <div className="form-group">
                <label className="form-label">Username or Email</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="your_username or you@example.com"
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  autoCapitalize="none"
                  autoFocus
                />
              </div>

              <button className="btn-primary" type="submit" disabled={loading}>
                {loading ? 'Sending code…' : 'Send verification code'}
              </button>
            </form>

            <p className="auth-switch">
              <Link to="/login">← Back to sign in</Link>
            </p>
          </>
        )}

        {step === 'otp' && (
          <>
            <h1 className="auth-title">Verify it's you</h1>
            <p className="auth-subtitle">
              We sent a 6-digit code to<br /><strong>{resolvedEmail}</strong>
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
                {verifying ? 'Verifying…' : 'Verify'}
              </button>
            </form>

            <p className="auth-switch">
              Didn't get the code?{' '}
              {resendCooldown > 0
                ? <span style={{ color: 'var(--text-muted)' }}>Resend in {resendCooldown}s</span>
                : <a onClick={handleResendOtp}>Resend code</a>}
            </p>
            <p className="auth-switch">
              <a onClick={() => setStep('identify')}>← Edit username/email</a>
            </p>
          </>
        )}

        {step === 'done' && (
          <>
            <h1 className="auth-title">Check your email 📬</h1>
            <p className="auth-subtitle">
              We've sent a password reset link to<br /><strong>{resolvedEmail}</strong>
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', marginTop: 16, lineHeight: 1.6 }}>
              Open that email and click the link to set a new password. Once you're done, come back here and sign in.
            </p>

            <p className="auth-switch" style={{ marginTop: 24 }}>
              <Link to="/login">← Back to sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
