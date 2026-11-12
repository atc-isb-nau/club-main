/**
 * HR / invoicing endpoints for hr.html.
 *
 * Reads:  POST { type:'hr_read', key }
 *         → { ok, emails: [...], invoices: [...], actions: [...], boardNotes: [...], members: [...] }
 *
 * Writes: POST { type:'hr_email', key, recipients:[{email,name},…],
 *                subject, htmlBody, plainBody, sender:{name,email},
 *                invoice?:{ amount, currency, description } }
 *         POST { type:'hr_invoice_paid', key, invoiceNo }
 */

const HR_TABS = {
  Emails:   ['Timestamp','To Email','To Name','Subject','Body','Status','Error','Invoice No','Sent By','Sent By Email'],
  Invoices: ['Timestamp','Invoice No','To Email','To Name','Amount','Currency','Description','Status','Sent At'],
  Actions: ['Timestamp','ID','Action Name','Action Date','Member Email','Member Name','Mark','Note','By'],
  BoardNotes: ['Timestamp','ID','Board Member','Category','Note','By']
};

function HR_getData_(providedKey) {
  if (String(providedKey || '').trim() !== DASHBOARD_KEY) {
    return json_({ ok: false, error: 'Unauthorized' });
  }
  try {
    return json_({
      ok: true,
      generatedAt: new Date().toISOString(),
      members: HR_readSignups_(),
      emails:    HR_readTab_('Emails'),
      invoices:  HR_readTab_('Invoices'),
      actions:   HR_readTab_('Actions'),
      boardNotes:HR_readTab_('BoardNotes')
    });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/* Signups is owned by Code.gs — read defensively, do not create. */
function HR_readSignups_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('Signups');
  if (!sh) return [];
  const last = sh.getLastRow();
  if (last < 2) return [];
  const headers = TABS.Signups;
  const values = sh.getRange(2, 1, last - 1, headers.length).getValues();
  return values.map(function (row) {
    const o = {};
    headers.forEach(function (h, i) { o[h] = row[i]; });
    return o;
  });
}

function HR_readTab_(name) {
  const sh = HR_getTab_(name);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const headers = HR_TABS[name];
  const values = sh.getRange(2, 1, last - 1, headers.length).getValues();
  return values.map(function (row) {
    const o = {};
    headers.forEach(function (h, i) { o[h] = row[i]; });
    return o;
  });
}

function HR_getTab_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  const headers = HR_TABS[name];
  if (!headers) throw new Error('Unknown HR tab: ' + name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sh.setFrozenRows(1);
    return sh;
  }
  const last = Math.max(sh.getLastColumn(), headers.length);
  const cur = sh.getRange(1, 1, 1, last).getValues()[0];
  const lower = cur.map(v => String(v || '').trim().toLowerCase());
  const missing = headers.filter(h => lower.indexOf(h.toLowerCase()) === -1);
  if (missing.length) {
    const start = sh.getLastColumn() + 1;
    missing.forEach((h, i) => sh.getRange(1, start + i).setValue(h).setFontWeight('bold'));
  }
  return sh;
}

function HR_sendEmail_(d) {
  if (String(d.key || '').trim() !== DASHBOARD_KEY) {
    return json_({ ok: false, error: 'Unauthorized', version: 'v3' });
  }

  const sender = d.sender && typeof d.sender === 'object' ? d.sender : null;
  if (!sender || !sender.name) {
    return json_({ ok: false, error: 'Sender is required for accountability.', version: 'v3' });
  }

  const subject = String(d.subject || '').trim();
  if (!subject) return json_({ ok: false, error: 'Subject is required.', version: 'v3' });

  const htmlBody  = String(d.htmlBody || '');
  const plainBody = String(d.plainBody || '') || HR_stripHtml_(htmlBody);
  if (!plainBody.trim()) return json_({ ok: false, error: 'Body is required.', version: 'v3' });

  let recipients = Array.isArray(d.recipients) ? d.recipients.slice() : [];
  if (!recipients.length && d.to) {
    recipients = [{ email: d.to, name: d.toName || '' }];
  }
  if (!recipients.length) {
    return json_({ ok: false, error: 'No recipients.', version: 'v3' });
  }

  // Optional invoice block (legacy — current UI does not send this)
  const inv       = d.invoice && typeof d.invoice === 'object' ? d.invoice : null;
  const amount    = inv && Number(inv.amount) > 0 ? Number(inv.amount) : 0;
  const currency  = inv && inv.currency ? String(inv.currency).trim().toUpperCase() : 'TND';
  const desc      = inv && inv.description ? String(inv.description).trim() : '';
  const invoiceNo = amount > 0 ? HR_makeInvoiceNo_() : '';

  // Remaining quota — the frontend shows this in failure messages
  let quota = -1;
  try { quota = MailApp.getRemainingDailyQuota(); } catch (e) {}

  const now         = new Date();
  const senderName  = String(sender.name || '').trim();
  const senderEmail = String(sender.email || '').trim();

  let sent = 0, failed = 0, firstError = '';
  const results = [];
  const emailsSheet = HR_getTab_('Emails');

  recipients.forEach(function (r) {
    const to     = String((r && r.email) || '').trim();
    const toName = String((r && r.name)  || '').trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      failed++;
      if (!firstError) firstError = 'Invalid email: ' + to;
      results.push({ email: to, status: 'FAILED', error: 'Invalid email' });
      emailsSheet.appendRow(clean_([
        now, to, toName, subject, plainBody.slice(0, 800),
        'FAILED', 'Invalid email', invoiceNo, senderName, senderEmail
      ]));
      return;
    }

    let status   = 'SENT';
    let errorMsg = '';
    try {
      const opts = {
        to: to,
        subject: subject,
        body: plainBody,
        name: 'Algorithmic Trading Club'
      };
      if (htmlBody)    opts.htmlBody = htmlBody;
      if (senderEmail) opts.replyTo  = senderEmail;
      MailApp.sendEmail(opts);
      sent++;
    } catch (err) {
      status   = 'FAILED';
      failed++;
      errorMsg = String(err);
      if (!firstError) firstError = errorMsg;
    }

    results.push({ email: to, status: status, error: errorMsg });
    emailsSheet.appendRow(clean_([
      now, to, toName, subject, plainBody.slice(0, 800),
      status, errorMsg, invoiceNo, senderName, senderEmail
    ]));
  });

  if (invoiceNo) {
    try {
      HR_getTab_('Invoices').appendRow(clean_([
        now, invoiceNo, '—', '—', amount, currency, desc || subject,
        sent > 0 ? 'SENT' : 'FAILED', now
      ]));
    } catch (e) {}
  }

  return json_({
    ok: sent > 0,
    sent: sent,
    failed: failed,
    error: firstError,
    quota: quota,
    version: 'v3',
    results: results
  });
}

function HR_stripHtml_(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function HR_markInvoicePaid_(d) {
  if (String(d.key || '').trim() !== DASHBOARD_KEY) {
    return json_({ ok: false, error: 'Unauthorized' });
  }
  const invNo = String(d.invoiceNo || '').trim();
  if (!invNo) return json_({ ok: false, error: 'Missing invoice number' });

  const sh = HR_getTab_('Invoices');
  const last = sh.getLastRow();
  if (last < 2) return json_({ ok: false, error: 'No invoices' });

  const values = sh.getRange(2, 1, last - 1, HR_TABS.Invoices.length).getValues();
  const statusCol = HR_TABS.Invoices.indexOf('Status') + 1;
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][1]).trim() === invNo) {
      sh.getRange(i + 2, statusCol).setValue('PAID');
      return json_({ ok: true, invoiceNo: invNo });
    }
  }
  return json_({ ok: false, error: 'Invoice not found' });
}

function HR_makeInvoiceNo_() {
  const ymd  = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return 'INV-' + ymd + '-' + rand;
}

/* ========================== PHASE 2 HR WRITES ======================= */

const NOTE_SEP = '[[NOTE]]';

function HR_withScriptLock_(work) {
  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    lock.waitLock(10000);
    locked = true;
    return work();
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    if (locked) lock.releaseLock();
  }
}

function HR_readNotes_(raw) {
  const str = String(raw || '').trim();
  if (!str) return [];
  return str.split(NOTE_SEP).map(s => {
    try { return JSON.parse(s); } catch (e) { return null; }
  }).filter(Boolean);
}

function HR_writeNotes_(notes) {
  return notes.map(n => JSON.stringify(n)).join(NOTE_SEP);
}

function HR_findSignupRow_(email) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Signups');
  if (!sh) return { sh: null, row: -1 };
  const last = sh.getLastRow();
  if (last < 2) return { sh, row: -1 };
  const emails = sh.getRange(2, 4, last - 1, 1).getValues();
  const target = String(email || '').trim().toLowerCase();
  for (let i = 0; i < emails.length; i++) {
    if (String(emails[i][0] || '').trim().toLowerCase() === target) return { sh, row: i + 2 };
  }
  return { sh, row: -1 };
}

function HR_noteAdd_(d) {
  if (String(d.key || '').trim() !== DASHBOARD_KEY) return json_({ ok: false, error: 'Unauthorized' });
  return HR_withScriptLock_(function () {
    const found = HR_findSignupRow_(d.email);
    if (!found.sh || found.row < 0) return json_({ ok: false, error: 'Member not found' });
    const current = HR_readNotes_(found.sh.getRange(found.row, 6).getValue());
    // The current UI's delete-note undo sends the original object as `note`.
    const restore = d.note && typeof d.note === 'object' ? d.note : null;
    const note = restore ? {
      id: String(restore.id || ('n_' + Utilities.getUuid().slice(0, 12))),
      text: String(restore.text || d.text || '').trim(),
      by: String(restore.by || d.by || 'HR'),
      ts: String(restore.ts || new Date().toISOString())
    } : {
      id: 'n_' + Utilities.getUuid().slice(0, 12),
      text: String(d.text || '').trim(),
      by: String(d.by || 'HR'),
      ts: new Date().toISOString()
    };
    if (!note.text) return json_({ ok: false, error: 'Note text is required' });
    current.push(note);
    found.sh.getRange(found.row, 6).setValue(HR_writeNotes_(current));
    return json_({ ok: true, note });
  });
}

function HR_noteEdit_(d) {
  if (String(d.key || '').trim() !== DASHBOARD_KEY) return json_({ ok: false, error: 'Unauthorized' });
  return HR_withScriptLock_(function () {
    const found = HR_findSignupRow_(d.email);
    if (!found.sh || found.row < 0) return json_({ ok: false, error: 'Member not found' });
    const notes = HR_readNotes_(found.sh.getRange(found.row, 6).getValue());
    const note = notes.find(n => n.id === d.noteId);
    if (!note) return json_({ ok: false, error: 'Note not found' });
    const text = String(d.text || '').trim();
    if (!text) return json_({ ok: false, error: 'Note text is required' });
    note.text = text;
    found.sh.getRange(found.row, 6).setValue(HR_writeNotes_(notes));
    return json_({ ok: true });
  });
}

function HR_noteDelete_(d) {
  if (String(d.key || '').trim() !== DASHBOARD_KEY) return json_({ ok: false, error: 'Unauthorized' });
  return HR_withScriptLock_(function () {
    const found = HR_findSignupRow_(d.email);
    if (!found.sh || found.row < 0) return json_({ ok: false, error: 'Member not found' });
    const notes = HR_readNotes_(found.sh.getRange(found.row, 6).getValue());
    const remaining = notes.filter(n => n.id !== d.noteId);
    if (remaining.length === notes.length) return json_({ ok: false, error: 'Note not found' });
    found.sh.getRange(found.row, 6).setValue(HR_writeNotes_(remaining));
    return json_({ ok: true });
  });
}

function HR_memberDelete_(d) {
  if (String(d.key || '').trim() !== DASHBOARD_KEY) return json_({ ok: false, error: 'Unauthorized' });
  return HR_withScriptLock_(function () {
    const found = HR_findSignupRow_(d.email);
    if (!found.sh || found.row < 0) return json_({ ok: false, error: 'Member not found' });
    const headers = TABS.Signups;
    const values = found.sh.getRange(found.row, 1, 1, headers.length).getValues()[0];
    const member = {};
    headers.forEach((header, i) => { member[header] = values[i]; });
    found.sh.deleteRow(found.row);

    const actions = HR_getTab_('Actions');
    const last = actions.getLastRow();
    if (last >= 2) {
      const emailCol = HR_TABS.Actions.indexOf('Member Email') + 1;
      const rows = actions.getRange(2, emailCol, last - 1, 1).getValues();
      const target = String(d.email || '').trim().toLowerCase();
      const removeRows = [];
      rows.forEach((row, i) => {
        if (String(row[0] || '').trim().toLowerCase() === target) removeRows.push(i + 2);
      });
      removeRows.reverse().forEach(row => actions.deleteRow(row));
    }
    return json_({ ok: true, member });
  });
}

function HR_memberRestore_(d) {
  if (String(d.key || '').trim() !== DASHBOARD_KEY) return json_({ ok: false, error: 'Unauthorized' });
  return HR_withScriptLock_(function () {
    const member = d.member || {};
    const email = String(member.Email || '').trim();
    if (!email) return json_({ ok: false, error: 'Member email is required' });
    const sh = getTab_('Signups');
    const values = [
      member.Timestamp || new Date(), member.Name || '', member.Education || '', email,
      member['Why they want to join'] || '', member.Notes || ''
    ];
    sh.appendRow(clean_(values));
    return json_({ ok: true });
  });
}

function HR_actionAdd_(d) {
  if (String(d.key || '').trim() !== DASHBOARD_KEY) return json_({ ok: false, error: 'Unauthorized' });
  return HR_withScriptLock_(function () {
    const marks = Array.isArray(d.marks) ? d.marks : [];
    if (!marks.length) return json_({ ok: false, error: 'No action recipients' });
    const sh = HR_getTab_('Actions');
    const now = new Date();
    const ids = marks.map(mark => 'a_' + Utilities.getUuid().slice(0, 12));
    marks.forEach((mark, i) => {
      sh.appendRow(clean_([
        now, ids[i], String(d.actionName || ''), d.actionDate || '',
        String((mark && mark.email) || '').trim().toLowerCase(), String((mark && mark.name) || ''),
        String(d.mark || ''), String(d.note || ''), String(d.by || 'HR')
      ]));
    });
    return json_({ ok: true, ids });
  });
}

function HR_actionDelete_(d) {
  if (String(d.key || '').trim() !== DASHBOARD_KEY) return json_({ ok: false, error: 'Unauthorized' });
  return HR_withScriptLock_(function () {
    const sh = HR_getTab_('Actions');
    const last = sh.getLastRow();
    if (last < 2) return json_({ ok: false, error: 'Action not found' });
    const idCol = HR_TABS.Actions.indexOf('ID') + 1;
    const ids = sh.getRange(2, idCol, last - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0] || '') === String(d.id || '')) {
        sh.deleteRow(i + 2);
        return json_({ ok: true });
      }
    }
    return json_({ ok: false, error: 'Action not found' });
  });
}

function HR_boardNoteAdd_(d) {
  if (String(d.key || '').trim() !== DASHBOARD_KEY) return json_({ ok: false, error: 'Unauthorized' });
  return HR_withScriptLock_(function () {
    const members = Array.isArray(d.members) ? d.members : [];
    if (!members.length) return json_({ ok: false, error: 'No board members selected' });
    const sh = HR_getTab_('BoardNotes');
    const now = new Date();
    const restore = d.note && typeof d.note === 'object' ? d.note : null;
    const ids = members.map((member, i) => restore && i === 0 && restore.id
      ? String(restore.id) : 'bn_' + Utilities.getUuid().slice(0, 12));
    members.forEach((member, i) => {
      sh.appendRow(clean_([
        restore && i === 0 && restore.ts ? new Date(restore.ts) : now,
        ids[i], String(member || ''), String(d.category || 'Note'), String(d.text || ''), String(d.by || 'HR')
      ]));
    });
    return json_({ ok: true, ids });
  });
}

function HR_boardNoteDelete_(d) {
  if (String(d.key || '').trim() !== DASHBOARD_KEY) return json_({ ok: false, error: 'Unauthorized' });
  return HR_withScriptLock_(function () {
    const sh = HR_getTab_('BoardNotes');
    const last = sh.getLastRow();
    if (last < 2) return json_({ ok: false, error: 'Board note not found' });
    const idCol = HR_TABS.BoardNotes.indexOf('ID') + 1;
    const ids = sh.getRange(2, idCol, last - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0] || '') === String(d.id || '')) {
        sh.deleteRow(i + 2);
        return json_({ ok: true });
      }
    }
    return json_({ ok: false, error: 'Board note not found' });
  });
}
