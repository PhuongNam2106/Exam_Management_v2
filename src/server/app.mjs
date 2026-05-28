import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { config, getLanAddresses } from './config.mjs';

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(config.uploadDir, { recursive: true });
fs.mkdirSync(config.exportDir, { recursive: true });

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(config.rootDir, 'src', 'public')));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, port: config.port, lanUrls: getLanAddresses() });
});

const server = http.createServer(app);

if (process.env.NODE_ENV !== 'test') {
  server.listen(config.port, '0.0.0.0', () => {
    console.log(`Exam server running at http://localhost:${config.port}`);
    for (const url of getLanAddresses()) console.log(`LAN URL: ${url}`);
  });
}

export { app, server };
