import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { norm, search, highlight, tokensOf, type Item } from '../src/lib/search.ts';

const items: Item[] = [
	{ kind: 'screen', title: 'Gallery', href: '/gallery' },
	{ kind: 'screen', title: 'Newsletter', href: '/newsletter' },
	{ kind: 'action', title: 'New article', href: '/posts/new' },
	{ kind: 'article', title: 'Edward Snowden: The Whistleblower Who Exposed Mass Surveillance', hint: '2026-02-05', keywords: 'edward-snowden-mass-surveillance Cybersecurity', href: '/posts/edward-snowden-mass-surveillance' },
	{ kind: 'article', title: 'It’s not over. Chat control... Again!', hint: '2026-07-07', keywords: 'chat-control-eu The EU proposal to mass-scan private messages', href: '/posts/chat-control-eu' },
	{ kind: 'page', title: 'About', hint: 'Who you are, and the timeline beside it', href: '/pages/about' },
	{ kind: 'gallery', title: 'Paris', hint: 'Gallery', href: '/gallery/paris' },
	{ kind: 'string', title: 'À propos', hint: 'nav_about', href: '/i18n?q=nav_about' },
	{ kind: 'string', title: 'Send message', hint: 'contact_send', href: '/i18n?q=contact_send' }
];
const titles = (q: string) => search(items, q).map((i) => i.title);

describe('matching', () => {
	test('accents and capitals do not matter, in the query or the text', () => {
		assert.ok(titles('a propos').includes('À propos'));
		assert.ok(titles('À PROPOS').includes('À propos'));
		assert.equal(norm('Crème Brûlée ÀÉÎ'), 'creme brulee aei');
	});

	test('a word can be started rather than finished', () => {
		assert.equal(titles('gal')[0], 'Gallery');
		assert.ok(titles('gal').includes('Paris'), 'a city is in the gallery');
		assert.equal(titles('news')[0], 'Newsletter');
	});

	test('every word has to be found, in any order', () => {
		assert.deepEqual(titles('snowden whistle'), ['Edward Snowden: The Whistleblower Who Exposed Mass Surveillance']);
		assert.deepEqual(titles('surveillance snowden'), ['Edward Snowden: The Whistleblower Who Exposed Mass Surveillance']);
		assert.deepEqual(titles('snowden paris'), []);
	});

	test('it finds things by what is not shown: a slug, a description, a category', () => {
		assert.deepEqual(titles('chat-control-eu'), ['It’s not over. Chat control... Again!']);
		assert.deepEqual(titles('private messages'), ['It’s not over. Chat control... Again!']);
		assert.deepEqual(titles('cybersecurity'), ['Edward Snowden: The Whistleblower Who Exposed Mass Surveillance']);
		assert.deepEqual(titles('contact_send'), ['Send message']);
	});

	test('a title outranks a description, and a screen outranks a sentence containing the word', () => {
		const list: Item[] = [
			{ kind: 'article', title: 'A long piece', keywords: 'mentions the gallery in passing' },
			{ kind: 'screen', title: 'Gallery' },
			{ kind: 'article', title: 'Gallery of horrors' }
		];
		assert.deepEqual(search(list, 'gallery').map((i) => i.title), ['Gallery', 'Gallery of horrors', 'A long piece']);
	});

	test('an empty or blank query finds nothing, and a miss finds nothing', () => {
		assert.deepEqual(search(items, ''), []);
		assert.deepEqual(search(items, '   '), []);
		assert.deepEqual(search(items, 'zzzz'), []);
	});

	test('it stops at the limit, and ties keep the order they were given', () => {
		const many = Array.from({ length: 30 }, (_, i): Item => ({ kind: 'article', title: `Post ${i}` }));
		assert.equal(search(many, 'post', 5).length, 5);
		assert.deepEqual(search(many, 'post', 3).map((i) => i.title), ['Post 0', 'Post 1', 'Post 2']);
	});
});

describe('highlighting', () => {
	const joined = (r: { text: string; hit: boolean }[]) => r.map((x) => (x.hit ? `[${x.text}]` : x.text)).join('');

	test('the matching words are flagged, whatever their case or accents', () => {
		assert.equal(joined(highlight('À propos de moi', 'a prop')), '[À] [prop]os de moi');
		assert.equal(joined(highlight('Gallery of Galleries', 'gal')), '[Gal]lery of [Gal]leries');
	});

	test('the runs add back up to the text, and nothing flagged when nothing matches', () => {
		const r = highlight('Chat control… Again!', 'control again');
		assert.equal(r.map((x) => x.text).join(''), 'Chat control… Again!');
		assert.deepEqual(highlight('Hello', 'zzz'), [{ text: 'Hello', hit: false }]);
		assert.deepEqual(highlight('', 'a'), []);
	});

	test('words are the query\'s own, split on spaces', () => {
		assert.deepEqual(tokensOf('  Snowden   MASS '), ['snowden', 'mass']);
	});
});
