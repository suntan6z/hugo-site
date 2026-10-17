/**
 * Reads every page of a cursor-paginated list.
 *
 * Resend's list endpoints return 20 rows unless asked for more, up to 100, and
 * say whether there are further pages (`has_more`) and which row to continue
 * after. A reader that takes the first page quietly drops everyone past it, and
 * a subscriber count that is wrong without saying so is worse than none.
 *
 * Stops when the service says there is no more, when a page brings nothing new
 * (a service that ignores the cursor would otherwise repeat the same page
 * forever), or after `maxPages`. Free of SvelteKit imports so the suite can
 * drive it directly.
 */
export interface Page<T> {
	data: T[];
	has_more?: boolean;
}

export async function readAll<T extends { id?: string }>(
	fetchPage: (after: string | undefined) => Promise<Page<T>>,
	maxPages = 50
): Promise<T[]> {
	const out: T[] = [];
	const seen = new Set<string>();
	let after: string | undefined;
	for (let i = 0; i < maxPages; i++) {
		const page = await fetchPage(after);
		const fresh = page.data.filter((row) => !row.id || !seen.has(row.id));
		for (const row of fresh) {
			if (row.id) seen.add(row.id);
			out.push(row);
		}
		const last = page.data[page.data.length - 1]?.id;
		if (!page.has_more || !last || fresh.length === 0) break;
		after = last;
	}
	return out;
}
