VYRO STORE V3.0.1 ADMIN FIX

Đã sửa lỗi không mở được Operation Center khi bấm logo VYRO 6 lần. Nguyên nhân: trùng tên id='opsLogin' với function opsLogin().

VYRO STORE V3 DIGITAL DOWNLOAD CORE

Có thể cho anh em chạy thử:
- Tạo tài khoản / Member Center
- Link đối tác ?ref=CODE
- Upload sản phẩm số trong Operation Center
- Sản phẩm Free: khách tạo tài khoản là tải được
- Sản phẩm Paid: khách đặt mua, Operation Center bấm Mark Paid thì mở Download
- Tự ghi nhận hoa hồng khi đơn Paid
- VYRO Wallet: yêu cầu thanh toán
- Operation Center ẩn: bấm logo VYRO 6 lần

Admin:
- Email: admin@vyrolab.cloud
- Member password: Abc12345@
- Hidden access pass: Abc12345@

Render:
- Web Service
- Build Command: npm install
- Start Command: node server.js

Lưu ý:
- File upload lưu trong thư mục storage/. Trên Render Free, storage có thể mất khi redeploy/restart. Cho anh em test thì OK.
- Bản kinh doanh thật nên nâng V4: PostgreSQL + Cloudinary/S3 storage + thanh toán tự động + license MT5.
