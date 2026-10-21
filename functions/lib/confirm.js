// The link in the newsletter confirmation email. It carries everything needed
// (the address and an expiry) and is signed with HMAC-SHA256, so confirming
// needs no database: whoever holds a link the server signed, and can read the
// email it was sent to, has proved they own the address.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { normalizeLang } from './request.js';

export const CONFIRM_TTL_SECONDS = 48 * 60 * 60;
/** How long after it ran out an old link can still ask for a new one. */
export const RENEW_GRACE_SECONDS = 30 * 24 * 60 * 60;

const b64 = (value) => Buffer.from(value).toString('base64url');
const sign = (secret, text) => createHmac('sha256', secret).update(text).digest('base64url');

/**
 * `lang` is the language of the page the form was on, so the list the address
 * joins is the one in the language it asked in. It is signed with the rest, so a
 * link cannot be edited to land someone on another list. Links sent before
 * languages existed carry none and mean English.
 */
export function signToken(email, { secret, lang = 'en', now = Date.now(), ttlSeconds = CONFIRM_TTL_SECONDS }) {
  if (!secret) throw new Error('CONFIRM_SECRET is not set');
  const body = b64(JSON.stringify({ e: email, x: Math.floor(now / 1000) + ttlSeconds, l: normalizeLang(lang) }));
  return `${body}.${sign(secret, body)}`;
}

/**
 * `{ email, lang }` for a good link, else `{ error: 'invalid' | 'expired' }`.
 * With `graceSeconds`, a validly signed link that ran out no more than that long
 * ago is still read, flagged `expired: true`: it is what lets the page offer "send
 * me a new link" to the person holding an old one, and nothing else.
 */
export function verifyToken(token, { secret, now = Date.now(), graceSeconds = 0 }) {
  if (!secret || typeof token !== 'string' || token.length > 600) return { error: 'invalid' };
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra !== undefined) return { error: 'invalid' };

  const expected = Buffer.from(sign(secret, body));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { error: 'invalid' };

  let data;
  try {
    data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { error: 'invalid' };
  }
  if (typeof data?.e !== 'string' || typeof data?.x !== 'number') return { error: 'invalid' };
  const late = Math.floor(now / 1000) - data.x;
  if (late > graceSeconds) return { error: 'expired' };
  if (late > 0) return { email: data.e, lang: normalizeLang(data.l), expired: true };
  return { email: data.e, lang: normalizeLang(data.l) };
}
