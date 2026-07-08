// Tiny local test harness — no dependencies. Wraps a Scaleway function handler
// in a plain Node http server so it can be curl'd during local development.
// Usage: node dev-server.js contact 8787
import http from 'node:http';

const [, , moduleName, portArg] = process.argv;
if (!moduleName) {
  console.error('Usage: node dev-server.js <contact|newsletter> [port]');
  process.exit(1);
}

const { handle } = await import(`./${moduleName}.js`);
const port = Number(portArg) || 8787;

http
  .createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString('utf8');

    const event = {
      httpMethod: req.method,
      path: req.url,
      headers: req.headers,
      body,
    };

    try {
      const result = await handle(event, {});
      res.writeHead(result.statusCode, result.headers || {});
      res.end(result.body || '');
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Handler threw', message: err.message }));
    }
  })
  .listen(port, () => console.log(`${moduleName} listening on http://localhost:${port}`));
