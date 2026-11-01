const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const app = express();
const PORT = process.env.PORT || 3000;
const DATA = path.join(__dirname, 'data');
const PRODUCTS = path.join(DATA, 'products.json');
const ORDERS = path.join(DATA, 'orders.json');
fs.mkdirSync(DATA, { recursive: true });
if (!fs.existsSync(ORDERS)) fs.writeFileSync(ORDERS, '[]');
const read = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/products', (_req, res) => res.json(read(PRODUCTS, [])));
app.post('/api/orders', (req, res) => {
  const { customer, phone, address, items, note } = req.body || {};
  if (!customer?.trim() || !/^\+?[0-9 ()-]{8,18}$/.test(phone || '') || !address?.trim() || !Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Мэдээллээ бүрэн, зөв оруулна уу.' });
  const products = read(PRODUCTS, []);
  const cleanItems = [];
  for (const item of items) {
    const p = products.find(x => x.id === item.id);
    const qty = Math.max(0, Math.min(20, Math.floor(Number(item.quantity) || 0)));
    if (!p || !qty || p.stock < qty) return res.status(400).json({ error: `${p?.name || 'Бараа'}-ны үлдэгдэл хүрэлцэхгүй байна.` });
    cleanItems.push({ id: p.id, name: p.name, price: p.price, quantity: qty });
  }
  const total = cleanItems.reduce((sum, x) => sum + x.price * x.quantity, 0);
  const orders = read(ORDERS, []);
  const order = { id: crypto.randomUUID().slice(0, 8).toUpperCase(), customer: customer.trim(), phone: phone.trim(), address: address.trim(), note: String(note || '').slice(0, 500), items: cleanItems, total, status: 'Шинэ', createdAt: new Date().toISOString() };
  orders.unshift(order); write(ORDERS, orders);
  res.status(201).json({ message: 'Захиалга амжилттай бүртгэгдлээ.', orderId: order.id });
});
function admin(req, res, next) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return res.status(503).json({ error: 'ADMIN_PASSWORD тохируулаагүй байна.' });
  if (req.get('x-admin-password') !== expected) return res.status(401).json({ error: 'Нууц үг буруу байна.' });
  next();
}
app.get('/api/admin/orders', admin, (_req, res) => res.json(read(ORDERS, [])));
app.patch('/api/admin/orders/:id', admin, (req, res) => {
  const allowed = ['Шинэ', 'Баталгаажсан', 'Хүргэлтэд гарсан', 'Хүргэгдсэн', 'Цуцалсан'];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: 'Төлөв буруу байна.' });
  const orders = read(ORDERS, []); const order = orders.find(x => x.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Захиалга олдсонгүй.' });
  order.status = req.body.status; write(ORDERS, orders); res.json(order);
});
app.get('/health', (_req, res) => res.json({ ok: true }));
app.listen(PORT, () => console.log(`BIKE SHOP running on ${PORT}`));
