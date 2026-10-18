import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChallenge, verifyPayload, CHALLENGE_TTL_SECONDS } from '../lib/altcha.js';
import { SECRET, easyChallenge, payloadFor, solve } from './helpers.js';

const verify = (payload, now) => verifyPayload(payload, { secret: SECRET, now });
const encode = (challenge, solution) => Buffer.from(JSON.stringify({ challenge, solution })).toString('base64');

test('a challenge has the shape the widget expects', () => {
  const c = createChallenge({ secret: SECRET });
  assert.deepEqual(Object.keys(c), ['parameters', 'signature']);
  assert.equal(c.parameters.algorithm, 'PBKDF2/SHA-256');
  assert.equal(c.parameters.keyLength, 32);
  assert.equal(c.parameters.keyPrefix, '00');
  assert.match(c.parameters.nonce, /^[0-9a-f]{32}$/);
  assert.match(c.parameters.salt, /^[0-9a-f]{32}$/);
  assert.match(c.signature, /^[0-9a-f]{64}$/);
  // Keys come out sorted: the signature is over this exact text.
  assert.deepEqual(Object.keys(c.parameters), [...Object.keys(c.parameters)].sort());
});

test('every challenge is different', () => {
  const a = createChallenge({ secret: SECRET });
  const b = createChallenge({ secret: SECRET });
  assert.notEqual(a.signature, b.signature);
});

test('a solved challenge verifies', async () => {
  assert.equal(await verify(payloadFor(easyChallenge())), true);
});

test('the same solution is accepted only once', async () => {
  const payload = payloadFor(easyChallenge());
  assert.equal(await verify(payload), true);
  assert.equal(await verify(payload), false);
});

test('a challenge signed with another secret is refused', async () => {
  const other = createChallenge({ secret: 'someone-else', cost: 5 });
  assert.equal(await verify(payloadFor(other)), false);
});

test('changing a parameter breaks the signature', async () => {
  const c = easyChallenge();
  const cheaper = { ...c, parameters: { ...c.parameters, cost: 1 } };
  assert.equal(await verify(encode(cheaper, solve(cheaper))), false);
  const easier = { ...c, parameters: { ...c.parameters, keyPrefix: '' } };
  assert.equal(await verify(encode(easier, { counter: 0, derivedKey: '' })), false);
});

test('a wrong counter or key is refused', async () => {
  const c = easyChallenge();
  const s = solve(c);
  assert.equal(await verify(encode(c, { ...s, counter: s.counter + 1 })), false);
  assert.equal(await verify(encode(c, { ...s, derivedKey: '00'.repeat(32) })), false);
});

test('a key that does not start with the prefix is refused even if it is genuine', async () => {
  const c = easyChallenge();
  // Counter 0 is derived honestly but (almost certainly) lacks the 00 prefix.
  const s = solve(c);
  const lucky = s.counter === 0;
  if (lucky) return; // the one case in 256 where counter 0 is the answer
  const { pbkdf2Sync } = await import('node:crypto');
  const key = pbkdf2Sync(Buffer.concat([Buffer.from(c.parameters.nonce, 'hex'), Buffer.alloc(4)]), Buffer.from(c.parameters.salt, 'hex'), c.parameters.cost, 32, 'sha256').toString('hex');
  assert.equal(await verify(encode(c, { counter: 0, derivedKey: key })), false);
});

test('an expired challenge is refused', async () => {
  const c = easyChallenge();
  const later = Date.now() + (CHALLENGE_TTL_SECONDS + 60) * 1000;
  assert.equal(await verify(payloadFor(c), later), false);
});

test('junk never throws', async () => {
  for (const junk of [undefined, null, '', 'not base64!', Buffer.from('{}').toString('base64'), Buffer.from('[]').toString('base64'), Buffer.from('null').toString('base64'), 42, 'a'.repeat(5000)]) {
    assert.equal(await verify(junk), false, String(junk).slice(0, 20));
  }
  const c = easyChallenge();
  for (const solution of [null, {}, { counter: -1, derivedKey: 'x' }, { counter: 1.5, derivedKey: 'x' }, { counter: 2 ** 40, derivedKey: 'x' }, { counter: 1, derivedKey: 5 }]) {
    assert.equal(await verify(encode(c, solution)), false, JSON.stringify(solution));
  }
});

test('without a secret nothing verifies', async () => {
  assert.equal(await verifyPayload(payloadFor(easyChallenge()), { secret: '' }), false);
  assert.throws(() => createChallenge({ secret: '' }));
});
