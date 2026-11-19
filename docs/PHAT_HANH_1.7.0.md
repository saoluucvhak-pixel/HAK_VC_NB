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
- Dữ liệu cũ tự đúng: mã đơn giá 1.5.0 (cột rỗng) đọc ra *Đơn giá cố định*.
