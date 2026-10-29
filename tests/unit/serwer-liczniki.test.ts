/* Liczniki zdarzeń i powroty na serwerze (server/app.ts, server/baza.ts, ZDARZENIE_WZOR w src/net/protokol.ts):
   POST /api/zdarzenie dolicza jedynkę do pary (dzień, zdarzenie) bez sesji i bez śladu gracza, a każde konto ma
   najwyżej jeden powrót na dobę (licznik „dzień założenia, ile dni po założeniu”), niezależnie od tego, czy pierwsze
   dotknięcie doby przyszło z żądaniem z sesją, czy z logowaniem. GET /api/liczniki oddaje sumy tylko z tokenem.
   Serwer w procesie testu jak w serwer.test.ts (tests/unit/serwer-pomoc.ts), zegar przesuwa `czekaj`. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { NAGLOWEK_PROXY } from '../../server/app.ts';
import { MIGRACJE, otworzBaze, ROZNYCH_CELOW_NA_DZIEN } from '../../server/baza.ts';
import { ZDARZENIE_WZOR } from '../../src/net/protokol.ts';
import { przegladarka, type SerwerTestowy, serwerTestowy } from './serwer-pomoc.ts';

const MIN = 60_000;
const GODZ = 60 * MIN;
const DOBA = 24 * GODZ;
/** początek doby UTC, w której startuje zegar testowego serwera (18.10.2026, 2:00) */
const DZIEN0 = Math.floor(Date.UTC(2026, 9, 18, 2, 0, 0) / DOBA) * DOBA;
const TOKEN = 'liczniki-token-testowy-0123456789abcdef';
const SEKRET = 's3kret';

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
const zdarzenie = (p: ReturnType<typeof przegladarka>, z: unknown) => p.zadanie('POST', '/api/zdarzenie', { z });
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('serwer gry: liczniki zdarzeń', () => {
  it('zdarzenie dolicza jedynkę do pary dzień i zdarzenie, bez śladu konta i adresu', async () => {
    const s = await start();
    const p = przegladarka(s.adres);
    for (let i = 0; i < 3; i++) {
      const r = await zdarzenie(p, 'start:zwykly:en:tel');
      expect(r.status, r.tekst).toBe(204);
      // żadnego ciasteczka: ani sesji, ani śledzącego
      expect(r.headers.get('set-cookie')).toBeNull();
    }
    expect(wiersze(s, 'SELECT * FROM liczniki')).toEqual([{ dzien: DZIEN0, zdarzenie: 'start:zwykly:en:tel', n: 3 }]);
    // w tabeli tylko dzień, zdarzenie i licznik: nie ma gdzie zapisać gracza ani adresu
    expect(wiersze(s, 'PRAGMA table_info(liczniki)').map((c) => c.name)).toEqual(['dzien', 'zdarzenie', 'n']);
    expect(ile(s, 'konta')).toBe(0);
    expect(ile(s, 'sesje')).toBe(0);

    // inna doba i inne zdarzenie to osobne wiersze
    await zdarzenie(p, 'dzien:2');
    s.czekaj(DOBA);
    await zdarzenie(p, 'start:zwykly:en:tel');
    expect(wiersze(s, 'SELECT dzien, zdarzenie, n FROM liczniki ORDER BY dzien, zdarzenie')).toEqual([
      { dzien: DZIEN0, zdarzenie: 'dzien:2', n: 1 },
      { dzien: DZIEN0, zdarzenie: 'start:zwykly:en:tel', n: 3 },
      { dzien: DZIEN0 + DOBA, zdarzenie: 'start:zwykly:en:tel', n: 1 },
    ]);
  });

  it('zdarzenie od gracza z sesją nie dotyka jego konta i nie jest wizytą', async () => {
    const s = await start();
    const gracz = przegladarka(s.adres);
    expect((await gracz.zadanie('POST', '/api/druzyna', {})).status).toBe(201);
    s.czekaj(2 * DOBA);
    const przed = wiersze(s, 'SELECT * FROM konta');
    expect((await zdarzenie(gracz, 'cel:R0.zaznacz')).status).toBe(204);
    // ciasteczko jedzie z żądaniem, ale endpoint go nie czyta: konto bez zmian, a powrotu nie ma
    expect(wiersze(s, 'SELECT * FROM konta')).toEqual(przed);
    expect(s.gra.baza.powroty(0)).toEqual([]);
    expect(wiersze(s, 'SELECT zdarzenie, n FROM liczniki')).toEqual([{ zdarzenie: 'cel:R0.zaznacz', n: 1 }]);
  });

  it('wzór zdarzeń przyjmuje starty, cele i dni, a resztę odrzuca', async () => {
    const s = await start();
    const p = przegladarka(s.adres);
    const dobre = [
      'start:zwykly:pl:tel',
      'start:zombie:en:komp',
      'cel:R0.zaznacz',
      'cel:O3.postaw_dach:2',
      `cel:${'a'.repeat(40)}`,
      'dzien:2',
      'dzien:3',
      'dzien:7',
    ];
    for (const z of dobre) {
      expect(ZDARZENIE_WZOR.test(z), z).toBe(true);
      const r = await zdarzenie(p, z);
      expect(r.status, `${z}: ${r.tekst}`).toBe(204);
    }
    expect(ile(s, 'liczniki')).toBe(dobre.length);

    const zle: unknown[] = [
      'start:inny:pl:tel',
      'start:zwykly:de:tel',
      'start:zwykly:pl:tablet',
      'start:zwykly:pl',
      'cel:',
      `cel:${'a'.repeat(41)}`,
      'cel:ze spacja',
      'cel:ukośnik/zly',
      'dzien:1',
      'dzien:4',
      'dzien:20',
      'dzien:2\n',
      ' dzien:2',
      '',
      'cokolwiek',
      42,
      null,
      ['dzien:2'],
      { z: 'dzien:2' },
    ];
    for (const z of zle) {
      const r = await zdarzenie(p, z);
      expect(r.status, JSON.stringify(z)).toBe(400);
      expect(r.body.blad).toBe('zle_dane');
    }
    // brak pola z, JSON bez obiektu i nie-JSON
    expect((await p.zadanie('POST', '/api/zdarzenie', {})).status).toBe(400);
    expect((await p.zadanie('POST', '/api/zdarzenie', '[]')).status).toBe(400);
    expect((await p.zadanie('POST', '/api/zdarzenie', 'nie json')).status).toBe(400);
    // nic z tego nie weszło do bazy
    expect(ile(s, 'liczniki')).toBe(dobre.length);
  });

  it('zdarzenie niesie JSON jak każdy POST: inny typ to 415', async () => {
    const s = await start();
    const p = przegladarka(s.adres);
    const r = await p.zadanie('POST', '/api/zdarzenie', '{"z":"dzien:2"}', { 'Content-Type': 'text/plain' });
    expect(r.status).toBe(415);
    expect(ile(s, 'liczniki')).toBe(0);
  });

  it('nieznane zdarzenie to 400, a 121. w godzinę z jednego IP to 429', async () => {
    const s = await start({ proxySekret: SEKRET });
    const ja = { [NAGLOWEK_PROXY]: SEKRET, 'x-real-ip': '10.0.0.1' };
    const ktos = { [NAGLOWEK_PROXY]: SEKRET, 'x-real-ip': '10.0.0.2' };
    const p = przegladarka(s.adres, ja);

    // odrzucone zdarzenia nie zużywają limitu: nic nie zostało doliczone
    for (let i = 0; i < 5; i++) expect((await zdarzenie(p, 'nieznane')).status).toBe(400);
    for (let i = 0; i < 120; i++) expect((await zdarzenie(p, 'dzien:2')).status, `żądanie ${i + 1}`).toBe(204);
    const r = await zdarzenie(p, 'dzien:2');
    expect(r.status).toBe(429);
    expect(r.body.blad).toBe('za_duzo_prob');
    expect(Number(r.headers.get('retry-after'))).toBeGreaterThan(0);
    // odrzucone nie weszło do licznika
    expect(wiersze(s, 'SELECT n FROM liczniki')).toEqual([{ n: 120 }]);
    // i zablokowany adres nie ma też jak sprawdzać, co jest znane, a co nie
    expect((await zdarzenie(p, 'nieznane')).status).toBe(429);

    // inny adres ma własny licznik
    expect((await zdarzenie(przegladarka(s.adres, ktos), 'dzien:2')).status).toBe(204);
    expect(wiersze(s, 'SELECT n FROM liczniki')).toEqual([{ n: 121 }]);

    // po godzinie okno się zamyka
    s.czekaj(GODZ + 1000);
    expect((await zdarzenie(p, 'dzien:2')).status).toBe(204);
  });

  it('różnych celów na dobę jest najwyżej tyle, ile ścieżka ma kroków z zapasem; reszta zdarzeń liczy się zawsze', async () => {
    const s = await start();
    const p = przegladarka(s.adres);
    const baza = s.gra.baza;
    for (let i = 0; i < ROZNYCH_CELOW_NA_DZIEN; i++) expect(baza.dolicz(DZIEN0, `cel:x${i}`)).toBe(true);

    // nowy cel ponad limit jest przyjęty po cichu (204) i nie zostawia śladu, znany cel dalej się liczy
    expect((await zdarzenie(p, 'cel:nowy')).status).toBe(204);
    expect(baza.dolicz(DZIEN0, 'cel:nowy')).toBe(false);
    expect(wiersze(s, "SELECT n FROM liczniki WHERE zdarzenie = 'cel:nowy'")).toEqual([]);
    expect((await zdarzenie(p, 'cel:x0')).status).toBe(204);
    expect(wiersze(s, "SELECT n FROM liczniki WHERE zdarzenie = 'cel:x0'")).toEqual([{ n: 2 }]);
    // starty i dni nie mają limitu różnych wartości (jest ich garstka), więc śmieciowe cele ich nie zagłuszą
    expect((await zdarzenie(p, 'start:zwykly:pl:tel')).status).toBe(204);
    expect((await zdarzenie(p, 'dzien:3')).status).toBe(204);
    expect(wiersze(s, "SELECT zdarzenie, n FROM liczniki WHERE zdarzenie NOT LIKE 'cel:%' ORDER BY zdarzenie")).toEqual(
      [
        { zdarzenie: 'dzien:3', n: 1 },
        { zdarzenie: 'start:zwykly:pl:tel', n: 1 },
      ],
    );
    // następna doba liczy cele od nowa
    s.czekaj(DOBA);
    expect((await zdarzenie(p, 'cel:nowy')).status).toBe(204);
    expect(wiersze(s, "SELECT dzien, n FROM liczniki WHERE zdarzenie = 'cel:nowy'")).toEqual([
      { dzien: DZIEN0 + DOBA, n: 1 },
    ]);
  });
});

describe('serwer gry: powroty', () => {
  const powroty = (s: SerwerTestowy) => s.gra.baza.powroty(0);

  it('dotknijKonta mówi, czy zmieniło dzień ostatniej wizyty', () => {
    const b = otworzBaze(':memory:');
    try {
      const k = b.dodajDruzyne(DZIEN0 + 5 * GODZ);
      expect(b.dotknijKonta(k.id, DZIEN0)).toBe(false); // doba założenia: ostatnio jest już późniejsze
      expect(b.dotknijKonta(k.id, DZIEN0 + DOBA)).toBe(true);
      expect(b.dotknijKonta(k.id, DZIEN0 + DOBA)).toBe(false); // ta sama doba drugi raz
      expect(b.dotknijKonta(k.id, DZIEN0)).toBe(false); // cofnięty zegar niczego nie cofa
      expect(b.konto(k.id)?.ostatnio).toBe(DZIEN0 + DOBA);
      expect(b.dotknijKonta(9999, DZIEN0 + 2 * DOBA)).toBe(false); // nie ma takiego konta
    } finally {
      b.zamknij();
    }
  });

  it('powrót liczy się raz na dzień: konto założone w dniu D, wizyty w D, D+1 (dwa razy) i D+3 dają po_dniach 1 i 3 po jednym', async () => {
    const s = await start();
    const p = przegladarka(s.adres);
    expect((await p.zadanie('POST', '/api/druzyna', {})).status).toBe(201);

    // dzień założenia: zakładanie, kolejne żądania i logowanie to jeszcze nie powrót
    expect((await p.zadanie('GET', '/api/konto')).status).toBe(200);
    s.czekaj(10 * GODZ);
    expect((await p.zadanie('GET', '/api/konto')).status).toBe(200);
    expect(powroty(s)).toEqual([]);

    // D+1: pierwsze żądanie liczy, drugie nie
    s.czekaj(DOBA);
    expect((await p.zadanie('GET', '/api/konto')).status).toBe(200);
    expect((await p.zadanie('GET', '/api/zapis')).status).toBe(404);
    expect(powroty(s)).toEqual([{ zalozone: DZIEN0, poDniach: 1, n: 1 }]);

    // D+2 bez wizyty, D+3
    s.czekaj(2 * DOBA);
    expect((await p.zadanie('GET', '/api/konto')).status).toBe(200);
    expect((await p.zadanie('GET', '/api/konto')).status).toBe(200);
    expect(powroty(s)).toEqual([
      { zalozone: DZIEN0, poDniach: 1, n: 1 },
      { zalozone: DZIEN0, poDniach: 3, n: 1 },
    ]);
    // dokładnie te dwa wiersze i nic więcej o koncie
    expect(wiersze(s, 'PRAGMA table_info(powroty)').map((c) => c.name)).toEqual(['zalozone', 'po_dniach', 'n']);
  });

  it('powrót liczy się raz niezależnie od tego, która droga pierwsza dotknęła konta tego dnia', async () => {
    const s = await start();
    const a = przegladarka(s.adres);
    expect((await a.zadanie('POST', '/api/druzyna', {})).status).toBe(201);
    const kod = (await a.zadanie('POST', '/api/druzyna/kod', {})).body.kod as string;
    expect(powroty(s)).toEqual([]);

    // dzień założenia, wejście kodem z drugiej przeglądarki: nadal dzień 0
    const b = przegladarka(s.adres);
    expect((await b.zadanie('POST', '/api/druzyna/powrot', { kod })).status).toBe(200);
    expect(powroty(s)).toEqual([]);

    // D+2: pierwsza jest druga przeglądarka i wchodzi kodem (logowanie), potem żądania z obu sesji
    s.czekaj(2 * DOBA);
    const c = przegladarka(s.adres);
    expect((await c.zadanie('POST', '/api/druzyna/powrot', { kod })).status).toBe(200);
    expect(powroty(s)).toEqual([{ zalozone: DZIEN0, poDniach: 2, n: 1 }]);
    expect((await c.zadanie('GET', '/api/konto')).status).toBe(200);
    expect((await a.zadanie('GET', '/api/konto')).status).toBe(200);
    expect((await b.zadanie('GET', '/api/konto')).status).toBe(200);
    expect((await c.zadanie('POST', '/api/druzyna/powrot', { kod })).status).toBe(200);
    expect(powroty(s)).toEqual([{ zalozone: DZIEN0, poDniach: 2, n: 1 }]);

    // D+3: pierwsze jest zwykłe żądanie z sesji, potem logowanie kodem
    s.czekaj(DOBA);
    expect((await a.zadanie('GET', '/api/konto')).status).toBe(200);
    expect((await przegladarka(s.adres).zadanie('POST', '/api/druzyna/powrot', { kod })).status).toBe(200);
    expect(powroty(s)).toEqual([
      { zalozone: DZIEN0, poDniach: 2, n: 1 },
      { zalozone: DZIEN0, poDniach: 3, n: 1 },
    ]);
  });

  it('logowanie hasłem po przerwie też jest powrotem, a założenie konta z nickiem nie', async () => {
    const s = await start();
    const p = przegladarka(s.adres);
    const dane = { nick: 'Powracajacy', haslo: 'bardzo-tajne-1' };
    expect((await p.zadanie('POST', '/api/konto', dane)).status).toBe(201);
    expect(powroty(s)).toEqual([]);
    s.czekaj(DOBA);
    expect((await przegladarka(s.adres).zadanie('POST', '/api/sesja', dane)).status).toBe(200);
    expect(powroty(s)).toEqual([{ zalozone: DZIEN0, poDniach: 1, n: 1 }]);
    expect((await p.zadanie('GET', '/api/konto')).status).toBe(200);
    expect(powroty(s)).toEqual([{ zalozone: DZIEN0, poDniach: 1, n: 1 }]);
  });

  it('kohorta to doba kalendarzowa założenia, a powroty różnych kont sumują się w jednym wierszu', async () => {
    const s = await start();
    s.czekaj(DOBA - 2 * GODZ - 1000); // 23:59:59 doby D
    const a = przegladarka(s.adres);
    const b = przegladarka(s.adres);
    expect((await a.zadanie('POST', '/api/druzyna', {})).status).toBe(201);
    expect((await b.zadanie('POST', '/api/druzyna', {})).status).toBe(201);
    s.czekaj(2000); // 00:00:01 doby D+1: dla a i b to już następny dzień, choć minęły dwie sekundy
    const c = przegladarka(s.adres);
    expect((await c.zadanie('POST', '/api/druzyna', {})).status).toBe(201);
    for (const p of [a, b, c]) expect((await p.zadanie('GET', '/api/konto')).status).toBe(200);
    // c jest z doby D+1 i dziś ma dzień założenia, więc jej powrotu jeszcze nie ma
    expect(powroty(s)).toEqual([{ zalozone: DZIEN0, poDniach: 1, n: 2 }]);

    s.czekaj(DOBA);
    expect((await c.zadanie('GET', '/api/konto')).status).toBe(200);
    expect(powroty(s)).toEqual([
      { zalozone: DZIEN0, poDniach: 1, n: 2 },
      { zalozone: DZIEN0 + DOBA, poDniach: 1, n: 1 },
    ]);
  });

  it('usunięte konto zostawia w licznikach tylko sumę, bez śladu', async () => {
    const s = await start();
    const p = przegladarka(s.adres);
    expect((await p.zadanie('POST', '/api/druzyna', {})).status).toBe(201);
    s.czekaj(DOBA);
    expect((await p.zadanie('GET', '/api/konto')).status).toBe(200);
    expect((await p.zadanie('DELETE', '/api/konto', {})).status).toBe(204);
    expect(ile(s, 'konta')).toBe(0);
    expect(powroty(s)).toEqual([{ zalozone: DZIEN0, poDniach: 1, n: 1 }]);
  });

  it('błąd licznika powrotów idzie do dziennika i nie psuje żądania z sesją', async () => {
    const wpisy: string[] = [];
    const s = await start({ dziennik: (w) => wpisy.push(w) });
    const p = przegladarka(s.adres);
    expect((await p.zadanie('POST', '/api/druzyna', {})).status).toBe(201);
    s.czekaj(DOBA);
    s.gra.baza.db.exec('DROP TABLE powroty');
    const r = await p.zadanie('GET', '/api/konto');
    expect(r.status, r.tekst).toBe(200);
    expect(wpisy.some((w) => w.includes('powrot'))).toBe(true);
  });
});

describe('serwer gry: odczyt liczników', () => {
  /** serwer z trzema zdarzeniami w dwóch dobach i jednym powrotem */
  async function zDanymi(opcje: Parameters<typeof serwerTestowy>[0] = { tokenLicznikow: TOKEN }) {
    const s = await start(opcje);
    const p = przegladarka(s.adres);
    await zdarzenie(p, 'start:zwykly:pl:tel');
    await zdarzenie(p, 'start:zwykly:pl:tel');
    expect((await p.zadanie('POST', '/api/druzyna', {})).status).toBe(201);
    s.czekaj(DOBA);
    await zdarzenie(p, 'dzien:2');
    expect((await p.zadanie('GET', '/api/konto')).status).toBe(200);
    return { s, p };
  }

  it('odczyt liczników tylko z tokenem; bez tokenu w opcjach adresu nie ma', async () => {
    // bez skonfigurowanego tokenu trasa udaje, że nie istnieje, także z nagłówkiem Authorization
    const { s: bez, p: pBez } = await zDanymi({});
    expect((await pBez.zadanie('GET', '/api/liczniki')).status).toBe(404);
    expect((await pBez.zadanie('GET', '/api/liczniki', undefined, bearer(TOKEN))).status).toBe(404);
    expect((await pBez.zadanie('GET', '/api/liczniki', undefined, bearer(''))).status).toBe(404);
    // żadna metoda nie zdradza, że trasa istnieje (żadnego 405 z Allow)
    const post = await pBez.zadanie('POST', '/api/liczniki', {}, bearer(TOKEN));
    expect(post.status).toBe(404);
    expect(post.headers.get('allow')).toBeNull();
    expect(ile(bez, 'liczniki')).toBe(2);

    // pusty token w opcjach to też brak tokenu (jak ZM_PROXY_SEKRET)
    const { p: pPusty } = await zDanymi({ tokenLicznikow: '' });
    expect((await pPusty.zadanie('GET', '/api/liczniki', undefined, bearer(''))).status).toBe(404);

    const { s, p } = await zDanymi();
    // bez nagłówka, ze złym schematem, złym albo prawie dobrym tokenem: 401
    for (const naglowki of [
      {},
      { Authorization: TOKEN },
      { Authorization: `Basic ${TOKEN}` },
      { Authorization: 'Bearer ' },
      bearer('zly'),
      bearer(TOKEN.slice(0, -1)),
      bearer(`${TOKEN}x`),
      bearer(TOKEN.toUpperCase()),
    ]) {
      const r = await p.zadanie('GET', '/api/liczniki', undefined, naglowki);
      expect(r.status, JSON.stringify(naglowki)).toBe(401);
      expect(r.body.liczniki).toBeUndefined();
    }
    s.czekaj(16 * MIN); // okno złych prób (10 na kwadrans) zaczyna się od nowa
    // token w adresie albo w ciasteczku się nie liczy
    expect((await p.zadanie('GET', `/api/liczniki?token=${TOKEN}`)).status).toBe(401);

    const r = await p.zadanie('GET', '/api/liczniki', undefined, bearer(TOKEN));
    expect(r.status, r.tekst).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.body).toEqual({
      liczniki: [
        { dzien: DZIEN0, zdarzenie: 'start:zwykly:pl:tel', n: 2 },
        { dzien: DZIEN0 + DOBA, zdarzenie: 'dzien:2', n: 1 },
      ],
      powroty: [{ zalozone: DZIEN0, poDniach: 1, n: 1 }],
    });
    // schemat bearer bez względu na wielkość liter (RFC 7235)
    expect((await p.zadanie('GET', '/api/liczniki', undefined, { Authorization: `bearer ${TOKEN}` })).status).toBe(200);
    // inne metody pod tym adresem to 405
    expect((await p.zadanie('POST', '/api/liczniki', {}, bearer(TOKEN))).status).toBe(405);
    expect(s.gra.baza.liczniki(0)).toHaveLength(2);
  });

  it('od=<ms> ucina liczniki od początku doby i powroty kohort założonych od tej chwili', async () => {
    const { p } = await zDanymi();
    const pytaj = (od: string) => p.zadanie('GET', `/api/liczniki?od=${od}`, undefined, bearer(TOKEN));
    // od początku drugiej doby: stare liczniki znikają, kohorta z doby D też (założona wcześniej)
    const r = await pytaj(String(DZIEN0 + DOBA));
    expect(r.status, r.tekst).toBe(200);
    expect(r.body).toEqual({ liczniki: [{ dzien: DZIEN0 + DOBA, zdarzenie: 'dzien:2', n: 1 }], powroty: [] });
    // od początku pierwszej doby: wszystko
    expect((await pytaj(String(DZIEN0))).body.liczniki).toHaveLength(2);
    expect((await pytaj(String(DZIEN0))).body.powroty).toHaveLength(1);
    // od=0 i brak od to to samo
    expect((await pytaj('0')).body).toEqual((await p.zadanie('GET', '/api/liczniki', undefined, bearer(TOKEN))).body);
    // od za daleko w przyszłości: puste, ale poprawne
    expect((await pytaj(String(DZIEN0 + 100 * DOBA))).body).toEqual({ liczniki: [], powroty: [] });
    // śmieci to 400, nie 500
    for (const zle of ['abc', '-1', 'NaN', 'Infinity', '']) {
      const w = await pytaj(zle);
      expect(w.status, zle).toBe(400);
      expect(w.body.blad).toBe('zle_dane');
    }
  });

  it('zgadywanie tokenu jest ograniczone: 10 złych prób z adresu w kwadrans, dobry token dalej wpuszcza z innego adresu', async () => {
    const s = await start({ tokenLicznikow: TOKEN, proxySekret: SEKRET });
    const atakujacy = przegladarka(s.adres, { [NAGLOWEK_PROXY]: SEKRET, 'x-real-ip': '10.0.0.9' });
    for (let i = 0; i < 10; i++)
      expect((await atakujacy.zadanie('GET', '/api/liczniki', undefined, bearer(`zly${i}`))).status).toBe(401);
    const r = await atakujacy.zadanie('GET', '/api/liczniki', undefined, bearer(TOKEN));
    expect(r.status).toBe(429);
    expect(r.body.blad).toBe('za_duzo_prob');
    expect(Number(r.headers.get('retry-after'))).toBeGreaterThan(0);

    const prawowity = przegladarka(s.adres, { [NAGLOWEK_PROXY]: SEKRET, 'x-real-ip': '10.0.0.1' });
    expect((await prawowity.zadanie('GET', '/api/liczniki', undefined, bearer(TOKEN))).status).toBe(200);
    // dobre odczyty nie zużywają limitu złych prób
    for (let i = 0; i < 15; i++)
      expect((await prawowity.zadanie('GET', '/api/liczniki', undefined, bearer(TOKEN))).status).toBe(200);

    s.czekaj(16 * MIN);
    expect((await atakujacy.zadanie('GET', '/api/liczniki', undefined, bearer(TOKEN))).status).toBe(200);
  });
});

describe('serwer gry: migracja 3', () => {
  it('migracja 3 na bazie z migracji 2: konta zostają, tabele liczników są puste i działają', () => {
    expect(MIGRACJE.length).toBeGreaterThanOrEqual(3);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'za-murem-'));
    const plik = path.join(dir, 'gra.db');
    try {
      const stara = new DatabaseSync(plik);
      stara.exec(MIGRACJE[0]);
      stara.exec(MIGRACJE[1]);
      stara.exec('PRAGMA user_version = 2');
      stara
        .prepare('INSERT INTO konta (nick, nick_klucz, haslo, utworzone, ostatnio) VALUES (?, ?, ?, ?, ?)')
        .run('Stary', 'stary', 'x', DZIEN0 - 3 * DOBA + 5, DZIEN0 - 3 * DOBA + 5);
      stara.close();

      const b = otworzBaze(plik);
      try {
        expect((b.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(
          MIGRACJE.length,
        );
        expect(b.kontoPoNicku('stary')?.nick).toBe('Stary');
        expect(b.liczniki(0)).toEqual([]);
        expect(b.powroty(0)).toEqual([]);
        // stare konto liczy powrót względem swojej doby założenia
        expect(b.dotknijKonta(1, DZIEN0)).toBe(true);
        b.doliczPowrot(DZIEN0 - 3 * DOBA, 3);
        b.doliczPowrot(DZIEN0 - 3 * DOBA, 3);
        b.dolicz(DZIEN0, 'dzien:3');
        expect(b.powroty(0)).toEqual([{ zalozone: DZIEN0 - 3 * DOBA, poDniach: 3, n: 2 }]);
        expect(b.liczniki(0)).toEqual([{ dzien: DZIEN0, zdarzenie: 'dzien:3', n: 1 }]);
        // tabele są STRICT, a klucz główny pilnuje pary
        expect(() => b.db.exec("INSERT INTO liczniki (dzien, zdarzenie, n) VALUES ('x', 'y', 1)")).toThrow();
      } finally {
        b.zamknij();
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
