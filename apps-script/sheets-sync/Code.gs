function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents;
    if (!raw) return json_({ ok: false, error: "Missing body" });

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (_) {
      return json_({ ok: false, error: "Invalid JSON" });
    }

    const props = PropertiesService.getScriptProperties();

    // Token
    const expectedToken = props.getProperty("SHEETS_TOKEN");
    if (!expectedToken) return json_({ ok: false, error: "Server misconfigured: missing SHEETS_TOKEN" });
    if (payload.token !== expectedToken) return json_({ ok: false, error: "Unauthorized" });

    // Destination (multi-sheet)
    const spreadsheetId = payload.spreadsheetId || props.getProperty("DEFAULT_SPREADSHEET_ID");
    const sheetName = payload.sheetName || props.getProperty("DEFAULT_SHEET_NAME") || "runs";

    if (!spreadsheetId) return json_({ ok: false, error: "Missing spreadsheetId (and no DEFAULT_SPREADSHEET_ID set)" });

    enforceAllowlist_(spreadsheetId);

    // Normalizar campos
    const timestamp = payload.timestamp || new Date().toISOString();
    const inputPath = payload.inputPath || "";
    const exitCode = Number(payload.exitCode);
    const report = payload.report ?? null;

    // Write (lock)
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const ss = SpreadsheetApp.openById(spreadsheetId);
      const sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);

      ensureHeader_(sheet);

      sheet.appendRow([
        new Date(timestamp),
        inputPath,
        report ? Number(report.total) : "",
        report ? Number(report.valid) : "",
        report ? Number(report.invalid) : "",
        exitCode,
      ]);
    } finally {
      lock.releaseLock();
    }

    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.stack ? err.stack : err) });
  }
}

function enforceAllowlist_(spreadsheetId) {
  const allow = PropertiesService.getScriptProperties().getProperty("ALLOWED_SPREADSHEET_IDS");
  if (!allow) return; // si no existe, permite todo
  const allowed = allow.split(",").map(s => s.trim()).filter(Boolean);
  if (!allowed.includes(spreadsheetId)) throw new Error("spreadsheetId not allowed");
}

function ensureHeader_(sheet) {
  const expected = ["timestamp", "inputPath", "total", "valid", "invalid", "exitCode"];
  const values = sheet.getRange(1, 1, 1, expected.length).getValues()[0];

  const isEmpty = values.every(v => v === "" || v === null);
  const matches = expected.every((h, i) => String(values[i] || "").trim() === h);

  if (isEmpty || !matches) {
    sheet.getRange(1, 1, 1, expected.length).setValues([expected]);
  }
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
