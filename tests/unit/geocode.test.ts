/* geocode (src/world/osm.ts): gra najpierw pyta serwer gry (GET /api/adres), a bez serwera szuka wprost w Nominatim
   jak dotąd. Bez sieci: `api` jest atrapą, a globalThis.fetch podmieniony, więc żadne zapytanie nie wychodzi. */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ustawJezyk } from '../../src/core/jezyk.ts';
import type { ApiGry, Wynik } from '../../src/net/api.ts';
import type { KodBledu, WynikAdresu } from '../../src/net/protokol.ts';
import { geocode } from '../../src/world/osm.ts';

const OBRONCOW: WynikAdresu = {
  lat: 54.4153,
  lon: 18.5748,
  label: '4, Obrońców Wybrzeża, Przymorze Małe, Gdańsk, Polska',
  area: 'Przymorze Małe',
  street: 'Obrońców Wybrzeża',
  city: 'Gdańsk',
};

/** odpowiedź Nominatim dla tego samego adresu */
const NOMINATIM = [
  {
    lat: '54.4153',
    lon: '18.5748',
    display_name: OBRONCOW.label,
    address: { house_number: '4', road: 'Obrońców Wybrzeża', neighbourhood: 'Przymorze Małe', city: 'Gdańsk' },
  },
];

const jsonOk = (v: unknown) =>
  new Response(JSON.stringify(v), { status: 200, headers: { 'Content-Type': 'application/json' } });

/** atrapa klienta API: odpowiada tym, co dostanie, i zapisuje wołania */
function atrapa(wynik: Wynik<WynikAdresu>) {
  const adres = vi.fn(async (_q: string, _j: 'pl' | 'en') => wynik);
  return { api: { adres } as Pick<ApiGry, 'adres'>, adres };
}

const blad = (status: number, kod: KodBledu, komunikat = 'Coś poszło nie tak.'): Wynik<never> => ({
  ok: false,
  status,
  blad: kod,
  komunikat,
});

/** podmienia globalThis.fetch (przeglądarka gracza); zwraca atrapę do sprawdzania wołań */
function podmienFetch(odp: (url: string) => Response | Promise<Response>) {
  const f = vi.fn(async (url: RequestInfo | URL) => odp(String(url)));
  vi.stubGlobal('fetch', f);
  return f;
}

afterEach(() => {
  vi.unstubAllGlobals();
  ustawJezyk('pl');
});

describe('geocode: najpierw serwer gry', () => {
  it('z serwerem: wynik z /api/adres, przeglądarka nie pyta Nominatim', async () => {
    const f = podmienFetch(() => {
      throw new Error('fetch nie powinien wyjść');
    });
    const { api, adres } = atrapa({ ok: true, status: 200, dane: OBRONCOW });
    expect(await geocode('Obrońców Wybrzeża 4, Gdańsk', api)).toEqual(OBRONCOW);
    expect(adres).toHaveBeenCalledTimes(1);
    expect(adres).toHaveBeenCalledWith('Obrońców Wybrzeża 4, Gdańsk', 'pl');
    expect(f).not.toHaveBeenCalled();
  });

  it('serwerowi idzie bieżący język gry', async () => {
    ustawJezyk('en');
    const { api, adres } = atrapa({ ok: true, status: 200, dane: OBRONCOW });
    await geocode('Wołoska 12, Warszawa', api);
    expect(adres).toHaveBeenCalledWith('Wołoska 12, Warszawa', 'en');
  });

  it('adres, którego nie ma: błąd „Nie znalazłem…” i żadnego zapytania z przeglądarki', async () => {
    const f = podmienFetch(() => {
      throw new Error('fetch nie powinien wyjść');
    });
    const { api, adres } = atrapa(blad(404, 'nie_ma', 'Nie znalazłem takiego adresu. Spróbujcie z miastem.'));
    await expect(geocode('Asdfgh 99999, Nigdzie', api)).rejects.toThrow(/^Nie znalazłem takiego adresu\./);
    expect(adres).toHaveBeenCalledTimes(1);
    expect(f).not.toHaveBeenCalled();
    // po angielsku to samo zdanie, co przy wyszukiwaniu wprost
    ustawJezyk('en');
    await expect(geocode('Asdfgh 99999, Nigdzie', api)).rejects.toThrow(/^Couldn’t find that address\./);
    expect(f).not.toHaveBeenCalled();
  });
});

describe('geocode: bez serwera jak dotąd, wprost do Nominatim', () => {
  it.each([
    ['brak_serwera', 404],
    ['siec', 0],
    ['czas', 0],
    ['serwer_zajety', 503],
    ['za_duzo_prob', 429],
    ['blad_serwera', 500],
  ] as const)('%s: jedno zapytanie do Nominatim i jego wynik', async (kod, status) => {
    const f = podmienFetch(() => jsonOk(NOMINATIM));
    const { api, adres } = atrapa(blad(status, kod));
    expect(await geocode('Obrońców Wybrzeża 4, Gdańsk', api)).toEqual(OBRONCOW);
    expect(adres).toHaveBeenCalledTimes(1);
    expect(f).toHaveBeenCalledTimes(1);
    const url = new URL(String(f.mock.calls[0][0]));
    expect(url.origin).toBe('https://nominatim.openstreetmap.org');
    expect(url.pathname).toBe('/search');
    expect(url.searchParams.get('q')).toBe('Obrońców Wybrzeża 4, Gdańsk');
  });

  it('bez podanego klienta (Pages, demo offline): /api/adres odpowiada stroną HTML, adres idzie do Nominatim', async () => {
    const f = podmienFetch((url) =>
      url.startsWith('/api/adres')
        ? new Response('<!doctype html><title>404</title>', { status: 404, headers: { 'Content-Type': 'text/html' } })
        : jsonOk(NOMINATIM),
    );
    expect(await geocode('Obrońców Wybrzeża 4, Gdańsk')).toEqual(OBRONCOW);
    expect(f).toHaveBeenCalledTimes(2);
    const pierwsze = new URL(String(f.mock.calls[0][0]), 'http://gra.test');
    expect(pierwsze.pathname).toBe('/api/adres');
    expect(pierwsze.searchParams.get('q')).toBe('Obrońców Wybrzeża 4, Gdańsk');
    expect(pierwsze.searchParams.get('j')).toBe('pl');
    expect(String(f.mock.calls[1][0])).toContain('https://nominatim.openstreetmap.org/search');
  });

  it('bez klienta i bez sieci w ogóle: błąd sieci z Nominatim jak dziś, bez pętli ponowień', async () => {
    const f = podmienFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    await expect(geocode('Wołoska 12, Warszawa')).rejects.toThrow('Failed to fetch');
    // jedno zapytanie do serwera gry i jedno do Nominatim
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('adresu nie ma także w Nominatim: ten sam czytelny błąd', async () => {
    podmienFetch(() => jsonOk([]));
    const { api } = atrapa(blad(0, 'siec'));
    await expect(geocode('Asdfgh 99999, Nigdzie', api)).rejects.toThrow(/^Nie znalazłem takiego adresu\./);
  });
});
