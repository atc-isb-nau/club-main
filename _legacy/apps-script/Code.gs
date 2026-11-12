const VALID_STAFF_CODES = ['3.14159', 'ATC-STAFF-2026'];

const TABS = {
  Signups: ['Timestamp', 'Name', 'Education', 'Email', 'Why they want to join'],
  Results: ['Timestamp', 'Name', 'Email', 'Education', 'Why they want to join', 'Game', 'Field', 'Score', 'Total', 'Result', 'Details']
};

function doGet(e) {
  const params = (e && e.parameter) || {};
  if (params.action === 'dashboard') return Dashboard_getData_(params.key);
  if (params.action === 'hr')        return HR_getData_(params.key);
  return json_({ ok: true, service: 'ATC club backend' });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const d = JSON.parse(e.postData.contents);

    // HR routes — key-authenticated, not visitor-rate-limited
    if (d.type === 'hr_email')        return HR_sendEmail_(d);
    if (d.type === 'hr_invoice_paid') return HR_markInvoicePaid_(d);

    // ...rest of existing doPost (signup / result) unchanged...
    const now = new Date();
    const bypass = typeof d.staffCode === 'string' && VALID_STAFF_CODES.indexOf(d.staffCode.trim()) !== -1;
    const subtype = d.type === 'result'
      ? (String(d.game || '') + '-' + String(d.field || 'none')).toLowerCase()
      : '';
    const rate = bypass ? { allowed: true } : canWriteDeviceEvent_(d.type, d.deviceId || 'anonymous', subtype);
    if (!rate.allowed) {
      return json_({ ok: false, error: rate.message });
    }

    if (d.type === 'signup') {
      const email = String(d.email || '').trim();
      if (emailExists_(email)) {
        return json_({ ok: false, error: 'This email has already signed up.' });
      }
      getTab_('Signups').appendRow(clean_([now, d.name, d.education, email, d.motivation || '']));
    } else if (d.type === 'result') {
      getTab_('Results').appendRow(clean_([
        now, d.name, d.email, d.education, d.motivation || '', d.game, d.field,
        d.score, d.total, d.result, d.details
      ]));
    } else {
      return json_({ ok: false, error: 'Unknown type' });
    }
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Case-insensitive duplicate-email check against the Signups tab.
 * Linear scan — fine at club-stand scale. If the sheet grows large,
 * replace with an index (e.g. a separate "Emails" tab used as a Set).
 */
function emailExists_(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return false;
  const sh = getTab_('Signups');
  const last = sh.getLastRow();
  if (last < 2) return false;
  const emails = sh.getRange(2, 4, last - 1, 1).getValues(); // column D = Email
  for (var i = 0; i < emails.length; i++) {
    if (String(emails[i][0] || '').trim().toLowerCase() === normalized) return true;
  }
  return false;
}

/**
 * Per-device rate limiting.
 *   signup → max 3 / 24h per device (no subtype)
 *   result → max 1 / 24h per (device, game, field) combination
 */
function canWriteDeviceEvent_(type, deviceId, subtype) {
  const props = PropertiesService.getScriptProperties();
  const maxPerDay = type === 'signup' ? 3 : 1;
  const windowMs = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const prefix = 'atc_' + type + '_' + (subtype || 'none') + '_' + String(deviceId || 'anonymous') + '_';
  const all = props.getKeys().filter(function (key) {
    return key.indexOf(prefix) === 0;
  });
  const recent = [];
  all.forEach(function (key) {
    const ts = Number(props.getProperty(key));
    if (!isNaN(ts) && now - ts < windowMs) {
      recent.push(ts);
    } else {
      props.deleteProperty(key);
    }
  });
  if (recent.length >= maxPerDay) {
    return { allowed: false, message: 'This device has already sent ' + maxPerDay + ' ' + type + ' event(s) in the last 24 hours.' };
  }
  const stamp = String(now) + '_' + Math.random().toString(36).slice(2, 8);
  props.setProperty(prefix + stamp, String(now));
  return { allowed: true };
}

function getTab_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(TABS[name]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, TABS[name].length).setFontWeight('bold');
  } else {
    // Add headers introduced after an existing sheet was first created.
    const headers = TABS[name];
    const current = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), headers.length)).getValues()[0];
    headers.forEach(function (header, i) {
      if (!current[i]) sh.getRange(1, i + 1).setValue(header).setFontWeight('bold');
    });
  }
  return sh;
}

// Stops visitor-typed text from being run as a spreadsheet formula.
function clean_(row) {
  return row.map(function (v) {
    return (typeof v === 'string' && /^[=+\-@]/.test(v)) ? "'" + v : v;
  });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}