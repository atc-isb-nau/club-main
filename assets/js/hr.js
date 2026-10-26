/* ATC HR — CMS for board + club members, rich-text notifications, send log. */
(() => {
  'use strict';

  const cfg = window.ATC_CONFIG || {};
  const KEY_STORAGE = 'atc_hr_key';
  const TAB_STORAGE = 'atc_hr_tab';
  const AUTO_REFRESH_MS = 60000;

  /* ──────── Board (static) ──────── */
  const BOARD = [
    { name: 'Dr. Marwa Fersi',    role: 'Founder / Advisor',      phone: '+216 21 987 483', email: 'maroua.fsegs@gmail.com' },
    { name: 'Dhiaa Walha',        role: 'President',              phone: '',                email: 'dhiaaoulha@gmail.com',    alias: 'Dhiaa Oulha' },
    { name: 'Ali Cheikh',         role: 'Vice President',         phone: '',                email: 'alouloucheikh05@gmail.com' },
    { name: 'Fatma Ezahra Makni', role: 'Treasurer',              phone: '+216 26 197 989', email: 'mahdimakni321@gmail.com' },
    { name: 'Abir Dhameur',       role: 'Events – Manager',       phone: '+216 29 671 137', email: 'ff5151241@gmail.com' },
    { name: 'Lina Atitallah',     role: 'Events – Coordinator',   phone: '+216 24 430 220', email: 'lynaatitallah@gmail.com' },
    { name: 'Molka Drira',        role: 'Training – Manager',     phone: '+216 26 537 343', email: '' },
    { name: 'Nigel Kettani',      role: 'Training – Coordinator', phone: '+216 96 525 570', email: '' },
    { name: 'Nourhene Kettani',   role: 'MKG – Manager',          phone: '+216 96 525 572', email: '' },
    { name: 'Islem Belghuith',    role: 'MKG – Coordinator',      phone: '+216 50 180 441', email: '' },
    { name: 'Amal Zaouali',       role: 'HR – Manager',           phone: '+216 56 222 275', email: 'amelzaweili@gmail.com' },
    { name: 'Hela Chaoui',        role: 'HR – Coordinator',       phone: '+216 25 339 558', email: 'helachaoui4@gmail.com' }
  ];

  /* ──────── helpers ──────── */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
  const pad = n => String(n).padStart(2, '0');
  const fmtDateTime = ts => {
    const d = ts instanceof Date ? ts : new Date(ts);
    if (isNaN(d)) return '—';
    const now = new Date();
    const t = pad(d.getHours()) + ':' + pad(d.getMinutes());
    if (d.toDateString() === now.toDateString()) return t;
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + ' ' + t;
  };
  const initials = name => String(name || '').replace(/[^A-Za-z\u00C0-\u024F ]/g, '')
    .split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '·';
  const hashStr = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
  const PALETTE = ['var(--chart-1)','var(--chart-2)','var(--chart-3)','var(--chart-4)','var(--chart-5)'];
  const colorFor = s => PALETTE[hashStr(s || '') % PALETTE.length];
  const avatarUrl = email => email
    ? `https://unavatar.io/${encodeURIComponent(email)}?fallback=false` : '';

  const $ = id => document.getElementById(id);
  const loginEl      = $('login');
  const dashboardEl  = $('dashboard');
  const loginForm    = $('loginForm');
  const pwInput      = $('pw');
  const loginErr     = $('loginErr');
  const tickerTime   = $('tickerTime');
  const tickerMsg    = $('tickerMsg');
  const refreshBtn   = $('refreshBtn');
  const logoutBtn    = $('logoutBtn');
  const tabsEl       = $('hrTabs');
  const boardGrid    = $('boardGrid');
  const boardSearch  = $('boardSearch');
  const clubTable    = $('clubTable');
  const clubSearch   = $('clubSearch');
  const clubCount    = $('clubCount');
  const chipsEl      = $('chips');
  const addInput     = $('addRecipient');
  const addBtn       = $('addRecipientBtn');
  const datalistEl   = $('allPeopleList');
  const subjectInput = $('subject');
  const editorBody   = $('editorBody');
  const editorToolbar= $('editorToolbar');
  const composeForm  = $('composeForm');
  const composeErr   = $('composeErr');
  const sendBtn      = $('sendBtn');
  const sendStatus   = $('sendStatus');
  const sentTable    = $('sentTable');
  const sentTag      = $('sentTag');
  const selectionBar = $('selectionBar');
  const selCount     = $('selCount');
  const composeSelBtn= $('composeSelectedBtn');
  const clearSelBtn  = $('clearSelectionBtn');

  let state = {
    members: [],          // club members from Signups
    emails: [],           // send log
    boardSearch: '',
    clubSearch: '',
    selected: new Set(),  // lowercase emails
    composeRecipients: [] // [{ email, name }]
  };

  /* ──────── auth ──────── */
  const getKey   = () => { try { return sessionStorage.getItem(KEY_STORAGE); } catch (e) { return null; } };
  const setKey   = k  => { try { sessionStorage.setItem(KEY_STORAGE, k); } catch (e) {} };
  const clearKey = () => { try { sessionStorage.removeItem(KEY_STORAGE); } catch (e) {} };

  loginForm.addEventListener('submit', async e => { e.preventDefault(); await tryLogin(pwInput.value.trim()); });

  async function tryLogin(key) {
    if (!key) return;
    loginErr.classList.add('hidden');
    const btn = loginForm.querySelector('button');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner spinner-sm" style="vertical-align:-2px;margin-right:6px"></span> CONNECTING…';
    try {
      const data = await fetchHR(key);
      setKey(key);
      enterDashboard(data);
    } catch (err) {
      loginErr.textContent = (err && err.message) || 'Connection failed';
      loginErr.classList.remove('hidden');
      pwInput.select();
    } finally {
      btn.disabled = false;
      btn.textContent = 'CONNECT ▸';
    }
  }

  function logout() { clearKey(); stopAutoRefresh(); location.reload(); }

  /* ──────── fetch ──────── */
  async function fetchHR(key) {
    if (!cfg.APPS_SCRIPT_URL) throw new Error('No backend URL configured');
    const url = cfg.APPS_SCRIPT_URL + '?action=hr&key=' + encodeURIComponent(key);
    const res = await fetch(url, { method: 'GET', mode: 'cors' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data || !data.ok) throw new Error((data && data.error) || 'Unauthorized');
    return data;
  }
  async function postHR(payload) {
    const res = await fetch(cfg.APPS_SCRIPT_URL, {
      method: 'POST', mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    let data = null;
    try { data = await res.json(); } catch (e) { data = { ok: false, error: 'Malformed response' }; }
    return data;
  }

  /* ──────── boot ──────── */
  function enterDashboard(data) {
    loginEl.classList.add('hidden');
    dashboardEl.classList.remove('hidden');
    initTabs();
    initEditor();
    buildDatalist();
    renderBoard();
    startClock();
    render(data);
    startAutoRefresh();
    refreshBtn.addEventListener('click', reload);
    logoutBtn.addEventListener('click', logout);
  }

  /* ──────── tabs ──────── */
  function initTabs() {
    switchTab(localStorage.getItem(TAB_STORAGE) || 'people');
    tabsEl.addEventListener('click', e => {
      const btn = e.target.closest('[data-tab]');
      if (btn) switchTab(btn.dataset.tab);
    });
  }
  function switchTab(name) {
    tabsEl.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.hr-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === name));
    localStorage.setItem(TAB_STORAGE, name);
    updateSelectionBar();
  }

  /* ──────── clock ──────── */
  let clockTimer = null, refreshTimer = null, nextRefresh = 0;
  function startClock() { updateClock(); clockTimer = setInterval(updateClock, 1000); }
  function updateClock() {
    const n = new Date();
    tickerTime.textContent = pad(n.getHours()) + ':' + pad(n.getMinutes()) + ':' + pad(n.getSeconds());
  }
  function startAutoRefresh() {
    nextRefresh = Date.now() + AUTO_REFRESH_MS;
    refreshTimer = setInterval(async () => {
      if (document.visibilityState !== 'visible') { nextRefresh = Date.now() + AUTO_REFRESH_MS; return; }
      if (Date.now() >= nextRefresh) { nextRefresh = Date.now() + AUTO_REFRESH_MS; await reload(); }
      const s = Math.max(0, Math.ceil((nextRefresh - Date.now()) / 1000));
      tickerMsg.textContent = 'NEXT SYNC IN ' + s + 's';
    }, 1000);
  }
  function stopAutoRefresh() {
    if (clockTimer) clearInterval(clockTimer);
    if (refreshTimer) clearInterval(refreshTimer);
  }
  async function reload() {
    const key = getKey(); if (!key) return;
    try { render(await fetchHR(key)); tickerMsg.textContent = 'SYNCED'; }
    catch (e) { tickerMsg.textContent = 'SYNC FAILED'; }
  }

  /* ──────── KPIs ──────── */
  function renderKPIs() {
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const todayEmails = state.emails.filter(e => new Date(e.Timestamp).getTime() >= dayStart.getTime()).length;
    $('kpiStrip').innerHTML = `
      <div class="kpi">
        <span class="kpi-label">BOARD</span>
        <b class="kpi-value">${BOARD.length}</b>
        <span class="kpi-note">team members</span>
      </div>
      <div class="kpi">
        <span class="kpi-label">CLUB MEMBERS</span>
        <b class="kpi-value is-green">${state.members.length}</b>
        <span class="kpi-note">signed up</span>
      </div>
      <div class="kpi">
        <span class="kpi-label">EMAILS SENT</span>
        <b class="kpi-value is-gold">${state.emails.length}</b>
        <span class="kpi-note">${todayEmails > 0 ? '+' + todayEmails + ' today' : 'none today'}</span>
      </div>
      <div class="kpi">
        <span class="kpi-label">SELECTED</span>
        <b class="kpi-value">${state.selected.size}</b>
        <span class="kpi-note">on this tab</span>
      </div>`;
  }

  /* ──────── board ──────── */
  function renderBoard() {
    const q = state.boardSearch.trim().toLowerCase();
    const list = q ? BOARD.filter(m =>
      (m.name + ' ' + m.role + ' ' + (m.alias || '') + ' ' + (m.email || '') + ' ' + (m.phone || ''))
        .toLowerCase().includes(q)) : BOARD;
    boardGrid.innerHTML = list.length ? list.map(renderBoardCard).join('') : '<div class="hr-empty">NO MATCHES</div>';
  }
  function renderBoardCard(m) {
    const color = colorFor(m.name + (m.email || ''));
    const src = avatarUrl(m.email);
    const phone = m.phone
      ? `<a href="tel:${esc(m.phone.replace(/\s+/g, ''))}">${esc(m.phone)}</a>`
      : `<span class="muted">not provided</span>`;
    const email = m.email
      ? `<button class="link-btn" type="button" data-compose-email="${esc(m.email)}" data-compose-name="${esc(m.name)}">${esc(m.email)}</button>`
      : `<span class="muted">no email yet</span>`;
    return `
      <div class="member-card">
        <div class="avatar" style="color:${color}">
          <span class="avatar-initials">${esc(initials(m.name))}</span>
          ${src ? `<img class="avatar-img" src="${src}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.style.display='none'">` : ''}
        </div>
        <div class="member-body">
          <div class="member-name">${esc(m.name)}${m.alias ? `<span class="member-alias">(${esc(m.alias)})</span>` : ''}</div>
          <span class="member-role">${esc(m.role)}</span>
          <div class="member-line"><span class="key">TEL</span>${phone}</div>
          <div class="member-line"><span class="key">MAIL</span>${email}</div>
        </div>
      </div>`;
  }
  boardSearch.addEventListener('input', () => { state.boardSearch = boardSearch.value; renderBoard(); });

  /* ──────── club members table ──────── */
  function renderClub() {
    const q = state.clubSearch.trim().toLowerCase();
    const list = q ? state.members.filter(m =>
      (String(m.Name || '') + ' ' + (m.Education || '') + ' ' + (m.Email || '') + ' ' + (m['Why they want to join'] || ''))
        .toLowerCase().includes(q)) : state.members;

    clubCount.textContent = state.members.length;

    if (!list.length) {
      clubTable.outerHTML = '<table id="clubTable" class="terminal-table"><tbody><tr><td class="table-empty">NO CLUB MEMBERS YET — SIGNUPS WILL APPEAR HERE</td></tr></tbody></table>';
      return;
    }

    // sort newest first
    const sorted = list.slice().sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
    const allVisibleSelected = sorted.every(r => state.selected.has(String(r.Email).toLowerCase()));

    const header = `
      <thead><tr>
        <th class="chk-cell"><input type="checkbox" id="clubSelectAll" ${allVisibleSelected ? 'checked' : ''}></th>
        <th>NAME</th><th>LEVEL</th><th>EMAIL</th><th>JOINED</th><th></th>
      </tr></thead>`;

    const body = sorted.map(r => {
      const email = String(r.Email || '');
      const emailKey = email.toLowerCase();
      const checked = state.selected.has(emailKey);
      const color = colorFor(r.Name + email);
      const src = avatarUrl(email);
      return `<tr>
        <td class="chk-cell"><input type="checkbox" data-member-email="${esc(email)}" ${checked ? 'checked' : ''}></td>
        <td class="cell-name-row">
          <span class="avatar avatar-sm" style="color:${color}">
            <span class="avatar-initials">${esc(initials(r.Name))}</span>
            ${src ? `<img class="avatar-img" src="${src}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">` : ''}
          </span>
          <span title="${esc(r.Name)}">${esc(r.Name)}</span>
        </td>
        <td class="cell-mono">${esc(r.Education || '—')}</td>
        <td class="cell-email" title="${esc(email)}">${esc(email)}</td>
        <td class="cell-time">${esc(fmtDateTime(r.Timestamp))}</td>
        <td><button type="button" class="row-action-btn" data-compose-email="${esc(email)}" data-compose-name="${esc(r.Name)}">✉</button></td>
      </tr>`;
    }).join('');

    clubTable.outerHTML = `<table id="clubTable" class="terminal-table">${header}<tbody>${body}</tbody></table>`;
    bindClubTable();
  }

  function bindClubTable() {
    const table = document.getElementById('clubTable');
    if (!table) return;

    table.addEventListener('change', e => {
      const sel = e.target.closest('#clubSelectAll');
      if (sel) {
        const visibleRows = table.querySelectorAll('tbody tr');
        visibleRows.forEach(tr => {
          const chk = tr.querySelector('[data-member-email]');
          const em = chk?.dataset.memberEmail?.toLowerCase();
          if (!em) return;
          if (sel.checked) state.selected.add(em);
          else state.selected.delete(em);
          if (chk) chk.checked = sel.checked;
        });
        updateSelectionBar();
        renderKPIs();
        return;
      }
      const chk = e.target.closest('[data-member-email]');
      if (chk) {
        const em = chk.dataset.memberEmail.toLowerCase();
        if (chk.checked) state.selected.add(em);
        else state.selected.delete(em);
        updateSelectionBar();
        renderKPIs();
        // keep "select all" in sync
        const all = table.querySelector('#clubSelectAll');
        if (all) {
          const boxes = table.querySelectorAll('tbody [data-member-email]');
          all.checked = boxes.length > 0 && [...boxes].every(b => b.checked);
        }
      }
    });
  }
  clubSearch.addEventListener('input', () => { state.clubSearch = clubSearch.value; renderClub(); });

  /* ──────── selection bar ──────── */
  function updateSelectionBar() {
    const n = state.selected.size;
    selCount.textContent = n;
    selectionBar.classList.toggle('hidden', n === 0);
  }
  clearSelBtn.addEventListener('click', () => {
    state.selected.clear();
    document.querySelectorAll('#clubTable [data-member-email]').forEach(chk => chk.checked = false);
    const all = document.getElementById('clubSelectAll');
    if (all) all.checked = false;
    updateSelectionBar();
    renderKPIs();
  });
  composeSelBtn.addEventListener('click', () => {
    if (state.selected.size === 0) return;
    state.selected.forEach(emailKey => {
      const member = state.members.find(m => String(m.Email || '').toLowerCase() === emailKey);
      if (member) addRecipient(member.Email, member.Name);
    });
    state.selected.clear();
    document.querySelectorAll('#clubTable [data-member-email]').forEach(c => c.checked = false);
    updateSelectionBar();
    renderKPIs();
    switchTab('compose');
  });

  /* ──────── compose: recipients ──────── */
  function buildDatalist() {
    const opts = [];
    BOARD.filter(m => m.email).forEach(m => {
      opts.push(`<option value="${esc(m.email)}" label="${esc(m.name)}">${esc(m.name)} · ${esc(m.role)}</option>`);
    });
    state.members.forEach(m => {
      if (!m.Email) return;
      opts.push(`<option value="${esc(m.Email)}" label="${esc(m.Name)}">${esc(m.Name)} · ${esc(m.Education || 'member')}</option>`);
    });
    datalistEl.innerHTML = opts.join('');
  }

  function addRecipient(email, name) {
    const e = String(email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return false;
    const key = e.toLowerCase();
    if (state.composeRecipients.some(r => r.email.toLowerCase() === key)) return true;
    state.composeRecipients.push({ email: e, name: String(name || '').trim() });
    renderChips();
    return true;
  }
  function removeRecipient(email) {
    const key = email.toLowerCase();
    state.composeRecipients = state.composeRecipients.filter(r => r.email.toLowerCase() !== key);
    renderChips();
  }
  function renderChips() {
    chipsEl.innerHTML = state.composeRecipients.map(r => `
      <span class="chip">
        ${r.name ? `<b>${esc(r.name)}</b>` : `<b>${esc(r.email)}</b>`}
        ${r.name ? `<small>${esc(r.email)}</small>` : ''}
        <button type="button" data-chip-remove="${esc(r.email)}" title="Remove">×</button>
      </span>`).join('');
  }
  chipsEl.addEventListener('click', e => {
    const btn = e.target.closest('[data-chip-remove]');
    if (btn) removeRecipient(btn.dataset.chipRemove);
  });

  function tryAddFromInput() {
    const val = addInput.value.trim();
    if (!val) return;
    // Match by exact email, or by name substring in datalist
    const allPeople = [
      ...BOARD.filter(b => b.email).map(b => ({ email: b.email, name: b.name })),
      ...state.members.filter(m => m.Email).map(m => ({ email: m.Email, name: m.Name }))
    ];
    let match = allPeople.find(p => p.email.toLowerCase() === val.toLowerCase());
    if (!match) {
      // try finding by name (case-insensitive exact or prefix)
      const lc = val.toLowerCase();
      match = allPeople.find(p => String(p.name || '').toLowerCase() === lc)
           || allPeople.find(p => String(p.name || '').toLowerCase().startsWith(lc));
    }
    if (match) {
      addRecipient(match.email, match.name);
      addInput.value = '';
    } else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      addRecipient(val, '');
      addInput.value = '';
    } else {
      addInput.value = '';
    }
  }
  addBtn.addEventListener('click', tryAddFromInput);
  addInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); tryAddFromInput(); }
  });

  /* Quick-send from board card or club member row → jump to compose with that person */
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-compose-email]');
    if (!btn) return;
    e.preventDefault();
    addRecipient(btn.dataset.composeEmail, btn.dataset.composeName || '');
    switchTab('compose');
    subjectInput.focus();
  });

  /* ──────── rich text editor ──────── */
  function initEditor() {
    try { document.execCommand('styleWithCSS', false, true); } catch (e) {}

    // Preserve selection when clicking toolbar buttons
    editorToolbar.addEventListener('mousedown', e => {
      if (e.target.closest('button')) e.preventDefault();
    });

    editorToolbar.querySelectorAll('[data-cmd]').forEach(el => {
      if (el.tagName === 'SELECT') {
        el.addEventListener('change', () => {
          editorBody.focus();
          const val = el.value;
          if (!val) return;
          try { document.execCommand(el.dataset.cmd, false, val); } catch (e) {}
          el.value = '';
        });
        return;
      }
      el.addEventListener('click', () => {
        editorBody.focus();
        const cmd = el.dataset.cmd;
        if (cmd === 'createLink') {
          const url = prompt('Link URL:', 'https://');
          if (url && url.trim() !== 'https://') {
            try { document.execCommand('createLink', false, url.trim()); } catch (e) {}
          }
        } else if (cmd === 'insertImage') {
          const url = prompt('Image URL:', 'https://');
          if (url && url.trim() !== 'https://') {
            try { document.execCommand('insertImage', false, url.trim()); } catch (e) {}
          }
        } else if (cmd === 'hiliteColor') {
          try { document.execCommand('hiliteColor', false, el.dataset.val || '#fff3a0'); } catch (e) {}
        } else {
          try { document.execCommand(cmd, false, null); } catch (e) {}
        }
      });
    });

    // Paste as plain text so pasting from Word doesn't wreck styles
    editorBody.addEventListener('paste', e => {
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      if (text) {
        e.preventDefault();
        try { document.execCommand('insertText', false, text); } catch (err) {}
      }
    });
  }

  /* ──────── send ──────── */
  function wrapEmailHtml(innerHtml) {
    return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#0a1220;">
      <div style="max-width:600px;margin:0 auto;padding:28px 24px;">
        <div style="border-bottom:2px solid #1fb766;padding-bottom:10px;margin-bottom:20px;font-family:Georgia,serif;font-size:18px;font-weight:700;letter-spacing:-.02em;color:#0a1220;">
          Algorithmic Trading Club
        </div>
        <div style="font-size:14px;line-height:1.65;color:#0a1220;">
          ${innerHtml}
        </div>
        <hr style="border:0;border-top:1px solid #e0e0e0;margin:26px 0 14px;">
        <p style="color:#888;font-size:11px;margin:0;">Sent by Algorithmic Trading Club</p>
      </div>
    </body></html>`;
  }

  composeForm.addEventListener('submit', async e => {
    e.preventDefault();
    composeErr.classList.add('hidden');

    if (state.composeRecipients.length === 0) return showComposeErr('Add at least one recipient.');
    const subject = subjectInput.value.trim();
    if (!subject) return showComposeErr('Subject is required.');

    const html = editorBody.innerHTML.trim();
    const plainText = editorBody.innerText.trim();
    if (!plainText) return showComposeErr('Message body is empty.');

    const key = getKey();
    if (!key) return showComposeErr('Session expired — please log in again.');

    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span class="spinner spinner-sm"></span> SENDING…';
    sendStatus.className = 'status-pill';
    sendStatus.classList.remove('hidden');
    sendStatus.innerHTML = '<span class="spinner spinner-sm"></span> Sending to ' + state.composeRecipients.length + '…';

    try {
      const result = await postHR({
        type: 'hr_email',
        key,
        recipients: state.composeRecipients,
        subject,
        htmlBody: wrapEmailHtml(html),
        plainBody: plainText
      });

      if (result && result.ok) {
        const f = result.failed || 0;
        sendStatus.className = 'status-pill ' + (f > 0 ? 'is-error' : 'is-saved');
        sendStatus.textContent = f > 0
          ? '⚠ Sent to ' + result.sent + ' · ' + f + ' failed'
          : '✓ Sent to ' + result.sent;
        state.composeRecipients = [];
        renderChips();
        subjectInput.value = '';
        editorBody.innerHTML = '';
        await reload();
      } else {
        sendStatus.className = 'status-pill is-error';
        sendStatus.textContent = '✕ ' + ((result && result.error) || 'Send failed');
      }
    } catch (err) {
      sendStatus.className = 'status-pill is-error';
      sendStatus.textContent = '✕ ' + (err.message || 'Network error');
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = 'SEND ▸';
      setTimeout(() => sendStatus.classList.add('hidden'), 6000);
    }
  });

  function showComposeErr(msg) {
    composeErr.textContent = msg;
    composeErr.classList.remove('hidden');
  }

  /* ──────── sent table ──────── */
  function renderSent() {
    const rows = state.emails.slice().sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
    sentTag.textContent = rows.length + ' TOTAL';
    if (!rows.length) {
      sentTable.outerHTML = '<table id="sentTable" class="terminal-table"><tbody><tr><td class="table-empty">NO MESSAGES SENT YET</td></tr></tbody></table>';
      return;
    }
    sentTable.outerHTML = `
      <table id="sentTable" class="terminal-table">
        <thead><tr>
          <th>TIME</th><th>TO</th><th>SUBJECT</th><th>STATUS</th>
        </tr></thead>
        <tbody>
          ${rows.map(r => {
            const status = String(r.Status || '').toUpperCase();
            const cls = status === 'SENT' ? 'pill' : 'pill red';
            return `<tr title="${esc(r.Error || '')}">
              <td class="cell-time">${esc(fmtDateTime(r.Timestamp))}</td>
              <td class="cell-email" title="${esc(r['To Email'] || '')}">${esc((r['To Name'] || '') || (r['To Email'] || ''))}</td>
              <td class="cell-name" title="${esc(r.Subject || '')}">${esc(r.Subject || '—')}</td>
              <td><span class="${cls}">${esc(status || '?')}</span></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }

  /* ──────── render ──────── */
  function render(data) {
    state.members = data.members || [];
    state.emails  = data.emails  || [];
    // prune selections that no longer exist
    const validKeys = new Set(state.members.map(m => String(m.Email || '').toLowerCase()));
    [...state.selected].forEach(k => { if (!validKeys.has(k)) state.selected.delete(k); });
    buildDatalist();
    renderKPIs();
    renderBoard();
    renderClub();
    renderSent();
    updateSelectionBar();
  }

  /* ──────── boot ──────── */
  const stored = getKey();
  if (stored) tryLogin(stored).catch(() => clearKey());
})();