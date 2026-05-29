import { createApi } from '../shared/api.js';
import { connectRealtime } from '../shared/realtime.js';

let token = localStorage.getItem('teacherToken') || '';
let selected = JSON.parse(localStorage.getItem('teacherSelected') || '{}');
let realtime = null;
const api = createApi(() => token);

function $(id) {
  return document.getElementById(id);
}

function saveSelected() {
  localStorage.setItem('teacherSelected', JSON.stringify(selected));
}

function setStatus(id, text, isError = false) {
  const el = $(id);
  el.textContent = text;
  el.classList.toggle('error', isError);
}

function setOptions(select, items, placeholder, selectedId) {
  select.innerHTML = `<option value="">${placeholder}</option>${items
    .map((item) => `<option value="${item.id}">${item.code ? `${item.code} - ` : ''}${item.name || item.title}</option>`)
    .join('')}`;
  if (selectedId) select.value = selectedId;
}

async function run(statusId, action) {
  try {
    setStatus(statusId, 'Dang xu ly');
    const result = await action();
    setStatus(statusId, 'Da cap nhat');
    return result;
  } catch (error) {
    setStatus(statusId, error.message, true);
    throw error;
  }
}

async function loadSemesters() {
  const data = await api.get('/api/semesters');
  setOptions($('semesterSelect'), data.items, 'Chon hoc ky', selected.semesterId);
}

async function loadCourses() {
  if (!selected.semesterId) {
    setOptions($('courseSelect'), [], 'Chon hoc phan');
    return;
  }
  const data = await api.get(`/api/courses?semesterId=${encodeURIComponent(selected.semesterId)}`);
  setOptions($('courseSelect'), data.items, 'Chon hoc phan', selected.courseId);
}

async function loadClasses() {
  if (!selected.courseId) {
    setOptions($('classSelect'), [], 'Chon lop');
    return;
  }
  const data = await api.get(`/api/classes?courseId=${encodeURIComponent(selected.courseId)}`);
  setOptions($('classSelect'), data.items, 'Chon lop', selected.classId);
}

async function loadExams() {
  if (!selected.classId) {
    setOptions($('examSelect'), [], 'Chon bai thi');
    return;
  }
  const data = await api.get(`/api/exams?classId=${encodeURIComponent(selected.classId)}`);
  setOptions($('examSelect'), data.items, 'Chon bai thi', selected.examId);
}

async function refreshCatalog() {
  await loadSemesters();
  await loadCourses();
  await loadClasses();
  await loadExams();
}

async function refreshStudents() {
  if (!selected.sessionId) return;
  const data = await api.get(`/api/sessions/${selected.sessionId}/students`);
  $('studentsTable').innerHTML =
    data.items
      .map(
        (student) => `
          <tr>
            <td>${student.studentId}</td>
            <td>${student.fullName}</td>
            <td>${student.examCode || ''}</td>
            <td>${student.status}</td>
            <td class="${student.violationCount ? 'warning' : ''}">${student.violationCount}</td>
          </tr>`
      )
      .join('') || '<tr><td class="empty-row" colspan="5">Chua co sinh vien</td></tr>';
  setStatus('studentsStatus', `${data.items.length} sinh vien`);
}

function showTeacherApp() {
  $('loginPanel').classList.add('hidden');
  $('teacherApp').classList.remove('hidden');
}

function renderRoom() {
  $('roomCode').textContent = selected.roomCode || '-';
  $('studentUrl').href = '/student.html';
  $('studentUrl').textContent = `${location.origin}/student.html`;
}

function connectTeacherRealtime() {
  if (!selected.sessionId || realtime) return;
  realtime = connectRealtime({
    sessionId: selected.sessionId,
    role: 'teacher',
    onEvent: () => refreshStudents()
  });
}

$('loginButton').onclick = async () => {
  try {
    const data = await api.post('/api/teacher/login', { password: $('passwordInput').value });
    token = data.token;
    localStorage.setItem('teacherToken', token);
    showTeacherApp();
    await refreshCatalog();
    await refreshStudents();
  } catch (error) {
    $('loginError').textContent = error.message;
  }
};

$('semesterSelect').onchange = async () => {
  selected = { semesterId: $('semesterSelect').value };
  saveSelected();
  await refreshCatalog();
};

$('courseSelect').onchange = async () => {
  selected.courseId = $('courseSelect').value;
  selected.classId = '';
  selected.examId = '';
  saveSelected();
  await loadClasses();
  await loadExams();
};

$('classSelect').onchange = async () => {
  selected.classId = $('classSelect').value;
  selected.examId = '';
  saveSelected();
  await loadExams();
};

$('examSelect').onchange = () => {
  selected.examId = $('examSelect').value;
  saveSelected();
};

$('createSemester').onclick = async () => {
  const row = await run('catalogStatus', () => api.post('/api/semesters', { name: $('semesterName').value }));
  selected.semesterId = row.id;
  saveSelected();
  await refreshCatalog();
};

$('createCourse').onclick = async () => {
  const row = await run('catalogStatus', () =>
    api.post('/api/courses', { semesterId: selected.semesterId, code: $('courseCode').value, name: $('courseName').value })
  );
  selected.courseId = row.id;
  saveSelected();
  await refreshCatalog();
};

$('createClass').onclick = async () => {
  const row = await run('catalogStatus', () => api.post('/api/classes', { courseId: selected.courseId, name: $('className').value }));
  selected.classId = row.id;
  saveSelected();
  await refreshCatalog();
};

$('createExam').onclick = async () => {
  const row = await run('examStatus', () =>
    api.post('/api/exams', { classId: selected.classId, title: $('examTitle').value, durationMinutes: Number($('examDuration').value) })
  );
  selected.examId = row.id;
  saveSelected();
  await loadExams();
};

$('addQuestion').onclick = async () => {
  await run('examStatus', () =>
    api.post(`/api/exams/${selected.examId}/questions`, {
      questionText: $('questionText').value,
      position: Date.now(),
      options: { A: $('optA').value, B: $('optB').value, C: $('optC').value, D: $('optD').value },
      correctLabel: $('correctLabel').value
    })
  );
  $('questionText').value = '';
  $('optA').value = '';
  $('optB').value = '';
  $('optC').value = '';
  $('optD').value = '';
};

$('createSession').onclick = async () => {
  const row = await run('sessionStatus', () =>
    api.post('/api/sessions', {
      examId: selected.examId,
      durationMinutes: Number($('examDuration').value),
      codeCount: Number($('codeCount').value)
    })
  );
  selected.sessionId = row.id;
  selected.roomCode = row.roomCode;
  saveSelected();
  renderRoom();
  connectTeacherRealtime();
  await refreshStudents();
};

$('autoAssign').onclick = async () => {
  await run('sessionStatus', () => api.post(`/api/sessions/${selected.sessionId}/auto-assign`, {}));
  await refreshStudents();
};

$('startSession').onclick = async () => {
  await run('sessionStatus', () => api.post(`/api/sessions/${selected.sessionId}/start`, {}));
  await refreshStudents();
};

$('endSession').onclick = async () => {
  await run('sessionStatus', () => api.post(`/api/sessions/${selected.sessionId}/end`, {}));
  await refreshStudents();
};

$('refreshButton').onclick = async () => {
  await refreshCatalog();
  await refreshStudents();
};

if (token) {
  showTeacherApp();
  renderRoom();
  refreshCatalog().catch((error) => setStatus('catalogStatus', error.message, true));
  refreshStudents().catch((error) => setStatus('studentsStatus', error.message, true));
  connectTeacherRealtime();
}
