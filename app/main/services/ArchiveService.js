'use strict';
/**
 * ArchiveService — LƯU TRỮ THEO NĂM (bản 1.2.5, chốt 08/10/2026).
 *
 * "Lưu trữ đến hết năm Y" (ADMIN bấm tay, lúc nào cũng được — app chỉ cảnh báo):
 *   - chuyển khỏi kho đang dùng: phiếu cân, dòng dầu có ngày ≤ năm Y; các kỳ tính có Đến ngày ≤ năm Y cùng toàn bộ kết quả
 *     của kỳ (bảng tính, chi tiết phiếu / dầu, BKVC, lần tính); lịch sử thao tác ≤ năm Y.
 *   - kỳ nằm vắt qua năm (vd 28/12 – 03/01) hoặc dùng phiếu / dầu của năm sau → GIỮ LẠI, kèm mọi phiếu / dầu nó dùng.
 *   - dữ liệu lưu trữ nằm ở thư mục archive/<Y>/ (cùng định dạng, có SHA-256) + 1 file zip trong backups/archive (chép ra USB / Drive nếu bật).
 *   - mở app KHÔNG nạp năm lưu trữ. Báo cáo / tra cứu theo khoảng ngày chạm năm lưu trữ → tự mở năm đó ở chế độ CHỈ XEM.
 *   - thêm phiếu cân / dòng dầu / kỳ có ngày ≤ năm đã lưu trữ → chặn (E_YEAR_ARCHIVED), muốn nhập phải "Mở lại năm".
 *   - sao lưu hằng ngày chỉ gồm năm đang làm + danh mục.
 */
const fs = require('node:fs');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { AppError } = require('../../shared/errors');
const { sha256, writeAtomic } = require('../repo/Journal');
const { SCHEMA, encodeTable, decodeRows, partitionKey, relOf } = require('../repo/JsonStore');

const LINE_TABLES = { PHIEU_CAN: ['weigh1_date', 'ticket_id'], GIAO_NHAN_DAU: ['receive_date', 'receipt_id'] };
const PERIOD_CHILDREN = ['TRANSPORT_CALCULATION', 'TRANSPORT_DETAIL', 'FUEL_DETAIL', 'BKVC_LINE', 'CALC_RUN'];
const ARCH_TABLES = ['PHIEU_CAN', 'GIAO_NHAN_DAU', 'KY_TINH', ...PERIOD_CHILDREN, 'AUDIT_LOG'];
const USED = new Set(['CONFIRMED', 'LOCKED']);
const yearOf = (d) => (typeof d === 'string' && /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : 0);
const vn = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

class ArchiveService {
  constructor(store, { backup } = {}) { this.store = store; this.backup = backup; }

  _dir(y) { return path.join(this.store.root, 'archive', String(y)); }

  /** Thống kê theo năm: năm đang dùng (số phiếu, dầu, kỳ) + năm đã lưu trữ. */
  years() {
    const s = this.store; const live = new Map();
    const add = (y, k) => { if (!y) return; const o = live.get(y) || { tickets: 0, fuel: 0, periods: 0, drafts: 0 }; o[k]++; live.set(y, o); };
    for (const t of s.all('PHIEU_CAN')) if (!s.isMountedRow('PHIEU_CAN', t.ticket_id)) add(yearOf(t.weigh1_date), 'tickets');
    for (const r of s.all('GIAO_NHAN_DAU')) if (!s.isMountedRow('GIAO_NHAN_DAU', r.receipt_id)) add(yearOf(r.receive_date), 'fuel');
    for (const p of s.all('KY_TINH')) if (!s.isMountedRow('KY_TINH', p.period_id)) { add(yearOf(p.date_to), 'periods'); if (p.status === 'NHAP') add(yearOf(p.date_to), 'drafts'); }
    const arch = s.archives; const now = new Date().getFullYear();
    const ys = new Set([...live.keys(), ...Object.keys(arch).map(Number)]);
    const items = [...ys].sort((a, b) => b - a).map((y) => {
      const a = arch[y]; const l = live.get(y) || { tickets: 0, fuel: 0, periods: 0, drafts: 0 };
      return { year: y, archived: !!a, live: l, archive: a ? { ...a, periodIds: undefined, plates: undefined, contracts: undefined, folderOk: fs.existsSync(path.join(this._dir(y), 'archive-manifest.json')) } : null,
        mounted: s.mounted.has(String(y)), current: y >= now, canArchive: !a && y > s.archivedThrough && (l.tickets + l.fuel + l.periods > 0),
        canReopen: !!a && y === s.archivedThrough };
    });
    return { items, archivedThrough: s.archivedThrough, mounted: [...s.mounted.keys()] };
  }

  /** Kế hoạch lưu trữ đến hết năm Y: chọn dòng nào đi, dòng nào giữ lại (điểm cố định — kỳ vắt năm kéo theo phiếu/dầu của nó). */
  _plan(year) {
    const s = this.store; const Y = Number(year);
    const td = s.all('TRANSPORT_DETAIL'); const fd = s.all('FUEL_DETAIL');
    const refs = new Map(); // period → Set('T:id' | 'F:id')
    const ref = (pid, k) => { if (!refs.has(pid)) refs.set(pid, new Set()); refs.get(pid).add(k); };
    for (const d of td) ref(d.period_id, `T:${d.ticket_id}`);
    for (const d of fd) ref(d.period_id, `F:${d.receipt_id}`);
    const eligible = new Set([...s.all('PHIEU_CAN').filter((t) => yearOf(t.weigh1_date) <= Y).map((t) => `T:${t.ticket_id}`),
      ...s.all('GIAO_NHAN_DAU').filter((r) => yearOf(r.receive_date) <= Y).map((r) => `F:${r.receipt_id}`)]);
    const periods = s.all('KY_TINH');
    const arch = new Set(periods.filter((p) => yearOf(p.date_to) <= Y && [...(refs.get(p.period_id) || [])].every((k) => eligible.has(k))).map((p) => p.period_id));
    let changed = true;
    while (changed) {
      changed = false;
      const usedByLive = new Set();
      for (const p of periods) if (!arch.has(p.period_id)) for (const k of refs.get(p.period_id) || []) usedByLive.add(k);
      for (const pid of [...arch]) if ([...(refs.get(pid) || [])].some((k) => usedByLive.has(k))) { arch.delete(pid); changed = true; }
      if (!changed) {
        const lines = new Set([...eligible].filter((k) => !usedByLive.has(k)));
        const ids = { PHIEU_CAN: new Set(), GIAO_NHAN_DAU: new Set(), KY_TINH: arch };
        for (const k of lines) (k[0] === 'T' ? ids.PHIEU_CAN : ids.GIAO_NHAN_DAU).add(k.slice(2));
        for (const t of PERIOD_CHILDREN) { const pk = SCHEMA.tables[t].pk; ids[t] = new Set(s.all(t).filter((r) => arch.has(r.period_id)).map((r) => r[pk])); }
        ids.AUDIT_LOG = new Set(s.all('AUDIT_LOG').filter((a) => yearOf(a.ts) <= Y).map((a) => a.log_id));
        const keptPeriods = periods.filter((p) => yearOf(p.date_from) <= Y && !arch.has(p.period_id));
        const keptLines = [...eligible].filter((k) => usedByLive.has(k)).length;
        return { Y, ids, keptPeriods, keptLines };
      }
    }
    return null;
  }

  preview({ year }) {
    const s = this.store; const Y = Number(year);
    if (!(Y > 2000)) throw new AppError('VALIDATION_FAILED', 'Chọn năm');
    if (s.archives[Y]) throw new AppError('VALIDATION_FAILED', `Năm ${Y} đã lưu trữ`);
    if (Y <= s.archivedThrough) throw new AppError('VALIDATION_FAILED', `Đã lưu trữ đến hết năm ${s.archivedThrough}`);
    if (s.mounted.size) throw new AppError('VALIDATION_FAILED', 'Đang xem năm lưu trữ — bấm "Thôi xem" trước');
    const p = this._plan(Y); const ids = p.ids;
    const confirmed = new Set([...s.all('TRANSPORT_DETAIL').filter((d) => d.is_current && USED.has(d.usage_state)).map((d) => d.ticket_id)]);
    const fuelUsed = new Set([...s.all('FUEL_DETAIL').filter((d) => d.is_current && USED.has(d.usage_state)).map((d) => d.receipt_id)]);
    const tickets = s.all('PHIEU_CAN').filter((t) => ids.PHIEU_CAN.has(t.ticket_id) && !t.is_deleted);
    const fuel = s.all('GIAO_NHAN_DAU').filter((r) => ids.GIAO_NHAN_DAU.has(r.receipt_id) && !r.is_deleted);
    const per = s.all('KY_TINH').filter((k) => ids.KY_TINH.has(k.period_id));
    const drafts = per.filter((k) => k.status === 'NHAP');
    const unT = tickets.filter((t) => !confirmed.has(t.ticket_id)); const unF = fuel.filter((r) => !fuelUsed.has(r.receipt_id));
    const warnings = [];
    if (Y >= new Date().getFullYear()) warnings.push({ level: 'WARNING', message: `Năm ${Y} là năm hiện tại — sau khi lưu trữ sẽ KHÔNG nhập được phiếu cân / dầu / kỳ tính có ngày trong năm ${Y} cho tới khi mở lại năm` });
    if (drafts.length) warnings.push({ level: 'WARNING', message: `${drafts.length} kỳ còn NHÁP sẽ được lưu trữ (không tính lại / xác nhận được nữa): ${drafts.slice(0, 5).map((k) => k.period_code).join(', ')}${drafts.length > 5 ? '…' : ''}` });
    if (unT.length) warnings.push({ level: 'WARNING', message: `${vn(unT.length)} phiếu cân chưa nằm trong kỳ đã xác nhận / khóa nào — sau khi lưu trữ sẽ không còn được tính vào kỳ mới` });
    if (unF.length) warnings.push({ level: 'WARNING', message: `${vn(unF.length)} dòng dầu (${vn(Math.round(unF.reduce((a, r) => a + r.qty_liter, 0)))} lít) chưa tính vào kỳ đã xác nhận / khóa — sau khi lưu trữ sẽ KHÔNG còn được trừ vào kỳ sau` });
    if (p.keptPeriods.length) warnings.push({ level: 'INFO', message: `${p.keptPeriods.length} kỳ vắt sang năm sau / dùng dữ liệu năm sau được GIỮ LẠI cùng ${vn(p.keptLines)} phiếu / dòng dầu của chúng: ${p.keptPeriods.slice(0, 5).map((k) => k.period_code).join(', ')}` });
    const counts = Object.fromEntries(Object.entries(ids).map(([t, set]) => [t, set.size]));
    return { year: Y, counts, tickets: tickets.length, fuel: fuel.length, periods: per.length, drafts: drafts.length, unusedTickets: unT.length, unusedFuel: unF.length,
      keptPeriods: p.keptPeriods.map((k) => k.period_code), checks: warnings };
  }

  /** Lưu trữ đến hết năm Y. */
  async archive({ year, reason = '', user }) {
    const s = this.store; const Y = Number(year);
    const pv = this.preview({ year: Y });
    if (!Object.values(pv.counts).some((n) => n > 0)) throw new AppError('VALIDATION_FAILED', `Năm ${Y} không có dữ liệu để lưu trữ`);
    const safety = this.backup ? await this.backup.backup({ kind: 'safety', note: `truoc-luu-tru-${Y}`, user }) : null;
    await s.queue;
    const { ids } = this._plan(Y);
    // 1. ghi thư mục lưu trữ (tạm → đổi tên): xong hết mới bỏ khỏi kho đang dùng
    const dir = this._dir(Y); const tmp = `${dir}.tmp`;
    fs.rmSync(tmp, { recursive: true, force: true });
    if (fs.existsSync(dir)) fs.renameSync(dir, `${dir}.old-${Date.now()}`);
    const files = {}; const contracts = {}; const plates = new Set(); let minYear = Y;
    for (const t of ARCH_TABLES) {
      const def = SCHEMA.tables[t]; const rows = s.all(t).filter((r) => ids[t].has(r[def.pk]));
      const groups = new Map();
      for (const r of rows) {
        const k = def.partition ? partitionKey(def, r) : null; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r);
        if (r.contract_id) contracts[r.contract_id] = (contracts[r.contract_id] || 0) + 1;
        if (t === 'PHIEU_CAN' || t === 'GIAO_NHAN_DAU') { if (r.plate_no) plates.add(r.plate_no); const y = yearOf(t === 'PHIEU_CAN' ? r.weigh1_date : r.receive_date); if (y && y < minYear) minYear = y; }
      }
      for (const [key, list] of groups) {
        const data = encodeTable(t, key, list); const rel = relOf(t, key);
        writeAtomic(path.join(tmp, rel), data); files[rel] = { sha256: sha256(data), rows: list.length };
      }
    }
    const counts = pv.counts;
    const am = { app: 'DGVC', kind: 'ARCHIVE', year: Y, minYear, unitCode: s.unitCode, installId: s.manifest.installId, schemaVersion: SCHEMA.schemaVersion,
      createdAt: new Date().toISOString(), createdBy: user.username, reason, counts, periodIds: [...ids.KY_TINH], contracts, plates: [...plates].sort(), files };
    const amBuf = Buffer.from(JSON.stringify(am, null, 1));
    writeAtomic(path.join(tmp, 'archive-manifest.json'), amBuf);
    fs.renameSync(tmp, dir);
    // 2. file zip lưu trữ (giữ lâu dài, chép ra USB / Drive)
    const zipName = `DGVC_${s.unitCode}_LUU_TRU_DEN_HET_NAM_${Y}.zip`;
    const zdir = path.join(s.root, 'backups', 'archive'); fs.mkdirSync(zdir, { recursive: true });
    const zip = new AdmZip(); zip.addLocalFolder(dir); const zbuf = zip.toBuffer(); const zfile = path.join(zdir, zipName);
    fs.writeFileSync(`${zfile}.part`, zbuf); fs.renameSync(`${zfile}.part`, zfile);
    const mirrored = this.backup ? this.backup._mirror(zfile) : null;
    // 3. bỏ khỏi kho đang dùng + ghi manifest.archives (1 giao dịch)
    const entry = { year: Y, minYear, archivedAt: am.createdAt, by: user.username, reason, counts, manifestSha256: sha256(amBuf), zip: zipName, sizeBytes: zbuf.length,
      periodIds: am.periodIds, contracts, plates: am.plates };
    await s.transaction((tx) => {
      tx.allowArchived = true;
      for (const t of ARCH_TABLES) tx.removeMany(t, ids[t]);
      tx.setManifest('archives', { ...s.archives, [Y]: entry });
      tx.audit('ARCHIVE_YEAR', 'DATA', String(Y), null, { counts, zip: zipName }, { reason });
    }, { user: user.username });
    return { year: Y, counts, zip: zfile, sizeBytes: zbuf.length, mirrored, safetyBackup: safety && safety.file, warnings: [] };
  }

  _readArchive(y) {
    const dir = this._dir(y); const entry = this.store.archives[y];
    if (!entry) throw new AppError('NOT_FOUND', `Năm ${y} chưa lưu trữ`);
    const mp = path.join(dir, 'archive-manifest.json');
    if (!fs.existsSync(mp)) throw new AppError('NOT_FOUND', `Thiếu thư mục lưu trữ năm ${y} (archive/${y}) — bấm "Nạp file lưu trữ…" và chọn file ${entry.zip}`, { code: 'E_ARCHIVE_MISSING', year: y });
    const buf = fs.readFileSync(mp);
    if (entry.manifestSha256 && sha256(buf) !== entry.manifestSha256) throw new AppError('INTEGRITY_ERROR', `Thư mục lưu trữ năm ${y} không khớp (bị sửa / chép nhầm bản)`);
    const am = JSON.parse(buf); const rows = {};
    for (const [rel, meta] of Object.entries(am.files)) {
      const b = fs.readFileSync(path.join(dir, rel));
      if (sha256(b) !== meta.sha256) throw new AppError('INTEGRITY_ERROR', `File lưu trữ ${rel} năm ${y} bị sửa ngoài app`);
      const d = JSON.parse(b); (rows[d.table] ||= []).push(...decodeRows(d));
    }
    return { am, rows };
  }

  /** Mở năm lưu trữ để XEM (chỉ đọc): nạp vào bộ nhớ, đánh dấu từng dòng; mọi lệnh sửa các dòng này bị chặn. */
  async mount({ year }) {
    const s = this.store; const y = String(Number(year));
    if (s.mounted.has(y)) return { year: Number(y), mounted: true, already: true };
    await s.queue;
    const { rows } = this._readArchive(y); const mark = {};
    for (const [t, list] of Object.entries(rows)) {
      const pk = SCHEMA.tables[t].pk; mark[t] = new Set();
      for (const r of list) { if (s.pk[t].has(r[pk])) continue; s.data[t].push(r); mark[t].add(r[pk]); }
    }
    s.mounted.set(y, mark); s._reindex(Object.keys(mark));
    return { year: Number(y), mounted: true, rows: Object.values(mark).reduce((a, x) => a + x.size, 0) };
  }

  async unmount({ year } = {}) {
    const s = this.store; await s.queue;
    const ys = year ? [String(Number(year))] : [...s.mounted.keys()];
    for (const y of ys) {
      const mark = s.mounted.get(y); if (!mark) continue;
      for (const [t, set] of Object.entries(mark)) { const pk = SCHEMA.tables[t].pk; s.data[t] = s.data[t].filter((r) => !set.has(r[pk])); }
      s.mounted.delete(y); s._reindex(Object.keys(mark));
    }
    return { mounted: [...s.mounted.keys()] };
  }

  /** Báo cáo / tra cứu: khoảng ngày (hoặc kỳ) chạm năm lưu trữ → tự mở năm đó để xem. Trả danh sách năm vừa mở. */
  async ensureFor(p = {}) {
    const s = this.store; const arch = s.archives; const ys = Object.keys(arch);
    if (!ys.length || !p || typeof p !== 'object') return [];
    const want = new Set();
    const from = yearOf(p.dateFrom); const to = yearOf(p.dateTo) || 9999;
    if (p.dateFrom || p.dateTo) for (const y of ys) { const a = arch[y]; if (Number(y) >= (from || 0) && (a.minYear || Number(y)) <= to) want.add(y); }
    const pid = p.periodId;
    if (pid && !s.get('KY_TINH', pid)) for (const y of ys) if ((arch[y].periodIds || []).includes(pid)) want.add(y);
    const done = [];
    for (const y of want) if (!s.mounted.has(y)) { try { await this.mount({ year: y }); done.push(Number(y)); } catch { /* thiếu thư mục: báo ở màn hình lưu trữ */ } }
    return done;
  }

  /** Mở lại năm lưu trữ (năm lưu trữ gần nhất): đưa dữ liệu trở lại kho đang dùng. */
  async reopen({ year, reason = '', user }) {
    const s = this.store; const y = String(Number(year));
    if (!s.archives[y]) throw new AppError('VALIDATION_FAILED', `Năm ${y} chưa lưu trữ`);
    if (Number(y) !== s.archivedThrough) throw new AppError('VALIDATION_FAILED', `Mở lại theo thứ tự từ năm mới nhất: mở năm ${s.archivedThrough} trước`);
    if (!reason) throw new AppError('VALIDATION_FAILED', 'Mở lại năm phải nhập lý do');
    await this.unmount({ year: y });
    const { rows } = this._readArchive(y);
    if (this.backup) await this.backup.backup({ kind: 'safety', note: `truoc-mo-lai-${y}`, user });
    const counts = {};
    await s.transaction((tx) => {
      tx.allowArchived = true;
      for (const t of ARCH_TABLES) if (rows[t]) counts[t] = tx.restoreRows(t, rows[t]);
      const rest = { ...s.archives }; delete rest[y];
      tx.setManifest('archives', Object.keys(rest).length ? rest : undefined);
      tx.audit('REOPEN_YEAR', 'DATA', y, null, { counts }, { reason });
    }, { user: user.username });
    const dir = this._dir(y); fs.renameSync(dir, `${dir}.mo-lai-${Date.now()}`); // giữ bản cũ, không xóa
    return { year: Number(y), counts };
  }

  /** Máy mới / khôi phục: nạp lại thư mục lưu trữ năm từ file zip lưu trữ. */
  async restoreFile({ file }) {
    const s = this.store;
    if (!file || !fs.existsSync(file)) throw new AppError('NOT_FOUND', `Không có file ${file || ''}`);
    let zip; try { zip = new AdmZip(file); } catch (e) { throw new AppError('INTEGRITY_ERROR', `File lưu trữ hỏng: ${e.message}`); }
    const mb = zip.readFile('archive-manifest.json'); if (!mb) throw new AppError('VALIDATION_FAILED', 'Không phải file lưu trữ năm DGVC');
    const am = JSON.parse(mb); const entry = s.archives[am.year];
    if (!entry) throw new AppError('VALIDATION_FAILED', `Kho dữ liệu này không có năm lưu trữ ${am.year}`);
    if (am.installId !== s.manifest.installId) throw new AppError('VALIDATION_FAILED', `File lưu trữ của bản cài khác (${am.unitCode} · ${am.installId})`);
    if (entry.manifestSha256 !== sha256(mb)) throw new AppError('INTEGRITY_ERROR', `File lưu trữ năm ${am.year} không đúng bản đã lưu trữ`);
    const dir = this._dir(am.year); const tmp = `${dir}.tmp`;
    fs.rmSync(tmp, { recursive: true, force: true }); zip.extractAllTo(tmp, true);
    if (fs.existsSync(dir)) fs.renameSync(dir, `${dir}.old-${Date.now()}`);
    fs.renameSync(tmp, dir);
    this._readArchive(am.year); // kiểm SHA-256 từng file
    return { year: am.year, ok: true };
  }

  /** Hợp đồng / xe có dữ liệu trong năm lưu trữ (để chặn xóa / đổi biển số). */
  refs() {
    const contracts = {}; const plates = new Set();
    for (const a of Object.values(this.store.archives)) { for (const [c, n] of Object.entries(a.contracts || {})) contracts[c] = (contracts[c] || 0) + n; for (const p of a.plates || []) plates.add(p); }
    return { contracts, plates };
  }
}

module.exports = { ArchiveService, ARCH_TABLES };
