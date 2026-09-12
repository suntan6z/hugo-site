import { schema as baseSchema, defaultMarkdownParser, MarkdownSerializer, defaultMarkdownSerializer } from 'prosemirror-markdown';
import type { Node as PMNode } from 'prosemirror-model';

/**
 * The bridge between what you see while writing and what is committed.
 *
 * Markdown stays the storage format — Hugo builds it, the corpus is
 * hand-written, and the round-trip test guards it — so the visual editor
 * parses Markdown on the way in and writes it back on the way out. Two
 * settings keep that honest against this corpus:
 *
 *   - bullets are written with "-", the marker every existing list uses;
 *     ProseMirror's default is "*", which would reformat three articles on
 *     their first edit for no reason.
 *   - the body's exact leading and trailing whitespace is put back around the
 *     serialized text: articles start with a blank line before their lead
 *     image, nine files end without a trailing newline, and the serializer
 *     trims both.
 *
 * Anything it cannot represent (raw HTML blocks, shortcodes) survives as
 * literal text, which is exactly how Hugo treats it too.
 *
 * Pure: no DOM, so the suite can round-trip every real article.
 */

export const schema = baseSchema;

const serializer = new MarkdownSerializer(
	{
		...defaultMarkdownSerializer.nodes,
		bullet_list(state, node) {
			state.renderList(node, '  ', () => '- ');
		}
	},
	defaultMarkdownSerializer.marks
);

export const parseMarkdown = (markdown: string): PMNode => defaultMarkdownParser.parse(markdown) as PMNode;

export function serializeMarkdown(doc: PMNode, original = ''): string {
	const body = serializer.serialize(doc).trim();
	if (body === '') return original.trim() === '' ? original : '\n';
	// Whatever whitespace the file opened and closed with is put back exactly:
	// bodies start with a blank line before the lead image, and nine files in
	// the corpus deliberately end without a trailing newline.
	const lead = original.match(/^\s*/)?.[0] ?? '';
	const tail = original.trim() === '' ? '' : (original.match(/\s*$/)?.[0] ?? '');
	return `${lead}${body}${tail}`;
}

/**
 * What this body would become if it went through the editor untouched.
 * The editor uses it to tell a real edit from the round-trip's own tidying,
 * so an article you only looked at is never rewritten.
 */
export const normalize = (markdown: string): string => serializeMarkdown(parseMarkdown(markdown), markdown);
