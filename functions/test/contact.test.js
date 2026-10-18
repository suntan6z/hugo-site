import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SECRET, freshPayload, sitePost, withFetch, easyChallenge } from './helpers.js';

process.env.ALTCHA_SECRET = SECRET;
const { subjectLine, handle } = await import('../contact.js');

test('a known subject becomes its readable label', () => {
  assert.equal(subjectLine('job', ''), 'Job opportunity');
  assert.equal(subjectLine('bug', undefined), 'Bug report');
  assert.equal(subjectLine('hello', ''), 'Just saying hi');
});

test('"other" carries the sender’s own description', () => {
  assert.equal(subjectLine('other', '  A question about your talk  '), 'A question about your talk');
});

test('"other" without a description falls back to the label, never refuses', () => {
  assert.equal(subjectLine('other', ''), 'Other');
  assert.equal(subjectLine('other', undefined), 'Other');
  assert.equal(subjectLine('other', 42), 'Other');
});

test('a custom subject is capped', () => {
  assert.equal(subjectLine('other', 'x'.repeat(500)).length, 120);
});

test('only "other" reads the custom subject', () => {
  assert.equal(subjectLine('feedback', 'ignored'), 'Feedback');
});

test('an unknown subject is passed through as written', () => {
  assert.equal(subjectLine('something-new', ''), 'something-new');
});

const post = (body, headers) => sitePost(handle, body, headers);
const valid = () => ({
  firstName: 'Li',
  lastName: 'Wu',
  email: 'li@example.com',
  subject: 'job',
  message: 'x'.repeat(60),
  altcha: freshPayload(),
});

test('over-long names, phone and subject are refused', async () => {
  for (const patch of [{ firstName: 'a'.repeat(81) }, { lastName: 'b'.repeat(81) }, { phone: '1'.repeat(41) }, { subject: 's'.repeat(121) }]) {
    const r = await post({ ...valid(), ...patch });
    assert.equal(r.statusCode, 400, JSON.stringify(patch).slice(0, 40));
  }
});

test('the honeypot answers ok without sending anything', async () => {
  await withFetch(
    () => assert.fail('a bot must not cause an email'),
    async () => {
      const r = await post({ ...valid(), website: 'http://spam.example' });
      assert.equal(r.statusCode, 200);
    },
  );
});

test('the notification carries the readable subject', async () => {
  const sent = [];
  await withFetch(
    async (url, init) => {
      sent.push(JSON.parse(init.body));
      return new Response('{}', { status: 200 });
    },
    async () => {
      const r = await post({ ...valid(), subject: 'other', customSubject: 'Your talk in Lyon' });
      assert.equal(r.statusCode, 200);
      assert.equal(sent[0].template.variables.subject, 'Your talk in Lyon');
      assert.equal(sent[1].template.variables.subject, 'Your talk in Lyon');
    },
  );
});

test('the confirmation uses the template of the form\'s language, English when unknown', async () => {
  for (const [lang, id] of [['fr', 'form-confirmation-fr'], ['it', 'form-confirmation-it'], ['en', 'form-confirmation-en'], ['de', 'form-confirmation-en'], [undefined, 'form-confirmation-en']]) {
    const sent = [];
    await withFetch(
      async (url, init) => {
        sent.push(JSON.parse(init.body));
        return new Response('{}', { status: 200 });
      },
      async () => {
        assert.equal((await post({ ...valid(), lang })).statusCode, 200);
        assert.equal(sent[0].template.id, 'contact-form-notification');
        assert.equal(sent[1].template.id, id, String(lang));
      },
    );
  }
});

test('a submission without a solved challenge sends nothing', async () => {
  await withFetch(
    () => assert.fail('nothing may be sent without proof of work'),
    async () => {
      const { altcha, ...without } = valid();
      const r = await post(without);
      assert.equal(r.statusCode, 400);
      assert.equal(JSON.parse(r.body).code, 'altcha');
    },
  );
});

test('a solution works once', async () => {
  await withFetch(
    async () => new Response('{}', { status: 200 }),
    async () => {
      const body = valid();
      assert.equal((await post(body)).statusCode, 200);
      const again = await post(body);
      assert.equal(again.statusCode, 400);
      assert.equal(JSON.parse(again.body).code, 'altcha');
    },
  );
});

test('a mistake in the form does not use up the solution', async () => {
  await withFetch(
    async () => new Response('{}', { status: 200 }),
    async () => {
      const body = valid();
      assert.equal((await post({ ...body, message: 'too short' })).statusCode, 400);
      assert.equal((await post(body)).statusCode, 200);
    },
  );
});

test('a post from another site, or from no browser, is refused', async () => {
  assert.equal((await post(valid(), { origin: 'https://evil.example' })).statusCode, 403);
  assert.equal((await post(valid(), { origin: '' })).statusCode, 403);
});

test('the widget can fetch a challenge with a plain GET', async () => {
  const r = await handle({ httpMethod: 'GET', headers: { origin: 'https://lorenzo.loconsole.eu' }, queryStringParameters: { challenge: '1' } });
  assert.equal(r.statusCode, 200);
  assert.equal(r.headers['Cache-Control'], 'no-store');
  assert.equal(r.headers['Access-Control-Allow-Origin'], 'https://lorenzo.loconsole.eu');
  const body = JSON.parse(r.body);
  assert.equal(body.parameters.algorithm, 'PBKDF2/SHA-256');
  assert.ok(body.signature);
});

test('the challenge is also found when only the path carries the query', async () => {
  const r = await handle({ httpMethod: 'GET', headers: {}, path: '/?challenge=1' });
  assert.equal(r.statusCode, 200);
});

test('a plain GET without the challenge flag is not served', async () => {
  const r = await handle({ httpMethod: 'GET', headers: {}, path: '/' });
  assert.equal(r.statusCode, 405);
});

test('without ALTCHA_SECRET the form refuses everything instead of letting it through', async () => {
  const kept = process.env.ALTCHA_SECRET;
  delete process.env.ALTCHA_SECRET;
  try {
    const challenge = await handle({ httpMethod: 'GET', headers: {}, queryStringParameters: { challenge: '1' } });
    assert.equal(challenge.statusCode, 503);
    const r = await post({ ...valid(), altcha: Buffer.from(JSON.stringify({ challenge: easyChallenge(), solution: {} })).toString('base64') });
    assert.equal(r.statusCode, 400);
  } finally {
    process.env.ALTCHA_SECRET = kept;
  }
});
