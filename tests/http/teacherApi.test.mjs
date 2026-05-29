import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp } from '../../src/server/app.mjs';

function createTestApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exam-teacher-api-'));
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

async function createBaseExam(app, auth) {
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
  return { semester: semester.body, course: course.body, klass: klass.body, exam: exam.body };
}

async function addQuestions(app, auth, examId, count = 2) {
  for (let i = 1; i <= count; i += 1) {
    await request(app)
      .post(`/api/exams/${examId}/questions`)
      .set('Authorization', auth)
      .send({
        questionText: `Question ${i}`,
        position: i,
        options: { A: 'A', B: 'B', C: 'C', D: 'D' },
        correctLabel: 'A'
      })
      .expect(201);
  }
}

test('teacher endpoints list catalog data and add manual questions', async () => {
  const app = createTestApp();
  const auth = await teacherAuth(app);
  const { semester, course, klass, exam } = await createBaseExam(app, auth);

  await addQuestions(app, auth, exam.id, 1);

  const courses = await request(app).get(`/api/courses?semesterId=${semester.id}`).set('Authorization', auth).expect(200);
  const classes = await request(app).get(`/api/classes?courseId=${course.id}`).set('Authorization', auth).expect(200);
  const exams = await request(app).get(`/api/exams?classId=${klass.id}`).set('Authorization', auth).expect(200);

  assert.equal(courses.body.items[0].id, course.id);
  assert.equal(classes.body.items[0].id, klass.id);
  assert.equal(exams.body.items[0].id, exam.id);
});

test('teacher manages session students and lifecycle', async () => {
  const app = createTestApp();
  const auth = await teacherAuth(app);
  const { exam } = await createBaseExam(app, auth);
  await addQuestions(app, auth, exam.id, 2);

  const session = await request(app)
    .post('/api/sessions')
    .set('Authorization', auth)
    .send({ examId: exam.id, durationMinutes: 45, codeCount: 2 })
    .expect(201);
  await request(app)
    .post('/api/student/join')
    .send({ roomCode: session.body.roomCode, studentId: 'SV001', fullName: 'Student One' })
    .expect(201);

  const waiting = await request(app).get(`/api/sessions/${session.body.id}/students`).set('Authorization', auth).expect(200);
  assert.equal(waiting.body.items[0].examCode, null);

  const assigned = await request(app).post(`/api/sessions/${session.body.id}/auto-assign`).set('Authorization', auth).send({}).expect(200);
  assert.equal(assigned.body.items[0].studentId, 'SV001');
  assert.ok(assigned.body.items[0].examCode);

  const running = await request(app).post(`/api/sessions/${session.body.id}/start`).set('Authorization', auth).send({}).expect(200);
  const ended = await request(app).post(`/api/sessions/${session.body.id}/end`).set('Authorization', auth).send({}).expect(200);

  assert.equal(running.body.status, 'running');
  assert.equal(ended.body.status, 'ended');
});
