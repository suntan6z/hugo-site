import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { IS_LOCAL, LOCAL_STATE_DIR } from '../env.ts';
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
	constructor(private root: string) {}

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

/**
 * Deployed mode: Scaleway Object Storage over the S3 API, with SigV4 signed by
 * hand. The AWS SDK is ~200 packages for four HTTP verbs.
 */
class S3Store implements Store {
	constructor(
		private bucket: string,
		private region: string,
		private accessKey: string,
		private secretKey: string
	) {}

	private get host() {
		return `s3.${this.region}.scw.cloud`;
	}

	private async signedFetch(
		method: string,
		key: string,
		body?: string,
		query = ''
	): Promise<Response> {
		const now = new Date();
		const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
		const date = amzDate.slice(0, 8);
		const payloadHash = crypto
			.createHash('sha256')
			.update(body ?? '')
			.digest('hex');

		const canonicalUri = `/${this.bucket}${key ? `/${key}` : ''}`
			.split('/')
			.map((s, i) => (i === 0 ? s : encodeURIComponent(s)))
			.join('/');

		const headers: Record<string, string> = {
			host: this.host,
			'x-amz-content-sha256': payloadHash,
			'x-amz-date': amzDate
		};
		const signedHeaders = Object.keys(headers).sort().join(';');
		const canonicalHeaders = Object.keys(headers)
			.sort()
			.map((h) => `${h}:${headers[h]}\n`)
			.join('');

		const canonicalRequest = [
			method,
			canonicalUri,
			query,
			canonicalHeaders,
			signedHeaders,
			payloadHash
		].join('\n');

		const scope = `${date}/${this.region}/s3/aws4_request`;
		const stringToSign = [
			'AWS4-HMAC-SHA256',
			amzDate,
			scope,
			crypto.createHash('sha256').update(canonicalRequest).digest('hex')
		].join('\n');

		const hmac = (k: crypto.BinaryLike | Buffer, d: string) =>
			crypto.createHmac('sha256', k).update(d).digest();
		const signingKey = hmac(hmac(hmac(hmac(`AWS4${this.secretKey}`, date), this.region), 's3'), 'aws4_request');
		const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

		return fetch(`https://${this.host}${canonicalUri}${query ? `?${query}` : ''}`, {
			method,
			body,
			headers: {
				...headers,
				Authorization: `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
			}
		});
	}

	async get<T>(key: string): Promise<T | null> {
		const r = await this.signedFetch('GET', `${key}.json`);
		if (r.status === 404) return null;
		if (!r.ok) throw new Error(`store get ${key}: ${r.status} ${await r.text()}`);
		return (await r.json()) as T;
	}

	async put(key: string, value: unknown): Promise<void> {
		const r = await this.signedFetch('PUT', `${key}.json`, JSON.stringify(value, null, 2));
		if (!r.ok) throw new Error(`store put ${key}: ${r.status} ${await r.text()}`);
	}

	async del(key: string): Promise<void> {
		const r = await this.signedFetch('DELETE', `${key}.json`);
		if (!r.ok && r.status !== 404) throw new Error(`store del ${key}: ${r.status}`);
	}

	async list(prefix: string): Promise<string[]> {
		const q = `list-type=2&prefix=${encodeURIComponent(`${prefix}/`)}`;
		const r = await this.signedFetch('GET', '', undefined, q);
		if (!r.ok) throw new Error(`store list ${prefix}: ${r.status}`);
		const xml = await r.text();
		return [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)]
			.map((m) => m[1])
			.filter((k) => k.endsWith('.json'))
			.map((k) => k.slice(0, -5))
			.sort();
	}
}

export const store: Store = IS_LOCAL
	? new FsStore(LOCAL_STATE_DIR)
	: new S3Store(
			env.SCW_BUCKET ?? 'loconsole-admin-state',
			env.SCW_REGION ?? 'fr-par',
			env.SCW_ACCESS_KEY ?? '',
			env.SCW_SECRET_KEY ?? ''
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
