/* Zapytania o zajęte klatki tylko w swojej okolicy (server/app.ts klatkiWProstokacie i PUT /api/druzyna/start,
   ZASIEG_ZAPYTAN_M w src/net/protokol.ts): prostokąt, którego któryś róg leży dalej niż 1500 m od siedziby drużyny
   (a bez siedziby od jej punktu startu), to 403 poza_okolica, a drużyna bez siedziby i bez punktu startu dostaje 409
   brak_startu. Punkt startu żyje tylko w pamięci procesu serwera (to w praktyce adres gracza): zmienia się najwyżej
   5 razy na dobę na konto i po restarcie trzeba go podać jeszcze raz.
   Zmiany okolicy dzielą to samo okno 5 na dobę na konto: PUT start, zajęcie klatki przez drużynę bez siedziby
   (poza zasięgiem punktu startu) i zwolnienie siedziby, które przenosi ją na inną klatkę. Bez tego jedno konto
   przeczesałoby miasto, zajmując klatkę daleko i zwalniając wszystko albo idąc od klatki do klatki.
   Serwer w procesie testu jak w serwer.test.ts (tests/unit/serwer-pomoc.ts), zegar przesuwa `czekaj`; test restartu
   używa pliku bazy w katalogu tymczasowym, bo baza ':memory:' znika razem z serwerem. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ZASIEG_ZAPYTAN_M } from '../../src/net/protokol.ts';
import { pikselZ } from '../../src/world/klucze.ts';
import { przegladarka, type SerwerTestowy, serwerTestowy } from './serwer-pomoc.ts';

const DOBA = 24 * 60 * 60 * 1000;
const M_NA_STOPIEN_LAT = 110574;

/** blok na Przymorzu i jego klatka (jak w serwer-wygasanie.test.ts: pozycja przy najwyższym wierzchołku budynku) */
const PRZYMORZE = { lat: 54.40939, lon: 18.59923 };
const [bx, by] = pikselZ(PRZYMORZE.lat, PRZYMORZE.lon).map(Math.round);
const BUD = `px:${bx}:${by}:-100:60:3`;
const K1 = {
  klucz: `${BUD}/1`,
  budynek: BUD,
  lat: PRZYMORZE.lat - 10 / M_NA_STOPIEN_LAT,
  lon: PRZYMORZE.lon - 27 / 65000,
};

/** druga klatka tego samego bloku, 10 m od K1 (siedziba i K2 leżą w jednym budynku, więc blisko siebie) */
const K2 = { ...K1, klucz: `${BUD}/2`, lon: PRZYMORZE.lon - 17 / 65000 };

/** klatka bloku z najwyższym wierzchołkiem w punkcie (lat, lon), z pozycją 5 m na wschód i południe od niego */
function klatkaW(lat: number, lon: number) {
  const [x, y] = pikselZ(lat, lon).map(Math.round);
  const budynek = `px:${x}:${y}:-100:60:3`;
  return {
    klucz: `${budynek}/1`,
    budynek,
    lat: lat - 5 / M_NA_STOPIEN_LAT,
    lon: lon + 5 / (111320 * Math.cos((lat * Math.PI) / 180)),
  };
}
/** sześć miast daleko od siebie (każde wiele kilometrów od pozostałych) */
const MIASTA: Punkt[] = [
  { lat: 54.372, lon: 18.6383 }, // Gdańsk
  { lat: 52.2297, lon: 21.0122 }, // Warszawa
  { lat: 50.0647, lon: 19.945 }, // Kraków
  { lat: 51.1079, lon: 17.0385 }, // Wrocław
  { lat: 52.4064, lon: 16.9252 }, // Poznań
  { lat: 51.7592, lon: 19.456 }, // Łódź
];

interface Punkt {
  lat: number;
  lon: number;
}

/** punkt przesunięty o metry na północ */
const naPolnoc = (p: Punkt, m: number): Punkt => ({ lat: p.lat + m / M_NA_STOPIEN_LAT, lon: p.lon });

/** Zapytanie o prostokąt dookoła punktu: południe, północ, zachód i wschód w metrach od punktu (jak prostokatMapy
    z src/world/klucze.ts, tylko podane wprost). */
function prostokat(p: Punkt, poludnie: number, polnoc: number, zachod: number, wschod: number): string {
  const mLon = 111320 * Math.cos((p.lat * Math.PI) / 180);
  const s = p.lat - poludnie / M_NA_STOPIEN_LAT;
  const n = p.lat + polnoc / M_NA_STOPIEN_LAT;
  const w = p.lon - zachod / mLon;
  const e = p.lon + wschod / mLon;
  return `/api/klatki?s=${s}&w=${w}&n=${n}&e=${e}`;
}
/** prostokąt mapy gry: około 420 m od punktu w każdą stronę (384 m mapy z obrotem plus zapas) */
const mapaWokol = (p: Punkt) => prostokat(p, 420, 420, 420, 420);

let serwery: SerwerTestowy[] = [];
let katalogi: string[] = [];
async function start(opcje: Parameters<typeof serwerTestowy>[0] = {}) {
  const s = await serwerTestowy(opcje);
  serwery.push(s);
  return s;
}
afterEach(async () => {
  await Promise.all(serwery.map((s) => s.zamknij()));
  serwery = [];
  for (const k of katalogi) fs.rmSync(k, { recursive: true, force: true });
  katalogi = [];
});

/** nowa drużyna anonimowa */
async function druzyna(s: SerwerTestowy) {
  const p = przegladarka(s.adres);
  const r = await p.zadanie('POST', '/api/druzyna', {});
  expect(r.status, r.tekst).toBe(201);
  return p;
}
const ustawStart = (p: ReturnType<typeof przegladarka>, punkt: Punkt) =>
  p.zadanie('PUT', '/api/druzyna/start', { lat: punkt.lat, lon: punkt.lon });
const klucze = (r: { body: { klatki: { klucz: string }[] } }) => r.body.klatki.map((k) => k.klucz);

describe('serwer gry: zapytania o klatki tylko w okolicy', () => {
  it('stała ze specu: 1500 m', () => {
    expect(ZASIEG_ZAPYTAN_M).toBe(1500);
  });

  it('drużyna bez siedziby widzi klatki tylko wokół swojego punktu startu', async () => {
    const s = await start();
    const sasiad = await druzyna(s);
    expect((await sasiad.zadanie('POST', '/api/klatki', K1)).status).toBe(201);

    const nowa = await druzyna(s);
    // bez punktu startu nie wiadomo, gdzie wolno patrzeć
    const brak = await nowa.zadanie('GET', mapaWokol(PRZYMORZE));
    expect(brak.status).toBe(409);
    expect(brak.body.blad).toBe('brak_startu');
    // punkt startu innej drużyny nic jej nie daje
    expect((await ustawStart(sasiad, PRZYMORZE)).status).toBe(204);
    expect((await nowa.zadanie('GET', mapaWokol(PRZYMORZE))).body.blad).toBe('brak_startu');

    expect((await ustawStart(nowa, PRZYMORZE)).status).toBe(204);
    const wokol = await nowa.zadanie('GET', mapaWokol(PRZYMORZE));
    expect(wokol.status, wokol.tekst).toBe(200);
    expect(klucze(wokol)).toEqual([K1.klucz]);
    // cudza klatka dalej tylko jako „zajęta”
    expect(wokol.body.klatki[0].moja).toBe(false);

    // prostokąt 3 km dalej: odmowa, nic z mapy nie wycieka
    const daleko = await nowa.zadanie('GET', mapaWokol(naPolnoc(PRZYMORZE, 3000)));
    expect(daleko.status).toBe(403);
    expect(daleko.body.blad).toBe('poza_okolica');
    expect(daleko.body.klatki).toBeUndefined();
  });

  it('o okolicy decydują wszystkie cztery rogi: 1000 m od punktu we wszystkie strony przechodzi, 1100 m już nie', async () => {
    const s = await start();
    const p = await druzyna(s);
    expect((await ustawStart(p, PRZYMORZE)).status).toBe(204);
    // róg na przekątnej około 1414 m
    expect((await p.zadanie('GET', prostokat(PRZYMORZE, 1000, 1000, 1000, 1000))).status).toBe(200);
    // róg na przekątnej około 1556 m
    const za = await p.zadanie('GET', prostokat(PRZYMORZE, 1100, 1100, 1100, 1100));
    expect(za.status).toBe(403);
    expect(za.body.blad).toBe('poza_okolica');
    // jeden daleki bok wystarczy, choć trzy rogi leżą blisko
    for (const [poludnie, polnoc, zachod, wschod] of [
      [200, 2000, 200, 200],
      [2000, 200, 200, 200],
      [200, 200, 2000, 200],
      [200, 200, 200, 2000],
    ]) {
      const r = await p.zadanie('GET', prostokat(PRZYMORZE, poludnie, polnoc, zachod, wschod));
      expect(r.status, `${poludnie} ${polnoc} ${zachod} ${wschod}`).toBe(403);
      expect(r.body.blad).toBe('poza_okolica');
    }
  });

  it('zły prostokąt to 400 także bez punktu startu (kształt sprawdzamy przed okolicą)', async () => {
    const s = await start();
    const p = await druzyna(s);
    for (const zly of ['/api/klatki?s=54.42&w=18.59&n=54.4&e=18.61', '/api/klatki?s=a&w=b&n=c&e=d'])
      expect((await p.zadanie('GET', zly)).status, zly).toBe(400);
  });

  it('drużyna z siedzibą pyta wokół siedziby, punkt startu nie jest potrzebny', async () => {
    const s = await start();
    const a = await druzyna(s);
    expect((await a.zadanie('POST', '/api/klatki', K1)).status).toBe(201);
    const siedziba = { lat: K1.lat, lon: K1.lon };

    // bez żadnego PUT start
    const wokol = await a.zadanie('GET', mapaWokol(siedziba));
    expect(wokol.status, wokol.tekst).toBe(200);
    expect(klucze(wokol)).toEqual([K1.klucz]);
    const daleko = await a.zadanie('GET', mapaWokol(naPolnoc(siedziba, 3000)));
    expect(daleko.status).toBe(403);
    expect(daleko.body.blad).toBe('poza_okolica');

    // punkt startu gdzie indziej niczego nie zmienia: liczy się siedziba
    const gdzieIndziej = naPolnoc(siedziba, 3000);
    expect((await ustawStart(a, gdzieIndziej)).status).toBe(204);
    expect((await a.zadanie('GET', mapaWokol(siedziba))).status).toBe(200);
    expect((await a.zadanie('GET', mapaWokol(gdzieIndziej))).body.blad).toBe('poza_okolica');

    // po zwolnieniu klatek siedziby nie ma i okolicę wyznacza punkt startu
    expect((await a.zadanie('DELETE', '/api/klatki/moje')).status).toBe(204);
    expect((await a.zadanie('GET', mapaWokol(gdzieIndziej))).status).toBe(200);
    expect((await a.zadanie('GET', mapaWokol(siedziba))).body.blad).toBe('poza_okolica');
  });

  it('PUT start: tylko z sesją, tylko poprawne współrzędne', async () => {
    const s = await start();
    const bez = przegladarka(s.adres);
    expect((await ustawStart(bez, PRZYMORZE)).status).toBe(401);
    const p = await druzyna(s);
    for (const zle of [
      {},
      { lat: 54.4 },
      { lon: 18.6 },
      { lat: '54.4', lon: 18.6 },
      { lat: 54.4, lon: null },
      { lat: 91, lon: 18.6 },
      { lat: 54.4, lon: 181 },
      { lat: -86, lon: 0 },
    ]) {
      const r = await p.zadanie('PUT', '/api/druzyna/start', zle);
      expect(r.status, JSON.stringify(zle)).toBe(400);
      expect(r.body.blad).toBe('zle_dane');
    }
    // złe dane nie zużywają limitu zmian: pięć poprawnych dalej przechodzi
    for (let i = 0; i < 5; i++) expect((await ustawStart(p, PRZYMORZE)).status, `próba ${i + 1}`).toBe(204);
  });

  it('punkt startu zmienia się najwyżej 5 razy na dobę', async () => {
    const s = await start();
    const p = await druzyna(s);
    for (let i = 0; i < 5; i++)
      expect((await ustawStart(p, naPolnoc(PRZYMORZE, i))).status, `zmiana ${i + 1}`).toBe(204);
    const szosta = await ustawStart(p, PRZYMORZE);
    expect(szosta.status).toBe(429);
    expect(szosta.body.blad).toBe('za_duzo_prob');
    expect(Number(szosta.headers.get('Retry-After'))).toBeGreaterThan(0);
    // odmowa nie podmienia punktu: ostatni przyjęty jest 4 m na północ od Przymorza
    expect((await p.zadanie('GET', prostokat(naPolnoc(PRZYMORZE, 4), 50, 50, 50, 50))).status).toBe(200);
    expect((await p.zadanie('GET', mapaWokol(naPolnoc(PRZYMORZE, 3000)))).body.blad).toBe('poza_okolica');

    // inne konto ma własny limit
    const inna = await druzyna(s);
    expect((await ustawStart(inna, PRZYMORZE)).status).toBe(204);

    // po dobie znów można
    s.czekaj(DOBA + 1000);
    expect((await ustawStart(p, PRZYMORZE)).status).toBe(204);
  });

  it('punkt startu jest tylko w pamięci serwera: po nowym stworzSerwer na tej samej bazie trzeba go podać jeszcze raz', async () => {
    const katalog = fs.mkdtempSync(path.join(os.tmpdir(), 'zm-okolica-'));
    katalogi.push(katalog);
    const plik = path.join(katalog, 'gra.db');

    const s1 = await start({ baza: plik });
    const p1 = await druzyna(s1);
    expect((await ustawStart(p1, PRZYMORZE)).status).toBe(204);
    expect((await p1.zadanie('GET', mapaWokol(PRZYMORZE))).status).toBe(200);
    const ciasteczko = p1.ciasteczko;
    await s1.zamknij();
    serwery = serwery.filter((x) => x !== s1);

    // ta sama baza, ta sama sesja, ale nowy proces: punktu startu nie ma
    const s2 = await start({ baza: plik });
    const p2 = przegladarka(s2.adres);
    p2.ciasteczko = ciasteczko;
    expect((await p2.zadanie('GET', '/api/konto')).status).toBe(200);
    const brak = await p2.zadanie('GET', mapaWokol(PRZYMORZE));
    expect(brak.status).toBe(409);
    expect(brak.body.blad).toBe('brak_startu');
    // limit zmian też zaczyna od zera (leży w pamięci), a po podaniu punktu wszystko działa jak przedtem
    expect((await ustawStart(p2, PRZYMORZE)).status).toBe(204);
    expect((await p2.zadanie('GET', mapaWokol(PRZYMORZE))).status).toBe(200);

    // w bazie nie ma po nim śladu
    const tekst = JSON.stringify(s2.gra.baza.db.prepare('SELECT * FROM konta').all());
    expect(tekst).not.toContain(String(PRZYMORZE.lat));
  });

  it('usunięcie konta kasuje też punkt startu z pamięci', async () => {
    const s = await start();
    const p = await druzyna(s);
    expect((await ustawStart(p, PRZYMORZE)).status).toBe(204);
    expect((await p.zadanie('DELETE', '/api/konto')).status).toBe(204);
    // nowa drużyna dostaje nowy numer, nie dziedziczy niczego po usuniętej
    const nowa = await druzyna(s);
    expect((await nowa.zadanie('GET', mapaWokol(PRZYMORZE))).body.blad).toBe('brak_startu');
  });
});

describe('serwer gry: zmiany okolicy dzielą jedno okno (5 na dobę na konto)', () => {
  it('skok: pięć razy „zajmij klatkę daleko, zwolnij wszystko” przechodzi, szóste zajęcie to 429', async () => {
    const s = await start();
    const p = await druzyna(s);
    for (let i = 0; i < 5; i++) {
      const r = await p.zadanie('POST', '/api/klatki', klatkaW(MIASTA[i].lat, MIASTA[i].lon));
      expect(r.status, `miasto ${i + 1}: ${r.tekst}`).toBe(201);
      expect(r.body.klatka.siedziba).toBe(true);
      expect((await p.zadanie('DELETE', '/api/klatki/moje')).status).toBe(204);
    }
    const szoste = await p.zadanie('POST', '/api/klatki', klatkaW(MIASTA[5].lat, MIASTA[5].lon));
    expect(szoste.status).toBe(429);
    expect(szoste.body.blad).toBe('za_duzo_prob');
    expect(Number(szoste.headers.get('Retry-After'))).toBeGreaterThan(0);
    // odmowa niczego nie zajmuje, a zwolnienie nadal jest bez limitu
    expect((await p.zadanie('GET', '/api/klatki/moje')).body.klatki).toEqual([]);
    expect((await p.zadanie('DELETE', '/api/klatki/moje')).status).toBe(204);
    // punkt startu dzieli to samo okno
    expect((await ustawStart(p, MIASTA[5])).status).toBe(429);

    // inne konto ma własne okno
    const inna = await druzyna(s);
    expect((await inna.zadanie('POST', '/api/klatki', klatkaW(MIASTA[5].lat, MIASTA[5].lon))).status).toBe(201);

    // po dobie znów można
    s.czekaj(DOBA + 1000);
    expect((await p.zadanie('POST', '/api/klatki', klatkaW(MIASTA[0].lat, MIASTA[0].lon))).status).toBe(201);
  });

  it('nowa siedziba w zasięgu punktu startu nie zużywa okna: PUT start i zajęcie przy tym samym adresie to jedna zmiana', async () => {
    const s = await start();
    const p = await druzyna(s);
    expect((await ustawStart(p, PRZYMORZE)).status).toBe(204);
    // zajmij, zwolnij, zajmij... przy punkcie startu bez końca (10 razy), także klatka 600 m dalej, wciąż w zasięgu
    const blisko = klatkaW(naPolnoc(PRZYMORZE, 600).lat, PRZYMORZE.lon);
    for (let i = 0; i < 10; i++) {
      const r = await p.zadanie('POST', '/api/klatki', i % 2 ? blisko : K1);
      expect(r.status, `zajęcie ${i + 1}: ${r.tekst}`).toBe(201);
      expect((await p.zadanie('DELETE', '/api/klatki/moje')).status).toBe(204);
    }
    // w oknie zostały cztery zmiany: tyle PUT przechodzi, piąty nie
    for (let i = 0; i < 4; i++) expect((await ustawStart(p, PRZYMORZE)).status, `PUT ${i + 2}`).toBe(204);
    expect((await ustawStart(p, PRZYMORZE)).status).toBe(429);
    // z wyczerpanym oknem nowa siedziba przy punkcie startu dalej przechodzi, daleko od niego już nie
    expect((await p.zadanie('POST', '/api/klatki', K1)).status).toBe(201);
    expect((await p.zadanie('DELETE', '/api/klatki/moje')).status).toBe(204);
    expect((await p.zadanie('POST', '/api/klatki', klatkaW(MIASTA[1].lat, MIASTA[1].lon))).status).toBe(429);
  });

  it('nowa siedziba poza zasięgiem punktu startu liczy się jak jego zmiana', async () => {
    const s = await start();
    const p = await druzyna(s);
    expect((await ustawStart(p, PRZYMORZE)).status).toBe(204); // 1
    for (let i = 0; i < 3; i++) {
      const r = await p.zadanie('POST', '/api/klatki', klatkaW(MIASTA[i].lat, MIASTA[i].lon)); // 2, 3, 4
      expect(r.status, `miasto ${i + 1}: ${r.tekst}`).toBe(201);
      expect((await p.zadanie('DELETE', '/api/klatki/moje')).status).toBe(204);
    }
    expect((await ustawStart(p, PRZYMORZE)).status).toBe(204); // 5
    expect((await ustawStart(p, PRZYMORZE)).status).toBe(429);
    expect((await p.zadanie('POST', '/api/klatki', klatkaW(MIASTA[3].lat, MIASTA[3].lon))).status).toBe(429);
  });

  it('spacer: zwolnienie siedziby, na którą przechodzi inna klatka, liczy się, a przy wyczerpanym oknie nic się nie zwalnia', async () => {
    const s = await start();
    const p = await druzyna(s);
    expect((await ustawStart(p, PRZYMORZE)).status).toBe(204); // 1 z 5
    expect((await p.zadanie('POST', '/api/klatki', K1)).status).toBe(201); // w zasięgu punktu startu: bez kosztu
    expect((await p.zadanie('POST', '/api/klatki', K2)).status).toBe(201); // zwykła klatka obok siedziby: bez kosztu

    const siedziba = async () => {
      const lista = (await p.zadanie('GET', '/api/klatki/moje')).body.klatki as { klucz: string; siedziba?: boolean }[];
      return lista.filter((k) => k.siedziba).map((k) => k.klucz);
    };
    const url = (k: { klucz: string }) => `/api/klatki/${encodeURIComponent(k.klucz)}`;
    expect(await siedziba()).toEqual([K1.klucz]);

    // zwolnienie zwykłej klatki nie przenosi siedziby i nic nie kosztuje
    expect((await p.zadanie('DELETE', url(K2))).status).toBe(204);
    expect((await p.zadanie('POST', '/api/klatki', K2)).status).toBe(201);

    // cztery przeniesienia siedziby (2, 3, 4, 5 z 5): zwolnij siedzibę, wracasz drugą klatką, dobierasz zwolnioną
    let obecna = K1;
    let druga = K2;
    for (let i = 0; i < 4; i++) {
      expect((await p.zadanie('DELETE', url(obecna))).status, `przeniesienie ${i + 1}`).toBe(204);
      expect(await siedziba(), `po przeniesieniu ${i + 1}`).toEqual([druga.klucz]);
      expect((await p.zadanie('POST', '/api/klatki', obecna)).status).toBe(201);
      [obecna, druga] = [druga, obecna];
    }
    expect(await siedziba()).toEqual([obecna.klucz]);

    // okno wyczerpane: następne przeniesienie dostaje 429 przed zwolnieniem, wszystko zostaje jak było
    const odmowa = await p.zadanie('DELETE', url(obecna));
    expect(odmowa.status).toBe(429);
    expect(odmowa.body.blad).toBe('za_duzo_prob');
    expect(Number(odmowa.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(await siedziba()).toEqual([obecna.klucz]);
    expect(((await p.zadanie('GET', '/api/klatki/moje')).body.klatki as unknown[]).length).toBe(2);
    // PUT start dzieli to samo okno
    expect((await ustawStart(p, PRZYMORZE)).status).toBe(429);

    // bez przeniesienia zwolnienie dalej jest bez limitu: zwykła klatka, potem jedyna (siedziba bez następczyni)
    expect((await p.zadanie('DELETE', url(druga))).status).toBe(204);
    expect((await p.zadanie('DELETE', url(obecna))).status).toBe(204);
    expect((await p.zadanie('GET', '/api/klatki/moje')).body.klatki).toEqual([]);

    // po dobie przeniesienie znów działa
    s.czekaj(DOBA + 1000);
    expect((await p.zadanie('POST', '/api/klatki', K1)).status).toBe(201);
    expect((await p.zadanie('POST', '/api/klatki', K2)).status).toBe(201);
    expect((await p.zadanie('DELETE', url(K1))).status).toBe(204);
    expect(await siedziba()).toEqual([K2.klucz]);
  });
});

describe('serwer gry: zajęcie klatki nie zdradza, czy cudza klatka jest zajęta', () => {
  it('drużyna z siedzibą daleko od celu dostaje 422 za_daleko, zajętą czy wolną', async () => {
    const s = await start();
    const warszawa = await druzyna(s);
    const zajeta = klatkaW(MIASTA[1].lat, MIASTA[1].lon);
    expect((await warszawa.zadanie('POST', '/api/klatki', zajeta)).status).toBe(201);

    const gdansk = await druzyna(s);
    expect((await gdansk.zadanie('POST', '/api/klatki', klatkaW(MIASTA[0].lat, MIASTA[0].lon))).status).toBe(201);
    const naZajeta = await gdansk.zadanie('POST', '/api/klatki', zajeta);
    const naWolna = await gdansk.zadanie('POST', '/api/klatki', klatkaW(MIASTA[2].lat, MIASTA[2].lon));
    expect(naZajeta.status, naZajeta.tekst).toBe(422);
    expect(naZajeta.body.blad).toBe('za_daleko');
    // ta sama odpowiedź dla klatki wolnej: z siedzibą w innym mieście nie da się sondować cudzych klatek
    expect(naWolna.status).toBe(422);
    expect(naWolna.body).toEqual(naZajeta.body);
    // klatka Warszawy została przy Warszawie
    expect(((await warszawa.zadanie('GET', '/api/klatki/moje')).body.klatki as unknown[]).length).toBe(1);
  });

  it('drużyna bez siedziby z wyczerpanym oknem zmian okolicy dostaje 429, zajętą czy wolną', async () => {
    const s = await start();
    const inna = await druzyna(s);
    const zajeta = klatkaW(MIASTA[5].lat, MIASTA[5].lon);
    expect((await inna.zadanie('POST', '/api/klatki', zajeta)).status).toBe(201);

    const p = await druzyna(s);
    for (let i = 0; i < 5; i++) {
      expect((await p.zadanie('POST', '/api/klatki', klatkaW(MIASTA[i].lat, MIASTA[i].lon))).status).toBe(201);
      expect((await p.zadanie('DELETE', '/api/klatki/moje')).status).toBe(204);
    }
    const naZajeta = await p.zadanie('POST', '/api/klatki', zajeta);
    const naWolna = await p.zadanie('POST', '/api/klatki', klatkaW(MIASTA[0].lat, MIASTA[0].lon));
    expect(naZajeta.status, naZajeta.tekst).toBe(429);
    expect(naZajeta.body.blad).toBe('za_duzo_prob');
    expect(naWolna.status).toBe(429);
    expect(naWolna.body).toEqual(naZajeta.body);
    expect(Number(naZajeta.headers.get('Retry-After'))).toBeGreaterThan(0);
  });

  it('drużyna z pełnym limitem klatek dostaje 403 limit_klatek, zajętą czy wolną', async () => {
    const s = await start({ limitKlatek: 1 });
    const sasiad = await druzyna(s);
    expect((await sasiad.zadanie('POST', '/api/klatki', K2)).status).toBe(201);
    const p = await druzyna(s);
    expect((await p.zadanie('POST', '/api/klatki', K1)).status).toBe(201);
    const naZajeta = await p.zadanie('POST', '/api/klatki', K2);
    const naWolna = await p.zadanie('POST', '/api/klatki', { ...K2, klucz: `${BUD}/3` });
    expect(naZajeta.status, naZajeta.tekst).toBe(403);
    expect(naZajeta.body.blad).toBe('limit_klatek');
    expect(naWolna.status).toBe(403);
    expect(naWolna.body).toEqual(naZajeta.body);
  });

  it('w swojej okolicy działa jak dotąd: wolna klatka 201, cudza zajęta 409, własna 200', async () => {
    const s = await start();
    const sasiad = await druzyna(s);
    expect((await sasiad.zadanie('POST', '/api/klatki', K2)).status).toBe(201);

    // drużyna z siedzibą w tym samym bloku: cudza klatka to 409 zajeta, wolna 201, własna ponownie 200
    const a = await druzyna(s);
    expect((await a.zadanie('POST', '/api/klatki', K1)).status).toBe(201);
    const konflikt = await a.zadanie('POST', '/api/klatki', K2);
    expect(konflikt.status).toBe(409);
    expect(konflikt.body.blad).toBe('zajeta');
    expect((await a.zadanie('POST', '/api/klatki', { ...K2, klucz: `${BUD}/3` })).status).toBe(201);
    expect((await a.zadanie('POST', '/api/klatki', K1)).status).toBe(200);

    // drużyna bez siedziby z punktem startu obok: zajęta to 409, bez zużycia okna zmian okolicy
    const b = await druzyna(s);
    expect((await ustawStart(b, PRZYMORZE)).status).toBe(204);
    for (let i = 0; i < 6; i++) expect((await b.zadanie('POST', '/api/klatki', K2)).status, `próba ${i + 1}`).toBe(409);
    expect((await b.zadanie('POST', '/api/klatki', { ...K2, klucz: `${BUD}/4` })).status).toBe(201);
  });

  it('zajęta klatka blisko punktu startu nie zużywa okna zmian okolicy, choćby próbować wiele razy', async () => {
    const s = await start();
    const sasiad = await druzyna(s);
    expect((await sasiad.zadanie('POST', '/api/klatki', K2)).status).toBe(201);
    const b = await druzyna(s);
    expect((await ustawStart(b, PRZYMORZE)).status).toBe(204); // 1 z 5
    for (let i = 0; i < 8; i++) expect((await b.zadanie('POST', '/api/klatki', K2)).status, `próba ${i + 1}`).toBe(409);
    // okno nietknięte: zostały cztery zmiany, piąta jest 429
    for (let i = 0; i < 4; i++) expect((await ustawStart(b, PRZYMORZE)).status, `PUT ${i + 2}`).toBe(204);
    expect((await ustawStart(b, PRZYMORZE)).status).toBe(429);
  });

  it('sondowanie zajętych klatek daleko od okolicy kosztuje: bez siedziby i bez punktu startu sześć zajętych to 409 pięć razy, potem 429', async () => {
    const s = await start();
    // sześć klatek w sześciu miastach zajętych przez sześć drużyn
    for (const m of MIASTA) {
      const druzyna1 = await druzyna(s);
      expect((await druzyna1.zadanie('POST', '/api/klatki', klatkaW(m.lat, m.lon))).status).toBe(201);
    }
    const p = await druzyna(s);
    for (let i = 0; i < 5; i++) {
      const r = await p.zadanie('POST', '/api/klatki', klatkaW(MIASTA[i].lat, MIASTA[i].lon));
      expect(r.status, `próba ${i + 1}: ${r.tekst}`).toBe(409);
      expect(r.body.blad).toBe('zajeta');
    }
    // szósta zajęta i każda wolna dostają to samo: okno wyczerpane, nie ma darmowego sondowania
    const szosta = await p.zadanie('POST', '/api/klatki', klatkaW(MIASTA[5].lat, MIASTA[5].lon));
    expect(szosta.status, szosta.tekst).toBe(429);
    expect(szosta.body.blad).toBe('za_duzo_prob');
    expect(Number(szosta.headers.get('Retry-After'))).toBeGreaterThan(0);
    const wolna = await p.zadanie('POST', '/api/klatki', klatkaW(naPolnoc(MIASTA[0], 5000).lat, MIASTA[0].lon));
    expect(wolna.status).toBe(429);
    expect(wolna.body).toEqual(szosta.body);
    // odmowa niczego nie zajmuje, a okno dzieli PUT start
    expect((await p.zadanie('GET', '/api/klatki/moje')).body.klatki).toEqual([]);
    expect((await ustawStart(p, PRZYMORZE)).status).toBe(429);
    // po dobie okno wraca
    s.czekaj(DOBA + 1000);
    expect((await p.zadanie('POST', '/api/klatki', klatkaW(MIASTA[5].lat, MIASTA[5].lon))).status).toBe(409);
  });

  it('z punktem startu daleko od celu zajęta klatka też kosztuje (okno liczy się od zasięgu punktu startu), a wolna w jego zasięgu nie', async () => {
    const s = await start();
    const inna = await druzyna(s);
    const daleka = klatkaW(MIASTA[1].lat, MIASTA[1].lon);
    expect((await inna.zadanie('POST', '/api/klatki', daleka)).status).toBe(201);
    const p = await druzyna(s);
    expect((await ustawStart(p, PRZYMORZE)).status).toBe(204); // 1 z 5
    for (let i = 0; i < 4; i++)
      expect((await p.zadanie('POST', '/api/klatki', daleka)).status, `próba ${i + 1}`).toBe(409);
    // okno wyczerpane (PUT + cztery próby): daleka zajęta to 429, a klatka przy punkcie startu dalej wolna do zajęcia
    expect((await p.zadanie('POST', '/api/klatki', daleka)).status).toBe(429);
    expect((await p.zadanie('POST', '/api/klatki', K1)).status).toBe(201);
  });
});
