/**
 * Types and the pure decision logic for "is what I pushed actually live?".
 *
 * Deliberately free of SvelteKit imports ($env, the store) so the test suite can
 * exercise it directly. buildinfo.ts adds the I/O around this.
 */

export interface BuildInfoPost {
	slug: string;
	title: string;
	date: string;
	category: string;
	/** Languages with a real translation; `untranslated` placeholders excluded. */
	langs: string[];
	featured: boolean;
	images: number;
}

export interface BuildInfo {
	builtAt: string;
	hugo: string;
	posts: BuildInfoPost[];
	gallery: { slug: string; photos: number }[];
}

/** What the portal last pushed, so we can tell whether the build caught up. */
export interface LastPublish {
	sha: string;
	at: string;
	slug: string;
}

export type DeployState = 'live' | 'building' | 'stale' | 'unknown';

export interface DeployStatus {
	state: DeployState;
	builtAt: string | null;
	/** Minutes since the live site was last built. */
	ageMinutes: number | null;
	lastPublish: LastPublish | null;
	hugo: string | null;
	detail: string;
}

/** StaticHost normally finishes in ~1-2 min; past this a build has likely failed. */
const STALE_AFTER_MINUTES = 10;

export function deployStatus(info: BuildInfo | null, last: LastPublish | null): DeployStatus {
	if (!info) {
		return {
			state: 'unknown',
			builtAt: null,
			ageMinutes: null,
			lastPublish: last,
			hugo: null,
			detail: 'Could not read build-info.json from the live site.'
		};
	}

	const builtMs = Date.parse(info.builtAt);
	const ageMinutes = Number.isNaN(builtMs) ? null : Math.floor((Date.now() - builtMs) / 60000);
	const base = { builtAt: info.builtAt, ageMinutes, lastPublish: last, hugo: info.hugo };

	if (!last) {
		return { ...base, state: 'live', detail: 'Nothing published from the portal yet.' };
	}

	const publishedMs = Date.parse(last.at);
	if (Number.isNaN(builtMs) || Number.isNaN(publishedMs)) {
		return { ...base, state: 'unknown', detail: 'Could not compare timestamps.' };
	}

	if (builtMs >= publishedMs) {
		return { ...base, state: 'live', detail: `“${last.slug}” is live.` };
	}

	const waited = Math.floor((Date.now() - publishedMs) / 60000);
	return waited > STALE_AFTER_MINUTES
		? {
				...base,
				state: 'stale',
				detail: `Pushed “${last.slug}” ${waited} min ago but the site hasn't rebuilt — check the StaticHost dashboard.`
			}
		: { ...base, state: 'building', detail: `Publishing “${last.slug}”…` };
}
