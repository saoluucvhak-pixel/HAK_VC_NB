# DGVC 1.9.1

Bản phát hành đầu tiên sau 1.5.1 gồm toàn bộ thay đổi 1.6.1 → 1.9.0 và các sửa sau rà soát. Số 1.9.1 (không phải 1.9.0) vì thẻ `v1.9.0` đã tồn tại trên một commit cũ chưa được dựng thành công.

## Điểm chính
- **Giá 3 tầng** (Hình thức → Mã đơn giá → Dòng giá theo tuyến); nhãn "Đơn giá ký hợp đồng" / "ĐG ký HĐ". Cách tính giá **không đổi**.
- **Nâng cấp dữ liệu cũ tự động:** giá chung cũ và hợp đồng cũ được gắn mã mặc định `PT-TD`; **trước khi chuyển app tự tạo một bản sao lưu an toàn** (`truoc-chuyen-pt-td`). Hợp đồng có giá riêng vẫn dùng giá riêng; số tiền của dữ liệu cũ giữ nguyên từng đồng.
- Tuyến tính theo m³: chỉ nhân m³ khi đơn giá là **cố định** (đ/m³); đơn giá theo giá dầu (đ/tấn) vẫn tính theo tấn như bản cũ.
- Menu nhóm; màn Công ty & đối tác, Xe vận chuyển, Hợp đồng cha–con, Nhập dữ liệu thuê VC, Đối chiếu dữ liệu, Xuất dữ liệu gửi đối tác; màn "Trao đổi dữ liệu" (gói kỳ .dgvc) nằm trong nhóm "Đối chiếu & đồng bộ".
- Bảo mật: mã kích hoạt dùng một lần cho người dùng mới (1.6.1); cờ "ADMIN đầu tiên" theo từng bản cài; so sánh băm không còn làm sập đăng nhập.
- Excel nhiều trang lặp tiêu đề cột và có chân trang "Trang x/y".

## Lưu ý khi nâng cấp
- Sao lưu bằng "Sao lưu ngay", đóng DGVC rồi chạy bộ cài mới; dữ liệu giữ nguyên.
- Các nhà máy nên nâng cấp cùng đợt: gói trao đổi có cột mới; bản cũ nhận gói mới sẽ báo lỗi.
- Màn "Đơn giá" cũ (tạo phiên bản giá) đã gộp vào "DM Đơn giá".
- Chưa làm: ký số gói sao lưu/gói trao đổi, giới hạn đường dẫn/dung lượng ghi, chặn CSV injection (ghi nhận để làm sau).
- Bộ cài chưa ký số. Chưa kiểm trên dữ liệu thật của từng nhà máy và phần cứng máy in.
