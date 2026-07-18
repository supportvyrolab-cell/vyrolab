
let token=localStorage.getItem("vyro_token")||"", tapCount=0, products=[], paymentConfig=null, currentPaymentOrder=null;
const $=id=>document.getElementById(id);
function money(v){return Number(v||0).toLocaleString('vi-VN')+'đ'}
function esc(v){return String(v??'').replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]))}
function scrollToId(id){$(id)?.scrollIntoView({behavior:"smooth"})}
async function api(path,opt={}){const h={}; if(!(opt.body instanceof FormData)) h["Content-Type"]="application/json"; if(token) h.Authorization="Bearer "+token; const r=await fetch(path,{...opt,headers:{...h,...(opt.headers||{})}}); if(path.startsWith("/api/download/")) return r; const d=await r.json().catch(()=>({})); if(!r.ok) throw new Error(d.error||"Có lỗi xảy ra"); return d}
function openAuth(tab="register"){authModal.classList.remove("hidden");setTab(tab)}
function closeAuth(){authModal.classList.add("hidden")}
function setTab(tab){loginForm.classList.toggle("hidden",tab!=="login");registerForm.classList.toggle("hidden",tab!=="register");authTitle.textContent=tab==="login"?"Vào VYRO Member Center":"Kích hoạt VYRO Member"}
function closeOpsLogin(){document.getElementById("opsLogin").classList.add("hidden")}
async function loadProducts(){
  try{
    const d=await api("/api/products"); products=Array.isArray(d.products)?d.products:[];
    if(!products.length){productGrid.innerHTML='<div class="empty-product"><h3>Kho sản phẩm đang cập nhật</h3><p>Admin đăng sản phẩm mới trong Operation Center.</p></div>';return}
    productGrid.innerHTML=products.map(p=>{
      const img=p.imageUrl?`<img src="${esc(p.imageUrl)}" alt="${esc(p.name)}">`:p.hasImage?`<img src="/api/product-image/${p.id}" alt="${esc(p.name)}">`:`<div class="product-fallback">${esc(p.icon||'📦')}</div>`;
      return `<article class="product"><div class="product-cover">${img}<span class="badge">${esc(p.badge||'VYRO')}</span></div><div class="product-content"><small>${esc(p.category||'Sản phẩm số')}</small><h3>${esc(p.name)}</h3><p>${esc(p.summary||'')}</p><ul class="benefits">${(p.benefits||[]).map(x=>`<li>${esc(x)}</li>`).join("")}</ul><div class="price">${p.isFree?"Miễn phí":money(p.price)}</div><button class="gold full" onclick="orderProduct(${p.id})">${p.isFree?"Nhận sản phẩm":"Mua ngay"}</button></div></article>`;
    }).join("")
  }catch(e){productGrid.innerHTML=`<div class="empty-product"><h3>Không tải được sản phẩm</h3><p>${esc(e.message)}</p></div>`}
}
async function register(){try{const ref=regRef.value||new URLSearchParams(location.search).get("ref")||localStorage.getItem("vyro_ref")||"";const d=await api("/api/auth/register",{method:"POST",body:JSON.stringify({name:regName.value,email:regEmail.value,password:regPass.value,ref})});token=d.token;localStorage.setItem("vyro_token",token);closeAuth();await loadDashboard();scrollToId("member")}catch(e){authMsg.textContent=e.message}}
async function login(){try{const d=await api("/api/auth/login",{method:"POST",body:JSON.stringify({email:loginEmail.value,password:loginPass.value})});token=d.token;localStorage.setItem("vyro_token",token);closeAuth();await loadDashboard();scrollToId("member")}catch(e){authMsg.textContent=e.message}}
async function orderProduct(id){
  if(!token){openAuth("register");return}
  try{
    const d=await api("/api/orders",{method:"POST",body:JSON.stringify({productId:id})});
    if(d.order.status==="paid"){alert("Đã mở sản phẩm trong Member Center.");await loadDashboard();return}
    currentPaymentOrder=d.order;
    await openBlockchainPayment(d.order);
  }catch(e){alert(e.message)}
}
async function getPaymentConfig(){if(!paymentConfig)paymentConfig=await api("/api/payment-config");return paymentConfig}
async function openBlockchainPayment(order){
  const cfg=await getPaymentConfig();
  $("payPlan").textContent=order.productName;
  $("payAmount").textContent=money(order.amount);
  $("payNetwork").textContent=`${cfg.token} • ${cfg.network}`;
  $("payWallet").textContent=cfg.walletAddress;
  $("payQr").src=cfg.qrImageUrl;
  $("payOrderCode").textContent=order.paymentNote;
  $("payWarning").textContent=cfg.note;
  $("payProduct").value=`${order.productName} - ${money(order.amount)}`;
  $("paymentModal").classList.remove("hidden");
}
function closePayment(){$("paymentModal").classList.add("hidden")}
async function copyWallet(){await navigator.clipboard.writeText($("payWallet").textContent);alert("Đã copy địa chỉ ví USDT BEP20.")}
async function submitBlockchainPayment(e){
  e.preventDefault();
  if(!currentPaymentOrder)return;
  const fd=new FormData(e.target),btn=$("paySubmit");
  try{
    btn.disabled=true;btn.textContent="Đang gửi xác nhận...";
    const d=await api(`/api/orders/${currentPaymentOrder.id}/payment-proof`,{method:"POST",body:fd});
    alert("Đã gửi TXID. Admin sẽ đối chiếu giao dịch trên BscScan rồi kích hoạt sản phẩm.");
    closePayment();e.target.reset();await loadDashboard();
  }catch(err){alert(err.message)}
  finally{btn.disabled=false;btn.textContent="Gửi xác nhận thanh toán"}
}
async function loadDashboard(){if(!token){dashBox.innerHTML=`<div class="glass-card"><b>Kích hoạt Member Center</b><p class="muted">Tạo tài khoản để tải sản phẩm miễn phí, đặt mua gói trả phí và nhận link đối tác.</p><button class="gold" onclick="openAuth('register')">🚀 Kích hoạt ngay</button></div>`;return}try{const d=await api("/api/dashboard"),u=d.user,ref=`${location.origin}/?ref=${esc(u.refCode)}`;dashBox.innerHTML=`<h3>Chào mừng ${esc(u.name)}</h3><div class="cards"><div class="card"><span>Partner Code</span><br><b>${esc(u.refCode)}</b></div><div class="card"><span>Pending</span><br><b>${money(u.balancePending)}</b></div><div class="card"><span>Available</span><br><b>${money(u.balanceApproved)}</b></div><div class="card"><span>Network</span><br><b>${d.referredUsers.length}</b></div></div><h3>Link đối tác</h3><div class="copy"><input id="refLink" value="${ref}" readonly><button class="gold" onclick="copyRef()">Copy</button></div><h3>My Products</h3>${ordersTable(d.orders)}<h3>VYRO Wallet</h3><div class="admin-grid"><input id="wdAmount" placeholder="Số tiền"><input id="wdMethod" placeholder="Ngân hàng / USDT"><input id="wdAccount" placeholder="Thông tin nhận"><button class="gold" onclick="withdraw()">Gửi yêu cầu</button></div><h3>Partner Rewards</h3>${table(d.commissions,["id","productName","amount","rate","status","createdAt"])}<h3>Wallet History</h3>${table(d.withdrawals,["id","amount","method","account","status","createdAt"])}`}catch(e){localStorage.removeItem("vyro_token");token="";dashBox.innerHTML=`<p class="muted">Phiên đã hết hạn.</p><button class="gold" onclick="openAuth('login')">Vào lại Member Center</button>`}}
function ordersTable(rows){if(!rows.length)return"<p class='muted'>Chưa có sản phẩm.</p>";return`<table><thead><tr><th>ID</th><th>Sản phẩm</th><th>Giá</th><th>Trạng thái</th><th>Tải</th></tr></thead><tbody>${rows.map(o=>`<tr><td>${o.id}</td><td>${o.productName}</td><td>${money(o.amount)}</td><td>${o.status}</td><td>${o.downloadUnlocked?`<button class="gold" onclick="downloadProduct(${o.productId})">Download</button>`:"Đang khóa"}</td></tr>`).join("")}</tbody></table>`}
function table(rows,cols){if(!rows||!rows.length)return"<p class='muted'>Chưa có dữ liệu.</p>";return`<table><thead><tr>${cols.map(c=>`<th>${c}</th>`).join("")}</tr></thead><tbody>${rows.map(r=>`<tr>${cols.map(c=>`<td>${String(c).toLowerCase().includes("amount")?money(r[c]):(r[c]??"")}</td>`).join("")}</tr>`).join("")}</tbody></table>`}
function copyRef(){navigator.clipboard.writeText(refLink.value);alert("Đã copy link đối tác")}
async function downloadProduct(id){const r=await api("/api/download/"+id); if(!r.ok){alert(await r.text());return} const blob=await r.blob(); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="vyro-product"; a.click(); URL.revokeObjectURL(a.href)}
async function withdraw(){try{await api("/api/withdrawals",{method:"POST",body:JSON.stringify({amount:wdAmount.value,method:wdMethod.value,account:wdAccount.value})});alert("Đã gửi yêu cầu.");await loadDashboard()}catch(e){alert(e.message)}}
document.getElementById("logoTap").addEventListener("click",()=>{
  tapCount++;
  if(tapCount>=6){
    tapCount=0;
    document.getElementById("opsLogin").classList.remove("hidden");
  }
  setTimeout(()=>tapCount=0,2200);
})
async function openOperationCenter(){try{const d=await api("/api/auth/admin-login",{method:"POST",body:JSON.stringify({pass:opsPass.value})});token=d.token;localStorage.setItem("vyro_token",token);closeOpsLogin();opsPanel.classList.remove("hidden");await loadOps();scrollToId("opsPanel")}catch(e){opsMsg.textContent=e.message}}
async function loadOps(){
  const d=await api("/api/admin/overview");
  opsBox.innerHTML=`<div class="cards"><div class="card"><span>Doanh thu đã duyệt</span><br><b>${money(d.stats.revenue)}</b></div><div class="card"><span>Đơn chờ kiểm tra</span><br><b>${d.stats.pending}</b></div><div class="card"><span>Thành viên</span><br><b>${d.stats.userCount}</b></div><div class="card"><span>Tổng đơn</span><br><b>${d.stats.orderCount}</b></div></div>
  <div class="admin-product"><h3>Đăng sản phẩm</h3><form id="uploadForm">
    <div class="admin-grid"><label>Tên sản phẩm<input name="name" required></label><label>Danh mục<input name="category" value="Indicator"></label><label>Giá bán VNĐ<input name="price" type="number" min="0" value="0"></label><label>Hoa hồng %<input name="commissionRate" type="number" min="0" max="100" value="20"></label></div>
    <div class="admin-grid"><label>Nhãn<input name="badge" value="VYRO"></label><label>Biểu tượng<input name="icon" value="📦"></label><label>Loại<select name="productType"><option value="download">File tải về</option><option value="service">Dịch vụ/License</option></select></label><label>Hình thức<select name="isFree"><option value="false">Trả phí</option><option value="true">Miễn phí</option></select></label></div>
    <label>Ảnh sản phẩm<input name="imageFile" type="file" accept=".jpg,.jpeg,.png,.webp"></label>
    <label>Hoặc URL ảnh<input name="imageUrl" type="url" placeholder="https://..."></label>
    <label>File sản phẩm<input name="productFile" type="file" accept=".zip,.rar,.7z,.pdf,.ex5,.mq5,.txt,.mp4,.doc,.docx"></label>
    <label>Mô tả<textarea name="summary" required></textarea></label>
    <label>Lợi ích, mỗi dòng một ý<textarea name="benefits"></textarea></label>
    <button class="gold" type="submit">Đăng sản phẩm</button>
  </form></div>
  <h3>Đơn hàng blockchain</h3>${opsOrders(d.orders)}
  <button class="ok" onclick="approveCommissions()">Duyệt hoa hồng đang chờ</button>
  <h3>Sản phẩm</h3>${table(d.products,["id","name","category","price","commissionRate","active"])}
  <h3>Thành viên</h3>${table(d.users,["id","name","email","role","refCode","balanceApproved"])}
  <h3>Hoa hồng</h3>${table(d.commissions,["id","partnerId","productName","amount","status"])}
  <h3>Rút tiền</h3>${opsWithdraw(d.withdrawals)}`;
  uploadForm.onsubmit=uploadProduct
}
function opsOrders(rows){if(!rows.length)return"<p class='muted'>Chưa có đơn.</p>";return`<table><thead><tr><th>ID</th><th>User</th><th>Product</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows.map(o=>`<tr><td>${o.id}</td><td>${o.userId}</td><td>${o.productName}</td><td>${money(o.amount)}</td><td>${o.status}</td><td><button onclick="setOrder(${o.id},'paid')">Mark Paid</button> <button class="danger" onclick="setOrder(${o.id},'rejected')">Reject</button></td></tr>`).join("")}</tbody></table>`}
function opsWithdraw(rows){if(!rows.length)return"<p class='muted'>Chưa có yêu cầu.</p>";return`<table><thead><tr><th>ID</th><th>User</th><th>Amount</th><th>Method</th><th>Account</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows.map(w=>`<tr><td>${w.id}</td><td>${w.userId}</td><td>${money(w.amount)}</td><td>${w.method}</td><td>${w.account}</td><td>${w.status}</td><td><button onclick="setWithdrawal(${w.id},'approved')">Approve</button> <button class="danger" onclick="setWithdrawal(${w.id},'rejected')">Reject</button></td></tr>`).join("")}</tbody></table>`}
async function uploadProduct(e){e.preventDefault();try{await api("/api/admin/products",{method:"POST",body:new FormData(uploadForm)});alert("Đã publish sản phẩm.");await loadProducts();await loadOps()}catch(err){alert(err.message)}}
async function setOrder(id,status){await api(`/api/admin/orders/${id}/status`,{method:'POST',body:JSON.stringify({status})});await loadOps()}
async function approveCommissions(){await api("/api/admin/commissions/approve",{method:"POST",body:"{}"});alert("Đã duyệt rewards.");await loadOps()}
async function setWithdrawal(id,status){await api(`/api/admin/withdrawals/${id}/status`,{method:'POST',body:JSON.stringify({status})});await loadOps()}
const ref=new URLSearchParams(location.search).get("ref"); if(ref){localStorage.setItem("vyro_ref",ref.toUpperCase()); if(window.regRef) regRef.value=ref.toUpperCase()}
loadProducts();loadDashboard();
