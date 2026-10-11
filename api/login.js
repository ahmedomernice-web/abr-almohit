import { checkPassword, issueToken, send, body, sleep } from './_lib.js';

// Admin sign-in: password -> 7-day token.
export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  if (!process.env.ADMIN_PASSWORD || !process.env.ADMIN_SECRET) return send(res, 500, { error: 'not_configured' });
  if (!checkPassword(body(req).password)) { await sleep(800); return send(res, 401, { error: 'bad_password' }); }
  send(res, 200, { token: issueToken() });
}
