import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { deployStatus, type BuildInfo, type LastPublish } from '../src/lib/server/integrations/deploy-state.ts';

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

const info = (builtAt: string): BuildInfo => ({
	builtAt,
	hugo: '0.163.3',
	posts: [],
	gallery: []
});
const pub = (at: string): LastPublish => ({ sha: 'abc123', at, slug: 'my-post' });

describe('deployStatus', () => {
	test('unreachable site is unknown, not a false "live"', () => {
		const s = deployStatus(null, pub(minutesAgo(1)));
		assert.equal(s.state, 'unknown');
		assert.equal(s.builtAt, null);
	});

	test('build newer than the push means live', () => {
		const s = deployStatus(info(minutesAgo(1)), pub(minutesAgo(5)));
		assert.equal(s.state, 'live');
		assert.match(s.detail, /my-post/);
	});

	test('build older than a recent push means still building', () => {
		const s = deployStatus(info(minutesAgo(10)), pub(minutesAgo(2)));
		assert.equal(s.state, 'building');
	});

	test('build still behind after 10 minutes means the build failed', () => {
		const s = deployStatus(info(minutesAgo(30)), pub(minutesAgo(20)));
		assert.equal(s.state, 'stale');
		assert.match(s.detail, /StaticHost/);
	});

	test('exactly equal timestamps count as live, not building', () => {
		const t = minutesAgo(3);
		assert.equal(deployStatus(info(t), pub(t)).state, 'live');
	});

	test('nothing published yet is live, not unknown', () => {
		const s = deployStatus(info(minutesAgo(60)), null);
		assert.equal(s.state, 'live');
		assert.match(s.detail, /Nothing published/);
	});

	test('unparseable timestamps degrade to unknown rather than lying', () => {
		assert.equal(deployStatus(info('not-a-date'), pub(minutesAgo(1))).state, 'unknown');
	});

	test('age is reported in whole minutes', () => {
		const s = deployStatus(info(minutesAgo(90)), null);
		assert.equal(s.ageMinutes, 90);
	});
});

describe('the manifest the site actually generates', () => {
	// Produced by `hugo` into the scratch build during development. Skipped when
	// absent so the suite stays runnable anywhere.
	const fixture = path.resolve(import.meta.dirname, 'fixtures', 'build-info.json');
	const present = fs.existsSync(fixture);

	test('parses and has the shape deployStatus expects', { skip: !present && 'no fixture' }, () => {
		const d = JSON.parse(fs.readFileSync(fixture, 'utf8')) as BuildInfo;
		assert.ok(Array.isArray(d.posts) && d.posts.length > 0);
		assert.ok(Array.isArray(d.gallery) && d.gallery.length > 0);
		assert.match(d.builtAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
		for (const p of d.posts) {
			assert.equal(typeof p.slug, 'string');
			assert.ok(Array.isArray(p.langs));
			assert.equal(typeof p.featured, 'boolean');
			assert.match(p.date, /^\d{4}-\d{2}-\d{2}$/);
		}
	});

	test('placeholder translations never count as a translation', { skip: !present && 'no fixture' }, () => {
		const d = JSON.parse(fs.readFileSync(fixture, 'utf8')) as BuildInfo;
		const blog = path.resolve(import.meta.dirname, '..', '..', 'content', 'blog');

		// Derived from the repo rather than hardcoded, so translating a post later
		// retires the assertion instead of failing it.
		let checked = 0;
		for (const slug of fs.readdirSync(blog)) {
			const post = d.posts.find((p) => p.slug === slug);
			if (!post) continue; // draft, or added since the fixture was generated
			for (const lang of ['fr', 'it'] as const) {
				const file = path.join(blog, slug, `index.${lang}.md`);
				if (!fs.existsSync(file)) continue;
				if (!/^untranslated:\s*true\s*$/m.test(fs.readFileSync(file, 'utf8'))) continue;
				checked++;
				assert.ok(
					!post.langs.includes(lang),
					`${slug}/index.${lang}.md is an untranslated placeholder but the manifest counts ${lang} as a translation`
				);
			}
		}
		assert.ok(checked > 0, 'expected at least one untranslated placeholder in the corpus to verify against');
	});
});
