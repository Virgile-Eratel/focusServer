import express, { Request, Response } from 'express';
import cors from 'cors'; // <--- Import indispensable
import { exec } from 'child_process';
import 'dotenv/config';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';

dayjs.extend(isBetween);

// =============================================================================
// ⚙️ CONFIGURATION
// =============================================================================

const PORT: number = Number(process.env.PORT) ?? 5050;
const CHECK_INTERVAL_MS = 1 * 60 * 1000; // 1 minute
const SCRIPT_PATH = '/usr/local/bin/focus-apply.sh';

// Jours où le blocage est actif (0=Dimanche, 1=Lundi... 6=Samedi)
const ACTIVE_DAYS = [0, 1, 2, 3, 4, 5, 6];

const ALLOWED_PAUSES = [
  { start: '12:00', end: '13:30' },
  { start: '18:00', end: '19:30' },
];

// 👇 SÉCURITÉ : Liste blanche des origines autorisées 👇
const ALLOWED_ORIGINS = [
  // Remplace ceci par l'ID réel de ton extension quand tu l'auras créée
  // Exemple : "chrome-extension://abcdefghijklmnop..."
  'chrome-extension://ton-id-extension-ici',

  // Pour le développement d'une interface web locale (React/Vite)
  'http://localhost:5173',
  'http://localhost:3000',
];

// =============================================================================
// 🧠 LOGIQUE MÉTIER
// =============================================================================

type FocusMode = 'blocked' | 'unblocked';

let currentMode: FocusMode | 'unknown' = 'unknown';
let manualPauseUntil: number | null = null;

function getTodayAt(timeStr: string) {
  const [hour, minute] = timeStr.split(':').map(Number);
  return dayjs().hour(hour).minute(minute).second(0);
}

function isScheduledPause(): boolean {
  const now = dayjs();

  if (!ACTIVE_DAYS.includes(now.day())) {
    return true;
  }

  for (const pause of ALLOWED_PAUSES) {
    const start = getTodayAt(pause.start);
    const end = getTodayAt(pause.end);

    if (now.isBetween(start, end, 'minute', '[)')) {
      return true;
    }
  }

  return false;
}

function calculateTargetMode(): FocusMode {
  const now = Date.now();

  if (manualPauseUntil) {
    if (manualPauseUntil > now) return 'unblocked';
    manualPauseUntil = null;
  }

  if (isScheduledPause()) {
    return 'unblocked';
  }

  return 'blocked';
}

function applyMode(targetMode: FocusMode) {
  if (targetMode === currentMode) return;

  console.log(`🔄 Changement d'état : ${currentMode} -> ${targetMode}`);

  exec(`sudo ${SCRIPT_PATH} ${targetMode}`, (error) => {
    if (error) {
      console.error(`❌ Erreur script: ${error.message}`);
      return;
    }
    currentMode = targetMode;
    console.log(`✅ Mode appliqué : ${targetMode}`);
  });
}

function tick() {
  const target = calculateTargetMode();
  applyMode(target);
}

// =============================================================================
// 🌐 SERVER
// =============================================================================

const app = express();

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);

      if (ALLOWED_ORIGINS.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        console.warn(`CORS - Tentative d'accès bloquée depuis : ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
  }),
);

app.use(express.json());

app.get('/health', (_, res: Response) => {
  res.json({ status: 'ok' });
});

app.get('/status', (_, res: Response) => {
  const formattedManualPause = manualPauseUntil ? dayjs(manualPauseUntil).format('HH:mm:ss') : null;

  res.json({
    mode: currentMode,
    manualPauseUntil: formattedManualPause,
    isScheduledPause: isScheduledPause(),
    time: dayjs().format('HH:mm:ss'),
  });
});

app.post('/pause', (req: Request, res: Response) => {
  const duration = req.body.durationMinutes || 15;
  manualPauseUntil = Date.now() + duration * 60 * 1000;
  console.log(`⏸️  Pause manuelle demandée : ${duration} min`);
  tick();

  res.json({
    status: 'paused',
    manualPauseUntil: dayjs(manualPauseUntil).format('HH:mm:ss'),
  });
});

app.post('/resume', (_req: Request, res: Response) => {
  manualPauseUntil = null;
  console.log('▶️  Fin de pause manuelle (Resume)');
  tick();
  res.json({ status: 'resumed', manualPauseUntil: null });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`🔒 Focus Server (Secured) running on port ${PORT}`);
  tick();
  setInterval(tick, CHECK_INTERVAL_MS);
});
