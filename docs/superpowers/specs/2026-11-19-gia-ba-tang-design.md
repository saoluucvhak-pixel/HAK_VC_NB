# Thiết kế: quy trình giá 3 tầng (Hình thức giá → Mã đơn giá → Dòng giá theo tuyến)

Trạng thái: CHỜ NGƯỜI DÙNG DUYỆT. Thông tin người dùng đưa là tham khảo; người xây tự quyết bố cục.

## Ý định
Đơn vị cung cấp vận chuyển cần quy trình giá rõ ràng, một thông tin nhập một nơi, không ảnh hưởng cách tính giá đang chạy.

## Quy trình (người dùng chốt)
1. **Danh mục tuyến**: Ngày cập nhật · Mã tuyến · Tên tuyến · Cự ly (+ĐVT, điểm đi/đến như hiện có).
2. **Hình thức đơn giá** (hệ thống, 2 giá trị): Đơn giá cố định / Đơn giá theo giá dầu.
3. **Mã đơn giá** (con của hình thức; thuộc công ty đối tác), mỗi dòng là một tuyến:
   - Cố định: Mã tuyến, Tên tuyến, Cự ly (hiển thị), **Đơn giá cố định**.
   - Theo giá dầu: Mã tuyến, Tên tuyến, Cự ly (hiển thị), **Đơn giá ký hợp đồng**, giá dầu, định mức tiêu hao, tải trọng… như app đang tính.
4. **Hợp đồng vận chuyển**: đối tác, **một mã đơn giá** (hình thức suy ra từ mã), danh sách tuyến lấy từ mã (nhiều tuyến), xe, hiệu lực.
5. **Giao nhận dầu diezel** (bảng con của hợp đồng) — chỉ khi có tuyến theo giá dầu.
6. **Bảng tính đơn giá theo giá dầu** — màn Tính giá hiện có.

## Quyết định thiết kế (đề xuất của người xây — chờ duyệt)
- Thuật ngữ: **"Đơn giá ký hợp đồng"** (ĐG ký HĐ), không gọi "đơn giá hợp đồng". Đổi nhãn giao diện, không đổi tên cột dữ liệu, không đổi mẫu in BKVC.
- **Cự ly lưu một chỗ ở tuyến** (bộ tính giá đang đọc từ tuyến); dòng giá chỉ hiển thị. Không cho nhập cự ly thứ hai.
- **Định mức/hệ số nằm ở dòng giá theo giá dầu** (như app đang tính). Không chuyển định mức sang tuyến.
- Hình thức lưu ở mã (`MA_DON_GIA.price_method`, mặc định CO_DINH cho mã 1.5.0); dòng thừa hưởng; không đổi hình thức khi mã đã có dòng.
- **Mã tuyến tự gợi ý** (kế tiếp, vd VC.0xx) nhưng sửa được trước khi lưu, cảnh báo trùng; mã cũ giữ nguyên; vẫn nhắc "sửa giống ở các nhà máy còn lại" (mã trùng giữa máy là rủi ro, và file phiếu cân/dầu mang sẵn mã tuyến).
- **Ngày cập nhật**: mặc định lấy ngày hệ thống, người dùng được điền tay. Với dòng giá, đây là **ngày hiệu lực**: với cùng tuyến trong cùng mã, bản có ngày cập nhật **mới nhất (không sau ngày tính)** có hiệu lực; bản cũ tự đóng. Không cho điền lùi ngày vào khoảng đã có kỳ xác nhận/khóa (chốt chặn). Với danh mục tuyến, ngày là ngày chỉnh sửa gần nhất để theo dõi (không phân phiên bản tuyến).
- Hợp đồng hiển thị từng tuyến kèm nguồn giá: "theo mã DG-xxx (cố định/theo giá dầu)" hoặc "dùng giá chung (cách cũ)". Tuyến ngoài mã vẫn dùng giá chung như cũ.
- Giữ chốt chặn: dầu nhập cho tuyến cố định, thiếu định mức, giá âm, cự ly không hợp lệ — đưa cảnh báo lên sớm khi tạo dòng.
- Gói trao đổi: mã đơn giá có thêm cột → các nhà máy nâng cấp cùng đợt (ghi trong ghi chú phát hành).
- Bảo vệ tính giá: không đổi `main/engine`; kỳ đã xác nhận/khóa giữ số; dòng giá đã dùng không sửa trực tiếp (tạo phiên bản mới); test golden trước/sau phải bằng từng đồng; mã theo giá dầu phải ra đúng số như tuyến giá dầu thường cùng dữ liệu.
- Giá chung / giá riêng hợp đồng (cách cũ) giữ nguyên, gắn nhãn "cách cũ"; không tự chuyển dữ liệu cũ sang mã (làm riêng nếu người dùng muốn).

## Làm theo 2 đợt (mỗi đợt chạy đủ JSON + SQLite + Electron)
- Đợt 1: màn Hình thức → Mã → Dòng; cột hình thức; ngày cập nhật/hiệu lực; nhãn thuật ngữ.
- Đợt 2: mã tuyến gợi ý; màn Hợp đồng liệt kê tuyến + nguồn giá; sắp lại thứ tự Giao nhận dầu → Tính giá.

## Không làm
Sửa công thức; thêm/xóa hình thức giá; tự chuyển giá cũ; đổi mẫu in.
