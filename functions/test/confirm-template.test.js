import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderConfirm, LANGS } from '../templates/confirm.js';

test('there is a confirm email in each of the site\'s three languages', () => {
  assert.deepEqual(LANGS, ['en', 'fr', 'it']);
});

for (const lang of LANGS) {
  const html = renderConfirm(lang);

  test(`${lang}: its one variable is the link, raw, and nothing else is left to fill in`, () => {
    assert.deepEqual([...new Set([...html.matchAll(/\{\{\{?\s*(\w+)\s*\}?\}\}/g)].map((m) => m[1]))], ['confirm_url']);
    assert.match(html, /<a href="\{\{\{confirm_url\}\}\}"[^>]*>[^<]+<\/a>/, 'the button');
    assert.doesNotMatch(html, /[^{]\{\{confirm_url\}\}[^}]/, 'triple braces, so the link is never escaped');
  });

  test(`${lang}: nothing from a third party, links to its own language, centred, logo on top`, () => {
    assert.doesNotMatch(html, /googleapis|gstatic|@import|<script/i);
    const hosts = new Set([...html.matchAll(/(?:src|href)="(https?:\/\/[^/"]+)/g)].map((m) => m[1]));
    assert.deepEqual([...hosts], ['https://lorenzo.loconsole.eu']);
    assert.match(html, new RegExp(`<html lang="${lang}"`));
    assert.match(html, /width="600" align="center"[^>]*margin:0 auto/);
    assert.ok(html.indexOf('/img/email/logo.png') < html.indexOf('<h1'));
  });
}

test('French and Italian are translated', () => {
  for (const lang of ['fr', 'it']) assert.doesNotMatch(renderConfirm(lang), /confirm your subscription|If the button does not work/);
});
