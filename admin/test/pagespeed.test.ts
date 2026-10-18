import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseSpeed, rate, rateScore, ms } from '../src/lib/server/integrations/pagespeed-parse.ts';

// The parts of Google's answer the parser reads, with their real names.
const answer = {
	analysisUTCTimestamp: '2026-10-18T12:00:00.000Z',
	lighthouseResult: {
		finalUrl: 'https://lorenzo.loconsole.eu/en/blog/x/',
		categories: { performance: { score: 0.93 }, accessibility: { score: 1 }, seo: { score: 0.91 }, 'best-practices': { score: 0.96 } },
		audits: {
			'largest-contentful-paint': { numericValue: 1840.6 },
			'cumulative-layout-shift': { numericValue: 0.012 },
			'total-blocking-time': { numericValue: 20 },
			'first-contentful-paint': { numericValue: 1210 }
		}
	},
	loadingExperience: { overall_category: 'FAST' }
};

describe('PageSpeed Insights', () => {
	test('scores are whole percent and figures are as measured', () => {
		const r = parseSpeed(answer)!;
		assert.deepEqual(r.scores, { performance: 93, accessibility: 100, seo: 91, bestPractices: 96 });
		assert.deepEqual(r.lab, { lcpMs: 1840.6, cls: 0.012, tbtMs: 20, fcpMs: 1210 });
		assert.equal(r.field, 'FAST');
		assert.equal(r.finalUrl, 'https://lorenzo.loconsole.eu/en/blog/x/');
		assert.equal(r.at, '2026-10-18T12:00:00.000Z');
	});

	test('a small site has no field data, which is not an error', () => {
		const r = parseSpeed({ ...answer, loadingExperience: { id: 'x', metrics: {} } })!;
		assert.equal(r.field, null);
		assert.equal(parseSpeed({ lighthouseResult: answer.lighthouseResult })!.field, null);
	});

	test('missing pieces are null, never NaN, and no Lighthouse result is no result', () => {
		const r = parseSpeed({ lighthouseResult: { categories: { performance: {} }, audits: {} } })!;
		assert.deepEqual(r.scores, { performance: null, accessibility: null, seo: null, bestPractices: null });
		assert.deepEqual(r.lab, { lcpMs: null, cls: null, tbtMs: null, fcpMs: null });
		for (const body of [null, {}, 'x', { error: { message: 'nope' } }, { lighthouseResult: 5 }]) assert.equal(parseSpeed(body), null);
	});

	test('ratings follow Google’s thresholds, inclusive at the edge', () => {
		assert.equal(rate('lcpMs', 2500), 'good');
		assert.equal(rate('lcpMs', 2501), 'needs');
		assert.equal(rate('lcpMs', 4001), 'poor');
		assert.equal(rate('cls', 0.1), 'good');
		assert.equal(rate('cls', 0.26), 'poor');
		assert.equal(rate('tbtMs', 200), 'good');
		assert.equal(rate('fcpMs', null), 'unknown');
		assert.equal(rateScore(90), 'good');
		assert.equal(rateScore(89), 'needs');
		assert.equal(rateScore(49), 'poor');
		assert.equal(rateScore(null), 'unknown');
	});

	test('times read as seconds or milliseconds', () => {
		assert.equal(ms(1840.6), '1.8 s');
		assert.equal(ms(340.2), '340 ms');
		assert.equal(ms(null), '–');
	});
});
