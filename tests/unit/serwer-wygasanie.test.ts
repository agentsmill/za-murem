/* Wygasanie klatek i kont na serwerze (server/app.ts sprzataj, server/baza.ts zwolnijKlatkiNieaktywnych i
   usunNieaktywneKonta, stałe KLATKI_DNI i KONTA_DNI w src/net/protokol.ts): klatki drużyny, która nie grała 14 dni,
   wracają do wolnych (konto, sesje i zapis zostają, kod powrotu dalej loguje), konto bez wizyty przez 180 dni znika
   z sesjami, klatkami i zapisem. `konta.ostatnio` ma dokładność doby (dotknijKonta), a nowe konto zaczyna od chwili
   założenia co do milisekundy, więc granica jest początkiem doby: wizyta zawsze daje pełne 14 dni.
   Serwer w procesie testu jak w serwer.test.ts (tests/unit/serwer-pomoc.ts), zegar przesuwa `czekaj`. */

import { afterEach, describe, expect, it } from 'vitest';
import { otworzBaze } from '../../server/baza.ts';
import { skrotTokenu } from '../../server/hasla.ts';
import { KLATKI_DNI, KONTA_DNI } from '../../src/net/protokol.ts';
import { pikselZ } from '../../src/world/klucze.ts';
import { przegladarka, type SerwerTestowy, serwerTestowy } from './serwer-pomoc.ts';

const MIN = 60_000;
const GODZ = 60 * MIN;
const DOBA = 24 * GODZ;

/** blok na Przymorzu i jego klatki (jak w serwer-druzyna.test.ts: pozycja przy najwyższym wierzchołku budynku) */
const [bx, by] = pikselZ(54.40939, 18.59923).map(Math.round);
const BUD = `px:${bx}:${by}:-100:60:3`;
const K1 = { klucz: `${BUD}/1`, budynek: BUD, lat: 54.40939 - 10 / 110574, lon: 18.59923 - 27 / 65000 };
const K2 = { klucz: `${BUD}/2`, budynek: BUD, lat: 54.40939 - 10 / 110574, lon: 18.59923 - 17 / 65000 };
const K3 = { klucz: `${BUD}/3`, budynek: BUD, lat: 54.40939 - 10 / 110574, lon: 18.59923 - 7 / 65000 };
const MAPA = '/api/klatki?s=54.40&w=18.59&n=54.42&e=18.61';
/** punkt startu przy bloku: drużyna bez siedziby pyta o klatki tylko wokół niego (PUT /api/druzyna/start) */
const STARTOWY = { lat: 54.40939, lon: 18.59923 };
const ustawStart = (p: ReturnType<typeof przegladarka>) => p.zadanie('PUT', '/api/druzyna/start', STARTOWY);

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

const wiersze = (s: SerwerTestowy, sql: string, ...arg: (string | number)[]) =>
  s.gra.baza.db.prepare(sql).all(...arg) as Record<string, unknown>[];
const ile = (s: SerwerTestowy, tabela: string) => wiersze(s, `SELECT COUNT(*) AS n FROM ${tabela}`)[0].n;

/** klucze klatek widziane z mapy przez daną przeglądarkę */
async function naMapie(p: ReturnType<typeof przegladarka>) {
  const r = await p.zadanie('GET', MAPA);
  expect(r.status, r.tekst).toBe(200);
  return (r.body.klatki as { klucz: string }[]).map((k) => k.klucz).sort();
}

/** drużyna anonimowa z jedną klatką, zapisem w chmurze i kodem powrotu */
async function druzynaZKlatka(s: SerwerTestowy, klatka = K1) {
  const p = przegladarka(s.adres);
  expect((await p.zadanie('POST', '/api/druzyna', {})).status).toBe(201);
  expect((await p.zadanie('POST', '/api/klatki', klatka)).status).toBe(201);
  expect((await p.zadanie('PUT', '/api/zapis', { dane: { v: 1, dzien: 4 } })).status).toBe(200);
  const kod = (await p.zadanie('POST', '/api/druzyna/kod', {})).body.kod as string;
  return { p, kod };
}

describe('serwer gry: wygasanie klatek (14 dni bez gry)', () => {
  it('stałe ze specu: klatka po 14 dniach, konto po 180', () => {
    expect(KLATKI_DNI).toBe(14);
    expect(KONTA_DNI).toBe(180);
  });

  it('klatki drużyny bez wizyty przez 14 dni wracają do wolnych, a konto i zapis zostają', async () => {
    const s = await start();
    const a = await druzynaZKlatka(s);
    const b = przegladarka(s.adres);
    await b.zadanie('POST', '/api/druzyna', {});
    expect((await ustawStart(b)).status).toBe(204);
    expect(await naMapie(b)).toEqual([K1.klucz]);
    expect((await b.zadanie('POST', '/api/klatki', K1)).status).toBe(409);

    s.czekaj(15 * DOBA);
    s.gra.sprzataj();

    // klatka jest wolna dla innej drużyny, która ją zresztą zajmuje bez problemu
    expect(await naMapie(b)).toEqual([]);
    expect(wiersze(s, 'SELECT * FROM klatki')).toEqual([]);
    const zajeta = await b.zadanie('POST', '/api/klatki', K1);
    expect(zajeta.status, zajeta.tekst).toBe(201);
    expect(zajeta.body.klatka.siedziba).toBe(true);

    // konto, sesje i zapis stoją, a kod powrotu dalej loguje z innej przeglądarki do tej samej drużyny
    expect(ile(s, 'konta')).toBe(2);
    expect(ile(s, 'sesje')).toBe(2);
    const inna = przegladarka(s.adres);
    const wejscie = await inna.zadanie('POST', '/api/druzyna/powrot', { kod: a.kod });
    expect(wejscie.status, wejscie.tekst).toBe(200);
    expect(wejscie.body).toMatchObject({ anonimowe: true, klatki: 0, zapis: true });
    const zapis = await inna.zadanie('GET', '/api/zapis');
    expect(zapis.status).toBe(200);
    expect(zapis.body.dane).toEqual({ v: 1, dzien: 4 });
    // a pierwsza sesja działa dalej
    expect((await a.p.zadanie('GET', '/api/konto')).status).toBe(200);
    // wracająca drużyna zajmuje swoją klatkę od nowa, jeśli nikt jej nie wziął (druga klatka bloku)
    const swoja = await inna.zadanie('POST', '/api/klatki', K2);
    expect(swoja.status, swoja.tekst).toBe(201);
    expect(swoja.body.klatka.siedziba).toBe(true);
  });

  it('drużyna, która grała 13 dni temu, zachowuje klatki', async () => {
    const s = await start();
    const a = await druzynaZKlatka(s);
    const b = przegladarka(s.adres);
    await b.zadanie('POST', '/api/druzyna', {});
    expect((await ustawStart(b)).status).toBe(204);

    s.czekaj(13 * DOBA);
    expect((await a.p.zadanie('GET', '/api/konto')).status).toBe(200); // wizyta dnia 13
    s.czekaj(2 * DOBA); // dzień 15: od założenia minęły 15 dni, od wizyty 2
    s.gra.sprzataj();

    expect(await naMapie(b)).toEqual([K1.klucz]);
    expect(ile(s, 'klatki')).toBe(1);
    expect((await a.p.zadanie('GET', '/api/klatki/moje')).body.klatki).toHaveLength(1);
  });

  it('granica to doba: dokładnie 14 dni po ostatniej wizycie klatki jeszcze są, następnego dnia już nie', async () => {
    const s = await start();
    await druzynaZKlatka(s); // założona o 02:00, ostatnio = ta chwila co do milisekundy
    s.czekaj(14 * DOBA);
    s.gra.sprzataj();
    expect(ile(s, 'klatki')).toBe(1);
    s.czekaj(DOBA);
    s.gra.sprzataj();
    expect(ile(s, 'klatki')).toBe(0);

    // wizyta późnym wieczorem dnia 20 (ostatnio = początek doby) też daje pełne 14 dni
    const u = await start();
    const d = await druzynaZKlatka(u);
    u.czekaj(20 * DOBA + 21 * GODZ);
    expect((await d.p.zadanie('GET', '/api/konto')).status).toBe(200);
    u.czekaj(14 * DOBA); // dzień 34, 23:00: równo 14 dni po wizycie
    u.gra.sprzataj();
    expect(ile(u, 'klatki')).toBe(1);
    u.czekaj(2 * GODZ); // dzień 35 w nocy: początek doby 14 dni po dniu wizyty już minął
    u.gra.sprzataj();
    expect(ile(u, 'klatki')).toBe(0);
  });

  it('klatkiDni z opcji zmienia próg, a bez opcji obowiązuje 14', async () => {
    const s = await start({ klatkiDni: 3 });
    await druzynaZKlatka(s);
    s.czekaj(3 * DOBA);
    s.gra.sprzataj();
    expect(ile(s, 'klatki')).toBe(1);
    s.czekaj(DOBA);
    s.gra.sprzataj();
    expect(ile(s, 'klatki')).toBe(0);
    expect(ile(s, 'konta')).toBe(1);
  });

  it('wygasanie zwalnia wszystkie klatki drużyny i nie rusza drużyn aktywnych', async () => {
    const s = await start();
    const stara = await druzynaZKlatka(s);
    expect((await stara.p.zadanie('POST', '/api/klatki', K2)).status).toBe(201);
    s.czekaj(10 * DOBA);
    const mloda = przegladarka(s.adres);
    await mloda.zadanie('POST', '/api/druzyna', {});
    expect((await mloda.zadanie('POST', '/api/klatki', K3)).status).toBe(201);
    s.czekaj(5 * DOBA);
    s.gra.sprzataj();
    expect(await naMapie(mloda)).toEqual([K3.klucz]);
  });
});

describe('serwer gry: wygasanie kont (180 dni bez wizyty)', () => {
  it('konto bez wizyty przez 180 dni znika z sesjami, klatkami i zapisem; aktywne zostaje', async () => {
    // sesja ważna rok, żeby do usunięcia konta jej nie wyczyściło zwykłe wygasanie sesji po 30 dniach
    const s = await start({ sesjaDni: 365 });
    const a = await druzynaZKlatka(s);
    const nazwane = przegladarka(s.adres);
    expect((await nazwane.zadanie('POST', '/api/konto', { nick: 'Wygasly', haslo: 'wygasly-123' })).status).toBe(201);
    expect((await nazwane.zadanie('PUT', '/api/zapis', { dane: { v: 2 } })).status).toBe(200);
    const kodNazwanego = (await nazwane.zadanie('POST', '/api/druzyna/kod', {})).body.kod as string;
    const kontoA = wiersze(s, 'SELECT id FROM konta WHERE anonimowe = 1')[0].id as number;

    s.czekaj(170 * DOBA);
    const zywa = przegladarka(s.adres);
    expect((await zywa.zadanie('POST', '/api/druzyna', {})).status).toBe(201); // dzień 170
    expect((await zywa.zadanie('PUT', '/api/zapis', { dane: { v: 3 } })).status).toBe(200);
    s.czekaj(10 * DOBA); // dzień 180: stare konta po 180 dniach bez wizyty, dokładnie na granicy
    s.gra.sprzataj();
    expect(ile(s, 'konta')).toBe(3);
    s.czekaj(DOBA); // dzień 181
    s.gra.sprzataj();

    expect(wiersze(s, 'SELECT id FROM konta').map((r) => r.id)).not.toContain(kontoA);
    expect(ile(s, 'konta')).toBe(1);
    expect(ile(s, 'sesje')).toBe(1);
    expect(ile(s, 'zapisy')).toBe(1);
    expect(ile(s, 'klatki')).toBe(0);
    // stare ciasteczka i kody nie działają, nick jest wolny
    expect((await a.p.zadanie('GET', '/api/konto')).status).toBe(401);
    expect((await nazwane.zadanie('GET', '/api/konto')).status).toBe(401);
    expect((await przegladarka(s.adres).zadanie('POST', '/api/druzyna/powrot', { kod: a.kod })).body.blad).toBe(
      'zly_kod',
    );
    expect((await przegladarka(s.adres).zadanie('POST', '/api/druzyna/powrot', { kod: kodNazwanego })).body.blad).toBe(
      'zly_kod',
    );
    expect(
      (await przegladarka(s.adres).zadanie('POST', '/api/sesja', { nick: 'Wygasly', haslo: 'wygasly-123' })).status,
    ).toBe(401);
    expect(
      (await przegladarka(s.adres).zadanie('POST', '/api/konto', { nick: 'Wygasly', haslo: 'wygasly-123' })).status,
    ).toBe(201);
    // żywa drużyna ma swój zapis i sesję
    expect((await zywa.zadanie('GET', '/api/zapis')).body.dane).toEqual({ v: 3 });
  });

  it('logowanie kodem jest wizytą: konto, które wróciło tuż przed granicą, nie znika przed pierwszym żądaniem', async () => {
    const s = await start();
    const a = await druzynaZKlatka(s);
    s.czekaj(179 * DOBA + 21 * GODZ);
    const wejscie = await przegladarka(s.adres).zadanie('POST', '/api/druzyna/powrot', { kod: a.kod });
    expect(wejscie.status, wejscie.tekst).toBe(200);
    s.czekaj(2 * DOBA); // dzień 181 po założeniu, a od logowania niecałe 2 dni, i żadnego żądania z sesją w tym czasie
    s.gra.sprzataj();
    expect(ile(s, 'konta')).toBe(1);
    expect(ile(s, 'zapisy')).toBe(1);
  });

  it('kontaDni z opcji zmienia próg, a bez opcji obowiązuje 180', async () => {
    const s = await start({ kontaDni: 20, klatkiDni: 5 });
    await druzynaZKlatka(s);
    s.czekaj(20 * DOBA);
    s.gra.sprzataj();
    expect(ile(s, 'konta')).toBe(1);
    expect(ile(s, 'klatki')).toBe(0); // klatka wygasła dużo wcześniej niż konto
    s.czekaj(DOBA);
    s.gra.sprzataj();
    expect(ile(s, 'konta')).toBe(0);
    expect(ile(s, 'zapisy')).toBe(0);
  });
});

describe('serwer gry: sesja drużyny anonimowej żyje tyle co jej konto', () => {
  const MAX_AGE_KONTA = `Max-Age=${KONTA_DNI * 24 * 3600}`;
  const maxAge = (dni: number) => `Max-Age=${dni * 24 * 3600}`;
  const dzien = (n: number) => Math.round(n * DOBA);

  it('drużyna użyta w dniu 14,9 działa w dniu 30,1 i w dniu 100 (nowa sesja po pierwszej wizycie doby ma pełną długość)', async () => {
    const s = await start();
    const a = przegladarka(s.adres);
    const b = przegladarka(s.adres);
    expect((await a.zadanie('POST', '/api/druzyna', {})).status).toBe(201);
    expect((await b.zadanie('POST', '/api/druzyna', {})).status).toBe(201);
    s.czekaj(dzien(14.9));
    // pierwsza wizyta tej doby: sesja przedłuża się do pełnych 180 dni, choć do końca starej zostało ponad połowę
    const wizyta = await a.zadanie('GET', '/api/konto');
    expect(wizyta.status).toBe(200);
    expect(wizyta.headers.getSetCookie()[0]).toContain(MAX_AGE_KONTA);
    expect((await b.zadanie('GET', '/api/konto')).status).toBe(200);
    expect(wiersze(s, 'SELECT wygasa FROM sesje').map((w) => Number(w.wygasa))).toEqual([
      s.teraz() + KONTA_DNI * DOBA,
      s.teraz() + KONTA_DNI * DOBA,
    ]);
    // druga wizyta tego samego dnia nic nie przedłuża
    expect((await a.zadanie('GET', '/api/konto')).headers.getSetCookie()).toEqual([]);

    s.czekaj(dzien(15.2)); // dzień 30,1: stara sesja (30 dni) już by nie żyła
    expect((await a.zadanie('GET', '/api/konto')).status).toBe(200);
    s.czekaj(dzien(69.9)); // dzień 100: druga drużyna nie grała od 14,9
    expect((await b.zadanie('GET', '/api/konto')).status).toBe(200);
  });

  it('po 180 dniach bez gry konto znika jak dotąd, mimo przedłużonej sesji', async () => {
    const s = await start();
    const p = przegladarka(s.adres);
    expect((await p.zadanie('POST', '/api/druzyna', {})).status).toBe(201);
    s.czekaj(dzien(14.9));
    expect((await p.zadanie('GET', '/api/konto')).status).toBe(200); // ostatnio = początek dnia 14
    s.czekaj(dzien(180.3)); // dzień 195,2: granica to początek dnia 15
    s.gra.sprzataj();
    expect(ile(s, 'konta')).toBe(0);
    expect(ile(s, 'sesje')).toBe(0);
    expect((await p.zadanie('GET', '/api/konto')).status).toBe(401);
  });

  it('konto z nickiem zostaje przy 30 dniach: pierwsza wizyta doby przedłuża je do 30, nie do 180', async () => {
    const s = await start();
    const p = przegladarka(s.adres);
    expect((await p.zadanie('POST', '/api/konto', { nick: 'Nickowy', haslo: 'nickowy-123' })).status).toBe(201);
    s.czekaj(dzien(14.9));
    const wizyta = await p.zadanie('GET', '/api/konto');
    expect(wizyta.status).toBe(200);
    expect(wizyta.headers.getSetCookie()[0]).toContain(maxAge(30));
    s.czekaj(dzien(15.2)); // dzień 30,1: sesja przedłużona w dniu 14,9 żyje
    expect((await p.zadanie('GET', '/api/konto')).status).toBe(200);
    s.czekaj(dzien(31)); // bez użycia przez 31 dni sesja z nickiem wygasa, konto zostaje
    expect((await p.zadanie('GET', '/api/konto')).status).toBe(401);
    expect(ile(s, 'konta')).toBe(1);
  });

  it('druga sesja tego samego konta, trzymana poza grą, też się przedłuża (połowa ważności), gdy konto grało już tego dnia', async () => {
    const s = await start();
    const a = await druzynaZKlatka(s);
    const druga = przegladarka(s.adres);
    expect((await druga.zadanie('POST', '/api/druzyna/powrot', { kod: a.kod })).status).toBe(200);
    // pierwsza przeglądarka gra codziennie, druga milczy prawie do końca swojej sesji
    for (let i = 0; i < 17; i++) {
      s.czekaj(dzien(10));
      expect((await a.p.zadanie('GET', '/api/konto')).status).toBe(200);
    }
    // dzień 170: druga sesja ma za sobą 170 z 180 dni, a konto grało dziś, więc „pierwszej wizyty doby” już nie ma
    const wejscie = await druga.zadanie('GET', '/api/konto');
    expect(wejscie.status).toBe(200);
    expect(wejscie.headers.getSetCookie()[0]).toContain(MAX_AGE_KONTA);
    s.czekaj(dzien(100));
    expect((await druga.zadanie('GET', '/api/konto')).status).toBe(200);
  });
});

describe('serwer gry: częstość sprzątania wygasłych', () => {
  /** drużyna z kontem i klatką założona w bazie od razu z dawnym `ostatnio` (zegar testu stoi) */
  function stareKonto(s: SerwerTestowy, ostatnio: number) {
    const konto = s.gra.baza.dodajDruzyne(ostatnio);
    s.gra.baza.dodajKlatke({
      klucz: K1.klucz,
      budynek: K1.budynek,
      konto: konto.id,
      lat: K1.lat,
      lon: K1.lon,
      siedziba: true,
      zajeta: ostatnio,
    });
    return konto;
  }

  it('sprzątanie wygasłych rusza najwyżej raz na godzinę, sesje co wywołanie', async () => {
    const s = await start();
    const ob = przegladarka(s.adres);
    await ob.zadanie('POST', '/api/druzyna', {});
    s.czekaj(40 * DOBA);
    s.gra.sprzataj(); // pierwsze wywołanie liczy wygasłe od razu

    // stara drużyna pojawia się w bazie tuż po przebiegu: następny przebieg wygasania dopiero za godzinę
    stareKonto(s, s.teraz() - 30 * DOBA);
    s.czekaj(30 * MIN);
    s.gra.baza.dodajSesje(skrotTokenu('krotka'), 1, s.teraz(), s.teraz() + 1000);
    s.czekaj(2000);
    const sesje = ile(s, 'sesje') as number;
    s.gra.sprzataj();
    expect(ile(s, 'sesje')).toBe(sesje - 1); // sesje poszły od razu
    expect(ile(s, 'klatki')).toBe(1); // wygasanie klatek jeszcze nie: od poprzedniego przebiegu pół godziny
    s.czekaj(31 * MIN);
    s.gra.sprzataj();
    expect(ile(s, 'klatki')).toBe(0);

    // i znów godzina przerwy od ostatniego przebiegu
    stareKonto(s, s.teraz() - 30 * DOBA);
    s.czekaj(59 * MIN);
    s.gra.sprzataj();
    expect(ile(s, 'klatki')).toBe(1);
    s.czekaj(2 * MIN);
    s.gra.sprzataj();
    expect(ile(s, 'klatki')).toBe(0);
  });

  it('błąd wygasania idzie do dziennika i nie wywraca sprzątania, a następna próba jest za godzinę', async () => {
    const wpisy: string[] = [];
    const s = await start({ dziennik: (w) => wpisy.push(w) });
    s.gra.baza.db.exec('ALTER TABLE klatki RENAME TO klatki_zepsute');
    s.czekaj(DOBA);
    expect(() => s.gra.sprzataj()).not.toThrow();
    expect(wpisy).toHaveLength(1);
    expect(wpisy[0]).toMatch(/błąd wygasania klatek i kont: .*klatki/);
    s.gra.sprzataj();
    expect(wpisy).toHaveLength(1);
    s.czekaj(GODZ);
    s.gra.baza.db.exec('ALTER TABLE klatki_zepsute RENAME TO klatki');
    expect(() => s.gra.sprzataj()).not.toThrow();
    expect(wpisy).toHaveLength(1);
  });
});

describe('baza: zapytania wygasania', () => {
  it('zwolnijKlatkiNieaktywnych i usunNieaktywneKonta liczą konta z ostatnio < granica i zwracają liczbę wierszy', () => {
    const baza = otworzBaze(':memory:');
    try {
      const stare = baza.dodajDruzyne(1000);
      const nowe = baza.dodajDruzyne(5000);
      for (const [konto, klucz] of [
        [stare, `${BUD}/1`],
        [stare, `${BUD}/2`],
        [nowe, `${BUD}/3`],
      ] as const) {
        baza.dodajKlatke({
          klucz,
          budynek: BUD,
          konto: konto.id,
          lat: K1.lat,
          lon: K1.lon,
          siedziba: false,
          zajeta: 1000,
        });
      }
      baza.dodajSesje('s1', stare.id, 1000, 9e12);
      baza.ustawZapis(stare.id, new Uint8Array([1]), 1, 1000);
      // ostatnio równe granicy to jeszcze nie „przed granicą”
      expect(baza.zwolnijKlatkiNieaktywnych(1000)).toBe(0);
      expect(baza.zwolnijKlatkiNieaktywnych(1001)).toBe(2);
      expect(baza.liczbaKlatek(stare.id)).toBe(0);
      expect(baza.liczbaKlatek(nowe.id)).toBe(1);
      expect(baza.konto(stare.id)).not.toBeNull();
      expect(baza.maZapis(stare.id)).toBe(true);

      expect(baza.usunNieaktywneKonta(1000)).toBe(0);
      expect(baza.usunNieaktywneKonta(1001)).toBe(1);
      expect(baza.konto(stare.id)).toBeNull();
      expect(baza.maZapis(stare.id)).toBe(false);
      expect(baza.sesja('s1', 2000)).toBeNull();
      expect(baza.konto(nowe.id)).not.toBeNull();
      expect(baza.liczbaKlatek(nowe.id)).toBe(1);
    } finally {
      baza.zamknij();
    }
  });
});
