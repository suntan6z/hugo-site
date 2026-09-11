import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
	parseDotNetDate, unwrap, parseTraffic, parseQueries, parsePages, sum, ctr, trend
} from '../src/lib/server/integrations/bing-parse.ts';

describe('the legacy .NET date format', () => {
	test('parses to the correct calendar day', () => {
		// 1757548800000 = 2025-09-11T00:00:00Z
		assert.equal(parseDotNetDate('/Date(1757548800000)/'), '2025-09-11');
	});

	test('the trailing offset is informational and must not shift the day', () => {
		// If -0700 were applied, this would land on the previous day.
		assert.equal(
			parseDotNetDate('/Date(1757548800000-0700)/'),
			parseDotNetDate('/Date(1757548800000)/')
		);
		assert.equal(parseDotNetDate('/Date(1757548800000+0200)/'), '2025-09-11');
	});

	test('garbage returns null rather than Invalid Date', () => {
		for (const v of ['', 'yesterday', '/Date()/', null, 42, undefined]) {
			assert.equal(parseDotNetDate(v), null);
		}
	});
});

describe('response envelope', () => {
	test('payloads arrive under d', () => {
		assert.deepEqual(unwrap({ d: [1, 2] }), [1, 2]);
	});

	test('a null or missing d degrades to an empty list', () => {
		for (const b of [{ d: null }, {}, null, 'nope', { d: { not: 'an array' } }]) {
			assert.deepEqual(unwrap(b), []);
		}
	});
});

describe('traffic series', () => {
	const body = {
		d: [
			{ Date: '/Date(1757635200000)/', Clicks: 5, Impressions: 100 },
			{ Date: '/Date(1757548800000)/', Clicks: 3, Impressions: 80 },
			{ Date: 'broken', Clicks: 9, Impressions: 9 }
		]
	};

	test('sorts ascending by date and drops unparseable rows', () => {
		assert.deepEqual(parseTraffic(body).map((p) => p.date), ['2025-09-11', '2025-09-12']);
	});

	test('totals are summed across the series', () => {
		assert.deepEqual(sum(parseTraffic(body)), { clicks: 8, impressions: 180 });
	});

	test('missing numeric fields count as zero, not NaN', () => {
		const p = parseTraffic({ d: [{ Date: '/Date(1757548800000)/' }] });
		assert.deepEqual(p, [{ date: '2025-09-11', clicks: 0, impressions: 0 }]);
	});
});

describe('query aggregation', () => {
	// Bing returns one row per query per day.
	const body = {
		d: [
			{ Query: 'lorenzo loconsole', Clicks: 2, Impressions: 10, AvgImpressionPosition: 4, AvgClickPosition: 3 },
			{ Query: 'lorenzo loconsole', Clicks: 3, Impressions: 30, AvgImpressionPosition: 8, AvgClickPosition: 5 },
			{ Query: 'chat control', Clicks: 1, Impressions: 50, AvgImpressionPosition: 12, AvgClickPosition: 9 }
		]
	};

	test('rows for the same query are combined', () => {
		const rows = parseQueries(body);
		assert.equal(rows.length, 2);
		assert.deepEqual(
			rows.map((r) => [r.query, r.clicks, r.impressions]),
			[['lorenzo loconsole', 5, 40], ['chat control', 1, 50]]
		);
	});

	test('average positions are weighted, not naively averaged', () => {
		const r = parseQueries(body)[0];
		// (4*10 + 8*30) / 40 = 7, not (4+8)/2 = 6.
		assert.equal(r.avgImpressionPosition, 7);
		// (3*2 + 5*3) / 5 = 4.2
		assert.ok(Math.abs(r.avgClickPosition - 4.2) < 1e-9);
	});

	test('sorted by clicks, then impressions', () => {
		assert.equal(parseQueries(body)[0].query, 'lorenzo loconsole');
	});

	test('rows with no query text are skipped', () => {
		assert.deepEqual(parseQueries({ d: [{ Clicks: 9 }] }), []);
	});
});

describe('page aggregation', () => {
	test('combines rows and accepts either Query or Url as the key', () => {
		const rows = parsePages({
			d: [
				{ Query: 'https://x.eu/a', Clicks: 1, Impressions: 5 },
				{ Url: 'https://x.eu/a', Clicks: 2, Impressions: 5 },
				{ Url: 'https://x.eu/b', Clicks: 4, Impressions: 1 }
			]
		});
		assert.deepEqual(rows, [
			{ url: 'https://x.eu/b', clicks: 4, impressions: 1 },
			{ url: 'https://x.eu/a', clicks: 3, impressions: 10 }
		]);
	});
});

describe('derived figures', () => {
	test('CTR is a percentage and survives zero impressions', () => {
		assert.equal(ctr(5, 100), 5);
		assert.equal(ctr(0, 0), 0);
	});

	test('trend compares the two halves of the series', () => {
		const p = (clicks: number[]) =>
			clicks.map((c, i) => ({ date: `2026-09-0${i + 1}`, clicks: c, impressions: 0 }));
		assert.equal(trend(p([1, 1, 2, 2])).change, 100);
		assert.equal(trend(p([2, 2, 1, 1])).change, -50);
	});

	test('too short a series reports "not enough data" rather than a wild number', () => {
		assert.equal(trend([]).enough, false);
		assert.equal(trend([{ date: '2026-09-01', clicks: 5, impressions: 0 }]).enough, false);
	});

	test('growth from zero does not divide by zero', () => {
		const p = [0, 0, 3, 4].map((c, i) => ({ date: `2026-09-0${i + 1}`, clicks: c, impressions: 0 }));
		assert.equal(trend(p).change, 100);
		assert.equal(Number.isFinite(trend(p).change), true);
	});
});
