import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp } from '../../src/server/app.mjs';

function createTestApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exam-teacher-ui-'));
  return createApp({
    dataDir: dir,
    uploadDir: path.join(dir, 'uploads'),
    exportDir: path.join(dir, 'exports'),
    databasePath: path.join(dir, 'test.sqlite')
  });
}

test('teacher UI and assets are served by the local app', async () => {
  const app = createTestApp();

  const html = await request(app).get('/teacher.html').expect(200);
  const css = await request(app).get('/assets/styles.css').expect(200);
  const api = await request(app).get('/assets/shared/api.js').expect(200);
  const realtime = await request(app).get('/assets/shared/realtime.js').expect(200);
  const teacher = await request(app).get('/assets/teacher/teacher.js').expect(200);

  assert.match(html.text, /id="teacherApp"/);
  assert.match(css.text, /\.app-shell/);
  assert.match(api.text, /createApi/);
  assert.match(realtime.text, /connectRealtime/);
  assert.match(teacher.text, /createSession/);
});
