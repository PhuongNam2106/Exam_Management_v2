import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDatabase } from '../../src/server/db/database.mjs';
import { createCatalogRepository } from '../../src/server/repositories/catalogRepository.mjs';
import { createExamRepository } from '../../src/server/repositories/examRepository.mjs';
import { createSessionRepository } from '../../src/server/repositories/sessionRepository.mjs';
import { createSessionService } from '../../src/server/services/sessionService.mjs';

test('repositories create catalog, exam, session, and student rows', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exam-repo-'));
  const db = createDatabase(path.join(dir, 'test.sqlite'));
  const catalog = createCatalogRepository(db);
  const exams = createExamRepository(db);
  const sessions = createSessionRepository(db);

  const semester = catalog.createSemester({ name: '2026 Spring' });
  const course = catalog.createCourse({ semesterId: semester.id, code: 'EDU101', name: 'Assessment' });
  const klass = catalog.createClass({ courseId: course.id, name: 'K1' });
  const exam = exams.createExam({ classId: klass.id, title: 'Quiz 1', durationMinutes: 45 });
  const question = exams.addQuestion({
    examId: exam.id,
    questionText: '2 + 2 = ?',
    position: 1,
    options: { A: '3', B: '4', C: '5', D: '6' },
    correctLabel: 'B',
    imageId: null
  });
  const session = sessions.createSession({ examId: exam.id, roomCode: '123456', durationMinutes: 45 });
  const student = sessions.joinStudent({ sessionId: session.id, studentId: 'SV001', fullName: 'Student One' });

  assert.equal(question.options.length, 4);
  assert.equal(student.status, 'waiting');
  db.close();
});

test('session service generates codes, auto-assigns students, starts, and blocks unassigned start', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exam-session-'));
  const db = createDatabase(path.join(dir, 'test.sqlite'));
  const catalog = createCatalogRepository(db);
  const exams = createExamRepository(db);
  const sessions = createSessionRepository(db);
  const service = createSessionService({ exams, sessions });

  const semester = catalog.createSemester({ name: '2026 Spring' });
  const course = catalog.createCourse({ semesterId: semester.id, code: 'EDU101', name: 'Assessment' });
  const klass = catalog.createClass({ courseId: course.id, name: 'K1' });
  const exam = exams.createExam({ classId: klass.id, title: 'Quiz 1', durationMinutes: 45 });
  for (let i = 1; i <= 4; i += 1) {
    exams.addQuestion({
      examId: exam.id,
      questionText: `Question ${i}`,
      position: i,
      options: { A: 'A1', B: 'B1', C: 'C1', D: 'D1' },
      correctLabel: 'A',
      imageId: null
    });
  }

  const session = service.createSessionWithCodes({ examId: exam.id, durationMinutes: 45, codeCount: 2, roomCode: '555111' });
  const s1 = sessions.joinStudent({ sessionId: session.id, studentId: 'SV001', fullName: 'Student One' });
  const s2 = sessions.joinStudent({ sessionId: session.id, studentId: 'SV002', fullName: 'Student Two' });

  assert.throws(
    () => service.startSession(session.id, '2026-05-28T01:00:00.000Z'),
    /Cannot start session with unassigned students: SV001, SV002/
  );

  service.autoAssignExamCodes(session.id);
  const students = sessions.listStudents(session.id);
  assert.equal(students.length, 2);
  assert.ok(students.every((student) => student.examCodeId));

  const running = service.startSession(session.id, '2026-05-28T01:00:00.000Z');
  assert.equal(running.status, 'running');
  assert.equal(running.endsAt, '2026-05-28T01:45:00.000Z');

  assert.ok(s1.id);
  assert.ok(s2.id);
  db.close();
});
