import { isValidEmail } from './lib/validate.js';
import { optionsResponse, json } from './lib/cors.js';
import { isRateLimited, clientIp } from './lib/rateLimit.js';

function validate(body) {
  const errors = [];

  if (typeof body.firstName !== 'string' || body.firstName.trim().length < 3) errors.push('firstName');
  if (typeof body.lastName !== 'string' || body.lastName.trim().length < 3) errors.push('lastName');

  if (!isValidEmail(body.email)) errors.push('email');

  if (typeof body.subject !== 'string' || body.subject.trim() === '') errors.push('subject');

  const message = typeof body.message === 'string' ? body.message : '';
  if (message.length < 50 || message.length > 500) errors.push('message');

  return errors;
}

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

export async function handle(event) {
  if (event.httpMethod === 'OPTIONS') return optionsResponse(event);
  if (event.httpMethod !== 'POST') return json(event, { error: 'Method not allowed' }, 405);

  if (isRateLimited(clientIp(event))) {
    return json(event, { error: 'Too many requests' }, 429);
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(event, { error: 'Invalid JSON' }, 400);
  }

  // Honeypot: no UI field currently sends this, but honor it if present.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return json(event, { ok: true }, 200);
  }

  const errors = validate(body);
  if (errors.length) return json(event, { error: 'Validation failed', fields: errors }, 400);

  const firstName = String(body.firstName).trim();
  const lastName = String(body.lastName).trim();
  const email = String(body.email).trim();
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const subject = String(body.subject).trim();
  const message = String(body.message).trim();

  const notificationRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'New Form Submission <contact@loconsole.eu>',
      to: ['contact@loconsole.eu'],
      reply_to: email,
      template: {
        id: 'contact-form-notification',
        variables: {
          first_name: esc(firstName),
          last_name: esc(lastName),
          email: esc(email),
          phone: phone ? esc(phone) : '—',
          subject: esc(subject),
          message: esc(message),
        },
      },
    }),
  });

  if (!notificationRes.ok) return json(event, { error: 'Email send failed' }, 502);

  // Best-effort: the submitter's confirmation email is a nice-to-have —
  // don't fail the whole request if only this part errors.
  const name = `${firstName} ${lastName}`;
  const messagePreview = message.slice(0, 150) + (message.length > 150 ? '...' : '');
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Lorenzo Loconsole (Form submission) <contact@loconsole.eu>',
      to: [email],
      template: { id: 'contact-form-confirmation', variables: { name, subject, message_preview: messagePreview } },
    }),
  }).catch(() => {});

  return json(event, { ok: true }, 200);
}
