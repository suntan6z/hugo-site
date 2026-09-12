import type { Lang } from '../langs.ts';

/**
 * The EU co-funding line an Erasmus+ article must carry.
 *
 * It is fixed wording, identical on every Erasmus+ article in each language —
 * all 18 in the corpus agree — so the editor states it rather than offering a
 * text box that can only ever be got wrong. Set automatically when the
 * category is Erasmus+, and removed when it is not.
 */
export const EU_FUNDING_TEXT: Record<Lang, string> = {
	en: 'Co-funded by the European Union under the Erasmus+ programme.',
	fr: "Cofinancé par l'Union européenne dans le cadre du programme Erasmus+.",
	it: "Cofinanziato dall'Unione europea nell'ambito del programma Erasmus+."
};

export const fundingTextFor = (lang: Lang, category: string) =>
	category === 'Erasmus+' ? EU_FUNDING_TEXT[lang] : undefined;
