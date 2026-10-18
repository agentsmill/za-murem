/* Rodzaje punktów, po których gra poznaje, że budynek to muzeum, teatr, hotel, dworzec, remiza, szpital, kościół,
   urząd, ratusz albo willa. Trzymane osobno od kategorii miejsc (poiCat w osm.ts, `cats` budynku): kategoria
   w `cats` zmienia klasę budynku w classify() (każda niepusta lista to „sklep”), a rodzaj ma wpływać tylko na wygląd
   budynku (src/render/art/lookBudynku.ts), więc symulacja i klasy budynków zostają bez zmian. Czyste funkcje:
   klasa i podklasa punktu OpenMapTiles (kafelki OpenFreeMap), tagi OSM (Overpass) i słowa w nazwie. */

/** rodzaje punktów (wszystkie, które mają własny wygląd budynku poza kamienicą, tę poznaje się po zabudowie) */
export const RODZAJE = [
  'ratusz',
  'urzad',
  'muzeum',
  'teatr',
  'hotel',
  'dworzec',
  'remiza',
  'szpital',
  'kosciol',
  'willa',
] as const;
export type RodzajPunktu = (typeof RODZAJE)[number];

/** słowa nazwy: małe litery bez ogonków, po literach i cyfrach („Szpital św. Łazarza 12” to szpital, sw, lazarza, 12) */
export function slowaNazwy(nazwa: string): string[] {
  return nazwa
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Całe słowa (z odmianą rzeczownika), nie przedrostki: ulice o nazwach „Szpitalna”, „Teatralna”, „Muzealna”,
 * „Dworcowa” i „Kościelna” to przymiotniki, a nie szpitale, teatry i kościoły, a „osp” w „hospicjum” nie jest remizą.
 */
const SLOWA: Record<RodzajPunktu, readonly string[]> = {
  ratusz: ['ratusz', 'ratusza', 'ratuszu', 'magistrat', 'magistratu'],
  urzad: [
    'urzad',
    'urzedu',
    'poczta',
    'poczty',
    'biblioteka',
    'biblioteki',
    'komisariat',
    'komisariatu',
    'starostwo',
    'starostwa',
    'kultury',
  ],
  muzeum: ['muzeum', 'museum'],
  teatr: ['teatr', 'teatru', 'theatre', 'theater'],
  hotel: ['hotel', 'hotelu', 'motel', 'motelu'],
  dworzec: ['dworzec', 'dworca', 'dworcu'],
  remiza: ['remiza', 'remizy', 'remizie', 'osp', 'pozarna', 'pozarnej'],
  szpital: ['szpital', 'szpitala', 'szpitalu', 'szpitale', 'szpitali'],
  kosciol: [
    'kosciol',
    'kosciola',
    'kosciele',
    'bazylika',
    'bazyliki',
    'katedra',
    'katedry',
    'kaplica',
    'kaplicy',
    'cerkiew',
    'cerkwi',
    'parafia',
    'parafii',
    'sanktuarium',
    'church',
  ],
  willa: ['willa', 'willi', 'villa'],
};

/**
 * Kolejność rozstrzygania, gdy budynek ma kilka rodzajów: najpierw to, co rzadkie i jednoznaczne (szpital, ratusz,
 * teatr, muzeum), na końcu to, co bywa lokatorem w innym budynku (urząd, willa).
 */
export const PRIORYTET_RODZAJOW: readonly RodzajPunktu[] = [
  'szpital',
  'ratusz',
  'teatr',
  'muzeum',
  'dworzec',
  'remiza',
  'kosciol',
  'hotel',
  'urzad',
  'willa',
];

/** ratusz w nazwie albo urząd miasta, miejski i gminy (urząd dzielnicy to zwykły urząd) */
function ratuszWNazwie(slowa: readonly string[]): boolean {
  if (slowa.some((s) => SLOWA.ratusz.includes(s))) return true;
  return slowa.includes('urzad') && slowa.some((s) => ['miasta', 'miejski', 'miejska', 'gminy'].includes(s));
}

/** rodzaj z samej nazwy budynku albo punktu; null, gdy nazwa nie ma żadnego z rzeczowników */
export function rodzajZNazwy(nazwa: string): RodzajPunktu | null {
  const slowa = slowaNazwy(nazwa);
  if (slowa.length === 0) return null;
  if (ratuszWNazwie(slowa)) return 'ratusz';
  for (const k of PRIORYTET_RODZAJOW) if (slowa.some((s) => SLOWA[k].includes(s))) return k;
  return null;
}

/** hotel czy willa: „Villa Irys” z podklasą hotel to willa, „Hotel Villa Park” to hotel */
function hotelAlboWilla(nazwa: string): RodzajPunktu {
  const slowa = slowaNazwy(nazwa);
  if (slowa.some((s) => SLOWA.hotel.includes(s))) return 'hotel';
  return slowa.some((s) => SLOWA.willa.includes(s)) ? 'willa' : 'hotel';
}

/** pensjonat jest willą tylko z willą w nazwie */
function pensjonatAlboNic(nazwa: string): RodzajPunktu | null {
  return slowaNazwy(nazwa).some((s) => SLOWA.willa.includes(s)) ? 'willa' : null;
}

/** ratusz albo zwykły urząd dla punktu urzędu (townhall): po nazwie */
function urzadAlboRatusz(nazwa: string): RodzajPunktu {
  return ratuszWNazwie(slowaNazwy(nazwa)) ? 'ratusz' : 'urzad';
}

/** sala Świadków Jehowy i podobne to nie kościół z wieżą */
const NIE_KOSCIOL = ['sala krolestwa', 'kingdom hall'];
const nieKosciol = (nazwa: string) => NIE_KOSCIOL.some((s) => slowaNazwy(nazwa).join(' ').includes(s));

/**
 * Rodzaj z punktu kafelka OpenFreeMap (schemat OpenMapTiles, warstwa poi): klasa i podklasa tak, jak są w danych
 * (np. town_hall/townhall, lodging/hotel, railway/station), nazwa z punktu. Przystanki, szlabany, parkingi, paczkomaty
 * i przychodnie (hospital/clinic) nie są żadnym z rodzajów.
 */
export function rodzajZMvt(
  klasa: string | undefined,
  podklasa: string | undefined,
  nazwa: string,
): RodzajPunktu | null {
  switch (klasa) {
    case 'museum':
      return 'muzeum';
    case 'theatre':
      return 'teatr';
    case 'lodging':
      if (podklasa === 'hotel' || podklasa === 'motel') return hotelAlboWilla(nazwa);
      return podklasa === 'guest_house' ? pensjonatAlboNic(nazwa) : null;
    case 'railway':
      return podklasa === 'station' ? 'dworzec' : null;
    case 'fire_station':
      return 'remiza';
    case 'hospital':
      return podklasa === 'hospital' ? 'szpital' : null;
    case 'town_hall':
      if (podklasa === 'townhall') return urzadAlboRatusz(nazwa);
      return podklasa === 'community_centre' ? 'urzad' : null;
    case 'office':
      return podklasa === 'government' ? 'urzad' : null;
    case 'post':
      return podklasa === 'post_office' ? 'urzad' : null;
    case 'library':
      return podklasa === 'library' ? 'urzad' : null;
    case 'police':
      return 'urzad';
    case 'place_of_worship':
      return podklasa === 'christian' && !nieKosciol(nazwa) ? 'kosciol' : null;
    default:
      return null;
  }
}

/**
 * Rodzaj z tagów OSM (Overpass): punktu, drogi z adresem albo samego budynku. Bez religii kościołem jest każde
 * miejsce kultu (w Polsce tak jest prawie zawsze), z religią tylko chrześcijańskie.
 */
export function rodzajZTagow(t: Readonly<Record<string, string>>): RodzajPunktu | null {
  const nazwa = t.name ?? '';
  if (t.tourism === 'museum') return 'muzeum';
  if (t.amenity === 'theatre') return 'teatr';
  if (t.tourism === 'hotel' || t.tourism === 'motel') return hotelAlboWilla(nazwa);
  if (t.tourism === 'guest_house') return pensjonatAlboNic(nazwa);
  if (t.railway === 'station' || t.building === 'train_station') return 'dworzec';
  if (t.amenity === 'fire_station' || t.building === 'fire_station') return 'remiza';
  if (t.amenity === 'hospital' || t.building === 'hospital') return 'szpital';
  if (t.building === 'townhall') return 'ratusz';
  if (t.amenity === 'townhall') return urzadAlboRatusz(nazwa);
  if (t.amenity === 'place_of_worship') return !t.religion || t.religion === 'christian' ? 'kosciol' : null;
  if (t.building === 'church' || t.building === 'cathedral' || t.building === 'chapel') return 'kosciol';
  if (['library', 'post_office', 'police', 'community_centre'].includes(t.amenity) || t.office === 'government')
    return 'urzad';
  if (t.building === 'villa') return 'willa';
  return null;
}
