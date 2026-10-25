/* Osada AI w zapisie gry (src/ui/zapis.ts), etap 2 osady AI (docs/superpowers/plans/2026-10-24-osada-ai-etap-2.md, zadanie 3):
   pole `Save.osada` jest opcjonalne (brak pola to gra bez osady, zapis bez flagi jest taki sam jak przed osadą), jego zły
   kształt odrzuca cały zapis (od stanu osady zależy przebieg gry), o fladze wczytanej gry decyduje zapis, nie adres
   (`osadaWlaczona`, jak `pietraWlaczone`), a powrót na ekran startowy zachowuje `osada=1` (`adresStartowy`). Do tego nieudany
   zapis (brak miejsca w pamięci przeglądarki, dwie gry w jednym zapisie) nie kasuje poprzedniego. Rozmiar zapisu po 45 dniach
   i odtworzenie gry osady z zapisu są w osada-gra.test.ts. */

import { describe, expect, it } from 'vitest';
import {
  adresStartowy,
  jestStanOsady,
  osadaOdrzuconaPrzezSiec,
  osadaWlaczona,
  readSave,
  SAVE_KEY,
  type Save,
  writeSave,
} from '../../src/ui/zapis.ts';

const memory = () => {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};

/** najmniejszy zapis, który przechodzi walidację `readSave` (sprawdza tylko wersje i `data.geo`) */
const zapis = (extra: Record<string, unknown> = {}): Save =>
  ({
    v: 1,
    at: 1,
    data: { geo: {} },
    seed: 2051,
    sim: { v: 3 },
    gov: { v: 1 },
    screen: 0,
    ...extra,
  }) as unknown as Save;

/** najmniejszy stan osady „jest”, który przechodzi kontrolę kształtu (nie jest grą, którą da się wczytać) */
const jest = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  v: 1,
  stan: 'jest',
  klucz: '-1,0',
  geo: { c: [54.4, 18.6], b: [], r: [], a: [], w: [], poi: [] },
  world: 'abc12345',
  gra: { v: 1, seed: 7, opts: {}, sim: { v: 3 }, gov: { v: 1 }, pamiec: { v: 1 } },
  odkryta: false,
  odwolania: 0,
  ...extra,
});

describe('osadaWlaczona: zapis wygrywa z adresem', () => {
  const adres = (q: string) => new URLSearchParams(q);

  it('nowa gra czyta ?osada=1 (tylko wartość 1)', () => {
    expect(osadaWlaczona(null, adres('?osada=1'))).toBe(true);
    expect(osadaWlaczona(null, adres('?demo=przymorze&osada=1&speed=0'))).toBe(true);
    expect(osadaWlaczona(null, adres(''))).toBe(false);
    expect(osadaWlaczona(null, adres('?osada=0'))).toBe(false);
    expect(osadaWlaczona(null, adres('?osada=2'))).toBe(false);
    expect(osadaWlaczona(null, adres('?osada'))).toBe(false);
  });

  it('wczytana gra zachowuje to, z czym ją zaczęto: pole osada w zapisie włącza flagę bez parametru', () => {
    expect(osadaWlaczona(zapis({ osada: { v: 1, stan: 'czeka' } }), adres(''))).toBe(true);
    expect(osadaWlaczona(zapis({ osada: { v: 1, stan: 'brak', powod: 'dane' } }), adres('?osada=0'))).toBe(true);
  });

  it('zapis bez pola osada zostaje bez osady, choć adres ma ?osada=1', () => {
    expect(osadaWlaczona(zapis(), adres('?osada=1'))).toBe(false);
  });
});

describe('osada i gra z sąsiadami: ?osada=1 razem z ?siec=1 jest w tym etapie wyłączone', () => {
  const adres = (q: string) => new URLSearchParams(q);

  it('nowa gra z obiema flagami nie dostaje osady; każda flaga osobno działa jak dotąd', () => {
    expect(osadaWlaczona(null, adres('?osada=1&siec=1'))).toBe(false);
    expect(osadaWlaczona(null, adres('?siec=1&demo=przymorze&osada=1'))).toBe(false);
    expect(osadaWlaczona(null, adres('?osada=1'))).toBe(true);
    expect(osadaWlaczona(null, adres('?osada=1&siec=0'))).toBe(true);
    expect(osadaWlaczona(null, adres('?osada=1&siec=2'))).toBe(true);
    expect(osadaWlaczona(null, adres('?siec=1'))).toBe(false);
  });

  it('wczytana gra z osadą zachowuje ją także z ?siec=1 w adresie: zapis wygrywa z adresem, osada nie ginie po cichu', () => {
    expect(osadaWlaczona(zapis({ osada: { v: 1, stan: 'czeka' } }), adres('?siec=1'))).toBe(true);
    expect(osadaWlaczona(zapis({ osada: { v: 1, stan: 'czeka' } }), adres('?osada=1&siec=1'))).toBe(true);
    // zapis bez osady dalej jej nie dostaje
    expect(osadaWlaczona(zapis(), adres('?osada=1&siec=1'))).toBe(false);
  });

  it('osadaOdrzuconaPrzezSiec: tylko nowa gra z obiema flagami, czyli ta, o której gra ostrzega w konsoli', () => {
    expect(osadaOdrzuconaPrzezSiec(null, adres('?osada=1&siec=1'))).toBe(true);
    expect(osadaOdrzuconaPrzezSiec(null, adres('?osada=1'))).toBe(false);
    expect(osadaOdrzuconaPrzezSiec(null, adres('?siec=1'))).toBe(false);
    expect(osadaOdrzuconaPrzezSiec(null, adres('?osada=1&siec=0'))).toBe(false);
    expect(osadaOdrzuconaPrzezSiec(null, adres(''))).toBe(false);
    // wczytana gra niczego nie odrzuca: albo ma osadę z zapisu, albo nigdy jej nie miała
    expect(osadaOdrzuconaPrzezSiec(zapis(), adres('?osada=1&siec=1'))).toBe(false);
    expect(osadaOdrzuconaPrzezSiec(zapis({ osada: { v: 1, stan: 'czeka' } }), adres('?osada=1&siec=1'))).toBe(false);
  });
});

describe('adresStartowy: osada=1 wraca na ekran startowy', () => {
  it('przenosi osada=1 razem z resztą parametrów gry, w stałej kolejności (siec, pietra, osada, lancuchy, lang)', () => {
    expect(adresStartowy('/', '?demo=przymorze&osada=1&speed=0&cam=all')).toBe('/?osada=1');
    expect(adresStartowy('/za-murem/', '?siec=1&pietra=1&osada=1&lancuchy=0&lang=en')).toBe(
      '/za-murem/?siec=1&pietra=1&osada=1&lancuchy=0&lang=en',
    );
    expect(adresStartowy('/', '?lang=pl&osada=1&lancuchy=0')).toBe('/?osada=1&lancuchy=0&lang=pl');
  });

  it('osada tylko z wartością 1; bez niej adres jak dotąd', () => {
    expect(adresStartowy('/', '?osada=0')).toBe('/');
    expect(adresStartowy('/', '?osada=2')).toBe('/');
    expect(adresStartowy('/', '?osada=')).toBe('/');
    expect(adresStartowy('/', '?pietra=1&lang=en')).toBe('/?pietra=1&lang=en');
  });
});

describe('Save.osada: kontrola kształtu w readSave', () => {
  it('zapis bez pola osada wczytuje się i go nie ma (gra bez flagi to zapis bajt w bajt dzisiejszy)', () => {
    const store = memory();
    expect(writeSave(zapis(), store)).toBe(true);
    const back = readSave(store);
    expect(back).not.toBeNull();
    expect('osada' in back!).toBe(false);
    expect(store.m.get(SAVE_KEY)).not.toContain('osada');
  });

  it('każdy dobry stan osady przechodzi zapis i odczyt bez zmian: czeka, brak (trzy powody), jest', () => {
    const dobre = [
      { v: 1, stan: 'czeka' },
      { v: 1, stan: 'brak', powod: 'dane' },
      { v: 1, stan: 'brak', powod: 'regula' },
      { v: 1, stan: 'brak', powod: 'blad' },
      jest(),
      jest({ odkryta: true, kontakt: { dzien: 5, ludnosc: 14, budowle: 2 }, odwolania: 3 }),
      jest({ upadla: { dzien: 31, powod: 'exodus' }, odwolania: 1 }),
      jest({ upadla: { dzien: 12, powod: 'pustka' } }),
    ];
    for (const osada of dobre) {
      const store = memory();
      expect(writeSave(zapis({ osada }), store), JSON.stringify(osada).slice(0, 80)).toBe(true);
      expect(readSave(store)?.osada).toEqual(osada);
    }
  });

  it('zły kształt odrzuca cały zapis (od stanu osady zależy przebieg), także z chmury', () => {
    const zle: [string, unknown][] = [
      ['null', null],
      ['liczba', 1],
      ['napis', 'jest'],
      ['pusty obiekt', {}],
      ['tablica', []],
      ['zła wersja', { v: 2, stan: 'czeka' }],
      ['bez wersji', { stan: 'czeka' }],
      ['nieznany stan', { v: 1, stan: 'nieznany' }],
      ['brak bez powodu', { v: 1, stan: 'brak' }],
      ['brak z nieznanym powodem', { v: 1, stan: 'brak', powod: 'inny' }],
      ['jest bez klucza', jest({ klucz: undefined })],
      ['jest ze złym kluczem', jest({ klucz: 'a,b' })],
      ['jest z kluczem z zerem wiodącym', jest({ klucz: '01,0' })],
      ['jest z kluczem domu zapisanym liczbą', jest({ klucz: 1 })],
      ['jest bez geo', jest({ geo: undefined })],
      ['jest z geo bez budynków', jest({ geo: { c: [1, 2], r: [], a: [], w: [], poi: [] } })],
      ['jest z geo ze złym środkiem', jest({ geo: { c: [1], b: [], r: [], a: [], w: [], poi: [] } })],
      ['jest bez odcisku świata', jest({ world: undefined })],
      ['jest z odciskiem liczbą', jest({ world: 12 })],
      ['jest bez gry', jest({ gra: undefined })],
      [
        'jest z grą w złej wersji',
        jest({ gra: { v: 2, seed: 7, opts: {}, sim: { v: 3 }, gov: { v: 1 }, pamiec: { v: 1 } } }),
      ],
      [
        'jest z symulacją w złej wersji',
        jest({ gra: { v: 1, seed: 7, opts: {}, sim: { v: 2 }, gov: { v: 1 }, pamiec: { v: 1 } } }),
      ],
      [
        'jest z zarządem w złej wersji',
        jest({ gra: { v: 1, seed: 7, opts: {}, sim: { v: 3 }, gov: { v: 2 }, pamiec: { v: 1 } } }),
      ],
      [
        'jest z pamięcią silnika w złej wersji',
        jest({ gra: { v: 1, seed: 7, opts: {}, sim: { v: 3 }, gov: { v: 1 }, pamiec: { v: 2 } } }),
      ],
      ['jest bez opcji gry', jest({ gra: { v: 1, seed: 7, sim: { v: 3 }, gov: { v: 1 }, pamiec: { v: 1 } } })],
      [
        'jest z ziarnem gry napisem',
        jest({ gra: { v: 1, seed: '7', opts: {}, sim: { v: 3 }, gov: { v: 1 }, pamiec: { v: 1 } } }),
      ],
      ['jest bez odkryta', jest({ odkryta: undefined })],
      ['jest z odkryta napisem', jest({ odkryta: 'tak' })],
      ['jest z kontaktem bez ludności', jest({ kontakt: { dzien: 5, budowle: 2 } })],
      ['jest z kontaktem z napisem', jest({ kontakt: { dzien: '5', ludnosc: 1, budowle: 2 } })],
      ['jest z kontaktem null', jest({ kontakt: null })],
      ['jest bez licznika odwołań', jest({ odwolania: undefined })],
      ['jest z ujemnym licznikiem odwołań', jest({ odwolania: -1 })],
      ['jest z ułamkowym licznikiem odwołań', jest({ odwolania: 1.5 })],
      ['jest z upadkiem bez powodu', jest({ upadla: { dzien: 3 } })],
      ['jest z upadkiem bez dnia', jest({ upadla: { powod: 'pustka' } })],
      ['jest z upadkiem null', jest({ upadla: null })],
    ];
    for (const [opis, osada] of zle) {
      const store = memory();
      store.m.set(SAVE_KEY, JSON.stringify(zapis({ osada })));
      expect(readSave(store), opis).toBeNull();
    }
  });

  it('jestStanOsady zgadza się z readSave i nie rzuca na dowolnej wartości', () => {
    for (const x of [
      undefined,
      null,
      0,
      '',
      [],
      {},
      { v: 1 },
      { v: 1, stan: 'jest' },
      jest({ gra: 5 }),
      jest({ geo: 5 }),
    ])
      expect(jestStanOsady(x)).toBe(false);
    expect(jestStanOsady({ v: 1, stan: 'czeka' })).toBe(true);
    expect(jestStanOsady(jest())).toBe(true);
  });

  it('osada nie psuje sąsiednich pól: flaga pięter i stan ścieżki przeżywają zapis razem z osadą', () => {
    const store = memory();
    expect(writeSave(zapis({ pietra: true, osada: { v: 1, stan: 'czeka' } }), store)).toBe(true);
    const back = readSave(store);
    expect(back?.pietra).toBe(true);
    expect(back?.osada).toEqual({ v: 1, stan: 'czeka' });
    // zła osada z dobrą flagą pięter to nadal zły zapis
    const zly = memory();
    zly.m.set(SAVE_KEY, JSON.stringify(zapis({ pietra: true, osada: { v: 1, stan: 'brak' } })));
    expect(readSave(zly)).toBeNull();
  });
});

describe('nieudany zapis nie kasuje poprzedniego (dwie gry w jednym zapisie a limit pamięci przeglądarki)', () => {
  /** pamięć z limitem długości jednej wartości: powyżej niego setItem rzuca jak QuotaExceededError i niczego nie zmienia */
  const zLimitem = (limit: number) => {
    const m = new Map<string, string>();
    return {
      m,
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (v.length > limit) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        m.set(k, v);
      },
      removeItem: (k: string) => void m.delete(k),
    };
  };

  it('zapis ponad limit zwraca false, a poprzedni zapis zostaje i wczytuje się', () => {
    const maly = zapis({ osada: { v: 1, stan: 'czeka' } });
    const duzy = zapis({
      osada: jest({ geo: { c: [1, 2], b: [], r: [], a: [], w: [], poi: [], zapas: 'x'.repeat(5000) } }),
    });
    const store = zLimitem(JSON.stringify(maly).length + 100);
    expect(writeSave(maly, store)).toBe(true);
    const przed = store.m.get(SAVE_KEY);
    expect(JSON.stringify(duzy).length).toBeGreaterThan(JSON.stringify(maly).length + 100);
    expect(writeSave(duzy, store)).toBe(false);
    expect(store.m.get(SAVE_KEY)).toBe(przed);
    expect(readSave(store)?.osada).toEqual({ v: 1, stan: 'czeka' });
  });
});
