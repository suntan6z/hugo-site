import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { planSegments, LISTS } from '../scripts/resend-setup.mjs';

const seg = (id: string, name: string) => ({ id, name });

describe('which segment is which language', () => {
	test('a lone existing segment is the English list, and French and Italian are to be made', () => {
		const p = planSegments([seg('old', 'General')], {});
		assert.deepEqual([p.en.id, p.en.create], ['old', false]);
		assert.deepEqual([p.fr.create, p.fr.name], [true, 'Français']);
		assert.deepEqual([p.it.create, p.it.name], [true, 'Italiano']);
	});

	test('segments already named for a language are reused, in any accent or spelling of it', () => {
		const p = planSegments([seg('a', 'General'), seg('b', 'Français'), seg('c', 'Italian')], {});
		assert.deepEqual([p.en.id, p.fr.id, p.it.id], ['a', 'b', 'c']);
		assert.ok(LISTS.every((l: { lang: string }) => !p[l.lang].create));
	});

	test('an id chosen by configuration wins over a name', () => {
		const p = planSegments([seg('x', 'Newsletter FR'), seg('y', 'Misc')], { fr: 'y' });
		assert.equal(p.fr.id, 'y');
	});

	test('with several segments and none for English, English is not guessed', () => {
		const p = planSegments([seg('x', 'Misc'), seg('y', 'Other')], {});
		assert.deepEqual([p.en.id, p.en.create], [null, true]);
	});

	test('running it again changes nothing: what exists is found, not made again', () => {
		const first = planSegments([seg('old', 'General')], {});
		const second = planSegments([seg('old', 'General'), seg('f', first.fr.name), seg('i', first.it.name)], {});
		assert.ok(['en', 'fr', 'it'].every((l) => !second[l].create));
	});
});
