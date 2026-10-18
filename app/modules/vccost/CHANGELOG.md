# CHANGELOG

## 0.6.17
- Bảng tổng hợp, Bảng chi tiết, Bảng tính đơn giá (PDF + Excel): bỏ hẳn phần tên công ty/địa chỉ/MST ở đầu trang; chỉ còn quốc hiệu căn giữa. Thông tin Bên A/Bên B vẫn nằm ở khối "Bên thuê vận chuyển / Bên vận chuyển" bên dưới tiêu đề. Sửa nhãn "Bên thuê vận chuyển" bị cắt chữ ở Excel Bảng chi tiết.

## 0.6.16
- Import: nút "⬇ File mẫu phiếu cân" và "⬇ File mẫu danh sách xe" (màn Import phiếu cân). File Excel mẫu trình bày chuyên nghiệp: tiêu đề, cột bắt buộc/tùy chọn phân màu, dòng kẻ sẵn định dạng ngày giờ/số/văn bản, công thức KL hàng = |Cân 1 − Cân 2|, danh sách chọn đơn vị/địa điểm đang có, sheet "Hướng dẫn" ghi định dạng và ví dụ từng cột. Điền vào rồi import được ngay (đã kiểm thử).

## 0.6.15
- Danh mục Xe: thêm ô "Đơn vị vận chuyển (chủ xe)" + "Áp dụng từ ngày" ngay trong form thêm/sửa xe. Đổi sang đơn vị khác thì dòng cũ tự đóng và phiếu cân được tính lại. Cột "Đơn vị hiện tại" hiện nhãn đỏ "Chưa gán đơn vị" cho xe chưa có đơn vị.

## 0.6.14
- Rà soát mọi biểu mẫu (PDF + Excel): quốc hiệu "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM / Độc lập – Tự do – Hạnh phúc" luôn căn giữa; dòng "Số: …" chuyển xuống DƯỚI tiêu đề (Bảng tổng hợp, Bảng chi tiết, Bảng tính đơn giá, Bảng kê).
- Excel Bảng tính đơn giá (sheet tổng hợp): bổ sung quốc hiệu căn giữa, tiêu đề căn giữa, "Số: …"; công thức theo giá dầu giữ nguyên, kiểm tra tính lại đúng.

## 0.6.13
- Bảng tính đơn giá (và các biểu mẫu cùng kiểu: Tổng hợp tàu, Chi tiết vận chuyển; cả PDF và Excel): quốc hiệu "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM / Độc lập – Tự do – Hạnh phúc" nằm chính giữa trang, thông tin Bên A xuống dòng dưới bên trái.
- Xóa phiếu cân: chọn nhiều phiếu (ô tick) rồi "Xóa phiếu đã chọn", hoặc "Xóa tất cả phiếu đang lọc", hoặc "Xóa phiếu này" trong cửa sổ chi tiết phiếu. Xóa được cả phiếu đã áp giá vận chuyển (tiền biến khỏi Bảng kê/báo cáo). Bắt buộc ghi lý do, có nhật ký, import lại được. Phiếu đã chốt kỳ hoặc thuộc đợt đã khóa thì không xóa (phải mở khóa trước).

## 0.6.12
- Cài đặt → "Sao lưu tự động khi mở phần mềm": đặt định kỳ theo ngày (vd 2 ngày/lần). Mở phần mềm mà bản sao lưu tự động gần nhất đã quá số ngày đó thì tự sao lưu; nhập 0 để tắt.

## 0.6.11 — chốt kỳ, Dashboard theo kỳ, định dạng VN
- Chốt kỳ (mục mới): chốt theo Khoảng ngày hoặc Đợt/Tàu (có thể lọc đơn vị). Xem trước số phiếu/tiền theo Bảng kê; còn phiếu chưa tính giá thì KHÔNG cho chốt. Chốt xong lưu snapshot, khóa sửa phiếu (cả giờ cân, KL, biển số, đợt, trạng thái) và import không ghi đè được. Mở khóa bắt buộc có lý do, được ghi audit.
- Dashboard: chọn "Kỳ thể hiện" (tháng này/trước, quý, năm, tất cả, hoặc một kỳ đã chốt); số liệu chỉ tính phiếu ĐÃ TÍNH GIÁ (khớp Bảng kê); thẻ "Phiếu chưa tính giá" nêu lý do, bấm để mở danh sách cần xử lý.
- Nhập số có dấu ngăn nghìn (1.234.567,89); số canh phải, chữ canh trái, ngày canh giữa; ngày dd/mm/yyyy, số theo định dạng VN trên toàn app.
- Sửa lỗi nhỏ: biển số gõ nhầm O/I ở vị trí số, số full-width; import xe báo rõ dòng trùng biển số khác đơn vị/ngày (không âm thầm bỏ), ngày không đọc được, lỗi chồng lịch nêu đúng biển số; backup cùng giây không ghi đè nhau; khôi phục kiểm tra file trước khi đóng DB; không mở DB phiên bản mới hơn phần mềm; xóa danh mục đang có hợp đồng/nơi đến báo rõ; đối chiếu không coi số phiếu lặp ở xe khác là dữ liệu trùng; hoàn tác import chặn khi phiếu đã bị import sau sửa tiếp; phiếu LOCKED không bị đếm là "chưa tính giá".

## 0.6.10 — rà soát tính toán & logic
- Giá: tạo phiên bản giá mới không còn chồng ngày lên bảng giá bắt đầu sau nó (trước đây gây MULTIPLE_PRICE, phiếu rơi khỏi bảng kê). Kỳ giá dầu nay điều chỉnh cả bảng giá riêng theo đơn vị / loại hàng.
- Biểu mẫu: Tổng hợp tàu, Chi tiết vận chuyển, Bảng tính đơn giá dùng đúng quy tắc "đã tính giá" và cách làm tròn của Bảng kê → tổng, VAT, số bằng chữ khớp Bảng kê; các dòng cộng đúng tổng. Phụ lục xe của Bảng kê không còn cộng phiếu chưa tính giá.
- Đối chiếu: dung sai kg được đọc đúng; file đối tác không còn mất dòng khi ô đầu bắt đầu bằng "Công…".
- Import: chặn ngày không tồn tại (31/02, tháng 13…); dòng thiếu số phiếu báo lỗi thay vì bị bỏ; cột KL ghi "(tấn)" tự đổi ra kg; cùng số phiếu + cùng nơi xuất viết khác tên (QS / Quế Sơn) không còn bị coi là phiếu mới; trùng trong file khác nội dung báo lỗi; hoàn tác import đóng cảnh báo trùng.
- Sửa phiếu: phiếu đã chốt khóa mọi trường (trừ ghi chú); đợt khóa chặn sửa; kiểm tra ngày giờ và cân không âm.
- Giao diện: bộ lọc Tuyến/Biển số đang bật luôn hiện ra, không lọc ngầm Dashboard/báo cáo.

## 0.6.9
- Bảng giá / kỳ giá dầu đã có phiếu sử dụng: cho phép "Xóa và tính lại" — gỡ giá khỏi phiếu chưa chốt kỳ rồi tính lại ngay (về bảng giá cũ nếu có); phiếu đã chốt kỳ vẫn chặn.
- Đổi số bản 0.6.9 để các file .part không bị lẫn với các lần gửi trước (nguyên nhân hay gặp của lỗi khi ghép).
- Giao diện app theo style DGVC (nền, màu, font Be Vietnam Pro): mọi chứng từ in A4 dọc (lề 14/13/15/17 mm), Times New Roman cỡ 13px, bảng 12px, viền 0,6pt #444, đầu bảng xanh xám #e8eef3, dòng cộng #f2f5f8; Chi tiết vận chuyển chuyển từ ngang sang A4 dọc (cả PDF và Excel); Excel đầu bảng #EFEFEF, viền #7F7F7F như DGVC.
- Biểu mẫu ký 2 bên: mỗi bên có thêm ô KẾ TOÁN ký (cạnh ô Giám đốc/đại diện) ở PDF và Excel.
- Danh mục mới "Hợp đồng vận chuyển" (như DGVC): mã, số HĐ, ngày ký, bên vận chuyển, hiệu lực từ–đến, nơi lập, tiêu đề Bảng kê, mẫu diễn giải cước. Bảng kê và 3 biểu mẫu in tự lấy "Căn cứ hợp đồng số… ngày…" theo hợp đồng còn hiệu lực tại ngày chứng từ. Migration 003 tự tạo hợp đồng từ số HĐ đã nhập ở đơn vị vận chuyển.

## 0.6.7
- Bảng tổng hợp xuất hàng tàu và Chi tiết vận chuyển làm lại theo bố cục PRICING_SHEET: đầu chứng từ (Bên A trái, quốc hiệu + Số phải), tiêu đề, khối thông tin có nhãn (căn cứ hợp đồng, Bên thuê, Bên vận chuyển, tuyến), bảng, bằng chữ, ký 2 bên. Tổng hợp tàu in dọc A4.

## 0.6.6
- Bảng tính đơn giá: mỗi tuyến canh vừa khít 1 trang A4 (PDF), kể cả khi có mục D và chữ ký.

## 0.6.5
- Bảng tính đơn giá vận chuyển theo mẫu PRICING_SHEET: mỗi tuyến một trang (STT · Chỉ tiêu · Cách tính · Diễn giải · Giá trị · ĐVT; mục A thông số, B giá dầu áp dụng, C điều chỉnh, đơn giá + bằng chữ, D giá trị cước theo phiếu cân nếu chọn khoảng ngày; ký 2 bên). Excel mỗi tuyến một sheet có công thức sống + sheet tổng hợp; PDF cùng bố cục.

## 0.6.4
- Bảng tổng hợp xuất hàng tàu: tiêu đề 3 dòng theo mẫu — "BẢNG TỔNG HỢP VẬN CHUYỂN XUẤT HÀNG TÀU <tên tàu>" / "TUYẾN TỪ <nơi xuất> ĐẾN <nơi đến>" / "ĐỢT <mã đợt, ngày>"; mỗi tuyến (nơi xuất → nơi đến) của từng đơn vị một bảng/sheet. Tự lấy tên tàu theo đợt.

## 0.6.3
- **Xóa nhầm**: nút 🗑 ở Bảng giá / Giá dầu chuyển lên cột đầu (trước nằm cuối bảng nên bị khuất), thêm nút "Xóa" trong hộp sửa; kỳ điều chỉnh giá dầu ĐÃ DUYỆT xóa được nếu chưa phiếu nào dùng (gỡ bảng giá do kỳ sinh ra, mở lại bảng cũ).
- **Báo cáo → Biểu mẫu in ký 2 bên** (Excel A4 + PDF, Times New Roman, quốc hiệu, thông tin Bên A/B, chữ ký + kế toán): (1) Tổng hợp xuất hàng theo tàu (mỗi đơn vị × nơi xuất: số xe, chuyến, KG, tấn, đơn giá, thành tiền, VAT, tổng, bằng chữ); (2) Chi tiết vận chuyển từng xe/từng chuyến (số phiếu, giờ cân 1/2, cân lần 1/2, KL, đơn giá, cộng theo xe); (3) Bảng tính đơn giá vận chuyển (Excel có công thức sống + PDF, chọn Bên B ký).
- Các báo cáo tổng hợp có lại cột KL (kg) và (tấn).

## 0.6.2 (chưa đóng gói)
- Bảng kê / biên bản in theo **style DGVC**: Times New Roman, quốc hiệu, "Số …/BK-<mã>-<tháng>", căn cứ hợp đồng, khối thông tin Bên A/Bên B (đại diện, chức vụ, MST, ĐT, email, TK ngân hàng), bảng có KL **kg + tấn**, bằng chữ, địa danh/ngày, chữ ký có tên công ty in hoa, chức danh và kế toán. KG quay lại trong bảng kê vì cần cho đối chiếu khối lượng.
- Danh mục **Đơn vị vận chuyển** có thêm nhóm "Thông tin in Bảng kê / biên bản": tên in, xưng hô, đại diện, chức danh, kế toán, email, ngân hàng, số TK, số/ngày hợp đồng, địa danh (migration 002). Cài đặt → Bên A có thêm xưng hô, điện thoại, email, địa danh.
- **Đối chiếu khối lượng 2 bên theo xe** (Bên A cân ↔ Bên B đối tác) lấy từ lô đối chiếu: số chuyến, KL kg, chênh B−A (kg, %), kết luận Khớp/Lệch/Chỉ một bên. Chọn lô ngay màn Bảng kê; in kèm "Biên bản đối chiếu khối lượng" (sheet Excel + trang PDF) có ô thống nhất và chữ ký 2 bên.
- Phụ lục PDF: 1) theo xe 2) đối chiếu KL (nếu chọn) 3) danh sách phiếu cân. 48 test PASS.

## 0.6.1 (đã đóng gói; các mục dưới cũng nằm trong 0.6.2 nếu chưa đóng gói)
- Bảng kê + báo cáo: Excel chuẩn in/ký (A4, Bên A/Bên B, bằng chữ, khối chữ ký, phụ lục phiếu cân), xuất PDF, bộ lọc đầy đủ (+ nơi xuất, tuyến, biển số); bỏ cột KG và "chưa tính giá" khỏi báo cáo (chỉ còn cảnh báo); Cài đặt có thông tin Bên A.
- Giá dầu: Import từ file (Ngày + Giá, xem trước, tùy chọn ghi đè), sửa/xóa giá dầu từng ngày, xóa kỳ điều chỉnh nháp.
- Bảng giá: nút 🗑 chỉ xóa được bảng giá CHƯA có phiếu dùng; có phiếu dùng thì chặn và cảnh báo (tạo phiên bản giá mới thay thế).
- Mục mới **Bảng tính đơn giá** (CHI PHÍ): từng tuyến, từng bước I.1→III.1 như sheet Excel "Giá dầu + Giá VC"; đổi giá dầu / bình quân khoảng ngày để xem trước; Xuất Excel có công thức sống; "Áp dụng thành bảng giá mới" từ ngày X.
- Bảng giá: chỉ nhập THÔNG SỐ (đơn giá gốc, giá dầu cơ sở/áp dụng, km, định mức, KL bình quân); "Đơn giá áp dụng" và "Điều chỉnh" TỰ TÍNH theo công thức Excel, không nhập tay (server bỏ qua giá gửi lên). Form có xem trước công thức; đổi km → giá tự tính lại.

## [0.6.0] — 2026-10-07 — Dữ liệu ban đầu từ Excel
- Lần mở đầu tiên (CSDL trống) app tự nạp dữ liệu từ file Excel V.47 đi kèm (`data/seed/Tong-hop-chi-phi-VC-V47.xlsx`): địa điểm, tuyến, 4 đơn vị VC, giá dầu + kỳ điều chỉnh + bảng giá (gồm Quế Sơn), đợt PON-V47, 220 xe, 2.035 phiếu cân đã tính giá. Dùng đúng luồng nghiệp vụ thật; chạy lại không trùng. Chỉ nạp 1 lần (cờ `initial_data`).
- Cài đặt → "Nạp dữ liệu ban đầu (Excel V.47)" để nạp lại/bổ sung thủ công. 43 test PASS; kiểm thử Electron thật: lần 1 nạp đủ, lần 2 không nạp lại.

## [0.5.0] — 2026-10-07 — Chọn thư mục lưu trữ + bản Windows Portable
- Cài đặt → "Thư mục lưu trữ dữ liệu": chọn thư mục khác; **Chép dữ liệu sang** (đích phải trống, thư mục cũ giữ nguyên, tự backup trước) hoặc **Dùng dữ liệu có sẵn** (không ghi đè); về thư mục mặc định; tự khởi động lại. Cấu hình ở `vccost-location.json` (cạnh .exe / %APPDATA%/VCCost). Thư mục đã chọn mất (rút USB) → hỏi, không tự tạo CSDL trắng.
- Đã kiểm thử trong Electron thật (xvfb): đổi, mở lại, về mặc định. 42 test PASS.
- Bộ cài Setup (NSIS, cài theo người dùng, không cần Admin, có gỡ cài đặt, gỡ không xóa dữ liệu) dựng bằng `installer/make-setup.py` — chạy được trên Linux không cần wine.
- Cấu hình electron-builder (`npm run dist:win`); better-sqlite3 chuyển sang dependencies. Portable build được; Setup cần wine/Windows.

## [0.4.1] — 2026-10-07
- Q10: hiển thị chênh lệch KL giám định − KL cân (báo cáo theo đợt, Dashboard lọc đợt, danh mục Đợt/Tàu); cước vẫn tính theo KL cân. Seed nạp KL giám định 38.453,23 t. 38 test PASS. Đã chốt đủ Q1–Q10.

## [0.4.0] — 2026-10-07 — Phase 9: Đối chiếu
### Thêm
- `ReconciliationService`: khớp theo Số phiếu (hoặc Biển số + Ngày + KL nếu file đối tác không có số phiếu); 9 loại kết quả (Khớp / Thiếu bên A / Thiếu bên B / Lệch KL / Lệch đơn giá / Lệch tiền / Lệch VAT / Trùng dữ liệu / Cần kiểm tra); liệt kê đủ mọi cột lệch; dung sai KL và tiền cấu hình được.
- Cờ `trang_thai_doi_chieu` trên phiếu, 1 cảnh báo tổng hợp cho mỗi lô lệch, xử lý từng dòng (Chấp nhận A/B, Điều chỉnh, Bỏ qua + ghi chú, có audit). Đối chiếu không sửa phiếu cân.
- Màn hình Đối chiếu (danh sách lô → 2 bước → bảng song song Hệ thống | Đối tác, ô lệch tô màu) và xuất Excel 2 sheet (Bảng đối chiếu, Sai lệch).
- 3 test mới (37 PASS) + UI e2e mở rộng (25 ảnh chụp); mẫu file đối tác `tests/fixtures/doitac-hak.xlsx`.
### Chưa có
- Đối chiếu cấp xe (đối tác chỉ gửi tổng theo biển số); build Windows.

## [0.3.0] — 2026-10-07 — Giao diện (renderer) + kiểm thử UI
### Thêm
- Giao diện Electron/HTML: sidebar tối, Dashboard (KPI, biểu đồ cột/thanh thuần CSS, top xe), Phiếu cân (phân trang/sắp xếp/tìm phía server, xuất Excel, "Vì sao phiếu có giá này?"), Chi tiết theo xe (timeline + cờ thời gian), 5 báo cáo có drill-down, Bảng kê thanh toán theo từng đơn vị (+ xuất Excel).
- Import 4 bước (chọn file → sheet & ghép cột → xem trước có phân loại/bộ lọc → kết quả), import danh mục xe, "Cần kiểm tra" (Giữ cũ / Cập nhật / Bỏ qua, có so sánh), Lịch sử import + hoàn tác.
- Danh mục CRUD sinh từ cấu hình (xe + lịch sử đơn vị, đơn vị VC, địa điểm + alias, tuyến, đợt/tàu), Bảng giá (phiên bản mới), Giá dầu (kỳ điều chỉnh: xem trước → duyệt), Cảnh báo, Audit log, Backup/Khôi phục, Cài đặt (làm tròn, ngưỡng thời gian).
- `tools/dev-server.js` (chạy UI trong trình duyệt với cùng handlers), `tests/ui-smoke.mjs` (Playwright e2e + 23 ảnh chụp trong `docs/screenshots/`).
### Chưa có
- Đối chiếu (Phase 9) chỉ có đặc tả; build Windows Portable/Setup cần máy Windows/CI.

## [0.2.0] — 2026-10-07 — Áp dụng quyết định nghiệp vụ Q1, Q2, Q3, Q5 + backend Phase 3–7
### Nghiệp vụ đã chốt
- Q1: Xe trả về **vẫn tính cước**; cờ `xe_tra_ve` chỉ dùng cho KL xuống tàu (BR-DOT-05).
- Q2: Giá Quế Sơn **suy ngược**: 146 km khứ hồi (Quế Cường 55 km + 18 km), cước cơ sở 173.000, giá dầu cơ sở 19.200 từ 07/11/2025 → engine tự tính ra 206.500, khớp Excel (BR-TUYEN-04). Đây là tổ hợp duy nhất cho cước cơ sở tròn nghìn.
- Q3: **Hóa đơn riêng từng đơn vị** (HHH, HAK, QC, ĐH) (BR-XE-06).
- Q5: **Làm tròn theo bảng kê**: thành tiền mỗi dòng giá làm tròn đồng, VAT tính 1 lần trên tổng (BR-ROUND-01).
### Thêm
- StatementService (bảng kê theo đơn vị), CatalogService, PriceService (kỳ điều chỉnh giá dầu), TicketImportService (preview → commit transaction, Cần kiểm tra, hoàn tác batch), VehicleImportService, CostService (tính lại khi danh mục đổi), ReportService, AlertService, AuditService, BackupService, SeedService, xuất Excel (ExcelJS), IPC + Electron main.
- 34 test PASS (unit + migration + integration end-to-end với file mẫu).
### Kiểm chứng
- Bảng kê V.47: HHH 4.074.119.881 · HAK 416.454.167 · QC 624.215.138 · ĐH 398.115.232 → tổng 5.512.904.418 đ (Excel 5.512.904.418,24 — lệch −0,24 đ do làm tròn).
### Chưa có
- Giao diện (renderer), build Windows Portable/Setup.


## [0.1.0] — 2026-10-06 — Phase 1–2 (Phân tích & Thiết kế) + lõi engine
### Thêm
- Phân tích đầy đủ file Excel mẫu PRINCE OF NATURE V.47 (6 sheet, công thức, dữ liệu, 11 lỗi/rủi ro, 10 câu hỏi nghiệp vụ).
- Bộ tài liệu: PHAN_TICH_THIET_KE_A-H, PROJECT_SPEC, DATABASE_SCHEMA, BUSINESS_RULES, IMPORT_SPEC, PRICE_ENGINE_SPEC, RECONCILIATION_SPEC, UI_SPEC, TEST_PLAN, TODO_ROADMAP.
- Migration SQLite v1 (`001_init.sql`) + migration runner có rollback.
- Lõi nghiệp vụ: money (Decimal, làm tròn kiểu Excel), plate (chuẩn hóa biển số), datetime, FuelAdjustmentService, PriceResolver, VehicleResolver (lịch sử), TransportCostEngine (GROUP/TICKET), DuplicateDetector, TimeAnomalyService, dò header & parser phiếu cân.
- 24 unit test (PASS) + script `validate-sample.js` → EXCEL_VS_APP_VALIDATION: khớp 100% với Excel.
- Seed dữ liệu cấu hình từ file mẫu (`data/seed/sample-v47.json`).
