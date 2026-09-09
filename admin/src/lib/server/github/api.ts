import { github } from '../env.ts';
import { installationToken, invalidateToken } from './auth.ts';

export class GitHubError extends Error {
	// Fields written out rather than as parameter properties, so every module
	// stays loadable by Node's type-stripping (used by the test suite).
	readonly status: number;
	readonly body: string;

	constructor(message: string, status: number, body: string) {
		super(message);
		this.status = status;
		this.body = body;
	}
}

const BASE = 'https://api.github.com';

/**
 * Thin fetch wrapper over the REST API. Deliberately not octokit: this calls
 * six endpoints, and the Git Data dance below is not wrapped in anything nicer
 * by the SDK anyway.
 */
export async function gh<T>(
	method: string,
	path: string,
	body?: unknown,
	retryOn401 = true
): Promise<T> {
	const url = path.startsWith('http')
		? path
		: `${BASE}/repos/${github.owner}/${github.repo}${path}`;

	const r = await fetch(url, {
		method,
		headers: {
			Authorization: `Bearer ${await installationToken()}`,
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28',
			...(body ? { 'Content-Type': 'application/json' } : {})
		},
		body: body ? JSON.stringify(body) : undefined
	});

	if (r.status === 401 && retryOn401) {
		invalidateToken();
		return gh<T>(method, path, body, false);
	}
	if (!r.ok) {
		const text = await r.text();
		throw new GitHubError(`${method} ${path} -> ${r.status}`, r.status, text);
	}
	return r.status === 204 ? (undefined as T) : ((await r.json()) as T);
}
