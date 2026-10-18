-- 004: chốt kỳ — mở rộng khóa dữ liệu phiếu đã chốt (ngày giờ cân, cân lần 1/2, biển số, trạng thái, đợt)
DROP TRIGGER IF EXISTS trg_phieu_locked_no_update;
CREATE TRIGGER trg_phieu_locked_no_update
BEFORE UPDATE OF kl_hang_kg, don_gia, tien_truoc_vat, ty_le_vat, tien_vat, tong_tien, bang_gia_id, don_vi_van_chuyen_id, tuyen_id,
                 ngay_gio_can_1, ngay_gio_can_2, can_lan_1, can_lan_2, bien_so_chuan, trang_thai, dot_van_chuyen_id ON phieu_can
WHEN OLD.chot_ky_id IS NOT NULL AND NEW.chot_ky_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'Phiếu đã chốt — phải MỞ KHÓA kỳ trước khi sửa dữ liệu');
END;
CREATE INDEX IF NOT EXISTS ix_phieu_chot_ky ON phieu_can(chot_ky_id);
INSERT INTO schema_version(version, description) VALUES (4, 'Chốt kỳ: khóa mở rộng + index');
