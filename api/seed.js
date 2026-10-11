// Temporary: adds one demo client. Works only while SEED_KEY is set. Remove after use.
import crypto from 'node:crypto';
import { mutate, send } from './_lib.js';

export default async function handler(req, res) {
  const key = process.env.SEED_KEY;
  if (!key || req.query.key !== key) return send(res, 404, { error: 'not_found' });
  const CODE = 'DEMO-1001';
  const r = await mutate((db) => {
    if (db.clients[CODE]) return { ok: true, existed: true };
    const now = Date.now();
    db.clients[CODE] = { name: 'عميل تجريبي', phone: '0910000000', note: 'حساب تجريبي للعرض — يُحذف لاحقاً', createdAt: now };
    const car = 'تويوتا كامري 2021 (مثال)';
    const vin = '4T1B11HK5MU000000';
    const inv = (type, amount, date, note) => ({ id: crypto.randomUUID(), clientCode: CODE, type, car, vin, amount, date, note, createdAt: now });
    const pay = (method, amount, date, note) => ({ id: crypto.randomUUID(), clientCode: CODE, method, car, vin, amount, date, note, createdAt: now });
    db.invoices.push(
      inv('ثمن السيارة', 42000, '2026-08-04', 'مزاد Copart'),
      inv('رسوم المزاد', 1800, '2026-08-04', ''),
      inv('النقل الداخلي في أمريكا', 1200, '2026-08-09', 'من تكساس لميناء هيوستن'),
      inv('الشحن البحري', 6500, '2026-08-20', 'هيوستن ← مصراتة'),
      inv('التخليص الجمركي', 3800, '2026-09-28', ''),
    );
    db.payments.push(
      pay('نقداً', 30000, '2026-08-05', 'دفعة أولى'),
      pay('تحويل مصرفي', 12000, '2026-09-10', ''),
    );
    return { ok: true, created: true };
  });
  send(res, 200, r);
}
