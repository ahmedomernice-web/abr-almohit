import crypto from 'node:crypto';
import { readDB, mutate, isAdminReq, send, body, CODE_RE, str } from './_lib.js';

// Admin-only actions. Body: { action, ...fields }
export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  if (!isAdminReq(req)) return send(res, 401, { error: 'unauthorized' });
  const b = body(req);
  try {
    switch (b.action) {
      case 'check':
        return send(res, 200, { ok: true });

      case 'data': {
        const { db } = await readDB();
        const clients = Object.entries(db.clients).map(([code, c]) => ({ code, ...c }));
        return send(res, 200, { clients, invoices: db.invoices, payments: db.payments, settings: db.settings });
      }

      case 'saveClient': {
        const code = str(b.code, 20).toUpperCase();
        const name = str(b.name, 120);
        if (!CODE_RE.test(code) || !name) return send(res, 400, { error: 'invalid' });
        const r = await mutate((db) => {
          const exists = !!db.clients[code];
          if (b.isNew && exists) return { error: 'duplicate' };
          if (!b.isNew && !exists) return { error: 'missing' };
          db.clients[code] = {
            name, phone: str(b.phone, 40), note: str(b.note, 300),
            createdAt: exists ? db.clients[code].createdAt : Date.now(),
          };
          return { ok: true };
        });
        return send(res, r.error ? 409 : 200, r);
      }

      case 'deleteClient': {
        const code = str(b.code, 20).toUpperCase();
        await mutate((db) => {
          delete db.clients[code];
          db.invoices = db.invoices.filter((x) => x.clientCode !== code);
          db.payments = db.payments.filter((x) => x.clientCode !== code);
        });
        return send(res, 200, { ok: true });
      }

      case 'addEntry': {
        const kind = b.kind === 'pay' ? 'pay' : 'inv';
        const amount = Math.round(Number(b.amount) * 100) / 100;
        const clientCode = str(b.clientCode, 20).toUpperCase();
        const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : new Date().toISOString().slice(0, 10);
        if (!(amount > 0) || amount > 1e10) return send(res, 400, { error: 'invalid_amount' });
        const r = await mutate((db) => {
          if (!db.clients[clientCode]) return { error: 'missing' };
          const row = {
            id: crypto.randomUUID(), clientCode, amount, date,
            car: str(b.car, 120), vin: str(b.vin, 17).toUpperCase(), note: str(b.note, 300), createdAt: Date.now(),
          };
          if (kind === 'inv') { row.type = str(b.type, 60); db.invoices.push(row); }
          else { row.method = str(b.method, 40); db.payments.push(row); }
          return { ok: true, id: row.id };
        });
        return send(res, r.error ? 409 : 200, r);
      }

      case 'delEntry': {
        const list = b.kind === 'pay' ? 'payments' : 'invoices';
        await mutate((db) => { db[list] = db[list].filter((x) => x.id !== b.id); });
        return send(res, 200, { ok: true });
      }

      case 'saveSettings': {
        const s = {
          currency: str(b.currency, 10) || 'د.ل', phone: str(b.phone, 40),
          whatsapp: str(b.whatsapp, 40), address: str(b.address, 200),
        };
        await mutate((db) => { db.settings = s; });
        return send(res, 200, { ok: true });
      }

      default:
        return send(res, 400, { error: 'unknown_action' });
    }
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: 'server' });
  }
}
