/* Drużyna anonimowa i kod powrotu na serwerze (server/app.ts, server/baza.ts, server/hasla.ts, src/net/protokol.ts):
   POST /api/druzyna zakłada drużynę bez nicku i hasła, POST /api/druzyna/kod daje kod powrotu, POST
   /api/druzyna/powrot wpuszcza z innej przeglądarki, a DELETE /api/konto usuwa drużynę anonimową bez hasła.
   Serwer w procesie testu jak w serwer.test.ts (tests/unit/serwer-pomoc.ts). */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { MIGRACJE, otworzBaze } from '../../server/baza.ts';
import { nowyKod, skrotHasla, skrotTokenu } from '../../server/hasla.ts';
import { KOD_ALFABET, normalizujKod } from '../../src/net/protokol.ts';
import { pikselZ } from '../../src/world/klucze.ts';
import { przegladarka, type SerwerTestowy, serwerTestowy } from './serwer-pomoc.ts';

const MIN = 60_000;
const GODZ = 60 * MIN;
const WZOR_KODU = /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

/** blok na Przymorzu i jedna jego klatka (jak w serwer.test.ts: pozycja przy najwyższym wierzchołku budynku) */
const [bx, by] = pikselZ(54.40939, 18.59923).map(Math.round);
const BUD = `px:${bx}:${by}:-100:60:3`;
const K1 = { klucz: `${BUD}/1`, budynek: BUD, lat: 54.40939 - 10 / 110574, lon: 18.59923 - 27 / 65000 };

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

/** nowa przeglądarka z założoną drużyną anonimową */
async function nowaDruzyna(s: SerwerTestowy, naglowki: Record<string, string> = {}) {
  const p = przegladarka(s.adres, naglowki);
  const r = await p.zadanie('POST', '/api/druzyna', {});
  expect(r.status, r.tekst).toBe(201);
  return { p, ja: r.body as { znak: string } };
}

describe('serwer gry: drużyna anonimowa', () => {
  it('POST /api/druzyna zakłada drużynę bez nicku i loguje; drugi raz z tą samą sesją nie zakłada nowej', async () => {
    const s = await start();
    const p = przegladarka(s.adres);
    const r = await p.zadanie('POST', '/api/druzyna', {});
    expect(r.status).toBe(201);
    expect(r.body).toEqual({
      nick: null,
      utworzone: s.teraz(),
      klatki: 0,
      zapis: false,
      anonimowe: true,
      znak: expect.stringMatching(/^#\d+$/),
      kod: false,
    });
    const c = r.headers.getSetCookie()[0];
    expect(c).toMatch(/^zm_sesja=[A-Za-z0-9_-]{43}; /);
    for (const a of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/api']) expect(c).toContain(a);
    // w bazie: pusty nick i hasło, klucz nicku nie do trafienia z formularza, bez kodu
    const [konto] = wiersze(s, 'SELECT * FROM konta');
    expect(konto).toMatchObject({ nick: '', haslo: '', anonimowe: 1, kod: null });
    expect(String(konto.nick_klucz)).toMatch(/^#[A-Za-z0-9_-]{43}$/);
    expect(r.body.znak).toBe(`#${konto.id}`);

    const ja = await p.zadanie('GET', '/api/konto');
    expect(ja.status).toBe(200);
    expect(ja.body).toEqual(r.body);
    const drugi = await p.zadanie('POST', '/api/druzyna', {});
    expect(drugi.status).toBe(200);
    expect(drugi.body.znak).toBe(r.body.znak);
    expect(wiersze(s, 'SELECT id FROM konta')).toHaveLength(1);
    expect(wiersze(s, 'SELECT skrot FROM sesje')).toHaveLength(1);

    // zepsute ciasteczko to brak sesji: nowa drużyna i nowe ciasteczko
    p.ciasteczko = 'zm_sesja=podrobione';
    const nowa = await p.zadanie('POST', '/api/druzyna', {});
    expect(nowa.status).toBe(201);
    expect(nowa.body.znak).not.toBe(r.body.znak);
    expect(p.ciasteczko).toMatch(/^zm_sesja=[A-Za-z0-9_-]{43}$/);
    expect(wiersze(s, 'SELECT id FROM konta')).toHaveLength(2);
  });

  it('żądanie z obcej strony albo bez JSON-a nie zakłada drużyny', async () => {
    const s = await start();
    const p = przegladarka(s.adres);
    expect((await p.zadanie('POST', '/api/druzyna', {}, { Origin: 'https://obca.example' })).status).toBe(403);
    expect((await p.zadanie('POST', '/api/druzyna')).status).toBe(415);
    expect((await p.zadanie('GET', '/api/druzyna')).status).toBe(405);
    expect(wiersze(s, 'SELECT id FROM konta')).toHaveLength(0);
  });

  it('dwadzieścia drużyn z jednego IP w kwadrans przechodzi, trzydziesta pierwsza w godzinę dostaje 429', async () => {
    const s = await start({ zaufaneProxy: true });
    const ip = { 'X-Forwarded-For': '10.7.0.1' };
    const pierwsza = await nowaDruzyna(s, ip);
    for (let i = 1; i < 20; i++) {
      s.czekaj(30_000);
      await nowaDruzyna(s, ip);
    }
    expect(s.teraz() - Date.UTC(2026, 9, 18, 2, 0, 0)).toBeLessThan(15 * MIN);
    for (let i = 20; i < 30; i++) {
      s.czekaj(60_000);
      await nowaDruzyna(s, ip);
    }
    const r = await przegladarka(s.adres, ip).zadanie('POST', '/api/druzyna', {});
    expect(r.status).toBe(429);
    expect(r.body.blad).toBe('za_duzo_prob');
    expect(Number(r.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(wiersze(s, 'SELECT id FROM konta')).toHaveLength(30);
    // ważna sesja nie zakłada nowej drużyny, więc limit jej nie dotyczy
    expect((await pierwsza.p.zadanie('POST', '/api/druzyna', {})).status).toBe(200);
    // inne IP nie jest blokowane, a po godzinie od pierwszej drużyny okno się zamyka
    expect((await nowaDruzyna(s, { 'X-Forwarded-For': '10.7.0.2' })).ja.znak).toMatch(/^#\d+$/);
    s.czekaj(GODZ);
    expect((await przegladarka(s.adres, ip).zadanie('POST', '/api/druzyna', {})).status).toBe(201);
  });

  it('równoległe żądania nie obchodzą limitu drużyn', async () => {
    const s = await start();
    const rs = await Promise.all(
      Array.from({ length: 40 }, () => przegladarka(s.adres).zadanie('POST', '/api/druzyna', {})),
    );
    expect(rs.filter((r) => r.status === 201)).toHaveLength(30);
    expect(rs.filter((r) => r.status === 429)).toHaveLength(10);
    expect(wiersze(s, 'SELECT id FROM konta')).toHaveLength(30);
  });

  it('kod powrotu: nowy kod działa w drugiej przeglądarce, stary po wymianie już nie; pierwsza sesja działa dalej', async () => {
    const s = await start();
    const { p: pierwsza, ja } = await nowaDruzyna(s);
    // klatka i zapis w chmurze należą do drużyny, nie do przeglądarki
    expect((await pierwsza.zadanie('POST', '/api/klatki', K1)).status).toBe(201);
    expect((await pierwsza.zadanie('PUT', '/api/zapis', { dane: { v: 1, data: { name: 'Przymorze' } } })).status).toBe(
      200,
    );

    expect((await przegladarka(s.adres).zadanie('POST', '/api/druzyna/kod', {})).status).toBe(401);
    const k1 = await pierwsza.zadanie('POST', '/api/druzyna/kod', {});
    expect(k1.status).toBe(200);
    const kod = k1.body.kod as string;
    expect(kod).toMatch(WZOR_KODU);
    expect((await pierwsza.zadanie('GET', '/api/konto')).body.kod).toBe(true);

    // druga przeglądarka: kod małymi literami i ze spacjami zamiast myślników
    const druga = przegladarka(s.adres);
    const wejscie = await druga.zadanie('POST', '/api/druzyna/powrot', { kod: kod.toLowerCase().replaceAll('-', ' ') });
    expect(wejscie.status, wejscie.tekst).toBe(200);
    expect(wejscie.body).toMatchObject({
      znak: ja.znak,
      nick: null,
      anonimowe: true,
      klatki: 1,
      zapis: true,
      kod: true,
    });
    expect(druga.ciasteczko).toMatch(/^zm_sesja=/);
    expect(druga.ciasteczko).not.toBe(pierwsza.ciasteczko);
    expect((await druga.zadanie('GET', '/api/klatki/moje')).body.klatki).toHaveLength(1);
    expect((await druga.zadanie('GET', '/api/zapis')).body.dane).toEqual({ v: 1, data: { name: 'Przymorze' } });
    expect(wiersze(s, 'SELECT skrot FROM sesje')).toHaveLength(2);
    expect(wiersze(s, 'SELECT id FROM konta')).toHaveLength(1);

    // wymiana kodu: stary przestaje działać, nowy działa, obie sesje żyją
    const k2 = await pierwsza.zadanie('POST', '/api/druzyna/kod', {});
    expect(k2.status).toBe(200);
    expect(k2.body.kod).toMatch(WZOR_KODU);
    expect(k2.body.kod).not.toBe(kod);
    const trzecia = przegladarka(s.adres);
    const stary = await trzecia.zadanie('POST', '/api/druzyna/powrot', { kod });
    expect(stary.status).toBe(401);
    expect(stary.body.blad).toBe('zly_kod');
    expect(trzecia.ciasteczko).toBe('');
    expect((await trzecia.zadanie('POST', '/api/druzyna/powrot', { kod: k2.body.kod })).status).toBe(200);
    expect((await pierwsza.zadanie('GET', '/api/konto')).status).toBe(200);
    expect((await druga.zadanie('GET', '/api/konto')).status).toBe(200);
  });

  it('kod powrotu: brak kodu albo zły kształt to błąd, najwyżej 10 nowych kodów na godzinę na drużynę', async () => {
    const s = await start();
    const { p } = await nowaDruzyna(s);
    const inna = await nowaDruzyna(s);
    const bez = przegladarka(s.adres);
    for (const cialo of [{}, { kod: 12 }, { kod: null }, []]) {
      const r = await bez.zadanie('POST', '/api/druzyna/powrot', cialo);
      expect(r.status, JSON.stringify(cialo)).toBe(400);
      expect(r.body.blad).toBe('zle_dane');
    }
    // kod w złym kształcie to po prostu zły kod
    for (const kod of ['', 'abc', '0000-0000-0000', 'AAAA-AAAA-AAAA-AAAA', 'x'.repeat(500)]) {
      const r = await bez.zadanie('POST', '/api/druzyna/powrot', { kod });
      expect(r.status, kod).toBe(401);
      expect(r.body.blad).toBe('zly_kod');
    }
    // dobry kod z doklejonym śmieciem nie przechodzi (bez obcinania długiego tekstu)
    const prawdziwy = (await inna.p.zadanie('POST', '/api/druzyna/kod', {})).body.kod as string;
    const smiec = await bez.zadanie('POST', '/api/druzyna/powrot', { kod: `${prawdziwy}${' '.repeat(80)}x` });
    expect(smiec.status).toBe(401);
    expect(smiec.body.blad).toBe('zly_kod');
    for (let i = 0; i < 10; i++) expect((await p.zadanie('POST', '/api/druzyna/kod', {})).status).toBe(200);
    const r = await p.zadanie('POST', '/api/druzyna/kod', {});
    expect(r.status).toBe(429);
    expect(r.body.blad).toBe('za_duzo_prob');
    // limit jest na drużynę, nie na IP
    expect((await inna.p.zadanie('POST', '/api/druzyna/kod', {})).status).toBe(200);
    s.czekaj(GODZ);
    expect((await p.zadanie('POST', '/api/druzyna/kod', {})).status).toBe(200);
  });

  it('zły kod liczy się do limitu nieudanych prób z IP (10 na 15 minut), dobry nie', async () => {
    const s = await start();
    const { p } = await nowaDruzyna(s);
    const kod = (await p.zadanie('POST', '/api/druzyna/kod', {})).body.kod as string;
    const obca = nowyKod();
    const bez = przegladarka(s.adres);
    // dobre kody nie zużywają limitu
    for (let i = 0; i < 15; i++) expect((await bez.zadanie('POST', '/api/druzyna/powrot', { kod })).status).toBe(200);
    for (let i = 0; i < 9; i++)
      expect((await bez.zadanie('POST', '/api/druzyna/powrot', { kod: obca })).status).toBe(401);
    expect((await bez.zadanie('POST', '/api/druzyna/powrot', { kod })).status).toBe(200);
    expect((await bez.zadanie('POST', '/api/druzyna/powrot', { kod: obca })).status).toBe(401);
    // dziesiąta zła próba zamknęła okno: teraz czeka nawet dobry kod
    const r = await bez.zadanie('POST', '/api/druzyna/powrot', { kod });
    expect(r.status).toBe(429);
    expect(r.body.blad).toBe('za_duzo_prob');
    expect(Number(r.headers.get('retry-after'))).toBeGreaterThan(0);
    s.czekaj(15 * MIN);
    expect((await bez.zadanie('POST', '/api/druzyna/powrot', { kod })).status).toBe(200);
  });

  it('równoległe zgadywanie kodu nie obchodzi limitu', async () => {
    const s = await start();
    const rs = await Promise.all(
      Array.from({ length: 25 }, () =>
        przegladarka(s.adres).zadanie('POST', '/api/druzyna/powrot', { kod: nowyKod() }),
      ),
    );
    expect(rs.filter((r) => r.status === 401)).toHaveLength(10);
    expect(rs.filter((r) => r.status === 429)).toHaveLength(15);
  });

  it('w bazie jest tylko skrót kodu, a logowanie nickiem nie trafia w drużynę anonimową', async () => {
    const s = await start();
    const { p } = await nowaDruzyna(s);
    const kod = (await p.zadanie('POST', '/api/druzyna/kod', {})).body.kod as string;
    const [konto] = wiersze(s, 'SELECT * FROM konta');
    expect(konto.kod).not.toBe(kod);
    expect(konto.kod).not.toBe(normalizujKod(kod));
    expect(String(konto.kod)).toMatch(/^[0-9a-f]{64}$/);
    expect(konto.kod).toBe(skrotTokenu(normalizujKod(kod) as string));
    expect(JSON.stringify(wiersze(s, 'SELECT * FROM konta'))).not.toContain(normalizujKod(kod) as string);

    const bez = przegladarka(s.adres);
    for (const cialo of [
      { nick: '#1', haslo: '' },
      { nick: konto.nick_klucz, haslo: '' },
      { nick: '', haslo: '' },
      { nick: konto.nick_klucz, haslo: 'cokolwiek-12345' },
    ]) {
      const r = await bez.zadanie('POST', '/api/sesja', cialo);
      expect([400, 401], JSON.stringify(cialo)).toContain(r.status);
      expect(bez.ciasteczko).toBe('');
    }
    // nick z '#' na początku nie przejdzie założenia konta, więc nikt nie zajmie klucza drużyny anonimowej
    const nick = await bez.zadanie('POST', '/api/konto', { nick: '#1', haslo: 'dobre-haslo-9' });
    expect(nick.body.blad).toBe('zly_nick');
  });

  it('konto z nickiem też może mieć kod powrotu; Ja ma jego nick jako znak', async () => {
    const s = await start();
    const p = przegladarka(s.adres);
    const zalozone = await p.zadanie('POST', '/api/konto', { nick: 'Z_nickiem', haslo: 'z-nickiem-123' });
    expect(zalozone.body).toMatchObject({ nick: 'Z_nickiem', anonimowe: false, znak: 'Z_nickiem', kod: false });
    const kod = (await p.zadanie('POST', '/api/druzyna/kod', {})).body.kod as string;
    const druga = przegladarka(s.adres);
    const r = await druga.zadanie('POST', '/api/druzyna/powrot', { kod });
    expect(r.body).toMatchObject({ nick: 'Z_nickiem', anonimowe: false, znak: 'Z_nickiem', kod: true });
    // POST /api/druzyna z ważną sesją konta z nickiem oddaje to konto, nie zakłada nowego
    const jeszcze = await p.zadanie('POST', '/api/druzyna', {});
    expect(jeszcze.status).toBe(200);
    expect(jeszcze.body.znak).toBe('Z_nickiem');
    expect(wiersze(s, 'SELECT id FROM konta')).toHaveLength(1);
  });

  it('drużyna anonimowa usuwa się bez hasła; konto z nickiem dalej wymaga hasła', async () => {
    const s = await start();
    const { p, ja } = await nowaDruzyna(s);
    expect((await p.zadanie('POST', '/api/klatki', K1)).status).toBe(201);
    expect((await p.zadanie('PUT', '/api/zapis', { dane: { v: 1 } })).status).toBe(200);
    const kod = (await p.zadanie('POST', '/api/druzyna/kod', {})).body.kod as string;
    const druga = przegladarka(s.adres);
    expect((await druga.zadanie('POST', '/api/druzyna/powrot', { kod })).status).toBe(200);

    const r = await p.zadanie('DELETE', '/api/konto');
    expect(r.status, r.tekst).toBe(204);
    expect(r.headers.getSetCookie()[0]).toContain('Max-Age=0');
    expect(p.ciasteczko).toBe('');
    for (const t of ['konta', 'sesje', 'zapisy']) expect(wiersze(s, `SELECT * FROM ${t}`), t).toEqual([]);
    expect(wiersze(s, 'SELECT * FROM klatki')).toEqual([]);
    // druga sesja i kod przepadły razem z drużyną, a numer drużyny nie wraca
    expect((await druga.zadanie('GET', '/api/konto')).body).toBeNull();
    expect((await przegladarka(s.adres).zadanie('POST', '/api/druzyna/powrot', { kod })).body.blad).toBe('zly_kod');
    expect((await nowaDruzyna(s)).ja.znak).not.toBe(ja.znak);

    // konto z nickiem: bez hasła, z pustym i ze złym hasłem nic się nie dzieje
    const n = przegladarka(s.adres);
    expect((await n.zadanie('POST', '/api/konto', { nick: 'Z_nickiem', haslo: 'z-nickiem-123' })).status).toBe(201);
    expect((await n.zadanie('DELETE', '/api/konto')).status).not.toBe(204);
    expect((await n.zadanie('DELETE', '/api/konto', {})).status).toBe(401);
    expect((await n.zadanie('DELETE', '/api/konto', { haslo: 'nie-to-haslo' })).status).toBe(401);
    expect(wiersze(s, "SELECT nick FROM konta WHERE nick = 'Z_nickiem'")).toHaveLength(1);
    expect((await n.zadanie('DELETE', '/api/konto', { haslo: 'z-nickiem-123' })).status).toBe(204);
    expect(wiersze(s, "SELECT nick FROM konta WHERE nick = 'Z_nickiem'")).toEqual([]);
  });
});

describe('protokół i baza: kod powrotu', () => {
  it('normalizujKod: małe litery, spacje i myślniki przechodzą, 0, O, 1, I i zła długość nie', () => {
    expect(KOD_ALFABET).toBe('ABCDEFGHJKLMNPQRSTUVWXYZ23456789');
    expect(normalizujKod('ABCD-EFGH-JKMN')).toBe('ABCDEFGHJKMN');
    expect(normalizujKod('abcd-efgh-jkmn')).toBe('ABCDEFGHJKMN');
    expect(normalizujKod('  abcd efgh   jkmn ')).toBe('ABCDEFGHJKMN');
    expect(normalizujKod('abcdefghjkmn')).toBe('ABCDEFGHJKMN');
    expect(normalizujKod('a-b-c-d-e-f-g-h-j-k-m-n')).toBe('ABCDEFGHJKMN');
    expect(normalizujKod('2345-6789-ZYXW')).toBe('23456789ZYXW');
    for (const zly of [
      '0BCD-EFGH-JKMN',
      'OBCD-EFGH-JKMN',
      '1BCD-EFGH-JKMN',
      'IBCD-EFGH-JKMN',
      'ABCD-EFGH-JKM',
      'ABCD-EFGH-JKMNP',
      '',
      '----',
      'ABCD-EFGH-JKM!',
      'ABCD-EFGH-JKMŁ',
      'ſBCD-EFGH-JKMN',
    ])
      expect(normalizujKod(zly), zly).toBeNull();
    expect(normalizujKod(12 as unknown as string)).toBeNull();
  });

  it('nowyKod: dwanaście znaków z alfabetu w trzech czwórkach, za każdym razem inny', () => {
    const kody = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const k = nowyKod();
      expect(k).toMatch(WZOR_KODU);
      expect(normalizujKod(k)).toBe(k.replaceAll('-', ''));
      kody.add(k);
    }
    expect(kody.size).toBe(500);
  });

  it('migracja 2 na bazie z migracji 1: stare konta zostają zwykłymi kontami, kod jest unikalny', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'za-murem-'));
    const plik = path.join(dir, 'gra.db');
    try {
      // baza w wersji 1, jaką zostawił poprzedni serwer, z kontem, sesją i klatką
      const stara = new DatabaseSync(plik);
      stara.exec(MIGRACJE[0]);
      stara.exec('PRAGMA user_version = 1');
      const haslo = await skrotHasla('stare-haslo-1', { logN: 10, r: 8, p: 1 });
      stara
        .prepare('INSERT INTO konta (nick, nick_klucz, haslo, utworzone, ostatnio) VALUES (?, ?, ?, ?, ?)')
        .run('Stary', 'stary', haslo, 5, 6);
      stara.prepare('INSERT INTO sesje (skrot, konto, utworzona, wygasa) VALUES (?, ?, ?, ?)').run('abc', 1, 5, 9e15);
      stara
        .prepare('INSERT INTO klatki (klucz, budynek, konto, lat, lon, siedziba, zajeta) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(K1.klucz, K1.budynek, 1, K1.lat, K1.lon, 1, 7);
      stara.close();

      const b = otworzBaze(plik);
      try {
        expect((b.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(
          MIGRACJE.length,
        );
        expect(MIGRACJE.length).toBeGreaterThanOrEqual(2);
        expect(b.kontoPoNicku('stary')).toEqual({
          id: 1,
          nick: 'Stary',
          haslo,
          utworzone: 5,
          ostatnio: 6,
          anonimowe: false,
          kod: null,
        });
        expect(b.sesja('abc', 8)?.konto.id).toBe(1);
        expect(b.klatka(K1.klucz)?.konto).toBe(1);
        // nowe zapytania
        const d1 = b.dodajDruzyne(10);
        const d2 = b.dodajDruzyne(11);
        expect(d1).toMatchObject({ nick: '', haslo: '', anonimowe: true, kod: null, utworzone: 10, ostatnio: 10 });
        expect(d1.id).not.toBe(d2.id);
        expect(b.konto(d1.id)?.anonimowe).toBe(true);
        b.ustawKod(d1.id, 'skrot-1');
        expect(b.kontoPoKodzie('skrot-1')?.id).toBe(d1.id);
        expect(b.kontoPoKodzie('skrot-2')).toBeNull();
        expect(() => b.ustawKod(d2.id, 'skrot-1')).toThrow();
        b.ustawKod(d1.id, 'skrot-3');
        expect(b.kontoPoKodzie('skrot-1')).toBeNull();
        b.ustawKod(d2.id, 'skrot-1');
        expect(b.kontoPoKodzie('skrot-1')?.id).toBe(d2.id);
      } finally {
        b.zamknij();
      }

      // cały serwer na tej bazie: stare konto loguje się hasłem, a w Ja nie ma nic anonimowego
      const s = await start({ baza: plik });
      const p = przegladarka(s.adres);
      const r = await p.zadanie('POST', '/api/sesja', { nick: 'stary', haslo: 'stare-haslo-1' });
      expect(r.status, r.tekst).toBe(200);
      expect(r.body).toEqual({
        nick: 'Stary',
        utworzone: 5,
        klatki: 1,
        zapis: false,
        anonimowe: false,
        znak: 'Stary',
        kod: false,
      });
    } finally {
      await Promise.all(serwery.map((s) => s.zamknij()));
      serwery = [];
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
