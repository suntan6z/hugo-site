import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { findTasks, snoozeUntil, type Corpus, type CorpusPost } from '../src/lib/server/tasks/find.ts';

const NOW = new Date('2026-09-12T12:00:00Z');

const post = (over: Partial<CorpusPost> = {}): CorpusPost => ({
	slug: 'a-post',
	title: 'A Post',
	draft: false,
	date: '2026-01-01',
	translations: {
		en: { exists: true, title: 'A Post', description: 'x'.repeat(140), body: 'Body.', untranslated: false },
		fr: { exists: true, title: 'Un article', description: 'y'.repeat(140), body: 'Corps.', untranslated: false },
		it: { exists: true, title: 'Un articolo', description: 'z'.repeat(140), body: 'Corpo.', untranslated: false }
	},
	...over
});

const corpus = (over: Partial<Corpus> = {}): Corpus => ({ posts: [], photos: [], nowUpdated: null, ...over });

describe('what the list asks you to do', () => {
	test('a tidy article asks for nothing', () => {
		assert.deepEqual(findTasks(corpus({ posts: [post()] }), {}, NOW), []);
	});

	test('an image with no alt text becomes one task per image and language', () => {
		const p = post({
			translations: {
				...post().translations,
				en: { exists: true, title: 'A Post', description: 'x'.repeat(140), body: '![](one.jpg)\n\n![described](two.jpg)\n\n![](three.jpg)', untranslated: false }
			}
		});
		const tasks = findTasks(corpus({ posts: [p] }), {}, NOW).filter((t) => t.kind === 'alt-text');
		assert.deepEqual(tasks.map((t) => t.image), ['one.jpg', 'three.jpg']);
		assert.equal(tasks[0].where, 'A Post · English');
	});

	test('a missing translation is asked for, but not on a draft', () => {
		const missing = post({ translations: { ...post().translations, it: { exists: false, title: '', description: '', body: '', untranslated: false } } });
		assert.equal(findTasks(corpus({ posts: [missing] }), {}, NOW).filter((t) => t.kind === 'translation').length, 1);

		const draft = post({ draft: true, translations: missing.translations });
		assert.equal(findTasks(corpus({ posts: [draft] }), {}, NOW).filter((t) => t.kind === 'translation').length, 0);
	});

	test('a placeholder stub counts as missing, not as done', () => {
		const stub = post({
			translations: { ...post().translations, fr: { exists: true, title: 'Un article', description: '', body: '', untranslated: true } }
		});
		const kinds = findTasks(corpus({ posts: [stub] }), {}, NOW).map((t) => t.kind);
		assert.ok(kinds.includes('translation'));
		// Its empty description is not also nagged about: the file is a placeholder.
		assert.equal(kinds.filter((k) => k === 'description').length, 0);
	});

	test('an article with images but no featured_image asks for nothing: the first image is its thumbnail', () => {
		const p = post({ translations: { ...post().translations, en: { exists: true, title: 'A Post', description: 'x'.repeat(140), body: '![a view](one.jpg)', untranslated: false } } });
		assert.deepEqual(findTasks(corpus({ posts: [p] }), {}, NOW), []);
	});

	test('descriptions are judged by the same thresholds as the publish checks', () => {
		const short = post({ translations: { ...post().translations, en: { exists: true, title: 'A Post', description: 'too short', body: 'B.', untranslated: false } } });
		const tasks = findTasks(corpus({ posts: [short] }), {}, NOW);
		assert.deepEqual(tasks.map((t) => t.kind), ['description']);
		assert.equal(tasks[0].current, 'too short');
	});

	test('a gallery photo without alt text is a task; one with it is not', () => {
		const photos = [
			{ city: 'bari', cityName: 'Bari', file: '1.jpg', alt: '' },
			{ city: 'bari', cityName: 'Bari', file: '2.jpg', alt: 'A described photo' }
		];
		const tasks = findTasks(corpus({ photos }), {}, NOW);
		assert.deepEqual(tasks.map((t) => t.file), ['1.jpg']);
	});

	test('the Now page is only questioned once it is genuinely old', () => {
		assert.equal(findTasks(corpus({ nowUpdated: '2026-08-01' }), {}, NOW).length, 0);
		const stale = findTasks(corpus({ nowUpdated: '2026-01-01' }), {}, NOW);
		assert.deepEqual(stale.map((t) => t.kind), ['now-check']);
		assert.match(stale[0].where, /days ago/);
	});
});

describe('skipping', () => {
	const noItalian = { ...post().translations, it: { exists: false, title: '', description: '', body: '', untranslated: false } };
	const p = post({ translations: noItalian });

	test('a skipped task stays away until its snooze expires', () => {
		const all = findTasks(corpus({ posts: [p] }), {}, NOW);
		assert.equal(all.length, 1);
		const id = all[0].id;

		const hidden = findTasks(corpus({ posts: [p] }), { [id]: snoozeUntil('translation', NOW) }, NOW);
		assert.equal(hidden.length, 0);

		const later = new Date(NOW.getTime() + 31 * 86_400_000);
		assert.equal(findTasks(corpus({ posts: [p] }), { [id]: snoozeUntil('translation', NOW) }, later).length, 1);
	});

	test('ids are stable across scans, so a skip sticks to the right thing', () => {
		const a = findTasks(corpus({ posts: [p] }), {}, NOW);
		const b = findTasks(corpus({ posts: [post({ translations: noItalian, title: 'A Post' })] }), {}, NOW);
		assert.deepEqual(a.map((t) => t.id), b.map((t) => t.id));
	});
});

test('the cheapest work is offered first', () => {
	const messy = post({
		translations: {
			en: { exists: true, title: 'A Post', description: '', body: '![](one.jpg)', untranslated: false },
			fr: { exists: false, title: '', description: '', body: '', untranslated: false },
			it: { exists: false, title: '', description: '', body: '', untranslated: false }
		}
	});
	const kinds = findTasks(corpus({ posts: [messy] }), {}, NOW).map((t) => t.kind);
	assert.deepEqual(kinds, ['alt-text', 'description', 'translation', 'translation']);
});

describe('dead links', () => {
	const dead = [{ url: 'https://gone.example/', reason: 'the page is not there any more (404)' }];

	test('a dead link becomes one task per place it appears, in articles and pages', () => {
		const p = post({
			translations: {
				...post().translations,
				en: { exists: true, title: 'A Post', description: 'x'.repeat(140), body: 'See [this](https://gone.example/) and [that](https://fine.example/).', untranslated: false },
				fr: { exists: true, title: 'Un article', description: 'y'.repeat(140), body: 'Voir <a href="https://gone.example/">ceci</a>.', untranslated: false }
			},
			links: { partner_url: 'https://gone.example/' }
		});
		const pages = [{ name: 'now', label: 'Now', translations: { en: { exists: true, body: '<a href="https://gone.example/">x</a>' }, fr: { exists: false, body: '' }, it: { exists: true, body: '' } } }];
		const tasks = findTasks(corpus({ posts: [p], pages, deadLinks: dead }), {}, NOW).filter((t) => t.kind === 'dead-link');
		assert.deepEqual(tasks.map((t) => t.where).sort(), ['A Post · English', 'A Post · French', 'A Post · partner’s website', 'Now page · English']);
		assert.ok(tasks.every((t) => t.url === 'https://gone.example/' && t.reason?.includes('404')));
		assert.equal(tasks.find((t) => t.field)?.field, 'partner_url');
		assert.equal(tasks.find((t) => t.page)?.page, 'now');
	});

	test('a link that merely starts like the dead one is not flagged', () => {
		const p = post({
			translations: { ...post().translations, en: { exists: true, title: 'A Post', description: 'x'.repeat(140), body: '[a](https://gone.example/still-here)', untranslated: false } }
		});
		assert.deepEqual(findTasks(corpus({ posts: [p], deadLinks: dead }), {}, NOW), []);
	});
});
