// ============================================================
// src/utils/emailOtp.js
// Sends a 6-digit OTP email via EmailJS (free tier, no backend).
// ============================================================
import emailjs from '@emailjs/browser';

const PUBLIC_KEY = 'di9KeRD5MCZIEOy0u';
const SERVICE_ID = 'service_835k5l3';
const TEMPLATE_ID = 'template_06zy16e';

emailjs.init(PUBLIC_KEY);

/**
 * Generates a random 6-digit OTP code as a string.
 */
export function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Sends an OTP code to the given email via EmailJS.
 * @param {string} toEmail
 * @param {string} toName
 * @param {string} otpCode
 */
export async function sendOtpEmail(toEmail, toName, otpCode) {
  return emailjs.send(SERVICE_ID, TEMPLATE_ID, {
    to_email: toEmail,
    to_name: toName,
    otp_code: otpCode,
  });
}
