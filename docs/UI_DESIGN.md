# UI_DESIGN.md — Thiết kế giao diện (Bước 9 — bản DESKTOP)

> Căn cứ: 4 tài liệu nghiệp vụ v6, `DATA_STORAGE_DESIGN.md`, `API_DESIGN.md` (bản desktop).
> Bản thiết kế trực quan: trang **"Giao diện phần mềm Đơn giá vận chuyển dăm"** — 7 màn hình mẫu vẽ bằng **số liệu thật** kỳ 18–23/09/2026: Đăng nhập · Dashboard · Tính giá vận chuyển · Xem chi tiết tính · Bảng xác nhận khối lượng · Import bảng kê dầu (bản ĐH) · Nhận gói kỳ tính (bản HAKQN).
> Phong cách theo skill "quản lý bảng mẹ / bảng con" của anh/chị (sidebar tối, thẻ trắng bo góc, tiêu đề bảng nền tối) để đồng bộ với các hệ thống HAK hiện có.

---

## 1. Hệ thống hiển thị (cập nhật 25/09/2026 — theo bộ màu HAK `style.css` của "Bộ sinh biên bản xuất hàng")

| Token | Giá trị | Dùng cho |
|---|---|---|
| `--sb-bg` | gradient `#0f2740 → #0a1c30` (navy), rộng 268px | sidebar; chữ menu `#b8c7d9` |
| Mục menu đang chọn | gradient teal `rgba(20,163,173,.35 → .12)` + vạch trái `#14a3ad` | mục đang mở |
| `--brand` / `--brand-2` | `#0e7c86` / `#14a3ad` (teal) | nút chính (TÍNH GIÁ, Lưu, Xác nhận), số liệu KPI, số tiền, tab đang chọn, viền ô đang nhập |
| `--brand-dark` / `--brand-deep` | `#0b6870` / `#095961` | nút chính khi rê chuột / bấm |
| `--brand-soft` | `rgba(14,124,134,.12)` | nền nhãn thông tin, vòng sáng ô đang nhập, lựa chọn |
| `--bg` | `#f3f6fa` | nền ứng dụng |
| `--card` | `#ffffff`, viền `#e3e9f0`, bo 14px, bóng `0 1px 2px / 0 6px 18px rgba(16,35,58,…)` | mọi khối nội dung |
| `--text` / `--text-mute` | `#16202c` / `#6b7a8c` | chữ chính / chữ phụ |
| `--red` | `#e5484d` | lỗi chặn, dấu * bắt buộc, nút xóa |
| Tiêu đề bảng | nền trắng, chữ HOA `#6b7a8c` 0,74rem, dính đầu khi cuộn | mọi bảng |
| Ô thống kê (KPI) | số to đậm 800 màu teal, nhãn chữ HOA xám bên dưới; ô kết quả chính nền gradient navy → teal chữ trắng | Tổng quan, Tính giá |
| Nhãn trạng thái | bo tròn, nền nhạt + chữ đậm cùng tông | xanh lá `#1baf7a` = OK · vàng `#eda100` = nháp / cảnh báo · đỏ `#e5484d` = lỗi · teal = thông tin · xám = chưa có |
| Font chữ | Segoe UI (Windows) → Roboto / Helvetica → Be Vietnam Pro (đóng gói) | toàn bộ nội dung |
| Font số | ui-monospace / Consolas → IBM Plex Mono (đóng gói); số KPI / tiền dùng chữ thường với `tabular-nums` | mã, số lượng, số tiền |
| File Excel mẫu import | tiêu đề nền teal, dòng tiêu đề cột nền navy, dấu * teal nhạt | đồng bộ với giao diện |

- Font được **đóng gói trong bản cài** (không tải từ Internet khi chạy). Trang thiết kế dùng Google Fonts chỉ để xem trước.
- Định dạng số kiểu Việt Nam: `1.181.061.043`, `6.143,68`; ngày `dd/MM/yyyy`; giờ `HH:mm:ss`.
- Cửa sổ tối thiểu 1280×760; thiết kế chuẩn 1440×900. Sidebar 248px cố định.

## 2. Khung ứng dụng

```
┌──────────── Sidebar 248px ───────────┬──────────────────────── Vùng làm việc ─────────────────────────┐
│ [VC] Đơn giá vận chuyển              │ Breadcrumb                                                       │
│ ┌ BẢN CÀI · HAKQN ────────────────┐  │ Tiêu đề trang (24px)                        [nút phụ] [nút chính]│
│ │ Công ty TNHH Hoàng Anh Khôi QN  │  │ ┌ Thẻ lọc ─────────────────────────────────────────────────────┐ │
│ └─────────────────────────────────┘  │ └──────────────────────────────────────────────────────────────┘ │
│ 1. Dashboard                         │ ┌ Thẻ số liệu × 4–5 ──────────────────────────────────────────┐ │
│ 2. Phiếu cân                         │ ┌ Thẻ bảng dữ liệu (thead tối) ───────────────────────────────┐ │
│ 3. Giao nhận dầu                     │ │                                                              │ │
│ 4. Danh mục tuyến                    │ └──────────────────────────────────────────────────────────────┘ │
│    Hợp đồng vận chuyển               │                                                                  │
│ 5. Đơn giá                           │                                                                  │
│ 6. Tính giá vận chuyển               │                                                                  │
│ 7. Bảng xác nhận khối lượng          │                                                                  │
│ 8. Chi tiết vận chuyển               │                                                                  │
│    Kiểm tra dữ liệu                  │                                                                  │
│ 9. Báo cáo                           │                                                                  │
│    Trao đổi dữ liệu                  │                                                                  │
│ 10. Lịch sử thao tác                 │                                                                  │
│ 11. Cài đặt                          │                                                                  │
│ ─────────────                        │                                                                  │
│ (user) ADMIN · sao lưu 23:00         │                                                                  │
└──────────────────────────────────────┴──────────────────────────────────────────────────────────────────┘
```

- 11 mục đánh số đúng yêu cầu §15; thêm 3 mục không số cần cho bản desktop: **Hợp đồng vận chuyển**, **Kiểm tra dữ liệu** (yêu cầu §23), **Trao đổi dữ liệu** (gói .dgvc).
- Ô "Bản cài" luôn hiện đơn vị của bản cài → người dùng biết mình đang ở vai trò nào.
- Menu ẩn theo quyền: `XEM` không thấy nút ghi; mục **Cài đặt → Người dùng / Sao lưu** chỉ ADMIN.

## 3. Mẫu tương tác dùng chung

| Mẫu | Quy tắc |
|---|---|
| **Bảng dữ liệu** | Cấu hình khai báo (config-driven) như skill: 1 hàm vẽ bảng cho mọi danh sách; tiêu đề nền tối; dòng xen kẽ `#FFFFFF`/`#FAF8F3`; cột số căn phải, font mono; phân trang 100 dòng; lọc + tìm ở thẻ trên; bấm tiêu đề cột để sắp xếp; dòng tổng cuối bảng nền `#F3EFE4` |
| **Form Thêm / Sửa** | Modal chung; nhãn viết hoa nhỏ trên ô; nút chính xanh lá, nút Hủy viền mảnh; đóng khi bấm nền mờ (`e.target === overlay`, **không** dùng `stopPropagation`); `rowVersion` gửi kèm — `CONFLICT_VERSION` → thông báo "Bản ghi vừa bị sửa ở cửa sổ khác, tải lại?" |
| **Ngăn kéo bên phải (drawer)** | Xem chi tiết không rời màn hình: **Xem chi tiết tính**, chi tiết phiếu cân, chi tiết dòng dầu |
| **Hộp xác nhận** | Mọi thao tác không đảo ngược dễ (xác nhận kỳ, khóa, khôi phục, nhập gói) — nói rõ hậu quả; mở khóa / trả về nháp / override bắt nhập lý do |
| **Thông báo (toast)** | góc dưới phải, 4 giây; lỗi `STORAGE_ERROR` / `INTEGRITY_ERROR` hiện hộp thoại cố định kèm nút "Mở thư mục sao lưu" |
| **Nhãn kiểm tra** | mã lỗi (`W_VEHICLE_NO_FUEL`…) hiện kèm câu tiếng Việt; bấm nhãn → đến dòng/bản ghi liên quan |
| **Trạng thái trống / đang tải** | trống: câu hướng dẫn + nút hành động ("Chưa có phiếu cân — Import từ Excel"); tải > 300 ms: khung xương (skeleton) |
| **Phím tắt** | `Ctrl+F` tìm trong bảng · `Ctrl+Enter` TÍNH GIÁ / Lưu · `Esc` đóng modal / drawer · `Ctrl+P` in báo cáo đang xem |
| **Chống bấm 2 lần** | nút TÍNH GIÁ / Xác nhận import / Nhập gói khóa lại khi đang chạy, gửi `clientRequestId` |
| **Tiếp cận** | nút là `<button>`, ô nhập có `<label>`, nút chỉ có icon có `aria-label`; tương phản chữ ≥ 4,5:1; màu trạng thái luôn kèm chữ, không chỉ dựa vào màu |

## 4. Đặc tả từng màn hình

Ký hiệu: 🖼 = có màn hình mẫu trên trang thiết kế.

### 4.0. Khởi tạo và đăng nhập 🖼

| | |
|---|---|
| Khởi tạo (lần đầu mở) | Trình hướng dẫn 4 bước: (1) chọn thư mục dữ liệu — mặc định `Documents\DGVC_DATA`, nút "Chọn ổ khác" · (2) chọn **đơn vị của bản cài** (HAKQN / ĐH / HAK / …) · (3) nạp gói DANH_MUC từ HAKQN (bản ĐH, HAK) hoặc dùng danh mục mẫu (bản HAKQN) · (4) chọn thư mục sao lưu ngoài (USB / Google Drive for Desktop) và tạo ADMIN. API: `setup.status`, `dialog.openFolder`, `setup.init` |
| Đăng nhập 🖼 | Nửa trái nền tối giới thiệu + bản cài + đường dẫn dữ liệu; nửa phải thẻ đăng nhập. Lần đầu: báo "chưa có mật khẩu" → đặt mật khẩu. Sai 5 lần: báo khóa 15 phút kèm giờ mở. API: `auth.login`, `auth.setFirstPassword` |

### 4.1. Dashboard 🖼

- Lọc: Từ ngày, Đến ngày, Mã tuyến, Hợp đồng / đơn vị vận chuyển.
- 8 thẻ số (đúng yêu cầu §16): tổng chuyến, tổng khối lượng, dầu thực nhận, dầu định mức, chênh lệch dầu, **đơn giá VC bình quân** (gia quyền theo tấn), số tuyến, phiếu chưa tính / phiếu lỗi.
- Bảng "Hợp đồng và kỳ tính": mỗi hợp đồng của bản cài, vai trò (bên VC / bên thuê), kỳ gần nhất, trạng thái (nháp / đã xác nhận / đã khóa / đã nhận gói / chưa nhận gói).
- Thẻ "Việc cần làm": kỳ nháp chưa xác nhận, gói chưa nhận, cảnh báo sao lưu cũ, dữ liệu cần tính lại.
- API: `dashboard.summary`, `periods.list`, `meta.bootstrap`.

### 4.2. Phiếu cân

- Lọc: ngày (theo Ngày cân 1), tuyến, biển số, chủ xe, hợp đồng + trạng thái sử dụng (Chưa tính / Đã đưa vào kỳ / Đã xác nhận / Đã khóa), "chỉ phiếu có cảnh báo"; tìm số phiếu.
- Bảng 16 cột gốc + cột "Kỳ đang dùng" (mã kỳ theo hợp đồng) + nhãn cảnh báo. Dòng tổng: số chuyến, KG, tấn.
- Nút: **Import từ Excel** (→ màn 4.3b), Sửa (khóa nếu kỳ đã xác nhận/khóa — hiện lý do), Xóa mềm (bắt lý do), Xác nhận cảnh báo.
- Drawer chi tiết: dữ liệu gốc (`raw_row_json`), các kỳ đã dùng, lịch sử sửa.
- API: `tickets.list`, `tickets.get`, `tickets.update`, `tickets.softDelete`, `tickets.ackFlags`.

### 4.3. Giao nhận dầu

- Chọn **hợp đồng** trước (bảng kê thuộc hợp đồng); lọc ngày nhận, xe, trạng thái.
- Bảng: Ngày nhận, Mã tuyến, Mã xe trong file, Biển số quy đổi, ĐVT, Số lít, Đơn giá (chưa VAT), Ngày mua, Bên giao, Kiểm tra. Dòng tổng: lít, đơn giá **trung bình cộng**.
- Nút: Import từ Excel, Nhập tay nhiều dòng (lưới nhập nhanh, Enter xuống dòng), Sửa, Xóa mềm, Xác nhận cảnh báo.
- Chỉ bản cài là **bên VC** của hợp đồng mới thấy nút ghi.
- API: `fuel.list`, `fuel.saveRows`, `fuel.update`, `fuel.softDelete`, `fuel.ackFlags`.

**4.3b. Import (dùng chung phiếu cân / dầu) 🖼** — mẫu vẽ bản cài ĐH nhập bảng kê dầu thật của file `_DH.xlsx`:
1. Chọn file (hộp thoại Windows) → sheet (tự dò) → hợp đồng (với dầu).
2. Ô "Ghép cột (tự nhận)": cột trong file → cột dữ liệu; sửa được bằng danh sách chọn.
3. Tóm tắt: tổng dòng / hợp lệ / cảnh báo / đã xác nhận / lỗi; tổng lít.
4. Bảng xem trước: mỗi dòng có nhãn kiểm tra; ví dụ thật: 2 dòng **nhận trước kỳ** (16, 17/09), 1 dòng **mã xe khác chuẩn** (`92H00195`), 2 dòng 18/09 xe 92H-00192 400 lít **đã xác nhận không trùng**; mã xe có **dấu cách thừa ở đầu** (`␣92H-00057`) được tự bỏ khi quy đổi.
5. "Xác nhận import N dòng" — dòng lỗi phải bỏ trước; cảnh báo cần tích "chấp nhận cảnh báo". Cùng file đã import (trùng SHA-256) → cảnh báo `W_SAME_FILE_IMPORTED`.
- API: `dialog.openFile`, `import.preview`, `import.previewRows`, `import.confirm`, `import.cancel`.

### 4.4. Danh mục tuyến

- Bảng: Mã tuyến, Tuyến, Cự ly, Cự ly chuyến, ĐVT (Tấn / M3), Đơn vị trong bảng giá (HAK / HHH), Trạng thái. Lọc theo mã tuyến, đơn vị VC.
- Thêm / Sửa / Ngừng sử dụng (không xóa). **Chốt 25/09/2026:** bản cài nào cũng sửa được; mỗi lần sửa hiện nhắc "Nhớ sửa giống ở các nhà máy còn lại" và thêm vào màn hình **Nhắc sửa danh mục** (xuất gói danh mục cho từng nhà máy / đánh dấu đã sửa tay).
- API: `routes.list`, `routes.save`, `routes.setActive`.

**Hợp đồng vận chuyển** (cùng nhóm): danh sách hợp đồng 2 bên (mã, số HĐ **tự điền**, bên thuê, bên VC, hiệu lực từ–đến **tự điền**, vai trò của bản cài); tab "Phạm vi xe" (danh sách xe + hiệu lực, nút "Gợi ý xe"); tab "Người ký" (tự xác định theo thứ tự HAK → HAKQN → ĐH → CNHAK, cho ghi đè). API: `contracts.*`.

### 4.5. Đơn giá

- Chọn tuyến → dòng thời gian các phiên bản giá (v1, v2…) với hiệu lực từ–đến, trạng thái DRAFT / ACTIVE / CLOSED, "đã dùng ở N kỳ".
- Form phiên bản mới: Đơn giá mới, Đơn giá chưa VAT, ĐG dầu chưa VAT, **Định mức dầu (lít/km)** + "(= 40 lít/100km)", KL_TB, Thể tích TB, ngày hiệu lực, căn cứ.
- Khung **xem trước Tầng A** cập nhật khi gõ: ĐG 1 chuyến → Tiêu hao/chuyến → Tiền dầu → ĐGVC chưa diesel → **ĐG HĐ** (vd VC.007 = 115.000).
- Phiên bản đã dùng: khóa sửa, nút "Tạo phiên bản mới từ bản này".
- API: `prices.list`, `prices.preview`, `prices.createVersion`, `prices.updateDraft`, `prices.activate`.

### 4.6. Tính giá vận chuyển 🖼 (màn hình quan trọng nhất)

- Thẻ lọc: **Hợp đồng** (chỉ HĐ mà bản cài là bên VC), Từ ngày, Đến ngày, Mã tuyến; nút **Xem trước** (không ghi) và **TÍNH GIÁ**.
- 5 thẻ số: số chuyến, tổng khối lượng, dầu thực nhận, dầu định mức (+ chênh lệch), **đơn giá vận chuyển**.
- Bảng kết quả 15 cột đúng yêu cầu §17: STT, Mã tuyến, Tuyến, Cự ly, Ngày bắt đầu, Ngày kết thúc, Số chuyến, Tổng tấn, Dầu thực nhận, Định mức dầu, Chênh lệch dầu, Đơn giá dầu, ĐG HĐ, ĐG CL Diesel, Đơn giá VC.
  - Bấm dòng → drawer 326 phiếu cân cấu thành (`calc.tickets`).
  - Bấm số **Đơn giá VC** hoặc nút **Xem chi tiết tính** → drawer 4.6b.
- Thẻ "Kiểm tra trước khi xác nhận": lỗi chặn (đỏ, chặn nút Xác nhận) và cảnh báo (cam) — mẫu thật: 5 xe không có dòng dầu, 6 phiếu qua đêm, phiên bản giá đang dùng.
- Thẻ "Trạng thái kỳ": Nháp → Đã xác nhận → Đã khóa; nút Xác nhận kỳ, Khóa, In BKVC, **Xuất gói gửi bên thuê**; ADMIN / `can_unlock` thấy thêm Mở khóa, Trả về nháp (bắt lý do).
- Phiếu đã dùng ở kỳ đã xác nhận / khóa của cùng hợp đồng: bị loại khỏi ứng viên, hiện danh sách kèm câu "Phiếu cân này đã được sử dụng trong kỳ tính [Mã kỳ]. Không thể đưa vào kỳ mới."
- Kỳ nhận từ gói (IMPORTED): cùng màn hình ở chế độ chỉ xem, nhãn "Nhận từ bản cài ĐH".
- API: `periods.preview`, `periods.calculate`, `periods.get`, `periods.confirm/lock/unlock/reopen/cancel`, `calc.tickets`, `calc.fuel`, `exchange.exportPackage`.

**4.6b. Xem chi tiết tính 🖼** — drawer 620px, 15 bước chia 3 nhóm (A. Đơn giá hợp đồng · B. Số liệu kỳ · C. Chênh lệch dầu và đơn giá cuối); mỗi bước: tên, công thức chữ, **thay số**, kết quả; bước có nguồn (số chuyến, tổng tấn, dầu thực nhận, đơn giá dầu) có "Xem nguồn →" mở danh sách phiếu / dòng dầu. Chân drawer ghi quy tắc làm tròn đang dùng; Xuất Excel, In. API: `calc.trace`.

### 4.7. Bảng xác nhận khối lượng 🖼

- Trái: **bản xem trước khổ A4** đúng mẫu BKVC hiện tại: tên, địa chỉ, MST bên vận chuyển; số hợp đồng; tiêu đề; dòng kỳ; bảng 10 cột (STT, Biển số, Số chuyến, KG, Tấn, Đơn giá, Thành tiền, VAT 8%, Thành tiền sau VAT, Ghi chú); dòng TỔNG CỘNG; **bằng chữ** (tự sinh); nơi, ngày ký; 2 khối ký (chức danh + tên theo quy tắc thứ tự ký, kế toán hai bên).
- Phải: thiết lập in — kỳ, ngày ký, số HĐ, người ký (hiện nguồn: theo quy tắc / ghi đè), ghi chú làm tròn; In, Xuất PDF, Xuất Excel.
- Mẫu thật: 17 xe · 326 chuyến · 6.143,68 tấn · 178.000 · 1.093.575.040 + VAT 87.486.003 = **1.181.061.043** · "Một tỷ, một trăm tám mươi mốt triệu, không trăm sáu mươi mốt ngàn, không trăm bốn mươi ba đồng ./."
- API: `reports.bkvc`, `reports.print`, `dialog.saveFile`, `reports.export`.

### 4.8. Chi tiết vận chuyển (BKCT)

- Chọn kỳ → bảng 15 cột (bỏ Khách hàng từ bản 1.1.3, Đơn vị VC không xuống dòng); lọc biển số, ngày, tìm số phiếu; tổng theo lọc. Xuất Excel / PDF / CSV, In.
- API: `reports.bkct`, `reports.export`.

### Kiểm tra dữ liệu

- Thẻ tóm tắt theo mã lỗi (10 lỗi bắt buộc §23 + cảnh báo) với số lượng; bấm → bảng các bản ghi lỗi: mã, mô tả, bản ghi, trường, gợi ý sửa, nút **Sửa** (mở form đúng bản ghi) / **Xác nhận giữ** (với cảnh báo).
- Lọc: hợp đồng, khoảng ngày, mức (lỗi / cảnh báo), "hiện cả mục đã xác nhận".
- API: `validation.run`, `tickets.update`, `fuel.update`, `*.ackFlags`.

### 4.9. Báo cáo

- Danh sách kỳ (theo hợp đồng, trạng thái, khoảng ngày) với đơn giá, tấn, tổng tiền; so sánh các kỳ của cùng tuyến (bảng + biểu đồ đường đơn giá VC theo kỳ).
- Xuất: Bảng tính đơn giá (17 cột như `QR_DGVC (2)`), BKVC, BKCT, danh sách phiếu, bảng kê dầu — XLSX / CSV / PDF.
- API: `periods.list`, `reports.pricing`, `reports.export`.

### Trao đổi dữ liệu 🖼

- Tab **Xuất gói**: chọn loại (DANH_MUC chỉ ở bản HAKQN · PHIEU_CAN · KY_TINH chỉ kỳ đã xác nhận/khóa) → đơn vị nhận → chọn nơi lưu → file `.dgvc`.
- Tab **Nhập gói** 🖼: chọn file → thẻ thông tin gói (bản cài nguồn, người lập, thời điểm, dung lượng, **toàn vẹn SHA-256**, vai trò bản cài này) → 4 thẻ tóm tắt (kỳ, chuyến / tấn, đơn giá, tổng thanh toán) → bảng so sánh (mới / đã có / xung đột / xử lý). Có xung đột → mỗi dòng chọn "Giữ bản này / Lấy bản đến". Mẫu thật: gói DH-HAKQN — 77 phiếu đã có, 16 dòng dầu + 1 kỳ + 77 chi tiết + 16 chi tiết dầu + 5 dòng BKVC mới, 0 xung đột, **88.900 đ/tấn**, 139.421.905 đ.
- Tab **Lịch sử gói**.
- API: `exchange.exportPackage`, `exchange.previewPackage`, `exchange.importPackage`, `exchange.list`.

### 4.10. Lịch sử thao tác

- Bảng: thời gian, người, hành động, đối tượng, mã; lọc theo người / hành động / đối tượng / ngày. Bấm dòng → drawer so sánh **trước / sau** (các trường đổi được tô màu), lý do (mở khóa, override), máy.
- API: `audit.list`.

### 4.11. Cài đặt

| Tab | Nội dung | Ai |
|---|---|---|
| Tham số tính | làm tròn ĐG HĐ / đơn giá VC / tiền, chế độ làm tròn, VAT, phương pháp giá dầu (trung bình cộng), tiêu chí ngày kỳ — sửa bắt lý do, áp dụng cho kỳ tính sau | ADMIN |
| Đơn vị & xe | danh mục đơn vị (MST, địa chỉ, người đại diện, **kế toán ký BKVC** tự điền, thứ tự ký), xe (biển số, chủ xe, mã xe dầu) | ADMIN / KẾ TOÁN (bản HAKQN) |
| Người dùng | thêm user, vai trò, đơn vị, cờ mở khóa, đặt lại mật khẩu, khóa tài khoản | ADMIN |
| Dữ liệu & sao lưu | thư mục dữ liệu (đổi sang ổ D:), thư mục sao lưu ngoài, danh sách bản sao lưu, **Sao lưu ngay**, **Khôi phục**, kiểm tra toàn vẹn | ADMIN |
| Thông tin | phiên bản APP, bản cài, schemaVersion, dung lượng dữ liệu | tất cả |

## 5. Ma trận quyền trên giao diện

| Thao tác | ADMIN | KẾ TOÁN | XEM | Bản cài không phải bên VC |
|---|---|---|---|---|
| Xem mọi màn hình nghiệp vụ | ✔ | ✔ | ✔ | ✔ (HĐ mình là bên thuê) |
| Import phiếu cân | ✔ | ✔ | — | ✔ |
| Bảng kê dầu, Tính giá, Xác nhận, Khóa, Xuất gói KY_TINH | ✔ | ✔ | — | **ẩn** |
| Mở khóa / Trả về nháp | ✔ (hoặc `can_unlock`) | — | — | ẩn |
| Sửa danh mục chung, xuất gói DANH_MUC | ✔ (mọi bản cài) | ✔ (mọi bản cài) | — | ✔ |
| Nhập gói | ✔ | ✔ | — | ✔ |
| Người dùng, tham số, sao lưu / khôi phục | ✔ | chỉ Sao lưu ngay | — | — |

## 6. Mô tả trang thiết kế

| Màn hình mẫu | Kích thước | Dữ liệu thật dùng |
|---|---|---|
| Đăng nhập (lần đầu) | 1440×900 | bản cài HAKQN, tài khoản chưa đặt mật khẩu |
| 1. Dashboard | 1440×900 | kỳ 18–23/09: 326 chuyến, 6.143,68 t, 5.853 / 18.777,6 lít, 178.000; 3 hợp đồng của bản HAKQN |
| 6. Tính giá vận chuyển | 1440×900 | kết quả HAKQN-QS, 5 cảnh báo thật |
| Xem chi tiết tính | 1440×1240 | 15 bước từ bộ tính tham chiếu |
| 7. Bảng xác nhận khối lượng | 1440×1060 | 17 xe, tổng, bằng chữ, người ký theo quy tắc |
| 3. Import bảng kê dầu (bản ĐH) | 1440×1180 | 16 dòng dầu thật file `_DH.xlsx` |
| Trao đổi: nhận gói (bản HAKQN) | 1440×900 | gói DH-HAKQN thật |

Các màn hình chưa vẽ (Phiếu cân, Giao nhận dầu – danh sách, Danh mục tuyến, Hợp đồng, Đơn giá, Chi tiết vận chuyển, Kiểm tra dữ liệu, Báo cáo, Lịch sử, Cài đặt, trình hướng dẫn khởi tạo) dùng cùng khung + mẫu bảng/form ở §3 — vẽ thêm khi anh/chị cần xem trước.

## 7. Ghi chú cho Bước 10 (lập trình)

- Mỗi màn hình = 1 file `renderer/views/<màn>.js`; bảng và form dùng **cấu hình khai báo** (danh sách cột, định dạng, trường, kiểu, bắt buộc, `refTable`) sinh từ `api_spec.json` + schema để không viết tay từng bảng.
- Chuỗi hiển thị lỗi lấy từ `errorCodes` (một nguồn), không viết cứng trong từng màn hình.
- Import: **cắt khoảng trắng đầu/cuối** mọi ô chữ trước khi đối chiếu (phát hiện trong file `_DH.xlsx`: mã xe `' 92H-00057'`).
