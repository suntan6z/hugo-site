import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { signToken, verifyToken, CONFIRM_TTL_SECONDS } from '../lib/confirm.js';
import { confirmationEmail } from '../lib/confirm-email.js';
import { normalizeLang, queryParam } from '../lib/request.js';

const secret = 'confirm-secret';

test('a signed link gives the address back', () => {
  const token = signToken('li@example.com', { secret });
  assert.deepEqual(verifyToken(token, { secret }), { email: 'li@example.com', lang: 'en' });
});

test('the link is safe to put after a # in a URL', () => {
  assert.match(signToken('a+b@example.com', { secret }), /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
});

test('it works for 48 hours and not longer', () => {
  const now = Date.UTC(2026, 9, 18);
  const token = signToken('li@example.com', { secret, now });
  assert.equal(CONFIRM_TTL_SECONDS, 172800);
  assert.deepEqual(verifyToken(token, { secret, now: now + 47 * 3600_000 }), { email: 'li@example.com', lang: 'en' });
  assert.deepEqual(verifyToken(token, { secret, now: now + 49 * 3600_000 }), { error: 'expired' });
});

test('another secret, a changed address or a changed expiry is invalid', () => {
  const token = signToken('li@example.com', { secret });
  assert.deepEqual(verifyToken(token, { secret: 'other' }), { error: 'invalid' });

  const [body, signature] = token.split('.');
  const edited = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url')), e: 'me@example.com' })).toString('base64url');
  assert.deepEqual(verifyToken(`${edited}.${signature}`, { secret }), { error: 'invalid' });
  assert.deepEqual(verifyToken(`${body}.${signature.slice(1)}A`, { secret }), { error: 'invalid' });
});

test('malformed input is invalid, never an exception', () => {
  for (const junk of [undefined, null, 42, '', '.', 'a.b.c', 'abc', 'x'.repeat(700)]) {
    assert.deepEqual(verifyToken(junk, { secret }), { error: 'invalid' }, String(junk).slice(0, 12));
  }
  assert.deepEqual(verifyToken(signToken('a@b.co', { secret }), { secret: '' }), { error: 'invalid' });
  assert.throws(() => signToken('a@b.co', { secret: '' }));
});

test('the email says the same thing in each language, with the link in both parts', () => {
  const url = 'https://lorenzo.loconsole.eu/fr/newsletter-confirm/#abc.def';
  for (const lang of ['en', 'fr', 'it']) {
    const mail = confirmationEmail(lang, url);
    assert.ok(mail.subject.length > 5, lang);
    assert.ok(mail.html.includes(`href="${url}"`), lang);
    assert.ok(mail.text.includes(url), lang);
  }
  assert.notEqual(confirmationEmail('fr', url).subject, confirmationEmail('en', url).subject);
  assert.equal(confirmationEmail('xx', url).subject, confirmationEmail('en', url).subject);
});

test('only the site’s languages are accepted', () => {
  assert.equal(normalizeLang('it'), 'it');
  assert.equal(normalizeLang('de'), 'en');
  assert.equal(normalizeLang(undefined), 'en');
  assert.equal(normalizeLang('../evil'), 'en');
});

test('the query string is read from either place the platform may put it', () => {
  assert.equal(queryParam({ queryStringParameters: { challenge: '1' } }, 'challenge'), '1');
  assert.equal(queryParam({ path: '/x?challenge=1&a=b' }, 'challenge'), '1');
  assert.equal(queryParam({ path: '/x' }, 'challenge'), undefined);
  assert.equal(queryParam({}, 'challenge'), undefined);
});

test('the language is signed with the link, and a link without one means English', () => {
  assert.equal(verifyToken(signToken('a@b.co', { secret, lang: 'fr' }), { secret }).lang, 'fr');
  assert.equal(verifyToken(signToken('a@b.co', { secret, lang: 'it' }), { secret }).lang, 'it');
  assert.equal(verifyToken(signToken('a@b.co', { secret, lang: '../x' }), { secret }).lang, 'en', 'anything else is English');

  // A link sent before languages existed has no l claim.
  const body = Buffer.from(JSON.stringify({ e: 'old@b.co', x: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  assert.deepEqual(verifyToken(`${body}.${sig}`, { secret }), { email: 'old@b.co', lang: 'en' });
});

test('the language cannot be edited into another list', () => {
  const token = signToken('a@b.co', { secret, lang: 'en' });
  const [body, signature] = token.split('.');
  const edited = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url')), l: 'fr' })).toString('base64url');
  assert.deepEqual(verifyToken(`${edited}.${signature}`, { secret }), { error: 'invalid' });
});
