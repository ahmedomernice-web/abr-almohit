import { readDB, send } from './_lib.js';

// Public: company contact details + currency.
export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method' });
  try {
    const { db } = await readDB();
    send(res, 200, db.settings);
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'server' });
  }
}
