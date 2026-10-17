/**
 * Where a person gets everything the site is made of, and how big it is.
 *
 * The repository is the site and its backup in one: articles, pictures, pages,
 * the settings in hugo.toml, every version of each. GitHub already serves it as
 * a zip, for a public repository to anyone and for a private one to whoever may
 * read it, so the portal links to that rather than building its own archive
 * (which at a few hundred megabytes would not fit the container's memory, and
 * would only repeat what GitHub does).
 *
 * Pure; the Settings page supplies the repository and, when deployed, GitHub's
 * own figures. Free of SvelteKit imports so the suite can drive it directly.
 */
export interface BackupLinks {
	/** The whole repository at its latest state, as a zip. */
	zip: string;
	repo: string;
	clone: string;
}

export function backupLinks(owner: string, repo: string, branch = 'main'): BackupLinks {
	const slug = `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
	return {
		zip: `https://github.com/${slug}/archive/refs/heads/${encodeURIComponent(branch)}.zip`,
		repo: `https://github.com/${slug}`,
		clone: `git clone https://github.com/${slug}.git`
	};
}

/** "about 259 MB" from GitHub's size in kilobytes. */
export function aboutSize(kb: number): string {
	if (!Number.isFinite(kb) || kb <= 0) return '';
	return kb < 1024 ? `about ${Math.round(kb)} KB` : kb < 1024 * 1024 ? `about ${Math.round(kb / 1024)} MB` : `about ${(kb / 1048576).toFixed(1)} GB`;
}

/** What GitHub says about the repository, trimmed to what the page shows; null if it said something else. */
export function readRepoFacts(body: unknown): { sizeLabel: string; pushedAt: string | null; isPrivate: boolean } | null {
	if (!body || typeof body !== 'object') return null;
	const b = body as Record<string, unknown>;
	if (typeof b.size !== 'number') return null;
	return {
		sizeLabel: aboutSize(b.size),
		pushedAt: typeof b.pushed_at === 'string' ? b.pushed_at : null,
		isPrivate: b.private === true
	};
}
