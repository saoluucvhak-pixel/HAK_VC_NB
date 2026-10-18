# PRICE ENGINE SPEC — Bảng giá, Giá dầu, Transport Cost Engine

## 1. Thành phần
| Module | File | Trạng thái |
|---|---|---|
| FuelAdjustmentService | `src/services/FuelAdjustmentService.js` | ✅ khớp Excel 3/3 nhà máy |
| PriceResolver | `src/services/PriceResolver.js` | ✅ |
| VehicleResolver | `src/services/VehicleResolver.js` | ✅ |
| TransportCostEngine | `src/services/TransportCostEngine.js` | ✅ khớp Excel 100% |
| PriceService / FuelPriceService (DB + màn hình) | — | ⏳ Phase 6 |

## 2. Fuel Adjustment — input/output

Input (tất cả là tham số, không hard-code):

| Tham số | Excel | Ví dụ ĐH |
|---|---|---|
| basePrice — cước cơ sở (đ/tấn) | I.1 | 96.000 |
| baseFuelPrice — giá dầu cơ sở (đ/lít) | I.2 | 17.240 |
| fuelPrices[] hoặc currentFuelPrice | B2:B7 / I.6 | 6 × 31.640 |
| distanceKm | I.3 | 78 |
| fuelNormPer100km | "35 lít/100km" | 35 |
| avgTonPerTrip | I.4 | 19 |
| rounding.adjustmentPerTon | ROUND(.,0) | {digits:0} |
| rounding.adjustmentFinal | ROUND(.,−2) | {digits:−2} |

Output: toàn bộ các bước (fuelLitPerTrip 27,3 · fuelDiff 14.400 · costDiffPerTrip 393.120 · adjustmentPerTon 20.691 · adjustmentFinal 20.700 · appliedPrice 116.700) → lưu JSON vào `bang_gia_van_chuyen.cong_thuc`.

## 3. Quy trình điều chỉnh giá theo dầu (màn hình "Giá dầu")
1. Nhập/ import giá dầu từng ngày (loại dầu, nguồn).
2. Tạo **kỳ điều chỉnh**: chọn khoảng ngày tham chiếu → hệ thống tính bình quân; nhập ngày áp dụng, số công văn.
3. Xem trước: bảng mọi tuyến `DIEU_CHINH_DAU` với giá cũ → giá mới, từng bước tính (giống bảng Excel I.1…III.1, in được).
4. Duyệt → tạo bảng giá mới (`ky_dieu_chinh_id`, `bang_gia_goc_id`), đề xuất đóng `den_ngay` bảng cũ = ngày áp dụng − 1. Audit log.
5. Tính lại phiếu **chưa chốt** có ngày cân ≥ ngày áp dụng → cảnh báo `PRICE_CHANGED` (thông tin).

## 4. Tra giá (PriceResolver)
Xem BR-PRICE-01…07. Kết quả: `{status: OK|NO_PRICE|MULTIPLE_PRICE, rule, candidates}`.

## 5. TransportCostEngine
```
computeTicket(ticket, ctx) → {
  kl_hang_tan, don_vi_van_chuyen_id, tuyen_id, price_rule_id, don_gia, don_vi_tinh, vat_percent,
  tien_truoc_vat, tien_vat, tong_tien, status, warnings[]
}
aggregate(results, keyFn, settings) → [{key, so_chuyen, so_chuyen_chua_tinh_gia, tong_kg, tong_tan,
  don_gia[], tien_truoc_vat, tien_vat, tong_tien}]
```
- Status = cảnh báo chặn đầu tiên trong: INVALID_WEIGHT, INVALID_TIME, UNKNOWN_VEHICLE, UNKNOWN_CARRIER, AMBIGUOUS_VEHICLE, UNKNOWN_LOCATION, NO_PRICE, MULTIPLE_PRICE, NO_VAT_RATE; không có → OK; phiếu chốt → LOCKED.
- `aggregate` tách dòng con theo (bảng giá, đơn giá, VAT%, đơn vị tính) → 1 xe chạy qua 2 mức giá vẫn đúng; cột "Đơn giá" hiển thị nhóm đơn giá.
- Cấp làm tròn GROUP/TICKET: BR-ROUND-01.

## 6. Tính lại hàng loạt (Phase 7)
`TransportCostService.recalculate(filter)`: chạy trong 1 transaction, chỉ phiếu `chot_ky_id IS NULL`, ghi audit tóm tắt (số phiếu, tổng trước/sau), cập nhật/đóng cảnh báo tương ứng. Hiệu năng mục tiêu: 200.000 phiếu < 10 giây (prepared statement, batch 5.000).
