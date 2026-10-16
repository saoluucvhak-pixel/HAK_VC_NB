-- schema_postgres.sql — sinh tự động từ schema.py (giai đoạn 2: chuyển Google Sheets → PostgreSQL)
-- Tên bảng = tên sheet viết thường; tên cột giữ nguyên → Repository chỉ đổi lớp truy cập.

-- Danh mục: Đơn vị / công ty (bên thuê, bên vận chuyển, chủ xe, bên giao dầu)
CREATE TABLE don_vi (
  unit_code text NOT NULL,
  unit_name text NOT NULL,
  short_name text NOT NULL,
  unit_type text CHECK (unit_type IN ('CONG_TY', 'CHI_NHANH')) NOT NULL,
  name_aliases text,
  tax_code text,
  address text,
  legal_rep_name text,
  legal_rep_salutation text CHECK (legal_rep_salutation IN ('Ông', 'Bà')),
  legal_rep_title text,
  factory_name text,
  email text,
  phone text,
  doc_display_name text,
  sign_priority integer NOT NULL,
  accountant_name text,
  fuel_prefix text,
  is_active boolean NOT NULL,
  note text,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz,
  updated_by text,
  row_version integer DEFAULT 1 NOT NULL,
  PRIMARY KEY (unit_code)
);

-- Danh mục: Xe vận chuyển
CREATE TABLE xe (
  plate_no text NOT NULL,
  plate_key text NOT NULL,
  owner_unit_code text NOT NULL,
  fuel_code text,
  is_active boolean NOT NULL,
  note text,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz,
  updated_by text,
  row_version integer DEFAULT 1 NOT NULL,
  PRIMARY KEY (plate_no),
  UNIQUE (plate_key)
);

-- Danh mục: Tuyến vận chuyển (phần định danh của TBL_DATA)
CREATE TABLE tuyen_vc (
  route_code text NOT NULL,
  route_name text NOT NULL,
  distance_km numeric NOT NULL,
  trip_distance_km numeric NOT NULL,
  uom text CHECK (uom IN ('TAN', 'M3')) NOT NULL,
  catalog_unit_code text,
  is_active boolean NOT NULL,
  note text,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz,
  updated_by text,
  row_version integer DEFAULT 1 NOT NULL,
  PRIMARY KEY (route_code)
);

-- Danh mục: Phiên bản đơn giá theo tuyến (phần giá của TBL_DATA) — không ghi đè
CREATE TABLE price_history (
  price_id text NOT NULL,
  route_code text NOT NULL,
  contract_id text,
  version_no integer NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  base_price_excl_vat numeric NOT NULL,
  price_per_km numeric,
  new_price numeric NOT NULL,
  fuel_price_excl_vat numeric NOT NULL,
  fuel_norm_l_per_km numeric NOT NULL,
  avg_load_ton numeric NOT NULL,
  avg_volume_m3 numeric,
  status text CHECK (status IN ('DRAFT', 'ACTIVE', 'CLOSED')) NOT NULL,
  is_used boolean NOT NULL,
  source_note text,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz,
  updated_by text,
  row_version integer DEFAULT 1 NOT NULL,
  PRIMARY KEY (price_id),
  UNIQUE (route_code, contract_id, effective_from)
);

-- Danh mục: Hợp đồng vận chuyển 2 bên (bên vận chuyển lập tính toán)
CREATE TABLE hop_dong (
  contract_id text NOT NULL,
  contract_code text NOT NULL,
  contract_no text,
  customer_unit_code text NOT NULL,
  carrier_unit_code text NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  report_title text,
  service_desc text,
  sign_place text,
  customer_signers_json jsonb,
  carrier_signers_json jsonb,
  is_active boolean NOT NULL,
  note text,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz,
  updated_by text,
  row_version integer DEFAULT 1 NOT NULL,
  PRIMARY KEY (contract_id),
  UNIQUE (contract_code)
);

-- Danh mục: Phạm vi xe của hợp đồng
CREATE TABLE hop_dong_xe (
  id text NOT NULL,
  contract_id text NOT NULL,
  plate_no text NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz,
  updated_by text,
  row_version integer DEFAULT 1 NOT NULL,
  PRIMARY KEY (id),
  UNIQUE (contract_id, plate_no, effective_from)
);

-- Đầu vào: Phiếu cân — 1 dòng = 1 chuyến; dùng chung cho mọi hợp đồng
CREATE TABLE phieu_can (
  ticket_id text NOT NULL,
  ticket_key text NOT NULL,
  ticket_no text NOT NULL,
  row_no text,
  weigh1_date date NOT NULL,
  weigh1_time time,
  weigh2_date date NOT NULL,
  weigh2_time time,
  plate_no text NOT NULL,
  weight1_kg numeric,
  weight2_kg numeric,
  net_kg numeric NOT NULL,
  origin text,
  customer text,
  ldd text,
  weigh_type text,
  route_code text NOT NULL,
  transport_unit_name text,
  owner_unit_code text,
  validation_flags text,
  flags_ack boolean,
  flags_ack_note text,
  import_batch_id text,
  raw_row_json jsonb,
  is_deleted boolean NOT NULL,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz,
  updated_by text,
  row_version integer DEFAULT 1 NOT NULL,
  PRIMARY KEY (ticket_id),
  UNIQUE (ticket_key)
);

-- Đầu vào: Bảng kê giao nhận dầu — mỗi dòng thuộc bảng kê của 1 hợp đồng
CREATE TABLE giao_nhan_dau (
  receipt_id text NOT NULL,
  contract_id text NOT NULL,
  receive_date date NOT NULL,
  route_code text NOT NULL,
  fuel_vehicle_code text NOT NULL,
  plate_no text,
  owner_unit_code text,
  uom text NOT NULL,
  qty_liter numeric NOT NULL,
  fuel_price_excl_vat numeric NOT NULL,
  purchase_date date,
  giver_unit_code text NOT NULL,
  validation_flags text,
  flags_ack boolean,
  flags_ack_note text,
  import_batch_id text,
  raw_row_json jsonb,
  is_deleted boolean NOT NULL,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz,
  updated_by text,
  row_version integer DEFAULT 1 NOT NULL,
  PRIMARY KEY (receipt_id)
);

-- Đầu vào: Lô import (preview → xác nhận)
CREATE TABLE import_batch (
  batch_id text NOT NULL,
  import_type text CHECK (import_type IN ('PHIEU_CAN', 'GIAO_NHAN_DAU', 'PRICE')) NOT NULL,
  contract_id text,
  file_name text NOT NULL,
  sheet_name text,
  header_json jsonb,
  mapping_json jsonb,
  total_rows integer NOT NULL,
  ok_rows integer NOT NULL,
  warning_rows integer NOT NULL,
  error_rows integer NOT NULL,
  duplicate_rows integer NOT NULL,
  status text CHECK (status IN ('PREVIEW', 'CONFIRMED', 'CANCELLED')) NOT NULL,
  confirmed_at timestamptz,
  confirmed_by text,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz,
  updated_by text,
  row_version integer DEFAULT 1 NOT NULL,
  PRIMARY KEY (batch_id)
);

-- Kết quả: Kỳ tính của 1 hợp đồng
CREATE TABLE ky_tinh (
  period_id text NOT NULL,
  period_code text NOT NULL,
  contract_id text NOT NULL,
  date_from date NOT NULL,
  date_to date NOT NULL,
  route_filter text,
  status text CHECK (status IN ('NHAP', 'DA_XAC_NHAN', 'DA_KHOA', 'HUY')) NOT NULL,
  calc_version integer NOT NULL,
  current_run_id text,
  config_snapshot_json jsonb,
  needs_recalc boolean NOT NULL,
  report_date date,
  calculated_at timestamptz,
  calculated_by text,
  confirmed_at timestamptz,
  confirmed_by text,
  locked_at timestamptz,
  locked_by text,
  note text,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz,
  updated_by text,
  row_version integer DEFAULT 1 NOT NULL,
  PRIMARY KEY (period_id),
  UNIQUE (period_code)
);

-- Kết quả: Kết quả tính 1 tuyến trong 1 kỳ (thay QR_DGVC4) — lưu cả số trung gian + snapshot
CREATE TABLE transport_calculation (
  calc_id text NOT NULL,
  period_id text NOT NULL,
  run_id text NOT NULL,
  calc_version integer NOT NULL,
  is_current boolean DEFAULT true NOT NULL,
  contract_id text NOT NULL,
  route_code text NOT NULL,
  route_name text NOT NULL,
  uom text NOT NULL,
  price_id text NOT NULL,
  trip_distance_km numeric NOT NULL,
  new_price numeric NOT NULL,
  avg_load_ton numeric NOT NULL,
  avg_volume_m3 numeric,
  fuel_price_catalog numeric NOT NULL,
  fuel_norm_l_per_km numeric NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  trip_count integer NOT NULL,
  total_kg numeric NOT NULL,
  total_ton numeric NOT NULL,
  fuel_giver_unit text,
  fuel_uom text,
  fuel_line_count integer NOT NULL,
  actual_fuel_liter numeric,
  fuel_start_date date,
  fuel_end_date date,
  fuel_price numeric,
  fuel_import_date date,
  trip_price numeric NOT NULL,
  fuel_per_trip numeric NOT NULL,
  fuel_cost_per_trip numeric NOT NULL,
  fuel_cost_ratio numeric NOT NULL,
  price_no_diesel numeric NOT NULL,
  contract_price numeric NOT NULL,
  standard_fuel_liter numeric NOT NULL,
  fuel_diff_liter numeric,
  fuel_adjust_price numeric,
  transport_price_raw numeric,
  transport_price numeric,
  result_status text CHECK (result_status IN ('OK', 'WARNING', 'ERROR')) NOT NULL,
  warnings_json jsonb,
  trace_json jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  PRIMARY KEY (calc_id)
);

-- Kết quả: Phiếu cân cấu thành 1 kết quả; cũng là bảng chống tính trùng theo hợp đồng
CREATE TABLE transport_detail (
  id text NOT NULL,
  calc_id text NOT NULL,
  period_id text NOT NULL,
  contract_id text NOT NULL,
  ticket_id text NOT NULL,
  ticket_key text NOT NULL,
  plate_no text NOT NULL,
  weigh1_date date NOT NULL,
  net_kg numeric NOT NULL,
  is_current boolean DEFAULT true NOT NULL,
  usage_state text CHECK (usage_state IN ('DRAFT', 'CONFIRMED', 'LOCKED', 'RELEASED')) NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (id)
);
CREATE UNIQUE INDEX ux_transport_detail_usage ON transport_detail (contract_id, ticket_id) WHERE is_current AND usage_state IN ('CONFIRMED','LOCKED');  -- chống tính trùng trong cùng hợp đồng

-- Kết quả: Dòng dầu cấu thành 1 kết quả
CREATE TABLE fuel_detail (
  id text NOT NULL,
  calc_id text NOT NULL,
  period_id text NOT NULL,
  contract_id text NOT NULL,
  receipt_id text NOT NULL,
  qty_liter numeric NOT NULL,
  fuel_price_excl_vat numeric NOT NULL,
  is_current boolean DEFAULT true NOT NULL,
  usage_state text CHECK (usage_state IN ('DRAFT', 'CONFIRMED', 'LOCKED', 'RELEASED')) NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (id)
);
CREATE UNIQUE INDEX ux_fuel_detail_usage ON fuel_detail (contract_id, receipt_id) WHERE is_current AND usage_state IN ('CONFIRMED','LOCKED');  -- chống tính trùng trong cùng hợp đồng

-- Kết quả: Dòng bảng xác nhận khối lượng (1 dòng / xe / tuyến)
CREATE TABLE bkvc_line (
  id text NOT NULL,
  period_id text NOT NULL,
  calc_id text NOT NULL,
  contract_id text NOT NULL,
  route_code text NOT NULL,
  seq integer NOT NULL,
  plate_no text NOT NULL,
  owner_unit_code text,
  trip_count integer NOT NULL,
  kg numeric NOT NULL,
  ton numeric NOT NULL,
  unit_price numeric NOT NULL,
  amount numeric NOT NULL,
  vat_rate numeric NOT NULL,
  vat numeric NOT NULL,
  amount_incl_vat numeric NOT NULL,
  note text,
  is_current boolean DEFAULT true NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (id)
);

-- Kết quả: Mỗi lần chạy tính / xác nhận / khóa — phục vụ rollback
CREATE TABLE calc_run (
  run_id text NOT NULL,
  period_id text NOT NULL,
  action text CHECK (action IN ('CALC', 'RECALC', 'CONFIRM', 'LOCK', 'UNLOCK', 'CANCEL')) NOT NULL,
  status text CHECK (status IN ('RUNNING', 'DONE', 'FAILED', 'ROLLED_BACK')) NOT NULL,
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  user_email text NOT NULL,
  rows_written_json jsonb,
  before_state_json jsonb,
  error_message text,
  PRIMARY KEY (run_id)
);

-- Hệ thống: Người dùng & quyền
CREATE TABLE users (
  email text NOT NULL,
  full_name text NOT NULL,
  unit_code text,
  role text CHECK (role IN ('ADMIN', 'KE_TOAN', 'XEM')) NOT NULL,
  can_unlock boolean NOT NULL,
  is_active boolean NOT NULL,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz,
  updated_by text,
  row_version integer DEFAULT 1 NOT NULL,
  PRIMARY KEY (email)
);

-- Hệ thống: Lịch sử thao tác — chỉ ghi thêm, không sửa/xóa
CREATE TABLE audit_log (
  log_id text NOT NULL,
  ts timestamptz NOT NULL,
  user_email text NOT NULL,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text NOT NULL,
  before_json jsonb,
  after_json jsonb,
  reason text,
  run_id text,
  device_info text,
  PRIMARY KEY (log_id)
);

-- Hệ thống: Tham số cấu hình (không hard-code)
CREATE TABLE config (
  config_key text NOT NULL,
  config_value text NOT NULL,
  value_type text CHECK (value_type IN ('TEXT', 'NUM', 'BOOL', 'JSON')) NOT NULL,
  description text,
  updated_at timestamptz,
  updated_by text,
  PRIMARY KEY (config_key)
);

-- Hệ thống: Log kỹ thuật (lỗi, thời gian chạy)
CREATE TABLE sys_log (
  log_id text NOT NULL,
  ts timestamptz NOT NULL,
  level text CHECK (level IN ('DEBUG', 'INFO', 'WARN', 'ERROR')) NOT NULL,
  module text NOT NULL,
  message text NOT NULL,
  context_json jsonb,
  user_email text,
  duration_ms integer,
  PRIMARY KEY (log_id)
);

-- Ràng buộc nghiệp vụ bổ sung
ALTER TABLE hop_dong ADD CHECK (customer_unit_code <> carrier_unit_code);
ALTER TABLE tuyen_vc ADD CHECK (distance_km > 0 AND trip_distance_km > 0);
ALTER TABLE price_history ADD CHECK (new_price >= 0 AND fuel_price_excl_vat > 0 AND fuel_norm_l_per_km > 0 AND avg_load_ton > 0);
ALTER TABLE phieu_can ADD CHECK (net_kg > 0 AND weigh2_date >= weigh1_date);
ALTER TABLE giao_nhan_dau ADD CHECK (qty_liter > 0 AND fuel_price_excl_vat > 0);
ALTER TABLE ky_tinh ADD CHECK (date_to >= date_from);
CREATE UNIQUE INDEX ux_calc_current ON transport_calculation (period_id, route_code) WHERE is_current;

-- Chỉ mục truy vấn chính
CREATE INDEX ix_phieu_can_route_date ON phieu_can (route_code, weigh1_date);
CREATE INDEX ix_phieu_can_plate ON phieu_can (plate_no);
CREATE INDEX ix_gnd_contract ON giao_nhan_dau (contract_id, route_code);
CREATE INDEX ix_detail_ticket ON transport_detail (ticket_id);
CREATE INDEX ix_detail_calc ON transport_detail (calc_id);
CREATE INDEX ix_audit_entity ON audit_log (entity, entity_id);
CREATE INDEX ix_price_route ON price_history (route_code, effective_from);

-- Khóa ngoại
ALTER TABLE xe ADD FOREIGN KEY (owner_unit_code) REFERENCES don_vi (unit_code);
ALTER TABLE tuyen_vc ADD FOREIGN KEY (catalog_unit_code) REFERENCES don_vi (unit_code);
ALTER TABLE price_history ADD FOREIGN KEY (route_code) REFERENCES tuyen_vc (route_code);
ALTER TABLE price_history ADD FOREIGN KEY (contract_id) REFERENCES hop_dong (contract_id);
ALTER TABLE hop_dong ADD FOREIGN KEY (customer_unit_code) REFERENCES don_vi (unit_code);
ALTER TABLE hop_dong ADD FOREIGN KEY (carrier_unit_code) REFERENCES don_vi (unit_code);
ALTER TABLE hop_dong_xe ADD FOREIGN KEY (contract_id) REFERENCES hop_dong (contract_id);
ALTER TABLE hop_dong_xe ADD FOREIGN KEY (plate_no) REFERENCES xe (plate_no);
ALTER TABLE phieu_can ADD FOREIGN KEY (plate_no) REFERENCES xe (plate_no);
ALTER TABLE phieu_can ADD FOREIGN KEY (route_code) REFERENCES tuyen_vc (route_code);
ALTER TABLE phieu_can ADD FOREIGN KEY (owner_unit_code) REFERENCES don_vi (unit_code);
ALTER TABLE phieu_can ADD FOREIGN KEY (import_batch_id) REFERENCES import_batch (batch_id);
ALTER TABLE giao_nhan_dau ADD FOREIGN KEY (contract_id) REFERENCES hop_dong (contract_id);
ALTER TABLE giao_nhan_dau ADD FOREIGN KEY (plate_no) REFERENCES xe (plate_no);
ALTER TABLE giao_nhan_dau ADD FOREIGN KEY (route_code) REFERENCES tuyen_vc (route_code);
ALTER TABLE giao_nhan_dau ADD FOREIGN KEY (owner_unit_code) REFERENCES don_vi (unit_code);
ALTER TABLE giao_nhan_dau ADD FOREIGN KEY (giver_unit_code) REFERENCES don_vi (unit_code);
ALTER TABLE giao_nhan_dau ADD FOREIGN KEY (import_batch_id) REFERENCES import_batch (batch_id);
ALTER TABLE import_batch ADD FOREIGN KEY (contract_id) REFERENCES hop_dong (contract_id);
ALTER TABLE ky_tinh ADD FOREIGN KEY (contract_id) REFERENCES hop_dong (contract_id);
ALTER TABLE transport_calculation ADD FOREIGN KEY (period_id) REFERENCES ky_tinh (period_id);
ALTER TABLE transport_calculation ADD FOREIGN KEY (contract_id) REFERENCES hop_dong (contract_id);
ALTER TABLE transport_calculation ADD FOREIGN KEY (route_code) REFERENCES tuyen_vc (route_code);
ALTER TABLE transport_calculation ADD FOREIGN KEY (price_id) REFERENCES price_history (price_id);
ALTER TABLE transport_detail ADD FOREIGN KEY (calc_id) REFERENCES transport_calculation (calc_id);
ALTER TABLE transport_detail ADD FOREIGN KEY (period_id) REFERENCES ky_tinh (period_id);
ALTER TABLE transport_detail ADD FOREIGN KEY (ticket_id) REFERENCES phieu_can (ticket_id);
ALTER TABLE fuel_detail ADD FOREIGN KEY (calc_id) REFERENCES transport_calculation (calc_id);
ALTER TABLE fuel_detail ADD FOREIGN KEY (period_id) REFERENCES ky_tinh (period_id);
ALTER TABLE fuel_detail ADD FOREIGN KEY (receipt_id) REFERENCES giao_nhan_dau (receipt_id);
ALTER TABLE bkvc_line ADD FOREIGN KEY (period_id) REFERENCES ky_tinh (period_id);
ALTER TABLE bkvc_line ADD FOREIGN KEY (calc_id) REFERENCES transport_calculation (calc_id);
ALTER TABLE calc_run ADD FOREIGN KEY (period_id) REFERENCES ky_tinh (period_id);
ALTER TABLE users ADD FOREIGN KEY (unit_code) REFERENCES don_vi (unit_code);

-- AUDIT_LOG chỉ ghi thêm
REVOKE UPDATE, DELETE ON audit_log FROM PUBLIC;
