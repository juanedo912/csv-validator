const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { validateCsvFile } = require("../src/validate");

function createTempCsv(contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "csv-validator-"));
  const filePath = path.join(dir, "input.csv");
  const reportPath = path.join(dir, "report.json");
  fs.writeFileSync(filePath, contents, "utf8");
  return { filePath, reportPath };
}

test("falla si falta columna email", () => {
  const { filePath, reportPath } = createTempCsv("name\nAlice\n");
  const { report, fatal } = validateCsvFile(filePath, { reportPath });

  assert.equal(fatal, true);
  assert.equal(report.errors.length, 1);
  assert.equal(report.errors[0].errorCode, "MISSING_EMAIL_COLUMN");
});

test("detecta email invalido", () => {
  const { filePath, reportPath } = createTempCsv("email\nnot-an-email\n");
  const { report } = validateCsvFile(filePath, { reportPath });

  assert.equal(report.invalid, 1);
  assert.equal(report.errors.length, 1);
  assert.equal(report.errors[0].errorCode, "INVALID_EMAIL");
});

test("detecta duplicados", () => {
  const { filePath, reportPath } = createTempCsv(
    "email\nTest@Example.com\ntest@example.com\n"
  );
  const { report } = validateCsvFile(filePath, { reportPath });

  assert.equal(report.valid, 1);
  assert.equal(report.invalid, 1);
  assert.equal(report.errors.length, 1);
  assert.equal(report.errors[0].errorCode, "DUPLICATE_EMAIL");
});

test("ignora lineas vacias al final", () => {
  const { filePath, reportPath } = createTempCsv(
    "email\nuser@example.com\n\n"
  );
  const { report } = validateCsvFile(filePath, { reportPath });

  assert.equal(report.total, 1);
  assert.equal(report.valid, 1);
  assert.equal(report.invalid, 0);
  assert.equal(report.errors.length, 0);
});

test("acepta BOM en header email", () => {
  const { filePath, reportPath } = createTempCsv(
    "\ufeffemail\nuser@example.com\n"
  );
  const { report, fatal } = validateCsvFile(filePath, { reportPath });

  assert.equal(fatal, false);
  assert.equal(report.total, 1);
  assert.equal(report.valid, 1);
  assert.equal(report.invalid, 0);
});
