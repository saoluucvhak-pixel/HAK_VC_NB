# Thiết kế: danh mục giá 3 tầng (Hình thức giá → Mã đơn giá → Dòng giá theo tuyến)

## Ý định
Người dùng (đơn vị cung cấp vận chuyển) muốn màn hình giá rõ ràng: chọn **hình thức giá** (Cố định / Theo giá dầu), tạo **mã đơn giá** là con của hình thức, trong mã đặt giá + **hệ số riêng cho từng tuyến**. Danh mục tuyến chứa cự ly, tiêu hao… làm giá trị mặc định. Thông tin người dùng đưa chỉ là tham khảo — người xây tự quyết bố cục.

## Mục tiêu / không làm
- Làm: màn "Mã đơn giá" 3 tầng; mã có hình thức; form dòng giá theo hình thức; tuyến cung cấp giá trị mặc định điền sẵn.
- Không làm: đổi công thức tính, đổi dữ liệu/kết quả của kỳ cũ, cho sửa/thêm/xóa "hình thức giá" (chỉ 2 giá trị hệ thống vì công thức chỉ có 2 kiểu).
- Chống mục tiêu: hợp đồng không gán mã, màn Đơn giá cũ, test cũ phải chạy y như trước.

## Cách tiếp cận (đã chọn A)
A. Mã thuộc một hình thức (chọn). B. Mã trộn hai hình thức (loại: rối). C. Hình thức là danh mục sửa được (loại: công thức chỉ có 2 kiểu).

## Thiết kế
1. **Dữ liệu**: thêm cột `price_method` vào `MA_DON_GIA` (CO_DINH | THEO_DAU), mặc định `CO_DINH` → mã 1.5.0 cũ (chỉ có dòng cố định) tự đúng. Cột thêm kiểu cộng thêm (SQLite `syncSchema` tự thêm). Hình thức không đổi được sau khi mã đã có dòng giá.
2. **Dòng giá trong mã** vẫn là `PRICE_HISTORY` có `price_code`; `price_method` của dòng = hình thức của mã (server ép đúng). Mã Cố định: ô đơn giá cố định. Mã Theo giá dầu: **Đơn giá ký hợp đồng**, giá dầu, tiêu hao (l/km), tải trọng bình quân… (các cột đã có). Bộ tính giá (`selectPriceVersion`) không lọc theo hình thức nên không phải sửa.
3. **Tuyến → mặc định**: khi thêm dòng, điền sẵn cự ly/cự ly chuyến/ĐVT từ tuyến và tiêu hao/tải gần nhất của tuyến (nếu có); người dùng sửa theo mã. Danh mục tuyến chỉ thêm hiển thị (tiêu hao, tải mặc định lấy từ giá chung đang dùng), không đổi lưu trữ.
4. **Màn hình**: cột trái cây `Hình thức giá → Mã đơn giá (công ty đối tác)`, bấm mã → chi tiết bên phải (thông tin mã, hợp đồng đang dùng, bảng dòng theo tuyến, nút thêm dòng/áp dụng/gán hợp đồng). Tạo mã: chọn hình thức trước (hai thẻ lớn có mô tả ngắn), rồi công ty, mã, tên.
5. **Tương thích**: dữ liệu cũ không đổi; kỳ đã xác nhận/khóa không đổi; thêm test: mã theo giá dầu cho kết quả bằng đúng tuyến giá dầu thường cùng số liệu; mã cố định như 1.5.0.

## Việc để người xây tự quyết
Chữ nghĩa nhãn, thứ tự cột, màu thẻ hình thức; cách điền sẵn tiêu hao/tải khi tuyến chưa có giá.

## Thuật ngữ (người dùng chốt)
Gọi là **"Đơn giá ký hợp đồng"** (viết tắt "ĐG ký HĐ"), không gọi "đơn giá hợp đồng"/"ĐG HĐ". Đổi nhãn trên toàn giao diện (màn Đơn giá, Mã đơn giá, Tính giá, Căn cứ giá…). Không đổi tên cột dữ liệu, không đổi mẫu in BKVC đã chốt.
