'use strict';
/**
 * AuthService — tài khoản nội bộ (DATA_STORAGE_DESIGN §7).
 *  - Mật khẩu băm scrypt (N=16384, r=8, p=1, salt 16 byte). Không lưu / không log mật khẩu gốc.
 *  - Tài khoản mới / dữ liệu mẫu KHÔNG có mật khẩu → lần đầu đăng nhập phải đặt (≥ 8 ký tự, có chữ và số).
 *  - Sai LOGIN_MAX_FAILED lần liên tiếp → khóa LOGIN_LOCK_MINUTES phút.
 *  - ĐẶT MẬT KHẨU LẦN ĐẦU (1.6.1): cần MÃ KÍCH HOẠT dùng một lần (8 ký tự, hạn SETUP_CODE_HOURS giờ, mặc định 24) do ADMIN cấp khi tạo
 *    người dùng / đặt lại mật khẩu. Mã chỉ trả về đúng một lần, DB chỉ lưu băm scrypt (không audit/log mã gốc). Sai mã tính vào
 *    LOGIN_MAX_FAILED / LOGIN_LOCK_MINUTES như đăng nhập. NGOẠI LỆ bản cài mới: khi chưa có ADMIN đang hoạt động nào có mật khẩu
 *    (dữ liệu mẫu / cài mới tinh) thì MỘT tài khoản ADMIN được đặt mật khẩu không cần mã; ngay khi đã có 1 ADMIN có mật khẩu,
 *    mọi tài khoản còn lại bắt buộc dùng mã (firstAdminOpen()).
 *  - Phiên: token ngẫu nhiên chỉ trong bộ nhớ; không thao tác SESSION_IDLE_MINUTES → hết phiên.
 */
const crypto = require('node:crypto');
const { AppError, businessError } = require('../../shared/errors');

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const ALGO = 'scrypt:16384:8:1';
const cfgNum = (store, k, d) => { const r = store.all('CONFIG').find((c) => c.config_key === k); const v = Number(r && r.config_value); return Number.isFinite(v) && v > 0 ? v : d; };
const hash = (pw, salt) => crypto.scryptSync(pw, Buffer.from(salt, 'hex'), SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p }).toString('hex');
/** So hai chuỗi hex bằng thời gian không đổi; độ dài khác / hex hỏng (dữ liệu bị sửa tay, khôi phục lỗi) → false thay vì RangeError làm sập đăng nhập. */
function hexEq(a, b) {
  try { const x = Buffer.from(String(a || ''), 'hex'); const y = Buffer.from(String(b || ''), 'hex'); return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y); } catch { return false; }
}
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // bỏ 0 O 1 I L cho khỏi nhầm
const newSetupCode = () => Array.from({ length: 8 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');
const NO_CODE = { setup_code_hash: '', setup_code_salt: '', setup_code_expires_at: '' };
const publicUser = (u) => ({ username: u.username, fullName: u.full_name, unitCode: u.unit_code, role: u.role, canUnlock: !!u.can_unlock,
  isActive: !!u.is_active, hasPassword: !!u.password_hash, mustChangePassword: !!u.must_change_password, lockedUntil: u.locked_until || '', lastLoginAt: u.last_login_at || '', rowVersion: u.row_version });

function checkStrength(pw) {
  if (typeof pw !== 'string' || pw.length < 8 || !/[A-Za-zÀ-ỹ]/.test(pw) || !/\d/.test(pw)) {
    throw new AppError('VALIDATION_FAILED', 'Mật khẩu phải có ít nhất 8 ký tự, gồm cả chữ và số');
  }
}

const LOCAL_USERNAME = '.dgvc-local';
const loginSettings = (store) => store.loginSettings ?? { mode: 'LEGACY' };
const usernameKey = (value) => String(value || '').trim().toLowerCase();

function ownerAccount({ username, password } = {}, unitCode) {
  username = usernameKey(username);
  if (username === LOCAL_USERNAME || !/^[a-z0-9._@-]{3,64}$/.test(username)) {
    throw new AppError('VALIDATION_FAILED', 'Tên đăng nhập từ 3–64 ký tự gồm chữ, số hoặc . _ @ -');
  }
  checkStrength(password);
  const salt = crypto.randomBytes(16).toString('hex');
  return { username, full_name: username, unit_code: unitCode, role: 'ADMIN', can_unlock: true, is_active: true,
    password_hash: hash(password, salt), password_salt: salt, password_algo: ALGO, must_change_password: false,
    failed_attempts: 0, locked_until: '', last_login_at: '', ...NO_CODE };
}

class AuthService {
  constructor(store, { now = () => Date.now(), machineState = null } = {}) {
    this.store = store;
    this.sessions = new Map();
    this.now = now;
    this.machineState = machineState;
  }

  _getMachineState() {
    if (!this.machineState) return {};
    if (typeof this.machineState.get === 'function') return this.machineState.get() || {};
    return this.machineState;
  }

  _setMachineState(patch) {
    if (!this.machineState) return;
    if (typeof this.machineState.set === 'function') {
      this.machineState.set(patch);
    } else if (typeof this.machineState === 'object') {
      Object.assign(this.machineState, patch);
    }
  }

  _user(username) {
    const u = this.store.get('USERS', String(username || '').trim().toLowerCase());
    return u || null;
  }

  settings() {
    const setting = loginSettings(this.store);
    return { mode: setting.mode };
  }

  _localUser() {
    return { username: LOCAL_USERNAME, full_name: 'Người sử dụng', role: 'ADMIN', unit_code: this.store.unitCode, is_active: true, can_unlock: true };
  }

  openLocal() {
    if (this.settings().mode !== 'SINGLE') throw new AppError('FORBIDDEN', 'Bản cài yêu cầu đăng nhập bằng tài khoản');
    return this._newSession(this._localUser());
  }

  async setLoginMode({ mode, username, password, token }) {
    if (!['SINGLE', 'ACCOUNT'].includes(mode)) throw new AppError('VALIDATION_FAILED', 'Chọn cách sử dụng phần mềm');
    const initial = this.check(token).user;
    const requested = usernameKey(username);
    const owner = mode === 'ACCOUNT' ? ownerAccount({ username, password }, this.store.unitCode) : null;

    const error = await this.store.transaction((tx) => {
      const session = this.check(token);
      const setting = loginSettings(this.store);
      const current = setting.mode;
      if (session.user.role !== 'ADMIN' || session.user.username !== initial.username || current === mode) {
        throw new AppError('FORBIDDEN', 'Cách sử dụng đã thay đổi hoặc bạn không có quyền thay đổi');
      }
      if (mode === 'ACCOUNT') {
        if (current !== 'SINGLE') throw new AppError('FORBIDDEN', 'Bản cài đang dùng tài khoản đăng nhập');
        const existing = tx.get('USERS', owner.username);
        if (existing && setting.username !== owner.username) throw new AppError('DUPLICATE', 'Tên đăng nhập đã có trong dữ liệu cũ. Hãy chọn tên khác');
        if (existing) tx.update('USERS', owner.username, { ...owner, full_name: existing.full_name });
        else tx.insert('USERS', owner);
      } else {
        if (requested !== session.user.username) throw new AppError('AUTH_FAILED', 'Nhập lại tên và mật khẩu của tài khoản đang đăng nhập');
        const problem = this._checkCredentials(tx, requested, password);
        if (problem) return problem;
        tx.update('USERS', requested, { failed_attempts: 0, locked_until: '' });
      }
      tx.setManifest('loginSettings', { mode, username: owner ? owner.username : requested });
      tx.audit('CHANGE_LOGIN_MODE', 'DATA', this.store.installId, { mode: current }, { mode });
      return null;
    }, { user: initial.username });
    if (error) throw error;
    this.sessions.clear();
    return mode === 'SINGLE' ? this.openLocal() : { mode };
  }

  _idleMs() { return cfgNum(this.store, 'SESSION_IDLE_MINUTES', 60) * 60000; }

  /**
   * Bản cài MỚI TINH: chưa tài khoản nào (mọi vai trò, kể cả đã ngừng dùng) từng có mật khẩu, từng đăng nhập hay được cấp mã kích hoạt
   * VÀ máy này chưa từng hoàn thành thiết lập admin (firstAdminCompleted trong machine-state)
   * → ADMIN đầu tiên được đặt mật khẩu không cần mã.
   * Khắc phục 1.8.3: khi khôi phục bản sao lưu cũ (chưa có pass), cờ máy firstAdminCompleted vẫn giữ nguyên nên không bị mở lại ngoại lệ.
   */
  firstAdminOpen() {
    const ms = this._getMachineState() || {};
    const id = this.store.installId;
    const done = Array.isArray(ms.firstAdminInstalls) ? ms.firstAdminInstalls : [];
    if (id && done.includes(id)) return false; // cờ THEO TỪNG BẢN CÀI (installId): cài thêm một bản mới trên cùng máy vẫn được đặt admin đầu tiên
    const active = this.store.find('USERS', (u) => u.password_hash || u.setup_code_hash || u.last_login_at).length > 0;
    // cờ cũ 1.8.3 (một cờ cho cả máy): chỉ còn giữ cho bản cài đã có hoạt động tài khoản → ghi nhận cho bản cài này; bản cài trống thì không bị khóa nhầm
    if (ms.firstAdminCompleted && !Array.isArray(ms.firstAdminInstalls) && active && id) { this._setMachineState({ firstAdminInstalls: [id] }); return false; }
    return !active;
  }
  /** Số ADMIN đang hoạt động CÓ mật khẩu (đăng nhập được), trừ tài khoản `except`. */
  _loginAdmins(except = '') { return this.store.find('USERS', (u) => u.role === 'ADMIN' && u.is_active && u.password_hash && u.username !== except).length; }

  /** SINGLE_USER_MODE = TRUE và chỉ có 1 tài khoản đang hoạt động → tên để điền sẵn ở màn đăng nhập (vẫn bắt nhập mật khẩu). */
  singleUserName() {
    const on = String((this.store.all('CONFIG').find((c) => c.config_key === 'SINGLE_USER_MODE') || {}).config_value || '').toUpperCase() === 'TRUE';
    const act = this.store.find('USERS', (u) => u.is_active);
    return on && act.length === 1 ? act[0].username : '';
  }

  /** Sinh mã kích hoạt: trả { code, patch } — patch chỉ chứa băm + hạn. */
  _issueSetupCode() {
    const code = newSetupCode(); const salt = crypto.randomBytes(16).toString('hex'); const hours = cfgNum(this.store, 'SETUP_CODE_HOURS', 24);
    const expires = new Date(this.now() + hours * 3600000).toISOString();
    return { code, expires, patch: { setup_code_hash: hash(code, salt), setup_code_salt: salt, setup_code_expires_at: expires } };
  }

  usersNeedPassword() { return this.settings().mode === 'LEGACY' ? this.store.find('USERS', (u) => u.is_active && !u.password_hash).map((u) => u.username) : []; }

  _checkCredentials(tx, username, password) {
    const u = tx.get('USERS', username);
    if (!u || !u.is_active) return new AppError('AUTH_FAILED', 'Sai tên đăng nhập hoặc mật khẩu');
    if (u.locked_until && Date.parse(u.locked_until) > this.now()) {
      return new AppError('ACCOUNT_LOCKED', 'Tài khoản đang bị khóa do nhập sai mật khẩu nhiều lần', { lockedUntil: u.locked_until });
    }
    if (!u.password_hash) return new AppError('PASSWORD_NOT_SET', 'Tài khoản chưa có mật khẩu — hãy đặt mật khẩu lần đầu', { username });
    if (hexEq(hash(String(password || ''), u.password_salt), u.password_hash)) return null;
    const max = cfgNum(this.store, 'LOGIN_MAX_FAILED', 5);
    const n = (u.failed_attempts || 0) + 1;
    const minutes = cfgNum(this.store, 'LOGIN_LOCK_MINUTES', 15);
    const patch = n >= max ? { failed_attempts: 0, locked_until: new Date(this.now() + minutes * 60000).toISOString() } : { failed_attempts: n };
    tx.update('USERS', username, patch);
    if (patch.locked_until) {
      tx.audit('ACCOUNT_LOCKED', 'USERS', username);
      return new AppError('ACCOUNT_LOCKED', `Sai mật khẩu ${max} lần — tài khoản bị khóa ${minutes} phút`, { lockedUntil: patch.locked_until });
    }
    return new AppError('AUTH_FAILED', `Sai tên đăng nhập hoặc mật khẩu (còn ${max - n} lần thử)`);
  }

  async login({ username, password }) {
    const name = usernameKey(username);
    const out = await this.store.transaction((tx) => {
      const { mode, username: owner } = loginSettings(this.store);
      if (mode !== 'LEGACY' && (mode !== 'ACCOUNT' || owner !== name || !owner)) {
        return { error: new AppError('AUTH_FAILED', 'Sai tên đăng nhập hoặc mật khẩu') };
      }
      const error = this._checkCredentials(tx, name, password);
      if (error) return { error };
      const { after: user } = tx.update('USERS', name, { failed_attempts: 0, locked_until: '', last_login_at: tx.now });
      tx.audit('LOGIN', 'USERS', name);
      return { user, mode };
    }, { user: name });
    if (out.error) throw out.error;
    if (this.settings().mode !== out.mode) throw new AppError('SESSION_EXPIRED', 'Cách sử dụng đã thay đổi. Hãy mở lại phần mềm');
    return this._newSession(out.user);
  }

  async setFirstPassword({ username, newPassword, setupCode }) {
    if (this.settings().mode !== 'LEGACY') throw new AppError('FORBIDDEN', 'Chỉ dùng cho dữ liệu tài khoản cũ');
    const u = this._user(username);
    if (!u || !u.is_active) throw new AppError('NOT_FOUND', 'Không có tài khoản');
    if (u.password_hash) throw new AppError('FORBIDDEN', 'Tài khoản đã có mật khẩu — dùng đổi mật khẩu');
    if (u.locked_until && Date.parse(u.locked_until) > this.now()) {
      throw new AppError('ACCOUNT_LOCKED', `Tài khoản đang bị khóa đến ${new Date(Date.parse(u.locked_until)).toLocaleTimeString('vi-VN')} do nhập sai mã nhiều lần`, { lockedUntil: u.locked_until });
    }
    if (!(u.role === 'ADMIN' && !u.setup_code_hash && this.firstAdminOpen())) await this._checkSetupCode(u, setupCode); // ngoại lệ bản cài mới: ADMIN đầu tiên (chưa được cấp mã) không cần mã
    return this._setPassword(u, newPassword, 'SET_FIRST_PASSWORD', 'LEGACY');
  }

  async _checkSetupCode(u, code) {
    const given = String(code || '').trim().toUpperCase();
    const valid = !!(u.setup_code_hash && u.setup_code_salt && given && Date.parse(u.setup_code_expires_at) > this.now()
      && hexEq(hash(given, u.setup_code_salt), u.setup_code_hash));
    if (valid) return;
    const max = cfgNum(this.store, 'LOGIN_MAX_FAILED', 5); const n = (u.failed_attempts || 0) + 1;
    const patch = n >= max ? { failed_attempts: 0, locked_until: new Date(this.now() + cfgNum(this.store, 'LOGIN_LOCK_MINUTES', 15) * 60000).toISOString() } : { failed_attempts: n };
    await this.store.transaction((tx) => { tx.update('USERS', u.username, patch); if (patch.locked_until) tx.audit('ACCOUNT_LOCKED', 'USERS', u.username); }, { user: u.username });
    if (patch.locked_until) throw new AppError('ACCOUNT_LOCKED', `Nhập sai mã kích hoạt ${max} lần — tài khoản bị khóa ${cfgNum(this.store, 'LOGIN_LOCK_MINUTES', 15)} phút`, { lockedUntil: patch.locked_until });
    throw new AppError('AUTH_FAILED', `Mã kích hoạt không đúng hoặc đã hết hạn — nhờ ADMIN cấp lại (còn ${max - n} lần thử)`);
  }

  async changePassword({ token, oldPassword, newPassword }) {
    const s = this.check(token); const u = this._user(s.user.username);
    if (!u || s.mode === 'SINGLE') throw new AppError('FORBIDDEN', 'Bản cài đang dùng chế độ một người');
    if (!hexEq(hash(String(oldPassword || ''), u.password_salt), u.password_hash)) throw new AppError('AUTH_FAILED', 'Mật khẩu cũ không đúng');
    return this._setPassword(u, newPassword, 'CHANGE_PASSWORD', s.mode);
  }

  async _setPassword(u, pw, action, mode) {
    checkStrength(pw);
    const salt = crypto.randomBytes(16).toString('hex');
    await this.store.transaction((tx) => {
      if (this.settings().mode !== mode) throw new AppError('SESSION_EXPIRED', 'Cách sử dụng đã thay đổi. Hãy đăng nhập lại');
      tx.update('USERS', u.username, { password_hash: hash(pw, salt), password_salt: salt, password_algo: ALGO,
        must_change_password: false, failed_attempts: 0, locked_until: '', last_login_at: tx.now, ...NO_CODE },
      { expectedRowVersion: u.row_version });
      tx.audit(action, 'USERS', u.username);
    }, { user: u.username });
    if (u.role === 'ADMIN') {
      const ms = this._getMachineState() || {}; const done = Array.isArray(ms.firstAdminInstalls) ? ms.firstAdminInstalls : [];
      const id = this.store.installId;
      this._setMachineState({ firstAdminCompleted: true, firstAdminInstalls: id && !done.includes(id) ? [...done, id] : done, completedAt: new Date(this.now()).toISOString() });
    }
    if (this.settings().mode !== mode) throw new AppError('SESSION_EXPIRED', 'Cách sử dụng đã thay đổi. Hãy đăng nhập lại');
    return this._newSession(this._user(u.username));
  }

  _newSession(u) {
    const token = crypto.randomBytes(24).toString('hex');
    const s = { token, user: publicUser(u), lastSeen: this.now(), mode: this.settings().mode, installId: this.store.installId, passwordHash: u.password_hash };
    this.sessions.set(token, s);
    return { token, user: s.user };
  }

  /** Kiểm phiên cho mỗi lần gọi API; gia hạn khi còn hạn. */
  check(token) {
    const s = token && this.sessions.get(token);
    if (!s) throw new AppError('SESSION_EXPIRED', 'Chưa đăng nhập hoặc phiên đã hết — hãy đăng nhập lại');
    if (this.now() - s.lastSeen > this._idleMs()) { this.sessions.delete(token); throw new AppError('SESSION_EXPIRED', 'Không thao tác quá lâu — hãy đăng nhập lại'); }
    const setting = loginSettings(this.store);
    const u = s.mode === 'SINGLE' ? this._localUser() : this._user(s.user.username);
    const invalid = s.installId !== this.store.installId || s.mode !== setting.mode ||
      (setting.mode === 'ACCOUNT' && (setting.username !== u?.username || s.passwordHash !== u?.password_hash));
    if (invalid || !u || !u.is_active) { this.sessions.delete(token); throw new AppError('SESSION_EXPIRED', 'Tài khoản đã bị khóa'); }
    s.user = publicUser(u); s.lastSeen = this.now();
    return s;
  }
  logout({ token }) { this.sessions.delete(token); return { ok: true }; }

  // ── quản lý người dùng (ADMIN) ──
  listUsers() { return { items: this.store.all('USERS').map(publicUser).sort((a, b) => a.username.localeCompare(b.username)) }; }

  async saveUser({ record, rowVersion, create, user }) {
    const username = String(record.username || '').trim().toLowerCase();
    if (!/^[a-z0-9._@-]{3,64}$/.test(username)) throw new AppError('VALIDATION_FAILED', 'Tên đăng nhập 3–64 ký tự: chữ thường, số, . _ @ -');
    const role = record.role || 'KE_TOAN';
    if (!['ADMIN', 'KE_TOAN', 'XEM'].includes(role)) throw new AppError('VALIDATION_FAILED', 'Vai trò phải là ADMIN / KE_TOAN / XEM');
    if (record.unitCode && !this.store.get('DON_VI', record.unitCode)) throw new AppError('VALIDATION_FAILED', `Không có đơn vị ${record.unitCode}`);
    const old = this.store.get('USERS', username);
    // rà soát 1.8.2: "Thêm người dùng" trùng tên trước đây SỬA LUÔN tài khoản cũ (mất vai trò / quyền mở khóa) mà vẫn báo "đã thêm"
    if (create && old) throw new AppError('DUPLICATE', `Tên đăng nhập ${username} đã có — mở tài khoản đó để sửa, hoặc chọn tên khác`);
    if (create === false && !old) throw new AppError('NOT_FOUND', `Không có tài khoản ${username}`);
    if (old && create !== true && !Number.isInteger(rowVersion)) throw new AppError('VALIDATION_FAILED', 'Sửa người dùng phải gửi rowVersion — tải lại danh sách rồi sửa lại', { field: 'rowVersion' });
    const patch = { full_name: String(record.fullName || username).trim(), unit_code: record.unitCode || '', role, can_unlock: !!record.canUnlock,
      is_active: record.isActive === undefined ? true : !!record.isActive };
    if (old && old.role === 'ADMIN' && (patch.role !== 'ADMIN' || !patch.is_active)) {
      const admins = this.store.find('USERS', (u) => u.role === 'ADMIN' && u.is_active && u.username !== username);
      if (!admins.length) throw new AppError('VALIDATION_FAILED', 'Phải còn ít nhất 1 ADMIN đang hoạt động');
      if (old.password_hash && !this._loginAdmins(username)) throw businessError('E_LAST_ADMIN', 'Đây là ADMIN cuối cùng đăng nhập được — không ngừng dùng / hạ vai trò (đặt mật khẩu cho ADMIN khác trước)');
    }
    const issued = old ? null : this._issueSetupCode(); // tài khoản mới: cấp mã kích hoạt (mã gốc chỉ trả một lần, không lưu)
    const out = await this.store.transaction((tx) => {
      if (old) { const { before, after } = tx.update('USERS', username, patch, { expectedRowVersion: rowVersion }); tx.audit('UPDATE', 'USERS', username, pick(before, patch), patch); return after; }
      const r = tx.insert('USERS', { username, ...patch, password_hash: '', password_salt: '', password_algo: '', must_change_password: true, failed_attempts: 0, locked_until: '', last_login_at: '', ...issued.patch });
      tx.audit('CREATE', 'USERS', username, null, publicUser(r)); return r;
    }, { user: user.username });
    if (!out.is_active) for (const [t, s] of this.sessions) if (s.user.username === username) this.sessions.delete(t);
    return { record: publicUser(out), created: !old, ...(issued ? { setupCode: issued.code, setupCodeExpiresAt: issued.expires } : {}) };
  }

  async resetPassword({ username, user }) {
    const u = this._user(username); if (!u) throw new AppError('NOT_FOUND', `Không có tài khoản ${username}`);
    if (u.role === 'ADMIN' && u.is_active && u.password_hash && !this._loginAdmins(u.username)) {
      throw businessError('E_LAST_ADMIN', 'Đây là ADMIN cuối cùng đăng nhập được — không đặt lại mật khẩu (sẽ không còn ai vào được phần quản trị). Dùng "Đổi mật khẩu" hoặc đặt mật khẩu cho ADMIN khác trước');
    }
    const issued = this._issueSetupCode();
    await this.store.transaction((tx) => { tx.update('USERS', u.username, { password_hash: '', password_salt: '', password_algo: '', must_change_password: true, failed_attempts: 0, locked_until: '', ...issued.patch }); tx.audit('RESET_PASSWORD', 'USERS', u.username); }, { user: user.username });
    for (const [t, s] of this.sessions) if (s.user.username === u.username) this.sessions.delete(t);
    return { username: u.username, mustSetPassword: true, setupCode: issued.code, setupCodeExpiresAt: issued.expires };
  }
}
const pick = (o, p) => Object.fromEntries(Object.keys(p).map((k) => [k, o[k]]));

module.exports = { AuthService, checkStrength, ownerAccount, publicUser };
