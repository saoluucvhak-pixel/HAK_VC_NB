# ENGINE_TEST_REPORT.md — Bước 10: Calculation Engine và kết quả kiểm thử

> Ngày 24/09/2026 · mã nguồn: `dgvc_engine_buoc10.zip` (thư mục `app/`) · Node.js ≥ 20, **không dùng thư viện ngoài** (chạy offline).
> Chạy lại: `npm test` (44 test) và `npm run verify:seed` (bảng so sánh APP ↔ Excel).

## 1. Kết quả tóm tắt

| Hạng mục | Kết quả |
|---|---|
| Unit test | **44 / 44 đạt** |
| 9 chỉ tiêu yêu cầu §27 × 3 hợp đồng so với bảng `QR_DGVC (2)` của 3 file Excel | **27 / 27 khớp tuyệt đối** (so sánh `===` cả phần thập phân, vd `62985.46213344446`) |
| Bảng xác nhận khối lượng so với sheet `BKVC` (file QS) | 17 xe: số chuyến, KG, thành tiền **khớp**; VAT và tổng lệch **≤ 0,5 đ / dòng, 0,2 đ tổng** — do quy tắc **làm tròn đến đồng** đã chốt |
| So với bộ tính tham chiếu Python (mọi trường trung gian, 15 bước trace, danh sách phiếu / dầu, BKVC) | **khớp tuyệt đối** cả 3 hợp đồng |
| Làm tròn so với Python `Decimal` | **5.160 / 5.160** trường hợp (6 mức × 2 chế độ × 430 giá trị, gồm các điểm giữa) |
| Kiểm tra độ nhạy của test (cố ý làm sai Engine) | **7 / 7 lỗi cài vào đều bị test phát hiện** |
| Gói mã nguồn chạy độc lập (giải nén ra thư mục trống) | 44 / 44 đạt, "TẤT CẢ KHỚP EXCEL" |

## 2. So sánh APP ↔ Excel (kỳ 18–23/09/2026, VC.007)

| Chỉ tiêu | HAKQN-QS (APP = Excel) | ĐH-HAKQN (APP = Excel) | HAK-HAKQN (APP = Excel) |
|---|---|---|---|
| Số chuyến | 326 | 77 | 100 |
| Tổng KL (tấn) | 6.143,68 | 1.452,13 | 1.870,38 |
| Dầu thực nhận (lít) | 5.853 | 5.734,69 | 5.088,35 |
| Dầu định mức (lít) | 18.777,6 | 4.435,2 | 5.760 |
| Chênh lệch dầu (lít) | 12.924,6 | −1.299,49 | 671,65 |
| Đơn giá dầu | 29.940 | 29.210 | 29.490,769… |
| ĐG HĐ | 115.000 | 115.000 | 115.000 |
| ĐG CL Diesel | 62.985,46213344446 | −26.139,60382334916 | 10.590,080707581425 |
| **Đơn giá vận chuyển** | **178.000** | **88.900** | **125.600** |

Ngày bắt đầu / kết thúc, ngày nhập dầu và cự ly tuyến cũng khớp.

## 3. Các điểm APP khác Excel — theo yêu cầu §27 (không sửa cho giống)

| # | Nội dung | Loại khác | Excel | APP | Nguyên nhân | Đề xuất |
|---|---|---|---|---|---|---|
| 1 | VAT và tổng BKVC | Làm tròn | 87.486.003,2 · 1.181.061.043,2 | 87.486.003 · 1.181.061.043 | Excel không làm tròn; APP làm tròn đến đồng từng dòng (đã chốt 24/09) | Giữ APP |
| 2 | Thành tiền xe 92H-00903 | Kiểu dữ liệu (số thực) | 64.585.519,99999999 | 64.585.520 | Sai số số thực của Excel khi nhân 362,84 × 178.000 | Giữ APP |
| 3 | Số tiền bằng chữ BKVC | Dữ liệu | "Một tỷ, hai trăm năm mươi lăm triệu…" (= 1.255.799.581, gõ tay, sai) | "Một tỷ, một trăm tám mươi mốt triệu, không trăm sáu mươi mốt ngàn, không trăm bốn mươi ba đồng y ./." | Ô A25 là chữ gõ tay cũ, add-in `vnd()` lỗi liên kết | Giữ APP — hàm đọc số của APP đọc đúng từng chữ con số 1.255.799.581 theo văn phong ô A25, nên chỉ khác về số tiền |

Ngoài 3 điểm trên, **không có chênh lệch nào** về công thức, dữ liệu, làm tròn hay kiểu dữ liệu.

## 4. Những gì đã lập trình

| Hàm (tên theo yêu cầu §26) | Công thức | Nguồn Power Query |
|---|---|---|
| `calculateTripPrice` | Đơn giá mới × (Thể tích TB nếu M3, ngược lại KL_TB) | QR_DATA `Added Custom` |
| `calculateFuelConsumption` | Cự ly chuyến × Định mức (lít/km) | `Added Custom1` |
| `calculateFuelCost` | ĐG dầu chưa VAT × Tiêu hao/chuyến | `Added Custom2` |
| `calculateFuelCostRatio` | Tiền dầu / ĐG 1 chuyến | `Added Custom3` |
| `calculatePriceNoDiesel` | (ĐG 1 chuyến − Tiền dầu) / KL_TB | `Added Custom4` |
| `calculateContractPrice` | ROUND(…, −3) HALF_EVEN | `Added Custom5` |
| `aggregateTrips`, `calculateTotalTon` | số phiếu, Σ KG, /1000, ngày min/max | QR_DGVC `Grouped Rows`, `Added Custom` |
| `calculateActualFuel`, `calculateFuelPrice`, `aggregateFuel` | Σ lít; **trung bình cộng** giá (ép Int64 từng dòng); gom theo bên giao + ĐVT | TBL_GIAONHANDAU `Grouped Rows` |
| `calculateStandardFuel` | Cự ly chuyến × Số chuyến × Định mức | `Added Custom1` |
| `calculateFuelDifference` | Định mức − Thực nhận | `Added Custom2` |
| `calculateFuelAdjustment` | CL × Đơn giá dầu / Tổng tấn | `Added Custom3` |
| `calculateTransportPrice` | < 0 → 0, ngược lại ROUND(…, −2) | `Added Custom4` |
| `calculateConfirmationLine` | Tấn, Thành tiền, VAT làm tròn đến đồng | sheet BKVC |
| `roundDigits`, `int64PQ` | làm tròn thập phân chính xác, mô phỏng Int64.Type | `Number.Round`, `TransformColumnTypes` |
| `calculatePeriod` | chọn phiếu / dầu theo hợp đồng, chống tính trùng, 10 nhóm lỗi, tính từng tuyến, BKVC | toàn bộ QR_DGVC (2) + BKVC |
| `buildFormulaTrace` | 15 bước "XEM CHI TIẾT TÍNH" | — |
| `numberToVietnameseWords`, `resolveSigners` | số tiền bằng chữ; người ký theo thứ tự đơn vị | ô BKVC!A25, chỉ đạo 24/09 |

Chi tiết kỹ thuật đáng chú ý:
- **Làm tròn không dính lỗi số thực**: làm tròn trên dạng thập phân ngắn nhất của số (như Python `Decimal(repr(x))`), nên `2,675 → 2,68`, `1,005 → 1,01`. Chế độ HALF_EVEN / HALF_UP theo `CONFIG`.
- **Giữ đúng thứ tự phép tính như Power Query** để số thực trùng tuyệt đối. Có test khóa thứ tự: `54 × 3 × 0,4 = 64,8`, còn nếu nhân `54 × (3 × 0,4)` thì ra `64,80000000000001`.
- **Mô phỏng ép Int64** của Power Query khi đọc bảng giá và giá dầu (vd VC.009 `91.666,66667 → 91.667`). Tắt được bằng `PQ_INT64_CAST`.
- Mọi tham số (làm tròn, VAT, phương pháp giá dầu, tiêu chí ngày, người ký, chữ "ngàn", hậu tố "đồng y ./.") đọc từ `CONFIG`. Cấu hình sai bị từ chối ngay.

## 5. Quy tắc nghiệp vụ đã có test

| Quy tắc | Test |
|---|---|
| Bản cài không phải bên vận chuyển → không tính (`E_NOT_CARRIER`) | ✔ |
| Hợp đồng hết hiệu lực trong kỳ (`E_CONTRACT_INACTIVE`) | ✔ |
| Phiếu đã ở kỳ đã xác nhận / khóa **cùng hợp đồng** → loại, kèm đúng câu "Phiếu cân này đã được sử dụng trong kỳ tính [Mã kỳ]. Không thể đưa vào kỳ mới." | ✔ |
| Cùng phiếu ở kỳ khóa của **hợp đồng khác** → vẫn dùng được | ✔ |
| Phiếu ở kỳ nháp khác: mặc định không lấy + cảnh báo; bật "chuyển từ kỳ nháp" → lấy và báo kỳ cũ cần tính lại | ✔ |
| Tính lại chính kỳ đó không tự chặn phiếu của mình | ✔ |
| Không có dầu → chặn; cho phép dầu = 0 phải có lý do **và đơn giá dầu** | ✔ |
| Dầu nhiều bên giao / ĐVT trong 1 tuyến → chặn (Excel sẽ nhân dòng) | ✔ |
| Đơn giá âm → 0 + cảnh báo | ✔ |
| Không có phiên bản giá / kỳ cắt ngang 2 phiên bản giá | ✔ |
| Giá riêng của hợp đồng ưu tiên hơn giá chung | ✔ |
| 10 lỗi bắt buộc §23 (định mức ≤ 0 / thiếu, cự ly ≤ 0, đơn giá âm, thiếu / sai mã tuyến, tổng KL = 0, không có dầu…) + KL_TB ≤ 0 | ✔ |
| Loại phiếu / dòng dầu theo lựa chọn người dùng | ✔ |
| Cảnh báo dữ liệu thật: 5 xe không có dầu, 6 phiếu qua đêm; KL ≠ Cân 2 − Cân 1 | ✔ |
| Đổi tham số làm tròn, VAT → kết quả đổi theo, không sửa code | ✔ |
| Lọc theo Ngày cân 1 | ✔ |
| Người ký HAK → HAKQN → ĐH → CNHAK cho cả 3 hợp đồng | ✔ |
| Mã kiểm tra của Engine luôn đồng bộ với `api_spec.json` | ✔ |

## 6. Kiểm tra độ nhạy của test (cố ý làm sai Engine)

| Lỗi cài vào | Số test báo sai |
|---|---|
| Định mức hiểu thành lít/100km (chia 100) | 12 |
| Đổi thứ tự nhân dầu định mức | 1 (test khóa thứ tự) |
| Đổi thứ tự chia ĐG CL Diesel | 7 |
| Giá dầu bình quân gia quyền thay vì trung bình cộng | 5 |
| Bỏ quy tắc đơn giá âm → 0 | 2 |
| ĐG HĐ làm tròn hàng trăm thay vì hàng nghìn | 12 |
| VAT không làm tròn (như file Excel) | 5 |

## 7. Bổ sung phát sinh khi lập trình (đã cập nhật `api_spec.json`)

| Mã mới | Mức | Lý do |
|---|---|---|
| `E_AVG_LOAD_INVALID` | Lỗi | KL_TB ≤ 0 (hoặc Thể tích TB với tuyến M3) sẽ gây chia cho 0 |
| `E_NO_FUEL_PRICE` | Lỗi | Cho phép dầu = 0 vẫn cần đơn giá dầu để tính chênh lệch định mức |
| `E_NO_TICKETS` | Lỗi | Kỳ không có phiếu cân nào |
| `W_OVERRIDE_NO_FUEL`, `W_FUEL_IN_DRAFT_PERIOD` | Cảnh báo | ghi nhận override; dòng dầu đang ở kỳ nháp khác |

Cách xử lý phiếu đã dùng khi tính theo khoảng ngày: phiếu bị **loại tự động** và liệt kê trong `blocked` kèm câu thông báo; kỳ vẫn tính được với các phiếu còn lại. Nếu người dùng muốn giữ nguyên số phiếu thì phải mở khóa kỳ cũ trước.

## 8. Bước tiếp theo

Bước 11 — **Import Excel và lưu trữ**: `JsonStore` + journal ghi an toàn, import phiếu cân / bảng kê dầu (đọc header, ghép cột, 10 kiểm tra, phát hiện trùng, xem trước, xác nhận), dùng lại Engine này cho `periods.preview` / `periods.calculate`.
