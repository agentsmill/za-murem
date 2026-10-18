/* Protokół gry sieciowej (etap 1, docs/superpowers/specs/2026-10-18-multiplayer-design.md): ścieżki API pod /api,
   typy żądań i odpowiedzi, limity i kody błędów. Wspólny dla serwera (server/) i klienta (src/net/api.ts), więc
   nie importuje niczego z gry: serwer w kontenerze dostaje tylko ten plik.

   Kontrakt w skrócie:
   - konto to nick i hasło, bez e-maila; sesja w ciasteczku HttpOnly (klient go nie widzi ani nie wysyła sam),
   - inni gracze widzą tylko, że klatka jest zajęta („moja: false”), nigdy czyj to nick ani numer konta,
   - klucze klatek i budynków liczy klient (src/world/klucze.ts); serwer sprawdza ich postać i to, czy pozycja
     klatki leży przy budynku z klucza (kotwicaKlucza), więc nie da się zająć klatki w innym mieście,
   - zapis gry w chmurze to obiekt JSON bez tekstu adresu: bez data.addr i data.street, bez tagów addr:* przy
     budynkach w data.geo i bez cyfr w data.name (zapisBezAdresu czyści, maAdres sprawdza). */

/** wersja protokołu w odpowiedzi /api/zdrowie */
export const API_WERSJA = 1;

export const NICK_MIN = 3;
export const NICK_MAX = 24;
/** nick: litery (także polskie), cyfry, podkreślnik, kropka i myślnik */
export const NICK_WZOR = /^[\p{L}\p{N}_.-]+$/u;
export const HASLO_MIN = 8;
export const HASLO_MAX = 200;
/** klucz budynku „px:X:Y:DX:DY:S” z src/world/klucze.ts: liczby całkowite bez zer na początku (jedna postać na
    budynek), S to 1, 2 albo 3 */
const PX = 'px:(0|[1-9]\\d{0,8}):(0|[1-9]\\d{0,8}):(0|-?[1-9]\\d{0,8}):(0|[1-9]\\d{0,8}):[123]';
export const KLUCZ_BUDYNKU_WZOR = new RegExp(`^${PX}$`);
/** klucz klatki: klucz budynku, ukośnik i numer klatki od 1 */
export const KLUCZ_KLATKI_WZOR = new RegExp(`^(${PX})/([1-9]\\d{0,2})$`);
export const KLUCZ_MAX = 96;

/** globalne piksele kafelków poziomu 14 (4096 na kafelek, Merkator) → [lat, lon]; jak latLonZ w klucze.ts */
export function stopnieZPikseli(x: number, y: number): [number, number] {
  const n = 2 ** 26;
  return [(Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI, (x / n) * 360 - 180];
}

/** odległość w metrach (przybliżenie równoodległościowe jak w geometrii gry, dokładne na kilometry) */
export function odlegloscM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const kx = 111320 * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
  return Math.sqrt(((lon2 - lon1) * kx) ** 2 + ((lat2 - lat1) * 110574) ** 2);
}

/** zapas między rozpiętością budynku a odległością środka klatki od kotwicy (na kafelkach testowych najwyżej 21 m) */
export const ZAPAS_KLATKI_M = 50;

/** Kotwica klucza budynku: najwyższy wierzchołek obrysu (stopnie) i rozpiętość do najniższego (metry). Środek każdej
    klatki tego budynku leży najwyżej rozpietoscM + ZAPAS_KLATKI_M od kotwicy. Null, gdy klucz ma złą postać. */
export function kotwicaKlucza(budynek: string): { lat: number; lon: number; rozpietoscM: number } | null {
  const m = KLUCZ_BUDYNKU_WZOR.exec(budynek);
  if (!m) return null;
  const [x, y, dx, dy] = [m[1], m[2], m[3], m[4]].map(Number);
  const [lat, lon] = stopnieZPikseli(x, y);
  const [lat2, lon2] = stopnieZPikseli(x + dx, y + dy);
  return { lat, lon, rozpietoscM: odlegloscM(lat, lon, lat2, lon2) };
}

/** nick do porównań (wielkość liter bez znaczenia, ta sama postać znaków Unicode) */
export const nickKlucz = (nick: string): string => nick.normalize('NFC').toLocaleLowerCase('pl');

/** Sprawdzenie nicku po stronie klienta i serwera; null, gdy dobry, inaczej powód po polsku. */
export function zlyNick(nick: unknown): string | null {
  if (typeof nick !== 'string') return 'Podajcie nick.';
  const n = nick.normalize('NFC');
  if ([...n].length < NICK_MIN || [...n].length > NICK_MAX) return `Nick ma od ${NICK_MIN} do ${NICK_MAX} znaków.`;
  if (!NICK_WZOR.test(n)) return 'W nicku mogą być litery, cyfry, kropka, podkreślnik i myślnik.';
  return null;
}

/** Sprawdzenie hasła; null, gdy dobre. */
export function zleHaslo(haslo: unknown): string | null {
  if (typeof haslo !== 'string') return 'Podajcie hasło.';
  if (haslo.length < HASLO_MIN) return `Hasło ma co najmniej ${HASLO_MIN} znaków.`;
  if (haslo.length > HASLO_MAX) return `Hasło ma najwyżej ${HASLO_MAX} znaków.`;
  return null;
}

/** Kody błędów w polu „blad” odpowiedzi; siec, czas i brak_serwera daje tylko klient. */
export type KodBledu =
  | 'zle_dane'
  | 'zly_nick'
  | 'zle_haslo'
  | 'nick_zajety'
  | 'brak_sesji'
  | 'zle_logowanie'
  | 'za_duzo_prob'
  | 'zajeta'
  | 'nie_ma'
  | 'limit_klatek'
  | 'za_daleko'
  | 'zla_pozycja'
  | 'serwer_zajety'
  | 'konflikt_wersji'
  | 'za_duze'
  | 'adres_w_zapisie'
  | 'brak_zapisu'
  | 'zly_typ'
  | 'obce_zrodlo'
  | 'zla_metoda'
  | 'blad_serwera'
  | 'siec'
  | 'czas'
  | 'brak_serwera';

export interface Blad {
  blad: KodBledu;
  /** zdanie dla gracza po polsku */
  komunikat: string;
  /** przy konflikt_wersji: wersja zapisu na serwerze */
  wersja?: number;
}

/** GET /api/zdrowie */
export interface Zdrowie {
  ok: true;
  gra: 'za-murem';
  wersja: number;
}

/** POST /api/konto (załóż) i POST /api/sesja (zaloguj) */
export interface DaneLogowania {
  nick: string;
  haslo: string;
}

/** DELETE /api/konto: hasło jeszcze raz, żeby nikt nie skasował konta z cudzego komputera jednym kliknięciem */
export interface UsunKonto {
  haslo: string;
}

/** odpowiedź POST /api/konto, POST /api/sesja i GET /api/konto */
export interface Ja {
  nick: string;
  /** chwila założenia konta (ms od 1970) */
  utworzone: number;
  /** liczba zajętych klatek */
  klatki: number;
  /** czy jest zapis w chmurze */
  zapis: boolean;
}

/** prostokąt w stopniach: południe, zachód, północ, wschód (GET /api/klatki?s=&w=&n=&e=) */
export interface Prostokat {
  s: number;
  w: number;
  n: number;
  e: number;
}
/** największy prostokąt zapytania w stopniach (około 5,5 km) i najwięcej klatek w odpowiedzi */
export const PROSTOKAT_MAX_SZER = 0.05;
export const PROSTOKAT_MAX_DLUG = 0.08;
export const KLATKI_W_ODPOWIEDZI_MAX = 2000;

/** POST /api/klatki: klatka do zajęcia; pozycja to środek klatki z klatkiBudynku (src/world/klucze.ts) */
export interface ZajmijKlatke {
  klucz: string;
  budynek: string;
  lat: number;
  lon: number;
}

/** zajęta klatka w odpowiedziach; cudza ma tylko klucz, pozycję i moja: false */
export interface ZajetaKlatka {
  klucz: string;
  budynek: string;
  /** stopnie, zaokrąglone do 1e-5 (około 1 m) */
  lat: number;
  lon: number;
  moja: boolean;
  /** tylko moje: pierwsza klatka drużyny, od niej liczy się promień zajmowania */
  siedziba?: boolean;
}

/** GET /api/klatki i GET /api/klatki/moje */
export interface ListaKlatek {
  klatki: ZajetaKlatka[];
}

/** POST /api/klatki */
export interface ZajetaOdpowiedz {
  klatka: ZajetaKlatka;
}

/** PUT /api/zapis: dane to obiekt zapisu gry (jak w localStorage) bez data.addr i data.street; wersja to wersja
    zapisu, którą klient ostatnio widział (0, gdy nie było zapisu); bez wersji serwer nadpisuje bez sprawdzania */
export interface WyslijZapis {
  dane: Record<string, unknown>;
  wersja?: number;
}

/** odpowiedź PUT /api/zapis */
export interface ZapisanoOdpowiedz {
  wersja: number;
  zmieniony: number;
  /** bajty JSON zapisu */
  rozmiar: number;
}

/** GET /api/zapis */
export interface ZapisChmura extends ZapisanoOdpowiedz {
  dane: Record<string, unknown>;
}

type Obiekt = Record<string, unknown>;
const obiekt = (v: unknown): v is Obiekt => !!v && typeof v === 'object' && !Array.isArray(v);
/** budynki geometrii w zapisie (data.geo.b) */
const budynkiZapisu = (d: Obiekt): unknown[] => {
  const geo = d.geo;
  return obiekt(geo) && Array.isArray(geo.b) ? geo.b : [];
};
/** nazwa osiedla z cyframi to zwykle wpisany adres albo ulica z numerem (load.ts bierze wpisany tekst, gdy
    geokoder nie poda nazwy okolicy ani ulicy) */
const nazwaJakAdres = (d: Obiekt): boolean =>
  typeof d.name === 'string' && (/\d/.test(d.name) || (typeof d.street === 'string' && d.name === d.street));

/** Zapis gry bez tekstu adresu: znikają data.addr (etykieta z geokodera), data.street i tagi addr:* przy budynkach
    w data.geo, a nazwa osiedla wyglądająca na adres zmienia się na „Osiedle”. Reszta bez zmian (kopia, oryginał
    zostaje). Współrzędne (geo.c i obrysy) zostają: bez nich gra nie odtworzy świata. */
export function zapisBezAdresu<T extends Obiekt>(zapis: T): T {
  const data = zapis.data;
  if (!obiekt(data)) return zapis;
  const { addr: _addr, street: _street, ...reszta } = data;
  const out: Obiekt = { ...reszta };
  if (nazwaJakAdres(data)) out.name = 'Osiedle';
  const geo = data.geo;
  if (obiekt(geo) && Array.isArray(geo.b))
    out.geo = {
      ...geo,
      b: geo.b.map((b) => {
        if (!obiekt(b) || !obiekt(b.t)) return b;
        const t = Object.fromEntries(Object.entries(b.t).filter(([k]) => !k.startsWith('addr:')));
        return { ...b, t };
      }),
    };
  return { ...zapis, data: out };
}

/** Czy zapis ma tekst adresu (serwer takiego nie przyjmuje): data.addr, data.street, tagi addr:* przy budynkach
    albo nazwa osiedla z cyframi. */
export function maAdres(zapis: Obiekt): boolean {
  const d = zapis.data;
  if (!obiekt(d)) return false;
  if ((typeof d.addr === 'string' && d.addr !== '') || (typeof d.street === 'string' && d.street !== '')) return true;
  if (nazwaJakAdres(d)) return true;
  return budynkiZapisu(d).some((b) => obiekt(b) && obiekt(b.t) && Object.keys(b.t).some((k) => k.startsWith('addr:')));
}
