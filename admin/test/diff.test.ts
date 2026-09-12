import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { diffLines, hunksOf, fileChange } from '../src/lib/server/content/diff.ts';

const render = (before: string, after: string) =>
	diffLines(before, after)
		.map((c) => (c.kind === 'add' ? '+' : c.kind === 'remove' ? '-' : ' ') + c.line)
		.join('\n');

describe('the line diff', () => {
	test('an edit in the middle leaves everything else alone', () => {
		assert.equal(render('a\nb\nc', 'a\nB\nc'), ' a\n-b\n+B\n c');
	});

	test('reports an insertion as an insertion, not a rewrite', () => {
		assert.equal(render('a\nc', 'a\nb\nc'), ' a\n+b\n c');
		assert.equal(render('a\nb\nc', 'a\nc'), ' a\n-b\n c');
	});

	test('handles an empty side', () => {
		assert.equal(render('', 'a\nb'), '+a\n+b');
		assert.equal(render('a\nb', ''), '-a\n-b');
		assert.equal(render('', ''), '');
	});

	test('identical text produces no changes at all', () => {
		const s = 'one\ntwo\nthree';
		assert.equal(diffLines(s, s).every((c) => c.kind === 'same'), true);
	});

	test('a moved line is one removal and one addition, never a silent loss', () => {
		const changes = diffLines('a\nb\nc', 'b\nc\na');
		const kept = changes.filter((c) => c.kind === 'same').map((c) => c.line);
		assert.deepEqual(kept, ['b', 'c']);
		assert.deepEqual(changes.filter((c) => c.kind === 'remove').map((c) => c.line), ['a']);
		assert.deepEqual(changes.filter((c) => c.kind === 'add').map((c) => c.line), ['a']);
	});

	test('every line of the new text survives the round trip', () => {
		const after = 'title\n\nbody line\nanother\n\nend';
		const rebuilt = diffLines('title\n\nold body\n\nend', after)
			.filter((c) => c.kind !== 'remove')
			.map((c) => c.line)
			.join('\n');
		assert.equal(rebuilt, after);
	});
});

describe('hunks', () => {
	test('skip long stretches of unchanged text but keep context', () => {
		const before = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n');
		const after = before.replace('line 20', 'line twenty');
		const hunks = hunksOf(diffLines(before, after));
		assert.equal(hunks.length, 1);
		assert.deepEqual(hunks[0].changes.map((c) => c.kind), ['same', 'same', 'remove', 'add', 'same', 'same']);
		assert.equal(hunks[0].at, 19, 'hunk should start two lines before the change');
	});

	test('two distant edits are two hunks', () => {
		const before = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n');
		const after = before.replace('line 5', 'five').replace('line 30', 'thirty');
		assert.equal(hunksOf(diffLines(before, after)).length, 2);
	});
});

describe('a file in a save', () => {
	test('is added, modified, deleted or unchanged', () => {
		assert.equal(fileChange('p', null, 'x').status, 'added');
		assert.equal(fileChange('p', 'x', 'y').status, 'modified');
		assert.equal(fileChange('p', 'x', null).status, 'deleted');
		assert.equal(fileChange('p', 'x', 'x').status, 'unchanged');
	});

	test('counts what changed', () => {
		const c = fileChange('p', 'a\nb\nc', 'a\nB\nc\nd');
		assert.equal(c.added, 2);
		assert.equal(c.removed, 1);
	});

	test('gives up on a very large file rather than diffing it line by line', () => {
		const big = Array.from({ length: 3000 }, (_, i) => `l${i}`).join('\n');
		const c = fileChange('p', big, big + '\nmore');
		assert.equal(c.tooBig, true);
		assert.deepEqual(c.hunks, []);
	});
});
