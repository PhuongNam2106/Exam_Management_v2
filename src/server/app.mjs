import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { config, getLanAddresses } from './config.mjs';
import { createDatabase } from './db/database.mjs';
import { createRoutes } from './http/routes.mjs';
import { createStaticMiddleware } from './http/static.mjs';
import { createRealtimeHub } from './realtime/hub.mjs';

export function createApp(overrides = {}) {
  const runtimeConfig = { ...config, ...overrides };
  fs.mkdirSync(runtimeConfig.dataDir, { recursive: true });
  fs.mkdirSync(runtimeConfig.uploadDir, { recursive: true });
  fs.mkdirSync(runtimeConfig.exportDir, { recursive: true });

  const db = createDatabase(runtimeConfig.databasePath);
  const app = express();
  app.locals.db = db;
  app.locals.config = runtimeConfig;
  app.locals.realtime = { broadcastSession() {} };
  app.use(express.json({ limit: '20mb' }));
  app.use(createStaticMiddleware(runtimeConfig));

  app.get('/api/health', (req, res) => {
    const schemaVersion = db.prepare("SELECT value FROM settings WHERE key = 'schema_version'").get().value;
    res.json({ ok: true, port: runtimeConfig.port, schemaVersion, lanUrls: getLanAddresses(runtimeConfig.port) });
  });

  app.use('/api', createRoutes(db, runtimeConfig));
  app.use((error, req, res, next) => {
    console.error(error);
    res.status(400).json({ error: error.message || 'Request failed' });
  });

  return app;
}

export function createServer(overrides = {}) {
  const app = createApp(overrides);
  const server = http.createServer(app);
  app.locals.realtime = createRealtimeHub(server);
  return { app, server };
}

const isDirectExecution =
  Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

let app;
let server;

if (isDirectExecution) {
  ({ app, server } = createServer());
  server.listen(app.locals.config.port, '0.0.0.0', () => {
    console.log(`Exam server running at http://localhost:${app.locals.config.port}`);
    for (const url of getLanAddresses(app.locals.config.port)) console.log(`LAN URL: ${url}`);
  });
}

export { app, server };
