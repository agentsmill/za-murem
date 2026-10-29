import { afterEach, describe, expect, it, vi } from 'vitest';
import { komunikatEn, utworzApi } from '../../src/net/api.ts';
import { KOD_DLUGOSC, KOMUNIKAT_BRAK_ADRESU, maAdres, normalizujKod, zapisBezAdresu } from '../../src/net/protokol.ts';
import { klatkiBudynku, kluczeSwiata, prostokatMapy } from '../../src/world/klucze.ts';
import { toGeoT } from '../../src/world/mvt.ts';
import { buildWorld, LOAD_RADIUS } from '../../src/world/world.ts';
import { ADDRESSES, decodedTiles } from './fixtures.ts';
import { przegladarka, type SerwerTestowy, serwerTestowy } from './serwer-pomoc.ts';

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

/** odpowiedź Nominatim dla bloku na Przymorzu (udawany fetch serwera, bez sieci) */
const NOMINATIM_GDANSK = [
  {
    lat: '54.4153',
    lon: '18.5748',
    display_name: '4, Obrońców Wybrzeża, Przymorze Małe, Gdańsk, Polska',
    address: { house_number: '4', road: 'Obrońców Wybrzeża', neighbourhood: 'Przymorze Małe', city: 'Gdańsk' },
  },
];

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
    // druga drużyna widzi zajętą klatkę na swojej mapie i wolną obok w tym samym bloku; bez siedziby pyta wokół
    // swojego punktu startu
    expect(await b.punktStartu(adr.lat, adr.lon)).toMatchObject({ ok: true, status: 204 });
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

  it('drużyna, kod i powrót przez klienta: druga przeglądarka z kodem widzi ten sam znak', async () => {
    const wolania: [string, RequestInit][] = [];
    const nagrywacz = utworzApi({
      fetch: async (url, init = {}) => {
        wolania.push([String(url), init]);
        return new Response(null, { status: 204 });
      },
    });
    await nagrywacz.druzyna();
    await nagrywacz.nowyKod();
    await nagrywacz.usunDruzyne();
    // serwer chce JSON także przy pustym żądaniu: POST i DELETE z `{}` niosą Content-Type
    expect(wolania.map(([u, i]) => [i.method, u, new Headers(i.headers).get('content-type'), i.body])).toEqual([
      ['POST', '/api/druzyna', 'application/json', '{}'],
      ['POST', '/api/druzyna/kod', 'application/json', '{}'],
      ['DELETE', '/api/konto', 'application/json', '{}'],
    ]);

    const s = await start();
    const a = gracz(s);
    const zalozona = await a.druzyna();
    expect(zalozona).toMatchObject({ ok: true, status: 201, dane: { nick: null, anonimowe: true, kod: false } });
    if (!zalozona.ok) return;
    const znak = zalozona.dane.znak;
    expect(znak).toMatch(/^#\d+$/);
    // z ważną sesją to samo konto, bez nowej drużyny
    expect(await a.druzyna()).toMatchObject({ ok: true, status: 200, dane: { znak } });
    expect(await a.ja()).toMatchObject({ ok: true, dane: { znak, kod: false } });

    const nowy = await a.nowyKod();
    expect(nowy.ok).toBe(true);
    if (!nowy.ok) return;
    expect(nowy.dane.kod).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(normalizujKod(nowy.dane.kod)).toHaveLength(KOD_DLUGOSC);
    expect(await a.ja()).toMatchObject({ ok: true, dane: { znak, kod: true } });

    // druga przeglądarka (bez ciasteczka) wraca kodem: ten sam znak, a pierwsza sesja działa dalej
    const b = gracz(s);
    expect(await b.ja()).toMatchObject({ ok: false, status: 401, blad: 'brak_sesji' });
    const powrot = await b.powrot(nowy.dane.kod.toLowerCase().replaceAll('-', ' '));
    expect(powrot).toMatchObject({ ok: true, status: 200, dane: { znak, anonimowe: true, kod: true } });
    expect(await b.ja()).toMatchObject({ ok: true, dane: { znak } });
    expect(await a.ja()).toMatchObject({ ok: true, dane: { znak } });

    // zły kod to 401 zly_kod; nowy kod wygasza poprzedni
    const obca = gracz(s);
    expect(await obca.powrot('AAAA-AAAA-AAAA')).toMatchObject({ ok: false, status: 401, blad: 'zly_kod' });
    expect(await obca.powrot('to nie jest kod')).toMatchObject({ ok: false, status: 401, blad: 'zly_kod' });
    const drugi = await b.nowyKod();
    expect(drugi.ok).toBe(true);
    if (!drugi.ok) return;
    expect(drugi.dane.kod).not.toBe(nowy.dane.kod);
    expect(await obca.powrot(nowy.dane.kod)).toMatchObject({ ok: false, blad: 'zly_kod' });
    expect(await obca.powrot(drugi.dane.kod)).toMatchObject({ ok: true, dane: { znak } });

    // drużyna anonimowa usuwa się bez hasła, razem z kodem
    expect(await a.usunDruzyne()).toMatchObject({ ok: true, status: 204 });
    expect(await a.ja()).toMatchObject({ ok: false, status: 401, blad: 'brak_sesji' });
    expect(await gracz(s).powrot(drugi.dane.kod)).toMatchObject({ ok: false, blad: 'zly_kod' });
  });

  it('punkt startu i zapytanie o klatki: bez punktu błąd brak_startu, z punktem lista', async () => {
    const s = await start();
    const a = gracz(s);
    await a.druzyna();
    const adr = ADDRESSES[0];
    const geo = toGeoT(decodedTiles(adr), adr.lat, adr.lon, LOAD_RADIUS);
    const w = buildWorld(geo, { seed: 1 });
    const mapa = prostokatMapy(w, geo.c);
    expect(await a.zajete(mapa)).toMatchObject({ ok: false, status: 409, blad: 'brak_startu' });
    expect(await a.punktStartu(adr.lat, adr.lon)).toMatchObject({ ok: true, status: 204 });
    expect(await a.zajete(mapa)).toMatchObject({ ok: true, dane: { klatki: [] } });
    // prostokąt 20 km dalej od punktu startu to poza_okolica
    const dalej = { s: mapa.s + 0.2, w: mapa.w, n: mapa.n + 0.2, e: mapa.e };
    expect(await a.zajete(dalej)).toMatchObject({ ok: false, status: 403, blad: 'poza_okolica' });
    // zły punkt to 400 (nie liczy się do limitu), a zmiana okolicy ma dzienny limit z czasem do następnej próby
    expect(await a.punktStartu(Number.NaN, adr.lon)).toMatchObject({ ok: false, status: 400, blad: 'zle_dane' });
    let r = await a.punktStartu(adr.lat, adr.lon);
    for (let i = 0; i < 6; i++) r = await a.punktStartu(adr.lat + i * 1e-4, adr.lon);
    expect(r).toMatchObject({ ok: false, status: 429, blad: 'za_duzo_prob' });
    expect(!r.ok && r.ponowZa).toBeGreaterThan(0);
  });

  it('zdarzenia do liczników: znane przyjęte bez sesji, nieznane to zle_dane, bez sieci bez wyjątku', async () => {
    const s = await start();
    const bezSesji = gracz(s);
    expect(await bezSesji.zdarzenie('start:zwykly:pl:komp')).toMatchObject({ ok: true, status: 204 });
    expect(await bezSesji.zdarzenie('cel:R0.zaznacz')).toMatchObject({ ok: true, status: 204 });
    expect(await bezSesji.zdarzenie('dzien:2')).toMatchObject({ ok: true, status: 204 });
    expect(await bezSesji.zdarzenie('Jan Kowalski, Wołoska 12')).toMatchObject({
      ok: false,
      status: 400,
      blad: 'zle_dane',
    });
    const offline = utworzApi({ fetch: staly(() => Promise.reject(new TypeError('Failed to fetch'))) });
    expect(await offline.zdarzenie('dzien:3')).toMatchObject({ ok: false, status: 0, blad: 'siec' });
  });

  it('adres: serwer pyta za gracza, klient dostaje WynikAdresu; brak adresu to nie_ma', async () => {
    const wolania: URL[] = [];
    const s = await start({
      adres: {
        odstepMs: 0,
        fetch: (async (wejscie: RequestInfo | URL) => {
          const url = new URL(String(wejscie));
          wolania.push(url);
          const nic = (url.searchParams.get('q') ?? '').startsWith('Asdfgh');
          return new Response(JSON.stringify(nic ? [] : NOMINATIM_GDANSK), {
            headers: { 'content-type': 'application/json' },
          });
        }) as typeof fetch,
      },
    });
    const przegl = przegladarka(s.adres);
    const api = utworzApi({ fetch: przegl.fetch });
    const r = await api.adres('Obrońców Wybrzeża 4, Gdańsk', 'en');
    expect(r).toEqual({
      ok: true,
      status: 200,
      dane: {
        lat: 54.4153,
        lon: 18.5748,
        label: '4, Obrońców Wybrzeża, Przymorze Małe, Gdańsk, Polska',
        area: 'Przymorze Małe',
        street: 'Obrońców Wybrzeża',
        city: 'Gdańsk',
      },
    });
    // do Nominatim poszedł wpisany tekst w wybranym języku, a serwer gry nie ustawił ciasteczka
    expect(wolania[0].searchParams.get('q')).toBe('Obrońców Wybrzeża 4, Gdańsk');
    expect(wolania[0].searchParams.get('accept-language')).toBe('en');
    expect(przegl.ciasteczko).toBe('');
    // ten sam adres wpisany inaczej wychodzi z pamięci serwera
    expect((await api.adres('  obrońców  wybrzeża 4,  GDAŃSK ', 'en')).ok).toBe(true);
    expect(wolania).toHaveLength(1);
    // znaki specjalne w adresie dochodzą w całości (kodowanie zapytania)
    const urle: string[] = [];
    const nagrywacz = utworzApi({
      fetch: async (url) => {
        urle.push(String(url));
        return new Response(null, { status: 204 });
      },
    });
    await nagrywacz.adres('Brzeska 3/5 & 7?, Łódź', 'pl');
    const poslany = new URL(urle[0], 'http://serwer.test');
    expect(poslany.pathname).toBe('/api/adres');
    expect([...poslany.searchParams]).toEqual([
      ['q', 'Brzeska 3/5 & 7?, Łódź'],
      ['j', 'pl'],
    ]);

    // „adresu nie ma” rozpoznaje się po zdaniu z protokołu, bo nieznana trasa też daje 404 nie_ma (z innym zdaniem)
    expect(await api.adres('Asdfgh 99999, Nigdzie', 'pl')).toMatchObject({
      ok: false,
      status: 404,
      blad: 'nie_ma',
      komunikat: KOMUNIKAT_BRAK_ADRESU,
    });
    const nieznana = await przegl.fetch('/api/nie-ma-takiej-trasy');
    expect(nieznana.status).toBe(404);
    expect(await nieznana.json()).toMatchObject({ blad: 'nie_ma', komunikat: 'Nie ma takiego adresu API.' });
    expect(await api.adres('   ', 'pl')).toMatchObject({ ok: false, status: 400, blad: 'zle_dane' });
  });

  it('czasy: zdarzenie czeka 3 s, adres 8 s, reszta domyślne 10 s', async () => {
    vi.useFakeTimers();
    try {
      const wiszacy: typeof fetch = (_u, init) =>
        new Promise((_ok, zle) =>
          init?.signal?.addEventListener('abort', () => zle(new DOMException('przerwane', 'AbortError'))),
        );
      const api = utworzApi({ fetch: wiszacy });
      const sprawdz = async (wolaj: () => Promise<{ ok: boolean }>, ms: number) => {
        let koniec: unknown;
        const p = wolaj().then((r) => {
          koniec = r;
        });
        await vi.advanceTimersByTimeAsync(ms - 1);
        expect(koniec, `przed ${ms} ms`).toBeUndefined();
        await vi.advanceTimersByTimeAsync(1);
        await p;
        expect(koniec).toMatchObject({ ok: false, status: 0, blad: 'czas' });
      };
      await sprawdz(() => api.zdarzenie('dzien:2'), 3000);
      await sprawdz(() => api.adres('Wołoska 12, Warszawa', 'pl'), 8000);
      await sprawdz(() => api.druzyna(), 10_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it('nowe kody błędów mają angielski komunikat', () => {
    const en = (blad: string, komunikat: string, ponowZa?: number) =>
      komunikatEn({ blad, komunikat, ...(ponowZa ? { ponowZa } : {}) });
    expect(en('zly_kod', 'Zły kod powrotu.')).toBe('That return code doesn’t work. Check it and try again.');
    expect(en('poza_okolica', 'Ten obszar jest za daleko od waszej okolicy.')).toBe(
      'That area is too far from your team’s neighbourhood.',
    );
    expect(en('brak_startu', 'Serwer nie zna jeszcze waszego punktu startu.')).toBe(
      'The server doesn’t know your team’s start point yet.',
    );
    // adres, którego nie ma, i powody odmów przy zdarzeniach, adresach i kodzie
    expect(en('nie_ma', 'Nie znalazłem takiego adresu. Spróbujcie z miastem, np. „Wołoska 12, Warszawa”.')).toBe(
      'I couldn’t find that address. Try adding the city.',
    );
    expect(en('zle_dane', 'Podajcie adres, najwyżej 200 znaków.')).toBe('Enter an address, 200 characters at most.');
    expect(en('zle_dane', 'Podajcie kod powrotu.')).toBe('Enter a return code.');
    expect(en('za_duzo_prob', 'Za dużo zdarzeń z tego miejsca. Spróbujcie później.', 120)).toBe(
      'Too many events from here. Try again in 2 min.',
    );
    expect(en('za_duzo_prob', 'Za dużo wyszukiwań adresu z tego miejsca. Spróbujcie za chwilę.', 30)).toBe(
      'Too many address searches from here. Try again in 1 min.',
    );
    expect(en('serwer_zajety', 'Wyszukiwarka adresów jest teraz niedostępna. Spróbujcie za chwilę.')).toBe(
      'The server is busy. Try again in a moment.',
    );
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
