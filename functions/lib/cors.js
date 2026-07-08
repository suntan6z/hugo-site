export function corsHeaders() {
  const allowedOrigin = process.env.ALLOWED_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

export function optionsResponse() {
  return { statusCode: 204, headers: corsHeaders(), body: '' };
}

export function json(obj, status) {
  return {
    statusCode: status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  };
}
