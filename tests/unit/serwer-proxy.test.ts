/* Serwer za Vercelem (etap 1, zadanie 1): adres klienta z nagłówka tylko przy sekrecie proxy (x-zm-proxy), źródła
   Origin z gwiazdką dla podglądów gałęzi i pole `ip` w /api/zdrowie (skąd serwer wziął adres, bez samego adresu).
   Serwer w procesie testu (tests/unit/serwer-pomoc.ts), bez sieci. */

import { afterEach, describe, expect, it } from 'vitest';
import { NAGLOWEK_PROXY, pasujeZrodlo } from '../../server/app.ts';
import { przegladarka, type SerwerTestowy, serwerTestowy } from './serwer-pomoc.ts';

const SEKRET = 's3kret';
const DANE = { nick: 'Mateusz_test', haslo: 'bardzo-tajne-1' };
/** limit żądań na adres w minutę (server/app.ts): 300 przechodzi, 301. to 429 */
const LIMIT = 300;

let serwery: SerwerTestowy[] = [];
async function start(opcje: Parameters<typeof serwerTestowy>[0] = {}) {
  const s = await serwerTestowy(opcje);
  serwery.push(s);
  return s;
}
afterEach(async () => {
  await Promise.all(serwery.map((s) => s.zamknij()));
  serwery = [];
});

/** tyle żądań /api/zdrowie z podanymi nagłówkami; zwraca status ostatniego */
async function zalej(s: SerwerTestowy, ile: number, naglowki: Record<string, string>) {
  const p = przegladarka(s.adres, naglowki);
  let status = 0;
  for (let i = 0; i < ile; i++) status = (await p.zadanie('GET', '/api/zdrowie')).status;
  return status;
}

describe('serwer za Vercelem: adres klienta', () => {
  it('z dobrym sekretem adres klienta z x-real-ip: dwóch klientów za tym samym proxy ma osobne limity', async () => {
    const s = await start({ proxySekret: SEKRET });
    const pierwszy = { [NAGLOWEK_PROXY]: SEKRET, 'x-real-ip': '10.0.0.1' };
    expect(await zalej(s, LIMIT, pierwszy)).toBe(200);
    expect(await zalej(s, 1, pierwszy)).toBe(429);
    // drugi klient przychodzi tym samym połączeniem (to samo proxy), ale ma własny licznik
    expect(await zalej(s, 1, { [NAGLOWEK_PROXY]: SEKRET, 'x-real-ip': '10.0.0.2' })).toBe(200);
  });

  it('bez sekretu albo ze złym sekretem nagłówek x-real-ip się nie liczy', async () => {
    const s = await start({ proxySekret: SEKRET });
    // zły sekret, różne adresy: wszystko to jedno połączenie, więc wspólny limit
    for (let i = 0; i < LIMIT; i++) {
      const r = await przegladarka(s.adres, { [NAGLOWEK_PROXY]: 'zly', 'x-real-ip': `10.0.${i % 250}.1` }).zadanie(
        'GET',
        '/api/zdrowie',
      );
      expect(r.status).toBe(200);
    }
    expect(await zalej(s, 1, { [NAGLOWEK_PROXY]: 'zly', 'x-real-ip': '10.9.9.9' })).toBe(429);
    // bez nagłówka sekretu też; a prawdziwy klient z sekretem zostaje przy własnym adresie
    expect(await zalej(s, 1, { 'x-real-ip': '10.9.9.8' })).toBe(429);
    expect(await zalej(s, 1, { [NAGLOWEK_PROXY]: SEKRET, 'x-real-ip': '10.9.9.7' })).toBe(200);
  });

  it('serwer bez ustawionego sekretu ignoruje x-zm-proxy, także pusty', async () => {
    const s = await start();
    expect(await zalej(s, LIMIT, { [NAGLOWEK_PROXY]: '', 'x-real-ip': '10.0.0.1' })).toBe(200);
    expect(await zalej(s, 1, { [NAGLOWEK_PROXY]: '', 'x-real-ip': '10.0.0.2' })).toBe(429);
  });

  it('nagłówek z adresem da się zmienić (proxyNaglowekIp), a z sekretem bez adresu liczy się połączenie', async () => {
    const s = await start({ proxySekret: SEKRET, proxyNaglowekIp: 'x-vercel-ip' });
    const a = { [NAGLOWEK_PROXY]: SEKRET, 'x-vercel-ip': '10.0.0.1', 'x-real-ip': '10.0.0.5' };
    expect(await zalej(s, LIMIT, a)).toBe(200);
    expect(await zalej(s, 1, a)).toBe(429);
    // ten sam x-real-ip, inny x-vercel-ip: osobny licznik, bo domyślny nagłówek już się nie liczy
    expect(await zalej(s, 1, { ...a, 'x-vercel-ip': '10.0.0.2' })).toBe(200);
    // sekret jest, adresu nie ma: spada na adres połączenia (nie wywala się)
    const r = await przegladarka(s.adres, { [NAGLOWEK_PROXY]: SEKRET }).zadanie('GET', '/api/zdrowie');
    expect(r.status).toBe(200);
    expect(r.body.ip).toBe('polaczenie');
  });

  it('zdrowie mówi, skąd serwer wziął adres klienta, bez samego adresu', async () => {
    const zProxy = await start({ proxySekret: SEKRET });
    const dobry = await przegladarka(zProxy.adres, { [NAGLOWEK_PROXY]: SEKRET, 'x-real-ip': '10.0.0.1' }).zadanie(
      'GET',
      '/api/zdrowie',
    );
    expect(dobry.body).toEqual({ ok: true, gra: 'za-murem', wersja: 1, ip: 'proxy' });
    expect(dobry.tekst).not.toContain('10.0.0.1');
    expect(dobry.headers.get('cache-control')).toBe('no-store');
    const zly = await przegladarka(zProxy.adres, { [NAGLOWEK_PROXY]: 'zly', 'x-real-ip': '10.0.0.1' }).zadanie(
      'GET',
      '/api/zdrowie',
    );
    expect(zly.body.ip).toBe('polaczenie');
    expect(zly.tekst).not.toContain('10.0.0.1');

    const bez = await start();
    expect((await przegladarka(bez.adres).zadanie('GET', '/api/zdrowie')).body.ip).toBe('polaczenie');

    const zXff = await start({ zaufaneProxy: true });
    const xff = await przegladarka(zXff.adres, { 'X-Forwarded-For': '1.2.3.4, 10.0.0.1' }).zadanie(
      'GET',
      '/api/zdrowie',
    );
    expect(xff.body.ip).toBe('xff');
    expect(xff.tekst).not.toContain('10.0.0.1');
    // zaufane proxy bez X-Forwarded-For to nadal adres połączenia
    expect((await przegladarka(zXff.adres).zadanie('GET', '/api/zdrowie')).body.ip).toBe('polaczenie');
  });

  it('sekret proxy ma pierwszeństwo przed X-Forwarded-For, gdy są oba', async () => {
    const s = await start({ proxySekret: SEKRET, zaufaneProxy: true });
    const r = await przegladarka(s.adres, {
      [NAGLOWEK_PROXY]: SEKRET,
      'x-real-ip': '10.0.0.1',
      'X-Forwarded-For': '1.2.3.4',
    }).zadanie('GET', '/api/zdrowie');
    expect(r.body.ip).toBe('proxy');
  });
});

describe('serwer za Vercelem: źródła z gwiazdką', () => {
  const PODGLAD = 'https://zamurem-*-mateuszs-projects-73382f2a.vercel.app';

  it('źródło z gwiazdką przepuszcza podgląd gałęzi i nic poza nim', () => {
    const wzory = [PODGLAD];
    expect(pasujeZrodlo('https://zamurem-git-druzyna-mateuszs-projects-73382f2a.vercel.app', wzory)).toBe(true);
    expect(pasujeZrodlo('https://zamurem-abc123xyz-mateuszs-projects-73382f2a.vercel.app', wzory)).toBe(true);
    expect(pasujeZrodlo('https://zly.vercel.app', wzory)).toBe(false);
    // kropka w gwiazdce: to już inna domena
    expect(pasujeZrodlo('https://zamurem-a.b-mateuszs-projects-73382f2a.vercel.app', wzory)).toBe(false);
    // gwiazdka nie bierze pustego kawałka ani ukośnika, a reszta wzoru jest dosłowna (kropki to kropki)
    expect(pasujeZrodlo('https://zamurem--mateuszs-projects-73382f2a.vercel.app', wzory)).toBe(false);
    expect(pasujeZrodlo('https://zamurem-a-mateuszs-projects-73382f2a.vercelxapp', wzory)).toBe(false);
    expect(pasujeZrodlo('http://zamurem-a-mateuszs-projects-73382f2a.vercel.app', wzory)).toBe(false);
    expect(pasujeZrodlo('https://zamurem-a-mateuszs-projects-73382f2a.vercel.app.zla.example', wzory)).toBe(false);
    expect(pasujeZrodlo('https://zla.example/zamurem-a-mateuszs-projects-73382f2a.vercel.app', wzory)).toBe(false);
    expect(pasujeZrodlo('', wzory)).toBe(false);
    expect(pasujeZrodlo('https://zamurem.vercel.app', [])).toBe(false);
  });

  it('wzór bez gwiazdki to dosłowne porównanie, a lista może mieszać oba rodzaje', () => {
    expect(pasujeZrodlo('https://zamurem.vercel.app', ['https://zamurem.vercel.app'])).toBe(true);
    expect(pasujeZrodlo('https://zamurem.vercel.app', ['https://zamurem.vercel.app', PODGLAD])).toBe(true);
    expect(pasujeZrodlo('https://zamurem.vercel.app/', ['https://zamurem.vercel.app'])).toBe(false);
    expect(pasujeZrodlo('https://zamurem-vercel-app', ['https://zamurem.vercel.app'])).toBe(false);
    expect(
      pasujeZrodlo('https://zamurem-git-x-mateuszs-projects-73382f2a.vercel.app', [
        'https://zamurem.vercel.app',
        PODGLAD,
      ]),
    ).toBe(true);
  });

  it('serwer z listą źródeł z gwiazdką przyjmuje Origin podglądu i odrzuca obcy', async () => {
    const s = await start({ zrodla: ['https://zamurem.vercel.app', PODGLAD] });
    const podglad = 'https://zamurem-git-druzyna-mateuszs-projects-73382f2a.vercel.app';
    expect((await przegladarka(s.adres, { Origin: podglad }).zadanie('POST', '/api/konto', DANE)).status).toBe(201);
    const obcy = await przegladarka(s.adres, { Origin: 'https://zly.vercel.app' }).zadanie('POST', '/api/konto', {
      nick: 'Inny_nick',
      haslo: 'bardzo-tajne-2',
    });
    expect(obcy.status).toBe(403);
    expect(obcy.body.blad).toBe('obce_zrodlo');
    expect(
      (await przegladarka(s.adres, { Origin: 'https://zamurem.vercel.app' }).zadanie('POST', '/api/sesja', DANE))
        .status,
    ).toBe(200);
  });
});
