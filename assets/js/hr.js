/* ATC HR — CMS for board + members, rich compose, sender accountability. */
(() => {
  'use strict';

  const cfg = window.ATC_CONFIG || {};
  const KEY_STORAGE    = 'atc_hr_key';
  const TAB_STORAGE    = 'atc_hr_tab';
  const SENDER_STORAGE = 'atc_hr_sender';
  const DRAFT_STORAGE  = 'atc_hr_draft';
  const AUTO_REFRESH_MS = 60000;

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

  const TEMPLATES = [
    { id: 'welcome', label: 'Welcome', subject: 'Welcome to the Algorithmic Trading Club',
      body: '<p>Hi there,</p><p>Welcome aboard — glad to have you with us.</p><p>Our next session is <b>[date, time]</b> at <b>[location]</b>. Bring a laptop if you can.</p><p>See you there,<br>— Algorithmic Trading Club</p>' },
    { id: 'event', label: 'Event invite', subject: 'You\'re invited: [Event name]',
      body: '<p>Hi,</p><p>We\'re hosting <b>[Event name]</b> on <b>[date]</b> at <b>[time]</b>.</p><p>Where: <b>[location]</b><br>What: [short description]</p><p>RSVP by replying to this email.</p><p>— Algorithmic Trading Club</p>' },
    { id: 'reminder', label: 'Meeting reminder', subject: 'Reminder: [Event] tomorrow',
      body: '<p>Hi,</p><p>Quick reminder that <b>[Event]</b> is happening <b>tomorrow at [time]</b> in <b>[location]</b>.</p><p>See you there.<br>— Algorithmic Trading Club</p>' },
    { id: 'thankyou', label: 'Thank you', subject: 'Thanks for joining us',
      body: '<p>Hi,</p><p>Thank you for coming to <b>[Event]</b>. It was great having you with us.</p><p>If you have any questions or want to get involved more, just reply.</p><p>— Algorithmic Trading Club</p>' }
  ];

  const AUDIENCES = [
    { id: 'all',         label: 'All club members',  test: m => !!m.Email },
    { id: 'recent',      label: 'Last 24 hours',     test: m => !!m.Email && Date.now() - new Date(m.Timestamp).getTime() < 86400000 },
    { id: 'first',       label: 'First years',       test: m => !!m.Email && /first/i.test(m.Education || '') },
    { id: 'second',      label: 'Second years',      test: m => !!m.Email && /second/i.test(m.Education || '') },
    { id: 'third',       label: 'Third year+',       test: m => !!m.Email && /third|later/i.test(m.Education || '') },
    { id: 'engineering', label: 'Engineering',       test: m => !!m.Email && /engineer/i.test(m.Education || '') },
    { id: 'masters',     label: "Master's students", test: m => !!m.Email && /master/i.test(m.Education || '') }
  ];

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const fmtDateTime = ts => {
    const d = ts instanceof Date ? ts : new Date(ts);
    if (isNaN(d)) return '—';
    const now = new Date();
    const t = pad(d.getHours()) + ':' + pad(d.getMinutes());
    if (d.toDateString() === now.toDateString()) return t;
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + ' ' + t;
  };
  const relativeTime = ts => {
    const d = ts instanceof Date ? ts : new Date(ts);
    if (isNaN(d)) return '—';
    const diff = Date.now() - d.getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)  return 'just now';
    if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    const days = Math.floor(h / 24);
    if (days < 30) return days + 'd ago';
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1);
  };
  const initials = name => String(name || '').replace(/[^A-Za-z\u00C0-\u024F ]/g, '')
    .split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '·';
  const hashStr = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
  const PALETTE = ['var(--chart-1)','var(--chart-2)','var(--chart-3)','var(--chart-4)','var(--chart-5)'];
  const colorFor = s => PALETTE[hashStr(s || '') % PALETTE.length];
  const avatarUrl = email => email ? `https://unavatar.io/${encodeURIComponent(email)}?fallback=false` : '';

  const $ = id => document.getElementById(id);
  const loginEl      = $('login');
  const dashboardEl  = $('dashboard');
  const loginForm    = $('loginForm');
  const pwInput      = $('pw');
  const loginErr     = $('loginErr');
  const tickerTime   = $('tickerTime');
  const tickerMsg    = $('tickerMsg');
  const tickerSender = $('tickerSender');
  const refreshBtn   = $('refreshBtn');
  const logoutBtn    = $('logoutBtn');
  const sideNav      = $('sideNav');
  const mobileNav    = $('mobileNav');
  const senderSelect = $('senderSelect');
  const senderHint   = $('senderHint');
  const sideKpis     = $('sideKpis');
  const sideDraft    = $('sideDraftState');
  const boardGrid    = $('boardGrid');
  const boardSearch  = $('boardSearch');
  const clubTable    = $('clubTable');
  const clubSearch   = $('clubSearch');
  const clubCount    = $('clubCount');
  const chipsEl      = $('chips');
  const addInput     = $('addRecipient');
  const addBtn       = $('addRecipientBtn');
  const datalistEl   = $('allPeopleList');
  const recipientCnt = $('recipientCount');
  const clearAllRecipientsBtn = $('clearAllRecipients');
  const templateSel  = $('templateSelect');
  const audienceSel  = $('audienceSelect');
  const subjectInput = $('subject');
  const editorBody   = $('editorBody');
  const editorToolbar= $('editorToolbar');
  const composeForm  = $('composeForm');
  const composeErr   = $('composeErr');
  const sendBtn      = $('sendBtn');
  const sendStatus   = $('sendStatus');
  const previewBtn   = $('previewBtn');
  const draftBtn     = $('draftBtn');
  const testBtn      = $('testBtn');
  const sentTable    = $('sentTable');
  const sentTag      = $('sentTag');
  const boardTag     = $('boardTag');
  const boardStats   = $('boardStatsTable');
  const boardRecent  = $('boardRecentTable');
  const selectionBar = $('selectionBar');
  const selCount     = $('selCount');
  const composeSelBtn= $('composeSelectedBtn');
  const clearSelBtn  = $('clearSelectionBtn');
  const previewModal = $('previewModal');
  const pvFrom       = $('pvFrom');
  const pvTo         = $('pvTo');
  const pvSubject    = $('pvSubject');
  const pvFrame      = $('pvFrame');
  const closePreviewBtn   = $('closePreviewBtn');
  const closePreviewBtn2  = $('closePreviewBtn2');
  const sendFromPreviewBtn = $('sendFromPreviewBtn');
  const senderSheet       = $('senderSheet');
  const senderSheetList   = $('senderSheetList');
  const sheetSenderHint   = $('sheetSenderHint');
  const sheetKpis         = $('sheetKpis');
  const sheetDraftState   = $('sheetDraftState');

  const state = {
    members: [],
    emails: [],
    boardSearch: '',
    clubSearch: '',
    selected: new Set(),
    composeRecipients: []
  };

  /* ──────── undo toast ──────── */
  let undoTimeout = null;
  let undoAction = null;
  let undoToastEl = null;

  function showUndoToast(message, undoFn) {
    if (undoTimeout) { clearTimeout(undoTimeout); undoTimeout = null; }
    if (undoToastEl) { undoToastEl.remove(); undoToastEl = null; }
    undoAction = undoFn;

    const toast = document.createElement('div');
    toast.className = 'undo-toast';
    toast.innerHTML = `
      <span class="undo-msg">${esc(message)}</span>
      <button type="button" class="undo-btn">UNDO</button>
      <button type="button" class="undo-dismiss" aria-label="Dismiss">✕</button>`;
    document.body.appendChild(toast);
    undoToastEl = toast;
    requestAnimationFrame(() => toast.classList.add('visible'));

    const dismiss = () => {
      if (undoTimeout) { clearTimeout(undoTimeout); undoTimeout = null; }
      undoAction = null;
      if (undoToastEl) {
        const el = undoToastEl;
        undoToastEl = null;
        el.classList.remove('visible');
        setTimeout(() => el.remove(), 250);
      }
    };

    toast.querySelector('.undo-btn').addEventListener('click', () => {
      const fn = undoAction;
      dismiss();
      if (fn) try { fn(); } catch (e) { console.error(e); }
    });
    toast.querySelector('.undo-dismiss').addEventListener('click', dismiss);

    undoTimeout = setTimeout(dismiss, 8000);
  }

  /* ──────── storage ──────── */
  const getKey   = () => { try { return sessionStorage.getItem(KEY_STORAGE); } catch (e) { return null; } };
  const setKey   = k  => { try { sessionStorage.setItem(KEY_STORAGE, k); } catch (e) {} };
  const clearKey = () => { try { sessionStorage.removeItem(KEY_STORAGE); } catch (e) {} };
  const getSenderIdx   = () => { const v = sessionStorage.getItem(SENDER_STORAGE); return v !== null ? parseInt(v, 10) : null; };
  const setSenderIdx   = i => { try { sessionStorage.setItem(SENDER_STORAGE, String(i)); } catch (e) {} };
  const clearSenderIdx = () => { try { sessionStorage.removeItem(SENDER_STORAGE); } catch (e) {} };
  const getSender = () => { const i = getSenderIdx(); if (i === null || !BOARD[i]) return null; return { name: BOARD[i].name, email: BOARD[i].email || '' }; };

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
    try { data = await res.json(); } catch (e) { data = { ok: false, error: 'Malformed response (did you deploy the new Hr.gs?)' }; }
    return data;
  }

  function enterDashboard(data) {
    loginEl.classList.add('hidden');
    dashboardEl.classList.remove('hidden');
    buildSenderSelect();
    buildTemplateSelect();
    buildAudienceSelect();
    initTabs();
    initEditor();
    buildDatalist();
    startClock();
    render(data);
    startAutoRefresh();
    refreshBtn.addEventListener('click', reload);
    logoutBtn.addEventListener('click', logout);
    loadDraftIfAny();
  }

  function initTabs() {
    switchTab(localStorage.getItem(TAB_STORAGE) || 'people');
    const handler = e => {
      const btn = e.target.closest('[data-tab]');
      if (btn) switchTab(btn.dataset.tab);
    };
    sideNav.addEventListener('click', handler);
    if (mobileNav) mobileNav.addEventListener('click', handler);
  }
  function switchTab(name) {
    sideNav.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    if (mobileNav) mobileNav.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.dash-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === name));
    localStorage.setItem(TAB_STORAGE, name);
    updateSelectionBar();
  }

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
  function stopAutoRefresh() { if (clockTimer) clearInterval(clockTimer); if (refreshTimer) clearInterval(refreshTimer); }
  async function reload() {
    const key = getKey(); if (!key) return;
    try { render(await fetchHR(key)); tickerMsg.textContent = 'SYNCED'; }
    catch (e) { tickerMsg.textContent = 'SYNC FAILED'; }
  }

  /* ──────── sender ──────── */
  function buildSenderSelect() {
    senderSelect.innerHTML = '<option value="">— pick yourself —</option>' +
      BOARD.map((b, i) => `<option value="${i}">${esc(b.name)} · ${esc(b.role)}</option>`).join('');
    const saved = getSenderIdx();
    if (saved !== null && BOARD[saved]) senderSelect.value = String(saved);
    senderSelect.addEventListener('change', () => {
      if (senderSelect.value === '') clearSenderIdx();
      else setSenderIdx(parseInt(senderSelect.value, 10));
      updateSenderHint();
      updateTickerSender();
      renderSenderSheet();
    });
    updateSenderHint();
    updateTickerSender();

    // Ticker chip → open sheet
    if (tickerSender) tickerSender.addEventListener('click', openSenderSheet);

    // Sheet close
    document.querySelectorAll('[data-close-sheet]').forEach(el => {
      el.addEventListener('click', closeSenderSheet);
    });

    // Sheet item click
    if (senderSheetList) {
      senderSheetList.addEventListener('click', e => {
        const btn = e.target.closest('[data-sender-idx]');
        if (!btn) return;
        const idx = parseInt(btn.dataset.senderIdx, 10);
        if (isNaN(idx)) return;
        setSenderIdx(idx);
        senderSelect.value = String(idx);
        updateSenderHint();
        updateTickerSender();
        closeSenderSheet();
      });
    }

    // Escape closes sheet
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && senderSheet && !senderSheet.classList.contains('hidden')) {
        closeSenderSheet();
      }
    });

    renderSenderSheet();
  }
  function updateSenderHint() {
    const s = getSender();
    if (s) {
      senderHint.textContent = 'Emails will be logged as sent by ' + s.name + (s.email ? ' <' + s.email + '>' : '') + '.';
      senderHint.className = 'side-hint ok';
    } else {
      senderHint.textContent = 'Required for accountability. Emails will not send until you pick yourself.';
      senderHint.className = 'side-hint warn';
    }
  }
  function updateTickerSender() {
    const s = getSender();
    if (!tickerSender) return;
    tickerSender.textContent = s ? ('AS · ' + s.name) : '⚠ Pick sender';
    tickerSender.classList.toggle('is-unset', !s);
  }

  function renderSenderSheet() {
    if (!senderSheetList) return;
    const cur = getSenderIdx();
    senderSheetList.innerHTML = BOARD.map((b, i) => `
      <button type="button" class="sheet-item ${i === cur ? 'is-active' : ''}" data-sender-idx="${i}">
        <span class="sheet-item-name">${esc(b.name)}</span>
        <span class="sheet-item-role">${esc(b.role)}</span>
        ${i === cur ? '<span class="sheet-item-check">✓</span>' : ''}
      </button>`).join('');
    if (sheetSenderHint) {
      const s = getSender();
      sheetSenderHint.textContent = s
        ? 'Emails will be logged as sent by ' + s.name + '.'
        : 'Pick yourself — required for accountability.';
      sheetSenderHint.className = 'sheet-hint ' + (s ? 'ok' : 'warn');
    }
    if (sheetKpis && sideKpis) sheetKpis.innerHTML = sideKpis.innerHTML;
    if (sheetDraftState && sideDraft) sheetDraftState.innerHTML = sideDraft.innerHTML;
  }
  function openSenderSheet() {
    renderSenderSheet();
    if (senderSheet) { senderSheet.classList.remove('hidden'); senderSheet.setAttribute('aria-hidden', 'false'); }
  }
  function closeSenderSheet() {
    if (senderSheet) { senderSheet.classList.add('hidden'); senderSheet.setAttribute('aria-hidden', 'true'); }
  }

  /* ──────── templates & audiences ──────── */
  function buildTemplateSelect() {
    templateSel.innerHTML = '<option value="">Templates…</option>' +
      TEMPLATES.map(t => `<option value="${t.id}">${esc(t.label)}</option>`).join('');
    templateSel.addEventListener('change', () => {
      const id = templateSel.value;
      templateSel.value = '';
      if (!id) return;
      const t = TEMPLATES.find(x => x.id === id);
      if (!t) return;

      const prev = { subject: subjectInput.value, body: editorBody.innerHTML };
      subjectInput.value = t.subject;
      editorBody.innerHTML = t.body;
      updateSideDraftState();

      showUndoToast('Template applied: ' + t.label, () => {
        subjectInput.value = prev.subject;
        editorBody.innerHTML = prev.body;
        updateSideDraftState();
      });
    });
  }
  function buildAudienceSelect() {
    audienceSel.innerHTML = '<option value="">Add audience…</option>' +
      AUDIENCES.map(a => `<option value="${a.id}">${esc(a.label)}</option>`).join('');
    audienceSel.addEventListener('change', () => {
      const id = audienceSel.value;
      audienceSel.value = '';
      if (!id) return;
      const a = AUDIENCES.find(x => x.id === id);
      if (!a) return;
      const matching = state.members.filter(a.test);
      if (!matching.length) { flashStatus('No members match "' + a.label + '".', true); return; }
      let added = 0;
      matching.forEach(m => { if (addRecipient(m.Email, m.Name)) added++; });
      flashStatus('Added ' + added + ' ' + (added === 1 ? 'member' : 'members') + ' from ' + a.label + '.');
    });
  }

  function renderKPIs() {
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const todayEmails = state.emails.filter(e => new Date(e.Timestamp).getTime() >= dayStart.getTime()).length;
    const failed = state.emails.filter(e => String(e.Status || '').toUpperCase() === 'FAILED').length;
    const html = `
      <div class="side-kpi"><span class="side-kpi-label">MEMBERS</span><span class="side-kpi-value is-green">${state.members.length}</span></div>
      <div class="side-kpi"><span class="side-kpi-label">BOARD</span><span class="side-kpi-value">${BOARD.length}</span></div>
      <div class="side-kpi"><span class="side-kpi-label">SENT TODAY</span><span class="side-kpi-value is-gold">${todayEmails}</span></div>
      <div class="side-kpi"><span class="side-kpi-label">FAILED</span><span class="side-kpi-value ${failed ? 'is-red' : ''}">${failed}</span></div>`;
    sideKpis.innerHTML = html;
    if (sheetKpis) sheetKpis.innerHTML = html;
  }

  /* ──────── board ──────── */
  function renderBoard() {
    const q = state.boardSearch.trim().toLowerCase();
    const list = q ? BOARD.filter(m =>
      (m.name + ' ' + m.role + ' ' + (m.alias || '') + ' ' + (m.email || '') + ' ' + (m.phone || '')).toLowerCase().includes(q)) : BOARD;

    const activity = {};
    state.emails.forEach(e => {
      const key = String(e['Sent By Email'] || '').toLowerCase() || String(e['Sent By'] || '').toLowerCase();
      if (!key) return;
      const t = new Date(e.Timestamp).getTime();
      if (!activity[key] || t > activity[key]) activity[key] = t;
    });

    boardGrid.innerHTML = list.length
      ? list.map(m => renderBoardCard(m, activity)).join('')
      : '<div class="hr-empty">NO MATCHES</div>';
  }
  function renderBoardCard(m, activity) {
    const color = colorFor(m.name + (m.email || ''));
    const src = avatarUrl(m.email);
    const phone = m.phone
      ? `<a href="tel:${esc(m.phone.replace(/\s+/g, ''))}">${esc(m.phone)}</a>`
      : `<span class="muted">not provided</span>`;
    const email = m.email
      ? `<button class="link-btn" type="button" data-compose-email="${esc(m.email)}" data-compose-name="${esc(m.name)}">${esc(m.email)}</button>`
      : `<span class="muted">no email yet</span>`;
    const key1 = (m.email || '').toLowerCase();
    const key2 = (m.name || '').toLowerCase();
    const lastActive = activity[key1] || activity[key2];
    const badge = lastActive
      ? `<span class="badge-active" title="${esc(fmtDateTime(lastActive))}">ACTIVE ${esc(relativeTime(lastActive))}</span>`
      : `<span class="badge-inactive">NO SENDS YET</span>`;
    return `
      <div class="member-card">
        <div class="avatar" style="color:${color}">
          <span class="avatar-initials">${esc(initials(m.name))}</span>
          ${src ? `<img class="avatar-img" src="${src}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.style.display='none'">` : ''}
        </div>
        <div class="member-body">
          <div class="member-name">${esc(m.name)}${m.alias ? `<span class="member-alias">(${esc(m.alias)})</span>` : ''}</div>
          <span class="member-role">${esc(m.role)}</span>
          <div style="margin-bottom:6px">${badge}</div>
          <div class="member-line"><span class="key">TEL</span>${phone}</div>
          <div class="member-line"><span class="key">MAIL</span>${email}</div>
        </div>
      </div>`;
  }
  boardSearch.addEventListener('input', () => { state.boardSearch = boardSearch.value; renderBoard(); });

  /* ──────── club members ──────── */
  function renderClub() {
    const q = state.clubSearch.trim().toLowerCase();
    const list = q ? state.members.filter(m =>
      (String(m.Name || '') + ' ' + (m.Education || '') + ' ' + (m.Email || '') + ' ' + (m['Why they want to join'] || '')).toLowerCase().includes(q)) : state.members;

    clubCount.textContent = state.members.length;
    recipientCnt.textContent = '· ' + state.composeRecipients.length + ' in compose';

    if (!list.length) {
      clubTable.outerHTML = '<table id="clubTable" class="terminal-table"><tbody><tr><td class="table-empty">NO CLUB MEMBERS YET — SIGNUPS WILL APPEAR HERE</td></tr></tbody></table>';
      return;
    }
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
        table.querySelectorAll('tbody tr').forEach(tr => {
          const chk = tr.querySelector('[data-member-email]');
          const em = chk?.dataset.memberEmail?.toLowerCase();
          if (!em) return;
          if (sel.checked) state.selected.add(em);
          else state.selected.delete(em);
          if (chk) chk.checked = sel.checked;
        });
        updateSelectionBar(); renderKPIs();
        return;
      }
      const chk = e.target.closest('[data-member-email]');
      if (chk) {
        const em = chk.dataset.memberEmail.toLowerCase();
        if (chk.checked) state.selected.add(em);
        else state.selected.delete(em);
        updateSelectionBar(); renderKPIs();
        const all = table.querySelector('#clubSelectAll');
        if (all) {
          const boxes = table.querySelectorAll('tbody [data-member-email]');
          all.checked = boxes.length > 0 && [...boxes].every(b => b.checked);
        }
      }
    });
  }
  clubSearch.addEventListener('input', () => { state.clubSearch = clubSearch.value; renderClub(); });

  /* ──────── selection ──────── */
  function updateSelectionBar() {
    selCount.textContent = state.selected.size;
    selectionBar.classList.toggle('hidden', state.selected.size === 0);
  }
  clearSelBtn.addEventListener('click', () => {
    if (!state.selected.size) return;
    const prev = new Set(state.selected);
    state.selected.clear();
    renderClub();
    updateSelectionBar();
    renderKPIs();
    showUndoToast(`Cleared ${prev.size} selected`, () => {
      state.selected = prev;
      renderClub();
      updateSelectionBar();
      renderKPIs();
    });
  });
  composeSelBtn.addEventListener('click', () => {
    if (!state.selected.size) return;
    state.selected.forEach(emailKey => {
      const member = state.members.find(m => String(m.Email || '').toLowerCase() === emailKey);
      if (member) addRecipient(member.Email, member.Name);
    });
    state.selected.clear();
    renderClub();
    updateSelectionBar();
    renderKPIs();
    switchTab('compose');
  });

  /* ──────── recipients ──────── */
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
    if (state.composeRecipients.some(r => r.email.toLowerCase() === key)) return false;
    state.composeRecipients.push({ email: e, name: String(name || '').trim() });
    renderChips();
    return true;
  }
  function removeRecipient(email) {
    const key = email.toLowerCase();
    const prev = state.composeRecipients.slice();
    const removed = prev.find(r => r.email.toLowerCase() === key);
    state.composeRecipients = prev.filter(r => r.email.toLowerCase() !== key);
    renderChips();
    if (removed) {
      showUndoToast(`Removed ${removed.name || removed.email}`, () => {
        state.composeRecipients = prev;
        renderChips();
      });
    }
  }
  function clearAllRecipients() {
    if (!state.composeRecipients.length) return;
    const prev = state.composeRecipients.slice();
    state.composeRecipients = [];
    renderChips();
    showUndoToast(`Cleared ${prev.length} recipient${prev.length === 1 ? '' : 's'}`, () => {
      state.composeRecipients = prev;
      renderChips();
    });
  }
  function renderChips() {
    chipsEl.innerHTML = state.composeRecipients.map(r => `
      <span class="chip">
        ${r.name ? `<b>${esc(r.name)}</b>` : `<b>${esc(r.email)}</b>`}
        ${r.name ? `<small>${esc(r.email)}</small>` : ''}
        <button type="button" data-chip-remove="${esc(r.email)}" title="Remove">×</button>
      </span>`).join('');
    recipientCnt.textContent = '· ' + state.composeRecipients.length + ' in compose';
    clearAllRecipientsBtn.classList.toggle('hidden', state.composeRecipients.length === 0);
    updateSideDraftState();
  }
  chipsEl.addEventListener('click', e => {
    const btn = e.target.closest('[data-chip-remove]');
    if (btn) removeRecipient(btn.dataset.chipRemove);
  });
  clearAllRecipientsBtn.addEventListener('click', clearAllRecipients);

  function tryAddFromInput() {
    const val = addInput.value.trim();
    if (!val) return;
    const allPeople = [
      ...BOARD.filter(b => b.email).map(b => ({ email: b.email, name: b.name })),
      ...state.members.filter(m => m.Email).map(m => ({ email: m.Email, name: m.Name }))
    ];
    let match = allPeople.find(p => p.email.toLowerCase() === val.toLowerCase());
    if (!match) {
      const lc = val.toLowerCase();
      match = allPeople.find(p => String(p.name || '').toLowerCase() === lc)
           || allPeople.find(p => String(p.name || '').toLowerCase().startsWith(lc));
    }
    if (match) { addRecipient(match.email, match.name); addInput.value = ''; }
    else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) { addRecipient(val, ''); addInput.value = ''; }
    else { addInput.value = ''; }
  }
  addBtn.addEventListener('click', tryAddFromInput);
  addInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); tryAddFromInput(); } });

  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-compose-email]');
    if (!btn) return;
    e.preventDefault();
    addRecipient(btn.dataset.composeEmail, btn.dataset.composeName || '');
    switchTab('compose');
    subjectInput.focus();
  });

  /* ──────── editor ──────── */
  function initEditor() {
    try { document.execCommand('styleWithCSS', false, true); } catch (e) {}
    editorToolbar.addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });
    editorToolbar.querySelectorAll('[data-cmd]').forEach(el => {
      if (el.tagName === 'SELECT') {
        el.addEventListener('change', () => {
          editorBody.focus();
          const val = el.value; if (!val) return;
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
          if (url && url.trim() !== 'https://') try { document.execCommand('createLink', false, url.trim()); } catch (e) {}
        } else if (cmd === 'insertImage') {
          const url = prompt('Image URL:', 'https://');
          if (url && url.trim() !== 'https://') try { document.execCommand('insertImage', false, url.trim()); } catch (e) {}
        } else if (cmd === 'hiliteColor') {
          try { document.execCommand('hiliteColor', false, el.dataset.val || '#fff3a0'); } catch (e) {}
        } else {
          try { document.execCommand(cmd, false, null); } catch (e) {}
        }
      });
    });
    editorBody.addEventListener('paste', e => {
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      if (text) { e.preventDefault(); try { document.execCommand('insertText', false, text); } catch (err) {} }
    });
    editorBody.addEventListener('input', updateSideDraftState);
    subjectInput.addEventListener('input', updateSideDraftState);
  }

  function wrapEmailHtml(innerHtml, senderName) {
    return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#0a1220;">
      <div style="max-width:600px;margin:0 auto;padding:28px 24px;">
        <div style="border-bottom:2px solid #1fb766;padding-bottom:10px;margin-bottom:20px;font-family:Georgia,serif;font-size:18px;font-weight:700;letter-spacing:-.02em;color:#0a1220;">Algorithmic Trading Club</div>
        <div style="font-size:14px;line-height:1.65;color:#0a1220;">${innerHtml}</div>
        <hr style="border:0;border-top:1px solid #e0e0e0;margin:26px 0 14px;">
        <p style="color:#888;font-size:11px;margin:0;">Sent by ${senderName ? senderName + ' · ' : ''}Algorithmic Trading Club</p>
      </div></body></html>`;
  }

  function validateDraft() {
    const sender = getSender();
    if (!sender) return 'Pick yourself in the ACTING AS sidebar first.';
    if (!state.composeRecipients.length) return 'Add at least one recipient.';
    if (!subjectInput.value.trim()) return 'Subject is required.';
    if (!editorBody.innerText.trim()) return 'Message body is empty.';
    return null;
  }
  function showComposeErr(msg) {
    composeErr.textContent = msg;
    composeErr.classList.remove('hidden');
    composeErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function flashStatus(msg, isErr) {
    sendStatus.className = 'status-pill ' + (isErr ? 'is-error' : 'is-saved');
    sendStatus.textContent = msg;
    sendStatus.classList.remove('hidden');
    setTimeout(() => sendStatus.classList.add('hidden'), 6000);
  }

  async function sendEmail({ testMode = false } = {}) {
    composeErr.classList.add('hidden');
    const err = validateDraft();
    if (err) return showComposeErr(err);

    const sender = getSender();
    const subject = subjectInput.value.trim();
    const html = editorBody.innerHTML.trim();
    const plainText = editorBody.innerText.trim();

    let recipients = state.composeRecipients;
    let finalSubject = subject;
    if (testMode) {
      if (!sender.email) return showComposeErr('Pick a sender with an email so we can send a test.');
      recipients = [{ email: sender.email, name: sender.name + ' (test)' }];
      finalSubject = '[TEST] ' + subject;
    }

    // Snapshot for undo after send
    const prevForm = {
      recipients: state.composeRecipients.slice(),
      subject: subjectInput.value,
      body: editorBody.innerHTML
    };

    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span class="spinner spinner-sm"></span> SENDING…';
    flashStatus('Sending to ' + recipients.length + '…');

    try {
      const result = await postHR({
        type: 'hr_email',
        key: getKey(),
        recipients,
        subject: finalSubject,
        htmlBody: wrapEmailHtml(html, sender.name),
        plainBody: plainText,
        sender
      });

      if (result && result.ok) {
        const f = result.failed || 0;
        flashStatus(f > 0 ? '⚠ Sent to ' + result.sent + ' · ' + f + ' failed' : '✓ Sent to ' + result.sent, f > 0);
        if (!testMode) {
          // Keep failed recipients so user can retry; clear successful ones
          if (f > 0 && Array.isArray(result.results)) {
            const failedEmails = new Set(
              result.results.filter(r => r.status === 'FAILED').map(r => String(r.email).toLowerCase())
            );
            state.composeRecipients = state.composeRecipients.filter(r => failedEmails.has(r.email.toLowerCase()));
          } else {
            state.composeRecipients = [];
          }
          renderChips();
          subjectInput.value = '';
          editorBody.innerHTML = '';
          localStorage.removeItem(DRAFT_STORAGE);
          updateSideDraftState();
          await reload();

          showUndoToast(
            f > 0 ? `Sent ${result.sent} · ${f} failed` : `Sent to ${result.sent}`,
            () => {
              state.composeRecipients = prevForm.recipients;
              renderChips();
              subjectInput.value = prevForm.subject;
              editorBody.innerHTML = prevForm.body;
              updateSideDraftState();
            }
          );
        }
      } else {
        let msg = (result && result.error) || 'Send failed';
        if (result && result.version) msg += ' [' + result.version + ']';
        if (result && typeof result.quota === 'number' && result.quota >= 0) msg += ' · quota ' + result.quota;
        console.warn('[HR send failed]', result);
        flashStatus('✕ ' + msg, true);
      }
    } catch (e) {
      console.error('[HR send error]', e);
      flashStatus('✕ ' + (e.message || 'Network error — is Hr.gs deployed?'), true);
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = 'SEND ▸';
      setTimeout(() => sendStatus.classList.add('hidden'), 8000);
    }
  }
  composeForm.addEventListener('submit', e => { e.preventDefault(); sendEmail(); });

  function openPreview() {
    composeErr.classList.add('hidden');
    const err = validateDraft();
    if (err) return showComposeErr(err);
    const sender = getSender();
    pvFrom.textContent = sender.name + (sender.email ? ' <' + sender.email + '>' : '');
    pvTo.textContent = state.composeRecipients.length === 1
      ? (state.composeRecipients[0].name || state.composeRecipients[0].email)
      : state.composeRecipients.length + ' recipients';
    pvSubject.textContent = subjectInput.value.trim();
    pvFrame.srcdoc = wrapEmailHtml(editorBody.innerHTML.trim(), sender.name);
    previewModal.classList.remove('hidden');
  }
  previewBtn.addEventListener('click', openPreview);
  sendFromPreviewBtn.addEventListener('click', () => { previewModal.classList.add('hidden'); sendEmail(); });
  closePreviewBtn.addEventListener('click', () => previewModal.classList.add('hidden'));
  closePreviewBtn2.addEventListener('click', () => previewModal.classList.add('hidden'));
  previewModal.addEventListener('click', e => { if (e.target === previewModal) previewModal.classList.add('hidden'); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !previewModal.classList.contains('hidden')) previewModal.classList.add('hidden'); });

  function updateSideDraftState() {
    const subject = subjectInput.value.trim();
    const hasBody = editorBody.innerText.trim().length > 0;
    let html;
    if (!subject && !hasBody && !state.composeRecipients.length) {
      html = 'No draft.';
    } else {
      const parts = [];
      parts.push(state.composeRecipients.length + ' recipient' + (state.composeRecipients.length === 1 ? '' : 's'));
      if (subject) parts.push('"<strong>' + esc(subject.slice(0, 40)) + (subject.length > 40 ? '…' : '') + '</strong>"');
      else parts.push('<em>no subject</em>');
      html = parts.join(' · ');
    }
    sideDraft.innerHTML = html;
    if (sheetDraftState) sheetDraftState.innerHTML = html;
  }
  draftBtn.addEventListener('click', () => {
    const draft = { recipients: state.composeRecipients, subject: subjectInput.value, body: editorBody.innerHTML };
    try { localStorage.setItem(DRAFT_STORAGE, JSON.stringify(draft)); } catch (e) {}
    flashStatus('✓ Draft saved locally.');
  });
  testBtn.addEventListener('click', () => sendEmail({ testMode: true }));

  function loadDraftIfAny() {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.recipients && Array.isArray(d.recipients)) state.composeRecipients = d.recipients;
      if (d.subject) subjectInput.value = d.subject;
      if (d.body) editorBody.innerHTML = d.body;
      renderChips();
      updateSideDraftState();
    } catch (e) {}
  }

  /* ──────── sent + board log ──────── */
  function renderSent() {
    const rows = state.emails.slice().sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
    sentTag.textContent = rows.length + ' TOTAL';
    if (!rows.length) {
      sentTable.outerHTML = '<table id="sentTable" class="terminal-table"><tbody><tr><td class="table-empty">NO MESSAGES SENT YET</td></tr></tbody></table>';
      return;
    }
    sentTable.outerHTML = `
      <table id="sentTable" class="terminal-table">
        <thead><tr><th>TIME</th><th>TO</th><th>SUBJECT</th><th>SENT BY</th><th>STATUS</th></tr></thead>
        <tbody>
          ${rows.map(r => {
            const status = String(r.Status || '').toUpperCase();
            const cls = status === 'SENT' ? 'pill' : 'pill red';
            return `<tr title="${esc(r.Error || '')}">
              <td class="cell-time">${esc(fmtDateTime(r.Timestamp))}</td>
              <td class="cell-email" title="${esc(r['To Email'] || '')}">${esc((r['To Name'] || '') || (r['To Email'] || ''))}</td>
              <td class="cell-name" title="${esc(r.Subject || '')}">${esc(r.Subject || '—')}</td>
              <td class="cell-mono">${r['Sent By'] ? esc(r['Sent By']) : '<span class="muted" style="font-style:italic">—</span>'}</td>
              <td><span class="${cls}">${esc(status || '?')}</span></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }

  function renderBoardLog() {
    const bySender = {};
    state.emails.forEach(e => {
      const key = String(e['Sent By Email'] || '').toLowerCase() || String(e['Sent By'] || '').toLowerCase();
      if (!key) return;
      if (!bySender[key]) bySender[key] = { count: 0, failed: 0, last: 0, lastSubject: '' };
      bySender[key].count++;
      if (String(e.Status || '').toUpperCase() === 'FAILED') bySender[key].failed++;
      const t = new Date(e.Timestamp).getTime();
      if (t > bySender[key].last) { bySender[key].last = t; bySender[key].lastSubject = e.Subject || ''; }
    });
    const rows = BOARD.map(b => {
      const key = (b.email || b.name || '').toLowerCase();
      return { member: b, stats: bySender[key] || { count: 0, failed: 0, last: 0, lastSubject: '' } };
    });
    rows.sort((a, b) => {
      if (a.stats.last && !b.stats.last) return -1;
      if (!a.stats.last && b.stats.last) return 1;
      return b.stats.count - a.stats.count;
    });
    const totalSends = rows.reduce((s, r) => s + r.stats.count, 0);
    const inactive = rows.filter(r => r.stats.count === 0).length;
    boardTag.textContent = totalSends + ' SENDS · ' + inactive + ' INACTIVE';
    boardStats.outerHTML = `
      <table id="boardStatsTable" class="terminal-table">
        <thead><tr><th>MEMBER</th><th>ROLE</th><th>SENT</th><th>FAILED</th><th>LAST ACTIVE</th><th>LATEST SUBJECT</th></tr></thead>
        <tbody>
          ${rows.map(r => {
            const m = r.member, s = r.stats;
            const active = s.last && (Date.now() - s.last < 86400000);
            const dot = `<span class="activity-dot ${active ? 'is-active' : ''}"></span>`;
            return `<tr>
              <td class="cell-name-row">${dot}${esc(m.name)}</td>
              <td class="cell-mono">${esc(m.role)}</td>
              <td class="cell-mono">${s.count}</td>
              <td class="cell-mono">${s.failed ? '<span style="color:var(--red)">' + s.failed + '</span>' : '—'}</td>
              <td class="cell-time">${s.last ? esc(relativeTime(s.last)) : '<span class="badge-inactive">NEVER</span>'}</td>
              <td class="cell-name" title="${esc(s.lastSubject)}">${s.lastSubject ? esc(s.lastSubject.slice(0, 50)) : '—'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;

    const recent = state.emails
      .filter(e => e['Sent By'] || e['Sent By Email'])
      .sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp))
      .slice(0, 20);
    if (!recent.length) {
      boardRecent.outerHTML = '<table id="boardRecentTable" class="terminal-table"><tbody><tr><td class="table-empty">NO ATTRIBUTED SENDS YET — PICK YOURSELF IN THE SIDEBAR BEFORE SENDING</td></tr></tbody></table>';
      return;
    }
    boardRecent.outerHTML = `
      <table id="boardRecentTable" class="terminal-table">
        <thead><tr><th>TIME</th><th>SENDER</th><th>TO</th><th>SUBJECT</th><th>STATUS</th></tr></thead>
        <tbody>
          ${recent.map(r => {
            const status = String(r.Status || '').toUpperCase();
            const cls = status === 'SENT' ? 'pill' : 'pill red';
            return `<tr>
              <td class="cell-time">${esc(fmtDateTime(r.Timestamp))}</td>
              <td class="cell-mono">${esc(r['Sent By'] || '—')}</td>
              <td class="cell-email" title="${esc(r['To Email'] || '')}">${esc((r['To Name'] || '') || (r['To Email'] || ''))}</td>
              <td class="cell-name" title="${esc(r.Subject || '')}">${esc(r.Subject || '—')}</td>
              <td><span class="${cls}">${esc(status || '?')}</span></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }

  function render(data) {
    state.members = data.members || [];
    state.emails  = data.emails  || [];
    const validKeys = new Set(state.members.map(m => String(m.Email || '').toLowerCase()));
    [...state.selected].forEach(k => { if (!validKeys.has(k)) state.selected.delete(k); });
    buildDatalist();
    renderKPIs();
    renderBoard();
    renderClub();
    renderSent();
    renderBoardLog();
    updateSelectionBar();
    updateSideDraftState();
  }

  const stored = getKey();
  if (stored) tryLogin(stored).catch(() => clearKey());
})();