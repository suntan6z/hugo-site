import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseListPage, sigv4Encode } from '../src/lib/server/store/s3client.ts';

const page = (keys: string[], next?: string) =>
	`<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Name>b</Name>` +
	`<IsTruncated>${next ? 'true' : 'false'}</IsTruncated>` +
	(next ? `<NextContinuationToken>${next}</NextContinuationToken>` : '') +
	keys.map((k) => `<Contents><Key>${k}</Key><Size>1</Size></Contents>`).join('') +
	`</ListBucketResult>`;

test('a last page has keys and no next token', () => {
	assert.deepEqual(parseListPage(page(['audit/a.json', 'audit/b.json'])), { keys: ['audit/a.json', 'audit/b.json'], next: null });
});

test('a truncated page hands back its token, XML-decoded', () => {
	const r = parseListPage(page(['audit/a.json'], '1ueGcxLPRx1Tr/XYExHnhbYLgveDs2J/wm36Hy4vbOwM=&amp;x'));
	assert.equal(r.next, '1ueGcxLPRx1Tr/XYExHnhbYLgveDs2J/wm36Hy4vbOwM=&x');
});

test('a token is ignored unless the page says it is truncated', () => {
	const xml = page(['k.json']).replace('</Name>', '</Name><NextContinuationToken>stale</NextContinuationToken>');
	assert.equal(parseListPage(xml).next, null);
});

test('keys with XML entities are decoded', () => {
	assert.deepEqual(parseListPage(page(['drafts/a&amp;b.json'])).keys, ['drafts/a&b.json']);
});

test('SigV4 encoding is strict RFC 3986', () => {
	assert.equal(sigv4Encode("a/b+c=d!'()*~_-."), "a%2Fb%2Bc%3Dd%21%27%28%29%2A~_-.");
});
