function doPost(e) {
  try {
    // 1) Leer body
    const raw = e && e.postData && e.postData.contents;
    if (!raw) return json_({ ok: false, error: "Missing body" });

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (_) {
      return json_({ ok: false, error: "Invalid JSON" });
    }

    // 2) Validar token (Script Properties)
    const expectedToken = PropertiesService.getScriptProperties().getProperty("csvv_2026_01_26_9f1c2a7b0d6e4c5a");
    if (!expectedToken) return json_({ ok: false, error: "Server misconfigured: missing SHEETS_TOKEN" });

    if (payload.token !== expectedToken) {
      return json_({ ok: false, error: "Unauthorized" });
    }

    // 3) Resolver spreadsheet + sheet
    const spreadsheetId = PropertiesService.getScriptProperties().getProperty("1ITO7yugKSt_e3BBNDmBqeC2c7KlSNS7zdn8txl777_A");
    const sheetName =
      PropertiesService.getScriptProperties().getProperty("csv-validator-reports") || "Reports";

    if (!spreadsheetId) return json_({ ok: false, error: "Server misconfigured: missing DEFAULT_SPREADSHEET_ID" });

    // 4) Normalizar campos (según tu Node payload)
    const timestamp = payload.timestamp || new Date().toISOString();
    const inputPath = payload.inputPath || "";
    const exitCode = Number(payload.exitCode);
    const report = payload.report ?? null;

    // 5) Escribir (con lock por concurrencia)
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const ss = SpreadsheetApp.openById(spreadsheetId);
      const sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);

      ensureHeader_(sheet);

      sheet.appendRow([
        new Date(timestamp),
        inputPath,
        exitCode,
        report ? JSON.stringify(report) : "",
      ]);
    } finally {
      lock.releaseLock();
    }

    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.stack ? err.stack : err) });
  }
}

function ensureHeader_(sheet) {
  const values = sheet.getRange(1, 1, 1, 4).getValues()[0];
  const empty = values.every(v => v === "" || v === null);
  if (empty) {
    sheet.getRange(1, 1, 1, 4).setValues([[
      "timestamp",
      "inputPath",
      "exitCode",
      "report_json"
    ]]);
  }
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
