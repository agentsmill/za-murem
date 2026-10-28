/* Serwer API gry sieciowej, etap 1 (docs/superpowers/specs/2026-10-18-multiplayer-design.md): konta, drużyny
   anonimowe, sesje, zajęte klatki i zapis gry w chmurze. Node 24 bez zależności z npm: node:http, node:sqlite,
   node:crypto, node:zlib. Gra w przeglądarce symuluje się sama; serwer pilnuje tylko, kto ma którą klatkę, i trzyma
   zapisy.

   API pod /api (typy i kody błędów w src/net/protokol.ts):
     GET    /api/zdrowie            czy serwer żyje
     POST   /api/konto              załóż konto {nick, haslo} i zaloguj      → 201 Ja + ciasteczko
     GET    /api/konto              kim jestem                               → Ja
     DELETE /api/konto              usuń konto {haslo} z klatkami i zapisem  → 204 (drużyna anonimowa: bez hasła)
     POST   /api/sesja              zaloguj {nick, haslo}                    → Ja + ciasteczko
     DELETE /api/sesja              wyloguj                                  → 204
     POST   /api/druzyna            załóż drużynę anonimową {} i zaloguj     → 201 Ja + ciasteczko (z ważną sesją
                                    200 Ja tej sesji, bez nowego konta)
     POST   /api/druzyna/kod        nowy kod powrotu {} (stary wygasa)       → {kod}, 401 bez sesji
     POST   /api/druzyna/powrot     wróć do drużyny {kod}                    → 200 Ja + ciasteczko, 401 zly_kod
     PUT    /api/druzyna/start      punkt startu {lat, lon} (stopnie)        → 204, 429 po 5 zmianach okolicy na dobę
     GET    /api/klatki?s=&w=&n=&e= zajęte klatki w prostokącie (stopnie)    → {klatki}, 403 poza_okolica,
                                    409 brak_startu
     POST   /api/klatki             zajmij {klucz, budynek, lat, lon}        → 201 {klatka}, 409 zajęta,
                                    429 (nowa siedziba daleko od punktu startu)
     GET    /api/klatki/moje        moje klatki                              → {klatki}
     DELETE /api/klatki/moje        zwolnij wszystkie moje                   → 204
     DELETE /api/klatki/:klucz      zwolnij jedną                            → 204, 404, 429 (zwolnienie siedziby
                                    przenosi ją na inną klatkę)
     GET    /api/zapis              zapis w chmurze                          → {dane, wersja, zmieniony, rozmiar}
     PUT    /api/zapis              zapisz {dane, wersja?}                   → {wersja, zmieniony, rozmiar}, 409
     DELETE /api/zapis              usuń zapis                               → 204
     POST   /api/zdarzenie          dolicz zdarzenie do sum dziennych {z}    → 204, bez sesji; 400 nieznane, 429
     GET    /api/liczniki?od=<ms>   sumy zdarzeń i powroty kont              → {liczniki, powroty}; tylko z nagłówkiem
                                    Authorization: Bearer <token>, bez tokenu w opcjach 404, zły token 401
     GET    /api/adres?q=&j=pl|en   adres → miejsce (WynikAdresu), bez sesji → 200, 400 (puste albo dłuższe niż 200
                                    znaków), 404 nie_ma ze zdaniem KOMUNIKAT_BRAK_ADRESU (nieznana trasa też daje
                                    nie_ma, ale z innym zdaniem), 503 serwer_zajety, 429 po 30 w minutę

   Drużyna anonimowa (POST /api/druzyna) to konto bez nicku i hasła, z numerem jako znakiem (`#12`), zakładane przy
   pierwszym wejściu bez formularza; najwyżej 30 nowych na IP na godzinę (żądanie z ważną sesją się nie liczy).
   Kod powrotu (XXXX-XXXX-XXXX, 60 bitów, alfabet w protokol.ts) pozwala wejść do tej samej drużyny z innej
   przeglądarki: nowa sesja, stare dalej działają. Kod pokazujemy raz, w bazie leży tylko jego SHA-256 w postaci
   znormalizowanej (wielkość liter, spacje i myślniki bez znaczenia), a każdy nowy kod wygasza poprzedni. Kod może
   wymienić każde zalogowane konto, także z nickiem (najwyżej 10 razy na godzinę na konto); zły kod w powrocie liczy
   się do tego samego limitu nieudanych prób z IP co złe hasło (10 na 15 minut), dobry nie. Drużyna anonimowa usuwa się
   bez hasła (nie ma go), konto z nickiem dalej z hasłem; w logowaniu nickiem drużyny anonimowej nie ma. Wszystkie POST
   niosą Content-Type: application/json, także puste (`{}`).

   Liczniki bez śladu gracza: POST /api/zdarzenie {z} dolicza jedynkę do pary (doba UTC, zdarzenie) ze wzoru
   ZDARZENIE_WZOR (start gry, krok ścieżki celów, dzień 2, 3 i 7). Nie czyta sesji ani ciasteczka i nie zapisuje niczego
   z żądania poza samym zdarzeniem (ani adresu IP, ani konta); najwyżej 120 przyjętych na IP na godzinę (okno w pamięci,
   odrzucone nie zużywają limitu), a różnych `cel:` na dobę baza przyjmie ROZNYCH_CELOW_NA_DZIEN, resztę pomija po
   cichu. Powroty liczy `wizyta`: pierwsza w dobie zmiana `konta.ostatnio` (żądanie z sesją albo logowanie, obojętnie
   które pierwsze) dolicza jedynkę do „doba założenia, ile dób po założeniu”, a doby założenia nie liczy nigdy. Odczyt
   GET /api/liczniki działa tylko z `tokenLicznikow` w opcjach (ZM_LICZNIKI_TOKEN, porównanie skrótów w stałym czasie,
   jak sekret proxy); bez niego trasa daje 404, a po 10 złych próbach z IP w kwadrans 429. `od` odcina doby liczników
   i kohorty powrotów założone przed tą chwilą.

   Wyszukiwanie adresu (server/adres.ts): GET /api/adres pyta za gracza publiczny Nominatim, spokojnie i raz na adres.
   Zapytania idą do Nominatim w odstępach co najmniej 1100 ms; które musiałoby czekać dłużej niż 3 s, idzie od razu do
   Photona (komoot), tak samo jak zapytanie po błędzie, 429 albo przekroczeniu 6 s. Wyniki leżą w pamięci procesu pod
   kluczem SHA-256 znormalizowanego zapytania (30 dni, brak wyniku i wynik z Photona dobę, najwyżej 5000 wpisów), a po
   restarcie serwera pamięć jest pusta. Bez sesji i bez ciasteczka; najwyżej 30 zapytań na IP na minutę (okno w
   pamięci, liczone przed pierwszym await, także trafienia w pamięć i zapytania błędne). Serwer nie zapisuje tekstu
   zapytań ani adresów IP, także w dzienniku błędów: gdy zawiodą oba dostawcy, do dziennika idzie jedna linia z samymi
   powodami (najwyżej raz na minutę). `ZM_KONTAKT` (opcje: `adres.kontakt`) trafia do User-Agent dla Nominatim.

   Zajęte klatki widać tylko w swojej okolicy: każdy z czterech rogów prostokąta GET /api/klatki musi leżeć najwyżej
   `ZASIEG_ZAPYTAN_M` (1500 m) od siedziby drużyny, a drużyna bez siedziby (jeszcze nie zajęła klatki albo ją zwolniła)
   od swojego punktu startu z PUT /api/druzyna/start. Dalej to 403 poza_okolica, a bez siedziby i bez punktu startu
   409 brak_startu; kształt prostokąta (400) sprawdzamy wcześniej. Punkt startu to w praktyce adres gracza, więc leży
   tylko w pamięci procesu (nie w bazie, nie w dzienniku), jest osobny dla konta, znika z kontem, a po restarcie
   serwera klient podaje go od nowa. Wpis, z którego nikt nie korzysta przez czas życia sesji (`sesjaDni`), sprząta
   `sprzataj`.

   Okolicę można zmienić najwyżej 5 razy na dobę na konto (jedno okno `zmianyStartu`, potem 429 za_duzo_prob), żeby
   przeczesanie miasta wymagało zakładania kont. Liczą się tylko przyjęte zmiany, a zmianą jest: (1) PUT start;
   (2) zajęcie klatki przez drużynę bez siedziby (nowa siedziba, np. po DELETE /api/klatki/moje), chyba że leży
   w zasięgu `ZASIEG_ZAPYTAN_M` od jej punktu startu (nowa gra: PUT start i zajęcie przy tym samym adresie kosztuje
   jedną zmianę); (3) zwolnienie siedziby, gdy zostają inne klatki drużyny: siedziba przechodzi na najstarszą z nich
   i okolica z nią. Przy wyczerpanym oknie zajęcie z (2) i zwolnienie z (3) dają 429 przed jakąkolwiek zmianą.
   Zwolnienie zwykłej klatki, jedynej klatki i DELETE /api/klatki/moje okolicy nie przesuwają (po nich drużyna nie
   ma siedziby i okolicę wyznacza punkt startu), więc są bez limitu.

   Zasady: cudza klatka to tylko „zajęta” (bez nicku i numeru konta); pozycja klatki musi leżeć przy budynku z jej
   klucza (kotwicaKlucza), każda klatka drużyny najwyżej `promienM` od siedziby (pierwszej klatki), najwyżej
   `limitKlatek` na konto; zapis bez tekstu adresu. Żądania zmieniające stan muszą mieć JSON (gdy niosą dane)
   i nagłówek Origin z tej samej strony (albo żadnego); lista dozwolonych źródeł może mieć gwiazdkę (podglądy gałęzi
   na Vercelu, `pasujeZrodlo`). Limity prób w pamięci (limity.ts), liczone przed pierwszym await, żeby równoległe
   żądania ich nie obeszły; adresów IP nie zapisujemy, IPv6 liczymy po sieci /64. scrypt idzie przez kolejkę
   (najwyżej 2 naraz). Po ostatnim await zapis do bazy sprawdza sesję jeszcze raz. Zegar, koszt scrypt i kolejkę
   da się podać w opcjach (testy).

   Adres klienta do limitów, po kolei: (1) za Vercelem (`proxySekret`): gdy żądanie ma nagłówek x-zm-proxy równy
   sekretowi (porównanie w stałym czasie), adres bierzemy z nagłówka `proxyNaglowekIp` (domyślnie x-real-ip);
   sekretu nikt poza naszym projektem na Vercelu nie zna, więc nagłówka z adresem nie da się podrobić z zewnątrz,
   a bez sekretu nagłówek się nie liczy; (2) `zaufaneProxy`: ostatni wpis X-Forwarded-For (własny Caddy);
   (3) adres połączenia. GET /api/zdrowie mówi, który z trzech zadziałał (`ip`: proxy, xff, polaczenie), bez adresu.

   Wygasanie (sprzataj, co minutę z main.ts): klatki drużyny, która nie grała `klatkiDni` dni (14, KLATKI_DNI), wracają
   do wolnych, a konto, sesje, zapis i kod powrotu zostają; konto bez wizyty przez `kontaDni` dni (180, KONTA_DNI)
   znika razem z sesjami, klatkami i zapisem (kaskada w bazie). Wizytą jest każde żądanie z ważną sesją i każde logowanie (hasłem, kodem, nowa drużyna), ale
   `konta.ostatnio` ma dokładność doby (sesjaZ), a nowe konto zaczyna od chwili założenia, więc granica to początek
   doby sprzed N dni: drużyna zawsze ma pełne N dni od ostatniej wizyty. Wygasanie liczy się najwyżej raz na godzinę
   (zegar `teraz`), wygasłe sesje i wpisy limitów przy każdym wywołaniu; błąd wygasania idzie do dziennika i nie
   przerywa sprzątania. Klient po powrocie sam zajmuje swoją siedzibę od nowa (src/net/gra.ts, poWczytaniu). */

import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { promisify } from 'node:util';
import { gunzip, gzip } from 'node:zlib';
import {
  ADRES_MAX_ZNAKOW,
  API_WERSJA,
  type DaneLogowania,
  HASLO_MAX,
  type Ja,
  KLATKI_DNI,
  KLATKI_W_ODPOWIEDZI_MAX,
  KLUCZ_KLATKI_WZOR,
  KLUCZ_MAX,
  KOMUNIKAT_BRAK_ADRESU,
  KONTA_DNI,
  type KodPowrotu,
  kotwicaKlucza,
  type Liczniki,
  maAdres,
  nickKlucz,
  normalizujKod,
  odlegloscM,
  PROSTOKAT_MAX_DLUG,
  PROSTOKAT_MAX_SZER,
  ZAPAS_KLATKI_M,
  ZASIEG_ZAPYTAN_M,
  type ZajetaKlatka,
  type ZapisanoOdpowiedz,
  ZDARZENIE_WZOR,
  type Zdrowie,
  zleHaslo,
  zlyNick,
} from '../src/net/protokol.ts';
import { AdresNiedostepny, type OpcjeAdresu, wyszukiwarka } from './adres.ts';
import { type Baza, type Klatka, type Konto, otworzBaze } from './baza.ts';
import {
  atrapaHasla,
  DOMYSLNE_HASLO,
  nowyKod,
  nowyToken,
  type ParametryHasla,
  skrotHasla,
  skrotTokenu,
  sprawdzHaslo,
} from './hasla.ts';
import { BladHttp, ciasteczka, ciasteczkoSesji, czytajJson, wyslij, wyslijBlad } from './http.ts';
import { type Kolejka, kluczIp, kolejka, type Okno, okno, PelnaKolejka } from './limity.ts';

const gzipA = promisify(gzip);
const gunzipA = promisify(gunzip);

const MIN = 60_000;
const GODZ = 60 * MIN;
const DOBA = 24 * GODZ;

/** nagłówek z sekretem, który Vercel dokłada do żądań przekazywanych na ten serwer (wartość: `proxySekret`) */
export const NAGLOWEK_PROXY = 'x-zm-proxy';

/** skąd serwer wziął adres klienta do limitów (pole `ip` w odpowiedzi /api/zdrowie) */
type ZrodloIp = NonNullable<Zdrowie['ip']>;

/** Czy nagłówek Origin pasuje do któregoś ze wzorów. Wzór bez gwiazdki to dosłowne porównanie. Gwiazdka to jeden
    kawałek nazwy hosta (`[a-z0-9-]+`: bez kropki, ukośnika i dwukropka), reszta wzoru jest dosłowna, więc
    `https://zamurem-*-konto.vercel.app` przepuszcza podgląd gałęzi, ale nie inną domenę ani poddomenę. */
export function pasujeZrodlo(origin: string, wzory: readonly string[]): boolean {
  if (!origin || origin.length > 255) return false;
  return wzory.some((wzor) => {
    if (!wzor.includes('*')) return wzor === origin;
    const kawalki = wzor.split('*').map((k) => k.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'));
    return new RegExp(`^${kawalki.join('[a-z0-9-]+')}$`).test(origin);
  });
}

export interface OpcjeSerwera {
  /** ścieżka pliku bazy albo ':memory:' */
  baza: string;
  /** koszt scrypt (testy biorą mniejszy) */
  hasla?: ParametryHasla;
  /** ile scrypt naraz i ile może czekać w kolejce (domyślnie 2 i 64); pełna kolejka to 503 */
  scrypt?: { naraz: number; czeka: number };
  /** atrybut Secure ciasteczka (domyślnie tak; lokalnie po http można wyłączyć) */
  bezpieczneCiasteczko?: boolean;
  /** adres klienta z ostatniego wpisu X-Forwarded-For (tylko za własnym proxy, np. Caddy) */
  zaufaneProxy?: boolean;
  /** sekret proxy (Vercel): żądanie z nagłówkiem x-zm-proxy równym sekretowi ma adres klienta z `proxyNaglowekIp`;
      brak albo pusty: nagłówka nie sprawdzamy */
  proxySekret?: string;
  /** nagłówek z adresem klienta, któremu ufamy przy dobrym sekrecie (domyślnie x-real-ip) */
  proxyNaglowekIp?: string;
  /** token odczytu GET /api/liczniki (nagłówek Authorization: Bearer); brak albo pusty: trasa nie istnieje (404) */
  tokenLicznikow?: string;
  /** dozwolone nagłówki Origin, wzór może mieć gwiazdkę (kawałek nazwy hosta, `pasujeZrodlo`); puste: ta sama strona
      co nagłówek Host (http albo https) */
  zrodla?: string[];
  /** największy zapis gry w bajtach JSON (domyślnie 3 MiB) */
  limitZapisu?: number;
  /** najwięcej klatek na konto (domyślnie 60) */
  limitKlatek?: number;
  /** największa odległość klatki od siedziby drużyny w metrach (domyślnie 600: przekątna mapy 384 m z zapasem) */
  promienM?: number;
  /** ważność sesji w dniach (domyślnie 30, przedłużana, gdy zostało mniej niż połowa) */
  sesjaDni?: number;
  /** po ilu dniach bez gry klatki drużyny wracają do wolnych (domyślnie KLATKI_DNI, czyli 14) */
  klatkiDni?: number;
  /** po ilu dniach bez gry konto znika z sesjami, klatkami i zapisem (domyślnie KONTA_DNI, czyli 180) */
  kontaDni?: number;
  /** wyszukiwanie adresu (GET /api/adres): kontakt do User-Agent, rozmiar pamięci, odstępy kolejki, `fetch` i czekanie
      w testach; zegar bierze z `teraz` serwera, jeśli tu go nie podano */
  adres?: OpcjeAdresu;
  /** zegar (ms od 1970) */
  teraz?: () => number;
  /** dziennik błędów serwera (domyślnie console.error) */
  dziennik?: (wpis: string) => void;
}

export interface SerwerGry {
  /** obsługa żądania dla http.createServer */
  obsluz(req: IncomingMessage, res: ServerResponse): void;
  readonly baza: Baza;
  /** wygasłe sesje i stare wpisy limitów przy każdym wywołaniu, a najwyżej raz na godzinę klatki drużyn bez gry
      (`klatkiDni`) i konta bez wizyty (`kontaDni`); main.ts woła co minutę */
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
  /** klucz limitów dla klienta: IPv4 albo sieć /64 IPv6 */
  ip: string;
  /** skąd wzięliśmy adres klienta (do /api/zdrowie) */
  ipZrodlo: ZrodloIp;
  teraz: number;
  /** nagłówki do dołączenia (np. Set-Cookie przy przedłużeniu sesji) */
  naglowki: Record<string, string | string[]>;
}

type Obsluga = (k: Kontekst) => Promise<void>;

const do5 = (v: number) => Math.round(v * 1e5) / 1e5;
/** początek doby UTC, w której leży chwila (ms od 1970) */
const dzienUtc = (ms: number) => Math.floor(ms / DOBA) * DOBA;
/** skrót SHA-256 napisu: porównanie skrótów w stałym czasie nie zdradza ani długości, ani początku sekretu */
const skrotSha = (tekst: string) => createHash('sha256').update(tekst).digest();
/** czy podany napis ma skrót równy wzorcowi (null: sekretu nie ustawiono, nic nie pasuje) */
const zgodnySkrot = (wzor: Buffer | null, podany: unknown): boolean =>
  wzor !== null && typeof podany === 'string' && timingSafeEqual(skrotSha(podany), wzor);
/** komunikat 429, gdy okno zmian okolicy (siedziba albo punkt startu) jest wyczerpane */
const ZA_CZESTO_OKOLICA = 'Za często zmieniacie okolicę drużyny (siedzibę albo punkt startu). Spróbujcie później.';
const zaDuzo = (sekundy: number, komunikat: string) =>
  new BladHttp(429, 'za_duzo_prob', komunikat, { 'Retry-After': String(sekundy) });

export function stworzSerwer(op: OpcjeSerwera): SerwerGry {
  const baza = otworzBaze(op.baza);
  const par = op.hasla ?? DOMYSLNE_HASLO;
  const teraz = op.teraz ?? Date.now;
  const secure = op.bezpieczneCiasteczko ?? true;
  const limitZapisu = op.limitZapisu ?? 3 * 1024 * 1024;
  const limitKlatek = op.limitKlatek ?? 60;
  const promienM = op.promienM ?? 600;
  const sesjaMs = (op.sesjaDni ?? 30) * DOBA;
  const klatkiMs = (op.klatkiDni ?? KLATKI_DNI) * DOBA;
  const kontaMs = (op.kontaDni ?? KONTA_DNI) * DOBA;
  const dziennik = op.dziennik ?? ((w: string) => console.error(w));
  const zrodla = op.zrodla ?? [];
  const proxyNaglowekIp = (op.proxyNaglowekIp || 'x-real-ip').toLowerCase();
  // skróty sekretu proxy i tokenu liczników liczymy raz
  const sekretSkrot = op.proxySekret ? skrotSha(op.proxySekret) : null;
  const tokenSkrot = op.tokenLicznikow ? skrotSha(op.tokenLicznikow) : null;
  const dobrySekret = (req: IncomingMessage): boolean => zgodnySkrot(sekretSkrot, req.headers[NAGLOWEK_PROXY]);

  // limity w pamięci: nieudane logowania (i powroty z kodem) na IP i na nick, nowe konta, nowe drużyny anonimowe
  // i zajęte nicki na IP, wszystkie żądania na IP, zapytania o adres na IP, przyjęte zdarzenia liczników i złe tokeny
  // liczników na IP, zapisy i nowe kody powrotu na konto
  const logowania: Okno = okno(10, 15 * MIN, teraz);
  const logowaniaNicku: Okno = okno(20, 15 * MIN, teraz);
  const rejestracje: Okno = okno(5, GODZ, teraz);
  const druzyny: Okno = okno(30, GODZ, teraz);
  const zajeteNicki: Okno = okno(30, GODZ, teraz);
  const zadania: Okno = okno(300, MIN, teraz);
  const zapisy: Okno = okno(60, GODZ, teraz);
  const kody: Okno = okno(10, GODZ, teraz);
  const zdarzenia: Okno = okno(120, GODZ, teraz);
  const adresy: Okno = okno(30, MIN, teraz);
  const zleTokeny: Okno = okno(10, 15 * MIN, teraz);
  /** zmiany okolicy na konto: punkt startu, nowa siedziba daleko od punktu startu i przeniesienie siedziby przy
      zwolnieniu (najwyżej 5 na dobę) */
  const zmianyStartu: Okno = okno(5, DOBA, teraz);
  const okna = [
    logowania,
    logowaniaNicku,
    rejestracje,
    druzyny,
    zajeteNicki,
    zadania,
    zapisy,
    kody,
    zdarzenia,
    adresy,
    zleTokeny,
    zmianyStartu,
  ];
  /** punkty startu drużyn (PUT /api/druzyna/start), tylko w pamięci procesu: to w praktyce adres gracza, a siedziba
      drużyny i tak leży w `klatki`. `uzyty` to chwila ostatniej zmiany albo zapytania, z której korzysta sprzataj. */
  const punktyStartu = new Map<number, { lat: number; lon: number; uzyty: number }>();
  /** wyszukiwanie adresu: kolejka do Nominatim i pamięć wyników w procesie (server/adres.ts), na zegarze serwera */
  const szukajAdresu = wyszukiwarka({ ...op.adres, teraz: op.adres?.teraz ?? teraz });
  /** chwila ostatniego wpisu w dzienniku o awarii wyszukiwania adresu (najwyżej jeden na minutę) */
  let awariaAdresuOd = Number.NEGATIVE_INFINITY;
  /** konta, których zapis właśnie się wysyła: drugi naraz to 429 */
  const zapisyWToku = new Set<number>();
  /** chwila ostatniego przebiegu wygasania klatek i kont (sprzataj liczy je najwyżej raz na godzinę) */
  let wygasanieOd = Number.NEGATIVE_INFINITY;
  const scryptKolejka: Kolejka = kolejka(op.scrypt?.naraz ?? 2, op.scrypt?.czeka ?? 64);
  /** scrypt przez kolejkę; pełna kolejka to 503, żeby zalew logowań nie zajął wszystkich wątków */
  const scrypt = async <T>(zadanie: () => Promise<T>): Promise<T> => {
    try {
      return await scryptKolejka.przez(zadanie);
    } catch (e) {
      if (e instanceof PelnaKolejka)
        throw new BladHttp(503, 'serwer_zajety', 'Serwer jest zajęty. Spróbujcie za chwilę.', { 'Retry-After': '5' });
      throw e;
    }
  };
  // porównanie z atrapą dla nieistniejącego nicku: tyle samo pracy co z prawdziwym kontem; liczona od razu,
  // żeby pierwsze logowanie na nieznany nick nie trwało dwa razy dłużej
  const atrapa = atrapaHasla(par);
  atrapa.catch(() => {});

  const ciasteczko = (token: string, maxAgeMs: number) =>
    ciasteczkoSesji(token, { nazwa: CIASTECZKO, maxAge: Math.floor(maxAgeMs / 1000), secure });
  const skasujCiasteczko = () => ciasteczko('', 0);

  /** klucz limitów dla klienta i skąd go wzięliśmy (kolejność w nagłówku na górze pliku) */
  const ipZ = (req: IncomingMessage): { ip: string; zrodlo: ZrodloIp } => {
    if (dobrySekret(req)) {
      const wartosc = req.headers[proxyNaglowekIp];
      // pierwszy wpis, gdyby proxy dołożyło listę; tu nagłówek jest zaufany, więc nic więcej nie sprawdzamy
      const adres = (Array.isArray(wartosc) ? wartosc.join(',') : (wartosc ?? '')).split(',')[0].trim();
      if (adres) return { ip: kluczIp(adres), zrodlo: 'proxy' };
    }
    if (op.zaufaneProxy) {
      const xff = req.headers['x-forwarded-for'];
      const lista = (Array.isArray(xff) ? xff.join(',') : (xff ?? '')).split(',').map((s) => s.trim());
      const ostatni = lista.filter(Boolean).pop();
      if (ostatni) return { ip: kluczIp(ostatni), zrodlo: 'xff' };
    }
    return { ip: kluczIp(req.socket.remoteAddress ?? '?'), zrodlo: 'polaczenie' };
  };

  const ja = (konto: Konto): Ja => ({
    nick: konto.anonimowe ? null : konto.nick,
    utworzone: konto.utworzone,
    klatki: baza.liczbaKlatek(konto.id),
    zapis: baza.maZapis(konto.id),
    anonimowe: konto.anonimowe,
    znak: konto.anonimowe ? `#${konto.id}` : konto.nick,
    kod: konto.kod !== null,
  });

  const jakoOdpowiedz = (k: Klatka, moje: number | null): ZajetaKlatka => {
    const out: ZajetaKlatka = { klucz: k.klucz, budynek: k.budynek, lat: k.lat, lon: k.lon, moja: k.konto === moje };
    if (out.moja) out.siedziba = k.siedziba;
    return out;
  };

  /** Wizyta konta: przesuwa `ostatnio` na początek doby (od tego zależy wygasanie) i, gdy to pierwsza wizyta tej
      doby, dolicza powrót do licznika „doba założenia, ile dób po założeniu”. Żądanie z sesją i logowanie idą tędy,
      więc którekolwiek pierwsze w dobie liczy, a drugie już nie; w dobie założenia `ostatnio` jest późniejsze od
      północy, więc powrotu nie ma. Błąd licznika idzie do dziennika i nie psuje wizyty. */
  const wizyta = (konto: Konto, ms: number) => {
    const dzien = dzienUtc(ms);
    if (!baza.dotknijKonta(konto.id, dzien)) return;
    try {
      const zalozone = dzienUtc(konto.utworzone);
      const poDniach = (dzien - zalozone) / DOBA;
      if (poDniach >= 1) baza.doliczPowrot(zalozone, poDniach);
    } catch (e) {
      dziennik(`błąd licznika powrotów: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  /** nowa sesja dla konta: token do ciasteczka, w bazie skrót; najwyżej 10 sesji na konto */
  const zaloguj = (k: Kontekst, konto: Konto) => {
    const token = nowyToken();
    baza.dodajSesje(skrotTokenu(token), konto.id, k.teraz, k.teraz + sesjaMs);
    baza.przytnijSesje(konto.id, 10);
    // logowanie też jest wizytą: konto, które weszło kodem albo hasłem, nie wygaśnie przed pierwszym żądaniem z sesją
    wizyta(konto, k.teraz);
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
    wizyta(s.konto, k.teraz);
    return { konto: s.konto, skrot, wygasa: s.wygasa };
  };
  const wymagajSesji = (k: Kontekst): Sesja => {
    const s = sesjaZ(k);
    if (!s) throw new BladHttp(401, 'brak_sesji', 'Zalogujcie się.');
    return s;
  };
  /** po ostatnim await przed zapisem do bazy: czy sesja dalej jest (wylogowanie albo usunięcie konta w trakcie) */
  const sesjaDalej = (k: Kontekst, s: Sesja) => {
    const teraz0 = baza.sesja(s.skrot, k.teraz);
    if (!teraz0 || teraz0.konto.id !== s.konto.id) throw new BladHttp(401, 'brak_sesji', 'Zalogujcie się.');
  };

  const daneLogowania = async (k: Kontekst): Promise<DaneLogowania> => {
    const b = await czytajJson(k.req, MALE_CIALO);
    if (typeof b.nick !== 'string' || typeof b.haslo !== 'string')
      throw new BladHttp(400, 'zle_dane', 'Podajcie nick i hasło.');
    return { nick: b.nick, haslo: b.haslo };
  };

  // ---------- obsługa tras ----------

  const zdrowie: Obsluga = async (k) => {
    const out: Zdrowie = { ok: true, gra: 'za-murem', wersja: API_WERSJA, ip: k.ipZrodlo };
    wyslij(k.res, 200, out, k.naglowki);
  };

  const zalozKonto: Obsluga = async (k) => {
    const czekaj = rejestracje.zablokowany(k.ip) || zajeteNicki.zablokowany(k.ip);
    if (czekaj) throw zaDuzo(czekaj, 'Za dużo nowych kont z tego miejsca. Spróbujcie później.');
    // miejsca w obu limitach zajmujemy przed pierwszym await; wynik zdecyduje, które oddać
    rejestracje.dolicz(k.ip);
    zajeteNicki.dolicz(k.ip);
    let wynik: 'konto' | 'zajety' | 'inny' = 'inny';
    try {
      const { nick: nick0, haslo } = await daneLogowania(k);
      const nick = nick0.normalize('NFC');
      const zn = zlyNick(nick);
      if (zn) throw new BladHttp(400, 'zly_nick', zn);
      const zh = zleHaslo(haslo);
      if (zh) throw new BladHttp(400, 'zle_haslo', zh);
      if (nickKlucz(haslo) === nickKlucz(nick)) throw new BladHttp(400, 'zle_haslo', 'Hasło nie może być nickiem.');
      const klucz = nickKlucz(nick);
      if (baza.kontoPoNicku(klucz)) {
        wynik = 'zajety';
        throw new BladHttp(409, 'nick_zajety', 'Ten nick jest już zajęty.');
      }
      const skrot = await scrypt(() => skrotHasla(haslo, par));
      const konto = baza.dodajKonto(nick, klucz, skrot, k.teraz);
      if (!konto) {
        wynik = 'zajety';
        throw new BladHttp(409, 'nick_zajety', 'Ten nick jest już zajęty.');
      }
      wynik = 'konto';
      zaloguj(k, konto);
      wyslij(k.res, 201, ja(konto), k.naglowki);
    } finally {
      if (wynik !== 'konto') rejestracje.odlicz(k.ip);
      if (wynik !== 'zajety') zajeteNicki.odlicz(k.ip);
    }
  };

  const zalogujSie: Obsluga = async (k) => {
    const czekaj = logowania.zablokowany(k.ip);
    if (czekaj) throw zaDuzo(czekaj, 'Za dużo nieudanych prób. Spróbujcie za kilka minut.');
    // próba liczy się od razu (przed await), a odlicza, jeśli nie była złym hasłem
    logowania.dolicz(k.ip);
    let nick: string | null = null;
    let zleHasloLubNick = false;
    try {
      const dane = await daneLogowania(k);
      nick = dane.nick.length <= 64 ? nickKlucz(dane.nick) : null;
      if (nick) {
        const czekajNick = logowaniaNicku.zablokowany(nick);
        if (czekajNick) {
          nick = null;
          throw zaDuzo(czekajNick, 'Za dużo nieudanych prób na to konto. Spróbujcie za kilka minut.');
        }
        logowaniaNicku.dolicz(nick);
      }
      const znalezione = nick && dane.haslo.length <= HASLO_MAX ? baza.kontoPoNicku(nick) : null;
      // drużyna anonimowa nie ma hasła: logowanie nickiem jej nie widzi (klucz nicku to „#” i token, nie nick)
      const konto = znalezione && !znalezione.anonimowe ? znalezione : null;
      const haslo = dane.haslo.slice(0, HASLO_MAX);
      const skrot = konto?.haslo ?? (await atrapa);
      const dobre = await scrypt(() => sprawdzHaslo(haslo, skrot));
      if (!konto || !dobre) {
        zleHasloLubNick = true;
        throw new BladHttp(401, 'zle_logowanie', 'Zły nick albo hasło.');
      }
      zaloguj(k, konto);
      wyslij(k.res, 200, ja(konto), k.naglowki);
    } finally {
      if (!zleHasloLubNick) {
        logowania.odlicz(k.ip);
        if (nick) logowaniaNicku.odlicz(nick);
      }
    }
  };

  const zalozDruzyne: Obsluga = async (k) => {
    // ważna sesja (też konta z nickiem) dostaje swoje konto z powrotem; bez await, więc nic nie wyprzedzi limitu
    const s = sesjaZ(k);
    if (s) {
      wyslij(k.res, 200, ja(s.konto), k.naglowki);
      return;
    }
    const czekaj = druzyny.zablokowany(k.ip);
    if (czekaj) throw zaDuzo(czekaj, 'Za dużo nowych drużyn z tego miejsca. Spróbujcie później.');
    druzyny.dolicz(k.ip);
    const konto = baza.dodajDruzyne(k.teraz);
    zaloguj(k, konto);
    wyslij(k.res, 201, ja(konto), k.naglowki);
  };

  const wymienKod: Obsluga = async (k) => {
    const s = wymagajSesji(k);
    const id = String(s.konto.id);
    const czekaj = kody.zablokowany(id);
    if (czekaj) throw zaDuzo(czekaj, 'Za często wymieniacie kod. Spróbujcie później.');
    kody.dolicz(id);
    const kod = nowyKod();
    // zapis bez await po sprawdzeniu sesji; stary kod przestaje działać w tej samej chwili
    baza.ustawKod(s.konto.id, skrotTokenu(normalizujKod(kod) as string));
    const out: KodPowrotu = { kod };
    wyslij(k.res, 200, out, k.naglowki);
  };

  const powrotDoDruzyny: Obsluga = async (k) => {
    const czekaj = logowania.zablokowany(k.ip);
    if (czekaj) throw zaDuzo(czekaj, 'Za dużo nieudanych prób. Spróbujcie za kilka minut.');
    // jak złe hasło: próba liczy się od razu (przed await), a odlicza, jeśli kod był dobry albo nie było czego sprawdzać
    logowania.dolicz(k.ip);
    let zly = false;
    try {
      const b = await czytajJson(k.req, MALE_CIALO);
      if (typeof b.kod !== 'string') throw new BladHttp(400, 'zle_dane', 'Podajcie kod powrotu.');
      // za długi tekst to na pewno nie kod (bez obcinania, żeby kod z doklejonym śmieciem nie przechodził)
      const kod = b.kod.length <= 64 ? normalizujKod(b.kod) : null;
      const konto = kod ? baza.kontoPoKodzie(skrotTokenu(kod)) : null;
      if (!konto) {
        zly = true;
        throw new BladHttp(401, 'zly_kod', 'Zły kod powrotu.');
      }
      zaloguj(k, konto);
      wyslij(k.res, 200, ja(konto), k.naglowki);
    } finally {
      if (!zly) logowania.odlicz(k.ip);
    }
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
    if (s.konto.anonimowe) {
      // drużyna anonimowa nie ma hasła, a sesja (albo kod powrotu) to jedyne, czym się wykazuje; bez await w środku
      baza.usunKonto(s.konto.id);
      punktyStartu.delete(s.konto.id);
      wyslij(k.res, 204, undefined, { ...k.naglowki, 'Set-Cookie': skasujCiasteczko() });
      return;
    }
    const czekaj = logowania.zablokowany(k.ip);
    if (czekaj) throw zaDuzo(czekaj, 'Za dużo nieudanych prób. Spróbujcie za kilka minut.');
    logowania.dolicz(k.ip);
    let zle = false;
    try {
      const b = await czytajJson(k.req, MALE_CIALO);
      const haslo = typeof b.haslo === 'string' ? b.haslo.slice(0, HASLO_MAX) : '';
      if (!haslo || !(await scrypt(() => sprawdzHaslo(haslo, s.konto.haslo)))) {
        zle = true;
        throw new BladHttp(401, 'zle_logowanie', 'Złe hasło.');
      }
      // kaskada w bazie: sesje, klatki i zapis znikają razem z kontem
      baza.usunKonto(s.konto.id);
      punktyStartu.delete(s.konto.id);
      wyslij(k.res, 204, undefined, { ...k.naglowki, 'Set-Cookie': skasujCiasteczko() });
    } finally {
      if (!zle) logowania.odlicz(k.ip);
    }
  };

  const ustawStart: Obsluga = async (k) => {
    const s = wymagajSesji(k);
    const id = String(s.konto.id);
    const czekaj = zmianyStartu.zablokowany(id);
    if (czekaj) throw zaDuzo(czekaj, ZA_CZESTO_OKOLICA);
    // próba liczy się od razu (przed await); odlicza, jeśli nie została przyjęta (zły JSON, złe współrzędne);
    // to samo okno liczy zmiany siedziby (zajmijKlatke, zwolnijKlatke)
    zmianyStartu.dolicz(id);
    let przyjety = false;
    try {
      const { lat, lon } = await czytajJson(k.req, MALE_CIALO);
      if (
        typeof lat !== 'number' ||
        typeof lon !== 'number' ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        Math.abs(lat) > 85 ||
        Math.abs(lon) > 180
      )
        throw new BladHttp(400, 'zle_dane', 'Podajcie punkt startu: lat i lon w stopniach.');
      // od tego miejsca bez await: sesja sprawdzona jeszcze raz (konto mogło zniknąć w trakcie) i zapis w pamięci
      sesjaDalej(k, s);
      punktyStartu.set(s.konto.id, { lat, lon, uzyty: k.teraz });
      przyjety = true;
      wyslij(k.res, 204, undefined, k.naglowki);
    } finally {
      if (!przyjety) zmianyStartu.odlicz(id);
    }
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
    // okolica: siedziba drużyny, a bez niej punkt startu; wszystkie cztery rogi w zasięgu
    const siedziba = baza.siedziba(s.konto.id);
    const punkt = punktyStartu.get(s.konto.id);
    const srodek = siedziba ?? punkt;
    if (!srodek)
      throw new BladHttp(
        409,
        'brak_startu',
        'Serwer nie zna jeszcze punktu startu waszej drużyny. Podajcie go przed pytaniem o klatki.',
      );
    for (const [lat, lon] of [
      [ps, pw],
      [ps, pe],
      [pn, pw],
      [pn, pe],
    ])
      if (odlegloscM(srodek.lat, srodek.lon, lat, lon) > ZASIEG_ZAPYTAN_M)
        throw new BladHttp(403, 'poza_okolica', 'Ten obszar leży za daleko od waszej okolicy.');
    if (!siedziba && punkt) punkt.uzyty = k.teraz;
    const lista = baza.klatkiWProstokacie(ps, pw, pn, pe, KLATKI_W_ODPOWIEDZI_MAX);
    wyslij(k.res, 200, { klatki: lista.map((x) => jakoOdpowiedz(x, s.konto.id)) }, k.naglowki);
  };

  /** klucz klatki rozłożony na klucz budynku i numer; null, gdy ma złą postać */
  const czesciKlucza = (klucz: unknown): { budynek: string; nr: number } | null => {
    if (typeof klucz !== 'string' || klucz.length > KLUCZ_MAX || !KLUCZ_KLATKI_WZOR.test(klucz)) return null;
    const i = klucz.lastIndexOf('/');
    return { budynek: klucz.slice(0, i), nr: Number(klucz.slice(i + 1)) };
  };

  const zajmijKlatke: Obsluga = async (k) => {
    const s = wymagajSesji(k);
    const b = await czytajJson(k.req, MALE_CIALO);
    const { klucz, budynek, lat, lon } = b;
    const czesci = czesciKlucza(klucz);
    const dobry =
      !!czesci &&
      czesci.budynek === budynek &&
      typeof lat === 'number' &&
      typeof lon === 'number' &&
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      Math.abs(lat) <= 85 &&
      Math.abs(lon) <= 180;
    const kotwica = czesci ? kotwicaKlucza(czesci.budynek) : null;
    if (!dobry || !czesci || !kotwica) throw new BladHttp(400, 'zle_dane', 'Zły klucz albo pozycja klatki.');
    // pozycja z klienta musi leżeć przy budynku z klucza (kotwica to jego najwyższy wierzchołek), a numer klatki
    // pasować do jego wielkości: inaczej dałoby się zająć klatkę w innym mieście z pozycją obok swojej siedziby
    const odKotwicy = odlegloscM(kotwica.lat, kotwica.lon, lat as number, lon as number);
    const najwiecejKlatek = Math.ceil((kotwica.rozpietoscM + ZAPAS_KLATKI_M) / 10) + 1;
    if (odKotwicy > kotwica.rozpietoscM + ZAPAS_KLATKI_M || czesci.nr > najwiecejKlatek)
      throw new BladHttp(422, 'zla_pozycja', 'Pozycja albo numer klatki nie pasuje do budynku z klucza.');
    const nowa: Klatka = {
      klucz: klucz as string,
      budynek: czesci.budynek,
      konto: s.konto.id,
      lat: do5(lat as number),
      lon: do5(lon as number),
      siedziba: false,
      zajeta: k.teraz,
    };
    // sprawdzenie i wstawienie w jednej transakcji, bez await w środku
    const wynik = baza.transakcja((): { status: number; klatka: Klatka; liczy: boolean } => {
      sesjaDalej(k, s);
      const jest = baza.klatka(nowa.klucz);
      if (jest) {
        if (jest.konto === s.konto.id) return { status: 200, klatka: jest, liczy: false };
        throw new BladHttp(409, 'zajeta', 'Ta klatka jest zajęta przez inną drużynę.');
      }
      if (baza.liczbaKlatek(s.konto.id) >= limitKlatek)
        throw new BladHttp(403, 'limit_klatek', `Drużyna może mieć najwyżej ${limitKlatek} klatek.`);
      const siedziba = baza.siedziba(s.konto.id);
      if (siedziba && odlegloscM(siedziba.lat, siedziba.lon, nowa.lat, nowa.lon) > promienM)
        throw new BladHttp(422, 'za_daleko', `Klatka jest dalej niż ${promienM} m od waszej siedziby.`);
      // drużyna bez siedziby zajmuje klatkę, która staje się nową siedzibą, a z nią środkiem okolicy zapytań: poza
      // zasięgiem punktu startu to zmiana okolicy (liczy się w tym samym oknie co PUT start, bez wyjątku skok
      // „zajmij daleko, zwolnij wszystko” przeczesywałby miasto)
      const start = punktyStartu.get(s.konto.id);
      const liczy = !siedziba && !(start && odlegloscM(start.lat, start.lon, nowa.lat, nowa.lon) <= ZASIEG_ZAPYTAN_M);
      if (liczy) {
        const czekaj = zmianyStartu.zablokowany(String(s.konto.id));
        if (czekaj) throw zaDuzo(czekaj, ZA_CZESTO_OKOLICA);
      }
      nowa.siedziba = !siedziba;
      if (!baza.dodajKlatke(nowa)) throw new BladHttp(409, 'zajeta', 'Ta klatka jest zajęta przez inną drużynę.');
      return { status: 201, klatka: nowa, liczy };
    });
    // transakcja jest synchroniczna, więc nic nie wejdzie między sprawdzeniem okna a doliczeniem
    if (wynik.liczy) zmianyStartu.dolicz(String(s.konto.id));
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
      if (!czesciKlucza(klucz)) throw new BladHttp(400, 'zle_dane', 'Zły klucz klatki.');
      // Zwolnienie siedziby, gdy zostają inne klatki, przenosi siedzibę (i okolicę zapytań) na najstarszą z nich:
      // liczy się w oknie zmian okolicy, a przy wyczerpanym oknie nic nie zwalniamy. Bez await między sprawdzeniem
      // a doliczeniem, więc równoległe żądania nie obejdą limitu.
      const id = String(s.konto.id);
      const jest = baza.klatka(klucz);
      const przenosi = !!jest && jest.konto === s.konto.id && jest.siedziba && baza.liczbaKlatek(s.konto.id) > 1;
      if (przenosi) {
        const czekaj = zmianyStartu.zablokowany(id);
        if (czekaj) throw zaDuzo(czekaj, ZA_CZESTO_OKOLICA);
      }
      if (!baza.zwolnijKlatke(s.konto.id, klucz)) throw new BladHttp(404, 'nie_ma', 'Nie macie takiej klatki.');
      if (przenosi) zmianyStartu.dolicz(id);
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
    const id = s.konto.id;
    const czekaj = zapisy.zablokowany(String(id));
    if (czekaj) throw zaDuzo(czekaj, 'Za często zapisujecie. Spróbujcie za chwilę.');
    if (zapisyWToku.has(id)) throw zaDuzo(5, 'Poprzedni zapis jeszcze się wysyła.');
    zapisy.dolicz(String(id));
    zapisyWToku.add(id);
    try {
      const b = await czytajJson(k.req, limitZapisu + 4096);
      const { dane, wersja } = b;
      if (!dane || typeof dane !== 'object' || Array.isArray(dane))
        throw new BladHttp(400, 'zle_dane', 'Zapis musi być obiektem JSON.');
      if (wersja !== undefined && (typeof wersja !== 'number' || !Number.isInteger(wersja) || wersja < 0))
        throw new BladHttp(400, 'zle_dane', 'Zła wersja zapisu.');
      if (maAdres(dane as Record<string, unknown>))
        throw new BladHttp(
          422,
          'adres_w_zapisie',
          'Zapis w chmurze nie może zawierać adresu (data.addr, data.street, tagi addr:*, nazwa z numerem).',
        );
      const tekst = JSON.stringify(dane);
      const rozmiar = Buffer.byteLength(tekst);
      if (rozmiar > limitZapisu) throw new BladHttp(413, 'za_duze', 'Zapis jest za duży.');
      const spakowany = await gzipA(tekst);
      // od tego miejsca bez await: sesja sprawdzona jeszcze raz i zapis w bazie w jednym kawałku
      sesjaDalej(k, s);
      const zmieniony = teraz();
      const nowa = baza.ustawZapis(id, spakowany, rozmiar, zmieniony, wersja as number | undefined);
      if (nowa === null)
        throw new BladHttp(
          409,
          'konflikt_wersji',
          'Na serwerze jest nowszy zapis.',
          {},
          { wersja: baza.wersjaZapisu(id) },
        );
      const out: ZapisanoOdpowiedz = { wersja: nowa, zmieniony, rozmiar };
      wyslij(k.res, 200, out, k.naglowki);
    } finally {
      zapisyWToku.delete(id);
    }
  };

  const usunZapis: Obsluga = async (k) => {
    const s = wymagajSesji(k);
    baza.usunZapis(s.konto.id, k.teraz);
    wyslij(k.res, 204, undefined, k.naglowki);
  };

  const zdarzenie: Obsluga = async (k) => {
    const czekaj = zdarzenia.zablokowany(k.ip);
    if (czekaj) throw zaDuzo(czekaj, 'Za dużo zdarzeń z tego miejsca. Spróbujcie później.');
    // próba liczy się od razu (przed await), a odlicza, jeśli zdarzenie nie zostało przyjęte; bez sesji i bez ciasteczka
    zdarzenia.dolicz(k.ip);
    let przyjete = false;
    try {
      const { z } = await czytajJson(k.req, MALE_CIALO);
      if (typeof z !== 'string' || !ZDARZENIE_WZOR.test(z)) throw new BladHttp(400, 'zle_dane', 'Nieznane zdarzenie.');
      baza.dolicz(dzienUtc(k.teraz), z);
      przyjete = true;
      wyslij(k.res, 204, undefined, k.naglowki);
    } finally {
      if (!przyjete) zdarzenia.odlicz(k.ip);
    }
  };

  /** GET /api/adres?q=&j=pl|en: bez sesji. Próba liczy się od razu (przed await), także trafienie w pamięć i zapytanie
      błędne. Tekstu zapytania nie zapisujemy: do dziennika idą same powody awarii, a niespodziewany wyjątek wyszukiwarki
      idzie dalej bez swojego komunikatu (mógłby nieść zapytanie), tylko z nazwą błędu. */
  const adres: Obsluga = async (k) => {
    const czekaj = adresy.zablokowany(k.ip);
    if (czekaj) throw zaDuzo(czekaj, 'Za dużo wyszukiwań adresu z tego miejsca. Spróbujcie za chwilę.');
    adresy.dolicz(k.ip);
    const q = (k.url.searchParams.get('q') ?? '').trim();
    if (!q || q.length > ADRES_MAX_ZNAKOW)
      throw new BladHttp(400, 'zle_dane', `Podajcie adres, najwyżej ${ADRES_MAX_ZNAKOW} znaków.`);
    const j = k.url.searchParams.get('j') ?? 'pl';
    if (j !== 'pl' && j !== 'en') throw new BladHttp(400, 'zle_dane', 'Język to pl albo en.');
    let wynik: Awaited<ReturnType<typeof szukajAdresu.szukaj>>;
    try {
      wynik = await szukajAdresu.szukaj(q, j);
    } catch (e) {
      if (!(e instanceof AdresNiedostepny))
        throw new Error(`wyszukiwarka adresów: ${e instanceof Error ? e.name : typeof e}`);
      if (k.teraz - awariaAdresuOd >= MIN) {
        awariaAdresuOd = k.teraz;
        dziennik(`adres: wyszukiwanie niedostępne (${e.message})`);
      }
      throw new BladHttp(503, 'serwer_zajety', 'Wyszukiwarka adresów jest teraz niedostępna. Spróbujcie za chwilę.', {
        'Retry-After': '5',
      });
    }
    if (!wynik) throw new BladHttp(404, 'nie_ma', KOMUNIKAT_BRAK_ADRESU);
    wyslij(k.res, 200, wynik, k.naglowki);
  };

  /** trasa istnieje tylko z tokenem w opcjach (TRASY), więc `zgodnySkrot` nigdy nie dostaje tu null */
  const odczytajLiczniki: Obsluga = async (k) => {
    const czekaj = zleTokeny.zablokowany(k.ip);
    if (czekaj) throw zaDuzo(czekaj, 'Za dużo nieudanych prób. Spróbujcie za kilka minut.');
    const podany = /^Bearer\s+(.+)$/i.exec(k.req.headers.authorization ?? '')?.[1];
    if (!zgodnySkrot(tokenSkrot, podany)) {
      zleTokeny.dolicz(k.ip);
      throw new BladHttp(401, 'brak_sesji', 'Zły albo brakujący token.', { 'WWW-Authenticate': 'Bearer' });
    }
    const surowe = k.url.searchParams.get('od');
    const od = surowe === null ? 0 : liczba(surowe);
    if (!Number.isFinite(od) || od < 0)
      throw new BladHttp(400, 'zle_dane', 'Parametr od to chwila w ms od 1970, liczba nieujemna.');
    const out: Liczniki = { liczniki: baza.liczniki(od), powroty: baza.powroty(od) };
    wyslij(k.res, 200, out, k.naglowki);
  };

  const TRASY: Record<string, Record<string, Obsluga>> = {
    '/api/zdrowie': { GET: zdrowie },
    '/api/konto': { POST: zalozKonto, GET: kimJestem, DELETE: usunKonto },
    '/api/sesja': { POST: zalogujSie, DELETE: wyloguj },
    '/api/druzyna': { POST: zalozDruzyne },
    '/api/druzyna/kod': { POST: wymienKod },
    '/api/druzyna/powrot': { POST: powrotDoDruzyny },
    '/api/druzyna/start': { PUT: ustawStart },
    '/api/klatki': { GET: klatkiWProstokacie, POST: zajmijKlatke },
    '/api/klatki/moje': { GET: mojeKlatki, DELETE: zwolnijMoje },
    '/api/zapis': { GET: pobierzZapis, PUT: wyslijZapis, DELETE: usunZapis },
    '/api/zdarzenie': { POST: zdarzenie },
    '/api/adres': { GET: adres },
    // bez tokenu w opcjach tej trasy nie ma w ogóle (404 dla każdej metody), więc nic nie zdradza, że istnieje
    ...(tokenSkrot ? { '/api/liczniki': { GET: odczytajLiczniki } } : {}),
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
    if (zrodla.length) return !pasujeZrodlo(origin, zrodla);
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
    const { ip, zrodlo: ipZrodlo } = ipZ(req);
    const k: Kontekst = { req, res, url, ip, ipZrodlo, teraz: teraz(), naglowki: {} };
    const metoda = req.method ?? 'GET';
    try {
      const czekaj = zadania.zablokowany(k.ip);
      if (czekaj) throw zaDuzo(czekaj, 'Za dużo żądań. Zwolnijcie trochę.');
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
      const t = teraz();
      baza.usunWygasleSesje(t);
      for (const o of okna) o.sprzataj();
      if (t - wygasanieOd < GODZ) return;
      wygasanieOd = t;
      // punkt startu, z którego nikt nie korzysta tak długo jak żyje sesja, nie jest już potrzebny (nie rośnie bez końca)
      for (const [id, p] of punktyStartu) if (t - p.uzyty > sesjaMs) punktyStartu.delete(id);
      try {
        // granica to początek doby: `ostatnio` ma dokładność doby, więc wizyta daje drużynie pełne N dni
        const granica = (ms: number) => dzienUtc(t - ms);
        baza.zwolnijKlatkiNieaktywnych(granica(klatkiMs));
        baza.usunNieaktywneKonta(granica(kontaMs));
      } catch (e) {
        dziennik(`błąd wygasania klatek i kont: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    zamknij() {
      baza.zamknij();
    },
  };
}
