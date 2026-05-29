import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDatabase } from '../../src/server/db/database.mjs';
import { createCatalogRepository } from '../../src/server/repositories/catalogRepository.mjs';
import { createExamRepository } from '../../src/server/repositories/examRepository.mjs';
import { createSessionRepository } from '../../src/server/repositories/sessionRepository.mjs';

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
