# BƯỚC 15 — HOÀN THIỆN: GIAO DIỆN, ĐĂNG NHẬP, SAO LƯU, TRAO ĐỔI, BỘ CÀI

**Kết quả:**
- **Bộ cài Windows `DGVC-Setup-1.0.0.exe`** (94 MB) — **một bộ cài dùng cho mọi nhà máy**.
- **Test:** 105/105 test đạt, cộng thêm phép chạy thử bản Electron thật (cả bản đã đóng gói `app.asar`).
- **Chưa kiểm được trên máy Windows thật** (máy dựng không có Windows) — xem mục 6.

## 1. Chốt 25/09/2026 — bộ cài cho mọi nhà máy, không riêng HAKQN

| Nội dung | Cách làm |
|---|---|
| **1 bộ cài** | Lần đầu mở: chọn thư mục dữ liệu → chọn **đơn vị của máy** (HAK / HAKQN / ĐH / CNHAK) → (tùy chọn) gói danh mục mới nhất → (tùy chọn) USB / Google Drive. Danh mục đi kèm bộ cài dùng chung; bản cài chỉ nhận hợp đồng mà đơn vị mình là một bên. Kiểm tra: HAKQN có 3 hợp đồng, ĐH 1, HAK 1, CNHAK 1 (bên thuê) |
| **Không còn "bản gốc danh mục"** | Bản cài nào cũng sửa được tuyến, đơn giá, đơn vị, xe, hợp đồng, và xuất được gói danh mục (thay cho quy định cũ "HAKQN làm gốc") |
| **Nhắc sửa các nhà máy còn lại** | Mỗi lần sửa danh mục, phần mềm hiện *"Nhớ sửa giống ở các nhà máy còn lại: …"* và ghi 1 dòng vào màn hình **Nhắc sửa danh mục** (bảng mới `SYNC_REMINDER`). Danh sách nhà máy lấy từ `CONFIG.SYNC_TARGET_UNITS` = `HAK;HAKQN;DH;CNHAK`. Xuất gói danh mục cho nhà máy X thì X tự được đánh dấu đã nhận; nếu bên kia sửa tay thì bấm **Đã sửa tay**. Tổng quan cũng hiện việc cần làm theo từng nhà máy |
| **Hai nơi cùng sửa** | Khi nhận gói: bản đến mới hơn → cập nhật. Hai bên cùng sửa một mục → báo **xung đột**, người dùng chọn giữ bản này hoặc lấy bản đến (mặc định giữ) |

## 2. Phần mềm gồm những gì

| Phần | Nội dung | Kiểm thử |
|---|---|---|
| **Khởi tạo + đăng nhập** | 4 bước khởi tạo; tạo mới hoặc dùng thư mục dữ liệu có sẵn. Mật khẩu băm scrypt, đặt lần đầu (≥ 8 ký tự, có chữ và số). Sai 5 lần → khóa 15 phút. Phiên hết sau 60 phút không thao tác. Vai trò ADMIN / Kế toán / Chỉ xem; ADMIN đặt lại mật khẩu | `app.e2e.test.js` (không lưu mật khẩu gốc, quyền từng vai trò) |
| **Giao diện 15 màn hình** | Tổng quan · Phiếu cân · Giao nhận dầu · Danh mục tuyến · Hợp đồng · Đơn giá · Tính giá (+ xem chi tiết tính 15 bước) · Bảng xác nhận KL (xem trước A4, in, xuất, diễn giải hóa đơn) · Chi tiết vận chuyển · Kiểm tra dữ liệu · Báo cáo · Trao đổi dữ liệu · Nhắc sửa danh mục · Lịch sử thao tác · Cài đặt | `ui.e2e.test.js`: Chromium bấm hết luồng chính; mở từng màn hình và các hộp sửa, **0 lỗi JavaScript** |
| **Sao lưu / khôi phục** | Tự động mỗi ngày (giữ 30 bản), mỗi tháng (giữ 24 bản); sao lưu thủ công; bản an toàn trước khi khôi phục / nhập gói / đổi thư mục. Tự chép ra **USB / Google Drive**. Khôi phục có kiểm SHA-256 và bắt ghi lý do. Đổi thư mục dữ liệu sang ổ D: | khôi phục đưa dữ liệu về đúng lúc sao lưu; file sao lưu bị sửa → từ chối |
| **Trao đổi `.dgvc`** | Gói kỳ tính (bên vận chuyển → bên thuê; bên nhận chỉ xem, in lại được) · gói danh mục (từ bất kỳ nhà máy nào) · gói phiếu cân. Bước xem trước chia mới / đã có / cập nhật / xung đột / từ chối; kiểm toàn vẹn SHA-256 | ĐH gửi kỳ → HAKQN nhận: 88.900 đ/tấn, 139.421.905 đ. Gói bị sửa → từ chối. Gửi nhầm cho bản cài không phải bên thuê → từ chối |
| **Danh mục** | Đơn vị, xe, hợp đồng: tên in chứng từ, mẫu diễn giải hóa đơn, phạm vi xe kèm **Gợi ý xe**, người ký theo thứ tự ưu tiên | có |
| **Vỏ Electron** | 1 cửa sổ; preload chỉ lộ đúng `window.dgvc.api` (giao diện không có quyền Node); hộp thoại Windows; in trực tiếp; PDF bằng printToPDF; khóa thư mục dữ liệu khi có 2 cửa sổ / 2 máy mở cùng lúc; menu tiếng Việt; ngày hiển thị dd/MM/yyyy | `tests/electron.smoke.js`: khởi tạo ĐH → import → tính 88.900 → xuất PDF |
| **Bộ cài** | NSIS, cài cho người dùng (không cần quyền quản trị), lối tắt ở màn hình và menu Start, gỡ cài **không xóa dữ liệu**. Cài bản mới đè lên bản cũ, dữ liệu giữ nguyên | kiểm nội dung bộ cài; `app.asar` đã đóng gói chạy đủ luồng |

## 3. Sửa / bổ sung trong lúc làm
- **Kiểm tra "xem trước đã cũ" khi nhập gói:** trước đây so cả số phiên bản dữ liệu nên bị báo nhầm vì sao lưu tự động cũng làm tăng số đó. Nay chỉ so các bản ghi mà gói thực sự chạm tới.
- **Gói ví dụ `api_examples/DH-HAKQN_20260918-20260923.dgvc`:** dựng lại bằng chính phần mềm (định dạng số JSON chuẩn), kèm `exchange.previewPackage.json`.
- **Tài liệu API, lưu trữ, giao diện:** cập nhật theo quyết định "không riêng HAKQN"; thêm các action `setup.units`, `sync.list`, `sync.markDone`, `contracts.setActive`, `contracts.vehicles`, `reports.html`.

## 4. Thư mục giao
- `DGVC-Setup-1.0.0.exe` — bộ cài Windows 64-bit.
- `HUONG_DAN_CAI_DAT_VA_SU_DUNG.md` — cài đặt, khởi tạo từng nhà máy, công việc hằng kỳ, nhắc sửa danh mục, sao lưu, sự cố.
- `man_hinh_buoc15/` — 17 ảnh chụp màn hình thật (bản trình duyệt + bản Electron).
- `dgvc_buoc15.zip` — mã nguồn đầy đủ (không gồm `node_modules`, `dist`), test, công cụ, tài liệu.

## 5. Cách chạy lại / đóng gói
Xem `app/README.md`. Tóm tắt:
- `npm test` — chạy toàn bộ test.
- `npm run test:electron` — chạy thử bản Electron.
- `npm run dist` — tạo `dist/DGVC-Setup-x.y.z.exe`.
- Trên máy Windows có Node.js: `npm run dist:win` (electron-builder tự tạo bộ cài và gắn biểu tượng vào `DGVC.exe`).

## 6. Giới hạn cần biết
1. **Chưa kiểm được trên Windows thật.**
   - Đã chạy đủ luồng bằng bản Electron cùng phiên bản trên Linux, và với chính `app.asar` đã đóng gói.
   - **Đề nghị:** cài thử trên 1 máy mỗi nhà máy, chạy hết mục 3 của hướng dẫn trước khi dùng chính thức.
2. **Bộ cài chưa ký số.** Lần đầu chạy, Windows SmartScreen cảnh báo → bấm **Thông tin thêm → Vẫn chạy**. Muốn hết cảnh báo cần mua chứng thư ký mã (code-signing).
3. **File `DGVC.exe` còn mang biểu tượng Electron** (biểu tượng ở lối tắt, cửa sổ và danh sách gỡ cài đã là biểu tượng DGVC). Dựng bằng `npm run dist:win` trên Windows thì exe cũng có biểu tượng DGVC.
4. **Mỗi bản cài dùng 1 thư mục dữ liệu trên 1 máy.** Có khóa chống 2 máy mở cùng lúc. Không nên để thư mục dữ liệu trên ổ mạng dùng chung — dùng gói `.dgvc` để trao đổi giữa các nhà máy.
