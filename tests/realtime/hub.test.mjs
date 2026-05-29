import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { createServer } from '../../src/server/app.mjs';

function createTestServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exam-ws-'));
  return createServer({
    dataDir: dir,
    uploadDir: path.join(dir, 'uploads'),
    exportDir: path.join(dir, 'exports'),
    databasePath: path.join(dir, 'test.sqlite')
  });
}

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function onceOpen(ws) {
  return new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
}

function nextMessage(ws) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for websocket message')), 2000);
    ws.once('message', (raw) => {
      clearTimeout(timeout);
      resolve(JSON.parse(raw.toString()));
    });
    ws.once('error', reject);
  });
}

test('websocket identifies a client and broadcasts by session', async () => {
  const { app, server } = createTestServer();
  const port = await listen(server);
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);

  try {
    await onceOpen(ws);
    ws.send(JSON.stringify({ event: 'identify', payload: { role: 'teacher', sessionId: 'sess-1' } }));

    assert.deepEqual(await nextMessage(ws), { event: 'identified', payload: { ok: true } });

    app.locals.realtime.broadcastSession('sess-1', 'student.joined', { studentId: 'SV001' });
    assert.deepEqual(await nextMessage(ws), { event: 'student.joined', payload: { studentId: 'SV001' } });
  } finally {
    ws.close();
    await close(server);
    app.locals.db.close();
  }
});
