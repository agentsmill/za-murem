/* Wyszukiwanie adresu przez nasz serwer (server/adres.ts, trasa GET /api/adres w server/app.ts, WynikAdresu w
   src/net/protokol.ts): kolejka do Nominatim (odstęp 1100 ms, czekanie najwyżej 3 s), Photon (komoot) w zapasie,
   pamięć wyników w procesie z kluczem SHA-256 znormalizowanego zapytania, limit 30 zapytań na minutę na IP i dziennik
   bez tekstu zapytań. Bez sieci: `fetch` jest udawany, zegar i czekanie w kolejce też (serwer w procesie testu jak
   w serwer.test.ts, tests/unit/serwer-pomoc.ts). */

import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AdresNiedostepny,
  kluczZapytania,
  type OpcjeAdresu,
  wyszukiwarka,
  zNominatim,
  zPhotona,
} from '../../server/adres.ts';
import { ADRES_MAX_ZNAKOW, type WynikAdresu } from '../../src/net/protokol.ts';
import { przegladarka, type SerwerTestowy, serwerTestowy } from './serwer-pomoc.ts';

const MIN = 60_000;
const DOBA = 24 * 60 * MIN;
const NOM = 'nominatim.openstreetmap.org';
const PHO = 'photon.komoot.io';

/** odpowiedź Nominatim jsonv2 z addressdetails dla bloku na Przymorzu */
const NOMINATIM_GDANSK = [
  {
    place_id: 1,
    osm_type: 'way',
    lat: '54.4153',
    lon: '18.5748',
    category: 'building',
    type: 'apartments',
    display_name: '4, Obrońców Wybrzeża, Przymorze Małe, Przymorze, Gdańsk, województwo pomorskie, 80-398, Polska',
    address: {
      house_number: '4',
      road: 'Obrońców Wybrzeża',
      neighbourhood: 'Przymorze Małe',
      suburb: 'Przymorze',
      city: 'Gdańsk',
      state: 'województwo pomorskie',
      postcode: '80-398',
      country: 'Polska',
    },
  },
];
const Z_NOMINATIM: WynikAdresu = {
  lat: 54.4153,
  lon: 18.5748,
  label: '4, Obrońców Wybrzeża, Przymorze Małe, Przymorze, Gdańsk, województwo pomorskie, 80-398, Polska',
  area: 'Przymorze Małe',
  street: 'Obrońców Wybrzeża',
  city: 'Gdańsk',
};

/** odpowiedź Photona (GeoJSON) dla tego samego bloku; współrzędne to [lon, lat] */
const PHOTON_GDANSK = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        osm_key: 'building',
        osm_value: 'apartments',
        housenumber: '4',
        street: 'Obrońców Wybrzeża',
        locality: 'Przymorze Małe',
        district: 'Przymorze',
        city: 'Gdańsk',
        state: 'województwo pomorskie',
        country: 'Polska',
        postcode: '80-398',
      },
      geometry: { type: 'Point', coordinates: [18.5748, 54.4153] },
    },
  ],
};
const Z_PHOTONA: WynikAdresu = {
  lat: 54.4153,
  lon: 18.5748,
  label: 'Obrońców Wybrzeża 4, Przymorze Małe, Przymorze, Gdańsk',
  area: 'Przymorze Małe',
  street: 'Obrońców Wybrzeża',
  city: 'Gdańsk',
};

const json = (cialo: unknown, status = 200) =>
  new Response(JSON.stringify(cialo), { status, headers: { 'content-type': 'application/json' } });

interface Wywolanie {
  url: URL;
  ua: string;
}

/** udawany `fetch`: zapamiętuje wywołania, odpowiedź daje `odp` (domyślnie obaj dostawcy znajdują blok na Przymorzu) */
function atrapa(
  odp: (url: URL, init?: RequestInit) => Response | Promise<Response> = (url) =>
    json(url.hostname === NOM ? NOMINATIM_GDANSK : PHOTON_GDANSK),
) {
  const wywolania: Wywolanie[] = [];
  const f = (async (wejscie: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(wejscie instanceof Request ? wejscie.url : String(wejscie));
    wywolania.push({ url, ua: new Headers(init?.headers).get('user-agent') ?? '' });
    return odp(url, init);
  }) as typeof fetch;
  return {
    fetch: f,
    wywolania,
    nom: () => wywolania.filter((w) => w.url.hostname === NOM),
    pho: () => wywolania.filter((w) => w.url.hostname === PHO),
  };
}

/** zegar testu stoi w miejscu, dopóki test go nie przesunie; `uspij` zapisuje, ile kolejka kazała czekać, i wraca od
    razu (kolejka rezerwuje chwile od razu, więc o odstępach mówią zapisane czekania, nie czas na ścianie) */
function zegar(poczatek = 1_000_000) {
  let t = poczatek;
  const czekania: number[] = [];
  return {
    teraz: () => t,
    przesun: (ms: number) => {
      t += ms;
    },
    czekania,
    uspij: async (ms: number) => {
      czekania.push(ms);
    },
  };
}

/** wyszukiwarka z udawanym fetch i zegarem testu */
function szukacz(odp?: Parameters<typeof atrapa>[0], opcje: OpcjeAdresu = {}) {
  const z = zegar();
  const a = atrapa(odp);
  const w = wyszukiwarka({ fetch: a.fetch, teraz: z.teraz, uspij: z.uspij, ...opcje });
  return { ...a, w, z };
}

describe('adres: klucz zapytania', () => {
  it('ten sam adres wpisany inaczej ma ten sam klucz: wielkość liter, spacje, złożenie znaków', () => {
    const klucz = kluczZapytania('Obrońców Wybrzeża 4, Gdańsk', 'pl');
    expect(kluczZapytania('  obrońców  wybrzeża 4,  GDAŃSK ', 'pl')).toBe(klucz);
    expect(kluczZapytania('Obrońców\tWybrzeża\n4, Gdańsk', 'pl')).toBe(klucz);
    // ń rozłożone na n i kombinowany akcent to ten sam napis po NFC
    expect(kluczZapytania('Obrońców Wybrzeża 4, Gdańsk', 'pl')).toBe(klucz);
    expect(kluczZapytania('Obrońców Wybrzeża 5, Gdańsk', 'pl')).not.toBe(klucz);
  });

  it('klucz to SHA-256 znormalizowanego tekstu z językiem i nie zawiera samego tekstu', () => {
    const klucz = kluczZapytania('  Wołoska  12, WARSZAWA ', 'en');
    const skrot = createHash('sha256').update('wołoska 12, warszawa').digest('hex');
    expect(klucz).toBe(`${skrot}:en`);
    expect(klucz.toLowerCase()).not.toContain('warszawa');
    // inny język to inna pamięć (inny język etykiety)
    expect(kluczZapytania('Wołoska 12, Warszawa', 'pl')).not.toBe(kluczZapytania('Wołoska 12, Warszawa', 'en'));
  });
});

describe('adres: przekształcanie odpowiedzi dostawców', () => {
  it('zNominatim: te same pola co geocode w src/world/osm.ts', () => {
    expect(zNominatim(NOMINATIM_GDANSK)).toEqual(Z_NOMINATIM);
    const wiesz = (adres: Record<string, string>) =>
      zNominatim([{ lat: '50.1', lon: '19.9', display_name: 'Coś', address: adres }]);
    // okolica: neighbourhood, quarter, suburb, city_district, village, town, city (w tej kolejności)
    expect(wiesz({ quarter: 'Q', suburb: 'S', city: 'C' })?.area).toBe('Q');
    expect(wiesz({ suburb: 'S', city_district: 'D', city: 'C' })?.area).toBe('S');
    expect(wiesz({ city_district: 'D', city: 'C' })?.area).toBe('D');
    expect(wiesz({ village: 'Wieś', town: 'Miasteczko' })?.area).toBe('Wieś');
    expect(wiesz({ town: 'Miasteczko', city: 'C' })?.area).toBe('Miasteczko');
    // miasto: city, town albo village; ulica: road
    expect(wiesz({ town: 'Miasteczko', road: 'Polna' })).toMatchObject({ city: 'Miasteczko', street: 'Polna' });
    expect(wiesz({ village: 'Wieś' })?.city).toBe('Wieś');
    expect(wiesz({})).toMatchObject({ area: '', street: '', city: '', lat: 50.1, lon: 19.9 });
    expect(zNominatim([{ lat: '1', lon: '2', display_name: 'X' }])).toMatchObject({ area: '', street: '', city: '' });
  });

  it('zNominatim: pusta lista i śmieci to null', () => {
    for (const zle of [[], null, undefined, 'tekst', 42, {}, [null], [{}], [{ lat: 'x', lon: '2' }], [{ lat: '1' }]])
      expect(zNominatim(zle), JSON.stringify(zle)).toBeNull();
  });

  it('zPhotona: współrzędne to [lon, lat], etykieta z ulicy, numeru, dzielnicy i miasta', () => {
    expect(zPhotona(PHOTON_GDANSK)).toEqual(Z_PHOTONA);
  });

  it('zPhotona: ulica jako wynik, sama miejscowość, powtórzone człony i brak okolicy', () => {
    const jeden = (properties: Record<string, unknown>) =>
      zPhotona({ features: [{ properties, geometry: { coordinates: [21, 52.2] } }] });
    // wynik będący ulicą: nazwa to ulica
    expect(jeden({ osm_key: 'highway', name: 'Wołoska', city: 'Warszawa', district: 'Mokotów' })).toEqual({
      lat: 52.2,
      lon: 21,
      label: 'Wołoska, Mokotów, Warszawa',
      area: 'Mokotów',
      street: 'Wołoska',
      city: 'Warszawa',
    });
    // miejsce z nazwą i adresem: nazwa idzie przed ulicą, a nie jako ulica
    expect(jeden({ name: 'Biedronka', street: 'Wołoska', housenumber: '12', city: 'Warszawa' })).toMatchObject({
      label: 'Biedronka, Wołoska 12, Warszawa',
      street: 'Wołoska',
      area: 'Warszawa',
    });
    // sama miejscowość: nazwa nie jest ulicą; powtórzone człony (dzielnica równa miastu) raz
    expect(jeden({ osm_key: 'place', name: 'Gdynia', city: 'Gdynia', district: 'Gdynia' })).toEqual({
      lat: 52.2,
      lon: 21,
      label: 'Gdynia',
      area: 'Gdynia',
      street: '',
      city: 'Gdynia',
    });
    expect(jeden({ osm_key: 'place', name: 'Gdynia' })).toMatchObject({ street: '', city: '' });
  });

  it('zPhotona: brak wyników i śmieci to null', () => {
    const bez = (geometry: unknown) => ({ features: [{ properties: {}, geometry }] });
    for (const zle of [
      { features: [] },
      {},
      null,
      'x',
      [],
      { features: [{}] },
      bez({ coordinates: [21] }),
      bez({ coordinates: ['a', 'b'] }),
      bez({ coordinates: 'x' }),
    ])
      expect(zPhotona(zle), JSON.stringify(zle)).toBeNull();
  });
});

describe('adres: wyszukiwarka', () => {
  it('ten sam adres wpisany inaczej trafia w pamięć: drugi raz bez zapytania na zewnątrz', async () => {
    const s = szukacz();
    expect(await s.w.szukaj('Obrońców Wybrzeża 4, Gdańsk', 'pl')).toEqual(Z_NOMINATIM);
    expect(await s.w.szukaj('  obrońców  wybrzeża 4,  GDAŃSK ', 'pl')).toEqual(Z_NOMINATIM);
    expect(s.wywolania).toHaveLength(1);
    // inny język to osobne zapytanie (etykieta w innym języku)
    await s.w.szukaj('Obrońców Wybrzeża 4, Gdańsk', 'en');
    expect(s.wywolania).toHaveLength(2);
  });

  it('dwa takie same zapytania naraz to jedno zapytanie na zewnątrz', async () => {
    const s = szukacz();
    const [a, b, c] = await Promise.all([
      s.w.szukaj('Wołoska 12, Warszawa', 'pl'),
      s.w.szukaj('wołoska 12,  warszawa', 'pl'),
      s.w.szukaj('WOŁOSKA 12, WARSZAWA', 'pl'),
    ]);
    expect(a).toEqual(Z_NOMINATIM);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect(s.wywolania).toHaveLength(1);
  });

  it('Nominatim dostaje User-Agent z kontaktem i accept-language z języka gry', async () => {
    const s = szukacz(undefined, { kontakt: 'kontakt@zamurem.example' });
    await s.w.szukaj('Wołoska 12, Warszawa', 'en');
    expect(s.wywolania).toHaveLength(1);
    const { url, ua } = s.wywolania[0];
    expect(url.origin + url.pathname).toBe('https://nominatim.openstreetmap.org/search');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      format: 'jsonv2',
      limit: '1',
      addressdetails: '1',
      'accept-language': 'en',
      q: 'Wołoska 12, Warszawa',
    });
    expect(ua).toBe('ZaMurem/1.0 (+https://zamurem.vercel.app; kontakt@zamurem.example)');
    // język polski i adres z ukośnikiem, znakiem zapytania i ampersandem przechodzą zakodowane
    await s.w.szukaj('Brzeska 3/5 & 7?, Łódź', 'pl');
    expect(s.wywolania[1].url.searchParams.get('accept-language')).toBe('pl');
    expect(s.wywolania[1].url.searchParams.get('q')).toBe('Brzeska 3/5 & 7?, Łódź');
  });

  it('bez kontaktu User-Agent nie ma części po średniku', async () => {
    const s = szukacz();
    await s.w.szukaj('Wołoska 12, Warszawa', 'pl');
    expect(s.wywolania[0].ua).toBe('ZaMurem/1.0 (+https://zamurem.vercel.app)');
  });

  it('Photon: lang tylko dla języków, które zna (angielski tak, polski bez lang), z tym samym User-Agent', async () => {
    const s = szukacz((url) => (url.hostname === NOM ? json({}, 503) : json(PHOTON_GDANSK)), {
      kontakt: 'kontakt@zamurem.example',
    });
    expect(await s.w.szukaj('Wołoska 12, Warszawa', 'pl')).toEqual(Z_PHOTONA);
    expect(await s.w.szukaj('Wołoska 13, Warszawa', 'en')).toEqual(Z_PHOTONA);
    const [pl, en] = s.pho();
    expect(pl.url.origin + pl.url.pathname).toBe('https://photon.komoot.io/api/');
    expect(Object.fromEntries(pl.url.searchParams)).toEqual({ limit: '1', q: 'Wołoska 12, Warszawa' });
    expect(Object.fromEntries(en.url.searchParams)).toEqual({ limit: '1', lang: 'en', q: 'Wołoska 13, Warszawa' });
    expect(pl.ua).toBe('ZaMurem/1.0 (+https://zamurem.vercel.app; kontakt@zamurem.example)');
  });

  it('kolejka: dwa różne adresy naraz idą do Nominatim co najmniej 1100 ms po sobie, a gdy czekanie przekroczy 3 s, pyta Photon', async () => {
    // domyślne wartości: odstęp 1100 ms, czekanie najwyżej 3000 ms
    const s = szukacz();
    const wyniki = await Promise.all(
      ['Adres A 1, Gdańsk', 'Adres B 2, Gdańsk', 'Adres C 3, Gdańsk', 'Adres D 4, Gdańsk'].map((q) =>
        s.w.szukaj(q, 'pl'),
      ),
    );
    // pierwsze trzy startują po 0, 1100 i 2200 ms (pierwsze bez czekania); czwarty musiałby czekać 3300 ms, więc idzie
    // do Photona i nie zajmuje miejsca w kolejce
    expect(s.z.czekania).toEqual([1100, 2200]);
    expect(s.nom().map((w) => w.url.searchParams.get('q'))).toEqual([
      'Adres A 1, Gdańsk',
      'Adres B 2, Gdańsk',
      'Adres C 3, Gdańsk',
    ]);
    expect(s.pho().map((w) => w.url.searchParams.get('q'))).toEqual(['Adres D 4, Gdańsk']);
    expect(wyniki.slice(0, 3)).toEqual([Z_NOMINATIM, Z_NOMINATIM, Z_NOMINATIM]);
    expect(wyniki[3]).toEqual(Z_PHOTONA);

    // po odczekaniu kolejka znów jest wolna: następne zapytanie startuje od razu, bez czekania
    s.z.przesun(10_000);
    await s.w.szukaj('Adres E 5, Gdańsk', 'pl');
    expect(s.z.czekania).toEqual([1100, 2200]);
    expect(s.nom()).toHaveLength(4);

    // zapytania jedno po drugim, w odstępie krótszym niż 1100 ms, też czekają do pełnego odstępu
    s.z.przesun(300);
    await s.w.szukaj('Adres F 6, Gdańsk', 'pl');
    expect(s.z.czekania).toEqual([1100, 2200, 800]);
  });

  it('kolejka: odstęp i czekanie da się skrócić w opcjach', async () => {
    const s = szukacz(undefined, { odstepMs: 200, czekajMaxMs: 450 });
    await Promise.all(['A 1', 'B 2', 'C 3', 'D 4'].map((q) => s.w.szukaj(q, 'pl')));
    // 0, 200 i 400 ms mieszczą się w 450, czwarte (600) idzie do Photona
    expect(s.z.czekania).toEqual([200, 400]);
    expect(s.nom()).toHaveLength(3);
    expect(s.pho()).toHaveLength(1);
  });

  it('429, błąd albo przekroczony czas Nominatim: odpowiedź z Photona', async () => {
    for (const awaria of [
      () => json({ error: 'Too Many Requests' }, 429),
      () => json({}, 500),
      () => {
        throw new TypeError('fetch failed');
      },
      () => new Response('to nie jest JSON', { status: 200 }),
      () => json({ nieoczekiwane: true }),
    ]) {
      const s = szukacz((url) => (url.hostname === NOM ? awaria() : json(PHOTON_GDANSK)));
      expect(await s.w.szukaj('Wołoska 12, Warszawa', 'pl')).toEqual(Z_PHOTONA);
      expect(s.nom()).toHaveLength(1);
      expect(s.pho()).toHaveLength(1);
    }

    // przekroczony czas: Nominatim nie odpowiada, zapytanie przerywa się po `czasMs`
    const wisi = (url: URL, init?: RequestInit) =>
      url.hostname === NOM
        ? new Promise<Response>((_, zle) => init?.signal?.addEventListener('abort', () => zle(init.signal?.reason)))
        : json(PHOTON_GDANSK);
    const s = szukacz(wisi, { czasMs: 20 });
    expect(await s.w.szukaj('Wołoska 12, Warszawa', 'pl')).toEqual(Z_PHOTONA);
    expect(s.nom()).toHaveLength(1);
  });

  it('czas na odpowiedź dostawcy to domyślnie 6 s, razem z czytaniem odpowiedzi', async () => {
    const limity = vi.spyOn(AbortSignal, 'timeout');
    try {
      const a = atrapa();
      await wyszukiwarka({ fetch: a.fetch }).szukaj('Wołoska 12, Warszawa', 'pl');
      expect(limity).toHaveBeenCalledWith(6000);
    } finally {
      limity.mockRestore();
    }
  });

  it('po 429 z Nominatim wszyscy idą przez minutę do Photona, potem Nominatim wraca', async () => {
    let blokada = true;
    const s = szukacz((url) =>
      url.hostname === NOM ? (blokada ? json({}, 429) : json(NOMINATIM_GDANSK)) : json(PHOTON_GDANSK),
    );
    expect(await s.w.szukaj('Adres A 1, Gdańsk', 'pl')).toEqual(Z_PHOTONA);
    expect(s.nom()).toHaveLength(1);
    // blokada trwa: kolejne różne adresy nie dobijają do Nominatim
    s.z.przesun(5_000);
    expect(await s.w.szukaj('Adres B 2, Gdańsk', 'pl')).toEqual(Z_PHOTONA);
    s.z.przesun(30_000);
    expect(await s.w.szukaj('Adres C 3, Gdańsk', 'pl')).toEqual(Z_PHOTONA);
    expect(s.nom()).toHaveLength(1);
    // po minucie od blokady próbujemy znowu
    blokada = false;
    s.z.przesun(30_000);
    expect(await s.w.szukaj('Adres D 4, Gdańsk', 'pl')).toEqual(Z_NOMINATIM);
    expect(s.nom()).toHaveLength(2);
  });

  it('gdy zawiodą oba, szukaj rzuca AdresNiedostepny z powodami bez tekstu zapytania i niczego nie pamięta', async () => {
    let dziala = false;
    const s = szukacz((url) => {
      if (dziala) return json(url.hostname === NOM ? NOMINATIM_GDANSK : PHOTON_GDANSK);
      throw new Error(`nie ma połączenia z ${url.href}`);
    });
    const blad = await s.w.szukaj('Tajna Ulica 77, Gdańsk', 'pl').catch((e) => e);
    expect(blad).toBeInstanceOf(AdresNiedostepny);
    expect(blad.message).not.toMatch(/tajna|ulica|77|gda/i);
    expect(blad.message).toContain('Nominatim');
    expect(blad.message).toContain('Photon');
    // błąd nie wchodzi do pamięci: po naprawie to samo zapytanie dostaje odpowiedź
    dziala = true;
    s.z.przesun(MIN * 2);
    expect(await s.w.szukaj('Tajna Ulica 77, Gdańsk', 'pl')).toEqual(Z_NOMINATIM);
  });

  it('Photon z błędem po awarii Nominatim to AdresNiedostepny', async () => {
    const zly = szukacz((url) => json({}, url.hostname === NOM ? 429 : 502));
    await expect(zly.w.szukaj('Nigdzie 1', 'pl')).rejects.toBeInstanceOf(AdresNiedostepny);
  });

  it('pusty Photon, gdy Nominatim zawiódł, to AdresNiedostepny (nie „nie ma adresu”) i niczego nie pamięta', async () => {
    let nominatimDziala = false;
    const s = szukacz((url) =>
      url.hostname === NOM ? (nominatimDziala ? json(NOMINATIM_GDANSK) : json({}, 500)) : json({ features: [] }),
    );
    const blad = await s.w.szukaj('Obrońców Wybrzeża 4, Gdańsk', 'pl').catch((e) => e);
    expect(blad).toBeInstanceOf(AdresNiedostepny);
    // powody bez tekstu zapytania, ale z obu dostawców
    expect(blad.message).toContain('Nominatim: http 500');
    expect(blad.message).toContain('Photon');
    expect(blad.message).not.toMatch(/obro|wybrze|gda/i);
    // nic w pamięci: kolejne zapytanie po minucie znów idzie do Nominatim i dostaje wynik
    expect(s.nom()).toHaveLength(1);
    nominatimDziala = true;
    s.z.przesun(MIN);
    expect(await s.w.szukaj('Obrońców Wybrzeża 4, Gdańsk', 'pl')).toEqual(Z_NOMINATIM);
    expect(s.nom()).toHaveLength(2);
  });

  it('pusty Photon, gdy Nominatim nie był pytany (pełna kolejka), to AdresNiedostepny i niczego nie pamięta', async () => {
    const s = szukacz((url) => (url.hostname === NOM ? json(NOMINATIM_GDANSK) : json({ features: [] })));
    const wyniki = await Promise.allSettled(
      ['Adres A 1, Gdańsk', 'Adres B 2, Gdańsk', 'Adres C 3, Gdańsk', 'Adres D 4, Gdańsk'].map((q) =>
        s.w.szukaj(q, 'pl'),
      ),
    );
    // czwarty nie zmieścił się w kolejce (czekałby 3300 ms), poszedł do Photona, który nic nie znalazł
    expect(s.pho()).toHaveLength(1);
    expect(wyniki.slice(0, 3).map((w) => w.status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled']);
    expect(wyniki[3].status).toBe('rejected');
    expect((wyniki[3] as PromiseRejectedResult).reason).toBeInstanceOf(AdresNiedostepny);
    // po odczekaniu to samo zapytanie trafia do Nominatim, bez wpisu o braku wyniku w pamięci
    s.z.przesun(10_000);
    expect(await s.w.szukaj('Adres D 4, Gdańsk', 'pl')).toEqual(Z_NOMINATIM);
    expect(s.nom()).toHaveLength(4);
  });

  it('pusty Photon w minucie po 429 z Nominatim to AdresNiedostepny, a po minucie Nominatim odpowiada', async () => {
    let blokada = true;
    const s = szukacz((url) =>
      url.hostname === NOM ? (blokada ? json({}, 429) : json(NOMINATIM_GDANSK)) : json({ features: [] }),
    );
    await expect(s.w.szukaj('Adres A 1, Gdańsk', 'pl')).rejects.toBeInstanceOf(AdresNiedostepny);
    s.z.przesun(5_000); // blokada trwa: Nominatim nie jest pytany, Photon pusty
    await expect(s.w.szukaj('Adres B 2, Gdańsk', 'pl')).rejects.toBeInstanceOf(AdresNiedostepny);
    expect(s.nom()).toHaveLength(1);
    blokada = false;
    s.z.przesun(60_000);
    expect(await s.w.szukaj('Adres B 2, Gdańsk', 'pl')).toEqual(Z_NOMINATIM);
  });

  it('niepusty wynik z Photona po awarii Nominatim dalej jest wynikiem (pamiętanym dobę)', async () => {
    const s = szukacz((url) => (url.hostname === NOM ? json({}, 500) : json(PHOTON_GDANSK)));
    expect(await s.w.szukaj('Adres A 1, Gdańsk', 'pl')).toEqual(Z_PHOTONA);
    s.z.przesun(DOBA - 1);
    expect(await s.w.szukaj('Adres A 1, Gdańsk', 'pl')).toEqual(Z_PHOTONA);
    expect(s.wywolania).toHaveLength(2);
  });

  it('brak wyniku z Nominatim: null, bez pytania Photona, pamiętany przez dobę', async () => {
    const s = szukacz((url) => json(url.hostname === NOM ? [] : PHOTON_GDANSK));
    expect(await s.w.szukaj('Asdfgh 99999, Nigdzie', 'pl')).toBeNull();
    expect(s.pho()).toHaveLength(0);
    s.z.przesun(DOBA - 1);
    expect(await s.w.szukaj('asdfgh  99999, NIGDZIE', 'pl')).toBeNull();
    expect(s.wywolania).toHaveLength(1);
    // po dobie pytamy jeszcze raz
    s.z.przesun(2);
    expect(await s.w.szukaj('Asdfgh 99999, Nigdzie', 'pl')).toBeNull();
    expect(s.wywolania).toHaveLength(2);
  });

  it('wynik z Nominatim pamiętany 30 dni, z Photona dobę (zapas może być gorszy)', async () => {
    const s = szukacz();
    await s.w.szukaj('Wołoska 12, Warszawa', 'pl');
    s.z.przesun(30 * DOBA - 1);
    await s.w.szukaj('Wołoska 12, Warszawa', 'pl');
    expect(s.wywolania).toHaveLength(1);
    s.z.przesun(2);
    await s.w.szukaj('Wołoska 12, Warszawa', 'pl');
    expect(s.wywolania).toHaveLength(2);

    let nominatimDziala = false;
    const p = szukacz((url) =>
      url.hostname === NOM && !nominatimDziala
        ? json({}, 500)
        : json(url.hostname === NOM ? NOMINATIM_GDANSK : PHOTON_GDANSK),
    );
    expect(await p.w.szukaj('Wołoska 12, Warszawa', 'pl')).toEqual(Z_PHOTONA);
    p.z.przesun(60 * MIN);
    expect(await p.w.szukaj('Wołoska 12, Warszawa', 'pl')).toEqual(Z_PHOTONA);
    expect(p.wywolania).toHaveLength(2);
    // po dobie Nominatim znowu dostaje szansę i jego (lepszy) wynik zastępuje zapasowy
    nominatimDziala = true;
    p.z.przesun(DOBA);
    expect(await p.w.szukaj('Wołoska 12, Warszawa', 'pl')).toEqual(Z_NOMINATIM);
  });

  it('pamięć ma ograniczoną liczbę wpisów: przy przepełnieniu odpada najstarszy, trafienie przesuwa wpis na koniec', async () => {
    const s = szukacz(undefined, { wpisow: 2, odstepMs: 0 });
    await s.w.szukaj('A 1', 'pl');
    await s.w.szukaj('B 2', 'pl');
    await s.w.szukaj('A 1', 'pl'); // trafienie: A jest teraz najświeższe, najstarsze to B
    expect(s.wywolania).toHaveLength(2);
    await s.w.szukaj('C 3', 'pl'); // wypycha B
    expect(s.wywolania).toHaveLength(3);
    await s.w.szukaj('A 1', 'pl'); // dalej w pamięci
    expect(s.wywolania).toHaveLength(3);
    await s.w.szukaj('B 2', 'pl'); // B trzeba pytać od nowa
    expect(s.wywolania).toHaveLength(4);
  });

  it('domyślnie pamięć mieści 5000 wpisów', async () => {
    const s = szukacz(undefined, { odstepMs: 0 });
    for (let i = 0; i < 5001; i++) await s.w.szukaj(`Adres ${i}, Gdańsk`, 'pl');
    expect(s.wywolania).toHaveLength(5001);
    await s.w.szukaj('Adres 1, Gdańsk', 'pl'); // jeszcze w pamięci
    expect(s.wywolania).toHaveLength(5001);
    await s.w.szukaj('Adres 0, Gdańsk', 'pl'); // najstarszy odpadł
    expect(s.wywolania).toHaveLength(5002);
  });

  it('dniPamieci skraca pamięć wyników, ale brak wyniku nigdy nie jest pamiętany dłużej niż dobę', async () => {
    const s = szukacz(undefined, { dniPamieci: 2 });
    await s.w.szukaj('Wołoska 12, Warszawa', 'pl');
    s.z.przesun(2 * DOBA - 1);
    await s.w.szukaj('Wołoska 12, Warszawa', 'pl');
    expect(s.wywolania).toHaveLength(1);
    s.z.przesun(2);
    await s.w.szukaj('Wołoska 12, Warszawa', 'pl');
    expect(s.wywolania).toHaveLength(2);
  });
});

/* trasa GET /api/adres */

let serwery: SerwerTestowy[] = [];
/** serwer testowy; kolejka do Nominatim bez odstępu (jej odstępy sprawdza wyszukiwarka wyżej, bez czekania na serio) */
async function start(adres: OpcjeAdresu = {}, opcje: Parameters<typeof serwerTestowy>[0] = {}) {
  const s = await serwerTestowy({ adres: { odstepMs: 0, ...adres }, ...opcje });
  serwery.push(s);
  return s;
}
afterEach(async () => {
  await Promise.all(serwery.map((s) => s.zamknij()));
  serwery = [];
});

const zapytanie = (p: ReturnType<typeof przegladarka>, q: string, j?: string) =>
  p.zadanie('GET', `/api/adres?q=${encodeURIComponent(q)}${j === undefined ? '' : `&j=${j}`}`);

describe('GET /api/adres', () => {
  it('daje wynik bez sesji i bez ciasteczka, z kontaktem w User-Agent z opcji serwera', async () => {
    const a = atrapa();
    const s = await start({ fetch: a.fetch, kontakt: 'kontakt@zamurem.example' });
    const p = przegladarka(s.adres);
    const r = await zapytanie(p, 'Obrońców Wybrzeża 4, Gdańsk', 'pl');
    expect(r.status, r.tekst).toBe(200);
    expect(r.body).toEqual(Z_NOMINATIM);
    expect(r.headers.get('set-cookie')).toBeNull();
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(a.wywolania[0].ua).toContain('kontakt@zamurem.example');
    expect(a.wywolania[0].url.searchParams.get('accept-language')).toBe('pl');
    // bez parametru j język to polski, a angielski idzie dalej
    await zapytanie(p, 'Wołoska 12, Warszawa');
    await zapytanie(p, 'Wołoska 13, Warszawa', 'en');
    expect(a.nom().map((w) => w.url.searchParams.get('accept-language'))).toEqual(['pl', 'pl', 'en']);
  });

  it('ten sam adres wpisany inaczej: drugi raz z pamięci serwera', async () => {
    const a = atrapa();
    const s = await start({ fetch: a.fetch });
    const p = przegladarka(s.adres);
    expect((await zapytanie(p, 'Obrońców Wybrzeża 4, Gdańsk')).body).toEqual(Z_NOMINATIM);
    expect((await zapytanie(p, '  obrońców  wybrzeża 4,  GDAŃSK ')).body).toEqual(Z_NOMINATIM);
    expect(a.wywolania).toHaveLength(1);
  });

  it('brak wyniku: 404 nie_ma, pamiętany przez dobę czasu serwera', async () => {
    const a = atrapa((url) => json(url.hostname === NOM ? [] : PHOTON_GDANSK));
    const s = await start({ fetch: a.fetch });
    const p = przegladarka(s.adres);
    const r = await zapytanie(p, 'Asdfgh 99999, Nigdzie');
    expect(r.status).toBe(404);
    expect(r.body.blad).toBe('nie_ma');
    expect(typeof r.body.komunikat).toBe('string');
    s.czekaj(DOBA - 1);
    expect((await zapytanie(p, 'asdfgh 99999, nigdzie')).status).toBe(404);
    expect(a.wywolania).toHaveLength(1);
    s.czekaj(2);
    expect((await zapytanie(p, 'asdfgh 99999, nigdzie')).status).toBe(404);
    expect(a.wywolania).toHaveLength(2);
  });

  it('Nominatim zawiódł, a Photon nic nie znalazł: 503 serwer_zajety bez pamięci, a nie 404 „nie ma adresu” na dobę', async () => {
    let nominatimDziala = false;
    const a = atrapa((url) =>
      url.hostname === NOM ? (nominatimDziala ? json(NOMINATIM_GDANSK) : json({}, 500)) : json({ features: [] }),
    );
    const s = await start({ fetch: a.fetch });
    const p = przegladarka(s.adres);
    const r = await zapytanie(p, 'Obrońców Wybrzeża 4, Gdańsk');
    expect(r.status, r.tekst).toBe(503);
    expect(r.body.blad).toBe('serwer_zajety');
    expect(r.headers.get('retry-after')).toBeTruthy();
    // drugi raz też 503 i drugie pytanie do Nominatim: nic nie zostało w pamięci
    s.czekaj(MIN);
    expect((await zapytanie(p, 'obrońców wybrzeża 4, gdańsk')).status).toBe(503);
    expect(a.nom()).toHaveLength(2);
    nominatimDziala = true;
    s.czekaj(MIN);
    const dobry = await zapytanie(p, 'Obrońców Wybrzeża 4, Gdańsk');
    expect(dobry.status).toBe(200);
    expect(dobry.body).toEqual(Z_NOMINATIM);
  });

  it('puste zapytanie, brak q, za długie zapytanie i zły język to 400 zle_dane, bez pytania na zewnątrz', async () => {
    const a = atrapa();
    const s = await start({ fetch: a.fetch });
    const p = przegladarka(s.adres);
    const zle = [
      await p.zadanie('GET', '/api/adres'),
      await p.zadanie('GET', '/api/adres?j=pl'),
      await zapytanie(p, ''),
      await zapytanie(p, '    '),
      await zapytanie(p, 'a'.repeat(ADRES_MAX_ZNAKOW + 1)),
      await zapytanie(p, 'Wołoska 12', 'de'),
      await zapytanie(p, 'Wołoska 12', ''),
    ];
    for (const r of zle) {
      expect(r.status, r.tekst).toBe(400);
      expect(r.body.blad).toBe('zle_dane');
    }
    expect(a.wywolania).toHaveLength(0);
    // równo 200 znaków przechodzi
    expect(ADRES_MAX_ZNAKOW).toBe(200);
    expect((await zapytanie(p, 'a'.repeat(200))).status).toBe(200);
  });

  it('Nominatim i Photon zawiodły: 503 serwer_zajety z Retry-After, a po naprawie działa', async () => {
    let dziala = false;
    const a = atrapa((url) => (dziala ? json(NOMINATIM_GDANSK) : json({ error: url.hostname }, 502)));
    const s = await start({ fetch: a.fetch });
    const p = przegladarka(s.adres);
    const r = await zapytanie(p, 'Obrońców Wybrzeża 4, Gdańsk');
    expect(r.status).toBe(503);
    expect(r.body.blad).toBe('serwer_zajety');
    expect(r.headers.get('retry-after')).toBeTruthy();
    dziala = true;
    s.czekaj(MIN);
    expect((await zapytanie(p, 'Obrońców Wybrzeża 4, Gdańsk')).status).toBe(200);
  });

  it('dwadzieścia zapytań z jednego IP w kwadrans przechodzi, 31. w minutę to 429', async () => {
    const a = atrapa();
    const s = await start({ fetch: a.fetch, odstepMs: 0 });
    const p = przegladarka(s.adres);
    // dwadzieścia różnych adresów rozłożonych na kwadrans (jedna osoba, albo cały akademik za jednym IP)
    for (let i = 0; i < 20; i++) {
      const r = await zapytanie(p, `Ulica ${i}, Gdańsk`);
      expect(r.status, `${i}: ${r.tekst}`).toBe(200);
      s.czekaj(45_000);
    }
    // seria w jednej minucie: 30 przechodzi, 31. dostaje 429 z Retry-After, także z pamięci i z błędnym zapytaniem
    s.czekaj(2 * MIN);
    for (let i = 0; i < 30; i++) {
      const r = await zapytanie(p, `Aleja ${i}, Gdynia`);
      expect(r.status, `${i}: ${r.tekst}`).toBe(200);
    }
    for (const q of ['Aleja 0, Gdynia', 'Aleja 99, Gdynia', '']) {
      const r = await zapytanie(p, q);
      expect(r.status, q).toBe(429);
      expect(r.body.blad).toBe('za_duzo_prob');
      expect(Number(r.headers.get('retry-after'))).toBeGreaterThan(0);
    }
    expect(a.wywolania).toHaveLength(50);
    // po minucie okno się zamyka
    s.czekaj(MIN + 1);
    expect((await zapytanie(p, 'Aleja 0, Gdynia')).status).toBe(200);
  });

  it('limit liczy się od razu: równoległe zapytania nie omijają go', async () => {
    const a = atrapa();
    const s = await start({ fetch: a.fetch, odstepMs: 0 });
    const p = przegladarka(s.adres);
    const r = await Promise.all(Array.from({ length: 40 }, (_, i) => zapytanie(p, `Ulica ${i}, Gdańsk`)));
    expect(r.filter((x) => x.status === 200)).toHaveLength(30);
    expect(r.filter((x) => x.status === 429)).toHaveLength(10);
  });

  it('dziennik błędów nie zawiera tekstu zapytania', async () => {
    const wpisy: string[] = [];
    const TAJNE = 'Tajna Ulica 77, Gdańsk';
    // dostawcy rzucają błędy z pełnym adresem zapytania w komunikacie (tak robią niektóre warstwy sieci)
    const a = atrapa((url) => {
      throw new Error(`połączenie z ${url.href} zerwane (${decodeURIComponent(url.search)})`);
    });
    const s = await start({ fetch: a.fetch }, { dziennik: (w) => wpisy.push(w) });
    const p = przegladarka(s.adres);
    const r = await zapytanie(p, TAJNE);
    expect(r.status).toBe(503);
    expect(r.tekst).not.toMatch(/tajna|ulica|77/i);
    // awarię widać w dzienniku (bez tego test niczego by nie sprawdzał), ale najwyżej raz na minutę
    expect(wpisy).toHaveLength(1);
    expect(wpisy[0]).toMatch(/adres/i);
    await zapytanie(p, 'Druga Tajna 88, Gdańsk');
    expect(wpisy).toHaveLength(1);
    s.czekaj(MIN + 1);
    await zapytanie(p, 'Trzecia Tajna 99, Gdańsk');
    expect(wpisy).toHaveLength(2);
    const razem = wpisy.join('\n');
    for (const fragment of ['tajna', 'ulica', '77', '88', '99', 'gdańsk', 'q=', 'https', '%'])
      expect(razem.toLowerCase(), fragment).not.toContain(fragment);
  });

  it('nieoczekiwany wyjątek w wyszukiwarce: 500 i dziennik bez jego komunikatu', async () => {
    const wpisy: string[] = [];
    const s = await start(
      {
        teraz: () => {
          throw new Error('Tajna Ulica 77, Gdańsk');
        },
      },
      { dziennik: (w) => wpisy.push(w) },
    );
    const r = await zapytanie(przegladarka(s.adres), 'Tajna Ulica 77, Gdańsk');
    expect(r.status).toBe(500);
    expect(r.body.blad).toBe('blad_serwera');
    expect(wpisy.length).toBeGreaterThan(0);
    expect(wpisy.join('\n')).not.toMatch(/tajna|ulica|77/i);
  });

  it('inna metoda niż GET to 405', async () => {
    const s = await start({ fetch: atrapa().fetch });
    const r = await przegladarka(s.adres).zadanie('POST', '/api/adres', {});
    expect(r.status).toBe(405);
  });
});
