import fs from 'fs/promises'

function parseCsvLine(line) {
  const result = []
  let value = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const nextChar = line[i + 1]

    if (char === '"' && inQuotes && nextChar === '"') {
      value += '"'
      i++ // skip escaped quote
    } else if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(value)
      value = ''
    } else {
      value += char
    }
  }

  result.push(value) // last value (after final comma)
  return result
}

function csvToJson(csvString) {
  const [headerLine, ...lines] = csvString.trim().split('\n')
  const headers = headerLine.split(',').map(h => h.replaceAll('"', '').trim())

  const json = lines.map(line => {
    const values = parseCsvLine(line)
    const valuesClean = values.map(v => v.replaceAll('"', '').trim())
    const entry = {}
    headers.forEach((header, i) => {
      entry[header] = valuesClean[i]
    })
    return entry
  })

  return json
}


async function main() {
  const csvString = await fs.readFile('docs/GayComicsMetadata.csv', 'utf8')
  const json = csvToJson(csvString)
  const lastRow = json[json.length - 1]
  const fileName = lastRow.file_name

  let index = await fs.readFile('docs/index.html', 'utf8')
  // let gayComicsView = await fs.readFile('docs/comics/GayComics/view.html', 'utf8')
  // let gayComicsIndex = await fs.readFile('docs/comics/GayComics/index.html', 'utf8')

  index = index.replace(
    /<img([^>]*id=["']viewedComic["'][^>]*)>/,
    `<img$1 src="/comics/GayComics/${fileName}">`
  )

  // gayComicsView = gayComicsView.replace(
  //   /<img([^>]*id=["']viewedComic["'][^>]*)>/,
  //   `<img$1 src="/comics/GayComics/${fileName}">`
  // )

  await fs.writeFile('docs/index.html', index, 'utf8')
  // await fs.writeFile('docs/comics/GayComics/view.html', gayComicsView, 'utf8')
  console.log(`Updated index.html`)


  // const gridHTML = json
  //   .reverse()
  //   .map(d => `
  //     <a class="comicThumbnail" href="/comics/GayComics/view?comic=${d.id}">
  //       <img src="/comics/GayComics/${d.file_name}" loading="lazy">
  //     </a>
  //   `)
  //   .join('')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
