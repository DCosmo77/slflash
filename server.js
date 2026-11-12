'use strict';
const express = require('express');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const QRCode = require('qrcode');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const PROD = process.env.NODE_ENV === 'production';
if (!ADMIN_PASSWORD || !SESSION_SECRET) {
  console.error('Set ADMIN_PASSWORD dan SESSION_SECRET di environment variable.');
  process.exit(1);
}

const DATA = path.join(__dirname, 'data');
const UPLOADS = path.join(DATA, 'uploads');
const DB = path.join(DATA, 'cards.json');
const PUBLIC = path.join(__dirname, 'public');   // satu-satunya folder yang bisa diakses publik
const PRIVATE = path.join(__dirname, 'private'); // kode admin: hanya dikirim setelah login
fs.mkdirSync(UPLOADS, { recursive: true });
if (!fs.existsSync(DB)) fs.writeFileSync(DB, '[]');

const readCards = () => JSON.parse(fs.readFileSync(DB, 'utf8'));
const writeCards = c => { fs.writeFileSync(DB + '.tmp', JSON.stringify(c, null, 2)); fs.renameSync(DB + '.tmp', DB); };
const sha = s => crypto.createHash('sha256').update(String(s)).digest();
const safeEq = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'"
  });
  next();
});
app.use(express.json({ limit: '3mb' }));
app.use(session({
  name: 'sid', secret: SESSION_SECRET, resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'strict', secure: PROD, maxAge: 8 * 3600 * 1000 }
}));

/* ---------- Publik ---------- */
app.use('/uploads', express.static(UPLOADS, { maxAge: '7d' }));
app.use(express.static(PUBLIC, { index: false }));
const page = (req, res) => res.sendFile(path.join(PUBLIC, 'index.html'));
app.get('/', page);
app.get('/c/:id', page);                 // <- tujuan QR code
app.get('/api/cards', (req, res) => res.json(readCards()));
app.get('/api/cards/:id', (req, res) => {
  const c = readCards().find(x => x.id === req.params.id);
  c ? res.json(c) : res.status(404).json({ error: 'not_found' });
});

/* ---------- Admin: halaman berbeda tergantung status login ---------- */
const requireAdmin = (req, res, next) =>
  req.session.admin ? next() : res.status(401).json({ error: 'unauthorized' });

app.get('/admin', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(PRIVATE, req.session.admin ? 'admin.html' : 'login.html'));
});
app.post('/admin/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), (req, res) => {
  const { username = '', password = '' } = req.body || {};
  const ok = safeEq(username, ADMIN_USER) & safeEq(password, ADMIN_PASSWORD);
  if (!ok) return res.status(401).json({ error: 'Username atau password salah.' });
  req.session.regenerate(() => { req.session.admin = true; res.json({ ok: true }); });
});
app.post('/admin/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));

/* ---------- Admin API (semua dicek di server) ---------- */
const ID_RE = /^[a-z0-9-]{1,60}$/;
function clean(b) {
  const s = (v, n) => String(v ?? '').trim().slice(0, n);
  return { word: s(b.word, 80), ipa: s(b.ipa, 120).replace(/^\/|\/$/g, ''), meaning: s(b.meaning, 200) };
}
function saveImage(id, dataUrl) {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!m) return null;
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > 2 * 1024 * 1024 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  const name = `${id}-${crypto.randomBytes(4).toString('hex')}.jpg`;
  fs.writeFileSync(path.join(UPLOADS, name), buf);
  return '/uploads/' + name;
}
const rmImage = img => { if (img && img.startsWith('/uploads/')) fs.rm(path.join(UPLOADS, path.basename(img)), { force: true }, () => {}); };

app.post('/api/admin/cards', requireAdmin, (req, res) => {
  const id = String(req.body.id || '');
  const d = clean(req.body);
  if (!ID_RE.test(id) || !d.word) return res.status(400).json({ error: 'ID atau kata tidak valid.' });
  const cards = readCards();
  if (cards.some(c => c.id === id)) return res.status(409).json({ error: 'ID sudah dipakai.' });
  const img = req.body.image ? saveImage(id, req.body.image) : '';
  if (req.body.image && !img) return res.status(400).json({ error: 'Gambar tidak valid (JPEG, maks 2 MB).' });
  cards.push({ id, ...d, img: img || '' });
  writeCards(cards);
  res.json({ ok: true });
});
app.put('/api/admin/cards/:id', requireAdmin, (req, res) => {
  const cards = readCards(), i = cards.findIndex(c => c.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'not_found' });
  const d = clean(req.body);
  if (!d.word) return res.status(400).json({ error: 'Kata wajib diisi.' });
  let img = cards[i].img;
  if (req.body.image) {
    const n = saveImage(cards[i].id, req.body.image);
    if (!n) return res.status(400).json({ error: 'Gambar tidak valid (JPEG, maks 2 MB).' });
    rmImage(img); img = n;
  }
  cards[i] = { id: cards[i].id, ...d, img }; // ID tidak diubah agar QR lama tetap berlaku
  writeCards(cards);
  res.json({ ok: true });
});
app.delete('/api/admin/cards/:id', requireAdmin, (req, res) => {
  const cards = readCards(), c = cards.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'not_found' });
  rmImage(c.img);
  writeCards(cards.filter(x => x !== c));
  res.json({ ok: true });
});
app.get('/api/admin/qr/:id', requireAdmin, async (req, res) => {
  if (!ID_RE.test(req.params.id)) return res.status(400).end();
  const png = await QRCode.toBuffer(`${BASE_URL}/c/${req.params.id}`, { width: 600, margin: 2 });
  res.type('png').send(png);
});

app.listen(PORT, () => console.log(`Berjalan di ${BASE_URL} (port ${PORT})`));
