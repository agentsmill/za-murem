/* Wczytanie osiedla: demo offline z public/demo albo adres (Nominatim → kafelki OpenFreeMap,
   a gdy nie odpowiadają, Overpass). Komunikaty dla gracza (status i błędy) są w bieżącym języku; dane osiedla nie
   zależą od języka: etykieta adresu zawsze po polsku (Nominatim wprost z accept-language=pl, a przez serwer gry z j=pl,
   bo z adresu liczy się ziarno i klucz imion). `loadAddress(q, status, api?)` bez `api` pyta tylko Nominatim, z `api`
   (klient serwera gry, podawany przy włączonej grze sieciowej) najpierw serwer gry, a w razie jego porażki Nominatim
   (szczegóły w nagłówku src/world/osm.ts). Dema mają też
   sąsiednie kwadraty miasta (loadDemoKwadraty, przy ?kwadraty= i przy ?osada=1).
   Sąsiedni kwadrat prawdziwego adresu (`geoKwadratu`, osada AI, ?osada=1) pobiera się tymi samymi kafelkami z=14 co dom
   (`kafelkiKwadratu`), ale dopiero po starcie gry, w tle i po jednym kwadracie: kafelki wspólne dla kilku kandydatów pobierają się
   i dekodują raz (pamięć jednego ładowania, `PamiecKafelkow`), a błąd pobrania kafelka odrzuca kwadrat i nie jest ponawiany. */

import { L } from '../core/jezyk.ts';
import type { ApiGry } from '../net/api.ts';
import type { Geo } from './geo.ts';
import { geoKwadratu as geoKwadratuZKafelkow } from './geoKwadratu.ts';
import { kafelkiKwadratu, type Uklad } from './kwadraty.ts';
import { type DecodedTile, decode, load as loadTiles, pobierzKafelek, WANT, Z } from './mvt.ts';
import { geocode, overpass, toGeo } from './osm.ts';
import { LOAD_RADIUS } from './world.ts';

export interface Loaded {
  geo: Geo;
  name: string;
  addr: string;
  street: string;
  src: 'demo' | 'mvt' | 'overpass';
  /** klucz dema (public/demo/<klucz>.json) dla src „demo”: z niego idzie plik sąsiednich kwadratów */
  key?: string;
}

export interface DemoInfo {
  key: string;
  name: string;
  addr: string;
  label: string;
}

export async function loadDemo(key: string): Promise<Loaded> {
  const r = await fetch(`demo/${encodeURIComponent(key)}.json`);
  if (!r.ok) throw new Error(L(`Nie ma takiego przykładu: ${key}`, `No such example: ${key}.`));
  const d = await r.json();
  return { geo: d.geo, name: d.name, addr: d.addr, street: d.street, src: 'demo', key };
}

/** Geo sąsiednich kwadratów dema (klucz kwadratu „sx,sy” → geo, zob. kwadraty.ts): osiem albo, gdy plik przekroczyłby
    1,5 MB, cztery boczne (Lanciego), z public/demo/<klucz>-kwadraty.json (tools/make-demos.ts). Plik pobiera się tylko
    przy ?kwadraty=…; dema w grze nie mają innych sąsiadów niż te z kafelków testowych. Brak pliku to błąd. */
export async function loadDemoKwadraty(key: string): Promise<Record<string, Geo>> {
  const r = await fetch(`demo/${encodeURIComponent(key)}-kwadraty.json`);
  if (!r.ok)
    throw new Error(L(`Nie ma sąsiednich kwadratów przykładu: ${key}`, `No neighbouring squares for example: ${key}.`));
  return r.json();
}

/** Pamięć jednego ładowania kandydatów osady: kafelek z=14 po kluczu „x,y” → zdekodowany kafelek (obietnica; nieudane pobranie
    zostaje w niej jako odrzucona, więc następny kwadrat z tym kafelkiem nie próbuje drugi raz). Wołający trzyma ją tylko przez
    jedno ładowanie ośmiu kandydatów: zdekodowany kafelek waży kilka MB. */
export type PamiecKafelkow = Map<string, Promise<DecodedTile>>;

/** pobranie surowego kafelka (z, x, y): bajty, pusta tablica dla kafelka bez danych (204, 404) albo null przy błędzie */
export type PobierzKafelek = (z: number, x: number, y: number) => Promise<Uint8Array | null>;

/** Geo sąsiedniego kwadratu (sx, sy) w układzie domu `uklad` z kafelków OpenFreeMap: te same kafelki z=14, które pokrywają jego
    promień 720 m (`kafelkiKwadratu`), pobrane naraz, zdekodowane (`decode` z `WANT`) i zamienione w geo tak samo jak w demach
    (`geoKwadratu` z geoKwadratu.ts). Kafelki z `pamiec` nie pobierają się drugi raz. Kafelek bez danych jest zwykłym kafelkiem bez
    warstw; błąd pobrania (null albo wyjątek z `pobierz`) odrzuca kwadrat i zostaje w pamięci. `pobierz` jest wstrzykiwane (testy w
    Node); domyślnie `pobierzKafelek` z mvt.ts. */
export async function geoKwadratu(
  uklad: Uklad,
  sx: number,
  sy: number,
  pamiec: PamiecKafelkow = new Map(),
  pobierz: PobierzKafelek = pobierzKafelek,
): Promise<Geo> {
  const kafelki = await Promise.all(
    kafelkiKwadratu(uklad, sx, sy).map(([x, y]) => {
      const klucz = `${x},${y}`;
      let p = pamiec.get(klucz);
      if (!p) {
        p = (async (): Promise<DecodedTile> => {
          const bajty = await pobierz(Z, x, y);
          if (!bajty) throw new Error(`Nie udało się pobrać kafelka mapy ${Z}/${x}/${y}`);
          return { x, y, L: bajty.length ? decode(bajty, WANT) : {} };
        })();
        pamiec.set(klucz, p);
      }
      return p;
    }),
  );
  return geoKwadratuZKafelkow(kafelki, uklad, sx, sy);
}

export async function demoList(): Promise<DemoInfo[]> {
  const r = await fetch('demo/index.json');
  return r.ok ? r.json() : [];
}

export async function loadAddress(
  q: string,
  status: (s: string) => void,
  api?: Pick<ApiGry, 'adres'>,
): Promise<Loaded> {
  status(L('Szukam adresu…', 'Looking up the address…'));
  const g = await geocode(q, api);
  const where = g.label.split(',').slice(0, 3).join(',');
  status(L(`Jest: ${where}. Pobieram mapę…`, `Found: ${where}. Downloading the map…`));
  let geo: Geo;
  let src: Loaded['src'] = 'mvt';
  try {
    geo = await loadTiles(g.lat, g.lon, LOAD_RADIUS, (m) => status(L(`Jest: ${where}. ${m}`, `Found: ${where}. ${m}`)));
  } catch (e) {
    console.warn('kafelki', e);
    status(
      L(
        `Jest: ${where}. Serwer kafelków nie odpowiada, pytam serwer Overpass. To bywa wolne, czasem pół minuty.`,
        `Found: ${where}. The tile server isn’t answering, asking Overpass instead. That can be slow, sometimes half a minute.`,
      ),
    );
    const json = (await overpass(g.lat, g.lon, LOAD_RADIUS, status)) as Parameters<typeof toGeo>[0];
    geo = toGeo(json, g.lat, g.lon);
    src = 'overpass';
  }
  if (geo.b.length < 4)
    throw new Error(
      L(
        'W tym miejscu OpenStreetMap prawie nie ma budynków. Spróbujcie adresu w środku osiedla.',
        'OpenStreetMap has hardly any buildings here. Try an address in the middle of an estate.',
      ),
    );
  return { geo, name: g.area || g.street || q, addr: g.label, street: g.street, src };
}
