import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
	parseCounts, parseTimeline, pathOf, viewsByArticle, change, externalReferrers,
	mergePaths, labelled, withShare, parseDurations, weightedAverage, parseLive, stayLabel
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

describe('Litlyx breakdowns', () => {
	test('a page counted under two spellings is one row, largest first', () => {
		assert.deepEqual(
			mergePaths([
				{ key: 'https://lorenzo.loconsole.eu/en/now/', count: 3 },
				{ key: '/en/now/', count: 4 },
				{ key: '/en/about/', count: 5 }
			]),
			[{ key: '/en/now/', count: 7 }, { key: '/en/about/', count: 5 }]
		);
	});

	test('an empty or "unknown" name is shown as Unknown, and they are added together', () => {
		assert.deepEqual(
			labelled([{ key: 'Chrome', count: 9 }, { key: '', count: 2 }, { key: 'unknown', count: 3 }, { key: '  ', count: 1 }]),
			[{ key: 'Chrome', count: 9 }, { key: 'Unknown', count: 6 }]
		);
	});

	test('shares add up to the whole list, and an empty list has no division by zero', () => {
		assert.deepEqual(withShare([{ key: 'a', count: 3 }, { key: 'b', count: 1 }]).map((r) => r.share), [75, 25]);
		assert.deepEqual(withShare([{ key: 'a', count: 0 }]).map((r) => r.share), [0]);
		assert.deepEqual(withShare([]), []);
	});

	test('time on page: merged across spellings, weighted by how often each was measured', () => {
		const rows = parseDurations([
			{ _id: '/en/blog/x/', count: 3, avgSeconds: 60 },
			{ _id: 'https://lorenzo.loconsole.eu/en/blog/x/', count: 1, avgSeconds: 100 },
			{ _id: '/en/now/', count: 10, avgSeconds: 20 },
			{ _id: '/bad', count: 0, avgSeconds: 5 },
			{ _id: '/neg', count: 2, avgSeconds: -1 },
			{ _id: null, count: 2, avgSeconds: 5 },
			null
		]);
		assert.deepEqual(rows, [
			{ key: '/en/now/', measured: 10, seconds: 20 },
			{ key: '/en/blog/x/', measured: 4, seconds: 70 }
		]);
		assert.deepEqual(parseDurations({ error: 1 }), []);
	});

	test('a daily rate becomes one figure for the period, each day weighted by its visits', () => {
		const rate = [
			{ date: '2026-10-01', count: 50 },
			{ date: '2026-10-02', count: 100 },
			{ date: '2026-10-03', count: 0 }
		];
		const visits = [
			{ date: '2026-10-01', count: 3 },
			{ date: '2026-10-02', count: 1 },
			{ date: '2026-10-03', count: 0 }
		];
		assert.equal(weightedAverage(rate, visits), 62.5);
		assert.equal(weightedAverage(rate, [{ date: '2026-10-01', count: 0 }]), null);
		assert.equal(weightedAverage([], visits), null);
	});

	test('live visitors are a plain number, and anything else is "unknown"', () => {
		assert.equal(parseLive(4), 4);
		assert.equal(parseLive('3'), 3);
		assert.equal(parseLive(0), 0);
		assert.equal(parseLive(null), null);
		assert.equal(parseLive(undefined), null);
		assert.equal(parseLive({ error: 1 }), null);
		assert.equal(parseLive(-2), null);
	});

	test('a stay is written the way it is read', () => {
		assert.equal(stayLabel(8), '8 s');
		assert.equal(stayLabel(60), '1 min');
		assert.equal(stayLabel(125), '2 min 5 s');
		assert.equal(stayLabel(NaN), '–');
	});
});
