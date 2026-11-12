/**
 * HR / invoicing endpoints for hr.html.
 *
 * Reads:  GET  ?action=hr&key=<staff password>
 *         → { ok, emails: [...], invoices: [...], members: [...] }
 *
 * Writes: POST { type:'hr_email', key, recipients:[{email,name},…],
 *                subject, htmlBody, plainBody, sender:{name,email},
 *                invoice?:{ amount, currency, description } }
 *         POST { type:'hr_invoice_paid', key, invoiceNo }
 */

const HR_TABS = {
  Emails:   ['Timestamp','To Email','To Name','Subject','Body','Status','Error','Invoice No','Sent By','Sent By Email'],
  Invoices: ['Timestamp','Invoice No','To Email','To Name','Amount','Currency','Description','Status','Sent At']
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
      emails:  HR_readTab_('Emails'),
      invoices:HR_readTab_('Invoices')
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
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    return sh;
  }
  // Ensure every header exists (older sheets created before new columns were added)
  const cur = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), headers.length)).getValues()[0];
  let needUpdate = false;
  headers.forEach(function (h, i) { if (!cur[i]) needUpdate = true; });
  if (needUpdate) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
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