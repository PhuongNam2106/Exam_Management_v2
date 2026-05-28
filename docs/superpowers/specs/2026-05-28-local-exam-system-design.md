# Local Exam System Design

Date: 2026-05-28
Status: Approved for implementation planning
Audience: University lecturer running local in-class multiple-choice exams

## 1. Goal

Build a local exam system for a university lecturer. The lecturer runs the software on one teacher machine, and students in the same classroom Wi-Fi/LAN access the exam from their laptop/PC browser.

The first version must support:

- Teacher-managed semesters, courses, classes, exams, and exam sessions.
- Multiple-choice exams with one correct answer and fixed A/B/C/D options.
- Multiple shuffled exam codes generated from one original exam.
- Student entry by room code, student ID, and full name.
- Realtime invigilation signals: tab switch, window focus loss, fullscreen exit, and blocked copy-related actions.
- Automatic answer saving, automatic grading, and Excel export.
- Local persistence with SQLite.
- Development and testing on the current Windows machine before packaging for macOS.

## 2. Chosen Architecture

The system will be a local web app. The teacher machine runs a local backend server, a local SQLite database, and serves both the teacher and student web interfaces.

Students do not install any app. They open a browser and visit:

```text
http://<teacher-machine-ip>:<port>
```

The first implementation will be tested on Windows with a Windows start script. The app core must stay cross-platform so it can later be packaged for macOS with a `Start.command` script and firewall guidance.

### Main Components

- Backend server: local HTTP API and WebSocket server.
- SQLite database: durable local data file.
- Teacher web UI: password-protected admin and invigilation screens.
- Student web UI: room entry, waiting room, fullscreen gate, exam page, submission page.
- Import/export utilities: Excel import for questions and Excel export for results.
- File storage: local image uploads for question images.

### Non-Goals For Version 1

- Cloud hosting or remote exams across different networks.
- Multiple teacher accounts.
- Shared question bank across exams.
- Student lockdown/kiosk app.
- Absolute screenshot prevention at operating-system level.
- Full mobile/tablet optimization.

## 3. Security And Invigilation Boundary

The browser version is designed for deterrence, detection, and logging, not absolute device lockdown.

The system will:

- Require fullscreen before students begin answering.
- Detect `visibilitychange` events when the exam tab is hidden.
- Detect `blur` and `focus` changes when the browser loses or regains focus.
- Detect `fullscreenchange` when students exit fullscreen.
- Block common actions such as copy, cut, paste, context menu, print shortcuts, and common developer/selection shortcuts where browsers allow it.
- Send violation events to the server in realtime.
- Store every violation event in SQLite.
- Show violation counts and latest violation time on the teacher invigilation screen.
- Show a student warning asking them to return to the exam and fullscreen mode.

The system cannot reliably prevent or detect:

- Operating-system screenshots.
- External camera or phone recording.
- A second device.
- Browser or OS-level tooling that bypasses normal web restrictions.

This limitation must be visible in teacher-facing documentation.

## 4. Teacher Workflow

1. Teacher starts the local server.
2. Teacher opens the admin page and enters the local teacher password.
3. Teacher creates or selects semester, course, and class.
4. Teacher creates an exam under the selected course/class.
5. Teacher adds questions manually or imports questions from Excel.
6. Teacher creates an exam session from the exam.
7. Teacher chooses exam duration and number of exam codes.
8. System generates shuffled exam codes from the original exam.
9. Teacher shares the local URL and room code with students.
10. Students join the waiting room.
11. System automatically assigns exam codes; teacher may manually override assignment before start.
12. Teacher starts the exam when all waiting students have assigned exam codes.
13. Teacher monitors connection status, progress, submissions, scores, and violation counts.
14. Teacher may end the session early; otherwise the server auto-submits remaining attempts when time ends.
15. Teacher exports results to Excel.

The system must not allow the teacher to start the session if any waiting student has no assigned exam code.

Students may join late after the exam has started. Late students use the same session end time and therefore lose time.

## 5. Student Workflow

1. Student opens the local URL.
2. Student enters room code, student ID, and full name.
3. Student appears in the teacher waiting list.
4. Student waits until the teacher starts the session.
5. Student enters fullscreen mode before seeing the exam.
6. Student answers all questions on one scrolling page.
7. The system saves each answer immediately after selection.
8. Student may submit early after confirmation.
9. If time ends, the system auto-submits the latest saved answers.
10. After submission, student sees only a submitted message and no score or correct answers.

If a student reloads, loses network briefly, or closes the browser by mistake, they can re-enter with the same room code, student ID, and full name. The system restores the latest saved attempt for that session.

## 6. Exam And Question Model

Version 1 supports:

- One-answer multiple-choice questions.
- Fixed answer choices A/B/C/D.
- Plain text question content.
- Optional question image.
- Equal scoring per question on a 10-point scale.
- Each exam owns its own questions; no shared question bank in version 1.

Multiple exam codes are generated from one original exam by:

- Shuffling question order.
- Shuffling answer order for each question.
- Persisting the shuffled mapping for each session and exam code.

Persisting the mapping is required so grading and audit results remain stable even if the teacher later edits the original exam.

## 7. Excel Import

Question import uses one simple sheet with these columns:

```text
question
image
option_a
option_b
option_c
option_d
correct_option
```

Rules:

- `question` is required.
- All four option columns are required.
- `correct_option` must be one of `A`, `B`, `C`, or `D`.
- `image` is optional.
- If `image` is provided, it must match a file in the selected image folder or uploaded import bundle.
- Import must validate all rows first and show clear row-level errors before saving.

Manual question entry supports uploading one image per question.

## 8. Excel Export

After an exam session, the teacher can export one workbook with three sheets.

### Sheet 1: Summary

- Student ID.
- Full name.
- Exam code.
- Score on a 10-point scale.
- Number of correct answers.
- Total questions.
- Violation count.
- Submission status.
- Submission time.

### Sheet 2: Answer Details

- Student ID.
- Full name.
- Exam code.
- Displayed question number.
- Original question ID or stable question reference.
- Student answer.
- Correct answer.
- Correct or incorrect.

### Sheet 3: Violation Log

- Student ID.
- Full name.
- Event type.
- Event timestamp.
- Cumulative count for that student.
- Notes or browser event metadata when useful.

## 9. Data Model

The SQLite database will include these logical entities:

- `settings`: teacher password hash and local configuration.
- `semesters`: academic term records.
- `courses`: course records.
- `classes`: class records.
- `exams`: exam metadata.
- `questions`: original exam questions.
- `question_options`: original A/B/C/D options and correct answer marker.
- `question_images`: local image metadata and stored path.
- `exam_sessions`: scheduled/running/completed exam sessions.
- `exam_codes`: generated exam code records for a session.
- `exam_code_items`: persisted shuffled question and option mapping.
- `session_students`: students joined to a session.
- `attempts`: one attempt per student per session.
- `attempt_answers`: latest saved answer per question mapping item.
- `violation_events`: tab/focus/fullscreen/copy-related event log.
- `connection_events`: connect, disconnect, reconnect events.

The exact schema can be refined during implementation planning, but these boundaries should remain.

## 10. Realtime Behavior

WebSocket or an equivalent realtime channel will push updates between browser clients and the server.

Teacher receives realtime updates for:

- Student joined waiting room.
- Student connected, disconnected, or reconnected.
- Exam code assignment changes.
- Attempt started.
- Answer progress count.
- Submission state.
- Score after submission.
- Violation event and updated violation count.

Student receives realtime updates for:

- Waiting room status.
- Session started.
- Server time and remaining time.
- Session ended early.
- Submission accepted.

Server time is authoritative for start time, end time, and auto-submission.

## 11. Error Handling And Recovery

Expected failure cases and behavior:

- Server restart before exam starts: existing setup remains in SQLite.
- Student refreshes during exam: restore current attempt from saved answers.
- Student loses connection: UI shows reconnecting; saved answers remain on server.
- Student answers while temporarily offline: client queues latest changes and syncs when connected if possible.
- Time ends while student is offline: server grades latest saved answers.
- Import Excel has invalid rows: no partial save; show errors by row.
- Missing image file during import: fail validation for affected rows.
- Teacher tries to start with unassigned students: block start and show affected students.

## 12. Packaging

Development and early user testing:

- Run on Windows first in the current workspace.
- Provide a Windows start script such as `Start.ps1` for local testing.
- Verify local access from another device/browser on the same network where possible.

Mac packaging:

- Keep the app cross-platform.
- Provide a macOS portable folder.
- Provide `Start.command`.
- Include instructions for allowing firewall/network access.
- Include database creation/migration on first run.

The app should not require users to install SQLite separately. SQLite must be bundled through the application runtime/library.

## 13. Testing Scope

Implementation must verify at least:

- Create semester, course, class.
- Create exam manually.
- Import exam from Excel without images.
- Import exam from Excel with images.
- Generate multiple shuffled exam codes.
- Student joins waiting room.
- Auto-assign exam code.
- Manually override exam code assignment.
- Block start when any student lacks an exam code.
- Start exam with common countdown.
- Student answers and answer is saved immediately.
- Student refreshes and restored answers appear.
- Student leaves tab or exits fullscreen and teacher sees updated violation count.
- Student submits early.
- Server auto-submits at end time.
- Teacher ends session early.
- Score is calculated correctly.
- Student sees submitted state without score.
- Export workbook contains summary, answer details, and violation log.

## 14. Version 1 Acceptance Criteria

The first usable version is acceptable when:

- A lecturer can run the app locally on Windows for testing.
- A lecturer can create a complete exam with A/B/C/D questions and optional images.
- A lecturer can run a session for fewer than 50 students on the same LAN.
- Students can join, receive assigned exam codes, answer, auto-save, and submit.
- The teacher can monitor submissions and violation counts in realtime.
- The system recovers from browser refresh without losing saved answers.
- The teacher can export a complete Excel record after the session.
- Data remains available after stopping and restarting the local server.

## 15. Deferred Features

The following features are intentionally deferred:

- Shared course-level question bank.
- Random question selection by topic or difficulty.
- Per-question score weights.
- Multiple-answer questions.
- Multi-teacher accounts and permissions.
- Cloud mode.
- Student lockdown client.
- Strong OS-level screenshot blocking.
- Installer `.exe` or signed macOS app bundle.
