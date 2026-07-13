import { describe, it, expect } from 'vitest';
import {
  extractEvidence,
  fetchPageEvidence,
  isForbiddenAddress,
  pageSignal,
  saysMoreThanItsName,
} from '../../../src/services/pageFetcher.service';

describe('isForbiddenAddress — plages SSRF interdites', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.5',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254', // link-local (metadata endpoints)
    '100.64.0.1', // CGN
    '0.0.0.0',
    '224.0.0.1', // multicast
    '255.255.255.255',
  ])('IPv4 privée/réservée %s → interdite', (ip) => {
    expect(isForbiddenAddress(ip)).toBe(true);
  });

  it.each(['::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1'])('IPv6 locale %s → interdite', (ip) => {
    expect(isForbiddenAddress(ip)).toBe(true);
  });

  it('rejette les IPv4 privées mappées en IPv6', () => {
    expect(isForbiddenAddress('::ffff:192.168.1.1')).toBe(true);
    expect(isForbiddenAddress('::ffff:10.0.0.1')).toBe(true);
  });

  it.each(['93.184.216.34', '142.250.74.110', '::ffff:93.184.216.34', '2606:4700::6810:84e5'])(
    'adresse publique %s → autorisée',
    (ip) => {
      expect(isForbiddenAddress(ip)).toBe(false);
    },
  );

  it('tout ce qui n’est pas une IP est refusé', () => {
    expect(isForbiddenAddress('example.com')).toBe(true);
    expect(isForbiddenAddress('')).toBe(true);
  });
});

describe('extractEvidence', () => {
  it('extrait titre, description et og:*', () => {
    const html = `<html><head>
      <title>Dailymotion - vidéos</title>
      <meta name="description" content="Regardez des vidéos.">
      <meta property="og:title" content="Dailymotion">
      <meta property="og:description" content="Plateforme vidéo.">
    </head><body></body></html>`;

    expect(extractEvidence(html)).toEqual({
      title: 'Dailymotion - vidéos',
      description: 'Regardez des vidéos.',
      ogTitle: 'Dailymotion',
      ogDescription: 'Plateforme vidéo.',
    });
  });

  it('tolère content avant name et les quotes simples', () => {
    const html = `<meta content='Une description' name='description'>`;
    expect(extractEvidence(html).description).toBe('Une description');
  });

  it('retourne null pour chaque champ absent', () => {
    expect(extractEvidence('<html></html>')).toEqual({
      title: null,
      description: null,
      ogTitle: null,
      ogDescription: null,
    });
  });

  it('décode les entités et normalise les blancs', () => {
    const html = `<title>
      Foo &amp; Bar&nbsp;&quot;baz&quot;
    </title>`;
    expect(extractEvidence(html).title).toBe('Foo & Bar "baz"');
  });

  it('tronque les champs démesurés — la donnée est non fiable', () => {
    const html = `<title>${'x'.repeat(5000)}</title>`;
    expect(extractEvidence(html).title).toHaveLength(500);
  });
});

describe('saysMoreThanItsName — une preuve, ou un simple écho du nom ?', () => {
  const evidence = (title: string | null, description: string | null = null) => ({
    title,
    description,
    ogTitle: null,
    ogDescription: null,
  });

  it('une page qui ne répète que sa marque n’apprend RIEN', () => {
    // Le bug vécu : `tiime.fr` renvoyait `{"title":"Tiime"}`. Le modèle, sommé
    // de classer « la page », classait en réalité le nom — et devinait
    // « divertissement ». Un logiciel de compta bloqué comme une distraction.
    expect(saysMoreThanItsName('tiime.fr', evidence('Tiime'))).toBe(false);
    expect(pageSignal('tiime.fr', evidence('Tiime'))).toBe('');

    // Même forme, autre site : `youtube.com` renvoie « YouTube » tout court.
    // Lui aussi passe donc par la connaissance du modèle — qui, lui, le connaît.
    expect(saysMoreThanItsName('youtube.com', evidence('YouTube'))).toBe(false);
  });

  it('une page qui décrit ce qu’elle fait est une preuve', () => {
    expect(
      saysMoreThanItsName(
        'tiime.fr',
        evidence('Logiciel de facturation | Tiime', 'Facturation et compta pour entrepreneurs'),
      ),
    ).toBe(true);
    expect(saysMoreThanItsName('chess.com', evidence('Chess.com - Play Chess Online - Free Games'))).toBe(true);
  });

  it('aucune évidence du tout', () => {
    expect(saysMoreThanItsName('inconnu.fr', null)).toBe(false);
    expect(saysMoreThanItsName('inconnu.fr', evidence(null))).toBe(false);
  });

  it('les mots du domaine sont retirés du signal, ponctuation comprise', () => {
    // « noTube » ne doit pas compter comme signal pour `notube.lol`.
    expect(pageSignal('notube.lol', evidence('noTube — convertisseur YouTube MP3'))).toBe('convertisseur youtube mp3');
  });
});

describe('fetchPageEvidence — gardes sans réseau', () => {
  it('rejette les schémas non http(s)', async () => {
    expect(await fetchPageEvidence('ftp://example.com/')).toBeNull();
    expect(await fetchPageEvidence('file:///etc/passwd')).toBeNull();
    expect(await fetchPageEvidence('javascript:alert(1)')).toBeNull();
  });

  it('rejette une URL invalide', async () => {
    expect(await fetchPageEvidence('not a url')).toBeNull();
  });

  it('rejette une IP littérale interdite sans émettre de requête', async () => {
    expect(await fetchPageEvidence('http://127.0.0.1:8080/admin')).toBeNull();
    expect(await fetchPageEvidence('http://169.254.169.254/latest/meta-data/')).toBeNull();
    expect(await fetchPageEvidence('http://[::1]/')).toBeNull();
  });
});
