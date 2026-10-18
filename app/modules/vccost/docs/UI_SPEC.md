# UI SPEC

## 1. Phong cách (theo skill "quản lý bảng mẹ/bảng con")
- Sidebar tối cố định trái ~260px; nền nội dung kem `#F1EFE9`; khối nội dung là **card trắng bo 12px**, bóng nhẹ.
- `<thead>` nền tối (trùng sidebar) chữ trắng in hoa nhỏ; số liệu canh phải, font monospace (IBM Plex Mono) cho số phiếu, biển số, tiền; nội dung font Manrope/Inter (đóng gói kèm app — offline).
- Tag trạng thái bo tròn nền nhạt chữ đậm: xanh = OK/Khớp, xám = Trùng hoàn toàn, cam = Cần kiểm tra/Cảnh báo, đỏ = Lỗi/Thiếu giá/Xung đột, tím = Đã chốt.
- Nút chính xanh lá đậm; nút phụ viền mảnh. Modal chỉ đóng khi bấm đúng lớp nền (`e.target === overlay`), không dùng `stopPropagation`.
- Token màu:
```css
--sidebar-bg:#141F19; --sidebar-active:#24352A; --accent:#D99A4E; --green:#3E7057;
--bg:#F1EFE9; --card:#FFFFFF; --text:#1C1C1A; --text-mute:#77756A; --red:#B4453B; --radius:12px;
```
- Định dạng: tiền `1.234.567` (vi-VN), KG `20.090`, tấn `20,090`, ngày `dd/mm/yyyy HH:mm`.

## 2. Danh mục = cấu hình khai báo
Mọi danh mục (Xe, Đơn vị VC, Địa điểm, Tuyến, Đợt/Tàu, Bảng giá, Giá dầu) định nghĩa trong 1 object `TABLES` (fields, columns, refTable, required, money/percent, tag, hasVersioning) → 1 bộ hàm chung `renderTableView / renderModal / save`. Xe có **tab con** "Lịch sử đơn vị" (versioning từ–đến ngày, tự đề xuất đóng phiên bản cũ). Drill-down tối đa 3 cấp, breadcrumb + tabbar; khi đào sâu luôn lấy id cha từ chính dòng được bấm.

## 3. Sidebar
```
TỔNG QUAN   Dashboard
VẬN CHUYỂN  Phiếu cân · Import phiếu cân · Cần kiểm tra (badge) · Chi tiết vận chuyển · Theo xe
CHI PHÍ     Bảng giá · Giá dầu · Tính chi phí
ĐỐI CHIẾU   Import đối chiếu · Kết quả đối chiếu · Sai lệch
DANH MỤC    Xe · Đơn vị vận chuyển · Địa điểm · Tuyến · Đợt/Tàu
BÁO CÁO     Theo xe · Theo công ty · Theo nơi xuất · Theo thời gian · Theo tàu
HỆ THỐNG    Trung tâm cảnh báo (badge) · Lịch sử import · Audit log · Backup · Cài đặt
```

## 4. Màn hình chính
| Màn hình | Nội dung | Tương tác |
|---|---|---|
| Dashboard | 11 KPI (tổng chuyến, KL, chi phí, VAT, thanh toán, số xe, số đơn vị, phiếu chưa có giá, chưa xác định xe, lỗi, cần đối chiếu); 7 biểu đồ (KL/chi phí/số chuyến theo ngày, KL theo nơi xuất, chi phí theo đơn vị, top xe theo chuyến/KL) | Filter chung: từ–đến ngày, đợt/tàu, nơi xuất, tuyến, đơn vị → mọi KPI & biểu đồ lấy từ cùng truy vấn SQL đã lọc; bấm KPI cảnh báo → mở danh sách phiếu tương ứng |
| Import phiếu cân | Wizard 4 bước: Chọn file → Sheet & mapping → Preview (thẻ đếm màu) → Xác nhận | xem IMPORT_SPEC |
| Cần kiểm tra | Cặp dữ liệu cũ/mới, ô khác tô cam | Giữ cũ / Cập nhật / Bỏ qua (từng dòng hoặc hàng loạt) |
| Chi tiết vận chuyển | 21 cột (STT … Trạng thái đối chiếu, Ghi chú) | search, filter, sort, group (theo xe/đơn vị/nơi xuất/ngày), export Excel; virtual scroll, phân trang phía server |
| Theo xe (timeline) | Chọn biển số + từ–đến ngày → timeline chuyến: giờ cân 1/2, số phiếu, nơi xuất/đến, KL, đơn giá, tiền, **thời gian cân**, **khoảng cách chuyến trước** | dòng có cờ tô cam + tooltip lý do; ngưỡng chỉnh ở Cài đặt |
| Tổng hợp xe / đơn vị / nơi xuất | Bảng tổng hợp như 3 sheet Excel nhưng sinh tự động | double-click → drill-down Đơn vị → Xe → Chuyến → Phiếu |
| Bảng giá | Danh sách theo tuyến + timeline hiệu lực; cảnh báo chồng lấn | Tạo giá mới (đóng giá cũ), xem "phiếu nào đang dùng giá này" |
| Giá dầu | Lưới giá theo ngày; tạo kỳ điều chỉnh; xem trước bảng tính giống Excel (I.1 → III.1) cho mọi tuyến | Duyệt → sinh bảng giá; in bảng tính kèm công văn |
| Đối chiếu | xem RECONCILIATION_SPEC | |
| Trung tâm cảnh báo | Loại, mức độ, dữ liệu liên quan, nguyên nhân, cách xử lý, trạng thái | lọc, chuyển trạng thái, nhảy tới đối tượng |
| Chốt kỳ/đợt | Tổng trước khi chốt, kiểm tra điều kiện (không còn phiếu lỗi/thiếu giá) | Chốt; Mở khóa (bắt buộc lý do) |
| Backup | Danh sách bản backup, dung lượng | Backup ngay, Restore (tự backup trước khi restore), cấu hình tự động + retention |

## 5. Hiệu năng
Không đưa toàn bộ dữ liệu vào DOM: Tabulator virtual DOM + phân trang/sort/filter **ở SQL** (renderer chỉ nhận trang hiện tại qua IPC); tổng hợp bằng SQL `GROUP BY`; mục tiêu mở danh sách 300.000 phiếu < 1 giây/trang.

## 6. Xuất Excel (ExcelJS)
Tiêu đề + tiêu chí lọc, header đóng băng + autofilter, định dạng ngày `dd/mm/yyyy hh:mm`, tiền `#,##0`, KG `#,##0`, tấn `#,##0.000`, dòng Tổng cộng (công thức SUBTOTAL), biển số & số phiếu kiểu **Text**, font Arial. 8 mẫu: chi tiết VC, tổng hợp xe, theo công ty, theo nơi xuất, đối chiếu, sai lệch, chi tiết từng xe, theo đợt/tàu.
