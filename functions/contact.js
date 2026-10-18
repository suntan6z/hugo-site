import { isValidEmail } from './lib/validate.js';
import { optionsResponse, json, isAllowedOrigin } from './lib/cors.js';
import { isRateLimited, clientIp } from './lib/rateLimit.js';
import { normalizeLang } from './lib/request.js';
import { wantsChallenge, serveChallenge, isHuman } from './lib/guard.js';

// What the form's <select> values mean, as the email should say them. An
// unknown value (an older or translated page) is passed through as written.
const SUBJECT_LABELS = {
  job: 'Job opportunity',
  collaboration: 'Collaboration',
  feedback: 'Feedback',
  bug: 'Bug report',
  hello: 'Just saying hi',
  other: 'Other',
};

// Generous for real names, small enough that nothing absurd reaches an inbox.
const MAX_NAME = 80;
const MAX_PHONE = 40;
const MAX_SUBJECT = 120;

function validate(body) {
  const errors = [];

  if (typeof body.firstName !== 'string' || body.firstName.trim().length < 1 || body.firstName.trim().length > MAX_NAME) errors.push('firstName');
  if (typeof body.lastName !== 'string' || body.lastName.trim().length < 1 || body.lastName.trim().length > MAX_NAME) errors.push('lastName');

  if (!isValidEmail(body.email)) errors.push('email');

  if (typeof body.subject !== 'string' || body.subject.trim() === '' || body.subject.trim().length > MAX_SUBJECT) errors.push('subject');

  if (typeof body.phone === 'string' && body.phone.trim().length > MAX_PHONE) errors.push('phone');

  const message = typeof body.message === 'string' ? body.message : '';
  if (message.length < 50 || message.length > 500) errors.push('message');

  return errors;
}

/**
 * The subject line the email shows. "Other" carries the sender's own
 * description (the page requires it); a page that predates that field sends
 * none, and gets the plain label rather than a refusal.
 */
export function subjectLine(subject, customSubject) {
  const key = String(subject).trim();
  if (key === 'other') {
    const custom = typeof customSubject === 'string' ? customSubject.trim().slice(0, MAX_SUBJECT) : '';
    return custom || SUBJECT_LABELS.other;
  }
  return SUBJECT_LABELS[key] ?? key;
}

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

export async function handle(event) {
  if (event.httpMethod === 'OPTIONS') return optionsResponse(event);
  if (wantsChallenge(event)) return serveChallenge(event);
  if (event.httpMethod !== 'POST') return json(event, { error: 'Method not allowed' }, 405);

  if (!isAllowedOrigin(event)) return json(event, { error: 'Forbidden' }, 403);

  if (isRateLimited(clientIp(event))) {
    return json(event, { error: 'Too many requests' }, 429);
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(event, { error: 'Invalid JSON' }, 400);
  }

  // Honeypot: a hidden field on the contact page that people never see, so
  // anything in it is a bot. Answer "ok" so the bot learns nothing.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return json(event, { ok: true }, 200);
  }

  const errors = validate(body);
  if (errors.length) return json(event, { error: 'Validation failed', fields: errors }, 400);

  // After the cheap checks, so a typo in the form does not spend the visitor's
  // solution: each one works once.
  if (!(await isHuman(body.altcha))) return json(event, { error: 'Verification failed', code: 'altcha' }, 400);

  const firstName = String(body.firstName).trim();
  const lastName = String(body.lastName).trim();
  const email = String(body.email).trim();
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const subject = subjectLine(body.subject, body.customSubject);
  const message = String(body.message).trim();

  // Values are pre-escaped with esc() because the `contact-form-notification`
  // Resend template inserts these variables with raw triple-brace `{{{ }}}`
  // (no auto-escaping). If that template is ever switched to double-brace
  // `{{ }}` (auto-escaped), drop esc() here or values will double-escape.
  const notificationRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'New Form Submission <contact@loconsole.eu>',
      to: ['contact@loconsole.eu'],
      reply_to: email,
      template: {
        id: 'contact-form-notification',
        variables: {
          first_name: esc(firstName),
          last_name: esc(lastName),
          email: esc(email),
          phone: phone ? esc(phone) : '—',
          subject: esc(subject),
          message: esc(message),
        },
      },
    }),
  });

  if (!notificationRes.ok) {
    // Scaleway keeps stdout/stderr; without this a failed send leaves no trace.
    console.error(`contact: Resend notification failed (${notificationRes.status})`);
    return json(event, { error: 'Email send failed' }, 502);
  }

  // Best-effort: the submitter's confirmation email is a nice-to-have —
  // don't fail the whole request if only this part errors.
  //
  // Values here are passed RAW (not esc()'d): the `form-confirmation-<lang>`
  // templates uses double-brace `{{ }}`, which auto-escapes. Pre-escaping would
  // double-escape. This is the opposite of the notification send above — each
  // path is matched to its template's brace style.
  // One template per language, chosen by the page the form was sent from.
  const lang = normalizeLang(body.lang);
  const name = `${firstName} ${lastName}`;
  const messagePreview = message.slice(0, 150) + (message.length > 150 ? '...' : '');
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Lorenzo Loconsole (Form submission) <contact@loconsole.eu>',
      to: [email],
      template: { id: `form-confirmation-${lang}`, variables: { name, subject, message_preview: messagePreview } },
    }),
  })
    .then((r) => {
      if (!r.ok) console.error(`contact: Resend confirmation failed (${r.status})`);
    })
    .catch((e) => console.error('contact: Resend confirmation failed', e?.message));

  return json(event, { ok: true }, 200);
}
