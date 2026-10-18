/* Protokół gry sieciowej (etap 1, docs/superpowers/specs/2026-10-18-multiplayer-design.md): ścieżki API pod /api,
   typy żądań i odpowiedzi, limity i kody błędów. Wspólny dla serwera (server/) i klienta (src/net/api.ts), więc
   nie importuje niczego z gry: serwer w kontenerze dostaje tylko ten plik.

   Kontrakt w skrócie:
   - konto to nick i hasło, bez e-maila; sesja w ciasteczku HttpOnly (klient go nie widzi ani nie wysyła sam),
   - inni gracze widzą tylko, że klatka jest zajęta („moja: false”), nigdy czyj to nick ani numer konta,
   - klucze klatek i budynków liczy klient (src/world/klucze.ts); serwer sprawdza tylko ich postać,
   - zapis gry w chmurze to obiekt JSON bez tekstu adresu (data.addr i data.street są odrzucane). */

/** wersja protokołu w odpowiedzi /api/zdrowie */
export const API_WERSJA = 1;

export const NICK_MIN = 3;
export const NICK_MAX = 24;
/** nick: litery (także polskie), cyfry, podkreślnik, kropka i myślnik */
export const NICK_WZOR = /^[\p{L}\p{N}_.-]+$/u;
export const HASLO_MIN = 8;
export const HASLO_MAX = 200;
/** klucz budynku: schemat (np. „px”) i liczby rozdzielone dwukropkami, jak z src/world/klucze.ts */
export const KLUCZ_BUDYNKU_WZOR = /^[a-z][a-z0-9]{0,7}:-?\d+(\.\d+)?(:-?\d+(\.\d+)?){1,5}$/;
/** klucz klatki: klucz budynku, ukośnik i numer klatki od 1 */
export const KLUCZ_KLATKI_WZOR = /^([a-z][a-z0-9]{0,7}:[0-9.:-]+)\/([1-9]\d{0,2})$/;
export const KLUCZ_MAX = 96;

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

/** Zapis gry bez tekstu adresu: data.addr (etykieta z geokodera) i data.street znikają, reszta bez zmian. */
export function zapisBezAdresu<T extends Record<string, unknown>>(zapis: T): T {
  const data = zapis.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return zapis;
  const { addr: _addr, street: _street, ...reszta } = data as Record<string, unknown>;
  return { ...zapis, data: reszta };
}

/** Czy zapis ma tekst adresu (serwer takiego nie przyjmuje). */
export function maAdres(zapis: Record<string, unknown>): boolean {
  const data = zapis.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const d = data as Record<string, unknown>;
  return (typeof d.addr === 'string' && d.addr !== '') || (typeof d.street === 'string' && d.street !== '');
}
