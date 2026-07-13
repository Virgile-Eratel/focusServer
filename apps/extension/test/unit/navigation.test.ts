import { describe, it, expect } from 'vitest';
import { hostMatches, isExemptHost, isOwnCheckingPageFor, isSameSite, parseTargetUrl } from '../../src/lib/navigation';

describe('hostMatches — même sémantique que requestDomains (DNR)', () => {
  it('matche le domaine exact et ses sous-domaines', () => {
    expect(hostMatches('youtube.com', 'youtube.com')).toBe(true);
    expect(hostMatches('www.youtube.com', 'youtube.com')).toBe(true);
    expect(hostMatches('m.fr.youtube.com', 'youtube.com')).toBe(true);
  });

  it('ne matche pas un suffixe non délimité par un point', () => {
    expect(hostMatches('notyoutube.com', 'youtube.com')).toBe(false);
    expect(hostMatches('youtube.com.evil.net', 'youtube.com')).toBe(false);
  });
});

describe('isExemptHost', () => {
  it.each([
    'localhost',
    '127.0.0.1',
    '[::1]',
    '::1',
    'app.localhost',
    '192.168.1.1', // routeur / LAN — pas de domaine enregistrable, le serveur répondrait 400
    '10.0.0.5',
    'nas.local',
    'myserver', // nom simple intranet
  ])('%s est exempté', (host) => {
    expect(isExemptHost(host)).toBe(true);
  });

  it('les hôtes publics ne sont pas exemptés', () => {
    expect(isExemptHost('example.com')).toBe(false);
    expect(isExemptHost('sub.example.co.uk')).toBe(false);
  });
});

describe('isSameSite — navigation interne sans re-vérification', () => {
  it('même hôte ou sous-domaine dans un sens ou l’autre', () => {
    expect(isSameSite('github.com', 'github.com')).toBe(true);
    expect(isSameSite('www.github.com', 'github.com')).toBe(true);
    expect(isSameSite('github.com', 'gist.github.com')).toBe(true);
  });

  it('sites distincts', () => {
    expect(isSameSite('github.com', 'gitlab.com')).toBe(false);
    expect(isSameSite('notgithub.com', 'github.com')).toBe(false);
  });
});

describe('isOwnCheckingPageFor — anti-boucle sans stockage', () => {
  const checkingBase = 'chrome-extension://abc/dist/checking.html';
  const target = 'https://github.com/some/repo?x=1';
  const checkingUrl = `${checkingBase}?url=${encodeURIComponent(target)}`;

  it('laisse passer la redirection « safe » de checking.html vers sa cible exacte', () => {
    expect(isOwnCheckingPageFor(checkingUrl, target, checkingBase)).toBe(true);
  });

  it('ne laisse pas passer une autre URL que celle vérifiée', () => {
    expect(isOwnCheckingPageFor(checkingUrl, 'https://evil.com/', checkingBase)).toBe(false);
  });

  it('ne laisse rien passer depuis une page quelconque', () => {
    expect(isOwnCheckingPageFor('https://google.com/', target, checkingBase)).toBe(false);
    expect(isOwnCheckingPageFor(undefined, target, checkingBase)).toBe(false);
  });
});

describe('parseTargetUrl — garde du paramètre ?url=', () => {
  it('accepte http et https', () => {
    expect(parseTargetUrl('https://example.com/page')?.hostname).toBe('example.com');
    expect(parseTargetUrl('http://example.com/')?.hostname).toBe('example.com');
  });

  it('rejette les schémas dangereux', () => {
    expect(parseTargetUrl('javascript:alert(1)')).toBeNull();
    expect(parseTargetUrl('chrome://settings')).toBeNull();
    expect(parseTargetUrl('data:text/html,<script>')).toBeNull();
  });

  it('rejette null et les URL invalides', () => {
    expect(parseTargetUrl(null)).toBeNull();
    expect(parseTargetUrl('not a url')).toBeNull();
  });
});
