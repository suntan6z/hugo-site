export const LANGS = ['en', 'fr', 'it'];

/** The value of one query-string parameter, however the platform hands the query over. */
export function queryParam(event, name) {
  const parsed = event?.queryStringParameters;
  if (parsed && typeof parsed === 'object' && name in parsed) return String(parsed[name]);
  const raw = typeof event?.path === 'string' ? event.path : '';
  const at = raw.indexOf('?');
  if (at === -1) return undefined;
  const value = new URLSearchParams(raw.slice(at + 1)).get(name);
  return value === null ? undefined : value;
}

/** A language the site has; anything else is English. */
export const normalizeLang = (value) => (LANGS.includes(value) ? value : 'en');
