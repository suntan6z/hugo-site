import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
	SOCIALS, SiteParamsError, readSocials, writeSocials, whyNotUrl,
	readSiteText, writeSiteText, whyNotSiteText, writeStrings, oneLine,
	readTitle, writeTitle, whyNotTitle, readMenu, writeMenu, whyNotMenu, type Menu
} from '../src/lib/server/content/site-params.ts';

const REPO = path.resolve(import.meta.dirname, '..', '..');
const real = () => fs.readFileSync(path.join(REPO, 'hugo.toml'), 'utf8');

describe('against the real hugo.toml', () => {
	test('every footer link is there to edit', () => {
		const s = readSocials(real());
		for (const { key } of SOCIALS) assert.equal(typeof s[key], 'string', key);
		assert.match(s.mastodon, /^https:\/\//);
	});

	test('saving what is already there changes nothing, byte for byte', () => {
		const raw = real();
		const r = writeSocials(raw, readSocials(raw));
		assert.deepEqual(r.changed, []);
		assert.equal(r.raw, raw);
	});

	test('changing one link rewrites exactly that line', () => {
		const raw = real();
		const r = writeSocials(raw, { mastodon: 'https://mastodon.social/@someone' });
		assert.deepEqual(r.changed, ['mastodon']);
		const a = raw.split('\n');
		const b = r.raw.split('\n');
		assert.equal(b.length, a.length);
		assert.deepEqual(b.filter((l, i) => l !== a[i]), ['  mastodon = "https://mastodon.social/@someone"']);
		assert.equal(readSocials(r.raw).mastodon, 'https://mastodon.social/@someone');
	});

	test('an empty link is written as empty, which hides the icon', () => {
		const r = writeSocials(real(), { trakt: '' });
		assert.equal(readSocials(r.raw).trakt, '');
	});
});

describe('only the top-level [params] table', () => {
	const toml = [
		'[languages.en.params]',
		'  mastodon = "https://elsewhere.example/@lang"',
		'',
		'[params]',
		'  linkedin = "https://www.linkedin.com/in/x/"',
		'  mastodon = "https://c.im/@lv"  # verified with rel=me',
		'  github = ""',
		'  trakt = "https://trakt.tv/users/x"',
		'  appleMusic = "https://music.apple.com/profile/x"',
		'',
		'[markup]',
		'  mastodon = "https://not.params.example"',
		''
	].join('\n');

	test('reads the [params] value, not a same-named key in another table', () => {
		assert.equal(readSocials(toml).mastodon, 'https://c.im/@lv');
	});

	test('keeps a trailing comment and leaves other tables alone', () => {
		const r = writeSocials(toml, { mastodon: 'https://c.im/@new' });
		assert.match(r.raw, /\n {2}mastodon = "https:\/\/c\.im\/@new" {2}# verified with rel=me\n/);
		assert.match(r.raw, /elsewhere\.example\/@lang/);
		assert.match(r.raw, /not\.params\.example/);
	});

	test('refuses a file missing a key rather than inventing a place for it', () => {
		assert.throws(() => readSocials(toml.replace(/ {2}trakt = .*\n/, '')), SiteParamsError);
	});
});

describe('what counts as a link', () => {
	test('accepts web addresses and empty', () => {
		assert.equal(whyNotUrl('https://c.im/@lv'), null);
		assert.equal(whyNotUrl('http://example.com'), null);
		assert.equal(whyNotUrl(''), null);
	});

	test('refuses anything else', () => {
		assert.match(whyNotUrl('c.im/@lv')!, /https:\/\//);
		assert.match(whyNotUrl('javascript:alert(1)')!, /https:\/\//);
		assert.match(whyNotUrl('https://x.example/a b')!, /spaces/);
		assert.match(whyNotUrl('https://x.example/"')!, /quotes/);
	});

	test('the writer enforces it too', () => {
		assert.throws(() => writeSocials(real(), { linkedin: 'https://x.example/"\nevil = "1' }), SiteParamsError);
	});
});

describe('homepage quote and site descriptions', () => {
	test('all of it reads from the real hugo.toml, each description from its own language', () => {
		const t = readSiteText(real());
		assert.match(t.quote, /nothing to hide/);
		assert.equal(t.quoteAuthor, 'Edward Snowden');
		assert.match(t.description.fr, /Passionné/);
		assert.match(t.description.it, /Appassionato/);
		assert.notEqual(t.description.en, t.description.fr);
	});

	test('saving it unchanged is byte-identical', () => {
		const raw = real();
		const r = writeSiteText(raw, readSiteText(raw));
		assert.deepEqual(r.changed, []);
		assert.equal(r.raw, raw);
	});

	test('one language’s description changes one line, under that language', () => {
		const raw = real();
		const t = readSiteText(raw);
		const r = writeSiteText(raw, { ...t, description: { ...t.description, it: 'Nuova descrizione.' } });
		assert.deepEqual(r.changed, ['description (it)']);
		const a = raw.split('\n');
		const b = r.raw.split('\n');
		const changedAt = b.findIndex((l, i) => l !== a[i]);
		assert.deepEqual(b.filter((l, i) => l !== a[i]), ['      description = "Nuova descrizione."']);
		assert.ok(a.slice(0, changedAt).some((l) => l.trim() === '[languages.it.params]'));
		assert.equal(readSiteText(r.raw).description.en, t.description.en);
	});

	test('quotes and backslashes in a quote survive the round trip', () => {
		const raw = real();
		const quote = 'He said "no" \\ then left.';
		const r = writeSiteText(raw, { ...readSiteText(raw), quote });
		assert.equal(readSiteText(r.raw).quote, quote);
		assert.match(r.raw, /quote = "He said \\"no\\" \\\\ then left\."/);
	});

	test('a line break is refused rather than written into TOML', () => {
		assert.throws(() => writeStrings(real(), 'params', { quote: 'two\nlines' }), SiteParamsError);
		assert.equal(oneLine('two\n  lines\t'), 'two lines');
	});

	test('the checks: nothing empty, and the quote must link to an article that exists', () => {
		const t = readSiteText(real());
		assert.equal(whyNotSiteText(t, [t.quoteArticle]), null);
		assert.match(whyNotSiteText({ ...t, quote: '' }, [t.quoteArticle])!, /quote/);
		assert.match(whyNotSiteText(t, ['something-else'])!, /article/);
		assert.match(whyNotSiteText({ ...t, description: { ...t.description, fr: '' } }, [t.quoteArticle])!, /FR/);
	});
});

describe('the site title', () => {
	test('it is read from above the first table, not from a look-alike inside one', () => {
		assert.equal(readTitle(real()), 'Lorenzo Loconsole');
		const raw = 'title = "Top"\n[params]\n  title = "Inner"\n';
		assert.equal(readTitle(raw), 'Top');
	});

	test('changing it rewrites that line only, and the same name changes nothing', () => {
		const raw = real();
		const same = writeTitle(raw, readTitle(raw));
		assert.equal(same.changed, false);
		assert.equal(same.raw, raw);
		const r = writeTitle(raw, 'Lorenzo L. "Loconsole"');
		assert.equal(r.changed, true);
		assert.equal(r.raw.split('\n').filter((l, i) => l !== raw.split('\n')[i]).length, 1);
		assert.equal(readTitle(r.raw), 'Lorenzo L. "Loconsole"');
	});

	test('what it must be', () => {
		assert.equal(whyNotTitle('A site'), null);
		assert.match(whyNotTitle('')!, /needs a name/);
		assert.match(whyNotTitle('x'.repeat(61))!, /60/);
	});
});

describe('the navigation menu', () => {
	const menu = (): Menu => readMenu(real());

	test('the real menu reads: four pages in order, named in three languages', () => {
		const m = menu();
		assert.deepEqual(m.order, ['/about', '/now', '/blog', '/contact']);
		assert.equal(m.names.en['/about'], 'About');
		assert.equal(m.names.fr['/about'], 'À propos');
		assert.equal(m.names.it['/contact'], 'Contatti');
	});

	test('saving what is there changes nothing, byte for byte', () => {
		const raw = real();
		const r = writeMenu(raw, readMenu(raw));
		assert.deepEqual(r.changed, []);
		assert.equal(r.raw, raw);
	});

	test('renaming one entry in one language rewrites exactly one line', () => {
		const raw = real();
		const m = menu();
		m.names.fr['/now'] = 'En ce moment';
		const r = writeMenu(raw, m);
		assert.deepEqual(r.changed, ['menu names (fr)']);
		const diff = r.raw.split('\n').flatMap((l, i) => (l !== raw.split('\n')[i] ? [l.trim()] : []));
		assert.deepEqual(diff, ['name = "En ce moment"']);
		assert.equal(readMenu(r.raw).names.fr['/now'], 'En ce moment');
	});

	test('a name with a quote or backslash is escaped, and survives the trip', () => {
		const m = menu();
		m.names.en['/blog'] = 'The "Blog" \\ more';
		assert.equal(readMenu(writeMenu(real(), m).raw).names.en['/blog'], 'The "Blog" \\ more');
	});

	test('reordering moves the same entries in all three languages together', () => {
		const m = menu();
		m.order = ['/blog', '/about', '/now', '/contact'];
		const r = writeMenu(real(), m);
		assert.deepEqual(r.changed, ['menu order']);
		const back = readMenu(r.raw);
		assert.deepEqual(back.order, m.order);
		// Every language agrees: the same weights, so the menus never differ in shape.
		const weights = [...r.raw.matchAll(/pageRef = "(\/[a-z]+)"\n\s+weight = (\d)/g)].map((x) => `${x[1]}:${x[2]}`);
		assert.equal(new Set(weights).size, 4);
		assert.deepEqual([...new Set(weights)].sort(), ['/about:2', '/blog:1', '/contact:4', '/now:3']);
	});

	test('the pages are fixed: a menu cannot gain or lose one here', () => {
		const m = menu();
		assert.equal(whyNotMenu(m, m), null);
		assert.match(whyNotMenu({ ...m, order: m.order.slice(1) }, m)!, /same pages/);
		assert.match(whyNotMenu({ ...m, order: [...m.order, '/secret'] }, m)!, /same pages/);
	});

	test('names must be there, one line, and short enough for a menu', () => {
		const m = menu();
		const named = (name: string): Menu => ({ ...m, names: { ...m.names, it: { ...m.names.it, '/now': name } } });
		assert.match(whyNotMenu(named(''), m)!, /every entry needs a name in IT/i);
		assert.match(whyNotMenu(named('two\nlines'), m)!, /line breaks/);
		assert.match(whyNotMenu(named('x'.repeat(25)), m)!, /too long/);
		assert.equal(whyNotMenu(named('Ora'), m), null);
	});

	test('a language whose menu lists other pages is an error, not a guess', () => {
		const raw = real().replace('[[languages.it.menus.main]]\n        name = "Chi sono"\n        pageRef = "/about"', '[[languages.it.menus.main]]\n        name = "Chi sono"\n        pageRef = "/chi"');
		assert.throws(() => readMenu(raw), /different pages/);
	});
});
