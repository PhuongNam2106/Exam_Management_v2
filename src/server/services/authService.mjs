import crypto from 'node:crypto';
import { config } from '../config.mjs';

const activeTokens = new Map();

export function verifyTeacherPassword(password) {
  const actual = Buffer.from(String(password || ''));
  const expected = Buffer.from(config.teacherPassword);
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

export function issueTeacherToken() {
  const token = crypto.randomBytes(32).toString('hex');
  activeTokens.set(token, { issuedAt: Date.now() });
  return token;
}

export function isTeacherToken(token) {
  return activeTokens.has(String(token || ''));
}
