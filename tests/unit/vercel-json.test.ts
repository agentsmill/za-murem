// biome-ignore-all lint/suspicious/noTemplateCurlyInString: ${ZM_API} i ${…} z .env to dosłowny tekst plików konfiguracji

/* Konfiguracja wdrożenia (etap 1, zadanie 13): `vercel.json` przekazuje /api na serwer z adresu w zmiennej projektu
   (`${ZM_API}`) i dokłada sekret proxy ze zmiennej (`$ZM_PROXY_SEKRET`), więc w pliku nie ma adresów serwerów ani
   sekretów; compose.obok.yml ma dwa serwery API (testowy `api` i produkcyjny `api-prod`) z sekretami tylko jako
   `${…}` z .env na serwerze; `deploy/pages/index.html` to przekierowanie ze starego adresu. Test czyta pliki z repo,
   bez sieci i bez Dockera. */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pasujeZrodlo } from '../../server/app.ts';

const korzen = new URL('../../', import.meta.url);
const czytaj = (sciezka: string): string => readFileSync(new URL(sciezka, korzen), 'utf8');

interface Trasa {
  src?: string;
  dest?: string;
  env?: string[];
  headers?: Record<string, string>;
  continue?: boolean;
  handle?: string;
  transforms?: {
    type: string;
    op: string;
    target: { key: string };
    args: string;
    env?: string[];
  }[];
}

describe('vercel.json', () => {
  const tekst = czytaj('vercel.json');
  const konfig = JSON.parse(tekst) as { routes: Trasa[]; buildCommand: string; outputDirectory: string };

  it('/api idzie pod ${ZM_API} z sekretem ze zmiennej, w pliku nie ma adresów serwerów ani sekretów', () => {
    const [api] = konfig.routes;
    expect(api?.src).toBe('/api/(.*)');
    expect(api?.dest?.startsWith('${ZM_API}')).toBe(true);
    expect(api?.dest).toBe('${ZM_API}/api/$1');
    expect(api?.env).toContain('ZM_API');
    const naglowek = api?.transforms?.find((t) => t.target.key === 'x-zm-proxy');
    expect(naglowek).toMatchObject({ type: 'request.headers', op: 'set', args: '$ZM_PROXY_SEKRET' });
    expect(naglowek?.env).toContain('ZM_PROXY_SEKRET');
    // trasy nie wpisują sekretu ani adresu serwera na sztywno
    expect(tekst).not.toContain('sslip.io');
    expect(tekst).not.toContain('hetzner');
  });

  it('kończy się obsługą plików statycznych, a trasy z `routes` nie łączą się z `rewrites` ani `headers`', () => {
    expect(konfig.routes.at(-1)).toEqual({ handle: 'filesystem' });
    const klucze = Object.keys(konfig);
    expect(klucze).not.toContain('rewrites');
    expect(klucze).not.toContain('headers');
    expect(klucze).not.toContain('redirects');
    expect(konfig.buildCommand).toBe('npm run build');
    expect(konfig.outputDirectory).toBe('dist');
  });

  it('nagłówki pamięci podręcznej jak w Caddy gry: assets na rok, strony i dema bez pamięci', () => {
    const trasy = konfig.routes.filter((t) => t.headers);
    const assets = trasy.find((t) => t.src === '/assets/(.*)');
    expect(assets?.headers?.['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(assets?.continue).toBe(true);
    const strony = trasy.find((t) => t.headers?.['cache-control'] === 'no-cache');
    expect(strony?.continue).toBe(true);
    // wzór stron obejmuje stronę główną, v03 i dema (jak `@html` i `/demo/*` w conf-obok/Caddyfile)
    const wzor = new RegExp(`^${strony?.src}$`);
    for (const sciezka of ['/', '/index.html', '/v03/', '/v03/index.html', '/demo/przymorze.json']) {
      expect(wzor.test(sciezka), sciezka).toBe(true);
    }
    expect(wzor.test('/assets/index-abc123.js')).toBe(false);
  });
});

describe('deploy/hetzner/compose.obok.yml', () => {
  const tekst = czytaj('deploy/hetzner/compose.obok.yml');
  const linie = tekst.split('\n');

  /** treść usługi: od linii `  <nazwa>:` do następnej usługi albo bloku najwyższego poziomu */
  function usluga(nazwa: string): string {
    const start = linie.indexOf(`  ${nazwa}:`);
    expect(start, `usługa ${nazwa}`).toBeGreaterThanOrEqual(0);
    let koniec = start + 1;
    while (koniec < linie.length && !/^ {0,2}\S/.test(linie[koniec] ?? '')) koniec++;
    return linie.slice(start, koniec).join('\n');
  }

  it('serwer testowy `api` i produkcyjny `api-prod` stoją na tym samym obrazie, z osobnymi wolumenami i sekretami', () => {
    const test = usluga('api');
    const prod = usluga('api-prod');
    expect(test).toContain('container_name: za-murem-api\n');
    expect(test).toContain('ZM_ZRODLA=https://${SITE},https://zamurem-*-mateuszs-projects-73382f2a.vercel.app');
    expect(test).toContain('ZM_ZAUFANE_PROXY=1');
    expect(test).toContain('ZM_PROXY_SEKRET=${ZM_PROXY_SEKRET_TEST}');
    expect(test).toContain('ZM_KONTAKT=${ZM_KONTAKT}');
    expect(test).toContain('- dane:/dane');
    expect(test).not.toContain('ZM_LICZNIKI_TOKEN');

    expect(prod).toContain('container_name: za-murem-api-prod');
    expect(prod).toContain('ZM_ZRODLA=https://zamurem.vercel.app\n');
    expect(prod).toContain('ZM_ZAUFANE_PROXY=1');
    expect(prod).toContain('ZM_PROXY_SEKRET=${ZM_PROXY_SEKRET_PROD}');
    expect(prod).toContain('ZM_KONTAKT=${ZM_KONTAKT}');
    expect(prod).toContain('ZM_LICZNIKI_TOKEN=${ZM_LICZNIKI_TOKEN}');
    expect(prod).toContain('ZM_RESTART_H=48');
    expect(prod).toContain('ZM_KOPIE=/dane/kopie');
    expect(prod).toContain('- dane_prod:/dane');
    // ten sam obraz: oba budują z tych samych źródeł
    for (const u of [test, prod]) {
      expect(u).toContain('context: ./serwer-zrodla');
      expect(u).toContain('dockerfile: server/Dockerfile');
    }
    expect(tekst).toMatch(/^volumes:\n(?:.*\n)*? {2}dane_prod:/m);
  });

  it('sekrety i kontakt tylko jako ${…} z .env, zawsze ze znakiem zastępczym, nigdy wartość w pliku', () => {
    const wartosci = linie.filter((l) => /ZM_(PROXY_SEKRET|LICZNIKI_TOKEN|KONTAKT)=/.test(l));
    expect(wartosci.length).toBeGreaterThanOrEqual(5);
    for (const l of wartosci) expect(l, l).toMatch(/=\$\{[A-Z_]+\}\s*$/);
  });

  it('źródła Origin nie dostają wzoru na całe vercel.app, gwiazdka zostaje w nazwach naszego projektu', () => {
    expect(tekst).not.toMatch(/\*\.vercel\.app/);
    expect(tekst).not.toMatch(/https:\/\/\*/);
    const wzor = 'https://zamurem-*-mateuszs-projects-73382f2a.vercel.app';
    expect(pasujeZrodlo('https://zamurem-git-wyjscie-na-swiat-mateuszs-projects-73382f2a.vercel.app', [wzor])).toBe(
      true,
    );
    expect(pasujeZrodlo('https://zamurem-k3x9d2a-mateuszs-projects-73382f2a.vercel.app', [wzor])).toBe(true);
    expect(pasujeZrodlo('https://zamurem-x-cudzy-projects-11111111.vercel.app', [wzor])).toBe(false);
    expect(pasujeZrodlo('https://zamurem.vercel.app', [wzor])).toBe(false);
  });
});

describe('deploy/pages/index.html', () => {
  const tekst = czytaj('deploy/pages/index.html');

  it('przekierowuje na nowy adres: meta refresh i widoczny odnośnik, po polsku i po angielsku', () => {
    expect(tekst).toMatch(/<meta http-equiv="refresh" content="\d+; ?url=https:\/\/zamurem\.vercel\.app\/">/);
    expect(tekst).toContain('<a href="https://zamurem.vercel.app/">');
    expect(tekst).toContain('lang="pl"');
    expect(tekst).toMatch(/Gra przeniosła się/);
    expect(tekst).toMatch(/has moved/i);
  });

  it('jest samodzielna: bez skryptów i zewnętrznych zasobów', () => {
    expect(tekst).not.toMatch(/<script/i);
    expect(tekst).not.toMatch(/<link[^>]+href=/i);
    expect(tekst).not.toMatch(/src=/i);
  });
});
