import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { externalLinks, classify, nextRecord, isDead, isDue, type LinkRecord } from '../src/lib/server/seo/links.ts';

describe('finding links', () => {
	test('Markdown, autolinks and HTML anchors, each once, internal and relative ones ignored', () => {
		const text = [
			'[EFF](https://www.eff.org "Electronic Frontier Foundation") and <https://mastodon.social>',
			'<a href="https://www.eff.org" target="_blank">again</a> <a href="/en/now/">internal</a> [rel](other-post/)',
			'![photo](photo.jpg) [video](https://www.youtube.com/watch?v=06qwUUAAmX8&t=2s)'
		].join('\n');
		assert.deepEqual(externalLinks(text), [
			'https://www.eff.org',
			'https://mastodon.social',
			'https://www.youtube.com/watch?v=06qwUUAAmX8&t=2s'
		]);
	});
});

describe('judging answers', () => {
	test('only a real "gone" counts as broken', () => {
		assert.equal(classify(200).status, 'ok');
		assert.equal(classify(301).status, 'ok');
		assert.equal(classify(404).status, 'broken');
		assert.equal(classify(410).status, 'broken');
		assert.equal(classify(null, 'ENOTFOUND').status, 'broken');
		for (const code of [401, 403, 405, 429, 500, 503]) assert.equal(classify(code).status, 'unsure', String(code));
		assert.equal(classify(null, 'TimeoutError').status, 'unsure');
		assert.equal(classify(null, 'ECONNRESET').status, 'unsure');
	});

	const url = 'https://gone.example/';
	const day1 = new Date('2026-09-01T10:00:00Z');
	const day1later = new Date('2026-09-01T10:05:00Z');
	const day2 = new Date('2026-09-02T10:00:00Z');

	test('one failure is not enough, and neither are two checks minutes apart', () => {
		const first = nextRecord(undefined, url, { ...classify(404), code: 404 }, day1);
		assert.equal(isDead(first, day1), false);
		const again = nextRecord(first, url, { ...classify(404), code: 404 }, day1later);
		assert.equal(again.failures, 2);
		assert.equal(isDead(again, day1later), false);
		assert.equal(isDead(again, day2), true, 'the second failure only counts once a day has passed since the first');
	});

	test('two failures a day apart make it dead; an answer in between clears it', () => {
		const first = nextRecord(undefined, url, { ...classify(404), code: 404 }, day1);
		const second = nextRecord(first, url, { ...classify(404), code: 404 }, day2);
		assert.equal(isDead(second, day2), true);
		const back: LinkRecord = nextRecord(second, url, { ...classify(200), code: 200 }, day2);
		assert.equal(back.failures, 0);
		assert.equal(isDead(back, day2), false);
	});

	test('a site that cannot be reached neither confirms nor clears a failure', () => {
		const first = nextRecord(undefined, url, { ...classify(404), code: 404 }, day1);
		const down = nextRecord(first, url, { ...classify(null, 'TimeoutError'), code: null }, day2);
		assert.equal(down.status, 'broken');
		assert.equal(down.failures, 1);
		assert.equal(down.brokenSince, first.brokenSince);
	});

	test('checks come round weekly', () => {
		assert.equal(isDue(null, day1), true);
		assert.equal(isDue('2026-08-30T10:00:00Z', day1), false);
		assert.equal(isDue('2026-08-25T10:00:00Z', day1), true);
	});
});
