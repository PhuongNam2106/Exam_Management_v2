import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { config, getLanAddresses } from './config.mjs';
import { createDatabase } from './db/database.mjs';

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(config.uploadDir, { recursive: true });
fs.mkdirSync(config.exportDir, { recursive: true });

const db = createDatabase(config.databasePath);
const app = express();
app.locals.db = db;
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(config.rootDir, 'src', 'public')));

app.get('/api/health', (req, res) => {
  const schemaVersion = db.prepare("SELECT value FROM settings WHERE key = 'schema_version'").get().value;
  res.json({ ok: true, port: config.port, schemaVersion, lanUrls: getLanAddresses() });
});

const server = http.createServer(app);
const isDirectExecution =
  Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  server.listen(config.port, '0.0.0.0', () => {
    console.log(`Exam server running at http://localhost:${config.port}`);
    for (const url of getLanAddresses()) console.log(`LAN URL: ${url}`);
  });
}

export { app, server };
