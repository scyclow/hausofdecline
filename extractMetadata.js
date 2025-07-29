/*

  Google Drive overwrites the file metadata. So in order to create a new metadata spreadsheet:


  1. Change INPUT_DIR to point to the folder with the images
  2. Run `node extractMetadata.js`
  3. Upload `output.csv` to a new spreadsheet.
  4. In the new spreadsheet, click Extensions > Apps Script
  5. Paste the matchImageFilesToSheet script
  6. Replace 'YOUR_FOLDER_ID_HERE' with your folder ID (get it from the Drive URL)
  7. Save and run
  8. Some of the names might be wonky, so browse and fix, or get an LLM to fix
  9. Add descriptions


    function populateImageUrlsFromDrive() {
      const folderId = '1aQjCflISuq3jijvuFeYb56OmteXFVo4H';
      const folder = DriveApp.getFolderById(folderId);
      const files = folder.getFiles();
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
      const data = sheet.getRange("C2:C" + sheet.getLastRow()).getValues();

      // Build a map of filename → fileId for fast lookup
      const fileMap = new Map();
      while (files.hasNext()) {
        const file = files.next();
        if (file.getMimeType() === MimeType.JPEG || file.getName().toLowerCase().endsWith('.jpg')) {
          fileMap.set(file.getName(), file.getId());
        }
      }

      // Go through each filename in column C
      for (let i = 0; i < data.length; i++) {
        const fileName = data[i][0];
        if (!fileName) continue;

        const fileId = fileMap.get(fileName);
        if (fileId) {
          const imageUrl = `https://lh3.googleusercontent.com/d/${fileId}`;
          sheet.getRange(i + 2, 5).setValue(imageUrl); // column E
        } else {
          sheet.getRange(i + 2, 5).setValue("");
        }
      }
    }

*/




const fs = require('fs');
const path = require('path');
const exif = require('exif-parser');
const { stringify } = require('csv-stringify/sync');

const INPUT_DIR = '../../GayComics';       // Change to your image folder
const OUTPUT_FILE = './output.csv';

function camelToTitle(str) {
  return str
    .replace(/([A-Z])/g, ' $1')
    .replace(/^ /, '')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function getExifDate(buffer) {
  try {
    const parser = exif.create(buffer);
    const result = parser.parse();
    return result.tags.ModifyDate
      ? result.tags.ModifyDate
      : '';
  } catch (e) {
    return '';
  }
}

function processImages(dirPath) {
  const files = fs.readdirSync(dirPath).filter(f => /\.(jpg|jpeg|png)$/i.test(f));
  const rows = [];

  for (const file of files) {
    const match = file.split('.')


    const id = match[0].padStart(3, '0');
    const name = camelToTitle(match[1]);
    const filePath = path.join(dirPath, file);
    const buffer = fs.readFileSync(filePath);
    const createdAt = getExifDate(buffer);

    rows.push([id, name, file, createdAt]);
  }

  return rows;
}

function main() {
  const records = processImages(INPUT_DIR);
  const csvData = stringify([['id', 'title', 'file_name', 'created_at', 'image_url', 'description'], ...records]);
  fs.writeFileSync(OUTPUT_FILE, csvData);
  console.log(`✅ Metadata CSV written to ${OUTPUT_FILE}`);
}

main();