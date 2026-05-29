import express from 'express';
import { requireTeacher } from './auth.mjs';
import { issueTeacherToken, verifyTeacherPassword } from '../services/authService.mjs';
import { createCatalogRepository } from '../repositories/catalogRepository.mjs';
import { createExamRepository } from '../repositories/examRepository.mjs';
import { createSessionRepository } from '../repositories/sessionRepository.mjs';
import { createSessionService } from '../services/sessionService.mjs';
import { positiveInteger, requiredText } from '../services/validation.mjs';

export function createRoutes(db) {
  const router = express.Router();
  const catalog = createCatalogRepository(db);
  const exams = createExamRepository(db);
  const sessions = createSessionRepository(db);
  const sessionService = createSessionService({ exams, sessions });

  router.post('/teacher/login', (req, res) => {
    if (!verifyTeacherPassword(req.body.password)) {
      res.status(401).json({ error: 'Invalid password' });
      return;
    }

    res.json({ token: issueTeacherToken() });
  });

  router.post('/semesters', requireTeacher, (req, res) => {
    res.status(201).json(catalog.createSemester({ name: requiredText(req.body.name, 'name') }));
  });

  router.get('/semesters', requireTeacher, (req, res) => {
    res.json({ items: catalog.listSemesters() });
  });

  router.post('/courses', requireTeacher, (req, res) => {
    res.status(201).json(
      catalog.createCourse({
        semesterId: requiredText(req.body.semesterId, 'semesterId'),
        code: requiredText(req.body.code, 'code'),
        name: requiredText(req.body.name, 'name')
      })
    );
  });

  router.post('/classes', requireTeacher, (req, res) => {
    res.status(201).json(
      catalog.createClass({
        courseId: requiredText(req.body.courseId, 'courseId'),
        name: requiredText(req.body.name, 'name')
      })
    );
  });

  router.post('/exams', requireTeacher, (req, res) => {
    res.status(201).json(
      exams.createExam({
        classId: requiredText(req.body.classId, 'classId'),
        title: requiredText(req.body.title, 'title'),
        durationMinutes: positiveInteger(req.body.durationMinutes, 'durationMinutes')
      })
    );
  });

  router.post('/sessions', requireTeacher, (req, res) => {
    res.status(201).json(
      sessionService.createSessionWithCodes({
        examId: requiredText(req.body.examId, 'examId'),
        durationMinutes: positiveInteger(req.body.durationMinutes, 'durationMinutes'),
        codeCount: positiveInteger(req.body.codeCount, 'codeCount')
      })
    );
  });

  return router;
}
