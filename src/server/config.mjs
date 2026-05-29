import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const portErrorMessage = 'PORT must be an integer between 1 and 65535';

function readPort() {
  if (process.env.PORT === undefined) {
    return 3000;
  }

  if (!/^\d+$/.test(process.env.PORT)) {
    throw new Error(portErrorMessage);
  }

  const port = Number(process.env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(portErrorMessage);
  }

  return port;
}

export const config = {
  rootDir,
  port: readPort(),
  dataDir: process.env.DATA_DIR || path.join(rootDir, 'data'),
  uploadDir: process.env.UPLOAD_DIR || path.join(rootDir, 'uploads'),
  exportDir: process.env.EXPORT_DIR || path.join(rootDir, 'exports'),
  databasePath: process.env.DATABASE_PATH || path.join(rootDir, 'data', 'exam-system.sqlite'),
  teacherPassword: process.env.TEACHER_PASSWORD || 'admin123'
};

export function getLanAddresses(port = config.port) {
  const addresses = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        addresses.push(`http://${entry.address}:${port}`);
      }
    }
  }
  return addresses;
}
