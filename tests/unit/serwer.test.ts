import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { otworzBaze } from '../../server/baza.ts';
import { DOMYSLNE_HASLO, skrotHasla, sprawdzHaslo } from '../../server/hasla.ts';
import { kluczIp, kolejka, okno, PelnaKolejka } from '../../server/limity.ts';
import { pikselZ } from '../../src/world/klucze.ts';
import { przegladarka, type SerwerTestowy, serwerTestowy } from './serwer-pomoc.ts';

const DOBA = 24 * 60 * 60 * 1000;
const DANE = { nick: 'Mateusz_test', haslo: 'bardzo-tajne-1' };
/** klucz budynku (postać z src/world/klucze.ts) z najwyższym wierzchołkiem w danym punkcie; dx, dy w pikselach
    kafelków (około 0,35 m) do najniższego wierzchołka */
function budynekW(lat: number, lon: number, dx = -100, dy = 60): string {
  const [x, y] = pikselZ(lat, lon).map(Math.round);
  return `px:${x}:${y}:${dx}:${dy}:3`;
}
/** klatka budynku w punkcie (lat, lon), z pozycją przesuniętą o metry na wschód i południe */
function klatka(bud: string, nr: number, lat: number, lon: number, wschod = 0, poludnie = 0) {
  return {
    klucz: `${bud}/${nr}`,
    budynek: bud,
    lat: lat - poludnie / 110574,
    lon: lon + wschod / (111320 * Math.cos((lat * Math.PI) / 180)),
  };
}
/** blok na Przymorzu i dwie jego klatki (około 30 i 10 m od najwyższego wierzchołka; rozpiętość około 40 m) */
const BUD = budynekW(54.40939, 18.59923);
const K1 = klatka(BUD, 1, 54.40939, 18.59923, -27, 10);
const K2 = klatka(BUD, 2, 54.40939, 18.59923, -8, 3);
const do5 = (v: number) => Math.round(v * 1e5) / 1e5;

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

/** zalogowana drużyna z nowym kontem */
async function druzyna(s: SerwerTestowy, nick: string, naglowki: Record<string, string> = {}) {
  const p = przegladarka(s.adres, naglowki);
  const r = await p.zadanie('POST', '/api/konto', { nick, haslo: `${nick}-haslo-123` });
  expect(r.status, r.tekst).toBe(201);
  return p;
}

/** wiersze tabeli bazy serwera */
const wiersze = (s: SerwerTestowy, sql: string, ...arg: (string | number)[]) =>
  s.gra.baza.db.prepare(sql).all(...arg) as Record<string, unknown>[];

describe('serwer gry: konta i sesje', () => {
  it('zdrowie: odpowiada bez logowania, z nagłówkami bezpieczeństwa', async () => {
    const s = await start();
    const r = await przegladarka(s.adres).zadanie('GET', '/api/zdrowie');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, gra: 'za-murem', wersja: 1, ip: 'polaczenie' });
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('content-type')).toContain('application/json');
  });

  it('założenie konta loguje: ciasteczko HttpOnly, Secure, SameSite=Lax tylko dla /api; w bazie bez hasła i tokenu', async () => {
    const s = await start();
    const p = przegladarka(s.adres);
    const r = await p.zadanie('POST', '/api/konto', DANE);
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ nick: 'Mateusz_test', utworzone: s.teraz(), klatki: 0, zapis: false });
    const c = r.headers.getSetCookie()[0];
    expect(c).toMatch(/^zm_sesja=[A-Za-z0-9_-]{43}; /);
    for (const a of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/api', `Max-Age=${30 * 24 * 3600}`])
      expect(c).toContain(a);
    const ja = await p.zadanie('GET', '/api/konto');
    expect(ja.status).toBe(200);
    expect(ja.body.nick).toBe('Mateusz_test');
    // w bazie skrót scrypt zamiast hasła i SHA-256 zamiast tokenu; żadnych innych danych o osobie
    const [konto] = wiersze(s, 'SELECT * FROM konta');
    expect(Object.keys(konto).sort()).toEqual(['haslo', 'id', 'nick', 'nick_klucz', 'ostatnio', 'utworzone']);
    expect(String(konto.haslo)).toMatch(/^scrypt\$10\$8\$1\$/);
    expect(String(konto.haslo)).not.toContain(DANE.haslo);
    const token = p.ciasteczko.split('=')[1];
    const [sesja] = wiersze(s, 'SELECT * FROM sesje');
    expect(sesja.skrot).toMatch(/^[0-9a-f]{64}$/);
    expect(sesja.skrot).not.toBe(token);
  });

  it('nick: od 3 do 24 znaków, litery z polskimi, cyfry, kropka, podkreślnik, myślnik; wielkość liter bez znaczenia', async () => {
    const s = await start();
    const p = przegladarka(s.adres);
    for (const nick of ['ab', 'a'.repeat(25), 'zły nick', 'nick!', '<script>', '']) {
      const r = await p.zadanie('POST', '/api/konto', { nick, haslo: 'dobre-haslo-9' });
      expect(r.status, nick).toBe(400);
      expect(r.body.blad).toBe('zly_nick');
    }
    expect((await p.zadanie('POST', '/api/konto', { nick: 'krótkie', haslo: 'siedem7' })).body.blad).toBe('zle_haslo');
    expect((await p.zadanie('POST', '/api/konto', { nick: 'Żółw_ąę', haslo: 'żółw_ąę' + '' })).body.blad).toBe(
      'zle_haslo',
    );
    expect((await p.zadanie('POST', '/api/konto', { nick: 'Żółw_ąę', haslo: 'żółw-hasło' })).status).toBe(201);
    const druga = przegladarka(s.adres);
    const r = await druga.zadanie('POST', '/api/konto', { nick: 'ŻÓŁW_ĄĘ', haslo: 'inne-haslo-1' });
    expect(r.status).toBe(409);
    expect(r.body.blad).toBe('nick_zajety');
    expect((await druga.zadanie('POST', '/api/konto', { nick: 7, haslo: 'inne-haslo-1' })).body.blad).toBe('zle_dane');
    // granice i znaki dozwolone (każde konto z innego adresu, żeby nie wpaść w limit nowych kont)
    const zaProxy = await start({ zaufaneProxy: true });
    const nicki = ['abc', 'a'.repeat(24), 'Jan.Kowal', 'pan-kot', 'Ąę_9'];
    for (const [i, nick] of nicki.entries()) {
      const r1 = await przegladarka(zaProxy.adres, { 'X-Forwarded-For': `10.1.0.${i}` }).zadanie('POST', '/api/konto', {
        nick,
        haslo: 'dobre-haslo-9',
      });
      expect(r1.status, nick).toBe(201);
      expect(r1.body.nick).toBe(nick);
    }
  });

  it('logowanie: dobre hasło daje nową sesję, złe hasło i nieznany nick dają tę samą odpowiedź 401', async () => {
    const s = await start();
    await przegladarka(s.adres).zadanie('POST', '/api/konto', DANE);
    const p = przegladarka(s.adres);
    const zle = await p.zadanie('POST', '/api/sesja', { nick: DANE.nick, haslo: 'zle-haslo-00' });
    const nieznany = await p.zadanie('POST', '/api/sesja', { nick: 'Nikt_taki', haslo: 'zle-haslo-00' });
    expect(zle.status).toBe(401);
    expect(nieznany.status).toBe(401);
    expect(zle.body).toEqual(nieznany.body);
    expect(zle.body.blad).toBe('zle_logowanie');
    expect(p.ciasteczko).toBe('');
    // nick bez względu na wielkość liter
    const dobre = await p.zadanie('POST', '/api/sesja', { nick: 'mateusz_TEST', haslo: DANE.haslo });
    expect(dobre.status).toBe(200);
    expect(dobre.body.nick).toBe('Mateusz_test');
    expect((await p.zadanie('GET', '/api/konto')).status).toBe(200);
    expect(wiersze(s, 'SELECT * FROM sesje')).toHaveLength(2);
  });

  it('wylogowanie kasuje sesję w bazie: stare ciasteczko przestaje działać', async () => {
    const s = await start();
    const p = await druzyna(s, 'Wylogowany');
    const stare = p.ciasteczko;
    const r = await p.zadanie('DELETE', '/api/sesja');
    expect(r.status).toBe(204);
    expect(r.headers.getSetCookie()[0]).toContain('Max-Age=0');
    expect(p.ciasteczko).toBe('');
    p.ciasteczko = stare;
    const ja = await p.zadanie('GET', '/api/konto');
    expect(ja.status).toBe(401);
    expect(ja.body.blad).toBe('brak_sesji');
    expect(wiersze(s, 'SELECT * FROM sesje')).toHaveLength(0);
    // podrobione ciasteczko też nie działa i zostaje skasowane
    p.ciasteczko = 'zm_sesja=podrobione';
    expect((await p.zadanie('GET', '/api/konto')).status).toBe(401);
    expect(p.ciasteczko).toBe('');
  });

  it('sesja ważna 30 dni, przedłużana przy używaniu, potem wygasa; najwyżej 10 sesji na konto', async () => {
    const s = await start();
    const p = await druzyna(s, 'Sesyjny');
    s.czekaj(10 * DOBA);
    let r = await p.zadanie('GET', '/api/konto');
    expect(r.status).toBe(200);
    expect(r.headers.getSetCookie()).toEqual([]);
    s.czekaj(6 * DOBA);
    // zostało mniej niż pół ważności: sesja przedłuża się o pełne 30 dni
    r = await p.zadanie('GET', '/api/konto');
    expect(r.status).toBe(200);
    expect(r.headers.getSetCookie()[0]).toContain(`Max-Age=${30 * 24 * 3600}`);
    expect(Number(wiersze(s, 'SELECT wygasa FROM sesje')[0].wygasa)).toBe(s.teraz() + 30 * DOBA);
    s.czekaj(31 * DOBA);
    expect((await p.zadanie('GET', '/api/konto')).status).toBe(401);
    expect(wiersze(s, 'SELECT * FROM sesje')).toHaveLength(0);
    for (let i = 0; i < 12; i++)
      await przegladarka(s.adres).zadanie('POST', '/api/sesja', { nick: 'Sesyjny', haslo: 'Sesyjny-haslo-123' });
    expect(wiersze(s, 'SELECT * FROM sesje')).toHaveLength(10);
  });

  it('usunięcie konta wymaga hasła i kasuje sesje, klatki i zapis; klatka wraca do wolnych', async () => {
    const s = await start();
    const a = await druzyna(s, 'Odchodzacy');
    expect((await a.zadanie('POST', '/api/klatki', K1)).status).toBe(201);
    expect((await a.zadanie('PUT', '/api/zapis', { dane: { v: 1, data: { name: 'Przymorze' } } })).status).toBe(200);
    const b = await druzyna(s, 'Sasiad');
    expect((await b.zadanie('POST', '/api/klatki', K1)).status).toBe(409);
    const zle = await a.zadanie('DELETE', '/api/konto', { haslo: 'nie-to-haslo' });
    expect(zle.status).toBe(401);
    const ok = await a.zadanie('DELETE', '/api/konto', { haslo: 'Odchodzacy-haslo-123' });
    expect(ok.status).toBe(204);
    expect(a.ciasteczko).toBe('');
    for (const t of ['sesje', 'klatki', 'zapisy'])
      expect(wiersze(s, `SELECT * FROM ${t} WHERE konto = 1`), t).toEqual([]);
    expect(wiersze(s, 'SELECT nick FROM konta')).toEqual([{ nick: 'Sasiad' }]);
    const r = await b.zadanie('POST', '/api/klatki', K1);
    expect(r.status).toBe(201);
    expect(r.body.klatka.siedziba).toBe(true);
    // nick wolny dla nowej osoby
    expect((await przegladarka(s.adres).zadanie('POST', '/api/konto', DANE)).status).toBe(201);
    expect((await przegladarka(s.adres).zadanie('POST', '/api/konto', { ...DANE, nick: 'Odchodzacy' })).status).toBe(
      201,
    );
  });
});

describe('serwer gry: zajęte klatki', () => {
  it('zajęcie i konflikt: druga drużyna dostaje 409 bez nicku, w prostokącie widzi tylko „zajęte”', async () => {
    const s = await start();
    const a = await druzyna(s, 'Pierwsi');
    const b = await druzyna(s, 'Drudzy');
    const r = await a.zadanie('POST', '/api/klatki', K1);
    expect(r.status).toBe(201);
    expect(r.body.klatka).toEqual({ ...K1, lat: do5(K1.lat), lon: do5(K1.lon), moja: true, siedziba: true });
    // to samo jeszcze raz: bez zmian, bez błędu
    expect((await a.zadanie('POST', '/api/klatki', K1)).status).toBe(200);
    const konflikt = await b.zadanie('POST', '/api/klatki', K1);
    expect(konflikt.status).toBe(409);
    expect(konflikt.body.blad).toBe('zajeta');
    expect(konflikt.tekst).not.toContain('Pierwsi');
    const q = '/api/klatki?s=54.40&w=18.59&n=54.42&e=18.61';
    const widokB = await b.zadanie('GET', q);
    expect(widokB.body).toEqual({ klatki: [{ ...K1, lat: do5(K1.lat), lon: do5(K1.lon), moja: false }] });
    expect(widokB.tekst).not.toMatch(/Pierwsi|konto|siedziba|zajeta"/);
    const widokA = await a.zadanie('GET', q);
    expect(widokA.body.klatki[0]).toMatchObject({ moja: true, siedziba: true });
    // druga klatka tego samego bloku jest wolna
    const obok = await b.zadanie('POST', '/api/klatki', K2);
    expect(obok.status).toBe(201);
    expect(obok.body.klatka.siedziba).toBe(true);
    expect((await b.zadanie('GET', '/api/klatki/moje')).body.klatki.map((k: { klucz: string }) => k.klucz)).toEqual([
      K2.klucz,
    ]);
    expect((await a.zadanie('GET', '/api/konto')).body.klatki).toBe(1);
  });

  it('prostokąt: tylko klatki w środku, ograniczony rozmiar, tylko dla zalogowanych', async () => {
    const s = await start();
    const a = await druzyna(s, 'Mapowi');
    await a.zadanie('POST', '/api/klatki', K1);
    const daleko = klatka(budynekW(54.4097, 18.5995), 1, 54.4097, 18.5995, 5, 5);
    expect((await a.zadanie('POST', '/api/klatki', daleko)).status).toBe(201);
    const w = (s0: number, w0: number, n0: number, e0: number) => `/api/klatki?s=${s0}&w=${w0}&n=${n0}&e=${e0}`;
    const lista = async (u: string) => (await a.zadanie('GET', u)).body.klatki.map((k: { klucz: string }) => k.klucz);
    expect(await lista(w(54.409, 18.598, 54.4095, 18.599))).toEqual([K1.klucz]);
    expect(await lista(w(54.4095, 18.599, 54.41, 18.6))).toEqual([daleko.klucz]);
    expect(await lista(w(54.0, 18.0, 54.01, 18.01))).toEqual([]);
    for (const zly of [
      w(54.42, 18.59, 54.4, 18.61),
      w(54.3, 18.5, 54.4, 18.6),
      '/api/klatki?s=54.4&w=18.59&n=54.41',
      '/api/klatki?s=a&w=b&n=c&e=d',
    ])
      expect((await a.zadanie('GET', zly)).status, zly).toBe(400);
    expect((await przegladarka(s.adres).zadanie('GET', w(54.409, 18.598, 54.4095, 18.599))).status).toBe(401);
  });

  it('klatki drużyny najwyżej 600 m od siedziby i najwyżej limit na konto; zły klucz to 400', async () => {
    const s = await start({ limitKlatek: 3 });
    const a = await druzyna(s, 'Zachlanni');
    expect((await a.zadanie('POST', '/api/klatki', K1)).status).toBe(201);
    // blok 650 m na wschód od siedziby (pozycja przy jego własnym kluczu, więc to uczciwa próba)
    const za = klatka(budynekW(54.40939, 18.60935), 1, 54.40939, 18.60935, -10, 5);
    const r = await a.zadanie('POST', '/api/klatki', za);
    expect(r.status).toBe(422);
    expect(r.body.blad).toBe('za_daleko');
    expect((await a.zadanie('POST', '/api/klatki', K2)).status).toBe(201);
    expect((await a.zadanie('POST', '/api/klatki', { ...K2, klucz: `${BUD}/3` })).status).toBe(201);
    const limit = await a.zadanie('POST', '/api/klatki', { ...K2, klucz: `${BUD}/4` });
    expect(limit.status).toBe(403);
    expect(limit.body.blad).toBe('limit_klatek');
    // tylko jedna postać klucza na budynek: bez zer na początku, z kodem stron 1–3, numer klatki od 1
    const [, x, y] = BUD.split(':');
    for (const zly of [
      { ...K1, klucz: 'px:1:2:3:4/1' },
      { ...K1, klucz: `${BUD}/0` },
      { ...K1, klucz: `${BUD}/01` },
      { ...K1, klucz: `${BUD}/1/2` },
      { ...K1, klucz: `px:0${x}:${y}:-100:60:3/1`, budynek: `px:0${x}:${y}:-100:60:3` },
      { ...K1, klucz: `px:${x}:${y}:-100:60:4/1`, budynek: `px:${x}:${y}:-100:60:4` },
      { ...K1, klucz: `px:${x}:${y}:-0:60:3/1`, budynek: `px:${x}:${y}:-0:60:3` },
      { ...K1, klucz: `px:${x}.5:${y}:-100:60:3/1`, budynek: `px:${x}.5:${y}:-100:60:3` },
      { ...K1, budynek: 'drop table' },
      { ...K1, lat: 91 },
      { ...K1, lat: '54.4' },
      { ...K1, klucz: `${BUD}:${'1'.repeat(90)}/1`, budynek: `${BUD}:${'1'.repeat(90)}` },
    ])
      expect((await a.zadanie('POST', '/api/klatki', zly)).status, JSON.stringify(zly)).toBe(400);
  });

  it('pozycja klatki musi leżeć przy budynku z klucza: cudzej klatki w innym mieście nie zajmie się z pozycją obok siebie', async () => {
    const s = await start();
    const gdansk = await druzyna(s, 'Gdanszczanie');
    const warszawa = await druzyna(s, 'Warszawiacy');
    expect((await gdansk.zadanie('POST', '/api/klatki', K1)).status).toBe(201);
    // siedziba drużyny z Warszawy (Ursynów)
    const ursynow = budynekW(52.144625, 21.0579432);
    const ich = klatka(ursynow, 1, 52.144625, 21.0579432, -15, 6);
    // drużyna z Gdańska próbuje zająć ją, podając pozycję obok swojej siedziby
    const podrobiona = await gdansk.zadanie('POST', '/api/klatki', { ...ich, lat: K1.lat, lon: K1.lon });
    expect(podrobiona.status).toBe(422);
    expect(podrobiona.body.blad).toBe('zla_pozycja');
    // z prawdziwą pozycją jest za daleko od ich siedziby
    expect((await gdansk.zadanie('POST', '/api/klatki', ich)).body.blad).toBe('za_daleko');
    // drużyna z Warszawy zajmuje swoją klatkę bez przeszkód i widzi ją na mapie
    expect((await warszawa.zadanie('POST', '/api/klatki', ich)).status).toBe(201);
    // numer klatki nie może przekraczać tego, co mieści budynek tej wielkości
    const zaDuzyNumer = await warszawa.zadanie('POST', '/api/klatki', { ...ich, klucz: `${ursynow}/99` });
    expect(zaDuzyNumer.status).toBe(422);
    // pozycja tuż obok budynku (w zapasie 50 m) przechodzi
    expect(
      (await warszawa.zadanie('POST', '/api/klatki', { ...klatka(ursynow, 2, 52.144625, 21.0579432, 60, 30) })).status,
    ).toBe(201);
    expect(wiersze(s, 'SELECT klucz FROM klatki ORDER BY klucz').length).toBe(3);
  });

  it('zwolnienie: tylko własnej klatki; siedziba przechodzi na najstarszą; zwolnienie wszystkich', async () => {
    const s = await start();
    const a = await druzyna(s, 'Wlasciciele');
    const b = await druzyna(s, 'Obcy');
    await a.zadanie('POST', '/api/klatki', K1);
    s.czekaj(1000);
    await a.zadanie('POST', '/api/klatki', K2);
    s.czekaj(1000);
    await a.zadanie('POST', '/api/klatki', { ...K2, klucz: `${BUD}/3` });
    const url = (k: string) => `/api/klatki/${encodeURIComponent(k)}`;
    const obcy = await b.zadanie('DELETE', url(K1.klucz));
    expect(obcy.status).toBe(404);
    expect(obcy.body.blad).toBe('nie_ma');
    expect((await a.zadanie('DELETE', url(K1.klucz))).status).toBe(204);
    const moje = (await a.zadanie('GET', '/api/klatki/moje')).body.klatki;
    expect(moje.map((k: { klucz: string; siedziba: boolean }) => [k.klucz, k.siedziba])).toEqual([
      [K2.klucz, true],
      [`${BUD}/3`, false],
    ]);
    expect((await a.zadanie('DELETE', url(K1.klucz))).status).toBe(404);
    expect((await a.zadanie('DELETE', '/api/klatki/nie%ZZ')).status).toBe(404);
    expect((await a.zadanie('DELETE', url('nie-klucz'))).status).toBe(400);
    expect((await a.zadanie('DELETE', '/api/klatki/moje')).status).toBe(204);
    expect((await a.zadanie('GET', '/api/klatki/moje')).body.klatki).toEqual([]);
    // po zwolnieniu wszystkiego nowa klatka znów jest siedzibą, nawet daleko od starej
    const nowa = await a.zadanie('POST', '/api/klatki', klatka(budynekW(52.1, 21), 1, 52.1, 21, -10, 5));
    expect(nowa.status).toBe(201);
    expect(nowa.body.klatka.siedziba).toBe(true);
  });
});

describe('serwer gry: zapis w chmurze', () => {
  const zapisGry = (dzien: number) => ({
    v: 1,
    at: dzien,
    data: { name: 'Przymorze', src: 'mvt', geo: { c: [54.4093, 18.5991], b: [] } },
    sim: { v: 3, tick: dzien * 19200, ludzie: Array.from({ length: 50 }, (_, i) => ({ id: i, imie: 'Marek' })) },
  });

  it('zapis, odczyt, wersje: nieaktualna wersja to 409, bez wersji nadpisuje; zapis skompresowany', async () => {
    const s = await start();
    const a = await druzyna(s, 'Zapisujacy');
    expect((await a.zadanie('GET', '/api/zapis')).status).toBe(404);
    const r1 = await a.zadanie('PUT', '/api/zapis', { dane: zapisGry(1), wersja: 0 });
    expect(r1.status).toBe(200);
    expect(r1.body).toEqual({ wersja: 1, zmieniony: s.teraz(), rozmiar: JSON.stringify(zapisGry(1)).length });
    const g = await a.zadanie('GET', '/api/zapis');
    expect(g.body).toEqual({ dane: zapisGry(1), wersja: 1, zmieniony: s.teraz(), rozmiar: r1.body.rozmiar });
    expect((await a.zadanie('GET', '/api/konto')).body.zapis).toBe(true);
    // drugi komputer z wersją 0 nie nadpisze nowszego zapisu
    const stary = await a.zadanie('PUT', '/api/zapis', { dane: zapisGry(2), wersja: 0 });
    expect(stary.status).toBe(409);
    expect(stary.body).toMatchObject({ blad: 'konflikt_wersji', wersja: 1 });
    expect((await a.zadanie('PUT', '/api/zapis', { dane: zapisGry(2), wersja: 1 })).body.wersja).toBe(2);
    expect((await a.zadanie('PUT', '/api/zapis', { dane: zapisGry(3) })).body.wersja).toBe(3);
    expect((await a.zadanie('GET', '/api/zapis')).body.dane).toEqual(zapisGry(3));
    // w bazie gzip, mniejszy niż JSON
    const [w] = wiersze(s, 'SELECT dane, rozmiar FROM zapisy');
    const dane = w.dane as Uint8Array;
    expect(dane.length).toBeLessThan(Number(w.rozmiar) / 3);
    expect(JSON.parse(gunzipSync(dane).toString('utf8'))).toEqual(zapisGry(3));
    // cudzy zapis niedostępny, własny da się usunąć
    const b = await druzyna(s, 'Ciekawski');
    expect((await b.zadanie('GET', '/api/zapis')).status).toBe(404);
    expect((await a.zadanie('DELETE', '/api/zapis')).status).toBe(204);
    expect((await a.zadanie('GET', '/api/zapis')).status).toBe(404);
  });

  it('po usunięciu zapisu wersja rośnie dalej: stary telefon nie nadpisze nowej gry', async () => {
    const s = await start();
    const a = await druzyna(s, 'Dwa_urzadzenia');
    expect((await a.zadanie('PUT', '/api/zapis', { dane: zapisGry(1), wersja: 0 })).body.wersja).toBe(1);
    expect((await a.zadanie('DELETE', '/api/zapis')).status).toBe(204);
    expect((await a.zadanie('GET', '/api/zapis')).status).toBe(404);
    expect((await a.zadanie('GET', '/api/konto')).body.zapis).toBe(false);
    // telefon pamięta wersję 1 sprzed usunięcia
    const stary = await a.zadanie('PUT', '/api/zapis', { dane: zapisGry(5), wersja: 1 });
    expect(stary.status).toBe(409);
    expect(stary.body.wersja).toBe(2);
    expect((await a.zadanie('PUT', '/api/zapis', { dane: zapisGry(2), wersja: 2 })).body.wersja).toBe(3);
    expect((await a.zadanie('GET', '/api/zapis')).body.dane).toEqual(zapisGry(2));
  });

  it('konto usunięte w trakcie wysyłania zapisu: zapis przepada, a nowe konto nie dostaje starego numeru', async () => {
    const s = await start();
    const komputer = await druzyna(s, 'Ofiara');
    const telefon = przegladarka(s.adres);
    await telefon.zadanie('POST', '/api/sesja', { nick: 'Ofiara', haslo: 'Ofiara-haslo-123' });
    const idOfiary = Number(wiersze(s, 'SELECT id FROM konta')[0].id);
    // telefon wysyła zapis powoli: najpierw nagłówki i kawałek ciała
    const cialo = JSON.stringify({ dane: zapisGry(1) });
    const u = new URL(`${s.adres}/api/zapis`);
    let dokoncz = () => {};
    const wynik = new Promise<number>((ok, zle) => {
      const req = http.request(
        {
          host: u.hostname,
          port: u.port,
          path: u.pathname,
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(cialo),
            Cookie: telefon.ciasteczko,
          },
        },
        (res) => {
          res.resume();
          ok(res.statusCode ?? 0);
        },
      );
      req.on('error', zle);
      req.write(cialo.slice(0, 20));
      dokoncz = () => req.end(cialo.slice(20));
    });
    // serwer dostał już nagłówki i kawałek ciała pierwszego zapisu
    await new Promise((r) => setTimeout(r, 50));
    // drugi zapis z tego samego konta w tym czasie: 429, jeden naraz
    const drugi = await telefon.zadanie('PUT', '/api/zapis', { dane: zapisGry(2) });
    expect(drugi.status).toBe(429);
    // w tym czasie konto znika, a ktoś zakłada nowe
    expect((await komputer.zadanie('DELETE', '/api/konto', { haslo: 'Ofiara-haslo-123' })).status).toBe(204);
    const obcy = await druzyna(s, 'Obcy_nowy');
    const idObcego = Number(wiersze(s, 'SELECT id FROM konta')[0].id);
    expect(idObcego).toBeGreaterThan(idOfiary);
    dokoncz();
    expect(await wynik).toBe(401);
    expect((await obcy.zadanie('GET', '/api/zapis')).status).toBe(404);
    expect(wiersze(s, 'SELECT konto FROM zapisy')).toEqual([]);
  });

  it('zapis bez tekstu adresu, tylko obiekt, z limitem rozmiaru', async () => {
    const s = await start({ limitZapisu: 20_000 });
    const a = await druzyna(s, 'Ostrozni');
    const zAdresem = { ...zapisGry(1), data: { ...zapisGry(1).data, addr: 'Obrońców Wybrzeża 4, Gdańsk' } };
    const r = await a.zadanie('PUT', '/api/zapis', { dane: zAdresem });
    expect(r.status).toBe(422);
    expect(r.body.blad).toBe('adres_w_zapisie');
    const zUlica = { ...zapisGry(1), data: { ...zapisGry(1).data, street: 'Obrońców Wybrzeża' } };
    expect((await a.zadanie('PUT', '/api/zapis', { dane: zUlica })).status).toBe(422);
    expect((await a.zadanie('PUT', '/api/zapis', { dane: [1, 2] })).status).toBe(400);
    expect((await a.zadanie('PUT', '/api/zapis', { dane: zapisGry(1), wersja: -1 })).status).toBe(400);
    const duzy = { ...zapisGry(1), smieci: 'x'.repeat(21_000) };
    const zaDuzy = await a.zadanie('PUT', '/api/zapis', { dane: duzy });
    expect(zaDuzy.status).toBe(413);
    expect(zaDuzy.body.blad).toBe('za_duze');
    expect(wiersze(s, 'SELECT * FROM zapisy')).toEqual([]);
    expect((await przegladarka(s.adres).zadanie('PUT', '/api/zapis', { dane: zapisGry(1) })).status).toBe(401);
  });
});

describe('serwer gry: limity i obrona', () => {
  it('ciało żądania: małe żądania najwyżej 4 KiB, zły JSON to 400', async () => {
    const s = await start();
    const p = przegladarka(s.adres);
    const r = await p.zadanie('POST', '/api/konto', { nick: 'Duzy', haslo: 'x'.repeat(5000) });
    expect(r.status).toBe(413);
    expect(r.body.blad).toBe('za_duze');
    expect((await p.zadanie('POST', '/api/konto', '{"nick": ')).status).toBe(400);
    expect((await p.zadanie('POST', '/api/konto', '[1]')).status).toBe(400);
    // ciało bez Content-Length (strumień) też liczone
    const status = await new Promise<number>((ok, zle) => {
      const u = new URL(`${s.adres}/api/sesja`);
      const req = http.request(
        {
          host: u.hostname,
          port: u.port,
          path: u.pathname,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        (res) => {
          res.resume();
          ok(res.statusCode ?? 0);
        },
      );
      req.on('error', zle);
      req.write('{"nick":"');
      req.write('y'.repeat(6000));
      req.end('"}');
    });
    expect(status).toBe(413);
  });

  it('logowanie: najwyżej 10 nieudanych prób na IP w 15 minut, potem 429 z Retry-After', async () => {
    const s = await start();
    await przegladarka(s.adres).zadanie('POST', '/api/konto', DANE);
    const p = przegladarka(s.adres);
    for (let i = 0; i < 10; i++)
      expect((await p.zadanie('POST', '/api/sesja', { ...DANE, haslo: `zle-${i}-haslo` })).status).toBe(401);
    // dobre hasło też czeka: zgadujący nie dowie się, że trafił
    const r = await p.zadanie('POST', '/api/sesja', DANE);
    expect(r.status).toBe(429);
    expect(r.body.blad).toBe('za_duzo_prob');
    expect(Number(r.headers.get('retry-after'))).toBeGreaterThan(0);
    s.czekaj(15 * 60 * 1000);
    expect((await p.zadanie('POST', '/api/sesja', DANE)).status).toBe(200);
  });

  it('zakładanie kont: najwyżej 5 na IP na godzinę', async () => {
    const s = await start();
    for (let i = 0; i < 5; i++) await druzyna(s, `Gracz${i}`);
    const r = await przegladarka(s.adres).zadanie('POST', '/api/konto', { nick: 'Gracz5', haslo: 'Gracz5-haslo-123' });
    expect(r.status).toBe(429);
    s.czekaj(60 * 60 * 1000);
    expect(
      (await przegladarka(s.adres).zadanie('POST', '/api/konto', { nick: 'Gracz5', haslo: 'Gracz5-haslo-123' })).status,
    ).toBe(201);
  });

  it('sprawdzanie po kolei, czy nick ma konto: najwyżej 30 zajętych nicków na IP na godzinę', async () => {
    const s = await start();
    await druzyna(s, 'Jan_Kowalski');
    const p = przegladarka(s.adres);
    for (let i = 0; i < 30; i++)
      expect((await p.zadanie('POST', '/api/konto', { nick: 'jan_kowalski', haslo: `inne-haslo-${i}` })).status).toBe(
        409,
      );
    const r = await p.zadanie('POST', '/api/konto', { nick: 'Zupelnie_Nowy', haslo: 'inne-haslo-x' });
    expect(r.status).toBe(429);
    expect(r.body.blad).toBe('za_duzo_prob');
  });

  it('równoległe żądania nie obchodzą limitów: nowe konta, nieudane logowania, logowania na jeden nick', async () => {
    const s = await start();
    const ile = (rs: { status: number }[], st: number) => rs.filter((r) => r.status === st).length;
    const konta = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        przegladarka(s.adres).zadanie('POST', '/api/konto', { nick: `Rownolegly${i}`, haslo: `haslo-rownolegle-${i}` }),
      ),
    );
    expect(ile(konta, 201)).toBe(5);
    expect(ile(konta, 429)).toBe(15);
    expect(wiersze(s, 'SELECT id FROM konta')).toHaveLength(5);
    const proby = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        przegladarka(s.adres).zadanie('POST', '/api/sesja', { nick: 'Rownolegly0', haslo: `zle-haslo-${i}` }),
      ),
    );
    expect(ile(proby, 401)).toBe(10);
    expect(ile(proby, 429)).toBe(20);
    // dobre hasło z tego adresu też czeka
    expect(
      (await przegladarka(s.adres).zadanie('POST', '/api/sesja', { nick: 'Rownolegly0', haslo: 'haslo-rownolegle-0' }))
        .status,
    ).toBe(429);
    // jeden nick z wielu adresów (za zaufanym proxy): najwyżej 20 nieudanych prób na 15 minut
    const zaProxy = await start({ zaufaneProxy: true });
    await przegladarka(zaProxy.adres).zadanie('POST', '/api/konto', DANE);
    const zWielu = await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        przegladarka(zaProxy.adres, { 'X-Forwarded-For': `10.2.${i}.1` }).zadanie('POST', '/api/sesja', {
          nick: DANE.nick,
          haslo: `zle-haslo-${i}`,
        }),
      ),
    );
    expect(ile(zWielu, 401)).toBe(20);
    expect(ile(zWielu, 429)).toBe(20);
    const zNowego = await przegladarka(zaProxy.adres, { 'X-Forwarded-For': '10.3.0.1' }).zadanie(
      'POST',
      '/api/sesja',
      DANE,
    );
    expect(zNowego.status).toBe(429);
    zaProxy.czekaj(15 * 60 * 1000);
    expect(
      (await przegladarka(zaProxy.adres, { 'X-Forwarded-For': '10.3.0.1' }).zadanie('POST', '/api/sesja', DANE)).status,
    ).toBe(200);
  });

  it('IPv6: limity liczone po sieci /64, nie po pojedynczym adresie', async () => {
    expect(kluczIp('2001:db8:1:2::1')).toBe('2001:db8:1:2::/64');
    expect(kluczIp('2001:0db8:0001:0002:aaaa:bbbb:cccc:dddd')).toBe('2001:db8:1:2::/64');
    expect(kluczIp('::1')).toBe('0:0:0:0::/64');
    expect(kluczIp('::ffff:192.168.1.7')).toBe('192.168.1.7');
    expect(kluczIp('192.168.1.7')).toBe('192.168.1.7');
    const s = await start({ zaufaneProxy: true });
    await przegladarka(s.adres).zadanie('POST', '/api/konto', DANE);
    for (let i = 0; i < 10; i++)
      await przegladarka(s.adres, { 'X-Forwarded-For': `2001:db8:1:2::${i + 1}` }).zadanie('POST', '/api/sesja', {
        ...DANE,
        haslo: 'zle-haslo-xx',
      });
    expect(
      (await przegladarka(s.adres, { 'X-Forwarded-For': '2001:db8:1:2:ffff::7' }).zadanie('POST', '/api/sesja', DANE))
        .status,
    ).toBe(429);
    expect(
      (await przegladarka(s.adres, { 'X-Forwarded-For': '2001:db8:1:3::7' }).zadanie('POST', '/api/sesja', DANE))
        .status,
    ).toBe(200);
  });

  it('scrypt przez kolejkę: przy zalewie logowań pełna kolejka to 503, a nie zajęte wszystkie wątki', async () => {
    const s = await start({ scrypt: { naraz: 1, czeka: 2 }, zaufaneProxy: true });
    await przegladarka(s.adres).zadanie('POST', '/api/konto', DANE);
    const rs = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        przegladarka(s.adres, { 'X-Forwarded-For': `10.4.0.${i}` }).zadanie('POST', '/api/sesja', DANE),
      ),
    );
    const zajety = rs.filter((r) => r.status === 503);
    expect(zajety.length).toBeGreaterThan(0);
    expect(zajety[0].body.blad).toBe('serwer_zajety');
    expect(zajety[0].headers.get('retry-after')).toBe('5');
    expect(rs.filter((r) => r.status === 200).length).toBeGreaterThanOrEqual(3);
  });

  it('X-Forwarded-For liczy się tylko za zaufanym proxy', async () => {
    const zwykly = await start();
    await przegladarka(zwykly.adres).zadanie('POST', '/api/konto', DANE);
    for (let i = 0; i < 10; i++)
      await przegladarka(zwykly.adres, { 'X-Forwarded-For': `10.0.0.${i}` }).zadanie('POST', '/api/sesja', {
        ...DANE,
        haslo: 'zle-haslo-xx',
      });
    // podrobiony nagłówek nie omija limitu
    expect(
      (await przegladarka(zwykly.adres, { 'X-Forwarded-For': '10.0.0.99' }).zadanie('POST', '/api/sesja', DANE)).status,
    ).toBe(429);
    const zaProxy = await start({ zaufaneProxy: true });
    await przegladarka(zaProxy.adres).zadanie('POST', '/api/konto', DANE);
    for (let i = 0; i < 10; i++)
      await przegladarka(zaProxy.adres, { 'X-Forwarded-For': '1.2.3.4, 10.0.0.1' }).zadanie('POST', '/api/sesja', {
        ...DANE,
        haslo: 'zle-haslo-xx',
      });
    expect(
      (
        await przegladarka(zaProxy.adres, { 'X-Forwarded-For': '1.2.3.4, 10.0.0.1' }).zadanie(
          'POST',
          '/api/sesja',
          DANE,
        )
      ).status,
    ).toBe(429);
    // inny klient za tym samym proxy ma własny licznik (ostatni wpis to adres widziany przez proxy)
    expect(
      (await przegladarka(zaProxy.adres, { 'X-Forwarded-For': '10.0.0.2' }).zadanie('POST', '/api/sesja', DANE)).status,
    ).toBe(200);
  });

  it('CSRF: obcy Origin to 403, dane tylko jako application/json; zła ścieżka 404, zła metoda 405', async () => {
    const s = await start();
    const obca = przegladarka(s.adres, { Origin: 'https://zla-strona.example' });
    const r = await obca.zadanie('POST', '/api/konto', DANE);
    expect(r.status).toBe(403);
    expect(r.body.blad).toBe('obce_zrodlo');
    const swoja = przegladarka(s.adres, { Origin: s.adres });
    expect((await swoja.zadanie('POST', '/api/konto', DANE)).status).toBe(201);
    // formularz z innej strony wysłałby text/plain albo x-www-form-urlencoded
    const formularz = await swoja.zadanie('POST', '/api/klatki', JSON.stringify(K1), { 'Content-Type': 'text/plain' });
    expect(formularz.status).toBe(415);
    expect(formularz.body.blad).toBe('zly_typ');
    expect((await swoja.zadanie('POST', '/api/klatki', K1)).status).toBe(201);
    // obcy Origin nie zwolni cudzej klatki nawet z ciasteczkiem ofiary
    const zCiasteczkiem = przegladarka(s.adres, { Origin: 'https://zla-strona.example' });
    zCiasteczkiem.ciasteczko = swoja.ciasteczko;
    expect((await zCiasteczkiem.zadanie('DELETE', '/api/klatki/moje')).status).toBe(403);
    expect((await swoja.zadanie('GET', '/api/klatki/moje')).body.klatki).toHaveLength(1);
    const brak = await swoja.zadanie('GET', '/api/nie-ma-takiego');
    expect(brak.status).toBe(404);
    expect(brak.body.blad).toBe('nie_ma');
    const metoda = await swoja.zadanie('PUT', '/api/konto', DANE);
    expect(metoda.status).toBe(405);
    expect(metoda.headers.get('allow')).toBe('POST, GET, DELETE');
    // z listą dozwolonych źródeł liczy się tylko lista
    const zLista = await start({ zrodla: ['https://zamurem.example'] });
    expect(
      (await przegladarka(zLista.adres, { Origin: zLista.adres }).zadanie('POST', '/api/konto', DANE)).status,
    ).toBe(403);
    expect(
      (await przegladarka(zLista.adres, { Origin: 'https://zamurem.example' }).zadanie('POST', '/api/konto', DANE))
        .status,
    ).toBe(201);
  });
});

describe('serwer gry: części', () => {
  it('scrypt z domyślnym kosztem: dobre hasło przechodzi, złe nie, skrót za każdym razem inny', async () => {
    const a = await skrotHasla('hasło z polskimi znakami ąę', DOMYSLNE_HASLO);
    const b = await skrotHasla('hasło z polskimi znakami ąę', DOMYSLNE_HASLO);
    expect(a).not.toBe(b);
    expect(a.startsWith('scrypt$15$8$1$')).toBe(true);
    expect(await sprawdzHaslo('hasło z polskimi znakami ąę', a)).toBe(true);
    expect(await sprawdzHaslo('hasło z polskimi znakami ae', a)).toBe(false);
    expect(await sprawdzHaslo('cokolwiek', 'zepsuty-skrot')).toBe(false);
    expect(await sprawdzHaslo('cokolwiek', 'scrypt$40$8$1$AA$AA')).toBe(false);
  });

  it('kolejka: najwyżej tyle zadań naraz, ile pozwala, reszta czeka, nadmiar dostaje odmowę', async () => {
    const q = kolejka(2, 2);
    let naraz = 0;
    let najwiecej = 0;
    const zwolnij: (() => void)[] = [];
    const zadanie = () =>
      q.przez(async () => {
        naraz++;
        najwiecej = Math.max(najwiecej, naraz);
        await new Promise<void>((ok) => zwolnij.push(ok));
        naraz--;
      });
    const wyniki = Array.from({ length: 5 }, () =>
      zadanie().then(
        () => 'ok',
        (e) => (e instanceof PelnaKolejka ? 'pelna' : 'blad'),
      ),
    );
    await Promise.resolve();
    expect(q.wToku).toBe(2);
    expect(q.czekajacych).toBe(2);
    // kolejne zwolnienia przepuszczają czekające po jednym, nigdy więcej niż dwa naraz
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 1));
      zwolnij.shift()?.();
    }
    expect(await Promise.all(wyniki)).toEqual(['ok', 'ok', 'ok', 'ok', 'pelna']);
    expect(najwiecej).toBe(2);
    expect(q.wToku).toBe(0);
  });

  it('okno limitu: liczy w oknie czasu, potem zapomina', () => {
    let t = 0;
    const o = okno(3, 1000, () => t);
    expect([o.dolicz('a'), o.dolicz('a'), o.zablokowany('a')]).toEqual([0, 0, 0]);
    expect(o.dolicz('a')).toBe(1);
    expect(o.zablokowany('a')).toBe(1);
    expect(o.zablokowany('b')).toBe(0);
    t = 1000;
    expect(o.zablokowany('a')).toBe(0);
    o.dolicz('c');
    t = 2500;
    o.sprzataj();
    expect(o.rozmiar).toBe(0);
  });

  it('baza w pliku: schemat zakłada się raz, drugi start widzi te same dane, nowsza baza to błąd', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'za-murem-'));
    const plik = path.join(dir, 'gra.db');
    try {
      const b1 = otworzBaze(plik);
      expect(b1.dodajKonto('Ktos', 'ktos', 'scrypt$x', 1)).not.toBeNull();
      b1.zamknij();
      const b2 = otworzBaze(plik);
      expect(b2.kontoPoNicku('ktos')?.nick).toBe('Ktos');
      expect(b2.dodajKonto('KTOS', 'ktos', 'scrypt$y', 2)).toBeNull();
      b2.db.exec('PRAGMA user_version = 99');
      b2.zamknij();
      expect(() => otworzBaze(plik)).toThrow(/wersji 99/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
