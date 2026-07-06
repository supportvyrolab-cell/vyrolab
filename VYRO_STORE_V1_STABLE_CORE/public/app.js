
let token = localStorage.getItem("vyro_token") || "";
let currentUser = null;
let products = [];
let tapCount = 0;

function money(v){ return Number(v||0).toLocaleString("vi-VN") + "đ"; }
function scrollToId(id){ document.getElementById(id)?.scrollIntoView({behavior:"smooth"}); }

async function api(path, options={}){
  const headers = {"Content-Type":"application/json"};
  if(token) headers.Authorization = "Bearer " + token;
  const res = await fetch(path, {...options, headers});
  const data = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error || "Có lỗi xảy ra");
  return data;
}

async function loadProducts(){
  const data = await api("/api/products");
  products = data.products;
  renderProducts();
}

function renderProducts(){
  const box = document.getElementById("productGrid");
  box.innerHTML = products.map(p => `
    <article class="product">
      <div class="icon">${p.icon || "📦"}</div>
      <h3>${p.name}</h3>
      <p>${p.summary}</p>
      <div class="price">${money(p.price)}</div>
      <small>Hoa hồng affiliate: <b>${p.commissionRate}%</b></small>
      <button class="gold" onclick="buy(${p.id})">Mua demo / ghi đơn</button>
    </article>
  `).join("");
}

function openAuth(){ document.getElementById("authModal").classList.remove("hidden"); setTab("login"); }
function closeAuth(){ document.getElementById("authModal").classList.add("hidden"); }
function setTab(tab){
  document.getElementById("loginForm").classList.toggle("hidden", tab!=="login");
  document.getElementById("registerForm").classList.toggle("hidden", tab!=="register");
}
function closeAdminLogin(){ document.getElementById("adminLogin").classList.add("hidden"); }

async function register(){
  try{
    const urlRef = new URLSearchParams(location.search).get("ref") || localStorage.getItem("vyro_ref") || "";
    const ref = document.getElementById("regRef").value || urlRef;
    const data = await api("/api/register", {method:"POST", body:JSON.stringify({
      name: regName.value, email: regEmail.value, password: regPass.value, ref
    })});
    token = data.token; localStorage.setItem("vyro_token", token); currentUser=data.user;
    closeAuth(); await loadDashboard();
  }catch(e){ authMsg.textContent = e.message; }
}

async function login(){
  try{
    const data = await api("/api/login", {method:"POST", body:JSON.stringify({
      email: loginEmail.value, password: loginPass.value
    })});
    token=data.token; localStorage.setItem("vyro_token", token); currentUser=data.user;
    closeAuth(); await loadDashboard();
  }catch(e){ authMsg.textContent = e.message; }
}

async function buy(productId){
  if(!token){ openAuth(); return; }
  try{
    await api("/api/buy", {method:"POST", body:JSON.stringify({productId})});
    alert("Đã tạo đơn demo. Nếu tài khoản đăng ký qua ref, hoa hồng đã cộng pending cho đại lý.");
    await loadDashboard();
  }catch(e){ alert(e.message); }
}

async function loadDashboard(){
  const box = document.getElementById("dashBox");
  if(!token){
    box.innerHTML = `<p>Chưa đăng nhập. Hãy tạo tài khoản để lấy link affiliate.</p><button class="gold" onclick="openAuth()">Đăng nhập / Đăng ký</button>`;
    return;
  }
  try{
    const data = await api("/api/dashboard");
    currentUser = data.user;
    const refLink = `${location.origin}/?ref=${currentUser.refCode}`;
    box.innerHTML = `
      <h3>Xin chào ${currentUser.name}</h3>
      <div class="dash-grid">
        <div class="card"><span>Mã affiliate</span><br><b>${currentUser.refCode}</b></div>
        <div class="card"><span>Pending</span><br><b>${money(currentUser.balancePending)}</b></div>
        <div class="card"><span>Approved</span><br><b>${money(currentUser.balanceApproved)}</b></div>
        <div class="card"><span>Khách giới thiệu</span><br><b>${data.referredUsers.length}</b></div>
      </div>
      <h3>Link giới thiệu</h3>
      <div class="copy"><input value="${refLink}" readonly id="refLink"/><button onclick="copyRef()">Copy</button></div>
      <h3>Yêu cầu rút tiền</h3>
      <div class="dash-grid">
        <input id="wdAmount" placeholder="Số tiền muốn rút"/>
        <input id="wdMethod" placeholder="Ngân hàng / USDT"/>
        <input id="wdAccount" placeholder="Số tài khoản / ví"/>
        <button class="gold" onclick="withdraw()">Gửi yêu cầu</button>
      </div>
      <h3>Hoa hồng</h3>${table(data.commissions, ["id","productName","amount","rate","status","createdAt"])}
      <h3>Đơn hàng của tôi</h3>${table(data.orders, ["id","productName","amount","status","createdAt"])}
      <h3>Lịch sử rút</h3>${table(data.withdrawals, ["id","amount","method","account","status","createdAt"])}
    `;
  }catch(e){
    localStorage.removeItem("vyro_token"); token="";
    box.innerHTML = `<p>Phiên đăng nhập hết hạn.</p><button onclick="openAuth()">Đăng nhập lại</button>`;
  }
}

function table(rows, cols){
  if(!rows || !rows.length) return "<p>Chưa có dữ liệu.</p>";
  return `<table><thead><tr>${cols.map(c=>`<th>${c}</th>`).join("")}</tr></thead><tbody>
    ${rows.map(r=>`<tr>${cols.map(c=>`<td>${String(c).toLowerCase().includes("amount")?money(r[c]):(r[c]??"")}</td>`).join("")}</tr>`).join("")}
  </tbody></table>`;
}

function copyRef(){ navigator.clipboard.writeText(refLink.value); alert("Đã copy link affiliate"); }

async function withdraw(){
  try{
    await api("/api/withdraw", {method:"POST", body:JSON.stringify({
      amount: wdAmount.value, method: wdMethod.value, account: wdAccount.value
    })});
    alert("Đã gửi yêu cầu rút tiền.");
    await loadDashboard();
  }catch(e){ alert(e.message); }
}

document.getElementById("logoTap").addEventListener("click", ()=>{
  tapCount++;
  if(tapCount >= 6){
    tapCount = 0;
    document.getElementById("adminLogin").classList.remove("hidden");
  }
  setTimeout(()=>tapCount=0, 2500);
});

async function adminLogin(){
  try{
    const data = await api("/api/admin-login", {method:"POST", body:JSON.stringify({pass: adminPass.value})});
    token=data.token; localStorage.setItem("vyro_token", token);
    closeAdminLogin();
    document.getElementById("adminPanel").classList.remove("hidden");
    await loadAdmin();
    scrollToId("adminPanel");
  }catch(e){ adminMsg.textContent=e.message; }
}

async function loadAdmin(){
  const data = await api("/api/admin/overview");
  adminBox.innerHTML = `
    <div class="admin-grid">
      <div class="card"><span>Doanh thu</span><br><b>${money(data.stats.revenue)}</b></div>
      <div class="card"><span>Users</span><br><b>${data.stats.userCount}</b></div>
      <div class="card"><span>Orders</span><br><b>${data.stats.orderCount}</b></div>
      <div class="card"><span>Rút pending</span><br><b>${money(data.stats.pendingWithdraw)}</b></div>
    </div>
    <h3>Thêm sản phẩm</h3>
    <div class="admin-grid">
      <input id="pName" placeholder="Tên sản phẩm"/>
      <select id="pCategory"><option>Bot MT5</option><option>Indicator</option><option>Khóa học</option><option>Tín hiệu</option></select>
      <input id="pPrice" placeholder="Giá"/>
      <input id="pRate" placeholder="% hoa hồng"/>
    </div>
    <textarea id="pSummary" placeholder="Mô tả sản phẩm"></textarea>
    <div class="admin-grid">
      <input id="pIcon" placeholder="Icon, ví dụ 🤖"/>
      <input id="pFile" placeholder="Link file tải"/>
      <button class="gold" onclick="addProduct()">Thêm sản phẩm</button>
      <button class="ok" onclick="approveCommissions()">Duyệt hoa hồng pending</button>
    </div>
    <h3>Sản phẩm</h3>${table(data.products, ["id","name","category","price","commissionRate","active"])}
    <h3>Users</h3>${table(data.users, ["id","name","email","role","refCode","referredBy","balancePending","balanceApproved"])}
    <h3>Orders</h3>${table(data.orders, ["id","userId","productName","amount","status","createdAt"])}
    <h3>Commissions</h3>${table(data.commissions, ["id","partnerId","buyerId","productName","amount","rate","status","createdAt"])}
    <h3>Withdrawals</h3>${renderWithdrawals(data.withdrawals)}
  `;
}

function renderWithdrawals(rows){
  if(!rows.length) return "<p>Chưa có yêu cầu rút.</p>";
  return `<table><thead><tr><th>ID</th><th>User</th><th>Số tiền</th><th>Method</th><th>Account</th><th>Status</th><th>Duyệt</th></tr></thead><tbody>
    ${rows.map(w=>`<tr><td>${w.id}</td><td>${w.userId}</td><td>${money(w.amount)}</td><td>${w.method}</td><td>${w.account}</td><td>${w.status}</td><td><button onclick="setWithdrawal(${w.id},'approved')">Approve</button> <button class="danger" onclick="setWithdrawal(${w.id},'rejected')">Reject</button></td></tr>`).join("")}
  </tbody></table>`;
}

async function addProduct(){
  try{
    await api("/api/admin/product", {method:"POST", body:JSON.stringify({
      name:pName.value, category:pCategory.value, price:pPrice.value, commissionRate:pRate.value,
      summary:pSummary.value, icon:pIcon.value, fileUrl:pFile.value
    })});
    await loadProducts(); await loadAdmin();
  }catch(e){ alert(e.message); }
}

async function approveCommissions(){
  await api("/api/admin/approve-commissions", {method:"POST", body:"{}"});
  alert("Đã duyệt hoa hồng pending sang approved.");
  await loadAdmin();
}

async function setWithdrawal(id,status){
  await api("/api/admin/withdrawal-status", {method:"POST", body:JSON.stringify({id,status})});
  await loadAdmin();
}

function saveRef(){
  const ref = new URLSearchParams(location.search).get("ref");
  if(ref) localStorage.setItem("vyro_ref", ref.toUpperCase());
  if(ref && document.getElementById("regRef")) document.getElementById("regRef").value = ref.toUpperCase();
}

saveRef();
loadProducts();
loadDashboard();
