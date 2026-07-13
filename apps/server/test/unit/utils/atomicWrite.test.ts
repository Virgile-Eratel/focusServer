import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { writeFileAtomic } from '../../../src/utils/atomicWrite';

describe('writeFileAtomic', () => {
  let dir: string;
  let target: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'focus-atomic-'));
    target = path.join(dir, 'domains.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates the file with the given content', () => {
    writeFileAtomic(target, 'hello');
    expect(readFileSync(target, 'utf-8')).toBe('hello');
  });

  it('replaces existing content', () => {
    writeFileSync(target, 'old', 'utf-8');
    writeFileAtomic(target, 'new');
    expect(readFileSync(target, 'utf-8')).toBe('new');
  });

  it('leaves no temporary file behind — a reader must never see one', () => {
    writeFileAtomic(target, 'hello');
    expect(readdirSync(dir)).toEqual(['domains.json']);
  });

  it('leaves the previous content intact when the write fails', () => {
    writeFileSync(target, 'good', 'utf-8');

    // Répertoire cible inexistant → le fichier temporaire ne peut pas être créé.
    const unwritable = path.join(dir, 'missing', 'domains.json');
    expect(() => writeFileAtomic(unwritable, 'bad')).toThrow();

    expect(readFileSync(target, 'utf-8')).toBe('good');
  });
});
