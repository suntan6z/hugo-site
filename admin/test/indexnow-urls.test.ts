import { test } from 'node:test';
import assert from 'node:assert/strict';
import { postUrls, listUrls, homeUrls } from '../src/lib/server/integrations/indexnow-urls.ts';

const site = 'https://lorenzo.loconsole.eu';

test('an article is one URL per language it exists in', () => {
	assert.deepEqual(postUrls(site, 'chat-control-eu', ['en', 'fr']), [
		`${site}/en/blog/chat-control-eu/`,
		`${site}/fr/blog/chat-control-eu/`
	]);
	assert.deepEqual(postUrls(site, 'x', []), []);
});

test('publishing also touches each language’s home page and blog index', () => {
	assert.deepEqual(listUrls(site, ['en', 'it']), [`${site}/en/`, `${site}/en/blog/`, `${site}/it/`, `${site}/it/blog/`]);
});

test('a gallery change touches only the home pages', () => {
	assert.deepEqual(homeUrls(site, ['en', 'fr', 'it']), [`${site}/en/`, `${site}/fr/`, `${site}/it/`]);
});
