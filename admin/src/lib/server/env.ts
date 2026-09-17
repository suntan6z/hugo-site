import path from 'node:path';
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

/**
 * Mode is inferred from whether a GitHub App is configured, but ADMIN_MODE
 * overrides it. That matters for local development: once the App credentials
 * are present in .env, every save would otherwise commit to the real
 * repository. Set ADMIN_MODE=local to keep writing to the working copy while
 * still having the credentials on hand.
 */
export const MODE: Mode =
	env.ADMIN_MODE === 'local' || env.ADMIN_MODE === 'github'
		? env.ADMIN_MODE
		: env.GH_APP_ID
			? 'github'
			: 'local';
export const IS_LOCAL = MODE === 'local';

/**
 * Absolute path to the Hugo site root (the repo containing content/, layouts/).
 *
 * Defaults to the parent of the working directory: npm runs the admin scripts
 * from admin/, both under `vite dev` and `node build`. A path derived from
 * import.meta.url would be wrong once the code is bundled into build/, which
 * is exactly how the integration tests run it.
 */
export const SITE_ROOT = optional('SITE_ROOT', path.resolve(process.cwd(), '..'));

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
	bootstrapToken: optional('BOOTSTRAP_TOKEN'),
	/**
	 * Lets the Scaleway cron trigger ask the portal to carry out scheduled
	 * publishing; create-container.sh sets both from the same admin/.env value.
	 * Unset means the endpoint does not answer at all.
	 */
	cronToken: optional('CRON_TOKEN'),
};

export const integrations = {
	resendApiKey: optional('RESEND_API_KEY'),
	resendAudienceId: optional('RESEND_AUDIENCE_ID', '276f21cc-de35-468d-8b30-06fc08ad1016'),
	// Tests only: points the client at a stand-in server. Unset in production.
	resendApiUrl: optional('RESEND_API_URL'),
	/**
	 * Litlyx has no API keys for a self-hosted dashboard; what it does accept is
	 * a shareable link, so that is what the "token" is: the link's id, from the
	 * dashboard's Shareable links page. The host is the DASHBOARD
	 * (litlyx.loconsole.eu), not the collector the site reports visits to
	 * (analytics.loconsole.eu), which answers nothing but ingestion.
	 */
	litlyxToken: optional('LITLYX_TOKEN'),
	litlyxSharePassword: optional('LITLYX_SHARE_PASSWORD'),
	litlyxHost: optional('LITLYX_HOST', 'https://litlyx.loconsole.eu'),
	/**
	 * Tests only: when set, the link checker contacts nothing but these hosts
	 * (comma-separated), so a test run never knocks on real websites.
	 */
	linkCheckHosts: optional('LINKCHECK_HOSTS'),
	bingApiKey: optional('BING_API_KEY'),
	indexNowKey: optional('INDEXNOW_KEY'),
	deeplApiKey: optional('DEEPL_API_KEY'),
	// Tests only: points the client at a stand-in server. Unset in production.
	deeplApiUrl: optional('DEEPL_API_URL'),
	siteUrl: optional('SITE_URL', 'https://lorenzo.loconsole.eu'),
	// The site's own form handlers (functions/), pinged for health only. The
	// same URLs static/js/main.js and layouts/blog/single.html post to.
	contactFnUrl: optional('CONTACT_FN_URL', 'https://loconsoleapik19unsn0-contact.functions.fnc.fr-par.scw.cloud'),
	newsletterFnUrl: optional('NEWSLETTER_FN_URL', 'https://loconsoleapik19unsn0-newsletter.functions.fnc.fr-par.scw.cloud')
};
