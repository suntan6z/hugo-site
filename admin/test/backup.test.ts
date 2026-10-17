import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { backupLinks, aboutSize, readRepoFacts } from '../src/lib/server/content/backup.ts';

describe('where the backup is', () => {
	test('the zip of the branch, the repository page and a clone command, from the owner and name', () => {
		assert.deepEqual(backupLinks('suntan6z', 'hugo-site'), {
			zip: 'https://github.com/suntan6z/hugo-site/archive/refs/heads/main.zip',
			repo: 'https://github.com/suntan6z/hugo-site',
			clone: 'git clone https://github.com/suntan6z/hugo-site.git'
		});
	});

	test('a name that is not safe in an address is encoded rather than trusted', () => {
		const l = backupLinks('a b', 'x/../y', 'feat/z');
		assert.ok(!/ |\.\.\//.test(l.zip));
		assert.match(l.zip, /^https:\/\/github\.com\/a%20b\/x%2F\.\.%2Fy\/archive\/refs\/heads\/feat%2Fz\.zip$/);
	});
});

describe('how big', () => {
	test('in the unit a person would say', () => {
		assert.equal(aboutSize(512), 'about 512 KB');
		assert.equal(aboutSize(264724), 'about 259 MB');
		assert.equal(aboutSize(3 * 1048576), 'about 3.0 GB');
		for (const bad of [0, -5, NaN, Infinity]) assert.equal(aboutSize(bad), '', String(bad));
	});

	test('GitHub\'s answer is read for what the page shows, and anything else is ignored', () => {
		assert.deepEqual(readRepoFacts({ size: 264724, pushed_at: '2026-10-17T21:09:00Z', private: false, other: 1 }), {
			sizeLabel: 'about 259 MB', pushedAt: '2026-10-17T21:09:00Z', isPrivate: false
		});
		assert.equal(readRepoFacts({ private: true, size: 10 })?.isPrivate, true);
		for (const junk of [null, 'x', 5, {}, { message: 'Not Found' }, { size: '5' }]) assert.equal(readRepoFacts(junk), null, JSON.stringify(junk));
	});
});
