/*
  Applies the publication dates in docs/timestamps.csv to docs/GayComicsMetadata.csv,
  rewriting each matched comic's created_at as a unix timestamp.

  Usage:
    node scripts/updateComicDates.js                    # reads docs/timestamps.csv
    node scripts/updateComicDates.js --dry-run
    node scripts/updateComicDates.js other-dates.csv    # read a different date file
    node scripts/updateComicDates.js --csv path/to/other.csv

  docs/timestamps.csv looks like:

    ID,Month,Day,Year
    831,9,9,2025

  Month, day and year are all 1-indexed and read the way a human writes them --
  9 is September, not October. Columns are matched by header name, so any order
  (and any extra columns) is fine, and tabs work as well as commas.

  Rows whose id is missing from the metadata csv are reported and skipped; every
  other line in the csv is left byte-for-byte alone. Times land at local midnight,
  the same as docs/new.html.
*/

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const DATES = path.join(ROOT, 'docs/timestamps.csv')
const CREATED_AT = 3 // column index of created_at in the metadata csv

const rel = p => {
  const relative = path.relative(ROOT, p)
  return relative.startsWith('..') ? p : relative
}


// --- args -------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { csv: path.join(ROOT, 'docs/GayComicsMetadata.csv'), dates: DATES, dryRun: false }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--csv') opts.csv = path.resolve(argv[++i])
    else if (arg === '--dry-run' || arg === '-n') opts.dryRun = true
    else if (arg === '--help' || arg === '-h') opts.help = true
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`)
    else if (opts.dates === DATES) opts.dates = path.resolve(arg)
    else throw new Error(`Unexpected argument: ${arg}`)
  }

  return opts
}


// --- csv --------------------------------------------------------------------

// like a normal csv split, but also hands back where each field sits in the line
// so a single value can be swapped out without reformatting the rest of the row
function splitCsvLine(line, delimiter = ',') {
  const fields = []
  let value = ''
  let start = 0
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"' && inQuotes && line[i + 1] === '"') {
      value += '"'
      i++
    } else if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === delimiter && !inQuotes) {
      fields.push({ value, start, end: i })
      value = ''
      start = i + 1
    } else {
      value += char
    }
  }

  fields.push({ value, start, end: line.length })
  return fields
}

const replaceField = (line, field, value) => line.slice(0, field.start) + value + line.slice(field.end)


// --- date file --------------------------------------------------------------

function readDateFile(file) {
  const lines = fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))

  if (!lines.length) throw new Error(`${rel(file)} is empty`)

  const delimiter = lines[0].includes('\t') ? '\t' : ','
  const header = splitCsvLine(lines[0], delimiter).map(f => f.value.trim().toLowerCase())

  const columns = {
    id: header.findIndex(h => h === 'id' || h === 'comic' || h === 'comic id'),
    month: header.indexOf('month'),
    day: header.indexOf('day'),
    year: header.indexOf('year')
  }

  const missing = Object.entries(columns).filter(([, i]) => i < 0).map(([name]) => name)
  if (missing.length) throw new Error(`${rel(file)} is missing column${missing.length === 1 ? '' : 's'}: ${missing.join(', ')} (expected a header like "ID,Month,Day,Year")`)

  return lines.slice(1).map((line, i) => {
    const fields = splitCsvLine(line, delimiter)
    const cell = index => (fields[index]?.value ?? '').trim()

    return {
      line: i + 2,
      raw: line,
      id: cell(columns.id),
      month: cell(columns.month),
      day: cell(columns.day),
      year: cell(columns.year)
    }
  })
}

// month/day/year are 1-indexed as written: 9/9/2025 is September 9th, 2025
function toTimestamp({ month, day, year }) {
  const m = Number(month)
  const d = Number(day)
  const y = Number(year)

  if (![m, d, y].every(Number.isInteger)) return { error: 'month, day and year must be whole numbers' }
  if (m < 1 || m > 12) return { error: `invalid month: ${month} (1 = January, 12 = December)` }
  if (d < 1 || d > 31) return { error: `invalid day: ${day}` }
  if (y < 1989 || y > 2100) return { error: `invalid year: ${year}` }

  const date = new Date(y, m - 1, d)
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return { error: `${y}-${month}-${day} is not a real date` }
  }

  return { seconds: Math.floor(date.getTime() / 1000) }
}

const formatDate = seconds => new Date(seconds * 1000).toLocaleDateString('en-CA', {
  year: 'numeric', month: 'short', day: 'numeric'
})


// --- main -------------------------------------------------------------------

function main() {
  const opts = parseArgs(process.argv.slice(2))

  if (opts.help) {
    console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace('/*', '').trim())
    return
  }

  if (!fs.existsSync(opts.dates)) {
    throw new Error(`No date file at ${rel(opts.dates)} -- create it with an "ID,Month,Day,Year" header, or pass one as an argument`)
  }

  console.log(`reading dates from ${rel(opts.dates)}\n`)
  const dates = readDateFile(opts.dates)
  const raw = fs.readFileSync(opts.csv, 'utf8')
  const eol = raw.endsWith('\n') ? '\n' : ''
  const lines = raw.replace(/\n+$/, '').split('\n')

  // id -> line number, from the metadata csv
  const lineById = new Map()
  lines.forEach((line, i) => {
    if (i === 0) return
    const id = splitCsvLine(line)[0]?.value.trim()
    if (id) lineById.set(id, i)
  })

  const updated = []
  const unchanged = []
  const problems = []
  const seen = new Set()

  for (const entry of dates) {
    if (!entry.id) {
      problems.push(`line ${entry.line}: no id`)
      continue
    }

    if (seen.has(entry.id)) problems.push(`line ${entry.line}: id ${entry.id} listed more than once, last one wins`)
    seen.add(entry.id)

    const index = lineById.get(entry.id)
    if (index === undefined) {
      problems.push(`line ${entry.line}: id ${entry.id} is not in ${rel(opts.csv)}`)
      continue
    }

    const { seconds, error } = toTimestamp(entry)
    if (error) {
      problems.push(`line ${entry.line}: ${error}`)
      continue
    }

    const fields = splitCsvLine(lines[index])
    const before = fields[CREATED_AT]?.value.trim()
    const title = fields[1]?.value

    if (before === String(seconds)) {
      unchanged.push(`#${entry.id} ${title}`)
      continue
    }

    lines[index] = replaceField(lines[index], fields[CREATED_AT], String(seconds))
    updated.push(`#${entry.id} ${title}: ${before ? formatDate(Number(before)) : '(blank)'} -> ${formatDate(seconds)}  [${seconds}]`)
  }

  if (updated.length) console.log(`${updated.length} date${updated.length === 1 ? '' : 's'} to update:\n${updated.map(u => `  ${u}`).join('\n')}`)
  if (unchanged.length) console.log(`\n${unchanged.length} already correct: ${unchanged.join(', ')}`)
  if (problems.length) console.log(`\n${problems.length} problem${problems.length === 1 ? '' : 's'}:\n${problems.map(p => `  ${p}`).join('\n')}`)

  if (!updated.length) {
    console.log('\nNothing to write.')
    return
  }

  if (opts.dryRun) {
    console.log('\n(dry run -- nothing written)')
    return
  }

  fs.writeFileSync(opts.csv, lines.join('\n') + eol)
  console.log(`\nwrote ${rel(opts.csv)}`)
}

try {
  main()
} catch (err) {
  console.error(err.message)
  process.exit(1)
}
