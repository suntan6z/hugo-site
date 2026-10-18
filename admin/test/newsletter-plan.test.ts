import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
	initialFields, initialChoices, contentLangFor, skipReason, planSend, reach, missingTranslations,
	type ArticleLangs, type ListInfo
} from '../src/lib/newsletter-plan.ts';

const article = (fr: boolean, it: boolean): ArticleLangs => ({
	translations: {
		en: { exists: true, title: 'English title', description: 'English intro.' },
		fr: { exists: fr, title: fr ? 'Titre' : '', description: fr ? 'Intro fr.' : '' },
		it: { exists: it, title: it ? 'Titolo' : '', description: it ? 'Intro it.' : '' }
	},
	urls: { en: 'https://x/en/', fr: 'https://x/fr/', it: 'https://x/it/' },
	imageUrl: null
});
const lists = (en: number, fr: number, it: number): ListInfo[] => [
	{ lang: 'en', subscribers: en }, { lang: 'fr', subscribers: fr }, { lang: 'it', subscribers: it }
];

describe('starting from the article', () => {
	test('each language starts from its own words, and the subject is the title', () => {
		const f = initialFields(article(true, true));
		assert.deepEqual(f.fr, { subject: 'Titre', title: 'Titre', intro: 'Intro fr.', note: '' });
		assert.deepEqual(f.en.subject, 'English title');
	});

	test('a list is on when the article exists in its language and someone is on it', () => {
		const c = initialChoices(article(true, false), lists(3, 5, 4));
		assert.deepEqual([c.en.on, c.fr.on, c.it.on], [true, true, false]);
		assert.ok(!c.fr.english && !c.it.english, 'English is never assumed');
	});

	test('an empty list is off, whatever the article has', () => {
		const c = initialChoices(article(true, true), lists(3, 0, 2));
		assert.deepEqual([c.en.on, c.fr.on, c.it.on], [true, false, true]);
	});

	test('a language with no list at all is off', () => {
		const c = initialChoices(article(true, true), [{ lang: 'en', subscribers: 3 }]);
		assert.equal(c.fr.on, false);
	});
});

describe('what each list gets', () => {
	test('its own language when the article has one', () => {
		assert.equal(contentLangFor('fr', article(true, false), { on: true, english: false }), 'fr');
		assert.equal(contentLangFor('en', article(false, false), { on: true, english: false }), 'en');
	});

	test('nothing when it has not, unless the English version was asked for', () => {
		assert.equal(contentLangFor('it', article(true, false), { on: true, english: false }), null);
		assert.equal(contentLangFor('it', article(true, false), { on: true, english: true }), 'en');
	});

	test('a translation beats the English checkbox', () => {
		assert.equal(contentLangFor('fr', article(true, false), { on: true, english: true }), 'fr');
	});

	test('the reasons a list is skipped, in the order that matters', () => {
		const a = article(true, false);
		assert.match(skipReason('fr', a, { on: true, english: false }, 0)!, /Nobody/);
		assert.match(skipReason('fr', a, { on: false, english: false }, 4)!, /off/);
		assert.match(skipReason('it', a, { on: true, english: false }, 4)!, /no version/);
		assert.equal(skipReason('it', a, { on: true, english: true }, 4), null);
		assert.equal(skipReason('fr', a, { on: true, english: false }, 4), null);
	});
});

describe('the send', () => {
	test('one email per list that is on, in its language, in the words the author left', () => {
		const a = article(true, false);
		const f = initialFields(a);
		f.fr.subject = 'Sujet modifié';
		const plan = planSend(a, lists(3, 5, 4), f, initialChoices(a, lists(3, 5, 4)));
		assert.deepEqual(plan.map((p) => [p.list, p.lang, p.subject]), [['en', 'en', 'English title'], ['fr', 'fr', 'Sujet modifié']]);
	});

	test('the English version to a list without a translation, when chosen, uses the English words', () => {
		const a = article(false, false);
		const ls = lists(3, 5, 0);
		const f = initialFields(a);
		f.en.subject = 'My English subject';
		const c = initialChoices(a, ls);
		c.fr.on = true;
		c.fr.english = true;
		const plan = planSend(a, ls, f, c);
		assert.deepEqual(plan.map((p) => [p.list, p.lang, p.subject]), [['en', 'en', 'My English subject'], ['fr', 'en', 'My English subject']]);
	});

	test('switching a list off removes it', () => {
		const a = article(true, true);
		const ls = lists(3, 5, 4);
		const c = initialChoices(a, ls);
		c.it.on = false;
		assert.deepEqual(planSend(a, ls, initialFields(a), c).map((p) => p.list), ['en', 'fr']);
	});

	test('reach is who is on the lists written to', () => {
		const a = article(true, true);
		const ls = lists(3, 5, 4);
		assert.equal(reach(planSend(a, ls, initialFields(a), initialChoices(a, ls)), ls), 12);
		assert.equal(reach([], ls), 0);
	});

	test('the page can tell the author who will be skipped for want of a translation', () => {
		const a = article(true, false);
		const ls = lists(3, 5, 4);
		const c = initialChoices(a, ls);
		assert.deepEqual(missingTranslations(a, ls, c), ['it']);
		c.it.english = true;
		assert.deepEqual(missingTranslations(a, ls, c), []);
		assert.deepEqual(missingTranslations(a, lists(3, 5, 0), initialChoices(a, lists(3, 5, 0))), [], 'nobody there, nobody to skip');
	});
});
