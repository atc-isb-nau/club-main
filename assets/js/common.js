/* Shared by every page: visitor session, sending data to Google Sheets, UI styles, quiz engine. */
const ATC = (() => {
  const USER_KEY = 'atc_user';
  const QUEUE_KEY = 'atc_queue';
  const RATE_KEY = 'atc_rate_limits';
  const COMPLETED_KEY = 'atc_completed_games';
  const DEVICE_KEY = 'atc_device_id';
  const STAFF_KEY = 'atc_staff_override';
  const cfg = window.ATC_CONFIG || {};

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function safeStorage(){
    try {
      const key = '__atc_storage_probe__';
      localStorage.setItem(key, '1');
      localStorage.removeItem(key);
      return localStorage;
    } catch (e) {
      return null;
    }
  }

  function readJson(key, fallback = {}) {
    const storage = safeStorage();
    if (!storage) return fallback;
    try { return JSON.parse(storage.getItem(key) || 'null') || fallback; }
    catch (e) { return fallback; }
  }

  function writeJson(key, value) {
    const storage = safeStorage();
    if (!storage) return false;
    try { storage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }

  function deviceId(){
    const storage = safeStorage();
    if (!storage) {
      if (!window.__ATC_DEVICE_ID__) window.__ATC_DEVICE_ID__ = 'memory-' + Math.random().toString(36).slice(2);
      return window.__ATC_DEVICE_ID__;
    }
    let id = storage.getItem(DEVICE_KEY);
    if (!id) {
      id = 'device-' + (crypto && crypto.getRandomValues ? Array.from(crypto.getRandomValues(new Uint32Array(4))).map(v => v.toString(16).padStart(8, '0')).join('') : Math.random().toString(36).slice(2));
      storage.setItem(DEVICE_KEY, id);
    }
    return id;
  }

  function pruneByWindow(entries, windowMs, now){
    return (entries || []).filter(ts => now - ts < windowMs);
  }

  function isStaffOverrideActive() {
    const storage = safeStorage();
    if (!storage) return false;
    return storage.getItem(STAFF_KEY) === '1';
  }

  function activateStaffOverride(code) {
    const storage = safeStorage();
    if (!storage) return false;
    const expected = (cfg.STAFF_PASSWORD || '3.14159').trim();
    if (!code || code.trim() !== expected) return false;
    storage.setItem(STAFF_KEY, '1');
    return true;
  }

  function deactivateStaffOverride() {
    const storage = safeStorage();
    if (storage) storage.removeItem(STAFF_KEY);
  }

  function checkLimit(kind, label = 'this action') {
    if (isStaffOverrideActive()) return { allowed: true, message: '' };
    const storage = safeStorage();
    if (!storage) return { allowed: true, message: '' };

    const now = Date.now();
    const windowMs = 1000 * 60 * 60 * 24;
    const max = kind === 'signup' ? 3 : 1;
    const state = readJson(RATE_KEY, {});
    const list = pruneByWindow(state[kind] || [], windowMs, now);

    if (list.length >= max) {
      return {
        allowed: false,
        message: `This device has already used ${label} ${max} time${max > 1 ? 's' : ''} in the last 24 hours. Please come back later.`
      };
    }
    state[kind] = list;
    state[kind].push(now);
    writeJson(RATE_KEY, state);
    return { allowed: true, message: '' };
  }

  function markCompletedGame(gameKey) {
    if (isStaffOverrideActive()) return;
    const storage = safeStorage();
    if (!storage) return;
    const state = readJson(COMPLETED_KEY, {});
    const now = Date.now();
    state[gameKey] = state[gameKey] || [];
    state[gameKey].push(now);
    writeJson(COMPLETED_KEY, state);
  }

  function hasCompletedGame(gameKey) {
    if (isStaffOverrideActive()) return false;
    const storage = safeStorage();
    if (!storage) return false;
    const state = readJson(COMPLETED_KEY, {});
    const list = pruneByWindow(state[gameKey] || [], 1000 * 60 * 60 * 24, Date.now());
    return list.length > 0;
  }

  function getGameLimitMessage(gameKey) {
    return `This device has already completed the ${gameKey} assessment in the last 24 hours. Please come back later or ask a staff member for a reset.`;
  }

  /* ---------- visitor session ---------- */
  const getUser = () => { try { return JSON.parse(sessionStorage.getItem(USER_KEY)); } catch (e) { return null; } };
  const setUser = u => { try { sessionStorage.setItem(USER_KEY, JSON.stringify(u)); } catch (e) {} };
  const clearUser = () => { try { sessionStorage.removeItem(USER_KEY); } catch (e) {} };
  const requireUser = () => {
    const u = getUser();
    if (!u) location.replace('index.html');
    return u || { name: '', education: '', email: '', motivation: '' };
  };
  const menu = () => { location.href = 'index.html'; };
  const next = () => { clearUser(); location.href = 'index.html'; };

  /* ---------- sending to Google Sheets (with offline retry queue) ---------- */
  const readQueue = () => { try { return JSON.parse(localStorage.getItem(QUEUE_KEY)) || []; } catch (e) { return []; } };
  const writeQueue = q => { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch (e) {} };
  const queue = p => { const q = readQueue(); q.push(p); writeQueue(q); };

  async function post(payload) {
    const res = await fetch(cfg.APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    let data = null;
    try { data = await res.json(); } catch (e) { data = { ok: true }; }
    return data;
  }

  async function send(payload) {
    if (!cfg.APPS_SCRIPT_URL) { queue(payload); return { ok: true, queued: true }; }
    try {
      const data = await post(payload);
      if (data && data.ok === false) return data;
      return { ok: true };
    } catch (e) {
      queue(payload);
      return { ok: true, queued: true };
    }
  }

  async function flush() {
    if (!cfg.APPS_SCRIPT_URL) return;
    const q = readQueue();
    if (!q.length) return;
    writeQueue([]);
    for (const p of q) {
      try {
        const data = await post(p);
        if (data && data.ok === false) {
          console.warn('ATC: dropped queued payload:', data.error);
        }
      } catch (e) {
        queue(p);
      }
    }
  }
  flush();

  /* ---------- loading components ---------- */

  // Full-screen overlay with spinner + message. Blocks interaction while visible.
  function showLoading(message = 'Working…') {
    if (document.getElementById('atc-loading')) return;
    const el = document.createElement('div');
    el.id = 'atc-loading';
    el.className = 'loading-overlay';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = `
      <div class="loading-card">
        <span class="spinner spinner-lg" aria-hidden="true"></span>
        <p class="loading-message">${esc(message)}</p>
      </div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-visible'));
  }

  function hideLoading() {
    const el = document.getElementById('atc-loading');
    if (!el) return;
    el.classList.remove('is-visible');
    setTimeout(() => el.remove(), 220);
  }

  const spinner = (size) => {
    const cls = size === 'sm' ? ' spinner-sm' : size === 'lg' ? ' spinner-lg' : '';
    return `<span class="spinner${cls}" aria-hidden="true"></span>`;
  };

  // Caller is responsible for escaping title/body if they contain user data.
  const emptyState = (title, bodyHtml, actionHtml = '') => `
    <div class="empty-state">
      <div class="empty-state-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 6L9 17l-5-5"/>
        </svg>
      </div>
      <h2 class="empty-state-title">${title}</h2>
      <p class="empty-state-body">${bodyHtml}</p>
      ${actionHtml}
    </div>`;

  /* ---------- UI class strings ---------- */
  const ui = {
    h1: 'h1',
    h2: 'h2',
    step: 'step',
    opt: 'option-button',
    primary: 'primary-button',
    ghost: 'ghost-button',
    input: 'field-control',
    label: 'field-label',
    tagGold: 'tag tag-gold',
    tagGreen: 'tag tag-green',
    stats: 'stats',
    stat: n => `<div class="stat"><b class="stat-value">${n[0]}</b><span class="stat-label">${n[1]}</span></div>`,
    box: (title, body, green) => `<div class="callout${green ? ' green' : ''}"><h3>${title}</h3><div>${body}</div></div>`,
    progress: (i, t) => `<div class="progress"><div class="progress-bar" style="width:${(i / t) * 100}%"></div></div>`,
    actions: () => `<button class="${ui.ghost}" onclick="ATC.menu()">Try another game</button>
      <button class="${ui.ghost}" onclick="ATC.next()">Next visitor</button>`,
    spinner,
    emptyState
  };

  /* ---------- quiz engine (used by business.html and it.html) ---------- */
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  function quiz(c) {
    const app = document.getElementById('app');
    const user = requireUser();
    const gameKey = 'knowledge-' + String(c.field || '').toLowerCase();
    const total = c.questions.length;
    let i = 0, score = 0, missed = [];

    // Per-field "already done" guard, styled as an empty state.
    if (hasCompletedGame(gameKey)) {
      app.innerHTML = `
        <span class="${ui.tagGold}">${esc(c.tag)}</span>
        ${emptyState(
          'Already done',
          `You've already completed the ${esc(c.field)} assessment in the last 24 hours. Try the other field, the trader game, or come back tomorrow.`,
          `<button class="${ui.ghost}" onclick="location.href='index.html'">Back to menu</button>`
        )}`;
      return;
    }

    function render() {
      if (i >= total) return finish();
      const q = c.questions[i];
      const order = shuffle(q.a.map((_, n) => n));
      app.innerHTML = `${ui.progress(i, total)}
        <p class="${ui.step}">${esc(c.kicker)} · ${i + 1} of ${total}</p>
        <h2 class="${ui.h2}">${esc(q.q)}</h2>
        ${order.map(o => `<button class="${ui.opt}" data-o="${o}">${esc(q.a[o])}</button>`).join('')}`;
      app.querySelectorAll('[data-o]').forEach(b => b.addEventListener('click', () => pick(+b.dataset.o)));
    }

    function pick(o) {
      const q = c.questions[i];
      if (o === q.r) score++; else missed.push(q);
      i++;
      render();
    }

    function finish() {
      const lvl = c.levels.filter(l => score >= l.min).pop();
      const review = missed.length
        ? ui.box('Worth a second look', `<ul class="answer-list">${missed.map(q => `<li><strong>${esc(q.q)}</strong><br><span class="muted">${esc(q.a[q.r])}</span></li>`).join('')}</ul>`)
        : ui.box('Perfect score', 'You got every question right. Come talk to us about mentoring.');
      app.innerHTML = `<span class="${ui.tagGold}">${esc(c.tag)}</span>
        <h1 class="${ui.h1}">${esc(lvl.name)}</h1>
        <p class="body-copy"><strong>${esc(user.name)}</strong>, you got ${score} out of ${total}.</p>
        <p class="body-copy">${esc(lvl.desc)}</p>
        <div class="${ui.stats}">${ui.stat([score + '/' + total, 'CORRECT'])}${ui.stat([c.field, 'TRACK'])}</div>
        ${review}
        ${ui.box('Your next step', esc(lvl.next), true)}
        <p class="footer-note">Scan the sign-up code at our stand to join the Algorithmic Trading Club.</p>
        <p id="saveStatus" class="status-pill">${spinner('sm')} Saving result…</p>
        ${ui.actions()}`;
      markCompletedGame(gameKey);
      send({
        type: 'result',
        name: user.name, email: user.email, education: user.education, motivation: user.motivation || '',
        deviceId: deviceId(),
        staffCode: isStaffOverrideActive() ? 'ATC-STAFF-2026' : '',
        game: 'knowledge', field: c.field,
        score, total, result: lvl.name,
        details: 'Missed: ' + (missed.map(q => q.q).join(' | ') || 'none')
      }).then(r => {
        const el = document.getElementById('saveStatus');
        if (!el) return;
        if (r && r.ok === false) {
          el.className = 'status-pill is-error';
          el.textContent = 'Not saved — ' + (r.error || 'please tell a staff member');
        } else if (r && r.queued) {
          el.className = 'status-pill';
          el.textContent = '● Saved offline — will retry';
        } else {
          el.className = 'status-pill is-saved';
          el.innerHTML = '✓ Result saved';
        }
      });
    }

    render();
  }

  return {
    esc,
    getUser,
    setUser,
    clearUser,
    requireUser,
    menu,
    next,
    send,
    checkLimit,
    hasCompletedGame,
    markCompletedGame,
    getGameLimitMessage,
    activateStaffOverride,
    deactivateStaffOverride,
    isStaffOverrideActive,
    deviceId,
    showLoading,
    hideLoading,
    ui,
    quiz
  };
})();