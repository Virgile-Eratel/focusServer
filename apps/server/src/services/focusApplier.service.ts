import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import path from 'path';
import type { FocusMode } from '@focus/shared/src/types/focusMode';
import { DEFAULT_FOCUS_SCRIPT_PATH } from '../utils/constants';

const execFileAsync = promisify(execFile);

function resolveScriptPath(): string {
  const envPath = process.env.FOCUS_SCRIPT_PATH;
  if (!envPath) return DEFAULT_FOCUS_SCRIPT_PATH;

  const resolved = path.resolve(envPath);
  if (!resolved.startsWith('/usr/local/bin/')) {
    throw new Error(`FOCUS_SCRIPT_PATH must be under /usr/local/bin/, got: ${envPath}`);
  }
  if (!existsSync(resolved)) {
    throw new Error(`FOCUS_SCRIPT_PATH does not exist: ${envPath}`);
  }
  return resolved;
}

const SCRIPT_PATH = resolveScriptPath();

export async function apply(mode: FocusMode): Promise<void> {
  try {
    const { stderr } = await execFileAsync('sudo', [SCRIPT_PATH, mode]);
    if (stderr) {
      console.warn('[focus-apply] stderr:', stderr);
    }
  } catch (error) {
    const e = error as Error & { code?: number; stderr?: string; stdout?: string };

    console.error('[focus-apply] Script failed:', {
      message: e.message,
      exitCode: e.code,
      stderr: e.stderr,
      stdout: e.stdout,
    });

    throw new Error(`error executing focus-apply`);
  }
}
