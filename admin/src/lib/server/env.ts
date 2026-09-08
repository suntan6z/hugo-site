import { env } from '$env/dynamic/private';

/**
 * The portal runs in one of two modes.
 *
 *   local  — no GitHub App configured. Content is read from and written to the
 *            working copy on disk (../content), state lives under admin/.state.
 *            This is what `npm run dev` uses, and it means the whole portal is
 *            exercisable before any cloud resource exists.
 *   github — the deployed mode. Content is read and written through the GitHub
 *            Git Data API, state lives in Scaleway Object Storage.
 */
export type Mode = 'local' | 'github';

const required = (name: string): string => {
	const v = env[name];
	if (!v) throw new Error(`missing required environment variable ${name}`);
	return v;
};

const optional = (name: string, fallback = ''): string => env[name] ?? fallback;

export const MODE: Mode = env.GH_APP_ID ? 'github' : 'local';
export const IS_LOCAL = MODE === 'local';

/** Absolute path to the Hugo site root (the repo containing content/, layouts/). */
export const SITE_ROOT = optional('SITE_ROOT', new URL('../../../..', import.meta.url).pathname);

/** Where per-viewer state lives in local mode. */
export const LOCAL_STATE_DIR = optional('LOCAL_STATE_DIR', `${SITE_ROOT}/admin/.state`);

export const github = {
	get appId() {
		return required('GH_APP_ID');
	},
	get installationId() {
		return required('GH_INSTALLATION_ID');
	},
	/** Base64-encoded PEM: multi-line PEMs round-trip badly through env plumbing. */
	get privateKey() {
		return Buffer.from(required('GH_PRIVATE_KEY_B64'), 'base64').toString('utf8');
	},
	owner: optional('GH_OWNER', 'suntan6z'),
	repo: optional('GH_REPO', 'hugo-site'),
	branch: optional('GH_BRANCH', 'main')
};

export const auth = {
	/**
	 * WebAuthn Relying Party ID. Immutable once credentials are enrolled —
	 * changing it invalidates every passkey.
	 */
	rpId: optional('RP_ID', IS_LOCAL ? 'localhost' : 'admin.loconsole.eu'),
	rpName: 'loconsole admin',
	origin: optional('ORIGIN', IS_LOCAL ? 'http://localhost:5180' : 'https://admin.loconsole.eu'),
	/**
	 * In local mode a fixed dev secret keeps sessions stable across restarts.
	 * In deployed mode this must be a real 32-byte secret or startup fails.
	 */
	sessionSecret: IS_LOCAL
		? optional('SESSION_SECRET', 'dev-only-insecure-session-secret-32b')
		: required('SESSION_SECRET'),
	/** Gates first-run passkey enrolment. Absent in local mode = enrolment open. */
	bootstrapToken: optional('BOOTSTRAP_TOKEN')
};

export const integrations = {
	resendApiKey: optional('RESEND_API_KEY'),
	resendAudienceId: optional('RESEND_AUDIENCE_ID', '276f21cc-de35-468d-8b30-06fc08ad1016'),
	litlyxToken: optional('LITLYX_TOKEN'),
	litlyxHost: optional('LITLYX_HOST', 'https://analytics.loconsole.eu'),
	bingApiKey: optional('BING_API_KEY'),
	indexNowKey: optional('INDEXNOW_KEY'),
	siteUrl: optional('SITE_URL', 'https://lorenzo.loconsole.eu')
};
