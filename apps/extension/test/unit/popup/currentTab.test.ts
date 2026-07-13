import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCurrentTabDomain, normalizeHostname } from '../../../src/popup/lib/currentTab';

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

describe('getCurrentTabDomain — le site VISÉ, pas l’URL affichée', () => {
  const EXTENSION_ID = 'chrome-extension://abcdefghijklmnop/';

  function stubTab(url: string) {
    vi.stubGlobal('chrome', {
      tabs: { query: vi.fn().mockResolvedValue([{ url }]) },
      runtime: { getURL: (path: string) => `${EXTENSION_ID}${path}` },
    });
  }

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('page bloquée : retrouve le domaine du site, pas celui de l’extension', async () => {
    // C'est TOUT l'intérêt : un site bloqué affiche `blocked.html`, donc
    // `tab.url` est une URL chrome-extension://. Le popup répondait « aucun
    // site à classer ici » — donc inutilisable là où on en a besoin, pour
    // corriger un site que l'IA a bloqué à tort.
    stubTab(`${EXTENSION_ID}blocked.html?url=${encodeURIComponent('https://www.tiime.fr/factures')}`);
    expect(await getCurrentTabDomain()).toBe('tiime.fr');
  });

  it('page de vérification : même chose', async () => {
    stubTab(`${EXTENSION_ID}checking.html?url=${encodeURIComponent('https://giphy.com/')}`);
    expect(await getCurrentTabDomain()).toBe('giphy.com');
  });

  it('page normale : l’hôte de l’onglet', async () => {
    stubTab('https://www.github.com/a/b');
    expect(await getCurrentTabDomain()).toBe('github.com');
  });

  it('page de l’extension sans cible (le popup lui-même) : rien à classer', async () => {
    stubTab(`${EXTENSION_ID}popup.html`);
    expect(await getCurrentTabDomain()).toBeNull();
  });

  it('cible non http(s) : rien à classer', async () => {
    stubTab(`${EXTENSION_ID}blocked.html?url=${encodeURIComponent('javascript:alert(1)')}`);
    expect(await getCurrentTabDomain()).toBeNull();
  });

  it('onglet sans URL', async () => {
    vi.stubGlobal('chrome', {
      tabs: { query: vi.fn().mockResolvedValue([{}]) },
      runtime: { getURL: (path: string) => `${EXTENSION_ID}${path}` },
    });
    expect(await getCurrentTabDomain()).toBeNull();
  });
});
