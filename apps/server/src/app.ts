import express from 'express';
import cors, { CorsOptions } from 'cors';
import { ALLOWED_ORIGINS } from './config/focus';
import health from './routes/health';
import notFoundMiddleware from './middleware/notFound.middleware';
import routes from './routes';
import { createChildLogger } from './utils/logger';

const log = createChildLogger('app');

const corsOptions: CorsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    if (ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      log.warn({ origin }, 'CORS blocked');
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET'],
  allowedHeaders: ['Content-Type'],
};

const app = express();

app.use(cors(corsOptions));

app.use(express.json({ limit: '10kb' }));
app.use(health);
app.use('/api/v1', routes);

app.use(notFoundMiddleware);

export default app;
