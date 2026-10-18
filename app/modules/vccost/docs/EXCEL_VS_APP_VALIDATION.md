# EXCEL_VS_APP_VALIDATION

File Excel: `sample.xlsx`  
Thời điểm chạy: 2026-10-06T17:34:33.808Z  
Chế độ làm tròn: **Excel-compat** (cộng KG theo nhóm rồi × đơn giá, không làm tròn thành tiền/VAT — đúng như công thức Excel).

## 1. Module điều chỉnh giá cước theo giá dầu (sheet "Giá dầu + Giá VC")

| Chỉ tiêu | Excel | App | Chênh | Kết quả |
|---|---:|---:|---:|---|
| DN-TIENSA — cước tăng/tấn (II.2) | 14.324,00 | 14.324,00 | 0,00 | ✅ Khớp |
| DN-TIENSA — cước điều chỉnh làm tròn (II.3) | 14.300,00 | 14.300,00 | 0,00 | ✅ Khớp |
| DN-TIENSA — đơn giá áp dụng (III.1) | 85.300,00 | 85.300,00 | 0,00 | ✅ Khớp |
| DH-TIENSA — cước tăng/tấn (II.2) | 20.691,00 | 20.691,00 | 0,00 | ✅ Khớp |
| DH-TIENSA — cước điều chỉnh làm tròn (II.3) | 20.700,00 | 20.700,00 | 0,00 | ✅ Khớp |
| DH-TIENSA — đơn giá áp dụng (III.1) | 116.700,00 | 116.700,00 | 0,00 | ✅ Khớp |
| QC-TIENSA — cước tăng/tấn (II.2) | 25.207,00 | 25.207,00 | 0,00 | ✅ Khớp |
| QC-TIENSA — cước điều chỉnh làm tròn (II.3) | 25.200,00 | 25.200,00 | 0,00 | ✅ Khớp |
| QC-TIENSA — đơn giá áp dụng (III.1) | 155.200,00 | 155.200,00 | 0,00 | ✅ Khớp |
| QS-TIENSA — đơn giá suy ngược (so với Excel 'Xe chạy QS (HHH)'!F5) | 206.500,00 | 206.500,00 | 0,00 | ✅ Khớp |

## 2. Import phiếu cân (sheet "File tổng")

- Dòng header tự dò được: **4**; cột nhận dạng: stt→A, so_phieu→B, ngay_gio_can_1→C, ngay_gio_can_2→D, bien_so→E, can_lan_1→F, can_lan_2→G, kl_hang_kg→H, noi_xuat→I, cong_ty_vc→K
- Số phiếu đọc được: **2035**; dòng có lỗi validate: **0**
- Import lần 1: {"NEW":2035}
- Import lại CÙNG file lần 2: {"EXACT_DUPLICATE":2035} → không sinh dữ liệu trùng

## 3. Engine tính chi phí từng phiếu

- Trạng thái tính giá: {"OK":2035}
- Đơn vị VC app xác định (theo danh mục xe) khác cột "Tên cty VC" của Excel: **0** phiếu

## 4. So sánh theo sheet tổng hợp (theo xe + nơi xuất + nhóm đơn vị)

### CP VC tại ĐH (HHH)

Số xe Excel: 77 — Số xe App: 77

| Chỉ tiêu | Excel | App | Chênh | Kết quả |
|---|---:|---:|---:|---|
| Số chuyến | 1.654,00 | 1.654,00 | 0,00 | ✅ Khớp |
| Tổng KG | 31.835.890,00 | 31.835.890,00 | 0,00 | ✅ Khớp |
| Tổng tấn | 31.835,89 | 31.835,89 | -0,00 | ✅ Khớp |
| Thành tiền (trước VAT) | 3.715.248.363,00 | 3.715.248.363,00 | 0,00 | ✅ Khớp |
| VAT | 297.219.869,04 | 297.219.869,04 | -0,00 | ✅ Khớp |
| Tổng tiền | 4.012.468.232,04 | 4.012.468.232,04 | -0,00 | ✅ Khớp |

So từng xe (số chuyến, KG, đơn giá, tổng tiền): **77/77 xe khớp**; xe chỉ có ở App: 0

### Xe chạy QS (HHH)

Số xe Excel: 14 — Số xe App: 14

| Chỉ tiêu | Excel | App | Chênh | Kết quả |
|---|---:|---:|---:|---|
| Số chuyến | 14,00 | 14,00 | 0,00 | ✅ Khớp |
| Tổng KG | 276.440,00 | 276.440,00 | 0,00 | ✅ Khớp |
| Tổng tấn | 276,44 | 276,44 | 0,00 | ✅ Khớp |
| Thành tiền (trước VAT) | 57.084.860,00 | 57.084.860,00 | 0,00 | ✅ Khớp |
| VAT | 4.566.788,80 | 4.566.788,80 | 0,00 | ✅ Khớp |
| Tổng tiền | 61.651.648,80 | 61.651.648,80 | 0,00 | ✅ Khớp |

So từng xe (số chuyến, KG, đơn giá, tổng tiền): **14/14 xe khớp**; xe chỉ có ở App: 0

### Xe chạy QS (HAK)

Số xe Excel: 18 — Số xe App: 18

| Chỉ tiêu | Excel | App | Chênh | Kết quả |
|---|---:|---:|---:|---|
| Số chuyến | 367,00 | 367,00 | 0,00 | ✅ Khớp |
| Tổng KG | 6.451.370,00 | 6.451.370,00 | 0,00 | ✅ Khớp |
| Tổng tấn | 6.451,37 | 6.451,37 | 0,00 | ✅ Khớp |
| Thành tiền (trước VAT) | 1.332.207.905,00 | 1.332.207.905,00 | 0,00 | ✅ Khớp |
| VAT | 106.576.632,40 | 106.576.632,40 | 0,00 | ✅ Khớp |
| Tổng tiền | 1.438.784.537,40 | 1.438.784.537,40 | 0,00 | ✅ Khớp |

So từng xe (số chuyến, KG, đơn giá, tổng tiền): **18/18 xe khớp**; xe chỉ có ở App: 0

## 5. Tổng chi phí theo nhóm đơn vị (File tổng!E2050, E2051) và theo nơi xuất (File tổng!K2044:K2048)

| Chỉ tiêu | Excel | App | Chênh | Kết quả |
|---|---:|---:|---:|---|
| Tổng chi phí HHH gồm VAT (E2050) | 4.074.119.880,84 | 4.074.119.880,84 | -0,00 | ✅ Khớp |
| Tổng chi phí HAK gồm VAT (E2051) | 1.438.784.537,40 | 1.438.784.537,40 | 0,00 | ✅ Khớp |
| Đại Hiệp — số chuyến (C2045) | 1.654,00 | 1.654,00 | 0,00 | ✅ Khớp |
| Đại Hiệp — KL tấn (D2045) | 31.835,89 | 31.835,89 | 0,00 | ✅ Khớp |
| Đại Hiệp — chi phí gồm VAT (K2045) | 4.012.468.232,04 | 4.012.468.232,04 | -0,00 | ✅ Khớp |
| Quế Sơn — số chuyến (C2046) | 381,00 | 381,00 | 0,00 | ✅ Khớp |
| Quế Sơn — KL tấn (D2046) | 6.727,81 | 6.727,81 | 0,00 | ✅ Khớp |
| Quế Sơn — chi phí gồm VAT (K2046) | 1.500.436.186,20 | 1.500.436.186,20 | -0,00 | ✅ Khớp |
| Tổng chi phí gồm VAT (K2048) | 5.512.904.418,24 | 5.512.904.418,24 | -0,00 | ✅ Khớp |
| Tổng KG toàn đợt (H2040) | 38.563.700,00 | 38.563.700,00 | 0,00 | ✅ Khớp |

## 6. Bảng kê theo từng đơn vị vận chuyển (làm tròn theo bảng kê — quy tắc chính thức)

Mỗi đơn vị xuất hóa đơn riêng. Thành tiền mỗi dòng giá = ROUND(tấn × đơn giá, 0); VAT = ROUND(Σ thành tiền × 8%, 0). Xe trả về **vẫn tính cước**.

| Đơn vị | Số xe | Số chuyến | Tổng KG | Dòng giá | Thành tiền | VAT | Tổng thanh toán | So với Excel (không làm tròn) |
|---|---:|---:|---:|---|---:|---:|---:|---:|
| HAK | 5 | 107 | 1.867.340 | QS-TIENSA @206.500: 107 ch | 385.605.710 | 30.848.457 | 416.454.167 | 0,20 |
| HHH | 77 | 1668 | 32.112.330 | DH-TIENSA @116.700: 1654 ch<br>QS-TIENSA @206.500: 14 ch | 3.772.333.223 | 301.786.658 | 4.074.119.881 | 0,16 |
| QC | 8 | 158 | 2.798.920 | QS-TIENSA @206.500: 158 ch | 577.976.980 | 46.238.158 | 624.215.138 | -0,40 |
| ĐH | 5 | 102 | 1.785.110 | QS-TIENSA @206.500: 102 ch | 368.625.215 | 29.490.017 | 398.115.232 | -0,20 |

- Tổng 4 bảng kê: **5.512.904.418** đ — Excel (K2048, không làm tròn): 5.512.904.418,24 đ — chênh -0,24 đ (chỉ do làm tròn).
- HAK + QC + ĐH = 1.438.784.537 đ ↔ Excel "Tổng chi phí HAK" E2051 = 1.438.784.537,40 đ.
- Xe trả về (Quế Sơn, 10 phiếu, 163.790 kg) đã nằm trong bảng kê — khớp Excel F2046 = 163.790 kg.

## 7. Cảnh báo dữ liệu (engine phát hiện — chỉ cảnh báo, không kết luận)

- Tổng số phiếu có cờ thời gian/cân: 16 — {"LONG_WEIGH_DURATION":13,"REVERSE_WEIGHING":3,"SHORT_GAP":3}
  - Phiếu 1688 xe 92H-00903 (Quế Sơn) 2026-10-01T11:16:25 → 2026-10-01T15:20:21; cân1 32690 / cân2 13920; cách chuyến trước 277.8 phút; cờ: LONG_WEIGH_DURATION, REVERSE_WEIGHING
  - Phiếu 1700 xe 92H-00903 (Quế Sơn) 2026-10-01T15:20:31 → 2026-10-01T15:34:20; cân1 13920 / cân2 30820; cách chuyến trước 0.2 phút; cờ: SHORT_GAP
  - Phiếu 1828 xe 92H-00994 (Quế Sơn) 2026-10-03T09:45:15 → 2026-10-03T14:48:18; cân1 30600 / cân2 13840; cách chuyến trước 273.0 phút; cờ: LONG_WEIGH_DURATION, REVERSE_WEIGHING
  - Phiếu 1849 xe 92H-00994 (Quế Sơn) 2026-10-03T14:48:43 → 2026-10-03T14:56:39; cân1 13840 / cân2 31480; cách chuyến trước 0.4 phút; cờ: SHORT_GAP
  - Phiếu 6065 xe 92H-00728 (Đại Hiệp) 2026-10-01T16:36:28 → 2026-10-02T01:27:21; cân1 30450 / cân2 13440; cách chuyến trước 249.4 phút; cờ: LONG_WEIGH_DURATION, REVERSE_WEIGHING
  - Phiếu 6187 xe 92H-00728 (Đại Hiệp) 2026-10-02T01:27:30 → 2026-10-02T02:08:19; cân1 13440 / cân2 34780; cách chuyến trước 0.1 phút; cờ: SHORT_GAP

## KẾT LUẬN: ✅ App khớp Excel ở mọi chỉ tiêu đã so sánh
