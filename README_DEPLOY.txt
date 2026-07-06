
VYRO STORE V1 STABLE CORE

Tính năng:
- Tạo tài khoản / đăng nhập.
- Link affiliate riêng: http://domain/?ref=MACODE
- Khách đăng ký qua ref sẽ gắn vào đại lý.
- Mua demo sản phẩm sẽ tạo order và cộng hoa hồng pending.
- Dashboard đại lý: link giới thiệu, pending, approved, khách giới thiệu, rút tiền.
- Admin ẩn: bấm logo VYRO 6 lần.
- Admin thêm sản phẩm, xem user/order/commission, duyệt hoa hồng, duyệt rút tiền.

Admin:
- Email: admin@vyrolab.cloud
- Mật khẩu đăng nhập admin: Abc12345@
- Admin ẩn bấm logo 6 lần, mật khẩu: Abc12345@

Chạy trên VPS:
1. Giải nén ZIP.
2. Mở CMD trong thư mục.
3. Chạy:
   node server.js
4. Mở:
   http://localhost:3000

Chạy nền bằng PM2:
npm install -g pm2
pm2 start server.js --name vyro-store-v1
pm2 save

Render:
- New Web Service
- Build Command: npm install
- Start Command: node server.js

Ghi chú:
- V1 dùng database JSON file để dễ chạy.
- V2 nên nâng SQLite/PostgreSQL, thanh toán QR, upload file thật, license key MT5.
