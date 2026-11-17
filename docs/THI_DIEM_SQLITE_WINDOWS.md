# Thí điểm kho SQLite trên Windows (giai đoạn 3)

> **Trạng thái:** chuẩn bị xong công cụ và kiểm thử trên Linux/CI. Phần dưới đây phải chạy trên **máy Windows x64 thật** của một nhà máy — môi trường phát triển không có Windows nên chưa được xác minh (đánh dấu **Chưa xác minh** trong báo cáo lưu trữ).
> Ứng dụng đang phát hành **vẫn dùng kho JSON**; thí điểm này không ảnh hưởng người dùng khác.

## 0. Nguyên tắc an toàn
- Luôn làm trên **bản sao** thư mục dữ liệu trước (dry-run), chỉ chuyển thật khi dry-run đạt.
- Kho JSON gốc **không bị sửa/xóa**; đóng băng ≥ 30 ngày làm đường lui (Q8).
- Không chuyển khi thư mục dữ liệu nằm trong OneDrive / Google Drive / Dropbox hoặc ổ mạng (WAL cần `-shm`, trình đồng bộ có thể khóa/chụp giữa chừng). Chuyển dữ liệu sang ổ cục bộ cố định (vd `D:\DGVC_DATA`) trước.

## 1. Kiểm tương thích trên bộ cài thật (T-SQL-02)
1. Cài bộ cài thử (bản có `tests/electron.sqlite.main.js`) trên Windows x64, **cài đè** lên bản đang dùng — xác nhận dữ liệu JSON còn nguyên.
2. Chạy kiểm Electron + SQLite: `DGVC.exe` đóng gói chạy lệnh thử `electron.sqlite.main.js` (hoặc `npm run test:electron` trên máy dev Windows) — kỳ vọng dòng `ELECTRON SQLITE OK`.
3. Thử đường dẫn có **chữ Việt** trong tên người dùng, ổ `D:`, và **phần mềm diệt virus bật** (khóa `-wal/-shm`). Ghi lại lỗi nếu có.

## 2. Chạy thử trên bản sao (không đổi gì)
```bat
copy /E DGVC_DATA DGVC_DATA_THU
node tools\migrate-storage.js DGVC_DATA_THU
```
Kỳ vọng: `"verified": true`, `"sourceUnchanged": true`, số dòng từng bảng khớp. Lưu báo cáo cho kế toán trưởng ký bảng đối chiếu từng kỳ đã chốt (Q10).

## 3. Chuyển chính thức một nhà máy
1. Đóng ứng dụng. Sao lưu thủ công toàn bộ thư mục dữ liệu ra ổ khác.
2. `node tools\migrate-storage.js <thư mục dữ liệu> --apply` → kiểm `verified: true`.
3. Đặt `"storage": "sqlite"` trong `dgvc-config.json` (hoặc gọi `AppContext.migrateStorage()` khi giao diện có nút).
4. Mở ứng dụng; chạy chu kỳ tuần đủ: **nhập → tính → chốt → xuất → gửi gói → sao lưu** và so tổng từng kỳ đã chốt với báo cáo di chuyển.
5. Theo dõi 2–4 tuần; sao lưu hằng ngày vẫn chạy (zip có `dgvc.db`).

## 4. Đường lui
- **Chưa có giao dịch mới** (mới chuyển, chưa nhập/sửa gì): đặt lại `"storage": "json"` (hoặc `revertStorage`). Kho JSON đóng băng trùng khớp.
- **Đã có giao dịch mới:** `node tools\migrate-storage.js <thư mục> --export-json <thư mục trống mới>` rồi dùng "Dùng dữ liệu có sẵn" trỏ vào thư mục xuất. Kho JSON cũ không có các giao dịch mới nên **không** quay lại bằng cách đổi cấu hình.

## 5. Tiêu chí dừng
Dừng, không mở rộng sang nhà máy khác nếu: dry-run/chuyển thật không `verified`; tổng bất kỳ kỳ đã chốt khác nguyên trạng; ứng dụng báo `STORAGE_ERROR`/`INTEGRITY_ERROR` trên SQLite; diệt virus/OneDrive gây lỗi khóa; gói `.dgvc` giữa máy JSON và máy SQLite không nhập được; hiệu năng chậm đáng kể.

## 6. Phiếu ghi nhận kết quả (điền khi chạy thật)
| Mục | Kết quả | Ngày / người |
|---|---|---|
| Cài đè giữ dữ liệu |  |  |
| ELECTRON SQLITE OK trên Windows |  |  |
| Đường dẫn chữ Việt / ổ D: / diệt virus |  |  |
| Dry-run bản sao `verified` |  |  |
| Chuyển chính thức `verified` |  |  |
| Chu kỳ tuần nhập→tính→chốt→xuất→gửi gói |  |  |
| Kế toán trưởng ký đối chiếu kỳ đã chốt |  |  |
