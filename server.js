require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { Pool } = require('pg');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');
const STORAGE_DIR = path.resolve(__dirname, process.env.STORAGE_DIR || './storage');
const MAX_UPLOAD_MB = Math.max(1, Number(process.env.MAX_UPLOAD_MB || 50));
const JWT_SECRET = process.env.JWT_SECRET || '';
const DATABASE_URL = process.env.DATABASE_URL || '';

if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
if (JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
fs.mkdirSync(STORAGE_DIR, { recursive: true });

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000
});

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }));
app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 240, standardHeaders: true, legacyHeaders: false }));

function now() { return new Date().toISOString(); }
function normalizeEmail(v) { return String(v || '').trim().toLowerCase(); }
function cleanText(v, max = 500) { return String(v || '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max); }
function refCode(name) {
  const base = cleanText(name, 20).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'VYRO';
  return `${base}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}
function safeUser(row) {
  return { id: row.id, name: row.name, email: row.email, role: row.role, refCode: row.ref_code, referredBy: row.referred_by, balancePending: Number(row.balance_pending || 0), balanceApproved: Number(row.balance_approved || 0), createdAt: row.created_at };
}
function signToken(user) { return jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d', issuer: 'vyro-store' }); }
async function auth(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Bearer ')) return res.status(401).json({ error: 'Phiên truy cập không hợp lệ.' });
    const payload = jwt.verify(h.slice(7), JWT_SECRET, { issuer: 'vyro-store' });
    const { rows } = await pool.query('SELECT * FROM users WHERE id=$1 AND active=true', [payload.sub]);
    if (!rows[0]) return res.status(401).json({ error: 'Tài khoản không còn hiệu lực.' });
    req.user = rows[0]; next();
  } catch { return res.status(401).json({ error: 'Phiên truy cập đã hết hạn.' }); }
}
function adminOnly(req, res, next) { if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Restricted area.' }); next(); }

const allowedExt = new Set(['.zip','.pdf','.ex5','.mq5','.txt','.mp4','.jpg','.jpeg','.png']);
const upload = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, STORAGE_DIR),
    filename: (_, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}_${crypto.randomBytes(8).toString('hex')}${ext}`);
    }
  }),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  fileFilter: (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedExt.has(ext)) return cb(new Error('Định dạng file không được phép.'));
    cb(null, true);
  }
});

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'partner',
      ref_code VARCHAR(30) UNIQUE NOT NULL,
      referred_by VARCHAR(30),
      balance_pending BIGINT NOT NULL DEFAULT 0,
      balance_approved BIGINT NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS products (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(180) NOT NULL,
      category VARCHAR(80) NOT NULL,
      price BIGINT NOT NULL DEFAULT 0,
      commission_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
      icon VARCHAR(20) DEFAULT '📦',
      badge VARCHAR(80) DEFAULT 'VYRO',
      summary TEXT DEFAULT '',
      benefits JSONB NOT NULL DEFAULT '[]'::jsonb,
      is_free BOOLEAN NOT NULL DEFAULT FALSE,
      download_file TEXT,
      download_name TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS orders (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id),
      product_id BIGINT NOT NULL REFERENCES products(id),
      product_name VARCHAR(180) NOT NULL,
      amount BIGINT NOT NULL DEFAULT 0,
      status VARCHAR(30) NOT NULL,
      payment_note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS commissions (
      id BIGSERIAL PRIMARY KEY,
      order_id BIGINT UNIQUE NOT NULL REFERENCES orders(id),
      partner_id BIGINT NOT NULL REFERENCES users(id),
      buyer_id BIGINT NOT NULL REFERENCES users(id),
      product_id BIGINT NOT NULL REFERENCES products(id),
      product_name VARCHAR(180) NOT NULL,
      rate NUMERIC(5,2) NOT NULL,
      amount BIGINT NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS withdrawals (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id),
      amount BIGINT NOT NULL,
      method VARCHAR(80) NOT NULL,
      account TEXT NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ
    );
  `);
  const adminEmail = normalizeEmail(process.env.ADMIN_EMAIL || 'admin@vyrolab.cloud');
  const adminPassword = String(process.env.ADMIN_PASSWORD || '');
  if (adminPassword.length < 10) throw new Error('ADMIN_PASSWORD must be at least 10 characters');
  const hash = await bcrypt.hash(adminPassword, 12);
  await pool.query(`INSERT INTO users(name,email,password_hash,role,ref_code)
    VALUES('Admin VYRO',$1,$2,'admin','VYROADMIN')
    ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash, role='admin', active=true`, [adminEmail, hash]);
}

app.get('/api/health', async (_, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true, app: 'VYRO STORE V4', time: now() });
});

app.get('/api/products', async (_, res) => {
  const { rows } = await pool.query(`SELECT id,name,category,price,commission_rate AS "commissionRate",icon,badge,summary,benefits,is_free AS "isFree",active,created_at AS "createdAt" FROM products WHERE active=true ORDER BY id DESC`);
  res.json({ products: rows });
});

app.post('/api/auth/register', async (req, res) => {
  const name = cleanText(req.body.name, 120);
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');
  const referredBy = cleanText(req.body.ref, 30).toUpperCase() || null;
  if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) return res.status(400).json({ error: 'Họ tên, email hoặc mật khẩu chưa hợp lệ.' });
  const hash = await bcrypt.hash(password, 12);
  try {
    const { rows } = await pool.query(`INSERT INTO users(name,email,password_hash,ref_code,referred_by) VALUES($1,$2,$3,$4,$5) RETURNING *`, [name, email, hash, refCode(name), referredBy]);
    res.json({ token: signToken(rows[0]), user: safeUser(rows[0]) });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Email này đã có trong hệ thống.' });
    throw e;
  }
});

app.post('/api/auth/login', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { rows } = await pool.query('SELECT * FROM users WHERE email=$1 AND active=true', [email]);
  if (!rows[0] || !(await bcrypt.compare(String(req.body.password || ''), rows[0].password_hash))) return res.status(401).json({ error: 'Thông tin chưa đúng.' });
  res.json({ token: signToken(rows[0]), user: safeUser(rows[0]) });
});

app.post('/api/auth/admin-login', async (req, res) => {
  if (String(req.body.pass || '') !== String(process.env.ADMIN_HIDDEN_PASSWORD || '')) return res.status(401).json({ error: 'Access denied.' });
  const { rows } = await pool.query("SELECT * FROM users WHERE role='admin' AND active=true ORDER BY id LIMIT 1");
  res.json({ token: signToken(rows[0]), user: safeUser(rows[0]) });
});

app.get('/api/dashboard', auth, async (req, res) => {
  const uid = req.user.id;
  const [orders, referred, commissions, withdrawals] = await Promise.all([
    pool.query(`SELECT o.*, (p.is_free OR o.status='paid') AS "downloadUnlocked" FROM orders o JOIN products p ON p.id=o.product_id WHERE o.user_id=$1 ORDER BY o.id DESC`, [uid]),
    pool.query('SELECT id,name,email,ref_code AS "refCode",created_at AS "createdAt" FROM users WHERE referred_by=$1 ORDER BY id DESC', [req.user.ref_code]),
    pool.query('SELECT id,product_name AS "productName",amount,rate,status,created_at AS "createdAt" FROM commissions WHERE partner_id=$1 ORDER BY id DESC', [uid]),
    pool.query('SELECT id,amount,method,account,status,created_at AS "createdAt" FROM withdrawals WHERE user_id=$1 ORDER BY id DESC', [uid])
  ]);
  res.json({ user: safeUser(req.user), orders: orders.rows, referredUsers: referred.rows, commissions: commissions.rows, withdrawals: withdrawals.rows });
});

app.post('/api/orders', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: products } = await client.query('SELECT * FROM products WHERE id=$1 AND active=true FOR SHARE', [Number(req.body.productId)]);
    const p = products[0]; if (!p) return res.status(404).json({ error: 'Sản phẩm chưa khả dụng.' });
    const status = p.is_free || Number(p.price) === 0 ? 'paid' : 'pending_payment';
    const { rows } = await client.query(`INSERT INTO orders(user_id,product_id,product_name,amount,status,payment_note) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`, [req.user.id,p.id,p.name,p.price,status,status==='paid'?'Đã mở quyền tải':'Chờ xác nhận chuyển khoản']);
    await client.query('COMMIT');
    res.json({ ok: true, order: rows[0], bankInfo: process.env.BANK_INFO || '' });
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
});

app.get('/api/download/:productId', auth, async (req, res) => {
  const { rows } = await pool.query(`SELECT p.* FROM products p WHERE p.id=$1 AND p.active=true AND (p.is_free=true OR EXISTS(SELECT 1 FROM orders o WHERE o.user_id=$2 AND o.product_id=p.id AND o.status='paid'))`, [Number(req.params.productId), req.user.id]);
  const p = rows[0]; if (!p) return res.status(403).send('Download is locked.');
  if (!p.download_file) return res.status(404).send('File not found.');
  const filePath = path.resolve(STORAGE_DIR, p.download_file);
  if (!filePath.startsWith(STORAGE_DIR) || !fs.existsSync(filePath)) return res.status(404).send('File not found.');
  res.download(filePath, p.download_name || path.basename(filePath));
});

app.post('/api/withdrawals', auth, async (req, res) => {
  const amount = Math.floor(Number(req.body.amount || 0));
  const method = cleanText(req.body.method, 80), account = cleanText(req.body.account, 500);
  if (amount <= 0 || !method || !account) return res.status(400).json({ error: 'Thông tin rút tiền chưa hợp lệ.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [req.user.id]);
    if (Number(rows[0].balance_approved) < amount) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Số dư khả dụng chưa đủ.' }); }
    await client.query('UPDATE users SET balance_approved=balance_approved-$1 WHERE id=$2', [amount, req.user.id]);
    await client.query('INSERT INTO withdrawals(user_id,amount,method,account) VALUES($1,$2,$3,$4)', [req.user.id, amount, method, account]);
    await client.query('COMMIT'); res.json({ ok: true });
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
});

app.get('/api/admin/overview', auth, adminOnly, async (_, res) => {
  const [users, products, orders, commissions, withdrawals, stats] = await Promise.all([
    pool.query(`SELECT id,name,email,role,ref_code AS "refCode",referred_by AS "referredBy",balance_pending AS "balancePending",balance_approved AS "balanceApproved",active,created_at AS "createdAt" FROM users ORDER BY id DESC`),
    pool.query(`SELECT id,name,category,price,commission_rate AS "commissionRate",icon,badge,summary,benefits,is_free AS "isFree",download_name AS "downloadName",active,created_at AS "createdAt" FROM products ORDER BY id DESC`),
    pool.query('SELECT * FROM orders ORDER BY id DESC'), pool.query('SELECT * FROM commissions ORDER BY id DESC'), pool.query('SELECT * FROM withdrawals ORDER BY id DESC'),
    pool.query(`SELECT COALESCE(SUM(amount) FILTER(WHERE status='paid'),0) AS revenue, COUNT(*) FILTER(WHERE status='pending_payment') AS pending, COUNT(*) AS orders FROM orders`)
  ]);
  res.json({ users:users.rows,products:products.rows,orders:orders.rows,commissions:commissions.rows,withdrawals:withdrawals.rows,stats:{revenue:Number(stats.rows[0].revenue),pending:Number(stats.rows[0].pending),orderCount:Number(stats.rows[0].orders),userCount:users.rowCount} });
});

app.post('/api/admin/products', auth, adminOnly, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Chưa chọn file sản phẩm.' });
  const price = Math.max(0, Math.floor(Number(req.body.price || 0)));
  const rate = Math.min(100, Math.max(0, Number(req.body.commissionRate || 0)));
  const benefits = cleanText(req.body.benefits, 2000).split('\n').map(x=>x.trim()).filter(Boolean).slice(0,10);
  const { rows } = await pool.query(`INSERT INTO products(name,category,price,commission_rate,icon,badge,summary,benefits,is_free,download_file,download_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`, [cleanText(req.body.name,180),cleanText(req.body.category,80),price,rate,cleanText(req.body.icon,20)||'📦',cleanText(req.body.badge,80)||'VYRO',cleanText(req.body.summary,3000),JSON.stringify(benefits),String(req.body.isFree)==='true'||price===0,req.file.filename,cleanText(req.file.originalname,180)]);
  res.json({ ok:true, product:rows[0] });
});

app.post('/api/admin/orders/:id/status', auth, adminOnly, async (req, res) => {
  const status = ['paid','rejected','pending_payment'].includes(req.body.status) ? req.body.status : 'paid';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [Number(req.params.id)]);
    const o=rows[0]; if(!o){await client.query('ROLLBACK');return res.status(404).json({error:'Không thấy đơn.'});}
    await client.query('UPDATE orders SET status=$1,updated_at=NOW() WHERE id=$2',[status,o.id]);
    if(status==='paid' && o.status!=='paid'){
      const { rows: buyerRows }=await client.query('SELECT * FROM users WHERE id=$1',[o.user_id]);
      const { rows: productRows }=await client.query('SELECT * FROM products WHERE id=$1',[o.product_id]);
      const buyer=buyerRows[0], p=productRows[0];
      if(buyer?.referred_by && Number(p?.commission_rate)>0){
        const { rows: partnerRows }=await client.query('SELECT * FROM users WHERE ref_code=$1 FOR UPDATE',[buyer.referred_by]);
        const partner=partnerRows[0];
        if(partner && partner.id!==buyer.id){
          const amount=Math.round(Number(p.price)*Number(p.commission_rate)/100);
          const inserted=await client.query(`INSERT INTO commissions(order_id,partner_id,buyer_id,product_id,product_name,rate,amount) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(order_id) DO NOTHING RETURNING id`,[o.id,partner.id,buyer.id,p.id,p.name,p.commission_rate,amount]);
          if(inserted.rowCount) await client.query('UPDATE users SET balance_pending=balance_pending+$1 WHERE id=$2',[amount,partner.id]);
        }
      }
    }
    await client.query('COMMIT');res.json({ok:true});
  } catch(e){await client.query('ROLLBACK');throw e;} finally{client.release();}
});

app.post('/api/admin/commissions/approve', auth, adminOnly, async (_, res) => {
  const client=await pool.connect();
  try{await client.query('BEGIN');const {rows}=await client.query("SELECT * FROM commissions WHERE status='pending' FOR UPDATE");for(const c of rows){await client.query("UPDATE commissions SET status='approved' WHERE id=$1",[c.id]);await client.query('UPDATE users SET balance_pending=GREATEST(0,balance_pending-$1),balance_approved=balance_approved+$1 WHERE id=$2',[c.amount,c.partner_id]);}await client.query('COMMIT');res.json({ok:true,count:rows.length});}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
});

app.post('/api/admin/withdrawals/:id/status', auth, adminOnly, async (req,res)=>{
  const status=['approved','rejected','pending'].includes(req.body.status)?req.body.status:'approved';
  const client=await pool.connect();
  try{await client.query('BEGIN');const {rows}=await client.query('SELECT * FROM withdrawals WHERE id=$1 FOR UPDATE',[Number(req.params.id)]);const w=rows[0];if(!w){await client.query('ROLLBACK');return res.status(404).json({error:'Không thấy yêu cầu.'});}if(w.status==='pending'&&status==='rejected')await client.query('UPDATE users SET balance_approved=balance_approved+$1 WHERE id=$2',[w.amount,w.user_id]);await client.query('UPDATE withdrawals SET status=$1,updated_at=NOW() WHERE id=$2',[status,w.id]);await client.query('COMMIT');res.json({ok:true});}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
});

app.use(express.static(PUBLIC_DIR, { maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));
app.get('*', (_,res)=>res.sendFile(path.join(PUBLIC_DIR,'index.html')));
app.use((err,req,res,next)=>{console.error(err);if(err instanceof multer.MulterError)return res.status(400).json({error:`Upload lỗi: ${err.message}`});res.status(500).json({error:process.env.NODE_ENV==='production'?'Hệ thống đang bận, vui lòng thử lại.':err.message});});

migrate().then(()=>app.listen(PORT,()=>console.log(`VYRO STORE V4 running on ${PORT}`))).catch(e=>{console.error(e);process.exit(1);});
