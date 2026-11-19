# Biên bản rà soát nghiệm thu — DGVC 1.5.1

Phạm vi: lỗi, xử lý dữ liệu, nhập liệu, sửa/xóa, bố cục màn hình, giao diện, sao lưu/khôi phục.

## Lỗi tìm thấy và đã sửa trong 1.5.1
| # | Lỗi | Sửa | Kiểm chứng |
|---|-----|-----|-----------|
| 1 | Xuất sao lưu JSON từ kho SQLite làm **đóng kho đang chạy** → ghi đồng thời báo "Kho dữ liệu chưa mở" | Xuất từ bản chụp tạm, không đụng kho sống | `tests/acceptance.fixes.test.js` (đỏ trên code cũ) |
| 2 | Gõ tiền kiểu Việt "150.000" bị hiểu là 150 | Phân tích đúng dấu nghìn/thập phân ở cả giao diện lẫn máy chủ; chặn giá < 1.000 và > 1 tỷ; giới hạn độ dài tên/ghi chú mã đơn giá | `acceptance.fixes`, `ui.pricecodes.e2e` |
| 3 | Thông báo (toast) chồng lên nút **Lưu** của hộp thoại | Thông báo không chặn chuột; khi mở hộp thoại thì hiện ở trên cùng | `ui.pricecodes.e2e` |

## Ma trận nghiệm thu
| Hạng mục | Kết quả | Bằng chứng |
|---|---|---|
| Tính đơn giá, logic cũ giữ nguyên | Đạt | 228 test cũ không đổi |
| Mã đơn giá cha–con, giá cố định | Đạt | `pricecode`, `price.fixed`, e2e |
| Nhập liệu / xác nhận / chống bấm đúp | Đạt | `import.*`, idempotency |
| Sửa/xóa, khóa phiên bản (rowVersion) | Đạt | test hợp đồng + router |
| 19 màn hình ở 1366/1093/910 px | Đạt | không tràn, không lỗi JS (kiểm trực quan bằng Chromium) |
| Kho SQLite mặc định + tự nâng cấp từ JSON | Đạt | `electron.autoupgrade` (Electron thật) |
| Sao lưu tự động hằng ngày/tháng/an toàn | Đạt | `backup.lifecycle` |
| Khôi phục từ SQL hoặc JSON; xuất JSON gửi máy khác | Đạt | `backup.*`, `acceptance.fixes` |
| Bộ test | Đạt | JSON 240/240; SQLite 240 (1 bỏ qua theo thiết kế); Electron OK |
| Cài đặt trên **Windows thật** (NSIS, quyền thư mục, SQLite) | **Chưa xác minh** | môi trường kiểm thử là Linux |
| In ra máy in thật, đọc màn hình (screen reader) | **Chưa xác minh** | cần thiết bị thật |
