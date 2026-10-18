#!/usr/bin/env node
/**
 * Sets up (and checks) the newsletter's mailing lists at Resend: one segment per
 * language.
 *
 *   node scripts/resend-setup.mjs --check     read-only: what exists, who is on it, what the portal would use
 *   node scripts/resend-setup.mjs             create the French and Italian segments if they are missing
 *
 * Needs RESEND_API_KEY (the environment, or admin/.env). English is the list that
 * existed before there were languages ("General", once an audience); it is found by
 * RESEND_SEGMENT_EN / RESEND_AUDIENCE_ID, or by being the only segment there is.
 * Creating is idempotent: a language whose segment is already there is reused.
 * Nothing is ever deleted or changed, and no contact is touched.
 */
// @ts-nocheck: a stand-alone script; its one pure function is typed by its JSDoc and tested.
import fs from 'node:fs';
import path from 'node:path';

export const LISTS = [
	{ lang: 'en', name: 'English' },
	{ lang: 'fr', name: 'Français' },
	{ lang: 'it', name: 'Italiano' }
];

const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Which segment is which language, and what is missing. `existing` is Resend's list of
 * segments, `known` the ids already chosen by environment variable. A segment is a
 * language's if its id is configured for it, or its name is the language's own
 * ("Français", "French", "Newsletter FR"...). English falls back to the only segment.
 *
 * @param {{ id: string, name: string }[]} existing
 * @param {Record<string, string | undefined>} [known]
 * @returns {Record<string, { lang: string, id: string | null, name: string, create: boolean }>}
 */
export function planSegments(existing, known = {}) {
	/** @type {Record<string, { lang: string, id: string | null, name: string, create: boolean }>} */
	const out = {};
	for (const { lang, name } of LISTS) {
		const aliases = { en: ['english', 'anglais', 'inglese', 'en', 'general'], fr: ['francais', 'french', 'francese', 'fr'], it: ['italiano', 'italian', 'italien', 'it'] }[lang];
		const byId = known[lang] ? existing.find((s) => s.id === known[lang]) : undefined;
		const byName = existing.find((s) => fold(s.name).split(/[^a-z]+/).some((w) => aliases.includes(w)));
		const only = lang === 'en' && existing.length === 1 ? existing[0] : undefined;
		const found = byId ?? byName ?? only;
		out[lang] = found ? { lang, id: found.id, name: found.name, create: false } : { lang, id: null, name, create: true };
	}
	return out;
}

async function main() {
	const argv = process.argv.slice(2);
	const check = argv.includes('--check');
	const key = process.env.RESEND_API_KEY || readEnvFile('RESEND_API_KEY');
	if (!key) {
		console.error('Set RESEND_API_KEY (in the environment or admin/.env).');
		process.exit(1);
	}
	const api = async (method, p, body) => {
		const r = await fetch(`https://api.resend.com${p}`, {
			method,
			headers: { Authorization: `Bearer ${key}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
			body: body ? JSON.stringify(body) : undefined
		});
		const text = await r.text();
		if (!r.ok) throw new Error(`${method} ${p}: ${r.status} ${text.slice(0, 200)}`);
		return text ? JSON.parse(text) : {};
	};

	const existing = (await api('GET', '/segments')).data ?? [];
	console.log(`Resend has ${existing.length} segment${existing.length === 1 ? '' : 's'}:`);
	for (const s of existing) console.log(`  ${s.id}  ${s.name}`);

	const known = {
		en: process.env.RESEND_SEGMENT_EN || process.env.RESEND_AUDIENCE_ID || readEnvFile('RESEND_SEGMENT_EN') || readEnvFile('RESEND_AUDIENCE_ID') || '276f21cc-de35-468d-8b30-06fc08ad1016',
		fr: process.env.RESEND_SEGMENT_FR || readEnvFile('RESEND_SEGMENT_FR'),
		it: process.env.RESEND_SEGMENT_IT || readEnvFile('RESEND_SEGMENT_IT')
	};
	const plan = planSegments(existing, known);

	for (const { lang } of LISTS) {
		const p = plan[lang];
		if (p.create && !check) {
			const made = await api('POST', '/segments', { name: p.name });
			p.id = made.id;
			p.create = false;
			console.log(`Created "${p.name}" (${p.id}).`);
		}
	}

	console.log('\nWho is on each list:');
	for (const { lang } of LISTS) {
		const p = plan[lang];
		if (!p.id) {
			console.log(`  ${lang.toUpperCase()}  (not created yet: run without --check)`);
			continue;
		}
		const page = await api('GET', `/segments/${p.id}/contacts?limit=100`);
		const rows = page.data ?? [];
		const live = rows.filter((c) => !c.unsubscribed).length;
		console.log(`  ${lang.toUpperCase()}  ${p.name}: ${live} subscribed, ${rows.length - live} unsubscribed${page.has_more ? ' (first 100 shown)' : ''}`);
	}

	console.log('\nPut these in admin/.env and the portal container (create-container.sh), and in functions/.env;');
	console.log('for CI, set them as repository variables:\n');
	for (const { lang } of LISTS) if (plan[lang].id) console.log(`  RESEND_SEGMENT_${lang.toUpperCase()}=${plan[lang].id}`);
	console.log('');
	for (const { lang } of LISTS) if (plan[lang].id) console.log(`  gh variable set RESEND_SEGMENT_${lang.toUpperCase()} --body ${plan[lang].id}`);
	console.log('\nThen create the welcome email templates in Resend: newsletter-welcome-fr and newsletter-welcome-it.');
}

function readEnvFile(name) {
	try {
		const text = fs.readFileSync(path.join(import.meta.dirname, '..', '.env'), 'utf8');
		const m = new RegExp(`^${name}=(.*)$`, 'm').exec(text);
		return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
	} catch {
		return '';
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((e) => {
		console.error(e.message);
		process.exit(1);
	});
}
