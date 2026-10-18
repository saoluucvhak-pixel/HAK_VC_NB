'use strict';
/** Chuyển đổi tiền ↔ INTEGER lưu DB (× MONEY_SCALE = 1000). */
const { D } = require('./money');

const MONEY_SCALE = 1000;

const toDb = (v) => (v === null || v === undefined || v === '' ? null : D(v).mul(MONEY_SCALE).toDecimalPlaces(0).toNumber());
const fromDb = (v) => (v === null || v === undefined ? null : D(v).div(MONEY_SCALE).toNumber());

module.exports = { MONEY_SCALE, toDb, fromDb };
