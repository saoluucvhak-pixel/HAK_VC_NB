'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { AppError } = require('../../shared/errors');

const ALLOWED_EXTENSIONS = new Set([
  '.xlsx', '.xls', '.csv', '.pdf', '.zip', '.dgvc', '.json', '.txt', '.log', '.md'
]);

/**
 * Phòng thủ bảo mật cho host.openPath:
 * Chỉ cho phép mở thư mục hoặc tệp có định dạng tài liệu nằm trong danh sách cho phép.
 * Ngăn chặn tuyệt đối việc thực thi các tệp thực thi (.exe, .bat, .cmd, .ps1, v.v.) hoặc tệp nguy hiểm.
 */
function assertSafeOpenPath(targetPath) {
  if (typeof targetPath !== 'string' || !targetPath.trim() || targetPath.includes('\0')) {
    throw new AppError('VALIDATION_FAILED', 'Đường dẫn tệp không hợp lệ');
  }

  const resolved = path.resolve(targetPath);
  if (!fs.existsSync(resolved)) {
    throw new AppError('NOT_FOUND', 'Tệp hoặc thư mục không tồn tại: ' + targetPath);
  }

  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) {
    return resolved;
  }

  const ext = path.extname(resolved).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new AppError('FORBIDDEN', 'Không cho phép mở loại tệp này vì lý do bảo mật: ' + ext);
  }

  return resolved;
}

module.exports = {
  assertSafeOpenPath,
  ALLOWED_EXTENSIONS
};
