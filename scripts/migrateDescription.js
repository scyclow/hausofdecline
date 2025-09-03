
const fs = require('fs');
const path = require('path');

const CSV_FILE = './docs/GayComicsMetadata.csv';
const LEGACY_DB = './legacyDbBackup.json'






function main() {

  const csv = fs.readFileSync(CSV_FILE, 'utf8').split('\n')
  const legacy = JSON.parse(fs.readFileSync(LEGACY_DB, 'utf8'))
  legacy.forEach((l) => {
    const id = l.ordinality.$numberInt
    const description = `"${l.description}"`
    const csvRowIx = csv.findIndex(c => Number(c.split(',')[0]) === Number(id))
    csv[csvRowIx] = csv[csvRowIx] += description
  })

  fs.writeFileSync(CSV_FILE, csv.join('\n'))
// console.log(legacy)
}

main();