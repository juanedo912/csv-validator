const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { main, parseCliArgs, validateCsvFile } = require("../src/validate");

function createTempCsv(contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "csv-validator-"));
  const filePath = path.join(dir, "input.csv");
  const reportPath = path.join(dir, "report.json");
  fs.writeFileSync(filePath, contents, "utf8");
  return { filePath, reportPath };
}

test("falla si falta columna email", () => {
  const { filePath, reportPath } = createTempCsv("name\nAlice\n");
  const { report, exitCode } = validateCsvFile(filePath, { reportPath });

  assert.equal(exitCode, 2);
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
  const { report, exitCode } = validateCsvFile(filePath, { reportPath });

  assert.equal(exitCode, 0);
  assert.equal(report.total, 1);
  assert.equal(report.valid, 1);
  assert.equal(report.invalid, 0);
});

test("parsea flags de CLI", () => {
  const args = parseCliArgs([
    "--input",
    "data/sample.csv",
    "--output",
    "out/custom.json",
  ]);

  assert.equal(args.inputPath, "data/sample.csv");
  assert.equal(args.outputPath, "out/custom.json");
});

test("usa argumento posicional si no hay flags", () => {
  const args = parseCliArgs(["data/sample.csv"]);

  assert.equal(args.inputPath, "data/sample.csv");
  assert.equal(args.outputPath, null);
});

test("respeta -- para argumentos posicionales", () => {
  const args = parseCliArgs(["--", "-data.csv"]);

  assert.equal(args.inputPath, "-data.csv");
  assert.equal(args.outputPath, null);
});

test("falla si --input no tiene valor", () => {
  assert.throws(
    () => parseCliArgs(["--input", "--output", "out/report.json"]),
    /Usage: missing value for --input/
  );
});

test("falla si --output no tiene valor", () => {
  assert.throws(
    () => parseCliArgs(["--output"]),
    /Usage: missing value for --output/
  );
});

test("csv valido retorna exit 0", () => {
  const { filePath, reportPath } = createTempCsv(
    "email\nuser@example.com\n"
  );
  const result = main(["--input", filePath, "--output", reportPath], {
    quiet: true,
  });

  assert.equal(result.exitCode, 0);
});

test("csv invalido retorna exit 2", () => {
  const { filePath, reportPath } = createTempCsv("email\nnot-an-email\n");
  const result = main(["--input", filePath, "--output", reportPath], {
    quiet: true,
  });

  assert.equal(result.exitCode, 2);
});

test("csv malformado retorna exit 1", () => {
  const { filePath } = createTempCsv('email\n"broken\n');
  const result = main(["--input", filePath], { quiet: true });

  assert.equal(result.exitCode, 1);
});

test("archivo inexistente retorna exit 1", () => {
  const missingPath = path.join(os.tmpdir(), "no-such-file.csv");
  const result = main(["--input", missingPath], { quiet: true });

  assert.equal(result.exitCode, 1);
});
