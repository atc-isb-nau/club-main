/* ATC HR — login gate, members directory, compose & send, sent + invoices. */
(() => {
  'use strict';

  const cfg = window.ATC_CONFIG || {};
  const KEY_STORAGE = 'atc_hr_key';
  const TAB_STORAGE = 'atc_hr_tab';
  const AUTO_REFRESH_MS = 60000;

  /* ──────── members ──────── */
  const MEMBERS = [
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
    const time = pad(d.getHours()) + ':' + pad(d.getMinutes());
    if (d.toDateString() === now.toDateString()) return time;
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + ' ' + time;
  };
  const initials = name => String(name || '')
    .replace(/[^A-Za-z\u00C0-\u024F ]/g, '')
    .split(/\s+/).filter(Boolean)
    .map(w => w[0]).slice(0, 2).join('').toUpperCase() || '·';
  const hashStr = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
  const PALETTE = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];
  const colorFor = s => PALETTE[hashStr(s || '') % PALETTE.length];

  /* ──────── DOM ──────── */
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
  const membersGrid  = $('membersGrid');
  const memberSearch = $('memberSearch');
  const toSelect     = $('toSelect');
  const customToWrap = $('customToWrap');
  const toCustomEmail = $('toCustomEmail');
  const toCustomName = $('toCustomName');
  const subjectInput = $('subject');
  const bodyInput    = $('body');
  const amountInput  = $('amount');
  const currencySel  = $('currency');
  const descInput    = $('desc');
  const composeForm  = $('composeForm');
  const composeErr   = $('composeErr');
  const sendBtn      = $('sendBtn');
  const sendStatus   = $('sendStatus');

  let state = { emails: [], invoices: [], search: '' };

  /* ──────── auth ──────── */
  const getKey   = () => { try { return sessionStorage.getItem(KEY_STORAGE); } catch (e) { return null; } };
  const setKey   = k  => { try { sessionStorage.setItem(KEY_STORAGE, k); } catch (e) {} };
  const clearKey = () => { try { sessionStorage.removeItem(KEY_STORAGE); } catch (e) {} };

  loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    await tryLogin(pwInput.value.trim());
  });

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

  function logout() {
    clearKey();
    stopAutoRefresh();
    location.reload();
  }

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
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    let data = null;
    try { data = await res.json(); } catch (e) { data = { ok: false, error: 'Malformed response' }; }
    return data;
  }

  /* ──────── dashboard entry ──────── */
  function enterDashboard(data) {
    loginEl.classList.add('hidden');
    dashboardEl.classList.remove('hidden');
    initTabs();
    buildToDropdown();
    renderMembers();
    startClock();
    render(data);
    startAutoRefresh();
    refreshBtn.addEventListener('click', reload);
    logoutBtn.addEventListener('click', logout);
  }

  /* ──────── tabs ──────── */
  function initTabs() {
    const saved = localStorage.getItem(TAB_STORAGE) || 'members';
    switchTab(saved);
    tabsEl.addEventListener('click', e => {
      const btn = e.target.closest('[data-tab]');
      if (btn) switchTab(btn.dataset.tab);
    });
  }
  function switchTab(name) {
    tabsEl.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.hr-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === name));
    localStorage.setItem(TAB_STORAGE, name);
  }

  /* ──────── clock + refresh ──────── */
  let clockTimer = null, refreshTimer = null, nextRefresh = 0;
  function startClock() {
    updateClock();
    clockTimer = setInterval(updateClock, 1000);
  }
  function updateClock() {
    const n = new Date();
    tickerTime.textContent = pad(n.getHours()) + ':' + pad(n.getMinutes()) + ':' + pad(n.getSeconds());
  }
  function startAutoRefresh() {
    nextRefresh = Date.now() + AUTO_REFRESH_MS;
    refreshTimer = setInterval(async () => {
      if (document.visibilityState !== 'visible') { nextRefresh = Date.now() + AUTO_REFRESH_MS; return; }
      if (Date.now() >= nextRefresh) {
        nextRefresh = Date.now() + AUTO_REFRESH_MS;
        await reload();
      }
      const secs = Math.max(0, Math.ceil((nextRefresh - Date.now()) / 1000));
      tickerMsg.textContent = 'NEXT SYNC IN ' + secs + 's';
    }, 1000);
  }
  function stopAutoRefresh() {
    if (clockTimer) clearInterval(clockTimer);
    if (refreshTimer) clearInterval(refreshTimer);
    clockTimer = refreshTimer = null;
  }
  async function reload() {
    const key = getKey();
    if (!key) return;
    try {
      const data = await fetchHR(key);
      render(data);
      tickerMsg.textContent = 'SYNCED';
    } catch (err) {
      tickerMsg.textContent = 'SYNC FAILED';
    }
  }

  /* ──────── KPI strip ──────── */
  function renderKPIs() {
    const now = Date.now();
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const todayEmails = state.emails.filter(e => new Date(e.Timestamp).getTime() >= dayStart.getTime()).length;

    const outstanding = state.invoices.filter(i => String(i.Status || '').toUpperCase() !== 'PAID');
    const byCur = {};
    outstanding.forEach(i => {
      const c = String(i.Currency || 'TND').toUpperCase();
      byCur[c] = (byCur[c] || 0) + (Number(i.Amount) || 0);
    });
    const outstandingStr = Object.keys(byCur).length
      ? Object.entries(byCur).map(([c, v]) => v.toFixed(2) + ' ' + c).join(' · ')
      : '—';

    $('kpiStrip').innerHTML = `
      <div class="kpi">
        <span class="kpi-label">TEAM</span>
        <b class="kpi-value">${MEMBERS.length}</b>
        <span class="kpi-note">on the board</span>
      </div>
      <div class="kpi">
        <span class="kpi-label">EMAILS</span>
        <b class="kpi-value is-gold">${state.emails.length}</b>
        <span class="kpi-note">${todayEmails > 0 ? '+' + todayEmails + ' today' : 'no sends today'}</span>
      </div>
      <div class="kpi">
        <span class="kpi-label">INVOICES</span>
        <b class="kpi-value is-green">${state.invoices.length}</b>
        <span class="kpi-note">${outstanding.length} outstanding</span>
      </div>
      <div class="kpi">
        <span class="kpi-label">OUTSTANDING</span>
        <b class="kpi-value" style="font-size:18px">${esc(outstandingStr)}</b>
        <span class="kpi-note">unpaid total</span>
      </div>`;
  }

  /* ──────── members ──────── */
  function renderMembers() {
    const q = state.search.trim().toLowerCase();
    const list = q
      ? MEMBERS.filter(m =>
          (m.name + ' ' + m.role + ' ' + (m.alias || '') + ' ' + (m.email || '') + ' ' + (m.phone || '')).toLowerCase().includes(q))
      : MEMBERS;

    membersGrid.innerHTML = list.length
      ? list.map(renderMemberCard).join('')
      : '<div class="hr-empty">NO MATCHES</div>';
  }

  function renderMemberCard(m) {
    const color = colorFor(m.name + (m.email || ''));
    const avatarSrc = m.email ? `https://unavatar.io/${encodeURIComponent(m.email)}?fallback=false` : '';
    const phoneHtml = m.phone
      ? `<a href="tel:${esc(m.phone.replace(/\s+/g, ''))}">${esc(m.phone)}</a>`
      : `<span class="muted">not provided</span>`;
    const emailHtml = m.email
      ? `<button class="link-btn" type="button" data-compose-to="${esc(m.email)}" data-compose-name="${esc(m.name)}">${esc(m.email)}</button>`
      : `<span class="muted">no email yet</span>`;
    return `
      <div class="member-card">
        <div class="avatar" style="color:${color}">
          <span class="avatar-initials">${esc(initials(m.name))}</span>
          ${avatarSrc ? `<img class="avatar-img" src="${avatarSrc}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.style.display='none'">` : ''}
        </div>
        <div class="member-body">
          <div class="member-name">${esc(m.name)}${m.alias ? `<span class="member-alias">(${esc(m.alias)})</span>` : ''}</div>
          <span class="member-role">${esc(m.role)}</span>
          <div class="member-line"><span class="key">TEL</span>${phoneHtml}</div>
          <div class="member-line"><span class="key">MAIL</span>${emailHtml}</div>
        </div>
      </div>`;
  }

  memberSearch.addEventListener('input', () => {
    state.search = memberSearch.value;
    renderMembers();
  });

  // Clicking a member's email jumps to Compose with the recipient pre-filled.
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-compose-to]');
    if (!t) return;
    switchTab('compose');
    const email = t.dataset.composeTo;
    toSelect.value = email;
    if (!toSelect.value) toSelect.value = '__custom__';
    toSelect.dispatchEvent(new Event('change'));
    if (toSelect.value === '__custom__') {
      toCustomEmail.value = email;
      toCustomName.value = t.dataset.composeName || '';
    }
    subjectInput.focus();
  });

  /* ──────── compose: TO dropdown ──────── */
  function buildToDropdown() {
    const options = [
      '<option value="">— pick a member —</option>',
      ...MEMBERS.filter(m => m.email).map(m =>
        `<option value="${esc(m.email)}" data-name="${esc(m.name)}">${esc(m.name)} — ${esc(m.role)}</option>`),
      '<option value="__custom__">Custom email…</option>'
    ];
    toSelect.innerHTML = options.join('');
    toSelect.addEventListener('change', () => {
      const isCustom = toSelect.value === '__custom__';
      customToWrap.classList.toggle('hidden', !isCustom);
      if (isCustom) toCustomEmail.focus();
    });
  }

  /* ──────── send ──────── */
  composeForm.addEventListener('submit', async e => {
    e.preventDefault();
    composeErr.classList.add('hidden');

    const isCustom = toSelect.value === '__custom__';
    const to = isCustom ? toCustomEmail.value.trim() : toSelect.value.trim();
    const toName = isCustom
      ? toCustomName.value.trim()
      : (toSelect.selectedOptions[0]?.dataset.name || '');
    const subject = subjectInput.value.trim();
    const body    = bodyInput.value.trim();
    const amount  = parseFloat(amountInput.value);
    const currency = currencySel.value;
    const description = descInput.value.trim();

    if (!to) return showComposeErr('Choose a recipient or enter a custom email.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return showComposeErr('Recipient email is not valid.');
    if (!subject) return showComposeErr('Subject is required.');
    if (!body) return showComposeErr('Body is required.');

    const key = getKey();
    if (!key) return showComposeErr('Session expired — please log in again.');

    const payload = { type: 'hr_email', key, to, toName, subject, body };
    if (Number.isFinite(amount) && amount > 0) {
      payload.invoice = { amount, currency, description };
    }

    sendBtn.disabled = true;
    const oldBtn = sendBtn.textContent;
    sendBtn.innerHTML = '<span class="spinner spinner-sm"></span> SENDING…';
    sendStatus.className = 'status-pill';
    sendStatus.classList.remove('hidden');
    sendStatus.innerHTML = '<span class="spinner spinner-sm"></span> Working…';

    try {
      const result = await postHR(payload);
      if (result && result.ok) {
        sendStatus.className = 'status-pill is-saved';
        sendStatus.innerHTML = '✓ Sent' + (result.invoiceNo ? ' · ' + esc(result.invoiceNo) : '');
        composeForm.reset();
        amountInput.value = '';
        descInput.value = '';
        customToWrap.classList.add('hidden');
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
      sendBtn.textContent = oldBtn || 'SEND ▸';
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
    $('sentTag').textContent = rows.length + ' TOTAL';
    if (!rows.length) {
      $('sentTable').outerHTML = '<table id="sentTable" class="terminal-table"><tbody><tr><td class="table-empty">NO EMAILS SENT YET</td></tr></tbody></table>';
      return;
    }
    $('sentTable').outerHTML = `
      <table id="sentTable" class="terminal-table">
        <thead><tr>
          <th>TIME</th><th>TO</th><th>SUBJECT</th><th>STATUS</th><th>INVOICE</th>
        </tr></thead>
        <tbody>
          ${rows.map(r => {
            const status = String(r.Status || '').toUpperCase();
            const pillCls = status === 'SENT' ? 'pill' : 'pill red';
            return `<tr title="${esc(r.Error || '')}">
              <td class="cell-time">${esc(fmtDateTime(r.Timestamp))}</td>
              <td class="cell-email" title="${esc(r['To Email'] || '')}">
                ${esc((r['To Name'] || '') || (r['To Email'] || ''))}
              </td>
              <td class="cell-name" title="${esc(r.Subject || '')}">${esc(r.Subject || '—')}</td>
              <td><span class="${pillCls}">${esc(status || '?')}</span></td>
              <td class="cell-mono">${esc(r['Invoice No'] || '—')}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }

  /* ──────── invoices table ──────── */
  function renderInvoices() {
    const rows = state.invoices.slice().sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
    $('invTag').textContent = rows.length + ' TOTAL';
    if (!rows.length) {
      $('invTable').outerHTML = '<table id="invTable" class="terminal-table"><tbody><tr><td class="table-empty">NO INVOICES YET</td></tr></tbody></table>';
      return;
    }
    $('invTable').outerHTML = `
      <table id="invTable" class="terminal-table">
        <thead><tr>
          <th>TIME</th><th>INVOICE</th><th>TO</th><th>AMOUNT</th><th>STATUS</th><th>ACTION</th>
        </tr></thead>
        <tbody>
          ${rows.map(r => {
            const status = String(r.Status || '').toUpperCase();
            const cls = status === 'PAID' ? 'pill' : (status === 'FAILED' ? 'pill red' : 'pill gold');
            const paid = status === 'PAID';
            return `<tr>
              <td class="cell-time">${esc(fmtDateTime(r.Timestamp))}</td>
              <td class="cell-mono">${esc(r['Invoice No'] || '—')}</td>
              <td class="cell-email" title="${esc(r['To Email'] || '')}">${esc((r['To Name'] || '') || (r['To Email'] || ''))}</td>
              <td class="cell-mono">${esc((Number(r.Amount) || 0).toFixed(2))} ${esc(r.Currency || 'TND')}</td>
              <td><span class="${cls}">${esc(status || '?')}</span></td>
              <td>${paid ? '<span class="muted" style="font-size:10px">—</span>' : `<button class="link-btn" style="color:var(--green);font-size:10px;letter-spacing:.1em;font-weight:700" data-paid="${esc(r['Invoice No'])}">MARK PAID</button>`}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }

  document.addEventListener('click', async e => {
    const btn = e.target.closest('[data-paid]');
    if (!btn) return;
    const invNo = btn.dataset.paid;
    if (!invNo) return;
    btn.disabled = true;
    btn.textContent = '…';
    try {
      const key = getKey();
      const result = await postHR({ type: 'hr_invoice_paid', key, invoiceNo: invNo });
      if (result && result.ok) {
        await reload();
      } else {
        btn.disabled = false;
        btn.textContent = 'MARK PAID';
        alert((result && result.error) || 'Could not mark paid');
      }
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'MARK PAID';
      alert(err.message || 'Network error');
    }
  });

  /* ──────── render ──────── */
  function render(data) {
    state.emails   = data.emails   || [];
    state.invoices = data.invoices || [];
    renderKPIs();
    renderSent();
    renderInvoices();
  }

  /* ──────── boot ──────── */
  const stored = getKey();
  if (stored) tryLogin(stored).catch(() => clearKey());
})();