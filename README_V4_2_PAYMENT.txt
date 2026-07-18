VYRO STORE V4.2 – HỆ THỐNG THANH TOÁN GIỐNG VYRO.ID.VN

Tính năng:
- Khách bấm Mua ngay sẽ mở trang thanh toán dạng popup chuyên nghiệp.
- Hiện gói đã chọn, số tiền, phương thức, địa chỉ ví, QR và mã đơn.
- Form Họ tên, SĐT/Zalo, Email, TXID và ảnh biên nhận.
- Sau khi gửi, đơn chuyển sang trạng thái submitted.
- Admin xem thông tin khách, TXID, ảnh biên nhận và duyệt Đã thanh toán.
- Khi Admin duyệt paid, khách được mở quyền tải sản phẩm.
- Doanh thu chỉ tính đơn paid.

Biến môi trường mới trên Render:
PAYMENT_METHOD=USDT BEP20
PAYMENT_WALLET=địa_chỉ_ví_thật
PAYMENT_QR_URL=https://link-ảnh-qr-thật
PAYMENT_NOTE=Gửi đúng số tiền và mã đơn
SUPPORT_PHONE=số_điện_thoại_hỗ_trợ
SUPPORT_EMAIL=email_hỗ_trợ

Giữ nguyên các biến cũ:
DATABASE_URL, NODE_ENV, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD,
ADMIN_HIDDEN_PASSWORD, BANK_INFO, MAX_UPLOAD_MB, PUBLIC_BASE_URL

Deploy:
Build Command: npm install
Start Command: npm start
Sau khi đẩy GitHub: Render → Manual Deploy → Clear build cache & deploy.

Lưu ý:
Render Free dùng filesystem tạm. Ảnh biên nhận và file upload có thể mất sau restart/redeploy.
Muốn vận hành thật lâu dài nên dùng Persistent Disk hoặc Cloudflare R2/S3.
