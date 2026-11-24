# DGVC 1.9.5

Nâng từ 1.9.4. Cách tính giá **không đổi** (không đổi `app/main/engine/*`; số tiền dòng cũ và kỳ cũ giữ nguyên). Ghi chú này gộp cả thay đổi của 1.9.3 và 1.9.4 vì hai bản đó chưa có ghi chú riêng.

## Mới ở 1.9.5
- **Sao lưu mang theo dữ liệu Thuê vận chuyển (quan trọng):** trước đây bản sao lưu bỏ sót thư mục `subcontract/` (các đợt nạp của đối tác và Báo cáo thuê vận chuyển) nên chuyển máy hoặc khôi phục sau sự cố là **mất toàn bộ các đợt đó**. Từ 1.9.5, mọi bản sao lưu (kho JSON và SQLite) mang theo thư mục này kèm mã kiểm toàn vẹn; khôi phục thay cả hai phần cùng một lúc và tự trả lại nếu lỗi giữa chừng. **Bản sao lưu tạo trước 1.9.5 không có phần này:** khôi phục từ chúng không đụng dữ liệu Thuê vận chuyển đang có. Nên bấm "Sao lưu ngay" sau khi nâng cấp. Bản sao lưu mới vẫn mở được bằng bản 1.9.3.
- **Gói trao đổi chạy được giữa bản 1.9.3 và bản mới:** bản 1.9.4 tạo gói có thêm cột `calc_basis`, `total_m3` nên bản 1.9.3 **từ chối nhập** (báo "cột lạ"), kể cả gói chỉ có dữ liệu cũ. Từ 1.9.5, hai cột này chỉ ghi vào gói khi có giá trị, nên gói chỉ có dữ liệu cũ nhập được ở cả bản cũ lẫn mới. Gói có **dòng m³** (tính theo m³) thì bản 1.9.3 trở xuống vẫn từ chối (không tính được dòng đó).
- **Sửa lỗi nút "Nhập gói" thỉnh thoảng không mở hộp xác nhận:** trang cuộn mượt làm nút trượt khỏi con trỏ giữa lúc nhấn và nhả chuột. Nay cuộn tức thì.
- **Chữ đạt tương phản 4,5:1 ở cả 4 bảng màu (sáng/tối):** viên trạng thái ở Hướng dẫn, chữ gợi ý ở ô tìm kiếm, số phím tắt ở menu trái, chữ thương hiệu ở bảng Xanh ngọc / Vàng champagne, nhãn đơn vị ở màn khởi tạo, ô chỉ-đọc. Có test tự động quét mọi chữ (khởi tạo, đăng nhập, các màn có dữ liệu, hộp thoại).
- **Ô số trên form:** dán `0.400` vào ô thập phân nay ra 0,4 (trước ra 400); `1.234` vẫn là 1234, ô tiền không đổi. Gõ dấu `.` giữa chuỗi đặt con trỏ đúng chỗ; giới hạn 15 chữ số nguyên và 6 số lẻ; hộp "Kiểm tra dấu chấm / phẩy" chỉ xét ô đang dùng và nêu cả ngưỡng nhỏ.

## Từ 1.9.4
- **Đơn giá theo giá dầu tính theo m³** cho dòng đơn giá MỚI (ô "ĐVT tính giá" Tấn / m³, mặc định theo tuyến): công thức chia Thể tích TB và tổng m³ thùng xe; bảng kê vận chuyển theo m³. Dòng cũ và kỳ cũ giữ cách tính cũ.
- Đơn giá tham khảo so với (1) DG_CUOC; thêm cột "Đơn giá tham khảo" và "Chênh lệch" ở bảng dòng đơn giá.
- Ô số ngăn nghìn `.`, thập phân `,`; ô thập phân hỏi lại khi giá trị quá lớn hoặc quá nhỏ.
- Cảnh báo xe chưa khai thể tích thùng (không đổi tiền).

## Từ 1.9.3
- Danh mục **Hình thức giá** và **Đơn giá** (xem chéo cha–con); **Báo cáo thuê vận chuyển**; ô chọn bảng màu (Luxury, Xanh ngọc, Trung tính, Vàng champagne); xe chỉ có dầu vẫn cấn trừ dầu ở Đối chiếu.

## Lưu ý khi nâng cấp
- Sao lưu bằng "Sao lưu ngay", đóng DGVC rồi chạy bộ cài mới; dữ liệu giữ nguyên.
- **Nên thử cài đè trên MỘT máy trước khi triển khai rộng.**
- Các nhà máy nên nâng cấp cùng đợt. Chỉ dùng dòng đơn giá tính theo m³ khi mọi máy nhận gói đã lên 1.9.4 trở lên.

## Chưa kiểm
Dữ liệu thật của từng nhà máy trên Windows thật; máy in; hộp thoại chọn/lưu file của Electron; Excel thật của đối tác; bộ cài chưa ký số. Tương phản mới đo trên Chromium/Linux, chưa đo hover/focus. Khả năng bản 1.9.3 nhận gói mới mới chỉ thử bằng mã v1.9.3 chạy trong Node, chưa chạy bộ cài cũ thật. Lỗi chập chờn `ui.partner.e2e` từng gặp chưa có nguyên nhân gốc.
