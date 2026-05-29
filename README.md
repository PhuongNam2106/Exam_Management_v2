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

## Teacher workflow

1. Start the server.
2. Open `http://localhost:3000/teacher.html`.
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
