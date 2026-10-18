// Shared by the function tests: a way to solve a challenge the way the widget
// does, and to call a handler as the platform would.
import { pbkdf2Sync } from 'node:crypto';
import { createChallenge } from '../lib/altcha.js';

export const SECRET = 'test-secret';

/** A challenge cheap enough to solve instantly. */
export const easyChallenge = (overrides = {}) => createChallenge({ secret: SECRET, cost: 5, ...overrides });

/** Brute-forces a challenge exactly as the widget's worker does. */
export function solve(challenge) {
  const p = challenge.parameters;
  const counter = Buffer.alloc(4);
  for (let n = 0; n < 0xffffffff; n++) {
    counter.writeUInt32BE(n);
    const key = pbkdf2Sync(
      Buffer.concat([Buffer.from(p.nonce, 'hex'), counter]),
      Buffer.from(p.salt, 'hex'),
      p.cost,
      p.keyLength,
      'sha256',
    ).toString('hex');
    if (key.startsWith(p.keyPrefix)) return { counter: n, derivedKey: key, time: 1 };
  }
  throw new Error('no solution');
}

/** The base64 payload the widget puts in the form. */
export function payloadFor(challenge) {
  return Buffer.from(JSON.stringify({ challenge, solution: solve(challenge) })).toString('base64');
}

export const freshPayload = () => payloadFor(easyChallenge());

const SITE = 'https://lorenzo.loconsole.eu';
let caller = 0;

/** A POST from the site, from a new address each time (the rate limiter remembers). */
export function sitePost(handle, body, headers = {}) {
  return handle({
    httpMethod: 'POST',
    headers: { origin: SITE, 'x-forwarded-for': `10.1.${Math.floor(++caller / 250)}.${caller % 250}`, ...headers },
    body: JSON.stringify(body),
  });
}

/** Runs `fn` with fetch replaced by `stub`, restoring it afterwards. */
export async function withFetch(stub, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = stub;
  try {
    return await fn();
  } finally {
    globalThis.fetch = real;
  }
}
