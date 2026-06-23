// ============================================================
// otpService.js — Custom 6-digit Email OTP via EmailJS
// Free plan: 200 emails/month
// Setup: https://www.emailjs.com
// ============================================================

// 🔧 REPLACE THESE with your EmailJS credentials
const EMAILJS_SERVICE_ID  = 'service_835k5l3';
const EMAILJS_TEMPLATE_ID = 'template_ywob9iv';
const EMAILJS_PUBLIC_KEY  = 'di9KeRD5MCZIEOy0u';

const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const STORAGE_KEY = 'vartalap_otp_store';

// In-memory store { email -> { otp, expiresAt } } — mirrored to
// localStorage so it survives page reloads/tab switches (e.g. when the
// user briefly leaves the tab to check their email app for the code).
const otpStore = new Map();

function loadStoreFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const now = Date.now();
    Object.entries(parsed).forEach(([key, value]) => {
      if (value.expiresAt > now) otpStore.set(key, value);
    });
  } catch { /* ignore corrupt storage */ }
}

function saveStoreToStorage() {
  try {
    const obj = {};
    otpStore.forEach((value, key) => { obj[key] = value; });
    console.log('[OTP DEBUG] Saving to localStorage:', JSON.stringify(obj), '| Map size:', otpStore.size);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch { /* ignore storage quota errors */ }
}

// Load any previously-stored OTPs on module init
loadStoreFromStorage();
console.log('[OTP DEBUG] Module loaded. Store size after load:', otpStore.size, '| Contents:', JSON.stringify(Array.from(otpStore.entries())));

export function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function sendOtpEmail(toEmail, toName = '') {
  const otp = generateOtp();
  const expiresAt = Date.now() + OTP_EXPIRY_MS;
  otpStore.set(toEmail.toLowerCase(), { otp, expiresAt });
  saveStoreToStorage();

  if (!window.emailjs) await loadEmailJS();

  // Explicitly initialize with the public key first — passing it only as
  // the 4th argument to .send() is unreliable across @emailjs/browser
  // versions and can cause "permission denied" / empty recipient errors.
  if (!window._emailjsInitialized) {
    window.emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
    window._emailjsInitialized = true;
  }

  const templateParams = {
    // Both keys are sent because the EmailJS template's "To Email" field
    // must use {{email}} to match exactly — sending only "to_email" caused
    // a 422 "recipients address is empty" error even though the value was
    // present, since EmailJS only resolves a variable if its name matches
    // the template's "To Email" field literally, character-for-character.
    email: toEmail,
    to_email: toEmail,
    to_name: toName || toEmail.split('@')[0],
    otp_code: otp,
    expiry_minutes: '5',
    app_name: 'VartaLap',
  };

  try {
    await window.emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams);
  } catch (err) {
    // Surface the real EmailJS error payload (it's often nested in err.text)
    console.error('EmailJS send failed:', err);
    throw err;
  }

  return true;
}

export function verifyOtp(email, inputOtp) {
  const key = email.toLowerCase();
  const stored = otpStore.get(key);
  if (!stored) return { valid: false, reason: 'No OTP sent to this email.' };
  if (Date.now() > stored.expiresAt) {
    otpStore.delete(key);
    saveStoreToStorage();
    return { valid: false, reason: 'OTP expired. Request a new one.' };
  }
  if (stored.otp !== inputOtp.trim()) {
    return { valid: false, reason: 'Incorrect OTP. Try again.' };
  }
  otpStore.delete(key);
  saveStoreToStorage();
  return { valid: true };
}

function loadEmailJS() {
  return new Promise((resolve, reject) => {
    if (window.emailjs) { resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}
