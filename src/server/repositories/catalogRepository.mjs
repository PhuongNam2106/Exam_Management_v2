import { createId } from '../utils/ids.mjs';

export function createCatalogRepository(db) {
  return {
    createSemester({ name }) {
      const row = { id: createId('sem'), name };
      db.prepare('INSERT INTO semesters(id, name) VALUES (?, ?)').run(row.id, row.name);
      return row;
    },
    listSemesters() {
      return db.prepare('SELECT * FROM semesters ORDER BY created_at DESC').all();
    },
    createCourse({ semesterId, code, name }) {
      const row = { id: createId('course'), semester_id: semesterId, code, name };
      db.prepare('INSERT INTO courses(id, semester_id, code, name) VALUES (?, ?, ?, ?)').run(
        row.id,
        row.semester_id,
        row.code,
        row.name
      );
      return { id: row.id, semesterId, code, name };
    },
    listCourses(semesterId) {
      return db
        .prepare('SELECT id, semester_id AS semesterId, code, name FROM courses WHERE semester_id = ? ORDER BY created_at DESC')
        .all(semesterId);
    },
    createClass({ courseId, name }) {
      const row = { id: createId('class'), course_id: courseId, name };
      db.prepare('INSERT INTO classes(id, course_id, name) VALUES (?, ?, ?)').run(row.id, row.course_id, row.name);
      return { id: row.id, courseId, name };
    },
    listClasses(courseId) {
      return db
        .prepare('SELECT id, course_id AS courseId, name FROM classes WHERE course_id = ? ORDER BY created_at DESC')
        .all(courseId);
    }
  };
}
