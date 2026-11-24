'use strict';
/**
 * Kiểm thử sao lưu & khôi phục toàn vẹn phân hệ Thuê vận chuyển (subcontract/):
 *  - Cả kho SQLite và kho JSON đều đóng gói `subcontract/batches.json` + `subcontract/files/*.json` kèm SHA-256.
 *  - Khôi phục tại chỗ và khôi phục sang thư mục máy khác (`allowOtherInstall: true`) đều giữ nguyên 100% đợt nạp, phiếu cân, dầu và báo cáo.
 *  - Tệp subcontract trong gói zip bị sửa đổi bị `BackupService.verify()` phát hiện và chặn trước khi khôi phục.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { install, KETOAN, ADMIN } = require('./install');
const { newStore } = require('../main/repo/createStore');
const { BackupService } = require('../main/services/BackupService');
const { SubcontractService } = require('../main/services/SubcontractService');
const { ExchangeService } = require('../main/services/ExchangeService');

const SAMPLE_BATCH = {
  partnerName: 'CÔNG TY VẬN TẢI MINH LONG',
  batchName: 'Đợt sao lưu mẫu - VC.007',
  tickets: [
    { ticket_no: 'ML-001', weigh1_date: '2026-09-19', weigh1_time: '08:15:00', plate_no: '92H-00141', net_kg: 18500, route_code: 'VC.007' },
    { ticket_no: 'ML-002', weigh1_date: '2026-09-20', weigh1_time: '14:20:00', plate_no: '92H-00192', net_kg: 21500, route_code: 'VC.007' }
  ],
  fuel: [
    { receipt_no: 'D-ML-01', receipt_date: '2026-09-19', plate_no: '92H-00141', qty_liter: 120 }
  ]
};

for (const storageKind of ['sqlite', 'json']) {
  test(`Sao lưu và khôi phục nguyên vẹn thư mục subcontract/ trên kho ${storageKind} (kể cả sang thư mục máy khác)`, async () => {
    const prevEnv = process.env.DGVC_STORAGE;
    process.env.DGVC_STORAGE = storageKind;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `dgvc-sub-bak-${storageKind}-`));
    let store1 = null;
    let store2 = null;
    try {
      const ctx = await install('DH', { withData: false, installId: `INS-SUB1-${storageKind}`, kind: storageKind });
      store1 = ctx.store;
      assert.equal(store1.storageKind, storageKind);

      const sub1 = new SubcontractService(store1, { exchange: new ExchangeService(store1) });
      const imported = await sub1.importBatch({
        partnerName: SAMPLE_BATCH.partnerName,
        batchName: SAMPLE_BATCH.batchName,
        rentUnitPrice: 95000,
        fuelUnitPrice: 20000,
        deductFuel: true,
        jsonContent: SAMPLE_BATCH,
        user: KETOAN
      });
      assert.ok(imported.batchId);

      const reopen = (root) => newStore(root, {}, storageKind).open();
      const bakSvc1 = new BackupService(store1, { reopen });
      const backupOut = await bakSvc1.backup({ kind: 'manual', note: 'co-subcontract', user: ADMIN });

      // 1. Kiểm tra file zip sao lưu thực sự chứa batches.json và file chi tiết đợt kèm SHA-256
      const zip = new AdmZip(backupOut.file);
      const entryNames = zip.getEntries().map((e) => e.entryName.replace(/\\/g, '/'));
      assert.ok(entryNames.includes('subcontract/batches.json'), 'zip phải có subcontract/batches.json');
      assert.ok(entryNames.includes(`subcontract/files/${imported.batchId}.json`), 'zip phải có file chi tiết đợt');

      const copiedZip = path.join(tmpDir, 'portable_backup.zip');
      fs.copyFileSync(backupOut.file, copiedZip);

      // 2. Xóa sạch thư mục subcontract hiện tại rồi khôi phục tại chỗ
      fs.rmSync(path.join(store1.root, 'subcontract'), { recursive: true, force: true });
      assert.equal(sub1.list().length, 0);

      const restored1 = await bakSvc1.restore({ file: copiedZip, reason: 'Khôi phục lại đợt thuê VC', user: ADMIN });
      store1 = restored1.store;

      const subAfter1 = new SubcontractService(store1, { exchange: new ExchangeService(store1) });
      const list1 = subAfter1.list();
      assert.equal(list1.length, 1);
      assert.equal(list1[0].batchId, imported.batchId);
      const full1 = subAfter1.getBatch({ batchId: imported.batchId });
      assert.ok(full1.details, 'chi tiết đợt phải đọc lại được');
      assert.equal(full1.details.tickets.length, 2);
      assert.equal(full1.details.fuelRows.length, 1);

      // 3. Khôi phục sang một bản cài mới ở thư mục khác hoàn toàn (giả lập chuyển sang máy trạm khác)
      const ctx2 = await install('DH', { withData: false, installId: `INS-SUB2-${storageKind}`, kind: storageKind });
      store2 = ctx2.store;
      const bakSvc2 = new BackupService(store2, { reopen });
      const restored2 = await bakSvc2.restore({
        file: copiedZip,
        reason: 'Chuyển máy trạm mới',
        user: ADMIN,
        allowOtherInstall: true
      });
      store2 = restored2.store;

      // Xóa hẳn thư mục gốc của máy 1 để chắc chắn máy 2 không vô tình đọc đường dẫn tuyệt đối cũ!
      store1.close();
      fs.rmSync(store1.root, { recursive: true, force: true });
      store1 = null;

      const sub2 = new SubcontractService(store2, { exchange: new ExchangeService(store2) });
      const full2 = sub2.getBatch({ batchId: imported.batchId });
      assert.ok(full2.details, 'máy mới phải đọc file chi tiết trong thư mục của máy mới');
      assert.equal(full2.details.tickets.length, 2);
      const rep2 = sub2.report();
      assert.equal(rep2.rows.length, 1);
      assert.equal(rep2.rows[0].missingFile, false);
      assert.equal(rep2.rows[0].totalKg, 40000);
      assert.equal(rep2.rows[0].fuelLiter, 120);

      // 4. Giả lập file subcontract trong zip bị sửa trộm → verify() phải phát hiện sai SHA-256 và chặn
      const tamperedZipPath = path.join(tmpDir, 'tampered.zip');
      const tamperedZip = new AdmZip(copiedZip);
      tamperedZip.updateFile(`subcontract/files/${imported.batchId}.json`, Buffer.from('{"corrupted":true}'));
      tamperedZip.writeZip(tamperedZipPath);
      assert.throws(() => bakSvc2.verify(tamperedZipPath), (err) => err.code === 'INTEGRITY_ERROR');
    } finally {
      if (prevEnv === undefined) delete process.env.DGVC_STORAGE;
      else process.env.DGVC_STORAGE = prevEnv;
      try { if (store1) store1.close(); } catch { /* đã đóng */ }
      try { if (store2) store2.close(); } catch { /* đã đóng */ }
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* bỏ qua */ }
    }
  });
}
