import ExcelJS from 'exceljs';
import { optionLabel, requiredText } from './validation.mjs';

function collectField(row, field, errors) {
  try {
    return requiredText(row[field], field);
  } catch (error) {
    errors.push({ rowNumber: row.rowNumber, field, message: error.message });
    return '';
  }
}

function collectCorrectLabel(row, errors) {
  try {
    return optionLabel(row.correct_option);
  } catch (error) {
    errors.push({ rowNumber: row.rowNumber, field: 'correct_option', message: error.message });
    return '';
  }
}

export function validateQuestionRows(rows, imageNames) {
  const errors = [];
  const questions = [];

  for (const row of rows) {
    const rowErrors = [];
    const questionText = collectField(row, 'question', rowErrors);
    const options = {
      A: collectField(row, 'option_a', rowErrors),
      B: collectField(row, 'option_b', rowErrors),
      C: collectField(row, 'option_c', rowErrors),
      D: collectField(row, 'option_d', rowErrors)
    };
    const correctLabel = collectCorrectLabel(row, rowErrors);
    const imageName = String(row.image || '').trim();

    if (imageName && !imageNames.has(imageName)) {
      rowErrors.push({ rowNumber: row.rowNumber, field: 'image', message: `Image file ${imageName} was not provided` });
    }

    errors.push(...rowErrors);
    if (rowErrors.length === 0) {
      questions.push({ rowNumber: row.rowNumber, questionText, imageName: imageName || null, options, correctLabel });
    }
  }

  return { questions: errors.length ? [] : questions, errors };
}

export async function readQuestionRowsFromWorkbook(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  const header = sheet.getRow(1).values.map((value) => String(value || '').trim());
  const rows = [];

  sheet.eachRow((excelRow, rowNumber) => {
    if (rowNumber === 1) return;
    const item = { rowNumber };
    for (let col = 1; col < header.length; col += 1) {
      item[header[col]] = excelRow.getCell(col).text;
    }
    rows.push(item);
  });

  return rows;
}
