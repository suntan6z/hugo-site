import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describe, groupOf, GROUPS } from '../src/lib/activity.ts';

const at = '2026-10-18T10:00:00.000Z';
const titles = { 'colors-of-solidarity': 'Colors of solidarity', 'moved-title': 'New name' };

test('an entry reads as a sentence that names the article by its title', () => {
	assert.equal(describe({ at, event: 'publish', slug: 'colors-of-solidarity' }, titles), 'Published “Colors of solidarity”');
	assert.equal(describe({ at, event: 'preview-revoked', slug: 'colors-of-solidarity' }, titles), 'Stopped sharing “Colors of solidarity”');
});

test('an article that no longer exists falls back to its address, readable', () => {
	assert.equal(describe({ at, event: 'delete-post', slug: 'out-the-shadow-3' }, {}), 'Deleted “out the shadow 3”');
});

test('languages and pages are named, not coded', () => {
	assert.equal(describe({ at, event: 'subscriber-language', from: 'en', to: 'fr' }), 'Moved a subscriber from English to French');
	assert.equal(describe({ at, event: 'translate', slug: 'now', to: 'it' }), 'Machine-translated the Now page into Italian');
	assert.equal(describe({ at, event: 'page-save', slug: 'privacy-policy' }), 'Updated the Privacy policy page');
});

test('a schedule says when it goes live, in Paris time', () => {
	const s = describe({ at, event: 'schedule', slug: 'colors-of-solidarity', goesLiveAt: '2026-10-20T07:00:00.000Z', newsletter: true }, titles);
	assert.match(s, /^Scheduled “Colors of solidarity” for .*09:00.*, with the newsletter$/);
});

test('counts are pluralised', () => {
	assert.equal(describe({ at, event: 'focus-finish', edits: 1 }), 'Finished a quick-edit session (1 change)');
	assert.equal(describe({ at, event: 'subscribers-exported', count: 3 }), 'Downloaded the subscriber list (3 people)');
	assert.equal(describe({ at, event: 'link-check', checked: 40, dead: 0 }), 'Checked the links to other sites: 40 checked, none broken');
});

test('a code it does not know is still readable, never blank', () => {
	assert.equal(describe({ at, event: 'something-new-happened' }), 'Something new happened');
});

test('nothing in a sentence is a code, a path or a hash', () => {
	const entries = [
		{ event: 'rename-post', from: 'a-b', to: 'c-d', sha: 'abc123def456' },
		{ event: 'image-deleted', path: 'content/blog/x/photo.webp' },
		{ event: 'save', slug: 'x', sha: 'abc123def456' }
	];
	for (const e of entries) {
		const s = describe({ at, ...e }, {});
		assert.doesNotMatch(s, /abc123|content\/|\.\w+\//, s);
	}
});

test('every filter heading has at least one event, and unknown events do not vanish', () => {
	for (const g of GROUPS) assert.ok(['create-post', 'newsletter-sent', 'i18n-save', 'login', 'health-check'].some((e) => groupOf(e) === g.id), g.id);
	assert.equal(groupOf('brand-new-event'), 'site');
});
