const fs = require("node:fs");
const path = require("node:path");
const { parse } = require("csv-parse/sync");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function buildError(rowNumber, email, errorCode, message) {
  return {
    rowNumber,
    email: email || null,
    errorCode,
    message,
  };
}

function writeReport(report, reportPath) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
}

function validateCsvFile(filePath, options = {}) {
  const reportPath =
    options.reportPath || path.join(process.cwd(), "out", "report.json");
  const raw = fs.readFileSync(filePath, "utf8");
  let headers = null;
  let records = [];

  try {
    records = parse(raw, {
      columns: (header) => {
        headers = header;
        return header;
      },
      skip_empty_lines: true,
      trim: true,
    });
  } catch (error) {
    const parseError = new Error(`CSV malformado: ${error.message}`);
    parseError.cause = error;
    throw parseError;
  }

  if (!headers || !headers.includes("email")) {
    const report = {
      total: records.length,
      valid: 0,
      invalid: records.length,
      errors: [
        buildError(
          1,
          null,
          "MISSING_EMAIL_COLUMN",
          "Missing required column: email"
        ),
      ],
    };
    writeReport(report, reportPath);
    return { report, fatal: true };
  }

  const errors = [];
  const seenEmails = new Set();
  let valid = 0;

  for (let index = 0; index < records.length; index += 1) {
    const rowNumber = index + 2;
    const email = records[index].email;

    if (!email || !EMAIL_REGEX.test(email)) {
      errors.push(
        buildError(
          rowNumber,
          email || null,
          "INVALID_EMAIL",
          "Email is not valid"
        )
      );
      continue;
    }

    const normalized = email.toLowerCase();
    if (seenEmails.has(normalized)) {
      errors.push(
        buildError(
          rowNumber,
          email,
          "DUPLICATE_EMAIL",
          "Email is duplicated"
        )
      );
      continue;
    }

    seenEmails.add(normalized);
    valid += 1;
  }

  const report = {
    total: records.length,
    valid,
    invalid: records.length - valid,
    errors,
  };

  writeReport(report, reportPath);
  return { report, fatal: false };
}

if (require.main === module) {
  const filePath = process.argv[2];

  if (!filePath) {
    console.error("Usage: node src/validate.js <csv-file>");
    process.exitCode = 1;
  } else {
    try {
      const { report, fatal } = validateCsvFile(filePath);
      console.log(`Total: ${report.total}`);
      console.log(`Valid: ${report.valid}`);
      console.log(`Invalid: ${report.invalid}`);
      console.log(`Errors: ${report.errors.length}`);
      if (fatal) {
        process.exitCode = 1;
      }
    } catch (error) {
      if (error.code === "ENOENT") {
        console.error(`Archivo no existe: ${filePath}`);
      } else {
        console.error(error.message || "CSV malformado");
      }
      process.exitCode = 1;
    }
  }
}

module.exports = { validateCsvFile };
