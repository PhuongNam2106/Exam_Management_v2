import { transaction } from '../db/database.mjs';
import { createId } from '../utils/ids.mjs';

export function createSessionRepository(db) {
  return {
    createSession({ examId, roomCode, durationMinutes }) {
      const id = createId('sess');
      db.prepare('INSERT INTO exam_sessions(id, exam_id, room_code, status, duration_minutes) VALUES (?, ?, ?, ?, ?)').run(
        id,
        examId,
        roomCode,
        'waiting',
        durationMinutes
      );
      return { id, examId, roomCode, status: 'waiting', durationMinutes };
    },
    getSessionByRoomCode(roomCode) {
      return (
        db
          .prepare('SELECT id, exam_id AS examId, room_code AS roomCode, status, duration_minutes AS durationMinutes, started_at AS startedAt, ends_at AS endsAt FROM exam_sessions WHERE room_code = ?')
          .get(roomCode) || null
      );
    },
    joinStudent({ sessionId, studentId, fullName }) {
      const existing = db
        .prepare('SELECT id, session_id AS sessionId, student_id AS studentId, full_name AS fullName, exam_code_id AS examCodeId, status FROM session_students WHERE session_id = ? AND student_id = ?')
        .get(sessionId, studentId);
      if (existing) return existing;
      const id = createId('stu');
      db.prepare('INSERT INTO session_students(id, session_id, student_id, full_name, status) VALUES (?, ?, ?, ?, ?)').run(
        id,
        sessionId,
        studentId,
        fullName,
        'waiting'
      );
      db.prepare('INSERT INTO attempts(id, session_student_id, status) VALUES (?, ?, ?)').run(createId('att'), id, 'not_started');
      return { id, sessionId, studentId, fullName, examCodeId: null, status: 'waiting' };
    },
    listStudents(sessionId) {
      return db
        .prepare(`
          SELECT ss.id, ss.session_id AS sessionId, ss.student_id AS studentId, ss.full_name AS fullName,
                 ss.exam_code_id AS examCodeId, ss.status,
                 ec.code AS examCode,
                 COALESCE(COUNT(ve.id), 0) AS violationCount
          FROM session_students ss
          LEFT JOIN exam_codes ec ON ec.id = ss.exam_code_id
          LEFT JOIN violation_events ve ON ve.session_student_id = ss.id
          WHERE ss.session_id = ?
          GROUP BY ss.id
          ORDER BY ss.joined_at ASC
        `)
        .all(sessionId);
    },
    createExamCode({ sessionId, code }) {
      const id = createId('code');
      db.prepare('INSERT INTO exam_codes(id, session_id, code) VALUES (?, ?, ?)').run(id, sessionId, code);
      return { id, sessionId, code };
    },
    addExamCodeItem({ examCodeId, questionId, displayOrder, optionIds }) {
      const id = createId('item');
      db.prepare(`
        INSERT INTO exam_code_items(id, exam_code_id, question_id, display_order, option_a_id, option_b_id, option_c_id, option_d_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, examCodeId, questionId, displayOrder, optionIds[0], optionIds[1], optionIds[2], optionIds[3]);
      return { id, examCodeId, questionId, displayOrder };
    },
    assignExamCode({ sessionStudentId, examCodeId }) {
      db.prepare('UPDATE session_students SET exam_code_id = ? WHERE id = ?').run(examCodeId, sessionStudentId);
      return db.prepare('SELECT id, exam_code_id AS examCodeId FROM session_students WHERE id = ?').get(sessionStudentId);
    },
    markRunning({ sessionId, startedAt, endsAt }) {
      db.prepare("UPDATE exam_sessions SET status = 'running', started_at = ?, ends_at = ? WHERE id = ?").run(
        startedAt,
        endsAt,
        sessionId
      );
    },
    markEnded({ sessionId, endedAt }) {
      db.prepare("UPDATE exam_sessions SET status = 'ended', ended_at = ? WHERE id = ?").run(endedAt, sessionId);
    },
    saveViolation({ sessionStudentId, eventType, metadataJson }) {
      const id = createId('vio');
      db.prepare('INSERT INTO violation_events(id, session_student_id, event_type, metadata_json) VALUES (?, ?, ?, ?)').run(
        id,
        sessionStudentId,
        eventType,
        metadataJson || '{}'
      );
      return { id, sessionStudentId, eventType };
    },
    transaction(callback) {
      return transaction(db, callback);
    }
  };
}
