const ALLOWED_ORIGINS = ['https://lorenzo.loconsole.eu', 'http://localhost:1313'];

function requestOrigin(event) {
  return event?.headers?.origin || event?.headers?.Origin || '';
}

/** The caller's own site when it is one of ours, else the production site. */
export function resolveOrigin(event) {
  const origin = requestOrigin(event);
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

/**
 * Whether a browser on one of the site's own pages sent this. Browsers always
 * attach Origin to a cross-origin POST, so a missing or foreign one is a script
 * or another site. It stops casual abuse, not a determined one: Origin can be
 * written by hand, which is what the proof of work and the rate limit are for.
 */
export function isAllowedOrigin(event) {
  return ALLOWED_ORIGINS.includes(requestOrigin(event));
}

export function corsHeaders(event) {
  return {
    'Access-Control-Allow-Origin': resolveOrigin(event),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

export function optionsResponse(event) {
  return { statusCode: 204, headers: corsHeaders(event), body: '' };
}

export function json(event, obj, status, extraHeaders = {}) {
  return {
    statusCode: status,
    headers: { ...corsHeaders(event), 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify(obj),
  };
}
