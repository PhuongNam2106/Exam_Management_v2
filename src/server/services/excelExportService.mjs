import ExcelJS from 'exceljs';

function addSheet(workbook, name, rows) {
  const sheet = workbook.addWorksheet(name);
  const headers = Object.keys(rows[0] || { empty: '' });
  sheet.addRow(headers);

  for (const row of rows) {
    sheet.addRow(headers.map((header) => row[header]));
  }

  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach((column) => {
    column.width = 18;
  });
}

export async function writeResultsWorkbook({ filePath, summaryRows, detailRows, violationRows }) {
  const workbook = new ExcelJS.Workbook();
  addSheet(workbook, 'Summary', summaryRows);
  addSheet(workbook, 'Answer Details', detailRows);
  addSheet(workbook, 'Violation Log', violationRows);
  await workbook.xlsx.writeFile(filePath);
  return filePath;
}
