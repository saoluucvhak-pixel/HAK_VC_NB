'use strict';
/**
 * rentMath — công thức tiền THUÊ vận chuyển dùng CHUNG cho Đối chiếu 3 tiêu chí (ReconcileService.compare) và Báo cáo thuê vận chuyển
 * (SubcontractService.report). Một nơi duy nhất để hai màn không bao giờ lệch nhau:
 *   tiền thuê  = làm tròn(khối lượng kg ÷ 1000 × đơn giá thuê đ/tấn)          — TÍNH THEO TỪNG XE rồi cộng lại
 *   tiền dầu   = làm tròn(số lít × đơn giá dầu đ/lít)
 *   dầu trừ    = tiền dầu nếu đợt có "trừ dầu", ngược lại 0
 *   thực trả   = tiền thuê − dầu trừ
 */
const rentAmountOf = (kg, rentPrice) => Math.round(((Number(kg) || 0) / 1000) * (Number(rentPrice) || 0));
const fuelAmountOf = (liter, fuelPrice) => Math.round((Number(liter) || 0) * (Number(fuelPrice) || 0));
const tonOf = (kg) => Math.round(((Number(kg) || 0) / 1000) * 100) / 100;

/** Một xe (hoặc một bên của một xe): { rentAmount, fuelAmount, deductFuelAmount, payable }. */
function rentLine({ kg, liter, rentPrice, fuelPrice, deductFuel }) {
  const rentAmount = rentAmountOf(kg, rentPrice);
  const fuelAmount = fuelAmountOf(liter, fuelPrice);
  const deductFuelAmount = deductFuel ? fuelAmount : 0;
  return { rentAmount, fuelAmount, deductFuelAmount, payable: rentAmount - deductFuelAmount };
}

module.exports = { rentAmountOf, fuelAmountOf, tonOf, rentLine };
