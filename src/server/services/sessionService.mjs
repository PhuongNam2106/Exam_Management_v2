import { createRoomCode } from '../utils/ids.mjs';
import { addMinutesIso, nowIso } from '../utils/time.mjs';
import { generateCodeNames, generateExamCodeMappings } from './examCodeService.mjs';

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
    }
  };
}
