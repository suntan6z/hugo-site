// Tiny local test harness — no dependencies. Wraps a Scaleway function handler
// in a plain Node http server so it can be curl'd during local development.
// Usage: ALTCHA_SECRET=dev CONFIRM_SECRET=dev FAKE_RESEND=1 node dev-server.js contact 8787
//
// ALTCHA_SECRET and CONFIRM_SECRET can be any string locally; without them the
// forms refuse every submission, as they would in production.
//
// Two conveniences that exist only here (this file is not part of the deployed zip):
//   FAKE_RESEND=1    answers Resend's API from memory and prints what would have been
//                    sent, so a form can be tried end to end without sending email.
//   DEV_PAGE_ORIGIN  an extra origin to treat as the local site, for when `hugo server`
//                    is not on port 1313 (e.g. DEV_PAGE_ORIGIN=http://localhost:1315).
import http from 'node:http';

const [, , moduleName, portArg] = process.argv;
if (!moduleName) {
  console.error('Usage: node dev-server.js <contact|newsletter> [port]');
  process.exit(1);
}

if (process.env.FAKE_RESEND) {
  const contacts = new Map(); // address -> unsubscribed
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (!u.startsWith('https://api.resend.com')) throw new Error(`FAKE_RESEND: unexpected request to ${u}`);
    const body = init.body ? JSON.parse(init.body) : undefined;
    console.log(`[resend] ${init.method ?? 'GET'} ${u.replace('https://api.resend.com', '')}`, body ? JSON.stringify(body, null, 2) : '');
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status });
    if (u.includes('/contacts/')) {
      const email = decodeURIComponent(u.split('/contacts/')[1]);
      return contacts.has(email) ? json({ email, unsubscribed: contacts.get(email) }) : json({}, 404);
    }
    if (u.endsWith('/contacts')) {
      contacts.set(body.email, false);
      return json({ id: 'fake' }, 201);
    }
    return json({ id: 'fake' });
  };
}

const PAGE_ORIGIN = process.env.DEV_PAGE_ORIGIN;
const LOCAL_SITE = 'http://localhost:1313';

const { handle } = await import(`./${moduleName}.js`);
const port = Number(portArg) || 8787;

http
  .createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString('utf8');

    const headers = { ...req.headers };
    const realOrigin = headers.origin;
    if (PAGE_ORIGIN && realOrigin === PAGE_ORIGIN) headers.origin = LOCAL_SITE;

    const event = {
      httpMethod: req.method,
      path: req.url,
      // Scaleway hands the parsed query string over as well; mirror that.
      queryStringParameters: Object.fromEntries(new URL(req.url, 'http://localhost').searchParams),
      headers,
      body,
    };

    try {
      const result = await handle(event, {});
      const out = { ...(result.headers || {}) };
      if (PAGE_ORIGIN && realOrigin === PAGE_ORIGIN && out['Access-Control-Allow-Origin']) {
        out['Access-Control-Allow-Origin'] = realOrigin;
      }
      res.writeHead(result.statusCode, out);
      res.end(result.body || '');
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Handler threw', message: err.message }));
    }
  })
  .listen(port, () => console.log(`${moduleName} listening on http://localhost:${port}`));
