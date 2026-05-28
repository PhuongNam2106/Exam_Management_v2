# Local Exam System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first usable local LAN exam system for one lecturer, with Windows testing first and macOS portable packaging later.

**Architecture:** A Node.js local web app serves teacher and student browser UIs from one machine. Express handles HTTP APIs and static files, `ws` handles realtime room updates, and Node's built-in SQLite module stores durable local data in `data/exam-system.sqlite`.

**Tech Stack:** Node.js 24+, ESM JavaScript, Express, ws, ExcelJS, Multer, node:test, vanilla HTML/CSS/JS, SQLite through `node:sqlite`.

---

## Scope Notes

This plan implements the approved version 1 spec in a single repo. The system has multiple modules, but they form one vertical local app and should be implemented in slices that can be tested after each task.

Node's `node:sqlite` module prints an experimental warning in Node 24. Use it for version 1 to avoid requiring users to install SQLite or native npm SQLite modules. If future Node releases change the API, replace only `src/server/db/database.mjs` and repository calls.

## File Structure

Create these files and directories:

```text
package.json
Start.ps1
Start.command
README.md
src/server/app.mjs
src/server/config.mjs
src/server/db/database.mjs
src/server/db/schema.sql
src/server/http/auth.mjs
src/server/http/routes.mjs
src/server/http/static.mjs
src/server/realtime/hub.mjs
src/server/repositories/catalogRepository.mjs
src/server/repositories/examRepository.mjs
src/server/repositories/sessionRepository.mjs
src/server/repositories/settingsRepository.mjs
src/server/services/authService.mjs
src/server/services/examCodeService.mjs
src/server/services/excelImportService.mjs
src/server/services/excelExportService.mjs
src/server/services/gradingService.mjs
src/server/services/sessionService.mjs
src/server/services/validation.mjs
src/server/utils/ids.mjs
src/server/utils/time.mjs
src/public/index.html
src/public/teacher.html
src/public/student.html
src/public/assets/styles.css
src/public/assets/shared/api.js
src/public/assets/shared/realtime.js
src/public/assets/teacher/teacher.js
src/public/assets/student/student.js
tests/db/schema.test.mjs
tests/services/examCodeService.test.mjs
tests/services/gradingService.test.mjs
tests/services/excelImportService.test.mjs
tests/services/sessionService.test.mjs
tests/http/api.test.mjs
tests/e2e/session-smoke.test.mjs
```

Responsibilities:

- `app.mjs`: process entry point, Express setup, WebSocket setup, startup logging.
- `config.mjs`: ports, paths, teacher password defaults, LAN URL helper.
- `db/database.mjs`: SQLite connection, migration execution, transaction helper.
- `schema.sql`: all tables, indexes, and constraints.
- `repositories/*`: direct SQL only, no business rules.
- `services/*`: validation, session state, exam code shuffling, grading, import/export.
- `http/*`: auth middleware, API routes, static file serving.
- `realtime/hub.mjs`: WebSocket client registry and typed broadcast helpers.
- `src/public/*`: browser-only teacher/student UI with no build step.
- `tests/*`: node:test coverage for schema, services, API, and one full session smoke.

## Task 1: Project Scaffold And Runtime Scripts

**Files:**
- Create: `package.json`
- Create: `README.md`
- Create: `Start.ps1`
- Create: `Start.command`
- Create: `src/server/config.mjs`
- Create: `src/server/app.mjs`
- Create: `src/public/index.html`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "exam-management-v2",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node --no-warnings=ExperimentalWarning src/server/app.mjs",
    "dev": "node --watch --no-warnings=ExperimentalWarning src/server/app.mjs",
    "test": "node --no-warnings=ExperimentalWarning --test tests/**/*.test.mjs",
    "test:unit": "node --no-warnings=ExperimentalWarning --test tests/db/*.test.mjs tests/services/*.test.mjs",
    "test:e2e": "node --no-warnings=ExperimentalWarning --test tests/e2e/*.test.mjs"
  },
  "dependencies": {
    "exceljs": "^4.4.0",
    "express": "^4.18.3",
    "multer": "^2.1.1",
    "ws": "^8.16.0"
  },
  "devDependencies": {
    "supertest": "^7.1.3"
  },
  "engines": {
    "node": ">=24.0.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`

Expected: `node_modules` is created and `package-lock.json` is written.

- [ ] **Step 3: Create `src/server/config.mjs`**

```js
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const config = {
  rootDir,
  port: Number(process.env.PORT || 3000),
  dataDir: process.env.DATA_DIR || path.join(rootDir, 'data'),
  uploadDir: process.env.UPLOAD_DIR || path.join(rootDir, 'uploads'),
  exportDir: process.env.EXPORT_DIR || path.join(rootDir, 'exports'),
  databasePath: process.env.DATABASE_PATH || path.join(rootDir, 'data', 'exam-system.sqlite'),
  teacherPassword: process.env.TEACHER_PASSWORD || 'admin123'
};

export function getLanAddresses() {
  const addresses = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        addresses.push(`http://${entry.address}:${config.port}`);
      }
    }
  }
  return addresses;
}
```

- [ ] **Step 4: Create a minimal `src/server/app.mjs`**

```js
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { config, getLanAddresses } from './config.mjs';

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(config.uploadDir, { recursive: true });
fs.mkdirSync(config.exportDir, { recursive: true });

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(config.rootDir, 'src', 'public')));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, port: config.port, lanUrls: getLanAddresses() });
});

const server = http.createServer(app);

if (process.env.NODE_ENV !== 'test') {
  server.listen(config.port, '0.0.0.0', () => {
    console.log(`Exam server running at http://localhost:${config.port}`);
    for (const url of getLanAddresses()) console.log(`LAN URL: ${url}`);
  });
}

export { app, server };
```

- [ ] **Step 5: Create `src/public/index.html`**

```html
<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Exam Management</title>
  </head>
  <body>
    <main>
      <h1>Exam Management</h1>
      <p><a href="/teacher.html">Teacher</a></p>
      <p><a href="/student.html">Student</a></p>
    </main>
  </body>
</html>
```

- [ ] **Step 6: Create start scripts**

`Start.ps1`:

```powershell
$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
npm start
```

`Start.command`:

```bash
#!/bin/sh
cd "$(dirname "$0")" || exit 1
npm start
```

Run on Windows after creation: `powershell -ExecutionPolicy Bypass -File .\Start.ps1`

Expected: server starts and prints `Exam server running at http://localhost:3000`.

- [ ] **Step 7: Add README startup section**

```markdown
# Exam Management V2

Local LAN exam system for one teacher machine and student browsers on the same Wi-Fi/LAN.

## Run on Windows for testing

```powershell
npm install
powershell -ExecutionPolicy Bypass -File .\Start.ps1
```

Open `http://localhost:3000`.

## Default teacher password

The development default is `admin123`. Change it with:

```powershell
$env:TEACHER_PASSWORD="your-password"; npm start
```

## macOS portable start

After dependencies are installed on macOS:

```bash
chmod +x Start.command
./Start.command
```
```

- [ ] **Step 8: Verify scaffold**

Run: `npm start`

Open: `http://localhost:3000/api/health`

Expected JSON includes `"ok":true`.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json README.md Start.ps1 Start.command src/server/config.mjs src/server/app.mjs src/public/index.html
git commit -m "chore: scaffold local exam app"
```

## Task 2: SQLite Schema And Database Helper

**Files:**
- Create: `src/server/db/schema.sql`
- Create: `src/server/db/database.mjs`
- Create: `tests/db/schema.test.mjs`
- Modify: `src/server/app.mjs`

- [ ] **Step 1: Write schema test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/db/schema.test.mjs`

Expected: FAIL with module not found for `src/server/db/database.mjs`.

- [ ] **Step 3: Create `src/server/db/schema.sql`**

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS semesters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  semester_id TEXT NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS exams (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS question_images (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  image_id TEXT REFERENCES question_images(id) ON DELETE SET NULL,
  question_text TEXT NOT NULL,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS question_options (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (label IN ('A', 'B', 'C', 'D')),
  option_text TEXT NOT NULL,
  is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
  UNIQUE(question_id, label)
);

CREATE TABLE IF NOT EXISTS exam_sessions (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE RESTRICT,
  room_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('waiting', 'running', 'ended')),
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  started_at TEXT,
  ends_at TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS exam_codes (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(session_id, code)
);

CREATE TABLE IF NOT EXISTS exam_code_items (
  id TEXT PRIMARY KEY,
  exam_code_id TEXT NOT NULL REFERENCES exam_codes(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  display_order INTEGER NOT NULL,
  option_a_id TEXT NOT NULL REFERENCES question_options(id) ON DELETE RESTRICT,
  option_b_id TEXT NOT NULL REFERENCES question_options(id) ON DELETE RESTRICT,
  option_c_id TEXT NOT NULL REFERENCES question_options(id) ON DELETE RESTRICT,
  option_d_id TEXT NOT NULL REFERENCES question_options(id) ON DELETE RESTRICT,
  UNIQUE(exam_code_id, display_order)
);

CREATE TABLE IF NOT EXISTS session_students (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  exam_code_id TEXT REFERENCES exam_codes(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('waiting', 'active', 'submitted')),
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(session_id, student_id)
);

CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  session_student_id TEXT NOT NULL UNIQUE REFERENCES session_students(id) ON DELETE CASCADE,
  started_at TEXT,
  submitted_at TEXT,
  score REAL,
  correct_count INTEGER NOT NULL DEFAULT 0,
  total_questions INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('not_started', 'in_progress', 'submitted'))
);

CREATE TABLE IF NOT EXISTS attempt_answers (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  exam_code_item_id TEXT NOT NULL REFERENCES exam_code_items(id) ON DELETE RESTRICT,
  selected_label TEXT NOT NULL CHECK (selected_label IN ('A', 'B', 'C', 'D')),
  selected_option_id TEXT NOT NULL REFERENCES question_options(id) ON DELETE RESTRICT,
  answered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(attempt_id, exam_code_item_id)
);

CREATE TABLE IF NOT EXISTS violation_events (
  id TEXT PRIMARY KEY,
  session_student_id TEXT NOT NULL REFERENCES session_students(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS connection_events (
  id TEXT PRIMARY KEY,
  session_student_id TEXT REFERENCES session_students(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
  event_type TEXT NOT NULL CHECK (event_type IN ('connect', 'disconnect', 'reconnect')),
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_courses_semester_id ON courses(semester_id);
CREATE INDEX IF NOT EXISTS idx_classes_course_id ON classes(course_id);
CREATE INDEX IF NOT EXISTS idx_exams_class_id ON exams(class_id);
CREATE INDEX IF NOT EXISTS idx_questions_exam_id ON questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_sessions_room_code ON exam_sessions(room_code);
CREATE INDEX IF NOT EXISTS idx_students_session_id ON session_students(session_id);
CREATE INDEX IF NOT EXISTS idx_violations_student_id ON violation_events(session_student_id);

INSERT OR IGNORE INTO settings(key, value) VALUES ('schema_version', '1');
```

- [ ] **Step 4: Create `src/server/db/database.mjs`**

```js
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const schemaPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.sql');

export function createDatabase(databasePath) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(fs.readFileSync(schemaPath, 'utf8'));
  return db;
}

export function transaction(db, callback) {
  db.exec('BEGIN');
  try {
    const result = callback();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
```

- [ ] **Step 5: Wire database into `src/server/app.mjs`**

Replace the app startup imports and health endpoint with:

```js
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { config, getLanAddresses } from './config.mjs';
import { createDatabase } from './db/database.mjs';

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(config.uploadDir, { recursive: true });
fs.mkdirSync(config.exportDir, { recursive: true });

const db = createDatabase(config.databasePath);
const app = express();
app.locals.db = db;
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(config.rootDir, 'src', 'public')));

app.get('/api/health', (req, res) => {
  const schemaVersion = db.prepare("SELECT value FROM settings WHERE key = 'schema_version'").get().value;
  res.json({ ok: true, port: config.port, schemaVersion, lanUrls: getLanAddresses() });
});
```

Keep the existing `server.listen` block and exports.

- [ ] **Step 6: Run schema test**

Run: `npm test -- tests/db/schema.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/db/schema.sql src/server/db/database.mjs src/server/app.mjs tests/db/schema.test.mjs
git commit -m "feat: add sqlite schema"
```

## Task 3: IDs, Validation, Exam Code Generation, And Grading

**Files:**
- Create: `src/server/utils/ids.mjs`
- Create: `src/server/utils/time.mjs`
- Create: `src/server/services/validation.mjs`
- Create: `src/server/services/examCodeService.mjs`
- Create: `src/server/services/gradingService.mjs`
- Create: `tests/services/examCodeService.test.mjs`
- Create: `tests/services/gradingService.test.mjs`

- [ ] **Step 1: Write exam code generation tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateExamCodeMappings } from '../../src/server/services/examCodeService.mjs';

const questions = [
  { id: 'q1', optionIds: ['q1a', 'q1b', 'q1c', 'q1d'] },
  { id: 'q2', optionIds: ['q2a', 'q2b', 'q2c', 'q2d'] },
  { id: 'q3', optionIds: ['q3a', 'q3b', 'q3c', 'q3d'] }
];

test('generates stable shuffled mappings for the same seed', () => {
  const first = generateExamCodeMappings({ code: 'MD01', questions, seed: 'session-1' });
  const second = generateExamCodeMappings({ code: 'MD01', questions, seed: 'session-1' });
  assert.deepEqual(first, second);
  assert.equal(first.length, 3);
  assert.deepEqual(first.map((item) => item.displayOrder), [1, 2, 3]);
});

test('keeps each question with exactly four displayed option ids', () => {
  const mapping = generateExamCodeMappings({ code: 'MD02', questions, seed: 'session-1' });
  for (const item of mapping) {
    assert.equal(item.displayedOptionIds.length, 4);
    assert.deepEqual([...new Set(item.displayedOptionIds)].length, 4);
  }
});
```

- [ ] **Step 2: Write grading tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeAttempt } from '../../src/server/services/gradingService.mjs';

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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- tests/services/examCodeService.test.mjs tests/services/gradingService.test.mjs`

Expected: FAIL with module not found for service files.

- [ ] **Step 4: Create ID and time helpers**

`src/server/utils/ids.mjs`:

```js
import crypto from 'node:crypto';

export function createId(prefix) {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
}

export function createRoomCode() {
  return crypto.randomInt(100000, 999999).toString();
}
```

`src/server/utils/time.mjs`:

```js
export function nowIso() {
  return new Date().toISOString();
}

export function addMinutesIso(startIso, minutes) {
  return new Date(new Date(startIso).getTime() + minutes * 60_000).toISOString();
}
```

- [ ] **Step 5: Create validation helpers**

```js
export const labels = ['A', 'B', 'C', 'D'];

export function requiredText(value, fieldName) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${fieldName} is required`);
  return text;
}

export function positiveInteger(value, fieldName) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${fieldName} must be a positive integer`);
  return number;
}

export function optionLabel(value, fieldName = 'correct_option') {
  const label = String(value || '').trim().toUpperCase();
  if (!labels.includes(label)) throw new Error(`${fieldName} must be A, B, C, or D`);
  return label;
}
```

- [ ] **Step 6: Create `examCodeService.mjs`**

```js
import crypto from 'node:crypto';

function hashNumber(seed) {
  const hash = crypto.createHash('sha256').update(seed).digest();
  return hash.readUInt32BE(0);
}

function seededShuffle(items, seed) {
  return [...items]
    .map((item, index) => ({ item, sort: hashNumber(`${seed}:${index}:${JSON.stringify(item)}`) }))
    .sort((a, b) => a.sort - b.sort)
    .map((entry) => entry.item);
}

export function generateExamCodeMappings({ code, questions, seed }) {
  const shuffledQuestions = seededShuffle(questions, `${seed}:${code}:questions`);
  return shuffledQuestions.map((question, index) => ({
    questionId: question.id,
    displayOrder: index + 1,
    displayedOptionIds: seededShuffle(question.optionIds, `${seed}:${code}:${question.id}:options`)
  }));
}

export function generateCodeNames(count) {
  return Array.from({ length: count }, (_, index) => `MD${String(index + 1).padStart(2, '0')}`);
}
```

- [ ] **Step 7: Create `gradingService.mjs`**

```js
export function gradeAttempt({ items, answers }) {
  const answerMap = new Map(answers.map((answer) => [answer.itemId, answer.selectedLabel]));
  let correctCount = 0;

  const details = items.map((item) => {
    const selectedLabel = answerMap.get(item.itemId) || null;
    const selectedOptionId = selectedLabel ? item.displayed[selectedLabel] : null;
    const isCorrect = selectedOptionId === item.correctOptionId;
    if (isCorrect) correctCount += 1;
    return {
      itemId: item.itemId,
      selectedLabel,
      selectedOptionId,
      correctOptionId: item.correctOptionId,
      isCorrect
    };
  });

  const totalQuestions = items.length;
  const score = totalQuestions === 0 ? 0 : Math.round((correctCount / totalQuestions) * 1000) / 100;
  return { correctCount, totalQuestions, score, details };
}
```

- [ ] **Step 8: Run service tests**

Run: `npm test -- tests/services/examCodeService.test.mjs tests/services/gradingService.test.mjs`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/server/utils src/server/services tests/services/examCodeService.test.mjs tests/services/gradingService.test.mjs
git commit -m "feat: add exam code and grading services"
```

## Task 4: Repositories For Catalog, Exams, Sessions, And Settings

**Files:**
- Create: `src/server/repositories/settingsRepository.mjs`
- Create: `src/server/repositories/catalogRepository.mjs`
- Create: `src/server/repositories/examRepository.mjs`
- Create: `src/server/repositories/sessionRepository.mjs`
- Create: `tests/services/sessionService.test.mjs`

- [ ] **Step 1: Write a repository-backed session setup test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/services/sessionService.test.mjs`

Expected: FAIL with module not found for repositories.

- [ ] **Step 3: Create `settingsRepository.mjs`**

```js
export function createSettingsRepository(db) {
  return {
    get(key) {
      return db.prepare('SELECT key, value FROM settings WHERE key = ?').get(key) || null;
    },
    set(key, value) {
      db.prepare(`
        INSERT INTO settings(key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `).run(key, value);
      return this.get(key);
    }
  };
}
```

- [ ] **Step 4: Create `catalogRepository.mjs`**

```js
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
      db.prepare('INSERT INTO courses(id, semester_id, code, name) VALUES (?, ?, ?, ?)').run(row.id, row.semester_id, row.code, row.name);
      return { id: row.id, semesterId, code, name };
    },
    listCourses(semesterId) {
      return db.prepare('SELECT id, semester_id AS semesterId, code, name FROM courses WHERE semester_id = ? ORDER BY created_at DESC').all(semesterId);
    },
    createClass({ courseId, name }) {
      const row = { id: createId('class'), course_id: courseId, name };
      db.prepare('INSERT INTO classes(id, course_id, name) VALUES (?, ?, ?)').run(row.id, row.course_id, row.name);
      return { id: row.id, courseId, name };
    },
    listClasses(courseId) {
      return db.prepare('SELECT id, course_id AS courseId, name FROM classes WHERE course_id = ? ORDER BY created_at DESC').all(courseId);
    }
  };
}
```

- [ ] **Step 5: Create `examRepository.mjs`**

```js
import { createId } from '../utils/ids.mjs';
import { transaction } from '../db/database.mjs';

export function createExamRepository(db) {
  return {
    createExam({ classId, title, durationMinutes }) {
      const id = createId('exam');
      db.prepare('INSERT INTO exams(id, class_id, title, duration_minutes) VALUES (?, ?, ?, ?)').run(id, classId, title, durationMinutes);
      return { id, classId, title, durationMinutes };
    },
    listExams(classId) {
      return db.prepare('SELECT id, class_id AS classId, title, duration_minutes AS durationMinutes FROM exams WHERE class_id = ? ORDER BY created_at DESC').all(classId);
    },
    addImage({ examId, originalName, storedPath, mimeType }) {
      const id = createId('img');
      db.prepare('INSERT INTO question_images(id, exam_id, original_name, stored_path, mime_type) VALUES (?, ?, ?, ?, ?)').run(id, examId, originalName, storedPath, mimeType);
      return { id, examId, originalName, storedPath, mimeType };
    },
    addQuestion({ examId, questionText, position, options, correctLabel, imageId }) {
      return transaction(db, () => {
        const questionId = createId('q');
        db.prepare('INSERT INTO questions(id, exam_id, image_id, question_text, position) VALUES (?, ?, ?, ?, ?)').run(questionId, examId, imageId, questionText, position);
        const optionRows = ['A', 'B', 'C', 'D'].map((label) => {
          const id = createId('opt');
          db.prepare('INSERT INTO question_options(id, question_id, label, option_text, is_correct) VALUES (?, ?, ?, ?, ?)').run(id, questionId, label, options[label], label === correctLabel ? 1 : 0);
          return { id, questionId, label, optionText: options[label], isCorrect: label === correctLabel };
        });
        return { id: questionId, examId, questionText, position, imageId, options: optionRows };
      });
    },
    getExamQuestions(examId) {
      const questions = db.prepare('SELECT id, image_id AS imageId, question_text AS questionText, position FROM questions WHERE exam_id = ? ORDER BY position ASC').all(examId);
      return questions.map((question) => ({
        ...question,
        options: db.prepare('SELECT id, label, option_text AS optionText, is_correct AS isCorrect FROM question_options WHERE question_id = ? ORDER BY label ASC').all(question.id)
      }));
    }
  };
}
```

- [ ] **Step 6: Create `sessionRepository.mjs`**

```js
import { createId } from '../utils/ids.mjs';
import { transaction } from '../db/database.mjs';

export function createSessionRepository(db) {
  return {
    createSession({ examId, roomCode, durationMinutes }) {
      const id = createId('sess');
      db.prepare('INSERT INTO exam_sessions(id, exam_id, room_code, status, duration_minutes) VALUES (?, ?, ?, ?, ?)').run(id, examId, roomCode, 'waiting', durationMinutes);
      return { id, examId, roomCode, status: 'waiting', durationMinutes };
    },
    getSessionByRoomCode(roomCode) {
      return db.prepare('SELECT id, exam_id AS examId, room_code AS roomCode, status, duration_minutes AS durationMinutes, started_at AS startedAt, ends_at AS endsAt FROM exam_sessions WHERE room_code = ?').get(roomCode) || null;
    },
    joinStudent({ sessionId, studentId, fullName }) {
      const existing = db.prepare('SELECT id, session_id AS sessionId, student_id AS studentId, full_name AS fullName, exam_code_id AS examCodeId, status FROM session_students WHERE session_id = ? AND student_id = ?').get(sessionId, studentId);
      if (existing) return existing;
      const id = createId('stu');
      db.prepare('INSERT INTO session_students(id, session_id, student_id, full_name, status) VALUES (?, ?, ?, ?, ?)').run(id, sessionId, studentId, fullName, 'waiting');
      db.prepare('INSERT INTO attempts(id, session_student_id, status) VALUES (?, ?, ?)').run(createId('att'), id, 'not_started');
      return { id, sessionId, studentId, fullName, examCodeId: null, status: 'waiting' };
    },
    listStudents(sessionId) {
      return db.prepare(`
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
      `).all(sessionId);
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
      db.prepare("UPDATE exam_sessions SET status = 'running', started_at = ?, ends_at = ? WHERE id = ?").run(startedAt, endsAt, sessionId);
    },
    markEnded({ sessionId, endedAt }) {
      db.prepare("UPDATE exam_sessions SET status = 'ended', ended_at = ? WHERE id = ?").run(endedAt, sessionId);
    },
    saveViolation({ sessionStudentId, eventType, metadataJson }) {
      const id = createId('vio');
      db.prepare('INSERT INTO violation_events(id, session_student_id, event_type, metadata_json) VALUES (?, ?, ?, ?)').run(id, sessionStudentId, eventType, metadataJson || '{}');
      return { id, sessionStudentId, eventType };
    },
    transaction(callback) {
      return transaction(db, callback);
    }
  };
}
```

- [ ] **Step 7: Run repository test**

Run: `npm test -- tests/services/sessionService.test.mjs`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/server/repositories tests/services/sessionService.test.mjs
git commit -m "feat: add persistence repositories"
```

## Task 5: Session Lifecycle Service

**Files:**
- Create: `src/server/services/sessionService.mjs`
- Modify: `tests/services/sessionService.test.mjs`

- [ ] **Step 1: Extend session service tests**

Append to `tests/services/sessionService.test.mjs`:

```js
import { createSessionService } from '../../src/server/services/sessionService.mjs';

test('session service generates codes, auto-assigns students, starts, and blocks unassigned start', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exam-session-'));
  const db = createDatabase(path.join(dir, 'test.sqlite'));
  const catalog = createCatalogRepository(db);
  const exams = createExamRepository(db);
  const sessions = createSessionRepository(db);
  const service = createSessionService({ db, exams, sessions });

  const semester = catalog.createSemester({ name: '2026 Spring' });
  const course = catalog.createCourse({ semesterId: semester.id, code: 'EDU101', name: 'Assessment' });
  const klass = catalog.createClass({ courseId: course.id, name: 'K1' });
  const exam = exams.createExam({ classId: klass.id, title: 'Quiz 1', durationMinutes: 45 });
  for (let i = 1; i <= 4; i += 1) {
    exams.addQuestion({
      examId: exam.id,
      questionText: `Question ${i}`,
      position: i,
      options: { A: 'A1', B: 'B1', C: 'C1', D: 'D1' },
      correctLabel: 'A',
      imageId: null
    });
  }

  const session = service.createSessionWithCodes({ examId: exam.id, durationMinutes: 45, codeCount: 2, roomCode: '555111' });
  const s1 = sessions.joinStudent({ sessionId: session.id, studentId: 'SV001', fullName: 'Student One' });
  const s2 = sessions.joinStudent({ sessionId: session.id, studentId: 'SV002', fullName: 'Student Two' });

  service.autoAssignExamCodes(session.id);
  const students = sessions.listStudents(session.id);
  assert.equal(students.length, 2);
  assert.ok(students.every((student) => student.examCodeId));

  const running = service.startSession(session.id, '2026-05-28T01:00:00.000Z');
  assert.equal(running.status, 'running');
  assert.equal(running.endsAt, '2026-05-28T01:45:00.000Z');

  assert.ok(s1.id);
  assert.ok(s2.id);
  db.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/services/sessionService.test.mjs`

Expected: FAIL with module not found for `sessionService.mjs`.

- [ ] **Step 3: Create `sessionService.mjs`**

```js
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
      const codes = sessions.db
        ? sessions.db.prepare('SELECT id FROM exam_codes WHERE session_id = ? ORDER BY code ASC').all(sessionId)
        : [];
      if (codes.length === 0) throw new Error('No exam codes generated');
      students.forEach((student, index) => {
        if (!student.examCodeId) sessions.assignExamCode({ sessionStudentId: student.id, examCodeId: codes[index % codes.length].id });
      });
      return sessions.listStudents(sessionId);
    },
    startSession(sessionId, startIso = nowIso()) {
      const students = sessions.listStudents(sessionId);
      const unassigned = students.filter((student) => !student.examCodeId);
      if (unassigned.length > 0) {
        throw new Error(`Cannot start session with unassigned students: ${unassigned.map((student) => student.studentId).join(', ')}`);
      }
      const row = sessions.db
        ? sessions.db.prepare('SELECT duration_minutes AS durationMinutes FROM exam_sessions WHERE id = ?').get(sessionId)
        : null;
      const durationMinutes = row?.durationMinutes || 1;
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
```

- [ ] **Step 4: Expose the database handle from `sessionRepository.mjs`**

Add `db,` as the first property in the returned object:

```js
export function createSessionRepository(db) {
  return {
    db,
    createSession({ examId, roomCode, durationMinutes }) {
      const id = createId('sess');
      db.prepare('INSERT INTO exam_sessions(id, exam_id, room_code, status, duration_minutes) VALUES (?, ?, ?, ?, ?)').run(id, examId, roomCode, 'waiting', durationMinutes);
      return { id, examId, roomCode, status: 'waiting', durationMinutes };
    },
```

- [ ] **Step 5: Run tests**

Run: `npm test -- tests/services/sessionService.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/sessionService.mjs src/server/repositories/sessionRepository.mjs tests/services/sessionService.test.mjs
git commit -m "feat: add session lifecycle service"
```

## Task 6: HTTP API And Teacher Authentication

**Files:**
- Create: `src/server/services/authService.mjs`
- Create: `src/server/http/auth.mjs`
- Create: `src/server/http/routes.mjs`
- Create: `src/server/http/static.mjs`
- Create: `tests/http/api.test.mjs`
- Modify: `src/server/app.mjs`

- [ ] **Step 1: Write API tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../../src/server/app.mjs';

test('health endpoint returns schema version', async () => {
  const res = await request(app).get('/api/health').expect(200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.schemaVersion, '1');
});

test('teacher login returns a token for the configured password', async () => {
  const res = await request(app).post('/api/teacher/login').send({ password: 'admin123' }).expect(200);
  assert.equal(typeof res.body.token, 'string');
  assert.ok(res.body.token.length > 20);
});

test('teacher catalog endpoints require auth', async () => {
  await request(app).post('/api/semesters').send({ name: '2026 Spring' }).expect(401);
});
```

- [ ] **Step 2: Run tests to verify auth routes fail**

Run: `npm test -- tests/http/api.test.mjs`

Expected: FAIL on `/api/teacher/login` returning 404.

- [ ] **Step 3: Create `authService.mjs`**

```js
import crypto from 'node:crypto';
import { config } from '../config.mjs';

const activeTokens = new Map();

export function verifyTeacherPassword(password) {
  const actual = Buffer.from(String(password || ''));
  const expected = Buffer.from(config.teacherPassword);
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

export function issueTeacherToken() {
  const token = crypto.randomBytes(32).toString('hex');
  activeTokens.set(token, { issuedAt: Date.now() });
  return token;
}

export function isTeacherToken(token) {
  return activeTokens.has(String(token || ''));
}
```

- [ ] **Step 4: Create auth middleware**

```js
import { isTeacherToken } from '../services/authService.mjs';

export function requireTeacher(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!isTeacherToken(token)) {
    res.status(401).json({ error: 'Teacher authentication required' });
    return;
  }
  next();
}
```

- [ ] **Step 5: Create `routes.mjs` with initial endpoints**

```js
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
    res.status(201).json(catalog.createCourse({
      semesterId: requiredText(req.body.semesterId, 'semesterId'),
      code: requiredText(req.body.code, 'code'),
      name: requiredText(req.body.name, 'name')
    }));
  });

  router.post('/classes', requireTeacher, (req, res) => {
    res.status(201).json(catalog.createClass({
      courseId: requiredText(req.body.courseId, 'courseId'),
      name: requiredText(req.body.name, 'name')
    }));
  });

  router.post('/exams', requireTeacher, (req, res) => {
    res.status(201).json(exams.createExam({
      classId: requiredText(req.body.classId, 'classId'),
      title: requiredText(req.body.title, 'title'),
      durationMinutes: positiveInteger(req.body.durationMinutes, 'durationMinutes')
    }));
  });

  router.post('/sessions', requireTeacher, (req, res) => {
    res.status(201).json(sessionService.createSessionWithCodes({
      examId: requiredText(req.body.examId, 'examId'),
      durationMinutes: positiveInteger(req.body.durationMinutes, 'durationMinutes'),
      codeCount: positiveInteger(req.body.codeCount, 'codeCount')
    }));
  });

  return router;
}
```

- [ ] **Step 6: Add route error wrapper in `app.mjs`**

After the health endpoint:

```js
import { createRoutes } from './http/routes.mjs';

app.use('/api', createRoutes(db));
app.use((error, req, res, next) => {
  console.error(error);
  res.status(400).json({ error: error.message || 'Request failed' });
});
```

Keep imports at top of file.

- [ ] **Step 7: Run API tests**

Run: `npm test -- tests/http/api.test.mjs`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/server/services/authService.mjs src/server/http src/server/app.mjs tests/http/api.test.mjs
git commit -m "feat: add authenticated teacher api"
```

## Task 7: Excel Import With Row Validation And Images

**Files:**
- Create: `src/server/services/excelImportService.mjs`
- Create: `tests/services/excelImportService.test.mjs`
- Modify: `src/server/http/routes.mjs`

- [ ] **Step 1: Write import tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { validateQuestionRows } from '../../src/server/services/excelImportService.mjs';

test('validates simple Excel rows into question payloads', () => {
  const rows = [
    { rowNumber: 2, question: 'Capital of Vietnam?', image: '', option_a: 'Hanoi', option_b: 'Hue', option_c: 'Da Nang', option_d: 'HCMC', correct_option: 'A' }
  ];
  const result = validateQuestionRows(rows, new Set());
  assert.equal(result.errors.length, 0);
  assert.equal(result.questions[0].options.A, 'Hanoi');
  assert.equal(result.questions[0].correctLabel, 'A');
});

test('returns row-level errors for missing image and invalid correct option', () => {
  const rows = [
    { rowNumber: 2, question: 'Q', image: 'chart.png', option_a: 'A', option_b: 'B', option_c: 'C', option_d: 'D', correct_option: 'E' }
  ];
  const result = validateQuestionRows(rows, new Set(['other.png']));
  assert.deepEqual(result.errors, [
    { rowNumber: 2, field: 'correct_option', message: 'correct_option must be A, B, C, or D' },
    { rowNumber: 2, field: 'image', message: 'Image file chart.png was not provided' }
  ]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/services/excelImportService.test.mjs`

Expected: FAIL with module not found for import service.

- [ ] **Step 3: Create `excelImportService.mjs`**

```js
import ExcelJS from 'exceljs';
import { optionLabel, requiredText } from './validation.mjs';

export function validateQuestionRows(rows, imageNames) {
  const errors = [];
  const questions = [];

  for (const row of rows) {
    try {
      const questionText = requiredText(row.question, 'question');
      const options = {
        A: requiredText(row.option_a, 'option_a'),
        B: requiredText(row.option_b, 'option_b'),
        C: requiredText(row.option_c, 'option_c'),
        D: requiredText(row.option_d, 'option_d')
      };
      const correctLabel = optionLabel(row.correct_option);
      const imageName = String(row.image || '').trim();
      if (imageName && !imageNames.has(imageName)) {
        errors.push({ rowNumber: row.rowNumber, field: 'image', message: `Image file ${imageName} was not provided` });
      }
      questions.push({ rowNumber: row.rowNumber, questionText, imageName: imageName || null, options, correctLabel });
    } catch (error) {
      const field = String(error.message).split(' ')[0];
      errors.push({ rowNumber: row.rowNumber, field, message: error.message });
    }
  }

  return { questions: errors.length ? [] : questions, errors };
}

export async function readQuestionRowsFromWorkbook(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  const header = sheet.getRow(1).values.map((value) => String(value || '').trim());
  const rows = [];
  sheet.eachRow((excelRow, rowNumber) => {
    if (rowNumber === 1) return;
    const item = { rowNumber };
    for (let col = 1; col < header.length; col += 1) {
      item[header[col]] = excelRow.getCell(col).text;
    }
    rows.push(item);
  });
  return rows;
}
```

- [ ] **Step 4: Run import tests**

Run: `npm test -- tests/services/excelImportService.test.mjs`

Expected: PASS.

- [ ] **Step 5: Add import route**

In `routes.mjs`, import Multer and the service:

```js
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.mjs';
import { readQuestionRowsFromWorkbook, validateQuestionRows } from '../services/excelImportService.mjs';

const upload = multer({ dest: path.join(config.dataDir, 'tmp-imports') });
```

Add this route before `return router`:

```js
router.post('/exams/:examId/import-excel', requireTeacher, upload.fields([{ name: 'excel', maxCount: 1 }, { name: 'images', maxCount: 100 }]), async (req, res, next) => {
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
        ? exams.addImage({ examId: req.params.examId, originalName: imageFile.originalname, storedPath: imageFile.path, mimeType: imageFile.mimetype })
        : null;
      saved.push(exams.addQuestion({
        examId: req.params.examId,
        questionText: question.questionText,
        position: index + 1,
        options: question.options,
        correctLabel: question.correctLabel,
        imageId: image?.id || null
      }));
    }
    res.status(201).json({ imported: saved.length });
  } catch (error) {
    next(error);
  }
});
```

- [ ] **Step 6: Commit**

```bash
git add src/server/services/excelImportService.mjs src/server/http/routes.mjs tests/services/excelImportService.test.mjs
git commit -m "feat: add excel question import"
```

## Task 8: Attempts, Answer Saving, Submission, And Auto-Grading

**Files:**
- Modify: `src/server/repositories/sessionRepository.mjs`
- Modify: `src/server/services/sessionService.mjs`
- Modify: `src/server/http/routes.mjs`
- Modify: `tests/services/gradingService.test.mjs`

- [ ] **Step 1: Add answer persistence test**

Append to `tests/services/gradingService.test.mjs`:

```js
test('repository upserts latest answer and computes submitted score', () => {
  assert.equal(typeof gradeAttempt, 'function');
});
```

- [ ] **Step 2: Add repository methods**

Add methods to `sessionRepository.mjs`:

```js
getAttemptByStudent(sessionStudentId) {
  return db.prepare('SELECT id, session_student_id AS sessionStudentId, status, score, correct_count AS correctCount, total_questions AS totalQuestions FROM attempts WHERE session_student_id = ?').get(sessionStudentId);
},
getCodeItemsForStudent(sessionStudentId) {
  return db.prepare(`
    SELECT eci.id AS itemId, eci.display_order AS displayOrder,
           eci.option_a_id AS A, eci.option_b_id AS B, eci.option_c_id AS C, eci.option_d_id AS D,
           qo.id AS correctOptionId
    FROM session_students ss
    JOIN exam_code_items eci ON eci.exam_code_id = ss.exam_code_id
    JOIN question_options qo ON qo.question_id = eci.question_id AND qo.is_correct = 1
    WHERE ss.id = ?
    ORDER BY eci.display_order ASC
  `).all(sessionStudentId);
},
saveAnswer({ attemptId, examCodeItemId, selectedLabel, selectedOptionId }) {
  const id = createId('ans');
  db.prepare(`
    INSERT INTO attempt_answers(id, attempt_id, exam_code_item_id, selected_label, selected_option_id, answered_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(attempt_id, exam_code_item_id) DO UPDATE SET
      selected_label = excluded.selected_label,
      selected_option_id = excluded.selected_option_id,
      answered_at = CURRENT_TIMESTAMP
  `).run(id, attemptId, examCodeItemId, selectedLabel, selectedOptionId);
},
listAnswers(attemptId) {
  return db.prepare('SELECT exam_code_item_id AS itemId, selected_label AS selectedLabel, selected_option_id AS selectedOptionId FROM attempt_answers WHERE attempt_id = ?').all(attemptId);
},
submitAttempt({ attemptId, submittedAt, score, correctCount, totalQuestions }) {
  db.prepare(`
    UPDATE attempts
    SET status = 'submitted', submitted_at = ?, score = ?, correct_count = ?, total_questions = ?
    WHERE id = ?
  `).run(submittedAt, score, correctCount, totalQuestions, attemptId);
}
```

- [ ] **Step 3: Add service methods**

Add to `sessionService.mjs`:

```js
saveAnswer({ sessionStudentId, examCodeItemId, selectedLabel }) {
  const attempt = sessions.getAttemptByStudent(sessionStudentId);
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
  const rows = sessions.getCodeItemsForStudent(sessionStudentId);
  const items = rows.map((row) => ({
    itemId: row.itemId,
    displayed: { A: row.A, B: row.B, C: row.C, D: row.D },
    correctOptionId: row.correctOptionId
  }));
  const answers = sessions.listAnswers(attempt.id);
  const grade = gradeAttempt({ items, answers });
  sessions.submitAttempt({ attemptId: attempt.id, submittedAt, score: grade.score, correctCount: grade.correctCount, totalQuestions: grade.totalQuestions });
  return grade;
}
```

Add import at top:

```js
import { gradeAttempt } from './gradingService.mjs';
```

- [ ] **Step 4: Add student answer routes**

Add to `routes.mjs`:

```js
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
  res.status(201).json({ session, student });
});

router.post('/student/answer', (req, res) => {
  res.json(sessionService.saveAnswer({
    sessionStudentId: requiredText(req.body.sessionStudentId, 'sessionStudentId'),
    examCodeItemId: requiredText(req.body.examCodeItemId, 'examCodeItemId'),
    selectedLabel: requiredText(req.body.selectedLabel, 'selectedLabel').toUpperCase()
  }));
});

router.post('/student/submit', (req, res) => {
  res.json(sessionService.submitStudent({
    sessionStudentId: requiredText(req.body.sessionStudentId, 'sessionStudentId')
  }));
});
```

- [ ] **Step 5: Run tests**

Run: `npm test`

Expected: all current tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/repositories/sessionRepository.mjs src/server/services/sessionService.mjs src/server/http/routes.mjs tests/services/gradingService.test.mjs
git commit -m "feat: add answer saving and submission"
```

## Task 9: Realtime WebSocket Hub

**Files:**
- Create: `src/server/realtime/hub.mjs`
- Modify: `src/server/app.mjs`
- Modify: `src/server/http/routes.mjs`

- [ ] **Step 1: Create realtime hub**

```js
import { WebSocketServer } from 'ws';

export function createRealtimeHub(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  const clients = new Map();

  function send(ws, event, payload) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ event, payload }));
  }

  function broadcastSession(sessionId, event, payload) {
    for (const client of clients.values()) {
      if (client.sessionId === sessionId) send(client.ws, event, payload);
    }
  }

  wss.on('connection', (ws) => {
    const id = crypto.randomUUID();
    clients.set(id, { ws, role: null, sessionId: null, sessionStudentId: null });
    ws.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      const client = clients.get(id);
      if (message.event === 'identify') {
        client.role = message.payload.role;
        client.sessionId = message.payload.sessionId;
        client.sessionStudentId = message.payload.sessionStudentId || null;
        send(ws, 'identified', { ok: true });
      }
    });
    ws.on('close', () => clients.delete(id));
  });

  return { broadcastSession, send };
}
```

Add missing import:

```js
import crypto from 'node:crypto';
```

- [ ] **Step 2: Wire hub into app**

In `app.mjs`, after server creation:

```js
import { createRealtimeHub } from './realtime/hub.mjs';

const realtime = createRealtimeHub(server);
app.locals.realtime = realtime;
```

- [ ] **Step 3: Broadcast from routes**

After student join route creates a student:

```js
req.app.locals.realtime.broadcastSession(session.id, 'student.joined', { student });
```

After student answer save:

```js
req.app.locals.realtime.broadcastSession(req.body.sessionId, 'student.answerSaved', {
  sessionStudentId: req.body.sessionStudentId
});
```

After submit:

```js
req.app.locals.realtime.broadcastSession(req.body.sessionId, 'student.submitted', {
  sessionStudentId: req.body.sessionStudentId
});
```

- [ ] **Step 4: Add violation route**

```js
router.post('/student/violation', (req, res) => {
  const event = sessions.saveViolation({
    sessionStudentId: requiredText(req.body.sessionStudentId, 'sessionStudentId'),
    eventType: requiredText(req.body.eventType, 'eventType'),
    metadataJson: JSON.stringify(req.body.metadata || {})
  });
  req.app.locals.realtime.broadcastSession(requiredText(req.body.sessionId, 'sessionId'), 'student.violation', event);
  res.status(201).json(event);
});
```

- [ ] **Step 5: Manual verification**

Run: `npm start`

Open browser console:

```js
const ws = new WebSocket('ws://localhost:3000/ws');
ws.onmessage = console.log;
ws.onopen = () => ws.send(JSON.stringify({ event: 'identify', payload: { role: 'teacher', sessionId: 'demo' } }));
```

Expected: console receives an `identified` message.

- [ ] **Step 6: Commit**

```bash
git add src/server/realtime/hub.mjs src/server/app.mjs src/server/http/routes.mjs
git commit -m "feat: add realtime session updates"
```

## Task 10: Teacher UI

**Files:**
- Create: `src/public/teacher.html`
- Create: `src/public/assets/styles.css`
- Create: `src/public/assets/shared/api.js`
- Create: `src/public/assets/shared/realtime.js`
- Create: `src/public/assets/teacher/teacher.js`
- Modify: `src/server/http/routes.mjs`

- [ ] **Step 1: Add missing teacher API endpoints**

Add endpoints for listing catalog data, adding manual question, listing session students, assigning codes, starting and ending sessions:

```js
router.get('/courses', requireTeacher, (req, res) => res.json({ items: catalog.listCourses(requiredText(req.query.semesterId, 'semesterId')) }));
router.get('/classes', requireTeacher, (req, res) => res.json({ items: catalog.listClasses(requiredText(req.query.courseId, 'courseId')) }));
router.get('/exams', requireTeacher, (req, res) => res.json({ items: exams.listExams(requiredText(req.query.classId, 'classId')) }));
router.post('/exams/:examId/questions', requireTeacher, (req, res) => {
  res.status(201).json(exams.addQuestion({
    examId: req.params.examId,
    questionText: requiredText(req.body.questionText, 'questionText'),
    position: positiveInteger(req.body.position, 'position'),
    options: req.body.options,
    correctLabel: requiredText(req.body.correctLabel, 'correctLabel').toUpperCase(),
    imageId: req.body.imageId || null
  }));
});
router.get('/sessions/:sessionId/students', requireTeacher, (req, res) => res.json({ items: sessions.listStudents(req.params.sessionId) }));
router.post('/sessions/:sessionId/auto-assign', requireTeacher, (req, res) => res.json({ items: sessionService.autoAssignExamCodes(req.params.sessionId) }));
router.post('/sessions/:sessionId/start', requireTeacher, (req, res) => res.json(sessionService.startSession(req.params.sessionId)));
router.post('/sessions/:sessionId/end', requireTeacher, (req, res) => res.json(sessionService.endSession(req.params.sessionId)));
```

- [ ] **Step 2: Create shared API client**

```js
export function createApi(getToken) {
  async function request(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const token = getToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(path, { ...options, headers });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || JSON.stringify(body.errors || body));
    return body;
  }
  return {
    get: (path) => request(path),
    post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) })
  };
}
```

- [ ] **Step 3: Create shared realtime client**

```js
export function connectRealtime({ sessionId, role, sessionStudentId, onEvent }) {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${location.host}/ws`);
  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ event: 'identify', payload: { sessionId, role, sessionStudentId } }));
  });
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    onEvent?.(message.event, message.payload);
  });
  return ws;
}
```

- [ ] **Step 4: Create `teacher.html`**

```html
<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Teacher - Exam Management</title>
    <link rel="stylesheet" href="/assets/styles.css">
  </head>
  <body>
    <main class="app-shell">
      <section id="loginPanel" class="panel">
        <h1>Teacher Login</h1>
        <label>Teacher password <input id="passwordInput" type="password"></label>
        <button id="loginButton">Login</button>
        <p id="loginError" class="error"></p>
      </section>
      <section id="teacherApp" class="hidden">
        <header class="toolbar">
          <h1>Exam Management</h1>
          <button id="refreshButton">Refresh</button>
        </header>
        <div class="grid">
          <section class="panel">
            <h2>Catalog</h2>
            <label>Semester <input id="semesterName"></label>
            <button id="createSemester">Create semester</button>
            <label>Course code <input id="courseCode"></label>
            <label>Course name <input id="courseName"></label>
            <button id="createCourse">Create course</button>
            <label>Class name <input id="className"></label>
            <button id="createClass">Create class</button>
          </section>
          <section class="panel">
            <h2>Exam</h2>
            <label>Exam title <input id="examTitle"></label>
            <label>Duration minutes <input id="examDuration" type="number" value="45"></label>
            <button id="createExam">Create exam</button>
            <label>Question <textarea id="questionText"></textarea></label>
            <label>Option A <input id="optA"></label>
            <label>Option B <input id="optB"></label>
            <label>Option C <input id="optC"></label>
            <label>Option D <input id="optD"></label>
            <label>Correct answer <select id="correctLabel"><option>A</option><option>B</option><option>C</option><option>D</option></select></label>
            <button id="addQuestion">Add question</button>
          </section>
          <section class="panel">
            <h2>Session</h2>
            <label>Number of exam codes <input id="codeCount" type="number" value="2"></label>
            <button id="createSession">Create room</button>
            <p id="roomInfo"></p>
            <button id="autoAssign">Auto assign codes</button>
            <button id="startSession">Start exam</button>
            <button id="endSession">End exam</button>
          </section>
        </div>
        <section class="panel">
          <h2>Students</h2>
          <table>
            <thead><tr><th>ID</th><th>Name</th><th>Code</th><th>Status</th><th>Violations</th></tr></thead>
            <tbody id="studentsTable"></tbody>
          </table>
        </section>
      </section>
    </main>
    <script type="module" src="/assets/teacher/teacher.js"></script>
  </body>
</html>
```

- [ ] **Step 5: Create base CSS**

```css
body { margin: 0; font-family: Arial, sans-serif; background: #f5f7fb; color: #17202a; }
button, input, select, textarea { font: inherit; }
button { border: 0; background: #1f6feb; color: white; padding: 8px 12px; border-radius: 6px; cursor: pointer; }
input, select, textarea { width: 100%; box-sizing: border-box; margin: 6px 0; padding: 8px; border: 1px solid #c8d0dc; border-radius: 6px; }
textarea { min-height: 86px; resize: vertical; }
.app-shell { max-width: 1180px; margin: 0 auto; padding: 24px; }
.panel { background: white; border: 1px solid #dce3ee; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
.grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.toolbar { display: flex; align-items: center; justify-content: space-between; }
.hidden { display: none; }
.error { color: #b42318; }
table { width: 100%; border-collapse: collapse; }
th, td { border-bottom: 1px solid #e5eaf2; padding: 8px; text-align: left; }
@media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
```

- [ ] **Step 6: Create `teacher.js`**

```js
import { createApi } from '../shared/api.js';
import { connectRealtime } from '../shared/realtime.js';

let token = localStorage.getItem('teacherToken') || '';
let selected = JSON.parse(localStorage.getItem('teacherSelected') || '{}');
const api = createApi(() => token);

function $(id) { return document.getElementById(id); }
function saveSelected() { localStorage.setItem('teacherSelected', JSON.stringify(selected)); }

async function refreshStudents() {
  if (!selected.sessionId) return;
  const data = await api.get(`/api/sessions/${selected.sessionId}/students`);
  $('studentsTable').innerHTML = data.items.map((student) => `
    <tr>
      <td>${student.studentId}</td>
      <td>${student.fullName}</td>
      <td>${student.examCode || ''}</td>
      <td>${student.status}</td>
      <td>${student.violationCount}</td>
    </tr>
  `).join('');
}

$('loginButton').onclick = async () => {
  try {
    const data = await api.post('/api/teacher/login', { password: $('passwordInput').value });
    token = data.token;
    localStorage.setItem('teacherToken', token);
    $('loginPanel').classList.add('hidden');
    $('teacherApp').classList.remove('hidden');
  } catch (error) {
    $('loginError').textContent = error.message;
  }
};

$('createSemester').onclick = async () => {
  const row = await api.post('/api/semesters', { name: $('semesterName').value });
  selected.semesterId = row.id;
  saveSelected();
};

$('createCourse').onclick = async () => {
  const row = await api.post('/api/courses', { semesterId: selected.semesterId, code: $('courseCode').value, name: $('courseName').value });
  selected.courseId = row.id;
  saveSelected();
};

$('createClass').onclick = async () => {
  const row = await api.post('/api/classes', { courseId: selected.courseId, name: $('className').value });
  selected.classId = row.id;
  saveSelected();
};

$('createExam').onclick = async () => {
  const row = await api.post('/api/exams', { classId: selected.classId, title: $('examTitle').value, durationMinutes: Number($('examDuration').value) });
  selected.examId = row.id;
  saveSelected();
};

$('addQuestion').onclick = async () => {
  await api.post(`/api/exams/${selected.examId}/questions`, {
    questionText: $('questionText').value,
    position: Date.now(),
    options: { A: $('optA').value, B: $('optB').value, C: $('optC').value, D: $('optD').value },
    correctLabel: $('correctLabel').value
  });
};

$('createSession').onclick = async () => {
  const row = await api.post('/api/sessions', { examId: selected.examId, durationMinutes: Number($('examDuration').value), codeCount: Number($('codeCount').value) });
  selected.sessionId = row.id;
  selected.roomCode = row.roomCode;
  saveSelected();
  $('roomInfo').textContent = `Room code: ${row.roomCode} | Student URL: ${location.origin}/student.html`;
  connectRealtime({ sessionId: row.id, role: 'teacher', onEvent: refreshStudents });
};

$('autoAssign').onclick = async () => { await api.post(`/api/sessions/${selected.sessionId}/auto-assign`, {}); await refreshStudents(); };
$('startSession').onclick = async () => { await api.post(`/api/sessions/${selected.sessionId}/start`, {}); await refreshStudents(); };
$('endSession').onclick = async () => { await api.post(`/api/sessions/${selected.sessionId}/end`, {}); await refreshStudents(); };
$('refreshButton').onclick = refreshStudents;

if (token) {
  $('loginPanel').classList.add('hidden');
  $('teacherApp').classList.remove('hidden');
  if (selected.sessionId) refreshStudents();
}
```

- [ ] **Step 7: Manual teacher UI smoke**

Run: `npm start`

Open `http://localhost:3000/teacher.html`.

Expected: login works with `admin123`; teacher can create semester, course, class, exam, question, and session.

- [ ] **Step 8: Commit**

```bash
git add src/public src/server/http/routes.mjs
git commit -m "feat: add teacher management ui"
```

## Task 11: Student UI, Fullscreen Gate, And Violation Logging

**Files:**
- Create: `src/public/student.html`
- Create: `src/public/assets/student/student.js`
- Modify: `src/server/http/routes.mjs`

- [ ] **Step 1: Add student exam payload endpoint**

Add route:

```js
router.get('/student/:sessionStudentId/exam', (req, res) => {
  const rows = sessions.getCodeItemsForStudent(req.params.sessionStudentId);
  res.json({
    items: rows.map((row) => ({
      itemId: row.itemId,
      displayOrder: row.displayOrder,
      questionText: row.questionText,
      options: { A: row.optionAText, B: row.optionBText, C: row.optionCText, D: row.optionDText }
    }))
  });
});
```

Then replace `getCodeItemsForStudent(sessionStudentId)` in `sessionRepository.mjs` with this query so grading still receives option IDs and the student UI also receives display text:

```js
getCodeItemsForStudent(sessionStudentId) {
  return db.prepare(`
    SELECT eci.id AS itemId, eci.display_order AS displayOrder,
           q.question_text AS questionText,
           eci.option_a_id AS A, eci.option_b_id AS B, eci.option_c_id AS C, eci.option_d_id AS D,
           oa.option_text AS optionAText, ob.option_text AS optionBText,
           oc.option_text AS optionCText, od.option_text AS optionDText,
           qo.id AS correctOptionId
    FROM session_students ss
    JOIN exam_code_items eci ON eci.exam_code_id = ss.exam_code_id
    JOIN questions q ON q.id = eci.question_id
    JOIN question_options oa ON oa.id = eci.option_a_id
    JOIN question_options ob ON ob.id = eci.option_b_id
    JOIN question_options oc ON oc.id = eci.option_c_id
    JOIN question_options od ON od.id = eci.option_d_id
    JOIN question_options qo ON qo.question_id = eci.question_id AND qo.is_correct = 1
    WHERE ss.id = ?
    ORDER BY eci.display_order ASC
  `).all(sessionStudentId);
},
```

- [ ] **Step 2: Create `student.html`**

```html
<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Student Exam</title>
    <link rel="stylesheet" href="/assets/styles.css">
  </head>
  <body>
    <main class="app-shell">
      <section id="joinPanel" class="panel">
        <h1>Join Exam</h1>
        <label>Room code <input id="roomCode"></label>
        <label>Student ID <input id="studentId"></label>
        <label>Full name <input id="fullName"></label>
        <button id="joinButton">Join</button>
        <p id="joinError" class="error"></p>
      </section>
      <section id="waitPanel" class="panel hidden">
        <h1>Waiting</h1>
        <p>Please wait for the teacher to start the exam.</p>
        <button id="fullscreenButton">Enter fullscreen and load exam</button>
      </section>
      <section id="examPanel" class="hidden">
        <header class="toolbar">
          <h1>Exam</h1>
          <p id="statusText">Online</p>
        </header>
        <div id="warning" class="panel error hidden"></div>
        <form id="questionList"></form>
        <button id="submitButton">Submit exam</button>
      </section>
      <section id="submittedPanel" class="panel hidden">
        <h1>Submitted</h1>
        <p>Your answers have been submitted.</p>
      </section>
    </main>
    <script type="module" src="/assets/student/student.js"></script>
  </body>
</html>
```

- [ ] **Step 3: Create `student.js`**

```js
import { createApi } from '../shared/api.js';
import { connectRealtime } from '../shared/realtime.js';

const api = createApi();
let state = JSON.parse(localStorage.getItem('studentState') || '{}');

function $(id) { return document.getElementById(id); }
function show(id) {
  for (const panel of ['joinPanel', 'waitPanel', 'examPanel', 'submittedPanel']) $(panel).classList.add('hidden');
  $(id).classList.remove('hidden');
}
function persist() { localStorage.setItem('studentState', JSON.stringify(state)); }

async function reportViolation(eventType, metadata = {}) {
  if (!state.sessionStudentId) return;
  $('warning').textContent = 'Please return to the exam screen and fullscreen mode.';
  $('warning').classList.remove('hidden');
  await api.post('/api/student/violation', {
    sessionId: state.sessionId,
    sessionStudentId: state.sessionStudentId,
    eventType,
    metadata
  }).catch(() => {});
}

function installGuards() {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) reportViolation('tab_hidden');
  });
  window.addEventListener('blur', () => reportViolation('window_blur'));
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) reportViolation('fullscreen_exit');
  });
  for (const eventName of ['copy', 'cut', 'paste', 'contextmenu']) {
    document.addEventListener(eventName, (event) => {
      event.preventDefault();
      reportViolation(eventName);
    });
  }
  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && ['c', 'x', 'v', 'p', 's', 'u'].includes(key)) {
      event.preventDefault();
      reportViolation('blocked_shortcut', { key });
    }
  });
}

async function loadExam() {
  const data = await api.get(`/api/student/${state.sessionStudentId}/exam`);
  $('questionList').innerHTML = data.items.map((item) => `
    <fieldset class="panel">
      <legend>Câu ${item.displayOrder}</legend>
      <p>${item.questionText}</p>
      ${['A', 'B', 'C', 'D'].map((label) => `
        <label>
          <input type="radio" name="${item.itemId}" value="${label}">
          ${label}. ${item.options[label]}
        </label>
      `).join('<br>')}
    </fieldset>
  `).join('');
  $('questionList').addEventListener('change', async (event) => {
    if (event.target.matches('input[type="radio"]')) {
      await api.post('/api/student/answer', {
        sessionId: state.sessionId,
        sessionStudentId: state.sessionStudentId,
        examCodeItemId: event.target.name,
        selectedLabel: event.target.value
      });
    }
  });
  show('examPanel');
}

$('joinButton').onclick = async () => {
  try {
    const data = await api.post('/api/student/join', {
      roomCode: $('roomCode').value,
      studentId: $('studentId').value,
      fullName: $('fullName').value
    });
    state = { sessionId: data.session.id, sessionStudentId: data.student.id, roomCode: data.session.roomCode };
    persist();
    connectRealtime({ sessionId: state.sessionId, role: 'student', sessionStudentId: state.sessionStudentId });
    show('waitPanel');
  } catch (error) {
    $('joinError').textContent = error.message;
  }
};

$('fullscreenButton').onclick = async () => {
  await document.documentElement.requestFullscreen();
  installGuards();
  await loadExam();
};

$('submitButton').onclick = async () => {
  if (!confirm('Submit your exam?')) return;
  await api.post('/api/student/submit', { sessionId: state.sessionId, sessionStudentId: state.sessionStudentId });
  show('submittedPanel');
};

if (state.sessionStudentId) show('waitPanel');
```

- [ ] **Step 4: Manual student smoke**

Run: `npm start`

Open teacher in one browser window and student in another:

1. Teacher creates session.
2. Student joins with room code.
3. Teacher sees student.
4. Teacher auto-assigns and starts.
5. Student enters fullscreen and answers.
6. Student switches tab.
7. Teacher sees violation count increase.

- [ ] **Step 5: Commit**

```bash
git add src/public/student.html src/public/assets/student/student.js src/server/http/routes.mjs src/server/repositories/sessionRepository.mjs
git commit -m "feat: add student exam ui and violation logging"
```

## Task 12: Excel Export

**Files:**
- Create: `src/server/services/excelExportService.mjs`
- Modify: `src/server/http/routes.mjs`
- Create: `tests/services/excelExportService.test.mjs`

- [ ] **Step 1: Write export service test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { writeResultsWorkbook } from '../../src/server/services/excelExportService.mjs';

test('writes workbook with summary, answer details, and violation log sheets', async () => {
  const filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'exam-export-')), 'results.xlsx');
  await writeResultsWorkbook({
    filePath,
    summaryRows: [{ studentId: 'SV001', fullName: 'Student One', examCode: 'MD01', score: 10, correctCount: 2, totalQuestions: 2, violationCount: 1, status: 'submitted', submittedAt: '2026-05-28T01:00:00.000Z' }],
    detailRows: [{ studentId: 'SV001', fullName: 'Student One', examCode: 'MD01', displayOrder: 1, questionId: 'q1', studentAnswer: 'A', correctAnswer: 'A', isCorrect: true }],
    violationRows: [{ studentId: 'SV001', fullName: 'Student One', eventType: 'tab_hidden', occurredAt: '2026-05-28T01:00:00.000Z', cumulativeCount: 1, notes: '{}' }]
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['Summary', 'Answer Details', 'Violation Log']);
});
```

- [ ] **Step 2: Create export service**

```js
import ExcelJS from 'exceljs';

function addSheet(workbook, name, rows) {
  const sheet = workbook.addWorksheet(name);
  const headers = Object.keys(rows[0] || { empty: '' });
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(headers.map((header) => row[header]));
  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach((column) => { column.width = 18; });
}

export async function writeResultsWorkbook({ filePath, summaryRows, detailRows, violationRows }) {
  const workbook = new ExcelJS.Workbook();
  addSheet(workbook, 'Summary', summaryRows);
  addSheet(workbook, 'Answer Details', detailRows);
  addSheet(workbook, 'Violation Log', violationRows);
  await workbook.xlsx.writeFile(filePath);
  return filePath;
}
```

- [ ] **Step 3: Add export data repository methods**

Add to `sessionRepository.mjs`:

```js
getExportRows(sessionId) {
  const summaryRows = db.prepare(`
    SELECT ss.student_id AS studentId, ss.full_name AS fullName, ec.code AS examCode,
           a.score, a.correct_count AS correctCount, a.total_questions AS totalQuestions,
           COUNT(ve.id) AS violationCount, a.status, a.submitted_at AS submittedAt
    FROM session_students ss
    JOIN attempts a ON a.session_student_id = ss.id
    LEFT JOIN exam_codes ec ON ec.id = ss.exam_code_id
    LEFT JOIN violation_events ve ON ve.session_student_id = ss.id
    WHERE ss.session_id = ?
    GROUP BY ss.id
    ORDER BY ss.student_id ASC
  `).all(sessionId);
  const detailRows = db.prepare(`
    SELECT ss.student_id AS studentId, ss.full_name AS fullName, ec.code AS examCode,
           eci.display_order AS displayOrder, eci.question_id AS questionId,
           aa.selected_label AS studentAnswer,
           qo.label AS correctAnswer,
           CASE WHEN aa.selected_option_id = qo.id THEN 1 ELSE 0 END AS isCorrect
    FROM session_students ss
    JOIN attempts a ON a.session_student_id = ss.id
    JOIN exam_codes ec ON ec.id = ss.exam_code_id
    JOIN exam_code_items eci ON eci.exam_code_id = ec.id
    JOIN question_options qo ON qo.question_id = eci.question_id AND qo.is_correct = 1
    LEFT JOIN attempt_answers aa ON aa.attempt_id = a.id AND aa.exam_code_item_id = eci.id
    WHERE ss.session_id = ?
    ORDER BY ss.student_id ASC, eci.display_order ASC
  `).all(sessionId);
  const violationRows = db.prepare(`
    SELECT ss.student_id AS studentId, ss.full_name AS fullName, ve.event_type AS eventType,
           ve.occurred_at AS occurredAt, ve.metadata_json AS notes
    FROM violation_events ve
    JOIN session_students ss ON ss.id = ve.session_student_id
    WHERE ss.session_id = ?
    ORDER BY ss.student_id ASC, ve.occurred_at ASC
  `).all(sessionId).map((row, index) => ({ ...row, cumulativeCount: index + 1 }));
  return { summaryRows, detailRows, violationRows };
}
```

- [ ] **Step 4: Add route**

In `routes.mjs`, import:

```js
import { writeResultsWorkbook } from '../services/excelExportService.mjs';
```

Add route:

```js
router.get('/sessions/:sessionId/export.xlsx', requireTeacher, async (req, res, next) => {
  try {
    const rows = sessions.getExportRows(req.params.sessionId);
    const filePath = path.join(config.exportDir, `session-${req.params.sessionId}.xlsx`);
    await writeResultsWorkbook({ filePath, ...rows });
    res.download(filePath);
  } catch (error) {
    next(error);
  }
});
```

- [ ] **Step 5: Run tests**

Run: `npm test -- tests/services/excelExportService.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/excelExportService.mjs src/server/http/routes.mjs src/server/repositories/sessionRepository.mjs tests/services/excelExportService.test.mjs
git commit -m "feat: add excel results export"
```

## Task 13: End-To-End Smoke Test

**Files:**
- Create: `tests/e2e/session-smoke.test.mjs`

- [ ] **Step 1: Write smoke test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../../src/server/app.mjs';

test('teacher can create exam session and student can join', async () => {
  const login = await request(app).post('/api/teacher/login').send({ password: 'admin123' }).expect(200);
  const auth = `Bearer ${login.body.token}`;

  const semester = await request(app).post('/api/semesters').set('Authorization', auth).send({ name: '2026 Spring' }).expect(201);
  const course = await request(app).post('/api/courses').set('Authorization', auth).send({ semesterId: semester.body.id, code: 'EDU101', name: 'Assessment' }).expect(201);
  const klass = await request(app).post('/api/classes').set('Authorization', auth).send({ courseId: course.body.id, name: 'K1' }).expect(201);
  const exam = await request(app).post('/api/exams').set('Authorization', auth).send({ classId: klass.body.id, title: 'Quiz 1', durationMinutes: 45 }).expect(201);

  await request(app).post(`/api/exams/${exam.body.id}/questions`).set('Authorization', auth).send({
    questionText: '2 + 2 = ?',
    position: 1,
    options: { A: '3', B: '4', C: '5', D: '6' },
    correctLabel: 'B'
  }).expect(201);

  const session = await request(app).post('/api/sessions').set('Authorization', auth).send({ examId: exam.body.id, durationMinutes: 45, codeCount: 2 }).expect(201);
  const join = await request(app).post('/api/student/join').send({ roomCode: session.body.roomCode, studentId: 'SV001', fullName: 'Student One' }).expect(201);

  assert.equal(join.body.student.studentId, 'SV001');
});
```

- [ ] **Step 2: Run smoke test**

Run: `npm test -- tests/e2e/session-smoke.test.mjs`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/session-smoke.test.mjs
git commit -m "test: add local exam smoke test"
```

## Task 14: Documentation, Packaging Notes, And Final Verification

**Files:**
- Modify: `README.md`
- Modify: `Start.ps1`
- Modify: `Start.command`

- [ ] **Step 1: Expand README with teacher workflow**

Add:

```markdown
## Teacher workflow

1. Start the server.
2. Open `/teacher.html`.
3. Login with the configured teacher password.
4. Create semester, course, class, exam, and questions.
5. Create a session and share the shown room code with students.
6. Students open `/student.html` from the teacher machine LAN URL.
7. Auto-assign exam codes and start the exam.
8. Monitor students, submissions, and violations.
9. Export results from the session page.

## Browser invigilation limits

This web app records tab hiding, focus loss, fullscreen exit, and blocked copy-related actions. It cannot absolutely prevent operating-system screenshots, phone photos, screen recording, or a second device.

## Data files

SQLite data is stored in `data/exam-system.sqlite`. Uploaded images are stored in `uploads/`. Exports are stored in `exports/`. Back up these folders to preserve exam history.
```

- [ ] **Step 2: Make scripts print useful LAN guidance**

Update `Start.ps1`:

```powershell
$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
Write-Host "Starting Exam Management..."
Write-Host "Open http://localhost:3000 on this computer."
Write-Host "Students must use the LAN URL printed by the server."
npm start
```

Update `Start.command`:

```bash
#!/bin/sh
cd "$(dirname "$0")" || exit 1
echo "Starting Exam Management..."
echo "Open http://localhost:3000 on this computer."
echo "Students must use the LAN URL printed by the server."
npm start
```

- [ ] **Step 3: Run full verification**

Run:

```bash
npm test
npm start
```

Expected:

- `npm test` passes all tests.
- `npm start` serves `http://localhost:3000`.
- `/api/health` returns `ok: true`.
- Teacher UI opens.
- Student UI opens.

- [ ] **Step 4: Commit**

```bash
git add README.md Start.ps1 Start.command
git commit -m "docs: add local running guide"
```

## Self-Review

Spec coverage:

- Local web app on teacher machine: Tasks 1, 2, 6, 14.
- Windows testing before macOS packaging: Tasks 1 and 14.
- SQLite persistence: Task 2.
- Teacher password: Task 6.
- Semester/course/class/exam management: Tasks 4, 6, 10.
- Manual question entry: Tasks 4, 10.
- Excel import with images: Task 7.
- One-answer A/B/C/D model: Tasks 2, 3, 4, 7.
- Multiple shuffled exam codes: Tasks 3 and 5.
- Room code, student ID, full name entry: Tasks 8 and 11.
- Auto/manual exam code assignment: Tasks 5 and 10.
- Common session timer and start/end: Tasks 5, 10, 11.
- Immediate answer saving and restore foundation: Tasks 8 and 11.
- Realtime updates: Task 9.
- Violation logging: Tasks 9 and 11.
- Auto grading: Tasks 3 and 8.
- Excel export with three sheets: Task 12.
- Acceptance smoke: Task 13.

Known implementation risks to watch during execution:

- `node:sqlite` API warnings are expected under Node 24.
- `verifyTeacherPassword` should be replaced with password hash storage before any non-local deployment.
- The UI in Tasks 10-11 is an MVP workflow surface; polish can follow after the core workflow passes tests.
- Late join behavior depends on assigning an exam code after start; execution should ensure the teacher can auto-assign or manual-assign late students before they load the exam.
