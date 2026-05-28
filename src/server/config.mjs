import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const config = {
  rootDir,
  port: Number(process.env.PORT || 3000),
  dataDir: process.env.DATA_DIR || path.join(rootDir, 'data'),
  uploadDir: process.env.UPLOAD_DIR || path.join(rootDir, 'uploads'),
  exportDir: process.env.EXPORT_DIR || path.join(rootDir, 'exports'),
  databasePath: process.env.DATABASE_PATH || path.join(rootDir, 'data', 'exam-system.sqlite'),
  teacherPassword: process.env.TEACHER_PASSWORD || 'admin123'
};

export function getLanAddresses() {
  const addresses = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        addresses.push(`http://${entry.address}:${config.port}`);
      }
    }
  }
  return addresses;
}
