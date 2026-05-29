import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDatabase } from '../../src/server/db/database.mjs';

test('schema creates required tables and default settings', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exam-db-'));
  const db = createDatabase(path.join(dir, 'test.sqlite'));
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  const names = rows.map((row) => row.name);

  assert.deepEqual(names.filter((name) => !name.startsWith('sqlite_')), [
    'attempt_answers',
    'attempts',
    'classes',
    'connection_events',
    'courses',
    'exam_code_items',
    'exam_codes',
    'exam_sessions',
    'exams',
    'question_images',
    'question_options',
    'questions',
    'semesters',
    'session_students',
    'settings',
    'violation_events'
  ]);

  const setting = db.prepare("SELECT key, value FROM settings WHERE key = 'schema_version'").get();
  assert.equal(setting.value, '1');
  db.close();
});
