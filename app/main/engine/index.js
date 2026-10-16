'use strict';
/** Calculation Engine — điểm vào duy nhất. Toàn bộ là hàm thuần (không đọc/ghi file, không phụ thuộc Electron). */
module.exports = {
  ...require('./rounding'),
  ...require('./formulas'),
  ...require('./config'),
  ...require('./words'),
  ...require('./signers'),
  ...require('./trace'),
  ...require('./issues'),
  ...require('./period'),
};
