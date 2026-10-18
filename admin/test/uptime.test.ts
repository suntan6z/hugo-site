import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
	parseCertDate, daysUntil, certCheck, pageCheck, problemsOf, shouldAlert, isDue, alertMessage, addHistory, certNotices,
	type HealthReport, type Check
} from '../src/lib/server/integrations/uptime-parse.ts';

const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 18, 9, 0);
const ok = (name: string): Check => ({ name, kind: 'page', ok: true, ms: 100, detail: 'HTTP 200 in 100 ms' });
const bad = (name: string): Check => ({ name, kind: 'page', ok: false, ms: null, detail: 'no answer' });
const report = (checks: Check[], at = '2026-10-18T09:00:00.000Z'): HealthReport => ({ at, checks });

describe('certificates', () => {
	test('Node’s date format is read, and nonsense is not', () => {
		assert.equal(parseCertDate('Dec 31 23:59:59 2026 GMT'), Date.UTC(2026, 11, 31, 23, 59, 59));
		assert.equal(parseCertDate('not a date'), null);
		assert.equal(parseCertDate(undefined), null);
	});

	test('days left are whole days, rounded down', () => {
		assert.equal(daysUntil(now + 3 * DAY + 5000, now), 3);
		assert.equal(daysUntil(now - 1000, now), -1);
	});

	test('a certificate is a problem two weeks out, not before', () => {
		assert.equal(certCheck('a.example', now + 40 * DAY, now).ok, true);
		assert.equal(certCheck('a.example', now + 15 * DAY, now).ok, true);
		assert.equal(certCheck('a.example', now + 14 * DAY, now).ok, false);
		assert.equal(certCheck('a.example', now + 1 * DAY, now).ok, false);
	});

	test('it says how long is left, or that it has run out', () => {
		assert.match(certCheck('a.example', now + 40 * DAY, now).detail, /valid for 40 more days, until 2026-11-27/);
		assert.match(certCheck('a.example', now + 1.5 * DAY, now).detail, /1 more day,/);
		assert.match(certCheck('a.example', now - 2 * DAY, now).detail, /expired on 2026-10-16/);
		assert.match(certCheck('a.example', now + 100, now).detail, /expires today/);
	});

	test('one that cannot be read is a problem, with the reason', () => {
		const c = certCheck('a.example', null, now, 'connect ECONNREFUSED');
		assert.equal(c.ok, false);
		assert.equal(c.daysLeft, null);
		assert.match(c.detail, /could not be read: connect ECONNREFUSED/);
		assert.equal(c.name, 'Certificate for a.example');
	});

	test('ones nearing the end are mentioned before they are a fault', () => {
		const r = report([certCheck('a.example', now + 25 * DAY, now), certCheck('b.example', now + 80 * DAY, now), certCheck('c.example', now + 5 * DAY, now)]);
		assert.deepEqual(certNotices(r).map((c) => c.name), ['Certificate for a.example']);
	});
});

describe('pages', () => {
	test('only a 2xx answer is healthy', () => {
		assert.equal(pageCheck('Home', 200, 300).ok, true);
		assert.equal(pageCheck('Home', 204, 300).ok, true);
		assert.equal(pageCheck('Home', 301, 300).ok, false);
		assert.equal(pageCheck('Home', 404, 300).ok, false);
		assert.equal(pageCheck('Home', 500, 300).ok, false);
	});

	test('no answer is a problem and says why', () => {
		const c = pageCheck('Home', null, 15000, 'no answer in 15s');
		assert.equal(c.ok, false);
		assert.match(c.detail, /no answer: no answer in 15s/);
	});

	test('time is written as read', () => {
		assert.match(pageCheck('Home', 200, 340).detail, /340 ms/);
		assert.match(pageCheck('Home', 200, 2400).detail, /2\.4 s/);
	});
});

describe('when to say something', () => {
	test('nothing wrong, nothing to say', () => {
		assert.equal(shouldAlert(null, report([ok('a'), ok('b')])), false);
	});

	test('a first problem is worth an email; the same problem the next morning is not', () => {
		const first = report([ok('a'), bad('b')]);
		assert.equal(shouldAlert(null, first), true);
		assert.equal(shouldAlert(report([ok('a'), ok('b')]), first), true);
		assert.equal(shouldAlert(first, report([ok('a'), bad('b')], '2026-10-19T09:00:00.000Z')), false);
	});

	test('a second, different problem is worth another', () => {
		assert.equal(shouldAlert(report([bad('b'), ok('c')]), report([bad('b'), bad('c')])), true);
	});

	test('getting better is not an alarm', () => {
		assert.equal(shouldAlert(report([bad('a'), bad('b')]), report([bad('a'), ok('b')])), false);
	});

	test('the email lists what failed and is honest about what the check is', () => {
		const m = alertMessage(report([ok('a'), bad('Home page'), { ...bad('Certificate for x'), detail: 'expired on 2026-10-01' }]));
		assert.equal(m.subject, 'Site health: 2 things to look at');
		assert.match(m.text, /- Home page: no answer/);
		assert.match(m.text, /- Certificate for x: expired on 2026-10-01/);
		assert.match(m.text, /not live monitoring/);
		assert.equal(alertMessage(report([bad('only')])).subject, 'Site health: 1 thing to look at');
	});

	test('a look is due about once a day', () => {
		assert.equal(isDue(null, new Date(now)), true);
		assert.equal(isDue('garbage', new Date(now)), true);
		assert.equal(isDue(new Date(now - 19 * 3_600_000).toISOString(), new Date(now)), false);
		assert.equal(isDue(new Date(now - 21 * 3_600_000).toISOString(), new Date(now)), true);
	});
});

describe('the record', () => {
	test('each run is a line, the newest sixty are kept', () => {
		let h = addHistory([], report([ok('a'), bad('b')]));
		assert.deepEqual(h, [{ at: '2026-10-18T09:00:00.000Z', ok: false, problems: ['b'] }]);
		for (let i = 0; i < 70; i++) h = addHistory(h, report([ok('a')], `2026-12-${String((i % 28) + 1).padStart(2, '0')}T09:00:00.000Z`));
		assert.equal(h.length, 60);
		assert.equal(h.at(-1)!.ok, true);
		assert.deepEqual(problemsOf(report([bad('x'), ok('y')])), ['x']);
	});
});
