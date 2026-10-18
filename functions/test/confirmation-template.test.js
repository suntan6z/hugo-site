import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderConfirmation, LANGS } from '../templates/confirmation.js';

test('there is a confirmation in each of the site\'s three languages', () => {
  assert.deepEqual(LANGS, ['en', 'fr', 'it']);
});

for (const lang of LANGS) {
  const html = renderConfirmation(lang);

  test(`${lang}: it keeps exactly the variables contact.js sends, in double braces`, () => {
    const vars = new Set([...html.matchAll(/\{\{\{?\s*(\w+)\s*\}?\}\}/g)].map((m) => m[1]));
    assert.deepEqual([...vars].sort(), ['message_preview', 'name', 'subject']);
    assert.doesNotMatch(html, /\{\{\{/, 'double braces: Resend escapes, contact.js sends raw values');
  });

  test(`${lang}: nothing is fetched from a third party, links go to its own language`, () => {
    assert.doesNotMatch(html, /googleapis|gstatic|@import|<script/i);
    const hosts = new Set([...html.matchAll(/(?:src|href)="(https?:\/\/[^/"]+)/g)].map((m) => m[1]));
    assert.deepEqual([...hosts], ['https://lorenzo.loconsole.eu']);
    assert.match(html, new RegExp(`<html lang="${lang}"`));
    assert.match(html, new RegExp(`https://lorenzo\\.loconsole\\.eu/${lang}/blog/`));
    assert.match(html, new RegExp(`https://lorenzo\\.loconsole\\.eu/${lang}/privacy-policy/`));
  });

  test(`${lang}: logo top left above the title, site colours`, () => {
    assert.ok(html.indexOf('/img/email/logo.png') < html.indexOf('<h1'));
    for (const token of ['#943847', '#f9f7f5', '#21242c', '#676f7e', '#e5e0dc', '#f2e3e6']) assert.ok(html.includes(token), token);
  });
}

test('French and Italian are translated, not English with a new lang attribute', () => {
  for (const lang of ['fr', 'it']) assert.doesNotMatch(renderConfirmation(lang), /Thanks for your message|What you sent|You are receiving/);
});

test('a language the site does not have is refused', () => {
  assert.throws(() => renderConfirmation('de'), /no confirmation email/);
});
