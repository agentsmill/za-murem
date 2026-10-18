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
  edytorImienia,
  IMIONA_KEY,
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

  it('forma z HTML albo pusta też jest błędem, z nazwą pola', () => {
    expect(zmianaZPol({ ...BOZENKA_FORMY, narz: '<b>Bożenką</b>' }, true)).toHaveProperty('pole', 'narz');
    expect(zmianaZPol({ ...BOZENKA_FORMY, dop: '' }, true)).toHaveProperty('pole', 'dop');
    expect(zmianaZPol({ mian: 'Bożenka' }, true)).toHaveProperty('pole', 'dop');
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
    const w = zastosujZmiany(st, P.l, P.dane, { 'hq:0,0/o9999': BOZENKA, [pozaGra.id]: BOZENKA });
    expect(w.sieroty).toEqual(['hq:0,0/o9999']);
    // osoba spoza gry nie ma karty, ale jej nowe imię widać w historiach i rodzinie innych, jeśli o niej mówią
    st.people.forEach((q, i) => {
      expect(bezImion(q)).toEqual(bezImion(przed[i]));
    });
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
