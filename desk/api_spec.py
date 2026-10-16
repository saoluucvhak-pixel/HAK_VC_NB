"""BẢN DESKTOP (Electron IPC). Nguồn duy nhất đặc tả API — sinh api_spec.json và bảng trong API_DESIGN.md.

Mỗi endpoint:
  action, nhóm, mô tả, roles (ai gọi được), scope (giới hạn dữ liệu), input [(field, type, req, desc)],
  output (mô tả), errors [code], reads [sheet], writes [sheet], audit (action ghi AUDIT_LOG | None), lock (ghi dưới LockService)
Kiểu: string, number, integer, boolean, date (yyyy-MM-dd), object, array<...>, enum(a|b)
"""
A, K, X = 'ADMIN', 'KE_TOAN', 'XEM'
ALL = [A, K, X]; EDIT = [A, K]; ADM = [A]; PUBLIC = ['(chưa đăng nhập)']
PAGING = [('page', 'integer', False, 'mặc định 1'), ('pageSize', 'integer', False, 'mặc định 100, tối đa 1000'),
          ('sort', 'string', False, 'vd `weigh1_date:desc`')]
ROWV = ('rowVersion', 'integer', True, 'row_version đang có ở client — sai → CONFLICT_VERSION')

EP = []
def ep(action, group, desc, roles, inp, out, errors=(), reads=(), writes=(), audit=None, lock=False, scope=''):
    EP.append(dict(action=action, group=group, desc=desc, roles=roles, scope=scope, input=inp, output=out,
                   errors=list(errors), reads=list(reads), writes=list(writes), audit=audit, lock=lock))

# ------------------------------------------------------------ Hệ thống
ep('setup.status', 'Khởi tạo', 'Lần mở đầu: đã có thư mục dữ liệu chưa, bản cài của đơn vị nào, còn user chưa đặt mật khẩu không', PUBLIC, [],
   '{initialized, dataFolder, installId, installCode, unitCode, schemaVersion, usersNeedPassword:[username]}')
ep('setup.init', 'Khởi tạo', 'Tạo thư mục dữ liệu mới (chọn đơn vị của bản cài, ADMIN đầu tiên) hoặc mở thư mục có sẵn / nhận gói DANH_MUC ban đầu', PUBLIC,
   [('mode', 'enum(NEW|OPEN_EXISTING)', True, ''), ('dataFolder', 'string', True, 'đường dẫn đã chọn bằng dialog.openFolder'),
    ('unitCode', 'string', False, 'bắt buộc khi NEW'), ('admin', 'object', False, '{username, fullName, password} khi NEW'),
    ('catalogPackagePath', 'string', False, 'gói DANH_MUC để nạp danh mục ban đầu')],
   '{manifest}', ['VALIDATION_FAILED', 'STORAGE_ERROR', 'INTEGRITY_ERROR', 'DATA_LOCKED'], [], ['USERS', 'CONFIG', 'DON_VI', 'XE', 'TUYEN_VC', 'PRICE_HISTORY'], 'SETUP', True)
ep('auth.login', 'Đăng nhập', 'Đăng nhập tài khoản nội bộ → sessionToken (giữ trong bộ nhớ main process)', PUBLIC,
   [('username', 'string', True, ''), ('password', 'string', True, '')],
   '{sessionToken, user:{username, fullName, role, unitCode, canUnlock}, mustChangePassword}',
   ['AUTH_FAILED', 'ACCOUNT_LOCKED', 'PASSWORD_NOT_SET'], ['USERS'], ['USERS'], 'LOGIN', True)
ep('auth.setFirstPassword', 'Đăng nhập', 'User chưa có mật khẩu (dữ liệu mẫu / ADMIN vừa tạo) đặt mật khẩu lần đầu', PUBLIC,
   [('username', 'string', True, ''), ('newPassword', 'string', True, '≥ 8 ký tự, có chữ và số')], '{ok}',
   ['VALIDATION_FAILED', 'BUSINESS_RULE:E_PASSWORD_ALREADY_SET'], ['USERS'], ['USERS'], 'SET_PASSWORD', True)
ep('auth.changePassword', 'Đăng nhập', 'Đổi mật khẩu', ALL, [('oldPassword', 'string', True, ''), ('newPassword', 'string', True, '')], '{ok}',
   ['AUTH_FAILED', 'VALIDATION_FAILED'], ['USERS'], ['USERS'], 'CHANGE_PASSWORD', True)
ep('auth.logout', 'Đăng nhập', 'Đăng xuất (hủy session)', ALL, [], '{ok}', audit='LOGOUT')
ep('auth.me', 'Đăng nhập', 'Người dùng hiện tại, quyền, đơn vị bản cài', ALL, [],
   '{username, fullName, role, unitCode, canUnlock, installUnitCode, permissions: [action]}', ['SESSION_EXPIRED'], ['USERS'])
ep('meta.bootstrap', 'Hệ thống', 'Tải khi mở APP: danh mục, enum, cấu hình hiển thị, mã lỗi, thông tin bản cài', ALL, [],
   '{install:{installId, installCode, unitCode, dataFolder}, units, vehicles, routes, activePrices, contracts (vai trò: CARRIER|CUSTOMER), config, enums, errorCodes, dataVersion}', [],
   ['DON_VI', 'XE', 'TUYEN_VC', 'PRICE_HISTORY', 'HOP_DONG', 'HOP_DONG_XE', 'CONFIG'])
ep('system.health', 'Hệ thống', 'Kiểm tra toàn vẹn: manifest, SHA-256 từng file, journal dở dang, dung lượng, lần sao lưu gần nhất', ADM, [],
   '{schemaVersion, files:[{path, rows, sizeBytes, sha256Ok}], pendingJournal, lastBackupAt, freeDiskBytes}', ['INTEGRITY_ERROR'])
ep('dialog.openFile', 'Hệ thống', 'Hộp thoại chọn file (Excel / gói .dgvc)', ALL, [('filters', 'array<{name, extensions}>', False, '')], '{path|null}')
ep('dialog.openFolder', 'Hệ thống', 'Hộp thoại chọn thư mục', PUBLIC, [], '{path|null}')
ep('dialog.saveFile', 'Hệ thống', 'Hộp thoại chọn nơi lưu file xuất', ALL, [('defaultName', 'string', True, ''), ('filters', 'array', False, '')], '{path|null}')
ep('system.openPath', 'Hệ thống', 'Mở file / thư mục bằng Windows Explorer (sau khi xuất file)', ALL, [('path', 'string', True, '')], '{ok}')

# ------------------------------------------------------------ Danh mục
for ent, sheet, key, label in [('units', 'DON_VI', 'unitCode', 'đơn vị'), ('vehicles', 'XE', 'plateNo', 'xe'),
                               ('routes', 'TUYEN_VC', 'routeCode', 'tuyến')]:
    ep(f'{ent}.list', 'Danh mục', f'Danh sách {label}', ALL, [('q', 'string', False, 'tìm kiếm'), ('includeInactive', 'boolean', False, '')] + PAGING,
       '{items:[…], total}', reads=[sheet])
    ep(f'{ent}.save', 'Danh mục', f'Thêm / sửa {label}', EDIT if ent != 'units' else ADM,
       [('record', 'object', True, f'bản ghi {sheet} (camelCase)'), ('rowVersion', 'integer', False, 'bắt buộc khi sửa')],
       '{record}', ['VALIDATION_FAILED', 'DUPLICATE', 'CONFLICT_VERSION'], [sheet], [sheet], 'CREATE/UPDATE', True)
    ep(f'{ent}.setActive', 'Danh mục', f'Ngừng / dùng lại {label} (không xóa cứng)', EDIT if ent != 'units' else ADM,
       [(key, 'string', True, ''), ('active', 'boolean', True, ''), ROWV], '{record}',
       ['NOT_FOUND', 'CONFLICT_VERSION', 'BUSINESS_RULE:E_IN_USE'], [sheet], [sheet], 'SET_ACTIVE', True)
ep('vehicles.resolvePlate', 'Danh mục', 'Chuẩn hóa mã xe bất kỳ (`DH_92H00192`, `92H00195`) → biển số chuẩn', ALL,
   [('codes', 'array<string>', True, '')], '{results:[{input, plateNo|null, ownerUnitCode}]}', reads=['XE'])
ep('vehicles.usage', 'Danh mục', 'Xe đang dùng ở đâu: phiếu cân, dòng dầu, kỳ tính, hợp đồng — biết có sửa biển số / xóa được không', ALL,
   [('plateNo', 'string', True, '')], '{tickets, fuelRows, fuelInPeriod, periodLines, contracts, blockers, canRename}', reads=['PHIEU_CAN', 'GIAO_NHAN_DAU', 'FUEL_DETAIL', 'BKVC_LINE', 'TRANSPORT_DETAIL', 'HOP_DONG_XE'])
ep('vehicleKm.list', 'Danh mục', 'Các lần chốt đồng hồ km của xe (vd đầu năm / cuối năm) + cảnh báo đồng hồ giảm', ALL,
   [('plateNo', 'string', True, '')], '{items[{id, date, odometer, readAt(DAU_NGAY|CUOI_NGAY), point, note}], warnings[{date, message}]}', ['VALIDATION_FAILED'], ['XE_KM'])
ep('vehicleKm.save', 'Danh mục', 'Lưu các lần chốt đồng hồ km của 1 xe: thêm / sửa; số đồng hồ để trống = xóa lần chốt ngày đó', EDIT,
   [('plateNo', 'string', True, ''), ('rows', 'array<{date, odometer, readAt, note}>', True, 'readAt: DAU_NGAY (trước các chuyến trong ngày) | CUOI_NGAY (sau các chuyến)')], '{added, updated, deleted, warnings}', ['VALIDATION_FAILED'], ['XE_KM', 'XE'], ['XE_KM'], 'CREATE/UPDATE/DELETE', True)
ep('vehicles.rename', 'Danh mục', 'Sửa biển số xe nhập nhầm: tạo xe đúng, chuyển phạm vi xe hợp đồng + dòng dầu chưa tính kỳ, xóa xe sai. Chỉ khi xe sai chưa có phiếu cân / chưa vào kỳ', EDIT,
   [('plateNo', 'string', True, 'biển số đang sai'), ('newPlateNo', 'string', True, 'biển số đúng'), ROWV, ('reason', 'string', False, '')], '{record, from, to, contractRows, fuelRows, warnings}',
   ['NOT_FOUND', 'VALIDATION_FAILED', 'DUPLICATE', 'CONFLICT_VERSION'], ['XE', 'HOP_DONG_XE', 'GIAO_NHAN_DAU'], ['XE', 'HOP_DONG_XE', 'GIAO_NHAN_DAU'], 'RENAME', True)
ep('vehicles.delete', 'Danh mục', 'Xóa xe nhập nhầm — chỉ khi chưa dùng ở đâu (không phiếu cân, dòng dầu, hợp đồng); đã dùng thì Ngừng dùng', EDIT,
   [('plateNo', 'string', True, ''), ('reason', 'string', False, '')], '{deleted, warnings}', ['NOT_FOUND', 'VALIDATION_FAILED'], ['XE'], ['XE'], 'DELETE', True)

ep('prices.list', 'Đơn giá', 'Lịch sử phiên bản giá theo tuyến (+ hợp đồng)', ALL,
   [('routeCode', 'string', False, ''), ('contractId', 'string', False, 'trống = giá chung'), ('status', 'enum(DRAFT|ACTIVE|CLOSED)', False, '')],
   '{items:[PRICE_HISTORY + contractPrice tính sẵn]}', reads=['PRICE_HISTORY'])
ep('prices.preview', 'Đơn giá', 'Tính Tầng A (ĐG 1 chuyến → ĐG_HĐ) cho 1 bộ tham số, không lưu — dùng khi nhập giá mới', ALL,
   [('record', 'object', True, 'tham số giá + tuyến')], '{tripPrice, fuelPerTrip, fuelCostPerTrip, fuelCostRatio, priceNoDiesel, contractPrice, trace}',
   ['VALIDATION_FAILED'], ['TUYEN_VC', 'CONFIG'])
ep('prices.createVersion', 'Đơn giá', 'Tạo phiên bản giá mới (DRAFT); phiên bản cũ không bị sửa', EDIT,
   [('record', 'object', True, 'routeCode, contractId?, effectiveFrom, newPrice, fuelPriceExclVat, fuelNormLPerKm, avgLoadTon, avgVolumeM3, basePriceExclVat, sourceNote')],
   '{record, contractPrice}', ['VALIDATION_FAILED', 'BUSINESS_RULE:E_PRICE_DATE_OVERLAP'], ['PRICE_HISTORY'], ['PRICE_HISTORY'], 'PRICE_CREATE', True)
ep('prices.updateDraft', 'Đơn giá', 'Sửa phiên bản DRAFT (cấm khi ACTIVE đã dùng)', EDIT, [('priceId', 'string', True, ''), ('record', 'object', True, ''), ROWV],
   '{record}', ['BUSINESS_RULE:E_PRICE_USED', 'CONFLICT_VERSION'], ['PRICE_HISTORY'], ['PRICE_HISTORY'], 'PRICE_UPDATE', True)
ep('prices.activate', 'Đơn giá', 'Kích hoạt DRAFT → ACTIVE; tự đóng phiên bản trước (effective_to = ngày mới − 1)', EDIT, [('priceId', 'string', True, ''), ROWV],
   '{activated, closed}', ['BUSINESS_RULE:E_PRICE_DATE_OVERLAP'], ['PRICE_HISTORY'], ['PRICE_HISTORY'], 'PRICE_ACTIVATE', True)

ep('contracts.list', 'Hợp đồng', 'Danh sách hợp đồng (KE_TOAN chỉ thấy HĐ đơn vị mình là bên VC hoặc bên thuê)', ALL,
   [('includeInactive', 'boolean', False, '')], '{items:[HOP_DONG + signers đã xác định + vehicleCount]}', reads=['HOP_DONG', 'HOP_DONG_XE', 'DON_VI'],
   scope='unit_code ∈ {carrier, customer}; ADMIN: tất cả')
ep('contracts.save', 'Hợp đồng', 'Tạo / sửa hợp đồng: số HĐ, ngày hiệu lực, bên thuê, bên VC (người dùng tự điền)', EDIT,
   [('record', 'object', True, ''), ('rowVersion', 'integer', False, 'khi sửa')], '{record}',
   ['VALIDATION_FAILED', 'DUPLICATE', 'BUSINESS_RULE:E_SAME_PARTY', 'BUSINESS_RULE:E_NOT_CARRIER'], ['HOP_DONG', 'DON_VI'], ['HOP_DONG'], 'CREATE/UPDATE', True,
   'KE_TOAN: chỉ HĐ mà đơn vị mình là bên VC')
ep('archive.years', 'Dữ liệu', 'Lưu trữ theo năm: số phiếu / dầu / kỳ từng năm đang dùng, các năm đã lưu trữ, năm đang mở xem', ADM,
   [], '{items[{year, archived, live{tickets, fuel, periods, drafts}, archive{archivedAt, by, counts, zip, sizeBytes, folderOk}, mounted, canArchive, canReopen}], archivedThrough, mounted}', reads=['PHIEU_CAN', 'GIAO_NHAN_DAU', 'KY_TINH'])
ep('archive.preview', 'Dữ liệu', 'Xem trước lưu trữ đến hết năm Y: số dòng chuyển đi, kỳ nháp, phiếu / dầu chưa tính, kỳ vắt năm được giữ lại', ADM,
   [('year', 'integer', True, '')], '{year, counts, tickets, fuel, periods, drafts, unusedTickets, unusedFuel, keptPeriods, checks}', ['VALIDATION_FAILED'], ['PHIEU_CAN', 'GIAO_NHAN_DAU', 'KY_TINH', 'TRANSPORT_DETAIL', 'FUEL_DETAIL'])
ep('archive.archive', 'Dữ liệu', 'Lưu trữ đến hết năm Y: sao lưu an toàn → ghi archive/<Y> + file zip lưu trữ (chép ra USB/Drive) → bỏ khỏi kho đang dùng', ADM,
   [('year', 'integer', True, ''), ('reason', 'string', False, '')], '{year, counts, zip, sizeBytes, mirrored, safetyBackup}', ['VALIDATION_FAILED'], ['PHIEU_CAN', 'GIAO_NHAN_DAU', 'KY_TINH'], ['PHIEU_CAN', 'GIAO_NHAN_DAU', 'KY_TINH', 'TRANSPORT_CALCULATION', 'TRANSPORT_DETAIL', 'FUEL_DETAIL', 'BKVC_LINE', 'CALC_RUN', 'AUDIT_LOG'], 'ARCHIVE_YEAR', True)
ep('archive.mount', 'Dữ liệu', 'Mở năm lưu trữ để XEM (chỉ đọc) — báo cáo / tra cứu theo khoảng ngày chạm năm lưu trữ cũng tự mở', ALL,
   [('year', 'integer', True, '')], '{year, mounted, rows}', ['NOT_FOUND', 'INTEGRITY_ERROR'])
ep('archive.unmount', 'Dữ liệu', 'Thôi xem năm lưu trữ (bỏ khỏi bộ nhớ); không truyền year = thôi xem tất cả', ALL, [('year', 'integer', False, '')], '{mounted}')
ep('archive.reopen', 'Dữ liệu', 'Mở lại năm lưu trữ gần nhất: đưa dữ liệu trở lại kho đang dùng (sửa / nhập được)', ADM,
   [('year', 'integer', True, ''), ('reason', 'string', True, '')], '{year, counts}', ['VALIDATION_FAILED', 'NOT_FOUND'], ['PHIEU_CAN'], ['PHIEU_CAN', 'GIAO_NHAN_DAU', 'KY_TINH', 'AUDIT_LOG'], 'REOPEN_YEAR', True)
ep('archive.restoreFile', 'Dữ liệu', 'Nạp lại thư mục lưu trữ năm từ file zip lưu trữ (máy mới / sau khôi phục)', ADM,
   [('file', 'string', True, '')], '{year, ok}', ['NOT_FOUND', 'VALIDATION_FAILED', 'INTEGRITY_ERROR'])
ep('contracts.usage', 'Hợp đồng', 'Hợp đồng đang dùng ở đâu (kỳ tính, dòng dầu, lô import, giá riêng, phạm vi xe) — biết có sửa mã / hai bên, xóa được không', ALL,
   [('contractId', 'string', True, '')], '{periods, fuelRows, importBatches, prices, vehicles, blockers, canEditParties, canDelete}', ['NOT_FOUND'], ['HOP_DONG', 'KY_TINH', 'GIAO_NHAN_DAU', 'IMPORT_BATCH', 'PRICE_HISTORY', 'HOP_DONG_XE'])
ep('contracts.delete', 'Hợp đồng', 'Xóa hợp đồng nhập nhầm — chỉ khi chưa có kỳ tính / dòng dầu; xóa kèm phạm vi xe và giá riêng chưa dùng. Đã dùng thì Ngừng dùng', EDIT,
   [('contractId', 'string', True, ''), ('reason', 'string', False, '')], '{deleted, contractCode, vehicleRows, priceRows, warnings}', ['NOT_FOUND', 'VALIDATION_FAILED'], ['HOP_DONG'], ['HOP_DONG', 'HOP_DONG_XE', 'PRICE_HISTORY'], 'DELETE', True)
ep('contracts.setVehicles', 'Hợp đồng', 'Ghi phạm vi xe (danh sách + hiệu lực)', EDIT,
   [('contractId', 'string', True, ''), ('vehicles', 'array<{plateNo, effectiveFrom, effectiveTo?}>', True, '')], '{items}',
   ['VALIDATION_FAILED', 'NOT_FOUND'], ['HOP_DONG_XE', 'XE'], ['HOP_DONG_XE'], 'CONTRACT_VEHICLES', True, 'như contracts.save')
ep('contracts.suggestVehicles', 'Hợp đồng', 'Gợi ý phạm vi xe = xe bên VC + xe của các HĐ mà bên VC là bên thuê', EDIT,
   [('contractId', 'string', True, '')], '{plates:[{plateNo, ownerUnitCode, reason}]}', reads=['XE', 'HOP_DONG', 'HOP_DONG_XE'])
ep('contracts.resolveSigners', 'Hợp đồng', 'Người ký 2 bên theo sign_priority (hoặc giá trị ghi đè)', ALL, [('contractId', 'string', True, '')],
   '{carrier:{unit, signer:{name,title}, accountant}, customer:{…}, source: RULE|OVERRIDE}', reads=['HOP_DONG', 'DON_VI', 'CONFIG'])

# ------------------------------------------------------------ Đầu vào
ep('tickets.list', 'Phiếu cân', 'Tra cứu phiếu cân', ALL,
   [('dateFrom', 'date', False, ''), ('dateTo', 'date', False, ''), ('routeCode', 'string', False, ''), ('plateNo', 'string', False, ''),
    ('ownerUnitCode', 'string', False, ''), ('contractId', 'string', False, 'kèm trạng thái sử dụng theo HĐ này'),
    ('usage', 'enum(CHUA_TINH|DA_DUA_VAO_KY|DA_XAC_NHAN|DA_KHOA)', False, 'cần contractId'), ('hasFlags', 'boolean', False, ''),
    ('q', 'string', False, 'số phiếu / biển số')] + PAGING,
   '{items:[PHIEU_CAN + usageByContract:[{contractCode, periodCode, state}]], total, sums:{trips, kg}}', reads=['PHIEU_CAN', 'TRANSPORT_DETAIL', 'KY_TINH'])
ep('tickets.get', 'Phiếu cân', 'Chi tiết 1 phiếu + các kỳ đã dùng + audit', ALL, [('ticketId', 'string', True, '')],
   '{record, usages, raw, audit}', ['NOT_FOUND'], ['PHIEU_CAN', 'TRANSPORT_DETAIL', 'AUDIT_LOG'])
ep('tickets.update', 'Phiếu cân', 'Sửa phiếu — cấm nếu đang ở kỳ DA_XAC_NHAN/DA_KHOA; kỳ NHAP → needs_recalc', EDIT,
   [('ticketId', 'string', True, ''), ('changes', 'object', True, ''), ROWV], '{record, affectedPeriods}',
   ['CONFLICT_VERSION', 'BUSINESS_RULE:E_TICKET_LOCKED', 'BUSINESS_RULE:E_TICKET_IDENTITY', 'VALIDATION_FAILED'], ['PHIEU_CAN', 'TRANSPORT_DETAIL'], ['PHIEU_CAN', 'KY_TINH'], 'UPDATE', True)
ep('tickets.previewBulkDescriptive', 'Phiếu cân', 'Xem trước sửa hàng loạt 1 cột mô tả (LDĐ, nguồn gốc, khách hàng, kiểu cân, đơn vị VC): đếm phiếu, phiếu ở kỳ đã xác nhận/khóa', EDIT,
   [('field', 'enum(ldd|origin|customer|weigh_type|transport_unit_name)', True, ''), ('fromValue', 'string', True, 'giá trị đang có (khớp chính xác)'), ('toValue', 'string', True, ''),
    ('dateFrom', 'date', False, ''), ('dateTo', 'date', False, '')], '{count, kg, inConfirmed, inLocked, periods:[periodCode], sample}', ['VALIDATION_FAILED'], ['PHIEU_CAN', 'TRANSPORT_DETAIL', 'KY_TINH'])
ep('tickets.bulkUpdateDescriptive', 'Phiếu cân', 'Sửa hàng loạt 1 cột mô tả — không ảnh hưởng số tính; phiếu ở kỳ đã khóa cần quyền mở khóa; bắt buộc lý do; audit từng phiếu', EDIT,
   [('field', 'string', True, ''), ('fromValue', 'string', True, ''), ('toValue', 'string', True, ''), ('dateFrom', 'date', False, ''), ('dateTo', 'date', False, ''),
    ('reason', 'string', True, ''), ('clientRequestId', 'string', True, '')], '{updated, periods}', ['VALIDATION_FAILED', 'FORBIDDEN'], ['PHIEU_CAN', 'TRANSPORT_DETAIL', 'KY_TINH'], ['PHIEU_CAN'], 'BULK_UPDATE', True)
ep('tickets.softDelete', 'Phiếu cân', 'Xóa mềm (cấm nếu đang dùng ở kỳ chưa hủy)', EDIT, [('ticketId', 'string', True, ''), ('reason', 'string', True, ''), ROWV],
   '{record}', ['BUSINESS_RULE:E_IN_USE'], ['PHIEU_CAN', 'TRANSPORT_DETAIL'], ['PHIEU_CAN'], 'DELETE', True)
ep('tickets.softDeleteMany', 'Phiếu cân', 'Xóa mềm nhiều phiếu (vd file import nhầm); phiếu ở kỳ đã xác nhận / khóa bỏ qua và báo lại; kỳ nháp → phải tính lại', EDIT,
   [('ticketIds', 'array<string>', True, ''), ('reason', 'string', True, '')], '{deleted, skipped:[{ticketId, ticketNo, periodCode}], affectedPeriods}', ['VALIDATION_FAILED'], ['PHIEU_CAN', 'TRANSPORT_DETAIL'], ['PHIEU_CAN', 'KY_TINH'], 'DELETE', True)
ep('tickets.restore', 'Phiếu cân', 'Khôi phục phiếu đã xóa (cũng tự khôi phục khi import lại phiếu đó)', EDIT,
   [('ticketId', 'string', True, ''), ('reason', 'string', False, '')], '{record}', ['NOT_FOUND'], ['PHIEU_CAN'], ['PHIEU_CAN'], 'RESTORE', True)
ep('tickets.ackFlags', 'Phiếu cân', 'Xác nhận cảnh báo (giữ nguyên dữ liệu)', EDIT, [('ticketIds', 'array<string>', True, ''), ('note', 'string', True, '')],
   '{updated}', [], ['PHIEU_CAN'], ['PHIEU_CAN'], 'ACK_FLAGS', True)
ep('fuel.list', 'Giao nhận dầu', 'Bảng kê dầu theo hợp đồng', ALL,
   [('contractId', 'string', True, ''), ('dateFrom', 'date', False, ''), ('dateTo', 'date', False, ''), ('plateNo', 'string', False, ''),
    ('usage', 'enum(CHUA_TINH|DA_DUA_VAO_KY|DA_XAC_NHAN|DA_KHOA)', False, ''), ('hasFlags', 'boolean', False, '')] + PAGING,
   '{items, total, sums:{liters, avgPrice}}', reads=['GIAO_NHAN_DAU', 'FUEL_DETAIL'], scope='theo quyền xem hợp đồng')
ep('fuel.saveRows', 'Giao nhận dầu', 'Nhập tay nhiều dòng dầu cho 1 hợp đồng (validate như import)', EDIT,
   [('contractId', 'string', True, ''), ('rows', 'array<object>', True, '')], '{saved, rowResults}',
   ['VALIDATION_FAILED', 'BUSINESS_RULE:E_NOT_CARRIER'], ['GIAO_NHAN_DAU', 'XE'], ['GIAO_NHAN_DAU'], 'CREATE', True, 'như contracts.save')
ep('fuel.update', 'Giao nhận dầu', 'Sửa 1 dòng dầu (luật như tickets.update)', EDIT, [('receiptId', 'string', True, ''), ('changes', 'object', True, ''), ROWV],
   '{record, affectedPeriods}', ['CONFLICT_VERSION', 'BUSINESS_RULE:E_FUEL_LOCKED'], ['GIAO_NHAN_DAU', 'FUEL_DETAIL'], ['GIAO_NHAN_DAU', 'KY_TINH'], 'UPDATE', True)
ep('fuel.softDelete', 'Giao nhận dầu', 'Xóa mềm dòng dầu', EDIT, [('receiptId', 'string', True, ''), ('reason', 'string', True, ''), ROWV], '{record}',
   ['BUSINESS_RULE:E_IN_USE'], ['GIAO_NHAN_DAU', 'FUEL_DETAIL'], ['GIAO_NHAN_DAU'], 'DELETE', True)
ep('fuel.ackFlags', 'Giao nhận dầu', 'Xác nhận cảnh báo dòng dầu (vd nghi trùng nhưng không trùng)', EDIT,
   [('receiptIds', 'array<string>', True, ''), ('note', 'string', True, '')], '{updated}', [], ['GIAO_NHAN_DAU'], ['GIAO_NHAN_DAU'], 'ACK_FLAGS', True)

ep('import.template', 'Import', 'Tạo FILE EXCEL MẪU để import theo danh mục hiện tại của bản cài: sheet nhập liệu (tiêu đề đúng tên cột phần mềm nhận, cột bắt buộc có *, định dạng ô, danh sách chọn tuyến / xe / đơn vị, tô màu ô thiếu / KL lệch), HUONG_DAN, DANH_MUC, VI_DU', EDIT,
   [('importType', 'enum(PHIEU_CAN|GIAO_NHAN_DAU)', True, ''), ('contractId', 'string', False, 'bắt buộc với GIAO_NHAN_DAU (danh sách xe của hợp đồng)'), ('targetPath', 'string', False, 'từ dialog.saveFile; trống = thư mục exports')],
   '{path, sizeBytes, sheet, firstDataRow, columns[{header, required}]}', ['VALIDATION_FAILED'], ['TUYEN_VC', 'XE', 'HOP_DONG_XE', 'DON_VI', 'HOP_DONG'])
ep('import.preview', 'Import', 'Bước 1: main process đọc file Excel/CSV theo đường dẫn → gợi ý mapping, kiểm tra từng dòng, giữ dữ liệu tạm trong bộ nhớ theo batchId. KHÔNG ghi dữ liệu', EDIT,
   [('importType', 'enum(PHIEU_CAN|GIAO_NHAN_DAU)', True, ''), ('contractId', 'string', False, 'bắt buộc với GIAO_NHAN_DAU; HĐ bên VC = đơn vị bản cài'),
    ('filePath', 'string', True, 'từ dialog.openFile'), ('sheetName', 'string', False, 'trống = sheet đầu / tự dò sheet có header phù hợp'),
    ('headerRow', 'integer', False, 'trống = tự dò'), ('mapping', 'object', False, 'trống = tự gợi ý; gửi lại để preview với mapping mới')],
   '{batchId, fileSha256, sameFileImportedBefore, sheets, mapping, summary:{total, ok, warning, error, duplicate}, rows:[{rowNo, status, flags:[code], normalized}] (trang đầu), page}',
   ['VALIDATION_FAILED', 'BUSINESS_RULE:E_MAPPING_REQUIRED', 'BUSINESS_RULE:E_NOT_CARRIER', 'STORAGE_ERROR'], ['PHIEU_CAN', 'GIAO_NHAN_DAU', 'XE', 'TUYEN_VC', 'DON_VI', 'IMPORT_BATCH'], ['IMPORT_BATCH'], 'IMPORT_PREVIEW', True)
ep('import.previewRows', 'Import', 'Xem trang tiếp theo / lọc dòng lỗi của lô đang preview', EDIT, [('batchId', 'string', True, ''), ('status', 'enum(OK|WARNING|ERROR)', False, '')] + PAGING,
   '{rows, total}', ['NOT_FOUND'])
ep('import.confirm', 'Import', 'Bước 2: kiểm tra lại (dữ liệu có thể đã đổi) → ghi 1 giao dịch', EDIT,
   [('batchId', 'string', True, ''), ('skipRowNos', 'array<integer>', False, 'dòng người dùng bỏ'), ('acceptWarnings', 'boolean', True, ''),
    ('clientRequestId', 'string', True, 'chống bấm 2 lần')],
   '{inserted, skipped, errors, batch}', ['BUSINESS_RULE:E_PREVIEW_STALE', 'BUSINESS_RULE:E_IMPORT_HAS_ERRORS', 'DUPLICATE', 'STORAGE_ERROR'],
   ['PHIEU_CAN', 'GIAO_NHAN_DAU', 'XE'], ['PHIEU_CAN', 'GIAO_NHAN_DAU', 'IMPORT_BATCH'], 'IMPORT_CONFIRM', True)
ep('import.cancel', 'Import', 'Hủy lô PREVIEW', EDIT, [('batchId', 'string', True, '')], '{batch}', [], ['IMPORT_BATCH'], ['IMPORT_BATCH'], 'IMPORT_CANCEL', True)
ep('import.list', 'Import', 'Lịch sử import', ALL, [('importType', 'string', False, '')] + PAGING, '{items, total}', reads=['IMPORT_BATCH'])

# ------------------------------------------------------------ Tính giá
ep('periods.list', 'Tính giá', 'Danh sách kỳ', ALL,
   [('contractId', 'string', False, ''), ('status', 'enum(NHAP|DA_XAC_NHAN|DA_KHOA|HUY)', False, ''), ('dateFrom', 'date', False, ''), ('dateTo', 'date', False, '')] + PAGING,
   '{items:[KY_TINH + tóm tắt kết quả], total}', reads=['KY_TINH', 'TRANSPORT_CALCULATION'], scope='theo quyền xem hợp đồng')
ep('periods.preview', 'Tính giá', 'Chọn HĐ + Từ–Đến ngày (+ tuyến) → ứng viên phiếu/dầu, lỗi, cảnh báo, kết quả dự tính. KHÔNG ghi', EDIT,
   [('contractId', 'string', True, ''), ('dateFrom', 'date', True, ''), ('dateTo', 'date', True, ''), ('routeCode', 'string', False, ''),
    ('periodId', 'string', False, 'khi tính lại kỳ đã có'), ('vatRate', 'number', False, 'thuế suất GTGT (0.08); trống = của kỳ / theo lịch VAT_RATE_SCHEDULE')],
   '{candidates:{tickets:[…], fuel:[…]}, blocked:[{ticketId, code, periodCode}], issues:[{code, level, message, refs}], results:[…như calculate…], canCalculate}',
   ['BUSINESS_RULE:E_NOT_CARRIER', 'BUSINESS_RULE:E_CONTRACT_INACTIVE'],
   ['PHIEU_CAN', 'GIAO_NHAN_DAU', 'HOP_DONG', 'HOP_DONG_XE', 'PRICE_HISTORY', 'TUYEN_VC', 'TRANSPORT_DETAIL', 'FUEL_DETAIL', 'KY_TINH', 'CONFIG'],
   scope='chỉ HĐ mà đơn vị user là bên VC (ADMIN: tất cả)')
ep('periods.calculate', 'Tính giá', 'TÍNH GIÁ: tạo kỳ (nếu chưa có) hoặc tính lại; ghi kết quả + chi tiết + BKVC trong 1 CALC_RUN', EDIT,
   [('contractId', 'string', True, ''), ('dateFrom', 'date', True, ''), ('dateTo', 'date', True, ''), ('routeCode', 'string', False, ''),
    ('periodId', 'string', False, 'tính lại'), ('vatRate', 'number', False, 'thuế suất GTGT trong VAT_RATE_OPTIONS; trống = giữ của kỳ / theo lịch'), ('excludeTicketIds', 'array<string>', False, 'bỏ khỏi kỳ'),
    ('excludeReceiptIds', 'array<string>', False, ''), ('moveFromDraft', 'boolean', False, 'cho phép lấy phiếu đang ở kỳ NHAP khác (BL-34)'),
    ('overrides', 'array<{code, routeCode, reason, fuelPrice?}>', False, 'vd E_NO_FUEL cho phép dầu = 0 (cần lý do + fuelPrice chưa VAT)'), ('reportDate', 'date', False, 'ngày ký BKVC'),
    ('clientRequestId', 'string', True, 'chống bấm 2 lần')],
   '{period, runId, results:[TRANSPORT_CALCULATION], bkvc:{lines, totals}, issues}',
   ['BUSINESS_RULE:E_TICKET_USED_IN_PERIOD', 'BUSINESS_RULE:E_PERIOD_STATUS', 'BUSINESS_RULE:E_CALC_BLOCKED', 'BUSINESS_RULE:E_READONLY_IMPORTED', 'STORAGE_ERROR', 'CONFLICT_VERSION'],
   ['PHIEU_CAN', 'GIAO_NHAN_DAU', 'HOP_DONG', 'HOP_DONG_XE', 'PRICE_HISTORY', 'TUYEN_VC', 'TRANSPORT_DETAIL', 'FUEL_DETAIL', 'KY_TINH', 'CONFIG'],
   ['CALC_RUN', 'KY_TINH', 'TRANSPORT_CALCULATION', 'TRANSPORT_DETAIL', 'FUEL_DETAIL', 'BKVC_LINE'], 'CALC/RECALC', True, 'như periods.preview')
ep('periods.get', 'Tính giá', 'Chi tiết kỳ: kết quả hiện hành, BKVC, lịch sử các lần tính, phiếu / dòng dầu đã bỏ khỏi kỳ (exclusions)', ALL,
   [('periodId', 'string', True, ''), ('include', 'array<enum(results|bkvc|runs|issues)>', False, '')], '{period, results, bkvc, runs, issues}',
   ['NOT_FOUND'], ['KY_TINH', 'TRANSPORT_CALCULATION', 'BKVC_LINE', 'CALC_RUN'], scope='theo quyền xem hợp đồng')
for act, desc, frm, to, aud, extra in [
        ('confirm', 'Xác nhận kỳ: NHAP → DA_XAC_NHAN; usage_state = CONFIRMED; PRICE_HISTORY.is_used = TRUE', 'NHAP', 'DA_XAC_NHAN', 'CONFIRM', []),
        ('lock', 'Khóa kỳ: DA_XAC_NHAN → DA_KHOA; usage_state = LOCKED', 'DA_XAC_NHAN', 'DA_KHOA', 'LOCK', []),
        ('unlock', 'Mở khóa: DA_KHOA → DA_XAC_NHAN (cần can_unlock + lý do)', 'DA_KHOA', 'DA_XAC_NHAN', 'UNLOCK', [('reason', 'string', True, 'bắt buộc')]),
        ('reopen', 'Trả về nháp để sửa/tính lại: DA_XAC_NHAN → NHAP (cần can_unlock + lý do)', 'DA_XAC_NHAN', 'NHAP', 'REOPEN', [('reason', 'string', True, '')]),
        ('cancel', 'Hủy kỳ nháp: NHAP → HUY; usage_state = RELEASED', 'NHAP', 'HUY', 'CANCEL', [('reason', 'string', True, '')])]:
    ep(f'periods.{act}', 'Tính giá', desc, (ADM if act in ('unlock', 'reopen') else EDIT), [('periodId', 'string', True, ''), ROWV] + extra,
       '{period}', ['BUSINESS_RULE:E_PERIOD_STATUS', 'CONFLICT_VERSION', 'FORBIDDEN'] + (['BUSINESS_RULE:E_NEEDS_RECALC'] if act == 'confirm' else []),
       ['KY_TINH'], ['KY_TINH', 'TRANSPORT_DETAIL', 'FUEL_DETAIL', 'CALC_RUN'] + (['PRICE_HISTORY'] if act == 'confirm' else []), aud, True,
       'bên VC của HĐ' + ('; hoặc user can_unlock' if act in ('unlock', 'reopen') else ''))
ep('calc.trace', 'Tính giá', 'XEM CHI TIẾT TÍNH: chuỗi công thức từng bước + link nguồn', ALL, [('calcId', 'string', True, '')],
   '{trace (xem §6), priceVersion, config}', ['NOT_FOUND'], ['TRANSPORT_CALCULATION', 'PRICE_HISTORY'])
ep('calc.tickets', 'Tính giá', 'Phiếu cân cấu thành 1 dòng kết quả', ALL, [('calcId', 'string', True, ''), ('plateNo', 'string', False, '')] + PAGING,
   '{items:[TRANSPORT_DETAIL ⨝ PHIEU_CAN], total, sums}', ['NOT_FOUND'], ['TRANSPORT_DETAIL', 'PHIEU_CAN'])
ep('calc.fuel', 'Tính giá', 'Dòng dầu cấu thành 1 dòng kết quả', ALL, [('calcId', 'string', True, '')], '{items, sums}', ['NOT_FOUND'], ['FUEL_DETAIL', 'GIAO_NHAN_DAU'])

# ------------------------------------------------------------ Kiểm tra / báo cáo
ep('validation.run', 'Kiểm tra dữ liệu', 'Màn hình KIỂM TRA DỮ LIỆU: quét lỗi theo phạm vi', ALL,
   [('contractId', 'string', False, ''), ('dateFrom', 'date', False, ''), ('dateTo', 'date', False, ''), ('codes', 'array<string>', False, 'lọc mã lỗi'),
    ('includeAcked', 'boolean', False, '')],
   '{summary:[{code, level, count}], issues:[{code, level, message, entity, entityId, fields, suggestedFix}]}', [],
   ['PHIEU_CAN', 'GIAO_NHAN_DAU', 'TUYEN_VC', 'PRICE_HISTORY', 'XE', 'HOP_DONG_XE'])
ep('reports.bkvc', 'Báo cáo', 'Dữ liệu Bảng xác nhận KL (đã làm tròn, bằng chữ, người ký)', ALL, [('periodId', 'string', True, '')],
   '{header:{title, carrier:{name,address,taxCode}, customer:{…}, periodText, reportDate, place, contractNo}, lines, totals:{trips, kg, ton, amount, vat, total}, amountInWords, signers}',
   ['NOT_FOUND'], ['BKVC_LINE', 'KY_TINH', 'HOP_DONG', 'DON_VI', 'CONFIG'])
ep('reports.bkct', 'Báo cáo', 'Bảng kê chi tiết phiếu cân của kỳ (16 cột gốc)', ALL, [('periodId', 'string', True, ''), ('plateNo', 'string', False, ''), ('q', 'string', False, '')] + PAGING,
   '{items, total, sums}', ['NOT_FOUND'], ['TRANSPORT_DETAIL', 'PHIEU_CAN'])
ep('reports.pricing', 'Báo cáo', 'Bảng tính đơn giá VC của kỳ (17 cột như QR_DGVC (2))', ALL, [('periodId', 'string', True, '')], '{columns, rows}', ['NOT_FOUND'], ['TRANSPORT_CALCULATION'])
ep('reports.contractBasis', 'Báo cáo', 'Căn cứ tính đơn giá ký hợp đồng (Tầng A) cho mọi tuyến đang dùng tại ngày asOf', ALL,
   [('contractId', 'string', False, 'trống = bảng giá chung; có = giá riêng của hợp đồng thay giá chung'), ('asOf', 'date', False, 'mặc định hôm nay'), ('routeCode', 'string', False, '')],
   '{title, asOf, contract, carrier, customer, signers, rows[{routeCode, newPrice, avgLoadTon, tripPrice, fuelPerTrip, fuelCostPerTrip, fuelCostRatio, priceNoDiesel, contractPrice, priceId, source}]}', ['NOT_FOUND'], ['TUYEN_VC', 'PRICE_HISTORY', 'HOP_DONG', 'CONFIG'])
ep('reports.tickets', 'Báo cáo', 'Danh sách phiếu cân theo khoảng ngày (ngày cân 1) — kèm chủ xe, kỳ tính; xuất Excel qua reports.export TICKETS', ALL,
   [('dateFrom', 'date', False, ''), ('dateTo', 'date', False, ''), ('routeCode', 'string', False, ''), ('plateNo', 'string', False, ''), ('ownerUnitCode', 'string', False, 'nhóm xe (chủ xe)'), ('customer', 'string', False, 'chứa chữ')],
   '{title, subtitle, columns, rows, totalsRow}', [], ['PHIEU_CAN', 'TRANSPORT_DETAIL', 'KY_TINH'])
ep('reports.fuel', 'Báo cáo', 'Bảng kê giao nhận dầu theo khoảng ngày (ngày nhận), mọi hợp đồng hoặc 1 hợp đồng — xuất Excel qua reports.export FUEL_LIST', ALL,
   [('dateFrom', 'date', False, ''), ('dateTo', 'date', False, ''), ('contractId', 'string', False, ''), ('giverUnitCode', 'string', False, ''), ('plateNo', 'string', False, '')],
   '{title, subtitle, columns, rows, totalsRow, avgPrice}', [], ['GIAO_NHAN_DAU', 'FUEL_DETAIL', 'KY_TINH', 'HOP_DONG'])
ep('reports.volume', 'Báo cáo', 'Tổng hợp khối lượng vận chuyển theo khoảng ngày, gom theo 1–2 chiều: CUSTOMER (bên thuê) · OWNER (nhóm xe — chủ xe) · PLATE · ROUTE · CONTRACT · TRANSPORT_UNIT · TICKET_CUSTOMER · ORIGIN · MONTH · DAY', ALL,
   [('dateFrom', 'date', False, ''), ('dateTo', 'date', False, ''), ('routeCode', 'string', False, ''), ('groupBy', 'enum', False, 'mặc định CUSTOMER'), ('groupBy2', 'enum', False, 'chiều chi tiết, có dòng cộng từng nhóm')],
   '{columns, rows[{stt, g1, g2, trips, vehicles, kg, ton, share, _b?}], totalsRow}', ['VALIDATION_FAILED'], ['PHIEU_CAN', 'TRANSPORT_DETAIL', 'HOP_DONG_XE', 'HOP_DONG', 'DON_VI'])
ep('reports.vehicleLog', 'Báo cáo', 'Nhật trình vận chuyển 1 xe theo tháng / quý / năm: ngày, tuyến, cự ly, số chuyến, số km (đi + về), KL hàng, dầu nhận, dầu định mức, chủ hàng; xuất Excel / PDF qua reports.export VEHICLE_LOG', ALL,
   [('plateNo', 'string', True, ''), ('dateFrom', 'date', True, ''), ('dateTo', 'date', True, ''), ('label', 'string', False, 'vd "Tháng 09/2026", "Quý 3/2026"')],
   '{title, subtitle, columns, rows[{stt, date, route, distance_km, trips, km, odo, ton, fuel, depot, norm, owner, ticket_nos, _b?}], totalsRow, odo{readings, segments[{fromText, toText, odoStart, odoEnd, odoKm, trips, routeKm, diffKm, diffPct, fuel, per100}], total}, summary{trips, km, ton, fuel, norm, per100, odoKm, odoRouteKm, odoDiffKm, odoDiffPct, per100Odo}}', ['VALIDATION_FAILED', 'NOT_FOUND'], ['PHIEU_CAN', 'GIAO_NHAN_DAU', 'TUYEN_VC', 'PRICE_HISTORY', 'HOP_DONG', 'HOP_DONG_XE', 'DON_VI'])
ep('reports.export', 'Báo cáo', 'Xuất file ra đường dẫn đã chọn (XLSX: exceljs; PDF: in HTML báo cáo bằng printToPDF; CSV: UTF-8 BOM)', ALL,
   [('report', 'enum(BKVC|BKCT|PRICING|PRICING_SHEET|FUEL_HANDOVER|CONTRACT_BASIS|INVOICE|MISA|TICKETS|FUEL_LIST|VOLUME|VEHICLE_LOG)', True, 'PRICING_SHEET = bảng tính đơn giá mẫu in; FUEL_HANDOVER = biên bản giao nhận dầu diesel (XLSX/PDF); MISA: chỉ XLSX, chỉ bên vận chuyển'), ('format', 'enum(XLSX|CSV|PDF)', True, ''), ('params', 'object', True, 'như API báo cáo tương ứng'),
    ('targetPath', 'string', True, 'từ dialog.saveFile')],
   '{path, sizeBytes, warnings}', ['NOT_FOUND', 'STORAGE_ERROR', 'FORBIDDEN'], [], [], 'EXPORT')
ep('reports.misa', 'Báo cáo', 'Dữ liệu hóa đơn theo mẫu MISA meInvoice "Hóa đơn GTGT 1 thuế suất": 1 kỳ = 1 hóa đơn, mỗi xe 1 dòng; VAT = làm tròn(tổng tiền hàng × thuế suất)', ALL,
   [('periodId', 'string', False, ''), ('periodIds', 'string[]', False, 'nhiều kỳ → nhiều hóa đơn trong 1 file'), ('invoiceDate', 'date', False, 'mặc định ngày lập báo cáo của kỳ')],
   '{invoices:[{no, date, buyer, payment, currency, vatPct, vat, lines, totals, bkvc}], warnings}', ['NOT_FOUND', 'FORBIDDEN'], ['KY_TINH', 'BKVC_LINE', 'DON_VI', 'CONFIG'])
ep('reports.print', 'Báo cáo', 'In trực tiếp BKVC / Bảng tính đơn giá / Biên bản giao nhận dầu / BKCT (hộp thoại in của Windows)', ALL, [('report', 'enum(BKVC|PRICING_SHEET|FUEL_HANDOVER|CONTRACT_BASIS|BKCT|PRICING|TICKETS|FUEL_LIST|VOLUME|VEHICLE_LOG)', True, ''), ('params', 'object', True, '')], '{printed}', audit='PRINT')
ep('dashboard.summary', 'Báo cáo', 'Dashboard', ALL,
   [('dateFrom', 'date', True, ''), ('dateTo', 'date', True, ''), ('routeCode', 'string', False, ''), ('contractId', 'string', False, ''), ('ownerUnitCode', 'string', False, '')],
   '{trips, kg, ton, actualFuel, standardFuel, fuelDiff, avgTransportPrice (bình quân gia quyền theo tấn), routeCount, unassignedTickets, flaggedTickets}', [],
   ['PHIEU_CAN', 'TRANSPORT_CALCULATION', 'KY_TINH'], scope='theo quyền xem hợp đồng')

# ------------------------------------------------------------ Quản trị
ep('audit.list', 'Quản trị', 'Lịch sử thao tác', ALL,
   [('entity', 'string', False, ''), ('entityId', 'string', False, ''), ('userEmail', 'string', False, ''), ('action', 'string', False, ''),
    ('dateFrom', 'date', False, ''), ('dateTo', 'date', False, '')] + PAGING, '{items, total}', reads=['AUDIT_LOG'], scope='KE_TOAN/XEM: thao tác trên HĐ mình được xem')
ep('users.resetPassword', 'Quản trị', 'ADMIN xóa mật khẩu của user → user tự đặt lại khi đăng nhập (must_change_password)', ADM,
   [('username', 'string', True, ''), ('reason', 'string', True, '')], '{ok}', ['NOT_FOUND', 'BUSINESS_RULE:E_LAST_ADMIN'], ['USERS'], ['USERS'], 'RESET_PASSWORD', True)
ep('users.list', 'Quản trị', 'Danh sách người dùng', ADM, [('unitCode', 'string', False, '')], '{items}', reads=['USERS'])
ep('users.save', 'Quản trị', 'Thêm / sửa người dùng, gán đơn vị, quyền (mật khẩu KHÔNG đi qua API này)', ADM, [('record', 'object', True, ''), ('rowVersion', 'integer', False, '')],
   '{record}', ['VALIDATION_FAILED', 'DUPLICATE', 'BUSINESS_RULE:E_LAST_ADMIN'], ['USERS'], ['USERS'], 'USER_SAVE', True)
ep('config.list', 'Quản trị', 'Tham số cấu hình', ALL, [], '{items}', reads=['CONFIG'])
ep('config.save', 'Quản trị', 'Sửa tham số (làm tròn, VAT, người ký…) — áp dụng cho kỳ tính SAU; kỳ cũ giữ snapshot', ADM,
   [('key', 'string', True, ''), ('value', 'string', True, ''), ('reason', 'string', True, '')], '{item}', ['VALIDATION_FAILED'], ['CONFIG'], ['CONFIG'], 'CONFIG_UPDATE', True)

# ------------------------------------------------------------ Dữ liệu & sao lưu
ep('data.backupNow', 'Dữ liệu', 'Sao lưu ngay toàn bộ thư mục dữ liệu thành 1 file .zip (backups/manual)', ADM + [K], [('note', 'string', False, '')],
   '{path, sizeBytes, sha256}', ['STORAGE_ERROR'], audit='BACKUP')
ep('data.listBackups', 'Dữ liệu', 'Danh sách bản sao lưu (ngày / tháng / thủ công)', ADM, [], '{items:[{path, kind, createdAt, sizeBytes, dataVersion}]}')
ep('data.restore', 'Dữ liệu', 'Khôi phục từ 1 bản sao lưu: tự sao lưu hiện trạng trước, thay thư mục tables/, mở lại APP', ADM,
   [('backupPath', 'string', True, ''), ('reason', 'string', True, '')], '{restoredDataVersion, safetyBackupPath}', ['INTEGRITY_ERROR', 'STORAGE_ERROR'], audit='RESTORE')
ep('data.changeFolder', 'Dữ liệu', 'Chuyển thư mục dữ liệu sang vị trí khác (copy + kiểm SHA-256 + đổi cấu hình)', ADM, [('newFolder', 'string', True, '')],
   '{dataFolder}', ['STORAGE_ERROR', 'DATA_LOCKED'], audit='CHANGE_FOLDER')

# ------------------------------------------------------------ Trao đổi giữa các bản cài
ep('exchange.exportPackage', 'Trao đổi', 'Xuất gói .dgvc (JSON nén + SHA-256): DANH_MUC (đơn vị, xe, tuyến, giá, HĐ liên quan), PHIEU_CAN (theo khoảng ngày / xe), KY_TINH (kỳ đã xác nhận/khóa + chi tiết + BKVC)', EDIT,
   [('packageType', 'enum(DANH_MUC|PHIEU_CAN|KY_TINH)', True, ''), ('targetUnitCode', 'string', False, 'đơn vị nhận'),
    ('periodIds', 'array<string>', False, 'với KY_TINH — chỉ kỳ DA_XAC_NHAN/DA_KHOA'), ('dateFrom', 'date', False, ''), ('dateTo', 'date', False, ''),
    ('plates', 'array<string>', False, 'với PHIEU_CAN'), ('targetPath', 'string', True, 'từ dialog.saveFile')],
   '{path, packageSha256, counts}', ['BUSINESS_RULE:E_PERIOD_STATUS', 'STORAGE_ERROR'],
   ['DON_VI', 'XE', 'TUYEN_VC', 'PRICE_HISTORY', 'HOP_DONG', 'HOP_DONG_XE', 'PHIEU_CAN', 'KY_TINH', 'TRANSPORT_CALCULATION', 'TRANSPORT_DETAIL', 'FUEL_DETAIL', 'BKVC_LINE', 'GIAO_NHAN_DAU'],
   ['EXCHANGE_LOG'], 'EXPORT_PACKAGE', True)
ep('exchange.previewPackage', 'Trao đổi', 'Đọc gói, kiểm SHA-256 + schemaVersion, so với dữ liệu hiện có → mới / cập nhật / giống / xung đột / thay bản cũ (chỉ khi CÙNG máy gửi gửi lại) / từ chối. Kỳ cùng hợp đồng + khoảng ngày đã nhận từ MÁY KHÁC → xung đột; kỳ có phiếu cân / dòng dầu đã tính ở kỳ khác → từ chối; mã trùng nhưng khác kỳ → đổi mã, lưu riêng. KHÔNG ghi', EDIT,
   [('filePath', 'string', True, ''), ('ticketsOnly', 'boolean', False, 'chỉ lấy phiếu cân trong gói (vd bản cài là bên vận chuyển nhận gói kỳ của máy khác)')], '{previewId, header:{packageType, sourceUnitCode, sourceInstallId, createdAt, schemaVersion}, summary, conflicts:[{table, id, note, changes}], rejected:[{table, id, note}], canImport, ticketsOnly, ticketsInPackage, remapped}',
   ['INTEGRITY_ERROR', 'BUSINESS_RULE:E_PACKAGE_SCHEMA', 'BUSINESS_RULE:E_PACKAGE_OWN'],
   ['DON_VI', 'XE', 'TUYEN_VC', 'PRICE_HISTORY', 'HOP_DONG', 'HOP_DONG_XE', 'PHIEU_CAN', 'KY_TINH'], ['EXCHANGE_LOG'], 'IMPORT_PACKAGE_PREVIEW', True)
ep('exchange.importPackage', 'Trao đổi', 'Nhập gói theo quy tắc gộp (§ Trao đổi); kỳ nhận về là IMPORTED — chỉ xem', EDIT,
   [('exchangeId', 'string', True, ''), ('resolve', 'array<{table, id, choice: LOCAL|INCOMING}>', False, 'cách xử lý từng xung đột'), ('clientRequestId', 'string', True, '')],
   '{counts, exchange}', ['BUSINESS_RULE:E_PREVIEW_STALE', 'BUSINESS_RULE:E_CONFLICT_UNRESOLVED', 'STORAGE_ERROR'],
   ['DON_VI', 'XE', 'TUYEN_VC', 'PRICE_HISTORY', 'HOP_DONG', 'HOP_DONG_XE', 'PHIEU_CAN', 'KY_TINH'],
   ['DON_VI', 'XE', 'TUYEN_VC', 'PRICE_HISTORY', 'HOP_DONG', 'HOP_DONG_XE', 'PHIEU_CAN', 'KY_TINH', 'TRANSPORT_CALCULATION', 'TRANSPORT_DETAIL', 'FUEL_DETAIL', 'BKVC_LINE', 'GIAO_NHAN_DAU', 'EXCHANGE_LOG'],
   'IMPORT_PACKAGE', True)
ep('exchange.list', 'Trao đổi', 'Lịch sử gói đã xuất / nhập', ALL, PAGING, '{items, total}', reads=['EXCHANGE_LOG'])
ep('reconcile.audit', 'Đối chiếu', 'Kiểm tra nội bộ (chỉ đọc): phiếu cân của xe thuộc hợp đồng mình vận chuyển mà chưa tính ở kỳ nào — LATE (về muộn, ngày thuộc kỳ đã chốt) · GAP (lọt khe giữa các kỳ) · DRAFT (kỳ nháp chưa tính lại) · EXCLUDED (chủ động bỏ) · WAITING (chờ kỳ sau); kèm xe nằm trong 2 hợp đồng cùng lúc', ALL,
   [('dateFrom', 'date', False, 'ngày cân 1 từ'), ('dateTo', 'date', False, ''), ('includeWaiting', 'boolean', False, 'kèm phiếu chờ kỳ sau (mặc định không)')],
   '{summary{LATE,GAP,DRAFT,EXCLUDED,WAITING:{label,count,kg}}, rows[{kind, ticketId, ticketNo, date, plateNo, netKg, contractCode, periodId, periodCode, periodStatus}], overlaps[{plateNo, contractA, contractB, overlap, sameCustomer}], problems}', [], ['PHIEU_CAN', 'TRANSPORT_DETAIL', 'KY_TINH', 'CALC_RUN', 'HOP_DONG', 'HOP_DONG_XE'])
ep('reconcile.compare', 'Đối chiếu', 'Đối chiếu phiếu cân của đơn vị khác (gói .dgvc có phiếu cân hoặc file Excel phiếu cân) với phiếu cân bên mình theo số phiếu + ngày cân 1 + biển số; không ghi gì', ALL,
   [('filePath', 'string', True, 'từ dialog.openFile'), ('dateFrom', 'date', False, 'mặc định theo file'), ('dateTo', 'date', False, ''), ('allPlates', 'boolean', False, 'so cả xe không có trong file (mặc định chỉ xe có trong file)')],
   '{source{fileName, sourceText, rows, unreadable, duplicates}, dateFrom, dateTo, summary{KHOP,LECH,KHAC_SO_PHIEU,THIEU_BEN_MINH,THIEU_BEN_KIA}, totals, rows[{kind, date, plateNo, ticketNo, theirTicketNo, mineKg, theirKg, diffKg, fields, periodCode}], byPlate, matched, problems}', ['VALIDATION_FAILED', 'INTEGRITY_ERROR', 'E_MAPPING_REQUIRED'], ['PHIEU_CAN', 'TRANSPORT_DETAIL', 'KY_TINH'])
ep('reconcile.export', 'Đối chiếu', 'Xuất Excel kết quả đối chiếu (nhiều sheet: Tổng hợp · Chi tiết …)', ALL,
   [('kind', 'enum(AUDIT|COMPARE)', True, ''), ('params', 'object', True, 'như reconcile.audit / reconcile.compare'), ('targetPath', 'string', False, 'từ dialog.saveFile')],
   '{path, sizeBytes}', ['VALIDATION_FAILED', 'STORAGE_ERROR'], [], [], 'EXPORT')

# ------------------------------------------------------------ Mã lỗi
ERRORS = [  # (code, mức, ý nghĩa)
    ('SESSION_EXPIRED', 401, 'Chưa đăng nhập / hết phiên (không thao tác quá SESSION_IDLE_MINUTES)'),
    ('AUTH_FAILED', 401, 'Sai tên đăng nhập hoặc mật khẩu'),
    ('ACCOUNT_LOCKED', 423, 'Sai mật khẩu quá LOGIN_MAX_FAILED lần — khóa LOGIN_LOCK_MINUTES phút'),
    ('PASSWORD_NOT_SET', 428, 'Tài khoản chưa có mật khẩu → auth.setFirstPassword'),
    ('FORBIDDEN', 403, 'Không có quyền với action / hợp đồng này'),
    ('NOT_FOUND', 404, 'Không tìm thấy bản ghi'),
    ('VALIDATION_FAILED', 422, 'Dữ liệu vào sai kiểu / thiếu trường; details = [{field, code, message}]'),
    ('DUPLICATE', 409, 'Trùng khóa duy nhất (ticket_key, contract_code, …)'),
    ('CONFLICT_VERSION', 409, 'Bản ghi đã đổi kể từ lúc mở (row_version khác) — tải lại'),
    ('DATA_LOCKED', 423, 'Thư mục dữ liệu đang được mở bởi APP khác (file khóa .lock) — đóng APP kia hoặc xác nhận khóa cũ đã chết'),
    ('STORAGE_ERROR', 507, 'Lỗi đọc/ghi file (đầy ổ, không có quyền, file đang bị chương trình khác giữ) — giao dịch đã hoàn tác'),
    ('INTEGRITY_ERROR', 500, 'File dữ liệu không khớp SHA-256 trong manifest / JSON hỏng — đề nghị khôi phục bản sao lưu'),
    ('BUSINESS_RULE', 422, 'Vi phạm luật nghiệp vụ; details.code = mã E_… bên dưới'),
    ('INTERNAL', 500, 'Lỗi chương trình — đã ghi logs/, trả requestId để tra'),
]
ISSUES = [  # (code, level, message, dùng ở đâu) — 10 lỗi bắt buộc của yêu cầu §23 đánh dấu (*)
    ('E_TICKET_DUPLICATE', 'ERROR', '(*1) Phiếu cân trùng (ticket_key đã tồn tại / trùng trong file)', 'import, tickets.update'),
    ('E_ROUTE_MISSING', 'ERROR', '(*2) Không có mã tuyến', 'import, validation'),
    ('E_ROUTE_NOT_FOUND', 'ERROR', '(*3) Mã tuyến không tồn tại', 'import, validation, periods'),
    ('E_PRICE_NOT_FOUND', 'ERROR', '(*4) Không có đơn giá (không có phiên bản giá hiệu lực)', 'periods'),
    ('E_FUEL_NORM_MISSING', 'ERROR', '(*5) Không có định mức dầu', 'prices, periods'),
    ('E_NO_FUEL', 'ERROR', '(*6) Không có dầu thực nhận cho tuyến trong bảng kê của hợp đồng (override được, cần lý do)', 'periods'),
    ('E_TOTAL_KG_ZERO', 'ERROR', '(*7) Tổng KL = 0', 'periods'),
    ('E_PRICE_NEGATIVE', 'ERROR', '(*8) Đơn giá âm', 'prices, fuel'),
    ('E_DISTANCE_INVALID', 'ERROR', '(*9) Cự ly ≤ 0', 'routes, periods'),
    ('E_FUEL_NORM_INVALID', 'ERROR', '(*10) Định mức dầu ≤ 0', 'prices, periods'),
    ('E_KG_INVALID', 'ERROR', 'KL hàng ≤ 0', 'import'),
    ('E_DATE_INVALID', 'ERROR', 'Ngày sai / Ngày cân 2 < Ngày cân 1', 'import'),
    ('E_PLATE_FORMAT', 'ERROR', 'Biển số phiếu cân sai định dạng', 'import'),
    ('E_VEHICLE_NOT_FOUND', 'ERROR', 'Mã xe (phiếu/dầu) không quy đổi được về xe trong danh mục', 'import, fuel'),
    ('E_TICKET_USED_IN_PERIOD', 'ERROR', 'Phiếu cân này đã được sử dụng trong kỳ tính [Mã kỳ]. Không thể đưa vào kỳ mới.', 'periods'),
    ('E_FUEL_USED_IN_PERIOD', 'ERROR', 'Dòng dầu này đã được sử dụng trong kỳ tính [Mã kỳ]. Không thể đưa vào kỳ mới.', 'periods'),
    ('E_MULTI_FUEL_GROUP', 'ERROR', 'Tuyến có dầu từ nhiều Đơn vị giao / ĐVT (Excel sẽ nhân dòng)', 'periods'),
    ('E_PRICE_VERSION_SPLIT', 'ERROR', 'Kỳ cắt ngang 2 phiên bản giá — tách kỳ', 'periods'),
    ('E_PRICE_DATE_OVERLAP', 'ERROR', 'Ngày hiệu lực giá trùng / trước phiên bản đang ACTIVE', 'prices'),
    ('E_PRICE_USED', 'ERROR', 'Phiên bản giá đã dùng trong kỳ — không sửa, hãy tạo phiên bản mới', 'prices'),
    ('E_NOT_CARRIER', 'ERROR', 'Đơn vị của bạn không phải bên vận chuyển của hợp đồng', 'contracts, periods, fuel'),
    ('E_CONTRACT_INACTIVE', 'ERROR', 'Hợp đồng ngừng / hết hiệu lực trong kỳ', 'periods'),
    ('E_SAME_PARTY', 'ERROR', 'Bên thuê trùng bên vận chuyển', 'contracts'),
    ('E_PERIOD_STATUS', 'ERROR', 'Thao tác không hợp lệ với trạng thái kỳ hiện tại', 'periods.*'),
    ('E_NEEDS_RECALC', 'ERROR', 'Dữ liệu nguồn đã sửa sau lần tính — tính lại trước khi xác nhận', 'periods.confirm'),
    ('E_CALC_BLOCKED', 'ERROR', 'Còn lỗi chặn — xem issues', 'periods.calculate'),
    ('E_TICKET_LOCKED', 'ERROR', 'Phiếu nằm trong kỳ đã xác nhận/khóa — không sửa được', 'tickets.update'),
    ('E_FUEL_LOCKED', 'ERROR', 'Dòng dầu nằm trong kỳ đã xác nhận/khóa', 'fuel.update'),
    ('E_IN_USE', 'ERROR', 'Đang được dùng — chỉ ngừng sử dụng, không xóa', 'setActive, softDelete'),
    ('E_PREVIEW_STALE', 'ERROR', 'Dữ liệu đã đổi kể từ lúc preview — preview lại', 'import.confirm'),
    ('E_IMPORT_HAS_ERRORS', 'ERROR', 'Còn dòng lỗi chưa bỏ', 'import.confirm'),
    ('E_MAPPING_REQUIRED', 'ERROR', 'Chưa map đủ cột bắt buộc', 'import.preview'),
    ('E_LAST_ADMIN', 'ERROR', 'Không thể bỏ quyền ADMIN cuối cùng', 'users.save'),
    ('E_PASSWORD_ALREADY_SET', 'ERROR', 'Tài khoản đã có mật khẩu — dùng đổi mật khẩu', 'auth.setFirstPassword'),
    ('E_READONLY_IMPORTED', 'ERROR', 'Kỳ nhận từ gói của bản cài khác — chỉ xem, không tính lại/sửa', 'periods.*'),
    ('E_PACKAGE_SCHEMA', 'ERROR', 'Gói tạo từ phiên bản dữ liệu khác, không nhập được — cập nhật APP', 'exchange'),
    ('E_PACKAGE_OWN', 'ERROR', 'Gói do chính bản cài này xuất', 'exchange'),
    ('E_CONFLICT_UNRESOLVED', 'ERROR', 'Còn xung đột chưa chọn cách xử lý', 'exchange.importPackage'),
    ('E_AVG_LOAD_INVALID', 'ERROR', 'KL_TB (hoặc Thể tích TB với tuyến M3) phải > 0', 'prices, periods'),
    ('E_NO_FUEL_PRICE', 'ERROR', 'Cho phép dầu = 0 (override E_NO_FUEL) phải kèm đơn giá dầu chưa VAT để tính chênh lệch', 'periods.calculate'),
    ('E_NO_TICKETS', 'ERROR', 'Không có phiếu cân nào của hợp đồng trong kỳ', 'periods'),
    ('W_OVERRIDE_NO_FUEL', 'WARNING', 'Tính với dầu thực nhận = 0 theo xác nhận của người dùng (có lý do)', 'periods'),
    ('W_FUEL_IN_DRAFT_PERIOD', 'WARNING', 'Dòng dầu đang ở kỳ nháp khác', 'periods'),
    ('W_FUEL_POSSIBLE_DUPLICATE', 'WARNING', 'Dòng dầu nghi nhập trùng chưa xác nhận — vẫn TÍNH vào kỳ; trùng thật thì bỏ khỏi kỳ', 'periods'),
    ('I_FUEL_EXCLUDED', 'INFO', 'Dòng dầu người dùng đã bỏ khỏi kỳ (lưu theo lần tính, tính lại vẫn giữ)', 'periods'),
    ('W_INVOICE_DRAFT_PERIOD', 'WARNING', 'Xuất file hóa đơn MISA từ kỳ còn NHÁP (chưa xác nhận)', 'reports.export MISA'),
    ('W_INVOICE_VAT_DIFF', 'WARNING', 'VAT hóa đơn (làm tròn trên tổng) lệch VAT cộng từng dòng của BKVC — xem VAT_ROUND_BASIS', 'reports.export MISA'),
    ('E_FIELD_MISSING', 'ERROR', 'Dòng import thiếu trường bắt buộc', 'import'),
    ('E_QTY_INVALID', 'ERROR', 'Số lượng dầu ≤ 0 hoặc không phải số', 'import, fuel'),
    ('E_UNIT_NOT_FOUND', 'ERROR', 'Đơn vị (bên giao dầu) chưa có trong danh mục', 'import, fuel'),
    ('W_OWNER_MISMATCH', 'WARNING', 'Đơn vị VC ghi trên phiếu khác chủ xe trong danh mục', 'import'),
    ('W_FUEL_OFFSET', 'WARNING', 'Import dòng dầu bù trừ (số lít âm) — trừ vào dầu thực nhận, không tính vào đơn giá dầu bình quân', 'import'),
    ('I_FUEL_OFFSET', 'INFO', 'Kỳ có dòng dầu bù trừ (số lít âm)', 'calc'),
    ('W_FUEL_TOTAL_NONPOSITIVE', 'WARNING', 'Tổng dầu thực nhận của tuyến sau bù trừ ≤ 0 — vẫn tính, đơn giá VC tăng', 'calc'),
    ('E_FUEL_OFFSET_NO_PRICE', 'ERROR', 'Tuyến chỉ có dòng bù trừ không ghi đơn giá — không xác định được đơn giá dầu', 'calc'),
    ('E_YEAR_ARCHIVED', 'ERROR', 'Ngày thuộc năm đã lưu trữ — mở lại năm để nhập / sửa', 'import'),
    ('E_FIXED_PRICE_HAS_FUEL', 'ERROR', 'Tuyến dùng đơn giá cố định nhưng có dòng dầu trong kỳ (tuyến cố định không nhận dầu)', 'calc'),
    ('I_FIXED_PRICE', 'INFO', 'Tuyến tính theo đơn giá cố định — không tính chênh lệch dầu', 'calc'),
    ('W_FUEL_FIXED_ROUTE', 'WARNING', 'Import dầu: dòng dầu vào tuyến đang dùng đơn giá cố định', 'import'),
    ('W_TICKET_UPDATE', 'WARNING', 'Import: phiếu đã có, khác số liệu, chưa ở kỳ đã chốt → cập nhật theo file (kỳ nháp phải tính lại)', 'import'),
    ('W_TICKET_RESTORE', 'WARNING', 'Import: phiếu đã xóa trước đây → khôi phục theo file', 'import'),
    ('W_TICKET_LATE', 'WARNING', 'Phiếu mới có ngày cân thuộc kỳ đã xác nhận / đã khóa — nhập muộn, chưa được tính (xử lý ở Đối chiếu dữ liệu)', 'import'),
    ('W_TICKET_DESCRIPTIVE_DIFF', 'INFO', 'Phiếu đã có, chỉ khác ở cột mô tả (nguồn gốc, khách hàng, LDĐ…) — giữ bản đang có', 'import'),
    ('W_KG_MISMATCH', 'WARNING', 'KL hàng ≠ Cân lần 2 − Cân lần 1', 'import'),
    ('W_OVERNIGHT', 'WARNING', 'Phiếu cân qua đêm (ngày cân 2 ≠ ngày cân 1)', 'import'),
    ('W_BEFORE_PERIOD', 'WARNING', 'Ngày nhận dầu trước Từ ngày của kỳ (vẫn tính — "tính hết bảng kê")', 'periods'),
    ('W_AFTER_PERIOD', 'WARNING', 'Ngày nhận dầu sau Đến ngày của kỳ (vẫn tính)', 'periods'),
    ('W_POSSIBLE_DUPLICATE', 'WARNING', 'Dòng dầu nghi trùng (cùng ngày, xe, số lít)', 'import, fuel'),
    ('W_PLATE_FORMAT', 'WARNING', 'Mã xe dầu viết khác chuẩn (đã quy đổi)', 'import'),
    ('W_VEHICLE_NO_FUEL', 'WARNING', 'Xe có chạy trong kỳ nhưng không có dòng dầu', 'periods'),
    ('W_VEHICLE_OUT_OF_CONTRACT', 'WARNING', 'Dòng dầu của xe không thuộc phạm vi hợp đồng', 'periods'),
    ('W_TICKET_IN_DRAFT_PERIOD', 'WARNING', 'Phiếu đang ở kỳ nháp khác (BL-34)', 'periods'),
    ('I_FUEL_USED_EARLIER', 'INFO', 'Dầu nhận trước kỳ đã tính ở kỳ đã xác nhận — bỏ qua (gộp 1 dòng)', 'periods'),
    ('W_NEGATIVE_FUEL_DIFF', 'INFO', 'Chênh lệch dầu âm — đơn giá bị trừ', 'periods'),
    ('W_FLOORED_ZERO', 'WARNING', 'Đơn giá VC âm → đưa về 0', 'periods'),
    ('W_SAME_FILE_IMPORTED', 'WARNING', 'File này (cùng SHA-256) đã từng import', 'import.preview'),
    ('W_BACKUP_OLD', 'WARNING', 'Chưa sao lưu quá 7 ngày', 'meta.bootstrap'),
    ('W_VEHICLE_PARTIAL_CONTRACT', 'WARNING', 'Xe thuộc hợp đồng nhưng có phiếu trong kỳ nằm ngoài thời gian hiệu lực của xe (đổi hợp đồng giữa kỳ) — phiếu đó không tính', 'periods'),
    ('W_TICKET_NO_CONTRACT', 'WARNING', 'Phiếu trong kỳ của xe không thuộc hợp đồng nào mà đơn vị bản cài là bên vận chuyển — chưa được tính ở đâu', 'periods'),
    ('E_TICKET_IDENTITY', 'ERROR', 'Không sửa số phiếu / ngày cân 1 / biển số — xóa mềm rồi nhập lại', 'tickets.update'),
]
