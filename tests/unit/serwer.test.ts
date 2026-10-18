import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { otworzBaze } from '../../server/baza.ts';
import { DOMYSLNE_HASLO, skrotHasla, sprawdzHaslo } from '../../server/hasla.ts';
import { okno } from '../../server/limity.ts';
import { przegladarka, type SerwerTestowy, serwerTestowy } from './serwer-pomoc.ts';

const DOBA = 24 * 60 * 60 * 1000;
const DANE = { nick: 'Mateusz_test', haslo: 'bardzo-tajne-1' };
/** blok na Przymorzu: klucz z src/world/klucze.ts i środki dwóch klatek */
const BUD = 'px:37021580:21416944:-325:163';
const K1 = { klucz: `${BUD}/1`, budynek: BUD, lat: 54.409301, lon: 18.598812 };
const K2 = { klucz: `${BUD}/2`, budynek: BUD, lat: 54.409362, lon: 18.599105 };

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
    expect(r.body).toEqual({ ok: true, gra: 'za-murem', wersja: 1 });
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
    expect(r.body.klatka).toEqual({ ...K1, lat: 54.4093, lon: 18.59881, moja: true, siedziba: true });
    // to samo jeszcze raz: bez zmian, bez błędu
    expect((await a.zadanie('POST', '/api/klatki', K1)).status).toBe(200);
    const konflikt = await b.zadanie('POST', '/api/klatki', K1);
    expect(konflikt.status).toBe(409);
    expect(konflikt.body.blad).toBe('zajeta');
    expect(konflikt.tekst).not.toContain('Pierwsi');
    const q = '/api/klatki?s=54.40&w=18.59&n=54.42&e=18.61';
    const widokB = await b.zadanie('GET', q);
    expect(widokB.body).toEqual({ klatki: [{ ...K1, lat: 54.4093, lon: 18.59881, moja: false }] });
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
    const daleko = { klucz: 'px:1:2:3:4/1', budynek: 'px:1:2:3:4', lat: 54.4097, lon: 18.5995 };
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
    const za = { klucz: 'px:9:9:1:1/1', budynek: 'px:9:9:1:1', lat: 54.409301, lon: 18.6094 };
    const r = await a.zadanie('POST', '/api/klatki', za);
    expect(r.status).toBe(422);
    expect(r.body.blad).toBe('za_daleko');
    expect((await a.zadanie('POST', '/api/klatki', K2)).status).toBe(201);
    expect((await a.zadanie('POST', '/api/klatki', { ...K2, klucz: `${BUD}/3` })).status).toBe(201);
    const limit = await a.zadanie('POST', '/api/klatki', { ...K2, klucz: `${BUD}/4` });
    expect(limit.status).toBe(403);
    expect(limit.body.blad).toBe('limit_klatek');
    for (const zly of [
      { ...K1, klucz: 'px:1:2:3:4/1' },
      { ...K1, klucz: `${BUD}/0` },
      { ...K1, klucz: `${BUD}/1/2` },
      { ...K1, budynek: 'drop table' },
      { ...K1, lat: 91 },
      { ...K1, lat: '54.4' },
      { ...K1, klucz: `${BUD}:${'1'.repeat(90)}/1`, budynek: `${BUD}:${'1'.repeat(90)}` },
    ])
      expect((await a.zadanie('POST', '/api/klatki', zly)).status, JSON.stringify(zly)).toBe(400);
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
    const nowa = await a.zadanie('POST', '/api/klatki', {
      klucz: 'px:9:9:1:1/1',
      budynek: 'px:9:9:1:1',
      lat: 52.1,
      lon: 21,
    });
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
