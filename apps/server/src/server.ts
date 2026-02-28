import http from 'http';
import app from './app';
import 'dotenv/config';
import { DEFAULT_CHECK_INTERVAL_MS, DEFAULT_HOST, DEFAULT_PORT } from './utils/constants';
import { tick } from './services/focus.service';
import { createChildLogger } from './utils/logger';

const log = createChildLogger('server');

const server = http.createServer(app);
const port = Number(process.env.PORT) || DEFAULT_PORT;

server.listen({ port: port, host: process.env.HOST ?? DEFAULT_HOST }, () => {
  log.info({ port }, 'FocusServer running');
  const interval = process.env.CHECK_INTERVAL_MS ? Number(process.env.CHECK_INTERVAL_MS) : DEFAULT_CHECK_INTERVAL_MS;
  void tick();
  setInterval(() => void tick(), interval);
});
