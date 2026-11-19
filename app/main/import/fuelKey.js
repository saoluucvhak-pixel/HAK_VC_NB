'use strict';
/**
 * Khóa NỘI DUNG của một dòng giao nhận dầu — dùng chung ImportService (chống trùng khi nhập Excel) và ExchangeService (nghi trùng khi nhận gói trao đổi).
 * Hai dòng cùng khóa (và cùng hợp đồng) coi là cùng một lần giao; ghép 1-1 nên n dòng giống hệt hợp lệ vẫn giữ đủ n.
 */
const fuelContentKey = (r) => [r.receive_date, r.plate_no, r.qty_liter, r.fuel_price_excl_vat, r.purchase_date, r.giver_unit_code, r.route_code].join('|');
module.exports = { fuelContentKey };
