/**
 * The activity log, in words a person would use.
 *
 * The portal records each action under a short code (`rename-post`,
 * `i18n-save`) with a few facts. Nobody should have to learn the codes to read
 * what happened, so this turns an entry into one sentence and files it under a
 * handful of headings for the filter. Pure, so the Activity page, Settings and
 * the tests all read an entry the same way.
 */

export interface Entry {
	at: string;
	event: string;
	[k: string]: unknown;
}

export type Group = 'writing' | 'newsletter' | 'site' | 'security' | 'checks';

export const GROUPS: { id: Group; label: string }[] = [
	{ id: 'writing', label: 'Articles and pages' },
	{ id: 'newsletter', label: 'Newsletter' },
	{ id: 'site', label: 'Site settings and pictures' },
	{ id: 'security', label: 'Sign-ins' },
	{ id: 'checks', label: 'Automatic checks' }
];

const GROUP_OF: Record<string, Group> = {
	'create-post': 'writing', save: 'writing', publish: 'writing', schedule: 'writing', unschedule: 'writing',
	'scheduled-publish': 'writing', 'scheduled-publish-failed': 'writing', 'rename-post': 'writing', 'delete-post': 'writing',
	'preview-shared': 'writing', 'preview-revoked': 'writing', 'page-save': 'writing', translate: 'writing',
	'focus-finish': 'writing', 'focus-discard': 'writing',
	'newsletter-test': 'newsletter', 'newsletter-sent': 'newsletter', 'newsletter-scheduled': 'newsletter',
	'newsletter-schedule-cancelled': 'newsletter', 'scheduled-announce-failed': 'newsletter',
	'subscriber-removed': 'newsletter', 'subscriber-language': 'newsletter', 'subscribers-exported': 'newsletter',
	'gallery-add-city': 'site', 'gallery-save': 'site', 'gallery-remove-city': 'site', 'i18n-save': 'site', 'nav-save': 'site',
	'socials-save': 'site', 'site-text-save': 'site', 'hero-replace': 'site', 'resume-replace': 'site',
	'image-deleted': 'site', 'image-replaced': 'site', 'redirect-add': 'site', 'redirect-remove': 'site', 'redirect-retarget': 'site',
	login: 'security', 'login-failed': 'security', 'passkey-enrolled': 'security', 'passkey-removed': 'security',
	'sign-out-everywhere': 'security',
	'link-check': 'checks', 'health-check': 'checks', 'indexnow-submit': 'checks'
};

export const groupOf = (event: string): Group => GROUP_OF[event] ?? 'site';

const LANG: Record<string, string> = { en: 'English', fr: 'French', it: 'Italian' };
const PAGE: Record<string, string> = { about: 'About', now: 'Now', contact: 'Contact', 'privacy-policy': 'Privacy policy' };

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const sentence = (event: string) => {
	const s = event.replace(/-/g, ' ');
	return s[0].toUpperCase() + s.slice(1);
};

/** A day and time in Paris, as the portal always shows scheduled times. */
function when(iso: unknown): string {
	const d = new Date(str(iso));
	if (Number.isNaN(d.getTime())) return '';
	return d.toLocaleString('en-GB', { timeZone: 'Europe/Paris', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * One sentence for one entry. `titles` maps an article's address to its title,
 * so the sentence names the article rather than its address.
 */
export function describe(e: Entry, titles: Record<string, string> = {}): string {
	const slug = str(e.slug);
	const article = slug ? `“${titles[slug] ?? slug.replace(/-/g, ' ')}”` : 'an article';
	switch (e.event) {
		case 'login': return 'Signed in';
		case 'login-failed': return 'A sign-in attempt failed';
		case 'passkey-enrolled': return `Added a passkey${str(e.credential) ? ` (${str(e.credential)})` : ''}`;
		case 'passkey-removed': return 'Removed a passkey';
		case 'sign-out-everywhere': return 'Signed out of every device';

		case 'create-post': return `Started the article ${article}`;
		case 'save': return `Saved ${article}`;
		case 'publish': return `Published ${article}`;
		case 'schedule': return `Scheduled ${article} for ${when(e.goesLiveAt) || 'a later morning'}${e.newsletter ? ', with the newsletter' : ''}`;
		case 'unschedule': return `Cancelled the schedule for ${article}`;
		case 'scheduled-publish': return `${article} went live as scheduled`;
		case 'scheduled-publish-failed': return `Publishing ${article} on schedule failed`;
		case 'rename-post': {
			const from = str(e.from), to = str(e.to);
			return titles[to] ? `Changed the web address of “${titles[to]}”` : `Moved “${from}” to a new address, “${to}”`;
		}
		case 'delete-post': return `Deleted ${article}`;
		case 'preview-shared': return `Shared a preview link for ${article}`;
		case 'preview-revoked': return `Stopped sharing ${article}`;
		case 'page-save': return `Updated the ${PAGE[slug] ?? slug} page`;
		case 'translate': {
			const to = LANG[str(e.to)] ?? 'another language';
			return slug ? `Machine-translated ${PAGE[slug] ? `the ${PAGE[slug]} page` : article} into ${to}` : `Machine-translated a text into ${to}`;
		}
		case 'focus-finish': return `Finished a quick-edit session (${plural(num(e.edits), 'change')})`;
		case 'focus-discard': return `Discarded a quick-edit session (${plural(num(e.edits), 'change')})`;

		case 'newsletter-test': return `Sent a test newsletter${slug ? ` of ${article}` : ''}${LANG[str(e.lang)] ? ` in ${LANG[str(e.lang)]}` : ''}`;
		case 'newsletter-sent': return `Sent the newsletter${str(e.subject) ? ` “${str(e.subject)}”` : ''}${e.scheduled ? ' as scheduled' : ''}`;
		case 'newsletter-scheduled': return `Scheduled the newsletter for ${article}${str(e.day) ? ` on ${str(e.day)}` : ''}`;
		case 'newsletter-schedule-cancelled': return `Cancelled the scheduled newsletter for ${article}`;
		case 'scheduled-announce-failed': return `Sending the scheduled newsletter for ${article} failed`;
		case 'subscriber-removed': return 'Removed a subscriber';
		case 'subscriber-language': return `Moved a subscriber from ${LANG[str(e.from)] ?? 'one list'} to ${LANG[str(e.to)] ?? 'another'}`;
		case 'subscribers-exported': return `Downloaded the subscriber list (${plural(num(e.count), 'person', 'people')})`;

		case 'gallery-add-city': return `Added the city “${slug.replace(/-/g, ' ')}” to the gallery`;
		case 'gallery-save': {
			const bits = [num(e.added) ? `${num(e.added)} added` : '', num(e.removed) ? `${num(e.removed)} removed` : ''].filter(Boolean);
			return `Updated the ${slug.replace(/-/g, ' ')} photos${bits.length ? ` (${bits.join(', ')})` : ''}`;
		}
		case 'gallery-remove-city': return `Removed the city “${slug.replace(/-/g, ' ')}” from the gallery`;
		case 'i18n-save': return `Changed the site's wording${str(e.newKey) ? ` (added “${str(e.newKey)}”)` : ''}`;
		case 'nav-save': return 'Changed the site name or menu';
		case 'socials-save': return 'Updated the social links';
		case 'site-text-save': return 'Changed the homepage text';
		case 'hero-replace': return 'Replaced the homepage photo';
		case 'resume-replace': return 'Replaced the CV';
		case 'image-deleted': return `Deleted a picture${str(e.path) ? ` (${str(e.path).split('/').pop()})` : ''}`;
		case 'image-replaced': return `Replaced a picture${str(e.path) ? ` (${str(e.path).split('/').pop()})` : ''}`;
		case 'redirect-add': return 'Added a redirect from an old address';
		case 'redirect-remove': return 'Removed a redirect';
		case 'redirect-retarget': return 'Pointed an old address somewhere else';

		case 'link-check': return `Checked the links to other sites: ${num(e.checked)} checked, ${num(e.dead) ? `${num(e.dead)} broken` : 'none broken'}`;
		case 'health-check': return num(e.problems) ? `Checked the site: ${plural(num(e.problems), 'problem')} found` : 'Checked the site: all well';
		case 'indexnow-submit': return e.ok === false ? 'Could not tell search engines about new pages' : 'Told search engines about new pages';
		default: return sentence(e.event);
	}
}
