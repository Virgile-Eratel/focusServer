import { execFile } from 'child_process';
import type { FocusMode } from '../models/focus';

export type FocusApplier = {
  apply: (mode: FocusMode) => Promise<void>;
};

export function createFocusApplier(scriptPath: string): FocusApplier {
  function apply(mode: FocusMode): Promise<void> {
    return new Promise((resolve, reject) => {
      execFile('sudo', [scriptPath, mode], (error) => {
        if (error) return reject(error);
        resolve();
      });
    });
  }

  return { apply };
}
