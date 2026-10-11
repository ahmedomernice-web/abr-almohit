// Shared helpers for the API: private Blob storage + admin auth.
import { get, put, BlobPreconditionFailedError } from '@vercel/blob';
import crypto from 'node:crypto';

const DB_PATH = 'abr/db.json';

const emptyDB = () => ({
  settings: { currency: 'د.ل', phone: '', whatsapp: '', address: '' },
  clients: {},   // CODE -> { name, phone, note, createdAt }
  invoices: [],  // { id, clientCode, type, car, vin, amount, date, note, createdAt }
  payments: [],  // { id, clientCode, method, car, vin, amount, date, note, createdAt }
});

export async function readDB() {
  let r = null;
  try {
    r = await get(DB_PATH, { access: 'private', useCache: false });
  } catch (e) {
    if (e?.name === 'BlobNotFoundError') r = null; else throw e;
  }
  if (!r || r.statusCode !== 200 || !r.stream) return { db: emptyDB(), etag: null };
  const text = await new Response(r.stream).text();
  const parsed = text ? JSON.parse(text) : {};
  return { db: { ...emptyDB(), ...parsed, settings: { ...emptyDB().settings, ...(parsed.settings || {}) } }, etag: r.blob.etag };
}

// Read-modify-write with optimistic concurrency (retries if someone else wrote in between).
export async function mutate(fn) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { db, etag } = await readDB();
    const result = await fn(db);
    try {
      await put(DB_PATH, JSON.stringify(db), {
        access: 'private',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 60,
        ...(etag ? { ifMatch: etag } : {}),
      });
      return result;
    } catch (e) {
      if ((e instanceof BlobPreconditionFailedError || e?.name === 'BlobPreconditionFailedError') && attempt < 3) continue;
      throw e;
    }
  }
}

/* ---------- admin auth: password -> signed token (HMAC) ---------- */
const SECRET = () => process.env.ADMIN_SECRET || '';
const b64u = (buf) => Buffer.from(buf).toString('base64url');

export function checkPassword(pw) {
  const real = process.env.ADMIN_PASSWORD || '';
  if (!real || typeof pw !== 'string') return false;
  const a = crypto.createHash('sha256').update(pw).digest();
  const b = crypto.createHash('sha256').update(real).digest();
  return crypto.timingSafeEqual(a, b);
}

export function issueToken(days = 7) {
  const payload = b64u(JSON.stringify({ exp: Date.now() + days * 864e5 }));
  const sig = b64u(crypto.createHmac('sha256', SECRET()).update(payload).digest());
  return `${payload}.${sig}`;
}

export function verifyToken(token) {
  if (!SECRET() || typeof token !== 'string' || !token.includes('.')) return false;
  const [payload, sig] = token.split('.');
  const expected = b64u(crypto.createHmac('sha256', SECRET()).update(payload).digest());
  const a = Buffer.from(sig || ''), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now(); } catch { return false; }
}

export function isAdminReq(req) {
  const h = req.headers.authorization || '';
  return verifyToken(h.startsWith('Bearer ') ? h.slice(7) : '');
}

/* ---------- http helpers ---------- */
export function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(status).send(JSON.stringify(body));
}

export function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

export const CODE_RE = /^[A-Z0-9-]{3,20}$/;
export const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
