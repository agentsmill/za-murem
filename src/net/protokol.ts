/* Protokół gry sieciowej (etap 1, docs/superpowers/specs/2026-10-18-multiplayer-design.md): ścieżki API pod /api,
   typy żądań i odpowiedzi, limity i kody błędów. Wspólny dla serwera (server/) i klienta (src/net/api.ts), więc
   nie importuje niczego z gry: serwer w kontenerze dostaje tylko ten plik.

   Kontrakt w skrócie:
   - konto to nick i hasło, bez e-maila; sesja w ciasteczku HttpOnly (klient go nie widzi ani nie wysyła sam),
   - drużyna anonimowa to konto bez nicku i hasła, zakładane jednym POST-em przy pierwszym wejściu; wrócić do niej z
     innej przeglądarki można kodem powrotu (KOD_ALFABET, normalizujKod), a usunąć ją bez hasła,
   - inni gracze widzą tylko, że klatka jest zajęta („moja: false”), nigdy czyj to nick ani numer konta,
   - klucze klatek i budynków liczy klient (src/world/klucze.ts); serwer sprawdza ich postać i to, czy pozycja
     klatki leży przy budynku z klucza (kotwicaKlucza), więc nie da się zająć klatki w innym mieście,
   - klatki drużyny, która nie grała KLATKI_DNI dni, wracają do wolnych (konto, zapis i kod powrotu zostają); konto bez
     wizyty przez KONTA_DNI dni znika z klatkami, sesjami i zapisem (liczy się wizyta z dokładnością do doby),
   - zapis gry w chmurze to obiekt JSON bez tekstu adresu: bez data.addr i data.street, bez tagów addr:* przy
     budynkach w data.geo i bez cyfr w data.name (zapisBezAdresu czyści, maAdres sprawdza),
   - serwer mówi po polsku (komunikat w odpowiedzi z błędem); angielska wersja gry tłumaczy go u klienta po kodzie
     błędu (src/net/api.ts), a powody złego nicku i hasła mają tu angielską parę (POWODY_LOGOWANIA). */

/** wersja protokołu w odpowiedzi /api/zdrowie */
export const API_WERSJA = 1;

export const NICK_MIN = 3;
export const NICK_MAX = 24;
/** nick: litery (także polskie), cyfry, podkreślnik, kropka i myślnik */
export const NICK_WZOR = /^[\p{L}\p{N}_.-]+$/u;
export const HASLO_MIN = 8;
export const HASLO_MAX = 200;
/** po ilu dniach bez gry (bez żadnego żądania z sesją drużyny) jej klatki wracają do puli; konto, zapis i kod powrotu
    zostają. Serwer: `klatkiDni` w opcjach, ZM_KLATKI_DNI. Czyta to też informacja o danych w grze. */
export const KLATKI_DNI = 14;
/** po ilu dniach bez gry konto znika razem z sesjami, klatkami i zapisem (`kontaDni`, ZM_KONTA_DNI) */
export const KONTA_DNI = 180;
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

/** Powody złego nicku i hasła w obu językach: po polsku mówi serwer, po angielsku klient w angielskiej wersji gry
    (plik nie importuje niczego z gry, więc para to zwykły obiekt w kształcie Tx z src/core/jezyk.ts). */
export const POWODY_LOGOWANIA = {
  nickBrak: { pl: 'Podajcie nick.', en: 'Enter a username.' },
  nickDlugosc: {
    pl: `Nick ma od ${NICK_MIN} do ${NICK_MAX} znaków.`,
    en: `A username has ${NICK_MIN} to ${NICK_MAX} characters.`,
  },
  nickZnaki: {
    pl: 'W nicku mogą być litery, cyfry, kropka, podkreślnik i myślnik.',
    en: 'A username can only have letters, digits, full stops, underscores and hyphens.',
  },
  hasloBrak: { pl: 'Podajcie hasło.', en: 'Enter a password.' },
  hasloKrotkie: {
    pl: `Hasło ma co najmniej ${HASLO_MIN} znaków.`,
    en: `A password needs at least ${HASLO_MIN} characters.`,
  },
  hasloDlugie: {
    pl: `Hasło ma najwyżej ${HASLO_MAX} znaków.`,
    en: `A password can have at most ${HASLO_MAX} characters.`,
  },
} as const;
type PowodLogowania = keyof typeof POWODY_LOGOWANIA;

function powodNicku(nick: unknown): PowodLogowania | null {
  if (typeof nick !== 'string') return 'nickBrak';
  const n = nick.normalize('NFC');
  if ([...n].length < NICK_MIN || [...n].length > NICK_MAX) return 'nickDlugosc';
  if (!NICK_WZOR.test(n)) return 'nickZnaki';
  return null;
}

function powodHasla(haslo: unknown): PowodLogowania | null {
  if (typeof haslo !== 'string') return 'hasloBrak';
  if (haslo.length < HASLO_MIN) return 'hasloKrotkie';
  if (haslo.length > HASLO_MAX) return 'hasloDlugie';
  return null;
}

/** Sprawdzenie nicku po stronie klienta i serwera; null, gdy dobry, inaczej powód po polsku. */
export function zlyNick(nick: unknown): string | null {
  const p = powodNicku(nick);
  return p ? POWODY_LOGOWANIA[p].pl : null;
}

/** to samo sprawdzenie nicku z powodem po angielsku (klient w angielskiej wersji gry) */
export function zlyNickEn(nick: unknown): string | null {
  const p = powodNicku(nick);
  return p ? POWODY_LOGOWANIA[p].en : null;
}

/** Sprawdzenie hasła; null, gdy dobre. */
export function zleHaslo(haslo: unknown): string | null {
  const p = powodHasla(haslo);
  return p ? POWODY_LOGOWANIA[p].pl : null;
}

/** to samo sprawdzenie hasła z powodem po angielsku */
export function zleHasloEn(haslo: unknown): string | null {
  const p = powodHasla(haslo);
  return p ? POWODY_LOGOWANIA[p].en : null;
}

/** Kody błędów w polu „blad” odpowiedzi; siec, czas i brak_serwera daje tylko klient. */
export type KodBledu =
  | 'zle_dane'
  | 'zly_nick'
  | 'zle_haslo'
  | 'nick_zajety'
  | 'brak_sesji'
  | 'zle_logowanie'
  | 'zly_kod'
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
  /** skąd serwer bierze adres klienta do limitów (bez samego adresu): z nagłówka proxy Vercela z poprawnym
      sekretem, z X-Forwarded-For własnego proxy albo z adresu połączenia; starszy serwer pola nie wysyła */
  ip?: 'proxy' | 'xff' | 'polaczenie';
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

/** odpowiedź POST /api/konto, POST /api/druzyna, POST /api/sesja, POST /api/druzyna/powrot i GET /api/konto */
export interface Ja {
  /** nick konta; null u drużyny anonimowej (bez nicku i hasła) */
  nick: string | null;
  /** chwila założenia konta (ms od 1970) */
  utworzone: number;
  /** liczba zajętych klatek */
  klatki: number;
  /** czy jest zapis w chmurze */
  zapis: boolean;
  /** drużyna założona bez nicku i hasła (POST /api/druzyna) */
  anonimowe: boolean;
  /** jak drużynę nazwać na ekranie: nick konta z nickiem, „#” i numer u drużyny anonimowej */
  znak: string;
  /** czy drużyna ma kod powrotu (sam kod serwer pokazuje tylko raz, w odpowiedzi POST /api/druzyna/kod) */
  kod: boolean;
}

/** Kod powrotu: 12 znaków z tego alfabetu (bez 0, O, 1 i I, które łatwo pomylić przy przepisywaniu), pokazywany jako
    XXXX-XXXX-XXXX. 32 znaki to dokładnie 5 bitów na znak, razem 60 bitów. */
export const KOD_ALFABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const KOD_DLUGOSC = 12;
const KOD_WZOR = new RegExp(`^[${KOD_ALFABET}]{${KOD_DLUGOSC}}$`);

/** Kod w postaci do porównań: bez spacji i myślników, wielkimi literami. Null, gdy to nie jest kod (zła długość albo
    znak spoza alfabetu, także spoza ASCII). Serwer trzyma tylko skrót tej postaci. */
export function normalizujKod(s: string): string | null {
  if (typeof s !== 'string') return null;
  const bez = s.replace(/[\s-]+/g, '');
  if (!/^[A-Za-z0-9]+$/.test(bez)) return null;
  const kod = bez.toUpperCase();
  return KOD_WZOR.test(kod) ? kod : null;
}

/** POST /api/druzyna/kod: nowy kod powrotu drużyny (stary przestaje działać) */
export interface KodPowrotu {
  kod: string;
}

/** POST /api/druzyna/powrot: kod w dowolnej wielkości liter, z myślnikami albo spacjami */
export interface PowrotDruzyny {
  kod: string;
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
