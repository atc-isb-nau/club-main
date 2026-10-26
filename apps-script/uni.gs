
var UNI_SPREADSHEET_ID     = "1FQJgt1ryyqBoaw5fZInjdSoVVuLqgerQ5XsvVrs12Gw";
var UNI_SHEET_NAME         = "unimail";
var UNI_GROUP_URL_FALLBACK = "https://chat.whatsapp.com/CraYVK5ZPRJEVBtT9PE9dw";
var UNI_LINK_KEY           = "atc-isb-2026";   // must match LINK_KEY in the HTML
var UNI_DOMAIN_KEYWORDS    = ["isb", "iit", "rnu", "nau", "npu"];
var UNI_RATE_WINDOW_SECONDS = 600;
var UNI_RATE_MAX_ATTEMPTS   = 5;

/* ============================== ROUTED ENTRY ======================== */

function uniDoPost(e) {
  try {
    var body = uniParseBody_(e);
    if (!body) return uniJson_({ ok: false, code: "INVALID" });
    if (body.website) return uniJson_({ ok: false, code: "INVALID" }); // honeypot

    var email    = String(body.email || "").trim().toLowerCase();
    var language = String(body.language || "en").toLowerCase().slice(0, 2);
    if (["ar", "fr", "en"].indexOf(language) === -1) language = "en";

    if (!uniIsValidEmail_(email))    return uniJson_({ ok: false, code: "INVALID" });
    if (!uniIsAllowedDomain_(email)) return uniJson_({ ok: false, code: "DOMAIN" });
    if (uniIsRateLimited_(email))    return uniJson_({ ok: false, code: "RATE" });

    var existing = uniRecordEmail_(email, language);
    var groupUrl = uniGetGroupUrl_();
    var token    = groupUrl ? uniEncodeLink_(groupUrl) : "";

    return uniJson_({ ok: true, existing: existing, token: token });
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return uniJson_({ ok: false, code: "FAILED" });
  }
}

function uniDoGet(e) {
  return uniJson_({
    ok: true,
    service: "atc-unimail",
    sheet: UNI_SHEET_NAME,
    configured: !!uniGetGroupUrl_(),
    time: new Date().toISOString()
  });
}

/* ============================== HELPERS ============================= */

function uniParseBody_(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) return null;
    var parsed = JSON.parse(e.postData.contents);
    return (parsed && typeof parsed === "object") ? parsed : null;
  } catch (_) {
    return null;
  }
}

function uniJson_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function uniIsValidEmail_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;
}

function uniIsAllowedDomain_(email) {
  var domain = email.split("@")[1] || "";
  for (var i = 0; i < UNI_DOMAIN_KEYWORDS.length; i++) {
    if (domain.indexOf(UNI_DOMAIN_KEYWORDS[i]) !== -1) return true;
  }
  return false;
}

function uniIsRateLimited_(email) {
  var cache = CacheService.getScriptCache();
  var key = "uni:rl:" + email;               // "uni:" prefix avoids any collision
  var n = Number(cache.get(key) || 0);
  if (n >= UNI_RATE_MAX_ATTEMPTS) return true;
  cache.put(key, String(n + 1), UNI_RATE_WINDOW_SECONDS);
  return false;
}

function uniRecordEmail_(email, language) {
  var sheet = uniGetSheet_();
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var last = sheet.getLastRow();
    if (last > 1) {
      var col = sheet.getRange(2, 1, last - 1, 1).getValues();
      for (var i = 0; i < col.length; i++) {
        if (String(col[i][0]).trim().toLowerCase() === email) return true;
      }
    }
    sheet.appendRow([email, new Date(), language]);
    return false;
  } finally {
    lock.releaseLock();
  }
}

function uniGetSheet_() {
  var ss = UNI_SPREADSHEET_ID
    ? SpreadsheetApp.openById(UNI_SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("No spreadsheet. Set UNI_SPREADSHEET_ID or bind this script.");

  var sheet = ss.getSheetByName(UNI_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(UNI_SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["Email", "Timestamp", "Language"]);
    sheet.getRange(1, 1, 1, 3).setFontWeight("bold");
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 260);
  }
  return sheet;
}

function uniGetGroupUrl_() {
  var prop = "";
  try {
    prop = PropertiesService.getScriptProperties().getProperty("GROUP_URL") || "";
  } catch (_) {}
  return (prop || UNI_GROUP_URL_FALLBACK || "").trim();
}

function uniEncodeLink_(url) {
  var bytes = Utilities.newBlob(url).getBytes();
  var out = new Array(bytes.length);
  for (var i = 0; i < bytes.length; i++) {
    out[i] = (bytes[i] ^ UNI_LINK_KEY.charCodeAt(i % UNI_LINK_KEY.length)) & 0xff;
  }
  return Utilities.base64Encode(out);
}

/* ============================== SETUP / TESTS ======================= */

function uniSetupSheet() {
  var sheet = uniGetSheet_();
  Logger.log("Ready: " + sheet.getName() + " (" + sheet.getLastRow() + " rows)");
}

function uniTestSubmission() {
  var res = uniDoPost({
    postData: {
      contents: JSON.stringify({
        email: "student@isb.rnu.tn",
        language: "en",
        website: ""
      })
    }
  });
  Logger.log(res.getContent());
}

function uniSetGroupUrl() {
  PropertiesService.getScriptProperties().setProperty("GROUP_URL", UNI_GROUP_URL_FALLBACK);
  Logger.log("GROUP_URL saved.");
}