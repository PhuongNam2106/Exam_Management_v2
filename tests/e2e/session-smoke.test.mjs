import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp } from '../../src/server/app.mjs';

function createTestApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exam-e2e-'));
  return createApp({
    dataDir: dir,
    uploadDir: path.join(dir, 'uploads'),
    exportDir: path.join(dir, 'exports'),
    databasePath: path.join(dir, 'test.sqlite')
  });
}

test('teacher can create exam session and student can join', async () => {
  const app = createTestApp();
  const login = await request(app).post('/api/teacher/login').send({ password: 'admin123' }).expect(200);
  const auth = `Bearer ${login.body.token}`;

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
    .send({
      questionText: '2 + 2 = ?',
      position: 1,
      options: { A: '3', B: '4', C: '5', D: '6' },
      correctLabel: 'B'
    })
    .expect(201);

  const session = await request(app)
    .post('/api/sessions')
    .set('Authorization', auth)
    .send({ examId: exam.body.id, durationMinutes: 45, codeCount: 2 })
    .expect(201);
  const join = await request(app)
    .post('/api/student/join')
    .send({ roomCode: session.body.roomCode, studentId: 'SV001', fullName: 'Student One' })
    .expect(201);

  assert.equal(join.body.student.studentId, 'SV001');
});
