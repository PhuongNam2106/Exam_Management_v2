import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp } from '../../src/server/app.mjs';

function createTestApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exam-api-'));
  return createApp({
    dataDir: dir,
    uploadDir: path.join(dir, 'uploads'),
    exportDir: path.join(dir, 'exports'),
    databasePath: path.join(dir, 'test.sqlite')
  });
}

const app = createTestApp();

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
