import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDatabase } from '../../src/server/db/database.mjs';
import { createCatalogRepository } from '../../src/server/repositories/catalogRepository.mjs';
import { createExamRepository } from '../../src/server/repositories/examRepository.mjs';
import { createSessionRepository } from '../../src/server/repositories/sessionRepository.mjs';
import { gradeAttempt } from '../../src/server/services/gradingService.mjs';
import { createSessionService } from '../../src/server/services/sessionService.mjs';

const labels = ['A', 'B', 'C', 'D'];

function displayedCorrectLabel(item) {
  return labels.find((label) => item[label] === item.correctOptionId);
}

function displayedWrongLabel(item) {
  return labels.find((label) => item[label] !== item.correctOptionId);
}

test('grades equal-weight A/B/C/D answers on a 10-point scale', () => {
  const result = gradeAttempt({
    items: [
      { itemId: 'i1', displayed: { A: 'o1', B: 'o2', C: 'o3', D: 'o4' }, correctOptionId: 'o2' },
      { itemId: 'i2', displayed: { A: 'o5', B: 'o6', C: 'o7', D: 'o8' }, correctOptionId: 'o7' },
      { itemId: 'i3', displayed: { A: 'o9', B: 'o10', C: 'o11', D: 'o12' }, correctOptionId: 'o12' }
    ],
    answers: [
      { itemId: 'i1', selectedLabel: 'B' },
      { itemId: 'i2', selectedLabel: 'A' }
    ]
  });

  assert.equal(result.correctCount, 1);
  assert.equal(result.totalQuestions, 3);
  assert.equal(result.score, 3.33);
  assert.deepEqual(result.details.map((row) => row.isCorrect), [true, false, false]);
});

test('repository upserts latest answer and computes submitted score', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exam-attempt-'));
  const db = createDatabase(path.join(dir, 'test.sqlite'));
  const catalog = createCatalogRepository(db);
  const exams = createExamRepository(db);
  const sessions = createSessionRepository(db);
  const service = createSessionService({ exams, sessions });

  const semester = catalog.createSemester({ name: '2026 Spring' });
  const course = catalog.createCourse({ semesterId: semester.id, code: 'EDU101', name: 'Assessment' });
  const klass = catalog.createClass({ courseId: course.id, name: 'K1' });
  const exam = exams.createExam({ classId: klass.id, title: 'Quiz 1', durationMinutes: 45 });
  for (let i = 1; i <= 2; i += 1) {
    exams.addQuestion({
      examId: exam.id,
      questionText: `Question ${i}`,
      position: i,
      options: { A: 'A', B: 'B', C: 'C', D: 'D' },
      correctLabel: 'B',
      imageId: null
    });
  }

  const session = service.createSessionWithCodes({ examId: exam.id, durationMinutes: 45, codeCount: 1, roomCode: '112233' });
  const student = sessions.joinStudent({ sessionId: session.id, studentId: 'SV001', fullName: 'Student One' });
  service.autoAssignExamCodes(session.id);
  const items = sessions.getCodeItemsForStudent(student.id);

  service.saveAnswer({ sessionStudentId: student.id, examCodeItemId: items[0].itemId, selectedLabel: displayedWrongLabel(items[0]) });
  service.saveAnswer({ sessionStudentId: student.id, examCodeItemId: items[0].itemId, selectedLabel: displayedCorrectLabel(items[0]) });
  service.saveAnswer({ sessionStudentId: student.id, examCodeItemId: items[1].itemId, selectedLabel: displayedWrongLabel(items[1]) });

  const grade = service.submitStudent({ sessionStudentId: student.id, submittedAt: '2026-05-28T02:00:00.000Z' });
  const attempt = sessions.getAttemptByStudent(student.id);
  const answers = sessions.listAnswers(attempt.id);

  assert.equal(grade.correctCount, 1);
  assert.equal(grade.totalQuestions, 2);
  assert.equal(grade.score, 5);
  assert.equal(attempt.status, 'submitted');
  assert.equal(attempt.score, 5);
  assert.equal(attempt.correctCount, 1);
  assert.equal(attempt.totalQuestions, 2);
  assert.equal(answers.length, 2);
  assert.equal(answers.find((answer) => answer.itemId === items[0].itemId).selectedLabel, displayedCorrectLabel(items[0]));
  db.close();
});
