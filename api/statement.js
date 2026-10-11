import { readDB, send, body, CODE_RE, sleep } from './_lib.js';

// Public: one client's statement, looked up by their exact code. Never lists clients.
export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  const code = String(body(req).code || '').trim().toUpperCase();
  if (!CODE_RE.test(code)) { await sleep(400); return send(res, 404, { error: 'not_found' }); }
  try {
    const { db } = await readDB();
    const c = db.clients[code];
    if (!c) { await sleep(400); return send(res, 404, { error: 'not_found' }); }
    const strip = ({ clientCode, ...r }) => r;
    send(res, 200, {
      code,
      name: c.name,
      invoices: db.invoices.filter((x) => x.clientCode === code).map(strip),
      payments: db.payments.filter((x) => x.clientCode === code).map(strip),
    });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'server' });
  }
}
