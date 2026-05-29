export function connectRealtime({ sessionId, role, sessionStudentId, onEvent }) {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${location.host}/ws`);

  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ event: 'identify', payload: { sessionId, role, sessionStudentId } }));
  });

  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    onEvent?.(message.event, message.payload);
  });

  return ws;
}
