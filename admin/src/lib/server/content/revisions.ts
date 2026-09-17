/**
 * Earlier versions of a file, as the history panels list them.
 *
 * Every save the portal makes is a commit, so git history already is the
 * version history: nothing extra is stored. This is the pure half — reading
 * `git log` output and combining per-file lists — so the suite can drive it.
 */

export interface Revision {
	sha: string;
	/** ISO 8601, author date. */
	date: string;
	author: string;
	/** First line of the commit message. */
	message: string;
}

export const SHA_RE = /^[0-9a-f]{7,40}$/;

/** Separators `git log --format` is given, so no message can be mistaken for one. */
export const LOG_FORMAT = '%H%x1f%aI%x1f%an%x1f%s%x1e';

export function parseGitLog(stdout: string): Revision[] {
	return stdout
		.split('\x1e')
		.map((rec) => rec.replace(/^\s+/, ''))
		.filter(Boolean)
		.map((rec) => rec.split('\x1f'))
		.filter((f) => f.length >= 4 && SHA_RE.test(f[0]))
		.map(([sha, date, author, message]) => ({ sha, date, author, message: message.split('\n')[0].trim() }));
}

/** Several files' histories as one list: each commit once, newest first. */
export function mergeRevisions(lists: Revision[][], limit: number): Revision[] {
	const bySha = new Map<string, Revision>();
	for (const r of lists.flat()) if (!bySha.has(r.sha)) bySha.set(r.sha, r);
	return [...bySha.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}
