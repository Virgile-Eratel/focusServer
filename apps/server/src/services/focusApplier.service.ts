import { execFile } from 'child_process';
import { promisify } from 'util';
import type { FocusMode } from '@focus/shared/src/types/focusMode';
import { DEFAULT_FOCUS_SCRIPT_PATH } from '../utils/constants';

const execFileAsync = promisify(execFile);
const SCRIPT_PATH = process.env.FOCUS_SCRIPT_PATH ?? DEFAULT_FOCUS_SCRIPT_PATH;

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