# IMPORT SPEC — Import phiếu cân

## 1. Định dạng hỗ trợ
.xlsx, .xls (SheetJS), .csv (UTF-8 / UTF-8 BOM; dấu phân cách `,` hoặc `;` tự nhận). File được copy vào `imports/` kèm SHA-256 để truy vết.

## 2. Quy trình (không ghi DB trước khi người dùng xác nhận)
1. **Chọn file** → đọc workbook, liệt kê sheet (kèm số dòng). Cảnh báo nếu `file_hash` đã từng import ("File này đã import ngày …, batch #…").
2. **Chọn sheet** (mặc định sheet có điểm header cao nhất).
3. **Tự dò header**: quét 30 dòng đầu; điểm = số cột nhận dạng được + 2 × số cột bắt buộc (số phiếu, biển số, KL). File mẫu: header dòng 4 ✅.
4. **Nhận dạng cột** theo từ đồng nghĩa (so sánh không dấu, không phân biệt hoa thường):

| Trường | Từ đồng nghĩa (rút gọn) |
|---|---|
| so_phieu | Số phiếu, So phieu, Phiếu, Số chứng từ, Số CT, Mã phiếu |
| ngay_gio_can_1 | Ngày giờ cân 1, Ngày cân 1, Giờ cân 1, Giờ vào, Ngày cân |
| ngay_gio_can_2 | Ngày giờ cân 2, Ngày cân 2, Giờ cân 2, Giờ ra |
| bien_so | Biển số, Biển số 1, Biển số xe, Số xe, BKS |
| can_lan_1 / can_lan_2 | Cân lần 1/2, Trọng lượng lần 1/2 |
| kl_hang_kg | KL Hàng (KG), KL hàng, Khối lượng, Khối lượng hàng, KL net |
| noi_xuat | Nơi xuất, Điểm xuất, Kho xuất, Trạm cân, Nhà máy |
| noi_den | Nơi đến, Nơi nhận, Cảng |
| cong_ty_vc | Công ty vận chuyển, Tên cty VC, Đơn vị vận chuyển, Nhà xe |

   Hỗ trợ ngày và giờ ở **2 cột riêng** (Ngày cân 1 + Giờ cân 1) → ghép. Mapping người dùng chỉnh được lưu thành "mẫu mapping" theo tên sheet/header để lần sau tự áp.
5. **Preview**: bảng ảo hóa với cột trạng thái màu + thẻ đếm:
   Tổng dòng · Hợp lệ · Mới (xanh) · Trùng hoàn toàn (xám) · Trùng khóa khác dữ liệu (cam) · Lỗi (đỏ) · Xe chưa xác định · Nơi xuất chưa xác định · Không có bảng giá · Xung đột bảng giá.
   Có nút lọc theo từng thẻ, nút "Thêm xe/địa điểm thiếu" ngay tại preview (sau đó preview tự tính lại).
6. **Validate** (từng dòng): ngày giờ cân 1 đọc được; cân 2 ≥ cân 1 về thời gian; biển số đúng định dạng; KL > 0; |cân2−cân1| = KL; nơi xuất khớp alias. Dòng lỗi **không** được import (được liệt kê trong batch với lý do).
7. **Người dùng xác nhận** (chọn Đợt/Tàu, nơi đến mặc định, ghi chú).
8. **Commit**: 1 transaction — insert `import_batch`, các `phieu_can` NEW, `import_batch_row` cho **mọi** dòng (kể cả bỏ qua/lỗi), cảnh báo, audit. Lỗi giữa chừng → ROLLBACK toàn bộ.
9. Dòng `KEY_CONFLICT` vào trạng thái `PENDING_REVIEW` → màn hình **Cần kiểm tra** (so sánh cũ/mới từng cột, highlight cột khác): Giữ dữ liệu cũ / Cập nhật dữ liệu mới / Bỏ qua. Cập nhật phiếu đã chốt → bị chặn, yêu cầu mở khóa.

## 3. Đọc dữ liệu
- Ngày giờ: `dd/mm/yyyy hh:mm:ss`, `dd.mm.yyyy`, `yyyy-mm-dd`, kiểu Date, serial Excel. Lưu `YYYY-MM-DDTHH:MM:SS`.
- Số: số Excel; chuỗi kiểu `1.234,5` / `1234.5`.
- Biển số, số phiếu: đọc dạng **chuỗi** (giữ số 0 đầu).
- Dừng ở dòng "Tổng cộng" hoặc 5 dòng trống liên tiếp; bỏ qua dòng không có số phiếu.

## 4. Lịch sử import & hoàn tác
- Màn hình Lịch sử import: danh sách batch (file, sheet, thời gian, số dòng mới/trùng/lỗi/cập nhật) → xem chi tiết từng dòng "batch này đã thêm phiếu nào".
- **Hoàn tác batch**: chỉ khi không phiếu nào của batch đã chốt; phiếu được đặt `VOID` (không xóa cứng), cập nhật bị hoàn tác khôi phục `old_json`; batch → `UNDONE`; audit.

## 5. Import danh mục xe (sheet "Số xe")
Cột: Biển số, Tên công ty (mã đơn vị), [Từ ngày]. Preview: xe mới / xe đã có cùng đơn vị / xe đã có **khác đơn vị** (→ hỏi: đóng lịch sử cũ từ ngày X và mở lịch sử mới, hay bỏ qua). Đơn vị chưa có → tạo mới sau khi người dùng xác nhận.

## 6. Kiểm chứng trên file mẫu
2.035 phiếu, 0 lỗi, header dòng 4, import lại lần 2: 2.035 `EXACT_DUPLICATE`, 0 dòng mới (`docs/EXCEL_VS_APP_VALIDATION.md`).
