const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 254 is the longest address SMTP allows.
export function isValidEmail(email) {
  return typeof email === 'string' && email.length <= 254 && EMAIL_RE.test(email);
}
