/**
 * HR / invoicing endpoints for hr.html.
 *
 * Reads:  GET  ?action=hr&key=<staff password>
 *         → { ok, emails: [...], invoices: [...] }
 *
 * Writes: POST { type:'hr_email', key, to, toName, subject, body,
 *                invoice?:{ amount, currency, description } }
 *         POST { type:'hr_invoice_paid', key, invoiceNo }
 *
 * Sending uses MailApp from the account that owns the script.
 * Sheet tabs auto-created: Emails, Invoices.
 */

const HR_TABS = {
  Emails: ['Timestamp', 'To Email', 'To Name', 'Subject', 'Body', 'Status', 'Error', 'Invoice No'],
  Invoices: ['Timestamp', 'Invoice No', 'To Email', 'To Name', 'Amount', 'Currency', 'Description', 'Status', 'Sent At']
};

function HR_getData_(providedKey) {
  if (String(providedKey || '').trim() !== DASHBOARD_KEY) {
    return json_({ ok: false, error: 'Unauthorized' });
  }
  try {
    return json_({
      ok: true,
      generatedAt: new Date().toISOString(),
      emails: HR_readTab_('Emails'),
      invoices: HR_readTab_('Invoices')
    });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function HR_readTab_(name) {
  const sh = HR_getTab_(name);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const values = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  const headers = HR_TABS[name];
  return values.map(function (row) {
    const o = {};
    headers.forEach(function (h, i) { o[h] = row[i]; });
    return o;
  });
}

function HR_getTab_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(HR_TABS[name]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HR_TABS[name].length).setFontWeight('bold');
  }
  return sh;
}

function HR_sendEmail_(d) {
  if (String(d.key || '').trim() !== DASHBOARD_KEY) {
    return json_({ ok: false, error: 'Unauthorized' });
  }
  const to      = String(d.to || '').trim();
  const toName  = String(d.toName || '').trim();
  const subject = String(d.subject || '').trim();
  const body    = String(d.body || '');

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return json_({ ok: false, error: 'Invalid recipient email' });
  if (!subject) return json_({ ok: false, error: 'Subject is required' });
  if (!body.trim()) return json_({ ok: false, error: 'Body is required' });

  // Optional invoice block
  const inv = d.invoice && typeof d.invoice === 'object' ? d.invoice : null;
  const amount = inv && Number(inv.amount) > 0 ? Number(inv.amount) : 0;
  const currency = inv && inv.currency ? String(inv.currency).trim().toUpperCase() : 'TND';
  const desc = inv && inv.description ? String(inv.description).trim() : '';
  const invoiceNo = amount > 0 ? HR_makeInvoiceNo_() : '';

  // Send
  let status = 'SENT';
  let errorMsg = '';
  try {
    MailApp.sendEmail({
      to: to,
      subject: subject,
      body: body,
      name: 'Algorithmic Trading Club'
    });
  } catch (err) {
    status = 'FAILED';
    errorMsg = String(err);
  }

  const now = new Date();

  // Log email
  HR_getTab_('Emails').appendRow(clean_([
    now, to, toName, subject, body.slice(0, 800), status, errorMsg, invoiceNo
  ]));

  // Log invoice (if any) — even a failed send is worth recording
  if (invoiceNo) {
    HR_getTab_('Invoices').appendRow(clean_([
      now, invoiceNo, to, toName, amount, currency, desc || subject,
      status === 'SENT' ? 'SENT' : 'FAILED', now
    ]));
  }

  return json_({
    ok: status === 'SENT',
    error: errorMsg,
    invoiceNo: invoiceNo || null
  });
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
    if (String(values[i][1]).trim() === invNo) {  // Invoice No is column 2
      sh.getRange(i + 2, statusCol).setValue('PAID');
      return json_({ ok: true, invoiceNo: invNo });
    }
  }
  return json_({ ok: false, error: 'Invoice not found' });
}

function HR_makeInvoiceNo_() {
  const ymd = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return 'INV-' + ymd + '-' + rand;
}