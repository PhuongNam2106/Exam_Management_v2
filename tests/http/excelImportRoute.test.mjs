import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { createApp } from '../../src/server/app.mjs';

function createTestApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exam-import-api-'));
  return createApp({
    dataDir: dir,
    uploadDir: path.join(dir, 'uploads'),
    exportDir: path.join(dir, 'exports'),
    databasePath: path.join(dir, 'test.sqlite')
  });
}

const app = createTestApp();

async function teacherAuth() {
  const res = await request(app).post('/api/teacher/login').send({ password: 'admin123' }).expect(200);
  return `Bearer ${res.body.token}`;
}

async function createExam(auth) {
  const semester = await request(app).post('/api/semesters').set('Authorization', auth).send({ name: '2026 Spring' }).expect(201);
  const course = await request(app)
    .post('/api/courses')
    .set('Authorization', auth)
    .send({ semesterId: semester.body.id, code: 'EDU101', name: 'Assessment' })
    .expect(201);
  const klass = await request(app)
    .post('/api/classes')
    .set('Authorization', auth)
    .send({ courseId: course.body.id, name: 'K1' })
    .expect(201);
  const exam = await request(app)
    .post('/api/exams')
    .set('Authorization', auth)
    .send({ classId: klass.body.id, title: 'Quiz 1', durationMinutes: 45 })
    .expect(201);
  return exam.body;
}

async function createWorkbook() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exam-import-route-'));
  const filePath = path.join(dir, 'questions.xlsx');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Questions');
  sheet.addRow(['question', 'image', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_option']);
  sheet.addRow(['Capital of Vietnam?', '', 'Hanoi', 'Hue', 'Da Nang', 'HCMC', 'A']);
  await workbook.xlsx.writeFile(filePath);
  return filePath;
}

test('teacher imports questions from an Excel workbook', async () => {
  const auth = await teacherAuth();
  const exam = await createExam(auth);
  const workbookPath = await createWorkbook();

  const res = await request(app)
    .post(`/api/exams/${exam.id}/import-excel`)
    .set('Authorization', auth)
    .attach('excel', workbookPath)
    .expect(201);

  assert.equal(res.body.imported, 1);
});
