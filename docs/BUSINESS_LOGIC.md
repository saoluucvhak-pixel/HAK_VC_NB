# BUSINESS_LOGIC.md — Logic nghiệp vụ

> Phần 1–3 mô tả **đúng những gì file Excel đang làm**. Phần 4–6 là **quy tắc nghiệp vụ APP** theo yêu cầu của anh/chị, chỗ nào Excel không có thì ghi rõ.
> Công thức chi tiết: xem `CALCULATION_RULES.md`.

> **v6 (24/09/2026): bản desktop Electron, offline, lưu JSON, mỗi đơn vị một bản cài** — BL-61, BL-71, BL-72.
> **Cập nhật 24/09/2026 (v4):** đã áp dụng 5 câu trả lời — định mức 0,4 lít/km; tính hết dầu trong bảng kê; đơn giá dầu trung bình cộng; làm tròn tiền đến đồng; giá dầu chưa VAT; **mỗi hợp đồng vận chuyển 2 bên tính độc lập, bên vận chuyển tự lập**. Các mục đã chốt đánh dấu ✅.
> **v5 (24/09/2026):** bổ sung 2 file hợp đồng `Dongiavanchuyen_24.09_DH.xlsx` (ĐH – HAKQN) và `Dongiavanchuyen_24.09_ĐN.xlsx` (HAK – HAKQN); **sửa** cách lấy dầu: dầu lấy theo **bảng kê giao nhận dầu của chính hợp đồng**, không lọc bảng kê của hợp đồng khác theo xe.

---

## 1. Bối cảnh nghiệp vụ (đọc từ file)

- **Hàng hóa**: dăm gỗ, vận chuyển từ nhà máy dăm Quế Sơn (Cụm CN Đông Phú, Xã Quế Sơn – nhà máy của CN Công ty TNHH Hoàng Anh Khôi) ra cảng Tiên Sa. Tuyến **VC.007 – Xã Quế Sơn - Tiên Sa**, 72 km một chiều, 144 km/chuyến.
- **Chứng từ số lượng**: phiếu cân tại trạm cân (cân xe rỗng + cân xe có hàng), kiểu cân `XBUT`, lệnh điều động `UTXK/ĐN-QS/0726`.
- **Xe vận chuyển**: 17 xe thuộc 3 đơn vị — Công ty TNHH Hoàng Anh Khôi (5 xe 43H), Công ty TNHH SX TM DV Đại Hiệp (5 xe 92H), Công ty TNHH Hoàng Anh Khôi Quảng Nam (7 xe 92H).
- **Dầu Diezel**: xuất từ kho NVL của CN HAK (TK 152, mã hàng `152QS.001`) cho từng xe, lập "Bảng kê giao nhận dầu tại kho NM Quế Sơn". Biên bản mẫu (sheet ẩn `NL_GIAONHANDAU (3)`): **Bên giao** = Chi nhánh Công ty TNHH Hoàng Anh Khôi; **Bên nhận** = Công ty TNHH Hoàng Anh Khôi Quảng Nam.
- **Bảng xác nhận khối lượng (BKVC)**: ký giữa **Công ty TNHH Hoàng Anh Khôi Quảng Nam** (Giám đốc + Kế toán) và **CN Công ty TNHH Hoàng Anh Khôi** (P. Giám đốc + Kế toán). Đây là cơ sở thanh toán cước.
- **Cơ chế giá**: đơn giá hợp đồng **đã trừ phần dầu** theo giá dầu cơ sở 15.500 đ/lít; phần dầu được xử lý riêng: xe nhận dầu từ kho, cuối kỳ so dầu **định mức** với dầu **thực nhận**, phần chênh lệch quy ra tiền theo **giá dầu thực tế** rồi cộng (hoặc trừ) vào đơn giá/tấn.

✅ **B-1 ĐÃ XÁC NHẬN (24/09/2026)** — Quan hệ vận chuyển không cố định (2 đơn vị chạy thuê cho 1 đơn vị; hoặc 1 đơn vị vừa chạy vừa thuê thêm đơn vị khác chạy cho đơn vị thứ ba). Nguyên tắc: **nhà thầu nào làm vận chuyển thì nhà thầu đó lập tính toán** cho hợp đồng của mình (ĐH với HAKQN thì ĐH làm; HAKQN với QS thì HAKQN làm). File Excel này là hợp đồng **HAKQN – QS**. APP mô hình hóa bằng các **hợp đồng 2 bên độc lập** (§4.6).

---

## 2. Quy trình hiện tại trong Excel (as-is)

| Bước | Người làm | Thao tác | Tự động? |
|---|---|---|---|
| 1 | Kế toán | Xuất danh sách lượt cân từ phần mềm trạm cân, dán vào `TBL_VC` (sheet NL_VC), bổ sung cột `Mã cự ly VC`, `Đơn vị VC` | Tay |
| 2 | Kế toán | Lấy số lượng dầu xuất cho xe (sổ chi tiết vật tư Dầu Diezel), dán vào `TBL_GIAONHANDAU`, bổ sung `Mã cự ly VC`, `Đơn giá dầu`, `Ngày mua dầu` | Tay |
| 3 | Kế toán | Nếu đổi giá: mở Power Query Editor sửa bảng nhúng `TBL_DATA` | Tay, khó kiểm soát |
| 4 | Excel | Refresh → `QR_DGVC (2)` tính đơn giá vận chuyển/tuyến | Tự động |
| 5 | Excel | Refresh PivotTable → số chuyến & KL theo xe | Tự động |
| 6 | Kế toán | Copy pivot sang `BKVC`, gõ đơn giá 178.000, sửa dòng kỳ, ngày ký, số tiền bằng chữ | Tay |
| 7 | Kế toán | Sao sheet bảng kê chi tiết (`BKCT`), biên bản dầu cho kỳ; lưu kỳ cũ bằng cách **nhân bản sheet** rồi ẩn | Tay |

Điểm yếu do cách làm thủ công (chứng cứ trong file):
- Số tiền bằng chữ trên BKVC **không khớp** tổng tiền (xem DATA_MODEL D1).
- Kỳ cũ lưu bằng sheet ẩn → không truy vấn, không đối chiếu được.
- Không có chống tính trùng: phiếu cân dán lại vẫn được đếm.
- Không lọc theo ngày: kỳ tính = "những gì đang có trong bảng".

---

## 3. Luật nghiệp vụ Excel đang áp dụng (as-is)

| Mã | Luật | Nguồn |
|---|---|---|
| R-01 | 1 dòng phiếu cân = 1 chuyến | `Table.RowCount` |
| R-02 | Khối lượng tính cước = `KL hàng (KG)` (= cân lần 2 − cân lần 1) | TBL_VC |
| R-03 | Kỳ tính: ngày bắt đầu = min(Ngày cân 1), ngày kết thúc = max(Ngày cân 2) | QR_DGVC (2) |
| R-04 | Tổng hợp theo **mã tuyến**, không theo xe, không theo đơn vị VC | QR_DGVC (2) |
| R-05 | Dầu thực nhận = tổng mọi dòng giao nhận dầu cùng mã tuyến (không lọc ngày, không đối chiếu từng xe) | TBL_GIAONHANDAU (2) |
| R-06 | Đơn giá dầu của kỳ = trung bình cộng đơn giá các dòng giao nhận | TBL_GIAONHANDAU (2) |
| R-07 | Đơn giá hợp đồng chỉ phụ thuộc danh mục tuyến, làm tròn hàng nghìn | QR_DATA (2) |
| R-08 | Dầu định mức = cự ly chuyến × số chuyến × định mức | QR_DGVC (2) |
| R-09 | Đơn giá VC = ĐG_HĐ + ĐG CL Diesel, âm thì = 0, làm tròn hàng trăm | QR_DGVC (2) |
| R-10 | BKVC: 1 dòng/xe, cùng 1 đơn giá VC, VAT 8% | BKVC |
| R-11 | Tuyến M3: ĐG 1 chuyến tính theo thể tích, nhưng quy về đ/tấn bằng KL_TB | QR_DATA (2) |

---

## 4. Luật nghiệp vụ APP (to-be)

### 4.1. Danh mục tuyến & đơn giá
- **BL-01** Tuyến (`ROUTES`) và giá (`PRICE_HISTORY`) tách riêng. Một tuyến có nhiều phiên bản giá, mỗi phiên bản có `effective_from`/`effective_to`.
- **BL-02** Phiên bản giá **đã được dùng** trong một kỳ tính (`is_used = true`) → **không được sửa/xóa**. Muốn đổi giá phải tạo phiên bản mới; phiên bản cũ tự đóng `effective_to = effective_from mới − 1 ngày`.
- **BL-03** Tuyến không xóa cứng, chỉ `is_active = false` (ngừng sử dụng). Không cho ngừng nếu còn phiếu cân `CHUA_TINH` thuộc tuyến — **[CẦN XÁC NHẬN]**.
- **BL-04** Chọn phiên bản giá cho kỳ: phiên bản có hiệu lực tại **ngày kết thúc kỳ**. Nếu trong kỳ có 2 phiên bản → cảnh báo, yêu cầu tách kỳ. **[CẦN XÁC NHẬN]** (Excel không có khái niệm này.)
- **BL-05** `Đơn giá mới` lưu là **giá trị nhập**, không tự tính. (Quan sát thấy `Đơn giá mới = Cự ly × 2.291,67` với tuyến HAK — **[CẦN XÁC NHẬN]** có muốn APP tự tính theo quy tắc này không.)

### 4.2. Phiếu cân
- **BL-10** Phiếu cân chỉ vào hệ thống qua **Import có kiểm tra** hoặc nhập tay có validation; không ghi thẳng.
- **BL-11** Khóa trùng: `Số phiếu + Ngày cân 1 + Biển số` **[CẦN XÁC NHẬN]** (số phiếu reset theo năm/trạm cân — các kỳ cũ có số 3, 196, 2378, 4149…).
- **BL-12** Kiểm tra tại import: KG ≤ 0; `KL hàng ≠ Cân lần 2 − Cân lần 1` (cảnh báo); biển số sai định dạng `^\d{2}[A-Z]{1,2}-\d{4,5}$`; thiếu mã tuyến; mã tuyến không tồn tại; trùng trong file và trùng với dữ liệu đã có.
- **BL-13** Không xóa cứng phiếu đã đưa vào kỳ; sửa phiếu ở trạng thái `DA_DUA_VAO_KY` → kỳ bị đánh dấu "cần tính lại".

### 4.3. Giao nhận dầu
- **BL-20** Mỗi lần giao nhận là 1 dòng; giữ nguyên mã xe gốc (`DN_43H01080`) và quy đổi sang biển số chuẩn (`43H-01080`) qua danh mục `VEHICLE` (tiền tố DN/DH/QC).
- **BL-21** ✅ Dầu đưa vào kỳ = **tính hết dầu trong bảng kê giao nhận** của kỳ (như Excel): mọi dòng dầu `CHUA_TINH` của mã tuyến mà người dùng đưa vào bảng kê kỳ đó; **không** lọc theo ngày nhận dầu, **không** đối chiếu theo xe. Mặc định hệ thống chọn sẵn toàn bộ dòng dầu chưa tính của tuyến, người dùng bỏ chọn được. Dòng có ngày nhận ngoài Từ–Đến ngày và xe có phiếu mà không nhận dầu chỉ hiện **cảnh báo**. **Chốt lại 25/09/2026: "tính tất cả dầu vào kỳ"** — kể cả dầu nhận trước ngày bắt đầu kỳ (vd 2 dòng 16/09 của bảng kê ĐH, 768 lít → ĐGVC 88.900 như Excel; nếu lọc theo ngày sẽ ra 104.300 — không áp dụng).
- **BL-21b** Đơn giá dầu của kỳ = **trung bình cộng** đơn giá các dòng trong bảng kê (đã xác nhận).
- **BL-22** Một dòng dầu cũng có trạng thái như phiếu cân, không được tính vào 2 kỳ đã khóa.
- **BL-23** Không có dầu cho tuyến → **lỗi chặn** "Không có dầu thực nhận" (không âm thầm để null). Người dùng có quyền có thể xác nhận "dầu thực nhận = 0" để tính tiếp — **[CẦN XÁC NHẬN]**.
- **BL-24** Một tuyến có dầu từ >1 `Đơn vị` hoặc >1 `ĐVT` → **lỗi chặn** (Excel sẽ nhân đôi dòng). **[CẦN XÁC NHẬN]** cách xử lý.

### 4.4. Kỳ tính
- **BL-30** Người dùng chọn Từ ngày → Đến ngày, (tùy chọn) mã tuyến, đơn vị VC → hệ thống lấy phiếu `CHUA_TINH` có **Ngày cân 1** trong khoảng **[CẦN XÁC NHẬN tiêu chí ngày]**.
- **BL-31** Màn hình Tính giá bắt đầu bằng việc chọn **hợp đồng** (thay cho lọc "Đơn vị VC"); danh sách chỉ hiện hợp đồng mà đơn vị của user là bên vận chuyển. Lọc theo đơn vị sở hữu xe vẫn có để xem/báo cáo.
- **BL-32** Trạng thái kỳ và phiếu:

```
Trạng thái theo từng (phiếu, hợp đồng):
Phiếu:  CHUA_TINH ──(đưa vào kỳ)──► DA_DUA_VAO_KY ──(xác nhận kỳ)──► DA_XAC_NHAN ──(khóa kỳ)──► DA_KHOA
                ▲                         │                                                       │
                └────(bỏ khỏi kỳ / hủy kỳ nháp)────┘                               (mở khóa – có quyền, ghi log)
Kỳ:     NHAP ──► DA_XAC_NHAN ──► DA_KHOA   (mở khóa: DA_KHOA ──► DA_XAC_NHAN)
```

- **BL-33** Phiếu ở trạng thái `DA_XAC_NHAN`/`DA_KHOA` được chọn cho kỳ khác → chặn với thông báo:
  *"Phiếu cân này đã được sử dụng trong kỳ tính [Mã kỳ]. Không thể đưa vào kỳ mới."* — kiểm tra **trong cùng hợp đồng** (BL-65); thông báo ghi kèm tên hợp đồng.
- **BL-34** Phiếu ở `DA_DUA_VAO_KY` của một kỳ **nháp** khác → cảnh báo, cho phép chuyển sang kỳ mới (kỳ cũ đánh dấu cần tính lại). **[CẦN XÁC NHẬN]**
- **BL-35** Mở khóa kỳ: chỉ user `can_unlock = true`, bắt buộc nhập lý do, ghi AUDIT_LOG.
- **BL-36** Tính lại kỳ: lưu `calc_version + 1`, giữ bản cũ trong log (before/after), không mất lịch sử.
- **BL-37** Kết quả kỳ lưu **snapshot**: phiên bản giá, danh sách phiếu, danh sách dòng dầu, tham số làm tròn/VAT tại thời điểm tính. Sửa danh mục sau đó không làm đổi kết quả kỳ đã khóa.

### 4.5. Báo cáo
- **BL-40** BKVC sinh tự động từ kỳ đã tính: 1 dòng/xe (hoặc /xe/tuyến — **[CẦN XÁC NHẬN]**), đơn giá lấy từ kết quả kỳ, không gõ tay.
- **BL-41** VAT cấu hình được (mặc định 8%), lưu theo kỳ.
- **BL-42** ✅ Làm tròn tiền **đến đồng**: Thành tiền và VAT làm tròn từng dòng, tổng = cộng các dòng đã làm tròn (CALCULATION_RULES §5.4).
- **BL-43** Số tiền bằng chữ sinh tự động từ tổng thanh toán.
- **BL-44** Tên công ty, địa chỉ, MST lấy từ danh mục `DON_VI` (không hard-code); số hợp đồng do người dùng tự điền.
- **BL-45** BKCT: danh sách phiếu cân cấu thành kỳ, 15 cột (bản 1.1.3 bỏ cột Khách hàng vì dữ liệu gốc để trống; cột Đơn vị VC ghi đủ tên trên 1 dòng), có lọc/tìm kiếm.

### 4.6. Hợp đồng vận chuyển 2 bên — "nhà thầu nào làm vận chuyển nhà thầu đó" ✅
- **BL-60** Mỗi quan hệ vận chuyển là **một hợp đồng 2 bên độc lập**: **Bên thuê** ↔ **Bên vận chuyển**. Không trộn vai trò nhiều bên trong cùng một hợp đồng. Ví dụ kỳ này có thể có 3 hợp đồng:

| Hợp đồng | Bên thuê | Bên vận chuyển (lập tính toán) | Xe thuộc phạm vi | File Excel | ĐG VC kỳ 18–23/09 |
|---|---|---|---|---|---|
| HAKQN – QS | CN HAK (Quế Sơn) | HAKQN | toàn bộ 17 xe (xe HAKQN + xe HAKQN thuê lại) | `…QS-TS( XUẤT QS).xlsx` | 178.000 |
| ĐH – HAKQN | HAKQN | Đại Hiệp | 5 xe Đại Hiệp | `…_DH.xlsx` | 88.900 |
| HAK – HAKQN | HAKQN | HAK | 5 xe HAK | `…_ĐN.xlsx` | 125.600 |

- **BL-61** **Bên vận chuyển tự lập** kỳ tính, đơn giá và BKVC của hợp đồng mình (ĐH lập với HAKQN; HAKQN lập với QS). Bản desktop: **mỗi đơn vị vận chuyển một bản cài**; bản cài chỉ **ghi** (bảng kê dầu, kỳ tính, xác nhận, khóa) trên hợp đồng mà đơn vị bản cài là bên vận chuyển — kể cả ADMIN. Bên thuê nhận kỳ đã xác nhận qua gói `.dgvc` loại KY_TINH, lưu `origin = IMPORTED`, chỉ xem / in lại.
- **BL-62** Phạm vi xe của hợp đồng = danh sách xe khai báo trong hợp đồng (có hiệu lực từ–đến). Gợi ý mặc định: xe của bên vận chuyển + xe của các đơn vị mà bên vận chuyển đang thuê lại (các hợp đồng có bên thuê = bên vận chuyển này). Người dùng sửa được.
- **BL-63** Phiếu cân thuộc kỳ = phiếu của **xe trong phạm vi** hợp đồng, đúng tuyến, trong Từ–Đến ngày. Dầu = **toàn bộ bảng kê giao nhận dầu của chính hợp đồng** (bên thuê giao cho bên vận chuyển), không lấy từ bảng kê của hợp đồng khác. Ví dụ bảng kê ĐH – HAKQN có 16 dòng: 3 dòng HAKQN chuyển tiếp từ dầu nhận của CN HAK (`DH_…`, 29.940) + 13 dòng HAKQN cấp thêm (28.480 / 29.940).
- **BL-64** Mọi hợp đồng dùng **cùng một công thức** (Tầng A → B → C), mặc định cùng phiên bản giá tuyến; hợp đồng có thể gắn phiên bản giá riêng nếu sau này cần.
- **BL-65** Một phiếu cân / một dòng dầu **được dùng ở nhiều hợp đồng khác nhau** (vd phiếu của xe ĐH nằm trong cả ĐH – HAKQN và HAKQN – QS). Chống tính trùng (BL-33) áp dụng **trong từng hợp đồng**: không được vào 2 kỳ của **cùng một hợp đồng**.
- **BL-66** BKVC lập cho **từng hợp đồng**, cùng một mẫu, bật/tắt theo hợp đồng. ✅ **Người ký theo thứ tự đơn vị 1 HAK → 2 HAKQN → 3 ĐH → 4 CNHAK**: bên đứng trước ký **Võ Văn Phụng – Giám đốc**, bên còn lại ký **Võ Thị Như Ngọc – Phó Giám đốc** (vd HAK–HAKQN: HAK ký VVP, HAKQN ký VTNN; HAKQN–ĐH: HAKQN ký VVP, ĐH ký VTNN; HAKQN–CNHAK: HAKQN ký VVP, CNHAK ký VTNN). Cho phép ghi đè theo hợp đồng.
- **BL-67** Hợp đồng không có dòng dầu nào trong phạm vi → áp dụng BL-23 (lỗi chặn, override có log).

- **BL-68** Bảng kê dầu mỗi dòng gắn **1 hợp đồng**; khi import dầu bắt buộc chọn hợp đồng. Cùng một lần giao dầu thực tế có thể xuất hiện ở 2 bảng kê (vd CN HAK → HAKQN rồi HAKQN → ĐH) — đó là 2 dòng thuộc 2 hợp đồng, không phải trùng.
- **BL-69** Trong **cùng một bảng kê**, dòng nghi trùng (cùng ngày, cùng xe sau chuẩn hóa, cùng số lít) → **cảnh báo**; người dùng xác nhận giữ (`flags_ack`, kèm ghi chú) thì cảnh báo không hiện lại. Ví dụ: 2 dòng 18/09 xe 92H-00192 × 400 lít trong file ĐH — đã xác nhận **không trùng** (24/09/2026).
- **BL-70** Danh mục hợp đồng do người dùng tự tạo: số HĐ, ngày hiệu lực từ–đến, bên thuê, bên vận chuyển, phạm vi xe; kế toán ký tự điền theo đơn vị.
- **BL-71** Tài khoản nội bộ của từng bản cài (mật khẩu băm scrypt, sai 5 lần khóa 15 phút). ADMIN mặc định: `saoluucvhak@gmail.com`, `phuthuy.apple@gmail.com` — đặt mật khẩu ở lần đăng nhập đầu; ADMIN thêm user, gán vai trò.
- **BL-72** Danh mục chung (đơn vị, xe, tuyến, giá) đồng bộ bằng gói DANH_MUC từ bản cài gốc; phiếu cân có mã `ticket_id` suy từ số phiếu + ngày cân 1 + biển số nên giống nhau ở mọi bản cài.

### 4.7. Truy vết & kiểm soát
- **BL-50** Mỗi dòng kết quả có nút **XEM CHI TIẾT TÍNH** hiển thị đủ chuỗi công thức (mẫu ở CALCULATION_RULES §6) và link đến từng phiếu cân, từng dòng dầu, phiên bản giá.
- **BL-51** Màn hình **KIỂM TRA DỮ LIỆU** liệt kê 10 nhóm lỗi:

| # | Lỗi | Mức | Chặn tính? |
|---|---|---|---|
| 1 | Phiếu cân trùng | Lỗi | Có |
| 2 | Không có mã tuyến | Lỗi | Có (phiếu đó) |
| 3 | Mã tuyến không tồn tại | Lỗi | Có |
| 4 | Không có đơn giá (không có phiên bản giá hiệu lực) | Lỗi | Có |
| 5 | Không có định mức dầu | Lỗi | Có |
| 6 | Không có dầu thực nhận | Lỗi | Có (trừ khi xác nhận = 0) |
| 7 | Tổng KL = 0 | Lỗi | Có |
| 8 | Đơn giá âm | Lỗi | Có |
| 9 | Cự ly ≤ 0 | Lỗi | Có |
| 10 | Định mức dầu ≤ 0 | Lỗi | Có |
| + | KL ≠ Cân 2 − Cân 1; biển số sai định dạng; xe có phiếu nhưng không nhận dầu; dầu nhiều đơn vị/ĐVT; ngày nhận dầu ngoài kỳ; dòng dầu nghi trùng; mã xe dầu không quy đổi được | Cảnh báo | Không |

- **BL-52** AUDIT_LOG bắt buộc cho: sửa đơn giá, sửa định mức, sửa dữ liệu dầu, import, tính/tính lại kỳ, xác nhận, khóa, mở khóa.

---

## 5. Phân quyền [ĐỀ XUẤT]

| Quyền | ADMIN | KE_TOAN | XEM |
|---|---|---|---|
| Xem dashboard, báo cáo | ✔ | ✔ | ✔ |
| Import / sửa phiếu cân, dầu | ✔ | ✔ | |
| Sửa danh mục tuyến, tạo phiên bản giá | ✔ | ✔ **[CẦN XÁC NHẬN]** | |
| Tính giá, xác nhận kỳ | ✔ | ✔ | |
| Khóa kỳ | ✔ | ✔ | |
| Mở khóa kỳ / phiếu | ✔ (hoặc user có `can_unlock`) | | |
| Cài đặt, người dùng | ✔ | | |

---

## 6. Tổng hợp câu hỏi [CẦN XÁC NHẬN]

**Đã trả lời ngày 24/09/2026:**

| Mã | Câu hỏi | Trả lời |
|---|---|---|
| Q1 | Đơn vị định mức dầu | ✅ **0,4 lít/km = 40 lít/100km** — công thức Excel đúng |
| Q3 | Đơn giá dầu kỳ | ✅ **Trung bình cộng** như Excel |
| Q4 | Dầu nào thuộc kỳ | ✅ **Tính hết dầu trong bảng kê** |
| Q8 | Tách theo Đơn vị VC | ✅ Mỗi hợp đồng 2 bên tính độc lập, **bên vận chuyển tự lập** (§4.6) |
| Q11 | Làm tròn tiền BKVC | ✅ **Đến đồng** |
| Q8a | Đơn giá giữa bên thuê lại và đơn vị chạy thuê | ✅ Cùng công thức, trên xe + dầu thuộc phạm vi hợp đồng đó |
| Q8b | BKVC cho từng hợp đồng | ✅ Có, cùng mẫu, bật/tắt theo hợp đồng |
| Q2 | Giá dầu thực tế 29.940 | ✅ **Chưa gồm VAT** (cùng cơ sở với "ĐG dầu chưa VAT" 15.500 trong danh mục) |

**Còn chờ trả lời:**

| Mã | Câu hỏi | Mặc định nếu chưa trả lời |
|---|---|---|
| Q5 | Lọc phiếu cân theo Ngày cân 1 hay Ngày cân 2? | Ngày cân 1 |
| Q6 | Tuyến không có dầu: chặn hay cho tính với dầu = 0? | Chặn, cho phép override có log |
| Q7 | Tuyến có dầu từ nhiều Đơn vị/ĐVT: cộng gộp hay báo lỗi? | Báo lỗi |
| Q9 | 1 xe chạy 2 tuyến trong kỳ: BKVC tách dòng theo tuyến? | Tách (xe, tuyến) |
| Q10 | Chế độ làm tròn: ToEven (khớp Power Query) hay half-up (như Excel ROUND)? | ToEven |
| Q12 | Tuyến M3 (VC.015): quy về đ/tấn hay đ/m3? ĐG CL Diesel chia tấn hay m3? | Giữ như Excel (đ/tấn) |
| Q13 | Chọn phiên bản giá theo ngày nào của kỳ? | Ngày kết thúc kỳ |
| Q14 | `Đơn giá mới` nhập tay hay tự tính theo Cự ly × đơn giá/km chuẩn? | Nhập tay |
| Q15 | Bảng quy đổi Đơn vị VC: HAK/HHH ↔ 3 công ty; tiền tố xe DN/DH/QC ↔ công ty? | Tạo danh mục, người dùng khai báo |
| Q16 | Khóa chống trùng phiếu cân? | Số phiếu + Ngày cân 1 + Biển số |
| Q17 | Ngày cập nhật giá "10/07/2025" là 10 tháng 7 hay 7 tháng 10? | 10/07/2025 (dd/MM) |
| Q19 | Có cần báo cáo Biên bản giao nhận dầu (mẫu `NL_GIAONHANDAU (3)`) và quản lý Số HĐVC (sheet `CAN`) không? | Để giai đoạn 2 |


## Chốt 25/09/2026 — tên in trên chứng từ, diễn giải hóa đơn
- **Tên bên thuê / bên vận chuyển in trên chứng từ đổi được:** thứ tự lấy = tên riêng của hợp đồng (`HOP_DONG.customer_print_name` / `carrier_print_name`) → "Tên ghi trên chứng từ" của đơn vị (`DON_VI.doc_display_name`, vd `CN Công ty TNHH Hoàng Anh Khôi`) → tên đơn vị. In chữ hoa. Không ảnh hưởng số tính.
- **Dòng "Cước vận chuyển dăm gỗ từ NM … bằng xe thùng BKS …" dùng để VIẾT HÓA ĐƠN:** APP sinh 1 dòng / xe của BKVC (cùng số tấn, đơn giá, thành tiền, VAT đã làm tròn). Mẫu câu sửa được theo từng hợp đồng (`HOP_DONG.service_desc`), trống thì dùng `CONFIG.INVOICE_DESC_TEMPLATE`. Xuất: sheet `HOA_DON` trong file BKVC, các dòng diễn giải dưới khối ký BKVC (ngoài vùng in, như Excel), báo cáo `INVOICE` (Excel / CSV / PDF).

## Chốt 25/09/2026 (tiếp) — tuyến vận chuyển, người ký
- **Tuyến vận chuyển sửa được, bổ sung được** (`CatalogService`): thêm tuyến mới (mã duy nhất, tên, cự ly, cự ly chuyến mặc định = 2 × cự ly, ĐVT tấn/m³, điểm đi / điểm đến); sửa tên / điểm đi-đến bất kỳ lúc nào; sửa cự ly / ĐVT: kỳ nháp liên quan phải tính lại, kỳ đã xác nhận/khóa giữ nguyên kết quả đã lưu và chỉ ADMIN/quyền mở khóa + lý do mới sửa được; ngừng dùng thay cho xóa. Giá theo phiên bản: tạo nháp → xem trước ĐG_HĐ → kích hoạt (tự đóng bản trước); không đổi giá sau lưng kỳ đã xác nhận. Điểm đi / điểm đến vào diễn giải hóa đơn qua `{DIEM_DI}` `{DIEM_DEN}` (mẫu chung: "Cước vận chuyển dăm gỗ từ {DIEM_DI} đến {DIEM_DEN} bằng xe thùng BKS : {BKS}").
- **Người ký luôn theo thứ tự ưu tiên đã thống nhất** (HAK → HAKQN → ĐH → CNHAK): bên ưu tiên cao hơn ký VÕ VĂN PHỤNG – Giám đốc, bên kia VÕ THỊ NHƯ NGỌC – Phó Giám đốc. HAK → HAKQN: HAK ký VÕ VĂN PHỤNG. Mẫu cũ 11/2025 ghi ngược — không theo.

## Bổ sung 25/09/2026 — hóa đơn MISA (đối chiếu hóa đơn thật 1C26TYY, ĐH → HAKQN)
- **Mẫu diễn giải mới** (theo đúng hóa đơn thật, thay mẫu "Cước vận chuyển … BKS : …"): `Vận chuyển dăm gỗ từ {DIEM_DI} đến {DIEM_DEN} bằng xe thùng biển kiểm soát: {BKS_LIEN}`. Tuyến VC.007: điểm đi "nhà máy DG CCN Đông Phú, Xã Quế Sơn , TP Đà Nẵng", điểm đến "Cảng Tiên Sa Đà Nẵng".
- **File nhập MISA:** 1 kỳ = 1 hóa đơn; mỗi xe 1 dòng (Tấn, số lượng = tấn 2 chữ số, đơn giá VC, thành tiền = làm tròn(tấn × đơn giá)). Người mua = tên đơn vị (viết hoa), MST, địa chỉ từ danh mục; HTTT "Chuyển khoản"; VND, tỷ giá 1; thuế suất 8%.
- **VAT:** MISA tính VAT = làm tròn(tổng tiền hàng × 8%). BKVC (như Excel) cộng VAT đã làm tròn từng dòng → có thể lệch 1–2 đ (ĐH kỳ 18–23/09: 11.256.912 trên hóa đơn so với 11.256.911 cộng từng dòng). `VAT_ROUND_BASIS=TOTAL` làm BKVC khớp hóa đơn. **[CẦN XÁC NHẬN]** — hiện vẫn để `LINE`.
- **Dòng dầu nghi trùng:** hóa đơn thật ĐH có đơn giá **96.900** = kết quả APP khi bỏ 1 trong 2 dòng dầu 400 lít giống hệt nhau (18/09, xe 92H-00192). File Excel giữ cả 2 dòng → 88.900. APP vẫn tính mọi dòng (quyết định "tính tất cả dầu vào kỳ") nhưng cảnh báo `W_FUEL_POSSIBLE_DUPLICATE`. **[CẦN XÁC NHẬN]** dòng đó trùng thật hay không.

## Chốt 25/09/2026 (tối)
- ✅ **Dòng dầu trùng:** anh/chị xác nhận dòng 400 lít ngày 18/09, xe 92H-00192 là nhập trùng và đã loại bỏ → kỳ ĐH 18–23/09 = **96.900 đ/tấn**, khớp hóa đơn 1C26TYY. File Excel cũ (88.900) sai do tính cả dòng trùng. APP: nút "Bỏ khỏi kỳ" lưu theo kỳ.
- ✅ **Thuế suất GTGT cho chọn theo từng kỳ** (thay đổi theo thời điểm):
  - Màn hình Tính giá có ô **Thuế suất GTGT**, chọn trong danh sách `CONFIG.VAT_RATE_OPTIONS` (mặc định 0% · 5% · 8% · 10%).
  - Để "Theo ngày cuối kỳ": lấy theo lịch `CONFIG.VAT_RATE_SCHEDULE` (vd `2026-01-01=0.08;2027-01-01=0.10`); lịch trống thì dùng `VAT_RATE`.
  - Thuế suất lưu theo kỳ (CALC_RUN.summary_json + config_snapshot_json); tính lại không chọn thì giữ thuế suất cũ của kỳ. BKVC, bảng tính đơn giá, file hóa đơn MISA dùng thuế suất của kỳ.
- Bản cài mới tự thêm các tham số CONFIG mới vào dữ liệu cũ khi mở (không đổi giá trị đang có).

## Đối chiếu dữ liệu (bản 1.1.4)
- **BL-80** Phiếu cân "chưa tính" = phiếu chưa xóa, không có trong kỳ nào (chưa hủy), của xe thuộc hợp đồng mà bản cài là bên vận chuyển tại ngày cân 1. Phân loại theo kỳ của hợp đồng (ngày kỳ theo `PERIOD_DATE_FIELD`, kỳ có lọc tuyến thì đúng tuyến): thuộc kỳ đã xác nhận/khóa → **Về muộn**; thuộc kỳ nháp → **Kỳ nháp chưa tính lại**; người dùng đã bỏ khỏi kỳ → **Đã chủ động bỏ**; không kỳ nào phủ nhưng ≤ Đến ngày của kỳ đã chốt gần nhất → **Lọt khe**; còn lại → **Chờ kỳ sau**.
- **BL-81** Import phiếu cân: phiếu MỚI thuộc kỳ đã chốt → cảnh báo `W_TICKET_LATE` (vẫn nhập được; kỳ đã chốt không tự đổi — phải trả về nháp và tính lại).
- **BL-82** Xe nằm trong 2 hợp đồng (của bản cài) có hiệu lực chồng nhau → liệt kê; cùng bên thuê là nguy cơ tính 2 lần.
- **BL-83** Đối chiếu file đơn vị khác (gói `.dgvc` có PHIEU_CAN hoặc Excel phiếu cân): khóa so = số phiếu + ngày cân 1 + biển số; mặc định giới hạn khoảng ngày của file và các xe có trong file. Cùng khóa khác số liệu cốt lõi (giờ, ngày cân 2, cân lần 1/2, KL, tuyến; ô trống bên kia bỏ qua) → Lệch; còn lại ghép theo xe + ngày cân 1 + KL → Khác số phiếu; không ghi gì vào dữ liệu.

## Nhận gói kỳ tính từ nhiều máy (bản 1.1.5)
- **BL-84** Kỳ đến được nhận diện theo **hợp đồng + mã kỳ** (khoảng ngày, tuyến), không chỉ theo mã nội bộ. Đã có kỳ đó: cùng máy gửi (origin_install_id) → *Thay bản cũ* khi lần tính lớn hơn hoặc trạng thái đổi; khác máy → **xung đột** (so lần tính, đơn giá, số chuyến, tổng tiền), mặc định giữ bản đang có; *Lấy bản đến* = thay toàn bộ kết quả kỳ.
- **BL-85** Mã nội bộ trùng (2 máy cùng mã bản cài) nhưng là kỳ khác → đổi mã dòng đến thành `<mã>@<đơn vị>.<4 ký tự mã máy>` (kỳ, dòng kết quả, dòng chi tiết, dòng dầu), lưu riêng.
- **BL-86** Từ chối kỳ đến khi: bản cài là bên vận chuyển của hợp đồng (cho phép *chỉ nhập phiếu cân trong gói*); có phiếu cân / dòng dầu đã nằm ở kỳ đã xác nhận/khóa khác của cùng hợp đồng.

## Bù trừ nhiên liệu (bản 1.1.6)
- **BL-87** Dòng dầu số lít âm = dòng bù trừ: nhập được (cảnh báo `W_FUEL_OFFSET`), được để trống đơn giá; số lít 0 vẫn là lỗi.
- **BL-88** Dầu thực nhận = Σ lít kể cả dòng âm; đơn giá dầu = TB cộng các dòng dương (chốt 05/10/2026 — khác Excel khi có dòng âm).
- **BL-89** Tổng dầu tuyến sau bù trừ ≤ 0 → vẫn tính, cảnh báo; tuyến chỉ có dòng âm không giá → lỗi.

## Đơn giá cố định (bản 1.2.3, chốt 07/10/2026)
- **BL-90** Phiên bản giá có `price_method`: `THEO_DAU` (trống = mặc định, cách cũ) hoặc `CO_DINH`. Chọn theo **từng tuyến + phiên bản giá** (giá chung hoặc giá riêng hợp đồng); đổi phương thức = tạo phiên bản mới, bản cũ tự đóng như mọi lần đổi giá.
- **BL-91** `CO_DINH`: Đơn giá VC = `fixed_price` (đ/tấn, chưa VAT, > 0), không làm tròn lại, không tính chênh lệch dầu; các cột theo giá dầu của phiên bản ghi 0. Chỉ áp cho tuyến tính theo tấn. BKVC, VAT, hóa đơn tính như cũ (Tấn × đơn giá).
- **BL-92** Tuyến cố định không nhận dầu: trong kỳ còn dòng dầu ghi mã tuyến đó → lỗi `E_FIXED_PRICE_HAS_FUEL` (chặn tính); người dùng sửa mã tuyến dòng dầu hoặc bỏ các dòng đó khỏi kỳ. Import dầu vào tuyến đang cố định → cảnh báo `W_FUEL_FIXED_ROUTE`. Tuyến cố định không cảnh báo "xe không có dầu".

## Sửa / xóa hợp đồng (bản 1.2.4)
- **BL-93** Hợp đồng "đã dùng" = có kỳ tính (kể cả kỳ đã hủy), dòng dầu (kể cả đã xóa), lô import dầu hoặc giá riêng đã dùng. Đã dùng → chỉ sửa thông tin mô tả / ngày hiệu lực / người ký / phạm vi xe; không đổi mã HĐ, bên vận chuyển, bên thuê; không xóa — dùng *Ngừng dùng* (`is_active = false`, kỳ tính báo `E_CONTRACT_INACTIVE`).
- **BL-94** Chưa dùng → sửa được mã HĐ (mã nội bộ `contract_id` giữ nguyên), bên vận chuyển, bên thuê; xóa được: xóa kèm phạm vi xe (HOP_DONG_XE) và các phiên bản giá riêng của hợp đồng; ghi AUDIT_LOG + nhắc sửa danh mục ở các nhà máy còn lại.

## Lưu trữ theo năm (bản 1.2.5, chốt 08/10/2026)
- **BL-95** ADMIN lưu trữ "đến hết năm Y" bất cứ lúc nào; app không chặn mà cảnh báo: kỳ nháp, phiếu / dầu chưa vào kỳ đã chốt (dầu chưa tính sẽ không còn được trừ vào kỳ sau), năm hiện tại.
- **BL-96** Kỳ có Đến ngày > Y, hoặc dùng phiếu / dầu có ngày > Y, cùng mọi phiếu / dầu nó dùng → giữ ở kho đang dùng; kỳ lưu trữ không dùng chung dòng nào với kỳ đang dùng.
- **BL-97** Năm đã lưu trữ: chặn thêm phiếu cân / dòng dầu / kỳ có ngày ≤ năm đó (`E_YEAR_ARCHIVED`), muốn nhập phải *Mở lại năm* (năm mới nhất trước, có lý do). Xem / in lại: tự mở chế độ chỉ xem khi khoảng ngày (hoặc kỳ) chạm năm lưu trữ.
- **BL-98** Sao lưu hằng ngày chỉ gồm kho đang dùng (năm đang làm + danh mục); mỗi lần lưu trữ ghi 1 file zip riêng, không tự xóa. Hợp đồng / xe có dữ liệu trong năm lưu trữ không xóa / đổi biển số được.

