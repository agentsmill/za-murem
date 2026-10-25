/* Przygotowanie osady przed jej startem (src/ui/osada.ts: `przygotuj`, `przygotujCiezkie`), etap 2 osady AI, runda poprawek 1
   zadania 3 (rozstrzygnięcie 1 kontrolera). Osada startuje w 6:00 drugiego dnia (`TICK_STARTU_OSADY`), ale nadrabianie jej gry od
   ticku 0 (około 12000 kroków, rzędu 0,2 do 0,5 s) w jednej klatce psuło płynność tej klatki. Dlatego gospodarz może zrobić tę
   pracę na zapas: niepodzielne kroki (wybór kwadratu, budowa gry, rozgrzewka) naraz pod ekranem ładowania (`przygotujCiezkie`),
   a nadrabianie po `KAWALEK_NADRABIANIA` ticków na klatkę (`przygotuj`). Publicznie osada dalej `czeka` aż do ticku startu (zapis
   to `{ v: 1, stan: 'czeka' }`, po wczytaniu przygotowanie zaczyna się od nowa), a stan w ticku startu jest bajt w bajt ten sam,
   co przy nadrabianiu naraz (skrót gry, kwadrat). Co nie zdążyło się zrobić na zapas, robi się w ticku startu naraz, jak dotąd.
   Pełny przebieg z naszą grą (skróty obu gier po 5 dobach równe wzorcowi) jest w osada-gra.test.ts. */

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { nowaGraAi, skrotGry } from '../../src/ai/gra.ts';
import { wybierzOsade } from '../../src/ai/kwadrat.ts';
import { hashString } from '../../src/core/rng.ts';
import { doOtoczenia } from '../../src/sim/sasiedzi.ts';
import {
  KAWALEK_NADRABIANIA,
  nowaOsadaGry,
  type OsadaGry,
  osadaZZapisu,
  TICK_STARTU_OSADY,
} from '../../src/ui/osada.ts';
import type { Geo } from '../../src/world/geo.ts';
import { type Uklad, ukladZGeo } from '../../src/world/kwadraty.ts';
import { daneDema, wczytajDemo } from '../../tools/osada-kwadraty.ts';

// Wszystko liczy się naprawdę, ale test widzi, ile razy i kiedy: doOtoczenia (osobny krok rozgrzewki, a nie pierwszy kawałek
// nadrabiania), wybierzOsade i nowaGraAi (start nie powtarza pracy z przygotowania)
vi.mock('../../src/sim/sasiedzi.ts', async (importOriginal) => {
  const m = await importOriginal<typeof import('../../src/sim/sasiedzi.ts')>();
  return { ...m, doOtoczenia: vi.fn(m.doOtoczenia) };
});
vi.mock('../../src/ai/kwadrat.ts', async (importOriginal) => {
  const m = await importOriginal<typeof import('../../src/ai/kwadrat.ts')>();
  return { ...m, wybierzOsade: vi.fn(m.wybierzOsade) };
});
vi.mock('../../src/ai/gra.ts', async (importOriginal) => {
  const m = await importOriginal<typeof import('../../src/ai/gra.ts')>();
  return { ...m, nowaGraAi: vi.fn(m.nowaGraAi) };
});

const START = TICK_STARTU_OSADY;

type Demo = ReturnType<typeof wczytajDemo>;
type Dane = Awaited<ReturnType<typeof daneDema>>;

let demo: Demo;
let dane: Dane;
let uklad: Uklad;
let SEED = 0;
/** osada po starcie z nadrabianiem naraz (jak dotąd): kwadrat i skróty gry w ticku startu i 400 ticków później */
let referencja: { klucz: string; skrot: string; skrot400: string };

beforeAll(async () => {
  demo = wczytajDemo('przymorze');
  dane = await daneDema('przymorze');
  uklad = ukladZGeo(demo.geo);
  SEED = Number.parseInt(hashString(demo.addr), 16) || 2051;
  const o = nowaOsadaGry(SEED, dane, uklad);
  o.dane(demo.kwadraty);
  o.krok(START);
  const klucz = o.swiat!.klucz;
  const skrot = skrotGry(o.gra!);
  for (let t = START + 1; t <= START + 400; t++) o.krok(t);
  referencja = { klucz, skrot, skrot400: skrotGry(o.gra!) };
}, 300_000);

/** nowa osada z kompletem danych (jeszcze bez przygotowania) */
function nowaZDanymi(): OsadaGry {
  const o = nowaOsadaGry(SEED, dane, uklad);
  o.dane(demo.kwadraty);
  return o;
}

/** kawałki przygotowania aż do fazy „gotowa” (albo „bez-osady”); zwraca liczbę wywołań */
function przygotujDoKonca(osada: OsadaGry, maks = 500): number {
  let n = 0;
  for (; n < maks; n++) {
    const faza = osada.podglad().przygotowanie?.faza;
    if (faza === 'gotowa' || faza === 'bez-osady') return n;
    osada.przygotuj();
  }
  throw new Error(`przygotowanie nie skończyło się w ${maks} wywołaniach: ${JSON.stringify(osada.podglad())}`);
}

/** start w ticku startu i 400 ticków lockstepu: skróty do porównania z referencją */
function startIDalej(osada: OsadaGry): { klucz: string; skrot: string; skrot400: string } {
  osada.krok(START);
  expect(osada.stan).toBe('jest');
  const klucz = osada.swiat!.klucz;
  const skrot = skrotGry(osada.gra!);
  for (let t = START + 1; t <= START + 400; t++) osada.krok(t);
  return { klucz, skrot, skrot400: skrotGry(osada.gra!) };
}

describe('przygotowanie osady na zapas', () => {
  it('kawałki po KAWALEK_NADRABIANIA ticków: osada dalej czeka, zapis to czeka, a po starcie stan jest ten sam co przy nadrabianiu naraz', () => {
    const osada = nowaZDanymi();
    osada.przygotujCiezkie();
    expect(osada.podglad().przygotowanie).toEqual({ faza: 'nadrabianie', tick: 0 });
    let poprzedni = 0;
    let wywolan = 0;
    while (osada.podglad().przygotowanie?.faza === 'nadrabianie') {
      osada.przygotuj();
      wywolan++;
      const tick = osada.podglad().przygotowanie?.tick ?? -1;
      expect(tick).toBeGreaterThan(poprzedni);
      expect(tick - poprzedni).toBeLessThanOrEqual(KAWALEK_NADRABIANIA);
      poprzedni = tick;
      // na zewnątrz nic się nie dzieje: osada czeka, gry nie widać, zapis ma tylko „czeka”
      expect(osada.stan).toBe('czeka');
      expect(osada.gra).toBeNull();
      expect(osada.swiat).toBeNull();
      expect(osada.zapisz()).toEqual({ v: 1, stan: 'czeka' });
    }
    expect(poprzedni).toBe(START);
    expect(wywolan).toBe(Math.ceil(START / KAWALEK_NADRABIANIA));
    expect(osada.podglad().przygotowanie).toEqual({ faza: 'gotowa', tick: START });
    // do ticku startu nic się nie zmienia, nawet po kolejnych wywołaniach i krokach przed startem
    osada.przygotuj();
    osada.krok(START - 1);
    expect(osada.stan).toBe('czeka');
    expect(osada.podglad().przygotowanie).toEqual({ faza: 'gotowa', tick: START });
    expect(startIDalej(osada)).toEqual(referencja);
  });

  it('niepodzielne kroki idą po jednym na wywołanie w kolejności: wybór, budowa gry, rozgrzewka, potem kawałki nadrabiania', () => {
    const osada = nowaZDanymi();
    expect(osada.podglad()).toEqual({ stan: 'czeka' });
    osada.przygotuj();
    expect(osada.podglad().przygotowanie).toEqual({ faza: 'budowa' });
    osada.przygotuj();
    expect(osada.podglad().przygotowanie).toEqual({ faza: 'rozgrzewka', tick: 0 });
    osada.przygotuj();
    expect(osada.podglad().przygotowanie).toEqual({ faza: 'nadrabianie', tick: 0 });
    osada.przygotuj();
    expect(osada.podglad().przygotowanie).toEqual({ faza: 'nadrabianie', tick: KAWALEK_NADRABIANIA });
  });

  it('start nie powtarza pracy z przygotowania: wybór kwadratu i budowa gry po jednym razie, a bez przygotowania też po jednym', () => {
    const wybor = vi.mocked(wybierzOsade);
    const budowa = vi.mocked(nowaGraAi);
    wybor.mockClear();
    budowa.mockClear();
    const osada = nowaZDanymi();
    osada.przygotujCiezkie();
    przygotujDoKonca(osada);
    osada.krok(START);
    expect(osada.stan).toBe('jest');
    expect(wybor).toHaveBeenCalledTimes(1);
    expect(budowa).toHaveBeenCalledTimes(1);
    wybor.mockClear();
    budowa.mockClear();
    const bez = nowaZDanymi();
    bez.krok(START);
    expect(bez.stan).toBe('jest');
    expect(wybor).toHaveBeenCalledTimes(1);
    expect(budowa).toHaveBeenCalledTimes(1);
  });

  it('rozgrzewka liczy doOtoczenia świata osady w osobnym kroku, przed pierwszym tickiem jej gry', async () => {
    const { doOtoczenia: prawdziwa } =
      await vi.importActual<typeof import('../../src/sim/sasiedzi.ts')>('../../src/sim/sasiedzi.ts');
    const osada = nowaZDanymi();
    const wolania: { faza?: string; tick?: number }[] = [];
    vi.mocked(doOtoczenia).mockImplementation((w) => {
      wolania.push({ ...osada.podglad().przygotowanie });
      return prawdziwa(w);
    });
    try {
      osada.przygotuj();
      osada.przygotuj();
      expect(wolania).toEqual([]);
      osada.przygotuj();
      expect(wolania).toEqual([{ faza: 'rozgrzewka', tick: 0 }]);
      // dalsze wołania (zarząd osady co sekundę) trafiają w gotową pamięć świata
      osada.przygotuj();
      expect(wolania.length).toBeGreaterThan(1);
      expect(new Set(wolania.slice(1).map((w) => w.faza))).toEqual(new Set(['nadrabianie']));
    } finally {
      vi.mocked(doOtoczenia).mockImplementation(prawdziwa);
    }
  });

  it('przygotujCiezkie robi tylko niepodzielne kroki (zero ticków gry), kolejne wywołanie niczego nie dokłada', () => {
    const osada = nowaZDanymi();
    osada.przygotujCiezkie();
    expect(osada.podglad().przygotowanie).toEqual({ faza: 'nadrabianie', tick: 0 });
    osada.przygotujCiezkie();
    osada.przygotujCiezkie();
    expect(osada.podglad().przygotowanie).toEqual({ faza: 'nadrabianie', tick: 0 });
    // po części nadrabiania też nie rusza nic więcej
    osada.przygotuj();
    osada.przygotujCiezkie();
    expect(osada.podglad().przygotowanie).toEqual({ faza: 'nadrabianie', tick: KAWALEK_NADRABIANIA });
  });

  it('start w środku przygotowania dokańcza resztę naraz (po wyborze, po budowie, w połowie nadrabiania): ten sam stan co bez przygotowania', () => {
    for (const wywolan of [1, 2, 3, 4, 60]) {
      const osada = nowaZDanymi();
      for (let k = 0; k < wywolan; k++) osada.przygotuj();
      expect(osada.stan).toBe('czeka');
      expect(startIDalej(osada), `po ${wywolan} wywołaniach przygotuj`).toEqual(referencja);
    }
  });

  it('zapis w trakcie przygotowania to zawsze samo czeka, a wczytana osada zaczyna przygotowanie od nowa i daje ten sam stan', () => {
    const osada = nowaZDanymi();
    osada.przygotujCiezkie();
    const zapisy: unknown[] = [];
    for (let k = 0; k < 30; k++) {
      osada.przygotuj();
      zapisy.push(JSON.parse(JSON.stringify(osada.zapisz())));
    }
    expect(new Set(zapisy.map((z) => JSON.stringify(z)))).toEqual(new Set([JSON.stringify({ v: 1, stan: 'czeka' })]));
    // wczytanie: czeka, przygotowania nie ma (nie jest w zapisie), dane trzeba podać od nowa
    const wczytana = osadaZZapisu({ v: 1, stan: 'czeka' }, SEED, dane, uklad);
    expect(wczytana.stan).toBe('czeka');
    expect(wczytana.podglad()).toEqual({ stan: 'czeka' });
    wczytana.przygotuj();
    expect(wczytana.podglad()).toEqual({ stan: 'czeka' });
    wczytana.dane(demo.kwadraty);
    wczytana.przygotujCiezkie();
    przygotujDoKonca(wczytana);
    expect(startIDalej(wczytana)).toEqual(referencja);
  });

  it('nowe dane przed startem zastępują stare razem z przygotowaniem: wynik jest taki, jakby od początku były tylko nowe', () => {
    const bezTego = { ...demo.kwadraty };
    delete bezTego[referencja.klucz];
    const oczekiwany = wybierzOsade(SEED, bezTego, dane, uklad);
    const osada = nowaZDanymi();
    osada.przygotujCiezkie();
    for (let k = 0; k < 5; k++) osada.przygotuj();
    expect(osada.podglad().przygotowanie?.faza).toBe('nadrabianie');
    osada.dane(bezTego);
    // przygotowanie zaczyna się od nowa (nic z poprzedniego rekordu nie zostaje)
    expect(osada.podglad()).toEqual({ stan: 'czeka' });
    osada.przygotujCiezkie();
    przygotujDoKonca(osada);
    osada.krok(START);
    if (oczekiwany) {
      expect(osada.stan).toBe('jest');
      expect(osada.swiat!.klucz).toBe(oczekiwany.klucz);
      expect(osada.swiat!.klucz).not.toBe(referencja.klucz);
    } else {
      expect(osada.zapisz()).toEqual({ v: 1, stan: 'brak', powod: 'regula' });
    }
  });

  it('bez danych albo z pustym rekordem przygotowanie nic nie robi, a w ticku startu jest brak z powodem dane', () => {
    const osada = nowaOsadaGry(SEED, dane, uklad);
    osada.przygotuj();
    osada.przygotujCiezkie();
    expect(osada.podglad()).toEqual({ stan: 'czeka' });
    osada.dane({});
    osada.przygotuj();
    osada.przygotujCiezkie();
    expect(osada.podglad()).toEqual({ stan: 'czeka' });
    osada.krok(START);
    expect(osada.zapisz()).toEqual({ v: 1, stan: 'brak', powod: 'dane' });
  });

  it('żaden kandydat nie spełnia reguły (Zielonki): przygotowanie kończy się „bez-osady”, osada czeka do ticku startu i wtedy jest brak z powodem regula', async () => {
    const zielonki = wczytajDemo('zielonki');
    const osada = nowaOsadaGry(11, await daneDema('zielonki'), ukladZGeo(zielonki.geo));
    osada.dane(zielonki.kwadraty);
    osada.przygotuj();
    expect(osada.podglad()).toEqual({ stan: 'czeka', przygotowanie: { faza: 'bez-osady' } });
    osada.przygotuj();
    osada.przygotujCiezkie();
    expect(osada.podglad()).toEqual({ stan: 'czeka', przygotowanie: { faza: 'bez-osady' } });
    expect(osada.zapisz()).toEqual({ v: 1, stan: 'czeka' });
    osada.krok(START - 1);
    expect(osada.stan).toBe('czeka');
    osada.krok(START);
    expect(osada.zapisz()).toEqual({ v: 1, stan: 'brak', powod: 'regula' });
  });

  it('bez tabel mieszkańców i w trybie zombie przygotowanie niczego nie buduje', () => {
    const bezTabel = nowaOsadaGry(SEED, null, uklad);
    bezTabel.dane(demo.kwadraty);
    bezTabel.przygotujCiezkie();
    expect(bezTabel.podglad().przygotowanie).toEqual({ faza: 'bez-osady' });
    bezTabel.krok(START);
    expect(bezTabel.zapisz()).toEqual({ v: 1, stan: 'brak', powod: 'regula' });
    const zombie = nowaOsadaGry(SEED, dane, uklad, 'zombie');
    zombie.dane(demo.kwadraty);
    zombie.przygotuj();
    zombie.przygotujCiezkie();
    expect(zombie.podglad()).toEqual({ stan: 'brak', powod: 'regula' });
  });

  it('po starcie przygotuj i przygotujCiezkie nic nie robią (gra osady idzie tylko krokiem)', () => {
    const osada = nowaZDanymi();
    osada.krok(START);
    const przed = skrotGry(osada.gra!);
    osada.przygotuj();
    osada.przygotujCiezkie();
    expect(osada.gra!.sim.st.tick).toBe(START);
    expect(skrotGry(osada.gra!)).toBe(przed);
    expect(osada.podglad().przygotowanie).toBeUndefined();
  });

  describe('błędy', () => {
    /** dane z uszkodzonym geo każdego kwadratu: wybór rzuca TypeError */
    const zepsute = (): Record<string, Geo> => {
      const z: Record<string, Geo> = {};
      for (const [k, g] of Object.entries(demo.kwadraty)) {
        const kopia = structuredClone(g);
        for (const b of kopia.b) (b as unknown as { p: unknown }).p = undefined;
        z[k] = kopia;
      }
      return z;
    };

    it('błąd w przygotowaniu od razu wyłącza osadę (brak, blad), jedno ostrzeżenie „przy przygotowaniu”, dalsze wywołania i start niczego nie ponawiają', () => {
      const ostrzezenia = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const osada = nowaOsadaGry(SEED, dane, uklad);
        osada.dane(zepsute());
        expect(() => osada.przygotuj()).not.toThrow();
        expect(osada.zapisz()).toEqual({ v: 1, stan: 'brak', powod: 'blad' });
        expect(osada.podglad().blad).toMatch(/TypeError/);
        expect(ostrzezenia).toHaveBeenCalledTimes(1);
        expect(String(ostrzezenia.mock.calls[0][0])).toContain('przy przygotowaniu osady');
        osada.przygotuj();
        osada.przygotujCiezkie();
        osada.dane(demo.kwadraty);
        osada.krok(START);
        expect(osada.zapisz()).toEqual({ v: 1, stan: 'brak', powod: 'blad' });
        expect(ostrzezenia).toHaveBeenCalledTimes(1);
      } finally {
        ostrzezenia.mockRestore();
      }
    });

    it('błąd w ciężkich krokach pod ekranem ładowania też nie wychodzi na zewnątrz', () => {
      const ostrzezenia = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const osada = nowaOsadaGry(SEED, dane, uklad);
        osada.dane(zepsute());
        expect(() => osada.przygotujCiezkie()).not.toThrow();
        expect(osada.stan).toBe('brak');
        expect(osada.zapisz()).toEqual({ v: 1, stan: 'brak', powod: 'blad' });
        expect(ostrzezenia).toHaveBeenCalledTimes(1);
      } finally {
        ostrzezenia.mockRestore();
      }
    });

    it('błąd przy starcie bez przygotowania jest opisany jako błąd startu, a nie „w trakcie gry”', () => {
      const ostrzezenia = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const osada = nowaOsadaGry(SEED, dane, uklad);
        osada.dane(zepsute());
        osada.krok(START);
        expect(osada.zapisz()).toEqual({ v: 1, stan: 'brak', powod: 'blad' });
        expect(ostrzezenia).toHaveBeenCalledTimes(1);
        const tekst = String(ostrzezenia.mock.calls[0][0]);
        expect(tekst).toContain('przy starcie osady');
        expect(tekst).not.toContain('w trakcie gry');
      } finally {
        ostrzezenia.mockRestore();
      }
    });

    it('wyjątek bez napisu (obiekt bez prototypu) nie wychodzi z krok ani z przygotuj: opis zastępczy zamiast wyjątku', () => {
      const ostrzezenia = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        for (const wolanie of ['krok', 'przygotuj', 'przygotujCiezkie'] as const) {
          const rekord: Record<string, Geo> = {};
          for (const k of Object.keys(demo.kwadraty))
            Object.defineProperty(rekord, k, {
              enumerable: true,
              get() {
                throw Object.create(null);
              },
            });
          const osada = nowaOsadaGry(SEED, dane, uklad);
          osada.dane(rekord);
          expect(() => (wolanie === 'krok' ? osada.krok(START) : osada[wolanie]()), wolanie).not.toThrow();
          expect(osada.zapisz(), wolanie).toEqual({ v: 1, stan: 'brak', powod: 'blad' });
          expect(osada.podglad().blad, wolanie).toBe('błąd bez opisu');
        }
      } finally {
        ostrzezenia.mockRestore();
      }
    });
  });
});
