'use strict';
/** Lỗi ứng dụng có mã (API_DESIGN §8.1). details: dữ liệu kèm theo cho giao diện. */
class AppError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}
const businessError = (issueCode, message, extra = {}) => new AppError('BUSINESS_RULE', message, { code: issueCode, ...extra });

module.exports = { AppError, businessError };
