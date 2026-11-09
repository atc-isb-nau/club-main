/* ATC HR — CMS for board + members, compose, notes, actions, board records. */
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

  const HR_SENDER_IDX = BOARD.map((b, i) => /HR/i.test(b.role) ? i : -1).filter(i => i >= 0);

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

  const NOTE_SEP = '[[NOTE]]';

  /* ───────── utils ───────── */
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
  const fmtDate = ts => {
    const d = ts instanceof Date ? ts : new Date(ts);
    if (isNaN(d)) return '—';
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
  };
  const relativeTime = ts => {
    const d = ts instanceof Date ? ts : new Date(ts);
    if (isNaN(d)) return '—';
    const diff = Date.now() - d.getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
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
  const isValidEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
  const $ = id => document.getElementById(id);
  const isMobile = () => window.matchMedia('(max-width: 1000px)').matches;

  const parseNotes = raw => {
    const str = String(raw || '').trim();
    if (!str) return [];
    return str.split(NOTE_SEP).map(chunk => {
      chunk = chunk.trim();
      if (!chunk) return null;
      try { return JSON.parse(chunk); } catch (e) { return null; }
    }).filter(Boolean);
  };
  const serializeNotes = notes => notes.map(n => JSON.stringify(n)).join(NOTE_SEP);

  /* ───────── dom refs ───────── */
  const loginEl      = $('login');
  const dashboardEl  = $('dashboard');
  const loginForm    = $('loginForm');
  const pwInput      = $('pw');
  const loginErr     = $('loginErr');
  const tickerTime   = $('tickerTime');
  const tickerMsg    = $('tickerMsg');
  const refreshBtn   = $('refreshBtn');
  const logoutBtn    = $('logoutBtn');
  const hamburgerBtn = $('hamburgerBtn');
  const drawerBackdrop = $('drawerBackdrop');
  const sidebar      = $('sidebar');
  const sideNav      = $('sideNav');
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
  const composeSenderNotice = $('composeSenderNotice');
  const pickSenderBtn = $('pickSenderBtn');

  // Actions
  const actionForm      = $('actionForm');
  const actionName      = $('actionName');
  const actionNameSuggestions = $('actionNameSuggestions');
  const actionDate      = $('actionDate');
  const actionMark      = $('actionMark');
  const customMarkField = $('customMarkField');
  const customMark      = $('customMark');
  const actionNote      = $('actionNote');
  const actionAudience  = $('actionAudience');
  const actionMembersChips = $('actionMembersChips');
  const actionMemberCount  = $('actionMemberCount');
  const clearActionMembers = $('clearActionMembers');
  const actionMemberInput  = $('actionMemberInput');
  const actionMemberAddBtn = $('actionMemberAddBtn');
  const actionErr       = $('actionErr');
  const actionStatus    = $('actionStatus');
  const actionSearch    = $('actionSearch');
  const actionFilterName = $('actionFilterName');
  const actionFilterMark = $('actionFilterMark');
  const actionsTable    = $('actionsTable');

  // Board notes
  const boardNoteForm     = $('boardNoteForm');
  const boardNoteCategory = $('boardNoteCategory');
  const boardNoteMemberCount   = $('boardNoteMemberCount');
  const boardNoteMemberChips   = $('boardNoteMemberChips');
  const boardNoteMemberInput   = $('boardNoteMemberInput');
  const boardNoteMemberAddBtn  = $('boardNoteMemberAddBtn');
  const boardNoteMemberClear   = $('clearBoardNoteMembers');
  const boardMembersDatalist   = $('boardMembersList');
  const boardNoteText     = $('boardNoteText');
  const boardNoteErr      = $('boardNoteErr');
  const boardNoteStatus   = $('boardNoteStatus');
  const boardNoteSearch   = $('boardNoteSearch');
  const boardNoteFilterMember = $('boardNoteFilterMember');
  const boardNoteFilterCategory = $('boardNoteFilterCategory');
  const boardNotesTable   = $('boardNotesTable');

  // Modals
  const memberModal      = $('memberModal');
  const memberModalTitle = $('memberModalTitle');
  const memberModalBody  = $('memberModalBody');
  const closeMemberModal = $('closeMemberModal');
  const confirmModal  = $('confirmModal');
  const confirmMsg    = $('confirmMsg');
  const confirmOk     = $('confirmOk');
  const confirmCancel = $('confirmCancel');
  const confirmClose  = $('confirmClose');

  /* ───────── state ───────── */
  const state = {
    members: [],
    emails: [],
    actions: [],
    boardNotes: [],
    boardSearch: '',
    clubSearch: '',
    actionSearch: '',
    actionFilterName: '',
    actionFilterMark: '',
    boardNoteSearch: '',
    boardNoteFilterMember: '',
    boardNoteFilterCategory: '',
    selected: new Set(),
    composeRecipients: [],
    actionRecipients: [],
    boardNoteRecipients: [],
    currentMemberEmail: null
  };

  /* ───────── undo toast ───────── */
  let undoTimeout = null, undoAction = null, undoToastEl = null;
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

  /* ───────── confirm dialog ───────── */
  let confirmResolve = null;
  function confirmDialog(msg, okLabel) {
    confirmMsg.textContent = msg;
    confirmOk.textContent = okLabel || 'Delete';
    confirmModal.classList.remove('hidden');
    return new Promise(resolve => { confirmResolve = resolve; });
  }
  function closeConfirm(result) {
    confirmModal.classList.add('hidden');
    if (confirmResolve) { confirmResolve(result); confirmResolve = null; }
  }
  confirmOk.addEventListener('click', () => closeConfirm(true));
  confirmCancel.addEventListener('click', () => closeConfirm(false));
  confirmClose.addEventListener('click', () => closeConfirm(false));
  confirmModal.addEventListener('click', e => { if (e.target === confirmModal) closeConfirm(false); });

  /* ───────── storage ───────── */
  const getKey = () => { try { return sessionStorage.getItem(KEY_STORAGE); } catch (e) { return null; } };
  const setKey = k => { try { sessionStorage.setItem(KEY_STORAGE, k); } catch (e) {} };
  const clearKey = () => { try { sessionStorage.removeItem(KEY_STORAGE); } catch (e) {} };
  const getSenderIdx   = () => { const v = sessionStorage.getItem(SENDER_STORAGE); return v !== null ? parseInt(v, 10) : null; };
  const setSenderIdx   = i => { try { sessionStorage.setItem(SENDER_STORAGE, String(i)); } catch (e) {} };
  const clearSenderIdx = () => { try { sessionStorage.removeItem(SENDER_STORAGE); } catch (e) {} };
  const getSender = () => {
    const i = getSenderIdx();
    if (i === null || !BOARD[i]) return null;
    return { name: BOARD[i].name, email: BOARD[i].email || '' };
  };
  const getAuthor = () => (getSender()?.name) || 'HR';

  /* ───────── login ───────── */
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
    try { data = await res.json(); } catch (e) { data = { ok: false, error: 'Malformed response' }; }
    return data;
  }

  /* ───────── dashboard init ───────── */
  function enterDashboard(data) {
    loginEl.classList.add('hidden');
    dashboardEl.classList.remove('hidden');
    buildSenderSelect();
    buildTemplateSelect();
    buildAudienceSelect();
    buildActionAudienceSelect();
    buildBoardNoteMemberSelect();
    initTabs();
    initEditor();
    buildDatalist();
    startClock();
    render(data);
    startAutoRefresh();
    refreshBtn.addEventListener('click', reload);
    logoutBtn.addEventListener('click', logout);
    loadDraftIfAny();
    if (hamburgerBtn) hamburgerBtn.addEventListener('click', toggleDrawer);
    if (drawerBackdrop) drawerBackdrop.addEventListener('click', closeDrawer);
    if (pickSenderBtn) pickSenderBtn.addEventListener('click', () => {
      if (isMobile()) openDrawer(); else senderSelect.focus();
    });
  }

  function toggleDrawer() {
    if (!sidebar) return;
    if (sidebar.classList.contains('is-open')) closeDrawer(); else openDrawer();
  }
  function openDrawer() {
    sidebar.classList.add('is-open');
    drawerBackdrop.classList.add('is-open');
  }
  function closeDrawer() {
    sidebar.classList.remove('is-open');
    drawerBackdrop.classList.remove('is-open');
  }

  function initTabs() {
    switchTab(localStorage.getItem(TAB_STORAGE) || 'people');
    sideNav.addEventListener('click', e => {
      const btn = e.target.closest('[data-tab]');
      if (!btn) return;
      switchTab(btn.dataset.tab);
      if (isMobile()) closeDrawer();
    });
  }
  function switchTab(name) {
    sideNav.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.dash-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === name));
    localStorage.setItem(TAB_STORAGE, name);
    updateSelectionBar();
    updateComposeSenderNotice();
  }

  /* ───────── clock + refresh ───────── */
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
      tickerMsg.textContent = 'SYNC IN ' + s + 's';
    }, 1000);
  }
  function stopAutoRefresh() { if (clockTimer) clearInterval(clockTimer); if (refreshTimer) clearInterval(refreshTimer); }
  async function reload() {
    const key = getKey(); if (!key) return;
    try { render(await fetchHR(key)); tickerMsg.textContent = 'SYNCED'; }
    catch (e) { tickerMsg.textContent = 'SYNC FAILED'; }
  }

  /* ───────── sender ───────── */
  function buildSenderSelect() {
    const opts = HR_SENDER_IDX.map(i => `<option value="${i}">${esc(BOARD[i].name)} · ${esc(BOARD[i].role)}</option>`).join('');
    senderSelect.innerHTML = '<option value="">— pick sender —</option>' + opts;
    const saved = getSenderIdx();
    if (saved !== null && BOARD[saved] && HR_SENDER_IDX.indexOf(saved) !== -1) senderSelect.value = String(saved);
    else clearSenderIdx();
    senderSelect.addEventListener('change', () => {
      if (senderSelect.value === '') clearSenderIdx();
      else setSenderIdx(parseInt(senderSelect.value, 10));
      updateSenderHint();
      updateComposeSenderNotice();
    });
    updateSenderHint();
    updateComposeSenderNotice();
  }
  function updateSenderHint() {
    const s = getSender();
    if (s) {
      senderHint.textContent = 'Emails sent as ' + s.name + (s.email ? ' <' + s.email + '>' : '') + '.';
      senderHint.className = 'side-hint ok';
    } else {
      senderHint.textContent = 'Pick an HR sender — required for emailing only.';
      senderHint.className = 'side-hint warn';
    }
  }
  function updateComposeSenderNotice() {
    if (!composeSenderNotice) return;
    composeSenderNotice.classList.toggle('hidden', !!getSender());
  }

  /* ───────── templates + audiences ───────── */
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
      if (!matching.length) { flashStatus(sendStatus, 'No members match "' + a.label + '".', true); return; }
      let added = 0;
      matching.forEach(m => { if (addRecipient(m.Email, m.Name)) added++; });
      flashStatus(sendStatus, 'Added ' + added + ' from ' + a.label + '.');
    });
  }
  function buildActionAudienceSelect() {
    if (!actionAudience) return;
    actionAudience.innerHTML = '<option value="">+ Audience…</option>' +
      AUDIENCES.map(a => `<option value="${a.id}">${esc(a.label)}</option>`).join('');
    actionAudience.addEventListener('change', () => {
      const id = actionAudience.value;
      actionAudience.value = '';
      if (!id) return;
      const a = AUDIENCES.find(x => x.id === id);
      if (!a) return;
      const matching = state.members.filter(a.test);
      if (!matching.length) { showActionErr('No members match "' + a.label + '".'); return; }
      let added = 0;
      matching.forEach(m => { if (addActionMember(m.Email, m.Name)) added++; });
      if (added === 0) showActionErr('All matching members already added.');
      else actionErr.classList.add('hidden');
    });
  }

  /* ───────── KPIs ───────── */
  function renderKPIs() {
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const todayEmails = state.emails.filter(e => new Date(e.Timestamp).getTime() >= dayStart.getTime()).length;
    const failed = state.emails.filter(e => String(e.Status || '').toUpperCase() === 'FAILED').length;
    sideKpis.innerHTML = `
      <div class="side-kpi"><span class="side-kpi-label">MEMBERS</span><span class="side-kpi-value is-green">${state.members.length}</span></div>
      <div class="side-kpi"><span class="side-kpi-label">ACTIONS</span><span class="side-kpi-value is-gold">${state.actions.length}</span></div>
      <div class="side-kpi"><span class="side-kpi-label">SENT TODAY</span><span class="side-kpi-value">${todayEmails}</span></div>
      <div class="side-kpi"><span class="side-kpi-label">FAILED</span><span class="side-kpi-value ${failed ? 'is-red' : ''}">${failed}</span></div>`;
  }

  /* ───────── board cards ───────── */
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

    const noteCounts = {};
    state.boardNotes.forEach(n => {
      const k = String(n['Board Member'] || '').toLowerCase();
      if (k) noteCounts[k] = (noteCounts[k] || 0) + 1;
    });

    boardGrid.innerHTML = list.length
      ? list.map(m => renderBoardCard(m, activity, noteCounts)).join('')
      : '<div class="hr-empty">NO MATCHES</div>';
  }
  function renderBoardCard(m, activity, noteCounts) {
    const color = colorFor(m.name + (m.email || ''));
    const src = avatarUrl(m.email);
    const phone = m.phone
      ? `<a href="tel:${esc(m.phone.replace(/\s+/g, ''))}">${esc(m.phone)}</a>`
      : `<span class="muted">—</span>`;
    const email = m.email
      ? `<button class="link-btn" type="button" data-compose-email="${esc(m.email)}" data-compose-name="${esc(m.name)}">${esc(m.email)}</button>`
      : `<span class="muted">—</span>`;
    const lastActive = activity[(m.email || '').toLowerCase()] || activity[(m.name || '').toLowerCase()];
    const badge = lastActive
      ? `<span class="badge-active" title="${esc(fmtDateTime(lastActive))}">ACTIVE ${esc(relativeTime(lastActive))}</span>`
      : `<span class="badge-inactive">NO SENDS</span>`;
    const notesCount = noteCounts[m.name.toLowerCase()] || 0;
    return `
      <div class="member-card">
        <div class="avatar" style="color:${color}">
          <span class="avatar-initials">${esc(initials(m.name))}</span>
          ${src ? `<img class="avatar-img" src="${src}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.style.display='none'">` : ''}
        </div>
        <div class="member-body">
          <div class="member-name">${esc(m.name)}${m.alias ? `<span class="member-alias">(${esc(m.alias)})</span>` : ''}</div>
          <span class="member-role">${esc(m.role)}</span>
          <div style="margin-bottom:6px">${badge}${notesCount ? ` <span class="badge-notes">${notesCount} note${notesCount > 1 ? 's' : ''}</span>` : ''}</div>
          <div class="member-line"><span class="key">TEL</span>${phone}</div>
          <div class="member-line"><span class="key">MAIL</span>${email}</div>
        </div>
      </div>`;
  }
  boardSearch.addEventListener('input', () => { state.boardSearch = boardSearch.value; renderBoard(); });

  /* ───────── club members ───────── */
  function renderClub() {
    const q = state.clubSearch.trim().toLowerCase();
    const list = q ? state.members.filter(m =>
      (String(m.Name || '') + ' ' + (m.Education || '') + ' ' + (m.Email || '') + ' ' + (m['Why they want to join'] || '')).toLowerCase().includes(q)) : state.members;

    clubCount.textContent = state.members.length;

    if (!list.length) {
      clubTable.outerHTML = '<table id="clubTable" class="terminal-table mobile-cards"><tbody><tr><td class="table-empty">NO CLUB MEMBERS YET</td></tr></tbody></table>';
      return;
    }
    const sorted = list.slice().sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
    const allVisibleSelected = sorted.every(r => state.selected.has(String(r.Email).toLowerCase()));
    const header = `
      <thead><tr>
        <th class="chk-cell"><input type="checkbox" id="clubSelectAll" ${allVisibleSelected ? 'checked' : ''}></th>
        <th>NAME</th><th>LEVEL</th><th>EMAIL</th><th>JOINED</th><th>NOTES</th><th class="cell-action"></th>
      </tr></thead>`;
    const body = sorted.map(r => {
      const email = String(r.Email || '');
      const emailKey = email.toLowerCase();
      const checked = state.selected.has(emailKey);
      const color = colorFor(r.Name + email);
      const src = avatarUrl(email);
      const notes = parseNotes(r.Notes);
      const noteBadge = notes.length
        ? `<button type="button" class="note-badge" data-open-member="${esc(email)}">${notes.length} note${notes.length > 1 ? 's' : ''}</button>`
        : `<button type="button" class="note-badge is-empty" data-open-member="${esc(email)}">+ add</button>`;
      return `<tr>
        <td class="chk-cell"><input type="checkbox" data-member-email="${esc(email)}" ${checked ? 'checked' : ''}></td>
        <td class="cell-name-row">
          <span class="avatar avatar-sm" style="color:${color}">
            <span class="avatar-initials">${esc(initials(r.Name))}</span>
            ${src ? `<img class="avatar-img" src="${src}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">` : ''}
          </span>
          <button type="button" class="link-btn" data-open-member="${esc(email)}">${esc(r.Name)}</button>
        </td>
        <td class="cell-mono">${esc(r.Education || '—')}</td>
        <td class="cell-email">${esc(email)}</td>
        <td class="cell-time">${esc(fmtDateTime(r.Timestamp))}</td>
        <td class="cell-notes">${noteBadge}</td>
        <td class="cell-action">
          <button type="button" class="row-action-btn" data-compose-email="${esc(email)}" data-compose-name="${esc(r.Name)}" title="Email">✉</button>
          <button type="button" class="row-action-btn" data-open-member="${esc(email)}" title="Open">⋯</button>
          <button type="button" class="row-action-btn is-danger" data-delete-member="${esc(email)}" title="Delete">🗑</button>
        </td>
      </tr>`;
    }).join('');
    clubTable.outerHTML = `<table id="clubTable" class="terminal-table mobile-cards">${header}<tbody>${body}</tbody></table>`;
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
        updateSelectionBar();
        return;
      }
      const chk = e.target.closest('[data-member-email]');
      if (chk) {
        const em = chk.dataset.memberEmail.toLowerCase();
        if (chk.checked) state.selected.add(em);
        else state.selected.delete(em);
        updateSelectionBar();
        const all = table.querySelector('#clubSelectAll');
        if (all) {
          const boxes = table.querySelectorAll('tbody [data-member-email]');
          all.checked = boxes.length > 0 && [...boxes].every(b => b.checked);
        }
      }
    });
  }
  clubSearch.addEventListener('input', () => { state.clubSearch = clubSearch.value; renderClub(); });

  /* ───────── selection ───────── */
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
    showUndoToast(`Cleared ${prev.size} selected`, () => {
      state.selected = prev;
      renderClub();
      updateSelectionBar();
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
    switchTab('compose');
  });

  /* ───────── datalist ───────── */
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

  /* ───────── compose recipients ───────── */
  function addRecipient(email, name) {
    const e = String(email || '').trim();
    if (!isValidEmail(e)) return false;
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
    else if (isValidEmail(val)) { addRecipient(val, ''); addInput.value = ''; }
    else { addInput.value = ''; }
  }
  addBtn.addEventListener('click', tryAddFromInput);
  addInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); tryAddFromInput(); } });

  document.addEventListener('click', e => {
    const composeBtn = e.target.closest('[data-compose-email]');
    if (composeBtn) {
      e.preventDefault();
      addRecipient(composeBtn.dataset.composeEmail, composeBtn.dataset.composeName || '');
      switchTab('compose');
      subjectInput.focus();
      return;
    }
    const openBtn = e.target.closest('[data-open-member]');
    if (openBtn) { e.preventDefault(); openMemberModal(openBtn.dataset.openMember); return; }
    const delBtn = e.target.closest('[data-delete-member]');
    if (delBtn) { e.preventDefault(); deleteMemberFlow(delBtn.dataset.deleteMember); return; }
  });

  /* ───────── editor ───────── */
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
    if (!sender) return 'Pick an email sender in the sidebar first.';
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
  function flashStatus(el, msg, isErr) {
    if (!el) return;
    el.className = 'status-pill ' + (isErr ? 'is-error' : 'is-saved');
    el.textContent = msg;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 6000);
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
      if (!sender.email) return showComposeErr('Sender has no email on file.');
      recipients = [{ email: sender.email, name: sender.name + ' (test)' }];
      finalSubject = '[TEST] ' + subject;
    }

    const prevForm = {
      recipients: state.composeRecipients.slice(),
      subject: subjectInput.value,
      body: editorBody.innerHTML
    };

    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span class="spinner spinner-sm"></span> SENDING…';
    flashStatus(sendStatus, 'Sending to ' + recipients.length + '…');

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
        // Local append emails — no reload needed
        const now = new Date().toISOString();
        (result.results || []).forEach((r, i) => {
          state.emails.push({
            Timestamp: now,
            'To Email': r.email,
            'To Name': recipients[i] ? (recipients[i].name || '') : '',
            Subject: finalSubject,
            Status: r.status,
            Error: r.error || '',
            'Sent By': sender.name,
            'Sent By Email': sender.email
          });
        });
        renderSent();
        renderBoardLog();
        renderKPIs();

        flashStatus(sendStatus, f > 0 ? '⚠ ' + result.sent + ' sent · ' + f + ' failed' : '✓ Sent to ' + result.sent, f > 0);

        if (!testMode) {
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
          sessionStorage.removeItem(DRAFT_STORAGE);
          updateSideDraftState();
          showUndoToast(f > 0 ? `Sent ${result.sent} · ${f} failed` : `Sent to ${result.sent}`, () => {
            state.composeRecipients = prevForm.recipients;
            renderChips();
            subjectInput.value = prevForm.subject;
            editorBody.innerHTML = prevForm.body;
            updateSideDraftState();
          });
        }
      } else {
        let msg = (result && result.error) || 'Send failed';
        if (result && result.version) msg += ' [' + result.version + ']';
        if (result && typeof result.quota === 'number' && result.quota >= 0) msg += ' · quota ' + result.quota;
        flashStatus(sendStatus, '✕ ' + msg, true);
      }
    } catch (e) {
      flashStatus(sendStatus, '✕ ' + (e.message || 'Network error'), true);
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = 'SEND ▸';
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

  function updateSideDraftState() {
    const subject = subjectInput.value.trim();
    const hasBody = editorBody.innerText.trim().length > 0;
    let html;
    if (!subject && !hasBody && !state.composeRecipients.length) {
      html = 'No draft.';
    } else {
      const parts = [state.composeRecipients.length + ' recipient' + (state.composeRecipients.length === 1 ? '' : 's')];
      if (subject) parts.push('"<strong>' + esc(subject.slice(0, 40)) + (subject.length > 40 ? '…' : '') + '</strong>"');
      else parts.push('<em>no subject</em>');
      html = parts.join(' · ');
    }
    sideDraft.innerHTML = html;
  }
  draftBtn.addEventListener('click', () => {
    const draft = { recipients: state.composeRecipients, subject: subjectInput.value, body: editorBody.innerHTML };
    try { sessionStorage.setItem(DRAFT_STORAGE, JSON.stringify(draft)); } catch (e) {}
    flashStatus(sendStatus, '✓ Draft saved.');
  });
  testBtn.addEventListener('click', () => sendEmail({ testMode: true }));

  function loadDraftIfAny() {
    try {
      const raw = sessionStorage.getItem(DRAFT_STORAGE);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.recipients && Array.isArray(d.recipients)) state.composeRecipients = d.recipients;
      if (d.subject) subjectInput.value = d.subject;
      if (d.body) editorBody.innerHTML = d.body;
      renderChips();
      updateSideDraftState();
    } catch (e) {}
  }

  /* ───────── member modal ───────── */
  function openMemberModal(email) {
    const member = state.members.find(m => String(m.Email || '').toLowerCase() === String(email).toLowerCase());
    if (!member) return;
    state.currentMemberEmail = member.Email;
    renderMemberModal(member);
    memberModal.classList.remove('hidden');
  }
  function closeMemberModalFn() {
    memberModal.classList.add('hidden');
    state.currentMemberEmail = null;
  }
  closeMemberModal.addEventListener('click', closeMemberModalFn);
  memberModal.addEventListener('click', e => { if (e.target === memberModal) closeMemberModalFn(); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!previewModal.classList.contains('hidden')) previewModal.classList.add('hidden');
    if (!memberModal.classList.contains('hidden')) closeMemberModalFn();
    if (!confirmModal.classList.contains('hidden')) closeConfirm(false);
  });

  function renderMemberModal(member) {
    const notes = parseNotes(member.Notes);
    const memberActions = state.actions.filter(a =>
      String(a['Member Email'] || '').toLowerCase() === String(member.Email || '').toLowerCase()
    ).sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));

    memberModalTitle.textContent = member.Name || 'MEMBER';
    memberModalBody.innerHTML = `
      <div class="member-modal-info">
        <div class="avatar" style="color:${colorFor(member.Name + member.Email)}">
          <span class="avatar-initials">${esc(initials(member.Name))}</span>
        </div>
        <div>
          <div class="member-name">${esc(member.Name)}</div>
          <div class="member-line"><span class="key">MAIL</span>${esc(member.Email || '—')}</div>
          <div class="member-line"><span class="key">LEVEL</span>${esc(member.Education || '—')}</div>
          <div class="member-line"><span class="key">JOINED</span>${esc(fmtDate(member.Timestamp))}</div>
        </div>
      </div>

      <div class="member-modal-section">
        <div class="hr-field-header">
          <span class="hr-label">NOTES <span class="muted">(${notes.length})</span></span>
        </div>
        <div class="note-composer">
          <textarea id="newNoteText" class="hr-input" rows="2" placeholder="Write a note…"></textarea>
          <button type="button" id="addNoteBtn" class="btn-primary-sm">ADD NOTE</button>
        </div>
        <div class="notes-list">
          ${notes.length ? notes.slice().reverse().map(n => `
            <div class="note-item" data-note-id="${esc(n.id)}">
              <div class="note-meta">
                <span class="note-author">${esc(n.by || 'HR')}</span>
                <span class="note-time" title="${esc(fmtDateTime(n.ts))}">${esc(relativeTime(n.ts))}</span>
              </div>
              <div class="note-text">${esc(n.text)}</div>
              <div class="note-actions">
                <button type="button" class="note-btn" data-note-edit="${esc(n.id)}">Edit</button>
                <button type="button" class="note-btn is-danger" data-note-delete="${esc(n.id)}">Delete</button>
              </div>
            </div>
          `).join('') : '<div class="empty-inline">No notes yet.</div>'}
        </div>
      </div>

      <div class="member-modal-section">
        <div class="hr-field-header">
          <span class="hr-label">ACTIONS <span class="muted">(${memberActions.length})</span></span>
        </div>
        <div class="member-actions-list">
          ${memberActions.length ? memberActions.map(a => `
            <div class="action-item">
              <div class="action-row">
                <span class="action-name">${esc(a['Action Name'] || '—')}</span>
                <span class="mark-pill">${esc(a.Mark || '')}</span>
              </div>
              ${a.Note ? `<div class="action-note">${esc(a.Note)}</div>` : ''}
              <div class="action-meta">
                ${a['Action Date'] ? esc(String(a['Action Date'])) + ' · ' : ''}
                marked ${esc(relativeTime(a.Timestamp))} by ${esc(a.By || 'HR')}
              </div>
            </div>
          `).join('') : '<div class="empty-inline">No actions yet.</div>'}
        </div>
      </div>
    `;

    const addBtn = memberModalBody.querySelector('#addNoteBtn');
    if (addBtn) addBtn.addEventListener('click', addNoteToCurrentMember);
    const textarea = memberModalBody.querySelector('#newNoteText');
    if (textarea) textarea.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addNoteToCurrentMember(); }
    });
    memberModalBody.querySelectorAll('[data-note-edit]').forEach(btn => {
      btn.addEventListener('click', () => editNoteOnCurrentMember(btn.dataset.noteEdit));
    });
    memberModalBody.querySelectorAll('[data-note-delete]').forEach(btn => {
      btn.addEventListener('click', () => deleteNoteOnCurrentMember(btn.dataset.noteDelete));
    });
  }

  function getCurrentMember() {
    const email = state.currentMemberEmail;
    if (!email) return null;
    return state.members.find(m => String(m.Email || '').toLowerCase() === email.toLowerCase()) || null;
  }
  function refreshMemberUI() {
    const m = getCurrentMember();
    if (m && !memberModal.classList.contains('hidden')) renderMemberModal(m);
    renderClub();
  }

  async function addNoteToCurrentMember() {
    const email = state.currentMemberEmail;
    if (!email) return;
    const textarea = memberModalBody.querySelector('#newNoteText');
    const text = textarea.value.trim();
    if (!text) return;
    const by = getAuthor();
    const result = await postHR({ type: 'hr_note_add', key: getKey(), email, text, by });
    if (!result || !result.ok) { flashStatus(null, 'Note failed', true); return; }

    const added = result.note;
    // Local state update
    const member = state.members.find(m => String(m.Email || '').toLowerCase() === email.toLowerCase());
    if (member) {
      const notes = parseNotes(member.Notes);
      notes.push(added);
      member.Notes = serializeNotes(notes);
    }
    refreshMemberUI();

    showUndoToast('Note added', async () => {
      await postHR({ type: 'hr_note_delete', key: getKey(), email, noteId: added.id });
      if (member) {
        member.Notes = serializeNotes(parseNotes(member.Notes).filter(n => n.id !== added.id));
      }
      refreshMemberUI();
    });
  }

  async function editNoteOnCurrentMember(noteId) {
    const email = state.currentMemberEmail;
    if (!email) return;
    const member = getCurrentMember();
    if (!member) return;
    const notes = parseNotes(member.Notes);
    const note = notes.find(n => n.id === noteId);
    if (!note) return;
    const newText = prompt('Edit note:', note.text);
    if (newText === null || newText.trim() === '' || newText.trim() === note.text) return;

    const result = await postHR({ type: 'hr_note_edit', key: getKey(), email, noteId, text: newText.trim() });
    if (!result || !result.ok) { flashStatus(null, 'Edit failed', true); return; }

    const oldText = note.text;
    note.text = newText.trim();
    member.Notes = serializeNotes(notes);
    refreshMemberUI();

    showUndoToast('Note edited', async () => {
      await postHR({ type: 'hr_note_edit', key: getKey(), email, noteId, text: oldText });
      const m = getCurrentMember();
      if (m) {
        const ns = parseNotes(m.Notes);
        const n = ns.find(x => x.id === noteId);
        if (n) n.text = oldText;
        m.Notes = serializeNotes(ns);
      }
      refreshMemberUI();
    });
  }

  async function deleteNoteOnCurrentMember(noteId) {
    const email = state.currentMemberEmail;
    if (!email) return;
    const member = getCurrentMember();
    if (!member) return;
    const notes = parseNotes(member.Notes);
    const note = notes.find(n => n.id === noteId);
    if (!note) return;
    const ok = await confirmDialog('Delete this note?', 'Delete');
    if (!ok) return;

    const result = await postHR({ type: 'hr_note_delete', key: getKey(), email, noteId });
    if (!result || !result.ok) { flashStatus(null, 'Delete failed', true); return; }

    member.Notes = serializeNotes(parseNotes(member.Notes).filter(n => n.id !== noteId));
    refreshMemberUI();

    showUndoToast('Note deleted', async () => {
      await postHR({ type: 'hr_note_add', key: getKey(), email, note });
      const m = getCurrentMember();
      if (m) {
        const ns = parseNotes(m.Notes);
        ns.push(note);
        m.Notes = serializeNotes(ns);
      }
      refreshMemberUI();
    });
  }

  async function deleteMemberFlow(email) {
    const member = state.members.find(m => String(m.Email || '').toLowerCase() === String(email).toLowerCase());
    if (!member) return;
    const ok = await confirmDialog(`Delete ${member.Name} and their actions?`, 'Delete');
    if (!ok) return;

    const snapshot = { ...member };
    const memberActions = state.actions.filter(a =>
      String(a['Member Email'] || '').toLowerCase() === String(email).toLowerCase()
    );

    const result = await postHR({ type: 'hr_member_delete', key: getKey(), email });
    if (!result || !result.ok) { flashStatus(null, 'Delete failed', true); return; }

    // Local state
    state.selected.delete(String(email).toLowerCase());
    state.members = state.members.filter(m => String(m.Email || '').toLowerCase() !== String(email).toLowerCase());
    state.actions = state.actions.filter(a => String(a['Member Email'] || '').toLowerCase() !== String(email).toLowerCase());
    if (state.currentMemberEmail && state.currentMemberEmail.toLowerCase() === String(email).toLowerCase()) closeMemberModalFn();
    renderClub();
    renderActions();
    renderKPIs();

    showUndoToast(`Deleted ${member.Name}`, async () => {
      await postHR({ type: 'hr_member_restore', key: getKey(), member: snapshot });
      for (const a of memberActions) {
        await postHR({
          type: 'hr_action_add', key: getKey(),
          actionName: a['Action Name'], actionDate: a['Action Date'] || '',
          mark: a.Mark, note: a.Note || '', by: a.By || 'HR',
          marks: [{ email: a['Member Email'], name: a['Member Name'] }]
        });
      }
      state.members.push(snapshot);
      state.actions.push(...memberActions);
      renderClub();
      renderActions();
      renderKPIs();
    });
  }

  /* ───────── actions ───────── */
  actionMark.addEventListener('change', () => {
    customMarkField.classList.toggle('hidden', actionMark.value !== '__custom');
    if (actionMark.value === '__custom') customMark.focus();
  });

  function addActionMember(email, name) {
    const e = String(email || '').trim();
    if (!isValidEmail(e)) return false;
    const key = e.toLowerCase();
    if (state.actionRecipients.some(r => r.email.toLowerCase() === key)) return false;
    state.actionRecipients.push({ email: e, name: String(name || '').trim() });
    renderActionChips();
    return true;
  }
  function renderActionChips() {
    actionMembersChips.innerHTML = state.actionRecipients.map(r => `
      <span class="chip">
        ${r.name ? `<b>${esc(r.name)}</b>` : `<b>${esc(r.email)}</b>`}
        ${r.name ? `<small>${esc(r.email)}</small>` : ''}
        <button type="button" data-action-chip-remove="${esc(r.email)}" title="Remove">×</button>
      </span>`).join('');
    actionMemberCount.textContent = '· ' + state.actionRecipients.length;
    clearActionMembers.classList.toggle('hidden', state.actionRecipients.length === 0);
  }
  actionMembersChips.addEventListener('click', e => {
    const btn = e.target.closest('[data-action-chip-remove]');
    if (!btn) return;
    const email = btn.dataset.actionChipRemove;
    const prev = state.actionRecipients.slice();
    const removed = prev.find(r => r.email.toLowerCase() === email.toLowerCase());
    state.actionRecipients = prev.filter(r => r.email.toLowerCase() !== email.toLowerCase());
    renderActionChips();
    if (removed) {
      showUndoToast(`Removed ${removed.name || removed.email}`, () => {
        state.actionRecipients = prev;
        renderActionChips();
      });
    }
  });
  clearActionMembers.addEventListener('click', () => {
    if (!state.actionRecipients.length) return;
    const prev = state.actionRecipients.slice();
    state.actionRecipients = [];
    renderActionChips();
    showUndoToast(`Cleared ${prev.length}`, () => {
      state.actionRecipients = prev;
      renderActionChips();
    });
  });

  function tryAddActionMember() {
    const val = actionMemberInput.value.trim();
    if (!val) return;
    const match = state.members.find(m =>
      String(m.Email || '').toLowerCase() === val.toLowerCase() ||
      String(m.Name || '').toLowerCase() === val.toLowerCase() ||
      String(m.Name || '').toLowerCase().startsWith(val.toLowerCase())
    );
    if (match) { addActionMember(match.Email, match.Name); actionMemberInput.value = ''; }
    else if (isValidEmail(val)) { addActionMember(val, ''); actionMemberInput.value = ''; }
    else { actionMemberInput.value = ''; }
  }
  actionMemberAddBtn.addEventListener('click', tryAddActionMember);
  actionMemberInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); tryAddActionMember(); }
  });

  actionForm.addEventListener('submit', async e => {
    e.preventDefault();
    actionErr.classList.add('hidden');
    const name = actionName.value.trim();
    const mark = actionMark.value === '__custom' ? customMark.value.trim() : actionMark.value;
    if (!name) return showActionErr('Action name is required.');
    if (!mark) return showActionErr('Mark is required.');
    if (!state.actionRecipients.length) return showActionErr('Add at least one member.');

    const payload = {
      type: 'hr_action_add',
      key: getKey(),
      actionName: name,
      actionDate: actionDate.value || '',
      mark,
      note: actionNote.value.trim(),
      by: getAuthor(),
      marks: state.actionRecipients.map(r => ({ email: r.email, name: r.name }))
    };

    const submitBtn = actionForm.querySelector('.hr-send-btn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner spinner-sm"></span> SAVING…';

    try {
      const result = await postHR(payload);
      if (!result || !result.ok) { showActionErr('Failed: ' + ((result && result.error) || 'unknown')); return; }

      const batchTs = new Date().toISOString();
      const newActions = result.ids.map((id, i) => ({
        Timestamp: batchTs,
        ID: id,
        'Action Name': name,
        'Action Date': actionDate.value || '',
        'Member Email': state.actionRecipients[i].email.toLowerCase(),
        'Member Name': state.actionRecipients[i].name,
        Mark: mark,
        Note: payload.note,
        By: payload.by
      }));
      state.actions.push(...newActions);

      const prevMembers = state.actionRecipients.slice();
      // Reset form
      actionName.value = '';
      actionDate.value = '';
      actionMark.value = '';
      customMark.value = '';
      customMarkField.classList.add('hidden');
      actionNote.value = '';
      state.actionRecipients = [];
      renderActionChips();
      renderActions();
      renderKPIs();
      flashStatus(actionStatus, '✓ Marked ' + prevMembers.length);

      showUndoToast(`Marked ${prevMembers.length} member${prevMembers.length > 1 ? 's' : ''}`, async () => {
        for (const id of result.ids) {
          try { await postHR({ type: 'hr_action_delete', key: getKey(), id }); } catch (e) {}
        }
        state.actions = state.actions.filter(a => !result.ids.includes(a.ID));
        renderActions();
        renderKPIs();
        if (!memberModal.classList.contains('hidden')) {
          const m = getCurrentMember();
          if (m) renderMemberModal(m);
        }
      });
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'MARK ▸';
    }
  });

  function showActionErr(msg) {
    actionErr.textContent = msg;
    actionErr.classList.remove('hidden');
  }

  actionSearch.addEventListener('input', () => { state.actionSearch = actionSearch.value; renderActions(); });
  actionFilterName.addEventListener('change', () => { state.actionFilterName = actionFilterName.value; renderActions(); });
  actionFilterMark.addEventListener('change', () => { state.actionFilterMark = actionFilterMark.value; renderActions(); });

  function renderActions() {
    const names = [...new Set(state.actions.map(a => String(a['Action Name'] || '').trim()).filter(Boolean))].sort();
    const marks = [...new Set(state.actions.map(a => String(a.Mark || '').trim()).filter(Boolean))].sort();

    if (actionFilterName.options.length - 1 !== names.length) {
      const cur = actionFilterName.value;
      actionFilterName.innerHTML = '<option value="">All actions</option>' + names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
      if (names.indexOf(cur) !== -1) actionFilterName.value = cur;
    }
    if (actionFilterMark.options.length - 1 !== marks.length) {
      const cur = actionFilterMark.value;
      actionFilterMark.innerHTML = '<option value="">All marks</option>' + marks.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('');
      if (marks.indexOf(cur) !== -1) actionFilterMark.value = cur;
    }
    actionNameSuggestions.innerHTML = names.map(n => `<option value="${esc(n)}">`).join('');

    const q = state.actionSearch.trim().toLowerCase();
    let rows = state.actions.slice();
    if (state.actionFilterName) rows = rows.filter(a => String(a['Action Name'] || '') === state.actionFilterName);
    if (state.actionFilterMark) rows = rows.filter(a => String(a.Mark || '') === state.actionFilterMark);
    if (q) rows = rows.filter(a =>
      [a['Action Name'], a['Member Name'], a['Member Email'], a.Mark, a.Note, a.By]
        .map(x => String(x || '')).join(' ').toLowerCase().includes(q)
    );
    rows.sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));

    if (!rows.length) {
      actionsTable.outerHTML = '<table id="actionsTable" class="terminal-table mobile-cards"><tbody><tr><td class="table-empty">NO ACTIONS MATCH</td></tr></tbody></table>';
      return;
    }
    actionsTable.outerHTML = `
      <table id="actionsTable" class="terminal-table mobile-cards">
        <thead><tr>
          <th>TIME</th><th>ACTION</th><th>MEMBER</th><th>MARK</th><th>NOTE</th><th>BY</th><th class="cell-action"></th>
        </tr></thead>
        <tbody>
          ${rows.map(a => `<tr>
            <td class="cell-time" data-label="Time">${esc(fmtDateTime(a.Timestamp))}</td>
            <td class="cell-name" data-label="Action">${esc(a['Action Name'] || '—')}${a['Action Date'] ? `<div class="muted small">${esc(String(a['Action Date']))}</div>` : ''}</td>
            <td class="cell-name" data-label="Member">${esc(a['Member Name'] || a['Member Email'] || '—')}<div class="muted small">${esc(a['Member Email'] || '')}</div></td>
            <td data-label="Mark"><span class="mark-pill">${esc(a.Mark || '')}</span></td>
            <td class="cell-note" data-label="Note">${a.Note ? esc(a.Note) : '<span class="muted">—</span>'}</td>
            <td class="cell-mono" data-label="By">${esc(a.By || '—')}</td>
            <td class="cell-action"><button type="button" class="row-action-btn is-danger" data-delete-action="${esc(a.ID)}">🗑</button></td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  }

  document.addEventListener('click', e => {
    const delBtn = e.target.closest('[data-delete-action]');
    if (delBtn) { e.preventDefault(); deleteActionFlow(delBtn.dataset.deleteAction); }
  });

  async function deleteActionFlow(id) {
    const action = state.actions.find(a => String(a.ID || '') === id);
    if (!action) return;
    const ok = await confirmDialog('Delete this action mark?', 'Delete');
    if (!ok) return;
    const result = await postHR({ type: 'hr_action_delete', key: getKey(), id });
    if (!result || !result.ok) { flashStatus(null, 'Delete failed', true); return; }

    state.actions = state.actions.filter(a => String(a.ID || '') !== id);
    renderActions();
    renderKPIs();
    if (!memberModal.classList.contains('hidden')) {
      const m = getCurrentMember();
      if (m) renderMemberModal(m);
    }

    showUndoToast('Action deleted', async () => {
      await postHR({
        type: 'hr_action_add', key: getKey(),
        actionName: action['Action Name'] || '',
        actionDate: action['Action Date'] || '',
        mark: action.Mark || '',
        note: action.Note || '',
        by: action.By || 'HR',
        marks: [{ email: action['Member Email'] || '', name: action['Member Name'] || '' }]
      });
      state.actions.push(action);
      renderActions();
      renderKPIs();
    });
  }

  /* ───────── board notes ───────── */
  function buildBoardNoteMemberSelect() {
    if (boardNoteFilterMember) {
      boardNoteFilterMember.innerHTML = '<option value="">All members</option>' +
        BOARD.map(b => `<option value="${esc(b.name)}">${esc(b.name)}</option>`).join('');
    }
    if (boardMembersDatalist) {
      boardMembersDatalist.innerHTML = BOARD.map(b =>
        `<option value="${esc(b.name)}">${esc(b.role)}</option>`
      ).join('');
    }
  }

  function addBoardNoteMember(name) {
    const n = String(name || '').trim();
    if (!n) return false;
    if (state.boardNoteRecipients.some(r => r.name === n)) return false;
    const bm = BOARD.find(b => b.name === n);
    if (!bm) return false;
    state.boardNoteRecipients.push({ name: n, role: bm.role });
    renderBoardNoteChips();
    return true;
  }
  function removeBoardNoteMember(name) {
    const prev = state.boardNoteRecipients.slice();
    const removed = prev.find(r => r.name === name);
    state.boardNoteRecipients = prev.filter(r => r.name !== name);
    renderBoardNoteChips();
    if (removed) {
      showUndoToast(`Removed ${removed.name}`, () => {
        state.boardNoteRecipients = prev;
        renderBoardNoteChips();
      });
    }
  }
  function renderBoardNoteChips() {
    if (!boardNoteMemberChips) return;
    boardNoteMemberChips.innerHTML = state.boardNoteRecipients.map(r => `
      <span class="chip">
        <b>${esc(r.name)}</b>
        <small>${esc(r.role)}</small>
        <button type="button" data-boardnote-chip-remove="${esc(r.name)}" title="Remove">×</button>
      </span>`).join('');
    if (boardNoteMemberCount) boardNoteMemberCount.textContent = '· ' + state.boardNoteRecipients.length;
    if (boardNoteMemberClear) boardNoteMemberClear.classList.toggle('hidden', state.boardNoteRecipients.length === 0);
  }

  if (boardNoteMemberChips) {
    boardNoteMemberChips.addEventListener('click', e => {
      const btn = e.target.closest('[data-boardnote-chip-remove]');
      if (btn) removeBoardNoteMember(btn.dataset.boardnoteChipRemove);
    });
  }
  if (boardNoteMemberAddBtn) {
    boardNoteMemberAddBtn.addEventListener('click', () => {
      const val = boardNoteMemberInput.value.trim();
      if (!val) return;
      const match =
        BOARD.find(b => b.name.toLowerCase() === val.toLowerCase()) ||
        BOARD.find(b => b.name.toLowerCase().startsWith(val.toLowerCase()));
      if (match) {
        addBoardNoteMember(match.name);
        boardNoteMemberInput.value = '';
      } else {
        showBoardNoteErr('No board member matches "' + val + '".');
        boardNoteMemberInput.value = '';
      }
    });
  }
  if (boardNoteMemberInput) {
    boardNoteMemberInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); boardNoteMemberAddBtn.click(); }
    });
  }
  if (boardNoteMemberClear) {
    boardNoteMemberClear.addEventListener('click', () => {
      if (!state.boardNoteRecipients.length) return;
      const prev = state.boardNoteRecipients.slice();
      state.boardNoteRecipients = [];
      renderBoardNoteChips();
      showUndoToast(`Cleared ${prev.length} member${prev.length > 1 ? 's' : ''}`, () => {
        state.boardNoteRecipients = prev;
        renderBoardNoteChips();
      });
    });
  }

  boardNoteForm.addEventListener('submit', async e => {
    e.preventDefault();
    boardNoteErr.classList.add('hidden');
    const members = state.boardNoteRecipients.slice();
    const category = boardNoteCategory.value;
    const text = boardNoteText.value.trim();
    if (!members.length) return showBoardNoteErr('Add at least one board member.');
    if (!text) return showBoardNoteErr('Note text is required.');

    const submitBtn = boardNoteForm.querySelector('.hr-send-btn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner spinner-sm"></span> SAVING…';

    try {
      // One batched request
      const result = await postHR({
        type: 'hr_board_note_add',
        key: getKey(),
        members: members.map(m => m.name),
        category, text,
        by: getAuthor()
      });

      if (!result || !result.ok) { showBoardNoteErr('Failed: ' + ((result && result.error) || 'unknown')); return; }

      const batchTs = new Date().toISOString();
      const author = getAuthor();
      const newNotes = result.ids.map((id, i) => ({
        Timestamp: batchTs,
        ID: id,
        'Board Member': members[i].name,
        Category: category,
        Note: text,
        By: author
      }));
      state.boardNotes.push(...newNotes);
      boardNoteText.value = '';
      state.boardNoteRecipients = [];
      renderBoardNoteChips();
      renderBoardNotes();
      renderBoard();
      renderKPIs();

      flashStatus(boardNoteStatus, '✓ Saved ' + newNotes.length + (newNotes.length > 1 ? ' records' : ' record'));
      showUndoToast(
        `Added ${newNotes.length} board record${newNotes.length > 1 ? 's' : ''}`,
        async () => {
          for (const n of newNotes) {
            try { await postHR({ type: 'hr_board_note_delete', key: getKey(), id: n.ID }); } catch (err) {}
          }
          const ids = new Set(newNotes.map(n => n.ID));
          state.boardNotes = state.boardNotes.filter(n => !ids.has(n.ID));
          renderBoardNotes();
          renderBoard();
          renderKPIs();
        }
      );
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'SAVE ▸';
    }
  });

  function showBoardNoteErr(msg) {
    boardNoteErr.textContent = msg;
    boardNoteErr.classList.remove('hidden');
  }

  boardNoteSearch.addEventListener('input', () => { state.boardNoteSearch = boardNoteSearch.value; renderBoardNotes(); });
  boardNoteFilterMember.addEventListener('change', () => { state.boardNoteFilterMember = boardNoteFilterMember.value; renderBoardNotes(); });
  boardNoteFilterCategory.addEventListener('change', () => { state.boardNoteFilterCategory = boardNoteFilterCategory.value; renderBoardNotes(); });

  function renderBoardNotes() {
    const q = state.boardNoteSearch.trim().toLowerCase();
    let rows = state.boardNotes.slice();
    if (state.boardNoteFilterMember) rows = rows.filter(n => String(n['Board Member'] || '') === state.boardNoteFilterMember);
    if (state.boardNoteFilterCategory) rows = rows.filter(n => String(n.Category || '') === state.boardNoteFilterCategory);
    if (q) rows = rows.filter(n =>
      [n['Board Member'], n.Category, n.Note, n.By].map(x => String(x || '')).join(' ').toLowerCase().includes(q)
    );
    rows.sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));

    if (!rows.length) {
      boardNotesTable.outerHTML = '<table id="boardNotesTable" class="terminal-table mobile-cards"><tbody><tr><td class="table-empty">NO RECORDS</td></tr></tbody></table>';
      return;
    }
    boardNotesTable.outerHTML = `
      <table id="boardNotesTable" class="terminal-table mobile-cards">
        <thead><tr>
          <th>TIME</th><th>MEMBER</th><th>CATEGORY</th><th>NOTE</th><th>BY</th><th class="cell-action"></th>
        </tr></thead>
        <tbody>
          ${rows.map(n => `<tr>
            <td class="cell-time" data-label="Time">${esc(fmtDateTime(n.Timestamp))}</td>
            <td class="cell-name" data-label="Member">${esc(n['Board Member'] || '—')}</td>
            <td data-label="Category"><span class="mark-pill">${esc(n.Category || '')}</span></td>
            <td class="cell-note" data-label="Note">${esc(n.Note || '')}</td>
            <td class="cell-mono" data-label="By">${esc(n.By || '—')}</td>
            <td class="cell-action"><button type="button" class="row-action-btn is-danger" data-delete-board-note="${esc(n.ID)}">🗑</button></td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  }

  document.addEventListener('click', e => {
    const delBtn = e.target.closest('[data-delete-board-note]');
    if (delBtn) { e.preventDefault(); deleteBoardNoteFlow(delBtn.dataset.deleteBoardNote); }
  });

  async function deleteBoardNoteFlow(id) {
    const note = state.boardNotes.find(n => String(n.ID || '') === id);
    if (!note) return;
    const ok = await confirmDialog('Delete this board record?', 'Delete');
    if (!ok) return;
    const result = await postHR({ type: 'hr_board_note_delete', key: getKey(), id });
    if (!result || !result.ok) return;

    state.boardNotes = state.boardNotes.filter(n => String(n.ID || '') !== id);
    renderBoardNotes();
    renderBoard();
    renderKPIs();

    showUndoToast('Board record deleted', async () => {
      await postHR({
        type: 'hr_board_note_add', key: getKey(),
        members: [note['Board Member'] || ''],
        category: note.Category || 'Note',
        text: note.Note || '',
        by: note.By || 'HR',
        note: { id: note.ID, ts: note.Timestamp, category: note.Category, text: note.Note, by: note.By }
      });
      state.boardNotes.push(note);
      renderBoardNotes();
      renderBoard();
      renderKPIs();
    });
  }

  /* ───────── sent + activity ───────── */
  function renderSent() {
    const rows = state.emails.slice().sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
    sentTag.textContent = rows.length + ' TOTAL';
    if (!rows.length) {
      sentTable.outerHTML = '<table id="sentTable" class="terminal-table mobile-cards"><tbody><tr><td class="table-empty">NO MESSAGES SENT YET</td></tr></tbody></table>';
      return;
    }
    sentTable.outerHTML = `
      <table id="sentTable" class="terminal-table mobile-cards">
        <thead><tr><th>TIME</th><th>TO</th><th>SUBJECT</th><th>SENT BY</th><th>STATUS</th></tr></thead>
        <tbody>
          ${rows.map(r => {
            const status = String(r.Status || '').toUpperCase();
            const cls = status === 'SENT' ? 'pill' : 'pill red';
            return `<tr title="${esc(r.Error || '')}">
              <td class="cell-time" data-label="Time">${esc(fmtDateTime(r.Timestamp))}</td>
              <td class="cell-email" data-label="To">${esc((r['To Name'] || '') || (r['To Email'] || ''))}</td>
              <td class="cell-name" data-label="Subject">${esc(r.Subject || '—')}</td>
              <td class="cell-mono" data-label="By">${r['Sent By'] ? esc(r['Sent By']) : '<span class="muted">—</span>'}</td>
              <td data-label="Status"><span class="${cls}">${esc(status || '?')}</span></td>
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
              <td class="cell-name">${s.lastSubject ? esc(s.lastSubject.slice(0, 50)) : '—'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;

    const recent = state.emails
      .filter(e => e['Sent By'] || e['Sent By Email'])
      .sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp))
      .slice(0, 20);
    if (!recent.length) {
      boardRecent.outerHTML = '<table id="boardRecentTable" class="terminal-table mobile-cards"><tbody><tr><td class="table-empty">NO ATTRIBUTED SENDS YET</td></tr></tbody></table>';
      return;
    }
    boardRecent.outerHTML = `
      <table id="boardRecentTable" class="terminal-table mobile-cards">
        <thead><tr><th>TIME</th><th>SENDER</th><th>TO</th><th>SUBJECT</th><th>STATUS</th></tr></thead>
        <tbody>
          ${recent.map(r => {
            const status = String(r.Status || '').toUpperCase();
            const cls = status === 'SENT' ? 'pill' : 'pill red';
            return `<tr>
              <td class="cell-time" data-label="Time">${esc(fmtDateTime(r.Timestamp))}</td>
              <td class="cell-mono" data-label="By">${esc(r['Sent By'] || '—')}</td>
              <td class="cell-email" data-label="To">${esc((r['To Name'] || '') || (r['To Email'] || ''))}</td>
              <td class="cell-name" data-label="Subject">${esc(r.Subject || '—')}</td>
              <td data-label="Status"><span class="${cls}">${esc(status || '?')}</span></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }

  /* ───────── render all ───────── */
  function render(data) {
    state.members = data.members || [];
    state.emails = data.emails || [];
    state.actions = data.actions || [];
    state.boardNotes = data.boardNotes || [];

    const validKeys = new Set(state.members.map(m => String(m.Email || '').toLowerCase()));
    [...state.selected].forEach(k => { if (!validKeys.has(k)) state.selected.delete(k); });

    buildDatalist();
    renderKPIs();
    renderBoard();
    renderClub();
    renderActions();
    renderBoardNotes();
    renderSent();
    renderBoardLog();
    updateSelectionBar();
    updateSideDraftState();

    if (!memberModal.classList.contains('hidden') && state.currentMemberEmail) {
      const m = getCurrentMember();
      if (m) renderMemberModal(m);
      else closeMemberModalFn();
    }
  }

  let lastMobile = window.matchMedia('(max-width: 1000px)').matches;
  window.addEventListener('resize', () => {
    const m = window.matchMedia('(max-width: 1000px)').matches;
    if (m !== lastMobile) {
      lastMobile = m;
      renderClub();
      renderActions();
      renderBoardNotes();
      renderSent();
      if (!m) closeDrawer();
    }
  });

  /* ───────── bootstrap ───────── */
  const stored = getKey();
  if (stored) tryLogin(stored).catch(() => clearKey());
})();