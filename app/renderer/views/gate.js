'use strict';
/* Khởi tạo (lần đầu mở) + Đăng nhập — UI_DESIGN §4.0. MỘT bộ cài cho mọi nhà máy: bước 2 chọn đơn vị của máy này. */
(function () {
  const D = window.DGVC; const { h } = D;

  const left = (title, sub, extra) => h('section', { class: 'gl' }, h('div', { class: 'logo', style: { width: '52px', height: '52px', fontSize: '20px' } }, 'VC'),
    h('h1', {}, title), h('p', { class: 'sub' }, sub), extra || null);

  D.views.setup = {
    async render() {
      const st = D.state.setup || await D.api('setup.status');
      const units = st.units && st.units.length ? st.units : (await D.api('setup.units')).items;
      const s = { step: 1, mode: 'NEW', dataFolder: st.defaultDataFolder, unitCode: '', packagePath: '', mirrorFolder: '' };
      const box = h('div', { class: 'box card' });
      const draw = () => {
        box.innerHTML = '';
        box.append(h('div', { class: 'steps', 'aria-label': `Bước ${s.step}/4` }, [1, 2, 3, 4].map((i) => h('span', { class: i <= s.step ? 'on' : '' }))));
        if (s.step === 1) {
          const inp = h('input', { value: s.dataFolder, 'aria-label': 'Thư mục dữ liệu' });
          const mode = h('select', {}, h('option', { value: 'NEW' }, 'Tạo dữ liệu mới cho máy này'), h('option', { value: 'ATTACH' }, 'Dùng thư mục dữ liệu có sẵn (cài lại máy / chuyển máy)'));
          mode.value = s.mode;
          box.append(h('h2', {}, 'Bước 1 — Thư mục dữ liệu'), h('p', { class: 'muted small' }, 'Mặc định Documents\\DGVC_DATA. Có thể chọn ổ D: để an toàn khi cài lại Windows.'),
            h('label', { class: 'field' }, h('span', {}, 'Cách khởi tạo'), mode),
            h('label', { class: 'field' }, h('span', {}, 'Thư mục'), h('div', { class: 'row' }, inp, h('button', { class: 'btn', onclick: async () => { const p = await D.pickFolder('Chọn thư mục dữ liệu'); if (p) inp.value = p; } }, 'Chọn ổ khác…'))),
            h('div', { class: 'foot btns', style: { marginTop: '16px', justifyContent: 'flex-end' } }, h('button', { class: 'btn primary', onclick: async () => {
              s.dataFolder = inp.value.trim(); s.mode = mode.value;
              if (s.mode === 'ATTACH') { await finish(); return; }
              s.step = 2; draw();
            } }, 'Tiếp')));
        } else if (s.step === 2) {
          box.append(h('h2', {}, 'Bước 2 — Đơn vị của bản cài này'), h('p', { class: 'muted small' }, 'Bộ cài dùng chung cho mọi nhà máy. Chọn đúng đơn vị đang dùng máy này — không đổi được về sau.'),
            h('div', { class: 'unit-pick', role: 'radiogroup' }, units.map((u) => h('label', {}, h('input', { type: 'radio', name: 'unit', value: u.unitCode, checked: s.unitCode === u.unitCode, onchange: () => { s.unitCode = u.unitCode; } }),
              h('div', {}, h('b', {}, `${u.unitCode} — ${u.unitName}`), h('div', { class: 'small muted' }, u.factoryName || u.address || ''),
                h('div', { class: 'small' }, u.contracts.length ? u.contracts.map((c) => `${c.contractCode} (${c.role === 'CARRIER' ? 'vận chuyển cho' : 'thuê'} ${c.other})`).join(' · ') : 'Chưa có hợp đồng — thêm sau trong Hợp đồng vận chuyển'))))),
            nav(() => { if (!s.unitCode) { D.toast('Chọn đơn vị', 'err'); return false; } return true; }));
        } else if (s.step === 3) {
          const inp = h('input', { value: s.packagePath, placeholder: '(không bắt buộc) …\\Danhmuc_HAKQN_cho_DH.dgvc' });
          box.append(h('h2', {}, 'Bước 3 — Danh mục'), h('p', { class: 'muted small' }, 'Bản cài đã có sẵn danh mục đơn vị, xe, tuyến, giá, hợp đồng. Nếu nhà máy khác vừa gửi gói danh mục mới hơn thì chọn gói đó để cập nhật ngay.'),
            h('label', { class: 'field' }, h('span', {}, 'Gói danh mục (.dgvc)'), h('div', { class: 'row' }, inp, h('button', { class: 'btn', onclick: async () => { const p = await D.pickFile({ title: 'Chọn gói danh mục', filters: [{ name: 'Gói DGVC', extensions: ['dgvc'] }] }); if (p) inp.value = p; } }, 'Chọn gói…'))),
            nav(() => { s.packagePath = inp.value.trim(); return true; }));
        } else {
          const inp = h('input', { value: s.mirrorFolder, placeholder: 'vd E:\\ (USB) hoặc G:\\My Drive (Google Drive for Desktop)' });
          box.append(h('h2', {}, 'Bước 4 — Sao lưu ra ngoài'), h('p', { class: 'muted small' }, 'APP tự sao lưu mỗi ngày trong thư mục dữ liệu. Chọn thêm USB / Google Drive để chép bản sao lưu ra ngoài máy (có thể bỏ trống, chọn sau trong Cài đặt).'),
            h('label', { class: 'field' }, h('span', {}, 'Thư mục sao lưu ngoài'), h('div', { class: 'row' }, inp, h('button', { class: 'btn', onclick: async () => { const p = await D.pickFolder('Chọn USB / Google Drive'); if (p) inp.value = p; } }, 'Chọn…'))),
            h('p', { class: 'small muted' }, 'Tài khoản ADMIN có sẵn: saoluucvhak@gmail.com, phuthuy.apple@gmail.com — đặt mật khẩu ở màn hình đăng nhập.'),
            h('div', { class: 'btns', style: { marginTop: '16px', justifyContent: 'space-between' } }, h('button', { class: 'btn', onclick: () => { s.step = 3; draw(); } }, 'Quay lại'),
              h('button', { class: 'btn primary', 'data-hotkey': 'primary', onclick: async (e) => { s.mirrorFolder = inp.value.trim(); e.target.disabled = true; try { await finish(); } finally { e.target.disabled = false; } } }, 'Khởi tạo bản cài')));
        }
      };
      const nav = (check) => h('div', { class: 'btns', style: { marginTop: '16px', justifyContent: 'space-between' } }, h('button', { class: 'btn', onclick: () => { s.step -= 1; draw(); } }, 'Quay lại'),
        h('button', { class: 'btn primary', onclick: () => { if (check() !== false) { s.step += 1; draw(); } } }, 'Tiếp'));
      const finish = async () => {
        const r = await D.api('setup.init', { mode: s.mode, dataFolder: s.dataFolder, unitCode: s.unitCode, catalogPackagePath: s.packagePath, mirrorFolder: s.mirrorFolder });
        D.toast(`Đã khởi tạo bản cài ${r.unitCode}${r.catalogImport ? ' và cập nhật danh mục từ gói' : ''}`, 'ok');
        D.state.setup = r; D.go('login');
      };
      draw();
      return h('div', { class: 'gate' }, left('Khởi tạo bản cài', 'Một bộ cài dùng cho mọi nhà máy của HAK Group. Dữ liệu lưu trong thư mục trên máy, chạy không cần Internet.'), h('section', { class: 'gr' }, box));
    },
  };

  D.views.login = {
    async render() {
      const st = await D.api('setup.status', {}, { quiet: true });
      if (!st.initialized) { D.state.setup = st; setTimeout(() => D.go('setup')); return h('div'); }
      const need = new Set(st.usersNeedPassword || []);
      const user = h('input', { autocomplete: 'username', value: localStorage.getItem('dgvc.lastUser') || '', 'aria-label': 'Tên đăng nhập' });
      const pw = h('input', { type: 'password', autocomplete: 'current-password', 'aria-label': 'Mật khẩu' });
      const pw2 = h('input', { type: 'password', autocomplete: 'new-password', 'aria-label': 'Nhập lại mật khẩu' });
      const second = h('label', { class: 'field', style: { display: 'none' } }, h('span', {}, 'Nhập lại mật khẩu mới'), pw2);
      const title = h('h2', {}, 'Đăng nhập'); const note = h('p', { class: 'small muted' });
      const sync = () => { const first = need.has(user.value.trim().toLowerCase()); second.style.display = first ? '' : 'none'; title.textContent = first ? 'Đặt mật khẩu lần đầu' : 'Đăng nhập';
        note.textContent = first ? 'Tài khoản chưa có mật khẩu — đặt mật khẩu ít nhất 8 ký tự, có chữ và số.' : ''; };
      user.addEventListener('input', sync);
      const go = async (e) => {
        e.preventDefault(); const u = user.value.trim().toLowerCase(); let r;
        if (need.has(u)) {
          if (pw.value !== pw2.value) { D.toast('Hai lần nhập mật khẩu không giống nhau', 'err'); return; }
          r = await D.api('auth.setFirstPassword', { username: u, newPassword: pw.value });
        } else {
          try { r = await D.api('auth.login', { username: u, password: pw.value }, { quiet: true }); } catch (err) {
            if (err.code === 'PASSWORD_NOT_SET') { need.add(u); sync(); D.toast(err.message, 'info'); return; }
            D.toast(err.message, 'err'); return;
          }
        }
        D.state.token = r.token; localStorage.setItem('dgvc.lastUser', u);
        await D.refreshBoot(); D.go('dashboard');
      };
      const form = h('form', { class: 'box card', onsubmit: go }, title, note,
        h('label', { class: 'field' }, h('span', {}, 'Tên đăng nhập'), user), h('label', { class: 'field', style: { marginTop: '10px' } }, h('span', {}, 'Mật khẩu'), pw), second,
        h('button', { class: 'btn primary', type: 'submit', style: { width: '100%', marginTop: '16px' } }, 'Vào phần mềm'));
      setTimeout(sync);
      return h('div', { class: 'gate' }, left('Đơn giá vận chuyển dăm', 'Tính đơn giá vận chuyển, bảng xác nhận khối lượng, diễn giải hóa đơn — thay cho Excel + Power Query.',
        h('div', { class: 'install', style: { margin: 0 } }, h('b', {}, `Bản cài · ${st.unitCode}`), h('div', { class: 'mono small' }, st.dataFolder), h('div', { class: 'small' }, `Phiên bản ${st.appVersion}`))),
      h('section', { class: 'gr' }, form));
    },
  };
})();
