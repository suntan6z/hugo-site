import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { IS_LOCAL, LOCAL_STATE_DIR } from '../env.ts';
import { S3Client, parseListPage, sigv4Encode } from './s3client.ts';
import { env } from '$env/dynamic/private';

/**
 * Tiny object store for the portal's own state: the passkey credentials, WIP
 * drafts, the audit trail and cached analytics. Deliberately not a database —
 * the whole persistent dataset is a few kilobytes of JSON plus an append-only
 * log, and a SQL instance would add a connection lifecycle and a second cold
 * start to store it.
 */
export interface Store {
	get<T>(key: string): Promise<T | null>;
	put(key: string, value: unknown): Promise<void>;
	del(key: string): Promise<void>;
	/** Keys under a prefix, lexicographically ascending. */
	list(prefix: string): Promise<string[]>;
}

/** Local mode: plain files under admin/.state. */
class FsStore implements Store {
	private readonly root: string;

	constructor(root: string) {
		this.root = root;
	}

	private file(key: string) {
		if (key.includes('..')) throw new Error(`unsafe store key: ${key}`);
		return path.join(this.root, `${key}.json`);
	}

	async get<T>(key: string): Promise<T | null> {
		try {
			return JSON.parse(await fs.readFile(this.file(key), 'utf8')) as T;
		} catch (e) {
			if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
			throw e;
		}
	}

	async put(key: string, value: unknown): Promise<void> {
		const f = this.file(key);
		await fs.mkdir(path.dirname(f), { recursive: true });
		// Write-then-rename so a crash can't leave a half-written credential file.
		const tmp = `${f}.${crypto.randomBytes(6).toString('hex')}.tmp`;
		await fs.writeFile(tmp, JSON.stringify(value, null, 2));
		await fs.rename(tmp, f);
	}

	async del(key: string): Promise<void> {
		await fs.rm(this.file(key), { force: true });
	}

	async list(prefix: string): Promise<string[]> {
		const dir = path.join(this.root, prefix);
		try {
			const names = await fs.readdir(dir);
			return names
				.filter((n) => n.endsWith('.json'))
				.map((n) => `${prefix}/${n.slice(0, -5)}`)
				.sort();
		} catch (e) {
			if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
			throw e;
		}
	}
}

/** Deployed mode: Scaleway Object Storage, via the extracted SigV4 client. */
class S3Store implements Store {
	private readonly s3: S3Client;

	constructor(s3: S3Client) {
		this.s3 = s3;
	}

	async get<T>(key: string): Promise<T | null> {
		const r = await this.s3.send('GET', `${key}.json`);
		if (r.status === 404) return null;
		if (!r.ok) throw new Error(`store get ${key}: ${r.status} ${await r.text()}`);
		return (await r.json()) as T;
	}

	async put(key: string, value: unknown): Promise<void> {
		const r = await this.s3.send('PUT', `${key}.json`, JSON.stringify(value, null, 2));
		if (!r.ok) throw new Error(`store put ${key}: ${r.status} ${await r.text()}`);
	}

	async del(key: string): Promise<void> {
		const r = await this.s3.send('DELETE', `${key}.json`);
		if (!r.ok && r.status !== 404) throw new Error(`store del ${key}: ${r.status}`);
	}

	async list(prefix: string): Promise<string[]> {
		// S3 returns at most 1,000 keys per page. Reading only the first page
		// once froze the settings page's "Recent activity" on the oldest
		// entries as soon as audit/ grew past that — hiding new sign-ins.
		const keys: string[] = [];
		let token: string | null = null;
		for (let page = 0; page < 100; page++) {
			// SigV4 signs the query verbatim: parameters sorted by name, strictly encoded.
			const query: string =
				(token ? `continuation-token=${sigv4Encode(token)}&` : '') +
				`list-type=2&prefix=${sigv4Encode(`${prefix}/`)}`;
			const r = await this.s3.send('GET', '', undefined, query);
			if (!r.ok) throw new Error(`store list ${prefix}: ${r.status}`);
			const parsed = parseListPage(await r.text());
			keys.push(...parsed.keys);
			token = parsed.next;
			if (!token) break;
		}
		return keys
			.filter((k) => k.endsWith('.json'))
			.map((k) => k.slice(0, -5))
			.sort();
	}
}

export const store: Store = IS_LOCAL
	? new FsStore(LOCAL_STATE_DIR)
	: new S3Store(
			new S3Client({
				bucket: env.SCW_BUCKET ?? 'loconsole-admin-state',
				region: env.SCW_REGION ?? 'fr-par',
				accessKey: env.SCW_ACCESS_KEY ?? '',
				secretKey: env.SCW_SECRET_KEY ?? ''
			})
		);

/** Append-only audit entries: one object each, since S3 has no compare-and-swap. */
export async function audit(event: string, detail: Record<string, unknown> = {}): Promise<void> {
	const ts = new Date().toISOString().replace(/[:.]/g, '-');
	await store.put(`audit/${ts}-${crypto.randomBytes(4).toString('hex')}`, {
		at: new Date().toISOString(),
		event,
		...detail
	});
}
