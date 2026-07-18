VYRO STORE V4 – BẢN CHẠY THẬT (THANH TOÁN DUYỆT THỦ CÔNG)

ĐÃ NÂNG CẤP:
- PostgreSQL thay db.json
- bcrypt 12 rounds cho mật khẩu
- JWT 7 ngày, không còn session Map
- Admin password/secret chuyển sang Environment Variables
- Rate limit, Helmet security headers
- Upload giới hạn dung lượng và whitelist định dạng
- Transaction khóa số dư khi rút tiền/duyệt hoa hồng
- Affiliate ghi nhận một lần theo order
- Chống path traversal khi tải file
- Frontend escape nội dung chính để giảm nguy cơ XSS

CHẠY TRÊN RENDER:
1. Tạo PostgreSQL trên Render.
2. Tạo Web Service từ GitHub.
3. Build Command: npm install
4. Start Command: npm start
5. Environment Variables: copy từ .env.example và điền giá trị thật.
6. Cần gắn Persistent Disk vào thư mục /opt/render/project/src/storage nếu muốn upload file không mất sau redeploy.

CHẠY VPS WINDOWS/LINUX:
- Cài Node 20 LTS
- Tạo PostgreSQL
- Copy .env.example thành .env
- npm install
- npm start

ADMIN:
- Bấm logo 6 lần.
- Mật khẩu cửa ẩn lấy từ ADMIN_HIDDEN_PASSWORD.
- Tài khoản admin lấy từ ADMIN_EMAIL / ADMIN_PASSWORD.

THANH TOÁN:
- Bản này chạy thật theo hình thức chuyển khoản thủ công.
- Khách tạo đơn pending_payment, admin kiểm tra tiền rồi Mark Paid.
- Khi Mark Paid: mở download và ghi hoa hồng affiliate.

CHƯA CÓ TRONG V4:
- Webhook VietQR/VNPAY/Momo tự động.
- Cloudflare R2/S3 storage.
- Email OTP/quên mật khẩu.
Những phần này cần tài khoản/API credentials của anh để tích hợp chính xác.
