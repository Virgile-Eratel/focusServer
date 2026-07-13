import { describe, it, expect } from 'vitest';
import { getRegistrableDomain } from '../../../src/utils/registrableDomain';

describe('getRegistrableDomain — eTLD+1 (clé des verdicts)', () => {
  it('réduit un sous-domaine à son domaine enregistrable', () => {
    expect(getRegistrableDomain('fr.xhamsterlive.com')).toBe('xhamsterlive.com');
    expect(getRegistrableDomain('www.youtube.com')).toBe('youtube.com');
  });

  it('respecte la liste des suffixes publics — example.co.uk ne devient pas co.uk', () => {
    expect(getRegistrableDomain('sub.example.co.uk')).toBe('example.co.uk');
  });

  it('rejette un suffixe public seul', () => {
    expect(getRegistrableDomain('co.uk')).toBeNull();
  });

  it('rejette une IP', () => {
    expect(getRegistrableDomain('192.168.1.1')).toBeNull();
  });

  it('rejette localhost et les entrées invalides', () => {
    expect(getRegistrableDomain('localhost')).toBeNull();
    expect(getRegistrableDomain('')).toBeNull();
    expect(getRegistrableDomain('not a domain!')).toBeNull();
  });

  it('accepte une URL complète', () => {
    expect(getRegistrableDomain('https://m.dailymotion.com/video/x123')).toBe('dailymotion.com');
  });
});
