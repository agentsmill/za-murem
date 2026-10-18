/* Odmiana imion i nazwisk przez siedem przypadków (src/mieszkancy/odmiana.ts) i tabele z SGJP (odmiana.json,
   odmiana-koncowki.json, narzędzie `npm run dane:odmiana`). Dwie części:
   1. chodzi zawsze, na tabelach z public/data/mieszkancy/ (CI nie ma surowych plików): paradygmaty z SGJP przepisane
      jako stałe, słownik, reguły, końcówki, zgadywacz, nigdy-nie-rzuca;
   2. gdy jest surowy plik SGJP (`it.skipIf`): dokładność końcówek na co dziesiątym imieniu odłożonym z treningu,
      pokrycie pul słownikiem i odtworzenie obu tabel bajt w bajt. */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type Formy,
  formyImienia,
  formyNazwiska,
  normalizuj,
  type OdmianaPlik,
  odmien,
  PRZYPADKI,
  type Przypadek,
  rozpakujOdmiane,
  type TabelaKoncowek,
  type TabelaOdmiany,
  zenskaFormaNazwiska,
  zgadnijImie,
  zgadnijKoncowkami,
  zgadnijNazwiskoKoncowkami,
  zgadnijNazwiskoReguly,
  zgadnijReguly,
} from '../../src/mieszkancy/odmiana.ts';
import { PLIK_WOJEWODZTWA, type TabeleImion, type TabeleNazwisk } from '../../src/mieszkancy/tabele.ts';
import type { Plec } from '../../src/mieszkancy/typy.ts';
import { wczytajKoncowki, wczytajOdmiane } from '../../src/mieszkancy/wczytaj.ts';
import {
  dopuszczalne,
  imionaZPuli,
  jakoJson,
  kodFormy,
  kodWzorca,
  nazwiskaZPuli,
  ocenNazwiska,
  ocenPrzyklady,
  type Przyklad,
  parsujSgjp,
  paryNazwisk,
  podzial,
  procent,
  przyklady,
  przykladyUczaceNazwisk,
  type Sgjp,
  trenujKoncowki,
  wagiImion,
  wczytajSgjp,
  wybraneFormy,
  zbudujTabele,
  zgodnoscImion,
} from '../../tools/dane/odmiana.ts';
import { SUROWE } from '../../tools/dane/sciezki.ts';

const PUBLIC = path.resolve(import.meta.dirname, '../../public');
const KATALOG = path.join(PUBLIC, 'data/mieszkancy');
const SGJP_PLIK = path.join(SUROWE, 'odmiana/sgjp/sgjp-20260823.tab.gz');

/** Atrapa `fetch`: ścieżka względna → plik w public/, brak pliku → 404 (jak w mieszkancy-rejon.test.ts). */
function plikowy(zapytania: string[] = []): typeof fetch {
  return (async (adres: string) => {
    zapytania.push(adres);
    const plik = path.join(PUBLIC, adres);
    if (!fs.existsSync(plik)) return new Response('brak', { status: 404 });
    return new Response(fs.readFileSync(plik));
  }) as unknown as typeof fetch;
}

const t = (await wczytajOdmiane(plikowy())) as TabelaOdmiany;
const k = (await wczytajKoncowki(plikowy())) as TabelaKoncowek;

/** Siedem form w kolejności przypadków. */
const lista = (f: Formy): string[] => PRZYPADKI.map((p) => f[p]);

/** Paradygmaty testowe z SGJP (dane-surowe/odmiana/wyciag-sgjp/paradygmaty_testowe.md): M., D., C., B., N., Ms., W.
    Gdzie SGJP ma dwa równorzędne wołacze (Maja: Majo / Maju), test przyjmuje oba. */
const IMIONA_SGJP: [string, Plec, string[]][] = [
  ['Halina', 'K', ['Halina', 'Haliny', 'Halinie', 'Halinę', 'Haliną', 'Halinie', 'Halino']],
  ['Kinga', 'K', ['Kinga', 'Kingi', 'Kindze', 'Kingę', 'Kingą', 'Kindze', 'Kingo']],
  ['Ola', 'K', ['Ola', 'Oli', 'Oli', 'Olę', 'Olą', 'Oli', 'Olu']],
  ['Natalia', 'K', ['Natalia', 'Natalii', 'Natalii', 'Natalię', 'Natalią', 'Natalii', 'Natalio']],
  ['Maja', 'K', ['Maja', 'Mai', 'Mai', 'Maję', 'Mają', 'Mai', 'Majo / Maju']],
  ['Marek', 'M', ['Marek', 'Marka', 'Markowi', 'Marka', 'Markiem', 'Marku', 'Marku']],
  ['Paweł', 'M', ['Paweł', 'Pawła', 'Pawłowi', 'Pawła', 'Pawłem', 'Pawle', 'Pawle']],
  ['Henryk', 'M', ['Henryk', 'Henryka', 'Henrykowi', 'Henryka', 'Henrykiem', 'Henryku', 'Henryku']],
  ['Kuba', 'M', ['Kuba', 'Kuby', 'Kubie', 'Kubę', 'Kubą', 'Kubie', 'Kubo']],
  ['Jakub', 'M', ['Jakub', 'Jakuba', 'Jakubowi', 'Jakuba', 'Jakubem', 'Jakubie', 'Jakubie']],
  ['Zbigniew', 'M', ['Zbigniew', 'Zbigniewa', 'Zbigniewowi', 'Zbigniewa', 'Zbigniewem', 'Zbigniewie', 'Zbigniewie']],
  ['Igor', 'M', ['Igor', 'Igora', 'Igorowi', 'Igora', 'Igorem', 'Igorze', 'Igorze']],
];
const NAZWISKA_SGJP: Record<string, { m: string[]; k: string[]; mnoga: string }> = {
  Kowalski: {
    m: ['Kowalski', 'Kowalskiego', 'Kowalskiemu', 'Kowalskiego', 'Kowalskim', 'Kowalskim', 'Kowalski'],
    k: ['Kowalska', 'Kowalskiej', 'Kowalskiej', 'Kowalską', 'Kowalską', 'Kowalskiej', 'Kowalska'],
    mnoga: 'Kowalscy',
  },
  Nowak: {
    m: ['Nowak', 'Nowaka', 'Nowakowi', 'Nowaka', 'Nowakiem', 'Nowaku', 'Nowaku'],
    k: ['Nowak', 'Nowak', 'Nowak', 'Nowak', 'Nowak', 'Nowak', 'Nowak'],
    mnoga: 'Nowakowie',
  },
};

/** Czy siedem form zgadza się z paradygmatem SGJP (komórka „A / B” przyjmuje obie formy). */
function zgodne(f: Formy, wzor: string[]): boolean {
  return lista(f).every((forma, i) => wzor[i].split(' / ').includes(forma));
}

describe('paradygmaty z SGJP w słowniku', () => {
  for (const [imie, plec, wzor] of IMIONA_SGJP) {
    it(`${imie}: pełny paradygmat ze słownika, pewny`, () => {
      const f = formyImienia(imie, plec, t);
      expect(f, `${imie} jest w puli imion, więc w odmiana.json`).not.toBeNull();
      expect(zgodne(f as Formy, wzor), JSON.stringify(f)).toBe(true);
      const o = odmien(imie, plec, t, k);
      expect(o.pewne).toBe(true);
      expect(o.formy).toEqual(f);
    });
  }

  it('szczegóły z zadania: Halina, Marek, Paweł', () => {
    const h = formyImienia('Halina', 'K', t) as Formy;
    expect([h.dop, h.narz, h.wol]).toEqual(['Haliny', 'Haliną', 'Halino']);
    const m = formyImienia('Marek', 'M', t) as Formy;
    expect([m.dop, m.msc, m.narz]).toEqual(['Marka', 'Marku', 'Markiem']);
    const p = formyImienia('Paweł', 'M', t) as Formy;
    expect([p.dop, p.msc]).toEqual(['Pawła', 'Pawle']);
  });

  it('Maja ma jeden, stały wołacz (Majo, pierwszy w kolejności znaków)', () => {
    expect((formyImienia('Maja', 'K', t) as Formy).wol).toBe('Majo');
  });

  it('formyImienia: zła płeć albo nieznane imię to null, a klucze z prototypu nie psują wyniku', () => {
    expect(formyImienia('Halina', 'M', t)).toBeNull();
    expect(formyImienia('Marek', 'K', t)).toBeNull();
    expect(formyImienia('Zxqwv', 'M', t)).toBeNull();
    for (const zle of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(formyImienia(zle, 'M', t), zle).toBeNull();
    }
  });

  for (const [meskie, wzor] of Object.entries(NAZWISKA_SGJP)) {
    it(`nazwisko ${meskie}: formy męskie, żeńskie i liczba mnoga ze słownika, pewne`, () => {
      const w = formyNazwiska(meskie, t, k);
      expect(w.pewne).toBe(true);
      expect(lista(w.formy.m)).toEqual(wzor.m);
      expect(lista(w.formy.k)).toEqual(wzor.k);
      expect(w.formy.mnoga).toBe(wzor.mnoga);
    });
  }
});

describe('wczytywanie tabel odmiany', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('czyta data/mieszkancy/odmiana.json i odmiana-koncowki.json względem strony', async () => {
    const zapytania: string[] = [];
    const a = await wczytajOdmiane(plikowy(zapytania));
    const b = await wczytajKoncowki(plikowy(zapytania));
    expect(zapytania).toEqual(['data/mieszkancy/odmiana.json', 'data/mieszkancy/odmiana-koncowki.json']);
    expect(a?.wersja).toBe(1);
    expect(b?.wersja).toBe(1);
  });

  it('brak pliku, błąd sieci i inna wersja to null z ostrzeżeniem, nigdy wyjątek', async () => {
    const ostrzezenie = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const odpowiedz = (tresc: string, status = 200): typeof fetch =>
      (async () => new Response(tresc, { status })) as unknown as typeof fetch;
    const siec = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await wczytajOdmiane(odpowiedz('brak', 404))).toBeNull();
    expect(await wczytajKoncowki(odpowiedz('brak', 404))).toBeNull();
    expect(await wczytajOdmiane(siec)).toBeNull();
    expect(await wczytajKoncowki(siec)).toBeNull();
    expect(await wczytajOdmiane(odpowiedz('{"wersja":99}'))).toBeNull();
    expect(await wczytajKoncowki(odpowiedz('nie json'))).toBeNull();
    expect(ostrzezenie).toHaveBeenCalledTimes(6);
  });

  it('bez podanego fetch używa globalnego', async () => {
    const zapytania: string[] = [];
    vi.stubGlobal('fetch', plikowy(zapytania));
    expect(Object.keys((await wczytajOdmiane())?.imiona ?? {}).length).toBeGreaterThan(500);
    expect(((await wczytajKoncowki())?.wzorce ?? []).length).toBeGreaterThan(100);
  });
});

describe('zgadywacz bez słownika', () => {
  it('imiona testowe z SGJP wychodzą z reguł i końcówek pełnym paradygmatem, także gdy słownik jest pusty', () => {
    const pusty: TabelaOdmiany = { wersja: 1, imiona: {}, nazwiska: {} };
    for (const [imie, plec, wzor] of IMIONA_SGJP) {
      const o = odmien(imie, plec, pusty, k);
      expect(zgodne(o.formy, wzor), `${imie}: ${JSON.stringify(o.formy)}`).toBe(true);
    }
  });

  it('zgadnijImie zgaduje także imię, którego nie ma w SGJP', () => {
    const o = zgadnijImie('Dżesika', 'K', k);
    expect(lista(o.formy)).toEqual(['Dżesika', 'Dżesiki', 'Dżesice', 'Dżesikę', 'Dżesiką', 'Dżesice', 'Dżesiko']);
  });
});

describe('odmien nie rzuca i zawsze zwraca siedem niepustych form', () => {
  const dziwne = ['Nikola', 'Mia', 'Dżesika', 'Leo', 'Oleksandr', 'X Æ A-12', '', '   ', '-', '--', 'A', 'ą', '123'];
  for (const imie of dziwne) {
    for (const plec of ['M', 'K'] as const) {
      it(`„${imie}” (${plec})`, () => {
        const o = odmien(imie, plec, t, k);
        expect(Object.keys(o.formy)).toEqual([...PRZYPADKI]);
        for (const p of PRZYPADKI) expect(o.formy[p as Przypadek].length, p).toBeGreaterThan(0);
        expect(typeof o.pewne).toBe('boolean');
      });
    }
  }
});

describe('reguły imion (zgadnijReguly)', () => {
  // [imię, płeć, D., C., B., N., Ms., W.]
  const PRZYPADKI_REGUL: [string, Plec, string[]][] = [
    ['Stefania', 'K', ['Stefanii', 'Stefanii', 'Stefanię', 'Stefanią', 'Stefanii', 'Stefanio']],
    ['Ania', 'K', ['Ani', 'Ani', 'Anię', 'Anią', 'Ani', 'Aniu']],
    ['Agnieszka', 'K', ['Agnieszki', 'Agnieszce', 'Agnieszkę', 'Agnieszką', 'Agnieszce', 'Agnieszko']],
    ['Urszula', 'K', ['Urszuli', 'Urszuli', 'Urszulę', 'Urszulą', 'Urszuli', 'Urszulo']],
    ['Alla', 'K', ['Alli', 'Alli', 'Allę', 'Allą', 'Alli', 'Allo']],
    ['Rut', 'K', ['Rut', 'Rut', 'Rut', 'Rut', 'Rut', 'Rut']],
    // zapis z -iia i -ya (ukraińska transliteracja): jak Maria i Maja
    ['Mariia', 'K', ['Marii', 'Marii', 'Mariię', 'Mariią', 'Marii', 'Mariio']],
    ['Maya', 'K', ['Mai', 'Mai', 'Mayę', 'Mayą', 'Mai', 'Mayo']],
    ['Staś', 'M', ['Stasia', 'Stasiowi', 'Stasia', 'Stasiem', 'Stasiu', 'Stasiu']],
    ['Wiesiek', 'M', ['Wieśka', 'Wieśkowi', 'Wieśka', 'Wieśkiem', 'Wieśku', 'Wieśku']],
    ['Bruno', 'M', ['Brunona', 'Brunonowi', 'Brunona', 'Brunonem', 'Brunonie', 'Bruno']],
    ['Jerzy', 'M', ['Jerzego', 'Jerzemu', 'Jerzego', 'Jerzym', 'Jerzym', 'Jerzy']],
    ['Wawrzyniec', 'M', ['Wawrzyńca', 'Wawrzyńcowi', 'Wawrzyńca', 'Wawrzyńcem', 'Wawrzyńcu', 'Wawrzyńcu']],
    ['Aleksander', 'M', ['Aleksandra', 'Aleksandrowi', 'Aleksandra', 'Aleksandrem', 'Aleksandrze', 'Aleksandrze']],
    ['Tomasz', 'M', ['Tomasza', 'Tomaszowi', 'Tomasza', 'Tomaszem', 'Tomaszu', 'Tomaszu']],
  ];
  for (const [imie, plec, oblique] of PRZYPADKI_REGUL) {
    it(`${imie} (${plec})`, () => {
      const f = zgadnijReguly(imie, plec) as Formy;
      expect(f.mian).toBe(imie);
      expect(lista(f).slice(1)).toEqual(oblique);
    });
  }

  it('płeć rozstrzyga: Kuba męski odmienia się jak Halina, a żeńskie imię bez -a jest nieodmienne', () => {
    expect(lista(zgadnijReguly('Kuba', 'M') as Formy)[1]).toBe('Kuby');
    expect(lista(zgadnijReguly('Nikol', 'K') as Formy)).toEqual(Array(7).fill('Nikol'));
    expect(lista(zgadnijReguly('Nikol', 'M') as Formy)[1]).toBe('Nikola');
  });

  it('wielkość liter: małe i wielkie litery są poprawiane, mieszana zostaje', () => {
    expect(normalizuj('  halina ')).toBe('Halina');
    expect(normalizuj('KOWALSKI')).toBe('Kowalski');
    expect(normalizuj('anna-maria')).toBe('Anna-Maria');
    expect(normalizuj('McDonald')).toBe('McDonald');
    expect((zgadnijReguly('halina', 'K') as Formy).dop).toBe('Haliny');
    expect(odmien('MAREK', 'M', t, k).formy.dop).toBe('Marka');
  });

  it('imię złożone odmienia się człon po członie, a słownikowe człony dają pewny wynik', () => {
    const anna = odmien('Anna-Maria', 'K', t, k);
    expect(lista(anna.formy)).toEqual([
      'Anna-Maria',
      'Anny-Marii',
      'Annie-Marii',
      'Annę-Marię',
      'Anną-Marią',
      'Annie-Marii',
      'Anno-Mario',
    ]);
    expect(anna.pewne).toBe(true);
    const jan = odmien('Jan Paweł', 'M', t, k);
    expect(jan.formy.dop).toBe('Jana Pawła');
    expect(jan.formy.msc).toBe('Janie Pawle');
    expect(jan.pewne).toBe(true);
    // jeden człon spoza słownika i zgodności reguł z końcówkami psuje pewność
    expect(odmien('Anna-Olha', 'K', t, k).pewne).toBe(false);
  });
});

describe('końcówki (zgadnijKoncowkami)', () => {
  it('najdłuższy pasujący sufiks wygrywa, a mianownik zostaje wejściem', () => {
    const f = zgadnijKoncowkami('Darek', 'M', k) as Formy;
    expect(lista(f)).toEqual(['Darek', 'Darka', 'Darkowi', 'Darka', 'Darkiem', 'Darku', 'Darku']);
  });

  it('wzorzec dłuższy niż imię jest pomijany na rzecz krótszego sufiksu', () => {
    const tab: TabelaKoncowek = {
      wersja: 1,
      wzorce: [
        {
          sufiks: 'ek',
          plec: 'M',
          ucinek: 5,
          koncowki: { mian: '', dop: 'X', cel: 'X', bier: 'X', narz: 'X', msc: 'X', wol: 'X' },
        },
        {
          sufiks: 'k',
          plec: 'M',
          ucinek: 0,
          koncowki: { mian: '', dop: 'a', cel: 'owi', bier: 'a', narz: 'iem', msc: 'u', wol: 'u' },
        },
      ],
    };
    expect(lista(zgadnijKoncowkami('Jacek', 'M', tab) as Formy)[1]).toBe('X'); // ucinek 5 = cały mianownik „Jacek”
    expect(lista(zgadnijKoncowkami('Ek', 'M', tab) as Formy)[1]).toBe('Eka');
  });

  it('sufiks z gwiazdką dotyczy nazwisk, a bez gwiazdki imion; płeć się nie miesza', () => {
    const tab: TabelaKoncowek = {
      wersja: 1,
      wzorce: [
        {
          sufiks: '*ski',
          plec: 'M',
          ucinek: 0,
          koncowki: { mian: '', dop: 'ego', cel: 'emu', bier: 'ego', narz: 'm', msc: 'm', wol: '' },
        },
      ],
    };
    expect(zgadnijKoncowkami('Kowalski', 'M', tab)).toBeNull(); // imię: brak wzorca, nazwisk nie bierze
    expect(zgadnijKoncowkami('Kowalski', 'K', tab)).toBeNull();
    expect(zgadnijNazwiskoKoncowkami('Kowalski', tab)).toBeNull(); // brak wzorca żeńskiego
  });

  it('imię, którego nie da się odmienić (cyfry, pusty napis), daje null', () => {
    expect(zgadnijKoncowkami('12', 'M', k)).toBeNull();
    expect(zgadnijKoncowkami('', 'K', k)).toBeNull();
    expect(zgadnijReguly('X Æ A-12', 'M')).toBeNull();
  });

  it('wyniki nie zależą od tego, czy tablica była już użyta (indeks w pamięci podręcznej)', () => {
    const kopia = JSON.parse(JSON.stringify(k)) as TabelaKoncowek;
    const pierwsze = zgadnijKoncowkami('Oleksandr', 'M', kopia);
    const drugie = zgadnijKoncowkami('Oleksandr', 'M', kopia);
    expect(pierwsze).toEqual(drugie);
    expect(pierwsze).toEqual(zgadnijKoncowkami('Oleksandr', 'M', k));
  });
});

describe('pewne: reguły i końcówki dały ten sam pełny paradygmat', () => {
  const pula = imionaZPuli(JSON.parse(fs.readFileSync(path.join(KATALOG, 'imiona.json'), 'utf8')) as TabeleImion);

  it('dla każdego imienia z puli spoza słownika pewne znaczy zgodność obu metod', () => {
    let zgodne = 0;
    let rozne = 0;
    for (const plec of ['M', 'K'] as const) {
      for (const imie of pula[plec]) {
        if (formyImienia(imie, plec, t)) continue;
        const reguly = zgadnijReguly(imie, plec) as Formy;
        const koncowki = zgadnijKoncowkami(imie, plec, k);
        const takie = koncowki !== null && PRZYPADKI.every((p) => reguly[p] === koncowki[p]);
        const o = zgadnijImie(imie, plec, k);
        expect(o.pewne, `${imie} (${plec})`).toBe(takie);
        expect(o.formy, imie).toEqual(reguly);
        if (takie) zgodne++;
        else rozne++;
      }
    }
    // imion obcych spoza SGJP jest ponad 340; część się zgadza, część nie
    expect(zgodne).toBeGreaterThan(200);
    expect(rozne).toBeGreaterThan(50);
  });

  it('imię, w którym metody się różnią, nie jest pewne (formy z reguł), a gdzie są zgodne, jest', () => {
    const olha = zgadnijImie('Olha', 'K', k); // końcówki: „Ochy”, reguły: „Olhy”
    expect(olha.pewne).toBe(false);
    expect(olha.formy.dop).toBe('Olhy');
    expect(zgadnijKoncowkami('Olha', 'K', k)?.dop).not.toBe('Olhy');
    const dzesika = zgadnijImie('Dżesika', 'K', k);
    expect(dzesika.pewne).toBe(true);
    expect(odmien('Olha', 'K', t, k).pewne).toBe(false);
    expect(odmien('Dżesika', 'K', t, k).pewne).toBe(true);
    // „Nikola”: reguły dają wołacz „Nikolo”, końcówki „Nikolu” (Ola, Jola)
    const nikola = odmien('Nikola', 'K', t, k);
    expect(nikola.formy.wol).toBe('Nikolo');
    expect(nikola.pewne).toBe(false);
  });
});

describe('nazwiska spoza słownika', () => {
  const pusty: TabelaOdmiany = { wersja: 1, imiona: {}, nazwiska: {} };

  it('formy męskie, żeńskie i liczba mnoga z reguł, pewne gdy końcówki się zgadzają', () => {
    expect(t.nazwiska.Przymorski).toBeUndefined();
    const w = formyNazwiska('Przymorski', t, k);
    expect(w.pewne).toBe(true);
    expect(lista(w.formy.m)).toEqual([
      'Przymorski',
      'Przymorskiego',
      'Przymorskiemu',
      'Przymorskiego',
      'Przymorskim',
      'Przymorskim',
      'Przymorski',
    ]);
    expect(lista(w.formy.k)).toEqual([
      'Przymorska',
      'Przymorskiej',
      'Przymorskiej',
      'Przymorską',
      'Przymorską',
      'Przymorskiej',
      'Przymorska',
    ]);
    expect(w.formy.mnoga).toBe('Przymorscy');
  });

  it('nazwiska spółgłoskowe żeńskie są nieodmienne, a męskie odmieniają się z ruchomym e', () => {
    const w = formyNazwiska('Dymek', pusty, k);
    expect(lista(w.formy.m).slice(1)).toEqual(['Dymka', 'Dymkowi', 'Dymka', 'Dymkiem', 'Dymku', 'Dymku']);
    expect(lista(w.formy.k)).toEqual(Array(7).fill('Dymek'));
    expect(w.formy.mnoga).toBe('Dymkowie');
  });

  it('nazwiska na -a odmieniają się jak rzeczowniki także w formie żeńskiej', () => {
    const w = formyNazwiska('Sikora', pusty, k);
    expect(lista(w.formy.k)).toEqual(['Sikora', 'Sikory', 'Sikorze', 'Sikorę', 'Sikorą', 'Sikorze', 'Sikoro']);
    expect(w.formy.mnoga).toBe('Sikorowie');
  });

  it('przymiotnikowe -y: Biały → Biała, Białej, mnoga Biali; -ny → -ni; -ry → -rzy; -chy → -si', () => {
    const f = (n: string) => formyNazwiska(n, pusty, k).formy;
    expect(f('Biały').k.dop).toBe('Białej');
    expect(f('Biały').mnoga).toBe('Biali');
    expect(f('Konieczny').k.mian).toBe('Konieczna');
    expect(f('Konieczny').mnoga).toBe('Konieczni');
    expect(f('Szary').mnoga).toBe('Szarzy');
    expect(f('Cichy').mnoga).toBe('Cisi');
    expect(f('Wielki').mnoga).toBe('Wielcy');
    expect(f('Zawadzki').mnoga).toBe('Zawadzcy');
    expect(f('Nowicki').mnoga).toBe('Nowiccy');
  });

  it('nazwisko dwuczłonowe odmienia się człon po członie, żeńskie z męskich członów', () => {
    const w = formyNazwiska('Kowalski-Nowak', t, k);
    expect(w.formy.m.dop).toBe('Kowalskiego-Nowaka');
    expect(w.formy.k.mian).toBe('Kowalska-Nowak');
    expect(w.formy.k.dop).toBe('Kowalskiej-Nowak');
    expect(w.formy.mnoga).toBe('Kowalscy-Nowakowie');
    expect(w.pewne).toBe(true); // oba człony są w słowniku
  });

  it('nie rzuca dla napisu bez liter', () => {
    for (const zle of ['', '   ', '123', 'X Æ A-12', '-']) {
      const w = formyNazwiska(zle, t, k);
      expect(w.pewne).toBe(false);
      expect(lista(w.formy.m).every((x) => x.length > 0)).toBe(true);
      expect(lista(w.formy.k).every((x) => x.length > 0)).toBe(true);
      expect(w.formy.mnoga.length).toBeGreaterThan(0);
    }
    expect(zgadnijNazwiskoReguly('123')).toBeNull();
  });

  it('klucze z prototypu nie są nazwiskami ze słownika', () => {
    for (const zle of ['constructor', 'toString', '__proto__']) {
      const w = formyNazwiska(zle, t, k);
      expect(w.formy.m.mian).toBe(normalizuj(zle));
    }
  });

  it('żeńska forma wynika z męskiej tak jak w tabelach nazwisk z rejestru PESEL (wszystkie pary, sześć wyjątków)', () => {
    let pary = 0;
    const wyjatki = new Set<string>();
    for (const plik of Object.values(PLIK_WOJEWODZTWA)) {
      const tab = JSON.parse(fs.readFileSync(path.join(KATALOG, 'nazwiska', `${plik}.json`), 'utf8')) as TabeleNazwisk;
      for (const [m, f] of [...tab.ogolne, ...tab.lokalne]) {
        if (zenskaFormaNazwiska(m) !== f) {
          wyjatki.add(m);
          expect(f, `rejestr zostawia ${m} bez zmiany`).toBe(m);
        }
        pary++;
      }
    }
    expect(pary).toBeGreaterThan(5000);
    // rejestr PESEL zapisuje kobiety o tych nazwiskach w formie męskiej (SGJP ma osobny nieodmienny leksem żeński)
    expect([...wyjatki].sort()).toEqual(['Bodziony', 'Brzykcy', 'Bury', 'Chudy', 'Kansy', 'Niesłony']);
    expect(zenskaFormaNazwiska('Kowalski')).toBe('Kowalska');
    expect(zenskaFormaNazwiska('Konieczny')).toBe('Konieczna');
    expect(zenskaFormaNazwiska('Nowak')).toBe('Nowak');
    expect(zenskaFormaNazwiska('Sikora')).toBe('Sikora');
  });
});

describe('odmien nie rzuca także dla niewłaściwych argumentów', () => {
  it('zła płeć, zepsuta tabela, napis nie będący napisem', () => {
    expect(() => odmien('Anna', 'X' as Plec, t, k)).not.toThrow();
    expect(() => odmien('Anna', 'K', {} as TabelaOdmiany, k)).not.toThrow();
    expect(() => odmien('Anna', 'K', t, {} as TabelaKoncowek)).not.toThrow();
    expect(() => odmien(undefined as unknown as string, 'K', t, k)).not.toThrow();
    expect(() => odmien(null as unknown as string, 'M', t, k)).not.toThrow();
    const o = odmien('Anna', 'K', {} as TabelaOdmiany, k);
    expect(PRZYPADKI.every((p) => o.formy[p].length > 0)).toBe(true);
    expect(o.pewne).toBe(false);
  });

  it('bardzo długi napis nie wiesza i nie rzuca', () => {
    const dlugi = 'A'.repeat(5000);
    const o = odmien(dlugi, 'K', t, k);
    expect(PRZYPADKI.every((p) => o.formy[p].length > 0)).toBe(true);
  });
});

describe('tabele odmiany w repozytorium', () => {
  const sciezkaOdmiany = path.join(KATALOG, 'odmiana.json');
  const sciezkaKoncowek = path.join(KATALOG, 'odmiana-koncowki.json');
  const tekstOdmiany = fs.readFileSync(sciezkaOdmiany, 'utf8');
  const plik = JSON.parse(tekstOdmiany) as OdmianaPlik;
  const imionaTab = JSON.parse(fs.readFileSync(path.join(KATALOG, 'imiona.json'), 'utf8')) as TabeleImion;
  const nazwiskaTab = Object.values(PLIK_WOJEWODZTWA).map(
    (p) => JSON.parse(fs.readFileSync(path.join(KATALOG, 'nazwiska', `${p}.json`), 'utf8')) as TabeleNazwisk,
  );

  it('oba pliki razem mają poniżej 400 KB, zwarty JSON (jedna linia) z końcowym znakiem nowej linii', () => {
    const razem = fs.statSync(sciezkaOdmiany).size + fs.statSync(sciezkaKoncowek).size;
    expect(razem).toBeLessThan(400 * 1024);
    for (const sciezka of [sciezkaOdmiany, sciezkaKoncowek]) {
      const tekst = fs.readFileSync(sciezka, 'utf8');
      expect(tekst.endsWith('}\n')).toBe(true);
      expect(tekst.slice(0, -1).includes('\n'), sciezka).toBe(false);
      expect(jakoJson(JSON.parse(tekst)), sciezka).toBe(tekst); // bez spacji i wcięć
    }
  });

  it('odmiana.json niesie notę SGJP (BSD-2) z LICENCJE.md', () => {
    const licencje = fs.readFileSync(path.join(KATALOG, 'LICENCJE.md'), 'utf8');
    const nota = /```text\n([\s\S]*?)\n```/.exec(licencje)?.[1];
    expect(nota).toContain('Copyright © 2007–2026 Marcin Woliński');
    expect(plik._nota).toContain(nota as string);
    expect(plik._nota).toContain('pl.sgjp.sgjp-2026.08.24');
    expect(plik._nota).toContain('BSD-2');
    expect(plik.wersja).toBe(1);
    expect(Object.keys(plik).slice(0, 2)).toEqual(['wersja', '_nota']);
  });

  it('słownik rozpakowuje się do pełnych paradygmatów: mianownik = klucz, siedem niepustych form', () => {
    expect(Object.keys(t.imiona)).toEqual(Object.keys(plik.imiona));
    for (const [imie, wpis] of Object.entries(t.imiona)) {
      expect(wpis.M || wpis.K, imie).toBeTruthy();
      for (const f of [wpis.M, wpis.K]) {
        if (!f) continue;
        expect(f.mian, imie).toBe(imie);
        for (const p of PRZYPADKI) expect(f[p].length, `${imie} ${p}`).toBeGreaterThan(0);
      }
    }
    for (const [meskie, w] of Object.entries(t.nazwiska)) {
      expect(w.m.mian, meskie).toBe(meskie);
      expect(w.mnoga.length, meskie).toBeGreaterThan(0);
      for (const f of [w.m, w.k]) for (const p of PRZYPADKI) expect(f[p].length, `${meskie} ${p}`).toBeGreaterThan(0);
    }
  });

  it('nie ma form potocznych ani niepoprawnych z SGJP (Hugo → Hugona, nie Huga; Maja ma jeden wołacz)', () => {
    if (t.imiona.Hugo?.M) expect(t.imiona.Hugo.M.dop).toBe('Hugona');
    expect(t.imiona.Maja?.K?.wol).toBe('Majo');
  });

  it('pokrycie pul: wszystkie nazwiska poza kilkoma nieznanymi SGJP, ponad połowa imion i większość nadań', () => {
    const pula = imionaZPuli(imionaTab);
    const wSlowniku = (plec: Plec): number => pula[plec].filter((n) => t.imiona[n]?.[plec]).length;
    expect(wSlowniku('M') / pula.M.length).toBeGreaterThan(0.55);
    expect(wSlowniku('K') / pula.K.length).toBeGreaterThan(0.55);
    const wagi = wagiImion(imionaTab);
    for (const plec of ['M', 'K'] as const) {
      let razem = 0;
      let ze = 0;
      for (const [n, waga] of wagi[plec]) {
        razem += waga;
        if (t.imiona[n]?.[plec]) ze += waga;
      }
      expect(ze / razem, plec).toBeGreaterThan(0.9);
    }
    const { pary } = nazwiskaZPuli(nazwiskaTab);
    const brak = pary.filter(([m]) => !t.nazwiska[m]).map(([m]) => m);
    expect(brak).toEqual(['Buriak', 'Butenko', 'Filipek', 'Prodan']);
    expect(pary.length).toBe(2160);
  });

  it('żeński mianownik w słowniku zgadza się z tabelą nazwisk z rejestru PESEL', () => {
    let sprawdzone = 0;
    for (const tab of nazwiskaTab) {
      for (const [m, f] of [...tab.ogolne, ...tab.lokalne]) {
        const w = t.nazwiska[m];
        if (!w) continue;
        expect(w.k.mian, m).toBe(f);
        sprawdzone++;
      }
    }
    expect(sprawdzone).toBeGreaterThan(5000);
  });

  it('kodowanie form: ile uciąć i co dokleić, w obie strony', () => {
    expect(kodFormy('Marek', 'Marka')).toBe('2ka');
    expect(kodFormy('Halina', 'Haliny')).toBe('1y');
    expect(kodFormy('Kowalski', 'Kowalska')).toBe('1a');
    expect(kodFormy('Nowak', 'Nowak')).toBe('0');
    expect(kodFormy('Paweł', 'Pawle')).toBe('2le');
    expect(() => kodFormy('Abcdefghijkl', 'Z')).toThrow(/najwyżej 9/);
    const f = (zl: string[]): Formy => Object.fromEntries(PRZYPADKI.map((p, i) => [p, zl[i]])) as Formy;
    expect(kodWzorca('Marek', f(['Marek', 'Marka', 'Markowi', 'Marka', 'Markiem', 'Marku', 'Marku']))).toBe(
      '2ka,2kowi,2ka,2kiem,2ku,2ku',
    );
    const mini: OdmianaPlik = {
      wersja: 1,
      _nota: 'x',
      wzorce: ['2ka,2kowi,2ka,2kiem,2ku,2ku', '0,0,0,0,0,0'],
      imiona: { Marek: { M: 0 }, Nowak: { M: 1 } },
      nazwiska: { Dymek: [0, '0', 1, '2kowie'] },
    };
    const r = rozpakujOdmiane(mini);
    expect(lista(r.imiona.Marek.M as Formy)).toEqual([
      'Marek',
      'Marka',
      'Markowi',
      'Marka',
      'Markiem',
      'Marku',
      'Marku',
    ]);
    expect(lista(r.nazwiska.Dymek.k)).toEqual(Array(7).fill('Dymek'));
    expect(r.nazwiska.Dymek.mnoga).toBe('Dymkowie');
    expect(() => rozpakujOdmiane({ ...mini, imiona: { Ala: { K: 5 } } })).toThrow(/zły wzorzec/);
  });

  it('uszkodzony plik odmiany to null z ostrzeżeniem, nie wyjątek', async () => {
    const ostrzezenie = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const uszkodzony = (async () =>
      new Response('{"wersja":1,"wzorce":[],"imiona":{"Ala":{"K":5}},"nazwiska":{}}')) as unknown as typeof fetch;
    expect(await wczytajOdmiane(uszkodzony)).toBeNull();
    expect(ostrzezenie).toHaveBeenCalledTimes(1);
    ostrzezenie.mockRestore();
  });
});

describe('moduł odmiana.ts działa w przeglądarce i w Node', () => {
  const zrodlo = fs.readFileSync(path.resolve(import.meta.dirname, '../../src/mieszkancy/odmiana.ts'), 'utf8');

  it('nie importuje niczego z Node ani z silnika, poza typem płci', () => {
    const importy = [...zrodlo.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
    expect(importy).toEqual(['./typy.ts']);
    expect(zrodlo).not.toMatch(/node:|require\(|process\.|Buffer/);
  });

  it('nie używa losowości, czasu ani zakazanych funkcji Math', () => {
    expect(zrodlo).not.toMatch(/Math\.(sin|cos|tan|exp|log|pow|hypot|sqrt|cbrt|random)/);
    expect(zrodlo).not.toMatch(/Date\.|new Date|performance\./);
  });
});

// ---------------------------------------------------------------- czytnik i uczenie na małych, zmyślonych danych

describe('czytnik SGJP i wybór form (tools/dane/odmiana.ts)', () => {
  /** Wiersze jednego leksemu: [forma, „liczba:przypadki”, kwalifikatory]. */
  const wiersze = (lemat: string, klasa: string, rodzaj: string, formy: [string, string, string?][]): string[] =>
    formy.map(([f, p, kw]) => `${f}\t${lemat}\tsubst:${p}:${rodzaj}\t${klasa}\t${kw ?? ''}`);
  const sgjpZmyslony = (rzedy: string[]): Buffer =>
    Buffer.from(
      `#!DICT-ID pl.test.sgjp-0\n#<COPYRIGHT>\nNota testowa\n\nDruga linia noty\n#</COPYRIGHT>\n${rzedy.join('\n')}\n`,
    );
  const hugo = wiersze('Hugo:Sm1', 'imię', 'm1', [
    ['Hugo', 'sg:nom'],
    ['Hugona', 'sg:gen.acc'],
    ['Huga', 'sg:gen.acc', 'pot.'],
    ['Hugonowi', 'sg:dat'],
    ['Hugonem', 'sg:inst'],
    ['Hugonie', 'sg:loc'],
    ['Hugo', 'sg:voc'],
    ['Hugonowie', 'pl:nom.voc'],
    ['Hugonów', 'pl:gen.acc'],
  ]);
  const maja = wiersze('Maja:Sf', 'imię', 'f', [
    ['Maja', 'sg:nom'],
    ['Mai', 'sg:gen'],
    ['Mai', 'sg:dat.loc'],
    ['Maję', 'sg:acc'],
    ['Mają', 'sg:inst'],
    ['Majo', 'sg:voc'],
    ['Maju', 'sg:voc'],
  ]);
  const niepelny = wiersze('Brak:Sf', 'imię', 'f', [
    ['Brak', 'sg.pl:nom.gen.dat.acc.inst.loc'], // bez wołacza
  ]);
  const kowalski = wiersze('Kowalski:Sm1', 'nazwisko', 'm1', [
    ['Kowalski', 'sg:nom.voc'],
    ['Kowalskiego', 'sg:gen.acc'],
    ['Kowalskiemu', 'sg:dat'],
    ['Kowalskim', 'sg:inst.loc'],
    ['Kowalscy', 'pl:nom.voc'],
  ]);
  const obce = [
    'stół\tstół:Sm3\tsubst:sg:nom:m3\tnazwa_pospolita\t',
    'Hugony\tHugo:Sm1\tdepr:pl:nom.acc.voc:m2\timię\t',
    'Hugonki\tHugo:Sm1\tsubst:pl:nom:m1:pt\timię\t',
    'Ala\tAla:Sf\tsubst:sg:nom:f\tnazwisko_(odojcowskie)\t',
  ];
  const sgjp = parsujSgjp(sgjpZmyslony([...obce, ...hugo, ...maja, ...niepelny, ...kowalski]));

  it('czyta nagłówek, zostawia tylko leksemy imion i nazwisk i tylko znaczniki subst', () => {
    expect(sgjp.idSlownika).toBe('pl.test.sgjp-0');
    expect(sgjp.nota).toBe('Nota testowa\n\nDruga linia noty');
    expect([...sgjp.leksemy.keys()].sort()).toEqual(['Brak:Sf', 'Hugo:Sm1', 'Kowalski:Sm1', 'Maja:Sf']);
    const h = sgjp.leksemy.get('Hugo:Sm1');
    expect(h?.rodzaj).toBe('m1');
    expect(h?.sg.dop).toEqual([
      { forma: 'Hugona', kwal: [] },
      { forma: 'Huga', kwal: ['pot.'] },
    ]);
    expect(h?.mnN.map((f) => f.forma)).toEqual(['Hugonowie']); // bez depr i bez pluralia tantum
    expect(sgjp.leksemy.get('Kowalski:Sm1')?.sg.mian.map((f) => f.forma)).toEqual(['Kowalski']);
    expect(sgjp.leksemy.get('Kowalski:Sm1')?.sg.wol.map((f) => f.forma)).toEqual(['Kowalski']);
  });

  it('odrzuca nagłówek bez noty albo bez identyfikatora', () => {
    expect(() => parsujSgjp(Buffer.from('Hugo\tHugo:Sm1\tsubst:sg:nom:m1\timię\t\n'))).toThrow(/COPYRIGHT/);
  });

  it('formy potoczne i niepoprawne odpadają, reszta jest uporządkowana: bez kwalifikatora, rzad., inne, kody znaków', () => {
    const f = (forma: string, ...kwal: string[]) => ({ forma, kwal });
    expect(dopuszczalne([f('Huga', 'pot.'), f('Hugona')])).toEqual(['Hugona']);
    expect(dopuszczalne([f('Maju'), f('Majo')])).toEqual(['Majo', 'Maju']);
    expect(dopuszczalne([f('Rzadko', 'rzad.'), f('Zwykle'), f('Bibl', 'bibl.')])).toEqual(['Zwykle', 'Rzadko', 'Bibl']);
    expect(dopuszczalne([f('X', 'niepopr.'), f('Y', 'pot.', 'rzad.')])).toEqual([]);
    expect(dopuszczalne([f('Ola'), f('Ola')])).toEqual(['Ola']);
    expect(dopuszczalne([])).toEqual([]);
  });

  it('przykłady: pełne leksemy z wybranymi formami, płeć z rodzaju, niepełne odpadają', () => {
    const imiona = przyklady(sgjp, false);
    expect(imiona.map((p) => `${p.plec}${p.mian}`)).toEqual(['MHugo', 'KMaja']);
    const hugoP = imiona[0];
    expect(lista(wybraneFormy(hugoP))).toEqual(['Hugo', 'Hugona', 'Hugonowi', 'Hugona', 'Hugonem', 'Hugonie', 'Hugo']);
    expect(hugoP.dopuszczalne.dop).toEqual(['Hugona']);
    expect(imiona[1].dopuszczalne.wol).toEqual(['Majo', 'Maju']);
    expect(lista(wybraneFormy(imiona[1]))[6]).toBe('Majo');
    const nazwiska = przyklady(sgjp, true);
    expect(nazwiska.map((p) => p.mian)).toEqual(['Kowalski']);
    expect(nazwiska[0].mnoga).toEqual(['Kowalscy']);
    expect(nazwiska[0].nazwisko).toBe(true);
  });

  it('pary nazwisk łączą męskie z żeńskim leksemem po mianowniku z zenskaFormaNazwiska', () => {
    const kowalska = wiersze('Kowalska:Sf', 'nazwisko', 'f', [
      ['Kowalska', 'sg:nom.voc'],
      ['Kowalskiej', 'sg:gen.dat.loc'],
      ['Kowalską', 'sg:acc.inst'],
    ]);
    const kowalskiNieodm = wiersze('Kowalski:Sf', 'nazwisko', 'f', [
      ['Kowalski', 'sg.pl:nom.gen.dat.acc.inst.loc.voc'],
    ]);
    const s = parsujSgjp(sgjpZmyslony([...kowalski, ...kowalska, ...kowalskiNieodm]));
    const pary = paryNazwisk(przyklady(s, true));
    expect(pary.map((p) => [p.m.mian, p.k?.mian])).toEqual([['Kowalski', 'Kowalska']]);
    expect(przykladyUczaceNazwisk(pary).map((p) => `${p.plec}${p.mian}`)).toEqual(['MKowalski', 'KKowalska']);
  });
});

describe('uczenie końcówek i pomiar (tools/dane/odmiana.ts)', () => {
  const przyklad = (mian: string, plec: Plec, oblique: string[], nazwisko = false): Przyklad => {
    const formy = [mian, ...oblique];
    return {
      mian,
      plec,
      nazwisko,
      lemat: mian,
      dopuszczalne: Object.fromEntries(PRZYPADKI.map((p, i) => [p, [formy[i]]])) as Record<Przypadek, string[]>,
      mnoga: [],
    };
  };
  const ek = (n: string, rdzen: string) =>
    przyklad(n, 'M', [`${rdzen}a`, `${rdzen}owi`, `${rdzen}a`, `${rdzen}iem`, `${rdzen}u`, `${rdzen}u`]);
  const zestaw = [
    ek('Marek', 'Mark'),
    ek('Jacek', 'Jack'),
    przyklad('Henryk', 'M', ['Henryka', 'Henrykowi', 'Henryka', 'Henrykiem', 'Henryku', 'Henryku']),
  ];

  it('wzorzec to wspólny prefiks ze wszystkimi formami i końcówki; najczęstszy wzorzec sufiksu wygrywa', () => {
    const tab = trenujKoncowki(zestaw);
    expect(tab.wersja).toBe(1);
    expect(tab.wzorce.map((w) => `${w.plec}:${w.sufiks}`)).toEqual(['M:k', 'M:yk']);
    expect(tab.wzorce[0].ucinek).toBe(2);
    expect(tab.wzorce[0].koncowki).toEqual({
      mian: '',
      dop: 'ka',
      cel: 'kowi',
      bier: 'ka',
      narz: 'kiem',
      msc: 'ku',
      wol: 'ku',
    });
    expect(tab.wzorce[1].ucinek).toBe(0);
    expect(lista(zgadnijKoncowkami('Darek', 'M', tab) as Formy)[1]).toBe('Darka');
    expect(lista(zgadnijKoncowkami('Cezaryk', 'M', tab) as Formy)[1]).toBe('Cezaryka');
    expect(zgadnijKoncowkami('Darek', 'K', tab)).toBeNull();
  });

  it('wynik nie zależy od kolejności przykładów, a przy remisie wygrywa mniejszy wzorzec', () => {
    const a = trenujKoncowki(zestaw);
    const b = trenujKoncowki([...zestaw].reverse());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const remis = trenujKoncowki([
      ek('Marek', 'Mark'),
      przyklad('Henryk', 'M', ['Henryka', 'Henrykowi', 'Henryka', 'Henrykiem', 'Henryku', 'Henryku']),
    ]);
    const remisOdwrotnie = trenujKoncowki([
      przyklad('Henryk', 'M', ['Henryka', 'Henrykowi', 'Henryka', 'Henrykiem', 'Henryku', 'Henryku']),
      ek('Marek', 'Mark'),
    ]);
    expect(JSON.stringify(remis)).toBe(JSON.stringify(remisOdwrotnie));
  });

  it('nazwiska mają sufiksy z gwiazdką, osobno od imion o tej samej końcówce', () => {
    const tab = trenujKoncowki([
      ...zestaw,
      przyklad('Nowak', 'M', ['Nowaka', 'Nowakowi', 'Nowaka', 'Nowakiem', 'Nowaku', 'Nowaku'], true),
      przyklad('Nowak', 'K', ['Nowak', 'Nowak', 'Nowak', 'Nowak', 'Nowak', 'Nowak'], true),
    ]);
    expect(tab.wzorce.some((w) => w.sufiks.startsWith('*') && w.plec === 'K')).toBe(true);
    expect(lista(zgadnijNazwiskoKoncowkami('Kowak', tab)?.k as Formy)).toEqual(Array(7).fill('Kowak'));
    expect(lista(zgadnijNazwiskoKoncowkami('Kowak', tab)?.m as Formy)[1]).toBe('Kowaka');
  });

  it('podział: co dziesiąty przykład w kolejności posortowanej (indeksy 9, 19, …) jest odłożony', () => {
    const { trening, odlozone } = podzial(Array.from({ length: 25 }, (_, i) => i));
    expect(odlozone).toEqual([9, 19]);
    expect(trening).toHaveLength(23);
    expect(podzial([]).odlozone).toEqual([]);
    expect(podzial([1, 2, 3]).odlozone).toEqual([]);
  });

  it('dokładność: liczy pełne paradygmaty i poprawność per przypadek, brak odpowiedzi to błąd', () => {
    const d = ocenPrzyklady(zestaw, (p) => (p.mian === 'Henryk' ? null : wybraneFormy(p)));
    expect(d.n).toBe(3);
    expect(d.poprawne).toBe(2);
    expect(d.przypadki.mian).toBe(2);
    expect(procent(d)).toBeCloseTo(66.67, 1);
    const zle = ocenPrzyklady(zestaw, (p) => ({ ...wybraneFormy(p), wol: 'Zle' }));
    expect(zle.poprawne).toBe(0);
    expect(zle.przypadki.wol).toBe(0);
    expect(zle.przypadki.dop).toBe(3);
    const wszystkoDobrze = ocenNazwiska([], () => null);
    expect(wszystkoDobrze.m.n).toBe(0);
    expect(procent(wszystkoDobrze.m)).toBe(0);
  });

  it('zgodność metod: zgodne, zgodne i poprawne, tylko reguły, tylko końcówki, obie błędne', () => {
    const tab = trenujKoncowki(zestaw);
    const z = zgodnoscImion(zestaw, tab);
    expect(z.n).toBe(3);
    expect(z.zgodne + z.tylkoReguly + z.tylkoKoncowki + z.obaZle).toBeGreaterThanOrEqual(0);
    expect(z.zgodneIPoprawne).toBeLessThanOrEqual(z.zgodne);
    expect(z.zgodne).toBe(3); // Marek, Jacek i Henryk: reguły i tablica dają to samo, poprawnie
    expect(z.zgodneIPoprawne).toBe(3);
  });
});

// ---------------------------------------------------------------- surowy plik SGJP (CI go nie ma)

describe('tabele z surowego pliku SGJP', () => {
  const jestSgjp = fs.existsSync(SGJP_PLIK);
  let wczytany: Sgjp | undefined;
  const sgjp = (): Sgjp => (wczytany ??= wczytajSgjp(SGJP_PLIK));
  const imionaTab = JSON.parse(fs.readFileSync(path.join(KATALOG, 'imiona.json'), 'utf8')) as TabeleImion;
  const nazwiskaTab = Object.values(PLIK_WOJEWODZTWA)
    .sort()
    .map((p) => JSON.parse(fs.readFileSync(path.join(KATALOG, 'nazwiska', `${p}.json`), 'utf8')) as TabeleNazwisk);
  let zbudowane: ReturnType<typeof zbudujTabele> | undefined;
  const tabele = (): ReturnType<typeof zbudujTabele> => (zbudowane ??= zbudujTabele(sgjp(), imionaTab, nazwiskaTab));
  const DLUGO = 180_000;

  it.skipIf(!jestSgjp)(
    'SGJP ma 3161 imion do treningu, a paradygmaty testowe z zadania są w nim dokładnie takie jak w stałych',
    () => {
      const { imiona } = tabele();
      expect(imiona.length).toBe(3161);
      const poKluczu = new Map(imiona.map((p) => [`${p.plec}${p.mian}`, p]));
      for (const [imie, plec, wzor] of IMIONA_SGJP) {
        const p = poKluczu.get(`${plec}${imie}`) as Przyklad;
        expect(p, imie).toBeDefined();
        expect(
          lista(wybraneFormy(p)).map((x, i) => wzor[i].split(' / ').includes(x)),
          imie,
        ).toEqual(Array(7).fill(true));
        for (const c of PRZYPADKI)
          expect(p.dopuszczalne[c].some((x) => wzor[PRZYPADKI.indexOf(c)].split(' / ').includes(x))).toBe(true);
      }
      for (const [meskie, wzor] of Object.entries(NAZWISKA_SGJP)) {
        const para = tabele().pary.find((x) => x.m.mian === meskie);
        expect(lista(wybraneFormy(para?.m as Przyklad)), meskie).toEqual(wzor.m);
        expect(lista(wybraneFormy(para?.k as Przyklad)), meskie).toEqual(wzor.k);
        expect(para?.m.mnoga[0], meskie).toBe(wzor.mnoga);
      }
    },
    DLUGO,
  );

  it.skipIf(!jestSgjp)(
    'końcówki uczone bez co dziesiątego imienia dają co najmniej 95% pełnych paradygmatów na odłożonych',
    () => {
      const { imiona } = tabele();
      const { trening, odlozone } = podzial(imiona);
      const tab = trenujKoncowki(trening);
      const d = ocenPrzyklady(odlozone, (p) => zgadnijKoncowkami(p.mian, p.plec, tab));
      expect(odlozone.length).toBe(316);
      expect(procent(d)).toBeGreaterThanOrEqual(95);
      for (const c of PRZYPADKI) expect(d.przypadki[c] / d.n, c).toBeGreaterThanOrEqual(0.95);
    },
    DLUGO,
  );

  // Uwaga: to nie jest pomiar bez przecieku. Listy wyjątków reguł (Z_E_RUCHOMYM_ER, NII, PLUS_N, PRZYM_E) pochodzą
  // z badań, w których dobrano je na wszystkich imionach SGJP, także na odłożonych, więc 96% dla reguł i 98% dla
  // `pewne` są optymistyczne (bez list badania dawały 95,4%). Wynik `pewne` dotyczy polskich imion, które słownik
  // i tak pokrywa; dla 343 obcych imion spoza słownika nie ma wzorca poprawności. Jedyną liczbą bez przecieku jest
  // test powyżej: tablica końcówek na odłożonych imionach.
  it.skipIf(!jestSgjp)(
    'reguły na wszystkich imionach SGJP, a oznaczenie pewne ma dokładność co najmniej 98% na odłożonych',
    () => {
      const { imiona } = tabele();
      const reguly = ocenPrzyklady(imiona, (p) => zgadnijReguly(p.mian, p.plec));
      expect(procent(reguly)).toBeGreaterThanOrEqual(96);
      const { trening, odlozone } = podzial(imiona);
      const z = zgodnoscImion(odlozone, trenujKoncowki(trening));
      expect(z.zgodne / z.n).toBeGreaterThan(0.9);
      expect(z.zgodneIPoprawne / z.zgodne).toBeGreaterThanOrEqual(0.98);
    },
    DLUGO,
  );

  it.skipIf(!jestSgjp)(
    'nazwiska SGJP: reguły i końcówki (na co dziesiątym odłożonym) mają co najmniej 97% męskich, żeńskich i liczby mnogiej',
    () => {
      const { pary, imiona } = tabele();
      const reguly = ocenNazwiska(pary, (m) => zgadnijNazwiskoReguly(m));
      expect(procent(reguly.m)).toBeGreaterThanOrEqual(97);
      expect(procent(reguly.k)).toBeGreaterThanOrEqual(98);
      expect(reguly.mnoga.poprawne / reguly.mnoga.n).toBeGreaterThanOrEqual(0.97);
      const podzialN = podzial(pary);
      const tab = trenujKoncowki([...podzial(imiona).trening, ...przykladyUczaceNazwisk(podzialN.trening)]);
      const koncowki = ocenNazwiska(podzialN.odlozone, (m) => zgadnijNazwiskoKoncowkami(m, tab));
      expect(procent(koncowki.m)).toBeGreaterThanOrEqual(98);
      expect(procent(koncowki.k)).toBeGreaterThanOrEqual(98);
    },
    DLUGO,
  );

  it.skipIf(!jestSgjp)(
    'słownik ma każde imię i nazwisko z puli, które SGJP zna kompletnie, i żadnego więcej',
    () => {
      const { odmiana, imiona, pary } = tabele();
      const zSgjp = new Set(imiona.map((p) => `${p.plec}${p.mian}`));
      const zeSlownika = rozpakujOdmiane(odmiana);
      const pula = imionaZPuli(imionaTab);
      for (const plec of ['M', 'K'] as const) {
        for (const imie of pula[plec]) {
          expect(Boolean(zeSlownika.imiona[imie]?.[plec]), `${imie} (${plec})`).toBe(zSgjp.has(`${plec}${imie}`));
        }
      }
      const meskie = new Set(pary.map((p) => p.m.mian));
      for (const [m] of nazwiskaZPuli(nazwiskaTab).pary) expect(Boolean(zeSlownika.nazwiska[m]), m).toBe(meskie.has(m));
      // formy ze słownika to wybrane formy SGJP
      const marek = imiona.find((p) => p.mian === 'Marek' && p.plec === 'M') as Przyklad;
      expect(zeSlownika.imiona.Marek.M).toEqual(wybraneFormy(marek));
    },
    DLUGO,
  );

  it.skipIf(!jestSgjp)(
    'odtwarza odmiana.json i odmiana-koncowki.json bajt w bajt',
    () => {
      const { odmiana, koncowki } = tabele();
      expect(jakoJson(odmiana)).toBe(fs.readFileSync(path.join(KATALOG, 'odmiana.json'), 'utf8'));
      expect(jakoJson(koncowki)).toBe(fs.readFileSync(path.join(KATALOG, 'odmiana-koncowki.json'), 'utf8'));
    },
    DLUGO,
  );
});
