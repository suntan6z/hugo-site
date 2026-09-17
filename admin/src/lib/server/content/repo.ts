import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { IS_LOCAL, SITE_ROOT, github } from '../env.ts';
import { gh, GitHubError } from '../github/api.ts';
import { memo, invalidateAll, DEFAULT_TTL_MS } from '../cache.ts';
import { LOG_FORMAT, SHA_RE, parseGitLog, mergeRevisions, type Revision } from './revisions.ts';

export type { Revision };

const run = promisify(execFile);

/** One file change inside a single atomic commit. */
export type FileOp =
	| { path: string; content: string }
	| { path: string; bytes: Uint8Array }
	| { path: string; delete: true }
	/**
	 * Rename without moving bytes. Renumbering a gallery city touches every
	 * photo in it; re-uploading 20 images to change their order would be absurd.
	 * On GitHub this reuses the existing blob SHA, so nothing is transferred.
	 */
	| { path: string; moveFrom: string };

export interface Repo {
	readText(p: string): Promise<string | null>;
	readBinary(p: string): Promise<Uint8Array | null>;
	/** Every file path under a prefix, repo-relative, sorted. */
	listTree(prefix: string): Promise<string[]>;
	/** When the file last changed, ISO, or null if that cannot be told. */
	lastModified(p: string): Promise<string | null>;
	/** Commits that touched any of these paths (files or folders), newest first. Empty if there is no history. */
	history(paths: string[], limit?: number): Promise<Revision[]>;
	/** A file as it was at a commit, or null if it did not exist then. */
	readTextAt(p: string, sha: string): Promise<string | null>;
	/** Applies all ops as ONE commit. Returns the new head sha. */
	commit(message: string, ops: FileOp[]): Promise<{ sha: string }>;
}

export class ConcurrentWriteError extends Error {}

/* ------------------------------------------------------------------ local */

/**
 * Local mode: the working copy on disk. Lets the whole portal be exercised
 * before any cloud resource exists, and makes `hugo server` show portal edits
 * live.
 */
class LocalRepo implements Repo {
	private abs(p: string) {
		const full = path.resolve(SITE_ROOT, p);
		if (!full.startsWith(path.resolve(SITE_ROOT) + path.sep)) {
			throw new Error(`path escapes the site root: ${p}`);
		}
		return full;
	}

	async readText(p: string) {
		try {
			return await fs.readFile(this.abs(p), 'utf8');
		} catch (e) {
			if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
			throw e;
		}
	}

	async readBinary(p: string) {
		try {
			return new Uint8Array(await fs.readFile(this.abs(p)));
		} catch (e) {
			if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
			throw e;
		}
	}

	async lastModified(p: string) {
		try {
			return (await fs.stat(this.abs(p))).mtime.toISOString();
		} catch {
			return null;
		}
	}

	/**
	 * The working copy's own git history. Local saves write files without
	 * committing, so this lists what has been committed by hand. A copy that is
	 * not a git repository at all simply has no history.
	 */
	async history(paths: string[], limit = 30) {
		paths.forEach((p) => this.abs(p));
		try {
			const { stdout } = await run(
				'git',
				['-C', SITE_ROOT, 'log', '-n', String(limit), `--format=${LOG_FORMAT}`, '--', ...paths],
				{ maxBuffer: 5 * 1024 * 1024 }
			);
			return parseGitLog(stdout);
		} catch {
			return [];
		}
	}

	async readTextAt(p: string, sha: string) {
		if (!SHA_RE.test(sha)) return null;
		this.abs(p);
		try {
			// ./ makes the path relative to SITE_ROOT even when the repository root is above it.
			const { stdout } = await run('git', ['-C', SITE_ROOT, 'show', `${sha}:./${p}`], { maxBuffer: 20 * 1024 * 1024 });
			return stdout;
		} catch {
			return null;
		}
	}

	async listTree(prefix: string) {
		const out: string[] = [];
		const walk = async (rel: string) => {
			let entries;
			try {
				entries = await fs.readdir(this.abs(rel), { withFileTypes: true });
			} catch (e) {
				if ((e as NodeJS.ErrnoException).code === 'ENOENT') return;
				throw e;
			}
			for (const e of entries) {
				if (e.name.startsWith('.')) continue;
				const child = `${rel}/${e.name}`;
				if (e.isDirectory()) await walk(child);
				else out.push(child);
			}
		};
		await walk(prefix.replace(/\/$/, ''));
		return out.sort();
	}

	/** Removes now-empty directories up to (but never including) the site root. */
	private async pruneEmptyDirs(dir: string): Promise<void> {
		const root = path.resolve(SITE_ROOT);
		let cur = dir;
		while (cur.startsWith(root + path.sep)) {
			let entries: string[];
			try {
				entries = await fs.readdir(cur);
			} catch {
				return;
			}
			if (entries.length > 0) return;
			await fs.rmdir(cur).catch(() => {});
			cur = path.dirname(cur);
		}
	}

	async commit(_message: string, ops: FileOp[]) {
		// Moves are staged to temporary names first: renumbering a gallery swaps
		// names that are still occupied (1->2 while 2->3), and a naive sequential
		// rename would clobber a file that a later move still needs.
		const moves = ops.filter((o): o is { path: string; moveFrom: string } => 'moveFrom' in o);
		const staged: { tmp: string; to: string }[] = [];
		for (const op of moves) {
			const tmp = `${this.abs(op.moveFrom)}.moving-${crypto.randomUUID().slice(0, 8)}`;
			await fs.rename(this.abs(op.moveFrom), tmp);
			staged.push({ tmp, to: this.abs(op.path) });
		}
		for (const { tmp, to } of staged) {
			await fs.mkdir(path.dirname(to), { recursive: true });
			await fs.rename(tmp, to);
		}

		for (const op of ops) {
			if ('moveFrom' in op) continue;
			const full = this.abs(op.path);
			if ('delete' in op) {
				await fs.rm(full, { force: true });
				// git has no concept of an empty directory, so the GitHub backend
				// drops the folder implicitly. Mirror that on disk rather than
				// leaving an empty bundle behind that nothing will ever clean up.
				await this.pruneEmptyDirs(path.dirname(full));
				continue;
			}
			await fs.mkdir(path.dirname(full), { recursive: true });
			await fs.writeFile(full, 'content' in op ? op.content : Buffer.from(op.bytes));
		}
		invalidateAll();
		return { sha: 'local' };
	}
}

/* ----------------------------------------------------------------- github */

interface TreeEntry {
	path: string;
	mode: string;
	type: string;
	sha: string | null;
}

class GitHubRepo implements Repo {
	/**
	 * The whole recursive tree, cached. Every listing and every text read goes
	 * through it, which turns "one Contents call per file" into "one tree call
	 * plus a blob fetch per file" — and the blob fetches can then run in
	 * parallel because the paths are already known.
	 */
	private tree(): Promise<Map<string, string>> {
		return memo('gh:tree', DEFAULT_TTL_MS, async () => {
			const r = await gh<{ tree: TreeEntry[]; truncated: boolean }>(
				'GET',
				`/git/trees/${github.branch}?recursive=1`
			);
			if (r.truncated) {
				throw new Error('git tree response was truncated; repo has outgrown a single listing');
			}
			return new Map(
				r.tree.filter((e) => e.type === 'blob' && e.sha).map((e) => [e.path, e.sha as string])
			);
		});
	}

	async readText(p: string) {
		const sha = (await this.tree()).get(p);
		// Not in the cached tree: either genuinely absent, or written since the
		// tree was cached. Fall through to the Contents API to be sure.
		if (!sha) {
			const bytes = await this.readBinary(p);
			return bytes ? Buffer.from(bytes).toString('utf8') : null;
		}
		const blob = await memo(`gh:blob:${sha}`, DEFAULT_TTL_MS, () =>
			gh<{ content: string; encoding: string }>('GET', `/git/blobs/${sha}`)
		);
		return Buffer.from(blob.content, blob.encoding as BufferEncoding).toString('utf8');
	}

	async readBinary(p: string) {
		// Via the blob SHA, not the Contents API: that one refuses anything over
		// 1 MB, which is most photographs — the editor showed a broken thumbnail
		// for every image bigger than a logo. Blobs go up to 100 MB.
		const sha = (await this.tree()).get(p);
		if (sha) {
			const blob = await memo(`gh:blob:${sha}`, DEFAULT_TTL_MS, () =>
				gh<{ content: string; encoding: string }>('GET', `/git/blobs/${sha}`)
			);
			return new Uint8Array(Buffer.from(blob.content, blob.encoding as BufferEncoding));
		}
		// Not in the cached tree: either genuinely absent, or written since the
		// tree was cached. The Contents API answers for anything small enough.
		try {
			const r = await gh<{ content: string; encoding: string }>(
				'GET',
				`/contents/${encodeURI(p)}?ref=${github.branch}`
			);
			return new Uint8Array(Buffer.from(r.content, r.encoding as BufferEncoding));
		} catch (e) {
			if (e instanceof GitHubError && e.status === 404) return null;
			throw e;
		}
	}

	async lastModified(p: string) {
		try {
			const commits = await memo(`gh:lastmod:${p}`, DEFAULT_TTL_MS, () =>
				gh<{ commit: { committer: { date: string } } }[]>(
					'GET',
					`/commits?path=${encodeURIComponent(p)}&sha=${github.branch}&per_page=1`
				)
			);
			return commits[0]?.commit.committer.date ?? null;
		} catch {
			return null;
		}
	}

	async history(paths: string[], limit = 30) {
		type GhCommit = { sha: string; commit: { message: string; author?: { name?: string; date?: string }; committer?: { date?: string } } };
		// One call per path: the commits API filters by a single path (a folder counts).
		const lists = await Promise.all(
			paths.map((p) =>
				memo(`gh:history:${p}:${limit}`, DEFAULT_TTL_MS, () =>
					gh<GhCommit[]>('GET', `/commits?path=${encodeURIComponent(p)}&sha=${github.branch}&per_page=${limit}`)
				)
			)
		);
		return mergeRevisions(
			lists.map((l) =>
				l.map((c) => ({
					sha: c.sha,
					date: c.commit.author?.date ?? c.commit.committer?.date ?? '',
					author: c.commit.author?.name ?? '',
					message: c.commit.message.split('\n')[0].trim()
				}))
			),
			limit
		);
	}

	async readTextAt(p: string, sha: string) {
		if (!SHA_RE.test(sha)) return null;
		try {
			// A file at a commit never changes, so this can be cached for as long as the process lives.
			const r = await memo(`gh:at:${sha}:${p}`, 24 * 3600_000, () =>
				gh<{ content: string; encoding: string }>('GET', `/contents/${encodeURI(p)}?ref=${sha}`)
			);
			return Buffer.from(r.content, r.encoding as BufferEncoding).toString('utf8');
		} catch (e) {
			if (e instanceof GitHubError && e.status === 404) return null;
			throw e;
		}
	}

	async listTree(prefix: string) {
		const p = prefix.replace(/\/$/, '');
		return [...(await this.tree()).keys()].filter((path) => path.startsWith(`${p}/`)).sort();
	}

	/**
	 * Blobs -> tree -> commit -> ref, so a post's Markdown, its translations and
	 * its images land as ONE commit and StaticHost runs ONE build.
	 */
	async commit(message: string, ops: FileOp[], attempt = 1): Promise<{ sha: string }> {
		const ref = await gh<{ object: { sha: string } }>('GET', `/git/ref/heads/${github.branch}`);
		const headSha = ref.object.sha;
		const head = await gh<{ tree: { sha: string } }>('GET', `/git/commits/${headSha}`);

		// A move reuses the source blob's SHA, so no bytes are transferred. The
		// base tree is fetched once and shared by every move in the commit.
		const moves = ops.filter((o): o is { path: string; moveFrom: string } => 'moveFrom' in o);
		const blobByPath = moves.length ? await this.tree() : new Map<string, string>();

		const tree: TreeEntry[] = [];
		// Cap concurrency: a gallery city upload can be 20 blobs at once.
		for (let i = 0; i < ops.length; i += 5) {
			const batch = await Promise.all(
				ops.slice(i, i + 5).map(async (op): Promise<TreeEntry> => {
					// A deletion is an explicit null-sha entry. Omitting the path does
					// NOT delete when base_tree is set.
					if ('delete' in op) {
						return { path: op.path, mode: '100644', type: 'blob', sha: null };
					}
					if ('moveFrom' in op) {
						const sha = blobByPath.get(op.moveFrom);
						if (!sha) throw new Error(`cannot move ${op.moveFrom}: not found in the tree`);
						return { path: op.path, mode: '100644', type: 'blob', sha };
					}
					const payload =
						'content' in op
							? { content: op.content, encoding: 'utf-8' }
							: { content: Buffer.from(op.bytes).toString('base64'), encoding: 'base64' };
					const blob = await gh<{ sha: string }>('POST', '/git/blobs', payload);
					return { path: op.path, mode: '100644', type: 'blob', sha: blob.sha };
				})
			);
			tree.push(...batch);
		}

		// Delete each move's source, unless something else in this commit writes
		// to that same path (a swap, or a rename chain).
		const written = new Set(tree.map((e) => e.path));
		for (const op of moves) {
			if (!written.has(op.moveFrom)) {
				tree.push({ path: op.moveFrom, mode: '100644', type: 'blob', sha: null });
			}
		}

		const newTree = await gh<{ sha: string }>('POST', '/git/trees', {
			base_tree: head.tree.sha,
			tree
		});
		const commit = await gh<{ sha: string }>('POST', '/git/commits', {
			message,
			tree: newTree.sha,
			parents: [headSha]
		});

		try {
			// force:false on purpose — a losing race must fail loudly, never clobber.
			await gh('PATCH', `/git/refs/heads/${github.branch}`, { sha: commit.sha, force: false });
		} catch (e) {
			const notFastForward =
				e instanceof GitHubError && e.status === 422 && /fast forward/i.test(e.body);
			if (notFastForward && attempt < 3) return this.commit(message, ops, attempt + 1);
			if (notFastForward) {
				throw new ConcurrentWriteError(
					'The repository moved while saving (someone pushed to main). Reload and try again.'
				);
			}
			throw e;
		}
		invalidateAll();
		return { sha: commit.sha };
	}
}

export const repo: Repo = IS_LOCAL ? new LocalRepo() : new GitHubRepo();
