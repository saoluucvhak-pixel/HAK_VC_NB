'use strict';
/**
 * Người ký BKVC theo thứ tự đơn vị (chỉ đạo 24/09/2026): HAK → HAKQN → ĐH → CNHAK (DON_VI.sign_priority).
 * Bên có sign_priority NHỎ hơn ký bằng người ký chính (Võ Văn Phụng – Giám đốc), bên còn lại người ký phụ (Võ Thị Như Ngọc – Phó Giám đốc).
 * HOP_DONG.customer_signers_json / carrier_signers_json có giá trị → ghi đè.
 * Tên in trên chứng từ (người dùng đổi được): HOP_DONG.<bên>_print_name → DON_VI.doc_display_name ("tên ghi trên chứng từ") → DON_VI.unit_name.
 */
function parseOverride(s) {
  if (!s) return null;
  const v = typeof s === 'string' ? JSON.parse(s) : s;
  return Array.isArray(v) && v.length ? v : null;
}

function resolveSigners(contract, units, cfg) {
  const byCode = new Map(units.map((u) => [u.unit_code, u]));
  const carrier = byCode.get(contract.carrier_unit_code);
  const customer = byCode.get(contract.customer_unit_code);
  if (!carrier || !customer) throw new Error(`Hợp đồng ${contract.contract_code}: không tìm thấy đơn vị`);
  const carrierFirst = carrier.sign_priority < customer.sign_priority;
  const side = (u, isFirst, override, printName) => {
    const ov = parseOverride(override);
    return {
      unitCode: u.unit_code,
      unitName: (printName || u.doc_display_name || u.unit_name).trim().toUpperCase(),
      legalName: u.unit_name,
      nameSource: printName ? 'CONTRACT' : u.doc_display_name ? 'DOC_DISPLAY_NAME' : 'UNIT_NAME',
      address: u.address || '',
      taxCode: u.tax_code || '',
      signer: ov ? ov[0] : (isFirst ? cfg.signerPrimary : cfg.signerSecondary),
      accountant: ov && ov[1] ? ov[1].name : (u.accountant_name || null),
      source: ov ? 'OVERRIDE' : 'RULE',
    };
  };
  return {
    carrier: side(carrier, carrierFirst, contract.carrier_signers_json, contract.carrier_print_name),
    customer: side(customer, !carrierFirst, contract.customer_signers_json, contract.customer_print_name),
  };
}

module.exports = { resolveSigners };
