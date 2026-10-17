import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { whyNotDay, morningOf, todayIn, dueToPublish, dueToAnnounce, forSlug, prune, isSettled, MAX_TRIES, type Scheduled } from '../src/lib/server/schedule/plan.ts';

const NOW = new Date('2026-09-12T12:00:00Z');
const at = (mins: number) => new Date(NOW.getTime() + mins * 60_000).toISOString();

const item = (over: Partial<Scheduled> = {}): Scheduled => ({
	slug: 'a-post',
	at: at(60),
	newsletter: false,
	state: 'pending',
	createdAt: NOW.toISOString(),
	...over
});

describe('choosing a day', () => {
	test('it goes live at 9:00 Paris time, summer and winter', () => {
		assert.equal(morningOf('2026-09-13'), '2026-09-13T07:00:00.000Z', 'CEST is UTC+2');
		assert.equal(morningOf('2026-12-01'), '2026-12-01T08:00:00.000Z', 'CET is UTC+1');
		// The clocks change at 2–3 a.m., hours before 9:00 on the same day.
		assert.equal(morningOf('2026-03-29'), '2026-03-29T07:00:00.000Z');
		assert.equal(morningOf('2026-10-25'), '2026-10-25T08:00:00.000Z');
	});
	test('accepts tomorrow and later', () => {
		assert.equal(whyNotDay('2026-09-13', NOW), null);
		assert.equal(whyNotDay('2027-01-04', NOW), null);
	});
	test('refuses today, even before 9:00, and the past', () => {
		assert.match(whyNotDay('2026-09-12', NOW)!, /after today/);
		assert.match(whyNotDay('2026-09-12', new Date('2026-09-12T05:00:00Z'))!, /after today/);
		assert.match(whyNotDay('2026-09-01', NOW)!, /after today/);
	});
	test('"today" is Paris’s date, not UTC’s', () => {
		// 23:30 UTC on the 12th is already the 13th in Paris.
		const late = new Date('2026-09-12T23:30:00Z');
		assert.equal(todayIn(late), '2026-09-13');
		assert.match(whyNotDay('2026-09-13', late)!, /after today/);
	});
	test('refuses something absurd', () => {
		assert.match(whyNotDay('2027-12-01', NOW)!, /more than a year/);
		assert.match(whyNotDay('not a date', NOW)!, /not a date/);
		assert.match(whyNotDay('2026-02-31', NOW)!, /not a date/);
		assert.match(whyNotDay('2026-09-13T09:00', NOW)!, /not a date/);
	});
});

describe('what the runner picks up', () => {
	test('publishes only what is due', () => {
		const items = [item({ slug: 'later', at: at(60) }), item({ slug: 'now', at: at(-1) })];
		assert.deepEqual(dueToPublish(items, NOW).map((i) => i.slug), ['now']);
	});

	test('never republishes something already published', () => {
		assert.deepEqual(dueToPublish([item({ at: at(-60), state: 'published' })], NOW), []);
	});

	test('gives up on an item that keeps failing', () => {
		assert.deepEqual(dueToPublish([item({ at: at(-60), tries: MAX_TRIES })], NOW), []);
	});

	test('announces only once the article is actually live on the site', () => {
		const published = item({ slug: 'fresh', state: 'published', newsletter: true });
		assert.deepEqual(dueToAnnounce([published], []), [], 'announced before the site rebuilt');
		assert.deepEqual(dueToAnnounce([published], ['fresh']).map((i) => i.slug), ['fresh']);
	});

	test('does not announce what was never meant to be announced', () => {
		const quiet = item({ slug: 'quiet', state: 'published', newsletter: false });
		assert.deepEqual(dueToAnnounce([quiet], ['quiet']), []);
	});
});

describe('housekeeping', () => {
	test('the editor sees a live entry for its own article only', () => {
		const items = [item({ slug: 'a-post' }), item({ slug: 'other' })];
		assert.equal(forSlug(items, 'a-post')?.slug, 'a-post');
		assert.equal(forSlug(items, 'nothing'), null);
		assert.equal(forSlug([item({ state: 'announced' })], 'a-post'), null, 'finished work is not still "scheduled"');
	});

	test('finished entries are dropped after a month, pending ones never', () => {
		const old = item({ state: 'announced', announcedAt: new Date(NOW.getTime() - 40 * 86_400_000).toISOString() });
		const recent = item({ state: 'published', publishedAt: new Date(NOW.getTime() - 2 * 86_400_000).toISOString() });
		const waiting = item({ at: new Date(NOW.getTime() + 300 * 86_400_000).toISOString() });
		assert.deepEqual(prune([old, recent, waiting], NOW).map((i) => i.state), ['published', 'pending']);
	});

	test('knows when nothing more is owed', () => {
		assert.equal(isSettled(item({ state: 'published', newsletter: false })), true);
		assert.equal(isSettled(item({ state: 'published', newsletter: true })), false);
		assert.equal(isSettled(item({ state: 'announced', newsletter: true })), true);
		assert.equal(isSettled(item({ tries: MAX_TRIES })), true);
	});
});
