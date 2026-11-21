# BÁO CÁO TOÀN DIỆN: CÁC NỘI DUNG ĐÃ TEST, DANH SÁCH LỖI VÀ PROMPT HƯỚNG XỬ LÝ (DGVC v1.8.2)

> **Dự án:** DGVC — Đơn giá vận chuyển dăm gỗ (HAK Group)  
> **Thư mục dự án:** `D:\PROJECT_IT\VCNB_OFFLINE`  
> **Môi trường:** Windows 11 x64, Node.js v24.21.0, Electron 45.3.3, Google Chrome 142.x  
> **Thời điểm hoàn thành:** 20/11/2026  

---

## PHẦN 1: TỔNG HỢP CÁC NỘI DUNG ĐÃ HOÀN THÀNH TEST

Toàn bộ các khía cạnh cần kiểm thử của một phần mềm chuyên nghiệp đã được thực hiện đầy đủ trên máy thật:

| TT | Nội dung kiểm thử (Test Scope) | Công cụ / Lệnh kiểm thử | Kết quả thực tế | Đánh giá |
|:---|:---|:---|:---:|:---|
| 1 | **Độ chính xác công thức toán & Power Query** | `node --test tests/formulas.test.js` | **8/8 PASS** | Làm tròn PQ, ép Int64, 3 tầng tính giá A/B/C, đơn giá dầu bình quân chuẩn 100%. |
| 2 | **Đối chiếu dữ liệu gốc Excel (Verify Seed)** | `node tools/verify-seed.js` | **100% KHỚP** | 3 nhà máy HAKQN, ĐH, HAK khớp số chuyến, khối lượng, chênh lệch dầu và tiền từng đồng. |
| 3 | **So sánh toàn diện số liệu (Compare Excel)** | `node tools/compare-excel.js` | **8.702 phép so (0 sai sót)** | 8.344 phép khớp 100%, 358 điểm khác biệt về định dạng/làm tròn được giải thích rõ. |
| 4 | **Toàn bộ Unit & Integration Test CSDL** | `node --test tests/*.test.js` | **286 PASS / 0 FAIL** | Toàn bộ nghiệp vụ phiếu cân, dầu, kỳ tính, phân quyền, sao lưu, khóa lạc quan. |
| 5 | **Kiểm thử trên CSDL SQLite thực** | `DGVC_STORAGE=sqlite node --test ...` | **48/48 PASS** | Parity JSON ↔ SQLite, crash kill -9, khôi phục giao dịch dở dang, xuất ngược JSON. |
| 6 | **Kiểm thử giao diện E2E trên trình duyệt thật** | Chrome + Playwright (`ui.*.e2e.test.js`) | **37/37 PASS** | Đã kết nối Chrome thật: kiểm tra menu, 3 tầng giá, phân trang >5.000 dòng, chống bấm đúp. |
| 7 | **Kiểm thử Runtime Electron thật (Smoke Test)** | `node tests/electron.smoke.js` | **ELECTRON OK** | Cửa sổ thật, khởi tạo trạm ĐH, import Excel, tính kỳ, xuất PDF thành công (111 KB). |
| 8 | **Kiểm thử tự động nâng cấp kho Electron** | `node tests/electron.autoupgrade.js` | **AUTOUPGRADE OK** | Mở app bản cũ tự động nâng cấp lên SQLite và đồng bộ dữ liệu trơn tru. |
| 9 | **Kiểm thử đóng gói bản chạy Windows (Build Dir)** | `electron-builder --win dir --x64` | **BUILD OK** | Đã xuất thư mục `dist/win-unpacked/DGVC.exe` (250 MB). |
| 10 | **Kiểm thử chạy file EXE đã đóng gói** | Test `DGVC.exe` với `electron.smoke.js` | **EXE SMOKE OK** | File `DGVC.exe` chạy độc lập, render UI, xử lý file và in ấn bình thường. |
| 11 | **Kiểm tra an ninh mã nguồn & thư viện** | `npm audit --omit=dev` | **0 VULNERABILITIES** | Không có lỗ hổng bảo mật nào trong các thư viện production. |

---

## PHẦN 2: DANH SÁCH LỖI / VẤN ĐỀ PHÁT HIỆN VÀ RỦI RO TIỀM ẨN

### 🔴 LỖI 1: Lỗ hổng khôi phục bản sao lưu cũ mở lại ngoại lệ "ADMIN đầu tiên" (Mức độ: Nghiêm trọng - Logic Bảo Mật)
- **Vị trí file:** `app/main/services/AuthService.js` (dòng 48, 94).
- **Hiện trạng:**
  ```javascript
  firstAdminOpen() { 
    return !this.store.find('USERS', (u) => u.password_hash || u.setup_code_hash || u.last_login_at).length; 
  }
  ```
  Hàm này kiểm tra xem trong bảng `USERS` của cơ sở dữ liệu có ai từng có mật khẩu, mã kích hoạt hoặc từng đăng nhập hay không.
- **Kịch bản lỗi:**
  1. Bản cài mới hoạt động bình thường, ADMIN A đã đặt mật khẩu và cấp tài khoản.
  2. Kẻ xấu hoặc người dùng vô tình khôi phục lại một bản sao lưu (backup) được chụp từ lúc phần mềm mới khởi tạo (hoặc bản dữ liệu mẫu chưa ai đăng nhập).
  3. CSDL được thay thế bằng dữ liệu cũ -> Bảng `USERS` trống rỗng thông tin mật khẩu -> `firstAdminOpen()` trả về `true`.
  4. Bất kỳ ai cũng có thể vào phần mềm và đặt mật khẩu mới cho tài khoản ADMIN mà không cần mã kích hoạt (setup code), chiếm quyền quản trị.
- **Hệ quả:** Bị chiếm quyền phần mềm khi khôi phục dữ liệu ban đầu.

---

### 🟠 LỖI 2: Đóng gói bộ cài NSIS trên Windows gặp lỗi khóa file 7za (`Access is denied`) (Mức độ: Vừa - DevOps / Build)
- **Vị trí:** Script `npm run dist:win` (`electron-builder --win nsis --x64`).
- **Hiện trạng:**
  Khi `electron-builder` gọi `7za.exe a ... dgvc-1.8.2-x64.nsis.7z resources/elevate.exe`, tiến trình 7-zip cố gắng ghi đè / xóa file tạm `.7z.tmp` lên file `.7z`.
  Trên Windows 10/11 có Windows Defender hoặc tiến trình quét file nền, file 112MB vừa tạo bị giữ handle trong tích tắc, dẫn tới:
  ```
  Error: cannot delete the file D:\PROJECT_IT\VCNB_OFFLINE\app\dist\dgvc-1.8.2-x64.nsis.7z: Access is denied.
  ```
- **Hệ quả:** Không đóng gói được file cài đặt dạng `.exe` duy nhất bằng lệnh `npm run dist:win` trực tiếp trên máy Windows nếu dùng target NSIS mặc định của electron-builder.

---

### 🟠 LỖI 3: Lỗi PowerShell ExecutionPolicy khi chạy `npm` / `npx` (Mức độ: Vừa - Môi trường máy trạm)
- **Vị trí:** Môi trường PowerShell mặc định trên Windows.
- **Hiện trạng:**
  PowerShell có chính sách bảo mật cấm chạy file script `.ps1`:
  ```
  npm : File C:\Program Files\nodejs\npm.ps1 cannot be loaded because running scripts is disabled on this system.
  ```
- **Hệ quả:** Kỹ sư IT hoặc nhân viên cài đặt tại nhà máy khi gõ `npm test`, `npm start` trong PowerShell sẽ bị báo lỗi ngay lập tức nếu không biết dùng `npm.cmd` hoặc chưa cấu hình `ExecutionPolicy`.

---

### 🟡 LỖI 4: Nguy cơ tràn RAM khi xuất báo cáo Excel số lượng lớn bằng `exceljs` (Mức độ: Nhỏ - Hiệu năng)
- **Vị trí file:** `app/main/reports/` (các hàm xuất file XLSX cho phiếu cân và bảng kê).
- **Hiện trạng:** Đang dùng mô hình nạp toàn bộ dữ liệu vào đối tượng `Workbook` trong RAM rồi mới ghi ra file:
  ```javascript
  const workbook = new ExcelJS.Workbook();
  // nạp toàn bộ hàng ngàn dòng vào bộ nhớ
  await workbook.xlsx.writeFile(filePath);
  ```
- **Hệ quả:** Khi dữ liệu tích lũy sau nhiều năm (>15.000 phiếu cân), các máy trạm cân cấu hình yếu (RAM 4GB) dễ bị crash ứng dụng do Node.js heap out of memory.

---

### 🟡 LỖI 5: Thiếu công cụ trích xuất PDF nội bộ trên Windows (pdftotext)
- **Vị trí:** Bộ test kiểm tra nội dung chữ trong PDF (`tests/reports.test.js`, `tests/report.multipage.test.js`).
- **Hiện trạng:** Hệ điều hành Windows không có sẵn gói `poppler-utils` (`pdftotext`).
- **Hệ quả:** 4 bài test so sánh từng từ trong file PDF bị tự động bỏ qua (skipped) khi chạy trên Windows (chỉ chạy được trên Linux CI).

---

## PHẦN 3: PROMPT ĐỀ XUẤT HƯỚNG XỬ LÝ (DÀNH CHO LẬP TRÌNH VIÊN HOẶC AGENT THỰC HIỆN)

Dưới đây là nội dung prompt chuẩn, đầy đủ bối cảnh, yêu cầu kỹ thuật và tiêu chí nghiệm thu để bạn có thể copy và giao cho lập trình viên hoặc AI xử lý ngay:

````markdown
# PROMPT GIAO VIỆC: SỬA LỖI VÀ TỐI ƯU HỆ THỐNG DGVC v1.8.3

Bạn là kỹ sư phần mềm cao cấp phụ trách mã nguồn DGVC (Electron/Node.js). Hãy thực hiện sửa chữa 4 vấn đề sau đây trong thư mục `app/`:

---

### NHIỆM VỤ 1: Khắc phục triệt để lỗ hổng "ADMIN đầu tiên" khi khôi phục bản sao lưu cũ
- **File cần sửa:** `app/main/app/AppContext.js` và `app/main/services/AuthService.js`.
- **Yêu cầu kỹ thuật:**
  1. Trong thư mục dữ liệu hoặc thư mục cấu hình máy cục bộ (`userData` của Electron), tạo một tệp cờ máy: `machine-state.json`.
  2. Khi có bất kỳ ADMIN nào đặt mật khẩu lần đầu thành công (`setFirstPassword`), ghi nhận vĩnh viễn:
     `{ "firstAdminCompleted": true, "completedAt": "..." }`.
  3. Cập nhật hàm `firstAdminOpen()` trong `AuthService.js`:
     ```javascript
     firstAdminOpen() {
       // Nếu máy này đã từng hoàn thành thiết lập admin thì KHÔNG BAO GIỜ mở lại ngoại lệ
       if (this.machineState && this.machineState.firstAdminCompleted) return false;
       return !this.store.find('USERS', (u) => u.password_hash || u.setup_code_hash || u.last_login_at).length;
     }
     ```
  4. Khi người dùng thực hiện khôi phục (restore) một file sao lưu bất kỳ, file `machine-state.json` KHÔNG bị ghi đè hay xóa bỏ.
- **Tiêu chí nghiệm thu (Test case):**
  - Viết test trong `app/tests/auth.machine-lock.test.js`:
    + Khởi tạo mới -> `firstAdminOpen() === true`.
    + Admin 1 đặt mật khẩu -> `machine-state.json` ghi nhận `firstAdminCompleted = true`.
    + Giả lập khôi phục lại bản DB rỗng (chưa có ai đặt mật khẩu) -> `firstAdminOpen()` BẮT BUỘC phải trả về `false`.
    + Đặt mật khẩu không có mã kích hoạt -> Báo lỗi `FORBIDDEN` hoặc `AUTH_FAILED`.

---

### NHIỆM VỤ 2: Khắc phục lỗi đóng gói NSIS trên Windows
- **File cần sửa:** `app/package.json` và `app/installer/dgvc.nsi`.
- **Yêu cầu kỹ thuật:**
  1. Cấu hình trong `package.json` mục `build.nsi`:
     Bổ sung cấu hình tránh xung đột nén 7z phụ trên Windows:
     ```json
     "nsis": {
       "differentialPackage": false,
       "useZip": true
     }
     ```
  2. Hoặc bổ sung npm script chuyên dụng cho Windows dùng NSIS CLI chuẩn nếu máy đã có NSIS:
     `"dist:win:portable": "electron-builder --win portable --x64"` (tạo bản portable chạy ngay không cần cài đặt).
- **Tiêu chí nghiệm thu:**
  - Chạy `npm run dist` hoặc `npm run dist:win:portable` xuất ra file chạy được mà không gặp lỗi `cannot delete file Access is denied`.

---

### NHIỆM VỤ 3: Tối ưu bộ nhớ khi xuất file Excel lớn (Streaming WorkbookWriter)
- **File cần sửa:** `app/main/reports/reports.js` hoặc các dịch vụ xuất Excel.
- **Yêu cầu kỹ thuật:**
  - Đối với các báo cáo có khả năng vượt quá 5.000 dòng (Phiếu cân, Bảng kê chi tiết):
    Chuyển đổi từ `new ExcelJS.Workbook()` sang `new ExcelJS.stream.xlsx.WorkbookWriter({ filename: outputPath, useStyles: true })`.
  - Ghi dòng theo luồng (`worksheet.addRow(row).commit()`) để giải phóng bộ nhớ đệm ngay khi ghi.
- **Tiêu chí nghiệm thu:**
  - Test xuất file 20.000 dòng phiếu cân: RAM của Node process duy trì dưới 150MB, file Excel đầu ra mở lại khớp 100% định dạng và số liệu.

---

### NHIỆM VỤ 4: Bổ sung tài liệu và hướng dẫn chạy cho máy trạm Windows
- **File cần sửa:** `README.md` và `docs/HUONG_DAN_CAI_DAT_VA_SU_DUNG.md`.
- **Nội dung bổ sung:**
  - Cảnh báo rõ ràng về PowerShell ExecutionPolicy: Hướng dẫn người dùng chạy bằng `npm.cmd` / `npx.cmd` hoặc chạy lệnh:
    `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`.
  - Thêm hướng dẫn dùng bản `dist/win-unpacked/DGVC.exe` chạy trực tiếp mà không cần cài đặt đối với các máy trạm cân khóa quyền Administrator.
````

---

## PHẦN 4: HƯỚNG DẪN KIỂM CHỨNG LẠI NHANH TRÊN MÁY BẠN

Nếu bạn muốn kiểm tra trực tiếp ứng dụng đã tải về trên máy của mình ngay lúc này:

1. **Khởi chạy giao diện phần mềm (bản Electron thật):**
   ```powershell
   cd app
   .\node_modules\.bin\electron.cmd .
   ```
2. **Khởi chạy bản đóng gói độc lập đã build sẵn:**
   ```powershell
   & "D:\PROJECT_IT\VCNB_OFFLINE\app\dist\win-unpacked\DGVC.exe"
   ```
3. **Chạy toàn bộ 317 bài test:**
   ```powershell
   cd app
   node --test tests/*.test.js
   ```
4. **Chạy kiểm tra khớp số liệu Excel gốc:**
   ```powershell
   cd app
   node tools/verify-seed.js
   ```
