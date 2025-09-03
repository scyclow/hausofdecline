function matchImageFilesToSheet() {
  const folderId = '1aQjCflISuq3jijvuFeYb56OmteXFVo4H'; // Replace with your folder ID
  const folder = DriveApp.getFolderById(folderId);
  const files = folder.getFiles();

  const fileMap = {};

  // Step 1: Index files by padded ID
  while (files.hasNext()) {
    const file = files.next();
    const name = file.getName().toLowerCase();
    const match = name.match(/(\d+)\./);
    if (match) {
      const id = match[1].padStart(3, '0');
      fileMap[id] = {
        id: file.getId(),
        createdAt: file.getDateCreated()
      };
    }
  }

  // Step 2: Read and update the sheet
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const values = sheet.getRange('A2:A').getValues();

  for (let i = 0; i < values.length; i++) {
    const rawId = values[i][0];
    if (!rawId) continue;

    const id = String(rawId).trim().padStart(3, '0');
    const fileData = fileMap[id];

    const urlCell = sheet.getRange(i + 2, 2); // Column B (Image URL)
    const timeCell = sheet.getRange(i + 2, 3); // Column C (Created At)

    if (fileData) {
      const url = `https://drive.google.com/uc?export=view&id=${fileData.id}`;
      urlCell.setValue(url);
      timeCell.setValue(fileData.createdAt);
    } else {
      urlCell.setValue('Not Found');
      timeCell.setValue('');
    }
  }
}

/*

🔧 How To Use
Open your Google Sheet

Click Extensions > Apps Script

Paste the script above

Replace 'YOUR_FOLDER_ID_HERE' with your folder ID (get it from the Drive URL)

Save and run matchImageFilesToSheet

*/