const DASHBOARD_KEY = '3.14159';
function Dashboard_getData_(providedKey) {
  if (String(providedKey || '').trim() !== DASHBOARD_KEY) {
    return json_({ ok: false, error: 'Unauthorized' });
  }
  try {
    return json_({
      ok: true,
      generatedAt: new Date().toISOString(),
      signups: Dashboard_readTab_('Signups'),
      results: Dashboard_readTab_('Results')
    });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function Dashboard_readTab_(name) {
  const sh = getTab_(name);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const lastCol = sh.getLastColumn();
  const values = sh.getRange(2, 1, last - 1, lastCol).getValues();
  const headers = TABS[name];
  return values.map(function (row) {
    const obj = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]] = row[i];
    }
    return obj;
  });
}