'use strict';
/**
 * Mã kiểm tra dữ liệu dùng trong Engine (đồng bộ với api_spec.json › issues).
 * level: ERROR = chặn tính / chặn xác nhận; WARNING = hiển thị, xác nhận được; INFO = thông tin.
 * {tham_số} được thay bằng params của từng issue.
 */
const ISSUE = {
  E_ROUTE_MISSING:        ['ERROR', 'Không có mã tuyến (phiếu {ticketNo}, xe {plateNo})'],
  E_ROUTE_NOT_FOUND:      ['ERROR', 'Mã tuyến {routeCode} không tồn tại trong danh mục'],
  E_PRICE_NOT_FOUND:      ['ERROR', 'Tuyến {routeCode}: không có phiên bản đơn giá hiệu lực ngày {date}'],
  E_PRICE_VERSION_SPLIT:  ['ERROR', 'Tuyến {routeCode}: kỳ cắt ngang 2 phiên bản giá ({priceA} → {priceB}) — hãy tách kỳ'],
  E_FUEL_NORM_MISSING:    ['ERROR', 'Tuyến {routeCode}: phiên bản giá {priceId} chưa có định mức dầu'],
  E_FUEL_NORM_INVALID:    ['ERROR', 'Tuyến {routeCode}: định mức dầu phải > 0 (đang là {value})'],
  E_PRICE_NEGATIVE:       ['ERROR', '{what} âm hoặc không hợp lệ ({value})'],
  E_DISTANCE_INVALID:     ['ERROR', 'Tuyến {routeCode}: cự ly chuyến phải > 0 (đang là {value})'],
  E_AVG_LOAD_INVALID:     ['ERROR', 'Tuyến {routeCode}: {what} phải > 0 (đang là {value})'],
  E_NO_FUEL:              ['ERROR', 'Tuyến {routeCode}: kỳ này không có dầu thực nhận trong bảng kê của hợp đồng — nếu đúng là không nhận dầu, bấm "Tính với dầu = 0" (xe tự lo dầu, cộng chênh lệch theo toàn bộ dầu định mức)'],
  E_NO_FUEL_PRICE:        ['ERROR', 'Tuyến {routeCode}: cho phép dầu = 0 cần nhập đơn giá dầu (chưa VAT) để tính chênh lệch'],
  E_TOTAL_KG_ZERO:        ['ERROR', 'Tuyến {routeCode}: tổng khối lượng = 0'],
  E_MULTI_FUEL_GROUP:     ['ERROR', 'Tuyến {routeCode}: dầu đến từ nhiều bên giao / ĐVT ({groups}) — Excel sẽ nhân dòng; hãy tách bảng kê'],
  E_TICKET_USED_IN_PERIOD:['ERROR', 'Phiếu cân này đã được sử dụng trong kỳ tính {periodCode}. Không thể đưa vào kỳ mới.'],
  E_FUEL_USED_IN_PERIOD:  ['ERROR', 'Dòng dầu này đã được sử dụng trong kỳ tính {periodCode}. Không thể đưa vào kỳ mới.'],
  E_NOT_CARRIER:          ['ERROR', 'Đơn vị của bản cài ({installUnit}) không phải bên vận chuyển của hợp đồng {contractCode}'],
  E_CONTRACT_INACTIVE:    ['ERROR', 'Hợp đồng {contractCode} ngừng hoặc hết hiệu lực trong kỳ ({dateFrom} – {dateTo})'],
  E_DATE_INVALID:         ['ERROR', 'Ngày / giờ không hợp lệ: {detail}'],
  E_NO_TICKETS:           ['ERROR', 'Không có phiếu cân nào của hợp đồng trong kỳ'],
  // ── dùng khi import (preview / confirm) ──
  E_FIELD_MISSING:        ['ERROR', 'Dòng {rowNo}: thiếu {field}'],
  E_KG_INVALID:           ['ERROR', 'Dòng {rowNo}: KL hàng không hợp lệ ({value}) — phải là số > 0'],
  E_QTY_INVALID:          ['ERROR', 'Dòng {rowNo}: số lượng dầu không hợp lệ ({value}) — phải là số khác 0 (dòng bù trừ ghi số âm)'],
  E_PLATE_FORMAT:         ['ERROR', 'Dòng {rowNo}: biển số "{value}" sai định dạng (vd 43H-01080)'],
  E_VEHICLE_NOT_FOUND:    ['ERROR', 'Dòng {rowNo}: xe "{value}" chưa có trong danh mục xe — thêm xe trước khi import'],
  E_UNIT_NOT_FOUND:       ['ERROR', 'Dòng {rowNo}: đơn vị "{value}" chưa có trong danh mục đơn vị'],
  E_TICKET_DUPLICATE:     ['ERROR', 'Dòng {rowNo}: phiếu {ticketNo} ngày {date} xe {plateNo} {detail}'],
  W_SAME_FILE_IMPORTED:   ['WARNING', 'File này (cùng nội dung) đã được import ngày {date} (lô {batchId})'],
  W_FUEL_POSSIBLE_DUPLICATE: ['WARNING', 'Dòng dầu {receiptId} ({date}, xe {plateNo}, {qty} lít) nghi nhập trùng — đang TÍNH vào kỳ. Trùng thật: bấm "Bỏ khỏi kỳ"; không trùng: bấm "Không trùng"'],
  W_FUEL_OFFSET:          ['WARNING', 'Dòng {rowNo}: {qty} lít — dòng BÙ TRỪ (số âm): trừ vào dầu thực nhận, không tính vào đơn giá dầu bình quân'],
  I_FUEL_OFFSET:          ['INFO', 'Dòng dầu bù trừ {receiptId} ({date}, xe {plateNo}, {qty} lít) — trừ vào dầu thực nhận, không tính vào đơn giá dầu bình quân'],
  W_FUEL_TOTAL_NONPOSITIVE:['WARNING', 'Tuyến {routeCode}: tổng dầu thực nhận sau bù trừ = {liter} lít (≤ 0) — vẫn tính: CL tiêu hao = định mức − ({liter}) nên đơn giá VC tăng. Kiểm tra lại bảng kê dầu'],
  E_FUEL_OFFSET_NO_PRICE: ['ERROR', 'Tuyến {routeCode}: chỉ có dòng bù trừ (âm) và không dòng nào ghi đơn giá — không xác định được đơn giá dầu. Ghi đơn giá cho dòng bù trừ'],
  I_FUEL_EXCLUDED: ['INFO', 'Đã bỏ dòng dầu {receiptId} ({date}, xe {plateNo}, {qty} lít) khỏi kỳ theo lựa chọn của người dùng'],
  W_POSSIBLE_DUPLICATE:   ['WARNING', 'Dòng {rowNo}: nghi trùng — cùng ngày {date}, xe {plateNo}, {qty} lít với dòng {otherRow}'],
  W_PLATE_FORMAT:         ['WARNING', 'Dòng {rowNo}: mã xe "{value}" viết khác chuẩn — đã quy đổi thành {plateNo}'],
  W_OWNER_MISMATCH:       ['WARNING', 'Dòng {rowNo}: đơn vị VC "{value}" khác chủ xe {plateNo} trong danh mục ({owner})'],
  W_TICKET_LATE:          ['WARNING', 'Phiếu {ticketNo} ngày {date} xe {plateNo} thuộc kỳ {periodCode} {status} — nhập muộn nên CHƯA được tính. Sau khi nhập: vào "Đối chiếu dữ liệu" để đưa vào kỳ'],
  W_TICKET_UPDATE:        ['WARNING', 'Phiếu {ticketNo} đã có — CẬP NHẬT theo file: {changes}{drafts}'],
  W_TICKET_RESTORE:       ['WARNING', 'Phiếu {ticketNo} đã bị xóa trước đây — import lại sẽ KHÔI PHỤC phiếu{changes}'],
  W_TICKET_DESCRIPTIVE_DIFF: ['INFO', 'Dòng {rowNo}: phiếu {ticketNo} đã có — khác ở cột mô tả ({fields}); giữ bản đang có'],
  W_KG_MISMATCH:          ['WARNING', 'Phiếu {ticketNo}: KL hàng {netKg} ≠ |Cân lần 2 − Cân lần 1| ({diffKg})'],
  W_OVERNIGHT:            ['WARNING', '{count} phiếu cân qua đêm (ngày cân 2 ≠ ngày cân 1) — kỳ tính theo Ngày cân 1'],
  W_BEFORE_PERIOD:        ['WARNING', 'Dòng dầu {receiptId} nhận ngày {date}, trước Từ ngày của kỳ (vẫn tính — "tính hết bảng kê")'],
  W_AFTER_PERIOD:         ['WARNING', 'Dòng dầu {receiptId} nhận ngày {date}, sau Đến ngày của kỳ (vẫn tính — "tính hết bảng kê")'],
  W_VEHICLE_NO_FUEL:      ['WARNING', 'Xe {plateNo} có chạy trong kỳ nhưng không có dòng dầu'],
  W_VEHICLE_OUT_OF_CONTRACT:['WARNING', 'Dòng dầu {receiptId}: xe {plateNo} không thuộc phạm vi hợp đồng'],
  W_TICKET_IN_DRAFT_PERIOD:['WARNING', 'Phiếu {ticketNo} đang ở kỳ nháp {periodCode} — chưa đưa vào kỳ này (bật "chuyển từ kỳ nháp" để lấy)'],
  W_FUEL_IN_DRAFT_PERIOD: ['WARNING', 'Dòng dầu {receiptId} đang ở kỳ nháp {periodCode}'],
  I_FUEL_USED_EARLIER:    ['INFO', '{count} dòng dầu nhận trước kỳ đã tính ở {periods} kỳ đã xác nhận (gần nhất {last}) — bỏ qua'],
  W_NEGATIVE_FUEL_DIFF:   ['INFO', 'Tuyến {routeCode}: chênh lệch dầu âm ({value} lít) — xe nhận nhiều hơn định mức, đơn giá bị trừ'],
  W_FLOORED_ZERO:         ['WARNING', 'Tuyến {routeCode}: đơn giá VC âm ({value}) → đưa về 0'],
  W_VEHICLE_PARTIAL_CONTRACT:['WARNING', 'Xe {plateNo}: {count} phiếu ({kg} kg) trong kỳ nằm ngoài thời gian xe thuộc hợp đồng ({range}) — không tính vào hợp đồng này'],
  W_TICKET_NO_CONTRACT:   ['WARNING', '{count} phiếu ({kg} kg) trong kỳ của xe {plates} không thuộc hợp đồng nào mà {unitCode} là bên vận chuyển — chưa được tính ở đâu'],
  E_TICKET_LOCKED:        ['ERROR', 'Phiếu {ticketNo} nằm trong kỳ {periodCode} đã xác nhận/khóa — không sửa được {fields}'],
  E_TICKET_IDENTITY:      ['ERROR', 'Không sửa số phiếu / ngày cân 1 / biển số (định danh phiếu) — xóa mềm rồi nhập lại'],
  E_YEAR_ARCHIVED:        ['ERROR', 'Dòng {rowNo}: ngày {date} thuộc năm đã lưu trữ (đến hết năm {year}) — không nhập được. Muốn nhập: Cài đặt → Dữ liệu & sao lưu → Mở lại năm {year}'],
  E_FIXED_PRICE_HAS_FUEL: ['ERROR', 'Tuyến {routeCode} dùng ĐƠN GIÁ CỐ ĐỊNH ({priceId}) — không nhận dầu, nhưng có {count} dòng dầu ({literText} lít; ngày {dates}). Sửa mã tuyến của dòng dầu, hoặc bấm nút bỏ các dòng dầu này khỏi kỳ'],
  I_FIXED_PRICE:          ['INFO', 'Tuyến {routeCode}: đơn giá cố định {price} đ/tấn ({priceId}) — không tính chênh lệch dầu'],
  W_FUEL_FIXED_ROUTE:     ['WARNING', 'Dòng {rowNo}: tuyến {routeCode} đang dùng ĐƠN GIÁ CỐ ĐỊNH ({priceId}) — tuyến cố định không nhận dầu; nếu nhập, kỳ tính sẽ báo lỗi. Kiểm tra lại mã tuyến'],
  W_OVERRIDE_NO_FUEL:     ['WARNING', 'Tuyến {routeCode}: tính với dầu thực nhận = 0, đơn giá dầu {fuelPrice} đ/lít — lý do: "{reason}"'],
};

function issue(code, params = {}, ref = undefined) {
  const def = ISSUE[code];
  if (!def) throw new Error(`Mã kiểm tra chưa định nghĩa: ${code}`);
  const message = def[1].replace(/\{(\w+)\}/g, (_, k) => (params[k] !== undefined ? String(params[k]) : `{${k}}`));
  const o = { code, level: def[0], message, params };
  if (ref !== undefined) o.ref = ref;
  return o;
}

module.exports = { ISSUE, issue };
