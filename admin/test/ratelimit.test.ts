import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
	rateLimited, retryAfter, resetRateLimits, isRateLimitedPath, MAX_PER_WINDOW, WINDOW_MS
} from '../src/lib/server/auth/ratelimit.ts';

describe('sign-in rate limit', () => {
	beforeEach(() => resetRateLimits());

	test('allows up to the limit, then refuses', () => {
		const t = 1_000_000;
		for (let i = 0; i < MAX_PER_WINDOW; i++) assert.equal(rateLimited('1.2.3.4', t + i), false);
		assert.equal(rateLimited('1.2.3.4', t + MAX_PER_WINDOW), true);
	});

	test('limits are per address', () => {
		const t = 2_000_000;
		for (let i = 0; i <= MAX_PER_WINDOW; i++) rateLimited('9.9.9.9', t);
		assert.equal(rateLimited('8.8.8.8', t), false);
	});

	test('the window slides: old hits expire', () => {
		const t = 3_000_000;
		for (let i = 0; i <= MAX_PER_WINDOW; i++) rateLimited('5.5.5.5', t);
		assert.equal(rateLimited('5.5.5.5', t + 1), true);
		assert.equal(rateLimited('5.5.5.5', t + WINDOW_MS + 1), false);
	});

	test('Retry-After counts down to the oldest hit expiring', () => {
		const t = 4_000_000;
		rateLimited('7.7.7.7', t);
		assert.equal(retryAfter('7.7.7.7', t + 10_000), 50);
		assert.equal(retryAfter('unknown', t), 0);
	});

	test('memory stays bounded under a spray of distinct addresses', () => {
		for (let i = 0; i < 12_000; i++) rateLimited(`10.0.${i >> 8}.${i & 255}`, 5_000_000);
		// Did not throw, and a fresh address is still evaluated normally.
		assert.equal(rateLimited('fresh', 5_000_000), false);
	});

	test('only the sign-in surface is throttled', () => {
		for (const p of ['/api/auth/options', '/api/auth/verify', '/api/auth/enroll-options', '/api/auth/enroll-verify', '/enroll']) {
			assert.equal(isRateLimitedPath(p), true, p);
		}
		for (const p of ['/', '/posts', '/login', '/api/auth/logout', '/brand/logo.svg']) {
			assert.equal(isRateLimitedPath(p), false, p);
		}
	});
});
