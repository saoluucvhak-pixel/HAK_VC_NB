# Thiết kế: Danh mục Hình thức giá · Danh mục Đơn giá · xem chéo (cha–con) · Báo cáo thuê vận chuyển

Yêu cầu của chủ sản phẩm (23/11/2026), ghi lại nguyên ý; phần "Quyết định mặc định" là đề xuất của người xây, chờ chủ sản phẩm sửa nếu khác ý.
Nguyên tắc bất biến: KHÔNG đổi công thức/kết quả tính giá (`app/main/engine/*`); dữ liệu cũ tự chạy đúng; nhãn "Đơn giá ký hợp đồng"; test xanh trên JSON + SQLite + test:electron.

## Yêu cầu
1. **Danh mục Hình thức giá** (mới): Ngày cập nhật · Mã hình thức (hiện có: *Cố định*, *Đơn giá điều chỉnh theo giá dầu*) · Công thức tính giá · Hiệu lực. Có ngày cập nhật mới cho cùng hình thức → dòng cũ hết hiệu lực.
2. **Danh mục Đơn giá**: Ngày cập nhật · Mã đơn giá · các cột đơn giá hiện có · **Hình thức giá** (chọn từ Danh mục Hình thức giá).
3. Mở **Danh mục Đơn giá**, bấm từng dòng → bên cạnh hiện bảng **Hình thức giá** tương ứng (chỉ xem, không thêm/sửa/xóa). Thêm/sửa/xóa chỉ ở danh mục chính (Đơn giá).
4. Mở **Danh mục Hình thức giá** → thấy **đơn giá theo hình thức** (chỉ xem, có hướng dẫn "thêm/sửa/xóa ở Danh mục Đơn giá"). Thêm/sửa/xóa ở danh mục chính (Hình thức giá).
5. **Danh mục tuyến** tương tự: bấm một tuyến → hiện đơn giá của tuyến; bấm một đơn giá → hiện hình thức tính.
6. **Báo cáo thuê vận chuyển**: chủ sản phẩm chưa biết xem ở đâu. Báo cáo lấy dữ liệu do các đơn vị vận chuyển gửi theo mẫu, có đối chiếu nếu chung kỳ vận chuyển; nếu công ty thuê vận chuyển hàng của mình đi mà không làm dịch vụ thì **tạo kỳ vận chuyển**.

## Hiện trạng (đã kiểm trong mã)
- Hình thức giá hiện là hai giá trị hệ thống `CO_DINH` / `THEO_DAU` (cột `price_method` của dòng giá) kèm hai mã mặc định `PT-CD` / `PT-TD` (bảng `MA_DON_GIA`); chưa có danh mục riêng, chưa có ngày/hiệu lực/công thức.
- "Đơn giá" = bảng `PRICE_HISTORY` (mã đơn giá = `price_id`, vd `PR-VC.007-v1`; có tuyến, hiệu lực từ/đến, trạng thái, định mức…). Màn "DM Đơn giá" (`pricecodes.js`) liệt kê theo 2 phương thức; Danh mục tuyến (`catalog.js`) chưa xem được đơn giá của tuyến.
- Báo cáo thuê vận chuyển nằm ở nhóm menu **Đối tác** (`reconcile.js`: tab *Đối chiếu 3 tiêu chí*, *Các đợt đã nạp*; `exchange.js`: nhập/xuất gói) nhưng tên menu không nói "thuê vận chuyển". Đợt nạp (`SubcontractService`) hiện gắn với một kỳ đã có (`periodId`); bản cài là bên thuê không tạo được kỳ (`E_NOT_CARRIER`).

## Quyết định mặc định (đề xuất — chờ chủ sản phẩm duyệt)
- **D1. Công thức tính giá chỉ để hiển thị** (mô tả), do hệ thống cố định theo mã hình thức — KHÔNG sửa tay để đổi cách tính (bộ tính giá chỉ có 2 kiểu). Cột Công thức hiển thị tự động từ mã hình thức; mô tả/ghi chú sửa được.
- **D2. Hiệu lực của Hình thức giá**: mỗi dòng Hình thức có `ngày cập nhật` (= hiệu lực từ). Thêm dòng mới cùng mã hình thức với ngày mới hơn → dòng cũ tự đóng (`hiệu lực đến` = ngày mới − 1). Không cho điền lùi ngày. Dòng đơn giá luôn tham chiếu **mã hình thức**; khi hiển thị, hình thức có hiệu lực tại ngày hiệu lực của dòng giá được dùng để hiện công thức/mô tả.
- **D3. Ngày cập nhật của Đơn giá = ngày hiệu lực từ** (mặc định hôm nay, điền tay được; dòng mới nhất không sau ngày tính có hiệu lực; dòng cũ tự đóng) — như đang chạy. **Mã đơn giá = `price_id`** (giữ nguyên).
- **D4. Danh mục tuyến › đơn giá › hình thức**: xem chéo chỉ đọc (ngăn bên phải), sửa ở danh mục chính.
- **D5. Báo cáo thuê vận chuyển**: thêm mục menu rõ tên ở nhóm *Đối tác* (mở đúng tab Đối chiếu/đợt đã nạp), có hướng dẫn. Việc "tạo kỳ vận chuyển cho bên thuê" CHƯA làm — cần chủ sản phẩm chốt cách tính (xem Câu hỏi mở).

## Mô hình dữ liệu (đề xuất)
Bảng mới `HINH_THUC_GIA` (khóa chính `form_id`): `form_id` (vd `HT-CD-001`), `method_code` (`CO_DINH`|`THEO_DAU`), `form_name`, `formula_text`, `catalog_date` (ngày cập nhật = hiệu lực từ), `effective_to`, `status` (`ACTIVE`|`CLOSED`), `note`, cột kiểm toán chuẩn. Khóa duy nhất (`method_code` + `catalog_date`). Hạt giống 2 dòng mặc định (ngày `2000-01-01`) khi mở kho cũ (như `ensureDefaultMethods`).
`PRICE_HISTORY` giữ `price_method` làm khóa nối tới `method_code` (không thêm cột bắt buộc; chọn "Hình thức giá" ở form đơn giá = chọn `method_code` từ danh mục đang hiệu lực).
Cộng thêm cột (SQLite `syncSchema`, JSON tự nhận); đưa `HINH_THUC_GIA` vào gói trao đổi Danh mục (`ExchangeService.CATALOG_ORDER`).

## API (hợp đồng giữa phần dữ liệu và giao diện)
- `forms.list {includeClosed?}` → `{items:[{formId, methodCode, formName, formulaText, catalogDate, effectiveTo, status, priceLineCount, activeLineCount, note, rowVersion}]}` sắp theo `methodCode`, `catalogDate` giảm dần.
- `forms.get {formId}` → `{record, lines:[đơn giá dùng hình thức này (price_method = methodCode), kèm routeCode/routeName/mã đơn giá/hiệu lực/giá]}`.
- `forms.save {record, rowVersion?, create?}` (ADMIN/KẾ TOÁN): kiểm ngày (không lùi), mã hình thức hợp lệ; thêm dòng mới → đóng dòng cũ cùng mã trong 1 giao dịch; nhắc sửa giống nhà máy khác (`remindTx`).
- `forms.remove {formId}`: chỉ xóa dòng chưa có đơn giá nào dùng; còn dùng → từ chối kèm hướng dẫn (đóng bằng cách thêm dòng mới).
- `prices.catalog {routeCode?, methodCode?, status?}` → danh mục đơn giá phẳng (ngày cập nhật, mã đơn giá, tuyến, hình thức, giá, trạng thái…) dùng cho cả Danh mục Đơn giá, ngăn "đơn giá của hình thức", ngăn "đơn giá của tuyến".
- `routes.priceLines {routeCode}` → đơn giá của một tuyến (kèm hình thức có hiệu lực).
Quyền: đọc cho mọi vai trò; ghi chỉ ADMIN/KẾ TOÁN; XEM không thấy nút ghi.

## Giao diện
- Menu *Danh mục*: thêm **Hình thức giá** (trước *Đơn giá*); đổi *DM Đơn giá* → **Đơn giá**.
- **Hình thức giá**: bảng chính (Ngày cập nhật · Mã hình thức · Công thức tính giá · Hiệu lực · trạng thái) + nút Thêm/Sửa/Xóa; bấm một dòng → ngăn bên phải "Đơn giá theo hình thức này" (chỉ xem; khung hướng dẫn: "Thêm/sửa/xóa đơn giá ở Danh mục › Đơn giá"; nút "Mở Danh mục Đơn giá").
- **Đơn giá**: bảng chính (Ngày cập nhật · Mã đơn giá · Tuyến · Hình thức giá · các cột giá hiện có · trạng thái) + Thêm/Sửa/Xóa (giữ quy tắc: dòng đã kích hoạt/đã dùng không sửa tại chỗ, tạo bản mới); form có ô **Hình thức giá** chọn từ danh mục (hiện công thức của hình thức đã chọn); bấm một dòng → ngăn bên phải "Hình thức giá của đơn giá này" (chỉ xem, kèm công thức và hiệu lực).
- **Danh mục tuyến**: bấm một tuyến → ngăn bên phải danh sách đơn giá của tuyến (chỉ xem); bấm một đơn giá → hiện hình thức tính (công thức) ngay dưới.
- Màn hẹp (820–1093 px): ngăn xem chéo xếp dưới bảng chính, không tràn ngang; có nhãn/tên truy cập, vai trò XEM không thấy nút ghi.
- **Báo cáo thuê vận chuyển**: mục menu nhóm *Đối tác* + khung hướng dẫn 3 bước (nhận dữ liệu của đơn vị vận chuyển theo mẫu → đối chiếu nếu chung kỳ → khi công ty không tự làm dịch vụ: tạo kỳ vận chuyển).

## Câu hỏi mở cho chủ sản phẩm
1. D1: công thức chỉ hiển thị (khuyến nghị) hay muốn sửa được để đổi cách tính? (đổi cách tính = sửa bộ tính giá, nằm ngoài thiết kế).
2. Mục 6, "tạo kỳ vận chuyển" khi công ty thuê vận chuyển mà không làm dịch vụ: kỳ này tính từ **dữ liệu đợt nạp** (phiếu cân + dầu của đơn vị vận chuyển) theo **hợp đồng và đơn giá của đơn vị vận chuyển** (như kỳ bên vận chuyển) hay chỉ **tổng hợp số liệu nhận về** (khối lượng, dầu, tiền thuê = KL × đơn giá thuê) để đối chiếu/chi trả? Số tiền sẽ khác nhau.

## Việc chia cho agent (theo thứ tự)
1. Nền dữ liệu + API (`HINH_THUC_GIA`, `forms.*`, `prices.catalog`, `routes.priceLines`, hạt giống, gói trao đổi, spec 3 bản JSON + `API_DESIGN.md`, test JSON/SQLite).
2. Giao diện: Danh mục Hình thức giá + Danh mục Đơn giá (bảng chính + ngăn xem chéo).
3. Giao diện: Danh mục tuyến › đơn giá › hình thức; menu "Báo cáo thuê vận chuyển" + hướng dẫn.
4. Rà soát độc lập (chỉ đọc) trước khi tạo PR.
