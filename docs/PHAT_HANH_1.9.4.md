# DGVC 1.9.4

Nâng cấp từ bản 1.9.3. Cách tính toán tài chính cốt lõi **không đổi** (đối chiếu đối chứng độc lập 100% khớp Excel gốc 3 nhà máy HAK, HAKQN, ĐH).

## Các cải tiến & Sửa lỗi chính

### 1. Phân hệ Tính giá & Hợp đồng
- **Tuyến m³ theo giá dầu**:
  - Hỗ trợ chọn đơn vị tính `m³` trực tiếp trên dòng đơn giá đối với các tuyến vận chuyển tính theo thể tích (củi bìa, dăm gỗ thùng).
  - Đơn giá tham khảo được so sánh chính xác theo cước `DG_CUOC`.
- **Cảnh báo nhập liệu an toàn**:
  - Bổ sung xác nhận trước khi lưu đối với các giá trị thập phân quá nhỏ (định mức < 0,05; KL_TB, Thể tích TB < 1) để ngăn chặn lỗi gõ nhầm của nhân viên nhập liệu.

### 2. Giao diện & Trải nghiệm người dùng
- **Khắc phục chập chờn nút "Nhập gói"**:
  - Loại bỏ hiệu ứng cuộn mượt không cần thiết sau khi hiển thị kết quả nạp gói, giúp giao diện phản hồi tức thì và ổn định.
- **Tương phản hiển thị chuẩn WCAG 4.5:1**:
  - Tối ưu hóa màu chữ và nền trên cả 4 bảng màu (theme) để đảm bảo độ tương phản tối thiểu 4.5:1, bảo vệ mắt người vận hành máy tính liên tục.

### 3. Toàn vẹn dữ liệu Sao lưu & Báo cáo (P1/P2/P3 Fixes)
- **BUG-01 (P1 - Nghiêm trọng)**: Khắc phục lỗi bỏ sót dữ liệu phân hệ Thuê vận chuyển. `BackupService` và `SubcontractService` hiện tại đóng gói đầy đủ thư mục `subcontract/` kèm mã hash SHA-256 xác thực và tự động giải nén khôi phục an toàn khi restore.
- **BUG-02 (P2 - Báo cáo)**: File xuất Excel Bảng kê vận chuyển (`BKVC`) tự động nhận diện đơn vị tính `m³` khi hợp đồng vận chuyển tính theo mét khối (`Khối lượng (m³)` / `Thể tích (m³)` thay vì gán cứng chữ "Tấn").
- **BUG-03 (P3 - Kiểm thử đa nền tảng)**: Bộ kiểm thử `spec.schema-sync.test.js` tự động nhận diện lệnh Python khả dụng (`python3`, `python`, `py`), chạy mượt mà trên Windows 11 cũng như Linux CI.
- **DOC-04 (P3 - Tài liệu)**: Đồng bộ thông tin phiên bản nâng cấp `1.8.3 → 1.9.4` trong `README.md` và cung cấp đầy đủ tài liệu phát hành `PHAT_HANH_1.9.3.md`, `PHAT_HANH_1.9.4.md`.

## Hướng dẫn nâng cấp
1. Nhấn nút **"Sao lưu ngay"** trên phần mềm để lưu bản dự phòng an toàn.
2. Đóng phần mềm DGVC.
3. Cài đặt bản phát hành `DGVC-Setup-1.9.4.exe` (mọi cấu hình, chứng từ và dữ liệu SQLite/JSON được bảo toàn nguyên vẹn).
