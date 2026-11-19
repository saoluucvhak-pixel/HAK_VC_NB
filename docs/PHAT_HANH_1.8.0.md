# DGVC 1.8.0

Đợt 2 của "Giá 3 tầng" (dựng trên 1.7.0 và 1.6.1). **Không đổi cách tính giá** (`app/main/engine/*`), kết quả các kỳ đã tính giữ nguyên.

## Thay đổi
- **Danh mục tuyến**: mã tuyến **tự gợi ý** (VC.nnn kế tiếp, sửa được trước khi lưu; trùng mã khi lưu → báo `DUPLICATE`, không ghi đè; vẫn nhắc sửa giống ở các nhà máy còn lại) và cột **Ngày cập nhật** (mặc định ngày hệ thống, điền tay được; tuyến cũ hiển thị theo ngày chỉnh sửa gần nhất). Cột mới `TUYEN_VC.catalog_date` (cộng thêm).
- **Hợp đồng**: mỗi tuyến hiện **nguồn giá** — "theo mã DG-xxx (cố định / theo giá dầu)", "giá riêng hợp đồng (cách cũ)" hoặc "dùng giá chung (cách cũ)" — đúng thứ tự ưu tiên của bộ chọn giá; kèm danh sách mã đơn giá của **đối tác** của hợp đồng. API chỉ đọc mới: `contracts.routeSources`, `routes.nextCode`.
- **Mã đơn giá chỉ gán ở một nơi** — màn **Mã đơn giá**. Màn Hợp đồng chỉ xem (nút "Đổi ở Mã đơn giá →"); lưu hợp đồng không đụng tới mã đã gán. Ba màn Đơn giá / Mã đơn giá / Căn cứ giá hợp đồng có dòng giải thích và liên kết sang nhau.
- **Giao nhận dầu**: màn Giao nhận dầu báo "hợp đồng toàn tuyến cố định — không cần nhập dầu" (vẫn nhập được); màn Hợp đồng có khối **Giao nhận dầu của hợp đồng** (số dòng, số kỳ, nút sang màn nhập) chỉ khi còn tuyến theo giá dầu. Dầu nhập tay và import Excel đều gắn đúng hợp đồng. Thứ tự menu: Hợp đồng → … → Giao nhận dầu → Tính giá (phím tắt giữ nguyên).

## Lưu ý nâng cấp
- Cột mới `TUYEN_VC.catalog_date` (cộng thêm, rỗng) — bản cũ tự nâng cấp. **Các nhà máy nâng cấp cùng đợt** vì gói trao đổi danh mục có cột mới.
- Chưa làm (bản sau): menu nhóm + màn Hợp đồng kiểu cha–con (P6).

## Việc cần chủ sản phẩm làm sau khi gộp
Chạy workflow **"Release (Windows)"** (cài mới / cài đè / gỡ trên Windows thật) và ghi kết quả vào mục này. Không tự tạo Release.
