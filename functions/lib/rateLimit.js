const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 3;

// Per-instance in-memory limiter. Scaleway scales to zero on idle, so this
// resets on cold start — weaker than it was on Supabase, but still blunts
// rapid-fire abuse within a warm instance.
const ipRequests = new Map();

export function isRateLimited(ip) {
  const now = Date.now();
  const entry = ipRequests.get(ip);

  if (!entry || now >= entry.resetAt) {
    ipRequests.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count += 1;
  return entry.count > MAX_REQUESTS_PER_WINDOW;
}

export function clientIp(event) {
  const forwarded = event?.headers?.['x-forwarded-for'] || event?.headers?.['X-Forwarded-For'] || '';
  return forwarded.split(',')[0].trim() || 'unknown';
}
