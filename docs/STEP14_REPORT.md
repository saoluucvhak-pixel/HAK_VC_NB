# BƯỚC 14 — SO SÁNH TOÀN BỘ APP ↔ EXCEL

**Kết quả (cập nhật 25/09/2026, sau khi anh/chị chốt 2 điểm):** so **8.702 chỉ tiêu** giữa APP và 3 file Excel gốc.
- **8.345 chỉ tiêu khớp.**
- **357 chỉ tiêu khác, và cả 357 đều đã có giải thích.**
- **Không còn chênh lệch nào chưa giải thích.**
- Tất cả **99/99 test đạt**.

**Không có chênh lệch nào về đơn giá, số chuyến, KG, lít dầu hay giá dầu.** Các chênh lệch chỉ nằm ở: làm tròn tới đồng, sai số số thực của Excel, khoảng trắng thừa, LDĐ đã chốt, và phần chữ / khối ký.

Chi tiết từng ô nằm trong file **`SO_SANH_APP_EXCEL.xlsx`**:
- **TONG_HOP**: bảng tổng hợp.
- **CHENH_LECH**: 357 dòng, mỗi dòng có đủ các cột Công thức / Dữ liệu / Làm tròn / Kiểu dữ liệu / Nguyên nhân / Đề xuất / Trạng thái.
- Các sheet chi tiết: QR_DGVC, BKVC, PHIEU_CAN, DAU, BK_MAU_CU, CAN_TRAM, BKCT_EXCEL.

## 1. Cách so
- **Bên APP:** chạy đúng như người dùng làm.
  1. Tạo bản cài mới.
  2. Import thẳng file Excel gốc.
  3. Sửa LDĐ về 0726 (đã chốt).
  4. Tính → xác nhận → in báo cáo.
- **Bên Excel:** đọc thẳng ô kết quả trong các sheet. Không dùng bộ ghép cột của APP, để hai bên độc lập với nhau.
- **Không sửa số APP cho khớp Excel.** Mỗi chỗ khác phải khớp với 1 quy tắc giải thích. Chỗ nào chưa có quy tắc thì bị đánh dấu "CHƯA GIẢI THÍCH" và test báo lỗi. Công cụ: `node tools/compare-excel.js`.

| Phạm vi | Nguồn Excel | Số phép so | Khớp | Khác |
|---|---|---|---|---|
| Bảng tính đơn giá (3 file) | QR_DGVC (2): 16 chỉ tiêu + khối ký | 69 | 57 | 12 (chỉ ở khối ký) |
| Phiếu cân (3 file) | NL_VC: từng phiếu × 16 cột | 8.048 | 7.771 | 277 (LDĐ 177 + khoảng trắng 100) |
| Bảng kê dầu (3 file) | NL_GIAONHANDAU: từng dòng × 8 cột + có trong kỳ | 426 | 406 | 20 (khoảng trắng) |
| BKVC (file QS) | BKVC: 17 xe × 7 cột, tổng, chữ, đầu trang, khối ký, diễn giải hóa đơn | 144 | 102 | 42 |
| Mẫu BKVC cũ 11/2025 | BK: tính lại bằng công thức APP | 12 | 6 | 6 |
| File xuất trạm cân 11/2025 | CAN: import + SUBTOTAL | 3 | 3 | 0 |

## 2. Chỉ tiêu tính — khớp 100%

| Chỉ tiêu | HAKQN → CNHAK | ĐH → HAKQN | HAK → HAKQN |
|---|---|---|---|
| Số chuyến / Tổng KL (tấn) | 326 / 6.143,68 | 77 / 1.452,13 | 100 / 1.870,38 |
| Dầu thực nhận / định mức / CL (lít) | 5.853 / 18.777,6 / 12.924,6 | 5.734,69 / 4.435,2 / −1.299,49 | 5.088,35 / 5.760 / 671,65 |
| Đơn giá dầu | 29.940 | 29.210 | 29.490,77 |
| ĐG HĐ / ĐG CL Diesel | 115.000 / 62.985,46 | 115.000 / −26.139,60 | 115.000 / 10.590,08 |
| **Đơn giá vận chuyển** | **178.000** | **88.900** | **125.600** |

Ngoài ra:
- Ngày bắt đầu, ngày kết thúc, ngày nhập dầu, cự ly, tên tuyến và định mức đều khớp.
- 503 phiếu cân và 47 dòng dầu khớp từng ô, trừ LDĐ và khoảng trắng.
- Giá dầu tính lại từ bảng kê (trung bình cộng) đúng bằng giá dầu của APP và của Excel.

## 3. 360 chỗ khác — giải thích theo 5 mục

| # | Quy tắc | Số chỗ | Loại | Nguyên nhân | Trạng thái |
|---|---|---|---|---|---|
| 1 | LDD_0726 | 177 | Dữ liệu | File ĐH / ĐN ghi `0526`. Anh/chị đã chốt `0726`, APP sửa hàng loạt (có nhật ký) | ĐÃ SỬA |
| 2 | KHOANG_TRANG | 120 | Kiểu dữ liệu | Ô Excel có khoảng trắng thừa (" 92H-00057", "Công ty TNHH Hoàng Anh Khôi "). APP bỏ khoảng trắng khi import | Chấp nhận |
| 3 | LAMTRON_VAT_DONG | 32 | Làm tròn | APP làm tròn VAT từng dòng tới đồng, Excel để số lẻ (5.126.542,4) | Chấp nhận |
| 4 | LAMTRON_TONG | 2 | Làm tròn | Tổng VAT / sau VAT: APP 87.486.003 / 1.181.061.043, Excel …,2. Chênh 0,2 đ | Chấp nhận |
| 5 | KIEUSO_THUC | 2 | Kiểu dữ liệu | Excel lưu 64.585.519,99999999 và 6.143,679999999999 (sai số số thực) | Chấp nhận |
| 6 | CHU_A25_CU | 1 | Dữ liệu | Ô bằng chữ A25 là chữ gõ sẵn, **không phải công thức**, ứng với số 1.255.799.581 của kỳ khác. APP đọc đúng số tổng | Chấp nhận |
| 7 | QR_KHOI_KY_CHEP | 9 | Dữ liệu | Sheet QR_DGVC (2) của file ĐH / ĐN vẫn ghi bên thuê là "CN CÔNG TY TNHH HOÀNG ANH KHÔI" (chép từ file QS), trong khi hợp đồng là → HAKQN. APP lấy khối ký theo hợp đồng | Chấp nhận |
| 8 | NHAN_SAI_QRDGVC | 1 | Dữ liệu | QR_DGVC (2) ghi VÕ THỊ NHƯ NGỌC là "Giám Đốc", còn BKVC cùng file ghi "P.Giám Đốc" | Chấp nhận |
| 9 | CHUC_DANH | 3 | Trình bày | "   Giám Đốc" / "P.Giám Đốc" ↔ "Giám đốc" / "Phó Giám đốc" | Chấp nhận |
| 10 | THU_TU_DONG | 1 | Trình bày | BKVC: APP xếp theo biển số. Số liệu từng xe khớp 17/17 | Chấp nhận |
| 11 | DIACHI_DANHMUC | 1 | Dữ liệu | Excel in địa chỉ viết tắt, APP in địa chỉ đầy đủ trong danh mục. Muốn bản ngắn thì sửa danh mục, không cần sửa phần mềm | Chấp nhận |
| 12 | MST, KETOAN_QRDGVC | 2 | Trình bày | APP in thêm dòng MST, và thêm Kế toán ở bảng tính đơn giá | Chấp nhận |
| 13 | BK_CU_THANHTIEN, BK_CU_TONG_TRUOC_VAT | 4 | Làm tròn | Mẫu cũ để Thành tiền số lẻ. **VAT, tổng sau VAT 49.583.334 và câu bằng chữ đều trùng APP** | Chấp nhận |
| 14 | TEN_DON_VI | 0 | Dữ liệu | Đã chốt: tên in đổi được, mặc định "Tên ghi trên chứng từ" → nay khớp Excel | ĐÃ SỬA |
| 15 | DIENGIAI_CUOC | 0 | Trình bày | Đã chốt: dùng để viết hóa đơn → APP sinh 1 dòng / xe, trùng từng chữ BKVC!C37 | ĐÃ SỬA |
| 16 | BK_CU_NGUOIKY | 2 | Dữ liệu | Mẫu cũ 11/2025 (HAK vận chuyển cho HAKQN): HAK ký VÕ THỊ NHƯ NGỌC, HAKQN ký VÕ VĂN PHỤNG. Ngược với thứ tự đã chốt | **CẦN XÁC NHẬN** |

**Mẫu BK cũ ủng hộ cách làm tròn của APP:** chính công ty đã làm tròn VAT từng dòng (VAT là số nguyên gõ tay) và làm tròn tổng bằng `ROUND(G+H;0)`. Câu bằng chữ dùng hàm `vnd()` ra đúng như APP: *"Bốn mươi chín triệu, năm trăm tám mươi ba ngàn, ba trăm ba mươi bốn đồng y ./."*

## 4. Sửa / bổ sung trong bước này (không đổi số tính)

| Việc | Lý do |
|---|---|
| **Khối ký cho Bảng kê chi tiết và Bảng tính đơn giá** (Excel, PDF), kèm dòng "( Vận chuyển từ ngày … )" | Sheet BKCT và QR_DGVC (2) của Excel đều có khối ký 2 bên. Trước đây APP chỉ in khối ký ở BKVC |
| **Import file xuất từ trạm cân** (dạng sheet CAN): cho gán 1 mã tuyến chung khi file không có cột tuyến | File trạm cân có cột "Cty VC" nhưng không có "Mã cự ly VC". Kết quả import: 63 lượt, đúng SUBTOTAL; tổng 1.146.690 kg; chủ xe tự nhận từ "Cty VC" (HAKQN 17, ĐH 45, HAK 1) |
| **Cảnh báo "KL ≠ cân 2 − cân 1" so theo trị tuyệt đối** | File trạm cân có 3 lượt cân xe có hàng trước, xe rỗng sau (31.800 → 13.740, KL 18.060). Đây là cách cân bình thường, không còn báo nhầm |

Sheet **BKCT** trong file Excel đang chứa dữ liệu cũ (27–31/07/2026) nên không so số được, chỉ so cấu trúc:
- Excel có 10 cột. APP có 16 cột: thêm nguồn gốc, khách hàng, LDĐ, kiểu cân, tuyến, đơn vị VC.
- Khối ký: nay đã giống Excel.

## 5. Đã chốt 25/09/2026
1. **Tên bên thuê in trên chứng từ — đổi được.**
   - APP lấy tên theo thứ tự: tên riêng của hợp đồng (ô mới "Tên bên thuê / bên vận chuyển in trên chứng từ") → "Tên ghi trên chứng từ" của đơn vị → tên đơn vị.
   - Mặc định in "CN CÔNG TY TNHH HOÀNG ANH KHÔI", **khớp Excel**. Đổi ở hợp đồng thì chỉ hợp đồng đó đổi. Đổi ở danh mục thì mọi hợp đồng của đơn vị đổi.
   - Lưu ý: với ĐH, "Tên ghi trên chứng từ" hiện là "Công ty TNHH SXTMDV Đại Hiệp", còn Excel in "CÔNG TY TNHH SX TM DV ĐẠI HIỆP". Anh/chị sửa trong danh mục nếu muốn giống Excel.
2. **Dòng "Cước vận chuyển dăm gỗ từ NM … bằng xe thùng BKS …" dùng để viết hóa đơn.**
   - APP sinh **1 dòng cho mỗi xe** của BKVC. Mỗi dòng có diễn giải, ĐVT Tấn, số lượng, đơn giá, thành tiền, thuế suất, tiền thuế và tổng, đúng bằng số trên BKVC.
   - Dòng của xe 43H-01055 **trùng từng chữ** với ô BKVC!C37 của Excel.
   - Mẫu câu **sửa được theo từng hợp đồng**, có các chỗ trống {BKS} {TUYEN} {MA_TUYEN} {TU_NGAY} {DEN_NGAY}. Hợp đồng chưa có mẫu riêng thì dùng mẫu chung trong Cấu hình.
   - Nơi xuất: sheet `HOA_DON` trong file BKVC; các dòng diễn giải dưới khối ký BKVC (ngoài vùng in, như Excel); báo cáo riêng "Diễn giải hóa đơn" (Excel / CSV / PDF).
   - Lưu ý: mẫu câu lấy từ file QS ghi "từ NM Đông Phú đến NM Bà Nà", trong khi tuyến VC.007 là "Xã Quế Sơn – Tiên Sa". Anh/chị kiểm tra lại câu chữ cho đúng từng hợp đồng.

3. **Người ký luôn đúng thứ tự ưu tiên đã thống nhất** (HAK → HAKQN → ĐH → CNHAK).
   - Hợp đồng HAK → HAKQN: HAK ký VÕ VĂN PHỤNG – Giám đốc, HAKQN ký VÕ THỊ NHƯ NGỌC – Phó Giám đốc.
   - Mẫu cũ 11/2025 ghi ngược → không theo. Quy tắc BK_CU_NGUOIKY chuyển sang "Chấp nhận".
   - **Không còn điểm nào chờ xác nhận.**
4. **Tuyến vận chuyển sửa được, bổ sung được** (phần mới `CatalogService`, 6 test):

| Việc | Luật |
|---|---|
| Thêm tuyến | Mã duy nhất (vd VC.016), tên, cự ly, cự ly chuyến (trống = 2 × cự ly), ĐVT tấn / m³, **điểm đi / điểm đến**. Có kiểm tra từng ô và nhật ký |
| Sửa tên, điểm đi / điểm đến, ghi chú | Luôn được. Không làm đổi số tính |
| Sửa cự ly / cự ly chuyến / ĐVT | Kỳ nháp dùng tuyến đó bị đánh dấu **cần tính lại**. Kỳ đã xác nhận / khóa: chỉ ADMIN hoặc người có quyền mở khóa sửa được, **bắt buộc lý do**; kết quả đã lưu và BKVC in lại không đổi |
| Ngừng dùng tuyến | Không xóa cứng. Cấm khi còn kỳ nháp dùng tuyến |
| Giá tuyến | Theo phiên bản: tạo bản nháp → xem trước ĐG_HĐ → kích hoạt. Kích hoạt thì tự đóng bản trước (ngày mới − 1). Không cho đổi giá của những ngày đã nằm trong kỳ đã xác nhận |
| Bản cài không phải gốc danh mục (khác HAKQN) | Vẫn sửa được, nhưng có nhắc báo HAKQN sửa giống |

   - Điểm đi / điểm đến của tuyến đi thẳng vào **diễn giải hóa đơn**. Mẫu chung: "Cước vận chuyển dăm gỗ từ {DIEM_DI} đến {DIEM_DEN} bằng xe thùng BKS : {BKS}".
   - Tuyến chưa điền điểm đi / điểm đến thì APP tách từ tên tuyến (vd "Xã Quế Sơn - Tiên Sa" → từ "Xã Quế Sơn" đến "Tiên Sa").
   - Hợp đồng HAKQN-QS vẫn giữ nguyên câu chữ Excel, sửa được.

## 6. Bước tiếp theo
**Bước 15:** vỏ Electron + giao diện + đăng nhập + sao lưu (USB / Google Drive) + gói trao đổi giữa các bản cài + bộ cài cho từng đơn vị.
