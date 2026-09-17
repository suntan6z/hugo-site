import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGitLog, mergeRevisions, LOG_FORMAT } from '../src/lib/server/content/revisions.ts';

const rec = (sha: string, date: string, author: string, subject: string) => `${sha}\x1f${date}\x1f${author}\x1f${subject}\x1e\n`;

test('git log output parses into revisions, whatever the messages contain', () => {
	const out = rec('a'.repeat(40), '2026-09-16T11:17:44+03:00', 'Lorenzo', 'Publish colors-of-solidarity') +
		rec('b'.repeat(40), '2026-09-12T08:00:00+02:00', 'loconsole-admin[bot]', 'Tidy up: 3 small fixes | with a pipe');
	assert.deepEqual(parseGitLog(out), [
		{ sha: 'a'.repeat(40), date: '2026-09-16T11:17:44+03:00', author: 'Lorenzo', message: 'Publish colors-of-solidarity' },
		{ sha: 'b'.repeat(40), date: '2026-09-12T08:00:00+02:00', author: 'loconsole-admin[bot]', message: 'Tidy up: 3 small fixes | with a pipe' }
	]);
	assert.deepEqual(parseGitLog(''), []);
	assert.match(LOG_FORMAT, /%x1e$/);
});

test('histories of several files merge into one list, each commit once, newest first', () => {
	const a = { sha: 'a'.repeat(40), date: '2026-09-01T00:00:00Z', author: 'x', message: 'one' };
	const b = { sha: 'b'.repeat(40), date: '2026-09-03T00:00:00Z', author: 'x', message: 'two' };
	const c = { sha: 'c'.repeat(40), date: '2026-09-02T00:00:00Z', author: 'x', message: 'three' };
	assert.deepEqual(mergeRevisions([[b, a], [b, c]], 10).map((r) => r.message), ['two', 'three', 'one']);
	assert.equal(mergeRevisions([[b, a], [c]], 2).length, 2);
});
