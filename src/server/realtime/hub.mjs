import crypto from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';

export function createRealtimeHub(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  const clients = new Map();

  function send(ws, event, payload) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event, payload }));
    }
  }

  function broadcastSession(sessionId, event, payload) {
    for (const client of clients.values()) {
      if (client.sessionId === sessionId) {
        send(client.ws, event, payload);
      }
    }
  }

  wss.on('connection', (ws) => {
    const id = crypto.randomUUID();
    clients.set(id, { ws, role: null, sessionId: null, sessionStudentId: null });

    ws.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      const client = clients.get(id);
      if (message.event === 'identify') {
        client.role = message.payload.role;
        client.sessionId = message.payload.sessionId;
        client.sessionStudentId = message.payload.sessionStudentId || null;
        send(ws, 'identified', { ok: true });
      }
    });

    ws.on('close', () => clients.delete(id));
  });

  return { broadcastSession, send };
}
