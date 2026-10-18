// What both forms share before they do any work: handing out the proof-of-work
// challenge and checking that a submission solved one.
import { json } from './cors.js';
import { createChallenge, verifyPayload } from './altcha.js';
import { queryParam } from './request.js';

const NO_STORE = { 'Cache-Control': 'no-store' };

/** Whether this GET is the widget asking for a challenge (`?challenge=1`). */
export const wantsChallenge = (event) => event.httpMethod === 'GET' && queryParam(event, 'challenge') !== undefined;

/** The challenge, or a 503 when ALTCHA_SECRET was never set on the namespace. */
export function serveChallenge(event) {
  const secret = process.env.ALTCHA_SECRET;
  if (!secret) {
    console.error('ALTCHA_SECRET is not set: the form cannot hand out challenges');
    return json(event, { error: 'Not configured' }, 503, NO_STORE);
  }
  return json(event, createChallenge({ secret }), 200, NO_STORE);
}

/** True when `payload` is a fresh, correct solution to a challenge this server issued. */
export async function isHuman(payload) {
  const secret = process.env.ALTCHA_SECRET;
  if (!secret) {
    console.error('ALTCHA_SECRET is not set: every submission is refused');
    return false;
  }
  return verifyPayload(payload, { secret });
}
