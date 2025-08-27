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

export async function getComicData() {
  // const SHEET_ID = '1f8kqjWd4XYfUt-go2lsT-3-_Ex6fVeAKwVjSOvEF52g';

  // return fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`)
  return fetch(`/GayComicsMetadata.csv`)
    .then(res => res.text())
    .then(csv => {
      return csvToJson(csv)
    })
}