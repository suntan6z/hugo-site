import tls from 'node:tls';
import { integrations, auth } from '../env.ts';
import { store } from '../store/kv.ts';
import { checkFunctions } from './functions.ts';
import { isConfigured as resendConfigured, sendAlert, looksLikeEmail, listTemplates } from './resend.ts';
import {
	certCheck, pageCheck, parseCertDate, templatesCheck, shouldAlert, isDue, alertMessage, addHistory,
	type Check, type HealthReport, type HealthEntry
} from './uptime-parse.ts';

export * from './uptime-parse.ts';

/**
 * The daily look at the site's health: the site itself, the two form functions and the
 * certificates of the addresses it depends on. See uptime-parse.ts for what counts as
 * wrong and for why this is a daily look and not live monitoring.
 *
 * Runs inside the morning trigger (api/cron), once a day, and on demand from the home
 * screen. Emails the owner when something new is wrong, if ALERT_EMAIL is set.
 */

const KEY = 'state/health';
const TIMEOUT_MS = 20_000;

export interface HealthState {
	last: HealthReport | null;
	history: HealthEntry[];
}

export const readHealth = async (): Promise<HealthState> => (await store.get<HealthState>(KEY)) ?? { last: null, history: [] };

async function fetchPage(name: string, url: string, wantJson = false): Promise<Check> {
	const started = Date.now();
	try {
		const r = await fetch(url, { headers: { 'User-Agent': 'loconsole-admin health check' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
		const ms = Date.now() - started;
		const c = pageCheck(name, r.status, ms);
		if (c.ok && wantJson) {
			try {
				await r.json();
			} catch {
				return { ...c, ok: false, detail: `${c.detail}, but the body is not JSON` };
			}
		} else {
			await r.arrayBuffer().catch(() => {});
		}
		return c;
	} catch (e) {
		return pageCheck(name, null, Date.now() - started, e instanceof Error ? (e.name === 'TimeoutError' ? `no answer in ${TIMEOUT_MS / 1000}s` : e.message) : String(e));
	}
}

/** The end date of the certificate a host presents on 443. */
function certificate(host: string): Promise<Check> {
	return new Promise((resolve) => {
		const now = Date.now();
		let done = false;
		const finish = (c: Check) => {
			if (done) return;
			done = true;
			socket.destroy();
			resolve(c);
		};
		const socket = tls.connect({ host, port: 443, servername: host, timeout: 10_000 }, () => {
			finish(certCheck(host, parseCertDate(socket.getPeerCertificate().valid_to), now));
		});
		socket.on('timeout', () => finish(certCheck(host, null, now, 'no answer in 10s')));
		socket.on('error', (e) => finish(certCheck(host, null, now, e.message)));
	});
}

const hostOf = (url: string) => {
	try {
		const u = new URL(url);
		return u.protocol === 'https:' ? u.hostname : null;
	} catch {
		return null;
	}
};

export async function runChecks(): Promise<HealthReport> {
	const site = integrations.siteUrl;
	// The addresses the site depends on that have a certificate of their own to renew. The
	// functions' addresses are Scaleway's, renewed by them, and the preflight below proves them.
	const hosts = [...new Set([hostOf(site), hostOf(auth.origin), hostOf(integrations.litlyxHost)].filter((h): h is string => !!h))];

	// Without a Resend key there is nothing to look at: the sending features are off, and say so elsewhere.
	const templates = resendConfigured()
		? await listTemplates().then((rows) => templatesCheck(rows), (e) => templatesCheck(null, e instanceof Error ? e.message : String(e)))
		: null;

	const [home, manifest, fns, certs] = await Promise.all([
		fetchPage('Home page', `${site}/en/`),
		fetchPage('Publish manifest', `${site}/en/build-info.json`, true),
		checkFunctions(),
		Promise.all(hosts.map(certificate))
	]);

	const forms: Check[] = fns.map((f) => ({
		name: `${f.name} function`,
		kind: 'form',
		ok: f.ok,
		ms: f.ms,
		detail: f.ok ? `answers the browser's preflight in ${f.ms < 1000 ? `${f.ms} ms` : `${(f.ms / 1000).toFixed(1)} s`}${f.cold ? ' (it was asleep)' : ''}` : (f.error ?? `HTTP ${f.status}`)
	}));

	return { at: new Date().toISOString(), checks: [home, manifest, ...forms, ...(templates ? [templates] : []), ...certs] };
}

export interface HealthRun {
	skipped?: 'not-due';
	report: HealthReport | null;
	alerted: boolean;
}

/** Looks, remembers, and emails if something new is wrong. Skipped when the last look is under a day old, unless forced. */
export async function runHealth(opts: { force?: boolean } = {}): Promise<HealthRun> {
	const state = await readHealth();
	if (!opts.force && !isDue(state.last?.at ?? null, new Date())) return { skipped: 'not-due', report: state.last, alerted: false };

	const report = await runChecks();
	let alerted = false;
	const to = integrations.alertEmail.trim();
	if (shouldAlert(state.last, report) && to && looksLikeEmail(to) && resendConfigured()) {
		const m = alertMessage(report);
		try {
			await sendAlert(to, m.subject, m.text);
			alerted = true;
		} catch {
			// The dashboard still shows it; a failed email must not lose the report.
		}
	}
	await store.put(KEY, { last: report, history: addHistory(state.history, report) } satisfies HealthState);
	return { report, alerted };
}
