# DGVC 1.8.1

Chỉ đổi **giao diện / điều hướng** (P6). Không đổi API, quyền, dữ liệu, cách tính giá.

## Thay đổi
- **Menu nhóm**: Bắt đầu · Danh mục · Nhập liệu · Tính & chốt · Kết xuất · Trao đổi & đối chiếu · Hệ thống. Nhóm thu gọn / mở được (bấm hoặc Enter), **nhớ trạng thái**, tự mở nhóm chứa màn đang xem; nút nhóm có `aria-expanded`, mục đang mở có `aria-current="page"`. Mọi màn cũ vẫn mở được; id màn và số phím tắt không đổi. Thứ tự nhóm theo luồng làm việc: Danh mục (gồm Hợp đồng) → Nhập liệu (Giao nhận dầu) → Tính & chốt.
- **Công ty & đối tác** và **Xe** là hai màn riêng trong nhóm Danh mục (tách khỏi Cài đặt › "Công ty & xe"); đường dẫn cũ `Cài đặt › Công ty & xe` tự chuyển sang màn mới.
- **Hợp đồng kiểu cha–con**: trái là danh sách (lọc đang dùng / vai trò / tìm kiếm), phải là chi tiết với 4 thẻ **Thông tin · Xe của hợp đồng · Mã đơn giá (chỉ xem, dẫn sang Mã đơn giá) · Kỳ tính (bấm mở kỳ)**; thanh vị trí "Danh mục › Hợp đồng › <mã HĐ>"; chọn nhanh liên tiếp không bị kết quả cũ ghi đè; màn hẹp (< 900 px) xếp dọc, có nút "← Danh sách".

## Lưu ý
- Tên hai nhóm "Bắt đầu" và "Kết xuất" thay cho "Tổng quan" và "Báo cáo" để không trùng tên mục menu.
- Ảnh chụp màn hình: `docs/man_hinh_1.6.1/` (menu nhóm, Hợp đồng cha–con 1366 px và 800 px).
- Chưa kiểm trên Windows thật.

## Sửa sau rà soát (#39)
- **Màn Hợp đồng**: mỗi hợp đồng chỉ dựng một lần, đổi thẻ chỉ ẩn/hiện nên **không mất chữ đang gõ** và không gọi lại API. Khi còn thay đổi chưa lưu (thông tin hoặc phạm vi xe) mà chọn hợp đồng khác, bấm "← Danh sách" hoặc rời màn (menu, "Đổi ở Mã đơn giá →", "Mở kỳ"…) → hỏi "Bỏ thay đổi chưa lưu?". Cơ chế dùng chung `D.leaveGuard`; không hỏi khi về màn đăng nhập.
- Thẻ có `aria-controls` / `aria-labelledby`, đi bằng phím ← → Home End.
- Màn **Công ty & đối tác** và **Xe** dựng theo từng phần riêng (không còn dò tiêu đề trong DOM). Mỗi màn chỉ gọi API nó cần.
- Test: `review38.routes-exchange.test.js`, `ui.contract-tabs.e2e.test.js`; chỉnh selector ở `ui.fuel-flow` / `ui.pricecodes` theo bố cục thẻ mới. `npm test` 301/301, `npm run test:electron` đạt (Linux, xvfb).
