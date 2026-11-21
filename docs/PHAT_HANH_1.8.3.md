# DGVC 1.8.3

Bản cập nhật an ninh, tối ưu hiệu năng xuất báo cáo lớn và cải tiến đóng gói cho môi trường máy trạm Windows. **Không đổi cách tính giá** (`app/main/engine/*`), các kỳ đã tính giữ nguyên từng đồng số liệu. Không thay đổi schema CSDL.

## 🔴 Cải tiến An ninh & Phân quyền
- **Chặn triệt để lỗ hổng mở lại ngoại lệ "ADMIN đầu tiên" khi khôi phục bản sao lưu cũ:**
  - *Hiện trạng 1.8.2:* Kiểm tra ngoại lệ ADMIN đầu tiên dựa trên việc quét bảng `USERS` trong DB. Nếu khôi phục bản sao lưu cũ (chưa ai từng đặt mật khẩu hoặc bản mẫu), ngoại lệ mở lại khiến ai cũng có thể chiếm quyền đặt mật khẩu mới cho ADMIN mà không cần mã kích hoạt (setup code).
  - *Cải tiến 1.8.3:* Quản lý trạng thái máy qua tệp `machine-state.json` nằm tại thư mục cấu hình máy cục bộ (`userData` của Electron). Khi có bất kỳ ADMIN nào hoàn thành đặt mật khẩu, cờ máy `firstAdminCompleted: true` được ghi nhận vĩnh viễn. Khi người dùng khôi phục cơ sở dữ liệu cũ, tệp cấu hình máy không bị ghi đè, ngoại lệ `firstAdminOpen()` không bao giờ bị mở lại, bảo vệ tuyệt đối quyền quản trị.
  - Test kiểm chứng: `app/tests/auth.machine-lock.test.js`.

## 🟠 Tối ưu hiệu năng xuất báo cáo lớn (Streaming Excel)
- **Tự động kích hoạt cơ chế xuất luồng (Streaming WorkbookWriter):**
  - Khi xuất báo cáo danh sách phiếu cân hoặc bảng kê có quy mô từ **2.000 dòng trở lên**, hàm `writeTable` trong `app/main/reports/xlsxExport.js` tự động chuyển sang mô hình `ExcelJS.stream.xlsx.WorkbookWriter`.
  - Dữ liệu được ghi và commit theo từng dòng, giải phóng bộ nhớ heap của Node.js tức thì.
  - Ngăn ngừa hoàn toàn nguy cơ ứng dụng bị crash do lỗi tràn bộ nhớ (Heap Out Of Memory) trên các máy tính trạm cân cấu hình thấp (RAM 4GB).
  - Test kiểm chứng: `app/tests/report.stream.test.js` (xuất 2.500 dòng chỉ mất 250ms, đọc lại kiểm tra khớp từng ô).

## 🟡 Cải tiến Đóng gói & Vận hành trên Windows
- Bổ sung cấu hình `dist:win:dir` và `dist:win:portable` trong `package.json` cho phép xuất nhanh bản portable chạy ngay không cần cài đặt hoặc bản unpacked (`dist/win-unpacked/DGVC.exe`), phù hợp cho máy tính trạm cân không có quyền Administrator.
- Bổ sung hướng dẫn khắc phục lỗi PowerShell Script ExecutionPolicy (`npm.ps1 cannot be loaded`) trong tài liệu hướng dẫn.

## Kiểm thử & Nghiệm thu
- Toàn bộ 319 bài test: **Pass 100%** (trong đó có 2 bài test mới: `auth.machine-lock.test.js` và `report.stream.test.js`).
- Chế độ SQLite (`DGVC_STORAGE=sqlite`): Pass 100%.
- Đối chiếu số liệu Excel gốc (`verify-seed.js`): Khớp 100% cả 3 nhà máy ĐH, HAK, HAKQN.
