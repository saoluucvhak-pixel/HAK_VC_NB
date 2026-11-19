# DGVC 1.7.0

## Thay đổi (đợt 1 — giá 3 tầng)
- **Mã đơn giá có Hình thức giá**: *Đơn giá cố định* hoặc *Đơn giá theo giá dầu* (cột mới `MA_DON_GIA.price_method`, thêm tự động, mặc định trống = cố định cho mã 1.5.0). Hình thức không đổi khi mã đã có dòng/hợp đồng; dòng giá thêm vào mã phải đúng hình thức của mã.
- **Màn Mã đơn giá**: cây Hình thức → Mã → Dòng giá theo tuyến; form dòng giá theo hình thức; cự ly chỉ hiển thị (nhập một chỗ ở Danh mục tuyến); **Ngày cập nhật** = ngày hiệu lực.
- **Thuật ngữ**: "Đơn giá ký hợp đồng" / "ĐG ký HĐ" thay "Đơn giá hợp đồng" / "ĐG HĐ" ở giao diện.
- API: `pricecodes.list` trả thêm `methods`; `pricecodes.save` nhận `priceMethod`; `pricecodes.addLine` ép hình thức theo mã.
- **Không đổi**: cách tính giá (`main/engine`), giá chung / giá riêng hợp đồng, kỳ đã xác nhận/khóa, mẫu in BKVC.

- Màn Đơn giá có nhãn **"Cách cũ"** (giá chung / giá riêng hợp đồng); hình thức giá quản lý ở Mã đơn giá. Không đổi hành vi.
- Hai thẻ chọn hình thức là radio (bàn phím, có tên truy cập); vai trò XEM không thấy nút tạo/sửa/áp dụng/gán; form dòng giá báo sớm lỗi thiếu định mức/giá dầu, tuyến M3 + giá cố định, cự ly tuyến không hợp lệ.

## Giữ nguyên theo quyết định của chủ sản phẩm (tiêu đề mẫu in / Excel / PDF / giải trình)
- `app/main/reports/xlsxExport.js:373` và `app/main/reports/htmlTemplates.js:212`: chú thích "Đơn giá hợp đồng" trong BKVC Excel/in.
- `app/main/engine/trace.js:31,41` và `app/main/engine/formulas.js:11`: nhãn bước giải trình "ĐG HĐ".
- Chỉ nhãn trên màn hình renderer được đổi sang "ĐG ký HĐ" / "Đơn giá ký hợp đồng".

## Lưu ý nâng cấp
- **Các nhà máy phải nâng cấp cùng đợt**: gói trao đổi danh mục có cột mới `price_method` của mã đơn giá; bản cũ nhận gói mới (hoặc ngược lại) có thể bỏ qua cột này.
- **Mã đơn giá cũ (tạo ở 1.5.x, cột hình thức rỗng) được suy hình thức từ các dòng giá của mã:**
  - không có dòng, hoặc mọi dòng là *Đơn giá cố định* → **Đơn giá cố định**;
  - mọi dòng còn lại (kể cả dòng có cột hình thức rỗng) → **Đơn giá theo giá dầu**;
  - lẫn cả hai loại → **Hỗn hợp**: app **không ghi** hình thức, hiện cảnh báo "Mã có cả dòng cố định và theo giá dầu (tạo ở bản cũ) — tách thành 2 mã" trên màn Mã đơn giá, và **chặn thêm dòng / sửa nháp / áp dụng dòng nháp** cho tới khi người dùng tách mã (dòng đang áp dụng vẫn tính bình thường, kết quả không đổi).
  - Khi mở kho lần đầu sau nâng cấp, app ghi `price_method` cho các mã suy ra được (nhật ký `PRICE_CODE_METHOD_BACKFILL`); mã Hỗn hợp để trống.
  - Máy chủ chặn dòng thuộc mã khác hình thức của mã (sửa nháp, áp dụng), dòng giá chung / giá riêng hợp đồng không bị ràng buộc.
