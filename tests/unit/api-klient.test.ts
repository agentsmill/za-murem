import { afterEach, describe, expect, it } from 'vitest';
import { utworzApi } from '../../src/net/api.ts';
import { maAdres, zapisBezAdresu } from '../../src/net/protokol.ts';
import { klatkiBudynku, kluczeSwiata, prostokatMapy } from '../../src/world/klucze.ts';
import { toGeoT } from '../../src/world/mvt.ts';
import { buildWorld, LOAD_RADIUS } from '../../src/world/world.ts';
import { ADDRESSES, decodedTiles } from './fixtures.ts';
import { przegladarka, type SerwerTestowy, serwerTestowy } from './serwer-pomoc.ts';

let serwery: SerwerTestowy[] = [];
async function start() {
  const s = await serwerTestowy();
  serwery.push(s);
  return s;
}
afterEach(async () => {
  await Promise.all(serwery.map((s) => s.zamknij()));
  serwery = [];
});

/** klient API jak w przeglądarce gracza: względne /api, ciasteczko sesji */
const gracz = (s: SerwerTestowy) => utworzApi({ fetch: przegladarka(s.adres).fetch });

/** fetch, który zawsze odpowiada tym samym (albo wcale) */
const staly =
  (odp: () => Promise<Response>): typeof fetch =>
  async () =>
    odp();

describe('klient API gry sieciowej (src/net/api.ts)', () => {
  it('wysyła JSON z ciasteczkiem tej samej domeny pod /api', async () => {
    const wolania: [string, RequestInit][] = [];
    const api = utworzApi({
      fetch: async (url, init = {}) => {
        wolania.push([String(url), init]);
        return new Response(JSON.stringify({ nick: 'Ktoś', utworzone: 1, klatki: 0, zapis: false }), {
          status: 201,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });
      },
    });
    const r = await api.zaloz('Ktoś', 'dobre-haslo-1');
    expect(r).toEqual({ ok: true, status: 201, dane: { nick: 'Ktoś', utworzone: 1, klatki: 0, zapis: false } });
    const [url, init] = wolania[0];
    expect(url).toBe('/api/konto');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
    expect(JSON.parse(String(init.body))).toEqual({ nick: 'Ktoś', haslo: 'dobre-haslo-1' });
    // klucz klatki w ścieżce zakodowany (dwukropki i ukośnik)
    await api.zwolnij('px:1:2:3:4/2');
    expect(wolania[1][0]).toBe('/api/klatki/px%3A1%3A2%3A3%3A4%2F2');
    expect(wolania[1][1].body).toBeUndefined();
  });

  it('bez serwera gry (GitHub Pages, offline, czas minął, inny serwer) gra wie, że go nie ma', async () => {
    const pages = utworzApi({
      fetch: staly(
        async () =>
          new Response('<!doctype html><title>404</title>', { status: 404, headers: { 'Content-Type': 'text/html' } }),
      ),
    });
    expect(await pages.serwerDostepny()).toBe(false);
    expect(await pages.zdrowie()).toMatchObject({ ok: false, status: 404, blad: 'brak_serwera' });
    const offline = utworzApi({ fetch: staly(() => Promise.reject(new TypeError('Failed to fetch'))) });
    expect(await offline.serwerDostepny()).toBe(false);
    expect(await offline.ja()).toMatchObject({ ok: false, status: 0, blad: 'siec' });
    const wolny = utworzApi({
      czas: 20,
      fetch: (_u, init) =>
        new Promise((_ok, zle) =>
          init?.signal?.addEventListener('abort', () => zle(new DOMException('przerwane', 'AbortError'))),
        ),
    });
    expect(await wolny.ja()).toMatchObject({ ok: false, status: 0, blad: 'czas' });
    const inny = utworzApi({
      fetch: staly(async () => new Response('{"ok":true}', { headers: { 'Content-Type': 'application/json' } })),
    });
    expect(await inny.serwerDostepny()).toBe(false);
    const zepsuty = utworzApi({
      fetch: staly(
        async () => new Response('{"ok":', { status: 500, headers: { 'Content-Type': 'application/json' } }),
      ),
    });
    expect(await zepsuty.ja()).toMatchObject({ ok: false, status: 500, blad: 'brak_serwera' });
  });

  it('z prawdziwym serwerem: konto, klatka siedziby z kluczy świata, konflikt drugiej drużyny, zapis bez adresu', async () => {
    const s = await start();
    const a = gracz(s);
    const b = gracz(s);
    expect(await a.serwerDostepny()).toBe(true);
    expect((await a.zaloz('Przymorzanie', 'falowiec-1971')).ok).toBe(true);
    expect((await b.zaloz('Sasiedzi', 'falowiec-1972')).ok).toBe(true);

    // świat Przymorza z kafelków: klatka z drzwiami siedziby jako pierwsza klatka drużyny
    const adr = ADDRESSES[0];
    const geo = toGeoT(decodedTiles(adr), adr.lat, adr.lon, LOAD_RADIUS);
    const w = buildWorld(geo, { seed: 1 });
    const hq = kluczeSwiata(w, geo.c)[w.hq];
    expect(hq).not.toBeNull();
    const klatka = hq?.klatki.find((k) => k.klucz === hq.wejscia[0]);
    expect(klatka).toBeDefined();
    if (!klatka) return;
    const zajecie = await a.zajmij({ klucz: klatka.klucz, budynek: klatka.budynek, lat: klatka.lat, lon: klatka.lon });
    expect(zajecie).toMatchObject({ ok: true, status: 201, dane: { klatka: { moja: true, siedziba: true } } });
    // druga drużyna z tym samym adresem: klatka zajęta, drużyna zaczyna bez domu
    const konflikt = await b.zajmij({ klucz: klatka.klucz, budynek: klatka.budynek, lat: klatka.lat, lon: klatka.lon });
    expect(konflikt).toMatchObject({ ok: false, status: 409, blad: 'zajeta' });
    // druga drużyna widzi zajętą klatkę na swojej mapie i wolną obok w tym samym bloku
    const widok = await b.zajete(prostokatMapy(w, geo.c));
    expect(widok.ok && widok.dane.klatki.map((k) => [k.klucz, k.moja])).toEqual([[klatka.klucz, false]]);
    const wolna = klatkiBudynku(w.buildings[w.hq]).find((k) => k.klucz !== klatka.klucz);
    expect(wolna, 'siedziba na Przymorzu to blok z kilkoma klatkami').toBeDefined();
    if (wolna) expect((await b.zajmij(wolna)).ok).toBe(true);

    // zapis w chmurze: klient sam usuwa adres (także numery domów z mapy), wersje chronią przed nadpisaniem
    // z drugiego komputera
    const zapis = {
      v: 1,
      data: { name: 'Przymorze', addr: 'Obrońców Wybrzeża 4, Gdańsk', street: 'Obrońców Wybrzeża', geo },
    };
    expect(geo.b.some((b) => b.t['addr:housenumber'])).toBe(true);
    const z1 = await a.wyslijZapis(zapis, 0);
    expect(z1).toMatchObject({ ok: true, dane: { wersja: 1 } });
    const odczyt = await a.pobierzZapis();
    expect(odczyt.ok).toBe(true);
    if (!odczyt.ok) return;
    const wChmurze = odczyt.dane.dane as { data: { name: string; addr?: string; geo: typeof geo } };
    expect(wChmurze.data.name).toBe('Przymorze');
    expect(wChmurze.data.addr).toBeUndefined();
    expect(JSON.stringify(wChmurze)).not.toMatch(/"addr:/);
    // nazwa ulicy zostaje tylko w nazwach miejsc z OSM (np. apteka „na Obrońców Wybrzeża”), nie w danych adresu
    const zUlica = JSON.stringify(wChmurze.data.geo.b).includes('Obrońców Wybrzeża');
    expect(zUlica).toBe(false);
    // świat z zapisu w chmurze jest ten sam (adres nie wpływa na budowę świata), klucze też
    const wZChmury = buildWorld(wChmurze.data.geo, { seed: 1 });
    expect(kluczeSwiata(wZChmury, wChmurze.data.geo.c)).toEqual(kluczeSwiata(w, geo.c));
    expect(wZChmury.buildings.map((b) => b.tiles)).toEqual(w.buildings.map((b) => b.tiles));
    expect(await a.wyslijZapis(zapis, 0)).toMatchObject({ ok: false, status: 409, blad: 'konflikt_wersji', wersja: 1 });

    // zwolnienie po kluczu z dwukropkami i ukośnikiem, wylogowanie, usunięcie konta
    expect((await a.zwolnij(klatka.klucz)).ok).toBe(true);
    expect(await a.moje()).toMatchObject({ ok: true, dane: { klatki: [] } });
    expect((await a.wyloguj()).ok).toBe(true);
    expect(await a.ja()).toMatchObject({ ok: false, status: 401, blad: 'brak_sesji' });
    expect((await a.zaloguj('przymorzanie', 'falowiec-1971')).ok).toBe(true);
    expect((await a.usunKonto('falowiec-1971')).ok).toBe(true);
    expect((await a.zaloguj('Przymorzanie', 'falowiec-1971')).ok).toBe(false);
  });

  it('za dużo prób: kod 429 z czasem do następnej próby', async () => {
    const s = await start();
    const a = gracz(s);
    await a.zaloz('Zapominalski', 'dobre-haslo-1');
    let r = await a.zaloguj('Zapominalski', 'zle-haslo-1');
    for (let i = 0; i < 10; i++) r = await a.zaloguj('Zapominalski', 'zle-haslo-1');
    expect(r).toMatchObject({ ok: false, status: 429, blad: 'za_duzo_prob' });
    expect(!r.ok && r.ponowZa).toBeGreaterThan(0);
  });

  it('zapis bez adresu: znikają data.addr, data.street i tagi addr:*, nazwa z numerem zmienia się na „Osiedle”', () => {
    const geo = {
      c: [54.4, 18.6],
      b: [
        {
          p: [],
          t: { building: 'yes', 'addr:housenumber': '4B', 'addr:street': 'Obrońców Wybrzeża', name: 'Falowiec' },
        },
        { p: [], t: { building: 'school', name: 'Szkoła nr 23' } },
      ],
    };
    const z = { v: 1, data: { addr: 'x', street: 'y', name: 'Przymorze', src: 'mvt', geo }, sim: { tick: 5 } };
    expect(maAdres(z)).toBe(true);
    const bez = zapisBezAdresu(z);
    expect(bez).toEqual({
      v: 1,
      data: {
        name: 'Przymorze',
        src: 'mvt',
        geo: {
          c: [54.4, 18.6],
          b: [
            { p: [], t: { building: 'yes', name: 'Falowiec' } },
            { p: [], t: { building: 'school', name: 'Szkoła nr 23' } },
          ],
        },
      },
      sim: { tick: 5 },
    });
    expect(maAdres(bez)).toBe(false);
    // oryginał bez zmian
    expect(z.data.addr).toBe('x');
    expect(z.data.geo.b[0].t['addr:housenumber']).toBe('4B');
    // nazwa osiedla to czasem wpisany adres albo sama ulica
    expect(zapisBezAdresu({ data: { name: 'Obrońców Wybrzeża 4, Gdańsk' } })).toEqual({ data: { name: 'Osiedle' } });
    expect(zapisBezAdresu({ data: { name: 'Lanciego', street: 'Lanciego' } })).toEqual({ data: { name: 'Osiedle' } });
    expect(maAdres({ data: { name: 'Lanciego 10G' } })).toBe(true);
    expect(maAdres({ data: { geo: { b: [{ t: { 'addr:housenumber': '7' } }] } } })).toBe(true);
    expect(zapisBezAdresu({ v: 1 })).toEqual({ v: 1 });
    expect(maAdres({ data: { addr: '' } })).toBe(false);
  });

  it('prostokąt mapy obejmuje cały obrócony kwadrat świata z zapasem i mieści się w limicie zapytania', () => {
    const adr = ADDRESSES[0];
    const geo = toGeoT(decodedTiles(adr), adr.lat, adr.lon, LOAD_RADIUS);
    const w = buildWorld(geo, { seed: 1 });
    const p = prostokatMapy(w, geo.c);
    expect(p.s).toBeLessThan(adr.lat);
    expect(p.n).toBeGreaterThan(adr.lat);
    expect(p.w).toBeLessThan(adr.lon);
    expect(p.e).toBeGreaterThan(adr.lon);
    // klatki wszystkich budynków świata (także uciętych brzegiem mapy) są w prostokącie
    const klucze = kluczeSwiata(w, geo.c);
    let ile = 0;
    for (const k of klucze)
      for (const kl of k?.klatki ?? []) {
        ile++;
        expect(kl.lat).toBeGreaterThan(p.s);
        expect(kl.lat).toBeLessThan(p.n);
        expect(kl.lon).toBeGreaterThan(p.w);
        expect(kl.lon).toBeLessThan(p.e);
      }
    expect(ile).toBeGreaterThan(100);
    expect(p.n - p.s).toBeLessThan(0.05);
    expect(p.e - p.w).toBeLessThan(0.08);
  });
});
