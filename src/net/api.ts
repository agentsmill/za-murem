/* Klient API gry sieciowej (etap 1, docs/superpowers/specs/2026-10-18-multiplayer-design.md): fetch do /api tej
   samej domeny z ciasteczkiem sesji (credentials: 'same-origin'; ciasteczko jest HttpOnly, więc kod gry go nie
   widzi), typy i kody błędów z src/net/protokol.ts.

   Każda metoda zwraca Wynik: { ok: true, dane } albo { ok: false, blad, komunikat }, bez wyjątków; brak sieci to
   blad 'siec', przekroczony czas 'czas', odpowiedź, która nie jest JSON-em z serwera gry (np. strona 404 z GitHub
   Pages), 'brak_serwera'. serwerDostepny() mówi, czy pod /api odpowiada serwer gry: na Pages i w demach offline
   go nie ma i gra działa jak dotąd.

   Trasy: konto z nickiem (zaloz, zaloguj, wyloguj, ja, usunKonto), drużyna anonimowa bez nicku i hasła (druzyna,
   nowyKod, powrot kodem z innej przeglądarki, punktStartu, usunDruzyne), zajęte klatki (zajete, zajmij, zwolnij,
   zwolnijWszystkie, moje), zapis w chmurze, liczniki (zdarzenie, bez sesji) i wyszukiwanie adresu przez serwer (adres,
   bez sesji). Serwer chce JSON w każdym POST i PUT, także bez danych, więc druzyna, nowyKod i usunDruzyne niosą `{}`
   (samo `zadanie` ustawia Content-Type tylko przy podanym ciele). Czas na odpowiedź: domyślnie 10 s, zdrowie i
   zdarzenie 3 s, adres 8 s (serwer czeka w kolejce do Nominatim); krótszy `czas` z opcji skraca też te.

   Nic tu nie rusza gry. Etap 2 podepnie klienta pod ekran startowy i symulację: odpowiedzi serwera wchodzą do gry
   tylko jako jawne wejście startu albo polecenie w kolejce stanu, nigdy w środku kroku symulacji.

   Język: komunikat w Wyniku jest zawsze polski, tak jak przyszedł z serwera (serwer mówi po polsku) albo z KOMUNIKATY.
   Angielska wersja gry pokazuje go przez komunikatEn: znany kod błędu po angielsku (przy kodach z kilkoma zdaniami
   według polskiego zdania serwera), nieznany kod tak, jak przyszedł. txBledu daje oba naraz (Tx), komunikatBledu
   napis w bieżącym języku. */

import { type Tx, tr, tx } from '../core/jezyk.ts';
import {
  ADRES_MAX_ZNAKOW,
  type Blad,
  type DaneLogowania,
  type Ja,
  KOMUNIKAT_BRAK_ADRESU,
  type KodBledu,
  type KodPowrotu,
  type ListaKlatek,
  POWODY_LOGOWANIA,
  type PowrotDruzyny,
  type Prostokat,
  type PunktStartu,
  type WynikAdresu,
  type WyslijZapis,
  type ZajetaOdpowiedz,
  type ZajmijKlatke,
  type ZapisanoOdpowiedz,
  type ZapisChmura,
  type Zdrowie,
  zapisBezAdresu,
} from './protokol.ts';

export type Wynik<T> =
  | { ok: true; status: number; dane: T }
  | {
      ok: false;
      /** kod HTTP; 0, gdy odpowiedzi nie było */
      status: number;
      blad: KodBledu;
      komunikat: string;
      /** przy 429: za ile sekund spróbować */
      ponowZa?: number;
      /** przy konflikt_wersji: wersja zapisu na serwerze */
      wersja?: number;
    };

export interface OpcjeApi {
  /** adres API, domyślnie '/api' (ta sama domena co gra) */
  baza?: string;
  /** fetch do podmiany w testach */
  fetch?: typeof fetch;
  /** czas na odpowiedź w ms (domyślnie 10 s; zdrowie 3 s) */
  czas?: number;
}

const KOMUNIKATY: Partial<Record<KodBledu, string>> = {
  siec: 'Brak połączenia z serwerem gry.',
  czas: 'Serwer gry nie odpowiedział na czas.',
  brak_serwera: 'Pod tym adresem nie ma serwera gry.',
};
/** czas na odpowiedź w ms: zdarzenie do liczników (gra nie czeka) i wyszukiwanie adresu (serwer czeka w kolejce) */
const CZAS_ZDARZENIA = 3000;
const CZAS_ADRESU = 8000;
/** zdanie klienta, gdy odpowiedź z błędem nie ma własnego */
const OGOLNY = 'Coś poszło nie tak.';

/** błąd z Wyniku: kod, polski komunikat i (przy 429) za ile sekund spróbować */
export type BladWyniku = { blad: KodBledu | string; komunikat: string; ponowZa?: number };

/** angielskie zdanie z polskiego komunikatu przy danym kodzie */
type NaAngielski = (pl: string, b: BladWyniku) => string;

/** zdanie z mapy po polskim zdaniu (tylko własne klucze mapy) */
const zMapy = (mapa: Readonly<Record<string, string>>, pl: string): string | undefined =>
  Object.hasOwn(mapa, pl) ? mapa[pl] : undefined;

/** po polskim zdaniu z mapy, a bez dopasowania ogólne zdanie kodu */
const zdania =
  (mapa: Readonly<Record<string, string>>, ogolne: string): NaAngielski =>
  (pl) =>
    zMapy(mapa, pl) ?? ogolne;

/** zdanie z liczbą (limit klatek, promień): liczba z polskiego zdania, bez niej ogólne */
const zLiczba =
  (wzor: RegExp, en: (n: string) => string, ogolne: string): NaAngielski =>
  (pl) => {
    const m = wzor.exec(pl);
    return m ? en(m[1]) : ogolne;
  };

/** powody złego nicku i hasła z protokol.ts: polskie zdanie serwera → angielskie */
const LOGOWANIE_EN: Readonly<Record<string, string>> = Object.fromEntries(
  Object.values(POWODY_LOGOWANIA).map((p) => [p.pl, p.en]),
);

/** za dużo prób: zdanie bez „spróbujcie”, a kiedy spróbować, mówi czas z nagłówka Retry-After */
const PROBY_EN: Readonly<Record<string, string>> = {
  'Za dużo nowych kont z tego miejsca. Spróbujcie później.': 'Too many new accounts from here.',
  'Za dużo nowych drużyn z tego miejsca. Spróbujcie później.': 'Too many new teams from here.',
  'Za często wymieniacie kod. Spróbujcie później.': 'You are changing your return code too often.',
  'Za dużo zdarzeń z tego miejsca. Spróbujcie później.': 'Too many events from here.',
  'Za dużo wyszukiwań adresu z tego miejsca. Spróbujcie za chwilę.': 'Too many address searches from here.',
  'Za często zmieniacie okolicę drużyny (siedzibę albo punkt startu). Spróbujcie później.':
    'You are changing your team’s HQ or start point too often.',
  'Za dużo nieudanych prób. Spróbujcie za kilka minut.': 'Too many failed attempts.',
  'Za dużo nieudanych prób na to konto. Spróbujcie za kilka minut.': 'Too many failed attempts on this account.',
  'Za często zapisujecie. Spróbujcie za chwilę.': 'You are saving too often.',
  'Poprzedni zapis jeszcze się wysyła.': 'The previous save is still uploading.',
};

/** Komunikaty po angielsku dla każdego kodu błędu (serwer w server/app.ts i server/http.ts, klient tutaj). */
const BLEDY_EN: Readonly<Record<KodBledu, NaAngielski>> = {
  zle_dane: zdania(
    {
      'Podajcie nick i hasło.': 'Enter a username and a password.',
      'Dane nie są poprawnym JSON.': 'The data is not valid JSON.',
      'Oczekiwany obiekt JSON.': 'A JSON object was expected.',
      'Zły klucz albo pozycja klatki.': 'Bad stairwell key or position.',
      'Zły klucz klatki.': 'Bad stairwell key.',
      'Zapis musi być obiektem JSON.': 'A save has to be a JSON object.',
      'Zła wersja zapisu.': 'Bad save version.',
      'Podajcie punkt startu: lat i lon w stopniach.': 'Provide a start point: lat and lon in degrees.',
      'Podajcie kod powrotu.': 'Enter a return code.',
      [`Podajcie adres, najwyżej ${ADRES_MAX_ZNAKOW} znaków.`]: `Enter an address, ${ADRES_MAX_ZNAKOW} characters at most.`,
    },
    'The server could not make sense of that request.',
  ),
  zly_nick: zdania(LOGOWANIE_EN, 'That username won’t do.'),
  zle_haslo: zdania(
    { ...LOGOWANIE_EN, 'Hasło nie może być nickiem.': 'Your password can’t be your username.' },
    'That password won’t do.',
  ),
  nick_zajety: () => 'That username is already taken.',
  brak_sesji: () => 'Log in first.',
  zle_logowanie: zdania({ 'Złe hasło.': 'Wrong password.' }, 'Wrong username or password.'),
  zly_kod: () => 'That return code doesn’t work. Check it and try again.',
  za_duzo_prob: (pl, b) => {
    const min = b.ponowZa ? Math.max(1, Math.ceil(b.ponowZa / 60)) : 0;
    return `${zMapy(PROBY_EN, pl) ?? 'Too many attempts.'} ${min ? `Try again in ${min} min.` : 'Try again later.'}`;
  },
  zajeta: () => 'Another team has already taken that stairwell.',
  nie_ma: zdania(
    {
      'Nie macie takiej klatki.': 'You don’t have that stairwell.',
      'Nie ma takiego adresu API.': 'No such API address.',
      [KOMUNIKAT_BRAK_ADRESU]: 'I couldn’t find that address. Try adding the city.',
    },
    'Not found.',
  ),
  limit_klatek: zLiczba(
    /najwyżej (\d+) klatek/,
    (n) => `A team can hold at most ${n} stairwells.`,
    'Your team has reached its stairwell limit.',
  ),
  za_daleko: zLiczba(
    /dalej niż (\d+) m/,
    (n) => `That stairwell is more than ${n} m from your HQ.`,
    'That stairwell is too far from your HQ.',
  ),
  zla_pozycja: () => 'That stairwell’s position or number doesn’t match its building.',
  poza_okolica: () => 'That area is too far from your team’s neighbourhood.',
  brak_startu: () => 'The server doesn’t know your team’s start point yet.',
  serwer_zajety: () => 'The server is busy. Try again in a moment.',
  konflikt_wersji: () => 'There is a newer save on the server.',
  za_duze: zdania({ 'Zapis jest za duży.': 'The save is too big.' }, 'Too much data.'),
  adres_w_zapisie: () => 'A cloud save can’t contain an address.',
  brak_zapisu: () => 'There is no save in the cloud.',
  zly_typ: () => 'Data has to be sent as application/json.',
  obce_zrodlo: () => 'Request from another site.',
  zla_metoda: () => 'That method doesn’t work at this address.',
  blad_serwera: () => 'Something went wrong on the server.',
  siec: () => 'No connection to the game server.',
  czas: () => 'The game server didn’t answer in time.',
  brak_serwera: () => 'There is no game server at this address.',
};

/** Komunikat błędu po angielsku: znany kod po angielsku, nieznany (nowszy serwer) tak, jak przyszedł; bez zdania
    z serwera (zostaje ogólne zdanie klienta) ogólne zdanie po angielsku. */
export function komunikatEn(b: BladWyniku): string {
  if (Object.hasOwn(BLEDY_EN, b.blad)) return BLEDY_EN[b.blad as KodBledu](b.komunikat, b);
  return b.komunikat === OGOLNY ? 'Something went wrong.' : b.komunikat;
}

/** komunikat błędu w obu językach: polski, jak przyszedł, i angielski z komunikatEn */
export const txBledu = (b: BladWyniku): Tx => tx(b.komunikat, komunikatEn(b));

/** komunikat błędu w bieżącym języku (po polsku dokładnie ten, który przyszedł) */
export const komunikatBledu = (b: BladWyniku): string => tr(txBledu(b));

/** Klient API; jeden na grę. */
export function utworzApi(opcje: OpcjeApi = {}) {
  const baza = (opcje.baza ?? '/api').replace(/\/$/, '');
  const f = opcje.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  const czasDomyslny = opcje.czas ?? 10_000;

  const porazka = (status: number, blad: KodBledu, komunikat?: string): Wynik<never> => ({
    ok: false,
    status,
    blad,
    komunikat: komunikat ?? KOMUNIKATY[blad] ?? OGOLNY,
  });

  async function zadanie<T>(metoda: string, sciezka: string, cialo?: unknown, czas = czasDomyslny): Promise<Wynik<T>> {
    const stop = new AbortController();
    const zegar = setTimeout(() => stop.abort(), czas);
    let r: Response;
    try {
      r = await f(baza + sciezka, {
        method: metoda,
        credentials: 'same-origin',
        headers:
          cialo === undefined
            ? { Accept: 'application/json' }
            : { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: cialo === undefined ? undefined : JSON.stringify(cialo),
        signal: stop.signal,
      });
    } catch {
      clearTimeout(zegar);
      return porazka(0, stop.signal.aborted ? 'czas' : 'siec');
    }
    try {
      if (r.status === 204) return { ok: true, status: 204, dane: undefined as T };
      const typ = r.headers.get('content-type') ?? '';
      if (!typ.includes('application/json')) return porazka(r.status, 'brak_serwera');
      const json = (await r.json()) as unknown;
      if (r.ok) return { ok: true, status: r.status, dane: json as T };
      const b = json as Partial<Blad>;
      if (typeof b?.blad !== 'string') return porazka(r.status, 'brak_serwera');
      const ponow = Number(r.headers.get('retry-after'));
      return {
        ok: false,
        status: r.status,
        blad: b.blad,
        komunikat: typeof b.komunikat === 'string' ? b.komunikat : (KOMUNIKATY[b.blad] ?? OGOLNY),
        ...(ponow > 0 ? { ponowZa: ponow } : {}),
        ...(typeof b.wersja === 'number' ? { wersja: b.wersja } : {}),
      };
    } catch {
      return porazka(r.status, stop.signal.aborted ? 'czas' : 'brak_serwera');
    } finally {
      clearTimeout(zegar);
    }
  }

  const klucz = (k: string) => encodeURIComponent(k);
  /** odpowiedź /api/zdrowie (krótki czas, bo pytamy przy starcie gry) */
  const zdrowie = () => zadanie<Zdrowie>('GET', '/zdrowie', undefined, Math.min(czasDomyslny, 3000));

  return {
    zdrowie,
    /** czy pod /api jest serwer gry Za Murem; false na GitHub Pages, offline i przy innym serwerze */
    async serwerDostepny(): Promise<boolean> {
      const r = await zdrowie();
      return r.ok && r.dane?.ok === true && r.dane.gra === 'za-murem';
    },
    /** nowe konto, od razu zalogowane */
    zaloz: (nick: string, haslo: string) => zadanie<Ja>('POST', '/konto', { nick, haslo } satisfies DaneLogowania),
    zaloguj: (nick: string, haslo: string) => zadanie<Ja>('POST', '/sesja', { nick, haslo } satisfies DaneLogowania),
    wyloguj: () => zadanie<undefined>('DELETE', '/sesja'),
    /** zalogowane konto; bez sesji null (serwer sprzed premiery: blad 'brak_sesji' z 401) */
    ja: () => zadanie<Ja | null>('GET', '/konto'),
    /** usuwa konto razem z klatkami i zapisem w chmurze (hasło jeszcze raz) */
    usunKonto: (haslo: string) => zadanie<undefined>('DELETE', '/konto', { haslo }),
    /** drużyna anonimowa bez nicku i hasła, od razu zalogowana (201); z ważną sesją serwer oddaje jej konto (200) i
        nie zakłada nowego. Wołać raz na start gry. Serwer chce JSON także przy pustym żądaniu, stąd `{}`. */
    druzyna: () => zadanie<Ja>('POST', '/druzyna', {}),
    /** nowy kod powrotu drużyny (XXXX-XXXX-XXXX), pokazywany graczowi raz; stary kod przestaje działać */
    nowyKod: () => zadanie<KodPowrotu>('POST', '/druzyna/kod', {}),
    /** powrót do drużyny z innej przeglądarki: kod w dowolnej wielkości liter, z myślnikami albo spacjami; zły kod to
        blad 'zly_kod' (401). Nowa sesja, stare dalej działają. */
    powrot: (kod: string) => zadanie<Ja>('POST', '/druzyna/powrot', { kod } satisfies PowrotDruzyny),
    /** punkt startu drużyny w stopniach: okolica zapytań o zajęte klatki, dopóki drużyna nie ma siedziby; zmiana
        okolicy ma dzienny limit (429 za_duzo_prob) */
    punktStartu: (lat: number, lon: number) =>
      zadanie<undefined>('PUT', '/druzyna/start', { lat, lon } satisfies PunktStartu),
    /** usuwa drużynę anonimową z klatkami i zapisem, bez hasła (konto z nickiem usuwa się przez usunKonto) */
    usunDruzyne: () => zadanie<undefined>('DELETE', '/konto', {}),
    /** zdarzenie do liczników na dobę (ZDARZENIE_WZOR w protokol.ts), bez sesji i bez śladu gracza; krótki czas, bo
        gra nie czeka na odpowiedź */
    zdarzenie: (z: string) => zadanie<undefined>('POST', '/zdarzenie', { z }, Math.min(czasDomyslny, CZAS_ZDARZENIA)),
    /** wyszukiwanie adresu przez serwer gry (nie przez przeglądarkę): bez sesji, ten sam kształt co wynik geokodera;
        blad 'nie_ma' (404), gdy takiego adresu nie ma, 'serwer_zajety' (503), gdy zawiodły oba źródła. Dłuższy czas,
        bo serwer czeka w kolejce do Nominatim. */
    adres: (q: string, j: 'pl' | 'en') =>
      zadanie<WynikAdresu>(
        'GET',
        `/adres?${new URLSearchParams({ q, j })}`,
        undefined,
        Math.min(czasDomyslny, CZAS_ADRESU),
      ),
    /** zajęte klatki w prostokącie (stopnie); cudze mają moja: false i nic więcej o drużynie */
    zajete: (p: Prostokat) => {
      const q = new URLSearchParams({ s: String(p.s), w: String(p.w), n: String(p.n), e: String(p.e) });
      return zadanie<ListaKlatek>('GET', `/klatki?${q}`);
    },
    /** zajmuje klatkę; blad 'zajeta' (409), gdy ma ją inna drużyna */
    zajmij: (k: ZajmijKlatke) => zadanie<ZajetaOdpowiedz>('POST', '/klatki', k),
    zwolnij: (kluczKlatki: string) => zadanie<undefined>('DELETE', `/klatki/${klucz(kluczKlatki)}`),
    zwolnijWszystkie: () => zadanie<undefined>('DELETE', '/klatki/moje'),
    moje: () => zadanie<ListaKlatek>('GET', '/klatki/moje'),
    pobierzZapis: () => zadanie<ZapisChmura>('GET', '/zapis'),
    /** zapis gry w chmurze bez tekstu adresu (data.addr i data.street znikają tutaj, zanim cokolwiek wyjdzie);
        wersja to ostatnio widziana wersja zapisu (0: nowy), bez niej serwer nadpisuje */
    wyslijZapis: (dane: Record<string, unknown>, wersja?: number) =>
      zadanie<ZapisanoOdpowiedz>('PUT', '/zapis', {
        dane: zapisBezAdresu(dane),
        ...(wersja === undefined ? {} : { wersja }),
      } satisfies WyslijZapis),
    usunZapis: () => zadanie<undefined>('DELETE', '/zapis'),
  };
}

export type ApiGry = ReturnType<typeof utworzApi>;
