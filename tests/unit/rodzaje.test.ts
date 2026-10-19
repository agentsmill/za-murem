import { describe, expect, it } from 'vitest';
import type { Geo } from '../../src/world/geo.ts';
import { type DecodedTile, type TileFeature, toGeoT } from '../../src/world/mvt.ts';
import { toGeo } from '../../src/world/osm.ts';
import {
  RODZAJE,
  type RodzajPunktu,
  rodzajZMvt,
  rodzajZNazwy,
  rodzajZTagow,
  slowaNazwy,
} from '../../src/world/rodzaje.ts';

/* Rodzaje punktów, po których gra poznaje wygląd budynku (muzeum, teatr, hotel, dworzec…). Klasy i podklasy
   to te, które naprawdę są w kafelkach OpenFreeMap (tests/fixtures/mvt), tagi to tagi OSM z Overpass. */

describe('rodzajZMvt: klasa i podklasa punktu OpenMapTiles', () => {
  const tabela: [string | undefined, string | undefined, string, RodzajPunktu | null][] = [
    ['museum', 'museum', 'Muzeum Inkluzji w Bursztynie', 'muzeum'],
    ['theatre', 'theatre', '', 'teatr'],
    ['lodging', 'hotel', 'Hotel Oliwski', 'hotel'],
    ['lodging', 'hotel', 'Villa Irys', 'willa'],
    ['lodging', 'guest_house', 'Willa Zbyszko', 'willa'],
    ['lodging', 'guest_house', 'Pensjonat Pod Lasem', null],
    ['lodging', 'hostel', 'Olive Hostel', null],
    ['lodging', 'dormitory', 'Dom Studencki nr 4', null],
    ['railway', 'station', 'Kraków Batowice', 'dworzec'],
    ['railway', 'halt', 'Gdańsk Oliwa', null],
    ['railway', 'tram_stop', 'Opacka', null],
    ['railway', 'subway', 'Ursynów', null],
    ['bus', 'bus_station', 'Mistrzejowice', null],
    ['fire_station', 'fire_station', 'Remiza OSP Bosutów', 'remiza'],
    ['hospital', 'hospital', 'Szpital Św. Wojciecha', 'szpital'],
    ['hospital', 'clinic', 'Świat Zdrowia', null],
    ['hospital', 'nursing_home', '', null],
    ['town_hall', 'townhall', 'Urząd Dzielnicy Ursynów', 'urzad'],
    ['town_hall', 'townhall', 'Ratusz Staromiejski', 'ratusz'],
    ['town_hall', 'townhall', 'Urząd Miasta Gdańska', 'ratusz'],
    ['town_hall', 'community_centre', 'Dom Kultury PSM Przymorze', 'urzad'],
    ['office', 'government', 'Rada Dzielnicy Oliwa', 'urzad'],
    ['office', 'company', 'Acxiom', null],
    ['post', 'post_office', 'Urząd Pocztowy Gdańsk 53', 'urzad'],
    ['post', 'parcel_locker', 'DPD', null],
    ['library', 'library', 'Biblioteka Oliwska', 'urzad'],
    ['library', 'books', 'Empik', null],
    ['police', 'police', 'Komisariat Policji IV Gdańsk Oliwa', 'urzad'],
    ['place_of_worship', 'christian', 'Kościół pw. Matki Bożej Fatimskiej', 'kosciol'],
    ['place_of_worship', 'christian', 'Sala Królestwa Świadków Jehowy', null],
    ['place_of_worship', 'muslim', 'Meczet imienia Dżamala ad-Dina Al-afganiego', null],
    ['place_of_worship', 'buddhist', 'Ośrodek Buddyjski Karma Kagyu', null],
    ['shop', 'convenience', 'Żabka', null],
    [undefined, undefined, '', null],
  ];
  for (const [klasa, podklasa, nazwa, want] of tabela)
    it(`${klasa}/${podklasa} „${nazwa}” to ${want ?? 'nic'}`, () => {
      expect(rodzajZMvt(klasa, podklasa, nazwa)).toBe(want);
    });
});

describe('rodzajZTagow: tagi OSM z Overpass', () => {
  const tabela: [Record<string, string>, RodzajPunktu | null][] = [
    [{ tourism: 'museum' }, 'muzeum'],
    [{ amenity: 'theatre' }, 'teatr'],
    [{ tourism: 'hotel' }, 'hotel'],
    [{ tourism: 'motel' }, 'hotel'],
    [{ tourism: 'hostel' }, null],
    [{ amenity: 'townhall', name: 'Ratusz' }, 'ratusz'],
    [{ amenity: 'townhall', name: 'Urząd Dzielnicy Mokotów' }, 'urzad'],
    [{ amenity: 'townhall' }, 'urzad'],
    [{ building: 'townhall' }, 'ratusz'],
    [{ railway: 'station' }, 'dworzec'],
    [{ building: 'train_station' }, 'dworzec'],
    [{ railway: 'halt' }, null],
    [{ amenity: 'fire_station' }, 'remiza'],
    [{ building: 'fire_station' }, 'remiza'],
    [{ amenity: 'hospital' }, 'szpital'],
    [{ building: 'hospital' }, 'szpital'],
    [{ amenity: 'clinic' }, null],
    [{ amenity: 'doctors' }, null],
    [{ amenity: 'place_of_worship', religion: 'christian' }, 'kosciol'],
    [{ amenity: 'place_of_worship' }, 'kosciol'],
    [{ amenity: 'place_of_worship', religion: 'muslim' }, null],
    [{ building: 'church' }, 'kosciol'],
    [{ building: 'cathedral' }, 'kosciol'],
    [{ amenity: 'library' }, 'urzad'],
    [{ amenity: 'post_office' }, 'urzad'],
    [{ amenity: 'police' }, 'urzad'],
    [{ amenity: 'community_centre' }, 'urzad'],
    [{ office: 'government' }, 'urzad'],
    [{ building: 'villa' }, 'willa'],
    [{ shop: 'bakery' }, null],
    [{ building: 'yes' }, null],
    [{}, null],
  ];
  for (const [tagi, want] of tabela)
    it(`${JSON.stringify(tagi)} to ${want ?? 'nic'}`, () => {
      expect(rodzajZTagow(tagi)).toBe(want);
    });
});

describe('rodzajZNazwy: słowa kluczowe w nazwie budynku', () => {
  const tabela: [string, RodzajPunktu | null][] = [
    ['Ratusz Staromiejski', 'ratusz'],
    ['Magistrat', 'ratusz'],
    ['Muzeum Narodowe', 'muzeum'],
    ['Teatr Wielki', 'teatr'],
    ['Dworzec Główny', 'dworzec'],
    ['Hotel Europejski', 'hotel'],
    ['Remiza OSP Gdańsk', 'remiza'],
    ['OSP Bosutów', 'remiza'],
    ['Szpital Miejski', 'szpital'],
    ['Wojewódzki Szpital Specjalistyczny', 'szpital'],
    ['Kościół św. Mikołaja', 'kosciol'],
    ['Biblioteka Oliwska', 'urzad'],
    ['Poczta Polska', 'urzad'],
    ['Urząd Skarbowy', 'urzad'],
    ['Willa Zbyszko', 'willa'],
    // nazwy ulic podobne do rzeczowników: przymiotniki to nie budynki publiczne
    ['Szpitalna 12', null],
    ['Teatralna 5', null],
    ['Muzealna 3', null],
    ['Hotelowa 1', null],
    ['Dworcowa 9', null],
    ['Kościelna 4', null],
    ['Ratuszowa 2', null],
    // „osp” w środku słowa nie jest remizą
    ['Hospicjum Świętego Łazarza', null],
    ['Blok nr 19', null],
    ['', null],
  ];
  for (const [nazwa, want] of tabela)
    it(`„${nazwa}” to ${want ?? 'nic'}`, () => {
      expect(rodzajZNazwy(nazwa)).toBe(want);
    });

  it('wielkość liter, ogonki i otoczenie nie zmieniają wyniku', () => {
    for (const [nazwa, want] of tabela) {
      if (!want) continue;
      const bezOgonkow = nazwa.normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l').replace(/Ł/g, 'L');
      for (const wariant of [nazwa.toUpperCase(), nazwa.toLowerCase(), bezOgonkow, `${nazwa} 12`, `ul. ${nazwa}`])
        expect(rodzajZNazwy(wariant), wariant).toBe(want);
    }
  });

  it('słowa nazwy rozcinają się na literach i cyfrach, bez ogonków i dużych liter', () => {
    expect(slowaNazwy('Szpital św. Łazarza, ul. Żółta 12/3')).toEqual([
      'szpital',
      'sw',
      'lazarza',
      'ul',
      'zolta',
      '12',
      '3',
    ]);
  });
});

describe('słownik rodzajów', () => {
  it('żaden wynik mapowania nie wychodzi poza słownik', () => {
    const wyniki = new Set<string | null>([
      rodzajZMvt('museum', 'museum', ''),
      rodzajZMvt('town_hall', 'townhall', 'Ratusz'),
      rodzajZTagow({ tourism: 'hotel' }),
      rodzajZTagow({ amenity: 'hospital' }),
      rodzajZNazwy('Teatr Wielki'),
    ]);
    for (const w of wyniki) expect(RODZAJE as readonly (string | null)[]).toContain(w);
  });
});

/* Punkty z kafelków (toGeoT) i z Overpass (toGeo) trafiają do geo.rodzaje obok geo.poi, a nie do geo.poi:
   kategorie w poi (cats budynku) mają wpływ na classify(), a nowe rodzaje nie mogą go zmieniać. */

const N = 2 ** 14;
const TX = 9149;
const TY = 5400;
/** środek kafelka jako punkt adresu, żeby punkt (2048, 2048) wypadł w (0, 0) m */
const LAT0 = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (TY + 0.5)) / N))) * 180) / Math.PI;
const LON0 = ((TX + 0.5) / N) * 360 - 180;

function punkt(klasa: string, podklasa: string, nazwa: string, px = 2048, py = 2048): TileFeature {
  return { id: 1, type: 1, tags: { class: klasa, subclass: podklasa, name: nazwa, rank: 1 }, g: [[[px, py]]] };
}

function geoZPunktow(...cechy: TileFeature[]): Geo {
  const tile: DecodedTile = { x: TX, y: TY, L: { poi: { extent: 4096, features: cechy } } };
  return toGeoT([tile], LAT0, LON0, 230);
}

describe('toGeoT: rodzaje punktów obok kategorii', () => {
  it('muzeum trafia do rodzajów, a nie do kategorii punktów (nie zmienia classify)', () => {
    const geo = geoZPunktow(punkt('museum', 'museum', 'Muzeum Testowe'));
    expect(geo.poi).toEqual([]);
    expect(geo.rodzaje).toHaveLength(1);
    expect(geo.rodzaje?.[0]).toMatchObject({ k: 'muzeum', n: 'Muzeum Testowe' });
    // środek kafelka to adres, a wyniki są zaokrąglone do pół metra
    expect(Math.abs(geo.rodzaje?.[0].x ?? 99)).toBeLessThan(1);
    expect(Math.abs(geo.rodzaje?.[0].y ?? 99)).toBeLessThan(1);
  });

  it('ratusz jest i kategorią urzad (jak dotąd), i rodzajem ratusz', () => {
    const geo = geoZPunktow(punkt('town_hall', 'townhall', 'Ratusz'));
    expect(geo.poi.map((p) => p.c)).toEqual(['urzad']);
    expect(geo.rodzaje?.map((r) => r.k)).toEqual(['ratusz']);
  });

  it('kościół chrześcijański jest rodzajem, choć AMEN go nie zna; meczet i przychodnia nie', () => {
    const geo = geoZPunktow(
      punkt('place_of_worship', 'christian', 'Kościół Testowy', 2048, 2000),
      punkt('place_of_worship', 'muslim', 'Meczet', 2048, 2100),
      punkt('hospital', 'clinic', 'Przychodnia', 2100, 2048),
    );
    expect(geo.rodzaje?.map((r) => r.k)).toEqual(['kosciol']);
    expect(geo.poi.map((p) => p.c)).toEqual(['przychodnia']);
  });

  it('punkt dalej niż 720 m od adresu odpada, jak w kategoriach', () => {
    // 4096 jednostek to cały kafelek (około 1,5 km), więc 2048 + 2000 to ponad 700 m od środka
    const blisko = punkt('theatre', 'theatre', 'Teatr blisko', 2048 + 1000, 2048);
    const daleko = punkt('theatre', 'theatre', 'Teatr daleko', 2048 + 2000, 2048);
    const geo = geoZPunktow(blisko, daleko);
    expect(geo.rodzaje?.map((r) => r.n)).toEqual(['Teatr blisko']);
  });

  it('bez takich punktów pole rodzaje w ogóle nie powstaje (geometria jak dotąd)', () => {
    const geo = geoZPunktow(punkt('shop', 'convenience', 'Żabka'));
    expect('rodzaje' in geo).toBe(false);
  });
});

describe('toGeo (Overpass): rodzaje z tagów węzłów i dróg', () => {
  const kwadrat = (la: number, lo: number, d = 0.0002) => [
    { lat: la - d, lon: lo - d },
    { lat: la - d, lon: lo + d },
    { lat: la + d, lon: lo + d },
    { lat: la + d, lon: lo - d },
    { lat: la - d, lon: lo - d },
  ];

  it('budynek z tagiem tourism=museum daje rodzaj w swoim środku, bez dodawania tagu do budynku', () => {
    const json = {
      elements: [
        {
          type: 'way',
          id: 7,
          tags: { building: 'yes', tourism: 'museum', name: 'Muzeum X' },
          geometry: kwadrat(LAT0, LON0),
        },
      ],
    };
    const geo = toGeo(json, LAT0, LON0);
    expect(geo.rodzaje).toHaveLength(1);
    expect(geo.rodzaje?.[0]).toMatchObject({ k: 'muzeum', n: 'Muzeum X' });
    expect(Math.abs(geo.rodzaje?.[0].x ?? 99)).toBeLessThan(1);
    expect(Math.abs(geo.rodzaje?.[0].y ?? 99)).toBeLessThan(1);
    expect(geo.b[0].t.tourism).toBeUndefined();
  });

  it('węzeł amenity=townhall z nazwą Ratusz to rodzaj ratusz, a przychodnia nic', () => {
    const json = {
      elements: [
        { type: 'node', lat: LAT0, lon: LON0, tags: { amenity: 'townhall', name: 'Ratusz' } },
        { type: 'node', lat: LAT0, lon: LON0, tags: { amenity: 'clinic', name: 'Przychodnia' } },
      ],
    };
    const geo = toGeo(json, LAT0, LON0);
    expect(geo.rodzaje?.map((r) => r.k)).toEqual(['ratusz']);
    // kategorie jak w 0.3: ratusz to urzad, przychodnia to przychodnia
    expect(geo.poi.map((p) => p.c)).toEqual(['urzad', 'przychodnia']);
  });
});
