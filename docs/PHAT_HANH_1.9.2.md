# DGVC 1.9.2

Nâng từ 1.9.1. Cách tính giá **không đổi** (so số tiền kỳ DH 88.900 và HAKQN 178.000 giữa 1.9.1 và 1.9.2: giống từng byte).

## Thay đổi
- **DM Đơn giá**: Mã đơn giá = Phương thức tính giá. Chỉ 2 dòng có sẵn: **PT-CD** (cố định) và **PT-TD** (điều chỉnh theo giá dầu); một bảng "Đơn giá theo tuyến" cho mỗi phương thức. Bỏ tạo/sửa/đóng mã, "Gán cho hợp đồng", "Chọn đơn giá có sẵn". Mã tự tạo ở bản cũ (nếu còn) vẫn hiện, dữ liệu không mất.
- **Form dòng giá theo giá dầu**: ĐG dự kiến ký HĐ tự tính (chỉ đọc) → ĐG tham khảo (+ nguồn bắt buộc) → chênh lệch (đ và %) → **Đơn giá ký hợp đồng** nhập tay, mặc định = dự kiến.
- **Màn Hợp đồng**: tab "Tuyến và đơn giá vận chuyển": một bảng tuyến + đơn giá đang áp dụng; "Thêm đơn giá" (chọn tuyến → chọn đơn giá, hoặc ngược lại) và "Gỡ". Chọn đơn giá cho hợp đồng = tạo dòng giá **riêng** của hợp đồng sao chép từ đơn giá đã chọn. **Sửa đơn giá gốc về sau không tự đổi dòng đã chọn cho hợp đồng.** Bỏ gán/đổi mã và nhập dầu ở hợp đồng (có chủ ý); thống kê giao nhận dầu theo tuyến chỉ đọc.
- **Luồng đối tác**: gói phiếu cân xuất kèm dầu; nhập gói không kỳ xử lý dầu chống trùng; nạp đợt thuê vận chuyển chống trùng (SHA-256, khóa phiếu); đọc Excel dầu và mẫu Excel dầu cho đối tác; nút "Tải file mẫu Excel"; "Nhập gói" nhận cả `.json`; Hướng dẫn có bảng "đối tác gửi gì → vào đâu".
- **Menu gộp**: nhóm "Nhập liệu" (Phiếu cân, Giao nhận dầu) và "Đối tác" (Trao đổi dữ liệu, Đối chiếu dữ liệu, Nhắc sửa danh mục). Phím tắt số 1..11 giữ nguyên.
- Báo cáo đối chiếu: `deductFuel` theo đợt khi API không gửi; `.dgvc/.json` đọc trực tiếp được chuẩn hóa như đường đợt.

## Lưu ý khi nâng cấp
- Sao lưu bằng "Sao lưu ngay", đóng DGVC rồi chạy bộ cài mới; dữ liệu giữ nguyên.
- Các nhà máy nên nâng cấp cùng đợt (gói trao đổi).
- **Đang chờ chủ sản phẩm quyết định:** nút ngừng/bật mã đơn giá tự tạo ở bản cũ không còn trong giao diện (API còn). Hiện giữ nguyên hành vi.

## Chưa kiểm
Dữ liệu thật của từng nhà máy trên Windows thật; máy in; hộp thoại chọn/lưu file của Electron; Excel thật của đối tác; bộ cài chưa ký số. Đã kiểm trên runner Windows của GitHub: cài mới, cài đè, gỡ cài, SQLite trong Electron.
