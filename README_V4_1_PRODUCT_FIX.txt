VYRO STORE V4.1 – PRODUCT UPLOAD FIX

Đã sửa:
- Form đăng sản phẩm có nhãn rõ ràng.
- Có ảnh sản phẩm bằng file hoặc URL.
- Có ô file sản phẩm riêng.
- Hỗ trợ ZIP, RAR, 7Z, PDF, EX5, MQ5, MP4 và tài liệu.
- Cho phép sản phẩm dịch vụ/license không cần file tải.
- Trang khách hàng luôn có khu vực Kho sản phẩm.
- Khi chưa có dữ liệu sẽ hiện trạng thái trống rõ ràng.
- Sản phẩm đăng xong tự xuất hiện trên trang khách hàng.
- Sửa alias productId/productName ở Dashboard và Admin.
- Thông báo lỗi upload rõ hơn.

Render:
Build Command: npm install
Start Command: npm start

Environment giữ nguyên V4:
DATABASE_URL
NODE_ENV=production
JWT_SECRET
ADMIN_EMAIL
ADMIN_PASSWORD
ADMIN_HIDDEN_PASSWORD
BANK_INFO
MAX_UPLOAD_MB=50
PUBLIC_BASE_URL

Lưu ý: Render Free có filesystem tạm. File upload có thể mất khi redeploy/restart.
Để bán thật lâu dài: dùng Persistent Disk hoặc Cloudflare R2/S3.
