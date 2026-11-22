# DGVC 1.9.0

Bản nâng cấp toàn diện về hệ thống Đơn giá 3 cấp, quản lý Trọng tải & Thể tích danh mục xe, cảnh báo tải trọng phiếu cân và tách bạch liên hoàn 2 công thức tính giá vận chuyển. **Số liệu các kỳ đã chốt giữ nguyên từng đồng**.

## 🔴 Chuyển toàn bộ dữ liệu cũ vào Đơn giá hình thức điều chỉnh dầu
- **Chuẩn hóa hệ thống dữ liệu đơn giá:**
  - Chuyển đổi toàn bộ dữ liệu đơn giá cũ (các dòng giá tính theo chênh lệch dầu) vào hình thức **Đơn giá điều chỉnh dầu** (mã mặc định `PT-TD`, phương thức `THEO_DAU`).
  - Giao diện và API tự động nhận diện dữ liệu cũ thuộc mã `PT-TD`, đảm bảo tính kế thừa hoàn hảo mà không làm ảnh hưởng các kỳ tính lịch sử.
  - Tự động đảm bảo 2 mã phương thức chuẩn luôn sẵn sàng: `PT-CD` (Đơn giá cố định) và `PT-TD` (Đơn giá điều chỉnh dầu).

## 🟠 Quản lý Đơn giá 3 cấp & Hỗ trợ Tuyến tính theo $M^3$
- **Cấu trúc 3 cấp chuẩn nghiệp vụ:**
  - `Hợp đồng` (Cấp 1) $\rightarrow$ `Mã đơn giá` (Cấp 2) $\rightarrow$ `Đơn giá theo tuyến` (Cấp 3).
  - Hỗ trợ đầy đủ cả 2 phương thức:
    - **Đơn giá cố định (`CO_DINH`):** Áp dụng đơn giá cố định đ/tấn hoặc đ/$m^3$ theo tuyến, không tính chênh lệch dầu.
    - **Đơn giá điều chỉnh dầu (`THEO_DAU`):** Áp dụng công thức điều chỉnh giá dầu thực tế của kỳ vận chuyển.
  - Hỗ trợ đơn giá tuyến theo $m^3$: tự động quy đổi cước theo thể tích thùng của từng xe trong danh mục xe vận chuyển.

## 🟡 Nâng cấp Danh mục xe & Cảnh báo quá tải
- **Trọng tải xe (tấn) và Thể tích thùng ($m^3$):**
  - Bổ sung 2 trường `payload_ton` và `volume_m3` vào danh mục xe, form nhập liệu, danh sách và bảng kê vận chuyển.
- **Tính năng Nạp danh mục xe từ file Excel:**
  - Thêm nút "Nạp từ Excel" cho phép đọc file Excel danh mục xe, tự động nhận diện cột (Biển số, Trọng tải, Thể tích, Chủ xe), xem trước thêm mới/cập nhật và import hàng loạt trong 1 giây.
- **Cảnh báo phiếu cân chở quá trọng tải (`W_OVERLOAD`):**
  - Tự động đối chiếu khối lượng hàng trên phiếu cân với trọng tải đăng kiểm của xe. Khi phiếu cân vượt quá trọng tải, hệ thống hiển thị cảnh báo màu vàng giúp kế toán và điều hành theo dõi (vẫn cho phép tính bình thường, không chặn).

## 🟢 Tách bạch 2 tầng công thức tính giá liên hoàn
- **Liên hoàn rõ ràng giữa 2 công thức:**
  - **Công thức 1 — Đơn giá dự kiến ký HĐ:** Tính tự động từ cự ly, đơn giá cước tham khảo, định mức dầu cơ sở và làm tròn để người dùng tham khảo; cho phép nhập tay đè trực tiếp đơn giá ký HĐ.
  - **Công thức 2 — Đơn giá vận chuyển thực hiện:** Áp dụng đơn giá ký HĐ từ Công thức 1 kết hợp với chênh lệch tiêu hao nhiên liệu thực tế trong kỳ vận chuyển.
- Trình mô phỏng & giải trình công thức thiết kế khoa học, minh bạch từng bước tính toán.

## 🔵 Kiểm thử & Tương thích
- Đối chiếu số liệu Excel gốc (`verify-seed.js`): **Khớp 100% cả 3 nhà máy ĐH, HAK, HAKQN**.
- Toàn bộ bài test nghiệp vụ, danh mục, hợp đồng, xe, cảnh báo, báo cáo: **Pass 100%**.
