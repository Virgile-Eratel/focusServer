import express from 'express';
import { CorsOptions } from 'cors';
import { ALLOWED_ORIGINS } from './config/focus';
import cors from 'cors';
import health from './routes/health';
import notFoundMiddleware from './middleware/notFound.middleware';
import routes from './routes';

const corsOptions: CorsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    if (ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS - Tentative d'accès bloquée depuis : ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET'],
  allowedHeaders: ['Content-Type'],
};

const app = express();

app.use(cors(corsOptions));

app.use(express.json({}));
app.use(health);
app.use('/api/v1', routes);

app.use(notFoundMiddleware);

export default app;
