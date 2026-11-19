'use strict';
/* Trao đổi dữ liệu · Lịch sử thao tác (4.10) · Cài đặt (4.11: tham số, đơn vị & xe, người dùng, dữ liệu & sao lưu, thông tin) */
(function () {
  const D = window.DGVC; const { h } = D;
  const ACT = { NEW: ['ok', 'Mới'], SAME: ['mute', 'Đã có'], UPDATE: ['info', 'Cập nhật'], CONFLICT: ['err', 'Xung đột'], SKIP: ['mute', 'Bỏ qua'], REPLACE: ['info', 'Thay bản cũ'], REJECT: ['err', 'Từ chối'] };

  // ───────── Sửa xe (Cài đặt → Đơn vị & xe) ─────────
  async function vehicleEdit(x, reminder) {
    const back = () => D.go('settings', { tab: 'units' });
    const u = await D.api('vehicles.usage', { plateNo: x.plate_no });
    const used = [u.tickets ? `${D.vn(u.tickets)} phiếu cân` : '', u.fuelRows ? `${D.vn(u.fuelRows)} dòng dầu` : '', u.contracts.length ? `hợp đồng ${u.contracts.join(', ')}` : '', u.periodLines ? 'kết quả kỳ tính' : ''].filter(Boolean);
    const f = D.form([{ key: 'plateNo', label: 'Biển số', readonly: true }, { key: 'ownerUnitCode', label: 'Chủ xe (nhóm xe)', type: 'select', options: D.unitOptions() },
      { key: 'fuelCode', label: 'Mã xe trong bảng kê dầu', hint: 'vd DH_92H00057' }, { key: 'note', label: 'Ghi chú', full: true }],
    { plateNo: x.plate_no, ownerUnitCode: x.owner_unit_code, fuelCode: x.fuel_code, note: x.note });
    const info = h('p', { class: 'small', style: { margin: '10px 0 0' } }, used.length ? `Xe đang có: ${used.join(' · ')}.` : 'Xe chưa dùng ở đâu (chưa có phiếu cân, dòng dầu, hợp đồng).',
      u.canRename ? ' Sửa được biển số.' : ' Đã có phiếu cân / kỳ tính nên KHÔNG sửa được biển số — nếu nhập nhầm xe: thêm xe đúng rồi Ngừng dùng xe này.');
    const rename = () => D.formModal({ title: `Sửa biển số ${x.plate_no}`, fields: [{ key: 'newPlateNo', label: 'Biển số đúng', required: true, hint: 'vd 92H-00057' }, { key: 'reason', label: 'Lý do', full: true }], values: { reason: 'Nhập nhầm biển số' },
      submit: async (val) => { const r = await D.api('vehicles.rename', { plateNo: x.plate_no, newPlateNo: val.newPlateNo, reason: val.reason, rowVersion: x.row_version });
        D.toast(`Đã sửa biển số ${r.from} → ${r.to}${r.contractRows ? ` · chuyển ${r.contractRows} dòng phạm vi hợp đồng` : ''}${r.fuelRows ? ` · ${r.fuelRows} dòng dầu` : ''}`, 'ok', 8000); reminder(r); back(); } });
    D.modal({ title: `Xe ${x.plate_no}`, body: h('div', {}, f, info), actions: [
      ...(u.canRename ? [{ label: 'Sửa biển số…', run: () => { rename(); return true; } }] : []),
      ...(!used.length ? [{ label: 'Xóa xe nhập nhầm', danger: true, run: async () => { if (!(await D.confirm({ title: 'Xóa xe', message: `Xóa hẳn xe ${x.plate_no} khỏi danh mục?`, danger: true }))) return false;
        reminder(await D.api('vehicles.delete', { plateNo: x.plate_no, reason: 'Nhập nhầm' })); D.toast(`Đã xóa xe ${x.plate_no}`, 'ok'); back(); return true; } }] : []),
      { label: x.is_active ? 'Ngừng dùng' : 'Dùng lại', run: async () => { reminder(await D.api('vehicles.setActive', { plateNo: x.plate_no, active: !x.is_active, rowVersion: x.row_version })); back(); return true; } },
      { label: 'Lưu', primary: true, run: async () => { const val = f.values(); reminder(await D.api('vehicles.save', { record: { ...val, plateNo: x.plate_no }, rowVersion: x.row_version })); D.toast('Đã lưu xe', 'ok'); back(); return true; } }] });
  }

  // ───────── Lưu trữ theo năm (bản 1.2.5) ─────────
  /** SAO LƯU PHỤ (JSON) để GỬI MÁY KHÁC: một file .zip; máy nhận dùng "Khôi phục từ file…". */
  async function backupJson() {
    const unit = D.state.boot.install.unitCode; const day = D.today().replace(/-/g, '');
    const f = await D.pickFile({ title: 'Lưu file sao lưu JSON để gửi máy khác', save: true, defaultPath: `DGVC_JSON_${unit}_${day}.zip`, filters: [{ name: 'Sao lưu JSON (.zip)', extensions: ['zip'] }] }); if (!f) return;
    let r; try { r = await D.api('data.exportJson', { file: f }); } catch { return; }
    D.toast(`Đã lưu ${r.file} — gửi file này cho máy khác, máy nhận bấm "Khôi phục từ file…"`, 'ok', 12000);
  }

  /** Khôi phục từ MỘT FILE tự chọn (.zip sao lưu hoặc manifest.json của thư mục dữ liệu JSON): xem trước thông tin → xác nhận có lý do → khôi phục. */
  async function restoreFromFile() {
    const file = await D.pickFile({ title: 'Chọn file sao lưu (.zip) hoặc manifest.json của thư mục dữ liệu JSON', filters: [{ name: 'Sao lưu DGVC (.zip, manifest.json)', extensions: ['zip', 'json'] }] });
    if (!file) return;
    let i; try { i = await D.api('data.inspectBackup', { file }); } catch { return; }
    if (!i.canRestore) { D.modal({ title: 'Không khôi phục được file này', body: h('div', {}, h('p', {}, i.problem), h('p', { class: 'small mono' }, file)), actions: [{ label: 'Đóng', primary: true, run: () => true }] }); return; }
    const reason = await D.confirm({ title: 'Khôi phục từ file', danger: true, reason: true, okLabel: 'Khôi phục',
      message: `File: ${file}\nĐơn vị ${i.unitCode} · phiên bản dữ liệu ${i.dataVersion}${i.createdAt ? ` · lập lúc ${D.dt(i.createdAt)}` : ''} · ${i.storageFormat === 'sqlite' ? 'kho SQLite' : 'kho JSON'}.\n`
        + (i.needsOtherInstallConfirm ? 'Đây là bản sao lưu của MỘT MÁY KHÁC cùng đơn vị: khôi phục sẽ thay TOÀN BỘ dữ liệu và mã bản cài của máy này. ' : '')
        + 'APP sao lưu an toàn hiện trạng trước khi thay.' });
    if (!reason) return;
    try { await D.api('data.restore', { file, reason, allowOtherInstall: !!i.needsOtherInstallConfirm }); } catch { return; }
    D.toast('Đã khôi phục từ file', 'ok'); await D.refreshBoot(); D.go('dashboard');
  }

  /** Kho lưu trữ (thí điểm SQLite) — chỉ ADMIN. Mặc định vẫn là kho JSON; chuyển là thao tác chủ động, có chạy thử, có đường lui. */
  async function storageCard() {
    const d = await D.api('storage.info', {}, { quiet: true }).catch(() => null);
    if (!d) return null;
    const again = async () => { await D.refreshBoot(); D.go('settings', { tab: 'backup' }); };
    const result = (r) => h('div', {},
      h('p', {}, r.verified ? D.tag('ok', r.dryRun ? 'Chạy thử đạt' : 'Đã chuyển và kiểm chứng') : D.tag('err', 'Không đạt'),
        ` Kho JSON nguồn ${r.sourceUnchanged ? 'nguyên vẹn' : 'đã đổi (!)'}.`, r.safetyBackup ? ` Bản sao an toàn: ${r.safetyBackup}` : ''),
      h('p', { class: 'small mono' }, Object.entries(r.rows || {}).filter(([, n]) => n).map(([t, n]) => `${t}: ${D.vn(n)}`).join(' · ')),
      h('p', { class: 'small' }, `Đã đối chiếu số dòng, dấu vân tay từng bảng, bộ đếm sinh mã và tổng của ${Object.keys(r.closedPeriods || {}).length} kỳ đã chốt.`));
    const migrate = async (dryRun) => {
      if (!dryRun && !(await D.confirm({ title: 'Nâng cấp sang kho SQLite', danger: true,
        message: 'APP sao lưu an toàn, dựng kho SQLite, đối chiếu từng bảng và từng kỳ đã chốt rồi mới chuyển. Kho JSON cũ được giữ nguyên làm dự phòng.' }))) return;
      let r; try { r = await D.api('storage.migrate', { dryRun }); } catch { return; }
      D.modal({ title: dryRun ? 'Kết quả chạy thử' : 'Kết quả chuyển kho', wide: true, body: result(r), actions: [{ label: 'Đóng', primary: true, run: async () => { if (!dryRun) await again(); return true; } }] });
    };
    const adv = h('details', { class: 'storage-adv' }, h('summary', { class: 'storage-sum' }, 'Nâng cao (kỹ thuật)'),
      h('div', { class: 'btns' },
        d.storage === 'json' ? h('button', { class: 'btn', disabled: !d.canMigrate, onclick: () => migrate(true) }, 'Chạy thử chuyển sang SQLite (không đổi gì)') : null,
        d.storage === 'sqlite' && d.canRevert ? h('button', { class: 'btn', onclick: async () => { if (!(await D.confirm({ title: 'Quay lại kho JSON', message: 'Dùng lại kho JSON cũ (đã đóng băng, trùng khớp với SQLite vì chưa có giao dịch mới).' }))) return; try { await D.api('storage.revert', {}); } catch { return; } await again(); } }, 'Quay lại kho JSON') : null,
        d.storage === 'sqlite' ? h('button', { class: 'btn', onclick: async () => { const f = await D.pickFolder('Chọn thư mục TRỐNG để xuất ngược ra JSON'); if (!f) return; try { const r = await D.api('storage.exportJson', { dest: f }); D.toast(`Đã xuất JSON ra ${r.dest} và kiểm chứng đạt`, 'ok', 9000); } catch { /* lỗi đã hiện */ } } }, 'Xuất ngược ra thư mục JSON') : null));
    return h('div', { class: 'card storage-card' }, h('h2', {}, 'Kho dữ liệu'),
      h('p', {}, 'Máy đang lưu dữ liệu bằng: ', D.tag(d.storage === 'sqlite' ? 'ok' : 'warn', d.storage === 'sqlite' ? 'SQLite (kho chính)' : 'JSON (kho cũ)'),
        d.migratedAt ? ` · nâng cấp lúc ${D.dt(d.migratedAt)}` : ''),
      h('p', { class: 'small muted' }, 'SQLite là kho chính và máy tự sao lưu mỗi ngày. JSON chỉ là sao lưu phụ để gửi máy khác.'),
      d.storage === 'json' ? h('p', {}, D.tag('warn', 'Cần nâng cấp'), ` ${d.blockedReason || 'App sẽ tự nâng cấp sang SQLite khi mở lại; hoặc bấm nút bên dưới.'}`) : null,
      d.storage === 'json' && d.canMigrate ? h('div', { class: 'btns' }, h('button', { class: 'btn primary', onclick: () => migrate(false) }, 'Nâng cấp sang SQLite ngay')) : null,
      adv);
  }

  async function archiveCard() {
    const d = await D.api('archive.years', {}, { quiet: true }).catch(() => null);
    if (!d) return null;
    const again = () => D.go('settings', { tab: 'backup' });
    const doArchive = async (y) => {
      const pv = await D.api('archive.preview', { year: y });
      const reason = h('textarea', { rows: 2, 'aria-label': 'Lý do lưu trữ' }); reason.value = `Lưu trữ dữ liệu đến hết năm ${y}`;
      const C = pv.counts;
      D.modal({ title: `Lưu trữ đến hết năm ${y}`, wide: true, body: h('div', {},
        h('p', {}, 'Chuyển khỏi kho đang dùng: ', h('b', {}, `${D.vn(pv.tickets)} phiếu cân, ${D.vn(pv.fuel)} dòng dầu, ${D.vn(pv.periods)} kỳ tính`), ` (kèm kết quả kỳ, ${D.vn(C.AUDIT_LOG || 0)} dòng lịch sử thao tác). Mở app sẽ không nạp các dữ liệu này nữa.`),
        h('p', { class: 'small' }, 'Xem / in lại: báo cáo theo khoảng ngày của năm này tự mở ở chế độ chỉ xem. Muốn nhập / sửa: bấm "Mở lại năm". App sao lưu an toàn trước, rồi ghi 1 file lưu trữ riêng (chép ra USB / Google Drive nếu đã bật).'),
        pv.checks.length ? D.issueList(pv.checks) : h('p', {}, D.tag('ok', 'Không có cảnh báo')),
        h('label', { class: 'field full' }, h('span', {}, 'Lý do'), reason)),
      actions: [{ label: 'Hủy', run: () => true }, { label: `Lưu trữ đến hết năm ${y}`, primary: true, run: async () => {
        const r = await D.api('archive.archive', { year: y, reason: reason.value });
        D.toast(`Đã lưu trữ đến hết năm ${y} · file ${r.zip.split(/[\\/]/).pop()}${r.mirrored ? (r.mirrored.ok ? ' · đã chép ra ngoài' : ` · ${r.mirrored.message}`) : ''}`, 'ok', 10000); again(); return true; } }] });
    };
    const reopen = async (y) => {
      const reason = await D.confirm({ title: `Mở lại năm ${y}`, message: `Đưa toàn bộ dữ liệu năm ${y} trở lại kho đang dùng (nhập / sửa được; mở app sẽ nạp lại năm này). Lưu trữ lại lúc nào cũng được.`, reason: true });
      if (!reason) return; await D.api('archive.reopen', { year: y, reason }); D.toast(`Đã mở lại năm ${y}`, 'ok'); again();
    };
    const loadFile = async () => { const f = await D.pickFile({ title: 'Chọn file lưu trữ năm (DGVC_..._LUU_TRU_DEN_HET_NAM_….zip)', filters: [{ name: 'File lưu trữ', extensions: ['zip'] }] }); if (!f) return; const r = await D.api('archive.restoreFile', { file: f }); D.toast(`Đã nạp lưu trữ năm ${r.year}`, 'ok'); again(); };
    const status = (r) => (r.archived ? [D.tag('info', r.archive.folderOk ? 'Đã lưu trữ' : 'Thiếu thư mục lưu trữ'), r.mounted ? [' ', D.tag('warn', 'đang xem')] : '']
      : r.live.tickets + r.live.fuel + r.live.periods ? D.tag('ok', 'Đang dùng') : h('span', { class: 'muted' }, '—'));
    return h('div', { class: 'card' }, h('h2', {}, 'Lưu trữ theo năm'),
      h('p', { class: 'small' }, 'Năm cũ đã làm xong nên lưu trữ: mở app nhanh hơn, tốn ít bộ nhớ, bản sao lưu hằng ngày nhỏ (chỉ năm đang làm + danh mục). Năm lưu trữ vẫn xem / in lại được (tự mở chế độ chỉ xem) và mở lại được khi cần sửa.'),
      D.table({ rows: d.items, empty: 'Chưa có dữ liệu', columns: [{ key: 'year', label: 'Năm' }, { key: 's', label: 'Trạng thái', render: status },
        { key: 't', label: 'Phiếu cân', num: true, render: (r) => D.vn(r.archived ? r.archive.counts.PHIEU_CAN : r.live.tickets) + (r.archived && r.live.tickets ? ` (+${D.vn(r.live.tickets)} giữ lại)` : '') },
        { key: 'f', label: 'Dòng dầu', num: true, render: (r) => D.vn(r.archived ? r.archive.counts.GIAO_NHAN_DAU : r.live.fuel) },
        { key: 'p', label: 'Kỳ tính', num: true, render: (r) => (r.archived ? D.vn(r.archive.counts.KY_TINH) : `${D.vn(r.live.periods)}${r.live.drafts ? ` (${r.live.drafts} nháp)` : ''}`) },
        { key: 'w', label: 'Lưu trữ lúc', render: (r) => (r.archived ? h('span', { class: 'small' }, `${D.dt(r.archive.archivedAt)} · ${r.archive.by}`, h('div', { class: 'mono small muted' }, r.archive.zip)) : '') },
        { key: 'x', label: '', render: (r) => h('span', { class: 'btns' },
          r.canArchive ? h('button', { class: 'btn small', onclick: () => doArchive(r.year) }, 'Lưu trữ đến hết năm…') : null,
          r.archived && r.archive.folderOk ? h('button', { class: 'btn small', onclick: async () => { if (r.mounted) await D.api('archive.unmount', { year: r.year }); else { await D.api('archive.mount', { year: r.year }); D.toast(`Đang xem năm ${r.year} (chỉ xem) — vào Báo cáo / Phiếu cân chọn ngày năm ${r.year}`, 'info', 8000); } again(); } }, r.mounted ? 'Thôi xem' : 'Xem') : null,
          r.archived && !r.archive.folderOk ? h('button', { class: 'btn small primary', onclick: loadFile }, 'Nạp file lưu trữ…') : null,
          r.canReopen ? h('button', { class: 'btn small danger', onclick: () => reopen(r.year) }, 'Mở lại năm…') : null) }] }));
  }

  // ───────── Trao đổi dữ liệu ─────────
  D.views.exchange = {
    async render(p) {
      let tab = p.tab || 'import'; const body = h('div');
      const tabs = h('div', { class: 'tabs', role: 'tablist' }, [['import', 'Nhập gói'], ['export', 'Xuất gói'], ['history', 'Lịch sử gói']].map(([k, t]) => h('button', { role: 'tab', 'aria-selected': String(tab === k), onclick: () => D.go('exchange', { tab: k }) }, t)));
      if (tab === 'import') {
        const res = h('div');
        const pick = async () => {
          const fp = await D.pickFile({ title: 'Chọn gói .dgvc', filters: [{ name: 'Gói DGVC', extensions: ['dgvc'] }] }); if (!fp) return;
          await show(fp, false);
        };
        const show = async (fp, ticketsOnly) => {
          const pv = await D.api('exchange.previewPackage', { filePath: fp, ticketsOnly });
          const decisions = {};
          res.innerHTML = '';
          const hd = pv.header;
          res.append(h('div', { class: 'grid g2' }, h('div', { class: 'card' }, h('h2', {}, 'Thông tin gói'), h('p', {}, h('b', {}, { DANH_MUC: 'Danh mục', PHIEU_CAN: 'Phiếu cân', KY_TINH: 'Kỳ tính' }[hd.packageType]), ` · từ bản cài ${hd.sourceUnitCode} (máy ${hd.sourceInstallId}) → ${hd.targetUnitCode || 'mọi nhà máy'}`),
            h('p', { class: 'small' }, `Người lập ${hd.createdBy} · ${D.dt(hd.createdAt)} · ${D.vn(pv.sizeBytes / 1024, 1)} KB · `, h('span', { class: 'tag ok' }, 'Toàn vẹn SHA-256: đúng')), h('p', { class: 'small muted' }, pv.role)),
          h('div', { class: 'card' }, h('h2', {}, 'Tóm tắt'), pv.totals.periods.length ? h('div', {}, h('p', {}, `Kỳ: ${pv.totals.periods.join(', ')}`), h('p', {}, `${D.vn(pv.totals.trips)} chuyến · ${D.vn(pv.totals.ton, 2)} tấn · đơn giá ${pv.totals.prices.map((x) => D.vn(x.transportPrice)).join(' · ')}`),
            h('p', {}, 'Tổng thanh toán: ', h('span', { class: 'money' }, D.vn(pv.totals.totalInclVat))))
            : h('p', {}, Object.entries(pv.totals.catalog).map(([t, n]) => `${t}: ${n}`).join(' · ') || `${pv.totals.tickets} phiếu cân`))),
          h('div', { class: 'card flush' }, D.table({ rows: Object.entries(pv.summary).map(([t, s]) => ({ t, ...s })), columns: [{ key: 't', label: 'Bảng' }, ...Object.keys(ACT).map((k) => ({ key: k, label: ACT[k][1], fmt: 'int' }))] })),
          h('details', { class: 'card small' }, h('summary', {}, h('b', {}, 'Các chữ trong bảng nghĩa là gì?')), h('ul', { style: { margin: '8px 0 0 18px', padding: 0 } },
            h('li', {}, h('b', {}, 'Mới'), ': máy này chưa có — thêm vào.'), h('li', {}, h('b', {}, 'Đã có'), ': giống hệt dữ liệu đang có — bỏ qua.'),
            h('li', {}, h('b', {}, 'Cập nhật'), ': bên gửi sửa sau (danh mục, dòng dầu của kỳ gửi lại) — cập nhật theo.'),
            h('li', {}, h('b', {}, 'Xung đột'), ': hai bên khác nhau (cùng sửa 1 mục, hoặc CÙNG kỳ nhưng gửi từ máy khác) — anh/chị chọn Giữ bản này / Lấy bản đến, mặc định giữ.'),
            h('li', {}, h('b', {}, 'Thay bản cũ'), ': CHÍNH máy đã gửi kỳ này gửi lại sau khi tính lại — kỳ cũ được thay, không thành 2 kỳ. Kỳ của máy khác không bao giờ bị thay tự động.'),
            h('li', {}, h('b', {}, 'Thay kỳ cũ'), ': cùng máy gửi, cùng hợp đồng, cùng khoảng ngày nhưng kỳ mới (vd mã …#2 do bên gửi hủy kỳ rồi lập lại) — chọn "Thay kỳ cũ bằng kỳ này" thì kỳ cũ thành Đã hủy; mặc định giữ kỳ cũ.'), h('li', {}, h('b', {}, 'Bỏ qua'), ': không liên quan đơn vị này.'), h('li', {}, h('b', {}, 'Từ chối'), ': không nhận được — xem lý do bên dưới; không ghi gì.'))),
          pv.remapped && pv.remapped.length ? h('div', { class: 'card small' }, `Kỳ ${pv.remapped.join(', ')} trùng MÃ với kỳ đang có nhưng là kỳ khác (máy khác cùng đơn vị) — lưu thành kỳ riêng, không đè kỳ đang có.`) : null,
          pv.rejected.length ? h('div', { class: 'card' }, h('h2', {}, 'Không nhận được'), h('ul', {}, pv.rejected.map((x) => h('li', {}, x.note))),
            pv.ticketsInPackage && !pv.ticketsOnly ? h('div', { class: 'btns' }, h('button', { class: 'btn primary', onclick: () => show(fp, true) }, `Chỉ nhập ${D.vn(pv.ticketsInPackage)} phiếu cân trong gói`),
              h('span', { class: 'small muted' }, 'Phiếu đã có tự bỏ qua; phiếu thuộc kỳ đã chốt sẽ hiện ở Đối chiếu dữ liệu.')) : null) : null,
          pv.ticketsOnly ? h('div', { class: 'card small' }, h('b', {}, 'Chỉ nhập phiếu cân'), ' trong gói — bỏ qua kỳ tính, dầu, danh mục.') : null,
          pv.conflicts.length ? h('div', { class: 'card' }, h('h2', {}, `Xung đột (${pv.conflicts.length}) — chọn giữ bản này hay lấy bản đến`), pv.conflicts.map((c) => {
            const sup = c.kind === 'SUPERSEDE'; const dup = c.kind === 'POSSIBLE_DUPLICATE'; // nghi trùng dòng dầu: SKIP (mặc định) / KEEP
            const sel = dup ? h('select', { 'aria-label': 'Xử lý dòng dầu nghi trùng', onchange: (e) => { decisions[`${c.table}:${c.id}`] = e.target.value; } }, h('option', { value: 'SKIP' }, 'Bỏ qua (đã có ở máy này)'), h('option', { value: 'KEEP' }, 'Vẫn nhập (ghi thêm)'))
              : h('select', { onchange: (e) => { decisions[`${c.table}:${c.id}`] = e.target.value; } }, h('option', { value: 'KEEP' }, sup ? 'Giữ kỳ cũ (không nhận kỳ này)' : 'Giữ bản này'), h('option', { value: 'TAKE' }, sup ? 'Thay kỳ cũ bằng kỳ này' : 'Lấy bản đến'));
            const label = dup ? 'Dòng dầu nghi trùng —' : sup ? `Kỳ tính mới thay kỳ ${(c.supersedeCodes || []).join(', ')} —` : c.table === 'KY_TINH' ? 'Kỳ tính' : c.table;
            return h('div', { style: { borderBottom: '1px dashed var(--line)', padding: '10px 0' } },
              h('div', { class: 'row' }, h('b', { class: 'grow' }, `${label} `, h('span', { class: 'mono' }, c.id)), h('span', { class: 'small muted' }, 'Chọn:'), sel),
              c.note ? h('div', { class: 'small muted', style: { margin: '4px 0' } }, c.note) : null,
              (c.changes || []).length ? h('table', { class: 't', style: { marginTop: '6px', maxWidth: '720px' } }, h('thead', {}, h('tr', {}, h('th', {}, 'Mục'), h('th', {}, 'Bản đang có (giữ bản này)'), h('th', {}, 'Bản đến (lấy bản đến)'))),
                h('tbody', {}, c.changes.map((x) => h('tr', {}, h('td', {}, x.field), h('td', { class: 'wrap' }, String(x.local ?? '')), h('td', { class: 'wrap' }, h('b', {}, String(x.incoming ?? ''))))))) : null);
          })) : null,
          h('div', { class: 'btns sticky-act' }, h('button', { class: 'btn primary', disabled: !pv.canImport || !D.writer(), onclick: async () => {
            if (!(await D.confirm({ title: 'Nhập gói', message: 'APP tự sao lưu an toàn trước khi ghi. Tiếp tục?' }))) return;
            const r = await D.api('exchange.importPackage', { previewId: pv.previewId, decisions }); D.toast(`Đã nhập gói · sao lưu an toàn: ${r.safetyBackup || '—'}`, 'ok', 8000); await D.refreshBoot(); D.go('exchange', { tab: 'history' });
          } }, 'Nhập gói')));
          res.style.scrollMarginTop = '90px'; res.scrollIntoView({ block: 'start', behavior: 'smooth' }); // chọn gói mới → cuộn tới kết quả, thấy ngay nút Nhập gói
        };
        body.append(h('div', { class: 'card' }, h('p', {}, 'Nhận gói .dgvc do nhà máy khác gửi: kỳ tính (bên vận chuyển gửi bên thuê), danh mục (nhà máy nào sửa danh mục cũng gửi được), phiếu cân.'), h('button', { class: 'btn primary', onclick: pick }, 'Chọn gói…')), res);
      } else if (tab === 'export') {
        const f = D.form([{ key: 'packageType', label: 'Loại gói', type: 'select', options: [['DANH_MUC', 'Danh mục (đơn vị, xe, tuyến, giá, hợp đồng)'], ['KY_TINH', 'Kỳ tính đã xác nhận / đã khóa'], ['PHIEU_CAN', 'Phiếu cân theo khoảng ngày']] },
          { key: 'targetUnitCode', label: 'Gửi cho nhà máy', type: 'select', options: [['', '— tất cả —'], ...D.state.boot.units.filter((u) => u.unit_code !== D.state.boot.install.unitCode).map((u) => [u.unit_code, `${u.unit_code} · ${u.unit_name}`])] },
          { key: 'dateFrom', label: 'Phiếu cân từ ngày', type: 'date' }, { key: 'dateTo', label: 'đến ngày', type: 'date' }], { packageType: 'DANH_MUC' });
        const periods = (await D.api('periods.list', {})).items.filter((x) => x.origin === 'LOCAL' && x.role === 'CARRIER' && ['DA_XAC_NHAN', 'DA_KHOA'].includes(x.status));
        const checks = periods.map((x) => ({ x, c: h('input', { type: 'checkbox', value: x.period_id }) }));
        body.append(h('div', { class: 'card' }, f, h('h2', { style: { marginTop: '14px' } }, 'Kỳ (với gói Kỳ tính)'), checks.length ? h('div', {}, checks.map(({ x, c }) => h('label', { class: 'check' }, c, `${x.period_code} → ${x.customer}`))) : h('p', { class: 'muted small' }, 'Chưa có kỳ đã xác nhận để gửi.'),
          h('div', { class: 'btns', style: { marginTop: '14px' } }, h('button', { class: 'btn primary', disabled: !D.writer(), onclick: async () => {
            const v = f.values(); const periodIds = checks.filter((k) => k.c.checked).map((k) => k.x.period_id);
            const target = window.dgvc ? await D.pickFile({ title: 'Lưu gói', save: true, defaultPath: 'goi.dgvc' }) : '';
            const r = await D.api('exchange.exportPackage', { ...v, periodIds, targetPath: target || undefined });
            D.toast(`Đã xuất gói ${r.file}${r.remindersMarked ? ` · đánh dấu ${r.remindersMarked} thay đổi danh mục đã gửi ${v.targetUnitCode}` : ''}`, 'ok', 9000);
          } }, 'Xuất gói'))));
      } else {
        const d = await D.api('exchange.list');
        body.append(h('div', { class: 'card flush' }, D.table({ rows: d.items, columns: [{ key: 'created_at', label: 'Lúc', fmt: 'datetime' }, { key: 'direction', label: 'Chiều' }, { key: 'package_type', label: 'Loại' },
          { key: 'source_unit_code', label: 'Từ' }, { key: 'target_unit_code', label: 'Cho' }, { key: 'file_name', label: 'File' }, { key: 'counts_json', label: 'Số dòng' }, { key: 'created_by', label: 'Người' }] })));
      }
      return D.page('Trao đổi dữ liệu', 'Gói .dgvc giữa các nhà máy', [], tabs, body);
    },
  };

  // ───────── Lịch sử thao tác ─────────
  D.views.audit = {
    async render() {
      const f = D.form([{ key: 'username', label: 'Người' }, { key: 'action', label: 'Hành động' }, { key: 'entity', label: 'Đối tượng' }, { key: 'dateFrom', label: 'Từ ngày', type: 'date' }, { key: 'dateTo', label: 'Đến ngày', type: 'date' }], {});
      f.className = 'filters'; const out = h('div', { class: 'card flush' });
      const PAGE = 200; let pg = 1; const guard = D.latest();
      const load = async (opts) => { if (opts === true || (opts && opts.reset)) pg = 1; const tok = guard.next(); const d = await D.api('audit.list', { ...f.values(), page: pg, pageSize: PAGE }); if (!guard.ok(tok)) return; out.innerHTML = '';
        out.append(D.table({ rows: d.items, onRow: (r) => D.modal({ title: `${r.action} · ${r.entity} ${r.entity_id}`, body: h('div', {}, h('p', {}, `${D.dt(r.ts)} · ${r.username}${r.reason ? ` · lý do: ${r.reason}` : ''}`),
          h('div', { class: 'grid g2' }, h('div', {}, h('h2', {}, 'Trước'), h('pre', { class: 'small mono', style: { whiteSpace: 'pre-wrap' } }, pretty(r.before_json))), h('div', {}, h('h2', {}, 'Sau'), h('pre', { class: 'small mono', style: { whiteSpace: 'pre-wrap' } }, pretty(r.after_json))))) }),
        columns: [{ key: 'ts', label: 'Lúc', fmt: 'datetime' }, { key: 'username', label: 'Người' }, { key: 'action', label: 'Hành động' }, { key: 'entity', label: 'Đối tượng' }, { key: 'entity_id', label: 'Mã' }, { key: 'reason', label: 'Lý do' }] }), D.pager({ total: d.total, page: pg, pageSize: PAGE, goto: (n) => { pg = n; load(); } })); };
      const page = D.page('Lịch sử thao tác', '10 · Audit', [], h('div', { class: 'card' }, h('div', { class: 'filters' }, f, h('button', { class: 'btn primary', onclick: () => load({ reset: true }) }, 'Lọc'))), out);
      await load(); return page;
    },
  };
  const pretty = (s) => { try { return JSON.stringify(JSON.parse(s || 'null'), null, 1); } catch { return s; } };

  // ───────── Cài đặt ─────────
  D.views.settings = {
    async render(p) {
      const tab = p.tab || 'backup'; const admin = D.can('ADMIN');
      const tabs = h('div', { class: 'tabs', role: 'tablist' }, [['backup', 'Dữ liệu & sao lưu'], ['params', 'Tham số tính'], ['units', 'Công ty & xe'], ['users', 'Người dùng'], ['info', 'Thông tin']].map(([k, t]) => h('button', { role: 'tab', 'aria-selected': String(tab === k), onclick: () => D.go('settings', { tab: k }) }, t)));
      const body = h('div');
      if (tab === 'backup') {
        const b = await D.api(admin ? 'data.listBackups' : 'data.listBackups', {}, { quiet: true }).catch(() => ({ items: [], warning: null }));
        const cfg = D.state.boot.config;
        body.append(h('div', { class: 'grid g2' }, h('div', { class: 'card' }, h('h2', {}, 'Sao lưu'), h('p', { class: 'small' }, 'Tự động: bản hằng ngày (giữ 30) và hằng tháng (giữ 24) trong thư mục dữ liệu; bản an toàn trước khi khôi phục / nhập gói / đổi thư mục.'),
          b.warning ? h('p', {}, h('span', { class: 'tag warn' }, 'Cảnh báo'), ` ${b.warning.message}`) : h('p', { class: 'small' }, `Lần sao lưu gần nhất: ${D.dt(b.lastBackupAt)}`),
          h('div', { class: 'btns' }, h('button', { class: 'btn primary', onclick: async () => { const r = await D.api('data.backupNow', { note: 'thu cong' }); D.toast(`Đã sao lưu ${r.file}${r.mirrored ? (r.mirrored.ok ? ` · đã chép ra ${r.mirrored.path}` : ` · ${r.mirrored.message}`) : ''}`, r.mirrored && !r.mirrored.ok ? 'err' : 'ok', 9000); D.go('settings', { tab: 'backup' }); } }, 'Sao lưu ngay'),
            admin ? h('button', { class: 'btn', onclick: () => backupJson() }, 'Sao lưu JSON gửi máy khác…') : null,
            admin ? h('button', { class: 'btn', onclick: () => restoreFromFile() }, 'Khôi phục từ file…') : null),
          h('p', { class: 'small muted' }, 'Dữ liệu chính lưu trong kho SQLite và máy luôn tự sao lưu hằng ngày. Sao lưu JSON là bản phụ để gửi máy khác. Khôi phục từ file: chọn bản sao lưu SQL (.zip) hoặc bản JSON (.zip / manifest.json) — cả hai đều được.')),
        h('div', { class: 'card' }, h('h2', {}, 'Sao lưu ra ngoài (USB / Google Drive)'), h('p', { class: 'small mono' }, cfg.BACKUP_MIRROR_FOLDER || '(chưa chọn)'), h('p', { class: 'small' }, `Đang ${cfg.BACKUP_MIRROR_ENABLED === 'TRUE' ? 'BẬT' : 'TẮT'}`),
          b.lastMirror && !b.lastMirror.ok ? h('p', { role: 'alert', class: 'warn-line' }, h('span', { class: 'tag warn' }, 'Cảnh báo'), ` Lần chép ra ngoài gần nhất bị lỗi: ${b.lastMirror.message}`) : null,
          admin ? h('div', { class: 'btns' }, h('button', { class: 'btn', onclick: async () => { const f = await D.pickFolder('Chọn USB / thư mục Google Drive'); if (!f) return; await D.api('config.save', { key: 'BACKUP_MIRROR_FOLDER', value: f }); await D.api('config.save', { key: 'BACKUP_MIRROR_ENABLED', value: 'TRUE' }); await D.refreshBoot(); D.go('settings', { tab: 'backup' }); } }, 'Chọn thư mục…'),
            h('button', { class: 'btn', onclick: async () => { await D.api('config.save', { key: 'BACKUP_MIRROR_ENABLED', value: cfg.BACKUP_MIRROR_ENABLED === 'TRUE' ? 'FALSE' : 'TRUE' }); await D.refreshBoot(); D.go('settings', { tab: 'backup' }); } }, cfg.BACKUP_MIRROR_ENABLED === 'TRUE' ? 'Tắt' : 'Bật')) : null,
          h('div', { class: 'sep' }), h('h2', {}, 'Thư mục dữ liệu'), h('p', { class: 'small mono' }, D.state.boot.install.dataFolder),
          admin ? h('button', { class: 'btn', onclick: async () => { const f = await D.pickFolder('Chọn thư mục mới (trống), vd D:\\DGVC_DATA'); if (!f) return; if (!(await D.confirm({ title: 'Đổi thư mục dữ liệu', message: `Chép toàn bộ dữ liệu sang ${f} rồi dùng thư mục mới. Thư mục cũ giữ nguyên.` }))) return; await D.api('data.changeFolder', { newFolder: f }); await D.refreshBoot(); D.go('settings', { tab: 'backup' }); } }, 'Đổi sang ổ khác…') : null)),
        admin ? await archiveCard() : null,
        admin ? await storageCard() : null,
        h('div', { class: 'card flush' }, D.table({ rows: b.items, columns: [{ key: 'createdAt', label: 'Lúc', fmt: 'datetime' }, { key: 'kind', label: 'Loại' }, { key: 'name', label: 'File' }, { key: 'sizeBytes', label: 'Dung lượng (byte)', fmt: 'int' },
          { key: 'x', label: '', render: (r) => (admin ? h('button', { class: 'btn small danger', onclick: async () => { const reason = await D.confirm({ title: 'Khôi phục sao lưu', message: `Dữ liệu trở về lúc ${D.dt(r.createdAt)}. APP sao lưu an toàn hiện trạng trước.`, reason: true, danger: true }); if (!reason) return; await D.api('data.restore', { file: r.file, reason }); D.toast('Đã khôi phục', 'ok'); await D.refreshBoot(); D.go('dashboard'); } }, 'Khôi phục') : '') }], empty: 'Chưa có bản sao lưu' })));
      } else if (tab === 'params') {
        const d = await D.api('config.list');
        body.append(h('div', { class: 'card flush' }, D.table({ rows: d.items, onRow: admin ? (r) => D.formModal({ title: r.config_key, fields: [{ key: 'value', label: `Giá trị (${r.value_type})`, full: true }, { key: 'reason', label: 'Lý do', full: true }], values: { value: r.config_value },
          submit: async (v) => { await D.api('config.save', { key: r.config_key, value: v.value, reason: v.reason }); await D.refreshBoot(); D.go('settings', { tab: 'params' }); } }) : null,
        columns: [{ key: 'config_key', label: 'Tham số' }, { key: 'config_value', label: 'Giá trị' }, { key: 'description', label: 'Ý nghĩa' }, { key: 'updated_by', label: 'Sửa bởi' }] })));
      } else if (tab === 'units') {
        const [u, v, cs] = await Promise.all([D.api('units.list'), D.api('vehicles.list'), D.api('contracts.list')]);
        const me = D.state.boot.install.unitCode; const mine = u.items.find((x) => x.unit_code === me); const partners = u.items.filter((x) => x.unit_code !== me);
        const UF = [{ key: 'unitCode', label: 'Mã công ty', required: true }, { key: 'unitName', label: 'Tên công ty', required: true, full: true }, { key: 'docDisplayName', label: 'Tên ghi trên chứng từ', full: true, hint: 'in trên BKVC / bảng kê (vd "CN Công ty TNHH Hoàng Anh Khôi")' },
          { key: 'shortName', label: 'Tên ngắn' }, { key: 'unitType', label: 'Loại', type: 'select', options: [['CONG_TY', 'Công ty'], ['CHI_NHANH', 'Chi nhánh']] }, { key: 'taxCode', label: 'MST' }, { key: 'phone', label: 'Điện thoại' }, { key: 'address', label: 'Địa chỉ', full: true }, { key: 'email', label: 'Email' },
          { key: 'legalRepSalutation', label: 'Người đại diện — xưng hô', type: 'select', options: [['', '—'], ['Ông', 'Ông'], ['Bà', 'Bà']] }, { key: 'legalRepName', label: 'Người đại diện (ký hợp đồng)' }, { key: 'legalRepTitle', label: 'Chức danh' },
          { key: 'bankName', label: 'Ngân hàng' }, { key: 'bankAccount', label: 'Số tài khoản' },
          { key: 'signPriority', label: 'Thứ tự ký (số nhỏ ký Giám đốc)', type: 'number' }, { key: 'accountantName', label: 'Kế toán ký BKVC' }, { key: 'factoryName', label: 'Nhà máy' }, { key: 'nameAliases', label: 'Tên khác trong file cân (;)', full: true }];
        const uv = (x) => ({ unitCode: x.unit_code, unitName: x.unit_name, docDisplayName: x.doc_display_name, shortName: x.short_name, unitType: x.unit_type, taxCode: x.tax_code, address: x.address, phone: x.phone, email: x.email, legalRepSalutation: x.legal_rep_salutation, legalRepName: x.legal_rep_name, legalRepTitle: x.legal_rep_title,
          bankName: x.bank_name, bankAccount: x.bank_account, signPriority: x.sign_priority, accountantName: x.accountant_name, factoryName: x.factory_name, nameAliases: x.name_aliases });
        const reminder = (r) => { for (const w of r.warnings || []) D.toast(w.message, 'info', 9000); };
        const editUnit = (x, title) => D.formModal({ title, fields: UF.map((f) => (f.key === 'unitCode' ? { ...f, readonly: true } : f)), values: uv(x), wide: true, submit: async (val) => { reminder(await D.api('units.save', { record: val, rowVersion: x.row_version })); await D.refreshBoot(); D.go('settings', { tab: 'units' }); } });
        // quan hệ của đối tác với công ty mình, suy ra từ hợp đồng
        const rel = (code) => { const a = cs.items.some((c) => c.carrier_unit_code === me && c.customer_unit_code === code); const b2 = cs.items.some((c) => c.customer_unit_code === me && c.carrier_unit_code === code); return a && b2 ? 'Bên thuê + bên vận chuyển' : a ? 'Bên thuê vận chuyển' : b2 ? 'Bên vận chuyển cho mình' : 'Chưa có hợp đồng'; };
        const kv = (k, val) => h('div', { class: 'kv' }, h('span', { class: 'small muted' }, k), h('b', {}, val || '—'));
        body.append(h('div', { class: 'head' }, h('h2', { class: 'grow' }, 'Công ty vận chuyển (công ty dùng phần mềm này)'), D.writer() && mine ? h('button', { class: 'btn', onclick: () => editUnit(mine, `Công ty ${mine.unit_code}`) }, 'Sửa thông tin công ty') : null),
          mine ? h('div', { class: 'card company-card' }, h('div', { class: 'company-grid' }, kv('Mã', mine.unit_code), kv('Tên công ty', mine.unit_name), kv('Tên trên chứng từ', mine.doc_display_name), kv('MST', mine.tax_code), kv('Địa chỉ', mine.address), kv('Điện thoại', mine.phone), kv('Email', mine.email),
            kv('Người đại diện', [mine.legal_rep_salutation, mine.legal_rep_name].filter(Boolean).join(' ') + (mine.legal_rep_title ? ` — ${mine.legal_rep_title}` : '')), kv('Ngân hàng', mine.bank_name), kv('Số tài khoản', mine.bank_account), kv('Kế toán ký BKVC', mine.accountant_name))) : h('p', { class: 'muted' }, `Chưa có công ty ${me} trong danh mục.`),
          h('div', { class: 'head' }, h('h2', { class: 'grow' }, 'Công ty đối tác'), D.writer() ? h('button', { class: 'btn', onclick: () => D.formModal({ title: 'Thêm công ty đối tác', fields: UF, values: { unitType: 'CONG_TY', signPriority: 50 }, wide: true, submit: async (x) => { reminder(await D.api('units.save', { create: true, record: x })); await D.refreshBoot(); D.go('settings', { tab: 'units' }); } }) }, 'Thêm đối tác') : null),
          h('p', { class: 'small muted' }, 'Danh mục các công ty làm việc với bạn: bên thuê vận chuyển, bên giao dầu, chủ xe… Bấm vào một dòng để sửa.'),
          h('div', { class: 'card flush' }, D.table({ rows: partners, onRow: D.writer() ? (x) => editUnit(x, `Đối tác ${x.unit_code}`) : null,
            columns: [{ key: 'unit_code', label: 'Mã' }, { key: 'unit_name', label: 'Tên' }, { key: 'x', label: 'Quan hệ', render: (r) => rel(r.unit_code) }, { key: 'tax_code', label: 'MST' }, { key: 'phone', label: 'Điện thoại' }, { key: 'address', label: 'Địa chỉ' }], empty: 'Chưa có công ty đối tác' })),
          h('div', { class: 'head' }, h('h2', { class: 'grow' }, 'Xe'), D.writer() ? h('button', { class: 'btn', onclick: () => D.formModal({ title: 'Thêm xe', fields: [{ key: 'plateNo', label: 'Biển số', required: true, hint: 'vd 92H-00057' }, { key: 'ownerUnitCode', label: 'Chủ xe', type: 'select', options: D.unitOptions() }, { key: 'fuelCode', label: 'Mã xe trong bảng kê dầu', hint: 'vd DH_92H00057' }], values: { ownerUnitCode: D.state.boot.install.unitCode },
            submit: async (x) => { reminder(await D.api('vehicles.save', { create: true, record: x })); D.go('settings', { tab: 'units' }); } }) }, 'Thêm xe') : null),
          h('div', { class: 'card flush' }, D.table({ rows: v.items, onRow: D.writer() ? (x) => vehicleEdit(x, reminder) : null,
            columns: [{ key: 'plate_no', label: 'Biển số' }, { key: 'owner_unit_code', label: 'Chủ xe' }, { key: 'fuel_code', label: 'Mã xe dầu' }, { key: 'note', label: 'Ghi chú' }, { key: 'is_active', label: 'Đang dùng', fmt: 'bool' }] })),
          D.writer() ? h('p', { class: 'small muted' }, 'Bấm vào 1 xe để sửa chủ xe, mã xe dầu, ghi chú, sửa biển số nhập nhầm, ngừng dùng hoặc xóa xe nhập nhầm.') : null);
      } else if (tab === 'users') {
        if (!admin) { body.append(h('p', { class: 'muted' }, 'Chỉ ADMIN quản lý người dùng.')); } else {
          const d = await D.api('users.list');
          const UF = [{ key: 'username', label: 'Tên đăng nhập (email)', required: true }, { key: 'fullName', label: 'Họ tên' }, { key: 'role', label: 'Vai trò', type: 'select', options: [['KE_TOAN', 'Kế toán'], ['XEM', 'Chỉ xem'], ['ADMIN', 'ADMIN']] },
            { key: 'unitCode', label: 'Đơn vị', type: 'select', options: D.unitOptions(true) }, { key: 'canUnlock', label: 'Được mở khóa kỳ', type: 'check' }, { key: 'isActive', label: 'Đang hoạt động', type: 'check' }];
          // hiện MÃ KÍCH HOẠT đúng một lần (server không lưu mã gốc)
          const showCode = (username, r) => D.modal({ title: `Mã kích hoạt của ${username}`, body: h('div', {}, h('p', {}, 'Gửi mã này cho người dùng để đặt mật khẩu lần đầu:'),
            h('p', { class: 'mono', style: { fontSize: '28px', letterSpacing: '4px', margin: '8px 0' } }, r.setupCode),
            h('p', { class: 'small muted' }, `Hết hạn: ${new Date(r.setupCodeExpiresAt).toLocaleString('vi-VN')}. Mã chỉ hiện một lần — đóng hộp thoại là không xem lại được (cần mã mới thì bấm "Đặt lại mật khẩu").`)),
            actions: [{ label: 'Sao chép', run: async () => { try { await navigator.clipboard.writeText(r.setupCode); D.toast('Đã sao chép mã', 'ok'); } catch { D.toast('Không sao chép được — hãy chép tay mã trên màn hình', 'err'); } return false; } }, { label: 'Đã ghi lại mã', primary: true, run: () => true }] });
          body.append(h('div', { class: 'head' }, h('span', { class: 'grow' }), h('button', { class: 'btn primary', onclick: () => D.formModal({ title: 'Thêm người dùng', fields: UF, values: { role: 'KE_TOAN', unitCode: D.state.boot.install.unitCode, isActive: true }, submit: async (x) => { const r = await D.api('users.save', { record: x }); D.toast('Đã thêm người dùng — cấp mã kích hoạt cho họ', 'ok'); showCode(x.username, r); D.go('settings', { tab: 'users' }); } }) }, 'Thêm người dùng')),
            h('div', { class: 'card flush' }, D.table({ rows: d.items, onRow: (x) => D.modal({ title: x.username, body: D.form(UF.map((f) => (f.key === 'username' ? { ...f, readonly: true } : f)), x), actions: [
              { label: 'Đặt lại mật khẩu', run: async () => { const r = await D.api('users.resetPassword', { username: x.username }); D.toast('Đã đặt lại — cấp mã kích hoạt cho người dùng', 'ok'); showCode(x.username, r); D.go('settings', { tab: 'users' }); return true; } }, // đóng hộp sửa (rowVersion đã đổi) và nạp lại danh sách
              { label: 'Lưu', primary: true, run: async () => { const f = document.querySelector('.modal .form'); await D.api('users.save', { record: f.values ? f.values() : {}, rowVersion: x.rowVersion }); D.go('settings', { tab: 'users' }); } }] }), // khóa lạc quan: người sửa sau nhận lỗi xung đột phiên bản
            columns: [{ key: 'username', label: 'Tên đăng nhập' }, { key: 'fullName', label: 'Họ tên' }, { key: 'role', label: 'Vai trò' }, { key: 'unitCode', label: 'Đơn vị' }, { key: 'canUnlock', label: 'Mở khóa', fmt: 'bool' },
              { key: 'hasPassword', label: 'Đã đặt mật khẩu', fmt: 'bool' }, { key: 'isActive', label: 'Hoạt động', fmt: 'bool' }, { key: 'lastLoginAt', label: 'Đăng nhập gần nhất', fmt: 'datetime' }] })));
        }
      } else {
        const i = D.state.boot.install; const hl = await D.api('system.health', {}, { quiet: true }).catch(() => null);
        body.append(h('div', { class: 'card' }, h('table', { class: 't' }, h('tbody', {}, [['Phiên bản APP', i.appVersion], ['Bản cài', `${i.unitCode} · ${i.unitName}`], ['Mã bản cài', i.installId], ['Thư mục dữ liệu', i.dataFolder], ['schemaVersion', i.schemaVersion], ['dataVersion', i.dataVersion],
          ['Số file dữ liệu', hl ? hl.files : '']].map(([k, v]) => h('tr', {}, h('td', {}, k), h('td', { class: 'mono' }, v)))))));
      }
      return D.page('Cài đặt', '11 · Cài đặt', [], tabs, body);
    },
  };
})();
