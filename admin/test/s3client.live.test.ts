import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { S3Client, parseListPage, sigv4Encode } from '../src/lib/server/store/s3client.ts';

/**
 * Live integration test against the real Scaleway bucket. Skipped entirely when
 * credentials are absent, so CI (which has none) stays green.
 */
function loadEnv(): Record<string, string> {
	const f = path.resolve(import.meta.dirname, '..', '.env');
	if (!fs.existsSync(f)) return {};
	return Object.fromEntries(
		fs
			.readFileSync(f, 'utf8')
			.split('\n')
			.filter((l) => l.includes('=') && !l.trim().startsWith('#'))
			.map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
	);
}

const env = loadEnv();
const configured = !!(env.SCW_ACCESS_KEY && env.SCW_SECRET_KEY && env.SCW_BUCKET);

describe('S3Client against the live bucket', { skip: !configured && 'no Scaleway credentials' }, () => {
	const s3 = new S3Client({
		bucket: env.SCW_BUCKET,
		region: env.SCW_REGION ?? 'fr-par',
		accessKey: env.SCW_ACCESS_KEY,
		secretKey: env.SCW_SECRET_KEY
	});
	const key = `test/_selftest-${Date.now()}.json`;
	const payload = JSON.stringify({ hello: 'world', accent: 'Câmara', emoji: '🇪🇺' });

	after(async () => {
		await s3.send('DELETE', key);
	});

	test('PUT stores an object', async () => {
		const r = await s3.send('PUT', key, payload);
		assert.equal(r.ok, true, `PUT failed: ${r.status} ${await r.text()}`);
	});

	test('GET returns it byte-identical, UTF-8 intact', async () => {
		const r = await s3.send('GET', key);
		assert.equal(r.status, 200);
		assert.equal(await r.text(), payload);
	});

	test('LIST finds it under its prefix', async () => {
		const r = await s3.send('GET', '', undefined, 'list-type=2&prefix=test%2F');
		assert.equal(r.status, 200);
		assert.ok((await r.text()).includes(key), 'key missing from listing');
	});

	test('LIST pages: a continuation token is signed correctly and moves forward', async () => {
		// Read-only. Two keys a page forces several pages out of audit/.
		const seen: string[] = [];
		let token: string | null = null;
		for (let i = 0; i < 3; i++) {
			const q: string = (token ? `continuation-token=${sigv4Encode(token)}&` : '') + 'list-type=2&max-keys=2&prefix=audit%2F';
			const r = await s3.send('GET', '', undefined, q);
			assert.equal(r.status, 200, `page ${i}: ${r.status}`);
			const page = parseListPage(await r.text());
			seen.push(...page.keys);
			token = page.next;
			if (!token) break;
		}
		assert.ok(seen.length >= 2, 'expected some audit entries');
		assert.equal(new Set(seen).size, seen.length, 'a page repeated keys');
		assert.deepEqual([...seen].sort(), seen, 'pages are not in ascending order');
	});

	test('GET of a missing key is 404, not a signature error', async () => {
		const r = await s3.send('GET', 'test/definitely-not-here.json');
		assert.equal(r.status, 404);
	});

	test('DELETE removes it', async () => {
		assert.ok((await s3.send('DELETE', key)).ok);
		assert.equal((await s3.send('GET', key)).status, 404);
	});
});
