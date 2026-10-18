/* Serwer API gry sieciowej, etap 1 (docs/superpowers/specs/2026-10-18-multiplayer-design.md): konta, sesje,
   zajęte klatki i zapis gry w chmurze. Node 24 bez zależności z npm: node:http, node:sqlite, node:crypto,
   node:zlib. Gra w przeglądarce symuluje się sama; serwer pilnuje tylko, kto ma którą klatkę, i trzyma zapisy.

   API pod /api (typy i kody błędów w src/net/protokol.ts):
     GET    /api/zdrowie            czy serwer żyje
     POST   /api/konto              załóż konto {nick, haslo} i zaloguj      → 201 Ja + ciasteczko
     GET    /api/konto              kim jestem                               → Ja
     DELETE /api/konto              usuń konto {haslo} z klatkami i zapisem  → 204
     POST   /api/sesja              zaloguj {nick, haslo}                    → Ja + ciasteczko
     DELETE /api/sesja              wyloguj                                  → 204
     GET    /api/klatki?s=&w=&n=&e= zajęte klatki w prostokącie (stopnie)    → {klatki}
     POST   /api/klatki             zajmij {klucz, budynek, lat, lon}        → 201 {klatka}, 409 zajęta
     GET    /api/klatki/moje        moje klatki                              → {klatki}
     DELETE /api/klatki/moje        zwolnij wszystkie moje                   → 204
     DELETE /api/klatki/:klucz      zwolnij jedną                            → 204, 404
     GET    /api/zapis              zapis w chmurze                          → {dane, wersja, zmieniony, rozmiar}
     PUT    /api/zapis              zapisz {dane, wersja?}                   → {wersja, zmieniony, rozmiar}, 409
     DELETE /api/zapis              usuń zapis                               → 204

   Zasady: cudza klatka to tylko „zajęta” (bez nicku i numeru konta); każda klatka drużyny najwyżej `promienM`
   od jej siedziby (pierwszej klatki), najwyżej `limitKlatek` na konto; zapis bez tekstu adresu. Żądania zmieniające
   stan muszą mieć JSON (gdy niosą dane) i nagłówek Origin z tej samej strony (albo żadnego). Limity prób w pamięci
   (limity.ts), adresów IP nie zapisujemy. Zegar i koszt scrypt da się podać w opcjach (testy). */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { promisify } from 'node:util';
import { gunzip, gzip } from 'node:zlib';
import {
  API_WERSJA,
  type DaneLogowania,
  type Ja,
  KLATKI_W_ODPOWIEDZI_MAX,
  KLUCZ_BUDYNKU_WZOR,
  KLUCZ_KLATKI_WZOR,
  KLUCZ_MAX,
  maAdres,
  nickKlucz,
  PROSTOKAT_MAX_DLUG,
  PROSTOKAT_MAX_SZER,
  type ZajetaKlatka,
  type ZapisanoOdpowiedz,
  type Zdrowie,
  zleHaslo,
  zlyNick,
} from '../src/net/protokol.ts';
import { type Baza, type Klatka, type Konto, otworzBaze } from './baza.ts';
import {
  atrapaHasla,
  DOMYSLNE_HASLO,
  nowyToken,
  type ParametryHasla,
  skrotHasla,
  skrotTokenu,
  sprawdzHaslo,
} from './hasla.ts';
import { BladHttp, ciasteczka, ciasteczkoSesji, czytajJson, wyslij, wyslijBlad } from './http.ts';
import { type Okno, okno } from './limity.ts';

const gzipA = promisify(gzip);
const gunzipA = promisify(gunzip);

const MIN = 60_000;
const GODZ = 60 * MIN;
const DOBA = 24 * GODZ;

export interface OpcjeSerwera {
  /** ścieżka pliku bazy albo ':memory:' */
  baza: string;
  /** koszt scrypt (testy biorą mniejszy) */
  hasla?: ParametryHasla;
  /** atrybut Secure ciasteczka (domyślnie tak; lokalnie po http można wyłączyć) */
  bezpieczneCiasteczko?: boolean;
  /** adres klienta z ostatniego wpisu X-Forwarded-For (tylko za własnym proxy, np. Caddy) */
  zaufaneProxy?: boolean;
  /** dozwolone nagłówki Origin; puste: ta sama strona co nagłówek Host (http albo https) */
  zrodla?: string[];
  /** największy zapis gry w bajtach JSON (domyślnie 3 MiB) */
  limitZapisu?: number;
  /** najwięcej klatek na konto (domyślnie 60) */
  limitKlatek?: number;
  /** największa odległość klatki od siedziby drużyny w metrach (domyślnie 600: przekątna mapy 384 m z zapasem) */
  promienM?: number;
  /** ważność sesji w dniach (domyślnie 30, przedłużana, gdy zostało mniej niż połowa) */
  sesjaDni?: number;
  /** zegar (ms od 1970) */
  teraz?: () => number;
  /** dziennik błędów serwera (domyślnie console.error) */
  dziennik?: (wpis: string) => void;
}

export interface SerwerGry {
  /** obsługa żądania dla http.createServer */
  obsluz(req: IncomingMessage, res: ServerResponse): void;
  readonly baza: Baza;
  /** wygasłe sesje i stare wpisy limitów; main.ts woła co godzinę */
  sprzataj(): void;
  zamknij(): void;
}

/** nazwa ciasteczka sesji */
export const CIASTECZKO = 'zm_sesja';
/** limity małych ciał JSON (konto, logowanie, klatka) */
const MALE_CIALO = 4096;

interface Sesja {
  konto: Konto;
  skrot: string;
  wygasa: number;
}

interface Kontekst {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  ip: string;
  teraz: number;
  /** nagłówki do dołączenia (np. Set-Cookie przy przedłużeniu sesji) */
  naglowki: Record<string, string | string[]>;
}

type Obsluga = (k: Kontekst) => Promise<void>;

/** odległość w metrach (przybliżenie równoodległościowe, dokładne na kilometry) */
function metry(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const kx = 111320 * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
  return Math.sqrt(((lon2 - lon1) * kx) ** 2 + ((lat2 - lat1) * 110574) ** 2);
}

const do5 = (v: number) => Math.round(v * 1e5) / 1e5;

export function stworzSerwer(op: OpcjeSerwera): SerwerGry {
  const baza = otworzBaze(op.baza);
  const par = op.hasla ?? DOMYSLNE_HASLO;
  const teraz = op.teraz ?? Date.now;
  const secure = op.bezpieczneCiasteczko ?? true;
  const limitZapisu = op.limitZapisu ?? 3 * 1024 * 1024;
  const limitKlatek = op.limitKlatek ?? 60;
  const promienM = op.promienM ?? 600;
  const sesjaMs = (op.sesjaDni ?? 30) * DOBA;
  const dziennik = op.dziennik ?? ((w: string) => console.error(w));
  const zrodla = new Set(op.zrodla ?? []);

  // limity w pamięci: nieudane logowania i zakładanie kont na IP, wszystkie żądania na IP, zapisy na konto
  const logowania: Okno = okno(10, 15 * MIN, teraz);
  const rejestracje: Okno = okno(5, GODZ, teraz);
  const zadania: Okno = okno(300, MIN, teraz);
  const zapisy: Okno = okno(60, GODZ, teraz);
  // próby zajętych nicków przy zakładaniu konta: bez tego dałoby się sprawdzać po kolei, kto ma konto
  const zajeteNicki: Okno = okno(30, GODZ, teraz);
  // porównanie z atrapą dla nieistniejącego nicku: tyle samo pracy co z prawdziwym kontem; liczona od razu,
  // żeby pierwsze logowanie na nieznany nick nie trwało dwa razy dłużej
  const atrapa = atrapaHasla(par);
  atrapa.catch(() => {});

  const ciasteczko = (token: string, maxAgeMs: number) =>
    ciasteczkoSesji(token, { nazwa: CIASTECZKO, maxAge: Math.floor(maxAgeMs / 1000), secure });
  const skasujCiasteczko = () => ciasteczko('', 0);

  const ipZ = (req: IncomingMessage): string => {
    if (op.zaufaneProxy) {
      const xff = req.headers['x-forwarded-for'];
      const lista = (Array.isArray(xff) ? xff.join(',') : (xff ?? '')).split(',').map((s) => s.trim());
      const ostatni = lista.filter(Boolean).pop();
      if (ostatni) return ostatni;
    }
    return req.socket.remoteAddress ?? '?';
  };

  const ja = (konto: Konto): Ja => ({
    nick: konto.nick,
    utworzone: konto.utworzone,
    klatki: baza.liczbaKlatek(konto.id),
    zapis: baza.wersjaZapisu(konto.id) > 0,
  });

  const jakoOdpowiedz = (k: Klatka, moje: number | null): ZajetaKlatka => {
    const out: ZajetaKlatka = { klucz: k.klucz, budynek: k.budynek, lat: k.lat, lon: k.lon, moja: k.konto === moje };
    if (out.moja) out.siedziba = k.siedziba;
    return out;
  };

  /** nowa sesja dla konta: token do ciasteczka, w bazie skrót; najwyżej 10 sesji na konto */
  const zaloguj = (k: Kontekst, konto: Konto) => {
    const token = nowyToken();
    baza.dodajSesje(skrotTokenu(token), konto.id, k.teraz, k.teraz + sesjaMs);
    baza.przytnijSesje(konto.id, 10);
    k.naglowki['Set-Cookie'] = ciasteczko(token, sesjaMs);
  };

  /** sesja z ciasteczka albo null; przedłuża ważną sesję, gdy została mniej niż połowa czasu */
  const sesjaZ = (k: Kontekst): Sesja | null => {
    const token = ciasteczka(k.req).get(CIASTECZKO);
    if (!token || token.length > 100) return null;
    const skrot = skrotTokenu(token);
    const s = baza.sesja(skrot, k.teraz);
    if (!s) {
      k.naglowki['Set-Cookie'] = skasujCiasteczko();
      return null;
    }
    if (s.wygasa - k.teraz < sesjaMs / 2) {
      baza.przedluzSesje(skrot, k.teraz + sesjaMs);
      k.naglowki['Set-Cookie'] = ciasteczko(token, sesjaMs);
    }
    baza.dotknijKonta(s.konto.id, Math.floor(k.teraz / DOBA) * DOBA);
    return { konto: s.konto, skrot, wygasa: s.wygasa };
  };
  const wymagajSesji = (k: Kontekst): Sesja => {
    const s = sesjaZ(k);
    if (!s) throw new BladHttp(401, 'brak_sesji', 'Zalogujcie się.');
    return s;
  };

  const daneLogowania = async (k: Kontekst): Promise<DaneLogowania> => {
    const b = await czytajJson(k.req, MALE_CIALO);
    if (typeof b.nick !== 'string' || typeof b.haslo !== 'string')
      throw new BladHttp(400, 'zle_dane', 'Podajcie nick i hasło.');
    return { nick: b.nick, haslo: b.haslo };
  };

  // ---------- obsługa tras ----------

  const zdrowie: Obsluga = async (k) => {
    const out: Zdrowie = { ok: true, gra: 'za-murem', wersja: API_WERSJA };
    wyslij(k.res, 200, out, k.naglowki);
  };

  const zalozKonto: Obsluga = async (k) => {
    const czekaj = rejestracje.zablokowany(k.ip) || zajeteNicki.zablokowany(k.ip);
    if (czekaj)
      throw new BladHttp(429, 'za_duzo_prob', 'Za dużo nowych kont z tego miejsca. Spróbujcie później.', {
        'Retry-After': String(czekaj),
      });
    const { nick: nick0, haslo } = await daneLogowania(k);
    const nick = nick0.normalize('NFC');
    const zn = zlyNick(nick);
    if (zn) throw new BladHttp(400, 'zly_nick', zn);
    const zh = zleHaslo(haslo);
    if (zh) throw new BladHttp(400, 'zle_haslo', zh);
    if (nickKlucz(haslo) === nickKlucz(nick)) throw new BladHttp(400, 'zle_haslo', 'Hasło nie może być nickiem.');
    const klucz = nickKlucz(nick);
    const zajety = () => {
      zajeteNicki.dolicz(k.ip);
      return new BladHttp(409, 'nick_zajety', 'Ten nick jest już zajęty.');
    };
    if (baza.kontoPoNicku(klucz)) throw zajety();
    const skrot = await skrotHasla(haslo, par);
    const konto = baza.dodajKonto(nick, klucz, skrot, k.teraz);
    if (!konto) throw zajety();
    rejestracje.dolicz(k.ip);
    zaloguj(k, konto);
    wyslij(k.res, 201, ja(konto), k.naglowki);
  };

  const zalogujSie: Obsluga = async (k) => {
    const czekaj = logowania.zablokowany(k.ip);
    if (czekaj)
      throw new BladHttp(429, 'za_duzo_prob', 'Za dużo nieudanych prób. Spróbujcie za kilka minut.', {
        'Retry-After': String(czekaj),
      });
    const { nick, haslo } = await daneLogowania(k);
    const konto = nick.length <= 64 && haslo.length <= 200 ? baza.kontoPoNicku(nickKlucz(nick)) : null;
    const dobre = await sprawdzHaslo(haslo.slice(0, 200), konto?.haslo ?? (await atrapa));
    if (!konto || !dobre) {
      logowania.dolicz(k.ip);
      throw new BladHttp(401, 'zle_logowanie', 'Zły nick albo hasło.');
    }
    zaloguj(k, konto);
    wyslij(k.res, 200, ja(konto), k.naglowki);
  };

  const wyloguj: Obsluga = async (k) => {
    const token = ciasteczka(k.req).get(CIASTECZKO);
    if (token && token.length <= 100) baza.usunSesje(skrotTokenu(token));
    wyslij(k.res, 204, undefined, { ...k.naglowki, 'Set-Cookie': skasujCiasteczko() });
  };

  const kimJestem: Obsluga = async (k) => {
    const s = wymagajSesji(k);
    wyslij(k.res, 200, ja(s.konto), k.naglowki);
  };

  const usunKonto: Obsluga = async (k) => {
    const s = wymagajSesji(k);
    const czekaj = logowania.zablokowany(k.ip);
    if (czekaj)
      throw new BladHttp(429, 'za_duzo_prob', 'Za dużo nieudanych prób. Spróbujcie za kilka minut.', {
        'Retry-After': String(czekaj),
      });
    const b = await czytajJson(k.req, MALE_CIALO);
    if (typeof b.haslo !== 'string' || !(await sprawdzHaslo(b.haslo.slice(0, 200), s.konto.haslo))) {
      logowania.dolicz(k.ip);
      throw new BladHttp(401, 'zle_logowanie', 'Złe hasło.');
    }
    // kaskada w bazie: sesje, klatki i zapis znikają razem z kontem
    baza.usunKonto(s.konto.id);
    wyslij(k.res, 204, undefined, { ...k.naglowki, 'Set-Cookie': skasujCiasteczko() });
  };

  const liczba = (v: string | null) => (v === null || v.trim() === '' ? Number.NaN : Number(v));

  const klatkiWProstokacie: Obsluga = async (k) => {
    const s = wymagajSesji(k);
    const p = k.url.searchParams;
    const [ps, pw, pn, pe] = ['s', 'w', 'n', 'e'].map((x) => liczba(p.get(x)));
    const dobry =
      [ps, pw, pn, pe].every(Number.isFinite) &&
      ps >= -85 &&
      pn <= 85 &&
      pw >= -180 &&
      pe <= 180 &&
      ps < pn &&
      pw < pe &&
      pn - ps <= PROSTOKAT_MAX_SZER &&
      pe - pw <= PROSTOKAT_MAX_DLUG;
    if (!dobry)
      throw new BladHttp(
        400,
        'zle_dane',
        `Prostokąt s<n, w<e, najwyżej ${PROSTOKAT_MAX_SZER}° na ${PROSTOKAT_MAX_DLUG}° (parametry s, w, n, e).`,
      );
    const lista = baza.klatkiWProstokacie(ps, pw, pn, pe, KLATKI_W_ODPOWIEDZI_MAX);
    wyslij(k.res, 200, { klatki: lista.map((x) => jakoOdpowiedz(x, s.konto.id)) }, k.naglowki);
  };

  const zajmijKlatke: Obsluga = async (k) => {
    const s = wymagajSesji(k);
    const b = await czytajJson(k.req, MALE_CIALO);
    const { klucz, budynek, lat, lon } = b;
    const m = typeof klucz === 'string' ? KLUCZ_KLATKI_WZOR.exec(klucz) : null;
    const dobry =
      typeof klucz === 'string' &&
      typeof budynek === 'string' &&
      klucz.length <= KLUCZ_MAX &&
      !!m &&
      m[1] === budynek &&
      KLUCZ_BUDYNKU_WZOR.test(budynek) &&
      typeof lat === 'number' &&
      typeof lon === 'number' &&
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      Math.abs(lat) <= 85 &&
      Math.abs(lon) <= 180;
    if (!dobry) throw new BladHttp(400, 'zle_dane', 'Zły klucz albo pozycja klatki.');
    const nowa: Klatka = {
      klucz: klucz as string,
      budynek: budynek as string,
      konto: s.konto.id,
      lat: do5(lat as number),
      lon: do5(lon as number),
      siedziba: false,
      zajeta: k.teraz,
    };
    // sprawdzenie i wstawienie w jednej transakcji (bez await w środku)
    const wynik = baza.transakcja((): { status: number; klatka: Klatka } => {
      const jest = baza.klatka(nowa.klucz);
      if (jest) {
        if (jest.konto === s.konto.id) return { status: 200, klatka: jest };
        throw new BladHttp(409, 'zajeta', 'Ta klatka jest zajęta przez inną drużynę.');
      }
      if (baza.liczbaKlatek(s.konto.id) >= limitKlatek)
        throw new BladHttp(403, 'limit_klatek', `Drużyna może mieć najwyżej ${limitKlatek} klatek.`);
      const siedziba = baza.siedziba(s.konto.id);
      if (siedziba && metry(siedziba.lat, siedziba.lon, nowa.lat, nowa.lon) > promienM)
        throw new BladHttp(422, 'za_daleko', `Klatka jest dalej niż ${promienM} m od waszej siedziby.`);
      nowa.siedziba = !siedziba;
      if (!baza.dodajKlatke(nowa)) throw new BladHttp(409, 'zajeta', 'Ta klatka jest zajęta przez inną drużynę.');
      return { status: 201, klatka: nowa };
    });
    wyslij(k.res, wynik.status, { klatka: jakoOdpowiedz(wynik.klatka, s.konto.id) }, k.naglowki);
  };

  const mojeKlatki: Obsluga = async (k) => {
    const s = wymagajSesji(k);
    wyslij(k.res, 200, { klatki: baza.klatkiKonta(s.konto.id).map((x) => jakoOdpowiedz(x, s.konto.id)) }, k.naglowki);
  };

  const zwolnijMoje: Obsluga = async (k) => {
    const s = wymagajSesji(k);
    baza.zwolnijKlatkiKonta(s.konto.id);
    wyslij(k.res, 204, undefined, k.naglowki);
  };

  const zwolnijKlatke =
    (klucz: string): Obsluga =>
    async (k) => {
      const s = wymagajSesji(k);
      if (klucz.length > KLUCZ_MAX || !KLUCZ_KLATKI_WZOR.test(klucz))
        throw new BladHttp(400, 'zle_dane', 'Zły klucz klatki.');
      if (!baza.zwolnijKlatke(s.konto.id, klucz)) throw new BladHttp(404, 'nie_ma', 'Nie macie takiej klatki.');
      wyslij(k.res, 204, undefined, k.naglowki);
    };

  const pobierzZapis: Obsluga = async (k) => {
    const s = wymagajSesji(k);
    const z = baza.zapis(s.konto.id);
    if (!z) throw new BladHttp(404, 'brak_zapisu', 'Nie ma zapisu w chmurze.');
    const tekst = (await gunzipA(z.dane)).toString('utf8');
    // tekst to JSON zapisany przez serwer, więc wklejamy go bez ponownego parsowania
    wyslij(
      k.res,
      200,
      `{"dane":${tekst},"wersja":${z.wersja},"zmieniony":${z.zmieniony},"rozmiar":${z.rozmiar}}`,
      k.naglowki,
    );
  };

  const wyslijZapis: Obsluga = async (k) => {
    const s = wymagajSesji(k);
    const czekaj = zapisy.zablokowany(String(s.konto.id));
    if (czekaj)
      throw new BladHttp(429, 'za_duzo_prob', 'Za często zapisujecie. Spróbujcie za chwilę.', {
        'Retry-After': String(czekaj),
      });
    const b = await czytajJson(k.req, limitZapisu + 4096);
    const { dane, wersja } = b;
    if (!dane || typeof dane !== 'object' || Array.isArray(dane))
      throw new BladHttp(400, 'zle_dane', 'Zapis musi być obiektem JSON.');
    if (wersja !== undefined && (typeof wersja !== 'number' || !Number.isInteger(wersja) || wersja < 0))
      throw new BladHttp(400, 'zle_dane', 'Zła wersja zapisu.');
    if (maAdres(dane as Record<string, unknown>))
      throw new BladHttp(422, 'adres_w_zapisie', 'Zapis w chmurze nie może zawierać adresu (data.addr, data.street).');
    const tekst = JSON.stringify(dane);
    const rozmiar = Buffer.byteLength(tekst);
    if (rozmiar > limitZapisu) throw new BladHttp(413, 'za_duze', 'Zapis jest za duży.');
    const spakowany = await gzipA(tekst);
    zapisy.dolicz(String(s.konto.id));
    const zmieniony = teraz();
    const nowa = baza.ustawZapis(s.konto.id, spakowany, rozmiar, zmieniony, wersja as number | undefined);
    if (nowa === null)
      throw new BladHttp(
        409,
        'konflikt_wersji',
        'Na serwerze jest nowszy zapis.',
        {},
        {
          wersja: baza.wersjaZapisu(s.konto.id),
        },
      );
    const out: ZapisanoOdpowiedz = { wersja: nowa, zmieniony, rozmiar };
    wyslij(k.res, 200, out, k.naglowki);
  };

  const usunZapis: Obsluga = async (k) => {
    const s = wymagajSesji(k);
    baza.usunZapis(s.konto.id);
    wyslij(k.res, 204, undefined, k.naglowki);
  };

  const TRASY: Record<string, Record<string, Obsluga>> = {
    '/api/zdrowie': { GET: zdrowie },
    '/api/konto': { POST: zalozKonto, GET: kimJestem, DELETE: usunKonto },
    '/api/sesja': { POST: zalogujSie, DELETE: wyloguj },
    '/api/klatki': { GET: klatkiWProstokacie, POST: zajmijKlatke },
    '/api/klatki/moje': { GET: mojeKlatki, DELETE: zwolnijMoje },
    '/api/zapis': { GET: pobierzZapis, PUT: wyslijZapis, DELETE: usunZapis },
  };
  const PREFIKS_KLATKI = '/api/klatki/';

  /** trasa dla ścieżki: stała albo /api/klatki/:klucz (klucz zakodowany jak encodeURIComponent) */
  const trasa = (sciezka: string): Record<string, Obsluga> | null => {
    const stala = TRASY[sciezka];
    if (stala) return stala;
    if (sciezka.startsWith(PREFIKS_KLATKI) && sciezka.length > PREFIKS_KLATKI.length) {
      const surowy = sciezka.slice(PREFIKS_KLATKI.length);
      if (surowy.includes('/')) return null;
      let klucz: string;
      try {
        klucz = decodeURIComponent(surowy);
      } catch {
        return null;
      }
      return { DELETE: zwolnijKlatke(klucz) };
    }
    return null;
  };

  /** Origin z innej strony przy żądaniu zmieniającym stan: odmowa (obrona przed CSRF obok SameSite=Lax) */
  const obceZrodlo = (req: IncomingMessage): boolean => {
    const origin = req.headers.origin;
    if (!origin) return false;
    if (zrodla.size) return !zrodla.has(origin);
    const host = req.headers.host;
    return !host || (origin !== `https://${host}` && origin !== `http://${host}`);
  };

  const obsluzAsync = async (req: IncomingMessage, res: ServerResponse) => {
    let url: URL;
    try {
      url = new URL(req.url ?? '/', 'http://serwer');
    } catch {
      url = new URL('/', 'http://serwer');
    }
    const k: Kontekst = { req, res, url, ip: ipZ(req), teraz: teraz(), naglowki: {} };
    const metoda = req.method ?? 'GET';
    try {
      const czekaj = zadania.zablokowany(k.ip);
      if (czekaj)
        throw new BladHttp(429, 'za_duzo_prob', 'Za dużo żądań. Zwolnijcie trochę.', { 'Retry-After': String(czekaj) });
      zadania.dolicz(k.ip);
      const t = trasa(k.url.pathname);
      if (!t) throw new BladHttp(404, 'nie_ma', 'Nie ma takiego adresu API.');
      const obsluga = t[metoda];
      if (!obsluga)
        throw new BladHttp(405, 'zla_metoda', 'Ta metoda nie działa pod tym adresem.', {
          Allow: Object.keys(t).join(', '),
        });
      if (metoda !== 'GET' && metoda !== 'HEAD') {
        if (obceZrodlo(req)) throw new BladHttp(403, 'obce_zrodlo', 'Żądanie z innej strony.');
        const niesie = Number(req.headers['content-length'] ?? 0) > 0 || req.headers['transfer-encoding'] !== undefined;
        const typ = String(req.headers['content-type'] ?? '')
          .split(';')[0]
          .trim()
          .toLowerCase();
        if ((metoda === 'POST' || metoda === 'PUT' || niesie) && typ !== 'application/json')
          throw new BladHttp(415, 'zly_typ', 'Dane wysyłamy jako application/json.');
      }
      await obsluga(k);
    } catch (e) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      if (e instanceof BladHttp) {
        wyslijBlad(res, e, k.naglowki);
        // za duże ciało: dalszej części nie czytamy, połączenie się zamyka
        if (e.status === 413) req.resume();
        return;
      }
      dziennik(`błąd ${metoda} ${k.url.pathname}: ${e instanceof Error ? e.message : String(e)}`);
      wyslijBlad(res, new BladHttp(500, 'blad_serwera', 'Coś poszło nie tak po stronie serwera.'), k.naglowki);
    }
  };

  return {
    obsluz(req, res) {
      // ostatnia siatka: błąd poza obsługą trasy nie może wywrócić procesu
      obsluzAsync(req, res).catch((e) => {
        dziennik(`błąd obsługi: ${e instanceof Error ? e.message : String(e)}`);
        res.destroy();
      });
    },
    baza,
    sprzataj() {
      baza.usunWygasleSesje(teraz());
      for (const o of [logowania, rejestracje, zadania, zapisy, zajeteNicki]) o.sprzataj();
    },
    zamknij() {
      baza.zamknij();
    },
  };
}
