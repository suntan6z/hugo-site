import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SECRET, freshPayload, sitePost, withFetch } from './helpers.js';

process.env.ALTCHA_SECRET = SECRET;
process.env.CONFIRM_SECRET = 'confirm-secret';
process.env.RESEND_API_KEY = 'test-key';
const { handle } = await import('../newsletter.js');
const { signToken, verifyToken } = await import('../lib/confirm.js');

const post = (body, headers) => sitePost(handle, body, headers);

/**
 * A stand-in for Resend: `contacts` is who is on the list (address -> unsubscribed),
 * and everything sent to it is recorded.
 */
function resend({ contacts = {}, failEmails = false, failLookup = false, failTemplates = false } = {}) {
  const calls = [];
  const stub = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    const method = init.method ?? 'GET';
    calls.push({ url: String(url), method, body });
    const path = String(url).replace('https://api.resend.com', '');
    if (path.startsWith('/contacts/')) {
      const [email, ...rest] = path.slice('/contacts/'.length).split('/').map(decodeURIComponent);
      if (rest[0] === 'segments') return new Response('{"id":"x"}', { status: 200 });
      if (method === 'PATCH') {
        contacts[email] = body.unsubscribed;
        return new Response('{}', { status: 200 });
      }
      if (failLookup) return new Response('{}', { status: 500 });
      return email in contacts
        ? new Response(JSON.stringify({ email, unsubscribed: contacts[email] }), { status: 200 })
        : new Response('{}', { status: 404 });
    }
    if (path === '/contacts') {
      contacts[body.email] = false;
      return new Response('{}', { status: 201 });
    }
    if (failTemplates && body?.template?.id?.startsWith('newsletter-confirm')) return new Response('{}', { status: 404 });
    return new Response('{}', { status: failEmails ? 500 : 200 });
  };
  return { stub, calls, contacts };
}
const emails = (calls) => calls.filter((c) => c.url.endsWith('/emails'));
const added = (calls) => calls.filter((c) => c.url.endsWith('/contacts') && c.method === 'POST');
const EN_SEGMENT = '276f21cc-de35-468d-8b30-06fc08ad1016';

test('subscribing sends a confirmation email and adds nobody', async () => {
  const r = resend();
  await withFetch(r.stub, async () => {
    const res = await post({ email: 'Li@Example.com', lang: 'fr', altcha: freshPayload() });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { ok: true });
  });
  assert.equal(added(r.calls).length, 0);
  const [mail] = emails(r.calls);
  assert.deepEqual(mail.body.to, ['li@example.com']);
  assert.equal(mail.body.template.id, 'newsletter-confirm-fr');
  assert.match(mail.body.template.variables.confirm_url, /^https:\/\/lorenzo\.loconsole\.eu\/fr\/newsletter-confirm\/#[\w-]+\.[\w-]+$/);
  assert.equal(emails(r.calls).length, 1, 'one email, no fallback when the template works');
});

test('when Resend refuses the template, the built-in email goes out instead and signup still works', async () => {
  const r = resend({ failTemplates: true });
  await withFetch(r.stub, async () => {
    const res = await post({ email: 'Li@Example.com', lang: 'fr', altcha: freshPayload() });
    assert.equal(res.statusCode, 200);
  });
  const mails = emails(r.calls);
  assert.equal(mails.length, 2);
  assert.equal(mails[0].body.template.id, 'newsletter-confirm-fr');
  assert.equal(mails[1].body.subject, 'Confirmez votre inscription');
  assert.match(mails[1].body.text, /\/fr\/newsletter-confirm\/#/);
});

test('the link points at the site the form was on', async () => {
  const r = resend();
  await withFetch(r.stub, () => post({ email: 'a@example.com', altcha: freshPayload() }, { origin: 'http://localhost:1313' }));
  assert.match(emails(r.calls)[0].body.template.variables.confirm_url, /^http:\/\/localhost:1313\/en\/newsletter-confirm\/#/);
});

test('an unknown language falls back to English', async () => {
  const r = resend();
  await withFetch(r.stub, () => post({ email: 'a@example.com', lang: '../x', altcha: freshPayload() }));
  assert.equal(emails(r.calls)[0].body.template.id, 'newsletter-confirm-en');
  assert.match(emails(r.calls)[0].body.template.variables.confirm_url, /\/en\/newsletter-confirm\/#/);
});

test('an address already on the list gets the same answer and no email', async () => {
  const r = resend({ contacts: { 'in@example.com': false } });
  await withFetch(r.stub, async () => {
    const res = await post({ email: 'in@example.com', altcha: freshPayload() });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { ok: true });
  });
  assert.equal(emails(r.calls).length, 0);
});

test('someone who unsubscribed can ask again', async () => {
  const r = resend({ contacts: { 'back@example.com': true } });
  await withFetch(r.stub, () => post({ email: 'back@example.com', altcha: freshPayload() }));
  assert.equal(emails(r.calls).length, 1);
});

test('no proof of work, no email', async () => {
  const r = resend();
  await withFetch(r.stub, async () => {
    const res = await post({ email: 'a@example.com' });
    assert.equal(res.statusCode, 400);
    assert.equal(JSON.parse(res.body).code, 'altcha');
  });
  assert.equal(r.calls.length, 0);
});

test('a bad address is refused before anything else', async () => {
  const r = resend();
  await withFetch(r.stub, async () => {
    assert.equal((await post({ email: 'nope', altcha: freshPayload() })).statusCode, 400);
    assert.equal((await post({ email: `${'a'.repeat(250)}@example.com`, altcha: freshPayload() })).statusCode, 400);
  });
  assert.equal(r.calls.length, 0);
});

test('the honeypot is told it worked and nothing happens', async () => {
  const r = resend();
  await withFetch(r.stub, async () => {
    const res = await post({ email: 'a@example.com', website: 'spam', altcha: freshPayload() });
    assert.equal(res.statusCode, 200);
  });
  assert.equal(r.calls.length, 0);
});

test('a failing Resend is reported, not hidden', async () => {
  await withFetch(resend({ failEmails: true }).stub, async () => {
    assert.equal((await post({ email: 'a@example.com', altcha: freshPayload() })).statusCode, 502);
  });
  await withFetch(resend({ failLookup: true }).stub, async () => {
    assert.equal((await post({ email: 'b@example.com', altcha: freshPayload() })).statusCode, 502);
  });
});

test('using the link adds the address and welcomes it', async () => {
  const r = resend();
  const token = signToken('new@example.com', { secret: 'confirm-secret' });
  await withFetch(r.stub, async () => {
    const res = await post({ confirm: token });
    assert.equal(res.statusCode, 200);
  });
  assert.deepEqual(added(r.calls).map((c) => c.body), [{ email: 'new@example.com', unsubscribed: false, segments: [{ id: EN_SEGMENT }] }]);
  assert.equal(emails(r.calls)[0].body.template.id, 'newsletter-welcome-en');
  assert.deepEqual(emails(r.calls)[0].body.to, ['new@example.com']);
});

test('using the link twice adds once and welcomes once', async () => {
  const r = resend();
  const token = signToken('twice@example.com', { secret: 'confirm-secret' });
  await withFetch(r.stub, async () => {
    assert.equal((await post({ confirm: token })).statusCode, 200);
    assert.equal((await post({ confirm: token })).statusCode, 200);
  });
  assert.equal(added(r.calls).length, 1);
  assert.equal(emails(r.calls).length, 1);
});

test('an expired, forged or foreign link adds nobody', async () => {
  const r = resend();
  const old = signToken('late@example.com', { secret: 'confirm-secret', now: Date.now() - 3 * 86400_000 });
  const forged = signToken('x@example.com', { secret: 'not-our-secret' });
  await withFetch(r.stub, async () => {
    const expired = await post({ confirm: old });
    assert.equal(expired.statusCode, 400);
    assert.equal(JSON.parse(expired.body).error, 'expired');
    assert.equal(JSON.parse((await post({ confirm: forged })).body).error, 'invalid');
    assert.equal(JSON.parse((await post({ confirm: 'garbage' })).body).error, 'invalid');
  });
  assert.equal(r.calls.length, 0);
});

test('confirming needs no proof of work but still needs the site as the origin', async () => {
  const token = signToken('o@example.com', { secret: 'confirm-secret' });
  await withFetch(resend().stub, async () => {
    assert.equal((await post({ confirm: token }, { origin: 'https://evil.example' })).statusCode, 403);
  });
});

test('without CONFIRM_SECRET the form says so instead of sending unsigned links', async () => {
  const kept = process.env.CONFIRM_SECRET;
  delete process.env.CONFIRM_SECRET;
  try {
    const r = resend();
    await withFetch(r.stub, async () => {
      assert.equal((await post({ email: 'a@example.com', altcha: freshPayload() })).statusCode, 503);
      assert.equal((await post({ confirm: 'x.y' })).statusCode, 503);
    });
    assert.equal(emails(r.calls).length, 0);
  } finally {
    process.env.CONFIRM_SECRET = kept;
  }
});

test('someone Resend already knows, who had unsubscribed, is made subscribed again and put back on the list', async () => {
  const r = resend({ contacts: { 'back@example.com': true } });
  const token = signToken('back@example.com', { secret: 'confirm-secret' });
  await withFetch(r.stub, async () => {
    assert.equal((await post({ confirm: token })).statusCode, 200);
  });
  assert.equal(added(r.calls).length, 0, 'not created a second time');
  const patch = r.calls.find((c) => c.method === 'PATCH');
  assert.equal(patch.url, 'https://api.resend.com/contacts/back%40example.com');
  assert.deepEqual(patch.body, { unsubscribed: false });
  assert.ok(r.calls.some((c) => c.method === 'POST' && c.url === `https://api.resend.com/contacts/back%40example.com/segments/${EN_SEGMENT}`));
  assert.equal(emails(r.calls).length, 1, 'and welcomed');
});

test('the list is looked up through the global contacts, never the deprecated audiences', async () => {
  const r = resend();
  await withFetch(r.stub, () => post({ email: 'a@example.com', altcha: freshPayload() }));
  await withFetch(r.stub, () => post({ confirm: signToken('a@example.com', { secret: 'confirm-secret' }) }));
  assert.ok(r.calls.every((c) => !c.url.includes('/audiences')));
});

/** Runs `fn` with the French and Italian lists configured, then puts the environment back. */
async function withLists(fn) {
  process.env.RESEND_SEGMENT_FR = 'seg-fr';
  process.env.RESEND_SEGMENT_IT = 'seg-it';
  try {
    await fn();
  } finally {
    delete process.env.RESEND_SEGMENT_FR;
    delete process.env.RESEND_SEGMENT_IT;
  }
}

test('someone who asked in French joins the French list, and is welcomed in French', async () => {
  await withLists(async () => {
    const r = resend();
    await withFetch(r.stub, () => post({ confirm: signToken('f@example.com', { secret: 'confirm-secret', lang: 'fr' }) }));
    assert.deepEqual(added(r.calls).map((c) => c.body.segments), [[{ id: 'seg-fr' }]]);
    assert.equal(emails(r.calls)[0].body.template.id, 'newsletter-welcome-fr');
  });
});

test('Italian likewise', async () => {
  await withLists(async () => {
    const r = resend();
    await withFetch(r.stub, () => post({ confirm: signToken('i@example.com', { secret: 'confirm-secret', lang: 'it' }) }));
    assert.deepEqual(added(r.calls).map((c) => c.body.segments), [[{ id: 'seg-it' }]]);
    assert.equal(emails(r.calls)[0].body.template.id, 'newsletter-welcome-it');
  });
});

test('a link from before languages existed joins the English list', async () => {
  await withLists(async () => {
    const r = resend();
    const body = Buffer.from(JSON.stringify({ e: 'old@example.com', x: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
    const { createHmac } = await import('node:crypto');
    const token = `${body}.${createHmac('sha256', 'confirm-secret').update(body).digest('base64url')}`;
    await withFetch(r.stub, () => post({ confirm: token }));
    assert.deepEqual(added(r.calls).map((c) => c.body.segments), [[{ id: EN_SEGMENT }]]);
  });
});

test('a language whose list is not set up yet joins the English one, never a wrong list', async () => {
  const r = resend();
  await withFetch(r.stub, () => post({ confirm: signToken('f@example.com', { secret: 'confirm-secret', lang: 'fr' }) }));
  assert.deepEqual(added(r.calls).map((c) => c.body.segments), [[{ id: EN_SEGMENT }]]);
  assert.equal(emails(r.calls)[0].body.template.id, 'newsletter-welcome-fr', 'still welcomed in their language');
});

test('a welcome template that does not exist for a language falls back to the English one', async () => {
  const r = resend();
  const base = r.stub;
  const stub = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    if (String(url).endsWith('/emails') && body?.template?.id === 'newsletter-welcome-it') {
      r.calls.push({ url: String(url), method: 'POST', body });
      return new Response('{}', { status: 404 });
    }
    return base(url, init);
  };
  await withFetch(stub, () => post({ confirm: signToken('i@example.com', { secret: 'confirm-secret', lang: 'it' }) }));
  assert.deepEqual(emails(r.calls).map((c) => c.body.template.id), ['newsletter-welcome-it', 'newsletter-welcome-en']);
});

test('coming back in another language moves a known contact to that list and off the others', async () => {
  await withLists(async () => {
    const r = resend({ contacts: { 'move@example.com': true } });
    await withFetch(r.stub, () => post({ confirm: signToken('move@example.com', { secret: 'confirm-secret', lang: 'fr' }) }));
    const to = 'https://api.resend.com/contacts/move%40example.com/segments/';
    assert.ok(r.calls.some((c) => c.method === 'POST' && c.url === `${to}seg-fr`));
    const removed = r.calls.filter((c) => c.method === 'DELETE').map((c) => c.url.replace(to, '')).sort();
    assert.deepEqual(removed, [EN_SEGMENT, 'seg-it'].sort());
    assert.equal(added(r.calls).length, 0);
  });
});

test('the language travels from the form into the signed link', async () => {
  const r = resend();
  await withFetch(r.stub, () => post({ email: 'fr@example.com', lang: 'fr', altcha: freshPayload() }));
  const token = emails(r.calls)[0].body.template.variables.confirm_url.match(/#([\w.-]+)/)[1];
  assert.equal(verifyToken(token, { secret: 'confirm-secret' }).lang, 'fr');
});

test('both emails a subscriber gets can be answered, and the answer reaches the owner', async () => {
  const r = resend();
  await withFetch(r.stub, () => post({ email: 'a@example.com', altcha: freshPayload() }));
  await withFetch(r.stub, () => post({ confirm: signToken('a@example.com', { secret: 'confirm-secret' }) }));
  const sent = emails(r.calls);
  assert.equal(sent.length, 2);
  assert.ok(sent.every((m) => m.body.reply_to === 'contact@loconsole.eu'));
});
