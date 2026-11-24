# DGVC 1.9.3

Nâng cấp từ bản 1.9.2. Cách tính giá và tổng tiền thanh toán **không đổi** (100% khớp dữ liệu Excel thực tế của cả 3 nhà máy HAK, HAKQN, ĐH).

## Các thay đổi chính
- **Danh mục Hình thức giá & Đơn giá (Mô hình cha–con)**:
  - Cho phép xem chéo trực tiếp mối quan hệ giữa Hình thức giá (phương thức tính cố định / theo giá dầu) và các Đơn giá theo tuyến áp dụng.
  - Hỗ trợ xóa dòng đơn giá rác hoặc tạo sai sót mà không ảnh hưởng đến các hợp đồng đã ký trước đó.
- **Báo cáo thuê vận chuyển & Đối chiếu dữ liệu**:
  - Bổ sung bảng màu nhận diện trực quan cho các trạng thái nạp đợt, khớp dữ liệu và chênh lệch.
  - Xử lý cấn trừ dầu thông minh: xe chỉ có dầu phát sinh (không phát sinh phiếu cân trong kỳ) vẫn được đưa vào cấn trừ dầu tự động tại màn hình Đối chiếu.
- **Đóng gói & Phát hành**:
  - Đồng bộ phiên bản `1.9.3` trong file cấu hình bộ cài đặt Windows `installer/dgvc.nsi`.
  - Cập nhật quy trình kiểm tra phiên bản tự động của Release pipeline.

## Hướng dẫn nâng cấp
1. Thực hiện "Sao lưu ngay" để lưu trữ bản dữ liệu hiện tại.
2. Đóng phần mềm DGVC đang chạy.
3. Chạy file cài đặt `DGVC-Setup-1.9.3.exe` để cập nhật (dữ liệu hiện có được giữ nguyên 100%).
