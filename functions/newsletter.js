import { isValidEmail } from './lib/validate.js';
import { optionsResponse, json } from './lib/cors.js';
import { isRateLimited, clientIp } from './lib/rateLimit.js';

// The only Resend Audience that currently exists in the account ("General").
// A previous "Blog" audience referenced by the old Supabase code has since
// been deleted — verified directly against the Resend API.
const RESEND_GENERAL_AUDIENCE_ID = '276f21cc-de35-468d-8b30-06fc08ad1016';

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

  // Honeypot: bots fill hidden fields. Accept silently without subscribing,
  // so the bot has no signal it was caught.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return json(event, { ok: true }, 200);
  }

  if (!isValidEmail(body.email)) {
    return json(event, { error: 'Invalid email' }, 400);
  }

  const email = body.email.trim().toLowerCase();
  const audienceUrl = `https://api.resend.com/audiences/${RESEND_GENERAL_AUDIENCE_ID}/contacts`;
  const authHeaders = {
    Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    'Content-Type': 'application/json',
  };

  // The create endpoint is an idempotent upsert (always 201, even for an
  // existing contact) — so check existence first to decide whether this is
  // a genuinely new subscriber who should get the welcome email.
  const existingRes = await fetch(`${audienceUrl}/${encodeURIComponent(email)}`, {
    headers: authHeaders,
  });
  const alreadySubscribed = existingRes.status === 200;

  const addRes = await fetch(audienceUrl, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ email, unsubscribed: false }),
  });

  if (!addRes.ok) return json(event, { error: 'Subscribe failed' }, 502);

  if (alreadySubscribed) {
    return json(event, { ok: true, message: 'Already subscribed' }, 200);
  }

  // Best-effort: don't fail the request if only the welcome email errors.
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      from: 'Lorenzo Loconsole 〡Blog <newsletter@loconsole.eu>',
      to: [email],
      template: { id: 'newsletter-welcome' },
    }),
  }).catch(() => {});

  return json(event, { ok: true }, 200);
}
