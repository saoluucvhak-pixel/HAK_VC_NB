'use strict';
/* Khởi tạo (lần đầu mở) + Đăng nhập — UI_DESIGN §4.0. MỘT bộ cài cho mọi nhà máy: bước 2 chọn đơn vị của máy này. */
(function () {
  const D = window.DGVC; const { h } = D;
  // localStorage có thể bị chặn / ném lỗi (cửa sổ riêng tư, chính sách máy) — không để làm hỏng màn đăng nhập
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* không nhớ được tên đăng nhập — vẫn đăng nhập bình thường */ } };

  const left = (title, sub, extra) => h('section', { class: 'gl' }, h('div', { class: 'logo', style: { width: '52px', height: '52px', fontSize: '20px' } }, 'VC'),
    h('h1', {}, title), h('p', { class: 'sub' }, sub), extra || null);

  D.loginFields = ({ creating = false } = {}) => {
    const username = h('input', { required: true, autocomplete: 'username', maxlength: 64 });
    const password = h('input', { required: true, type: 'password', autocomplete: creating ? 'new-password' : 'current-password' });
    const repeat = creating ? h('input', { required: true, type: 'password', autocomplete: 'new-password' }) : null;
    const field = (label, input) => h('label', { class: 'field' }, h('span', {}, label), input);
    return {
      body: h('div', { class: 'stack' }, field('Tên đăng nhập', username), field('Mật khẩu', password),
        repeat && field('Nhập lại mật khẩu', repeat),
        creating && h('p', { class: 'small muted' }, 'Mật khẩu có ít nhất 8 ký tự, gồm chữ và số.')),
      values() {
        if (!username.reportValidity() || !password.reportValidity() || (repeat && !repeat.reportValidity())) return null;
        if (repeat && password.value !== repeat.value) {
          D.toast('Hai lần nhập mật khẩu không giống nhau', 'err');
          repeat.focus();
          return null;
        }
        return { username: username.value.trim(), password: password.value };
      }
    };
  };

  const enter = async (session, username) => {
    D.state.token = session.token;
    if (username) lsSet('dgvc.lastUser', username);
    await D.refreshBoot();
    D.go('dashboard');
  };

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
          const choice = (mode, label) => h('label', { class: 'check' }, h('input', { type: 'radio', name: 'login-mode', value: mode,
            checked: mode === 'SINGLE', onchange: () => {
              const withAccount = mode === 'ACCOUNT';
              account.body.hidden = !withAccount;
              skip.hidden = withAccount;
              create.hidden = !withAccount;
            } }), label);
          const account = D.loginFields({ creating: true });
          account.body.hidden = true;
          const complete = async (loginMode) => {
            const credentials = loginMode === 'ACCOUNT' ? account.values() : null;
            if (loginMode === 'ACCOUNT' && !credentials) return;
            s.mirrorFolder = inp.value.trim();
            const controls = [...box.querySelectorAll('button, input')].filter((el) => !el.disabled);
            controls.forEach((el) => { el.disabled = true; });
            try { await finish(loginMode, credentials); } catch { /* lỗi được hiển thị bởi D.api */ }
            finally { controls.forEach((el) => { el.disabled = false; }); }
          };
          const skip = h('button', { class: 'btn primary', type: 'button', onclick: () => complete('SINGLE') }, 'Bỏ qua');
          const create = h('button', { class: 'btn primary', type: 'button', hidden: true, onclick: () => complete('ACCOUNT') }, 'Tạo tài khoản và khởi tạo');
          box.append(h('h2', {}, 'Bước 4 — Cách sử dụng phần mềm'),
            h('fieldset', { class: 'stack' }, h('legend', {}, 'Đăng nhập'), choice('SINGLE', 'Một người sử dụng (không cần đăng nhập)'),
              choice('ACCOUNT', 'Sử dụng tài khoản đăng nhập'), account.body),
            h('label', { class: 'field' }, h('span', {}, 'Thư mục sao lưu ngoài (tùy chọn)'), h('div', { class: 'row' }, inp,
              h('button', { class: 'btn', onclick: async () => { const p = await D.pickFolder('Chọn USB / Google Drive'); if (p) inp.value = p; } }, 'Chọn…'))),
            h('div', { class: 'btns', style: { marginTop: '16px', justifyContent: 'space-between' } },
              h('button', { class: 'btn', onclick: () => { s.step = 3; draw(); } }, 'Quay lại'), skip, create));
        }
      };
      const nav = (check) => h('div', { class: 'btns', style: { marginTop: '16px', justifyContent: 'space-between' } }, h('button', { class: 'btn', onclick: () => { s.step -= 1; draw(); } }, 'Quay lại'),
        h('button', { class: 'btn primary', onclick: () => { if (check() !== false) { s.step += 1; draw(); } } }, 'Tiếp'));
      const finish = async (loginMode, account) => {
        const r = await D.api('setup.init', { mode: s.mode, dataFolder: s.dataFolder, unitCode: s.unitCode, catalogPackagePath: s.packagePath, mirrorFolder: s.mirrorFolder, loginMode, account });
        D.toast(`Đã khởi tạo bản cài ${r.unitCode}${r.catalogImport ? ' và cập nhật danh mục từ gói' : ''}`, 'ok');
        D.state.setup = r;
        if (loginMode === 'ACCOUNT') {
          try { await enter(await D.api('auth.login', account), account.username); return; } catch { /* mở màn đăng nhập để thử lại */ }
        }
        D.go('login');
      };
      draw();
      return h('div', { class: 'gate' }, left('Khởi tạo bản cài', 'Một bộ cài dùng cho mọi nhà máy của HAK Group. Dữ liệu lưu trong thư mục trên máy, chạy không cần Internet.'), h('section', { class: 'gr' }, box));
    },
  };

  D.views.login = {
    async render() {
      const st = await D.api('setup.status', {}, { quiet: true });
      if (!st.initialized) { D.state.setup = st; setTimeout(() => D.go('setup')); return h('div'); }
      if (st.loginMode === 'SINGLE') {
        try {
          const session = await D.api('auth.openLocal', {}, { quiet: true });
          await enter(session);
          return h('div');
        } catch (error) {
          return h('div', { class: 'card', role: 'alert' }, error.message,
            h('button', { class: 'btn', onclick: () => D.go('login') }, 'Thử lại'));
        }
      }
      const need = new Set(st.usersNeedPassword || []);
      const user = h('input', { autocomplete: 'username', value: lsGet('dgvc.lastUser') || st.singleUserName || '', 'aria-label': 'Tên đăng nhập' });
      const pw = h('input', { type: 'password', autocomplete: 'current-password', 'aria-label': 'Mật khẩu' });
      const pw2 = h('input', { type: 'password', autocomplete: 'new-password', 'aria-label': 'Nhập lại mật khẩu' });
      const code = h('input', { autocomplete: 'one-time-code', autocapitalize: 'characters', maxlength: 12, 'aria-label': 'Mã kích hoạt' });
      const codeBox = h('label', { class: 'field', style: { display: 'none', marginTop: '10px' } }, h('span', {}, 'Mã kích hoạt (do ADMIN cấp)'), code);
      const second = h('label', { class: 'field', style: { display: 'none' } }, h('span', {}, 'Nhập lại mật khẩu mới'), pw2);
      const title = h('h2', {}, 'Đăng nhập'); const note = h('p', { class: 'small muted' });
      const sync = () => { const first = need.has(user.value.trim().toLowerCase()); second.style.display = first ? '' : 'none'; codeBox.style.display = first && !st.firstAdminOpen ? '' : 'none'; title.textContent = first ? 'Đặt mật khẩu lần đầu' : 'Đăng nhập';
        note.textContent = first ? (st.firstAdminOpen ? 'Bản cài mới — ADMIN đầu tiên đặt mật khẩu ít nhất 8 ký tự, có chữ và số.' : 'Tài khoản chưa có mật khẩu — nhập mã kích hoạt do ADMIN cấp, rồi đặt mật khẩu ít nhất 8 ký tự, có chữ và số.') : ''; };
      user.addEventListener('input', sync);
      const go = async (e) => {
        e.preventDefault(); const u = user.value.trim().toLowerCase(); let r;
        if (need.has(u)) {
          if (pw.value !== pw2.value) { D.toast('Hai lần nhập mật khẩu không giống nhau', 'err'); return; }
          try { r = await D.api('auth.setFirstPassword', { username: u, newPassword: pw.value, setupCode: code.value.trim() }); } catch { return; } // lỗi đã hiện thành thông báo (sai mã, mật khẩu yếu…)
        } else {
          try { r = await D.api('auth.login', { username: u, password: pw.value }, { quiet: true }); } catch (err) {
            if (err.code === 'PASSWORD_NOT_SET') { need.add(u); sync(); D.toast(err.message, 'info'); return; }
            D.toast(err.message, 'err'); return;
          }
        }
        await enter(r, u);
      };
      const form = h('form', { class: 'box card', onsubmit: go }, title, note,
        h('label', { class: 'field' }, h('span', {}, 'Tên đăng nhập'), user), h('label', { class: 'field', style: { marginTop: '10px' } }, h('span', {}, 'Mật khẩu'), pw), second, codeBox,
        h('button', { class: 'btn primary', type: 'submit', style: { width: '100%', marginTop: '16px' } }, 'Vào phần mềm'));
      setTimeout(sync);
      return h('div', { class: 'gate' }, left('Đơn giá vận chuyển dăm', 'Tính đơn giá vận chuyển, bảng xác nhận khối lượng, diễn giải hóa đơn — thay cho Excel + Power Query.',
        h('div', { class: 'install', style: { margin: 0 } }, h('b', {}, `Bản cài · ${st.unitCode}`), h('div', { class: 'mono small' }, st.dataFolder), h('div', { class: 'small' }, `Phiên bản ${st.appVersion}`))),
      h('section', { class: 'gr' }, form));
    },
  };
})();
