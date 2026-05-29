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
