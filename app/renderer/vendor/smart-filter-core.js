// ===== HAK SMART FILTER — lõi thuần dữ liệu (V10.3) =====
// Một đặc tả cấu hình cho MỖI màn hình (screenId, fields, quickFields, advancedFields, dataSource, state, onApply, onReset, summary)
// dùng chung cho thanh lọc nhanh · bộ lọc nâng cao · chip điều kiện · bộ lọc đã lưu · dòng kết quả.
// Quy tắc: lọc CHỈ chọn dòng hiển thị — không tính lại lương, không sửa dữ liệu; mô tả điều kiện (scopeText) là MỘT chuỗi dùng chung
// cho chip, dòng kết quả, Excel, PDF, in → hiển thị = tổng = Excel = PDF = in. Điều kiện bộ lọc đã lưu mà màn hình không hỗ trợ
// KHÔNG bị bỏ âm thầm: được trả về trong `unsupported`.
// Trạng thái chuẩn: { q, tu, den, ky, sel:{khóa:[giá trị]}, one:{khóa:giá trị}, flag:{khóa:bool} } — ngày luôn dạng ISO yyyy-MM-dd (hiển thị dd/MM/yyyy ở UI).
(function (root) {
  "use strict";
  var NONE = "__NONE__", SCHEMA = 1, PRESET_KEY = "hak.sf.presets", LEGACY_RF = "hak.rf.presets";

  function fold(s) { return String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().trim(); }
  function str(v) { return String(v == null ? "" : v).trim(); }
  function isoDay(v) { var m = str(v).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); return m ? m[1] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[3]).slice(-2) : ""; }
  /** dd/MM/yyyy ⇄ ISO. Ngày không tồn tại (31/02) → null. */
  function parseVN(s) {
    s = str(s); if (!s) return "";
    var m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/), y, mo, d;
    if (m) { d = +m[1]; mo = +m[2]; y = +m[3]; } else { m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); if (!m) return null; y = +m[1]; mo = +m[2]; d = +m[3]; }
    var dt = new Date(Date.UTC(y, mo - 1, d)); if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return y + "-" + ("0" + mo).slice(-2) + "-" + ("0" + d).slice(-2);
  }
  function fmtVN(iso) { var n = isoDay(iso); return n ? n.slice(8, 10) + "/" + n.slice(5, 7) + "/" + n.slice(0, 4) : ""; }
  function list(v) { return (Array.isArray(v) ? v : v == null || v === "" ? [] : [v]).map(function (x) { return String(x); }).filter(function (x) { return x !== ""; }); }

  // ---------- kỳ ⇄ khoảng ngày ----------
  /** Kỳ "yyyy-MM" → [từ, đến] (ISO). */
  function periodBounds(ky) {
    var m = str(ky).match(/^(\d{4})-(\d{2})$/); if (!m || +m[2] < 1 || +m[2] > 12) return null;
    var last = new Date(Date.UTC(+m[1], +m[2], 0)).getUTCDate();
    return [ky + "-01", ky + "-" + ("0" + last).slice(-2)];
  }
  /** Chọn kỳ → điền khoảng ngày của kỳ. Kỳ rỗng = bỏ khoảng ngày. */
  function setPeriod(state, ky) {
    var s = clone(state), b = periodBounds(ky);
    if (b) { s.ky = ky; s.tu = b[0]; s.den = b[1]; } else { s.ky = ""; s.tu = ""; s.den = ""; }
    return s;
  }
  /** Sửa tay ngày → chuyển sang "tùy chọn" (ky rỗng), trừ khi khoảng ngày vẫn trùng đúng cả một kỳ. */
  function setDates(state, tu, den) {
    var s = clone(state); s.tu = tu || ""; s.den = den || "";
    var k = s.tu ? s.tu.slice(0, 7) : "", b = periodBounds(k);
    s.ky = b && b[0] === s.tu && b[1] === s.den ? k : "";
    return s;
  }
  /** Từ ≤ đến. Trả "" nếu hợp lệ, ngược lại thông báo (không tự đổi chỗ hai ngày). */
  function dateProblem(state) {
    if (state.tu && state.den && state.tu > state.den) return "Từ ngày lớn hơn đến ngày — không có dòng nào khớp";
    return "";
  }

  // ---------- trạng thái ----------
  function empty() { return { q: "", tu: "", den: "", ky: "", sel: {}, one: {}, flag: {} }; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  /** Chuẩn hóa trạng thái bất kỳ (từ UI/đã lưu): ép kiểu, bỏ khóa lạ so với config nếu có. */
  function normalize(state, cfg) {
    state = state || {};
    var s = empty(), keys = cfg ? fieldKeys(cfg) : null;
    s.q = str(state.q); s.tu = isoDay(state.tu); s.den = isoDay(state.den); s.ky = periodBounds(state.ky) ? state.ky : "";
    Object.keys(state.sel || {}).forEach(function (k) { if (!keys || keys[k]) { var v = list(state.sel[k]); if (v.length) s.sel[k] = v; } });
    Object.keys(state.one || {}).forEach(function (k) { if ((!keys || keys[k]) && str(state.one[k]) !== "") s.one[k] = str(state.one[k]); });
    Object.keys(state.flag || {}).forEach(function (k) { if ((!keys || keys[k]) && state.flag[k]) s.flag[k] = true; });
    return s;
  }
  function fieldKeys(cfg) { var m = {}; (cfg.fields || []).forEach(function (f) { m[f.key] = f; }); return m; }
  function isEmpty(state) {
    var s = normalize(state);
    return !s.q && !s.tu && !s.den && !Object.keys(s.sel).length && !Object.keys(s.one).length && !Object.keys(s.flag).length;
  }
  /** Số điều kiện đang áp dụng (khoảng ngày tính 1; mỗi trường chọn tính 1). */
  function activeCount(state) {
    var s = normalize(state);
    return (s.q ? 1 : 0) + (s.tu || s.den ? 1 : 0) + Object.keys(s.sel).length + Object.keys(s.one).length + Object.keys(s.flag).length;
  }

  // ---------- mô tả điều kiện (dùng cho chip, kết quả, Excel, PDF, in) ----------
  function optLabel(f, v) {
    if (v === NONE) return "(không có)";
    var os = typeof f.options === "function" ? f.options() : (f.options || []);
    for (var i = 0; i < os.length; i++) { var o = os[i]; if (typeof o === "string" ? o === v : String(o.value) === v) return typeof o === "string" ? o : o.label; }
    return v;
  }
  /** [{ id, kind, key, text }] — thứ tự cố định: tìm → kỳ/ngày → các trường theo thứ tự khai báo. */
  function conditions(cfg, state) {
    var s = normalize(state), out = [], fk = fieldKeys(cfg);
    if (s.q) out.push({ id: "q", kind: "q", text: "Tìm: " + s.q });
    if (s.tu || s.den) {
      var txt = s.ky && !hasCustomDates(s) ? "Kỳ " + s.ky.slice(5) + "/" + s.ky.slice(0, 4) : "Ngày: " + (s.tu ? fmtVN(s.tu) : "…") + " → " + (s.den ? fmtVN(s.den) : "…");
      out.push({ id: "date", kind: "date", text: txt });
    }
    (cfg.fields || []).forEach(function (f) {
      if (f.type === "multi" && s.sel[f.key]) { var v = s.sel[f.key]; out.push({ id: f.key, kind: "sel", key: f.key, text: f.label + ": " + (v.length === 1 ? optLabel(f, v[0]) : v.length + " mục") }); }
      if (f.type === "enum" && s.one[f.key] != null) out.push({ id: f.key, kind: "one", key: f.key, text: f.label + ": " + optLabel(f, s.one[f.key]) });
      if (f.type === "bool" && s.flag[f.key]) out.push({ id: f.key, kind: "flag", key: f.key, text: f.label });
    });
    Object.keys(s.sel).concat(Object.keys(s.one), Object.keys(s.flag)).forEach(function (k) { // điều kiện không có trong fields: vẫn hiện, không bỏ âm thầm
      if (!fk[k]) out.push({ id: k, kind: "unknown", key: k, text: "Điều kiện màn hình này không lọc được: " + ((cfg.labelOf && cfg.labelOf(k)) || k) });
    });
    return out;
  }
  function hasCustomDates(s) { var b = periodBounds(s.ky); return !b || b[0] !== s.tu || b[1] !== s.den; }
  /** Chuỗi phạm vi lọc duy nhất cho dòng kết quả / Excel / PDF / in. */
  function scopeText(cfg, state, fallback) {
    var c = conditions(cfg, state).map(function (x) { return x.text; });
    return c.length ? c.join(" · ") : (fallback || "Tất cả (không lọc)");
  }
  /** Gỡ một điều kiện (theo id của conditions) → trạng thái mới. */
  function remove(state, cond) {
    var s = normalize(state);
    if (cond.id === "q") s.q = ""; else if (cond.id === "date") { s.tu = ""; s.den = ""; s.ky = ""; }
    else { delete s.sel[cond.key]; delete s.one[cond.key]; delete s.flag[cond.key]; }
    return s;
  }
  /** Đặt giá trị cho 1 trường (multi: mảng; enum: chuỗi; bool: boolean). Rỗng = gỡ. */
  function setField(state, f, val) {
    var s = normalize(state);
    if (f.type === "multi") { var v = list(val); if (v.length) s.sel[f.key] = v; else delete s.sel[f.key]; }
    else if (f.type === "enum") { if (str(val) !== "") s.one[f.key] = str(val); else delete s.one[f.key]; }
    else if (f.type === "bool") { if (val) s.flag[f.key] = true; else delete s.flag[f.key]; }
    return s;
  }
  function getField(state, f) { var s = normalize(state); return f.type === "multi" ? (s.sel[f.key] || []).slice() : f.type === "enum" ? (s.one[f.key] == null ? "" : s.one[f.key]) : !!s.flag[f.key]; }

  // ---------- áp dụng lên dòng ----------
  /** Lọc dòng theo cấu hình (cfg.fields[i].match(row, giá trị, ctx)); cfg.matchQ(row, qFolded, ctx); cfg.matchDate(row, tu, den, ctx).
   *  Trường không có `match` mà người dùng đã chọn → vào `unsupported` (UI phải hiển thị, không bỏ âm thầm).
   *  @returns { rows, total, kept, unsupported:[key] } */
  function filterRows(rows, cfg, state, ctx) {
    var s = normalize(state), src = rows || [], tests = [], unsupported = [], q = fold(s.q);
    if (q) { if (cfg.matchQ) tests.push(function (r) { return cfg.matchQ(r, q, ctx); }); else unsupported.push("q"); }
    if (s.tu || s.den) { if (cfg.matchDate) tests.push(function (r) { return cfg.matchDate(r, s.tu, s.den, ctx); }); else unsupported.push("date"); }
    (cfg.fields || []).forEach(function (f) {
      var val = f.type === "multi" ? s.sel[f.key] : f.type === "enum" ? s.one[f.key] : f.type === "bool" ? (s.flag[f.key] || undefined) : undefined;
      if (val === undefined) return;
      if (!f.match) { unsupported.push(f.key); return; }
      tests.push(function (r) { return f.match(r, val, ctx); });
    });
    var out = tests.length ? src.filter(function (r) { for (var i = 0; i < tests.length; i++) if (!tests[i](r)) return false; return true; }) : src.slice();
    return { rows: out, total: src.length, kept: out.length, unsupported: unsupported };
  }
  /** Khớp 1 giá trị với tập chọn nhiều (không phân biệt hoa thường/dấu); NONE khớp giá trị rỗng. */
  function inSet(sel, v) {
    if (!sel || !sel.length) return true;
    var x = str(v);
    if (!x) return sel.indexOf(NONE) >= 0;
    var fx = fold(x); return sel.some(function (s) { return s !== NONE && fold(s) === fx; });
  }
  /** Tìm không dấu trên nhiều cột. */
  function hay(parts) { return fold(parts.map(function (p) { return str(p); }).join(" ")); }

  // ---------- bộ lọc đã lưu (theo màn hình, có phiên bản lược đồ) ----------
  function memStore() { var m = {}; return { getItem: function (k) { return m[k] == null ? null : m[k]; }, setItem: function (k, v) { m[k] = String(v); } }; }
  function presets(storage) {
    storage = storage || memStore();
    function load() {
      var raw; try { raw = storage.getItem(PRESET_KEY); } catch (e) { raw = null; }
      var o = null; try { o = raw ? JSON.parse(raw) : null; } catch (e) { o = null; }
      if (!o || typeof o !== "object" || o.schema !== SCHEMA || typeof o.screens !== "object") {
        o = { schema: SCHEMA, screens: {} };
        if (raw) o.corrupt = true; // đọc lỗi/khác phiên bản: báo lại, không coi là "không có bộ lọc nào"
      }
      return o;
    }
    /** Bộ lọc báo cáo V8 (hak.rf.presets: {tên: spec}) — chỉ ĐỌC (không sao chép, không xóa): dùng cho các màn hình dùng thanh lọc báo cáo. */
    function legacy() {
      var raw; try { raw = storage.getItem(LEGACY_RF); } catch (e) { raw = null; }
      try { var o = raw ? JSON.parse(raw) : {}; return o && typeof o === "object" ? o : {}; } catch (e) { return {}; }
    }
    function save(o) { delete o.corrupt; try { storage.setItem(PRESET_KEY, JSON.stringify(o)); return true; } catch (e) { return false; } }
    return {
      list: function (screenId) { var s = load().screens[screenId] || {}; return Object.keys(s).sort(); },
      get: function (screenId, name) { var p = (load().screens[screenId] || {})[name]; return p ? p : null; },
      save: function (screenId, name, state, now) {
        name = str(name); if (!name) return { ok: false, msg: "Chưa đặt tên bộ lọc" };
        var o = load();
        if (o.corrupt) return { ok: false, corrupt: true, msg: "Kho bộ lọc đã lưu bị lỗi hoặc thuộc phiên bản khác — không ghi đè. Dùng discardCorrupt() để sao lưu bản cũ rồi tạo kho mới." }; (o.screens[screenId] = o.screens[screenId] || {})[name] = { state: normalize(state), savedAt: now || new Date().toISOString() };
        return save(o) ? { ok: true } : { ok: false, msg: "Không lưu được bộ lọc trên máy này" };
      },
      remove: function (screenId, name) { var o = load(); if (o.corrupt) return false; if (!o.screens[screenId] || !o.screens[screenId][name]) return false; delete o.screens[screenId][name]; return save(o); },
      isCorrupt: function () { return !!load().corrupt; },
      readCorrupt: function () {
        if (!load().corrupt) return null;
        try { return storage.getItem(PRESET_KEY); } catch (e) { return null; }
      },
      /** Chép nguyên văn sang một khóa sao lưu riêng trước khi tạo kho trống. */
      discardCorrupt: function () {
        if (!load().corrupt) return { ok: true, backedUp: false };
        var raw; try { raw = storage.getItem(PRESET_KEY); } catch (e) { return { ok: false, msg: "Không đọc được kho bộ lọc" }; }
        var prefix = PRESET_KEY + ".bak." + new Date().toISOString(), key = prefix, index = 0;
        try {
          while (storage.getItem(key) !== null) key = prefix + "." + (++index);
          storage.setItem(key, raw);
          storage.setItem(PRESET_KEY, JSON.stringify({ schema: SCHEMA, screens: {} }));
        } catch (e) { return { ok: false, msg: "Không sao lưu được kho bộ lọc cũ" }; }
        return { ok: true, backedUp: true, backupKey: key };
      },
      legacyNames: function () { return Object.keys(legacy()).sort(); },
      legacyGet: function (name) { var o = legacy(); return Object.prototype.hasOwnProperty.call(o, name) ? { legacy: o[name] } : null; }
    };
  }
  /** Mở bộ lọc đã lưu trên đúng màn hình: bỏ điều kiện màn hình không có, nhưng BÁO LẠI (dropped) — không bỏ âm thầm. */
  function applyPreset(cfg, preset) {
    if (!preset) return { state: empty(), dropped: [], ok: false };
    var raw = preset.state || (preset.legacy && cfg.fromLegacy ? cfg.fromLegacy(preset.legacy) : null);
    if (!raw) return { state: empty(), dropped: [], ok: false };
    var keys = fieldKeys(cfg), dropped = [], s = normalize(raw);
    ["sel", "one", "flag"].forEach(function (g) { Object.keys(s[g]).forEach(function (k) { if (!keys[k]) { dropped.push(k); delete s[g][k]; } }); });
    (cfg.fields || []).forEach(function (f) { // giá trị chọn không còn trong danh sách → vẫn giữ (có thể dữ liệu đã đổi) nhưng báo
      if (f.type === "multi" && s.sel[f.key] && typeof f.options === "function") {
        var have = {}; f.options().forEach(function (o) { have[typeof o === "string" ? o : String(o.value)] = 1; });
        var miss = s.sel[f.key].filter(function (v) { return v !== NONE && !have[v]; }); if (miss.length) dropped.push(f.key + "=" + miss.join("|"));
      }
    });
    return { state: s, dropped: dropped, ok: true };
  }

  var api = {
    NONE: NONE, SCHEMA: SCHEMA, fold: fold, isoDay: isoDay, parseVN: parseVN, fmtVN: fmtVN, periodBounds: periodBounds, setPeriod: setPeriod, setDates: setDates, dateProblem: dateProblem,
    empty: empty, normalize: normalize, isEmpty: isEmpty, activeCount: activeCount, conditions: conditions, scopeText: scopeText, remove: remove, setField: setField, getField: getField,
    filterRows: filterRows, inSet: inSet, hay: hay, presets: presets, applyPreset: applyPreset
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else { root.HAKCore = root.HAKCore || {}; root.HAKCore.sf = api; }
})(typeof self !== "undefined" ? self : this);
