import { describe, it, expect } from 'vitest';
import { normalizeHostname } from '../../../src/popup/lib/currentTab';

describe('normalizeHostname', () => {
  it('ne garde que l’hôte : le chemin et la query sont retirés', () => {
    expect(normalizeHostname('https://test.com/aa?x=1#frag')).toBe('test.com');
  });

  it('retire le préfixe www. (le serveur le ré-ajoute à l’expansion)', () => {
    expect(normalizeHostname('https://www.test.com/')).toBe('test.com');
  });

  it('conserve les vrais sous-domaines', () => {
    expect(normalizeHostname('https://app.test.com/dashboard')).toBe('app.test.com');
  });

  it('ne retire que le www. de tête, pas une occurrence interne', () => {
    expect(normalizeHostname('https://wwwtest.com')).toBe('wwwtest.com');
    expect(normalizeHostname('https://mail.www.test.com')).toBe('mail.www.test.com');
  });

  it('conserve les suffixes composés (pas de troncature à eTLD+1)', () => {
    expect(normalizeHostname('https://www.example.co.uk/page')).toBe('example.co.uk');
  });

  it('accepte http comme https', () => {
    expect(normalizeHostname('http://test.com')).toBe('test.com');
  });

  it('rejette les pages sans hôte blocable', () => {
    expect(normalizeHostname('chrome://extensions')).toBeNull();
    expect(normalizeHostname('about:blank')).toBeNull();
    expect(normalizeHostname('file:///Users/x/index.html')).toBeNull();
    expect(normalizeHostname('chrome-extension://abc/popup.html')).toBeNull();
  });

  it('rejette une URL invalide', () => {
    expect(normalizeHostname('pas une url')).toBeNull();
    expect(normalizeHostname('')).toBeNull();
  });
});
