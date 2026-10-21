import { isValidEmail } from './lib/validate.js';
import { optionsResponse, json, isAllowedOrigin, resolveOrigin } from './lib/cors.js';
import { isRateLimited, clientIp } from './lib/rateLimit.js';
import { wantsChallenge, serveChallenge, isHuman } from './lib/guard.js';
import { signToken, verifyToken, RENEW_GRACE_SECONDS } from './lib/confirm.js';
import { confirmationEmail } from './lib/confirm-email.js';
import { normalizeLang } from './lib/request.js';

// Resend's contacts are global and a mailing list is a segment (the old
// "audiences", renamed). The English list is the one that existed before there
// were languages ("General"), so its id is the default.
const RESEND_ENGLISH_SEGMENT_ID = '276f21cc-de35-468d-8b30-06fc08ad1016';
const API = 'https://api.resend.com';

/**
 * The mailing list for a language: one segment each. French and Italian exist
 * only once their ids are set; until then those readers join the English list
 * (what the site did before languages), never a wrong one.
 */
const segments = () => ({
  en: process.env.RESEND_SEGMENT_EN || RESEND_ENGLISH_SEGMENT_ID,
  fr: process.env.RESEND_SEGMENT_FR || '',
  it: process.env.RESEND_SEGMENT_IT || '',
});
const segmentFor = (lang) => segments()[lang] || segments().en;

// Dashboard templates, one per language; a language without its own falls back to English.
// The confirmation request is a template too (the link is its one variable); lib/confirm-email.js is the
// fallback if Resend refuses it, because a missing template must never stop someone subscribing.
const CONFIRM = { en: 'newsletter-confirm-en', fr: 'newsletter-confirm-fr', it: 'newsletter-confirm-it' };
const WELCOME = { en: 'newsletter-welcome-en', fr: 'newsletter-welcome-fr', it: 'newsletter-welcome-it' };

// Where a reply to either email goes: the owner reads it, rather than a no-reply address.
const REPLY_TO = 'contact@loconsole.eu';
const FROM = 'Lorenzo Loconsole 〡Blog <newsletter@loconsole.eu>';

const authHeaders = () => ({
  Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
  'Content-Type': 'application/json',
});

/**
 * Where an address stands. Resend answers 404 for a stranger; anything else
 * unexpected is an error, never "not subscribed", so a hiccup cannot make us
 * email someone who is already on the list.
 */
async function lookup(email) {
  const res = await fetch(`${API}/contacts/${encodeURIComponent(email)}`, { headers: authHeaders() });
  if (res.status === 404) return { known: false, subscribed: false };
  if (!res.ok) throw new Error(`Resend contact lookup failed (${res.status})`);
  const contact = await res.json().catch(() => ({}));
  return { known: true, subscribed: contact.unsubscribed !== true };
}

/**
 * Puts an address on a list, whether or not Resend already knows it. A new
 * contact is created into the segment in one call; one Resend already has (it
 * unsubscribed once, say) is made subscribed again and added to the segment, since
 * creating a contact that exists is not something its docs promise to allow.
 */
async function enrol(email, known, segmentId) {
  if (!known) {
    return fetch(`${API}/contacts`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ email, unsubscribed: false, segments: [{ id: segmentId }] }),
    });
  }
  const back = await fetch(`${API}/contacts/${encodeURIComponent(email)}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ unsubscribed: false }),
  });
  if (!back.ok) return back;
  const joined = await fetch(`${API}/contacts/${encodeURIComponent(email)}/segments/${segmentId}`, { method: 'POST', headers: authHeaders() });
  if (!joined.ok) return joined;
  // One list each: someone coming back in another language is taken off the others,
  // or every issue would reach them twice. Not being on one is not an error.
  for (const other of new Set(Object.values(segments()).filter((s) => s && s !== segmentId))) {
    await fetch(`${API}/contacts/${encodeURIComponent(email)}/segments/${other}`, { method: 'DELETE', headers: authHeaders() }).catch(() => {});
  }
  return joined;
}

/** Emails `email` a fresh confirmation link in `lang`: the template, else the built-in message. Returns Resend's last answer. */
async function sendConfirmation(event, email, lang, secret) {
  const link = `${resolveOrigin(event)}/${lang}/newsletter-confirm/#${signToken(email, { secret, lang })}`;
  const send = (payload) =>
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ from: FROM, reply_to: REPLY_TO, to: [email], ...payload }),
    });
  let sent = await send({ template: { id: CONFIRM[lang], variables: { confirm_url: link } } }).catch(() => null);
  if (!sent?.ok) {
    console.error(`newsletter: confirmation template ${CONFIRM[lang]} failed (${sent?.status ?? 'no answer'}), sending the built-in email`);
    const mail = confirmationEmail(lang, link);
    sent = await send({ subject: mail.subject, html: mail.html, text: mail.text });
  }
  return sent;
}

/**
 * Step one: nobody is added yet. The address gets an email with a signed link
 * to the site's confirmation page, and joins the audience only when the link
 * is used (double opt-in, as the privacy policy says).
 *
 * The answer is the same whether or not the address is already on the list,
 * so the form cannot be used to find out who is subscribed.
 */
async function subscribe(event, body) {
  if (!isValidEmail(body.email)) return json(event, { error: 'Invalid email' }, 400);
  const email = body.email.trim().toLowerCase();

  if (!(await isHuman(body.altcha))) return json(event, { error: 'Verification failed', code: 'altcha' }, 400);

  const secret = process.env.CONFIRM_SECRET;
  if (!secret) {
    console.error('newsletter: CONFIRM_SECRET is not set');
    return json(event, { error: 'Not configured' }, 503);
  }

  try {
    if ((await lookup(email)).subscribed) return json(event, { ok: true }, 200);
  } catch (e) {
    console.error('newsletter:', e.message);
    return json(event, { error: 'Subscribe failed' }, 502);
  }

  const lang = normalizeLang(body.lang);
  const sent = await sendConfirmation(event, email, lang, secret);
  if (!sent.ok) {
    console.error(`newsletter: Resend confirmation email failed (${sent.status})`);
    return json(event, { error: 'Subscribe failed' }, 502);
  }
  return json(event, { ok: true }, 200);
}

/**
 * Step two: the link from the email, opened on the site's confirmation page,
 * which posts its token here. Using a link twice is harmless: an address
 * already on the list is answered `already` and gets no second welcome email.
 */
async function confirm(event, token) {
  const secret = process.env.CONFIRM_SECRET;
  if (!secret) {
    console.error('newsletter: CONFIRM_SECRET is not set');
    return json(event, { error: 'Not configured' }, 503);
  }
  const checked = verifyToken(token, { secret });
  if (checked.error) return json(event, { error: checked.error }, 400);

  let seen;
  try {
    seen = await lookup(checked.email);
    // Said apart from a first confirmation, so the page can tell someone their link was already used.
    if (seen.subscribed) return json(event, { ok: true, already: true, email: checked.email }, 200);
  } catch (e) {
    console.error('newsletter:', e.message);
    return json(event, { error: 'Subscribe failed' }, 502);
  }

  const added = await enrol(checked.email, seen.known, segmentFor(checked.lang));
  if (!added.ok) {
    console.error(`newsletter: Resend could not add the contact (${added.status})`);
    return json(event, { error: 'Subscribe failed' }, 502);
  }

  // Best-effort: don't fail the request if only the welcome email errors. In the
  // reader's language when that template exists, else the English one.
  const welcome = (template) =>
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ from: FROM, reply_to: REPLY_TO, to: [checked.email], template: { id: template } }),
    });
  try {
    let r = await welcome(WELCOME[checked.lang]);
    if (!r.ok && checked.lang !== 'en') r = await welcome(WELCOME.en);
    if (!r.ok) console.error(`newsletter: welcome email failed (${r.status})`);
  } catch (e) {
    console.error('newsletter: welcome email failed', e?.message);
  }

  return json(event, { ok: true, email: checked.email }, 200);
}

/**
 * "Send me a new link", from the page an expired link lands on. The old link is
 * the proof: it is signed, so it can only ever name the address it was sent to,
 * and one that ran out more than RENEW_GRACE_SECONDS ago is refused like any
 * other bad link. Someone already on the list is told so and gets no email.
 */
async function renew(event, token) {
  const secret = process.env.CONFIRM_SECRET;
  if (!secret) {
    console.error('newsletter: CONFIRM_SECRET is not set');
    return json(event, { error: 'Not configured' }, 503);
  }
  const checked = verifyToken(token, { secret, graceSeconds: RENEW_GRACE_SECONDS });
  if (checked.error) return json(event, { error: 'invalid' }, 400);

  try {
    if ((await lookup(checked.email)).subscribed) return json(event, { ok: true, already: true, email: checked.email }, 200);
  } catch (e) {
    console.error('newsletter:', e.message);
    return json(event, { error: 'Subscribe failed' }, 502);
  }
  const sent = await sendConfirmation(event, checked.email, checked.lang, secret);
  if (!sent.ok) {
    console.error(`newsletter: Resend confirmation email failed (${sent.status})`);
    return json(event, { error: 'Subscribe failed' }, 502);
  }
  return json(event, { ok: true, email: checked.email }, 200);
}

export async function handle(event) {
  if (event.httpMethod === 'OPTIONS') return optionsResponse(event);
  if (wantsChallenge(event)) return serveChallenge(event);
  if (event.httpMethod !== 'POST') return json(event, { error: 'Method not allowed' }, 405);

  if (!isAllowedOrigin(event)) return json(event, { error: 'Forbidden' }, 403);

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

  if (typeof body.confirm === 'string') return confirm(event, body.confirm);
  if (typeof body.renew === 'string') return renew(event, body.renew);
  return subscribe(event, body);
}
