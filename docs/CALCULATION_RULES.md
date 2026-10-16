# CALCULATION_RULES.md — Quy tắc tính toán

> Mỗi công thức ghi rõ: **nguồn** (query + tên bước Power Query hoặc ô Excel), **công thức**, **kiểu dữ liệu / làm tròn**, **xử lý khi thiếu dữ liệu**, và **tên hàm** sẽ viết trong Calculation Engine.
> Mọi số liệu ví dụ lấy từ file thật, tuyến VC.007, kỳ 18/09/2026 – 23/09/2026.

> **Cập nhật 24/09/2026 (v4):** đã áp dụng 5 câu trả lời — định mức 0,4 lít/km; tính hết dầu trong bảng kê; đơn giá dầu trung bình cộng; làm tròn tiền đến đồng; giá dầu chưa VAT; **mỗi hợp đồng vận chuyển 2 bên tính độc lập, bên vận chuyển tự lập**. Các mục đã chốt đánh dấu ✅.
> **v5 (24/09/2026):** bổ sung 2 file hợp đồng `Dongiavanchuyen_24.09_DH.xlsx` (ĐH – HAKQN) và `Dongiavanchuyen_24.09_ĐN.xlsx` (HAK – HAKQN); **sửa** cách lấy dầu: dầu lấy theo **bảng kê giao nhận dầu của chính hợp đồng**, không lọc bảng kê của hợp đồng khác theo xe.

---

## 0. Ba tầng tính toán

```
Tầng A – Đơn giá hợp đồng (QR_DATA)      : chỉ phụ thuộc DANH MỤC giá, không phụ thuộc kỳ
Tầng B – Tổng hợp kỳ (QR_DGVC (2))       : phiếu cân + dầu của kỳ + ĐG_HĐ tầng A
Tầng C – Bảng xác nhận (BKVC)            : phiếu cân theo xe × Đơn giá VC tầng B
```

---

## 1. Quy tắc kiểu dữ liệu và làm tròn (áp dụng xuyên suốt)

### 1.1. Chế độ làm tròn của Power Query ≠ Excel

- `Number.Round(x, n)` trong Power Query **mặc định dùng `RoundingMode.ToEven`** (làm tròn ngân hàng: số đúng giữa làm tròn về số chẵn). Ví dụ `Number.Round(115500, -3) = 116000` nhưng `Number.Round(116500, -3) = 116000`.
- Hàm `ROUND` của Excel làm tròn **xa số 0** (half-up): `ROUND(116500,-3) = 117000`.
- Để **khớp Excel hiện tại (tức Power Query)**, APP mặc định dùng `HALF_EVEN`; để cấu hình được (`ROUND_MODE`). **[CẦN XÁC NHẬN]** anh/chị muốn giữ ToEven (khớp file) hay chuyển half-up (theo thói quen kế toán). Với dữ liệu hiện có, 2 chế độ **cho cùng kết quả** ở mọi tuyến (xem §2.8) — khác biệt chỉ xảy ra khi giá trị rơi đúng điểm giữa.

### 1.2. Ép kiểu Int64 khi đọc dữ liệu

`Table.TransformColumnTypes(..., Int64.Type)` **làm tròn giá trị** (ToEven) trước khi tính. Các cột bị ảnh hưởng:

| Bảng | Cột bị ép Int64 | Ảnh hưởng thực tế |
|---|---|---|
| TBL_DATA | Cự ly, Cự ly/chuyến, Đơn Giá (chưa VAT), **Giá/km**, **Đơn giá mới**, ĐG dầu chưa VAT, KL_TB | `Đơn giá mới` VC.009: 91.666,66667 → **91.667**; VC.004: 194.791,6667 → **194.792**. `Giá/km` bị cắt số lẻ (không dùng trong tính). |
| TBL_GIAONHANDAU | Đơn giá dầu | Làm tròn **từng dòng** trước khi lấy trung bình |

`ĐM dầu_100km`, `Thể tích TB`, `Số lượng (lít)`, `KL hàng (KG)` giữ dạng số thực.

Ngược lại, tham số kiểu trong `Table.AddColumn(..., Int64.Type)` (bước `Tiền dầu`, `ĐGVC_NODIEZEL`, `ĐG_HĐ`) **chỉ là khai báo, không làm tròn giá trị**. Vì vậy `ĐGVC_NODIEZEL` vẫn là số thực (vd 64.111,44) trước khi `Number.Round(…,-3)`.

→ APP: hàm `toInt64PQ(x)` = làm tròn ToEven về số nguyên, **chỉ** áp dụng cho đúng các cột trên khi đọc danh mục/giao nhận dầu. **[CẦN XÁC NHẬN]** có giữ hành vi này không (đề xuất: giữ để khớp; cho phép tắt bằng cấu hình).

### 1.3. Số thực

Các phép chia (`ĐG CL Diesel`) để nguyên số thực đến bước làm tròn cuối. APP dùng số thực double (giống Power Query) — **không** làm tròn trung gian. Hiển thị: 2 chữ số lẻ cho tấn/lít, 0 cho tiền.

### 1.4. Ngày tháng

- `Ngày cập nhật` trong TBL_DATA lưu text `"10/07/2025"` và được PQ ép kiểu `date` theo **locale máy** (vi-VN → 10/07/2025 = 10 tháng 7). APP lưu dạng ISO `2025-07-10`. **[CẦN XÁC NHẬN]** là 10/07 hay 07/10.
- `Giờ cân` là text `hh:mm:ss` → ép `time`.

---

## 2. Tầng A — Đơn giá hợp đồng (query `QR_DATA (2)`)

Tính trên **từng dòng danh mục tuyến** (1 phiên bản giá).

### 2.1. ĐG 1 Chuyến — `calculateTripPrice()`
- Nguồn: bước `#"Added Custom"`
- `IF [Đơn vị tính] = "M3" THEN [Đơn giá mới] × [Thể tích TB] ELSE [Đơn giá mới] × [KL_TB]`
- So sánh `"M3"` **phân biệt hoa thường, so sánh chính xác** (PQ). "m3" hay "M³" sẽ rơi vào nhánh ELSE. APP: chuẩn hóa ĐVT thành enum khi nhập danh mục để tránh lỗi này.
- VC.007: 165.000 × 18 = **2.970.000**

### 2.2. Tiêu hao NL chuyến — `calculateFuelConsumption()`
- Nguồn: `#"Added Custom1"`
- `[Cự ly chuyến] × [ĐM dầu_100km]`
- VC.007: 144 × 0,4 = **57,6 lít/chuyến**
- ✅ **ĐÃ XÁC NHẬN (24/09/2026)**: định mức **0,4 lít/km = 40 lít/100km**. Công thức Excel đúng (không chia 100). APP lưu trường `fuel_norm_l_per_km = 0,4`, nhãn hiển thị "Định mức dầu (lít/km)" kèm quy đổi "(40 lít/100km)". Tên cột "ĐM dầu_100km" trong Excel là tên gọi sai đơn vị; mapping import vẫn nhận tên này.

### 2.3. Tiền dầu — `calculateFuelCost()`
- Nguồn: `#"Added Custom2"`
- `[ĐG dầu chưa VAT] × [Tiêu hao NL chuyến]`
- VC.007: 15.500 × 57,6 = **892.800**
- Dùng **giá dầu trong danh mục (15.500)**, không phải giá dầu thực tế của kỳ.

### 2.4. Tỷ lệ tiêu hao dầu — `calculateFuelCostRatio()`
- Nguồn: `#"Added Custom3"`
- `[Tiền dầu] / [ĐG 1 Chuyến]`
- VC.007: 892.800 / 2.970.000 = **0,30061** (30,06 %)
- Chỉ để tham khảo; **không** được dùng ở bước sau và không xuất ra QR_DGVC.

### 2.5. ĐGVC chưa Diesel — `calculatePriceNoDiesel()`
- Nguồn: `#"Added Custom4"`
- `([ĐG 1 Chuyến] − [Tiền dầu]) / [KL_TB]`
- VC.007: (2.970.000 − 892.800) / 18 = **115.400** đ/tấn
- ⚠️ Chia cho `KL_TB` **kể cả khi ĐVT = M3** (VC.015: (1.445.500 − 520.800)/18 = 51.372,22). **[CẦN XÁC NHẬN]** tuyến M3 có nên chia cho `Thể tích TB` (ra đ/m3) không.

### 2.6. ĐG_HĐ — `calculateContractPrice()`
- Nguồn: `#"Added Custom5"`
- `Number.Round([ĐGVC_NODIEZEL], -3)` — làm tròn **hàng nghìn**, chế độ **ToEven**
- VC.007: ROUND(115.400, −3) = **115.000**

### 2.7. Xử lý lỗi (Excel hiện tại)
- `KL_TB = 0` hoặc `ĐG 1 Chuyến = 0` → PQ trả `Infinity`/`NaN`, không báo lỗi. APP: chặn bằng validation (lỗi #7, #9, #10 trong danh sách kiểm soát).

### 2.8. Kết quả Tầng A cho toàn bộ danh mục (đã mô phỏng ép Int64 + ToEven)

| Mã | Tuyến | Cự ly chuyến | ĐVT | Đơn giá mới (gốc → Int64) | ĐG 1 chuyến | Tiêu hao NL (l) | Tiền dầu | ĐGVC_NODIEZEL | **ĐG_HĐ** |
|---|---|---|---|---|---|---|---|---|---|
| VC.002 | Xã Bà Nà - Tiên Sa | 54 | Tấn | 71000 → 71000 | 1.278.000 | 21,6 | 334.800 | 52.400,00 | **52.000** |
| VC.003 | Xã Đại Lộc - Tiên Sa | 76 | Tấn | 96000 → 96000 | 1.728.000 | 30,4 | 471.200 | 69.822,22 | **70.000** |
| VC.008 | Xã Quế Sơn Trung - Tiên Sa | 108 | Tấn | 123750 → 123750 | 2.227.500 | 43,2 | 669.600 | 86.550,00 | **87.000** |
| VC.007 | Xã Quế Sơn - Tiên Sa | 144 | Tấn | 165000 → 165000 | 2.970.000 | 57,6 | 892.800 | 115.400,00 | **115.000** |
| VC.009 | Xã Quế Sơn Trung - Hòa Nhơn | 80 | Tấn | 91666.66667 → 91667 | 1.650.006 | 32 | 496.000 | 64.111,44 | **64.000** |
| VC.010 | Xã Quế Sơn - Hòa Nhơn | 114 | Tấn | 130625 → 130625 | 2.351.250 | 45,6 | 706.800 | 91.358,33 | **91.000** |
| VC.004 | Xã Quế Sơn Trung - Dung Quất | 170 | Tấn | 194791.6667 → 194792 | 3.506.256 | 68 | 1.054.000 | 136.236,44 | **136.000** |
| VC.005 | Xã Quế Sơn - Dung Quất | 204 | Tấn | 233750 → 233750 | 4.207.500 | 81,6 | 1.264.800 | 163.483,33 | **163.000** |
| VC.012 | Dung Quất lên tàu | 2 | Tấn | 8900 → 8900 | 160.200 | 0,8 | 12.400 | 8.211,11 | **8.000** |
| VC.014 | Nam Vạn Lý - Tiên Sa | 48 | Tấn | 55000 → 55000 | 990.000 | 19,2 | 297.600 | 38.466,67 | **38.000** |
| VC.013 | Nhất Hưng - Tiên Sa | 84 | Tấn | 75000 → 75000 | 1.350.000 | 33,6 | 520.800 | 46.066,67 | **46.000** |
| VC.015 | Nhất Hưng - Tiên Sa | 84 | M3 | 25000 → 25000 | 1.445.500 | 33,6 | 520.800 | 51.372,22 | **51.000** |

(ToEven và half-up cho cùng ĐG_HĐ ở cả 12 tuyến.) Bảng này sẽ dùng làm **unit test** cho Tầng A.

---

## 3. Tầng B — Tổng hợp dầu (query `TBL_GIAONHANDAU (2)`)

### 3.1. Gom nhóm — `aggregateFuel()`
- Nguồn: bước `#"Grouped Rows"`
- Nhóm theo **`Mã cự ly VC`, `Đơn vị`, `ĐVT`** (3 khóa)

| Trường kết quả | Công thức PQ | Tên hàm | VC.007 |
|---|---|---|---|
| Tổng số lượng → "Dầu Diezel thực nhận" | `List.Sum([Số lượng (lít)])` | `calculateActualFuel()` | **5.853 lít** |
| Ngày bắt đầu nhận dầu | `List.Min([Ngày nhận dầu])` | | 20/09/2026 |
| Ngày kết thúc nhận dầu | `List.Max([Ngày nhận dầu])` | | 23/09/2026 |
| Đơn giá dầu | `List.Average([Đơn giá dầu])` — **trung bình cộng đơn giản** (không gia quyền theo lít) | `calculateFuelPrice()` | **29.940** |
| Ngày nhập dầu | `List.Max([Ngày mua dầu])` | | 22/09/2026 |

- ✅ **ĐÃ XÁC NHẬN**: **tính hết dầu trong bảng kê** giao nhận của kỳ, không lọc theo ngày nhận dầu và không đối chiếu theo xe (giống Excel). Trong APP, "bảng kê" = tập dòng dầu người dùng đưa vào kỳ (import/chọn); hệ thống **chỉ cảnh báo** (không chặn) nếu ngày nhận dầu nằm ngoài Từ–Đến ngày của phiếu cân, để người dùng nhìn thấy. **Chốt lại 25/09/2026: tính tất cả dầu vào kỳ**, kể cả dầu nhận trước ngày bắt đầu kỳ (bảng kê ĐH: 2 dòng 16/09).
- ✅ **ĐÃ XÁC NHẬN**: Đơn giá dầu = **trung bình cộng** (`List.Average`) như Excel, không gia quyền theo lít.
- ✅ **CHỐT 05/10/2026 — bù trừ nhiên liệu (dòng dầu âm)**: dòng bảng kê dầu được ghi **số lít âm** (bù trừ). Dầu thực nhận = Σ số lít (dòng âm trừ đi). Đơn giá dầu = trung bình cộng đơn giá **chỉ các dòng dương** — dòng âm không kéo giá, được để trống đơn giá. **Khác Excel** khi có dòng âm (Excel `List.Average` tính cả dòng âm là 1 dòng giá). Kỳ chỉ có dòng âm → TB đơn giá các dòng âm có ghi giá; không dòng nào có giá → lỗi `E_FUEL_OFFSET_NO_PRICE`. Tổng dầu tuyến ≤ 0 → vẫn tính, cảnh báo `W_FUEL_TOTAL_NONPOSITIVE`. Biên bản giao nhận dầu: dòng âm không giá lấy đơn giá BQ các dòng dương để ra thành tiền (âm), ghi chú "Bù trừ (giá BQ)".
- ✅ **CHỐT 07/10/2026 — phương thức ĐƠN GIÁ CỐ ĐỊNH** (bản 1.2.3): phiên bản giá chọn `CO_DINH` → Đơn giá VC = đơn giá cố định đ/tấn ghi trong bảng giá (không làm tròn lại, không có Tầng A, không có chênh lệch dầu). Chọn theo từng tuyến + phiên bản giá. Tuyến cố định **không nhận dầu**: kỳ có dòng dầu của tuyến → lỗi `E_FIXED_PRICE_HAS_FUEL`. Phương thức cũ (theo giá dầu) giữ nguyên, kết quả không đổi (VC.007 ĐH 18–23/09 vẫn 96.900).
- ✅ **ĐÃ XÁC NHẬN**: đơn giá dầu trong bảng kê (29.940) là **giá chưa VAT** — cùng cơ sở với "ĐG dầu chưa VAT" 15.500 của danh mục. Nhãn cột khi nhập/import: "Đơn giá dầu (chưa VAT)".

---

## 4. Tầng B — Tổng hợp phiếu cân (query `QR_DGVC (2)`)

### 4.1. Gom nhóm — `aggregateTrips()`
- Nguồn: `#"Grouped Rows"` — nhóm theo **`Mã cự ly VC` duy nhất** (không theo Đơn vị VC, không theo xe)

| Trường | Công thức PQ | Tên hàm | VC.007 |
|---|---|---|---|
| Ngày bắt đầu | `List.Min([Ngày cân 1])` | | 18/09/2026 |
| Ngày kết thúc | `List.Max([Ngày cân 2])` | | 23/09/2026 |
| Số chuyến | `Table.RowCount(_)` = **số dòng phiếu cân** | `countTrips()` | **326** |
| Tổng KL (KG) | `List.Sum([KL hàng (KG)])` | | **6.143.680** |
| Tổng KL (Tấn) | `[Tổng KL (KG)] / 1000` (bước `#"Added Custom"`) | `calculateTotalTon()` | **6.143,68** |

- ⚠️ **Không lọc theo ngày.** Kỳ tính = toàn bộ phiếu có trong TBL_VC. APP sẽ lọc theo *Từ ngày → Đến ngày* — **[CẦN XÁC NHẬN] lọc theo `Ngày cân 1` hay `Ngày cân 2`** (6 phiếu qua đêm; nếu phiếu cân 1 lúc 23:58 ngày cuối kỳ thì thuộc kỳ nào?). Đề xuất: theo `Ngày cân 1`.

### 4.2. Ghép dầu — `joinFuel()`
- Nguồn: `#"Merged Queries"` — `LEFT OUTER JOIN` kết quả 4.1 với 3.1 theo `Mã cự ly VC`
- Lấy: Đơn vị, ĐVT, Tổng số lượng, Ngày bắt đầu/kết thúc nhận dầu, Đơn giá dầu, Ngày nhập dầu
- ⚠️ **Rủi ro nhân dòng**: nếu 1 tuyến có dầu của **2 Đơn vị** hoặc **2 ĐVT** (3.1 ra 2 dòng), join sẽ tạo **2 dòng cùng mã tuyến**, mỗi dòng mang nguyên Số chuyến & Tổng KL → báo cáo trùng. APP: phát hiện và báo lỗi thay vì nhân dòng. **[CẦN XÁC NHẬN]** cách xử lý đúng khi có nhiều đơn vị cấp dầu cho 1 tuyến (cộng gộp?).
- ⚠️ **Không có dầu**: các cột dầu = `null` → `CL Tiêu hao` = null → `ĐG CL Diesel` = null → bước `if null < 0` gây **lỗi ô (Error)** trong PQ. APP: đưa vào danh sách lỗi "Không có dầu thực nhận", **không tính tiếp** (hoặc tính với dầu = 0 nếu anh/chị xác nhận — **[CẦN XÁC NHẬN]**).

### 4.3. Ghép đơn giá — `joinContractPrice()`
- Nguồn: `#"Merged Queries1"` — `LEFT OUTER JOIN` với QR_DATA theo `Mã cự ly VC = Mã quãng đường`
- Lấy: Tuyến, Cự ly chuyến, ĐM dầu_100km, Tiêu hao NL chuyến (lấy nhưng **không dùng/không xuất**), ĐG_HĐ
- Không có ngày hiệu lực: lấy phiên bản duy nhất. APP có PRICE_HISTORY → **[CẦN XÁC NHẬN] chọn phiên bản giá theo ngày nào**: đề xuất phiên bản có hiệu lực tại *Đến ngày* của kỳ; nếu kỳ cắt ngang 2 phiên bản → cảnh báo, bắt người dùng tách kỳ.
- Không tìm thấy mã → danh sách lỗi "Mã tuyến không tồn tại".

### 4.4. Dầu định mức — `calculateStandardFuel()`
- Nguồn: `#"Added Custom1"`, tên hiển thị "Nhiên liệu dầu Diezel tiêu hao theo định mức (lít)"
- `[Cự ly chuyến] × [Số chuyến] × [ĐM dầu_100km]`
- VC.007: 144 × 326 × 0,4 = **18.777,6 lít**

### 4.5. Chênh lệch tiêu hao Diesel — `calculateFuelDifference()`
- Nguồn: `#"Added Custom2"` (tên cột có khoảng trắng cuối `"CL Tiêu hao Diezel "`)
- `[Tổng Dầu Diezel ĐM] − [Dầu Diezel thực nhận]`
- VC.007: 18.777,6 − 5.853 = **12.924,6 lít**
- Dương = xe nhận ít dầu hơn định mức (phần thiếu được bù vào đơn giá); âm = nhận thừa (bị trừ). **[CẦN XÁC NHẬN]** cách hiểu này.

### 4.6. Đơn giá chênh lệch Diesel — `calculateFuelAdjustment()`
- Nguồn: `#"Added Custom3"`
- `[CL Tiêu hao Diezel] × [Đơn giá dầu] / [Tổng KL (Tấn)]`
- VC.007: 12.924,6 × 29.940 / 6.143,68 = 386.962.524 / 6.143,68 = **62.985,46213344446 đ/tấn** (không làm tròn)
- Chia cho **Tấn** kể cả tuyến ĐVT = M3. **[CẦN XÁC NHẬN]** với tuyến M3.
- `Tổng KL (Tấn) = 0` → chia 0. APP: chặn (lỗi #7).

### 4.7. Đơn giá vận chuyển — `calculateTransportPrice()`
- Nguồn: `#"Added Custom4"`
- `QR_DGVC (2)`: `IF ([ĐG_HĐ] + [ĐG CL Diezel]) < 0 THEN 0 ELSE Number.Round([ĐG_HĐ] + [ĐG CL Diezel], -2)`
- `QR_DGVC` (bản cũ, không load): như trên nhưng **không làm tròn**.
- VC.007: 115.000 + 62.985,46 = 177.985,46 → ROUND(−2, ToEven) = **178.000** ✅ khớp Excel
- Tham số cấu hình: `ROUND_FINAL` (mặc định −2), `ROUND_MODE`, và `FLOOR_AT_ZERO` (mặc định bật).
- Lưu ý: điều kiện `< 0` được xét trên giá trị **trước** làm tròn.

### 4.8. Cột đầu ra QR_DGVC4 (đúng thứ tự Excel)

| # | Tên hiển thị | Trường gốc |
|---|---|---|
| 1 | STT | Index (1,2,3…) theo thứ tự nhóm (thứ tự xuất hiện đầu tiên của mã tuyến trong TBL_VC) |
| 2 | Mã tuyến | Mã cự ly VC |
| 3 | Tuyến | Tuyến |
| 4 | Cự ly tuyến | **Cự ly chuyến** |
| 5 | Ngày bắt đầu | |
| 6 | Ngày kết thúc | |
| 7 | Đơn giá theo hợp đồng (chưa bao gồm nhiên liệu) | ĐG_HĐ |
| 8 | Số chuyến | |
| 9 | Tổng KL (Tấn) | |
| 10 | Dầu Diezel thực nhận | Tổng số lượng |
| 11 | Định mức dầu Diezel | ĐM dầu_100km |
| 12 | Nhiên liệu dầu Diezel tiêu hao theo định mức (lít) | Tổng Dầu Diezel ĐM |
| 13 | CL Tiêu hao Diezel | |
| 14 | Đơn giá dầu | |
| 15 | Ngày nhập dầu | |
| 16 | Đơn giá CL Diezel | |
| 17 | Đơn giá vận chuyển | |

Không xuất: Tổng KL (KG), Đơn vị, ĐVT, Ngày bắt đầu/kết thúc nhận dầu, Tiêu hao NL chuyến. APP vẫn **lưu** các trường này để truy vết.

---

## 5. Tầng C — Bảng xác nhận khối lượng (sheet `BKVC`)

### 5.1. Nguồn dòng
PivotTable1 trên TBL_VC: hàng = `Biển số 1`; giá trị = `COUNT(Biển số 1)` → "SỐ CHUYẾN", `SUM(KL hàng (KG))`. Kết quả được **dán tay** vào BKVC; đơn giá **gõ tay** từ QR_DGVC (2).
→ APP: `buildVolumeConfirmation(periodId)` nhóm `TRANSPORT_DETAIL` theo biển số, lấy đơn giá từ `TRANSPORT_CALCULATION` của tuyến tương ứng.

### 5.2. Công thức từng dòng — `calculateConfirmationLine()`

| Cột | Công thức ô Excel | VC.007, xe 43H-01021 |
|---|---|---|
| Khối lượng (Tấn) | `=D/1000` | 360.010 / 1000 = 360,01 |
| Thành tiền | `=E*F` | 360,01 × 178.000 = 64.081.780 |
| VAT (8%) | `=G*0.08` (hằng số trong công thức) | 5.126.542,4 |
| Thành tiền (sau VAT) | `=G+H` | 69.208.322,4 |

### 5.3. Dòng tổng
`SUM` từng cột: 326 chuyến · 6.143.680 kg · 6.143,68 tấn · Thành tiền **1.093.575.040** · VAT **87.486.003,2** · Tổng **1.181.061.043,2**.
Ô kiểm tra ngoài vùng in: `K24 = G24+H24`, `K25 = G24*8%` (VAT tính trên tổng = 87.486.003,2 — trùng với tổng VAT từng dòng vì không làm tròn).

### 5.4. Làm tròn tiền — ✅ **ĐÃ XÁC NHẬN: làm tròn đến đồng**
- BKVC trong file hiện **không làm tròn** (VAT có số lẻ ,2/,4/,6 đồng) → APP **khác file có chủ đích** ở điểm này.
- Quy tắc APP (tham số `ROUND_MONEY = 0`, kiểu làm tròn tiền = half-up như hàm `ROUND` của Excel):
  1. `Thành tiền = ROUND(Tấn × Đơn giá, 0)` từng dòng
  2. `VAT = ROUND(Thành tiền × VAT%, 0)` từng dòng
  3. `Thành tiền sau VAT = Thành tiền + VAT` từng dòng
  4. Dòng tổng = `SUM` các dòng đã làm tròn (không làm tròn lại trên tổng)
- Kết quả kỳ VC.007: Thành tiền **1.093.575.040** · VAT **87.486.003** (16/17 dòng VAT có làm tròn) · Tổng **1.181.061.043**. Chênh so với file: VAT −0,2 đ, tổng −0,2 đ. (Tính VAT trên tổng cũng ra 87.486.003 → hai cách trùng nhau ở kỳ này.)
- Chế độ làm tròn tiền (half-up) tách riêng với chế độ làm tròn đơn giá của Power Query (ToEven, câu Q10).

### 5.5. Số tiền bằng chữ
Mẫu cũ dùng `vnd(I10)` (add-in vnTools). APP tự viết `numberToVietnameseWords()` — tính từ tổng đã làm tròn, không gõ tay (tránh lỗi D1).

### 5.6. Phạm vi BKVC ✅
- BKVC trong file là của hợp đồng **HAKQN – QS**: gồm cả 17 xe (xe HAKQN + xe HAK, Đại Hiệp mà HAKQN thuê lại), 1 đơn giá.
- APP: **1 BKVC cho mỗi hợp đồng 2 bên**, cùng mẫu. Bên vận chuyển của hợp đồng tự lập (BUSINESS_LOGIC §4.6).

### 5.7. Tính cho từng hợp đồng — `runContractCalculation(contractId, dateFrom, dateTo, routeCode)` ✅

Mọi hợp đồng chạy **cùng chuỗi hàm Tầng A → B → C** (3 file Excel QS / ĐH / ĐN có Power Query **giống hệt nhau** và **cùng danh mục giá nhúng**). Chỉ khác dữ liệu đầu vào:

| Đầu vào | Lấy theo |
|---|---|
| Phiếu cân | xe trong phạm vi hợp đồng, đúng tuyến, trong Từ–Đến ngày |
| Dầu thực nhận, đơn giá dầu (TB cộng, chưa VAT) | **bảng kê giao nhận dầu của chính hợp đồng đó** (bên thuê giao cho bên vận chuyển) — tính hết |
| Phiên bản giá (ĐG_HĐ, ĐM, KL_TB) | theo tuyến (chung), hoặc phiên bản gắn riêng cho hợp đồng |

> ⚠️ **Sửa so với v4:** v4 lấy dầu cho ĐH/HAK bằng cách lọc bảng kê của HAKQN – QS theo xe (ra 184.900 / 176.000). File thật cho thấy mỗi hợp đồng có **bảng kê dầu riêng** — gồm cả phần dầu HAKQN nhận từ CN HAK chuyển tiếp (dòng `DH_…`, `DN_…`, 29.940) **và** dầu HAKQN cấp thêm (dòng 28.480 / 29.940). Số v4 bị loại bỏ.

**Kết quả Excel kỳ 18–23/09/2026, tuyến VC.007 — dùng làm 3 test chấp nhận** (APP tái lập khớp 100%):

| Chỉ tiêu | HAKQN – QS | ĐH – HAKQN | HAK – HAKQN (file ĐN) |
|---|---|---|---|
| File | `…QS-TS( XUẤT QS).xlsx` | `…_DH.xlsx` | `…_ĐN.xlsx` |
| Bên vận chuyển → Bên thuê | HAKQN → CN HAK | Đại Hiệp → HAKQN | HAK → HAKQN |
| Số chuyến / xe | 326 / 17 | 77 / 5 | 100 / 5 |
| Tổng KL (tấn) | 6.143,68 | 1.452,13 | 1.870,38 |
| Dòng dầu trong bảng kê | 18 | 16 | 13 |
| Dầu thực nhận (lít) | 5.853 | 5.734,69 | 5.088,35 |
| Đơn giá dầu (TB cộng) | 29.940 | 29.210 | 29.490,769… |
| *(tham khảo: gia quyền theo lít)* | *29.940* | *29.193,28* | *29.476,59* |
| Dầu định mức (lít) | 18.777,6 | 4.435,2 | 5.760,0 |
| Chênh lệch (lít) | +12.924,6 | **−1.299,49** | +671,65 |
| ĐG HĐ | 115.000 | 115.000 | 115.000 |
| ĐG CL Diesel | +62.985,46 | **−26.139,60** | +10.590,08 |
| ĐG VC trước làm tròn | 177.985,46 | 88.860,40 | 125.590,08 |
| **Đơn giá VC** | **178.000** | **88.900** | **125.600** |
| BKVC theo quy tắc APP (đến đồng): trước VAT / VAT / tổng | 1.093.575.040 / 87.486.003 / 1.181.061.043 | 129.094.357 / 10.327.548 / 139.421.905 | 234.919.728 / 18.793.577 / 253.713.305 |

- Hợp đồng ĐH là **ca chênh lệch âm** đầu tiên có số thật: xe nhận **nhiều** dầu hơn định mức → đơn giá bị trừ 26.139,60 đ/tấn. Kết quả vẫn > 0 nên chưa kích hoạt quy tắc "âm thì = 0".
- Hai file ĐH / ĐN **không có sheet BKVC**; số BKVC ở trên là do APP tính theo quy tắc đã chốt, chưa có Excel để đối chiếu.
- Phương pháp giá dầu **đã có tác động thật**: trung bình cộng (đã chốt) cho 29.210 thay vì 29.193,28 gia quyền (ĐH); chênh ≈ 15 đ/tấn ở ĐG CL, không làm đổi kết quả sau làm tròn −2.

## 6. Truy vết đầy đủ VC.007 (dùng làm test chấp nhận)

```text
Mã tuyến: VC.007 – Xã Quế Sơn - Tiên Sa          Kỳ: 18/09/2026 – 23/09/2026
Phiên bản giá: 10/07/2025  (Đơn giá mới 165.000 · KL_TB 18 · ĐG dầu DM 15.500 · ĐM 0,4)

[A] ĐG 1 chuyến      = 165.000 × 18                        = 2.970.000
    Tiêu hao NL/chuyến = 144 × 0,4                          = 57,6 lít
    Tiền dầu/chuyến  = 15.500 × 57,6                        = 892.800
    Tỷ lệ tiêu hao   = 892.800 / 2.970.000                  = 30,06 %
    ĐGVC chưa diesel = (2.970.000 − 892.800) / 18           = 115.400
    ĐG_HĐ            = ROUND(115.400; −3)                   = 115.000 đ/tấn

[B] Số chuyến        = 326 phiếu cân (số 573 → 902)
    Tổng KL          = 6.143.680 kg / 1000                  = 6.143,68 tấn
    Dầu thực nhận    = Σ 18 dòng giao nhận (20–23/09)       = 5.853 lít
    Đơn giá dầu      = TB(29.940 × 18 dòng)                 = 29.940 đ/lít
    Dầu định mức     = 144 × 326 × 0,4                      = 18.777,60 lít
    Chênh lệch       = 18.777,60 − 5.853                    = 12.924,60 lít
    ĐG CL Diesel     = 12.924,60 × 29.940 / 6.143,68        = 62.985,46 đ/tấn
    ĐG VC (thô)      = 115.000 + 62.985,46                  = 177.985,46
    ĐG VC            = ROUND(177.985,46; −2)                = 178.000 đ/tấn

[C] Thành tiền       = Σ ROUND(tấn xe × 178.000; 0)         = 1.093.575.040
    VAT 8%           = Σ ROUND(thành tiền xe × 8%; 0)       = 87.486.003      (file: 87.486.003,2)
    Tổng thanh toán  =                                        1.181.061.043   (file: 1.181.061.043,2)
```

Kết quả tái lập bằng script độc lập: **khớp 100%** với QR_DGVC (2) ở cả 9 chỉ tiêu yêu cầu; BKVC chỉ lệch 0,2 đ do quy tắc làm tròn đến đồng đã xác nhận (Số chuyến, Tổng KL, Dầu thực nhận, Dầu định mức, Chênh lệch, Đơn giá dầu, ĐG HĐ, ĐG CL Diesel, Đơn giá VC).

---

## 7. Danh mục hàm Calculation Engine

| Hàm | Tầng | Input | Output |
|---|---|---|---|
| `toInt64PQ(x)` | chung | số | số nguyên ToEven |
| `roundPQ(x, digits, mode)` | chung | số, −3/−2/0, HALF_EVEN/HALF_UP | số |
| `calculateTripPrice(price)` | A | Đơn giá mới, ĐVT, KL_TB, Thể tích TB | ĐG 1 chuyến |
| `calculateFuelConsumption(price, route)` | A | Cự ly chuyến, ĐM | lít/chuyến |
| `calculateFuelCost(price, fuelPerTrip)` | A | ĐG dầu DM, lít/chuyến | đồng/chuyến |
| `calculateFuelCostRatio(fuelCost, tripPrice)` | A | | tỷ lệ |
| `calculatePriceNoDiesel(tripPrice, fuelCost, klTb)` | A | | đ/tấn |
| `calculateContractPrice(priceNoDiesel, cfg)` | A | | ĐG_HĐ |
| `aggregateFuel(receipts)` | B | dòng dầu | {tổng lít, ngày min/max, giá TB, ngày nhập} theo (mã, đơn vị, ĐVT) |
| `calculateActualFuel(receipts)` | B | | lít |
| `calculateFuelPrice(receipts)` | B | trung bình cộng (đã xác nhận) | đ/lít |
| `aggregateTrips(tickets)` | B | phiếu cân | {số chuyến, KG, tấn, ngày min/max} theo mã tuyến |
| `calculateStandardFuel(tripDistance, tripCount, norm)` | B | | lít |
| `calculateFuelDifference(standard, actual)` | B | | lít |
| `calculateFuelAdjustment(diff, fuelPrice, totalTon)` | B | | đ/tấn |
| `calculateTransportPrice(contractPrice, fuelAdj, cfg)` | B | | đ/tấn |
| `calculateConfirmationLine(kg, unitPrice, vatRate, cfg)` | C | | {tấn, tiền, VAT, tổng} |
| `numberToVietnameseWords(n)` | C | | chuỗi |
| `runContractCalculation(contractId, from, to, route)` | B+C | hợp đồng, kỳ | kết quả + BKVC của hợp đồng (phiếu cân theo phạm vi xe, dầu theo bảng kê của hợp đồng) |
| `buildFormulaTrace(calc)` | B | | JSON các bước như §6 |

Mỗi hàm là **hàm thuần** (không đọc file, không phụ thuộc giao diện) → unit test chạy trực tiếp bằng Node (vitest).
