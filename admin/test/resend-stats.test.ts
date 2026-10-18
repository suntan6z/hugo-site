import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { summarise, linkStats, isoDate, STAT_TYPES, type RecipientRow, type StatType } from '../src/lib/server/integrations/resend-stats.ts';

const lists = (over: Partial<Record<StatType, RecipientRow[]>> = {}): Record<StatType, RecipientRow[]> =>
	Object.fromEntries(STAT_TYPES.map((t) => [t, over[t] ?? []])) as Record<StatType, RecipientRow[]>;

const people = (n: number): RecipientRow[] => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, email: `p${i}@example.com` }));

describe('what happened to a broadcast', () => {
	test('each count is the length of its list, and the delivered share is of those it went to', () => {
		const s = summarise(
			lists({ delivered: people(38), bounced: [{ bounce_type: 'permanent' }, { bounce_type: 'transient' }], complained: people(1), unsubscribed: people(3) }),
			40
		);
		assert.equal(s.delivered, 38);
		assert.equal(s.bounced, 2);
		assert.equal(s.hardBounced, 1);
		assert.equal(s.complained, 1);
		assert.equal(s.unsubscribed, 3);
		assert.equal(s.deliveredPct, 95);
		assert.equal(s.sentTo, 40);
	});

	test('with nobody recorded as sent to, no percentage is invented', () => {
		assert.equal(summarise(lists({ delivered: people(5) }), 0).deliveredPct, null);
	});

	test('no opens and no clicks means tracking is off, which is how the site says it runs', () => {
		const s = summarise(lists({ delivered: people(10) }), 10);
		assert.equal(s.tracked, false);
		assert.deepEqual(s.links, []);
	});

	test('any open or click means Resend is tracking', () => {
		assert.equal(summarise(lists({ opened: people(1) }), 10).tracked, true);
		assert.equal(summarise(lists({ clicked: people(1) }), 10).tracked, true);
	});

	test('clicked links are added up across people, most-clicked first', () => {
		const rows: RecipientRow[] = [
			{ clicked_links: [{ url: 'https://a.example/x', clicks: 2 }, { url: 'https://b.example/', clicks: 1 }] },
			{ clicked_links: [{ url: 'https://a.example/x', clicks: 1 }] },
			{ clicked_links: [{ url: 'https://b.example/' }] }
		];
		assert.deepEqual(linkStats(rows), [
			{ url: 'https://a.example/x', clicks: 3, people: 2 },
			{ url: 'https://b.example/', clicks: 2, people: 2 }
		]);
	});

	test('malformed rows are skipped, never thrown on', () => {
		const rows = [{}, { clicked_links: [{}, { url: '' }, { url: 7 as unknown as string }, { url: 'https://ok.example/', clicks: -3 }] }] as RecipientRow[];
		assert.deepEqual(linkStats(rows), [{ url: 'https://ok.example/', clicks: 1, people: 1 }]);
		assert.deepEqual(linkStats([]), []);
	});
});

test('isoDate turns the way Resend writes a contact date into something a browser reads', () => {
	assert.equal(isoDate('2026-10-06 23:47:56.678+00'), '2026-10-06T23:47:56.678+00:00');
	assert.equal(isoDate('2026-09-01 10:00:00.000000+00'), '2026-09-01T10:00:00.000+00:00');
	assert.equal(isoDate('2026-09-01T10:00:00Z'), '2026-09-01T10:00:00Z');
	assert.equal(isoDate('2026-09-01 10:00:00+0200'), '2026-09-01T10:00:00+02:00');
	assert.ok(!Number.isNaN(Date.parse(isoDate('2026-10-06 23:47:56.678+00'))));
});

test('isoDate gives nothing for what it cannot read, never a wrong day', () => {
	for (const v of [undefined, null, 42, '', 'yesterday', '2026-13-45 10:00:00+00']) assert.equal(isoDate(v), '');
});
