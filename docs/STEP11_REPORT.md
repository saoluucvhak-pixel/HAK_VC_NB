# STEP11_REPORT.md — Bước 11: Kho lưu trữ JSON và Import Excel

> Ngày 24/09/2026 · mã nguồn `dgvc_buoc11.zip` (thư mục `app/`, gồm cả Engine Bước 10) · chạy: `npm install` (lần đầu, cài `exceljs`) → `npm test`.

## 1. Kết quả

| Hạng mục | Kết quả |
|---|---|
| Toàn bộ test | **70 / 70 đạt** (44 của Engine + 15 kho lưu trữ + 11 import đầu-cuối) |
| Đầu-cuối trên **3 file Excel gốc**: thư mục dữ liệu mới → nạp danh mục → import phiếu cân + bảng kê dầu → tính | HAKQN-QS **178.000** · ĐH-HAKQN **88.900** · HAK-HAKQN **125.600** — khớp Excel |
| Dữ liệu import so với dữ liệu mẫu | 326 / 77 / 100 phiếu và 18 / 16 / 13 dòng dầu trùng từng cột cốt lõi; mã dòng dầu `GD-<bản cài>-00001…` đúng thứ tự file |
| Mất điện giữa lúc ghi (mô phỏng 7 điểm) | mở lại luôn về đúng trạng thái **trước** hoặc **sau** giao dịch, không còn file dở dang |
| Gói mã nguồn giải nén ra máy trống → `npm install` → `npm test` | 70 / 70 |

## 2. Kho lưu trữ JSON (`main/repo/`)

| Chức năng | Cách làm | Test |
|---|---|---|
| Tạo thư mục dữ liệu | `manifest.json` + `tables/` + `journal/`, `backups/`, `exports/`, `logs/` | ✔ |
| Mở kho | khóa `.lock` → phục hồi journal dở dang → kiểm SHA-256 từng file theo manifest → nạp bộ nhớ | ✔ |
| Khóa thư mục | mở lần 2 (máy khác / cửa sổ khác) → `DATA_LOCKED` kèm tên máy, người; khóa chết (> 3 phút không nhịp tim) phải xác nhận chiếm quyền | ✔ |
| Phát hiện sửa ngoài APP | file bị sửa tay → `INTEGRITY_ERROR` chỉ rõ file, không mở | ✔ |
| Giao dịch | `transaction(fn)`: hàng đợi tuần tự; sao chép khi ghi; lỗi → **không ghi gì**, kể cả bộ đếm mã | ✔ |
| Kiểm tra trước khi ghi | kiểu, bắt buộc, enum (theo `shared/schema.json`); trùng khóa chính; trùng khóa duy nhất (`ticket_key`…); khóa ngoại; **chống tính trùng** (1 phiếu không thể ở 2 kỳ đã xác nhận/khóa của cùng hợp đồng) | ✔ |
| Journal 2 pha | PREPARED → COMMITTING → xong; mở lại: hoàn tác hoặc làm tiếp | ✔ 7 điểm mất điện |
| Sửa đồng thời | `row_version` sai → `CONFLICT_VERSION` | ✔ |
| Lịch sử thao tác | `tx.audit(...)` ghi AUDIT_LOG trong cùng giao dịch | ✔ |
| Mã tự sinh | `GD-HAKQN-00001`, `IB-HAKQN-000001`, `AL-HAKQN-0000001`… chỉ tăng khi giao dịch ghi thành công | ✔ |
| Bảng lớn chia năm | `tables/PHIEU_CAN/2026.json`… chỉ ghi lại file năm bị chạm | ✔ |

## 3. Import Excel (`main/import/`)

Luồng: **preview** (đọc, ghép cột, kiểm tra từng dòng — chỉ ghi 1 dòng IMPORT_BATCH trạng thái PREVIEW) → người dùng xem, bỏ dòng lỗi → **confirm** (kiểm lại trên dữ liệu hiện tại + ghi 1 giao dịch + AUDIT_LOG).

| Khả năng | Chi tiết |
|---|---|
| Đọc file | `.xlsx` / `.xlsm` (exceljs), `.csv` UTF-8; công thức lấy kết quả; ô gộp; sheet ẩn bị bỏ qua khi tự chọn sheet |
| Tự chọn sheet | ưu tiên `NL_VC` / `CAN` (phiếu cân), `NL_GIAONHANDAU` (dầu); không có thì chọn sheet có tiêu đề khớp nhất |
| Tự dò dòng tiêu đề | trong 15 dòng đầu (bỏ qua dòng tiêu đề bảng gộp ô, dòng trống) |
| Tự ghép cột | theo tên cột (kể cả `Số\n phiếu`, có/không dấu); thiếu cột bắt buộc → `E_MAPPING_REQUIRED` kèm danh sách để ghép tay |
| Đọc giá trị | ngày Excel / `dd/MM/yyyy` / `yyyy-MM-dd`; giờ dạng chữ / dạng số; số kiểu Việt Nam `17.470`, `5.088,35`; **bỏ khoảng trắng đầu/cuối** (mã xe `' 92H-00057'`) |
| Bỏ qua | dòng trống, dòng **TỔNG CỘNG**, bảng pivot bên dưới dữ liệu (sheet NL_VC) |
| Kiểm tra phiếu cân | thiếu trường, ngày sai, cân 2 trước cân 1, biển số sai định dạng, xe chưa có trong danh mục, KG ≤ 0, thiếu / sai mã tuyến, trùng trong file, trùng dữ liệu đã có; cảnh báo: KL ≠ cân 2 − cân 1, qua đêm, đơn vị VC khác chủ xe |
| Kiểm tra dầu | bản cài phải là bên VC của hợp đồng; ngày sai, xe không quy đổi được, số lít ≤ 0, đơn giá ≤ 0, thiếu / sai tuyến, bên giao chưa có; cảnh báo: mã xe viết khác chuẩn, xe ngoài phạm vi HĐ, **nghi trùng trong file** |
| Chống import lại | cùng file (SHA-256) → cảnh báo "đã import ngày …"; dòng đã có → trạng thái TRÙNG, bỏ qua; dầu ghép 1-1 nên 2 dòng giống hệt hợp lệ vẫn đủ |
| An toàn khi xác nhận | còn dòng lỗi → `E_IMPORT_HAS_ERRORS`; có cảnh báo phải tích "chấp nhận"; dữ liệu đổi từ lúc xem trước → `E_PREVIEW_STALE`; bấm 2 lần → ghi 1 lần |

Test "file xấu" dựng một file có đủ loại lỗi (tiêu đề ở dòng 3, ngày dạng chữ, giờ dạng số, KG kiểu VN, KG = 0, biển số `43H01080`, thiếu tuyến, tuyến `VC.999`, xe `51C-12345` chưa có, trùng dòng, ngày 31/02, KL lệch, dòng TỔNG CỘNG). Mỗi lỗi ra đúng mã; phần mềm không cho ghi cho đến khi bỏ 7 dòng lỗi.

## 4. Phát hiện từ dữ liệu thật

| # | Phát hiện | Cách xử lý |
|---|---|---|
| 1 | Cùng phiếu cân, file QS và file ĐH / ĐN ghi **khác nhau ở cột mô tả**: Nguồn gốc `ĐN` ↔ `KHO HOÀNG ANH KHÔI QUẾ SƠN`; Khách hàng trống ↔ `XIAMEN JIULI PAPER IMP. AND EXP. CO., LTD`; **LDĐ `UTXK/ĐN-QS/0726` ↔ `UTXK/ĐN-QS/0526`**; Stt `'01'` ↔ `1` | So trùng phiếu chỉ theo cột cốt lõi (số phiếu, ngày giờ, xe, số cân, KL, tuyến). Khác cột mô tả → coi là cùng phiếu, **giữ bản đã có**, báo thông tin `W_TICKET_DESCRIPTIVE_DIFF` |
| 2 | Bảng kê dầu ĐH: mã xe có **dấu cách thừa ở đầu** (`' 92H-00057'`) | Tự bỏ khi import. Dữ liệu mẫu cũng đã được dựng lại theo đúng quy tắc này |
| 3 | File ĐN lưu KL hàng dạng số thực, số phiếu dạng chữ | Đọc đúng, kết quả như file QS |

## 5. Mã kiểm tra mới (đã thêm vào `api_spec.json`)

`E_FIELD_MISSING`, `E_QTY_INVALID`, `E_UNIT_NOT_FOUND`, `W_OWNER_MISMATCH`, `W_TICKET_DESCRIPTIVE_DIFF`. Câu thông báo `E_DATE_INVALID` được làm chung cho cả khoảng ngày của kỳ và ngày trong dòng import.

## 6. Bước tiếp theo

Bước 12 — **Báo cáo**: dữ liệu BKVC / BKCT / bảng tính đơn giá (17 cột như QR_DGVC (2)) từ kết quả kỳ; xuất **Excel** (exceljs, đúng mẫu BKVC), **PDF** (in HTML của mẫu), **CSV**; kèm các service ghi kỳ tính (`periods.calculate / confirm / lock`) dùng Engine + kho lưu trữ đã có.
