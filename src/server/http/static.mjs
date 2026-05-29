import path from 'node:path';
import express from 'express';
import { config } from '../config.mjs';

export function createStaticMiddleware() {
  return express.static(path.join(config.rootDir, 'src', 'public'));
}
