'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AppContext } = require('../main/app/AppContext');
const { AuthService } = require('../main/services/AuthService');

test('Bảo mật 1.8.3: machine-state.json chặn mở lại ngoại lệ ADMIN đầu tiên khi khôi phục bản sao lưu cũ', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-auth-machinelock-'));
  const configFile = path.join(home, 'userData', 'dgvc-config.json');
  const dataFolder = path.join(home, 'DGVC_DATA');

  const ctx = new AppContext({ configFile });
  await ctx.init({ mode: 'NEW', dataFolder, unitCode: 'DH' });
  const auth = ctx.svc.auth;

  // 1. Bản cài mới tinh: chưa ai đặt mật khẩu, machine-state chưa có cờ
  assert.equal(auth.firstAdminOpen(), true, 'bản mới: ADMIN đầu tiên được mở');

  // 2. ADMIN đầu tiên đặt mật khẩu thành công
  await auth.setFirstPassword({ username: 'saoluucvhak@gmail.com', newPassword: 'HakGroup2026' });
  assert.equal(auth.firstAdminOpen(), false, 'đã đặt mật khẩu: firstAdminOpen đóng');

  // Kiểm tra machine-state.json được ghi
  const ms = ctx.readMachineState();
  assert.equal(ms.firstAdminCompleted, true, 'machine-state ghi nhận firstAdminCompleted = true');
  assert.ok(ms.completedAt, 'có thời điểm hoàn tất');

  // 3. Giả lập kẻ xấu hoặc người dùng khôi phục bản sao lưu cũ chụp lúc chưa có ai đặt mật khẩu
  // (xóa sạch password_hash, setup_code_hash, last_login_at của toàn bộ USERS)
  await ctx.store.transaction((tx) => {
    for (const u of ctx.store.all('USERS')) {
      tx.update('USERS', u.username, {
        password_hash: '',
        password_salt: '',
        password_algo: '',
        setup_code_hash: '',
        setup_code_salt: '',
        setup_code_expires_at: '',
        last_login_at: '',
      });
    }
  }, { user: 'test' });

  // Xác nhận DB lúc này hoàn toàn không có ai có mật khẩu hay mã kích hoạt
  assert.equal(ctx.store.find('USERS', (u) => u.password_hash || u.setup_code_hash || u.last_login_at).length, 0);

  // 4. Nhờ machine-state.json, firstAdminOpen VẪN PHẢI BẰNG FALSE!
  assert.equal(auth.firstAdminOpen(), false, 'khôi phục backup cũ: cờ máy giữ vững firstAdminOpen = false');

  // 5. Thử đặt mật khẩu không có mã kích hoạt -> Bị từ chối vì không còn ngoại lệ
  await assert.rejects(
    () => auth.setFirstPassword({ username: 'saoluucvhak@gmail.com', newPassword: 'NewPassword2026' }),
    (err) => {
      assert.equal(err.code, 'AUTH_FAILED');
      assert.match(err.message, /Mã kích hoạt không đúng hoặc đã hết hạn/i);
      return true;
    },
    'không cho phép đặt mật khẩu không cần mã'
  );

  ctx.store.close();
});

test('AuthService độc lập không có machineState: tương thích ngược hoạt động bình thường', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-auth-compat-'));
  const configFile = path.join(home, 'userData', 'dgvc-config.json');
  const dataFolder = path.join(home, 'DGVC_DATA');

  const ctx = new AppContext({ configFile });
  await ctx.init({ mode: 'NEW', dataFolder, unitCode: 'DH' });

  // Khởi tạo AuthService độc lập không truyền machineState
  const auth = new AuthService(ctx.store);
  assert.equal(auth.firstAdminOpen(), true, 'không có machineState: đọc theo DB như trước');
  await auth.setFirstPassword({ username: 'saoluucvhak@gmail.com', newPassword: 'HakGroup2026' });
  assert.equal(auth.firstAdminOpen(), false);

  ctx.store.close();
});
