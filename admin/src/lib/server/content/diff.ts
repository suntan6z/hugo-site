/**
 * A small line diff, so a save can be reviewed before it becomes a commit.
 *
 * Publishing writes several files at once — three languages, images, a
 * deletion or two — and until now that was invisible until it was already in
 * git history. This turns it into something readable first.
 *
 * Pure, and deliberately modest: enough to show what changed in files that are
 * tens of lines long, not a general-purpose diff library.
 */

export type Change =
	| { kind: 'same'; line: string }
	| { kind: 'add'; line: string }
	| { kind: 'remove'; line: string };

export interface Hunk {
	/** 1-based line number in the new file where this hunk starts. */
	at: number;
	changes: Change[];
}

export interface FileChange {
	path: string;
	status: 'added' | 'modified' | 'deleted' | 'unchanged';
	added: number;
	removed: number;
	hunks: Hunk[];
	/** Set for binary files (images), where a line diff means nothing. */
	bytes?: number;
	/** Set when the file arrived by being moved, as a rename does. */
	movedFrom?: string;
	tooBig?: boolean;
}

const MAX_LINES = 4000;

/** Longest common subsequence over lines, then walked back into a change list. */
export function diffLines(before: string, after: string): Change[] {
	const a = before === '' ? [] : before.split('\n');
	const b = after === '' ? [] : after.split('\n');

	// Trim the common head and tail first: near-identical files then cost almost
	// nothing, which is the normal case here.
	let head = 0;
	while (head < a.length && head < b.length && a[head] === b[head]) head++;
	let tail = 0;
	while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;

	const midA = a.slice(head, a.length - tail);
	const midB = b.slice(head, b.length - tail);

	const out: Change[] = a.slice(0, head).map((line) => ({ kind: 'same', line }) as Change);

	if (midA.length && midB.length) {
		const n = midA.length, m = midB.length;
		const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
		for (let i = n - 1; i >= 0; i--) {
			for (let j = m - 1; j >= 0; j--) {
				lcs[i][j] = midA[i] === midB[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
			}
		}
		let i = 0, j = 0;
		while (i < n && j < m) {
			if (midA[i] === midB[j]) {
				out.push({ kind: 'same', line: midA[i++] });
				j++;
			} else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
				out.push({ kind: 'remove', line: midA[i++] });
			} else {
				out.push({ kind: 'add', line: midB[j++] });
			}
		}
		while (i < n) out.push({ kind: 'remove', line: midA[i++] });
		while (j < m) out.push({ kind: 'add', line: midB[j++] });
	} else {
		for (const line of midA) out.push({ kind: 'remove', line });
		for (const line of midB) out.push({ kind: 'add', line });
	}

	for (const line of a.slice(a.length - tail)) out.push({ kind: 'same', line });
	return out;
}

/** Groups changes into hunks with a little context, dropping long runs of sameness. */
export function hunksOf(changes: Change[], context = 2): Hunk[] {
	const hunks: Hunk[] = [];
	let cur: Hunk | null = null;
	let newLine = 0;
	let sinceChange = 0;
	const pending: { change: Change; at: number }[] = [];

	for (const c of changes) {
		if (c.kind !== 'remove') newLine++;
		if (c.kind === 'same') {
			if (cur) {
				if (sinceChange < context) cur.changes.push(c);
				sinceChange++;
				if (sinceChange >= context) cur = null;
			}
			pending.push({ change: c, at: newLine });
			if (pending.length > context) pending.shift();
			continue;
		}
		if (!cur) {
			const lead = pending.slice(-context);
			cur = { at: lead.length ? lead[0].at : newLine, changes: lead.map((p) => p.change) };
			hunks.push(cur);
		}
		cur.changes.push(c);
		sinceChange = 0;
		pending.length = 0;
	}
	return hunks;
}

export function fileChange(path: string, before: string | null, after: string | null): FileChange {
	if (after === null) {
		return { path, status: 'deleted', added: 0, removed: before ? before.split('\n').length : 0, hunks: [] };
	}
	if (before === after) return { path, status: 'unchanged', added: 0, removed: 0, hunks: [] };

	const lines = (before ?? '').split('\n').length + after.split('\n').length;
	if (lines > MAX_LINES) {
		return { path, status: before === null ? 'added' : 'modified', added: 0, removed: 0, hunks: [], tooBig: true };
	}
	const changes = diffLines(before ?? '', after);
	return {
		path,
		status: before === null ? 'added' : 'modified',
		added: changes.filter((c) => c.kind === 'add').length,
		removed: changes.filter((c) => c.kind === 'remove').length,
		hunks: hunksOf(changes)
	};
}
