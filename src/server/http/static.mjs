import path from 'node:path';
import express from 'express';
import { config } from '../config.mjs';

export function createStaticMiddleware(runtimeConfig = config) {
  return express.static(path.join(runtimeConfig.rootDir, 'src', 'public'));
}
