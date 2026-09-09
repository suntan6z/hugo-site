import crypto from 'node:crypto';

/**
 * Minimal S3 client for Scaleway Object Storage, signing requests with SigV4 by
 * hand. The AWS SDK is ~200 packages for four HTTP verbs.
 *
 * Deliberately free of any SvelteKit imports so it can be exercised by the test
 * suite directly against a real bucket.
 */
export interface S3Config {
	bucket: string;
	region: string;
	accessKey: string;
	secretKey: string;
}

const hmac = (key: crypto.BinaryLike, data: string) =>
	crypto.createHmac('sha256', key).update(data).digest();
const sha256 = (data: string) => crypto.createHash('sha256').update(data).digest('hex');

/** Percent-encodes a path segment per RFC 3986, which is what SigV4 expects. */
const encodeSegment = (s: string) =>
	encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export class S3Client {
	// Written out rather than using a TypeScript parameter property: Node's
	// type-stripping runs the test suite with no build step, and parameter
	// properties need code generation rather than pure stripping.
	private readonly cfg: S3Config;

	constructor(cfg: S3Config) {
		this.cfg = cfg;
	}

	get host(): string {
		return `s3.${this.cfg.region}.scw.cloud`;
	}

	async send(
		method: string,
		key: string,
		body?: string | Uint8Array,
		query = ''
	): Promise<Response> {
		const now = new Date();
		const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
		const date = amzDate.slice(0, 8);

		const payload = body ?? '';
		const payloadHash =
			typeof payload === 'string'
				? sha256(payload)
				: crypto.createHash('sha256').update(payload).digest('hex');

		const canonicalUri =
			`/${this.cfg.bucket}` + (key ? `/${key.split('/').map(encodeSegment).join('/')}` : '');

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

		const scope = `${date}/${this.cfg.region}/s3/aws4_request`;
		const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');

		const signingKey = hmac(
			hmac(hmac(hmac(`AWS4${this.cfg.secretKey}`, date), this.cfg.region), 's3'),
			'aws4_request'
		);
		const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

		return fetch(`https://${this.host}${canonicalUri}${query ? `?${query}` : ''}`, {
			method,
			// Uint8Array<ArrayBufferLike> needs widening to BodyInit for fetch.
			body: payload === '' ? undefined : (payload as BodyInit),
			headers: {
				...headers,
				Authorization:
					`AWS4-HMAC-SHA256 Credential=${this.cfg.accessKey}/${scope}, ` +
					`SignedHeaders=${signedHeaders}, Signature=${signature}`
			}
		});
	}
}
