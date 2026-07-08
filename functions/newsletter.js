import { isValidEmail } from './lib/validate.js';
import { optionsResponse, json } from './lib/cors.js';

export async function handle(event) {
  if (event.httpMethod === 'OPTIONS') return optionsResponse();
  if (event.httpMethod !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  // Honeypot: bots fill hidden fields. Accept silently without subscribing,
  // so the bot has no signal it was caught.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return json({ ok: true }, 200);
  }

  if (!isValidEmail(body.email)) {
    return json({ error: 'Invalid email' }, 400);
  }

  const resendRes = await fetch(
    `https://api.resend.com/audiences/${process.env.RESEND_AUDIENCE_ID}/contacts`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: body.email, unsubscribed: false }),
    }
  );

  if (!resendRes.ok) return json({ error: 'Subscribe failed' }, 502);

  return json({ ok: true }, 200);
}
