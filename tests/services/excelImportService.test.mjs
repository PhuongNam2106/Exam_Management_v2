import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { readQuestionRowsFromWorkbook, validateQuestionRows } from '../../src/server/services/excelImportService.mjs';

test('validates simple Excel rows into question payloads', () => {
  const rows = [
    {
      rowNumber: 2,
      question: 'Capital of Vietnam?',
      image: '',
      option_a: 'Hanoi',
      option_b: 'Hue',
      option_c: 'Da Nang',
      option_d: 'HCMC',
      correct_option: 'A'
    }
  ];

  const result = validateQuestionRows(rows, new Set());

  assert.equal(result.errors.length, 0);
  assert.equal(result.questions[0].options.A, 'Hanoi');
  assert.equal(result.questions[0].correctLabel, 'A');
});

test('returns row-level errors for missing image and invalid correct option', () => {
  const rows = [
    {
      rowNumber: 2,
      question: 'Q',
      image: 'chart.png',
      option_a: 'A',
      option_b: 'B',
      option_c: 'C',
      option_d: 'D',
      correct_option: 'E'
    }
  ];

  const result = validateQuestionRows(rows, new Set(['other.png']));

  assert.deepEqual(result.errors, [
    { rowNumber: 2, field: 'correct_option', message: 'correct_option must be A, B, C, or D' },
    { rowNumber: 2, field: 'image', message: 'Image file chart.png was not provided' }
  ]);
});

test('reads question rows from workbook headers', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exam-import-'));
  const filePath = path.join(dir, 'questions.xlsx');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Questions');
  sheet.addRow(['question', 'image', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_option']);
  sheet.addRow(['2 + 2 = ?', '', '3', '4', '5', '6', 'B']);
  await workbook.xlsx.writeFile(filePath);

  const rows = await readQuestionRowsFromWorkbook(filePath);

  assert.deepEqual(rows, [
    {
      rowNumber: 2,
      question: '2 + 2 = ?',
      image: '',
      option_a: '3',
      option_b: '4',
      option_c: '5',
      option_d: '6',
      correct_option: 'B'
    }
  ]);
});
