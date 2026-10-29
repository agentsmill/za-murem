/* geocode (src/world/osm.ts) i loadAddress (src/world/load.ts): z podanym klientem API gra najpierw pyta serwer gry
   (GET /api/adres, zawsze po polsku), a bez serwera szuka wprost w Nominatim jak dotąd; bez podanego klienta nie
   rusza serwera gry w ogóle (adres z pola nie wychodzi do nas, dopóki gra sieciowa nie jest włączona). Bez sieci:
   `api` jest atrapą, a globalThis.fetch podmieniony, więc żadne zapytanie nie wychodzi. */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ustawJezyk } from '../../src/core/jezyk.ts';
import { type ApiGry, utworzApi, type Wynik } from '../../src/net/api.ts';
import { KOMUNIKAT_BRAK_ADRESU, type KodBledu, type WynikAdresu } from '../../src/net/protokol.ts';
import { loadAddress } from '../../src/world/load.ts';
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

  it('serwer dostaje zawsze pl, także w angielskiej grze (etykieta adresu liczy się do ziarna świata i imion)', async () => {
    ustawJezyk('en');
    const { api, adres } = atrapa({ ok: true, status: 200, dane: OBRONCOW });
    await geocode('Wołoska 12, Warszawa', api);
    expect(adres).toHaveBeenCalledTimes(1);
    expect(adres).toHaveBeenCalledWith('Wołoska 12, Warszawa', 'pl');
  });

  it('adres, którego nie ma: błąd „Nie znalazłem…” i żadnego zapytania z przeglądarki', async () => {
    const f = podmienFetch(() => {
      throw new Error('fetch nie powinien wyjść');
    });
    const { api, adres } = atrapa(blad(404, 'nie_ma', KOMUNIKAT_BRAK_ADRESU));
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
  it('nie_ma z innym zdaniem (serwer bez trasy /api/adres): nie jest „adresu nie ma”, jedno zapytanie do Nominatim', async () => {
    const f = podmienFetch(() => jsonOk(NOMINATIM));
    const { api, adres } = atrapa(blad(404, 'nie_ma', 'Nie ma takiego adresu API.'));
    expect(await geocode('Obrońców Wybrzeża 4, Gdańsk', api)).toEqual(OBRONCOW);
    expect(adres).toHaveBeenCalledTimes(1);
    expect(f).toHaveBeenCalledTimes(1);
    expect(String(f.mock.calls[0][0])).toContain('https://nominatim.openstreetmap.org/search');
  });

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

  it('z prawdziwym klientem na Pages (demo offline): /api/adres odpowiada stroną HTML, adres idzie do Nominatim', async () => {
    const f = podmienFetch((url) =>
      url.startsWith('/api/adres')
        ? new Response('<!doctype html><title>404</title>', { status: 404, headers: { 'Content-Type': 'text/html' } })
        : jsonOk(NOMINATIM),
    );
    expect(await geocode('Obrońców Wybrzeża 4, Gdańsk', utworzApi())).toEqual(OBRONCOW);
    expect(f).toHaveBeenCalledTimes(2);
    const pierwsze = new URL(String(f.mock.calls[0][0]), 'http://gra.test');
    expect(pierwsze.pathname).toBe('/api/adres');
    expect(pierwsze.searchParams.get('q')).toBe('Obrońców Wybrzeża 4, Gdańsk');
    expect(pierwsze.searchParams.get('j')).toBe('pl');
    expect(String(f.mock.calls[1][0])).toContain('https://nominatim.openstreetmap.org/search');
  });

  it('z prawdziwym klientem i bez sieci w ogóle: błąd sieci z Nominatim jak dziś, bez pętli ponowień', async () => {
    const f = podmienFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    await expect(geocode('Wołoska 12, Warszawa', utworzApi())).rejects.toThrow('Failed to fetch');
    // jedno zapytanie do serwera gry i jedno do Nominatim
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('adresu nie ma także w Nominatim: ten sam czytelny błąd', async () => {
    podmienFetch(() => jsonOk([]));
    const { api } = atrapa(blad(0, 'siec'));
    await expect(geocode('Asdfgh 99999, Nigdzie', api)).rejects.toThrow(/^Nie znalazłem takiego adresu\./);
  });
});

describe('geocode bez klienta API: tak jak przed serwerem gry', () => {
  it('geocode(q) bez api: jedno zapytanie wprost do Nominatim i nigdy /api/adres', async () => {
    const f = podmienFetch(() => jsonOk(NOMINATIM));
    expect(await geocode('Obrońców Wybrzeża 4, Gdańsk')).toEqual(OBRONCOW);
    expect(f).toHaveBeenCalledTimes(1);
    const url = new URL(String(f.mock.calls[0][0]));
    expect(url.origin).toBe('https://nominatim.openstreetmap.org');
    expect(url.searchParams.get('q')).toBe('Obrońców Wybrzeża 4, Gdańsk');
    expect(f.mock.calls.some(([u]) => String(u).includes('/api/'))).toBe(false);
  });

  it('adresu nie ma w Nominatim: ten sam czytelny błąd, nadal bez serwera gry', async () => {
    const f = podmienFetch(() => jsonOk([]));
    await expect(geocode('Asdfgh 99999, Nigdzie')).rejects.toThrow(/^Nie znalazłem takiego adresu\./);
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('loadAddress: klient API tylko wtedy, gdy podany', () => {
  it('z api: pyta serwer gry (po polsku), a „adresu nie ma” kończy sprawę bez żadnego fetcha', async () => {
    ustawJezyk('en');
    const f = podmienFetch(() => {
      throw new Error('fetch nie powinien wyjść');
    });
    const { api, adres } = atrapa(blad(404, 'nie_ma', KOMUNIKAT_BRAK_ADRESU));
    await expect(loadAddress('Asdfgh 99999, Nigdzie', () => {}, api)).rejects.toThrow(/^Couldn’t find that address\./);
    expect(adres).toHaveBeenCalledWith('Asdfgh 99999, Nigdzie', 'pl');
    expect(f).not.toHaveBeenCalled();
  });

  it('bez api (jak woła main.ts): adres idzie wprost do Nominatim, serwer gry nie dostaje nic', async () => {
    const f = podmienFetch(() => jsonOk([]));
    await expect(loadAddress('Asdfgh 99999, Nigdzie', () => {})).rejects.toThrow(/^Nie znalazłem takiego adresu\./);
    expect(f).toHaveBeenCalledTimes(1);
    expect(String(f.mock.calls[0][0])).toContain('https://nominatim.openstreetmap.org/search');
  });
});
