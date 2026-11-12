/**
 * ONE-TIME DB AUDIT — safe to run repeatedly, safe to forget after.
 * Never moves, deletes, or rewrites existing headers or data.
 * Only appends missing headers at the end of row 1, right of the last used column.
 *
 * Run from Apps Script editor: setupDatabaseOnce()
 * View → Logs for the full audit trail.
 */
function setupDatabaseOnce() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log('═══ ATC DB AUDIT ═══');
  Logger.log('Sheet: ' + ss.getName() + '  ·  ' + new Date().toISOString());

  Logger.log('\n[1/2] CURRENT HEADERS');
  ss.getSheets().forEach(sh => {
    const last = Math.max(sh.getLastColumn(), 1);
    const hdrs = sh.getRange(1, 1, 1, last).getValues()[0];
    Logger.log('  ' + sh.getName() + ' (' + sh.getLastRow() + ' rows): ' + JSON.stringify(hdrs));
  });

  Logger.log('\n[2/2] HEADER VERIFICATION (append-only)');
  ensureHeaders_(ss, 'Signups', ['Timestamp','Name','Education','Email','Why they want to join','Notes']);
  ensureHeaders_(ss, 'Results', ['Timestamp','Name','Email','Education','Why they want to join','Game','Field','Score','Total','Result','Details']);
  ensureHeaders_(ss, 'Actions', ['Timestamp','ID','Action Name','Action Date','Member Email','Member Name','Mark','Note','By']);
  ensureHeaders_(ss, 'BoardNotes', ['Timestamp','ID','Board Member','Category','Note','By']);
  ensureHeaders_(ss, 'Emails', ['Timestamp','To Email','To Name','Subject','Body','Status','Error','Invoice No','Sent By','Sent By Email']);
  ensureHeaders_(ss, 'Invoices', ['Timestamp','Invoice No','To Email','To Name','Amount','Currency','Description','Status','Sent At']);
  if (ss.getSheetByName('unimail')) {
    ensureHeaders_(ss, 'unimail', ['Email','Timestamp','Language']);
  } else {
    Logger.log('  (unimail lives in a separate spreadsheet — handled by uni.gs)');
  }
  Logger.log('\nDONE. No data moved. No rows deleted. No headers rewritten.');
}

function ensureHeaders_(ss, name, required) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, required.length).setValues([required]).setFontWeight('bold');
    sh.setFrozenRows(1);
    Logger.log('  CREATED  ' + name);
    return;
  }
  const last = Math.max(sh.getLastColumn(), required.length);
  const cur  = sh.getRange(1, 1, 1, last).getValues()[0];
  const lower = cur.map(v => String(v || '').trim().toLowerCase());
  const missing = required.filter(h => lower.indexOf(h.toLowerCase()) === -1);
  if (!missing.length) {
    Logger.log('  OK       ' + name + ' — ' + required.length + ' headers present');
    return;
  }
  const start = sh.getLastColumn() + 1;
  missing.forEach((h, i) => sh.getRange(1, start + i).setValue(h).setFontWeight('bold'));
  Logger.log('  APPENDED ' + name + ' → ' + missing.join(', '));
}
