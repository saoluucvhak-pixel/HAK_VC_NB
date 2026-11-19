# DGVC 1.5.0 — Mã đơn giá (cha–con) và đơn giá cố định theo đơn vị

Cơ sở: `main` tại `001486c` (1.4.0). **Nguyên tắc: quy trình và logic cũ giữ nguyên; đây là bố cục và phần thêm mới.** Ứng dụng dùng cho đơn vị cung cấp vận chuyển.

## Mô hình
- **Cha:** Đơn vị → **Mã đơn giá** (`MA_DON_GIA`: mã, đơn vị, tên, trạng thái, ghi chú).
- **Con:** **dòng giá** theo tuyến = `PRICE_HISTORY` có `price_code` (mặc định đơn giá CỐ ĐỊNH đ/tấn; cũng chứa được đơn giá theo dầu sao chép từ giá có sẵn). Vòng đời NHÁP → Áp dụng như phiên bản giá thường.
- **Áp dụng:** `HOP_DONG.price_code`. Ưu tiên khi tính: dòng giá của mã → giá riêng hợp đồng → giá chung.
- Không đổi: hợp đồng không gán mã, mọi dòng giá cũ, các kỳ đã chốt, màn Đơn giá / Căn cứ giá hợp đồng.

## Bảo đảm "logic cũ giữ nguyên"
| Kiểm | Kết quả |
|---|---|
| 228 test cũ (tính biết trước, kỳ, nhập, trao đổi, sao lưu…) chạy lại | Đạt, không sửa test nào |
| Hợp đồng không gán mã tính ra đúng như trước; mã không có dòng cho tuyến → quay về giá cũ | `tests/pricecode.test.js` |
| Dòng giá của mã không lẫn vào giá chung / giá riêng (danh sách, `_activePrice`, đóng phiên bản cũ, báo cáo căn cứ giá) | `tests/pricecode.test.js` |
| Kho SQLite cũ (chưa có bảng / cột mới) tự bổ sung cấu trúc khi mở, dữ liệu nguyên vẹn (dấu vân tay), ràng buộc duy nhất mới có hiệu lực | `syncSchema`, `tests/pricecode.test.js` |
| Kho JSON cũ (thiếu cột `price_code`) mở bình thường | cột thiếu = rỗng (cơ chế sẵn có) |

## Thêm mới
- API: `pricecodes.list/get/save/setActive/addLine` (`prices.list` nhận `priceCode`); gói **Danh mục** mang `MA_DON_GIA` sang máy khác.
- Giao diện: menu **Mã đơn giá** (cây Đơn vị → Mã → dòng giá; tạo mã, thêm dòng cố định, chọn đơn giá có sẵn, áp dụng, gán / bỏ gán hợp đồng); ô **Mã đơn giá áp dụng** trong Hợp đồng. Đổi mã của hợp đồng → kỳ NHÁP của hợp đồng phải tính lại; kỳ đã xác nhận / khóa giữ nguyên.
- Kiểm tra: mã 2–24 ký tự, trùng, đơn vị có trong danh mục, mã đã đóng, mã thuộc bên thuê / bên vận chuyển của hợp đồng, dòng thuộc mã không gắn riêng hợp đồng, đơn giá cố định > 0.

## Giới hạn
- Dòng giá cố định chỉ cho tuyến tính theo tấn (như đơn giá cố định hiện có).
- Máy nhận gói Danh mục phải là bản 1.5.0 trở lên (gói có bảng mới).
- Chưa kiểm trên Windows thật.
