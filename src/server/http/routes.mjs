import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { requireTeacher } from './auth.mjs';
import { config } from '../config.mjs';
import { issueTeacherToken, verifyTeacherPassword } from '../services/authService.mjs';
import { createCatalogRepository } from '../repositories/catalogRepository.mjs';
import { createExamRepository } from '../repositories/examRepository.mjs';
import { createSessionRepository } from '../repositories/sessionRepository.mjs';
import { writeResultsWorkbook } from '../services/excelExportService.mjs';
import { readQuestionRowsFromWorkbook, validateQuestionRows } from '../services/excelImportService.mjs';
import { createSessionService } from '../services/sessionService.mjs';
import { optionLabel, positiveInteger, requiredText } from '../services/validation.mjs';

function createUpload(runtimeConfig) {
  const importTmpDir = path.join(runtimeConfig.dataDir, 'tmp-imports');
  fs.mkdirSync(importTmpDir, { recursive: true });
  return multer({ dest: importTmpDir });
}

export function createRoutes(db, runtimeConfig = config) {
  const router = express.Router();
  const catalog = createCatalogRepository(db);
  const exams = createExamRepository(db);
  const sessions = createSessionRepository(db);
  const sessionService = createSessionService({ exams, sessions });
  const upload = createUpload(runtimeConfig);

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

  router.get('/courses', requireTeacher, (req, res) => {
    res.json({ items: catalog.listCourses(requiredText(req.query.semesterId, 'semesterId')) });
  });

  router.post('/classes', requireTeacher, (req, res) => {
    res.status(201).json(
      catalog.createClass({
        courseId: requiredText(req.body.courseId, 'courseId'),
        name: requiredText(req.body.name, 'name')
      })
    );
  });

  router.get('/classes', requireTeacher, (req, res) => {
    res.json({ items: catalog.listClasses(requiredText(req.query.courseId, 'courseId')) });
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

  router.get('/exams', requireTeacher, (req, res) => {
    res.json({ items: exams.listExams(requiredText(req.query.classId, 'classId')) });
  });

  router.post('/exams/:examId/questions', requireTeacher, (req, res) => {
    res.status(201).json(
      exams.addQuestion({
        examId: req.params.examId,
        questionText: requiredText(req.body.questionText, 'questionText'),
        position: positiveInteger(req.body.position, 'position'),
        options: {
          A: requiredText(req.body.options?.A, 'option A'),
          B: requiredText(req.body.options?.B, 'option B'),
          C: requiredText(req.body.options?.C, 'option C'),
          D: requiredText(req.body.options?.D, 'option D')
        },
        correctLabel: optionLabel(req.body.correctLabel, 'correctLabel'),
        imageId: req.body.imageId || null
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

  router.get('/sessions/:sessionId/students', requireTeacher, (req, res) => {
    res.json({ items: sessions.listStudents(req.params.sessionId) });
  });

  router.post('/sessions/:sessionId/auto-assign', requireTeacher, (req, res) => {
    res.json({ items: sessionService.autoAssignExamCodes(req.params.sessionId) });
  });

  router.post('/sessions/:sessionId/start', requireTeacher, (req, res) => {
    res.json(sessionService.startSession(req.params.sessionId));
  });

  router.post('/sessions/:sessionId/end', requireTeacher, (req, res) => {
    res.json(sessionService.endSession(req.params.sessionId));
  });

  router.get('/sessions/:sessionId/export.xlsx', requireTeacher, async (req, res, next) => {
    try {
      const rows = sessions.getExportRows(req.params.sessionId);
      const filePath = path.join(runtimeConfig.exportDir, `session-${req.params.sessionId}.xlsx`);
      await writeResultsWorkbook({ filePath, ...rows });
      res.download(filePath);
    } catch (error) {
      next(error);
    }
  });

  router.post('/student/join', (req, res) => {
    const session = sessions.getSessionByRoomCode(requiredText(req.body.roomCode, 'roomCode'));
    if (!session) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    const student = sessions.joinStudent({
      sessionId: session.id,
      studentId: requiredText(req.body.studentId, 'studentId'),
      fullName: requiredText(req.body.fullName, 'fullName')
    });
    req.app.locals.realtime.broadcastSession(session.id, 'student.joined', { student });
    res.status(201).json({ session, student });
  });

  router.get('/student/:sessionStudentId/exam', (req, res) => {
    const rows = sessions.getCodeItemsForStudent(req.params.sessionStudentId);
    res.json({
      items: rows.map((row) => ({
        itemId: row.itemId,
        displayOrder: row.displayOrder,
        questionText: row.questionText,
        options: {
          A: row.optionAText,
          B: row.optionBText,
          C: row.optionCText,
          D: row.optionDText
        }
      }))
    });
  });

  router.post('/student/answer', (req, res) => {
    const result = sessionService.saveAnswer({
      sessionStudentId: requiredText(req.body.sessionStudentId, 'sessionStudentId'),
      examCodeItemId: requiredText(req.body.examCodeItemId, 'examCodeItemId'),
      selectedLabel: requiredText(req.body.selectedLabel, 'selectedLabel').toUpperCase()
    });
    req.app.locals.realtime.broadcastSession(req.body.sessionId, 'student.answerSaved', {
      sessionStudentId: req.body.sessionStudentId
    });
    res.json(result);
  });

  router.post('/student/submit', (req, res) => {
    const result = sessionService.submitStudent({
      sessionStudentId: requiredText(req.body.sessionStudentId, 'sessionStudentId')
    });
    req.app.locals.realtime.broadcastSession(req.body.sessionId, 'student.submitted', {
      sessionStudentId: req.body.sessionStudentId
    });
    res.json(result);
  });

  router.post('/student/violation', (req, res) => {
    const event = sessions.saveViolation({
      sessionStudentId: requiredText(req.body.sessionStudentId, 'sessionStudentId'),
      eventType: requiredText(req.body.eventType, 'eventType'),
      metadataJson: JSON.stringify(req.body.metadata || {})
    });
    req.app.locals.realtime.broadcastSession(requiredText(req.body.sessionId, 'sessionId'), 'student.violation', event);
    res.status(201).json(event);
  });

  router.post(
    '/exams/:examId/import-excel',
    requireTeacher,
    upload.fields([
      { name: 'excel', maxCount: 1 },
      { name: 'images', maxCount: 100 }
    ]),
    async (req, res, next) => {
      try {
        const excelFile = req.files?.excel?.[0];
        if (!excelFile) throw new Error('excel file is required');

        const imageFiles = req.files?.images || [];
        const imageNames = new Set(imageFiles.map((file) => file.originalname));
        const rows = await readQuestionRowsFromWorkbook(excelFile.path);
        const validation = validateQuestionRows(rows, imageNames);

        if (validation.errors.length) {
          res.status(400).json({ errors: validation.errors });
          return;
        }

        const saved = [];
        for (const [index, question] of validation.questions.entries()) {
          const imageFile = imageFiles.find((file) => file.originalname === question.imageName);
          const image = imageFile
            ? exams.addImage({
                examId: req.params.examId,
                originalName: imageFile.originalname,
                storedPath: imageFile.path,
                mimeType: imageFile.mimetype
              })
            : null;

          saved.push(
            exams.addQuestion({
              examId: req.params.examId,
              questionText: question.questionText,
              position: index + 1,
              options: question.options,
              correctLabel: question.correctLabel,
              imageId: image?.id || null
            })
          );
        }

        res.status(201).json({ imported: saved.length });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
