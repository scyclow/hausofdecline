const fs = require('fs')
const path = require('path')

const inputPath = './docs/GayComicsMetadata.csv'
if (!inputPath) {
  console.error('Usage: node quote-cells.js <input.csv>')
  process.exit(1)
}

const outputPath =  './docs/GayComicsMetadata_quoted.csv'

const csv = fs.readFileSync(inputPath, 'utf8').trim()

const quotedCsv = csv
  .split('\n')
  .map(line =>
    line
      .split(',')
      .map(cell => `"${cell.replace(/"/g, '""')}"`)
      .join(',')
  )
  .join('\n')

fs.writeFileSync(outputPath, quotedCsv, 'utf8')

console.log(`Quoted CSV written to ${outputPath}`)
