import crypto from 'node:crypto';

export function createId(prefix) {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
}

export function createRoomCode() {
  return crypto.randomInt(100000, 999999).toString();
}
