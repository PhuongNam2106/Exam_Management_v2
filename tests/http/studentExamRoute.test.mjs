import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp } from '../../src/server/app.mjs';

function createTestApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exam-student-exam-api-'));
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

async function createExamWithQuestions(app, auth) {
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

  for (let i = 1; i <= 2; i += 1) {
    await request(app)
      .post(`/api/exams/${exam.body.id}/questions`)
      .set('Authorization', auth)
      .send({
        questionText: `Question ${i}`,
        position: i,
        options: { A: 'Alpha', B: 'Beta', C: 'Gamma', D: 'Delta' },
        correctLabel: 'A'
      })
      .expect(201);
  }

  return exam.body;
}

test('student receives exam payload, saves an answer, and submits', async () => {
  const app = createTestApp();
  const auth = await teacherAuth(app);
  const exam = await createExamWithQuestions(app, auth);
  const session = await request(app)
    .post('/api/sessions')
    .set('Authorization', auth)
    .send({ examId: exam.id, durationMinutes: 45, codeCount: 1 })
    .expect(201);
  const join = await request(app)
    .post('/api/student/join')
    .send({ roomCode: session.body.roomCode, studentId: 'SV001', fullName: 'Student One' })
    .expect(201);
  await request(app).post(`/api/sessions/${session.body.id}/auto-assign`).set('Authorization', auth).send({}).expect(200);
  await request(app).post(`/api/sessions/${session.body.id}/start`).set('Authorization', auth).send({}).expect(200);

  const payload = await request(app).get(`/api/student/${join.body.student.id}/exam`).expect(200);
  const firstItem = payload.body.items[0];

  assert.equal(payload.body.items.length, 2);
  assert.equal(typeof firstItem.questionText, 'string');
  assert.equal(typeof firstItem.options.A, 'string');
  assert.ok(!firstItem.correctOptionId);

  await request(app)
    .post('/api/student/answer')
    .send({
      sessionId: session.body.id,
      sessionStudentId: join.body.student.id,
      examCodeItemId: firstItem.itemId,
      selectedLabel: 'A'
    })
    .expect(200);
  const submitted = await request(app)
    .post('/api/student/submit')
    .send({ sessionId: session.body.id, sessionStudentId: join.body.student.id })
    .expect(200);

  assert.equal(submitted.body.totalQuestions, 2);
});
