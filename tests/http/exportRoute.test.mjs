import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp } from '../../src/server/app.mjs';

function binaryParser(res, callback) {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

function createTestApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exam-export-api-'));
  return createApp({
    dataDir: dir,
    uploadDir: path.join(dir, 'uploads'),
    exportDir: path.join(dir, 'exports'),
    databasePath: path.join(dir, 'test.sqlite')
  });
}

async function teacherAuth(app) {
  const res = await request(app).post('/api/teacher/login').send({ password: 'admin123' }).expect(200);
  return `Bearer ${res.body.token}`;
}

async function createSubmittedSession(app, auth) {
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
  await request(app)
    .post(`/api/exams/${exam.body.id}/questions`)
    .set('Authorization', auth)
    .send({ questionText: '2 + 2 = ?', position: 1, options: { A: '3', B: '4', C: '5', D: '6' }, correctLabel: 'B' })
    .expect(201);
  const session = await request(app)
    .post('/api/sessions')
    .set('Authorization', auth)
    .send({ examId: exam.body.id, durationMinutes: 45, codeCount: 1 })
    .expect(201);
  const join = await request(app)
    .post('/api/student/join')
    .send({ roomCode: session.body.roomCode, studentId: 'SV001', fullName: 'Student One' })
    .expect(201);
  await request(app).post(`/api/sessions/${session.body.id}/auto-assign`).set('Authorization', auth).send({}).expect(200);
  await request(app).post(`/api/sessions/${session.body.id}/start`).set('Authorization', auth).send({}).expect(200);
  const payload = await request(app).get(`/api/student/${join.body.student.id}/exam`).expect(200);
  await request(app)
    .post('/api/student/answer')
    .send({
      sessionId: session.body.id,
      sessionStudentId: join.body.student.id,
      examCodeItemId: payload.body.items[0].itemId,
      selectedLabel: 'B'
    })
    .expect(200);
  await request(app).post('/api/student/submit').send({ sessionId: session.body.id, sessionStudentId: join.body.student.id }).expect(200);
  await request(app)
    .post('/api/student/violation')
    .send({ sessionId: session.body.id, sessionStudentId: join.body.student.id, eventType: 'tab_hidden', metadata: {} })
    .expect(201);
  return session.body;
}

test('teacher downloads session results as an Excel workbook', async () => {
  const app = createTestApp();
  const auth = await teacherAuth(app);
  const session = await createSubmittedSession(app, auth);

  const res = await request(app)
    .get(`/api/sessions/${session.id}/export.xlsx`)
    .set('Authorization', auth)
    .buffer(true)
    .parse(binaryParser)
    .expect(200);

  assert.match(res.headers['content-disposition'], /session-.*\.xlsx/);
  assert.ok(res.body.length > 0);
});
