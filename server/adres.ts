/* Wyszukiwanie adresu na serwerze (GET /api/adres w server/app.ts). Gra nie pyta już sama publicznego Nominatim:
   przy fali graczy (np. z Reddita) jego polityka (jedno zapytanie na sekundę, User-Agent z kontaktem) zablokowałaby
   wszystkich naraz. Serwer pyta za nich, spokojnie i raz na adres:

   - pamięć wyników w procesie: klucz to SHA-256 znormalizowanego zapytania z językiem (wielkość liter, spacje
     i złożenie znaków bez znaczenia, `kluczZapytania`), więc w pamięci nie leży ani tekst zapytania, ani adres IP.
     Najwyżej `wpisow` wpisów (5000): przy przepełnieniu odpada najstarszy, trafienie przenosi wpis na koniec.
     Wynik z Nominatim żyje `dniPamieci` dni (30), brak wyniku i wszystko z zapasowego Photona dobę. Dwa takie same
     zapytania naraz to jedno zapytanie na zewnątrz. Awarii nie pamiętamy;
   - kolejka do Nominatim: zapytania startują co najmniej `odstepMs` (1100 ms) po sobie. Każde dostaje swoje miejsce
     w czasie; gdyby miało czekać dłużej niż `czekajMaxMs` (3 s), nie staje w kolejce, tylko od razu pyta Photon. Po
     429 albo 403 od Nominatim (blokada) kolejka stoi minutę, a w tym czasie pyta się tylko Photon;
   - Photon (komoot) w zapasie: gdy Nominatim odpowie błędem, złą odpowiedzią albo nie zdąży w `czasMs` (6 s), pytamy
     Photon. Gdy zawiodą oba, `szukaj` rzuca AdresNiedostepny (trasa zamienia go na 503).
   Pusta odpowiedź Nominatim to „nie ma takiego adresu” (null) i Photon już się nie pyta; pusta odpowiedź samego
   Photona też.

   Tekst zapytania wychodzi tylko w adresie URL do dostawcy. Błędy dostawców nigdy nie przenoszą swoich komunikatów
   dalej (bywają w nich pełne adresy URL z zapytaniem): AdresNiedostepny niesie tylko krótkie powody („http 429”, „czas”,
   „siec”), więc dziennik błędów serwera nie dostaje tekstu zapytania. Zegar (`teraz`) i czekanie w kolejce (`uspij`)
   da się podać w opcjach, tak jak `fetch` (testy nie czekają na serio i nie sięgają do sieci). */

import { createHash } from 'node:crypto';
import type { WynikAdresu } from '../src/net/protokol.ts';

export type JezykAdresu = 'pl' | 'en';

export interface OpcjeAdresu {
  /** funkcja pobierania (domyślnie globalny fetch) */
  fetch?: typeof fetch;
  /** adres kontaktowy do User-Agent dla Nominatim (ZM_KONTAKT); brak: User-Agent bez tej części */
  kontakt?: string;
  /** zegar (ms od 1970); domyślnie Date.now */
  teraz?: () => number;
  /** najwięcej wpisów w pamięci wyników (domyślnie 5000) */
  wpisow?: number;
  /** na ile dni zapamiętać wynik z Nominatim (domyślnie 30); brak wyniku i wynik z Photona najwyżej na 1 dzień */
  dniPamieci?: number;
  /** odstęp między początkami zapytań do Nominatim (domyślnie 1100 ms) */
  odstepMs?: number;
  /** jak długo zapytanie może czekać w kolejce do Nominatim, zanim pójdzie do Photona (domyślnie 3000 ms) */
  czekajMaxMs?: number;
  /** czas na odpowiedź jednego dostawcy (domyślnie 6000 ms) */
  czasMs?: number;
  /** czekanie w kolejce o tyle ms (domyślnie setTimeout); testy podają własne, żeby nie czekać na serio */
  uspij?: (ms: number) => Promise<void>;
}

export interface Wyszukiwarka {
  /** wynik dla adresu, null gdy takiego adresu nie ma; rzuca AdresNiedostepny, gdy zawiodły Nominatim i Photon */
  szukaj(q: string, jezyk: JezykAdresu): Promise<WynikAdresu | null>;
}

/** Nominatim i Photon nie odpowiedziały sensownie. Komunikat to same powody („Nominatim: http 429; Photon: czas”),
    bez tekstu zapytania i bez komunikatów dostawców. */
export class AdresNiedostepny extends Error {}

/** awaria jednego dostawcy; `message` to krótki powód bez tekstu zapytania, `status` kod HTTP (0: nie HTTP) */
class Awaria extends Error {
  readonly status: number;
  constructor(powod: string, status = 0) {
    super(powod);
    this.status = status;
  }
}

const DOBA = 24 * 60 * 60_000;
const STRONA = 'https://zamurem.vercel.app';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&accept-language=';
const PHOTON = 'https://photon.komoot.io/api/?limit=1';
/** języki, które Photon zna (z innym odpowiada 400); polski idzie bez `lang` */
const PHOTON_JEZYKI: ReadonlySet<string> = new Set(['de', 'en', 'fr']);
/** jak długo po 429 albo 403 od Nominatim nie pytamy go wcale */
const PAUZA_PO_BLOKADZIE_MS = 60_000;

type Obiekt = Record<string, unknown>;
const obiekt = (v: unknown): v is Obiekt => !!v && typeof v === 'object' && !Array.isArray(v);
const tekst = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
/** liczba z liczby albo napisu (Nominatim podaje lat i lon jako napisy) w granicach ±max, inaczej null */
const wspolrzedna = (v: unknown, max: number): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : Number.NaN;
  return Number.isFinite(n) && Math.abs(n) <= max ? n : null;
};

/** Zapytanie bez zbędnych znaków: złożone znaki (NFC), spacje ściśnięte i obcięte. Tak idzie do dostawców. */
const oczysc = (q: string): string => q.normalize('NFC').replace(/\s+/g, ' ').trim();

/** Klucz pamięci: SHA-256 z zapytania w NFC, małymi literami (polskie reguły), ze spacjami ściśniętymi i obciętymi,
    plus język (etykieta jest w języku gry). Same wielkie litery, nadmiarowe spacje i rozłożone znaki nie zmieniają
    klucza. */
export function kluczZapytania(q: string, jezyk: JezykAdresu): string {
  const normalne = oczysc(q).toLocaleLowerCase('pl');
  return `${createHash('sha256').update(normalne).digest('hex')}:${jezyk}`;
}

/** Wynik z odpowiedzi Nominatim (jsonv2 z addressdetails): pola jak w `geocode` w src/world/osm.ts. Null, gdy lista
    jest pusta albo wpis nie ma sensownych współrzędnych. */
export function zNominatim(j: unknown): WynikAdresu | null {
  const wpis = Array.isArray(j) ? j[0] : null;
  if (!obiekt(wpis)) return null;
  const lat = wspolrzedna(wpis.lat, 90);
  const lon = wspolrzedna(wpis.lon, 180);
  if (lat === null || lon === null) return null;
  const a = obiekt(wpis.address) ? wpis.address : {};
  const area =
    tekst(a.neighbourhood) ||
    tekst(a.quarter) ||
    tekst(a.suburb) ||
    tekst(a.city_district) ||
    tekst(a.village) ||
    tekst(a.town) ||
    tekst(a.city);
  return {
    lat,
    lon,
    label: tekst(wpis.display_name),
    area,
    street: tekst(a.road),
    city: tekst(a.city) || tekst(a.town) || tekst(a.village),
  };
}

/** Wynik z odpowiedzi Photona (GeoJSON, pierwszy `features`): współrzędne to [lon, lat]. Ulica to `street`, a gdy
    wynikiem jest sama ulica (`osm_key` highway), jej nazwa. Okolica: locality, potem district, potem miasto (jak
    neighbourhood przed suburb przed miastem w Nominatim). Etykieta od najbardziej szczegółowego członu: nazwa miejsca,
    ulica z numerem, locality, district, miasto, bez powtórzeń obok siebie. Null, gdy brak wyniku albo współrzędnych. */
export function zPhotona(j: unknown): WynikAdresu | null {
  const cechy = obiekt(j) && Array.isArray(j.features) ? j.features[0] : null;
  if (!obiekt(cechy)) return null;
  const wspolrzedne = obiekt(cechy.geometry) ? cechy.geometry.coordinates : null;
  if (!Array.isArray(wspolrzedne)) return null;
  const lon = wspolrzedna(wspolrzedne[0], 180);
  const lat = wspolrzedna(wspolrzedne[1], 90);
  if (lat === null || lon === null) return null;
  const p = obiekt(cechy.properties) ? cechy.properties : {};
  const nazwa = tekst(p.name);
  const ulica = tekst(p.street) || (tekst(p.osm_key) === 'highway' ? nazwa : '');
  const locality = tekst(p.locality);
  const district = tekst(p.district);
  const city = tekst(p.city);
  const czlony = [
    nazwa === ulica ? '' : nazwa,
    [ulica, tekst(p.housenumber)].filter(Boolean).join(' '),
    locality,
    district,
    city,
  ].filter(Boolean);
  const label = czlony.filter((c, i) => c !== czlony[i - 1]).join(', ');
  return { lat, lon, label, area: locality || district || city, street: ulica, city };
}

/** czy błąd fetch to przekroczony czas (AbortSignal.timeout daje TimeoutError, ręczne przerwanie AbortError) */
const przekroczonyCzas = (e: unknown): boolean => {
  const nazwa = (e as { name?: unknown } | null)?.name;
  return nazwa === 'TimeoutError' || nazwa === 'AbortError';
};
const powodAwarii = (e: unknown): string => (e instanceof Awaria ? e.message : 'blad');

export function wyszukiwarka(o: OpcjeAdresu = {}): Wyszukiwarka {
  const dostep = o.fetch ?? ((...arg: Parameters<typeof fetch>) => fetch(...arg));
  const teraz = o.teraz ?? Date.now;
  const wpisow = o.wpisow ?? 5000;
  const pamietajMs = (o.dniPamieci ?? 30) * DOBA;
  const odstepMs = o.odstepMs ?? 1100;
  const czekajMaxMs = o.czekajMaxMs ?? 3000;
  const czasMs = o.czasMs ?? 6000;
  const uspij = o.uspij ?? ((ms: number) => new Promise<void>((ok) => setTimeout(ok, ms)));
  // kontakt do nagłówka tylko z drukowalnych znaków ASCII (zmienna środowiskowa bywa z końcem wiersza); bez kontaktu
  // User-Agent nie ma części po średniku
  const kontakt = (o.kontakt ?? '').replace(/[^\x20-\x7e]/g, '').trim();
  const userAgent = `ZaMurem/1.0 (+${STRONA}${kontakt ? `; ${kontakt}` : ''})`;

  /** pamięć wyników: kolejność we wstawieniu to kolejność od najstarszego, trafienie przenosi wpis na koniec */
  const pamiec = new Map<string, { wynik: WynikAdresu | null; wygasa: number }>();
  /** zapytania w toku: drugie takie samo czeka na pierwsze */
  const wLocie = new Map<string, Promise<WynikAdresu | null>>();
  /** najwcześniejsza chwila, w której może wystartować następne zapytanie do Nominatim */
  let nastepnySlot = Number.NEGATIVE_INFINITY;

  /** Miejsce w kolejce do Nominatim: za ile ms ma wystartować zapytanie, albo null, gdy trzeba by czekać dłużej niż
      `czekajMaxMs`. Miejsce rezerwuje się od razu (przed jakimkolwiek await), więc równoległe zapytania dostają
      kolejne chwile, a nie tę samą. */
  const zajmijMiejsce = (): number | null => {
    const t = teraz();
    const start = Math.max(t, nastepnySlot);
    if (start - t > czekajMaxMs) return null;
    nastepnySlot = start + odstepMs;
    return start - t;
  };

  const zapamietaj = (klucz: string, wynik: WynikAdresu | null, zNominatimu: boolean) => {
    pamiec.delete(klucz);
    while (pamiec.size >= wpisow) {
      const najstarszy = pamiec.keys().next();
      if (najstarszy.done) break;
      pamiec.delete(najstarszy.value);
    }
    const jakDlugo = wynik && zNominatimu ? pamietajMs : Math.min(pamietajMs, DOBA);
    pamiec.set(klucz, { wynik, wygasa: teraz() + jakDlugo });
  };

  /** zapytanie do dostawcy z limitem czasu; rzuca Awaria z krótkim powodem (nigdy z komunikatem fetch) */
  const pytaj = async (url: string): Promise<unknown> => {
    let r: Response;
    try {
      r = await dostep(url, {
        headers: { 'User-Agent': userAgent, Accept: 'application/json' },
        signal: AbortSignal.timeout(czasMs),
      });
    } catch (e) {
      throw new Awaria(przekroczonyCzas(e) ? 'czas' : 'siec');
    }
    if (!r.ok) {
      await r.body?.cancel().catch(() => {});
      throw new Awaria(`http ${r.status}`, r.status);
    }
    try {
      return await r.json();
    } catch (e) {
      throw new Awaria(przekroczonyCzas(e) ? 'czas' : 'zla odpowiedz');
    }
  };

  const nominatim = async (q: string, jezyk: JezykAdresu): Promise<WynikAdresu | null> => {
    const j = await pytaj(`${NOMINATIM}${jezyk}&q=${encodeURIComponent(q)}`);
    if (Array.isArray(j) && j.length === 0) return null;
    const wynik = zNominatim(j);
    if (!wynik) throw new Awaria('zla odpowiedz');
    return wynik;
  };

  const photon = async (q: string, jezyk: JezykAdresu): Promise<WynikAdresu | null> => {
    const lang = PHOTON_JEZYKI.has(jezyk) ? `&lang=${jezyk}` : '';
    const j = await pytaj(`${PHOTON}${lang}&q=${encodeURIComponent(q)}`);
    if (obiekt(j) && Array.isArray(j.features) && j.features.length === 0) return null;
    const wynik = zPhotona(j);
    if (!wynik) throw new Awaria('zla odpowiedz');
    return wynik;
  };

  /** Nominatim przez kolejkę, a gdy nie zdąży albo zawiedzie, Photon; wynik (także brak) idzie do pamięci */
  const zapytaj = async (q: string, jezyk: JezykAdresu, klucz: string): Promise<WynikAdresu | null> => {
    const powody: string[] = [];
    let wynik: WynikAdresu | null | undefined;
    let zNominatimu = false;
    const czekanie = zajmijMiejsce();
    if (czekanie === null) powody.push('Nominatim: kolejka');
    else {
      try {
        if (czekanie > 0) await uspij(czekanie);
        wynik = await nominatim(q, jezyk);
        zNominatimu = true;
      } catch (e) {
        powody.push(`Nominatim: ${powodAwarii(e)}`);
        // 429 i 403 to blokada: dobijanie się dalej tylko by ją przedłużyło
        if (e instanceof Awaria && (e.status === 429 || e.status === 403))
          nastepnySlot = Math.max(nastepnySlot, teraz() + PAUZA_PO_BLOKADZIE_MS);
      }
    }
    if (wynik === undefined) {
      try {
        wynik = await photon(q, jezyk);
      } catch (e) {
        powody.push(`Photon: ${powodAwarii(e)}`);
        throw new AdresNiedostepny(powody.join('; '));
      }
    }
    zapamietaj(klucz, wynik, zNominatimu);
    return wynik;
  };

  return {
    async szukaj(q, jezyk) {
      const klucz = kluczZapytania(q, jezyk);
      const wpis = pamiec.get(klucz);
      if (wpis) {
        pamiec.delete(klucz);
        if (wpis.wygasa > teraz()) {
          pamiec.set(klucz, wpis);
          return wpis.wynik;
        }
      }
      let w = wLocie.get(klucz);
      if (!w) {
        w = zapytaj(oczysc(q), jezyk, klucz).finally(() => wLocie.delete(klucz));
        wLocie.set(klucz, w);
      }
      return w;
    },
  };
}
