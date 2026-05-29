import { transaction } from '../db/database.mjs';
import { createId } from '../utils/ids.mjs';

export function createExamRepository(db) {
  return {
    createExam({ classId, title, durationMinutes }) {
      const id = createId('exam');
      db.prepare('INSERT INTO exams(id, class_id, title, duration_minutes) VALUES (?, ?, ?, ?)').run(
        id,
        classId,
        title,
        durationMinutes
      );
      return { id, classId, title, durationMinutes };
    },
    listExams(classId) {
      return db
        .prepare('SELECT id, class_id AS classId, title, duration_minutes AS durationMinutes FROM exams WHERE class_id = ? ORDER BY created_at DESC')
        .all(classId);
    },
    addImage({ examId, originalName, storedPath, mimeType }) {
      const id = createId('img');
      db.prepare('INSERT INTO question_images(id, exam_id, original_name, stored_path, mime_type) VALUES (?, ?, ?, ?, ?)').run(
        id,
        examId,
        originalName,
        storedPath,
        mimeType
      );
      return { id, examId, originalName, storedPath, mimeType };
    },
    addQuestion({ examId, questionText, position, options, correctLabel, imageId }) {
      return transaction(db, () => {
        const questionId = createId('q');
        db.prepare('INSERT INTO questions(id, exam_id, image_id, question_text, position) VALUES (?, ?, ?, ?, ?)').run(
          questionId,
          examId,
          imageId,
          questionText,
          position
        );
        const optionRows = ['A', 'B', 'C', 'D'].map((label) => {
          const id = createId('opt');
          db.prepare('INSERT INTO question_options(id, question_id, label, option_text, is_correct) VALUES (?, ?, ?, ?, ?)').run(
            id,
            questionId,
            label,
            options[label],
            label === correctLabel ? 1 : 0
          );
          return { id, questionId, label, optionText: options[label], isCorrect: label === correctLabel };
        });
        return { id: questionId, examId, questionText, position, imageId, options: optionRows };
      });
    },
    getExamQuestions(examId) {
      const questions = db
        .prepare('SELECT id, image_id AS imageId, question_text AS questionText, position FROM questions WHERE exam_id = ? ORDER BY position ASC')
        .all(examId);
      return questions.map((question) => ({
        ...question,
        options: db
          .prepare('SELECT id, label, option_text AS optionText, is_correct AS isCorrect FROM question_options WHERE question_id = ? ORDER BY label ASC')
          .all(question.id)
      }));
    }
  };
}
