import fs from 'node:fs/promises';
import path from 'node:path';
import { IS_LOCAL, SITE_ROOT, github } from '../env.ts';
import { gh, GitHubError } from '../github/api.ts';

/** One file change inside a single atomic commit. */
export type FileOp =
	| { path: string; content: string }
	| { path: string; bytes: Uint8Array }
	| { path: string; delete: true };

export interface Repo {
	readText(p: string): Promise<string | null>;
	readBinary(p: string): Promise<Uint8Array | null>;
	/** Every file path under a prefix, repo-relative, sorted. */
	listTree(prefix: string): Promise<string[]>;
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

	async commit(_message: string, ops: FileOp[]) {
		for (const op of ops) {
			const full = this.abs(op.path);
			if ('delete' in op) {
				await fs.rm(full, { force: true });
				continue;
			}
			await fs.mkdir(path.dirname(full), { recursive: true });
			await fs.writeFile(full, 'content' in op ? op.content : Buffer.from(op.bytes));
		}
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
	async readText(p: string) {
		const bytes = await this.readBinary(p);
		return bytes ? Buffer.from(bytes).toString('utf8') : null;
	}

	async readBinary(p: string) {
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

	async listTree(prefix: string) {
		const r = await gh<{ tree: TreeEntry[]; truncated: boolean }>(
			'GET',
			`/git/trees/${github.branch}?recursive=1`
		);
		if (r.truncated) {
			throw new Error('git tree response was truncated; repo has outgrown a single listing');
		}
		const p = prefix.replace(/\/$/, '');
		return r.tree
			.filter((e) => e.type === 'blob' && e.path.startsWith(`${p}/`))
			.map((e) => e.path)
			.sort();
	}

	/**
	 * Blobs -> tree -> commit -> ref, so a post's Markdown, its translations and
	 * its images land as ONE commit and StaticHost runs ONE build.
	 */
	async commit(message: string, ops: FileOp[], attempt = 1): Promise<{ sha: string }> {
		const ref = await gh<{ object: { sha: string } }>('GET', `/git/ref/heads/${github.branch}`);
		const headSha = ref.object.sha;
		const head = await gh<{ tree: { sha: string } }>('GET', `/git/commits/${headSha}`);

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
		return { sha: commit.sha };
	}
}

export const repo: Repo = IS_LOCAL ? new LocalRepo() : new GitHubRepo();
