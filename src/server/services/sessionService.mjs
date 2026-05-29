import { createRoomCode } from '../utils/ids.mjs';
import { addMinutesIso, nowIso } from '../utils/time.mjs';
import { generateCodeNames, generateExamCodeMappings } from './examCodeService.mjs';
import { gradeAttempt } from './gradingService.mjs';

export function createSessionService({ exams, sessions }) {
  return {
    createSessionWithCodes({ examId, durationMinutes, codeCount, roomCode = createRoomCode() }) {
      return sessions.transaction(() => {
        const session = sessions.createSession({ examId, roomCode, durationMinutes });
        const questions = exams.getExamQuestions(examId).map((question) => ({
          id: question.id,
          optionIds: question.options.map((option) => option.id)
        }));

        for (const code of generateCodeNames(codeCount)) {
          const examCode = sessions.createExamCode({ sessionId: session.id, code });
          const mappings = generateExamCodeMappings({ code, questions, seed: session.id });
          for (const mapping of mappings) {
            sessions.addExamCodeItem({
              examCodeId: examCode.id,
              questionId: mapping.questionId,
              displayOrder: mapping.displayOrder,
              optionIds: mapping.displayedOptionIds
            });
          }
        }
        return session;
      });
    },
    autoAssignExamCodes(sessionId) {
      const students = sessions.listStudents(sessionId);
      const codes = sessions.listExamCodes(sessionId);
      if (codes.length === 0) throw new Error('No exam codes generated');
      students.forEach((student, index) => {
        if (!student.examCodeId) {
          sessions.assignExamCode({ sessionStudentId: student.id, examCodeId: codes[index % codes.length].id });
        }
      });
      return sessions.listStudents(sessionId);
    },
    startSession(sessionId, startIso = nowIso()) {
      const students = sessions.listStudents(sessionId);
      const unassigned = students.filter((student) => !student.examCodeId);
      if (unassigned.length > 0) {
        throw new Error(`Cannot start session with unassigned students: ${unassigned.map((student) => student.studentId).join(', ')}`);
      }
      const session = sessions.getSessionById(sessionId);
      const durationMinutes = session?.durationMinutes || 1;
      const endsAt = addMinutesIso(startIso, durationMinutes);
      sessions.markRunning({ sessionId, startedAt: startIso, endsAt });
      return { id: sessionId, status: 'running', startedAt: startIso, endsAt };
    },
    endSession(sessionId, endedAt = nowIso()) {
      sessions.markEnded({ sessionId, endedAt });
      return { id: sessionId, status: 'ended', endedAt };
    },
    saveAnswer({ sessionStudentId, examCodeItemId, selectedLabel }) {
      const attempt = sessions.getAttemptByStudent(sessionStudentId);
      if (!attempt) throw new Error('Attempt not found');

      const items = sessions.getCodeItemsForStudent(sessionStudentId);
      const item = items.find((entry) => entry.itemId === examCodeItemId);
      if (!item) throw new Error('Question item is not assigned to this student');

      const selectedOptionId = item[selectedLabel];
      if (!selectedOptionId) throw new Error('selectedLabel must be A, B, C, or D');

      sessions.saveAnswer({ attemptId: attempt.id, examCodeItemId, selectedLabel, selectedOptionId });
      return { saved: true };
    },
    submitStudent({ sessionStudentId, submittedAt = nowIso() }) {
      const attempt = sessions.getAttemptByStudent(sessionStudentId);
      if (!attempt) throw new Error('Attempt not found');

      const rows = sessions.getCodeItemsForStudent(sessionStudentId);
      const items = rows.map((row) => ({
        itemId: row.itemId,
        displayed: { A: row.A, B: row.B, C: row.C, D: row.D },
        correctOptionId: row.correctOptionId
      }));
      const answers = sessions.listAnswers(attempt.id);
      const grade = gradeAttempt({ items, answers });
      sessions.submitAttempt({
        attemptId: attempt.id,
        submittedAt,
        score: grade.score,
        correctCount: grade.correctCount,
        totalQuestions: grade.totalQuestions
      });
      return grade;
    }
  };
}
