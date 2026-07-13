import { renameSync, writeFileSync } from 'fs';

/**
 * Écrit un fichier de façon atomique : fichier temporaire puis `rename()`.
 *
 * Sans cela, un lecteur (le serveur lui-même, ou focus-apply.sh côté root)
 * peut tomber sur un fichier à moitié écrit. `rename()` est atomique tant que
 * la destination est sur le même volume — d'où le fichier temporaire posé
 * dans le répertoire cible.
 */
export function writeFileAtomic(filePath: string, content: string): void {
  const tmpPath = `${filePath}.tmp-${process.pid}`;
  writeFileSync(tmpPath, content, 'utf-8');
  renameSync(tmpPath, filePath);
}
