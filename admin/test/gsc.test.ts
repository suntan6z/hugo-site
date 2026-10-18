import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { parseServiceAccount, signAssertion, dateWindow, GSC_SCOPE, GOOGLE_TOKEN_URL } from '../src/lib/server/integrations/gsc-auth.ts';
import {
	parseDaily, parseQueries, parsePages, parseSitemaps, parseInspection, verdictLabel, sum, averagePosition
} from '../src/lib/server/integrations/gsc-parse.ts';

const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privateKey = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const keyFile = (over: Record<string, unknown> = {}) =>
	Buffer.from(JSON.stringify({ type: 'service_account', client_email: 'portal@project.iam.gserviceaccount.com', private_key: privateKey, ...over })).toString('base64');

describe('signing in as a service account', () => {
	test('the key file is read from its base64, and anything else is refused', () => {
		assert.deepEqual(parseServiceAccount(keyFile()), { email: 'portal@project.iam.gserviceaccount.com', privateKey });
		assert.equal(parseServiceAccount(''), null);
		assert.equal(parseServiceAccount('not base64 json'), null);
		assert.equal(parseServiceAccount(keyFile({ client_email: 42 })), null);
		assert.equal(parseServiceAccount(keyFile({ client_email: 'nobody' })), null);
		assert.equal(parseServiceAccount(keyFile({ private_key: 'just text' })), null);
		assert.equal(parseServiceAccount(Buffer.from('{"a":1}').toString('base64')), null);
	});

	test('the signed statement is a JWT Google can check with the public key', () => {
		const now = Date.UTC(2026, 9, 18, 12);
		const jwt = signAssertion(parseServiceAccount(keyFile())!, now);
		const [head, claims, signature] = jwt.split('.');
		assert.deepEqual(JSON.parse(Buffer.from(head, 'base64url').toString()), { alg: 'RS256', typ: 'JWT' });
		assert.deepEqual(JSON.parse(Buffer.from(claims, 'base64url').toString()), {
			iss: 'portal@project.iam.gserviceaccount.com',
			scope: GSC_SCOPE,
			aud: GOOGLE_TOKEN_URL,
			iat: Math.floor(now / 1000),
			exp: Math.floor(now / 1000) + 3600
		});
		const ok = createVerify('RSA-SHA256').update(`${head}.${claims}`).verify(pair.publicKey, Buffer.from(signature, 'base64url'));
		assert.equal(ok, true);
	});

	test('the scope only reads', () => {
		assert.match(GSC_SCOPE, /webmasters\.readonly$/);
	});

	test('the window ends two days back, where Google’s numbers have settled', () => {
		assert.deepEqual(dateWindow(Date.UTC(2026, 9, 18, 23, 59), 28), { startDate: '2026-09-19', endDate: '2026-10-16' });
		assert.deepEqual(dateWindow(Date.UTC(2026, 9, 18), 1), { startDate: '2026-10-16', endDate: '2026-10-16' });
	});
});

describe('Search Console answers', () => {
	const rows = (keys: string[][], extra: Record<string, number> = {}) => ({
		rows: keys.map((k, i) => ({ keys: k, clicks: 5 - i, impressions: 100 - i * 10, ctr: 0.05, position: 3 + i, ...extra }))
	});

	test('days come oldest first and a row without a date is dropped', () => {
		const d = parseDaily({ rows: [{ keys: ['2026-10-02'], clicks: 1, impressions: 10, position: 4 }, { keys: ['2026-10-01'], clicks: 2, impressions: 20, position: 6 }, { keys: ['x'], clicks: 9 }] });
		assert.deepEqual(d.map((x) => x.date), ['2026-10-01', '2026-10-02']);
		assert.equal(d[0].clicks, 2);
	});

	test('queries and pages come most-clicked first; empty ones are dropped', () => {
		const q = parseQueries({ rows: [{ keys: ['b'], clicks: 1, impressions: 50, position: 2 }, { keys: ['a'], clicks: 3, impressions: 5, position: 9 }, { keys: [''], clicks: 100 }] });
		assert.deepEqual(q.map((x) => x.query), ['a', 'b']);
		const p = parsePages(rows([['https://lorenzo.loconsole.eu/en/'], ['not a url'], ['https://lorenzo.loconsole.eu/fr/']]));
		assert.deepEqual(p.map((x) => x.url), ['https://lorenzo.loconsole.eu/en/', 'https://lorenzo.loconsole.eu/fr/']);
	});

	test('a site with no data yet answers with no rows at all', () => {
		for (const body of [{}, { rows: [] }, null, 'nope', { rows: 'x' }, { rows: [null, 3, { keys: [1] }] }]) {
			assert.deepEqual(parseDaily(body), []);
			assert.deepEqual(parseQueries(body), []);
			assert.deepEqual(parsePages(body), []);
		}
	});

	test('totals, and a position weighted by how often each day was seen', () => {
		const days = [
			{ date: '2026-10-01', clicks: 1, impressions: 90, position: 10 },
			{ date: '2026-10-02', clicks: 2, impressions: 10, position: 20 }
		];
		assert.deepEqual(sum(days), { clicks: 3, impressions: 100 });
		assert.equal(averagePosition(days), 11);
		assert.equal(averagePosition([]), null);
		assert.equal(averagePosition([{ date: 'x', clicks: 0, impressions: 0, position: 3 }]), null);
	});

	test('a sitemap says what it offered and what Google took, counts arriving as strings', () => {
		const s = parseSitemaps({
			sitemap: [
				{
					path: 'https://lorenzo.loconsole.eu/sitemap.xml',
					lastSubmitted: '2026-07-01T08:00:00.000Z',
					lastDownloaded: '2026-10-15T03:21:00.000Z',
					isPending: false,
					isSitemapsIndex: true,
					errors: '0',
					warnings: '1',
					contents: [{ type: 'web', submitted: '45', indexed: '38' }, { type: 'image', submitted: '5', indexed: '0' }]
				},
				{ lastSubmitted: 'x' }
			]
		});
		assert.deepEqual(s, [{
			path: 'https://lorenzo.loconsole.eu/sitemap.xml', type: 'sitemapIndex', pending: false, errors: 0, warnings: 1,
			submitted: '2026-07-01', lastRead: '2026-10-15', offered: 50, indexed: 38
		}]);
		assert.deepEqual(parseSitemaps({}), []);
	});

	test('an inspection gives Google’s verdict and the state in its own words', () => {
		const i = parseInspection({
			inspectionResult: {
				indexStatusResult: {
					verdict: 'PASS', coverageState: 'Submitted and indexed', indexingState: 'INDEXING_ALLOWED', robotsTxtState: 'ALLOWED',
					pageFetchState: 'SUCCESSFUL', lastCrawlTime: '2026-10-14T05:00:00Z', crawledAs: 'MOBILE',
					googleCanonical: 'https://lorenzo.loconsole.eu/en/blog/x/', userCanonical: 'https://lorenzo.loconsole.eu/en/blog/x/'
				}
			}
		});
		assert.equal(i?.verdict, 'PASS');
		assert.equal(i?.coverage, 'Submitted and indexed');
		assert.equal(i?.lastCrawl, '2026-10-14');
		assert.equal(parseInspection({}), null);
		assert.equal(parseInspection({ inspectionResult: { indexStatusResult: {} } }), null);
	});

	test('each verdict has plain words', () => {
		assert.deepEqual(verdictLabel('PASS'), { text: 'On Google', tone: 'ok' });
		assert.equal(verdictLabel('NEUTRAL').tone, 'warn');
		assert.equal(verdictLabel('FAIL').tone, 'bad');
		assert.equal(verdictLabel('whatever').text, 'Unknown');
	});
});
