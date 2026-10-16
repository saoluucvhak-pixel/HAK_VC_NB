-- schema_sqlite.sql — sinh tự động từ schema.py. File dữ liệu desktop: dgvc.sqlite
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- Danh mục: Đơn vị / công ty (bên thuê, bên vận chuyển, chủ xe, bên giao dầu)
CREATE TABLE don_vi (
  unit_code TEXT NOT NULL,
  unit_name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  unit_type TEXT NOT NULL CHECK (unit_type IN ('CONG_TY', 'CHI_NHANH')),
  name_aliases TEXT,
  tax_code TEXT,
  address TEXT,
  legal_rep_name TEXT,
  legal_rep_salutation TEXT CHECK (legal_rep_salutation IS NULL OR (legal_rep_salutation IN ('Ông', 'Bà'))),
  legal_rep_title TEXT,
  factory_name TEXT,
  email TEXT,
  phone TEXT,
  doc_display_name TEXT,
  sign_priority INTEGER NOT NULL,
  accountant_name TEXT,
  fuel_prefix TEXT,
  is_active INTEGER NOT NULL CHECK (is_active IN (0,1)),
  note TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT,
  updated_by TEXT,
  row_version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (unit_code)
) STRICT;

-- Danh mục: Xe vận chuyển
CREATE TABLE xe (
  plate_no TEXT NOT NULL,
  plate_key TEXT NOT NULL,
  owner_unit_code TEXT NOT NULL,
  fuel_code TEXT,
  is_active INTEGER NOT NULL CHECK (is_active IN (0,1)),
  note TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT,
  updated_by TEXT,
  row_version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (plate_no),
  UNIQUE (plate_key),
  FOREIGN KEY (owner_unit_code) REFERENCES don_vi (unit_code)
) STRICT;

-- Danh mục: Tuyến vận chuyển (phần định danh của TBL_DATA)
CREATE TABLE tuyen_vc (
  route_code TEXT NOT NULL,
  route_name TEXT NOT NULL,
  distance_km REAL NOT NULL,
  trip_distance_km REAL NOT NULL,
  uom TEXT NOT NULL CHECK (uom IN ('TAN', 'M3')),
  catalog_unit_code TEXT,
  is_active INTEGER NOT NULL CHECK (is_active IN (0,1)),
  note TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT,
  updated_by TEXT,
  row_version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (route_code),
  FOREIGN KEY (catalog_unit_code) REFERENCES don_vi (unit_code)
) STRICT;

-- Danh mục: Phiên bản đơn giá theo tuyến (phần giá của TBL_DATA) — không ghi đè
CREATE TABLE price_history (
  price_id TEXT NOT NULL,
  route_code TEXT NOT NULL,
  contract_id TEXT,
  version_no INTEGER NOT NULL,
  effective_from TEXT NOT NULL CHECK (effective_from GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  effective_to TEXT CHECK (effective_to IS NULL OR (effective_to GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')),
  base_price_excl_vat REAL NOT NULL,
  price_per_km REAL,
  new_price REAL NOT NULL,
  fuel_price_excl_vat REAL NOT NULL,
  fuel_norm_l_per_km REAL NOT NULL,
  avg_load_ton REAL NOT NULL,
  avg_volume_m3 REAL,
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'ACTIVE', 'CLOSED')),
  is_used INTEGER NOT NULL CHECK (is_used IN (0,1)),
  source_note TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT,
  updated_by TEXT,
  row_version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (price_id),
  UNIQUE (route_code, contract_id, effective_from),
  FOREIGN KEY (route_code) REFERENCES tuyen_vc (route_code),
  FOREIGN KEY (contract_id) REFERENCES hop_dong (contract_id)
) STRICT;

-- Danh mục: Hợp đồng vận chuyển 2 bên (bên vận chuyển lập tính toán)
CREATE TABLE hop_dong (
  contract_id TEXT NOT NULL,
  contract_code TEXT NOT NULL,
  contract_no TEXT,
  customer_unit_code TEXT NOT NULL,
  carrier_unit_code TEXT NOT NULL,
  effective_from TEXT NOT NULL CHECK (effective_from GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  effective_to TEXT CHECK (effective_to IS NULL OR (effective_to GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')),
  report_title TEXT,
  service_desc TEXT,
  sign_place TEXT,
  customer_signers_json TEXT CHECK (customer_signers_json IS NULL OR (json_valid(customer_signers_json))),
  carrier_signers_json TEXT CHECK (carrier_signers_json IS NULL OR (json_valid(carrier_signers_json))),
  is_active INTEGER NOT NULL CHECK (is_active IN (0,1)),
  note TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT,
  updated_by TEXT,
  row_version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (contract_id),
  UNIQUE (contract_code),
  FOREIGN KEY (customer_unit_code) REFERENCES don_vi (unit_code),
  FOREIGN KEY (carrier_unit_code) REFERENCES don_vi (unit_code)
) STRICT;

-- Danh mục: Phạm vi xe của hợp đồng
CREATE TABLE hop_dong_xe (
  id TEXT NOT NULL,
  contract_id TEXT NOT NULL,
  plate_no TEXT NOT NULL,
  effective_from TEXT NOT NULL CHECK (effective_from GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  effective_to TEXT CHECK (effective_to IS NULL OR (effective_to GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')),
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT,
  updated_by TEXT,
  row_version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE (contract_id, plate_no, effective_from),
  FOREIGN KEY (contract_id) REFERENCES hop_dong (contract_id),
  FOREIGN KEY (plate_no) REFERENCES xe (plate_no)
) STRICT;

-- Đầu vào: Phiếu cân — 1 dòng = 1 chuyến; dùng chung cho mọi hợp đồng
CREATE TABLE phieu_can (
  ticket_id TEXT NOT NULL,
  ticket_key TEXT NOT NULL,
  ticket_no TEXT NOT NULL,
  row_no TEXT,
  weigh1_date TEXT NOT NULL CHECK (weigh1_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  weigh1_time TEXT CHECK (weigh1_time IS NULL OR (weigh1_time GLOB '[0-2][0-9]:[0-5][0-9]:[0-5][0-9]')),
  weigh2_date TEXT NOT NULL CHECK (weigh2_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  weigh2_time TEXT CHECK (weigh2_time IS NULL OR (weigh2_time GLOB '[0-2][0-9]:[0-5][0-9]:[0-5][0-9]')),
  plate_no TEXT NOT NULL,
  weight1_kg REAL,
  weight2_kg REAL,
  net_kg REAL NOT NULL,
  origin TEXT,
  customer TEXT,
  ldd TEXT,
  weigh_type TEXT,
  route_code TEXT NOT NULL,
  transport_unit_name TEXT,
  owner_unit_code TEXT,
  validation_flags TEXT,
  flags_ack INTEGER CHECK (flags_ack IS NULL OR (flags_ack IN (0,1))),
  flags_ack_note TEXT,
  import_batch_id TEXT,
  raw_row_json TEXT CHECK (raw_row_json IS NULL OR (json_valid(raw_row_json))),
  is_deleted INTEGER NOT NULL CHECK (is_deleted IN (0,1)),
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT,
  updated_by TEXT,
  row_version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (ticket_id),
  UNIQUE (ticket_key),
  FOREIGN KEY (plate_no) REFERENCES xe (plate_no),
  FOREIGN KEY (route_code) REFERENCES tuyen_vc (route_code),
  FOREIGN KEY (owner_unit_code) REFERENCES don_vi (unit_code),
  FOREIGN KEY (import_batch_id) REFERENCES import_batch (batch_id)
) STRICT;

-- Đầu vào: Bảng kê giao nhận dầu — mỗi dòng thuộc bảng kê của 1 hợp đồng
CREATE TABLE giao_nhan_dau (
  receipt_id TEXT NOT NULL,
  contract_id TEXT NOT NULL,
  receive_date TEXT NOT NULL CHECK (receive_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  route_code TEXT NOT NULL,
  fuel_vehicle_code TEXT NOT NULL,
  plate_no TEXT,
  owner_unit_code TEXT,
  uom TEXT NOT NULL,
  qty_liter REAL NOT NULL,
  fuel_price_excl_vat REAL NOT NULL,
  purchase_date TEXT CHECK (purchase_date IS NULL OR (purchase_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')),
  giver_unit_code TEXT NOT NULL,
  validation_flags TEXT,
  flags_ack INTEGER CHECK (flags_ack IS NULL OR (flags_ack IN (0,1))),
  flags_ack_note TEXT,
  import_batch_id TEXT,
  raw_row_json TEXT CHECK (raw_row_json IS NULL OR (json_valid(raw_row_json))),
  is_deleted INTEGER NOT NULL CHECK (is_deleted IN (0,1)),
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT,
  updated_by TEXT,
  row_version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (receipt_id),
  FOREIGN KEY (contract_id) REFERENCES hop_dong (contract_id),
  FOREIGN KEY (plate_no) REFERENCES xe (plate_no),
  FOREIGN KEY (route_code) REFERENCES tuyen_vc (route_code),
  FOREIGN KEY (owner_unit_code) REFERENCES don_vi (unit_code),
  FOREIGN KEY (giver_unit_code) REFERENCES don_vi (unit_code),
  FOREIGN KEY (import_batch_id) REFERENCES import_batch (batch_id)
) STRICT;

-- Đầu vào: Lô import (preview → xác nhận)
CREATE TABLE import_batch (
  batch_id TEXT NOT NULL,
  import_type TEXT NOT NULL CHECK (import_type IN ('PHIEU_CAN', 'GIAO_NHAN_DAU', 'PRICE')),
  contract_id TEXT,
  file_name TEXT NOT NULL,
  sheet_name TEXT,
  header_json TEXT CHECK (header_json IS NULL OR (json_valid(header_json))),
  mapping_json TEXT CHECK (mapping_json IS NULL OR (json_valid(mapping_json))),
  total_rows INTEGER NOT NULL,
  ok_rows INTEGER NOT NULL,
  warning_rows INTEGER NOT NULL,
  error_rows INTEGER NOT NULL,
  duplicate_rows INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PREVIEW', 'CONFIRMED', 'CANCELLED')),
  confirmed_at TEXT,
  confirmed_by TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT,
  updated_by TEXT,
  row_version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (batch_id),
  FOREIGN KEY (contract_id) REFERENCES hop_dong (contract_id)
) STRICT;

-- Kết quả: Kỳ tính của 1 hợp đồng
CREATE TABLE ky_tinh (
  period_id TEXT NOT NULL,
  period_code TEXT NOT NULL,
  contract_id TEXT NOT NULL,
  date_from TEXT NOT NULL CHECK (date_from GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  date_to TEXT NOT NULL CHECK (date_to GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  route_filter TEXT,
  status TEXT NOT NULL CHECK (status IN ('NHAP', 'DA_XAC_NHAN', 'DA_KHOA', 'HUY')),
  calc_version INTEGER NOT NULL,
  current_run_id TEXT,
  config_snapshot_json TEXT CHECK (config_snapshot_json IS NULL OR (json_valid(config_snapshot_json))),
  needs_recalc INTEGER NOT NULL CHECK (needs_recalc IN (0,1)),
  report_date TEXT CHECK (report_date IS NULL OR (report_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')),
  calculated_at TEXT,
  calculated_by TEXT,
  confirmed_at TEXT,
  confirmed_by TEXT,
  locked_at TEXT,
  locked_by TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT,
  updated_by TEXT,
  row_version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (period_id),
  UNIQUE (period_code),
  FOREIGN KEY (contract_id) REFERENCES hop_dong (contract_id)
) STRICT;

-- Kết quả: Kết quả tính 1 tuyến trong 1 kỳ (thay QR_DGVC4) — lưu cả số trung gian + snapshot
CREATE TABLE transport_calculation (
  calc_id TEXT NOT NULL,
  period_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  calc_version INTEGER NOT NULL,
  is_current INTEGER NOT NULL CHECK (is_current IN (0,1)),
  contract_id TEXT NOT NULL,
  route_code TEXT NOT NULL,
  route_name TEXT NOT NULL,
  uom TEXT NOT NULL,
  price_id TEXT NOT NULL,
  trip_distance_km REAL NOT NULL,
  new_price REAL NOT NULL,
  avg_load_ton REAL NOT NULL,
  avg_volume_m3 REAL,
  fuel_price_catalog REAL NOT NULL,
  fuel_norm_l_per_km REAL NOT NULL,
  start_date TEXT NOT NULL CHECK (start_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  end_date TEXT NOT NULL CHECK (end_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  trip_count INTEGER NOT NULL,
  total_kg REAL NOT NULL,
  total_ton REAL NOT NULL,
  fuel_giver_unit TEXT,
  fuel_uom TEXT,
  fuel_line_count INTEGER NOT NULL,
  actual_fuel_liter REAL,
  fuel_start_date TEXT CHECK (fuel_start_date IS NULL OR (fuel_start_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')),
  fuel_end_date TEXT CHECK (fuel_end_date IS NULL OR (fuel_end_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')),
  fuel_price REAL,
  fuel_import_date TEXT CHECK (fuel_import_date IS NULL OR (fuel_import_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')),
  trip_price REAL NOT NULL,
  fuel_per_trip REAL NOT NULL,
  fuel_cost_per_trip REAL NOT NULL,
  fuel_cost_ratio REAL NOT NULL,
  price_no_diesel REAL NOT NULL,
  contract_price REAL NOT NULL,
  standard_fuel_liter REAL NOT NULL,
  fuel_diff_liter REAL,
  fuel_adjust_price REAL,
  transport_price_raw REAL,
  transport_price REAL,
  result_status TEXT NOT NULL CHECK (result_status IN ('OK', 'WARNING', 'ERROR')),
  warnings_json TEXT CHECK (warnings_json IS NULL OR (json_valid(warnings_json))),
  trace_json TEXT NOT NULL CHECK (json_valid(trace_json)),
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  PRIMARY KEY (calc_id),
  FOREIGN KEY (period_id) REFERENCES ky_tinh (period_id),
  FOREIGN KEY (contract_id) REFERENCES hop_dong (contract_id),
  FOREIGN KEY (route_code) REFERENCES tuyen_vc (route_code),
  FOREIGN KEY (price_id) REFERENCES price_history (price_id)
) STRICT;

-- Kết quả: Phiếu cân cấu thành 1 kết quả; cũng là bảng chống tính trùng theo hợp đồng
CREATE TABLE transport_detail (
  id TEXT NOT NULL,
  calc_id TEXT NOT NULL,
  period_id TEXT NOT NULL,
  contract_id TEXT NOT NULL,
  ticket_id TEXT NOT NULL,
  ticket_key TEXT NOT NULL,
  plate_no TEXT NOT NULL,
  weigh1_date TEXT NOT NULL CHECK (weigh1_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  net_kg REAL NOT NULL,
  is_current INTEGER NOT NULL CHECK (is_current IN (0,1)),
  usage_state TEXT NOT NULL CHECK (usage_state IN ('DRAFT', 'CONFIRMED', 'LOCKED', 'RELEASED')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (id),
  FOREIGN KEY (calc_id) REFERENCES transport_calculation (calc_id),
  FOREIGN KEY (period_id) REFERENCES ky_tinh (period_id),
  FOREIGN KEY (ticket_id) REFERENCES phieu_can (ticket_id)
) STRICT;
CREATE UNIQUE INDEX ux_transport_detail_usage ON transport_detail (contract_id, ticket_id) WHERE is_current = 1 AND usage_state IN ('CONFIRMED','LOCKED');  -- chống tính trùng trong cùng hợp đồng

-- Kết quả: Dòng dầu cấu thành 1 kết quả
CREATE TABLE fuel_detail (
  id TEXT NOT NULL,
  calc_id TEXT NOT NULL,
  period_id TEXT NOT NULL,
  contract_id TEXT NOT NULL,
  receipt_id TEXT NOT NULL,
  qty_liter REAL NOT NULL,
  fuel_price_excl_vat REAL NOT NULL,
  is_current INTEGER NOT NULL CHECK (is_current IN (0,1)),
  usage_state TEXT NOT NULL CHECK (usage_state IN ('DRAFT', 'CONFIRMED', 'LOCKED', 'RELEASED')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (id),
  FOREIGN KEY (calc_id) REFERENCES transport_calculation (calc_id),
  FOREIGN KEY (period_id) REFERENCES ky_tinh (period_id),
  FOREIGN KEY (receipt_id) REFERENCES giao_nhan_dau (receipt_id)
) STRICT;
CREATE UNIQUE INDEX ux_fuel_detail_usage ON fuel_detail (contract_id, receipt_id) WHERE is_current = 1 AND usage_state IN ('CONFIRMED','LOCKED');  -- chống tính trùng trong cùng hợp đồng

-- Kết quả: Dòng bảng xác nhận khối lượng (1 dòng / xe / tuyến)
CREATE TABLE bkvc_line (
  id TEXT NOT NULL,
  period_id TEXT NOT NULL,
  calc_id TEXT NOT NULL,
  contract_id TEXT NOT NULL,
  route_code TEXT NOT NULL,
  seq INTEGER NOT NULL,
  plate_no TEXT NOT NULL,
  owner_unit_code TEXT,
  trip_count INTEGER NOT NULL,
  kg REAL NOT NULL,
  ton REAL NOT NULL,
  unit_price REAL NOT NULL,
  amount REAL NOT NULL,
  vat_rate REAL NOT NULL,
  vat REAL NOT NULL,
  amount_incl_vat REAL NOT NULL,
  note TEXT,
  is_current INTEGER NOT NULL CHECK (is_current IN (0,1)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (id),
  FOREIGN KEY (period_id) REFERENCES ky_tinh (period_id),
  FOREIGN KEY (calc_id) REFERENCES transport_calculation (calc_id)
) STRICT;

-- Kết quả: Mỗi lần chạy tính / xác nhận / khóa — nhật ký
CREATE TABLE calc_run (
  run_id TEXT NOT NULL,
  period_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('CALC', 'RECALC', 'CONFIRM', 'LOCK', 'UNLOCK', 'CANCEL')),
  status TEXT NOT NULL CHECK (status IN ('RUNNING', 'DONE', 'FAILED', 'ROLLED_BACK')),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  user_email TEXT NOT NULL,
  rows_written_json TEXT CHECK (rows_written_json IS NULL OR (json_valid(rows_written_json))),
  before_state_json TEXT CHECK (before_state_json IS NULL OR (json_valid(before_state_json))),
  error_message TEXT,
  PRIMARY KEY (run_id),
  FOREIGN KEY (period_id) REFERENCES ky_tinh (period_id)
) STRICT;

-- Hệ thống: Người dùng & quyền
CREATE TABLE users (
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_algo TEXT NOT NULL,
  must_change_password INTEGER NOT NULL CHECK (must_change_password IN (0,1)),
  failed_attempts INTEGER NOT NULL,
  locked_until TEXT,
  password_changed_at TEXT,
  unit_code TEXT,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'KE_TOAN', 'XEM')),
  can_unlock INTEGER NOT NULL CHECK (can_unlock IN (0,1)),
  is_active INTEGER NOT NULL CHECK (is_active IN (0,1)),
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT,
  updated_by TEXT,
  row_version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (email),
  FOREIGN KEY (unit_code) REFERENCES don_vi (unit_code)
) STRICT;

-- Hệ thống: Lịch sử thao tác — chỉ ghi thêm, không sửa/xóa
CREATE TABLE audit_log (
  log_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  user_email TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_json TEXT CHECK (before_json IS NULL OR (json_valid(before_json))),
  after_json TEXT CHECK (after_json IS NULL OR (json_valid(after_json))),
  reason TEXT,
  run_id TEXT,
  device_info TEXT,
  PRIMARY KEY (log_id)
) STRICT;

-- Hệ thống: Tham số nghiệp vụ dùng chung (làm tròn, VAT, người ký…) — phát hành từ máy gốc qua gói danh mục
CREATE TABLE config (
  config_key TEXT NOT NULL,
  config_value TEXT NOT NULL,
  value_type TEXT NOT NULL CHECK (value_type IN ('TEXT', 'NUM', 'BOOL', 'JSON')),
  description TEXT,
  updated_at TEXT,
  updated_by TEXT,
  PRIMARY KEY (config_key)
) STRICT;

-- Hệ thống: Thông tin riêng của máy này (KHÔNG đồng bộ sang máy khác)
CREATE TABLE app_meta (
  meta_key TEXT NOT NULL,
  meta_value TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (meta_key)
) STRICT;

-- Hệ thống: Gói dữ liệu trao đổi giữa các máy (danh mục, phiếu cân, bảng kê dầu, kết quả kỳ)
CREATE TABLE sync_package (
  package_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('EXPORT', 'IMPORT')),
  package_type TEXT NOT NULL CHECK (package_type IN ('CATALOG', 'TICKETS', 'FUEL', 'PERIOD_RESULT')),
  file_name TEXT NOT NULL,
  source_machine_id TEXT NOT NULL,
  source_unit_code TEXT,
  source_created_at TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  scope_json TEXT CHECK (scope_json IS NULL OR (json_valid(scope_json))),
  counts_json TEXT CHECK (counts_json IS NULL OR (json_valid(counts_json))),
  status TEXT NOT NULL CHECK (status IN ('PREVIEW', 'APPLIED', 'REJECTED', 'EXPORTED')),
  result_json TEXT CHECK (result_json IS NULL OR (json_valid(result_json))),
  applied_at TEXT,
  applied_by TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  PRIMARY KEY (package_id)
) STRICT;

-- Hệ thống: Lịch sử sao lưu file dữ liệu
CREATE TABLE backup_log (
  backup_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('AUTO', 'MANUAL', 'BEFORE_RESTORE', 'BEFORE_MIGRATION', 'BEFORE_PACKAGE')),
  file_path TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  content_sha256 TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  PRIMARY KEY (backup_id)
) STRICT;

-- Hệ thống: Log kỹ thuật (lỗi, thời gian chạy)
CREATE TABLE sys_log (
  log_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('DEBUG', 'INFO', 'WARN', 'ERROR')),
  module TEXT NOT NULL,
  message TEXT NOT NULL,
  context_json TEXT CHECK (context_json IS NULL OR (json_valid(context_json))),
  user_email TEXT,
  duration_ms INTEGER,
  PRIMARY KEY (log_id)
) STRICT;

-- Ràng buộc nghiệp vụ (trigger vì SQLite không ALTER ADD CHECK)
CREATE TRIGGER tg_hop_dong_parties BEFORE INSERT ON hop_dong WHEN NEW.customer_unit_code = NEW.carrier_unit_code BEGIN SELECT RAISE(ABORT,'E_SAME_PARTY'); END;
CREATE TRIGGER tg_hop_dong_parties_u BEFORE UPDATE ON hop_dong WHEN NEW.customer_unit_code = NEW.carrier_unit_code BEGIN SELECT RAISE(ABORT,'E_SAME_PARTY'); END;
CREATE TRIGGER tg_phieu_can_kg BEFORE INSERT ON phieu_can WHEN NEW.net_kg <= 0 OR NEW.weigh2_date < NEW.weigh1_date BEGIN SELECT RAISE(ABORT,'E_KG_INVALID'); END;
CREATE TRIGGER tg_gnd_qty BEFORE INSERT ON giao_nhan_dau WHEN NEW.qty_liter <= 0 OR NEW.fuel_price_excl_vat <= 0 BEGIN SELECT RAISE(ABORT,'E_FUEL_INVALID'); END;
CREATE TRIGGER tg_route_dist BEFORE INSERT ON tuyen_vc WHEN NEW.distance_km <= 0 OR NEW.trip_distance_km <= 0 BEGIN SELECT RAISE(ABORT,'E_DISTANCE_INVALID'); END;
CREATE TRIGGER tg_price_vals BEFORE INSERT ON price_history WHEN NEW.new_price < 0 OR NEW.fuel_price_excl_vat <= 0 OR NEW.fuel_norm_l_per_km <= 0 OR NEW.avg_load_ton <= 0 BEGIN SELECT RAISE(ABORT,'E_PRICE_INVALID'); END;
CREATE TRIGGER tg_price_used BEFORE UPDATE ON price_history WHEN OLD.is_used = 1 AND (NEW.new_price IS NOT OLD.new_price OR NEW.fuel_price_excl_vat IS NOT OLD.fuel_price_excl_vat OR NEW.fuel_norm_l_per_km IS NOT OLD.fuel_norm_l_per_km OR NEW.avg_load_ton IS NOT OLD.avg_load_ton OR NEW.avg_volume_m3 IS NOT OLD.avg_volume_m3 OR NEW.effective_from IS NOT OLD.effective_from) BEGIN SELECT RAISE(ABORT,'E_PRICE_USED'); END;
CREATE TRIGGER tg_audit_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT,'AUDIT_LOG_APPEND_ONLY'); END;
CREATE TRIGGER tg_audit_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT,'AUDIT_LOG_APPEND_ONLY'); END;
CREATE UNIQUE INDEX ux_calc_current ON transport_calculation (period_id, route_code) WHERE is_current = 1;
CREATE UNIQUE INDEX ux_users_email_nocase ON users (lower(email));

-- Chỉ mục
CREATE INDEX ix_phieu_can_route_date ON phieu_can (route_code, weigh1_date);
CREATE INDEX ix_phieu_can_plate ON phieu_can (plate_no);
CREATE INDEX ix_gnd_contract ON giao_nhan_dau (contract_id, route_code);
CREATE INDEX ix_detail_ticket ON transport_detail (contract_id, ticket_id);
CREATE INDEX ix_detail_calc ON transport_detail (calc_id);
CREATE INDEX ix_fuel_detail_calc ON fuel_detail (calc_id);
CREATE INDEX ix_audit_entity ON audit_log (entity, entity_id);
CREATE INDEX ix_price_route ON price_history (route_code, effective_from);

PRAGMA user_version = 1;
