# BƯỚC 13 — CHẠY VỚI DỮ LIỆU THẬT

**Kết quả:** 90/90 test đạt. Dữ liệu dùng là 3 file Excel gốc: 326 phiếu cân và 18 + 16 + 13 dòng dầu. Mọi bước chạy đúng như kế toán làm trên máy: import file → sửa phiếu → tính → xác nhận → khóa → in báo cáo. Thêm 8 test mới (7 trong `realdata.test.js`, 1 trong `multiweek.test.js`) và 1 công cụ chạy thử khối lượng 1 năm.

## 1. LDĐ — đã chốt `UTXK/ĐN-QS/0726`
- File `_DH.xlsx` và `_ĐN.xlsx` ghi `0526`. Sau khi import, bản cài ĐH và HAK dùng chức năng mới **Sửa hàng loạt cột mô tả**: chọn cột LDĐ, sửa `0526` thành `0726`.
  - ĐH: 77 phiếu. HAK: 100 phiếu.
  - Bắt buộc nhập lý do.
  - Nhật ký lưu từng phiếu (giá trị trước / sau / lý do) và 1 dòng tổng `BULK_UPDATE`.
  - Bấm 2 lần cũng chỉ ghi 1 lần.
- Sửa cột mô tả **không làm thay đổi số tính** và không bắt tính lại kỳ. Bảng kê chi tiết in ra `0726`.
- Phiếu đã ở kỳ **đã khóa** thì chỉ ADMIN hoặc người có quyền mở khóa mới sửa được.

**Quy tắc sửa 1 phiếu** (`TicketService`):

| Nhóm cột | Cột | Luật |
|---|---|---|
| Định danh | số phiếu, ngày cân 1, biển số | Không sửa được. Muốn đổi thì xóa mềm rồi nhập lại, vì ID phiếu phải giống nhau ở mọi bản cài. |
| Cốt lõi | giờ cân, cân 2, cân lần 1/2, KL hàng, tuyến, chủ xe | Cấm sửa khi phiếu ở kỳ đã xác nhận / đã khóa. Nếu phiếu ở kỳ nháp: sửa được, kỳ đó bị đánh dấu **cần tính lại**. |
| Mô tả | LDĐ, nguồn gốc, khách hàng, kiểu cân, đơn vị VC | Sửa được. Kỳ đã xác nhận: bắt buộc có lý do. Kỳ đã khóa: cần thêm quyền mở khóa. |

## 2. Đối chiếu chéo 3 bản cài (tuần 18–23/09/2026, tuyến VC.007)

| Bản cài | Hợp đồng | Số phiếu | KG | Đơn giá VC |
|---|---|---|---|---|
| ĐH | ĐH → HAKQN | 77 | 1.452.130 | **88.900** |
| HAK | HAK → HAKQN | 100 | 1.870.380 | **125.600** |
| (xe nhà HAKQN) | — | 149 | 2.821.170 | — |
| HAKQN | HAKQN → CNHAK | **326** = 77 + 100 + 149 | **6.143.680** = tổng 3 dòng trên | **178.000** |

- Cùng một phiếu có cùng ID ở cả 3 bản cài.
- ĐH và HAK không trùng phiếu nào với nhau. Cả hai đều nằm trọn trong kỳ HAKQN.
- Từng xe thuê: số chuyến và KG trên BKVC bên thầu phụ khớp đúng dòng xe đó trên BKVC HAKQN → CNHAK.
- Không bản cài nào có phiếu bị bỏ sót khỏi hợp đồng.

## 3. Các tình huống thực tế

| Tình huống | Kết quả |
|---|---|
| **Chia tuần thành 2 kỳ** (18–20, 21–23) | Kỳ 1: 168 chuyến, 2.892 lít, 178.200 đ/tấn. Kỳ 2: 158 chuyến, 2.961 lít, 177.800 đ/tấn. Cộng lại đủ 326 chuyến / 5.853 lít. Không phiếu hay dòng dầu nào bị tính 2 lần. Phiếu qua đêm 740 (cân 20 → 21/09) vào kỳ 1 theo Ngày cân 1. Sau đó kỳ cả tuần bị chặn. |
| **Xe rời hợp đồng giữa kỳ** (92H-00057 hết hiệu lực 20/09) | 8 phiếu (145.990 kg) sau ngày rời không tính. App cảnh báo `W_VEHICLE_PARTIAL_CONTRACT` và `W_TICKET_NO_CONTRACT` (phiếu chưa thuộc hợp đồng nào), để không bỏ sót phiếu mà không ai biết. Gắn xe vào hợp đồng khác từ 21/09 thì hết cảnh báo "không thuộc hợp đồng nào". |
| **Sửa KL phiếu trong kỳ nháp** | Kỳ bị đánh dấu cần tính lại. Xác nhận bị chặn cho tới khi tính lại. Tính lại ra số mới (+1.000 kg). |
| **Nhiều tuần liên tiếp** (4 tuần, import file như thật) | Tuần nào cũng 326 chuyến / 178.000. Không dòng nào bị chặn nhầm. |

**Sửa trong bước này — dầu của các kỳ trước:**
- Bảng kê dầu "tính hết", nên từ tuần thứ 2 app gặp lại toàn bộ dầu cũ. Trước đây app liệt kê từng dòng là "đã dùng ở kỳ khác", tới cuối năm sẽ là hàng trăm dòng mỗi kỳ.
- Nay dầu nhận **trước** kỳ mà đã tính ở kỳ đã xác nhận được bỏ qua và gộp thành **1 dòng thông tin** `I_FUEL_USED_EARLIER` (ví dụ tuần 4: 54 dòng, 3 kỳ).
- Dầu trùng ngày với kỳ mới (kỳ chồng ngày) vẫn bị chặn và liệt kê rõ như cũ.

## 4. Chạy thử khối lượng 1 năm (`node tools/bench-year.js 52`)
Lấy tuần thật nhân thành 52 tuần liên tiếp. Mỗi tuần làm đủ các bước: import phiếu → import dầu → tính → xác nhận → khóa. Cứ 4 tuần xuất BKVC Excel 1 lần.

| Chỉ tiêu | Kết quả |
|---|---|
| Dữ liệu cuối năm | 16.952 phiếu · 936 dòng dầu · 52 kỳ · 16.952 dòng chi tiết |
| Đơn giá từng tuần | 178.000 cả 52 tuần, tuần nào cũng 326 chuyến |
| Import phiếu 1 tuần | trung bình 0,23 s (tuần cuối 0,46 s) |
| Tính kỳ | trung bình 0,08 s (tuần cuối 0,2 s) |
| Xác nhận + khóa | trung bình 0,1 s (tuần cuối 0,24 s) |
| Xuất BKVC Excel | 0,02 s |
| Thư mục dữ liệu | 30 MB, 24 file, tự tách file theo năm 2026 / 2027 |
| Mở lại kho cuối năm | 0,41 s |
| Tra phiếu 1 xe cả năm | 3 ms |

Kết luận: 1 năm dữ liệu của một đơn vị vẫn chạy nhanh trên máy văn phòng, không cần SQL.

## 5. Đã chốt (25/09/2026): **tính tất cả dầu vào kỳ**
- Dầu trong bảng kê của hợp đồng tính hết vào kỳ, kể cả dầu nhận trước ngày bắt đầu kỳ. Ví dụ: 2 dòng 16/09 (768 lít) trong bảng kê ĐH → ĐGVC **88.900**, khớp Excel. Không lọc theo ngày (nếu lọc sẽ ra 104.300).
- Dòng ngoài Từ–Đến ngày chỉ hiện cảnh báo `W_BEFORE_PERIOD` / `W_AFTER_PERIOD`. Người dùng vẫn bỏ chọn được từng dòng, ví dụ khi chia 1 bảng kê cho 2 kỳ.
- Test khóa quy tắc: `realdata.test.js` — "Tính tất cả dầu vào kỳ".

## 6. Bước tiếp theo
- **Bước 14:** so APP ↔ Excel toàn bộ theo 5 mục (công thức / dữ liệu / làm tròn / kiểu dữ liệu / nguyên nhân), lập bảng chênh lệch cuối cùng.
- **Bước 15:** vỏ Electron, giao diện, sao lưu, gói trao đổi.
