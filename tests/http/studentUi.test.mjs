import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp } from '../../src/server/app.mjs';

function createTestApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exam-student-ui-'));
  return createApp({
    dataDir: dir,
    uploadDir: path.join(dir, 'uploads'),
    exportDir: path.join(dir, 'exports'),
    databasePath: path.join(dir, 'test.sqlite')
  });
}

test('student UI and exam script are served by the local app', async () => {
  const app = createTestApp();

  const html = await request(app).get('/student.html').expect(200);
  const js = await request(app).get('/assets/student/student.js').expect(200);

  assert.match(html.text, /id="examPanel"/);
  assert.match(js.text, /installGuards/);
  assert.match(js.text, /studentState/);
});
