require('dotenv').config()

const fs = require('node:fs')
const path = require('node:path')
const { parse } = require('csv-parse/sync')

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function parseCliArgs(argv) {
  const args = {
    inputPath: null,
    outputPath: null,
    strict: false,
    json: false,
    syncSheets: false,
  }
  const tokens = Array.isArray(argv) ? argv.slice() : []
  let inputFlagSeen = false
  let positionalInput = null

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token === '--') {
      const remaining = tokens.slice(index + 1)
      for (const positional of remaining) {
        if (!positionalInput) {
          positionalInput = positional
          continue
        }
      }
      break
    }
    if (token === '--input') {
      const next = tokens[index + 1]
      if (!next || next.startsWith('-')) {
        const error = new Error('Usage: missing value for --input')
        error.code = 'USAGE'
        throw error
      }
      inputFlagSeen = true
      args.inputPath = next
      index += 1
      continue
    }
    if (token === '--output') {
      const next = tokens[index + 1]
      if (!next || next.startsWith('-')) {
        const error = new Error('Usage: missing value for --output')
        error.code = 'USAGE'
        throw error
      }
      args.outputPath = next
      index += 1
      continue
    }
    if (token === '--strict') {
      args.strict = true
      continue
    }
    if (token === '--json') {
      args.json = true
      continue
    }
    if (token === '--sync-sheets') {
      args.syncSheets = true
      continue
    }
    if (!token.startsWith('-') && !positionalInput) {
      positionalInput = token
    }
  }

  if (!inputFlagSeen && positionalInput) {
    args.inputPath = positionalInput
  }

  return args
}

function buildError(rowNumber, email, errorCode, message) {
  return {
    rowNumber,
    email: email || null,
    errorCode,
    message,
  }
}

function writeReport(report, reportPath) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')
}

function validateCsvFile(filePath, options = {}) {
  const reportPath = options.reportPath || path.join(process.cwd(), 'out', 'report.json')
  const raw = fs.readFileSync(filePath, 'utf8')
  let headers = null
  let records = []

  try {
    records = parse(raw, {
      columns: (header) => {
        if (header.length > 0 && header[0].startsWith('\ufeff')) {
          header[0] = header[0].slice(1)
        }
        headers = header
        return header
      },
      skip_empty_lines: true,
      trim: true,
    })
  } catch (error) {
    const parseError = new Error(`CSV malformado: ${error.message}`)
    parseError.cause = error
    throw parseError
  }

  if (!headers || !headers.includes('email')) {
    const report = {
      total: records.length,
      valid: 0,
      invalid: records.length,
      errors: [buildError(1, null, 'MISSING_EMAIL_COLUMN', 'Missing required column: email')],
    }
    writeReport(report, reportPath)
    return { report, exitCode: 2 }
  }

  const errors = []
  const seenEmails = new Set()
  let valid = 0

  for (let index = 0; index < records.length; index += 1) {
    const rowNumber = index + 2
    const email = records[index].email

    if (!email || !EMAIL_REGEX.test(email)) {
      errors.push(buildError(rowNumber, email || null, 'INVALID_EMAIL', 'Email is not valid'))
      continue
    }

    const normalized = email.toLowerCase()
    if (seenEmails.has(normalized)) {
      errors.push(buildError(rowNumber, email, 'DUPLICATE_EMAIL', 'Email is duplicated'))
      continue
    }

    seenEmails.add(normalized)
    valid += 1
  }

  const report = {
    total: records.length,
    valid,
    invalid: records.length - valid,
    errors,
  }

  writeReport(report, reportPath)
  return { report, exitCode: errors.length > 0 ? 2 : 0 }
}

async function main(argv, options = {}) {
  const logger = options.logger || console
  const quiet = options.quiet === true
  const out = quiet ? { log() {}, error() {} } : logger
  let inputPath = null
  let outputPath = null
  let strict = false
  let json = false
  let syncSheets = false

  try {
    ;({ inputPath, outputPath, strict, json, syncSheets } = parseCliArgs(argv))
  } catch (error) {
    out.error(error.message)
    return { exitCode: 1 }
  }

  if (!inputPath) {
    out.error('Usage: node src/validate.js [--input <csv-file>] [--output <report-path>]')
    return { exitCode: 1 }
  }

  try {
    const { report, exitCode } = validateCsvFile(inputPath, {
      reportPath: outputPath || undefined,
    })

    if (syncSheets) {
      const url = process.env.SHEETS_WEBAPP_URL
      const token = process.env.SHEETS_TOKEN

      if (!url || !token) {
        out.error('Missing env vars: SHEETS_WEBAPP_URL and/or SHEETS_TOKEN')
        return { exitCode: 1 }
      }

      const res = await fetch(`${url}?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timestamp: new Date().toISOString(),
          inputPath,
          exitCode,
          report,
        }),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok || !data || data.ok !== true) {
        out.error('Sheets sync failed')
        return { exitCode: 1 }
      }
    }

    if (json) {
      out.log(JSON.stringify(report))
    } else {
      out.log(`Total: ${report.total}`)
      out.log(`Valid: ${report.valid}`)
      out.log(`Invalid: ${report.invalid}`)
      out.log(`Errors: ${report.errors.length}`)
      if (strict && report.invalid > 0) {
        out.log('STRICT MODE: failing build')
      }
    }
    return { exitCode, report }
  } catch (error) {
    if (error.code === 'ENOENT') {
      out.error(`Archivo no existe: ${inputPath}`)
    } else {
      out.error(error.message || 'CSV malformado')
    }
    return { exitCode: 1 }
  }
}

if (require.main === module) {
  ;(async () => {
    const { exitCode } = await main(process.argv.slice(2))
    process.exit(exitCode)
  })()
}

module.exports = { main, parseCliArgs, validateCsvFile }
