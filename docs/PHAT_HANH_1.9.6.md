# DGVC 1.9.6

Bản cập nhật Windows x64 bổ sung các bản sửa sau DGVC 1.9.5.

- Chốt kỳ và tính lại kiểm tra trạng thái trong giao dịch, bảo toàn kết quả đã xác nhận khi có thao tác đồng thời.
- Kiểm tra chỉ mục đợt thuê và bảo toàn lần sửa đã lưu của đợt khác khi một thao tác phải hoàn tác.
- Kiểm tra toàn vẹn sao lưu JSON, giữ riêng từng bản sao lưu và bảo toàn kho cũ khi khôi phục thất bại.
- Kiểm tra ZIP lưu trữ năm trước khi thay thế dữ liệu, đồng thời thông báo rõ trạng thái khi mở lại năm.
- In, Excel, PDF và CSV dùng bộ lọc đã áp dụng trên màn Chi tiết vận chuyển.
- Giới hạn thao tác mở đường dẫn của ứng dụng vào thư mục và tệp tài liệu được phép.

Có thể cài đè lên bản cũ. Nên sao lưu dữ liệu trước khi nâng cấp. SQLite là kho mặc định, JSON dùng cho sao lưu và trao đổi.

Bộ cài chưa ký số. Đối chiếu SHA-256 với tệp `DGVC-Setup-1.9.6.exe.sha256` đi kèm.
