// The link in the newsletter confirmation email. It carries everything needed
// (the address and an expiry) and is signed with HMAC-SHA256, so confirming
// needs no database: whoever holds a link the server signed, and can read the
// email it was sent to, has proved they own the address.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const CONFIRM_TTL_SECONDS = 48 * 60 * 60;

const b64 = (value) => Buffer.from(value).toString('base64url');
const sign = (secret, text) => createHmac('sha256', secret).update(text).digest('base64url');

export function signToken(email, { secret, now = Date.now(), ttlSeconds = CONFIRM_TTL_SECONDS }) {
  if (!secret) throw new Error('CONFIRM_SECRET is not set');
  const body = b64(JSON.stringify({ e: email, x: Math.floor(now / 1000) + ttlSeconds }));
  return `${body}.${sign(secret, body)}`;
}

/** `{ email }` for a good link, else `{ error: 'invalid' | 'expired' }`. */
export function verifyToken(token, { secret, now = Date.now() }) {
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
  if (data.x < Math.floor(now / 1000)) return { error: 'expired' };
  return { email: data.e };
}
