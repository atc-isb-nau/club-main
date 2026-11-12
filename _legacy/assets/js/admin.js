/* ATC Terminal — admin dashboard logic.
   Reads from the same Apps Script deployment via ?action=dashboard,
   authenticates with the staff password in config.js, and renders
   the panels. Standalone — does not depend on common.js. */
(() => {
  'use strict';

  const cfg = window.ATC_CONFIG || {};
  const KEY_STORAGE   = 'atc_dashboard_key';
  const AUTO_REFRESH_MS = 30000;
  const MAX_ROWS      = 12;      // most rows shown in tables
  const DAY_MS        = 24 * 60 * 60 * 1000;
  const HOUR_MS       = 60 * 60 * 1000;

  /* ──────── helpers ──────── */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
  const pad = n => String(n).padStart(2, '0');
  const fmtTime = d => {
    const date = d instanceof Date ? d : new Date(d);
    if (isNaN(date)) return '—';
    return pad(date.getHours()) + ':' + pad(date.getMinutes());
  };
  const fmtDateTime = d => {
    const date = d instanceof Date ? d : new Date(d);
    if (isNaN(date)) return '—';
    const now = new Date();
    if (date.toDateString() === now.toDateString()) return fmtTime(date);
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return 'Y-' + fmtTime(date);
    return pad(date.getDate()) + '/' + pad(date.getMonth() + 1) + ' ' + fmtTime(date);
  };
  const colorFor = i => `var(--chart-${(i % 5) + 1})`;

  /* ──────── DOM refs ──────── */
  const $ = id => document.getElementById(id);
  const loginEl    = $('login');
  const dashboardEl = $('dashboard');
  const loginForm  = $('loginForm');
  const pwInput    = $('pw');
  const loginErr   = $('loginErr');
  const tickerTime = $('tickerTime');
  const tickerMsg  = $('tickerMsg');
  const refreshBtn = $('refreshBtn');
  const logoutBtn  = $('logoutBtn');

  /* ──────── auth ──────── */
  const getKey = () => { try { return sessionStorage.getItem(KEY_STORAGE); } catch (e) { return null; } };
  const setKey = k => { try { sessionStorage.setItem(KEY_STORAGE, k); } catch (e) {} };
  const clearKey = () => { try { sessionStorage.removeItem(KEY_STORAGE); } catch (e) {} };

  /* ──────── fetch ──────── */
  async function fetchData(key) {
    if (!cfg.APPS_SCRIPT_URL) throw new Error('No backend URL configured');
    const url = cfg.APPS_SCRIPT_URL + '?action=dashboard&key=' + encodeURIComponent(key);
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data || !data.ok) throw new Error((data && data.error) || 'Unauthorized');
    return data;
  }

  /* ──────── login ──────── */
  loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    await tryLogin(pwInput.value.trim());
  });

  async function tryLogin(key) {
    if (!key) return;
    loginErr.classList.add('hidden');
    const btn = loginForm.querySelector('button');
    const oldText = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner spinner-sm" style="vertical-align:-2px;margin-right:6px"></span> CONNECTING…';
    try {
      const data = await fetchData(key);
      setKey(key);
      enterDashboard(data);
    } catch (err) {
      loginErr.textContent = (err && err.message) || 'Connection failed';
      loginErr.classList.remove('hidden');
      pwInput.select();
    } finally {
      btn.disabled = false;
      btn.textContent = oldText;
    }
  }

  function enterDashboard(data) {
    loginEl.classList.add('hidden');
    dashboardEl.classList.remove('hidden');
    startClock();
    render(data);
    startAutoRefresh();
    refreshBtn.addEventListener('click', reload);
    logoutBtn.addEventListener('click', logout);
  }

  function logout() {
    clearKey();
    stopAutoRefresh();
    location.reload();
  }

  /* ──────── clock + auto-refresh ──────── */
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
      if (document.visibilityState !== 'visible') {
        nextRefresh = Date.now() + AUTO_REFRESH_MS;
        return;
      }
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
      const data = await fetchData(key);
      render(data);
      tickerMsg.textContent = 'SYNCED';
    } catch (err) {
      tickerMsg.textContent = 'SYNC FAILED';
    }
  }

  /* ──────── render ──────── */
  function render(data) {
    const signups = data.signups || [];
    const results = data.results || [];
    const scrollY = window.scrollY;
    renderKPIs(signups, results);
    renderSignupsChart(signups);
    renderTraderChart(results);
    renderBalanceChart(results);
    renderLevelsChart(results);
    renderFieldsChart(results);
    renderEducationChart(signups);
    renderSignupsTable(signups);
    renderResultsTable(results);
    requestAnimationFrame(() => window.scrollTo(0, scrollY));
  }

  /* ──────── KPIs ──────── */
  function renderKPIs(signups, results) {
    const now = Date.now();
    const todaySignups = signups.filter(s => withinMs(s.Timestamp, DAY_MS, now)).length;
    const quizResults  = results.filter(r => r.Game === 'knowledge');
    const tradeResults = results.filter(r => r.Game === 'trader');

    const signupEmails = new Set(signups.map(s => String(s.Email || '').toLowerCase()).filter(Boolean));
    const resultEmails = new Set(results.map(r => String(r.Email || '').toLowerCase()).filter(Boolean));
    const completed = [...resultEmails].filter(e => signupEmails.has(e)).length;
    const rate = signupEmails.size ? Math.round((completed / signupEmails.size) * 100) : 0;

    const scored = quizResults.filter(r => Number.isFinite(+r.Score) && +r.Total > 0);
    const avgScore = scored.length
      ? (scored.reduce((s, r) => s + (+r.Score / +r.Total), 0) / scored.length * 9).toFixed(1)
      : '—';

    $('kpiStrip').innerHTML = `
      <div class="kpi">
        <span class="kpi-label">SIGNUPS</span>
        <b class="kpi-value">${signups.length}</b>
        <span class="kpi-note">${todaySignups > 0 ? '+' + todaySignups + ' today' : 'no new today'}</span>
      </div>
      <div class="kpi">
        <span class="kpi-label">RESULTS</span>
        <b class="kpi-value is-gold">${results.length}</b>
        <span class="kpi-note">${quizResults.length} quiz · ${tradeResults.length} trader</span>
      </div>
      <div class="kpi">
        <span class="kpi-label">COMPLETION</span>
        <b class="kpi-value is-green">${rate}%</b>
        <span class="kpi-note">${completed} / ${signupEmails.size}</span>
      </div>
      <div class="kpi">
        <span class="kpi-label">AVG QUIZ</span>
        <b class="kpi-value">${avgScore}</b>
        <span class="kpi-note">of 9 · ${scored.length} played</span>
      </div>`;
  }

  const withinMs = (ts, windowMs, now = Date.now()) => {
    const t = ts instanceof Date ? ts.getTime() : new Date(ts).getTime();
    return Number.isFinite(t) && now - t >= 0 && now - t < windowMs;
  };

  /* ──────── signups over last 24h (area chart) ──────── */
  function renderSignupsChart(signups) {
    const buckets = new Array(24).fill(0);
    const now = Date.now();
    signups.forEach(s => {
      const t = s.Timestamp instanceof Date ? s.Timestamp.getTime() : new Date(s.Timestamp).getTime();
      if (!Number.isFinite(t)) return;
      const ageHours = Math.floor((now - t) / HOUR_MS);
      if (ageHours >= 0 && ageHours < 24) buckets[23 - ageHours]++;
    });
    $('tagSignups').textContent = buckets.reduce((a, b) => a + b, 0) + ' IN 24H';
    $('chartSignups').innerHTML = svgArea(buckets);
  }

  /* ──────── trader type donut ──────── */
  function renderTraderChart(results) {
    const trades = results.filter(r => r.Game === 'trader');
    const counts = { G: 0, R: 0, P: 0 };
    trades.forEach(r => {
      const type = String(r.Result || '').split('·')[0].trim().toLowerCase();
      if (type.includes('risk averse')) counts.G++;
      else if (type.includes('risk taker')) counts.R++;
      else if (type.includes('player')) counts.P++;
    });
    $('tagTrader').textContent = trades.length + ' PLAYED';
    const items = [
      { label: 'Guardian',   value: counts.G, color: 'var(--chart-3)' },
      { label: 'Risk Taker', value: counts.R, color: 'var(--chart-2)' },
      { label: 'Player',     value: counts.P, color: 'var(--chart-1)' }
    ];
    const total = items.reduce((s, i) => s + i.value, 0);
    $('chartTrader').innerHTML = total === 0
      ? emptyMsg('NO TRADER RESULTS YET')
      : svgDonut(items, total);
  }

  /* ──────── finance / tech balance ──────── */
  function renderBalanceChart(results) {
    const trades = results.filter(r => r.Game === 'trader');
    const buckets = { 'Both worlds': 0, 'Finance-leaning': 0, 'Tech-leaning': 0, 'Fresh start': 0 };
    trades.forEach(r => {
      const side = String(r.Result || '').split('·')[1]?.trim() || '';
      if (buckets.hasOwnProperty(side)) buckets[side]++;
    });
    const items = Object.entries(buckets).map(([label, value], i) => ({ label, value, color: colorFor(i) }));
    $('chartBalance').innerHTML = svgBarsH(items, { labelW: 110 });
  }

  /* ──────── knowledge levels ──────── */
  function renderLevelsChart(results) {
    const quizzes = results.filter(r => r.Game === 'knowledge');
    const order = [
      'Market Newcomer', 'Market Aware', 'Market Ready',
      'Code Curious', 'Code Builder', 'Quant Coder'
    ];
    const counts = Object.fromEntries(order.map(k => [k, 0]));
    quizzes.forEach(r => { const lvl = String(r.Result || '').trim(); if (counts.hasOwnProperty(lvl)) counts[lvl]++; });
    const items = order.map((label, i) => ({ label, value: counts[label], color: colorFor(i) }));
    $('chartLevels').innerHTML = svgBarsH(items, { labelW: 120 });
  }

  /* ──────── by field ──────── */
  function renderFieldsChart(results) {
    const quizzes = results.filter(r => r.Game === 'knowledge');
    const counts = { Business: 0, IT: 0 };
    quizzes.forEach(r => { const f = String(r.Field || '').trim(); if (counts.hasOwnProperty(f)) counts[f]++; });
    const items = [
      { label: 'Business', value: counts.Business, color: 'var(--chart-2)' },
      { label: 'IT',       value: counts.IT,       color: 'var(--chart-1)' }
    ];
    $('chartFields').innerHTML = quizzes.length
      ? svgBarsH(items, { labelW: 90 })
      : emptyMsg('NO QUIZ RESULTS YET');
  }

  /* ──────── education ──────── */
  function renderEducationChart(signups) {
    const buckets = { 'First year': 0, 'Second year': 0, 'Third year+': 0, Engineering: 0, "Master's": 0, Other: 0 };
    signups.forEach(s => {
      const v = String(s.Education || '').toLowerCase();
      if (v.includes('first'))          buckets['First year']++;
      else if (v.includes('second'))    buckets['Second year']++;
      else if (v.includes('third') || v.includes('later')) buckets['Third year+']++;
      else if (v.includes('engineering')) buckets.Engineering++;
      else if (v.includes('master'))    buckets["Master's"]++;
      else                              buckets.Other++;
    });
    const items = Object.entries(buckets).map(([label, value], i) => ({ label, value, color: colorFor(i) }));
    $('chartEducation').innerHTML = signups.length
      ? svgBarsH(items, { labelW: 110 })
      : emptyMsg('NO SIGNUPS YET');
  }

  /* ──────── tables ──────── */
  function renderSignupsTable(signups) {
    const rows = signups.slice().sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp)).slice(0, MAX_ROWS);
    $('tagSignupsTable').textContent = rows.length + ' OF ' + signups.length;
    if (!rows.length) { $('tableSignups').outerHTML = '<table id="tableSignups" class="terminal-table"><tbody><tr><td class="table-empty">AWAITING SIGNUPS</td></tr></tbody></table>'; return; }
    $('tableSignups').outerHTML = `
      <table id="tableSignups" class="terminal-table">
        <thead><tr>
          <th>TIME</th><th>NAME</th><th>LEVEL</th><th>EMAIL</th>
        </tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td class="cell-time">${esc(fmtDateTime(r.Timestamp))}</td>
              <td class="cell-name" title="${esc(r.Name)}">${esc(r.Name)}</td>
              <td class="cell-mono">${esc(r.Education)}</td>
              <td class="cell-email" title="${esc(r.Email)}">${esc(r.Email)}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }

  function renderResultsTable(results) {
    const rows = results.slice().sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp)).slice(0, MAX_ROWS);
    $('tagResultsTable').textContent = rows.length + ' OF ' + results.length;
    if (!rows.length) { $('tableResults').outerHTML = '<table id="tableResults" class="terminal-table"><tbody><tr><td class="table-empty">AWAITING RESULTS</td></tr></tbody></table>'; return; }
    $('tableResults').outerHTML = `
      <table id="tableResults" class="terminal-table">
        <thead><tr>
          <th>TIME</th><th>NAME</th><th>GAME</th><th>SCORE</th><th>RESULT</th>
        </tr></thead>
        <tbody>
          ${rows.map(r => {
            const isTrade = r.Game === 'trader';
            const pillCls = isTrade ? 'pill gold' : 'pill';
            const gameLabel = isTrade ? 'TRD' : 'QZ·' + esc(r.Field || '?').toUpperCase();
            const scoreLabel = r.Score + '/' + r.Total;
            return `
              <tr>
                <td class="cell-time">${esc(fmtDateTime(r.Timestamp))}</td>
                <td class="cell-name" title="${esc(r.Name)}">${esc(r.Name)}</td>
                <td><span class="${pillCls}">${gameLabel}</span></td>
                <td class="cell-mono">${esc(scoreLabel)}</td>
                <td class="cell-mono" title="${esc(r.Result)}">${esc((r.Result || '').slice(0, 40))}</td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }

  /* ──────── SVG chart primitives ──────── */
  function emptyMsg(msg) {
    return `<div class="chart-empty">${esc(msg)}</div>`;
  }

  function svgArea(values) {
    const total = values.reduce((a, b) => a + b, 0);
    if (total === 0) return emptyMsg('NO SIGNUPS IN LAST 24H');
    const W = 400, H = 150, P = 18;
    const max = Math.max(...values, 1);
    const stepX = (W - P * 2) / (values.length - 1);

    let line = '';
    values.forEach((v, i) => {
      const x = P + i * stepX;
      const y = H - P - (v / max) * (H - P * 2);
      line += (i === 0 ? 'M' : 'L') + x + ' ' + y + ' ';
    });
    const area = line + `L ${W - P} ${H - P} L ${P} ${H - P} Z`;

    let grid = '';
    for (let i = 0; i <= 3; i++) {
      const y = P + i * (H - P * 2) / 3;
      grid += `<line x1="${P}" y1="${y}" x2="${W - P}" y2="${y}" stroke="var(--line)" stroke-width="1" stroke-dasharray="2 3" />`;
    }

    let ticks = '';
    const tickLabels = ['-24h', '-18h', '-12h', '-6h', 'now'];
    tickLabels.forEach((lbl, i) => {
      const x = P + i * (W - P * 2) / (tickLabels.length - 1);
      ticks += `<text x="${x}" y="${H - 4}" text-anchor="middle" fill="var(--muted)" font-size="9" letter-spacing="1">${lbl}</text>`;
    });

    let dots = '';
    values.forEach((v, i) => {
      if (v === 0) return;
      const x = P + i * stepX;
      const y = H - P - (v / max) * (H - P * 2);
      dots += `<circle cx="${x}" cy="${y}" r="2.5" fill="var(--green)" />`;
    });

    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" style="width:100%;height:auto;display:block" role="img" aria-label="Signups over the last 24 hours">
      ${grid}
      <path d="${area}" fill="rgba(51, 209, 122, .14)" stroke="none" />
      <path d="${line}" fill="none" stroke="var(--green)" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" />
      ${dots}
      ${ticks}
    </svg>`;
  }

  function svgBarsH(items, opts = {}) {
    const labelW = opts.labelW || 100;
    const W = 400, rowH = 22, P = 8;
    const H = items.length * rowH + P * 2;
    const valueW = 36;
    const barW = W - labelW - valueW - P * 2;
    const max = Math.max(...items.map(i => i.value), 1);
    const allZero = items.every(i => i.value === 0);

    let rows = '';
    items.forEach((it, i) => {
      const y = P + i * rowH;
      const fillW = it.value ? Math.max(4, (it.value / max) * barW) : 0;
      rows += `
        <text x="${P}" y="${y + 14}" fill="var(--muted)" font-size="10" letter-spacing="0.5">${esc(it.label)}</text>
        <rect x="${labelW}" y="${y + 4}" width="${barW}" height="14" rx="1" fill="rgba(255,255,255,.035)" />
        ${fillW ? `<rect x="${labelW}" y="${y + 4}" width="${fillW}" height="14" rx="1" fill="${it.color}" />` : ''}
        <text x="${W - P}" y="${y + 14}" text-anchor="end" fill="var(--fg)" font-size="11" font-weight="700">${it.value}</text>
      `;
    });

    return allZero
      ? emptyMsg('NO DATA YET')
      : `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" style="width:100%;height:auto;display:block">${rows}</svg>`;
  }

  function svgDonut(items, total) {
    const size = 200, cx = 100, cy = 100, r = 68, stroke = 22;
    const C = 2 * Math.PI * r;
    let offset = 0, arcs = '';

    items.forEach(it => {
      const frac = it.value / total;
      const len = frac * C;
      if (len <= 0) return;
      arcs += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
        stroke="${it.color}" stroke-width="${stroke}"
        stroke-dasharray="${len} ${C - len}"
        stroke-dashoffset="${-offset}"
        transform="rotate(-90 ${cx} ${cy})" />`;
      offset += len;
    });

    const legend = items.map(it => `
      <g transform="translate(${cx - 68}, ${cy + 96 + items.indexOf(it) * 0})"> </g>
    `).join('');

    const labels = items.map((it, i) => {
      const y = 195 + i * 14 - items.length * 14 + items.length * 14;
      return '';
    }).join('');

    // Legend below chart
    const legendRows = items.map((it, i) =>
      `<div style="display:flex;align-items:center;justify-content:space-between;padding:3px 0;font-size:10px">
         <span style="color:var(--muted)">
           <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${it.color};margin-right:6px;vertical-align:1px"></span>
           ${esc(it.label)}
         </span>
         <span style="color:var(--fg);font-weight:700">${it.value}</span>
       </div>`
    ).join('');

    return `
      <div style="display:flex;flex-direction:column;align-items:center;gap:10px;width:100%">
        <svg viewBox="0 0 ${size} ${size}" preserveAspectRatio="xMidYMid meet" style="width:180px;height:180px;display:block">
          ${arcs}
          <text x="${cx}" y="${cy - 2}" text-anchor="middle" fill="var(--fg)" font-size="22" font-weight="800" font-family="JetBrains Mono, monospace">${total}</text>
          <text x="${cx}" y="${cy + 14}" text-anchor="middle" fill="var(--muted)" font-size="9" letter-spacing="2" font-family="JetBrains Mono, monospace">PLAYED</text>
        </svg>
        <div style="width:100%;max-width:220px">${legendRows}</div>
      </div>`;
  }

  /* ──────── boot ──────── */
  const stored = getKey();
  if (stored) {
    tryLogin(stored).catch(() => { clearKey(); });
  }
})();