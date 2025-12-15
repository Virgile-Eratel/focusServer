import 'dotenv/config';

function parsePort(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const env = {
  port: parsePort(process.env.PORT, 5050),
  host: process.env.HOST ?? '127.0.0.1',
  focusScriptPath: process.env.FOCUS_SCRIPT_PATH ?? '/usr/local/bin/focus-apply.sh',
  checkIntervalMs: (() => {
    const n = Number(process.env.CHECK_INTERVAL_MS);
    return Number.isFinite(n) && n > 0 ? n : 1 * 60 * 1000;
  })(),
};
