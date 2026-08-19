/*
  Adds any new images in docs/comics/GayComics to docs/GayComicsMetadata.csv
  (and, optionally, docs/rss.xml) -- the CLI version of docs/new.html.

  Usage:
    node scripts/addComics.js              # interactive, confirm each new comic
    node scripts/addComics.js --yes        # accept every default, no prompts
    node scripts/addComics.js --dry-run    # print what would be written, write nothing
    node scripts/addComics.js --no-rss     # skip rss.xml, only touch the CSV

  Options:
    --dir <path>   image folder    (default docs/comics/GayComics)
    --csv <path>   metadata csv    (default docs/GayComicsMetadata.csv)
    --rss <path>   rss feed        (default docs/rss.xml)

  A comic is "new" when its file name is not already in the csv. id and title come
  from the file name (`830.DeergirlChaser.jpg` -> id 830, "Deergirl Chaser"), the
  publication date defaults to the image's exif date (falling back to its mtime),
  and the description defaults to empty. All of those are editable at the prompt.
*/

const fs = require('fs')
const path = require('path')
const readline = require('readline')
const exif = require('exif-parser')

const ROOT = path.join(__dirname, '..')
const rel = p => {
  const relative = path.relative(ROOT, p)
  return relative.startsWith('..') ? p : relative
}
const IMAGE_EXT = /\.(jpe?g|png|gif|webp)$/i
const SITE = 'https://hausofdecline.ca'
const IMGS = 'https://imgs.hausofdecline.ca'


// --- args -------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    dir: path.join(ROOT, 'docs/comics/GayComics'),
    csv: path.join(ROOT, 'docs/GayComicsMetadata.csv'),
    rss: path.join(ROOT, 'docs/rss.xml'),
    yes: false,
    dryRun: false,
    writeRss: true
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dir') opts.dir = path.resolve(argv[++i])
    else if (arg === '--csv') opts.csv = path.resolve(argv[++i])
    else if (arg === '--rss') opts.rss = path.resolve(argv[++i])
    else if (arg === '--yes' || arg === '-y') opts.yes = true
    else if (arg === '--dry-run' || arg === '-n') opts.dryRun = true
    else if (arg === '--no-rss') opts.writeRss = false
    else if (arg === '--help' || arg === '-h') opts.help = true
    else throw new Error(`Unknown option: ${arg}`)
  }

  return opts
}


// --- csv --------------------------------------------------------------------

function parseCsvLine(line) {
  const result = []
  let value = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"' && inQuotes && line[i + 1] === '"') {
      value += '"'
      i++
    } else if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(value)
      value = ''
    } else {
      value += char
    }
  }

  result.push(value)
  return result
}

function readCsv(file) {
  const raw = fs.readFileSync(file, 'utf8')
  const [headerLine, ...lines] = raw.replace(/\n+$/, '').split('\n')
  const headers = headerLine.split(',').map(h => h.replaceAll('"', '').trim())

  const rows = lines.filter(l => l.trim()).map(line => {
    const values = parseCsvLine(line)
    return Object.fromEntries(headers.map((h, i) => [h, (values[i] ?? '').trim()]))
  })

  return { raw, headers, rows }
}

// quote only when the value needs it -- matches how the file is already written
function csvCell(value) {
  const str = String(value ?? '')
  return /[",\n]/.test(str) ? `"${str.replaceAll('"', '""')}"` : str
}

function csvRow(comic) {
  return [comic.id, comic.title, comic.fileName, comic.createdAt, comic.description].map(csvCell).join(',')
}


// --- file names -------------------------------------------------------------

function parseFileName(fileName) {
  const base = fileName.replace(IMAGE_EXT, '')
  const [idPart, ...rest] = base.split('.')
  const id = Number(idPart)

  return {
    id: Number.isInteger(id) ? id : null,
    slug: rest.join('.')
  }
}

// 830.DeergirlChaser.jpg -> Deergirl Chaser, 818.SpecificExpression53 -> Specific Expression 53
function titleFromSlug(slug) {
  return slug
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([0-9])([A-Z][a-z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([A-Za-z])([0-9])/g, '$1 $2')
    .replace(/,(?!\d{3}(?!\d))/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
}


// --- dates ------------------------------------------------------------------

// the csv stores unix *seconds* -- index.html / view.html read it as `created_at * 1000`
function defaultTimestamp(filePath) {
  try {
    const tags = exif.create(fs.readFileSync(filePath)).parse().tags
    const stamp = tags.ModifyDate || tags.DateTimeOriginal || tags.CreateDate
    if (stamp) return stamp
  } catch (e) {
    // no exif, fall through to the file's mtime
  }

  return Math.floor(fs.statSync(filePath).mtimeMs / 1000)
}

// accepts YYYY-MM-DD, M/D/YYYY, "Aug 19 2026", or a bare unix timestamp
function parseDateInput(input) {
  const trimmed = input.trim()
  if (!trimmed) return null

  if (/^\d{9,}$/.test(trimmed)) {
    const num = Number(trimmed)
    return num > 1e11 ? Math.floor(num / 1000) : num
  }

  const ymd = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  const mdy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  const parts = ymd
    ? [Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3])]
    : mdy
      ? [Number(mdy[3]), Number(mdy[1]) - 1, Number(mdy[2])]
      : null

  const date = parts ? new Date(...parts) : new Date(trimmed)
  if (isNaN(date.getTime())) return NaN

  return Math.floor(date.getTime() / 1000)
}

const formatDate = seconds => new Date(seconds * 1000).toLocaleString('en-CA', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
})


// --- rss --------------------------------------------------------------------

function rssItem(comic) {
  const title = `#${comic.id}: ${comic.title}`
  const link = `${SITE}/comics/GayComics/view?comic=${comic.id}`
  const alt = comic.description || title

  return `    <item>
      <title>${escapeXml(title)}</title>
      <link>${link}</link>
      <description><img src="${IMGS}/comics/GayComics/${encodeURI(comic.fileName)}" title="${escapeXml(title)}" alt="${escapeXml(alt)}" /></description>
      <pubDate>${new Date(comic.createdAt * 1000).toUTCString()}</pubDate>
      <guid>${link}</guid>
    </item>`
}

const escapeXml = str => String(str)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')

// newest comic ends up directly under <language>, the way new.html describes it
function insertRssItems(xml, comics) {
  const anchor = xml.match(/<language>[^<]*<\/language>/)
  if (!anchor) return null

  const items = [...comics]
    .sort((a, b) => b.id - a.id)
    .map(rssItem)
    .join('\n\n')

  const at = anchor.index + anchor[0].length
  return `${xml.slice(0, at)}\n\n${items}\n${xml.slice(at)}`
}


// --- prompting --------------------------------------------------------------

// buffers `line` events so piped input (`printf '...' | node scripts/addComics.js`)
// works the same as typing at a tty -- once stdin runs out, every answer is the default
function createPrompter() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const pending = []
  const answered = []
  let closed = false

  rl.on('line', line => (pending.length ? pending.shift()(line) : answered.push(line)))
  rl.on('close', () => {
    closed = true
    while (pending.length) pending.shift()('')
  })

  return {
    question(label) {
      process.stdout.write(label)
      if (answered.length) return Promise.resolve(answered.shift())
      if (closed) return Promise.resolve('')
      return new Promise(resolve => pending.push(resolve))
    },
    close: () => rl.close()
  }
}


// --- main -------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv.slice(2))

  if (opts.help) {
    console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace('/*', '').trim())
    return
  }

  const { raw, rows } = readCsv(opts.csv)
  const knownFiles = new Set(rows.map(r => r.file_name))
  const knownIds = new Set(rows.map(r => Number(r.id)))

  const newFiles = fs.readdirSync(opts.dir)
    .filter(f => IMAGE_EXT.test(f) && !knownFiles.has(f))
    .sort((a, b) => (parseFileName(a).id ?? Infinity) - (parseFileName(b).id ?? Infinity))

  console.log(`${rows.length} comics in ${rel(opts.csv)}, ${newFiles.length} new file${newFiles.length === 1 ? '' : 's'} in ${rel(opts.dir)}`)

  if (!newFiles.length) return

  const prompter = opts.yes ? null : createPrompter()
  const ask = async (label, fallback = '') => {
    if (!prompter) return fallback
    const answer = await prompter.question(fallback ? `${label} [${fallback}]: ` : `${label}: `)
    return answer.trim() || fallback
  }

  const comics = []

  for (const fileName of newFiles) {
    const parsed = parseFileName(fileName)
    console.log(`\n--- ${fileName}`)

    if (parsed.id === null) {
      console.log('   skipped: file name does not start with a comic id (eg. 831.SomeTitle.jpg)')
      continue
    }

    if (knownIds.has(parsed.id)) {
      console.log(`   warning: id ${parsed.id} is already in the csv under a different file name`)
      const keep = await ask('   add anyway? (y/n)', 'n')
      if (!keep.toLowerCase().startsWith('y')) continue
    }

    const defaultTitle = titleFromSlug(parsed.slug)
    const defaultCreatedAt = defaultTimestamp(path.join(opts.dir, fileName))

    const title = await ask('   Title', defaultTitle)

    let createdAt = defaultCreatedAt
    while (prompter) {
      const input = await prompter.question(`   Publication date [${formatDate(defaultCreatedAt)}]: `)
      const parsedDate = parseDateInput(input)
      if (parsedDate === null) break
      if (!isNaN(parsedDate)) { createdAt = parsedDate; break }
      console.log('   could not read that date -- try YYYY-MM-DD')
    }

    const description = await ask('   Description')

    knownIds.add(parsed.id)
    comics.push({ id: parsed.id, title, fileName, createdAt, description })
  }

  prompter?.close()

  if (!comics.length) {
    console.log('\nNothing to add.')
    return
  }

  const newRows = comics.map(csvRow).join('\n')
  const csvOut = `${raw.replace(/\n+$/, '')}\n${newRows}`

  const xml = opts.writeRss ? fs.readFileSync(opts.rss, 'utf8') : null
  const xmlOut = xml === null ? null : insertRssItems(xml, comics)

  console.log(`\n${comics.length} row${comics.length === 1 ? '' : 's'} for ${rel(opts.csv)}:\n`)
  console.log(newRows)

  if (opts.writeRss && xmlOut === null) console.log(`\nwarning: no <language> tag in ${rel(opts.rss)}, skipping rss`)

  if (opts.dryRun) {
    if (xmlOut) console.log(`\nrss items for ${rel(opts.rss)}:\n\n${comics.map(rssItem).reverse().join('\n\n')}`)
    console.log('\n(dry run -- nothing written)')
    return
  }

  fs.writeFileSync(opts.csv, csvOut)
  console.log(`\nwrote ${rel(opts.csv)}`)

  if (xmlOut) {
    fs.writeFileSync(opts.rss, xmlOut)
    console.log(`wrote ${rel(opts.rss)}`)
  }
}

main().catch(err => {
  console.error(err.message)
  process.exit(1)
})
