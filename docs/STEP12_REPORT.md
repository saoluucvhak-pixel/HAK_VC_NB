# BƯỚC 12 — LƯU KỲ TÍNH + BÁO CÁO

**Kết quả:** 83/83 test đạt (thêm 13 test mới: 6 về kỳ tính, 7 về báo cáo). Các file mẫu xuất từ kỳ HAKQN-QS 18–23/09/2026 nằm trong thư mục `mau_bao_cao_buoc12/`.

## 1. Lưu kỳ tính — `main/services/PeriodService.js`

| Thao tác | Trạng thái | Ghi chú |
|---|---|---|
| `calculate` (lần đầu) | → NHAP | Mã kỳ `<mã HĐ>/<từ>-<đến>[-<tuyến>]`. Đã có kỳ còn hiệu lực cùng mã → **DUPLICATE**, báo ngay trước khi tính. Kỳ đã hủy thì kỳ mới thêm hậu tố `#2`. |
| `calculate` (có periodId) | NHAP → NHAP | Tính lại, `calc_version` + 1. Kết quả cũ vẫn giữ, chỉ chuyển `is_current = false` / `RELEASED`. Không được đổi khoảng ngày. |
| `confirm` | NHAP → DA_XAC_NHAN | Bị chặn nếu kỳ đang đánh dấu `needs_recalc`. Đánh dấu đơn giá `PRICE_HISTORY.is_used`. |
| `lock` | DA_XAC_NHAN → DA_KHOA | |
| `unlock` | DA_KHOA → DA_XAC_NHAN | Chỉ ADMIN hoặc người có quyền mở khóa. Bắt buộc có lý do, lý do ghi vào nhật ký. |
| `reopen` | DA_XAC_NHAN → NHAP | Quyền và lý do như mở khóa. |
| `cancel` | NHAP → HUY | Bắt buộc có lý do. Trả toàn bộ phiếu và dầu của kỳ về trạng thái tự do. |

Mỗi lần ghi là **một giao dịch**, gồm: KY_TINH, CALC_RUN, TRANSPORT_CALCULATION (lưu đủ 15 bước "xem chi tiết tính"), TRANSPORT_DETAIL (từng phiếu), FUEL_DETAIL (từng dòng dầu), BKVC_LINE và AUDIT_LOG. Gửi lại cùng `clientRequestId` thì không tính thêm lần nữa.

**Chống tính trùng** (test bằng dữ liệu thật):
- Phiếu và dầu thuộc kỳ **đã xác nhận / đã khóa** không vào được kỳ khác của cùng hợp đồng. Ví dụ: kỳ 18–25 chồng lên kỳ 18–23 đã xác nhận thì 326 phiếu bị chặn, thông báo nêu rõ mã kỳ đang giữ phiếu.
- Tầng lưu trữ chặn thêm một lớp: không thể có 2 dòng CONFIRMED/LOCKED cho cùng (hợp đồng, phiếu).
- Phiếu đang nằm ở một kỳ **nháp** khác chỉ bị cảnh báo. Chọn "chuyển sang kỳ này" thì kỳ nháp kia bị đánh dấu *cần tính lại* và không xác nhận được cho tới khi tính lại.
- Bản cài chỉ ghi kỳ của hợp đồng mà đơn vị mình là bên vận chuyển, kể cả tài khoản ADMIN (lỗi `E_NOT_CARRIER`).

## 2. Báo cáo — `main/reports/`

Báo cáo đọc **kết quả đã lưu** của kỳ, không tính lại. Vì vậy in lại sau này vẫn ra đúng số đã xác nhận.

| Báo cáo | Nội dung | Excel | CSV | PDF |
|---|---|---|---|---|
| **BKVC** – Bảng xác nhận KL vận chuyển dăm | 17 xe, tổng, bằng chữ, nơi/ngày, 2 khối ký (Giám đốc + Kế toán mỗi bên) | Bố cục sheet BKVC gốc: cột A–J, Times New Roman, A4 dọc, vùng in, chân trang | ✓ | A4 dọc, 1 trang. Kỳ nháp có dấu chìm "BẢN NHÁP — CHƯA XÁC NHẬN" |
| **BKCT** – Bảng kê chi tiết phiếu cân | 16 cột, xếp theo ngày giờ cân, lọc được theo xe hoặc số phiếu | A4 ngang, cố định dòng tiêu đề, có bộ lọc | ✓ | 8 trang, tiêu đề cột lặp mỗi trang, dòng tổng chỉ ở cuối |
| **Bảng tính đơn giá** | 17 cột như QR_DGVC (2) | ✓ | ✓ | A4 ngang |

CSV là UTF-8 có BOM nên Excel mở đúng tiếng Việt. PDF trong bản cài dùng chức năng in của Electron, chạy offline. Mẫu in không tải gì từ Internet.

## 3. Đối chiếu với Excel (HAKQN → CNHAK, 18–23/09/2026)

| Mục | Excel | APP | Kết luận |
|---|---|---|---|
| Đơn giá vận chuyển | 178.000 | 178.000 | Khớp |
| Số chuyến / KG | 326 / 6.143.680 | 326 / 6.143.680 | Khớp |
| Thành tiền | 1.093.575.040 | 1.093.575.040 | Khớp |
| VAT 8% | 87.486.003,2 | 87.486.003 | **Làm tròn**: app làm tròn từng dòng tới đồng (theo lựa chọn "làm tròn tiền đến đồng") |
| Tổng thanh toán | 1.181.061.043,2 | 1.181.061.043 | **Làm tròn**: chênh 0,2đ, cùng nguyên nhân trên |
| Thành tiền xe 92H-00903 | 64.585.519,99999999 | 64.585.520 | **Kiểu số**: sai số dấu phẩy động của Excel |
| Bằng chữ (ô A25) | "Một tỷ, hai trăm năm mươi lăm triệu…" | "Một tỷ, một trăm tám mươi mốt triệu, không trăm sáu mươi mốt ngàn, không trăm bốn mươi ba đồng y ./." | **Dữ liệu**: ô A25 trong Excel đọc nhầm một số khác, không phải số tổng |
| Thứ tự dòng | 92H-00195, 00844, 00994 nằm cuối | Xếp theo biển số | **Trình bày**: số liệu từng xe khớp 17/17 |
| Người ký | Giám đốc / P.Giám đốc | VÕ VĂN PHỤNG – Giám đốc (HAKQN) · VÕ THỊ NHƯ NGỌC – Phó Giám đốc (CNHAK) | Theo thứ tự ưu tiên đã chốt |

Hai hợp đồng thầu phụ đều được test:
- ĐH → HAKQN: HAKQN ký bằng Phụng, ĐH ký bằng Ngọc.
- HAK → HAKQN: HAK ký bằng Phụng, HAKQN ký bằng Ngọc.
- Đơn giá lần lượt 88.900 và 125.600, khớp Excel.

## 4. Sửa trong bước này
- Engine: tham số bỏ trống (`undefined`) làm mất giá trị mặc định khi xem trước, gây lỗi. Đã sửa: bỏ trống thì giữ mặc định.
- Schema: bổ sung thao tác `REOPEN` cho CALC_RUN (trước đây thiếu so với thiết kế API).
- Kỳ trùng: báo DUPLICATE ngay, trước khi chạy Engine (trước đây bị lỗi "không còn phiếu" che mất).
- Đã thử cố tình làm sai: đổi trạng thái sử dụng phiếu hoặc số tổng trong Excel thì test báo lỗi ngay.

## 5. Còn lại
- **Bước 13:** chạy với dữ liệu thật nhiều kỳ.
- **Bước 14:** so APP ↔ Excel toàn bộ.
- **Bước 15:** vỏ Electron + giao diện + sao lưu.
- Vẫn chờ anh/chị xác nhận LDĐ đúng là **0726 hay 0526**.
