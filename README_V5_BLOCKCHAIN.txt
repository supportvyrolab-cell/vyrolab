VYRO STORE V5 BLOCKCHAIN PAYMENT

Đã nâng cấp trên đúng bản V4 người dùng gửi:
1. Thanh toán USDT qua BNB Smart Chain (BEP20).
2. Ví mặc định: 0xb6774793194c820dECAAb85d4c3D6FBC9b30b1B7
3. QR thanh toán đã tích hợp trong public/assets.
4. Khách nhập TXID chuẩn 0x + 64 ký tự và ảnh biên nhận.
5. Chặn TXID trùng giữa các đơn.
6. Admin mở TXID trên BscScan rồi mới bấm Đã nhận tiền.
7. Doanh thu chỉ tính đơn paid.
8. Form upload sản phẩm: ảnh, giá, hoa hồng, mô tả, file tải.
9. Trang khách hiển thị ảnh và nút Mua ngay.
10. Sản phẩm dịch vụ/license có thể không cần file.

LƯU Ý QUAN TRỌNG
- Đây là quy trình blockchain bán tự động an toàn: hệ thống nhận TXID, Admin đối chiếu on-chain và duyệt.
- Không tuyên bố tự động xác minh số USDT vì cần RPC/API blockchain chuyên dụng và kiểm tra log token.
- Render Free có ổ đĩa tạm; file upload và ảnh biên nhận có thể mất khi restart/redeploy.
- Chạy thật nên gắn Render Persistent Disk hoặc Cloudflare R2/S3.

Deploy Render:
Build Command: npm install
Start Command: npm start
Sau khi đẩy GitHub: Manual Deploy -> Clear build cache & deploy.
