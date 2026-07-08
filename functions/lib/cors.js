const ALLOWED_ORIGINS = ['https://lorenzo.loconsole.eu', 'http://localhost:1313'];

function resolveOrigin(event) {
  const origin = event?.headers?.origin || event?.headers?.Origin || '';
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

export function corsHeaders(event) {
  return {
    'Access-Control-Allow-Origin': resolveOrigin(event),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

export function optionsResponse(event) {
  return { statusCode: 204, headers: corsHeaders(event), body: '' };
}

export function json(event, obj, status) {
  return {
    statusCode: status,
    headers: { ...corsHeaders(event), 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  };
}
