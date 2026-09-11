import { integrations } from '../env.ts';
import { prepareMarkdown } from '../translate/markdown-xml.ts';

/**
 * DeepL, for a first draft of the French and Italian versions.
 *
 * Chosen over the alternatives for the same reason the rest of the stack is
 * EU-hosted (DeepL SE is in Cologne), and because its XML tag handling is
 * what lets markdown-xml.ts keep links, images and code out of reach.
 *
 * Only ever a draft: the result fills the editor and nothing is saved until
 * the author reviews it and presses Save.
 */

export type Target = 'fr' | 'it';

// Matches how the articles already address readers: the French versions use
// "vous" ("vous savez peut-être", "croyez-moi"), the Italian ones "tu"
// ("capisci?", "lascia che te lo dica"). "prefer_" falls back silently where a
// language has no formality setting.
const FORMALITY: Record<Target, 'prefer_more' | 'prefer_less'> = { fr: 'prefer_more', it: 'prefer_less' };

// API limits: 50 texts and 128 KiB per request.
const MAX_TEXTS = 50;
const MAX_BYTES = 100_000;

export const isConfigured = () => !!integrations.deeplApiKey;

/** Free-plan keys end in ":fx" and live on a different host. */
const host = (key: string) =>
	integrations.deeplApiUrl || (key.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com');

export class DeepLError extends Error {
	status: number;
	constructor(message: string, status: number) {
		super(message);
		this.status = status;
	}
}

async function call<T>(path: string, body?: unknown): Promise<T> {
	const key = integrations.deeplApiKey;
	if (!key) throw new DeepLError('DEEPL_API_KEY is not configured.', 503);
	const r = await fetch(`${host(key)}${path}`, {
		method: body ? 'POST' : 'GET',
		headers: {
			Authorization: `DeepL-Auth-Key ${key}`,
			...(body ? { 'Content-Type': 'application/json' } : {})
		},
		body: body ? JSON.stringify(body) : undefined,
		signal: AbortSignal.timeout(60_000)
	});
	if (!r.ok) {
		// Never echo the response body wholesale: it is shown in the UI.
		const reason =
			r.status === 403 ? 'the API key was refused' :
			r.status === 456 ? 'this month’s character allowance is used up' :
			r.status === 429 ? 'too many requests — try again in a moment' :
			r.status === 413 ? 'the text is too long for one request' :
			`HTTP ${r.status}`;
		throw new DeepLError(`DeepL: ${reason}.`, r.status);
	}
	return r.json() as Promise<T>;
}

/** Splits texts into requests that respect DeepL's limits, keeping order. */
export function batches(texts: string[]): string[][] {
	const out: string[][] = [];
	let cur: string[] = [];
	let bytes = 0;
	for (const t of texts) {
		const b = Buffer.byteLength(t) + 16;
		if (cur.length && (cur.length >= MAX_TEXTS || bytes + b > MAX_BYTES)) {
			out.push(cur);
			cur = [];
			bytes = 0;
		}
		cur.push(t);
		bytes += b;
	}
	if (cur.length) out.push(cur);
	return out;
}

async function translateXml(texts: string[], target: Target): Promise<string[]> {
	const out: string[] = [];
	for (const batch of batches(texts)) {
		const r = await call<{ translations: { text: string }[] }>('/v2/translate', {
			text: batch,
			source_lang: 'EN',
			target_lang: target.toUpperCase(),
			formality: FORMALITY[target],
			tag_handling: 'xml',
			ignore_tags: ['k'],
			preserve_formatting: true
		});
		if (r.translations?.length !== batch.length) {
			throw new DeepLError('DeepL returned a different number of lines than it was sent.', 502);
		}
		out.push(...r.translations.map((t) => t.text));
	}
	return out;
}

export interface Fields {
	title: string;
	description: string;
	body: string;
	eu_funding_text?: string;
}

/**
 * Translates an article's fields in one pass: every field's lines go into the
 * same request(s), so a short article costs one round trip.
 */
export async function translateFields(
	fields: Fields,
	target: Target
): Promise<{ fields: Fields; characters: number; warnings: string[] }> {
	const names = (Object.keys(fields) as (keyof Fields)[]).filter((k) => typeof fields[k] === 'string');
	const prepared = names.map((n) => prepareMarkdown(fields[n] as string));
	const all = prepared.flatMap((p) => p.texts);
	const translated = all.length ? await translateXml(all, target) : [];

	const result = {} as Fields;
	const warnings: string[] = [];
	let at = 0;
	names.forEach((n, i) => {
		const p = prepared[i];
		const slice = translated.slice(at, at + p.texts.length);
		at += p.texts.length;
		const r = p.rebuild(slice);
		(result as unknown as Record<string, string>)[n] = r.markdown;
		warnings.push(...r.warnings);
	});
	return { fields: result, characters: all.reduce((n, t) => n + t.length, 0), warnings };
}

export async function usage(): Promise<{ used: number; limit: number } | null> {
	if (!isConfigured()) return null;
	const r = await call<{ character_count: number; character_limit: number }>('/v2/usage');
	return { used: r.character_count, limit: r.character_limit };
}
