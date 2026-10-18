'use strict';
/**
 * CẤU HÌNH KHAI BÁO cho mọi danh mục (theo skill "quản lý bảng mẹ/bảng con").
 * Dùng chung cho: backend (whitelist cột, validate, đổi tiền ×1000) và giao diện (bảng, form, dropdown).
 * Thêm danh mục mới = thêm 1 mục ở đây, không viết màn hình riêng.
 *
 * field.type: text | number | date | select | textarea
 * field.ref : { table, label }  → dropdown tham chiếu
 * field.money: true            → DB lưu ×1000, giao diện hiển thị đồng
 */
const STATUS = { key: 'trang_thai', label: 'Trạng thái', type: 'select', options: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE', tag: true };
const NOTE = { key: 'ghi_chu', label: 'Ghi chú', type: 'textarea' };

const CATALOGS = {
  don_vi_van_chuyen: {
    label: 'Đơn vị vận chuyển', icon: '🚚', codeField: 'ma', displayField: 'ma',
    fields: [
      { key: 'ma', label: 'Mã', type: 'text', required: true, mono: true },
      { key: 'ten', label: 'Tên', type: 'text', required: true },
      { key: 'ma_so_thue', label: 'Mã số thuế', type: 'text', mono: true },
      { key: 'dia_chi', label: 'Địa chỉ', type: 'text' },
      { key: 'nguoi_lien_he', label: 'Người liên hệ', type: 'text' },
      { key: 'dien_thoai', label: 'Điện thoại', type: 'text' },
      { key: 'nhom_bao_cao', label: 'Nhóm báo cáo', type: 'text', hint: 'Chỉ để xem gộp (VD HAK_GROUP). Hóa đơn luôn theo từng đơn vị.' },
      { key: 'ten_in_bao_cao', label: 'Tên in trên chứng từ', type: 'text', hint: 'Để trống = dùng Tên ở trên', group: 'Thông tin in Bảng kê / biên bản' },
      { key: 'xung_ho', label: 'Xưng hô', type: 'select', options: ['Ông', 'Bà'], group: 'Thông tin in Bảng kê / biên bản' },
      { key: 'dai_dien', label: 'Người đại diện ký', type: 'text', group: 'Thông tin in Bảng kê / biên bản' },
      { key: 'chuc_vu', label: 'Chức danh', type: 'text', hint: 'VD Giám đốc', group: 'Thông tin in Bảng kê / biên bản' },
      { key: 'ke_toan', label: 'Kế toán ký xác nhận', type: 'text', group: 'Thông tin in Bảng kê / biên bản' },
      { key: 'email', label: 'Email', type: 'text', group: 'Thông tin in Bảng kê / biên bản' },
      { key: 'ngan_hang', label: 'Ngân hàng', type: 'text', group: 'Thông tin in Bảng kê / biên bản' },
      { key: 'so_tai_khoan', label: 'Số tài khoản', type: 'text', mono: true, group: 'Thông tin in Bảng kê / biên bản' },
      { key: 'so_hop_dong', label: 'Số hợp đồng', type: 'text', group: 'Thông tin in Bảng kê / biên bản' },
      { key: 'ngay_hop_dong', label: 'Ngày hợp đồng', type: 'date', group: 'Thông tin in Bảng kê / biên bản' },
      { key: 'noi_ky', label: 'Địa danh ghi trên chứng từ', type: 'text', hint: 'VD Quảng Ngãi', group: 'Thông tin in Bảng kê / biên bản' },
      STATUS, NOTE,
    ],
    columns: ['ma', 'ten', 'ma_so_thue', 'dai_dien', 'so_hop_dong', 'nhom_bao_cao', 'dien_thoai', 'trang_thai'],
    children: [],
  },
  hop_dong: {
    label: 'Hợp đồng vận chuyển', icon: '📑', codeField: 'ma', displayField: 'ma',
    fields: [
      { key: 'ma', label: 'Mã hợp đồng', type: 'text', required: true, mono: true, hint: 'VD HD-HAKQN-2026' },
      { key: 'so_hop_dong', label: 'Số hợp đồng', type: 'text', required: true },
      { key: 'ngay_ky', label: 'Ngày ký', type: 'date' },
      { key: 'don_vi_van_chuyen_id', label: 'Bên vận chuyển (Bên B)', type: 'select', ref: { table: 'don_vi_van_chuyen', label: 'ma' }, required: true },
      { key: 'tu_ngay', label: 'Hiệu lực từ', type: 'date', hint: 'Bảng kê chọn hợp đồng theo ngày chứng từ' },
      { key: 'den_ngay', label: 'Hiệu lực đến', type: 'date', hint: 'Để trống = còn hiệu lực' },
      { key: 'noi_ky', label: 'Nơi lập chứng từ', type: 'text', hint: 'Trống = dùng địa danh của đơn vị / Bên A' },
      { key: 'tieu_de_bao_cao', label: 'Tiêu đề Bảng kê', type: 'text', hint: 'Trống = BẢNG KÊ CHI PHÍ VẬN CHUYỂN' },
      { key: 'dien_giai_cuoc', label: 'Mẫu diễn giải cước (viết hóa đơn)', type: 'textarea', hint: 'Chỗ trống: {BKS} {DIEM_DI} {DIEM_DEN} {TUYEN}' },
      STATUS, NOTE,
    ],
    columns: ['ma', 'so_hop_dong', 'ngay_ky', 'don_vi_van_chuyen_id', 'tu_ngay', 'den_ngay', 'noi_ky', 'trang_thai'],
    children: [],
  },
  xe: {
    label: 'Xe', icon: '🚛', codeField: 'bien_so_chuan', displayField: 'bien_so_hien_thi',
    fields: [
      { key: 'bien_so_hien_thi', label: 'Biển số', type: 'text', required: true, mono: true, hint: 'Gõ kiểu nào cũng được: 43H-01021, 43h 01021…' },
      { key: 'don_vi_van_chuyen_id', label: 'Đơn vị vận chuyển (chủ xe)', type: 'select', ref: { table: 'don_vi_van_chuyen', label: 'ma' }, virtual: true,
        hint: 'Xe thuộc đơn vị nào — phiếu cân của xe này sẽ tính cho đơn vị đó. Đổi đơn vị: chọn đơn vị mới + "Áp dụng từ ngày".' },
      { key: 'tu_ngay_don_vi', label: 'Áp dụng từ ngày', type: 'date', virtual: true, hint: 'Để trống nếu là xe mới (từ trước tới nay). Bắt buộc khi đổi sang đơn vị khác.' },
      { key: 'loai_xe', label: 'Loại xe', type: 'text' },
      { key: 'tai_trong', label: 'Tải trọng (tấn)', type: 'number' },
      STATUS, NOTE,
    ],
    columns: ['bien_so_hien_thi', 'don_vi_hien_tai', 'loai_xe', 'tai_trong', 'so_chuyen', 'trang_thai'],
    extraColumns: { don_vi_hien_tai: 'Đơn vị hiện tại', so_chuyen: 'Số chuyến' },
    children: ['xe_don_vi_lich_su'],
  },
  xe_don_vi_lich_su: {
    label: 'Lịch sử đơn vị', icon: '📅', parent: 'xe', parentKey: 'xe_id', versioning: true,
    fields: [
      { key: 'don_vi_van_chuyen_id', label: 'Đơn vị vận chuyển', type: 'select', ref: { table: 'don_vi_van_chuyen', label: 'ma' }, required: true },
      { key: 'tu_ngay', label: 'Từ ngày', type: 'date', hint: 'Để trống = từ trước tới nay' },
      { key: 'den_ngay', label: 'Đến ngày', type: 'date', hint: 'Để trống = còn hiệu lực; thêm dòng mới sẽ tự đóng dòng cũ' },
      NOTE,
    ],
    columns: ['don_vi_van_chuyen_id', 'tu_ngay', 'den_ngay', 'ghi_chu'],
  },
  dia_diem: {
    label: 'Địa điểm', icon: '📍', codeField: 'ma', displayField: 'ten',
    fields: [
      { key: 'ma', label: 'Mã', type: 'text', required: true, mono: true },
      { key: 'ten', label: 'Tên', type: 'text', required: true },
      { key: 'loai', label: 'Loại', type: 'select', options: ['NHA_MAY', 'CANG', 'KHO', 'KHAC'], default: 'NHA_MAY' },
      { key: 'dia_chi', label: 'Địa chỉ', type: 'text' },
      STATUS, NOTE,
    ],
    columns: ['ma', 'ten', 'loai', 'aliases', 'trang_thai'],
    extraColumns: { aliases: 'Tên gọi trong file nguồn' },
    children: ['dia_diem_alias'],
  },
  dia_diem_alias: {
    label: 'Tên gọi khác', icon: '🏷', parent: 'dia_diem', parentKey: 'dia_diem_id',
    fields: [{ key: 'alias', label: 'Tên gọi trong file (VD "NM Đại Hiệp")', type: 'text', required: true }],
    columns: ['alias'],
  },
  tuyen_van_chuyen: {
    label: 'Tuyến', icon: '🛣', codeField: 'ma_tuyen', displayField: 'ma_tuyen',
    fields: [
      { key: 'ma_tuyen', label: 'Mã tuyến', type: 'text', required: true, mono: true },
      { key: 'noi_xuat_id', label: 'Nơi xuất', type: 'select', ref: { table: 'dia_diem', label: 'ten' }, required: true },
      { key: 'noi_den_id', label: 'Nơi đến', type: 'select', ref: { table: 'dia_diem', label: 'ten' }, required: true },
      { key: 'khoang_cach_km', label: 'Khoảng cách tính dầu (km, khứ hồi)', type: 'number' },
      { key: 'mo_ta', label: 'Mô tả', type: 'textarea' },
      STATUS,
    ],
    columns: ['ma_tuyen', 'noi_xuat_id', 'noi_den_id', 'khoang_cach_km', 'mo_ta', 'trang_thai'],
  },
  dot_van_chuyen: {
    label: 'Đợt / Tàu', icon: '🚢', codeField: 'ma_dot', displayField: 'ma_dot',
    fields: [
      { key: 'ma_dot', label: 'Mã đợt', type: 'text', required: true, mono: true },
      { key: 'ten_tau', label: 'Tên tàu', type: 'text' },
      { key: 'voyage', label: 'Voyage', type: 'text' },
      { key: 'tu_ngay', label: 'Từ ngày', type: 'date' },
      { key: 'den_ngay', label: 'Đến ngày', type: 'date' },
      { key: 'khach_hang', label: 'Khách hàng', type: 'text' },
      { key: 'noi_giao_id', label: 'Nơi giao', type: 'select', ref: { table: 'dia_diem', label: 'ten' } },
      { key: 'khoi_luong_giam_dinh', label: 'KL giám định (tấn)', type: 'number' },
      { key: 'trang_thai', label: 'Trạng thái', type: 'select', options: ['MO', 'KHOA'], default: 'MO', tag: true, readonly: true },
      NOTE,
    ],
    columns: ['ma_dot', 'ten_tau', 'voyage', 'tu_ngay', 'den_ngay', 'khoi_luong_giam_dinh', 'so_phieu', 'trang_thai'],
    extraColumns: { so_phieu: 'Số phiếu' },
  },
  bang_gia_van_chuyen: {
    label: 'Bảng giá', icon: '💲', codeField: 'ma_bang_gia', displayField: 'ma_bang_gia',
    fields: [
      { key: 'ma_bang_gia', label: 'Mã bảng giá', type: 'text', required: true, mono: true },
      { key: 'tuyen_id', label: 'Tuyến', type: 'select', ref: { table: 'tuyen_van_chuyen', label: 'ma_tuyen' }, required: true },
      { key: 'don_vi_van_chuyen_id', label: 'Đơn vị VC (trống = mọi đơn vị)', type: 'select', ref: { table: 'don_vi_van_chuyen', label: 'ma' } },
      { key: 'loai_hang', label: 'Loại hàng (trống = mọi loại)', type: 'text' },
      { key: 'tu_ngay', label: 'Từ ngày', type: 'date', required: true },
      { key: 'den_ngay', label: 'Đến ngày', type: 'date' },
      { key: 'phuong_thuc', label: 'Phương thức', type: 'select', options: ['CO_DINH', 'DIEU_CHINH_DAU'], default: 'CO_DINH' },
      { key: 'don_gia_goc', label: 'Đơn giá gốc (đ/tấn)', type: 'number', money: true, required: true },
      { key: 'don_vi_tinh', label: 'Đơn vị tính', type: 'select', options: ['DONG_TAN', 'DONG_CHUYEN'], default: 'DONG_TAN' },
      { key: 'vat_percent', label: 'VAT (%)', type: 'number', required: true },
      { key: 'gia_dau_co_so', label: 'Giá dầu cơ sở (đ/lít)', type: 'number', money: true },
      { key: 'gia_dau_ap_dung', label: 'Giá dầu áp dụng (đ/lít)', type: 'number', money: true, hint: 'Giá dầu bình quân kỳ tham chiếu (bỏ trống nếu giá cố định)' },
      { key: 'dinh_muc_dau', label: 'Định mức dầu (L/100km)', type: 'number' },
      { key: 'khoi_luong_binh_quan', label: 'KL bình quân (tấn/chuyến)', type: 'number' },
      { key: 'khoang_cach_km', label: 'Khoảng cách (km)', type: 'number' },
      { key: 'don_gia_dieu_chinh', label: 'Điều chỉnh (tự tính)', type: 'number', money: true, computed: true },
      { key: 'don_gia_ap_dung', label: 'Đơn giá áp dụng (tự tính)', type: 'number', money: true, computed: true },
      { key: 'trang_thai', label: 'Trạng thái', type: 'select', options: ['NHAP', 'ACTIVE', 'INACTIVE'], default: 'ACTIVE', tag: true },
      NOTE,
    ],
    columns: ['ma_bang_gia', 'tuyen_id', 'don_vi_van_chuyen_id', 'tu_ngay', 'den_ngay', 'phuong_thuc', 'don_gia_ap_dung', 'vat_percent', 'so_phieu', 'trang_thai'],
    extraColumns: { so_phieu: 'Số phiếu dùng' },
  },
  gia_dau: {
    label: 'Giá dầu', icon: '⛽', codeField: null, displayField: 'ngay',
    fields: [
      { key: 'ngay', label: 'Ngày', type: 'date', required: true },
      { key: 'loai_dau', label: 'Loại dầu', type: 'text', required: true, default: 'DO 0,05S-II' },
      { key: 'gia', label: 'Giá (đ/lít)', type: 'number', money: true, required: true },
      { key: 'nguon', label: 'Nguồn', type: 'text' },
      NOTE,
    ],
    columns: ['ngay', 'loai_dau', 'gia', 'nguon', 'ghi_chu'],
  },
};

module.exports = { CATALOGS };
