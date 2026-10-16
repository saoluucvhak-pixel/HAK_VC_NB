
## 6. Luồng gọi API cho các nghiệp vụ chính

**6.1. Cài đặt lần đầu** — `setup.status` → `dialog.openFolder` → `setup.init(NEW, unitCode, admin)` hoặc `setup.init(OPEN_EXISTING)` / nạp gói DANH_MUC → `auth.login`.

**6.2. Import phiếu cân từ file Excel trạm cân**
```
dialog.openFile → import.preview(PHIEU_CAN, filePath) → (sửa mapping → import.preview lại) → import.previewRows (xem dòng lỗi)
  → import.confirm(batchId, skipRowNos, acceptWarnings, clientRequestId)
```

**6.3. Bảng kê dầu của hợp đồng** — như 6.2 với `GIAO_NHAN_DAU` + `contractId`, hoặc `fuel.saveRows`; dòng nghi trùng đã kiểm tra → `fuel.ackFlags`.

**6.4. Lập kỳ, tính giá, in, khóa**
```
periods.preview(contractId, dateFrom, dateTo, routeCode) → periods.calculate(…, clientRequestId)
  → calc.tickets / calc.fuel / calc.trace (XEM CHI TIẾT TÍNH)
  → reports.bkvc → reports.print hoặc dialog.saveFile + reports.export(BKVC, PDF)
  → periods.confirm → periods.lock
```

**6.5. Gửi kỳ cho bên thuê** (vd ĐH → HAKQN)
```
Bản ĐH:    periods.confirm → dialog.saveFile → exchange.exportPackage(KY_TINH, periodIds, targetUnitCode=HAKQN)  → gửi file .dgvc (USB / Zalo / email)
Bản HAKQN: dialog.openFile → exchange.previewPackage(filePath) → exchange.importPackage(exchangeId) → periods.get / reports.bkvc (chỉ xem, in lại được)
```

**6.6. Đồng bộ danh mục** — bản gốc (HAKQN): `exchange.exportPackage(DANH_MUC)` → bản khác: `exchange.previewPackage` → chọn xử lý xung đột → `exchange.importPackage`.

**6.7. Sửa dữ liệu sau khi tính** — `tickets.update` / `fuel.update` trả `affectedPeriods`; kỳ `NHAP` → `needs_recalc` (xác nhận bị chặn `E_NEEDS_RECALC` đến khi tính lại). Kỳ đã xác nhận/khóa phải `periods.reopen` / `periods.unlock` trước (ADMIN hoặc `can_unlock`, có lý do); nếu kỳ đã gửi đi → xuất lại gói KY_TINH (`calc_version` mới thay bản cũ ở bên nhận).

**6.8. Sao lưu, khôi phục** — tự động hằng ngày; `data.backupNow`; `data.listBackups` → `data.restore(backupPath, reason)`.

## 7. "XEM CHI TIẾT TÍNH" (`calc.trace`)

`trace_json.steps[]`: `key`, `label`, `formula`, `expr` (thay số), `value`, `unit`, `drill` (`calc.tickets` / `calc.fuel`). Ví dụ thật — HAKQN-QS, VC.007, 18–23/09/2026:

| # | Bước | Công thức | Thay số | Kết quả |
|---|---|---|---|---|
| 1 | ĐG 1 chuyến | Đơn giá mới × KL_TB | 165.000 × 18 | 2.970.000 đ/chuyến |
| 2 | Tiêu hao NL/chuyến | Cự ly chuyến × Định mức (lít/km) | 144 × 0,4 | 57,60 lít |
| 3 | Tiền dầu/chuyến | ĐG dầu chưa VAT (danh mục) × Tiêu hao NL/chuyến | 15.500 × 57,6 | 892.800 đ |
| 4 | Tỷ lệ tiêu hao dầu | Tiền dầu / ĐG 1 chuyến | 892.800 / 2.970.000 | 30,06 % |
| 5 | ĐGVC chưa diesel | (ĐG 1 chuyến − Tiền dầu) / KL_TB | (2.970.000 − 892.800) / 18 | 115.400 đ/tấn |
| 6 | ĐG HĐ | ROUND(ĐGVC chưa diesel; -3) [HALF_EVEN] | ROUND(115.400,00; -3) | 115.000 đ/tấn |
| 7 | Số chuyến | số phiếu cân | 326 phiếu | 326 chuyến |
| 8 | Tổng khối lượng | Σ KL hàng (KG) / 1000 | 6.143.680 / 1000 | 6.143,68 tấn |
| 9 | Dầu thực nhận | Σ số lượng bảng kê dầu của hợp đồng | Σ 18 dòng (2026-09-20 → 2026-09-23) | 5.853 lít |
| 10 | Đơn giá dầu | Trung bình cộng đơn giá các dòng (chưa VAT) | TB(18 dòng) | 29.940 đ/lít |
| 11 | Dầu định mức | Cự ly chuyến × Số chuyến × Định mức | 144 × 326 × 0,4 | 18.777,60 lít |
| 12 | Chênh lệch dầu | Dầu định mức − Dầu thực nhận | 18.777,60 − 5.853,00 | 12.924,60 lít |
| 13 | ĐG CL Diesel | Chênh lệch × Đơn giá dầu / Tổng tấn | 12.924,60 × 29.940,00 / 6.143,68 | 62.985,46 đ/tấn |
| 14 | ĐG VC trước làm tròn | ĐG HĐ + ĐG CL Diesel | 115.000 + 62.985,46 | 177.985,46 đ/tấn |
| 15 | Đơn giá vận chuyển | < 0 → 0; ngược lại ROUND(…; -2) [HALF_EVEN] | ROUND(177.985,46; -2) | 178.000 đ/tấn |

## 8. Mã lỗi

### 8.1. `error.code`

| Mã | Ý nghĩa |
|---|---|
| `SESSION_EXPIRED` | Chưa đăng nhập / hết phiên (không thao tác quá SESSION_IDLE_MINUTES) |
| `AUTH_FAILED` | Sai tên đăng nhập hoặc mật khẩu |
| `ACCOUNT_LOCKED` | Sai mật khẩu quá LOGIN_MAX_FAILED lần — khóa LOGIN_LOCK_MINUTES phút |
| `PASSWORD_NOT_SET` | Tài khoản chưa có mật khẩu → auth.setFirstPassword |
| `FORBIDDEN` | Không có quyền với action / hợp đồng này |
| `NOT_FOUND` | Không tìm thấy bản ghi |
| `VALIDATION_FAILED` | Dữ liệu vào sai kiểu / thiếu trường; details = [{field, code, message}] |
| `DUPLICATE` | Trùng khóa duy nhất (ticket_key, contract_code, …) |
| `CONFLICT_VERSION` | Bản ghi đã đổi kể từ lúc mở (row_version khác) — tải lại |
| `DATA_LOCKED` | Thư mục dữ liệu đang được mở bởi APP khác (file khóa .lock) — đóng APP kia hoặc xác nhận khóa cũ đã chết |
| `STORAGE_ERROR` | Lỗi đọc/ghi file (đầy ổ, không có quyền, file đang bị chương trình khác giữ) — giao dịch đã hoàn tác |
| `INTEGRITY_ERROR` | File dữ liệu không khớp SHA-256 trong manifest / JSON hỏng — đề nghị khôi phục bản sao lưu |
| `BUSINESS_RULE` | Vi phạm luật nghiệp vụ; details.code = mã E_… bên dưới |
| `INTERNAL` | Lỗi chương trình — đã ghi logs/, trả requestId để tra |

### 8.2. Mã kiểm tra dữ liệu (`details.code`, `issues[].code`, `validation_flags`)

`ERROR` chặn; `WARNING` hiển thị, xác nhận được (`ackFlags`); `INFO` thông tin. (*n) = 10 lỗi bắt buộc của yêu cầu §23.

| Mã | Mức | Nội dung hiển thị | Dùng ở |
|---|---|---|---|
| `E_TICKET_DUPLICATE` | ERROR | (*1) Phiếu cân trùng (ticket_key đã tồn tại / trùng trong file) | import, tickets.update |
| `E_ROUTE_MISSING` | ERROR | (*2) Không có mã tuyến | import, validation |
| `E_ROUTE_NOT_FOUND` | ERROR | (*3) Mã tuyến không tồn tại | import, validation, periods |
| `E_PRICE_NOT_FOUND` | ERROR | (*4) Không có đơn giá (không có phiên bản giá hiệu lực) | periods |
| `E_FUEL_NORM_MISSING` | ERROR | (*5) Không có định mức dầu | prices, periods |
| `E_NO_FUEL` | ERROR | (*6) Không có dầu thực nhận cho tuyến trong bảng kê của hợp đồng (override được, cần lý do) | periods |
| `E_TOTAL_KG_ZERO` | ERROR | (*7) Tổng KL = 0 | periods |
| `E_PRICE_NEGATIVE` | ERROR | (*8) Đơn giá âm | prices, fuel |
| `E_DISTANCE_INVALID` | ERROR | (*9) Cự ly ≤ 0 | routes, periods |
| `E_FUEL_NORM_INVALID` | ERROR | (*10) Định mức dầu ≤ 0 | prices, periods |
| `E_KG_INVALID` | ERROR | KL hàng ≤ 0 | import |
| `E_DATE_INVALID` | ERROR | Ngày sai / Ngày cân 2 < Ngày cân 1 | import |
| `E_PLATE_FORMAT` | ERROR | Biển số phiếu cân sai định dạng | import |
| `E_VEHICLE_NOT_FOUND` | ERROR | Mã xe (phiếu/dầu) không quy đổi được về xe trong danh mục | import, fuel |
| `E_TICKET_USED_IN_PERIOD` | ERROR | Phiếu cân này đã được sử dụng trong kỳ tính [Mã kỳ]. Không thể đưa vào kỳ mới. | periods |
| `E_FUEL_USED_IN_PERIOD` | ERROR | Dòng dầu này đã được sử dụng trong kỳ tính [Mã kỳ]. Không thể đưa vào kỳ mới. | periods |
| `E_MULTI_FUEL_GROUP` | ERROR | Tuyến có dầu từ nhiều Đơn vị giao / ĐVT (Excel sẽ nhân dòng) | periods |
| `E_PRICE_VERSION_SPLIT` | ERROR | Kỳ cắt ngang 2 phiên bản giá — tách kỳ | periods |
| `E_PRICE_DATE_OVERLAP` | ERROR | Ngày hiệu lực giá trùng / trước phiên bản đang ACTIVE | prices |
| `E_PRICE_USED` | ERROR | Phiên bản giá đã dùng trong kỳ — không sửa, hãy tạo phiên bản mới | prices |
| `E_NOT_CARRIER` | ERROR | Đơn vị của bạn không phải bên vận chuyển của hợp đồng | contracts, periods, fuel |
| `E_CONTRACT_INACTIVE` | ERROR | Hợp đồng ngừng / hết hiệu lực trong kỳ | periods |
| `E_SAME_PARTY` | ERROR | Bên thuê trùng bên vận chuyển | contracts |
| `E_PERIOD_STATUS` | ERROR | Thao tác không hợp lệ với trạng thái kỳ hiện tại | periods.* |
| `E_NEEDS_RECALC` | ERROR | Dữ liệu nguồn đã sửa sau lần tính — tính lại trước khi xác nhận | periods.confirm |
| `E_CALC_BLOCKED` | ERROR | Còn lỗi chặn — xem issues | periods.calculate |
| `E_TICKET_LOCKED` | ERROR | Phiếu nằm trong kỳ đã xác nhận/khóa — không sửa được | tickets.update |
| `E_FUEL_LOCKED` | ERROR | Dòng dầu nằm trong kỳ đã xác nhận/khóa | fuel.update |
| `E_IN_USE` | ERROR | Đang được dùng — chỉ ngừng sử dụng, không xóa | setActive, softDelete |
| `E_PREVIEW_STALE` | ERROR | Dữ liệu đã đổi kể từ lúc preview — preview lại | import.confirm |
| `E_IMPORT_HAS_ERRORS` | ERROR | Còn dòng lỗi chưa bỏ | import.confirm |
| `E_MAPPING_REQUIRED` | ERROR | Chưa map đủ cột bắt buộc | import.preview |
| `E_LAST_ADMIN` | ERROR | Không thể bỏ quyền ADMIN cuối cùng | users.save |
| `E_PASSWORD_ALREADY_SET` | ERROR | Tài khoản đã có mật khẩu — dùng đổi mật khẩu | auth.setFirstPassword |
| `E_READONLY_IMPORTED` | ERROR | Kỳ nhận từ gói của bản cài khác — chỉ xem, không tính lại/sửa | periods.* |
| `E_PACKAGE_SCHEMA` | ERROR | Gói tạo từ phiên bản dữ liệu khác, không nhập được — cập nhật APP | exchange |
| `E_PACKAGE_OWN` | ERROR | Gói do chính bản cài này xuất | exchange |
| `E_CONFLICT_UNRESOLVED` | ERROR | Còn xung đột chưa chọn cách xử lý | exchange.importPackage |
| `W_KG_MISMATCH` | WARNING | KL hàng ≠ Cân lần 2 − Cân lần 1 | import |
| `W_OVERNIGHT` | WARNING | Phiếu cân qua đêm (ngày cân 2 ≠ ngày cân 1) | import |
| `W_BEFORE_PERIOD` | WARNING | Ngày nhận dầu trước Từ ngày của kỳ (vẫn tính — "tính hết bảng kê") | periods |
| `W_AFTER_PERIOD` | WARNING | Ngày nhận dầu sau Đến ngày của kỳ (vẫn tính) | periods |
| `W_POSSIBLE_DUPLICATE` | WARNING | Dòng dầu nghi trùng (cùng ngày, xe, số lít) | import, fuel |
| `W_PLATE_FORMAT` | WARNING | Mã xe dầu viết khác chuẩn (đã quy đổi) | import |
| `W_VEHICLE_NO_FUEL` | WARNING | Xe có chạy trong kỳ nhưng không có dòng dầu | periods |
| `W_VEHICLE_OUT_OF_CONTRACT` | WARNING | Dòng dầu của xe không thuộc phạm vi hợp đồng | periods |
| `W_TICKET_IN_DRAFT_PERIOD` | WARNING | Phiếu đang ở kỳ nháp khác (BL-34) | periods |
| `W_NEGATIVE_FUEL_DIFF` | INFO | Chênh lệch dầu âm — đơn giá bị trừ | periods |
| `W_FLOORED_ZERO` | WARNING | Đơn giá VC âm → đưa về 0 | periods |
| `W_SAME_FILE_IMPORTED` | WARNING | File này (cùng SHA-256) đã từng import | import.preview |
| `W_BACKUP_OLD` | WARNING | Chưa sao lưu quá 7 ngày | meta.bootstrap |

## 9. Ví dụ (`api_examples/`)

| File | Nội dung | Số chính |
|---|---|---|
| `periods.calculate.HAKQN-QS.json` | Tính kỳ bản HAKQN | 326 chuyến · 5.853 l · **178.000** · 1.181.061.043 đ · 5 × `W_VEHICLE_NO_FUEL` |
| `periods.calculate.DH-HAKQN.json` | Tính kỳ bản ĐH | 77 · 5.734,69 l · **88.900** · 139.421.905 đ |
| `periods.calculate.HAK-HAKQN.json` | Tính kỳ bản HAK | 100 · 5.088,35 l · **125.600** · 253.713.305 đ |
| `calc.trace.json` | Chi tiết tính HAKQN-QS | bảng §7 |
| `reports.bkvc.*.json` | Dữ liệu in BKVC: dòng theo xe, tổng đến đồng, bằng chữ, 2 bên + MST + địa chỉ, người ký theo thứ tự ký | |
| `import.preview.fuel.json` | Preview bảng kê dầu ĐH | cảnh báo `W_BEFORE_PERIOD`, `W_PLATE_FORMAT`, dòng nghi trùng |
| `error.E_TICKET_USED_IN_PERIOD.json` | Chọn lại phiếu đã dùng | đúng câu chữ yêu cầu §14 |
| `auth.login.first-time.json` | Đăng nhập lần đầu | `PASSWORD_NOT_SET` |
| `DH-HAKQN_20260918-20260923.dgvc` | **Gói KY_TINH thật** ĐH xuất cho HAKQN (gzip JSON, 12,6 KB) | |
| `exchange.previewPackage.json` | HAKQN xem trước gói trên | 77 phiếu đã có (bỏ qua), 16 dầu + 1 kỳ + 77 chi tiết + 5 dòng BKVC mới, 0 xung đột |

## 10. Hiệu năng (dữ liệu trong bộ nhớ)

| Action | Ước tính |
|---|---|
| `meta.bootstrap` | < 50 ms |
| `import.preview` 1.000 dòng Excel | 1–2 s (đọc file bằng exceljs) |
| `periods.preview` / `calculate` (~330 phiếu) | tính < 100 ms; ghi giao dịch 0,2–0,5 s |
| `reports.export` PDF | 1–2 s |
| `exchange.exportPackage` / `importPackage` | < 1 s |
| `data.backupNow` | 1–3 s (nén ~50 MB) |
