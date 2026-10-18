// The server half of ALTCHA's proof of work, written against node:crypto so the
// functions stay free of dependencies. It speaks the protocol of the official
// widget (altcha 3.x) and library (altcha-lib 2.x, "v2"): PBKDF2/SHA-256, a
// signed challenge, a solution made of a counter and the key it derives.
//
// The challenge is stateless: the parameters are signed with HMAC-SHA256 and the
// widget hands them back with its answer, so nothing is stored. The one thing
// kept is a short list of challenges already spent, per warm instance, so a
// solution cannot be replayed within its lifetime. Like the rate limiter, that
// list resets on a cold start: it blunts abuse rather than ending it.
import { createHmac, pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const pbkdf2Async = promisify(pbkdf2);

const ALGORITHM = 'PBKDF2/SHA-256';
const KEY_LENGTH = 32;
// A derived key must start with this byte: one attempt in 256 succeeds, so a
// solver averages 256 derivations of `cost` iterations each.
const KEY_PREFIX = '00';
// A visitor's browser spends well under a second on this (several workers in
// parallel); a script sending thousands of requests pays that for each one.
const DEFAULT_COST = 4000;
const MAX_COST = 100_000;
// Long enough to read an article and fill a form after the page has loaded.
export const CHALLENGE_TTL_SECONDS = 20 * 60;
const MAX_REMEMBERED = 5000;

// signature -> expiry in seconds. Insertion order is age order.
const spent = new Map();

function sortKeys(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  return Object.keys(value)
    .sort()
    .reduce((out, key) => {
      if (value[key] !== undefined) out[key] = sortKeys(value[key]);
      return out;
    }, {});
}

const canonical = (value) => JSON.stringify(sortKeys(value));
const sign = (secret, text) => createHmac('sha256', secret).update(text).digest('hex');

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

/** A fresh signed challenge, in the shape the widget fetches. */
export function createChallenge({ secret, cost = DEFAULT_COST, now = Date.now() }) {
  if (!secret) throw new Error('ALTCHA_SECRET is not set');
  const parameters = sortKeys({
    algorithm: ALGORITHM,
    cost,
    expiresAt: Math.floor(now / 1000) + CHALLENGE_TTL_SECONDS,
    keyLength: KEY_LENGTH,
    keyPrefix: KEY_PREFIX,
    nonce: randomBytes(16).toString('hex'),
    salt: randomBytes(16).toString('hex'),
  });
  return { parameters, signature: sign(secret, JSON.stringify(parameters)) };
}

function forget(nowSeconds) {
  for (const [signature, expiresAt] of spent) {
    if (expiresAt >= nowSeconds && spent.size <= MAX_REMEMBERED) break;
    spent.delete(signature);
  }
}

/**
 * Whether `payload` (the widget's base64 JSON) solves a challenge this server
 * signed, has not expired and has not been used. Never throws on bad input.
 */
export async function verifyPayload(payload, { secret, now = Date.now() }) {
  if (!secret || typeof payload !== 'string' || payload === '' || payload.length > 4000) return false;

  let challenge;
  let solution;
  try {
    ({ challenge, solution } = JSON.parse(Buffer.from(payload, 'base64').toString('utf8')));
  } catch {
    return false;
  }
  const p = challenge?.parameters;
  if (!p || typeof challenge.signature !== 'string' || !solution) return false;

  // Cheap checks first; the key derivation only runs for a genuine, current challenge.
  if (!safeEqual(challenge.signature, sign(secret, canonical(p)))) return false;
  const nowSeconds = Math.floor(now / 1000);
  if (p.algorithm !== ALGORITHM || typeof p.expiresAt !== 'number' || p.expiresAt < nowSeconds) return false;
  if (!Number.isInteger(p.cost) || p.cost < 1 || p.cost > MAX_COST) return false;
  if (typeof p.nonce !== 'string' || typeof p.salt !== 'string' || typeof p.keyPrefix !== 'string') return false;
  if (!/^[0-9a-f]+$/.test(p.nonce + p.salt) || !/^([0-9a-f]{2})+$/.test(p.keyPrefix)) return false;
  if (!Number.isInteger(solution.counter) || solution.counter < 0 || solution.counter > 0xffffffff) return false;
  if (typeof solution.derivedKey !== 'string') return false;

  forget(nowSeconds);
  if (spent.has(challenge.signature)) return false;

  const counter = Buffer.alloc(4);
  counter.writeUInt32BE(solution.counter);
  const key = await pbkdf2Async(
    Buffer.concat([Buffer.from(p.nonce, 'hex'), counter]),
    Buffer.from(p.salt, 'hex'),
    p.cost,
    p.keyLength,
    'sha256',
  );
  const derived = key.toString('hex');
  if (!safeEqual(derived, solution.derivedKey) || !derived.startsWith(p.keyPrefix)) return false;

  spent.set(challenge.signature, p.expiresAt);
  return true;
}
