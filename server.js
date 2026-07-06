
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, "data", "db.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const STORAGE_DIR = path.join(__dirname, "storage");
const sessions = new Map();

function readDB(){ return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); }
function writeDB(db){ fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8"); }
function hashPassword(p){ return crypto.createHash("sha256").update(String(p)).digest("hex"); }
function now(){ return new Date().toISOString(); }
function makeId(a){ return a.length ? Math.max(...a.map(x => Number(x.id)||0)) + 1 : 1; }
function refCode(name,id){ const b=String(name||"VYRO").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,6)||"VYRO"; return `${b}${String(id).padStart(4,"0")}`; }
function tokenFor(u){ return Buffer.from(`${u.id}:${Date.now()}:${crypto.randomBytes(16).toString("hex")}`).toString("base64url"); }
function safeUser(u){ const x={...u}; delete x.passwordHash; return x; }
function send(res, status, data){ res.writeHead(status, {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}); res.end(JSON.stringify(data)); }
function authUser(req){ const h=req.headers.authorization||""; const t=h.startsWith("Bearer ")?h.slice(7):""; if(!t||!sessions.has(t)) return null; const db=readDB(); return db.users.find(u=>u.id===sessions.get(t))||null; }
function isAdmin(req){ const u=authUser(req); return u && u.role==="admin" ? u : null; }
function parseJson(req){ return new Promise(resolve=>{ let b=""; req.on("data",c=>b+=c); req.on("end",()=>{try{resolve(b?JSON.parse(b):{})}catch{resolve({})}}); }); }
function sanitizeName(n){ return String(n||"file").replace(/[^a-zA-Z0-9._-]/g,"_").slice(0,120); }
function parseMultipart(req){
  return new Promise((resolve,reject)=>{
    const type=req.headers["content-type"]||"";
    const m=type.match(/boundary=(.+)$/);
    if(!m) return resolve({fields:{}, files:{}});
    const boundary="--"+m[1];
    const chunks=[];
    req.on("data",c=>chunks.push(c));
    req.on("end",()=>{
      const buffer=Buffer.concat(chunks);
      const raw=buffer.toString("binary");
      const parts=raw.split(boundary).slice(1,-1);
      const fields={}, files={};
      for(const part of parts){
        const p=part.replace(/^\r\n/,"").replace(/\r\n$/,"");
        const idx=p.indexOf("\r\n\r\n");
        if(idx<0) continue;
        const head=p.slice(0,idx);
        const bodyBin=p.slice(idx+4);
        const nameMatch=head.match(/name="([^"]+)"/);
        if(!nameMatch) continue;
        const name=nameMatch[1];
        const fileMatch=head.match(/filename="([^"]*)"/);
        if(fileMatch && fileMatch[1]){
          const original=sanitizeName(fileMatch[1]);
          const stored=`${Date.now()}_${crypto.randomBytes(5).toString("hex")}_${original}`;
          const content=Buffer.from(bodyBin.replace(/\r\n$/,""),"binary");
          fs.writeFileSync(path.join(STORAGE_DIR, stored), content);
          files[name]={original, stored, size:content.length};
        }else{
          fields[name]=Buffer.from(bodyBin.replace(/\r\n$/,""),"binary").toString("utf8");
        }
      }
      resolve({fields, files});
    });
    req.on("error",reject);
  });
}
function canDownload(user, product, db){
  if(!user || !product) return false;
  if(product.isFree) return true;
  return db.orders.some(o => o.userId===user.id && o.productId===product.id && o.status==="paid");
}
function serveStatic(req,res){
  let reqPath=decodeURIComponent(req.url.split("?")[0]);
  if(reqPath==="/") reqPath="/index.html";
  const clean=path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, "");
  let fp=path.join(PUBLIC_DIR, clean);
  if(!fp.startsWith(PUBLIC_DIR)){ res.writeHead(403); return res.end("Forbidden");}
  if(!fs.existsSync(fp)||fs.statSync(fp).isDirectory()) fp=path.join(PUBLIC_DIR,"index.html");
  const ext=path.extname(fp).toLowerCase();
  const types={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"application/javascript; charset=utf-8",".txt":"text/plain; charset=utf-8",".svg":"image/svg+xml",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg"};
  res.writeHead(200, {"Content-Type":types[ext]||"application/octet-stream"});
  fs.createReadStream(fp).pipe(res);
}
function init(){
  if(!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR,{recursive:true});
  const db=readDB(); const admin=db.users.find(u=>u.role==="admin");
  if(admin && !admin.passwordHash){ admin.passwordHash=hashPassword("Abc12345@"); writeDB(db); }
}

async function api(req,res){
  const url=new URL(req.url,`http://${req.headers.host}`);
  const method=req.method; const db=readDB();

  if(method==="GET" && url.pathname==="/api/health") return send(res,200,{ok:true,app:"VYRO STORE V3",time:now()});
  if(method==="GET" && url.pathname==="/api/products") return send(res,200,{products:db.products.filter(p=>p.active!==false).map(p=>({...p,downloadFile:undefined}))});

  if(method==="POST" && url.pathname==="/api/register"){
    const b=await parseJson(req);
    const name=String(b.name||"").trim(), email=String(b.email||"").trim().toLowerCase(), pass=String(b.password||"");
    const referredBy=String(b.ref||"").trim().toUpperCase()||null;
    if(!name||!email||pass.length<6) return send(res,400,{error:"Vui lòng nhập đầy đủ thông tin để kích hoạt tài khoản."});
    if(db.users.some(u=>u.email===email)) return send(res,409,{error:"Email này đã có trong hệ thống."});
    const id=makeId(db.users);
    const u={id,name,email,passwordHash:hashPassword(pass),role:"partner",refCode:refCode(name,id),referredBy,balancePending:0,balanceApproved:0,createdAt:now()};
    db.users.push(u); writeDB(db);
    const t=tokenFor(u); sessions.set(t,u.id); return send(res,200,{token:t,user:safeUser(u)});
  }

  if(method==="POST" && url.pathname==="/api/login"){
    const b=await parseJson(req);
    const u=db.users.find(x=>x.email===String(b.email||"").trim().toLowerCase() && x.passwordHash===hashPassword(String(b.password||"")));
    if(!u) return send(res,401,{error:"Thông tin chưa đúng, vui lòng kiểm tra lại."});
    const t=tokenFor(u); sessions.set(t,u.id); return send(res,200,{token:t,user:safeUser(u)});
  }

  if(method==="POST" && url.pathname==="/api/admin-login"){
    const b=await parseJson(req);
    if(String(b.pass||"")!==db.settings.adminPass) return send(res,401,{error:"Access denied."});
    const u=db.users.find(x=>x.role==="admin"); const t=tokenFor(u); sessions.set(t,u.id);
    return send(res,200,{token:t,user:safeUser(u)});
  }

  if(method==="GET" && url.pathname==="/api/dashboard"){
    const u=authUser(req); if(!u) return send(res,401,{error:"Vui lòng kích hoạt Member Center."});
    const orders=db.orders.filter(o=>o.userId===u.id).map(o=>({...o, downloadUnlocked: canDownload(u, db.products.find(p=>p.id===o.productId), db)}));
    return send(res,200,{user:safeUser(u),orders,referredUsers:db.users.filter(x=>x.referredBy===u.refCode).map(safeUser),commissions:db.commissions.filter(c=>c.partnerId===u.id),withdrawals:db.withdrawals.filter(w=>w.userId===u.id)});
  }

  if(method==="POST" && url.pathname==="/api/order"){
    const u=authUser(req); if(!u) return send(res,401,{error:"Hãy kích hoạt tài khoản để nhận sản phẩm."});
    const b=await parseJson(req); const p=db.products.find(x=>x.id===Number(b.productId)&&x.active!==false);
    if(!p) return send(res,404,{error:"Sản phẩm chưa khả dụng."});
    const status=p.isFree||Number(p.price)===0 ? "paid" : "pending_payment";
    const order={id:makeId(db.orders),userId:u.id,productId:p.id,productName:p.name,amount:p.price,status,createdAt:now(),note: status==="pending_payment" ? "Chờ xác nhận thanh toán" : "Đã mở download"};
    db.orders.push(order);
    if(status==="paid" && u.referredBy && p.commissionRate>0){
      const partner=db.users.find(x=>x.refCode===u.referredBy);
      if(partner && partner.id!==u.id){
        const amount=Math.round(p.price*p.commissionRate/100);
        db.commissions.push({id:makeId(db.commissions),orderId:order.id,partnerId:partner.id,buyerId:u.id,productId:p.id,productName:p.name,rate:p.commissionRate,amount,status:"pending",createdAt:now()});
        partner.balancePending=Number(partner.balancePending||0)+amount;
      }
    }
    writeDB(db); return send(res,200,{ok:true,order,bankInfo:db.settings.bankInfo});
  }

  if(method==="GET" && url.pathname.startsWith("/api/download/")){
    const u=authUser(req); if(!u){ res.writeHead(401); return res.end("Please activate member account."); }
    const id=Number(url.pathname.split("/").pop()); const p=db.products.find(x=>x.id===id&&x.active!==false);
    if(!canDownload(u,p,db)){ res.writeHead(403); return res.end("Download is locked. Payment approval required."); }
    const fp=path.join(STORAGE_DIR, p.downloadFile||"");
    if(!p.downloadFile || !fs.existsSync(fp)){ res.writeHead(404); return res.end("File not found."); }
    res.writeHead(200, {"Content-Type":"application/octet-stream","Content-Disposition":`attachment; filename="${p.downloadName || p.downloadFile}"`});
    return fs.createReadStream(fp).pipe(res);
  }

  if(method==="POST" && url.pathname==="/api/withdraw"){
    const u=authUser(req); if(!u) return send(res,401,{error:"Vui lòng kích hoạt Member Center."});
    const b=await parseJson(req); const amount=Number(b.amount||0);
    if(amount<=0||amount>Number(u.balanceApproved||0)) return send(res,400,{error:"Số dư khả dụng chưa đủ."});
    db.withdrawals.push({id:makeId(db.withdrawals),userId:u.id,amount,method:String(b.method||"Bank").trim(),account:String(b.account||"").trim(),status:"pending",createdAt:now()});
    u.balanceApproved=Number(u.balanceApproved||0)-amount; writeDB(db); return send(res,200,{ok:true});
  }

  if(url.pathname.startsWith("/api/admin/")){
    const admin=isAdmin(req); if(!admin) return send(res,403,{error:"Restricted area."});

    if(method==="GET" && url.pathname==="/api/admin/overview"){
      const revenue=db.orders.filter(o=>o.status==="paid").reduce((s,o)=>s+Number(o.amount||0),0);
      const pending=db.orders.filter(o=>o.status==="pending_payment").length;
      return send(res,200,{users:db.users.map(safeUser),products:db.products.map(p=>({...p,downloadFile:p.downloadFile||""})),orders:db.orders,commissions:db.commissions,withdrawals:db.withdrawals,settings:db.settings,stats:{revenue,pending,userCount:db.users.length,orderCount:db.orders.length}});
    }

    if(method==="POST" && url.pathname==="/api/admin/product-json"){
      const b=await parseJson(req);
      const product={id:makeId(db.products),name:String(b.name||"New Product").trim(),category:String(b.category||"Bot MT5").trim(),price:Number(b.price||0),commissionRate:Number(b.commissionRate||0),icon:String(b.icon||"📦").trim(),badge:String(b.badge||"New").trim(),summary:String(b.summary||"").trim(),benefits:String(b.benefits||"").split("\n").filter(Boolean),isFree:!!b.isFree,downloadFile:String(b.downloadFile||"").trim(),downloadName:String(b.downloadName||"").trim(),active:true,createdAt:now()};
      db.products.push(product); writeDB(db); return send(res,200,{ok:true,product});
    }

    if(method==="POST" && url.pathname==="/api/admin/upload-product"){
      const mp=await parseMultipart(req); const f=mp.files.file; const fields=mp.fields;
      if(!f) return send(res,400,{error:"Chưa chọn file sản phẩm."});
      const price=Number(fields.price||0);
      const product={id:makeId(db.products),name:String(fields.name||f.original).trim(),category:String(fields.category||"Digital Product").trim(),price,commissionRate:Number(fields.commissionRate||0),icon:String(fields.icon||"📦").trim(),badge:String(fields.badge||(price>0?"Premium":"Free")).trim(),summary:String(fields.summary||"").trim(),benefits:String(fields.benefits||"Kích hoạt nhanh\nQuản lý trong Member Center\nPhù hợp phân phối").split("\n").filter(Boolean),isFree:String(fields.isFree||"false")==="true"||price===0,downloadFile:f.stored,downloadName:f.original,active:true,createdAt:now()};
      db.products.push(product); writeDB(db); return send(res,200,{ok:true,product});
    }

    if(method==="POST" && url.pathname==="/api/admin/order-status"){
      const b=await parseJson(req); const o=db.orders.find(x=>x.id===Number(b.id)); if(!o) return send(res,404,{error:"Không thấy đơn."});
      const old=o.status; o.status=String(b.status||"paid"); o.updatedAt=now();
      if(old!=="paid" && o.status==="paid"){
        const buyer=db.users.find(x=>x.id===o.userId); const p=db.products.find(x=>x.id===o.productId);
        if(buyer && buyer.referredBy && p && p.commissionRate>0){
          const partner=db.users.find(x=>x.refCode===buyer.referredBy);
          if(partner && partner.id!==buyer.id && !db.commissions.some(c=>c.orderId===o.id)){
            const amount=Math.round(p.price*p.commissionRate/100);
            db.commissions.push({id:makeId(db.commissions),orderId:o.id,partnerId:partner.id,buyerId:buyer.id,productId:p.id,productName:p.name,rate:p.commissionRate,amount,status:"pending",createdAt:now()});
            partner.balancePending=Number(partner.balancePending||0)+amount;
          }
        }
      }
      writeDB(db); return send(res,200,{ok:true,order:o});
    }

    if(method==="POST" && url.pathname==="/api/admin/approve-commissions"){
      let total=0; db.commissions.forEach(c=>{ if(c.status==="pending"){ c.status="approved"; total+=Number(c.amount||0); const p=db.users.find(u=>u.id===c.partnerId); if(p){ p.balancePending=Math.max(0,Number(p.balancePending||0)-Number(c.amount||0)); p.balanceApproved=Number(p.balanceApproved||0)+Number(c.amount||0); } }});
      writeDB(db); return send(res,200,{ok:true,total});
    }

    if(method==="POST" && url.pathname==="/api/admin/withdrawal-status"){
      const b=await parseJson(req); const w=db.withdrawals.find(x=>x.id===Number(b.id)); if(!w) return send(res,404,{error:"Không thấy yêu cầu."});
      w.status=String(b.status||"approved"); w.updatedAt=now(); writeDB(db); return send(res,200,{ok:true});
    }
  }
  return send(res,404,{error:"API not found"});
}

const server=http.createServer(async(req,res)=>{ try{ if(req.url.startsWith("/api/")) return api(req,res); return serveStatic(req,res); }catch(e){ console.error(e); return send(res,500,{error:e.message}); }});
init();
server.listen(PORT,()=>console.log(`VYRO STORE V3 running at http://localhost:${PORT}`));
