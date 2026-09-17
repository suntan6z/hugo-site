import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
	parseCounts, parseTimeline, pathOf, viewsByArticle, change, externalReferrers
} from '../src/lib/server/integrations/litlyx-parse.ts';

const day = (s: string) => Date.parse(`${s}T00:00:00Z`);

describe('Litlyx answers', () => {
	test('counts come back largest first, and malformed rows are skipped rather than thrown on', () => {
		const rows = parseCounts([{ _id: '/a', count: 2 }, { _id: '/b', count: 9 }, { _id: '/c' }, null, 'x', { _id: null, count: '3' }]);
		assert.deepEqual(rows, [{ key: '/b', count: 9 }, { key: '', count: 3 }, { key: '/a', count: 2 }]);
		assert.deepEqual(parseCounts({ error: true }), []);
	});

	test('a timeline has one point per day, whichever way the day is written, with gaps as zero', () => {
		const body = [
			{ _id: '2026-09-01T00:00:00.000Z', count: 4 },
			{ _id: { date: '2026-09-03T00:00:00.000Z' }, count: 1 },
			{ date: '2026-09-03T00:00:00.000Z', count: 2 }
		];
		assert.deepEqual(parseTimeline(body, day('2026-09-01'), day('2026-09-04') + 3600_000), [
			{ date: '2026-09-01', count: 4 },
			{ date: '2026-09-02', count: 0 },
			{ date: '2026-09-03', count: 3 },
			{ date: '2026-09-04', count: 0 }
		]);
	});

	test('a page recorded as a whole URL and as a path is the same page', () => {
		assert.equal(pathOf('https://lorenzo.loconsole.eu/en/now/?ref=x'), '/en/now/');
		assert.equal(pathOf('/en/now/#top'), '/en/now/');
	});

	test('article views are added up across languages, and other pages are left out', () => {
		const v = viewsByArticle([
			{ key: '/en/blog/first-home-nas/', count: 5 },
			{ key: 'https://lorenzo.loconsole.eu/it/blog/first-home-nas/', count: 2 },
			{ key: '/en/blog/', count: 40 },
			{ key: '/en/now/', count: 7 }
		]);
		assert.deepEqual(v, { 'first-home-nas': { total: 7, langs: { en: 5, it: 2 } } });
	});

	test('a trend needs something to compare against', () => {
		assert.equal(change(15, 10), 50);
		assert.equal(change(5, 0), null);
	});

	test('the site referring to itself is not a source, and hosts are merged', () => {
		const r = externalReferrers(
			[
				{ key: 'https://lorenzo.loconsole.eu/en/', count: 30 },
				{ key: 'https://www.mastodon.social/@lv', count: 3 },
				{ key: 'mastodon.social', count: 2 },
				{ key: '', count: 8 }
			],
			'lorenzo.loconsole.eu'
		);
		assert.deepEqual(r, [{ key: 'Direct or unknown', count: 8 }, { key: 'mastodon.social', count: 5 }]);
	});
});
