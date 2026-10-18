# BUSINESS RULES

> Mỗi quy tắc có mã để code/test tham chiếu. Thay đổi nghiệp vụ → sửa file này + CHANGELOG.
> ⚠ = giả định chờ người dùng xác nhận (xem câu hỏi Q1–Q10 trong `PHAN_TICH_THIET_KE_A-H.md`).

## 1. Khối lượng & tiền
| Mã | Quy tắc |
|---|---|
| BR-KL-01 | `kl_hang_tan = kl_hang_kg / 1000` (không làm tròn khi lưu; hiển thị 3 chữ số thập phân). |
| BR-KL-02 | Nếu file có Cân 1, Cân 2: `|Cân2 − Cân1|` phải = KL hàng (dung sai 0,5 kg), nếu không → lỗi `INVALID_WEIGHT`. Nếu thiếu KL hàng → lấy `|Cân2 − Cân1|`. |
| BR-KL-03 | KL ≤ 0 hoặc không đọc được → `INVALID_WEIGHT`, không tính tiền. |
| BR-MONEY-01 | Đơn vị tính `DONG_TAN`: Thành tiền = KL tấn × Đơn giá. `DONG_CHUYEN`: Thành tiền = Đơn giá (1 phiếu = 1 chuyến). |
| BR-MONEY-02 | VAT = Thành tiền × `vat_percent` **của bảng giá áp dụng**. Không có VAT% → `NO_VAT_RATE`, không tính. Không có mặc định 8% trong code. |
| BR-MONEY-03 | Tổng tiền = Thành tiền + VAT. |
| BR-MONEY-04 | Tiền chỉ tính bằng Decimal trong `TransportCostEngine`; lưu DB dạng INTEGER × 1000. |

## 2. Làm tròn
| Mã | Quy tắc |
|---|---|
| BR-ROUND-01 | ✅ **Làm tròn theo BẢNG KÊ** (người dùng xác nhận 06/10/2026). 1 bảng kê = 1 đơn vị VC × 1 đợt/kỳ. Mỗi dòng giá (tuyến × đơn giá × VAT%): Thành tiền = ROUND(Σ tấn × đơn giá, 0). VAT = ROUND(Σ thành tiền cùng thuế suất × VAT%, 0) — tính 1 lần trên bảng kê. Tổng = Σ thành tiền + VAT. Tiền từng phiếu / từng xe chỉ là chi tiết tham khảo (không làm tròn). Chế độ `GROUP` (Excel-compat) chỉ dùng để kiểm chứng với file Excel cũ. |
| BR-ROUND-02 | Quy tắc riêng cho đơn giá / thành tiền / VAT / tổng: `{digits, mode}`; digits âm được (−2 = trăm đồng); mode `HALF_UP` (= Excel ROUND), `DOWN`, `UP`; `null` = không làm tròn. |
| BR-ROUND-03 | Kiểm chứng đợt V.47: tổng 4 bảng kê = 5.512.904.418 đ, Excel (không làm tròn) = 5.512.904.418,24 đ → chênh −0,24 đ, chỉ do làm tròn. |

## 3. Xe & đơn vị vận chuyển
| Mã | Quy tắc |
|---|---|
| BR-XE-01 | Biển số chuẩn = chữ HOA + số, bỏ mọi ký tự khác (`43H-01021`, `43h 010.21` → `43H01021`). Luôn giữ `bien_so_goc`. Không bao giờ ép kiểu số. |
| BR-XE-02 | Đơn vị VC của phiếu = đơn vị của xe **tại ngày cân** theo `xe_don_vi_lich_su`. |
| BR-XE-03 | Xe không có trong danh mục → `UNKNOWN_VEHICLE` ("XE CHƯA XÁC ĐỊNH"); có xe nhưng không có đơn vị hiệu lực ngày đó → `UNKNOWN_CARRIER`; >1 đơn vị cùng hiệu lực → `AMBIGUOUS_VEHICLE`. Không tự gán. |
| BR-XE-04 | Cột "công ty vận chuyển" trong file phiếu cân chỉ lưu vào `cong_ty_vc_nguon` để đối chiếu; nếu khác đơn vị theo danh mục → cảnh báo, không tự sửa. |
| BR-XE-05 | Gán xe vào đơn vị → tự tính lại phiếu liên quan **chưa chốt**; ghi audit. |
| BR-XE-06 | ✅ **Hóa đơn xuất riêng từng đơn vị** (HHH, HAK, QC, ĐH) → bảng kê, đối chiếu, chốt theo từng đơn vị. `nhom_bao_cao` (VD `HAK_GROUP`) chỉ để xem gộp như sheet Excel "Xe chạy QS (HAK)", không dùng để lập hóa đơn. |

## 4. Địa điểm, tuyến
| Mã | Quy tắc |
|---|---|
| BR-TUYEN-01 | "Nơi xuất" trong file được khớp với `dia_diem` qua bảng alias (so sánh không dấu, không phân biệt hoa thường). Không khớp → `UNKNOWN_LOCATION`. |
| BR-TUYEN-02 | Nơi đến lấy từ file nếu có cột; nếu không → nơi giao của Đợt/Tàu; nếu không → mặc định trong Cài đặt. ⚠ Q4 (Cảng Tiên Sa). |
| BR-TUYEN-03 | Tuyến = (nơi xuất, nơi đến) ACTIVE duy nhất. |
| BR-TUYEN-04 | ✅ Quế Sơn → Cảng Tiên Sa: Quế Sơn cách NM Quế Cường 18 km và xa cảng hơn → (55 + 18) × 2 = **146 km** khứ hồi. Bảng giá QS suy ngược từ 206.500: cước cơ sở **173.000**, giá dầu cơ sở **19.200** từ 07/11/2025, 35 L/100 km, 19 tấn/chuyến → 173.000 + 33.500 = 206.500. |

## 5. Bảng giá
| Mã | Quy tắc |
|---|---|
| BR-PRICE-01 | Bảng giá bắt buộc `tu_ngay`; `den_ngay` NULL = còn hiệu lực. Chỉ dùng bảng giá `ACTIVE`. |
| BR-PRICE-02 | Ngày tra giá = ngày của **Ngày giờ cân 1**. ⚠ Q6 |
| BR-PRICE-03 | Ứng viên = cùng tuyến, (đơn vị = đơn vị xe hoặc NULL), (loại hàng = loại hàng phiếu hoặc NULL), ngày ∈ [tu_ngay, den_ngay]. |
| BR-PRICE-04 | Ưu tiên xác định: đúng đơn vị (+2) > chung; đúng loại hàng (+1) > chung. Ở mức điểm cao nhất còn >1 → `MULTIPLE_PRICE` ("XUNG ĐỘT BẢNG GIÁ"), không tự chọn. Không có → `NO_PRICE` ("CHƯA CÓ ĐƠN GIÁ"). |
| BR-PRICE-05 | Mỗi phiếu lưu `bang_gia_id` (price_rule_id). |
| BR-PRICE-06 | Không sửa đơn giá của bảng giá đã có phiếu dùng; muốn đổi → tạo bảng giá mới từ ngày X (hệ thống đề xuất đóng `den_ngay` của bảng cũ = X − 1). |
| BR-PRICE-07 | Khi lưu bảng giá: cảnh báo nếu chồng lấn hiệu lực với bảng giá cùng (tuyến, đơn vị, loại hàng). |

## 6. Giá dầu
| Mã | Quy tắc |
|---|---|
| BR-FUEL-01 | Giá dầu nhập theo ngày + loại dầu; sửa giá đã nhập → audit log (giá cũ/mới). |
| BR-FUEL-02 | Kỳ điều chỉnh: giá dầu kỳ = bình quân giản đơn các ngày trong [từ ngày, đến ngày tham chiếu] (= Excel AVERAGE). ⚠ Q8 |
| BR-FUEL-03 | Lượng dầu/chuyến = km × định mức/100; CP chênh/chuyến = lượng dầu × (giá kỳ − giá cơ sở); Điều chỉnh/tấn = ROUND(CP chênh / tấn BQ, 0); Điều chỉnh cuối = ROUND(…, −2); Đơn giá = cước cơ sở + điều chỉnh cuối. Các mức làm tròn là tham số. |
| BR-FUEL-04 | Duyệt kỳ → sinh **bảng giá mới** cho từng tuyến có phương thức `DIEU_CHINH_DAU`, hiệu lực từ `ngay_ap_dung`; không đổi giá của phiếu đã chốt. |
| BR-FUEL-05 | Giá dầu giảm → điều chỉnh âm (giá giảm), cùng công thức. |

## 7. Chống trùng
| Mã | Quy tắc |
|---|---|
| BR-DUP-01 | Khóa nghiệp vụ mặc định: `Số phiếu + Nơi xuất` (số phiếu đánh riêng theo trạm — file mẫu: QS 1387–1908, ĐH 5315–6971). Tùy chọn khóa mạnh: Số phiếu + Biển số chuẩn + Ngày giờ cân 1 + Nơi xuất. |
| BR-DUP-02 | Fingerprint = SHA-256 các trường đã chuẩn hóa. |
| BR-DUP-03 | Phân loại: `NEW`, `EXACT_DUPLICATE` (bỏ qua), `KEY_CONFLICT` (cùng khóa, khác KL/biển số/thời gian/nơi xuất/cân → màn hình "Cần kiểm tra": Giữ cũ / Cập nhật mới / Bỏ qua — không tự ghi đè), `IN_FILE_DUPLICATE`. |
| BR-DUP-04 | Không tự xóa phiếu trùng. |

## 8. Đợt / Tàu & Chốt
| Mã | Quy tắc |
|---|---|
| BR-DOT-01 | Phiếu được gán đợt khi import (người dùng chọn) hoặc chuyển đợt sau (audit). |
| BR-DOT-02 | Khóa đợt / chốt kỳ → snapshot (KL, đơn giá, VAT, tiền, bảng giá, đơn vị, tuyến) vào `chot_ky_snapshot`; phiếu có `chot_ky_id`. |
| BR-DOT-03 | Phiếu đã chốt: engine trả snapshot, không tính lại; DB trigger chặn sửa cột tài chính. |
| BR-DOT-04 | Mở khóa: bắt buộc lý do → audit → sửa → tính lại → chốt lại (snapshot mới; snapshot cũ giữ lại). |
| BR-DOT-05 | ✅ **Xe trả về VẪN TÍNH CƯỚC** (trả về vẫn vận chuyển, vẫn tốn dầu). Cờ `xe_tra_ve` chỉ để báo cáo KL xuống tàu = KL xuống cảng − KL trả về. |
| BR-DOT-06 | ⚠ Q10: KL giám định lưu ở đợt; báo cáo chênh KL giám định − KL xuống tàu; không ảnh hưởng cước. |

## 9. Cảnh báo thời gian (chỉ cảnh báo, không kết luận)
| Mã | Quy tắc |
|---|---|
| BR-TIME-01 | Thời gian cân = Cân 2 − Cân 1; âm → `INVALID_TIME`; > ngưỡng (mặc định 240 phút) → `TIME_ANOMALY/LONG_WEIGH_DURATION`. |
| BR-TIME-02 | Khoảng cách chuyến = Cân 1 chuyến này − Cân 2 chuyến trước (cùng xe); < ngưỡng (mặc định 30 phút) → `SHORT_GAP`; âm → `OVERLAP_PREVIOUS_TRIP`. |
| BR-TIME-03 | Cân 1 > Cân 2 (cân có hàng trước) → `REVERSE_WEIGHING`. |
| BR-TIME-04 | Ngưỡng cấu hình trong Cài đặt. |

## 10. Cảnh báo — mức độ mặc định
| Loại | Mức | Cách xử lý gợi ý |
|---|---|---|
| DUPLICATE_TICKET | CAO | Xem màn hình Cần kiểm tra, chọn Giữ/Cập nhật/Bỏ qua |
| UNKNOWN_VEHICLE / UNKNOWN_CARRIER | CAO | Thêm xe/gán đơn vị trong Danh mục xe |
| UNKNOWN_LOCATION | CAO | Thêm địa điểm hoặc alias |
| NO_PRICE / MULTIPLE_PRICE | CAO | Thêm/sửa hiệu lực bảng giá |
| INVALID_WEIGHT / INVALID_TIME | CAO | Sửa phiếu (có log) hoặc loại |
| TIME_ANOMALY | TRUNG_BINH | Kiểm tra với trạm cân |
| PRICE_CHANGED | THAP | Thông tin: phiếu được tính lại theo giá mới |
| UNMATCHED_RECONCILIATION | TRUNG_BINH | Xem kết quả đối chiếu |
