// ===== UI / HAK SMART FILTER (V10.3) — 3 tầng: thanh lọc nhanh · bộ lọc nâng cao (ngăn kéo) · dòng kết quả =====
// Thành phần: FilterToolbar · FilterPopover (ui/filter-popover.js) · FilterDrawer · FilterMultiSelect · FilterDateRange · FilterChips ·
// FilterPresetManager · FilterSummary. Cấu hình theo màn hình: { screenId, fields, quickFields, advancedFields, dataSource, state{get,set}, onApply, onReset, summary }.
// Quy tắc: đổi điều kiện CHỈ gọi cfg.onApply (màn hình tự vẽ lại bảng) rồi refresh() ở chỗ — không render lại toàn ứng dụng, không mất ô đang nhập.
// Đóng ngăn kéo / Hủy KHÔNG đổi gì; kỳ lương toàn ứng dụng (thanh trên cùng) KHÔNG bị bộ lọc này đổi.
(function (root) {
  "use strict";
  var SF = root.HAKCore.sf, FP = root.HAKUI && root.HAKUI.filter;

  function create(A) {
    var h = A.h, btn = A.btn;
    var store = null;
    function presetStore() { return store || (store = SF.presets(A.storage ? A.storage() : (function () { try { return root.localStorage; } catch (e) { return null; } })())); }

    // ---------- FilterMultiSelect: danh sách chọn nhiều có tìm không dấu, chọn tất cả / bỏ chọn ----------
    function multiSelect(f, value, onChange) {
      var draft = value.slice(), wrap = h("div", { class: "sfm", "data-sfm": f.key }), q = h("input", { class: "i", placeholder: "Tìm (không dấu)…", "aria-label": "Tìm trong " + f.label });
      var list = h("div", { class: "sfm-list", role: "group", "aria-label": f.label }), cnt = h("span", { class: "hint", style: "margin:0" });
      var opts = (typeof f.options === "function" ? f.options() : f.options || []).map(function (o) { return typeof o === "string" ? { value: o, label: o } : { value: String(o.value), label: o.label }; });
      if (f.withNone) opts.unshift({ value: SF.NONE, label: "(Không có)" });
      var draw = function () {
        list.innerHTML = ""; var fq = SF.fold(q.value), shown = 0;
        opts.forEach(function (o) {
          if (fq && SF.fold(o.label).indexOf(fq) < 0) return; shown++;
          var cb = h("input", { type: "checkbox" }); cb.checked = draft.indexOf(o.value) >= 0;
          cb.addEventListener("change", function () { var i = draft.indexOf(o.value); if (cb.checked && i < 0) draft.push(o.value); if (!cb.checked && i >= 0) draft.splice(i, 1); cnt.textContent = draft.length + "/" + opts.length + " đã chọn"; onChange(draft.slice()); });
          list.appendChild(h("label", { class: "sfm-row" }, [cb, document.createTextNode(" " + o.label)]));
        });
        if (!shown) list.appendChild(h("div", { class: "hint", text: "Không có lựa chọn khớp" }));
        cnt.textContent = draft.length + "/" + opts.length + " đã chọn";
      };
      q.addEventListener("input", draw);
      var all = btn("Chọn tất cả", "ghost", function () { var fq = SF.fold(q.value); opts.forEach(function (o) { if ((!fq || SF.fold(o.label).indexOf(fq) >= 0) && draft.indexOf(o.value) < 0) draft.push(o.value); }); draw(); onChange(draft.slice()); }),
        none = btn("Bỏ chọn", "ghost", function () { draft = []; draw(); onChange([]); });
      wrap.appendChild(q); wrap.appendChild(h("div", { class: "fpop-tools" }, [all, none, cnt])); wrap.appendChild(list);
      draw();
      return wrap;
    }

    // ---------- FilterDateRange: kỳ lương điều khiển Từ–Đến ngày (dd/MM/yyyy) ----------
    function dateRange(cfg, getS, setS, opt) {
      opt = opt || {};
      var wrap = h("div", { class: "sfdr", "data-sfdr": "1" }), msg = h("div", { class: "sf-warn", style: "margin:0;min-height:0;font-size:12px" });
      var s0 = getS(), per = h("select", { "aria-label": "Kỳ lương", "data-sf-period": "1" });
      var ky = typeof cfg.periods === "function" ? cfg.periods() : [];
      per.appendChild(h("option", { value: "", text: "Kỳ: tùy chọn ngày" }));
      ky.forEach(function (k) { per.appendChild(h("option", { value: k.value, text: k.label })); });
      var tu = A.dateField(s0.tu, { "aria-label": "Từ ngày", title: "Từ ngày", "data-sf-tu": "1" }), den = A.dateField(s0.den, { "aria-label": "Đến ngày", title: "Đến ngày", "data-sf-den": "1" });
      var sync = function () { var s = getS(); per.value = s.ky || ""; per.options[0].text = !s.ky && !s.tu && !s.den ? (cfg.periodNoneLabel || "Kỳ: tất cả") : "Kỳ: tùy chọn ngày"; msg.textContent = SF.dateProblem(s); };
      per.addEventListener("change", function () { setS(SF.setPeriod(getS(), per.value)); tu.value = SF.fmtVN(getS().tu); den.value = SF.fmtVN(getS().den); sync(); });
      var edit = function () {
        var a = A.dateIso(tu), b = A.dateIso(den);
        if (a === null || b === null) { msg.textContent = "Ngày không hợp lệ — nhập dd/MM/yyyy"; return; }
        setS(SF.setDates(getS(), a, b)); sync();
      };
      tu.addEventListener("change", edit); den.addEventListener("change", edit);
      sync();
      wrap.appendChild(per); wrap.appendChild(h("label", { class: "chip" }, [document.createTextNode("Từ ngày "), tu])); wrap.appendChild(h("label", { class: "chip" }, [document.createTextNode("Đến ngày "), den])); wrap.appendChild(msg);
      wrap.refresh = function () { var s = getS(); tu.value = SF.fmtVN(s.tu); den.value = SF.fmtVN(s.den); sync(); };
      return wrap;
    }

    // ---------- một trường trong ngăn kéo ----------
    function drawerField(cfg, key, getS, setS, rerender) {
      if (key === "q") {
        var q = h("input", { class: "i", placeholder: cfg.searchPlaceholder || "Tìm…", value: getS().q, "aria-label": "Từ khóa", "data-sf-q": "1" });
        q.addEventListener("input", function () { var s = SF.normalize(getS()); s.q = q.value; setS(s); });
        return h("div", { class: "sfd-f" }, [h("label", { class: "sfd-l", text: "Tìm kiếm" }), q]);
      }
      if (key === "period" || key === "dates") {
        if (key === "dates" && (cfg.advancedFields || []).indexOf("period") >= 0) return null; // một khối kỳ + ngày duy nhất
        return h("div", { class: "sfd-f" }, [h("label", { class: "sfd-l", text: "Kỳ / khoảng ngày" }), dateRange(cfg, getS, setS)]);
      }
      var f = (cfg.fields || []).filter(function (x) { return x.key === key; })[0]; if (!f) return null;
      var body;
      if (f.type === "multi") body = multiSelect(f, SF.getField(getS(), f), function (v) { setS(SF.setField(getS(), f, v)); });
      else if (f.type === "enum") {
        var sl = h("select", { "aria-label": f.label, "data-sf-field": f.key }); sl.appendChild(h("option", { value: "", text: "Tất cả" }));
        (typeof f.options === "function" ? f.options() : f.options || []).forEach(function (o) { sl.appendChild(h("option", { value: typeof o === "string" ? o : o.value, text: typeof o === "string" ? o : o.label })); });
        sl.value = SF.getField(getS(), f); sl.addEventListener("change", function () { setS(SF.setField(getS(), f, sl.value)); }); body = sl;
      } else {
        var cb = h("input", { type: "checkbox", "data-sf-field": f.key }); cb.checked = !!SF.getField(getS(), f); cb.addEventListener("change", function () { setS(SF.setField(getS(), f, cb.checked)); });
        body = h("label", {}, [cb, document.createTextNode(" " + f.label)]);
        return h("div", { class: "sfd-f" }, [body]);
      }
      return h("div", { class: "sfd-f" }, [h("label", { class: "sfd-l", text: f.label }), body]);
    }

    // ---------- FilterPresetManager ----------
    function presetManager(cfg, getS, setS, rerender) {
      var box = h("div", { class: "sfd-presets", "data-sf-presets": "1" }), ps = presetStore(), sel = h("select", { "aria-label": "Bộ lọc đã lưu" });
      var names = ps.list(cfg.screenId), old = cfg.legacyPresets ? ps.legacyNames() : [];
      sel.appendChild(h("option", { value: "", text: "— Bộ lọc đã lưu (" + names.length + (old.length ? " + " + old.length + " cũ" : "") + ") —" })); names.forEach(function (n) { sel.appendChild(h("option", { value: "p:" + n, text: n })); });
      old.forEach(function (n) { sel.appendChild(h("option", { value: "l:" + n, text: n + " (cũ, dùng chung)" })); });
      var note = h("div", { class: "hint", style: "margin:4px 0 0" });
      sel.addEventListener("change", function () {
        if (!sel.value) return; var nm0 = sel.value.slice(2), r = SF.applyPreset(cfg, sel.value.charAt(0) === "l" ? ps.legacyGet(nm0) : ps.get(cfg.screenId, nm0));
        if (!r.ok) { note.textContent = "⚠ Không đọc được bộ lọc đã lưu này"; return; }
        setS(r.state); note.textContent = r.dropped.length ? "⚠ Màn hình này không áp được: " + r.dropped.join(", ") + " — các điều kiện còn lại đã được nạp (bấm Áp dụng để dùng)." : "Đã nạp “" + nm0 + "” — bấm Áp dụng để dùng.";
        rerender();
      });
      var save = btn("💾 Lưu bộ lọc hiện tại", "ghost", function () {
        if (SF.isEmpty(getS())) { A.toast("Chưa chọn điều kiện lọc nào"); return; }
        A.askText("Lưu bộ lọc", "Tên bộ lọc (chỉ dùng cho màn hình này):", {}, function (name) { var r = ps.save(cfg.screenId, name, getS()); A.toast(r.ok ? "Đã lưu bộ lọc “" + String(name).trim() + "”" : r.corrupt ? "⚠ Chưa lưu: kho bộ lọc đã lưu trên máy này bị lỗi. Bấm “Sao lưu kho cũ và tạo kho mới” rồi lưu lại." : "⚠ " + r.msg); rerender(); });
      }, "Lưu trên máy này, riêng cho màn hình này");
      var del = btn("🗑 Xóa", "ghost", function () { if (!sel.value) { A.toast("Chọn bộ lọc cần xóa"); return; } if (sel.value.charAt(0) === "l") { A.toast("Bộ lọc cũ chỉ để dùng, không xóa ở đây"); return; } A.toast(ps.remove(cfg.screenId, sel.value.slice(2)) ? "Đã xóa" : "⚠ Chưa xóa được bộ lọc"); rerender(); });
      box.appendChild(h("div", { class: "sfd-l", text: "Bộ lọc đã lưu" })); box.appendChild(h("div", { class: "bar", style: "margin:0" }, [sel, save, del])); box.appendChild(note);
      // Kho bộ lọc đã lưu bị lỗi hoặc do phiên bản khác ghi: không ghi đè; cho người dùng tự quyết định sao lưu rồi tạo kho mới.
      if (ps.isCorrupt()) {
        note.textContent = "⚠ Kho bộ lọc đã lưu trên máy này bị lỗi hoặc do phiên bản khác tạo, nên chưa lưu hay xóa bộ lọc được. Dữ liệu lương không bị ảnh hưởng.";
        var exportRaw = btn("Tải bản sao kho bộ lọc", "ghost", function () {
          var raw = ps.readCorrupt();
          if (raw === null) { A.toast("⚠ Không đọc được kho bộ lọc cũ"); return; }
          var url = root.URL.createObjectURL(new root.Blob([raw], { type: "text/plain;charset=utf-8" }));
          var link = h("a", { href: url, download: "BoLocHAK-" + new Date().toISOString().replace(/[:.]/g, "-") + ".txt" });
          document.body.appendChild(link); link.click(); link.remove();
          root.setTimeout(function () { root.URL.revokeObjectURL(url); }, 1000);
        });
        box.appendChild(h("div", { class: "bar", style: "margin:4px 0 0", "data-sf-corrupt": "1" }, [exportRaw, btn("Sao lưu kho cũ và tạo kho mới", "ghost", function () {
          var r = ps.discardCorrupt(); A.toast(r.ok ? "Đã sao lưu kho bộ lọc cũ và tạo kho mới" : "⚠ " + r.msg); rerender();
        }, "Bản cũ được giữ nguyên ở một khóa sao lưu trên máy này")]));
      }
      return box;
    }

    // ---------- FilterDrawer ----------
    var openDrawer = null;
    function closeDrawer(focusBack) {
      if (!openDrawer) return; var d = openDrawer; openDrawer = null;
      document.removeEventListener("keydown", d.onKey, true); document.body.classList.remove("sfd-open");
      if (d.el.parentNode) d.el.parentNode.removeChild(d.el); if (d.mask.parentNode) d.mask.parentNode.removeChild(d.mask);
      if (d.opener && d.opener.setAttribute) d.opener.setAttribute("aria-expanded", "false");
      if (focusBack && d.opener && d.opener.isConnected && d.opener.focus) d.opener.focus();
    }
    function drawer(cfg, opener, onApplied) {
      closeDrawer(); if (FP) FP.close();
      var draft = SF.normalize(cfg.state.get(), cfg), getS = function () { return draft; }, setS = function (s) { draft = SF.normalize(s); };
      var mask = h("div", { class: "sfd-mask" }), el = h("aside", { class: "sfd", role: "dialog", "aria-modal": "true", "aria-label": "Bộ lọc nâng cao", "data-sf-drawer": cfg.screenId });
      if (opener && opener.setAttribute) opener.setAttribute("aria-expanded", "true");
      var body = h("div", { class: "sfd-body" });
      var fill = function () {
        var previous = document.activeElement;
        var controls = "input, select, button";
        var index = Array.from(body.querySelectorAll(controls)).indexOf(previous);
        var scrollTop = body.scrollTop;
        body.innerHTML = "";
        (cfg.advancedFields || []).forEach(function (k) { var n = drawerField(cfg, k, getS, setS, fill); if (n) body.appendChild(n); });
        body.appendChild(presetManager(cfg, getS, setS, fill));
        var target = index >= 0 ? body.querySelectorAll(controls)[index] : null;
        if (target) target.focus({ preventScroll: true });
        body.scrollTop = scrollTop;
      };
      var close = function () { closeDrawer(true); };
      var apply = btn("Áp dụng", "pri", function () { var p = SF.dateProblem(draft); if (p) { A.toast("⚠ " + p); return; } cfg.state.set(draft); closeDrawer(true); onApplied(); }, "Áp dụng các điều kiện đang chọn"),
        cancel = btn("Hủy", "", close, "Đóng, không đổi gì"),
        reset = btn("Đặt lại", "ghost", function () { draft = SF.empty(); fill(); }, "Bỏ hết điều kiện trong ngăn này (bấm Áp dụng để dùng)");
      el.appendChild(h("div", { class: "sfd-head hak-sfd-head" }, [h("div", {}, [h("small", { text: (document.querySelector("#top h2") || {}).textContent || "Điều kiện lọc" }), h("b", { text: "Bộ lọc nâng cao" }), h("span", { text: "Thiết lập điều kiện rồi nhấn Áp dụng để lọc dữ liệu." })]), btn("✕", "ghost", close, "Đóng")]));
      el.appendChild(body); el.appendChild(h("div", { class: "sfd-foot" }, [reset, h("span", { class: "sp" }), cancel, apply]));
      fill();
      mask.addEventListener("mousedown", close);
      var onKey = function (e) {
        if (e.key === "Escape") { e.stopPropagation(); close(); return; }
        if (e.key === "Tab") { // giữ tiêu điểm trong ngăn kéo
          var f = Array.prototype.slice.call(el.querySelectorAll("button, input, select, textarea, a[href], [tabindex]")).filter(function (x) { return !x.disabled && x.tabIndex !== -1 && x.getClientRects().length > 0; });
          if (!f.length) return; var first = f[0], last = f[f.length - 1];
          if (!el.contains(document.activeElement)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
          else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      };
      document.addEventListener("keydown", onKey, true);
      document.body.appendChild(mask); document.body.appendChild(el); document.body.classList.add("sfd-open");
      openDrawer = { el: el, mask: mask, opener: opener, onKey: onKey };
      var firstInput = el.querySelector("input, select, button"); if (firstInput) firstInput.focus();
    }

    // ---------- FilterChips + FilterSummary ----------
    function chips(cfg, onChanged) {
      var items = SF.conditions(cfg, cfg.state.get()).map(function (c) {
        return { id: c.id, text: c.text, onRemove: function () { cfg.state.set(SF.remove(cfg.state.get(), c)); onChanged(); } };
      });
      return FP.chips(items, { max: 6, expanded: true, onClear: function () { cfg.state.set(SF.empty()); if (cfg.onReset) cfg.onReset(); onChanged(); } });
    }
    function summary(cfg, info) {
      var s = cfg.state.get(), bar = h("div", { class: "sf-sum", "data-sf-summary": cfg.screenId, role: "status" });
      var parts = [h("b", { text: "Hiển thị " + info.kept.toLocaleString("vi-VN") + " / " + info.total.toLocaleString("vi-VN") + " dòng" })];
      (cfg.summary ? cfg.summary(info) : []).forEach(function (x) { parts.push(h("span", { class: "sf-sum-i", text: x.label + ": " + x.value })); });
      if (info.unsupported && info.unsupported.length) parts.push(h("span", { class: "sf-warn", text: "⚠ Màn hình này không lọc được: " + info.unsupported.join(", ") }));
      parts.push(h("span", { class: "hint", style: "margin:0", text: "Phạm vi: " + SF.scopeText(cfg, s, cfg.scopeFallback ? cfg.scopeFallback() : "") }));
      parts.forEach(function (p) { bar.appendChild(p); });
      if (cfg.actions) { var act = h("span", { class: "sf-act" }); cfg.actions().forEach(function (b) { act.appendChild(b); }); bar.appendChild(act); }
      return bar;
    }

    // ---------- FilterToolbar ----------
    /** @returns { el, refresh() } — refresh() cập nhật chip/số điều kiện/dòng kết quả tại chỗ, không dựng lại ô tìm (giữ con trỏ). */
    function mount(cfg) {
      var root0 = h("div", Object.assign({ class: "sf", "data-sf": cfg.screenId }, cfg.attrs || {})), bar = h("div", { class: "bar sf-bar" }), slot = h("div", { class: "sf-slot" }), sumSlot = h("div", { class: "sf-sumslot" });
      var getS = function () { return SF.normalize(cfg.state.get(), cfg); };
      var applied = function () { if (cfg.onApply) cfg.onApply(getS()); refresh(); };
      var dr = null, qIn = null, quickSlots = {};
      var quick = cfg.quickFields || [];
      quick.forEach(function (k) {
        if (k === "q") {
          qIn = h("input", Object.assign({ class: "i search", placeholder: cfg.searchPlaceholder || "🔍 Tìm…", value: getS().q, "aria-label": "Tìm kiếm", "data-sf-q": "1" }, cfg.qAttrs || {}));
          var commitQ = function () { var s = getS(); if (s.q === qIn.value.trim()) return; s.q = qIn.value; cfg.state.set(s); applied(); };
          if (cfg.qCommit) qIn.addEventListener("change", commitQ); // màn hình vẽ lại toàn trang: chỉ áp khi Enter / rời ô
          else qIn.addEventListener("input", function () { clearTimeout(qIn._t); qIn._t = setTimeout(commitQ, 250); });
          bar.appendChild(qIn);
        } else if (k === "period" || k === "dates") {
          dr = dateRange(cfg, getS, function (s) { cfg.state.set(s); var pr = SF.dateProblem(s); if (pr) A.toast("⚠ " + pr); applied(); });
          bar.appendChild(dr);
        } else {
          var f = (cfg.fields || []).filter(function (x) { return x.key === k; })[0]; if (!f) return;
          var sp = h("span", { class: "sf-q" }); quickSlots[k] = sp; bar.appendChild(sp);
        }
      });
      var drawQuick = function () {
        Object.keys(quickSlots).forEach(function (k) {
          var f = (cfg.fields || []).filter(function (x) { return x.key === k; })[0], sp = quickSlots[k]; sp.innerHTML = "";
          if (f.type === "multi") {
            var os = (typeof f.options === "function" ? f.options() : f.options || []).map(function (o) { return typeof o === "string" ? { value: o, label: o } : { value: String(o.value), label: o.label }; });
            if (f.withNone) os.unshift({ value: SF.NONE, label: "(Không có)" });
            sp.appendChild(FP.button({ id: "sf:" + cfg.screenId + ":" + k, label: f.label, options: os, selected: SF.getField(getS(), f), onApply: function (arr) { cfg.state.set(SF.setField(getS(), f, arr)); applied(); } }));
          } else if (f.type === "enum") {
            var sl = h("select", { "aria-label": f.label, "data-sf-field": f.key }); sl.appendChild(h("option", { value: "", text: f.label + ": tất cả" }));
            (typeof f.options === "function" ? f.options() : f.options || []).forEach(function (o) { sl.appendChild(h("option", { value: typeof o === "string" ? o : o.value, text: typeof o === "string" ? o : o.label })); });
            sl.value = SF.getField(getS(), f); sl.addEventListener("change", function () { cfg.state.set(SF.setField(getS(), f, sl.value)); applied(); }); sp.appendChild(sl);
          }
        });
      };
      var adv = h("button", { type: "button", class: "b sf-adv", "aria-haspopup": "dialog", "aria-expanded": "false", "data-sf-adv": "1" });
      adv.addEventListener("click", function () { drawer(cfg, adv, applied); });
      var rst = btn("✕ Đặt lại", "ghost", function () { cfg.state.set(SF.empty()); if (cfg.onReset) cfg.onReset(); if (qIn) qIn.value = ""; applied(); }, "Bỏ toàn bộ điều kiện lọc của màn hình này");
      rst.setAttribute("data-sf-reset", "1");
      bar.appendChild(adv); bar.appendChild(rst);
      var wrap = h("div", { class: "fbar-wrap" }); wrap.appendChild(bar);
      root0.appendChild(wrap); root0.appendChild(slot); root0.appendChild(sumSlot);
      function refresh() {
        var n = SF.activeCount(cfg.state.get());
        adv.textContent = "⚙ Bộ lọc nâng cao" + (n ? " (" + n + ")" : ""); adv.classList.toggle("has", n > 0);
        if (qIn && document.activeElement !== qIn) qIn.value = getS().q;
        if (dr) dr.refresh();
        drawQuick();
        slot.innerHTML = ""; slot.appendChild(chips(cfg, function () { if (qIn) qIn.value = getS().q; applied(); }));
        var info = cfg.dataSource ? cfg.dataSource() : { kept: 0, total: 0 };
        sumSlot.innerHTML = ""; sumSlot.appendChild(summary(cfg, info));
      }
      refresh();
      return { el: root0, refresh: refresh };
    }

    return { mount: mount, components: { FilterToolbar: mount, FilterDrawer: drawer, FilterMultiSelect: multiSelect, FilterDateRange: dateRange, FilterChips: chips, FilterPresetManager: presetManager, FilterSummary: summary }, closeDrawer: closeDrawer };
  }
  root.HAKUI = root.HAKUI || {}; root.HAKUI.smartFilter = { create: create };
})(typeof window !== "undefined" ? window : this);
