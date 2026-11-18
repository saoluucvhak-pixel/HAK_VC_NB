# DGVC 1.3.2 — Rà soát trực quan (màn nhỏ, bàn phím, bộ lọc, Excel/PDF nhiều trang)

Cơ sở: 1.3.1 (`main` tại `fe15ae6`). Môi trường: Linux x64, Chromium (Playwright), Electron 45.3.3, LibreOffice (in thử Excel → PDF), `pdftotext/pdftoppm`. Chưa có máy Windows. Ghi chú 1.3.1 và ma trận chung: `docs/PHAT_HANH_1.3.1.md`.

## Lỗi xác nhận và đã sửa
| # | Mức | Lỗi | Vị trí | Tái hiện → thực tế / kỳ vọng | Ca chứng minh |
|---|---|---|---|---|---|
| 1 | Cao với laptop nhỏ | Cửa sổ có **`minWidth: 1280`** — màn 1366×768 để tỉ lệ 125 % / 150 % chỉ còn **1093 / 910** đơn vị độc lập thiết bị → cửa sổ buộc rộng hơn màn hình (trôi ra ngoài) | `main/electron/main.js:64` | Windows 1366×768 @150 % → phải kéo ngang mới thấy hết | Cửa sổ nay `min(1440, màn hình)`, `minWidth 900`, `minHeight 520` (đọc `screen.workAreaSize`); `tests/ui.a11y.e2e.test.js` đo 910×512 và 1093×614 |
| 2 | Trung bình | **Bảng xác nhận KL**: chứng từ bị bóp hẹp ở < 1150 px (chữ gãy 4–5 dòng, tab xuống dòng), tràn ngang trang ở 880 px | `renderer/views/reports.js:75` (lưới 1fr 340px cố định) | Mở BKVC ở 910 px | Lưới `doc-split` xếp dọc dưới 1150 px; tab không xuống dòng |
| 3 | Trung bình | Bộ lọc xếp thành cột dài, đẩy bảng khuất dưới màn (Phiếu cân @910 px) | `renderer/styles.css` `.filters` | — | Ô lọc rộng đều 190 px, 2–3 ô/hàng |
| 4 | Trung bình | **Bàn phím**: Enter trong ô lọc **không** áp dụng bộ lọc (Phiếu cân, Lịch sử thao tác, Chi tiết vận chuyển…); không có "Xóa lọc", không hiện số điều kiện đang lọc | mọi màn có nút Lọc/Xem | Gõ vào ô, Enter → không gọi API | `D.enhanceFilters` dùng chung: Enter = Lọc; "N điều kiện đang lọc"; "Xóa lọc" đưa về mặc định và lọc lại (`tests/ui.a11y.e2e.test.js`) |
| 5 | Trung bình | **Hộp thoại không giữ focus**: Tab thoát khỏi hộp ra nền dù `aria-modal` | `renderer/app.js` `D.modal` | Mở phiếu, Tab ≥ 1 lần → focus ra ngoài | Tab/Shift+Tab xoay vòng trong hộp; trả focus về nút mở; focus đầu vào ô nhập hoặc nút chính |
| 6 | Trung bình | **Excel in nhiều trang không lặp dòng tiêu đề, không có chân trang "Trang x/y"** (PDF đã lặp) | `main/reports/xlsxExport.js` (bảng danh sách / BKCT) | BKCT 340 dòng: file không khai báo `Print_Titles` | `printTitlesRow` + chân trang; in thử Excel → PDF bằng LibreOffice: tiêu đề lặp ở mọi trang (`tests/report.multipage.test.js`) |

## Đối chiếu Excel / PDF / màn hình
`tests/report.multipage.test.js` (chạy được khi có Chromium + `pdftotext`):
- **Danh sách phiếu cân 1.800+ dòng:** Excel đủ 1.800 dòng, khai báo dòng tiêu đề lặp + chân trang; PDF nhiều trang (> 10), **mọi trang có tiêu đề cột**, đủ 1.800 dòng, dòng tổng số phiếu / kg khớp dữ liệu nguồn.
- **Kỳ HAKQN-QS (326 chuyến):** BKVC trên API = Excel = PDF về số chuyến, thành tiền, VAT, tổng (1.181.061.043 đ), số bằng chữ; BKCT nhiều trang tổng kg = BKVC (6.143.680 kg).
- **Xem trực quan:** PDF BKVC (1 trang), BKCT (8 trang, tiêu đề lặp), danh sách phiếu (46 trang); Excel in qua LibreOffice (7 trang, tiêu đề lặp ở mọi trang).

## Bộ lọc — kết quả rà soát
Mỗi màn có bộ lọc riêng (Phiếu cân, Giao nhận dầu, Báo cáo, Chi tiết vận chuyển, Lịch sử thao tác, Đơn giá, Căn cứ…). Đã thống nhất bằng một lớp dùng chung (Enter, đếm điều kiện, Xóa lọc) thay vì viết lại từng màn. **Không làm** (tránh phức tạp thừa): lưu bộ lọc, chọn nhiều giá trị, chip từng điều kiện. Còn lại: các ô chọn phụ thuộc theo hợp đồng chỉ có ở màn Giao nhận dầu / Báo cáo đã dùng sẵn — không đổi.

## Ma trận (lượt này)
| Hạng mục | Kết quả | Trạng thái |
|---|---|---|
| Màn nhỏ 1093×614, 910×512: 18 màn không tràn ngang | `tests/ui.a11y.e2e.test.js` | Đạt |
| Màn 800 px và 640 px | Ngoài kích thước cửa sổ tối thiểu mới (900); đo thăm dò thấy tràn ở vài màn khi < 880 px | Không hỗ trợ (< 900 DIP) |
| Tên truy cập của nút / ô nhập, main landmark (14 màn) | thăm dò: không thiếu tên | Đạt |
| Dấu hiệu focus nhìn thấy (30 điều khiển) | thăm dò | Đạt |
| Enter / Xóa lọc / bẫy focus hộp thoại / Esc | `tests/ui.a11y.e2e.test.js` (đỏ trên mã cũ) | Đạt |
| Excel/PDF nhiều trang, tổng khớp | `tests/report.multipage.test.js` | Đạt (Linux) |
| Trình đọc màn hình thật (NVDA), kích thước chữ hệ thống 150 %+ trên Windows, in ra máy in thật | không có Windows / thiết bị | **Chưa xác minh** |
| Cài đặt bộ cài trên Windows | không có Windows | **Chưa xác minh** |
