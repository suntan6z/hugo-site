import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderWelcome, LANGS } from '../templates/welcome.js';

test('there is a welcome email in each of the site\'s three languages', () => {
  assert.deepEqual(LANGS, ['en', 'fr', 'it']);
});

for (const lang of LANGS) {
  const html = renderWelcome(lang);

  test(`${lang}: nothing is left to fill in, and nothing is fetched from a third party`, () => {
    assert.doesNotMatch(html, /\{\{|\}\}/, 'no template variable that Resend would have to supply');
    assert.doesNotMatch(html, /googleapis|gstatic|@import|<script/i);
    const hosts = new Set([...html.matchAll(/(?:src|href)="(https?:\/\/[^/"]+)/g)].map((m) => m[1]));
    assert.deepEqual([...hosts].sort(), ['https://c.im', 'https://github.com', 'https://lorenzo.loconsole.eu', 'https://www.linkedin.com']);
  });

  test(`${lang}: it says what language it is, and its links go to that language's pages`, () => {
    assert.match(html, new RegExp(`<html lang="${lang}"`));
    assert.match(html, new RegExp(`https://lorenzo\\.loconsole\\.eu/${lang}/blog/`));
    assert.match(html, new RegExp(`https://lorenzo\\.loconsole\\.eu/${lang}/privacy-policy/`));
  });

  test(`${lang}: no unsubscribe link of its own (Resend gives one only to broadcasts), but it says where to find it`, () => {
    assert.doesNotMatch(html, /unsubscribe_url|RESEND_UNSUBSCRIBE_URL/);
  });

  test(`${lang}: each profile button puts its icon and label in one row, and the card is centred`, () => {
    for (const s of ['linkedin', 'mastodon', 'github']) {
      assert.match(html, new RegExp(`<td valign="middle"[^>]*><img src="[^"]*/${s}\\.png"[^>]*></td><td valign="middle"`));
    }
    assert.match(html, /width="600" align="center"[^>]*margin:0 auto/);
  });

  test(`${lang}: the three profile buttons carry their label as text, not only an icon`, () => {
    for (const label of ['LinkedIn', 'Mastodon', 'GitHub']) assert.match(html, new RegExp(`color:#ffffff;text-decoration:none">${label}</span></td>`));
    for (const icon of ['linkedin', 'mastodon', 'github']) assert.match(html, new RegExp(`/img/email/${icon}\\.png`));
    assert.doesNotMatch(html, /Trakt|Apple Music/);
  });

  test(`${lang}: the logo is top left, links home, and its alt text is the name where images are blocked`, () => {
    assert.match(html, new RegExp(`<a href="https://lorenzo\\.loconsole\\.eu/${lang}/"[^>]*><img src="https://lorenzo\\.loconsole\\.eu/img/email/logo\\.png"[^>]*alt="Lorenzo Loconsole"`));
    assert.ok(html.indexOf('/img/email/logo.png') < html.indexOf('<h1'), 'above the title');
  });

  test(`${lang}: the profile links are the site's own`, () => {
    assert.match(html, /https:\/\/www\.linkedin\.com\/in\/lloconsole\//);
    assert.match(html, /https:\/\/c\.im\/@lv/);
    assert.match(html, /https:\/\/github\.com\/suntan6z/);
  });
}

test('the French and Italian ones are really translated, not English with a new lang attribute', () => {
  for (const lang of ['fr', 'it']) {
    const html = renderWelcome(lang);
    assert.doesNotMatch(html, /Thank you for subscribing|What to expect|You're receiving/);
  }
  assert.match(renderWelcome('fr'), /Bienvenue/);
  assert.match(renderWelcome('it'), /Benvenuto/);
});

test('a language the site does not have is refused', () => {
  assert.throws(() => renderWelcome('de'), /no welcome email/);
});

test('it wears the site\'s colours, not the greys and the older red it was first made with', () => {
  for (const lang of LANGS) {
    const html = renderWelcome(lang);
    for (const token of ['#943847', '#f9f7f5', '#21242c', '#676f7e', '#e5e0dc', '#f2e3e6']) assert.ok(html.includes(token), `${lang}: ${token}`);
    for (const stale of ['#9f3747', '#f5f5f5', '#fef3f2', '#1a1a1a', '#444444', '#e5e5e5']) assert.ok(!html.includes(stale), `${lang}: still ${stale}`);
  }
});
