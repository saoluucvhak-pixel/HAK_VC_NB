# Các bước kiểm của màn Hợp đồng đã gỡ khỏi ui.pricecodes.e2e.test.js (agent C làm lại theo màn Hợp đồng mới)

Bản cũ (xem `git show HEAD:app/tests/ui.pricecodes.e2e.test.js`, dòng 56-83) kiểm các điều sau; nay màn DM Đơn giá không còn "Gán cho hợp đồng…", "Bỏ mã khỏi hợp đồng", "+ Tạo mã":

- Gán mã cho hợp đồng, hỏi xác nhận khi đổi mã, `price_code` của hợp đồng đổi đúng.
- Màn Hợp đồng, thẻ "Mã đơn giá": chỉ XEM (không có ô "Mã đơn giá áp dụng"), hiện "DG-UI-01 — Đơn giá cố định", nguồn giá từng tuyến "theo mã … (đơn giá cố định)".
- Mặc định chỉ hiện tuyến của hợp đồng; nút "Xem cả N tuyến khác" hiện tuyến khác "dùng giá chung (cách cũ)".
- Mục "Mã đơn giá của đối tác" không lộ mã của đối tác khác (DG-KHAC-DT).
- Lưu hợp đồng (sửa ghi chú) không làm mất mã đơn giá.
- Nút "Đổi ở DM Đơn giá →" dẫn sang DM Đơn giá; bỏ mã khỏi hợp đồng quay về giá chung.
- "Chọn đơn giá có sẵn…" (D.pickExisting vẫn còn trong pricecodes.js, catalog.js còn gọi) và "+ Tạo mã đơn giá mới" (D.codeForm còn tồn tại, màn DM Đơn giá không còn gọi).
