import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { cell, when, toCsv } from '../src/lib/server/integrations/subscribers-csv.ts';
import { readAll, type Page } from '../src/lib/server/integrations/paginate.ts';

describe('a CSV cell', () => {
	test('plain text is left alone, and commas, quotes and breaks are quoted', () => {
		assert.equal(cell('a@example.com'), 'a@example.com');
		assert.equal(cell('a,b'), '"a,b"');
		assert.equal(cell('say "hi"'), '"say ""hi"""');
		assert.equal(cell('two\nlines'), '"two\nlines"');
	});

	test('what a spreadsheet would run as a formula is defused first', () => {
		for (const bad of ['=HYPERLINK("http://evil")', '+1+1', '-2', '@SUM(A1)', '\t=1', '\r=1']) {
			assert.ok(cell(bad).replace(/^"/, '').startsWith("'"), JSON.stringify(bad));
		}
		assert.equal(cell('a=b@c'), 'a=b@c', 'only the start matters');
	});
});

describe('dates', () => {
	test('Resend\'s format and an ISO instant both read, as UTC', () => {
		assert.equal(when('2026-09-01 10:00:00.000000+00'), '2026-09-01 10:00');
		assert.equal(when('2026-09-01T10:05:00.000Z'), '2026-09-01 10:05');
		assert.equal(when(''), '');
		assert.equal(when('not a date'), '');
	});
});

describe('the file', () => {
	const rows = [
		{ email: 'old@example.com', createdAt: '2026-01-01 08:00:00.000000+00', unsubscribed: true },
		{ email: 'new@example.com', createdAt: '2026-09-01 10:00:00.000000+00', unsubscribed: false },
		{ email: 'odd,"one"@example.com', createdAt: '', unsubscribed: false }
	];

	test('a header, then newest first, with CRLF line ends and a final newline', () => {
		assert.equal(
			toCsv(rows),
			'email,status,joined (UTC)\r\n' +
				'new@example.com,subscribed,2026-09-01 10:00\r\n' +
				'old@example.com,unsubscribed,2026-01-01 08:00\r\n' +
				'"odd,""one""@example.com",subscribed,\r\n'
		);
	});

	test('an empty list is just the header', () => {
		assert.equal(toCsv([]), 'email,status,joined (UTC)\r\n');
	});
});

describe('reading every page of a list', () => {
	const ids = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ id: `c${from + i}` }));
	/** A service of `total` rows that pages by cursor, `size` at a time. */
	const service = (total: number, size: number, calls: (string | undefined)[] = []) => async (after: string | undefined): Promise<Page<{ id: string }>> => {
		calls.push(after);
		const start = after ? Number(after.slice(1)) + 1 : 0;
		const data = ids(Math.min(size, total - start), start);
		return { data, has_more: start + data.length < total };
	};

	test('past the first page, which is where a naive reader stops', async () => {
		const calls: (string | undefined)[] = [];
		const all = await readAll(service(250, 100, calls));
		assert.equal(all.length, 250);
		assert.deepEqual(calls, [undefined, 'c99', 'c199']);
	});

	test('one page is one call', async () => {
		const calls: (string | undefined)[] = [];
		assert.equal((await readAll(service(3, 100, calls))).length, 3);
		assert.equal(calls.length, 1);
	});

	test('a service that does not say there is more is believed', async () => {
		const all = await readAll(async () => ({ data: ids(5) }));
		assert.equal(all.length, 5);
	});

	test('a service that ignores the cursor cannot loop it forever, or double-count', async () => {
		let calls = 0;
		const all = await readAll(async () => { calls++; return { data: ids(5), has_more: true }; });
		assert.equal(all.length, 5);
		assert.equal(calls, 2);
	});

	test('an empty list is empty, and a runaway one is cut off', async () => {
		assert.deepEqual(await readAll(async () => ({ data: [], has_more: false })), []);
		let n = 0;
		const endless = await readAll(async () => ({ data: ids(1, n++), has_more: true }), 7);
		assert.equal(endless.length, 7);
	});
});
