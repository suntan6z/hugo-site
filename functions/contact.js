import { isValidEmail } from './lib/validate.js';
import { optionsResponse, json } from './lib/cors.js';

function validate(body) {
  const errors = [];

  const nameParts = typeof body.name === 'string' ? body.name.trim().split(/\s+/).filter(Boolean) : [];
  if (nameParts.length < 2 || nameParts.some((part) => part.length < 3)) errors.push('name');

  if (!isValidEmail(body.email)) errors.push('email');

  if (typeof body.subject !== 'string' || body.subject.trim() === '') errors.push('subject');

  const message = typeof body.message === 'string' ? body.message : '';
  if (message.length < 50 || message.length > 500) errors.push('message');

  return errors;
}

export async function handle(event) {
  if (event.httpMethod === 'OPTIONS') return optionsResponse();
  if (event.httpMethod !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const errors = validate(body);
  if (errors.length) return json({ error: 'Validation failed', fields: errors }, 400);

  const name = String(body.name).trim();
  const email = String(body.email).trim();
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const subject = String(body.subject).trim();
  const message = String(body.message).trim();

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: "Lorenzo's Website <contact@loconsole.eu>",
      to: ['lorenzo@loconsole.eu'],
      reply_to: email,
      subject: `[Contact] ${subject}`,
      text: `Name: ${name}\nEmail: ${email}\nPhone: ${phone || '—'}\n\n${message}`,
    }),
  });

  if (!resendRes.ok) return json({ error: 'Email send failed' }, 502);

  return json({ ok: true }, 200);
}
