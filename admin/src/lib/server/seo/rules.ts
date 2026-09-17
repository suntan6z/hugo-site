/**
 * Pre-publish checks.
 *
 * Thresholds are calibrated against the existing corpus rather than taken from
 * SEO folklore: across the 13 posts, descriptions run 126-158 characters with
 * two short outliers, the longest title is 63, every one of the 18 body images
 * already has alt text, and every `slug` matches its folder. So these rules
 * flag three real issues today rather than lighting up everything — a check
 * that fires on every post is noise, and gets ignored.
 *
 * Free of SvelteKit imports so the suite can drive it directly.
 */

export type Severity = 'error' | 'warning';

export interface Finding {
	id: string;
	severity: Severity;
	message: string;
	/** Set when the problem belongs to one language's file. */
	lang?: string;
}

export interface CheckableTranslation {
	lang: string;
	exists: boolean;
	title: string;
	description: string;
	body: string;
	untranslated: boolean;
}

export interface CheckablePost {
	slug: string;
	/** The bundle folder name, which must match `slug`. */
	folder: string;
	date: string;
	category: string;
	draft: boolean;
	featuredImage?: string;
	partnerName?: string;
	partnerUrl?: string;
	partnerLogo?: string;
	/** Files present in the bundle (images and Markdown). */
	bundleFiles: string[];
	translations: CheckableTranslation[];
	/** Every known post slug, for internal-link checking. */
	knownSlugs: string[];
	knownGalleryCities: string[];
}

export const DESCRIPTION_MIN = 120;
export const DESCRIPTION_MAX = 160;
export const TITLE_MAX = 60;
const VALID_CATEGORIES = ['Technology', 'Cybersecurity', 'Personal', 'Erasmus+'];
const IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const LINK_RE = /(?<!!)\[[^\]]*\]\((\/[^)\s]+)\)/g;

const isExternal = (u: string) => /^(https?:)?\/\//.test(u) || u.startsWith('mailto:');

export function checkPost(post: CheckablePost, today = new Date()): Finding[] {
	const out: Finding[] = [];
	const add = (id: string, severity: Severity, message: string, lang?: string) =>
		out.push({ id, severity, message, lang });

	/* ---- structural: these make the post wrong or invisible ---- */

	if (post.slug !== post.folder) {
		add(
			'slug-mismatch',
			'error',
			`Front matter says slug "${post.slug}" but the folder is "${post.folder}". Hugo uses the folder, so links built from the slug will 404.`
		);
	}

	if (!/^\d{4}-\d{2}-\d{2}$/.test(post.date)) {
		add('date-format', 'error', `Date "${post.date}" is not YYYY-MM-DD.`);
	} else if (post.date > today.toISOString().slice(0, 10)) {
		add(
			'future-date',
			'error',
			`Dated ${post.date}, in the future. Hugo excludes future-dated content, so this would publish as an invisible page.`
		);
	}

	if (!VALID_CATEGORIES.includes(post.category)) {
		add(
			'bad-category',
			'error',
			`"${post.category}" is not one of the four categories. The blog filter and the localised label both key off this exact value, so the badge would render empty.`
		);
	}

	if (post.category === 'Erasmus+') {
		if (!post.partnerName || !post.partnerUrl) {
			add(
				'erasmus-partner',
				'warning',
				'Erasmus+ posts show a partner strip, which needs partner_name and partner_url.'
			);
		}
		if (post.partnerLogo && !post.bundleFiles.includes(post.partnerLogo)) {
			add('partner-logo-missing', 'error', `partner_logo_url "${post.partnerLogo}" is not in the bundle.`);
		}
	}

	if (post.featuredImage && !post.bundleFiles.includes(post.featuredImage)) {
		add('featured-missing', 'error', `featured_image "${post.featuredImage}" is not in the bundle.`);
	}

	/* ---- per language ---- */

	for (const t of post.translations) {
		if (!t.exists || t.untranslated) continue;
		const L = t.lang;

		if (!t.title.trim()) add('no-title', 'error', 'Title is empty.', L);
		else if (t.title.length > TITLE_MAX) {
			add(
				'title-long',
				'warning',
				`Title is ${t.title.length} characters; search results truncate around ${TITLE_MAX}.`,
				L
			);
		}

		const d = t.description.trim();
		if (!d) {
			add(
				'no-description',
				'error',
				'Description is empty. It is the meta description, the card text and the social preview.',
				L
			);
		} else if (d.length < DESCRIPTION_MIN || d.length > DESCRIPTION_MAX) {
			add(
				'description-length',
				'warning',
				`Description is ${d.length} characters; ${DESCRIPTION_MIN}-${DESCRIPTION_MAX} reads best in search results.`,
				L
			);
		}

		if (!t.body.trim()) add('empty-body', 'error', 'Body is empty.', L);

		// Images: alt text feeds both screen readers and the render hook.
		for (const m of t.body.matchAll(IMAGE_RE)) {
			const [, alt, src] = m;
			if (!alt.trim()) {
				add('image-no-alt', 'error', `Image "${src}" has no alt text.`, L);
			}
			if (!isExternal(src) && !src.startsWith('/') && !post.bundleFiles.includes(src)) {
				add(
					'image-missing',
					'error',
					`Image "${src}" is not in the bundle, so it will render broken.`,
					L
				);
			}
		}

		// Internal links, checked against what actually exists.
		for (const m of t.body.matchAll(LINK_RE)) {
			const href = m[1];
			const blog = /^\/(?:en\/|fr\/|it\/)?blog\/([^/#?]+)\/?/.exec(href);
			if (blog && !post.knownSlugs.includes(blog[1])) {
				add('broken-link', 'error', `Links to /blog/${blog[1]}/, which does not exist.`, L);
			}
			const gal = /^\/(?:en\/|fr\/|it\/)?gallery\/([^/#?]+)\/?/.exec(href);
			if (gal && !post.knownGalleryCities.includes(gal[1])) {
				add('broken-link', 'error', `Links to /gallery/${gal[1]}/, which does not exist.`, L);
			}
		}
	}

	return out;
}

export const errorsIn = (f: Finding[]) => f.filter((x) => x.severity === 'error');
export const warningsIn = (f: Finding[]) => f.filter((x) => x.severity === 'warning');
