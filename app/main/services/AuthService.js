'use strict';
/**
 * AuthService — tài khoản nội bộ (DATA_STORAGE_DESIGN §7).
 *  - Mật khẩu băm scrypt (N=16384, r=8, p=1, salt 16 byte). Không lưu / không log mật khẩu gốc.
 *  - Tài khoản mới / dữ liệu mẫu KHÔNG có mật khẩu → lần đầu đăng nhập phải đặt (≥ 8 ký tự, có chữ và số).
 *  - Sai LOGIN_MAX_FAILED lần liên tiếp → khóa LOGIN_LOCK_MINUTES phút.
 *  - Phiên: token ngẫu nhiên chỉ trong bộ nhớ; không thao tác SESSION_IDLE_MINUTES → hết phiên.
 */
const crypto = require('node:crypto');
const { AppError } = require('../../shared/errors');

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const ALGO = 'scrypt:16384:8:1';
const cfgNum = (store, k, d) => { const r = store.all('CONFIG').find((c) => c.config_key === k); const v = Number(r && r.config_value); return Number.isFinite(v) && v > 0 ? v : d; };
const hash = (pw, salt) => crypto.scryptSync(pw, Buffer.from(salt, 'hex'), SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p }).toString('hex');
const isoPlus = (ms) => new Date(Date.now() + ms).toISOString();
const publicUser = (u) => ({ username: u.username, fullName: u.full_name, unitCode: u.unit_code, role: u.role, canUnlock: !!u.can_unlock,
  isActive: !!u.is_active, hasPassword: !!u.password_hash, mustChangePassword: !!u.must_change_password, lockedUntil: u.locked_until || '', lastLoginAt: u.last_login_at || '' });

function checkStrength(pw) {
  if (typeof pw !== 'string' || pw.length < 8 || !/[A-Za-zÀ-ỹ]/.test(pw) || !/\d/.test(pw)) {
    throw new AppError('VALIDATION_FAILED', 'Mật khẩu phải có ít nhất 8 ký tự, gồm cả chữ và số');
  }
}

class AuthService {
  constructor(store, { now = () => Date.now() } = {}) { this.store = store; this.sessions = new Map(); this.now = now; }

  _user(username) {
    const u = this.store.get('USERS', String(username || '').trim().toLowerCase());
    return u || null;
  }
  _idleMs() { return cfgNum(this.store, 'SESSION_IDLE_MINUTES', 60) * 60000; }

  usersNeedPassword() { return this.store.find('USERS', (u) => u.is_active && !u.password_hash).map((u) => u.username); }

  async login({ username, password }) {
    const u = this._user(username);
    if (!u || !u.is_active) throw new AppError('AUTH_FAILED', 'Sai tên đăng nhập hoặc mật khẩu');
    if (u.locked_until && Date.parse(u.locked_until) > this.now()) {
      throw new AppError('ACCOUNT_LOCKED', `Tài khoản đang bị khóa đến ${new Date(Date.parse(u.locked_until)).toLocaleTimeString('vi-VN')} do nhập sai mật khẩu nhiều lần`, { lockedUntil: u.locked_until });
    }
    if (!u.password_hash) throw new AppError('PASSWORD_NOT_SET', 'Tài khoản chưa có mật khẩu — hãy đặt mật khẩu lần đầu', { username: u.username });
    const ok = crypto.timingSafeEqual(Buffer.from(hash(String(password || ''), u.password_salt), 'hex'), Buffer.from(u.password_hash, 'hex'));
    if (!ok) {
      const max = cfgNum(this.store, 'LOGIN_MAX_FAILED', 5); const n = (u.failed_attempts || 0) + 1;
      const patch = n >= max ? { failed_attempts: 0, locked_until: isoPlus(cfgNum(this.store, 'LOGIN_LOCK_MINUTES', 15) * 60000) } : { failed_attempts: n };
      await this.store.transaction((tx) => { tx.update('USERS', u.username, patch); if (patch.locked_until) tx.audit('ACCOUNT_LOCKED', 'USERS', u.username); }, { user: u.username });
      if (patch.locked_until) throw new AppError('ACCOUNT_LOCKED', `Sai mật khẩu ${max} lần — tài khoản bị khóa ${cfgNum(this.store, 'LOGIN_LOCK_MINUTES', 15)} phút`, { lockedUntil: patch.locked_until });
      throw new AppError('AUTH_FAILED', `Sai tên đăng nhập hoặc mật khẩu (còn ${max - n} lần thử)`);
    }
    await this.store.transaction((tx) => { tx.update('USERS', u.username, { failed_attempts: 0, locked_until: '', last_login_at: tx.now }); tx.audit('LOGIN', 'USERS', u.username); }, { user: u.username });
    return this._newSession(this._user(u.username));
  }

  async setFirstPassword({ username, newPassword }) {
    const u = this._user(username);
    if (!u || !u.is_active) throw new AppError('NOT_FOUND', 'Không có tài khoản');
    if (u.password_hash) throw new AppError('FORBIDDEN', 'Tài khoản đã có mật khẩu — dùng đổi mật khẩu');
    return this._setPassword(u, newPassword, 'SET_FIRST_PASSWORD');
  }

  async changePassword({ token, oldPassword, newPassword }) {
    const s = this.check(token); const u = this._user(s.user.username);
    if (!crypto.timingSafeEqual(Buffer.from(hash(String(oldPassword || ''), u.password_salt), 'hex'), Buffer.from(u.password_hash, 'hex'))) throw new AppError('AUTH_FAILED', 'Mật khẩu cũ không đúng');
    return this._setPassword(u, newPassword, 'CHANGE_PASSWORD');
  }

  async _setPassword(u, pw, action) {
    checkStrength(pw);
    const salt = crypto.randomBytes(16).toString('hex');
    await this.store.transaction((tx) => {
      tx.update('USERS', u.username, { password_hash: hash(pw, salt), password_salt: salt, password_algo: ALGO, must_change_password: false, failed_attempts: 0, locked_until: '', last_login_at: tx.now });
      tx.audit(action, 'USERS', u.username);
    }, { user: u.username });
    return this._newSession(this._user(u.username));
  }

  _newSession(u) {
    const token = crypto.randomBytes(24).toString('hex');
    const s = { token, user: publicUser(u), lastSeen: this.now() };
    this.sessions.set(token, s);
    return { token, user: s.user };
  }

  /** Kiểm phiên cho mỗi lần gọi API; gia hạn khi còn hạn. */
  check(token) {
    const s = token && this.sessions.get(token);
    if (!s) throw new AppError('SESSION_EXPIRED', 'Chưa đăng nhập hoặc phiên đã hết — hãy đăng nhập lại');
    if (this.now() - s.lastSeen > this._idleMs()) { this.sessions.delete(token); throw new AppError('SESSION_EXPIRED', 'Không thao tác quá lâu — hãy đăng nhập lại'); }
    const u = this._user(s.user.username);
    if (!u || !u.is_active) { this.sessions.delete(token); throw new AppError('SESSION_EXPIRED', 'Tài khoản đã bị khóa'); }
    s.user = publicUser(u); s.lastSeen = this.now();
    return s;
  }
  logout({ token }) { this.sessions.delete(token); return { ok: true }; }

  // ── quản lý người dùng (ADMIN) ──
  listUsers() { return { items: this.store.all('USERS').map(publicUser).sort((a, b) => a.username.localeCompare(b.username)) }; }

  async saveUser({ record, rowVersion, user }) {
    const username = String(record.username || '').trim().toLowerCase();
    if (!/^[a-z0-9._@-]{3,64}$/.test(username)) throw new AppError('VALIDATION_FAILED', 'Tên đăng nhập 3–64 ký tự: chữ thường, số, . _ @ -');
    const role = record.role || 'KE_TOAN';
    if (!['ADMIN', 'KE_TOAN', 'XEM'].includes(role)) throw new AppError('VALIDATION_FAILED', 'Vai trò phải là ADMIN / KE_TOAN / XEM');
    if (record.unitCode && !this.store.get('DON_VI', record.unitCode)) throw new AppError('VALIDATION_FAILED', `Không có đơn vị ${record.unitCode}`);
    const old = this.store.get('USERS', username);
    const patch = { full_name: String(record.fullName || username).trim(), unit_code: record.unitCode || '', role, can_unlock: !!record.canUnlock,
      is_active: record.isActive === undefined ? true : !!record.isActive };
    if (old && old.role === 'ADMIN' && (patch.role !== 'ADMIN' || !patch.is_active)) {
      const admins = this.store.find('USERS', (u) => u.role === 'ADMIN' && u.is_active && u.username !== username);
      if (!admins.length) throw new AppError('VALIDATION_FAILED', 'Phải còn ít nhất 1 ADMIN đang hoạt động');
    }
    const out = await this.store.transaction((tx) => {
      if (old) { const { before, after } = tx.update('USERS', username, patch, { expectedRowVersion: rowVersion }); tx.audit('UPDATE', 'USERS', username, pick(before, patch), patch); return after; }
      const r = tx.insert('USERS', { username, ...patch, password_hash: '', password_salt: '', password_algo: '', must_change_password: true, failed_attempts: 0, locked_until: '', last_login_at: '' });
      tx.audit('CREATE', 'USERS', username, null, publicUser(r)); return r;
    }, { user: user.username });
    if (!out.is_active) for (const [t, s] of this.sessions) if (s.user.username === username) this.sessions.delete(t);
    return { record: publicUser(out), created: !old };
  }

  async resetPassword({ username, user }) {
    const u = this._user(username); if (!u) throw new AppError('NOT_FOUND', `Không có tài khoản ${username}`);
    await this.store.transaction((tx) => { tx.update('USERS', u.username, { password_hash: '', password_salt: '', password_algo: '', must_change_password: true, failed_attempts: 0, locked_until: '' }); tx.audit('RESET_PASSWORD', 'USERS', u.username); }, { user: user.username });
    for (const [t, s] of this.sessions) if (s.user.username === u.username) this.sessions.delete(t);
    return { username: u.username, mustSetPassword: true };
  }
}
const pick = (o, p) => Object.fromEntries(Object.keys(p).map((k) => [k, o[k]]));

module.exports = { AuthService, checkStrength, publicUser };
