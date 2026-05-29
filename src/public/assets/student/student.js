import { createApi } from '../shared/api.js';
import { connectRealtime } from '../shared/realtime.js';

const api = createApi();
let state = JSON.parse(localStorage.getItem('studentState') || '{}');
let guardsInstalled = false;

function $(id) {
  return document.getElementById(id);
}

function show(id) {
  for (const panel of ['joinPanel', 'waitPanel', 'examPanel', 'submittedPanel']) {
    $(panel).classList.add('hidden');
  }
  $(id).classList.remove('hidden');
}

function persist() {
  localStorage.setItem('studentState', JSON.stringify(state));
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function reportViolation(eventType, metadata = {}) {
  if (!state.sessionStudentId) return;
  $('warning').textContent = 'He thong da ghi nhan canh bao. Hay quay lai man hinh bai thi.';
  $('warning').classList.remove('hidden');
  await api
    .post('/api/student/violation', {
      sessionId: state.sessionId,
      sessionStudentId: state.sessionStudentId,
      eventType,
      metadata
    })
    .catch(() => {});
}

function installGuards() {
  if (guardsInstalled) return;
  guardsInstalled = true;

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) reportViolation('tab_hidden');
  });
  window.addEventListener('blur', () => reportViolation('window_blur'));
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) reportViolation('fullscreen_exit');
  });

  for (const eventName of ['copy', 'cut', 'paste', 'contextmenu', 'dragstart']) {
    document.addEventListener(eventName, (event) => {
      event.preventDefault();
      reportViolation(eventName);
    });
  }

  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (event.key === 'PrintScreen' || ((event.ctrlKey || event.metaKey) && ['c', 'x', 'v', 'p', 's', 'u'].includes(key))) {
      event.preventDefault();
      reportViolation('blocked_shortcut', { key: event.key });
    }
  });
}

function renderExam(items) {
  $('questionList').innerHTML = items
    .map(
      (item) => `
        <fieldset class="question-card">
          <legend>Cau ${item.displayOrder}</legend>
          <p>${escapeHtml(item.questionText)}</p>
          ${['A', 'B', 'C', 'D']
            .map(
              (label) => `
                <label class="option-row">
                  <input type="radio" name="${escapeHtml(item.itemId)}" value="${label}">
                  <span>${label}. ${escapeHtml(item.options[label])}</span>
                </label>`
            )
            .join('')}
        </fieldset>`
    )
    .join('');
}

async function loadExam() {
  const data = await api.get(`/api/student/${state.sessionStudentId}/exam`);
  renderExam(data.items);
  $('questionList').addEventListener('change', async (event) => {
    if (event.target.matches('input[type="radio"]')) {
      await api.post('/api/student/answer', {
        sessionId: state.sessionId,
        sessionStudentId: state.sessionStudentId,
        examCodeItemId: event.target.name,
        selectedLabel: event.target.value
      });
      $('statusText').textContent = 'Da luu';
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
    $('waitStatus').textContent = `Ma phong ${data.session.roomCode}`;
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
  if (!confirm('Nop bai thi?')) return;
  const result = await api.post('/api/student/submit', {
    sessionId: state.sessionId,
    sessionStudentId: state.sessionStudentId
  });
  $('submitResult').textContent = `Diem tam tinh: ${result.score}`;
  show('submittedPanel');
};

if (state.sessionStudentId) {
  $('waitStatus').textContent = `Ma phong ${state.roomCode}`;
  show('waitPanel');
}
