import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { writeResultsWorkbook } from '../../src/server/services/excelExportService.mjs';

test('writes workbook with summary, answer details, and violation log sheets', async () => {
  const filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'exam-export-')), 'results.xlsx');

  await writeResultsWorkbook({
    filePath,
    summaryRows: [
      {
        studentId: 'SV001',
        fullName: 'Student One',
        examCode: 'MD01',
        score: 10,
        correctCount: 2,
        totalQuestions: 2,
        violationCount: 1,
        status: 'submitted',
        submittedAt: '2026-05-28T01:00:00.000Z'
      }
    ],
    detailRows: [
      {
        studentId: 'SV001',
        fullName: 'Student One',
        examCode: 'MD01',
        displayOrder: 1,
        questionId: 'q1',
        studentAnswer: 'A',
        correctAnswer: 'A',
        isCorrect: true
      }
    ],
    violationRows: [
      {
        studentId: 'SV001',
        fullName: 'Student One',
        eventType: 'tab_hidden',
        occurredAt: '2026-05-28T01:00:00.000Z',
        cumulativeCount: 1,
        notes: '{}'
      }
    ]
  });

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['Summary', 'Answer Details', 'Violation Log']);
  assert.equal(workbook.getWorksheet('Summary').getRow(2).getCell(1).value, 'SV001');
});
