/**
 * Boots the real production build (`node build`) against a throwaway copy of
 * the site, so integration tests exercise exactly what ships — the auth hook,
 * CSRF, form actions, multipart parsing, the writers — without ever touching
 * the working tree.
 *
 * Why this exists: nearly every serious bug found while building the portal
 * was caught by clicking through by hand, not by the unit suite — CRLF
 * corruption from <textarea>, uploads silently dropped by a urlencoded form,
 * the empty front-matter crash, and form actions reachable without a session.
 * Each lived in the seams between modules, which unit tests cannot see.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse as devalueParse } from 'devalue';

const ADMIN = path.resolve(import.meta.dirname, '..', '..');
const REPO = path.resolve(ADMIN, '..');

/** What each test run gets its own copy of. Markdown only, plus a couple of small images. */
function seedSite(root: string) {
	const copy = (rel: string) => {
		const from = path.join(REPO, rel);
		const to = path.join(root, rel);
		fs.mkdirSync(path.dirname(to), { recursive: true });
		fs.cpSync(from, to, { recursive: true });
	};
	copy('data');
	copy('i18n');
	copy('content/gallery/bari');
	copy('content/gallery/paris/index.md');
	// Every blog bundle's Markdown (needed for slug and link checks), but only
	// one bundle's images — enough to exercise uploads and previews cheaply.
	const blog = path.join(REPO, 'content', 'blog');
	for (const e of fs.readdirSync(blog, { withFileTypes: true })) {
		const src = path.join(blog, e.name);
		if (!e.isDirectory()) {
			copy(path.join('content', 'blog', e.name));
			continue;
		}
		for (const f of fs.readdirSync(src)) {
			if (f.endsWith('.md') || e.name === 'out-the-shadow' && f === 'fundacjalogo.png') {
				copy(path.join('content', 'blog', e.name, f));
			}
		}
	}
}

export interface ActionResult {
	/**
	 * The action's own status. SvelteKit answers an action request with HTTP 200
	 * and carries the real outcome (400, 422…) inside the JSON; only a request
	 * stopped before reaching the action (401 from the auth hook, 403 from CSRF)
	 * shows its status at the HTTP level.
	 */
	status: number;
	httpStatus: number;
	type?: 'success' | 'failure' | 'redirect' | 'error';
	location?: string;
	data?: Record<string, unknown>;
	raw: string;
}

export interface Portal {
	url: string;
	root: string;
	stop(): Promise<void>;
	signIn(): Promise<string>;
	get(path: string, opts?: { cookie?: string }): Promise<Response>;
	/** A JSON API call; `json` given as a string is sent verbatim (for malformed bodies). */
	send(method: string, path: string, opts?: { cookie?: string; json?: unknown }): Promise<Response>;
	action(
		path: string,
		fields: Record<string, string | Blob>,
		opts?: { cookie?: string; origin?: string; multipart?: boolean }
	): Promise<ActionResult>;
	read(rel: string): string | null;
	exists(rel: string): boolean;
}

/**
 * A stand-in for DeepL's /v2/translate and /v2/usage. It "translates" by
 * upper-casing text outside tags — as DeepL must leave tags alone — and
 * writes self-closing tags back in long form, as DeepL sometimes does, so
 * the portal's reassembly is exercised for real. Every request is recorded.
 */
export interface FakeDeepL {
	url: string;
	requests: { path: string; auth: string | null; body: Record<string, unknown> | null }[];
	close(): Promise<void>;
}

export async function startFakeDeepL(): Promise<FakeDeepL> {
	const requests: FakeDeepL['requests'] = [];
	const server = http.createServer(async (req, res) => {
		let raw = '';
		for await (const chunk of req) raw += chunk;
		const body = raw ? JSON.parse(raw) : null;
		requests.push({ path: req.url ?? '', auth: req.headers.authorization ?? null, body });
		res.setHeader('Content-Type', 'application/json');
		if (req.url === '/v2/usage') return res.end(JSON.stringify({ character_count: 1234, character_limit: 500000 }));
		const texts: string[] = body?.text ?? [];
		if (texts.some((t) => t.includes('QUOTA'))) {
			res.statusCode = 456;
			return res.end(JSON.stringify({ message: 'Quota exceeded' }));
		}
		const translations = texts.map((t) => ({
			text: t
				.replace(/(^|>)([^<]*)/g, (_, a, x) => a + x.toUpperCase().replace(/&(AMP|LT|GT);/g, (e: string) => e.toLowerCase()))
				.replace(/<k i="(\d+)"\/>/g, '<k i="$1"></k>')
		}));
		res.end(JSON.stringify({ translations }));
	});
	await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
	const { port } = server.address() as AddressInfo;
	return {
		url: `http://127.0.0.1:${port}`,
		requests,
		close: () => new Promise((r) => server.close(() => r()))
	};
}

export async function startPortal(opts: { env?: Record<string, string> } = {}): Promise<Portal> {
	if (!fs.existsSync(path.join(ADMIN, 'build', 'index.js'))) {
		throw new Error('No production build. Run `npm run build` first (test:integration does this).');
	}
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-site-'));
	const state = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-state-'));
	seedSite(root);

	const port = 20000 + Math.floor(Math.random() * 20000);
	const url = `http://127.0.0.1:${port}`;

	const child: ChildProcess = spawn(process.execPath, ['build'], {
		cwd: ADMIN,
		env: {
			PATH: process.env.PATH,
			NODE_ENV: 'production',
			PORT: String(port),
			HOST: '127.0.0.1',
			ORIGIN: url,
			ADMIN_MODE: 'local',
			ALLOW_DEV_LOGIN: '1',
			SITE_ROOT: root,
			LOCAL_STATE_DIR: state,
			SESSION_SECRET: 'integration-tests-only-not-a-real-secret',
			BODY_SIZE_LIMIT: '12M',
			// Deliberately no GH_*, BING_*, RESEND_*: nothing can reach a real service.
			// DeepL, when a test wants it, is the local stand-in above.
			...opts.env
		},
		stdio: ['ignore', 'pipe', 'pipe']
	});
	let logs = '';
	child.stdout?.on('data', (d) => (logs += d));
	child.stderr?.on('data', (d) => (logs += d));

	const deadline = Date.now() + 15_000;
	while (true) {
		try {
			const r = await fetch(`${url}/login`, { redirect: 'manual' });
			if (r.status > 0) break;
		} catch {
			/* not listening yet */
		}
		if (Date.now() > deadline) {
			child.kill();
			throw new Error(`portal did not start:\n${logs}`);
		}
		await new Promise((r) => setTimeout(r, 150));
	}

	const portal: Portal = {
		url,
		root,
		async stop() {
			child.kill();
			fs.rmSync(root, { recursive: true, force: true });
			fs.rmSync(state, { recursive: true, force: true });
		},
		async signIn() {
			const r = await fetch(`${url}/api/auth/dev-login`, { redirect: 'manual' });
			const cookie = r.headers.get('set-cookie')?.match(/session=[^;]+/)?.[0];
			if (!cookie) throw new Error('dev-login did not issue a session');
			return cookie;
		},
		get(p, opts = {}) {
			return fetch(`${url}${p}`, {
				redirect: 'manual',
				headers: opts.cookie ? { Cookie: opts.cookie } : {}
			});
		},
		send(method, p, opts = {}) {
			const headers: Record<string, string> = { Origin: url };
			if (opts.cookie) headers.Cookie = opts.cookie;
			if (opts.json !== undefined) headers['Content-Type'] = 'application/json';
			return fetch(`${url}${p}`, {
				method,
				redirect: 'manual',
				headers,
				body: opts.json === undefined ? undefined : typeof opts.json === 'string' ? opts.json : JSON.stringify(opts.json)
			});
		},
		async action(p, fields, opts = {}) {
			let body: BodyInit;
			const headers: Record<string, string> = {
				'x-sveltekit-action': 'true',
				Origin: opts.origin ?? url
			};
			if (opts.cookie) headers.Cookie = opts.cookie;
			if (opts.multipart) {
				const fd = new FormData();
				for (const [k, v] of Object.entries(fields)) {
					if (v instanceof Blob) fd.append(k, v, (v as File).name ?? 'blob');
					else fd.append(k, v);
				}
				body = fd;
			} else {
				body = new URLSearchParams(fields as Record<string, string>);
				headers['Content-Type'] = 'application/x-www-form-urlencoded';
			}
			const r = await fetch(`${url}${p}`, { method: 'POST', body, headers, redirect: 'manual' });
			const raw = await r.text();
			let parsed: Record<string, unknown> = {};
			try {
				parsed = JSON.parse(raw);
			} catch {
				/* not JSON: e.g. a CSRF rejection is plain text */
			}
			let data: Record<string, unknown> | undefined;
			if (typeof parsed.data === 'string') {
				try {
					data = devalueParse(parsed.data) as Record<string, unknown>;
				} catch {
					data = undefined;
				}
			}
			return {
				status: typeof parsed.status === 'number' ? parsed.status : r.status,
				httpStatus: r.status,
				type: parsed.type as ActionResult['type'],
				location: parsed.location as string | undefined,
				data,
				raw
			};
		},
		read(rel) {
			const f = path.join(root, rel);
			return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
		},
		exists(rel) {
			return fs.existsSync(path.join(root, rel));
		}
	};
	return portal;
}
