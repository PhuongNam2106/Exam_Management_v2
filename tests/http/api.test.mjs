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
