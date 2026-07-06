
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, "data", "db.json");
const PUBLIC_DIR = path.join(__dirname, "public");

const sessions = new Map();

function readDB() {
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function writeDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password)).digest("hex");
}

function now() {
  return new Date().toISOString();
}

function makeId(items) {
  return items.length ? Math.max(...items.map(x => Number(x.id) || 0)) + 1 : 1;
}

function refCode(name, id) {
  const base = String(name || "VYRO").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5) || "VYRO";
  return `${base}${String(id).padStart(4, "0")}`;
}

function createToken(user) {
  const raw = `${user.id}:${Date.now()}:${crypto.randomBytes(14).toString("hex")}`;
  return Buffer.from(raw).toString("base64url");
}

function getAuth(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || !sessions.has(token)) return null;
  const db = readDB();
  return db.users.find(u => u.id === sessions.get(token)) || null;
}

function send(res, status, data) {
  res.writeHead(status, {"Content-Type": "application/json; charset=utf-8"});
  res.end(JSON.stringify(data));
}

function safeUser(user) {
  const x = {...user};
  delete x.passwordHash;
  return x;
}

function parseBody(req) {
  return new Promise(resolve => {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { resolve({}); }
    });
  });
}

function serveStatic(req, res) {
  let reqPath = decodeURIComponent(req.url.split("?")[0]);
  if (reqPath === "/") reqPath = "/index.html";
  const clean = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, "");
  let filePath = path.join(PUBLIC_DIR, clean);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); return res.end("Forbidden");
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(PUBLIC_DIR, "index.html");
  }
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml"
  };
  res.writeHead(200, {"Content-Type": types[ext] || "application/octet-stream"});
  fs.createReadStream(filePath).pipe(res);
}

function initAdmin() {
  const db = readDB();
  const admin = db.users.find(u => u.role === "admin");
  if (admin && !admin.passwordHash) {
    admin.passwordHash = hashPassword("Abc12345@");
    writeDB(db);
  }
}

async function api(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const method = req.method;
  const db = readDB();

  if (method === "GET" && url.pathname === "/api/health") {
    return send(res, 200, {ok: true, app: "VYRO STORE V1", time: now()});
  }

  if (method === "GET" && url.pathname === "/api/products") {
    return send(res, 200, {products: db.products.filter(p => p.active !== false)});
  }

  if (method === "POST" && url.pathname === "/api/register") {
    const body = await parseBody(req);
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const referredBy = String(body.ref || "").trim().toUpperCase() || null;

    if (!name || !email || password.length < 6) {
      return send(res, 400, {error: "Vui lòng nhập tên, email và mật khẩu tối thiểu 6 ký tự."});
    }
    if (db.users.some(u => u.email === email)) {
      return send(res, 409, {error: "Email đã tồn tại."});
    }

    const id = makeId(db.users);
    const user = {
      id, name, email,
      passwordHash: hashPassword(password),
      role: "partner",
      refCode: refCode(name, id),
      referredBy,
      balancePending: 0,
      balanceApproved: 0,
      createdAt: now()
    };
    db.users.push(user);
    writeDB(db);
    const token = createToken(user);
    sessions.set(token, user.id);
    return send(res, 200, {token, user: safeUser(user)});
  }

  if (method === "POST" && url.pathname === "/api/login") {
    const body = await parseBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const user = db.users.find(u => u.email === email && u.passwordHash === hashPassword(password));
    if (!user) return send(res, 401, {error: "Sai email hoặc mật khẩu."});
    const token = createToken(user);
    sessions.set(token, user.id);
    return send(res, 200, {token, user: safeUser(user)});
  }

  if (method === "POST" && url.pathname === "/api/admin-login") {
    const body = await parseBody(req);
    if (String(body.pass || "") !== db.settings.adminPass) {
      return send(res, 401, {error: "Sai mật khẩu admin."});
    }
    const admin = db.users.find(u => u.role === "admin");
    const token = createToken(admin);
    sessions.set(token, admin.id);
    return send(res, 200, {token, user: safeUser(admin)});
  }

  if (method === "GET" && url.pathname === "/api/dashboard") {
    const user = getAuth(req);
    if (!user) return send(res, 401, {error: "Chưa đăng nhập."});
    const orders = db.orders.filter(o => o.userId === user.id);
    const referredUsers = db.users.filter(u => u.referredBy === user.refCode).map(safeUser);
    const commissions = db.commissions.filter(c => c.partnerId === user.id);
    const withdrawals = db.withdrawals.filter(w => w.userId === user.id);
    return send(res, 200, {user: safeUser(user), orders, referredUsers, commissions, withdrawals});
  }

  if (method === "POST" && url.pathname === "/api/buy") {
    const user = getAuth(req);
    if (!user) return send(res, 401, {error: "Chưa đăng nhập."});
    const body = await parseBody(req);
    const product = db.products.find(p => p.id === Number(body.productId) && p.active !== false);
    if (!product) return send(res, 404, {error: "Không tìm thấy sản phẩm."});

    const order = {
      id: makeId(db.orders),
      userId: user.id,
      productId: product.id,
      productName: product.name,
      amount: product.price,
      status: "paid-demo",
      createdAt: now()
    };
    db.orders.push(order);

    if (user.referredBy) {
      const partner = db.users.find(u => u.refCode === user.referredBy);
      if (partner && partner.id !== user.id) {
        const amount = Math.round(product.price * product.commissionRate / 100);
        db.commissions.push({
          id: makeId(db.commissions),
          orderId: order.id,
          partnerId: partner.id,
          buyerId: user.id,
          productId: product.id,
          productName: product.name,
          rate: product.commissionRate,
          amount,
          status: "pending",
          createdAt: now()
        });
        partner.balancePending = Number(partner.balancePending || 0) + amount;
      }
    }

    writeDB(db);
    return send(res, 200, {ok: true, order});
  }

  if (method === "POST" && url.pathname === "/api/withdraw") {
    const user = getAuth(req);
    if (!user) return send(res, 401, {error: "Chưa đăng nhập."});
    const body = await parseBody(req);
    const amount = Number(body.amount || 0);
    if (amount <= 0 || amount > Number(user.balanceApproved || 0)) {
      return send(res, 400, {error: "Số tiền rút không hợp lệ hoặc vượt số dư được duyệt."});
    }
    const withdrawal = {
      id: makeId(db.withdrawals),
      userId: user.id,
      amount,
      method: String(body.method || "Bank").trim(),
      account: String(body.account || "").trim(),
      status: "pending",
      createdAt: now()
    };
    db.withdrawals.push(withdrawal);
    user.balanceApproved = Number(user.balanceApproved || 0) - amount;
    writeDB(db);
    return send(res, 200, {ok: true, withdrawal});
  }

  if (url.pathname.startsWith("/api/admin/")) {
    const user = getAuth(req);
    if (!user || user.role !== "admin") return send(res, 403, {error: "Admin only."});

    if (method === "GET" && url.pathname === "/api/admin/overview") {
      const revenue = db.orders.reduce((s, o) => s + Number(o.amount || 0), 0);
      const pendingWithdraw = db.withdrawals.filter(w => w.status === "pending").reduce((s, w) => s + Number(w.amount || 0), 0);
      return send(res, 200, {
        users: db.users.map(safeUser),
        products: db.products,
        orders: db.orders,
        commissions: db.commissions,
        withdrawals: db.withdrawals,
        stats: {revenue, pendingWithdraw, userCount: db.users.length, orderCount: db.orders.length}
      });
    }

    if (method === "POST" && url.pathname === "/api/admin/product") {
      const body = await parseBody(req);
      const product = {
        id: makeId(db.products),
        name: String(body.name || "Sản phẩm mới").trim(),
        category: String(body.category || "Bot MT5").trim(),
        price: Number(body.price || 0),
        commissionRate: Number(body.commissionRate || 20),
        icon: String(body.icon || "📦").trim(),
        summary: String(body.summary || "").trim(),
        fileUrl: String(body.fileUrl || "/downloads/vyro-demo.txt").trim(),
        active: true
      };
      db.products.push(product);
      writeDB(db);
      return send(res, 200, {ok: true, product});
    }

    if (method === "POST" && url.pathname === "/api/admin/approve-commissions") {
      let total = 0;
      db.commissions.forEach(c => {
        if (c.status === "pending") {
          c.status = "approved";
          total += Number(c.amount || 0);
          const partner = db.users.find(u => u.id === c.partnerId);
          if (partner) {
            partner.balancePending = Math.max(0, Number(partner.balancePending || 0) - Number(c.amount || 0));
            partner.balanceApproved = Number(partner.balanceApproved || 0) + Number(c.amount || 0);
          }
        }
      });
      writeDB(db);
      return send(res, 200, {ok: true, approvedAmount: total});
    }

    if (method === "POST" && url.pathname === "/api/admin/withdrawal-status") {
      const body = await parseBody(req);
      const w = db.withdrawals.find(x => x.id === Number(body.id));
      if (!w) return send(res, 404, {error: "Không tìm thấy yêu cầu rút."});
      w.status = String(body.status || "approved");
      w.updatedAt = now();
      writeDB(db);
      return send(res, 200, {ok: true, withdrawal: w});
    }
  }

  return send(res, 404, {error: "API not found"});
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/")) return api(req, res);
    return serveStatic(req, res);
  } catch (e) {
    console.error(e);
    return send(res, 500, {error: "Server error", detail: e.message});
  }
});

initAdmin();

server.listen(PORT, () => {
  console.log(`VYRO STORE V1 running at http://localhost:${PORT}`);
});
