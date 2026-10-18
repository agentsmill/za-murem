/* Zmiana imienia osoby z generatora mieszkańców (krok 5, zadanie 6; spec §7 i §9): edytor z siedmioma formami
   z odmiany, pamięć zmian w przeglądarce pod kluczem z adresu (atrapa Storage), sprawdzanie wpisanego imienia
   (także przeciw wstawianiu HTML), historie gospodarstw z nowym imieniem (`historieZeZmianami`), zastosowanie zmian
   do stanu gry (`zastosujZmiany`: imię, historie, linijki rodziny krewnych) i wpisy bez osoby (`sieroty`,
   komunikat o wyprowadzce). Na demie Przymorza z public/demo/ i tabelach z public/data/mieszkancy/ (atrapa `fetch`
   czyta pliki), jak w lokatorzy-sim.test.ts. */

import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Person } from '../../src/content/people.ts';
import { hashString } from '../../src/core/rng.ts';
import { budynkiZCzlonkami } from '../../src/mieszkancy/budynki.ts';
import { type Formy, odmien, PRZYPADKI } from '../../src/mieszkancy/odmiana.ts';
import { oznaczGeo } from '../../src/mieszkancy/oznacz.ts';
import { type DaneMieszkancow, wczytajDaneMieszkancow } from '../../src/mieszkancy/wczytaj.ts';
import { historieZeZmianami, type LokatorzyGry, lokatorzyGry } from '../../src/sim/lokatorzy.ts';
import { createSim, type SimState } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import {
  dotyczy,
  edytorImienia,
  IMIONA_KEY,
  imieZGeneratora,
  imionaWGrze,
  poprawneImie,
  sieroty,
  wczytajZmiany,
  wyprowadzka,
  type ZmianaImienia,
  zapiszZmiane,
  zastosujZmiany,
  zmianaZPol,
} from '../../src/ui/imiona.ts';
import { personCard } from '../../src/ui/karta.ts';
import { applyApts, settleApts } from '../../src/world/apts.ts';
import type { Geo } from '../../src/world/geo.ts';
import { buildWorld, type World } from '../../src/world/world.ts';

const PUBLIC = path.resolve(import.meta.dirname, '../../public');

/** Atrapa `fetch`: ścieżka względna to plik w public/, brak pliku to 404 (jak w lokatorzy.test.ts). */
const plikowy = (async (adr: string) => {
  const plik = path.join(PUBLIC, adr);
  if (!fs.existsSync(plik)) return new Response('brak', { status: 404 });
  return new Response(fs.readFileSync(plik));
}) as unknown as typeof fetch;

/** Atrapa Storage w pamięci; `psuj` rzuca przy każdym dostępie (tryb prywatny, brak miejsca). */
class Atrapa {
  readonly m = new Map<string, string>();
  psuj = false;
  getItem(k: string): string | null {
    if (this.psuj) throw new Error('SecurityError');
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    if (this.psuj) throw new Error('QuotaExceededError');
    this.m.set(k, String(v));
  }
  removeItem(k: string): void {
    if (this.psuj) throw new Error('SecurityError');
    this.m.delete(k);
  }
}

const formy = (...f: string[]): Formy => Object.fromEntries(PRZYPADKI.map((p, i) => [p, f[i]])) as Formy;
const BOZENKA_FORMY = formy('Bożenka', 'Bożenki', 'Bożence', 'Bożenkę', 'Bożenką', 'Bożence', 'Bożenko');
const BOZENKA: ZmianaImienia = { imie: 'Bożenka', formy: BOZENKA_FORMY, f: true };
/** formy-znaczniki: każdy przypadek innym słowem, żeby w tekście było widać, gdzie stoi która forma */
const ZNACZNIK: ZmianaImienia = { imie: 'QmianQ', formy: formy(...PRZYPADKI.map((c) => `Q${c}Q`)) };
const ZNACZNIK2: ZmianaImienia = { imie: 'RmianR', formy: formy(...PRZYPADKI.map((c) => `R${c}R`)) };
/** znaczniki (litera `z`) na formy */
const znaczniki = (f: Formy, z = 'Q'): Map<string, string> => new Map(PRZYPADKI.map((c) => [`${z}${c}${z}`, f[c]]));

/** Wartości pól edytora po nazwie (kolejność z HTML) i ich klasy. */
function pola(html: string): { name: string; value: string; klasa: string }[] {
  return [...html.matchAll(/<input\b[^>]*>/g)].map((m) => {
    const tag = m[0];
    const atr = (a: string) => new RegExp(`\\b${a}="([^"]*)"`).exec(tag)?.[1] ?? '';
    return { name: atr('name'), value: atr('value'), klasa: atr('class') };
  });
}

/** Podmienia słowa (ciągi liter) według mapy, resztę tekstu zostawia: oczekiwany tekst po zmianie imienia. */
const podmien = (tekst: string, mapa: ReadonlyMap<string, string>): string =>
  tekst.replace(/[\p{L}'’]+/gu, (w) => mapa.get(w) ?? w);

interface Przymorze {
  dane: DaneMieszkancow;
  world: World;
  seed: number;
  l: LokatorzyGry;
}
let P: Przymorze;

beforeAll(async () => {
  const surowe = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'demo/przymorze.json'), 'utf8')) as {
    geo: Geo;
    addr: string;
    street: string;
  };
  const dane = await wczytajDaneMieszkancow(surowe.geo.c[0], surowe.geo.c[1], plikowy);
  if (!dane) throw new Error('brak danych mieszkańców dla Przymorza');
  const geo = oznaczGeo(surowe.geo, budynkiZCzlonkami(surowe.geo, dane.gmina, dane.kraj));
  const seed = Number.parseInt(hashString(surowe.addr), 16) || 2051;
  const world = buildWorld(geo, { seed, street: surowe.street });
  const l = lokatorzyGry(world, geo, dane, { core: 4 });
  if (!l) throw new Error('lokatorzyGry dało null');
  applyApts(world, settleApts(world, l.stany));
  P = { dane, world, seed, l };
});

const nowaGra = (): SimState =>
  createSim(P.world, P.seed, { core: 4, mieszkancy: { zarzad: P.l.zarzad, lokatorzy: P.l.lokatorzy } });

describe('edytorImienia', () => {
  it('dla „Halina” ma siedem pól z formami ze słownika, bez zaznaczeń', () => {
    const html = edytorImienia({ ref: 'o1', first: 'Halina', f: true }, P.dane.odmiana);
    const p = pola(html);
    expect(p.map((x) => x.name)).toEqual([...PRZYPADKI]);
    expect(p.map((x) => x.value)).toEqual(['Halina', 'Haliny', 'Halinie', 'Halinę', 'Haliną', 'Halinie', 'Halino']);
    expect(p.every((x) => !x.klasa.includes('niepewne'))).toBe(true);
    expect(html).not.toMatch(/class="imie-uwaga"(?![^>]*hidden)/);
    // zapis, anulowanie; bez zapisanej zmiany nie ma czego przywracać
    expect(html).toContain('data-card="imie-zapisz"');
    expect(html).toContain('data-card="imie-anuluj"');
    expect(html).not.toContain('data-card="imie-przywroc"');
    // napis o fikcji zostaje na karcie także w edytorze
    expect(html).toContain('Mieszkańcy są wymyśleni na podstawie danych GUS i PESEL.');
  });

  it('dla „Xyz” zaznacza zgadywane formy klasą „niepewne” i pokazuje podpowiedź', () => {
    const html = edytorImienia({ ref: 'o1', first: 'Xyz', f: true }, P.dane.odmiana);
    const p = pola(html);
    expect(p).toHaveLength(7);
    expect(p[0].klasa).not.toContain('niepewne');
    for (const x of p.slice(1)) expect(x.klasa).toContain('niepewne');
    expect(html).toMatch(/<p class="imie-uwaga">[^<]+<\/p>/);
  });

  it('z zapisaną zmianą wypełnia pola jej formami i daje przycisk przywrócenia', () => {
    const wlasne = { ...BOZENKA, formy: { ...BOZENKA_FORMY, wol: 'Bożenciu' } };
    const html = edytorImienia({ ref: 'o1', first: 'Bożenka', f: true }, P.dane.odmiana, wlasne);
    expect(pola(html).map((x) => x.value)).toEqual([...PRZYPADKI.map((c) => wlasne.formy[c])]);
    expect(html).toContain('data-card="imie-przywroc"');
  });

  it('wołacz dla mężczyzny z „panie”, dla kobiety z „pani”', () => {
    expect(edytorImienia({ ref: 'o1', first: 'Marcin', f: false }, P.dane.odmiana)).toMatch(/>panie<\/span>/);
    expect(edytorImienia({ ref: 'o1', first: 'Halina', f: true }, P.dane.odmiana)).toMatch(/>pani<\/span>/);
  });

  it('imię z HTML nie wchodzi do kodu strony', () => {
    const html = edytorImienia({ ref: 'o1"><script>x()</script>', first: '<img onerror=x>', f: true }, P.dane.odmiana);
    expect(html).not.toMatch(/<img|<script/);
    expect(html).toContain('&lt;img');
  });
});

describe('zmianaZPol: sprawdzanie wpisanego imienia', () => {
  const zPol = (imie: string, f = true) => {
    const o = odmien(imie, f ? 'K' : 'M', P.dane.odmiana.tabela, P.dane.odmiana.koncowki);
    return { ...o.formy, mian: imie };
  };

  it('dobre imię daje zmianę z formami i płcią, z obciętymi spacjami', () => {
    const w = zmianaZPol({ ...BOZENKA_FORMY, mian: '  Bożenka ' }, true);
    expect(w).toEqual({ zmiana: BOZENKA });
    expect(zmianaZPol(zPol('Anna-Maria'), true)).toHaveProperty('zmiana.imie', 'Anna-Maria');
    expect(zmianaZPol(zPol("D'Artagnan", false), false)).toHaveProperty('zmiana.imie', "D'Artagnan");
    expect(zmianaZPol(zPol('Jan Paweł', false), false)).toHaveProperty('zmiana.imie', 'Jan Paweł');
  });

  it('puste, za długie i ze znakami spoza liter odrzuca z komunikatem', () => {
    for (const zle of [
      '',
      '   ',
      'A'.repeat(25),
      '<img onerror=x>',
      'Ha"lina',
      'Hal1na',
      'Ha&lina',
      '-Halina',
      'Ha--lina',
    ]) {
      const w = zmianaZPol({ ...BOZENKA_FORMY, mian: zle }, true);
      expect(w, zle).toHaveProperty('blad');
      expect(w).toHaveProperty('pole', 'mian');
      if ('blad' in w) expect(w.blad.length).toBeGreaterThan(5);
    }
    expect(zmianaZPol({ ...BOZENKA_FORMY, mian: 'A'.repeat(24) }, true)).toHaveProperty('zmiana');
  });

  it('poprawneImie mówi to samo co zmianaZPol o imieniu', () => {
    for (const imie of ['Bożenka', ' Anna-Maria ', "D'Artagnan", 'Jan Paweł', 'A'.repeat(24)])
      expect(poprawneImie(imie), imie).toBe(true);
    for (const imie of ['', ' ', 'A'.repeat(25), '<img onerror=x>', 'Hal1na', 'Ha--lina', '-Ola'])
      expect(poprawneImie(imie), imie).toBe(false);
  });

  it('wielkie litery z kropką („İLKA”): imię w NFC, więc drugie sprawdzenie (wpis z pamięci) daje to samo', () => {
    const pola = Object.fromEntries(PRZYPADKI.map((c) => [c, c === 'mian' ? 'İLKA' : 'İLKI']));
    const w = zmianaZPol(pola, true);
    if (!('zmiana' in w)) throw new Error(w.blad);
    expect(w.zmiana.imie).toBe('\u0130lka');
    expect(w.zmiana.formy.dop).toBe('\u0130lki');
    const mag = new Atrapa();
    zapiszZmiane('Lanciego 10G', 'o5', w.zmiana, mag);
    expect(wczytajZmiany('Lanciego 10G', mag)).toEqual({ o5: w.zmiana });
  });

  it('forma z HTML albo pusta też jest błędem, z nazwą pola', () => {
    expect(zmianaZPol({ ...BOZENKA_FORMY, narz: '<b>Bożenką</b>' }, true)).toHaveProperty('pole', 'narz');
    expect(zmianaZPol({ ...BOZENKA_FORMY, dop: '' }, true)).toHaveProperty('pole', 'dop');
    expect(zmianaZPol({ mian: 'Bożenka' }, true)).toHaveProperty('pole', 'dop');
  });
});

describe('imionaWGrze: gra z sąsiadami bez zmiany imion (zapis idzie na serwer)', () => {
  it('bez stanu sieci wolno, ze stanem sieci (także toczona chwilowo bez sieci) nie', () => {
    expect(imionaWGrze(null)).toBe(true);
    expect(imionaWGrze(undefined)).toBe(true);
    expect(imionaWGrze({ zajete: [], dom: true })).toBe(false);
    expect(imionaWGrze({ zajete: ['px:1:2:3:4:0'], dom: false, konto: 'inne' })).toBe(false);
  });
});

describe('pamięć zmian w przeglądarce', () => {
  it('zapis i odczyt pod kluczem z adresu, usunięcie wpisu', () => {
    const mag = new Atrapa();
    expect(wczytajZmiany('Lanciego 10G', mag)).toEqual({});
    zapiszZmiane('Lanciego 10G', 'o5', BOZENKA, mag);
    zapiszZmiane(
      'Lanciego 10G',
      'o6',
      {
        imie: 'Zbyszko',
        formy: odmien('Zbyszko', 'M', P.dane.odmiana.tabela, P.dane.odmiana.koncowki).formy,
        f: false,
      },
      mag,
    );
    zapiszZmiane(
      'Inny adres 1',
      'o5',
      { ...BOZENKA, imie: 'Halina', formy: { ...BOZENKA_FORMY, mian: 'Halina' } },
      mag,
    );
    expect(wczytajZmiany('Lanciego 10G', mag)).toEqual({
      o5: BOZENKA,
      o6: expect.objectContaining({ imie: 'Zbyszko', f: false }),
    });
    expect(wczytajZmiany('Inny adres 1', mag).o5.imie).toBe('Halina');
    // jeden klucz przeglądarki, w nim adresy po skrócie, nie otwartym tekstem
    expect([...mag.m.keys()]).toEqual([IMIONA_KEY]);
    const surowe = mag.m.get(IMIONA_KEY) ?? '';
    expect(surowe).not.toContain('Lanciego');
    expect(Object.keys(JSON.parse(surowe))).toEqual([hashString('Lanciego 10G'), hashString('Inny adres 1')]);
    zapiszZmiane('Lanciego 10G', 'o5', null, mag);
    expect(Object.keys(wczytajZmiany('Lanciego 10G', mag))).toEqual(['o6']);
    zapiszZmiane('Lanciego 10G', 'o6', null, mag);
    expect(wczytajZmiany('Lanciego 10G', mag)).toEqual({});
    expect(Object.keys(JSON.parse(mag.m.get(IMIONA_KEY) ?? '{}'))).toEqual([hashString('Inny adres 1')]);
  });

  it('wpis niesie imię z generatora (gen); stary wpis bez niego dalej się wczytuje, zły gen to zły wpis', () => {
    expect(zmianaZPol({ ...BOZENKA_FORMY }, true, 'Halina')).toEqual({ zmiana: { ...BOZENKA, gen: 'Halina' } });
    expect(zmianaZPol({ ...BOZENKA_FORMY }, true)).toEqual({ zmiana: BOZENKA });
    const mag = new Atrapa();
    zapiszZmiane('A', 'o1', { ...BOZENKA, gen: 'Halina' }, mag);
    zapiszZmiane('A', 'o2', BOZENKA, mag);
    expect(wczytajZmiany('A', mag)).toEqual({ o1: { ...BOZENKA, gen: 'Halina' }, o2: BOZENKA });
    for (const gen of [5, '', 'x'.repeat(65)]) {
      mag.m.set(IMIONA_KEY, JSON.stringify({ [hashString('A')]: { o3: { ...BOZENKA, gen } } }));
      expect(wczytajZmiany('A', mag), String(gen)).toEqual({});
    }
  });

  it('uszkodzony JSON i złe wpisy dają pusto, a nie wyjątek', () => {
    const mag = new Atrapa();
    mag.m.set(IMIONA_KEY, '{nie json');
    expect(wczytajZmiany('Lanciego 10G', mag)).toEqual({});
    mag.m.set(IMIONA_KEY, JSON.stringify({ [hashString('A')]: 'tekst' }));
    expect(wczytajZmiany('A', mag)).toEqual({});
    mag.m.set(
      IMIONA_KEY,
      JSON.stringify({
        [hashString('A')]: {
          dobry: BOZENKA,
          bezForm: { imie: 'Halina' },
          zHtml: { ...BOZENKA, imie: '<img onerror=x>', formy: { ...BOZENKA_FORMY, mian: '<img onerror=x>' } },
          liczba: 5,
        },
      }),
    );
    expect(wczytajZmiany('A', mag)).toEqual({ dobry: BOZENKA });
    // zapis po uszkodzonym JSON nadpisuje go od nowa
    mag.m.set(IMIONA_KEY, '[1,2');
    zapiszZmiane('A', 'o1', BOZENKA, mag);
    expect(wczytajZmiany('A', mag)).toEqual({ o1: BOZENKA });
  });

  it('przeglądarka bez dostępu do pamięci: bez wyjątku', () => {
    const mag = new Atrapa();
    mag.psuj = true;
    expect(wczytajZmiany('A', mag)).toEqual({});
    expect(() => zapiszZmiane('A', 'o1', BOZENKA, mag)).not.toThrow();
    expect(() => zapiszZmiane('A', 'o1', null, mag)).not.toThrow();
  });
});

describe('historieZeZmianami', () => {
  it('bez zmian daje historie z generatora', () => {
    const h = historieZeZmianami(P.l, P.dane, {});
    expect(h.size).toBe(P.l.siedziba.gospodarstwa.length);
    for (const g of P.l.siedziba.gospodarstwa) expect(h.get(g.id)).toEqual(g.historia ?? []);
  });

  it('„Bożenka” z narzędnikiem „Bożenką” stoi tam, gdzie był narzędnik starego imienia', () => {
    const { siedziba } = P.l;
    const odm = P.dane.odmiana;
    // znaczniki pokazują, gdzie w historii stoją formy imienia osoby (imiona się w budynku powtarzają)
    let traf: { gid: string; ref: string; znaczone: string[]; stare: Formy } | undefined;
    for (const g of siedziba.gospodarstwa) {
      for (const id of g.czlonkowie) {
        if (traf) break;
        const o = siedziba.osoby.find((x) => x.id === id);
        if (!o) continue;
        const znaczone = historieZeZmianami(P.l, P.dane, { [id]: ZNACZNIK }).get(g.id) ?? [];
        if (znaczone.some((z) => z.includes('QnarzQ')))
          traf = { gid: g.id, ref: id, znaczone, stare: odmien(o.imie, o.plec, odm.tabela, odm.koncowki).formy };
      }
    }
    if (!traf) throw new Error('brak zdania z narzędnikiem imienia w historiach Przymorza');
    const h = historieZeZmianami(P.l, P.dane, { [traf.ref]: BOZENKA });
    const stara = siedziba.gospodarstwa.find((g) => g.id === traf.gid)?.historia ?? [];
    const nowa = h.get(traf.gid) ?? [];
    // te same zdania: ze znacznikami zamienionymi na stare formy to historia z generatora, na formy Bożenki nowa
    expect(traf.znaczone.map((z) => podmien(z, znaczniki(traf.stare)))).toEqual(stara);
    expect(nowa).toEqual(traf.znaczone.map((z) => podmien(z, znaczniki(BOZENKA_FORMY))));
    const i = traf.znaczone.findIndex((z) => z.includes('QnarzQ'));
    expect(nowa[i]).toContain('Bożenką');
    expect(stara[i]).toContain(traf.stare.narz);
    expect(nowa[i]).not.toBe(stara[i]);
    // pozostałe gospodarstwa bez zmian
    for (const g of siedziba.gospodarstwa) if (g.id !== traf.gid) expect(h.get(g.id)).toEqual(g.historia ?? []);
  });

  it('nie zmienia wyniku generatora', () => {
    const przed = JSON.stringify(P.l.siedziba);
    historieZeZmianami(P.l, P.dane, { [P.l.zarzad[0].ref]: BOZENKA });
    expect(JSON.stringify(P.l.siedziba)).toBe(przed);
  });
});

describe('sieroty i wyprowadzka', () => {
  it('sieroty to wpisy spoza zbioru osób', () => {
    const z = { a: BOZENKA, b: BOZENKA, c: BOZENKA };
    expect(sieroty(z, new Set(['b']))).toEqual(['a', 'c']);
    expect(sieroty(z, new Set(['a', 'b', 'c']))).toEqual([]);
    expect(sieroty({}, new Set())).toEqual([]);
  });

  it('komunikat o wyprowadzce w rodzaju osoby', () => {
    expect(wyprowadzka({ ...BOZENKA, imie: 'Halina' })).toBe('Halina wyprowadziła się.');
    expect(
      wyprowadzka({
        imie: 'Marek',
        formy: formy('Marek', 'Marka', 'Markowi', 'Marka', 'Markiem', 'Marku', 'Marku'),
        f: false,
      }),
    ).toBe('Marek wyprowadził się.');
  });
});

describe('zastosujZmiany', () => {
  const bezImion = ({ first: _f, name: _n, story: _s, rodzina: _r, ...reszta }: Person) => reszta;
  const pole = (v: string | undefined, mapa: ReadonlyMap<string, string>) => (v === undefined ? v : podmien(v, mapa));

  it('zmienia imię, historie i linijki rodziny krewnych, a pusta lista zmian przywraca wszystko', () => {
    const odm = P.dane.odmiana;
    const zbyszko: ZmianaImienia = {
      imie: 'Zbyszko',
      formy: odmien('Zbyszko', 'M', odm.tabela, odm.koncowki).formy,
      f: false,
    };
    // znaczniki: osoba w grze, której imię stoi w linijce rodziny krewnego w grze, i osoba, której imię stoi w czyjejś
    // historii w grze (imiona się w budynku powtarzają, więc miejsca form pokazują znaczniki)
    const zZnacznikiem = (ref: string, z: ZmianaImienia): Person[] => {
      const st = nowaGra();
      zastosujZmiany(st, P.l, P.dane, { [ref]: z });
      return st.people;
    };
    const refs = nowaGra().people.flatMap((q) => (q.ref ? [q.ref] : []));
    const wRodzinie = refs.find((r) => zZnacznikiem(r, ZNACZNIK).some((q) => q.rodzina?.includes('QmianQ')));
    const wHistorii = refs.find(
      (r) => r !== wRodzinie && zZnacznikiem(r, ZNACZNIK).some((q) => q.story?.includes('Q')),
    );
    if (!wRodzinie || !wHistorii) throw new Error('brak osób do zmiany imienia na Przymorzu');
    const st = nowaGra();
    const przed = structuredClone(st.people);
    const znaczone = nowaGra();
    zastosujZmiany(znaczone, P.l, P.dane, { [wRodzinie]: ZNACZNIK, [wHistorii]: ZNACZNIK2 });
    const p = st.people.find((q) => q.ref === wRodzinie) as Person;
    const p2 = st.people.find((q) => q.ref === wHistorii) as Person;
    const stare = new Map([
      ...znaczniki(odmien(p.first, p.f ? 'K' : 'M', odm.tabela, odm.koncowki).formy),
      ...znaczniki(odmien(p2.first, p2.f ? 'K' : 'M', odm.tabela, odm.koncowki).formy, 'R'),
    ]);
    const nowe = new Map([...znaczniki(BOZENKA_FORMY), ...znaczniki(zbyszko.formy, 'R')]);
    const nazwisko = p.name.slice(p.first.length + 1);
    const w = zastosujZmiany(st, P.l, P.dane, { [wRodzinie]: BOZENKA, [wHistorii]: zbyszko });
    expect(w).toEqual({ sieroty: [] });
    expect(p.first).toBe('Bożenka');
    expect(p.name).toBe(`Bożenka ${nazwisko}`);
    expect(p2.first).toBe('Zbyszko');
    st.people.forEach((q, i) => {
      const b = przed[i];
      const z = znaczone.people[i];
      expect(bezImion(q)).toEqual(bezImion(b));
      for (const k of ['first', 'name', 'story', 'rodzina'] as const) {
        expect(pole(z[k], stare), k).toBe(b[k]);
        expect(q[k], k).toBe(pole(z[k], nowe));
      }
    });
    expect(st.people.some((q) => q.rodzina?.includes(' Bożenka ('))).toBe(true);
    expect(st.people.some((q, i) => q.story !== przed[i].story && q.story?.includes('Zbyszk'))).toBe(true);
    // karta pokazuje nowe imię
    const pawn = st.pawns.find((x) => st.people[x.person] === p);
    const snap = snapshot(st, P.world);
    const sp = [...snap.people, ...snap.lokatorzy].find((x) => x.pawn === pawn?.id);
    expect(sp && personCard(sp, st.tick)).toContain(`<h2>Bożenka ${nazwisko}</h2>`);
    // drugi raz to samo: bez zmian
    const po = structuredClone(st.people);
    zastosujZmiany(st, P.l, P.dane, { [wRodzinie]: BOZENKA, [wHistorii]: zbyszko });
    expect(st.people).toEqual(po);
    // przywrócenie: bez wpisu osoba wraca do imienia z generatora, stan jak przed zmianą (z kolejnością pól)
    zastosujZmiany(st, P.l, P.dane, { [wHistorii]: zbyszko });
    expect(p.first).toBe(przed[st.people.indexOf(p)].first);
    zastosujZmiany(st, P.l, P.dane, {});
    expect(st.people).toEqual(przed);
    expect(JSON.stringify(st.people)).toBe(JSON.stringify(przed));
  });

  it('wpis bez osoby w budynku to sierota; osoba z budynku spoza gry nie', () => {
    const st = nowaGra();
    const wGrze = new Set(st.people.flatMap((q) => (q.ref ? [q.ref] : [])));
    const pozaGra = P.l.siedziba.osoby.find((o) => !wGrze.has(o.id));
    if (!pozaGra) throw new Error('wszyscy z budynku są w grze');
    const przed = structuredClone(st.people);
    const brak = `${P.l.siedziba.budynek.klucz}/o9999`;
    const w = zastosujZmiany(st, P.l, P.dane, { [brak]: BOZENKA, [pozaGra.id]: BOZENKA, 'inny:1,2/o3': BOZENKA });
    // wpis z innego budynku pod tym adresem (inna siedziba, inny klucz) nie jest sierotą
    expect(w.sieroty).toEqual([brak]);
    // osoba spoza gry nie ma karty, ale jej nowe imię widać w historiach i rodzinie innych, jeśli o niej mówią
    st.people.forEach((q, i) => {
      expect(bezImion(q)).toEqual(bezImion(przed[i]));
    });
  });

  it('wpis z innym imieniem z generatora albo inną płcią niż osoba pod tym ref nikogo nie zmienia i zostaje', () => {
    // po aktualizacji tabel pod tym samym ref może stać ktoś inny
    const st = nowaGra();
    const [p1, p2, p3, p4] = st.people.filter((q) => q.ref);
    const z: Record<string, ZmianaImienia> = {
      [p1.ref as string]: { ...BOZENKA, f: p1.f, gen: 'Innaosoba' },
      [p2.ref as string]: { ...BOZENKA, f: !p2.f, gen: p2.first },
      [p3.ref as string]: { ...BOZENKA, f: p3.f, gen: p3.first },
      [p4.ref as string]: { imie: BOZENKA.imie, formy: BOZENKA.formy },
    };
    const przed = structuredClone(st.people);
    const w = zastosujZmiany(st, P.l, P.dane, z);
    // pominięte, ale nie sieroty: zostają w pamięci (po cofnięciu tabel znowu pasują)
    expect(w.sieroty).toEqual([]);
    expect(p1).toEqual(przed[st.people.indexOf(p1)]);
    expect(p2).toEqual(przed[st.people.indexOf(p2)]);
    expect(p3.first).toBe('Bożenka');
    expect(p4.first).toBe('Bożenka');
    // pominięte wpisy nie zmieniają też historii ani rodziny innych: jak same dwa dobre wpisy
    const dobre = nowaGra();
    zastosujZmiany(dobre, P.l, P.dane, {
      [p3.ref as string]: z[p3.ref as string],
      [p4.ref as string]: z[p4.ref as string],
    });
    expect(st.people).toEqual(dobre.people);
  });

  it('osoba z zapisu gry z nadanym imieniem zostaje przy nim, gdy generator ma pod jej ref kogoś innego', () => {
    const st = nowaGra();
    const p = st.people.find((q) => q.ref) as Person;
    // zapis sprzed aktualizacji tabel: ta osoba miała z generatora imię „Halinka”, gracz nadał jej „Bożenka”
    const z = { ...BOZENKA, f: p.f, gen: 'Halinka' };
    p.name = `Bożenka${p.name.slice(p.first.length)}`;
    p.first = 'Bożenka';
    const przed = structuredClone(p);
    expect(zastosujZmiany(st, P.l, P.dane, { [p.ref as string]: z })).toEqual({ sieroty: [] });
    expect(p).toEqual(przed);
  });

  it('imieZGeneratora: z wpisu tej osoby, z budynku (ta sama płeć i wiek), bez danych z pamięci gry albo obecne', () => {
    const p = nowaGra().people.find((q) => q.ref) as Person;
    const zmieniona = { ...p, first: 'Bożenka' };
    const z = { ...BOZENKA, f: p.f, gen: 'Halinka' };
    expect(imieZGeneratora(p, P.l, undefined)).toBe(p.first);
    expect(imieZGeneratora(zmieniona, P.l, z)).toBe('Halinka');
    expect(dotyczy(z, p)).toBe(false);
    expect(imieZGeneratora(p, P.l, z)).toBe(p.first);
    // stary wpis tej osoby (bez gen i bez płci): imię z generatora nieznane
    expect(imieZGeneratora(zmieniona, P.l, { imie: BOZENKA.imie, formy: BOZENKA.formy })).toBeUndefined();
    // stary zapis bez nazwaGen: generator pod tym ref z innym wiekiem to ktoś inny
    expect(imieZGeneratora({ ...p, age: p.age + 1, nazwaGen: undefined }, P.l, undefined)).toBeUndefined();
    expect(imieZGeneratora(zmieniona, null, undefined, p.first)).toBe(p.first);
    expect(imieZGeneratora(p, null, undefined)).toBe(p.first);
  });

  it('imieZGeneratora: po aktualizacji tabel imię z nazwaGen zapisu, nie od nowej osoby generatora pod tym ref', () => {
    const p = nowaGra().people.find((q) => q.ref && q.nazwaGen) as Person;
    const nazwisko = p.name.slice(p.first.length + 1);
    // zapis z gry sprzed aktualizacji: generator dał wtedy pod tym ref „Zofię”, dziś (ta sama płeć i wiek) kogoś innego
    const stary = { ...p, first: 'Zofia', name: `Zofia ${nazwisko}`, nazwaGen: `Zofia ${nazwisko}` };
    expect(imieZGeneratora(stary, P.l, undefined)).toBe('Zofia');
    // ta sama osoba po zmianie imienia w tej grze: dalej imię z nazwaGen
    expect(imieZGeneratora({ ...stary, first: 'Bożenka', name: `Bożenka ${nazwisko}` }, P.l, undefined)).toBe('Zofia');
    // nazwaGen bez nazwiska z zapisu: nieznane
    expect(imieZGeneratora({ ...stary, nazwaGen: 'Zofia Inna' }, P.l, undefined)).toBeUndefined();
    // zgodne nazwaGen: imię z generatora jak dotąd
    expect(imieZGeneratora(p, P.l, undefined)).toBe(p.first);
  });

  it('osoba z generatora pamięta imię i nazwisko z generatora (nazwaGen), także po zmianie imienia', () => {
    const st = nowaGra();
    const zRef = st.people.filter((q) => q.ref);
    expect(zRef.length).toBeGreaterThan(0);
    for (const q of zRef) expect(q.nazwaGen).toBe(q.name);
    const p = zRef[0];
    const nazwa = p.name;
    zastosujZmiany(st, P.l, P.dane, { [p.ref as string]: { ...BOZENKA, f: p.f } });
    expect(p.first).toBe('Bożenka');
    expect(p.nazwaGen).toBe(nazwa);
  });

  it('wczytana gra bez nowych zmian zostaje bajt w bajt, choć generator dałby dziś inne teksty (spec §9)', () => {
    const st = nowaGra();
    const [p1, p2] = st.people.filter((q) => q.ref);
    // zapis sprzed aktualizacji szablonów: inne historie i rodzina niż z dzisiejszego generatora
    p1.story = 'Historia ze starego szablonu.';
    p2.rodzina = 'syn Jan (40)';
    const przed = JSON.stringify(st.people);
    expect(zastosujZmiany(st, P.l, P.dane, {})).toEqual({ sieroty: [] });
    expect(JSON.stringify(st.people)).toBe(przed);
    // z wpisem, który zapis już pokazuje: też bez zmian
    const z = { [p1.ref as string]: { ...BOZENKA, f: p1.f, gen: p1.first } };
    p1.name = `Bożenka${p1.name.slice(p1.first.length)}`;
    p1.first = 'Bożenka';
    const zWpisem = JSON.stringify(st.people);
    zastosujZmiany(st, P.l, P.dane, z);
    expect(JSON.stringify(st.people)).toBe(zWpisem);
  });

  it('stary zapis bez nazwaGen albo inna osoba pod ref: tekst z zapisu zostaje, wpis zmienia tylko imię', () => {
    for (const psuj of [(q: Person) => delete q.nazwaGen, (q: Person) => (q.nazwaGen = 'Ktoś Inny')]) {
      const st = nowaGra();
      for (const q of st.people) if (q.ref) psuj(q);
      const p = st.people.find((q) => q.ref) as Person;
      p.story = 'Historia z zapisu.';
      const przed = structuredClone(st.people);
      const nazwisko = p.name.slice(p.first.length);
      zastosujZmiany(st, P.l, P.dane, { [p.ref as string]: { ...BOZENKA, f: p.f, gen: p.first } });
      expect(p.first).toBe('Bożenka');
      expect(p.name).toBe(`Bożenka${nazwisko}`);
      expect(p.story).toBe('Historia z zapisu.');
      // nikt inny się nie zmienia (historie i rodzina innych zostają z zapisu)
      st.people.forEach((q, i) => {
        if (q !== p) expect(q).toEqual(przed[i]);
      });
    }
  });

  it('bez danych mieszkańców zmienia tylko imię osoby z ref, bez sierot', () => {
    const people: Person[] = [
      {
        id: 's1',
        first: 'Wiesława',
        name: 'Wiesława Dąbrowska',
        f: true,
        prof: 'księgowa',
        skills: {},
        age: 71,
        traits: [],
        home: 0,
        assign: null,
        sick: false,
        dead: false,
        gone: false,
        ref: 'o102',
        story: 'Wiesława prowadziła księgi.',
        rodzina: 'syn Krzysztof (44)',
      },
      { ...structuredClone(nowaGra().people[0]), ref: undefined },
    ];
    const st = { people };
    const drugi = structuredClone(people[1]);
    expect(zastosujZmiany(st, null, null, { o102: BOZENKA, inny: BOZENKA })).toEqual({ sieroty: [] });
    expect(people[0].first).toBe('Bożenka');
    expect(people[0].name).toBe('Bożenka Dąbrowska');
    expect(people[0].story).toBe('Wiesława prowadziła księgi.');
    expect(people[1]).toEqual(drugi);
  });
});
