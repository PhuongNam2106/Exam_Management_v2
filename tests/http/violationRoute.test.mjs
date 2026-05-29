import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp } from '../../src/server/app.mjs';
import { createSessionRepository } from '../../src/server/repositories/sessionRepository.mjs';

function createTestApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exam-violation-api-'));
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

async function createSession(app, auth) {
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
  const session = await request(app)
    .post('/api/sessions')
    .set('Authorization', auth)
    .send({ examId: exam.body.id, durationMinutes: 45, codeCount: 1 })
    .expect(201);
  return session.body;
}

test('student violation route records a violation event', async () => {
  const app = createTestApp();
  const auth = await teacherAuth(app);
  const session = await createSession(app, auth);
  const join = await request(app)
    .post('/api/student/join')
    .send({ roomCode: session.roomCode, studentId: 'SV001', fullName: 'Student One' })
    .expect(201);

  const res = await request(app)
    .post('/api/student/violation')
    .send({
      sessionId: session.id,
      sessionStudentId: join.body.student.id,
      eventType: 'tab_blur',
      metadata: { count: 1 }
    })
    .expect(201);

  const sessions = createSessionRepository(app.locals.db);
  const students = sessions.listStudents(session.id);

  assert.equal(res.body.eventType, 'tab_blur');
  assert.equal(students[0].violationCount, 1);
});
