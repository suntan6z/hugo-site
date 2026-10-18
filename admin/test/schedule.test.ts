import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
	whyNotDay, morningOf, todayIn, dueToPublish, dueToAnnounce, forSlug, prune, isSettled, MAX_TRIES,
	announceTimeOf, tomorrowIn, isHeldNewsletter, defaultDispatches, remaining, type Scheduled
} from '../src/lib/server/schedule/plan.ts';

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

describe('a newsletter held for a morning', () => {
	const held = (over: Partial<Scheduled> = {}) =>
		item({ state: 'published', newsletter: true, announceAt: announceTimeOf('2026-09-13')!, publishedAt: NOW.toISOString(), ...over });

	test('it is sent at 9:30 Paris time, half an hour after articles go live', () => {
		assert.equal(announceTimeOf('2026-09-13'), '2026-09-13T07:30:00.000Z');
		assert.equal(announceTimeOf('2026-12-01'), '2026-12-01T08:30:00.000Z');
		assert.equal(announceTimeOf('nonsense'), null);
	});

	test('the first day to pick is tomorrow in Paris, not in UTC', () => {
		assert.equal(tomorrowIn(NOW), '2026-09-13');
		assert.equal(tomorrowIn(new Date('2026-09-12T23:30:00Z')), '2026-09-14');
		assert.equal(tomorrowIn(new Date('2026-12-31T12:00:00Z')), '2027-01-01');
	});

	test('it is recognised, and an ordinary announced or unscheduled item is not', () => {
		assert.equal(isHeldNewsletter(held()), true);
		assert.equal(isHeldNewsletter(held({ announcedAt: NOW.toISOString() })), false);
		assert.equal(isHeldNewsletter(item({ state: 'published', newsletter: true })), false, 'no hold date: sent as soon as live');
		assert.equal(isHeldNewsletter(held({ newsletter: false })), false);
	});

	test('it waits for its morning even though the article is live', () => {
		const items = [held()];
		assert.deepEqual(dueToAnnounce(items, ['a-post'], NOW), []);
		assert.deepEqual(dueToAnnounce(items, ['a-post'], new Date('2026-09-13T07:29:59Z')), []);
		assert.equal(dueToAnnounce(items, ['a-post'], new Date('2026-09-13T07:30:00Z')).length, 1);
	});

	test('once its morning comes it still waits for the site to serve the article', () => {
		assert.deepEqual(dueToAnnounce([held()], [], new Date('2026-09-14T00:00:00Z')), []);
	});

	test('an article announced as soon as it is live is unaffected by any of this', () => {
		assert.equal(dueToAnnounce([item({ state: 'published', newsletter: true })], ['a-post'], NOW).length, 1);
	});

	test('it survives clean-up while its date is ahead, however old the entry', () => {
		const old = held({ createdAt: '2026-06-01T00:00:00Z', publishedAt: '2026-06-01T00:00:00Z', announceAt: '2026-10-01T07:30:00Z' });
		assert.equal(prune([old], NOW).length, 1);
		assert.equal(prune([{ ...old, announcedAt: '2026-06-02T00:00:00Z' }], NOW).length, 0, 'once sent long ago it goes');
	});
});

describe('what an announcement sends to each list', () => {
	const t = (fr: boolean, it: boolean) => ({
		en: { exists: true, title: 'English title', description: 'English intro.' },
		fr: { exists: fr, title: fr ? 'Titre' : '', description: fr ? 'Intro.' : '' },
		it: { exists: it, title: it ? 'Titolo' : '', description: it ? 'Intro it.' : '' }
	});

	test('each list gets the article in its own language, in its own words', () => {
		assert.deepEqual(defaultDispatches(t(true, true), ['en', 'fr', 'it']).map((d) => [d.list, d.lang, d.subject, d.intro]), [
			['en', 'en', 'English title', 'English intro.'],
			['fr', 'fr', 'Titre', 'Intro.'],
			['it', 'it', 'Titolo', 'Intro it.']
		]);
	});

	test('a list whose language has no translation is left out, never sent English', () => {
		assert.deepEqual(defaultDispatches(t(true, false), ['en', 'fr', 'it']).map((d) => d.list), ['en', 'fr']);
	});

	test('a language that has no list at all is not offered, translated or not', () => {
		assert.deepEqual(defaultDispatches(t(true, true), ['en']).map((d) => d.list), ['en']);
	});

	test('what was written for the English list before there were lists is still what it sends', () => {
		const [en] = defaultDispatches(t(false, false), ['en'], { subject: 'Mine', title: 'My headline', intro: 'My intro', note: 'Hi' });
		assert.deepEqual([en.subject, en.title, en.intro, en.note], ['Mine', 'My headline', 'My intro', 'Hi']);
	});

	test('a retry sends only the lists not yet sent to', () => {
		const all = defaultDispatches(t(true, true), ['en', 'fr', 'it']);
		assert.deepEqual(remaining(all, ['en']).map((d) => d.list), ['fr', 'it']);
		assert.deepEqual(remaining(all, ['en', 'fr', 'it']), []);
		assert.equal(remaining(all).length, 3);
	});
});
