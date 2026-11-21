// V9.4 — Bộ lọc dùng chung: MỘT popover duy nhất (activeFilterId), lựa chọn nháp + Áp dụng/Hủy, định vị thông minh (portal ra <body>).
// Không render lại ứng dụng khi tick checkbox; chỉ khi bấm Áp dụng. Listener toàn cục gắn đúng một lần.
(function (root) {
  "use strict";
  var activeId = "", pop = null, anchor = null, draft = [], cfg = null, listeners = false;
  function fold(s) { return String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().trim(); }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === "text") e.textContent = attrs[k]; else if (k === "class") e.className = attrs[k]; else e.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  /** Nhãn ngắn trên thanh lọc: "Khối: Tất cả" / "Phòng ban (3)" — không bao giờ liệt kê giá trị. */
  function labelOf(name, selected, total) {
    var n = (selected || []).length;
    if (!n || (total && n >= total)) return name + ": Tất cả";
    return name + " (" + n + ")";
  }
  function position() {
    if (!pop || !anchor || !document.body.contains(anchor)) { close(); return; }
    var r = anchor.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight, W = Math.min(300, vw - 16);
    var left = Math.max(8, Math.min(r.left, vw - W - 8)), below = vh - r.bottom - 8, above = r.top - 8, up = below < 240 && above > below, room = Math.max(160, up ? above : below);
    pop.style.width = W + "px"; pop.style.left = left + "px"; pop.style.maxHeight = Math.min(room, 420) + "px";
    if (up) { pop.style.top = "auto"; pop.style.bottom = (vh - r.top + 4) + "px"; } else { pop.style.bottom = "auto"; pop.style.top = (r.bottom + 4) + "px"; }
    pop.setAttribute("data-dir", up ? "up" : "down");
  }
  function close() {
    var id = activeId;
    if (pop && pop.parentNode) pop.parentNode.removeChild(pop);
    if (anchor) { anchor.setAttribute("aria-expanded", "false"); anchor.classList.remove("on"); }
    pop = null; anchor = null; activeId = ""; cfg = null; draft = [];
    return id;
  }
  function ensureListeners() {
    if (listeners) return; listeners = true;
    document.addEventListener("mousedown", function (e) { if (!pop) return; if (pop.contains(e.target) || (anchor && anchor.contains(e.target))) return; close(); }, true);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && pop) { var a = anchor; close(); if (a && a.focus) a.focus(); } }, true);
    root.addEventListener("resize", function () { if (pop) position(); });
    document.addEventListener("scroll", function () { if (pop) position(); }, true);
  }
  function open(button, c) {
    if (activeId === c.id) { close(); return; } // bấm lại nút đang mở → đóng
    close();                                    // mở bộ lọc khác → đóng bộ lọc đang mở
    ensureListeners();
    activeId = c.id; anchor = button; cfg = c; draft = (c.selected || []).slice();
    button.setAttribute("aria-expanded", "true"); button.classList.add("on");
    var opts = (c.options || []).map(function (o) { return typeof o === "string" ? { value: o, label: o } : o; });
    pop = el("div", { class: "fpop", role: "dialog", "aria-label": c.label, "data-fpop": c.id });
    var q = el("input", { class: "i", placeholder: "Tìm (không dấu)…", "aria-label": "Tìm trong " + c.label });
    var list = el("div", { class: "fpop-list" }), count = el("span", { class: "hint" });
    var draw = function () {
      list.innerHTML = ""; var f = fold(q.value), shown = 0;
      opts.forEach(function (o) {
        if (f && fold(o.label).indexOf(f) < 0) return; shown++;
        var cb = el("input", { type: "checkbox" }); cb.checked = draft.indexOf(o.value) >= 0;
        cb.addEventListener("change", function () { var i = draft.indexOf(o.value); if (cb.checked && i < 0) draft.push(o.value); if (!cb.checked && i >= 0) draft.splice(i, 1); count.textContent = draft.length + "/" + opts.length + " đã chọn"; });
        list.appendChild(el("label", { class: "fpop-row" }, [cb, " " + o.label]));
      });
      if (!shown) list.appendChild(el("div", { class: "hint", text: "Không có lựa chọn khớp" }));
      count.textContent = draft.length + "/" + opts.length + " đã chọn";
    };
    q.addEventListener("input", draw);
    var selAll = el("button", { type: "button", class: "btn ghost", text: "Chọn tất cả" }), none = el("button", { type: "button", class: "btn ghost", text: "Bỏ chọn" });
    selAll.addEventListener("click", function () { var f = fold(q.value); opts.forEach(function (o) { if ((!f || fold(o.label).indexOf(f) >= 0) && draft.indexOf(o.value) < 0) draft.push(o.value); }); draw(); });
    none.addEventListener("click", function () { draft = []; draw(); });
    var cancel = el("button", { type: "button", class: "btn", text: "Hủy" }), ok = el("button", { type: "button", class: "btn pri", text: "Áp dụng" });
    cancel.addEventListener("click", function () { var a = anchor; close(); if (a && a.focus) a.focus(); });
    ok.addEventListener("click", function () {
      var out = draft.slice(), all = opts.length > 0 && out.length >= opts.length, fn = cfg.onApply; close();
      if (fn) fn(all ? [] : out); // chọn hết = không lọc
    });
    pop.appendChild(el("div", { class: "fpop-head" }, [el("b", { text: c.label }), q, el("div", { class: "fpop-tools" }, [selAll, none, count])]));
    pop.appendChild(list);
    pop.appendChild(el("div", { class: "fpop-foot" }, [cancel, ok]));
    document.body.appendChild(pop); draw(); position();
    q.focus();
  }
  /** Nút lọc: c = { id, label, options:[{value,label}|string], selected:[], onApply(arr) } */
  function button(c) {
    var b = el("button", { type: "button", class: "btn fbtn", "aria-haspopup": "dialog", "aria-expanded": "false", "data-fkey": c.id, title: (c.selected || []).length ? c.selected.join(", ") : "" });
    b.textContent = labelOf(c.label, c.selected, (c.options || []).length) + " ▾";
    if ((c.selected || []).length && (c.selected.length < (c.options || []).length)) b.classList.add("has");
    b.addEventListener("click", function (e) { e.preventDefault(); open(b, c); });
    return b;
  }
  /** Chip điều kiện đang áp dụng. items = [{ id, text, onRemove }]; > maxShow thì thu gọn. */
  function chips(items, o) {
    o = o || {}; var max = o.max || 4, box = el("div", { class: "fchips", "data-fchips": "1" });
    if (!items.length) return box;
    var collapsed = items.length > max && !o.expanded;
    if (collapsed) {
      var more = el("button", { type: "button", class: "btn ghost", text: "Đang áp dụng " + items.length + " bộ lọc — Xem chi tiết" });
      more.addEventListener("click", function () { if (o.onExpand) o.onExpand(); });
      box.appendChild(more);
    } else {
      items.forEach(function (it) {
        var x = el("button", { type: "button", class: "fchip", "aria-label": "Bỏ " + it.text, title: "Bỏ điều kiện này" }, [it.text + " ", el("span", { text: "×" })]);
        x.addEventListener("click", function () { it.onRemove(); }); box.appendChild(x);
      });
    }
    var clr = el("button", { type: "button", class: "btn ghost", text: "Xóa tất cả" }); clr.addEventListener("click", function () { if (o.onClear) o.onClear(); });
    box.appendChild(clr);
    return box;
  }
  var api = { button: button, chips: chips, close: close, active: function () { return activeId; }, labelOf: labelOf, fold: fold };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else { root.HAKUI = root.HAKUI || {}; root.HAKUI.filter = api; }
})(typeof self !== "undefined" ? self : this);
