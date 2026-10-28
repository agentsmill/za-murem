/* Angielska wersja panelu „Wasz zarząd”, historii drużyny i gry z sąsiadami (zadanie 8 planu
   docs/superpowers/plans/2026-10-18-angielski.md): panel i blok sieci na atrapach z druzyna-panel.test.ts,
   druzyna.test.ts i siec.test.ts bez polskich słów poza imionami i nazwami miejsc, historie po angielsku z tego samego
   ziarna co polskie (te same losowania i te same zdania), polskie historie bez zmian, komunikaty serwera po angielsku
   po kodzie błędu i rysowanie od nowa po zmianie języka. */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TRAITS_EN } from '../../src/content/data.en.ts';
import { PROFS, TRAITS } from '../../src/content/data.ts';
import {
  historiaZ,
  historiaZEn,
  losujDruzyne,
  nazwaCechyEn,
  nazwaZawoduEn,
  type OsobaDruzyny,
  umiejetnosciStartowe,
} from '../../src/content/druzyna.ts';
import {
  FACH_EN,
  losujHistorieEn,
  SATYRA_EN,
  wybierzZdania,
  Z_CECHY_EN,
  zdaniaFachuEn,
  zlozHistorie,
} from '../../src/content/historia.en.ts';
import { FACH, HISTORIA_MAX, type Pokolenie, SATYRA, wypelnijPlec, Z_CECHY } from '../../src/content/historia.ts';
import { tr, tx, ustawJezyk } from '../../src/core/jezyk.ts';
import { mulberry } from '../../src/core/rng.ts';
import { slotySzablonu } from '../../src/mieszkancy/szablony.ts';
import { type ApiGry, komunikatBledu, komunikatEn, txBledu, type Wynik } from '../../src/net/api.ts';
import { GraSieciowa, PONOWNY_START } from '../../src/net/gra.ts';
import {
  type Ja,
  type KodBledu,
  POWODY_LOGOWANIA,
  type ZajetaKlatka,
  type ZajetaOdpowiedz,
  type ZajmijKlatke,
  zleHaslo,
  zleHasloEn,
  zlyNick,
  zlyNickEn,
} from '../../src/net/protokol.ts';
import { type ApiSieci, celeBezDomu, doZajecia, klatkaSiedziby, startSieci } from '../../src/net/siec.ts';
import { createSim, Sim } from '../../src/sim/sim.ts';
import {
  DRUZYNA_KEY,
  Druzyna,
  htmlPanelu,
  losujCalaOsobe,
  losujWszystkich,
  odswiezHistorie,
  podsumowanie,
  type StanDruzyny,
  stanDomyslny,
  ustawLiczbe,
  wczytajStan,
  wlaczWlasny,
  zapisStanu,
} from '../../src/ui/druzyna.ts';
import { htmlSieci, NAPIS_ZNACZNIKA } from '../../src/ui/siec.ts';
import type { Save } from '../../src/ui/zapis.ts';
import { kluczBudynku } from '../../src/world/klucze.ts';
import type { Loaded } from '../../src/world/load.ts';
import { toGeoT } from '../../src/world/mvt.ts';
import { buildWorld, LOAD_RADIUS, type World } from '../../src/world/world.ts';
import { ADDRESSES, decodedTiles } from './fixtures.ts';
import { polskieSlowa } from './po-angielsku.ts';

afterEach(() => ustawJezyk('pl'));

const ROOT = path.resolve(import.meta.dirname, '../..');

/** tekst, który gracz widzi albo słyszy: treść HTML i napisy z title, aria-label i placeholder */
const widoczne = (html: string): string =>
  [html, ...[...html.matchAll(/\b(?:title|aria-label|placeholder)="([^"]*)"/g)].map((m) => m[1])].join('\n');

/** polskie słowa w HTML (z napisami z atrybutów) poza dozwolonymi */
const polskie = (html: string, dozwolone: readonly string[] = []) => polskieSlowa(widoczne(html), dozwolone);

/** imiona i nazwiska drużyny: zostają polskie */
const imiona = (team: readonly { name: string }[]) => team.flatMap((o) => o.name.split(' '));

/** własna drużyna jak w druzyna-panel.test.ts, wczytana z pamięci przeglądarki w bieżącym języku (jak w grze) */
const wlasny = (n = 4, seed = 1): StanDruzyny =>
  wczytajStan(zapisStanu({ n, wlasny: true, team: losujDruzyne(mulberry(seed), n) }), mulberry(seed + 100));

/** wszystkie pary kawałków historii: polski i angielski */
function pary(): [string, string][] {
  const out: [string, string][] = [];
  const dodaj = (pl: readonly string[], en: readonly string[] | undefined) => {
    for (const [i, s] of pl.entries()) out.push([s, en?.[i] ?? '']);
  };
  for (const p of Object.keys(FACH))
    for (const g of Object.keys(FACH[p]) as Pokolenie[]) dodaj(FACH[p][g] ?? [], FACH_EN[p]?.[g]);
  for (const t of Object.keys(Z_CECHY)) dodaj(Z_CECHY[t], Z_CECHY_EN[t]);
  dodaj(SATYRA, SATYRA_EN);
  return out;
}

/** zdania historii: po kropce, wykrzykniku albo pytajniku (także w cudzysłowie) przed wielką literą */
const zdaniaPl = (h: string) => h.split(/(?<=[.!?”])\s+(?=[A-ZĄĆĘŁŃÓŚŹŻ„])/u);
const zdaniaEn = (h: string) => h.split(/(?<=[.!?”])\s+(?=[A-Z“])/u);

describe('panel „Wasz zarząd” po angielsku (src/ui/druzyna.ts)', () => {
  it('zwinięty i rozwinięty z adresu: angielskie napisy i liczba mnoga osób', () => {
    ustawJezyk('en');
    expect(podsumowanie(stanDomyslny())).toBe('4 people at your address');
    expect(podsumowanie({ ...stanDomyslny(), n: 1 })).toBe('1 person at your address');
    const zw = htmlPanelu(stanDomyslny(), { open: false, sel: -1 });
    expect(zw).toContain('Your board');
    expect(zw).toContain('Change');
    expect(polskie(zw)).toEqual([]);
    for (let n = 1; n <= 5; n++) {
      const h = htmlPanelu({ ...stanDomyslny(), n }, { open: true, sel: -1 });
      expect(h.match(/from the address<\/small>/g)).toHaveLength(n);
      expect(h).toContain('Create your own board');
      expect(h).toContain('How many');
      expect(polskie(h), String(n)).toEqual([]);
    }
  });

  it('własny zarząd i edytor każdej osoby: przyciski, zawody, cechy i historia po angielsku, imiona po polsku', () => {
    ustawJezyk('en');
    const s = wlasny(4, 9);
    for (let sel = -1; sel < 4; sel++) expect(polskie(htmlPanelu(s, { open: true, sel }), imiona(s.team))).toEqual([]);
    const o = s.team[2];
    const h = htmlPanelu(s, { open: true, sel: 2 });
    for (const t of [
      'Reroll everyone',
      'Use people from the address',
      'Full name',
      'Profession',
      'Skills',
      ' left</span>',
      'Reroll traits',
      'Reroll story',
      'Reroll person',
      'Done',
    ])
      expect(h).toContain(t);
    expect(h.match(/<option /g)).toHaveLength(22);
    expect(h).toContain(`>${nazwaZawoduEn(o.prof)}</option>`);
    expect(h).toContain(`>${o.story}</textarea>`);
    expect(podsumowanie(s)).toBe(`your own: ${s.team.map((x) => x.name.split(' ')[0]).join(', ')}`);
  });

  it('każdy zawód w obu płciach i każda cecha bez polskich słów; zawód-żart mówi, ile punktów wyda', () => {
    ustawJezyk('en');
    const zespol = (o: OsobaDruzyny): StanDruzyny => ({ n: 1, wlasny: true, team: [o] });
    for (const p of PROFS)
      for (const f of [true, false]) {
        const dane = { f, age: p[3][0], prof: p[0], traits: ['gadula'] };
        const o: OsobaDruzyny = {
          ...dane,
          name: 'Halina Wróbel',
          skills: umiejetnosciStartowe(p[0]),
          story: historiaZEn(7, dane),
          ziarno: 7,
        };
        const h = htmlPanelu(zespol(o), { open: true, sel: 0 });
        expect(polskie(h, ['Halina', 'Wróbel']), `${p[0]} ${f}`).toEqual([]);
        expect(h).toContain(`<small>${nazwaZawoduEn(p[0])}, ${p[3][0]}</small>`);
      }
    const base: OsobaDruzyny = {
      name: 'Rafał Mazur',
      f: false,
      age: 41,
      prof: 'Hydraulik',
      skills: { cieplo: 3 },
      traits: [],
      story: '',
    };
    for (const t of Object.keys(TRAITS)) {
      const h = htmlPanelu(zespol({ ...base, traits: [t] }), { open: true, sel: 0 });
      expect(h).toContain(`title="${TRAITS_EN[t].desc}">${nazwaCechyEn(t)}</span>`);
      expect(polskie(h, ['Rafał', 'Mazur']), t).toEqual([]);
    }
    const kucharz = { ...base, prof: 'Kucharz', skills: { uprawa: 1 }, age: 30 };
    expect(htmlPanelu(zespol(kucharz), { open: true, sel: 0 })).toContain(
      'This profession can spend at most 3 of the 6 points.',
    );
    expect(htmlPanelu(zespol(base), { open: true, sel: 0 })).toContain(
      'Only the profession’s skills, 6 points in total at most.',
    );
  });

  it('losowanie po angielsku daje angielskie historie z ziarna, a historia gracza zostaje przy zmianie języka', () => {
    ustawJezyk('en');
    const rnd = mulberry(7);
    const s = wlasny(5, 7);
    for (let k = 0; k < 60; k++) {
      if (k % 10 === 0) losujWszystkich(s, rnd);
      else losujCalaOsobe(s, k % 5, rnd);
      for (const o of s.team) {
        expect(o.story).toBe(historiaZEn(o.ziarno as number, o));
        expect(polskieSlowa(o.story), o.story).toEqual([]);
      }
    }
    const t = stanDomyslny();
    wlaczWlasny(t, rnd);
    ustawLiczbe(t, 5, rnd);
    for (const o of t.team) expect(o.story).toBe(historiaZEn(o.ziarno as number, o));
    const gracza = t.team[1];
    gracza.story = 'Zbiera kapsle i nie oddaje.';
    delete gracza.ziarno;
    ustawJezyk('pl');
    for (const o of t.team) odswiezHistorie(o);
    for (const o of t.team) if (o.ziarno !== undefined) expect(o.story).toBe(historiaZ(o.ziarno, o));
    expect(gracza.story).toBe('Zbiera kapsle i nie oddaje.');
  });

  it('po polsku historie jak dotąd (historiaZ), a język tam i z powrotem przywraca tę samą polską historię', () => {
    const s = wlasny(5, 21);
    for (const o of s.team) expect(o.story).toBe(historiaZ(o.ziarno as number, o));
    const przed = s.team.map((o) => o.story);
    ustawJezyk('en');
    for (const o of s.team) odswiezHistorie(o);
    expect(s.team.map((o) => o.story)).not.toEqual(przed);
    // ta sama drużyna wczytana z pamięci po angielsku też ma angielskie historie
    const zPamieci = wczytajStan(zapisStanu({ ...s, team: losujDruzyne(mulberry(21), 5) }), mulberry(1));
    expect(zPamieci.team.map((o) => o.story)).toEqual(s.team.map((o) => o.story));
    ustawJezyk('pl');
    for (const o of s.team) odswiezHistorie(o);
    expect(s.team.map((o) => o.story)).toEqual(przed);
  });

  it('Druzyna.odswiez po zmianie języka: historie z ziarna od nowa w nowym języku i w pamięci, panel od nowa', () => {
    const pamiec = new Map<string, string>();
    const team = losujDruzyne(mulberry(3), 3);
    const pl = team.map((o) => o.story);
    team[2].story = 'Moja historia.';
    delete team[2].ziarno;
    pamiec.set(DRUZYNA_KEY, zapisStanu({ n: 3, wlasny: true, team }));
    const store = {
      getItem: (k: string) => pamiec.get(k) ?? null,
      setItem: (k: string, v: string) => pamiec.set(k, v),
    };
    const root = { innerHTML: '', addEventListener() {}, contains: () => false, querySelector: () => null };
    const g = globalThis as { document?: unknown };
    const byl = 'document' in g;
    const stary = g.document;
    g.document = { activeElement: null };
    try {
      ustawJezyk('en');
      const panel = new Druzyna(root as unknown as HTMLElement, { open: true, store });
      expect(root.innerHTML).toContain('Your board');
      expect(polskie(root.innerHTML, imiona(team))).toEqual([]);
      const wGrze = panel.opcje().team ?? [];
      expect(wGrze[0].story).toBe(historiaZEn(team[0].ziarno as number, team[0]));
      expect(wGrze[2].story).toBe('Moja historia.');
      ustawJezyk('pl');
      panel.odswiez();
      expect(root.innerHTML).toContain('Wasz zarząd');
      const zapis = JSON.parse(pamiec.get(DRUZYNA_KEY) ?? '{}') as StanDruzyny;
      expect(zapis.team.map((o) => o.story)).toEqual([pl[0], pl[1], 'Moja historia.']);
      ustawJezyk('en');
      panel.odswiez();
      const zapis2 = JSON.parse(pamiec.get(DRUZYNA_KEY) ?? '{}') as StanDruzyny;
      expect(zapis2.team[1].story).toBe(historiaZEn(team[1].ziarno as number, team[1]));
      expect(zapis2.team[2].story).toBe('Moja historia.');
      // zawód i cechy w pamięci dalej po polsku i kluczami (identyfikatory, nie napisy)
      expect(zapis2.team.map((o) => o.prof)).toEqual(team.map((o) => o.prof));
      expect(zapis2.team.map((o) => o.traits)).toEqual(team.map((o) => o.traits));
      expect(root.innerHTML).toContain('Your board');
    } finally {
      if (byl) g.document = stary;
      else delete g.document;
    }
  });
});

describe('historie drużyny po angielsku (src/content/historia.en.ts)', () => {
  it('listy jeden do jednego z polskimi: te same zawody, pokolenia w tej samej kolejności, cechy i liczba zdań', () => {
    expect(Object.keys(FACH_EN)).toEqual(Object.keys(FACH));
    for (const p of Object.keys(FACH)) {
      expect(Object.keys(FACH_EN[p]), p).toEqual(Object.keys(FACH[p]));
      for (const g of Object.keys(FACH[p]) as Pokolenie[])
        expect(FACH_EN[p][g]?.length, `${p} ${g}`).toBe(FACH[p][g]?.length);
    }
    expect(Object.keys(Z_CECHY_EN)).toEqual(Object.keys(Z_CECHY));
    for (const t of Object.keys(Z_CECHY)) expect(Z_CECHY_EN[t].length, t).toBe(Z_CECHY[t].length);
    expect(SATYRA_EN).toHaveLength(SATYRA.length);
  });

  it('kawałki: sloty płci, jedno zdanie, typografia bez pauz i prostych cudzysłowów, Wylogowanie tam, gdzie po polsku', () => {
    for (const [pl, en] of pary()) {
      expect(
        slotySzablonu(en).every((k) => k === 'g'),
        en,
      ).toBe(true);
      expect(en).toMatch(/^[A-Z{]/);
      expect(en).toMatch(/[.!?]$/);
      expect(en, en).not.toMatch(/[—–'"]/);
      for (const f of [true, false]) {
        const t = wypelnijPlec(en, f);
        expect(t).not.toMatch(/[{}|]/);
        expect(zdaniaEn(t), t).toHaveLength(1);
        expect(polskieSlowa(t), t).toEqual([]);
      }
      expect(/Great Logout/.test(en), en).toBe(/Wylogowani/.test(pl));
      expect(/2034/.test(en), en).toBe(/2034/.test(pl));
    }
  });

  it('zaimki z płci osoby: w historii kobiety nie ma he, him, his, a w historii mężczyzny she, her', () => {
    for (const [, en] of pary()) {
      const k = wypelnijPlec(en, true);
      const m = wypelnijPlec(en, false);
      expect(k, k).not.toMatch(/\b(he|him|his|himself)\b/i);
      expect(m, m).not.toMatch(/\b(she|her|hers|herself)\b/i);
    }
  });

  it('trzy najdłuższe angielskie zdania mieszczą się w HISTORIA_MAX: angielska nie traci zdania, które ma polska', () => {
    const dl = (xs: readonly string[]) =>
      Math.max(...xs.flatMap((s) => [true, false].map((f) => wypelnijPlec(s, f).length)));
    const fach = Object.values(FACH_EN).flatMap((t) => Object.values(t).flatMap((x) => [...(x ?? [])]));
    expect(dl(fach) + dl(Object.values(Z_CECHY_EN).flat()) + dl(SATYRA_EN) + 2).toBeLessThanOrEqual(HISTORIA_MAX);
  });

  it('każdy zawód, obie płcie, kilka wieków i cech, wiele ziaren: ta sama historia co po polsku, tylko po angielsku', () => {
    const cechy = [[], ...Object.keys(TRAITS).map((t) => [t]), ['twardy', 'klotliwy'], ['gadula', 'leniwy']];
    let n = 0;
    for (const p of PROFS) {
      const [a, b] = p[3];
      const wieki = [...new Set([a, Math.round((a + b) / 2), b, 35, 36, 55, 56])].filter((x) => x >= a && x <= b);
      for (const f of [true, false])
        for (const age of wieki)
          for (const traits of cechy)
            for (let k = 0; k < 3; k++) {
              const o = { f, age, prof: p[0], traits };
              const z = (n++ * 2654435761) | 0;
              const en = historiaZEn(z, o);
              const pl = historiaZ(z, o);
              expect(en.length).toBeGreaterThan(0);
              expect(en.length).toBeLessThanOrEqual(HISTORIA_MAX);
              expect(historiaZEn(z, o)).toBe(en);
              expect(losujHistorieEn(mulberry(z), o)).toBe(en);
              expect(polskieSlowa(en), en).toEqual([]);
              // te same losowania: polska z tego samego wyboru zdań to dokładnie historiaZ, angielska te same zdania
              const wybor = wybierzZdania(mulberry(z), o);
              expect(zlozHistorie(wybor, o, 'pl')).toBe(pl);
              expect(zlozHistorie(wybor, o, 'en')).toBe(en);
              expect(zdaniaEn(en), `${pl}\n${en}`).toHaveLength(zdaniaPl(pl).length);
              expect(en.startsWith(wypelnijPlec(zdaniaFachuEn(p[0], age)[(wybor[0] as { i: number }).i], f))).toBe(
                true,
              );
            }
    }
    expect(n).toBeGreaterThan(5000);
  });
});

describe('komunikaty serwera i powody logowania po angielsku (src/net/api.ts, src/net/protokol.ts)', () => {
  it('każde zdanie z server/ i każdy kod błędu po angielsku, nieznany kod tak, jak przyszedł', () => {
    const zrodla = ['server/app.ts', 'server/http.ts']
      .map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8'))
      .join('\n');
    const bledy: [string, string][] = [];
    for (const m of zrodla.matchAll(/new BladHttp\(\s*\d+,\s*'(\w+)',\s*(['`])([\s\S]*?)\2/g))
      bledy.push([m[1], m[3].replace(/\$\{[^}]*\}/g, '60')]);
    for (const m of zrodla.matchAll(/zaDuzo\(\s*\w+,\s*'([^']+)'/g)) bledy.push(['za_duzo_prob', m[1]]);
    expect(bledy.length).toBeGreaterThan(25);
    for (const [blad, komunikat] of bledy) {
      const en = komunikatEn({ blad, komunikat });
      expect(polskieSlowa(en), `${blad}: ${komunikat} → ${en}`).toEqual([]);
      // po polsku komunikat zostaje taki, jak przyszedł
      expect(komunikatBledu({ blad, komunikat })).toBe(komunikat);
    }
    const protokol = fs.readFileSync(path.join(ROOT, 'src/net/protokol.ts'), 'utf8');
    const kody = [...(/export type KodBledu =([^;]+);/.exec(protokol)?.[1] ?? '').matchAll(/'(\w+)'/g)].map(
      (m) => m[1],
    );
    expect(kody.length).toBeGreaterThan(20);
    for (const k of kody)
      expect(polskieSlowa(komunikatEn({ blad: k, komunikat: 'Zdanie serwera, którego klient nie zna.' })), k).toEqual(
        [],
      );
    expect(komunikatEn({ blad: 'nowy_kod', komunikat: 'Nowe zdanie serwera.' })).toBe('Nowe zdanie serwera.');
    expect(komunikatEn({ blad: 'nowy_kod', komunikat: 'Coś poszło nie tak.' })).toBe('Something went wrong.');
  });

  it('zdania z liczbą i limit prób z czasem z Retry-After', () => {
    expect(komunikatEn({ blad: 'za_daleko', komunikat: 'Klatka jest dalej niż 600 m od waszej siedziby.' })).toBe(
      'That stairwell is more than 600 m from your HQ.',
    );
    expect(komunikatEn({ blad: 'limit_klatek', komunikat: 'Drużyna może mieć najwyżej 60 klatek.' })).toBe(
      'A team can hold at most 60 stairwells.',
    );
    const proby = { blad: 'za_duzo_prob', komunikat: 'Za dużo nieudanych prób. Spróbujcie za kilka minut.' };
    expect(komunikatEn({ ...proby, ponowZa: 600 })).toBe('Too many failed attempts. Try again in 10 min.');
    expect(komunikatEn(proby)).toBe('Too many failed attempts. Try again later.');
    expect(txBledu({ blad: 'zle_logowanie', komunikat: 'Zły nick albo hasło.' })).toEqual(
      tx('Zły nick albo hasło.', 'Wrong username or password.'),
    );
    ustawJezyk('en');
    expect(komunikatBledu({ blad: 'brak_sesji', komunikat: 'Zalogujcie się.' })).toBe('Log in first.');
  });

  it('powody złego nicku i hasła: po polsku jak dotąd, po angielsku z tej samej pary, serwer po angielsku po zdaniu', () => {
    expect(zlyNick(5)).toBe('Podajcie nick.');
    expect(zlyNick('ab')).toBe('Nick ma od 3 do 24 znaków.');
    expect(zlyNick('zły nick!')).toBe('W nicku mogą być litery, cyfry, kropka, podkreślnik i myślnik.');
    expect(zlyNick('Sąsiad_7')).toBeNull();
    expect(zleHaslo(null)).toBe('Podajcie hasło.');
    expect(zleHaslo('krótkie')).toBe('Hasło ma co najmniej 8 znaków.');
    expect(zleHaslo('x'.repeat(201))).toBe('Hasło ma najwyżej 200 znaków.');
    expect(zleHaslo('dobre-haslo-1')).toBeNull();
    for (const x of [5, 'ab', 'zły nick!', 'Sąsiad_7']) {
      expect(zlyNickEn(x) === null, String(x)).toBe(zlyNick(x) === null);
      expect(polskieSlowa(zlyNickEn(x) ?? '')).toEqual([]);
    }
    for (const x of [null, 'krótkie', 'x'.repeat(201), 'dobre-haslo-1']) {
      expect(zleHasloEn(x) === null).toBe(zleHaslo(x) === null);
      expect(polskieSlowa(zleHasloEn(x) ?? '')).toEqual([]);
    }
    for (const p of Object.values(POWODY_LOGOWANIA))
      for (const blad of ['zly_nick', 'zle_haslo'] as KodBledu[])
        expect(komunikatEn({ blad, komunikat: p.pl })).toBe(p.en);
    expect(komunikatEn({ blad: 'zle_haslo', komunikat: 'Hasło nie może być nickiem.' })).toBe(
      'Your password can’t be your username.',
    );
  });
});

/* gra z sąsiadami: osiedle i atrapy jak w siec.test.ts */
const adr = ADDRESSES.find((a) => a.key === 'lanciego') as (typeof ADDRESSES)[number];
const geo = toGeoT(decodedTiles(adr), adr.lat, adr.lon, LOAD_RADIUS);
const C = geo.c;
const zbuduj = (bez: string[] | null) => buildWorld(geo, { seed: 1, ...(bez?.length ? { bezSiedziby: bez } : {}) });
const w0 = zbuduj([]);
const k0 = klatkaSiedziby(w0, C) as NonNullable<ReturnType<typeof klatkaSiedziby>>;
const dane: Loaded = { geo, name: 'Ursynów', addr: 'Lanciego 10G, Warszawa', street: 'Lanciego', src: 'mvt' };
const MIEJSCA = ['Ursynów', 'Lanciego'];

const ok = <T>(d: T, status = 200): Wynik<T> => ({ ok: true, status, dane: d });
const zle = <T>(status: number, blad: KodBledu, komunikat: string, ponowZa?: number): Wynik<T> => ({
  ok: false,
  status,
  blad,
  komunikat,
  ...(ponowZa ? { ponowZa } : {}),
});
const obca = (k: ZajmijKlatke): ZajetaKlatka => ({ ...k, moja: false });
const chwila = () => new Promise((r) => setTimeout(r, 0));
const ja = (nick: string): Ja => ({
  nick,
  utworzone: 1,
  klatki: 0,
  zapis: false,
  anonimowe: false,
  znak: nick,
  kod: false,
});

/** udawany serwer gry: polskie komunikaty jak z server/app.ts */
function atrapaApi(
  o: {
    nick?: string | null;
    zajeteNaStarcie?: ZajetaKlatka[];
    zajmij?: (k: ZajmijKlatke) => Wynik<ZajetaOdpowiedz>;
    zaloguj?: () => Wynik<Ja>;
    bezSieci?: boolean;
  } = {},
): ApiGry {
  let nick = o.nick === undefined ? 'Sasiad' : o.nick;
  return {
    serwerDostepny: async () => true,
    ja: async () => (nick ? ok(ja(nick)) : zle(401, 'brak_sesji', 'Zalogujcie się.')),
    pobierzZapis: async () => zle(404, 'brak_zapisu', 'Nie ma zapisu w chmurze.'),
    zwolnijWszystkie: async () => (o.bezSieci ? zle(0, 'siec', 'Brak połączenia z serwerem gry.') : ok(undefined, 204)),
    zajete: async () => ok({ klatki: o.zajeteNaStarcie ?? [] }),
    zajmij: async (k: ZajmijKlatke) => (o.zajmij ? o.zajmij(k) : ok({ klatka: { ...k, moja: true } }, 201)),
    zaloguj: async () => o.zaloguj?.() ?? zle(401, 'zle_logowanie', 'Zły nick albo hasło.'),
    zaloz: async (n: string) => {
      nick = n;
      return ok(ja(n), 201);
    },
    wyloguj: async () => {
      nick = null;
      return ok(undefined, 204);
    },
    wyslijZapis: async () => ok({ wersja: 1, zmieniony: 1, rozmiar: 1 }),
    usunZapis: async () => ok(undefined, 204),
  } as unknown as ApiGry;
}

const opcje = (api: ApiGry, o: { say?: string[]; status?: string[]; sesja?: Map<string, string> } = {}) => ({
  el: null,
  warstwa: null,
  wlaczona: true,
  touch: false,
  say: (t: string) => void o.say?.push(t),
  status: (t: string) => void o.status?.push(t),
  screenOf: (x: number, y: number): [number, number] => [x, y],
  onChmura: () => {},
  api,
  sesja: {
    getItem: (k: string) => o.sesja?.get(k) ?? null,
    setItem: (k: string, v: string) => void o.sesja?.set(k, v),
    removeItem: (k: string) => void o.sesja?.delete(k),
  },
  przeladuj: () => {},
});

/** ktoś z zarządu w drzwiach siedziby świata w */
function naDrzwiach(sim: Sim, w: World) {
  const door = w.buildings[w.hq].entrances[0].out;
  const p = sim.st.pawns.find((q) => q.kind === 'core') as (typeof sim.st.pawns)[number];
  p.x = (door % w.size) + 0.5;
  p.y = Math.floor(door / w.size) + 0.5;
}

/** blok #siec bez przeglądarki: nowy HTML tworzy nowe, puste pola nicku i hasła (jak prawdziwy DOM) */
function atrapaBloku() {
  let html = '';
  let pola: Record<string, { value: string }> = {};
  const sluchacze: Record<string, (e: unknown) => void> = {};
  const el = {
    hidden: true,
    get innerHTML() {
      return html;
    },
    set innerHTML(v: string) {
      html = v;
      pola = { '#scNick': { value: '' }, '#scHaslo': { value: '' } };
    },
    querySelector: (s: string) => (html.includes(`id="${s.slice(1)}"`) ? (pola[s] ?? null) : null),
    addEventListener: (t: string, f: (e: unknown) => void) => {
      sluchacze[t] = f;
    },
  };
  return {
    el,
    pole: (s: string) => pola[s],
    klik: (siec: string) => sluchacze.click?.({ target: { closest: () => ({ dataset: { siec } }) } }),
  };
}

describe('gra z sąsiadami po angielsku (src/ui/siec.ts, src/net/gra.ts, src/net/siec.ts)', () => {
  it('blok na karcie startowej i znaczniki: angielskie napisy, nick i nazwy miejsc po polsku, komunikat jako Tx', () => {
    ustawJezyk('en');
    const wyl = htmlSieci({ stan: 'wylogowani' });
    expect(wyl).toContain('id="scNick"');
    expect(wyl).toContain('a forgotten password means a lost account');
    expect(polskie(wyl)).toEqual([]);
    const zal = htmlSieci({ stan: 'zalogowani', nick: 'Sąsiad', chmura: 'Ursynów, day 2, 06:40' });
    expect(zal).toContain('Playing as <b>Sąsiad</b>');
    expect(zal).toContain('Continue from the cloud: Ursynów, day 2, 06:40');
    expect(polskie(zal, ['Sąsiad', ...MIEJSCA])).toEqual([]);
    const kom = tx('Wylogowani. Gra działa dalej bez sieci.', 'Logged out. The game carries on offline.');
    expect(htmlSieci({ stan: 'wylogowani', komunikat: kom })).toContain('Logged out. The game carries on offline.');
    expect(Object.values(NAPIS_ZNACZNIKA).map((t) => tr(t))).toEqual(['taken', 'your stairwell', 'free stairwell']);
    ustawJezyk('pl');
    expect(htmlSieci({ stan: 'wylogowani', komunikat: kom })).toContain('Wylogowani. Gra działa dalej bez sieci.');
    expect(Object.values(NAPIS_ZNACZNIKA).map((t) => tr(t))).toEqual(['zajęte', 'wasza klatka', 'wolna klatka']);
  });

  it('logowanie i konto po angielsku; przerysuj po zmianie języka pokazuje to samo w nowym, z wpisanym nickiem i hasłem', async () => {
    ustawJezyk('en');
    const blok = atrapaBloku();
    const api = atrapaApi({
      nick: null,
      zaloguj: () => zle(429, 'za_duzo_prob', 'Za dużo nieudanych prób. Spróbujcie za kilka minut.', 600),
    });
    const g = new GraSieciowa({ ...opcje(api), el: blok.el as unknown as HTMLElement });
    await g.init();
    expect(blok.el.hidden).toBe(false);
    expect(blok.el.innerHTML).toContain('Log in');
    expect(polskie(blok.el.innerHTML)).toEqual([]);
    blok.pole('#scNick').value = 'Sąsiad';
    blok.pole('#scHaslo').value = 'falowiec-1971';
    blok.klik('zaloguj');
    await chwila();
    await chwila();
    expect(blok.el.innerHTML).toContain('Too many failed attempts. Try again in 10 min.');
    expect(polskie(blok.el.innerHTML)).toEqual([]);
    expect(blok.pole('#scNick').value).toBe('Sąsiad');
    // gracz wpisuje hasło jeszcze raz i zmienia język: blok po polsku, komunikat taki, jaki był, pola z wpisanym
    blok.pole('#scHaslo').value = 'falowiec-1971';
    ustawJezyk('pl');
    g.przerysuj();
    expect(blok.el.innerHTML).toContain('Za dużo nieudanych prób. Spróbujcie za kilka minut. Spróbujcie za 10 min.');
    expect(blok.el.innerHTML).toContain('Zaloguj');
    expect(blok.pole('#scNick').value).toBe('Sąsiad');
    expect(blok.pole('#scHaslo').value).toBe('falowiec-1971');
    ustawJezyk('en');
    g.przerysuj();
    expect(blok.el.innerHTML).toContain('Too many failed attempts. Try again in 10 min.');
    blok.klik('zaloz');
    await chwila();
    await chwila();
    expect(blok.el.innerHTML).toContain('Account created.');
    expect(blok.el.innerHTML).toContain('Playing as <b>Sąsiad</b>');
    expect(polskie(blok.el.innerHTML, ['Sąsiad'])).toEqual([]);
    blok.klik('wyloguj');
    await chwila();
    await chwila();
    expect(blok.el.innerHTML).toContain('Logged out. The game carries on offline.');
    expect(polskie(blok.el.innerHTML)).toEqual([]);
  });

  it('start bez domu po angielsku: napis pod formularzem, komunikat startu, menu, podpowiedzi i cele', async () => {
    ustawJezyk('en');
    const say: string[] = [];
    const status: string[] = [];
    const g = new GraSieciowa(opcje(atrapaApi({ zajeteNaStarcie: [obca(doZajecia(k0))] }), { say, status }));
    await g.init();
    const w = await g.przygotuj(dane, zbuduj);
    expect(status).toEqual(['Checking with the game server whether your stairwell is free…']);
    const start = g.komunikatStartu() ?? '';
    expect(start).toMatch(/already taken your stairwell/);
    expect(polskieSlowa(start)).toEqual([]);
    const st = createSim(w, 1);
    g.poStarcie(st, w);
    const sim = new Sim(w, st);
    // utracona klatka pod adresem: zajęta przez inną drużynę
    const stary = w.buildings.find((b) => kluczBudynku(b) === k0.budynek);
    const [cudza] = g.menu(sim, stary?.entrances[0]?.tile ?? -1);
    expect(cudza?.label).toBe('Stairwell taken by another team');
    expect(g.obsluz(cudza)).toBe(true);
    expect(say.at(-1)).toBe('Another team has already taken this stairwell.');
    const [dom] = g.menu(sim, w.buildings[w.hq].entrances[0].tile);
    expect(dom.label).toBe('Claim stairwell (your new home)');
    g.obsluz(dom);
    await chwila();
    expect(say.at(-1)).toBe('The stairwell is yours. Other teams now see it as taken.');
    for (const touch of [true, false])
      for (const z of [true, false])
        for (const c of celeBezDomu(z, touch)) expect(polskieSlowa(`${c.text} ${c.how}`), c.how).toEqual([]);
    expect(celeBezDomu(false, false)[1].how).toContain('“free stairwell”');
  });

  it('błąd serwera przy zajmowaniu i start bez sieci: komunikat po kodzie i dopisek po angielsku', async () => {
    ustawJezyk('en');
    const say: string[] = [];
    const daleko = atrapaApi({
      zajeteNaStarcie: [obca(doZajecia(k0))],
      zajmij: () => zle(422, 'za_daleko', 'Klatka jest dalej niż 600 m od waszej siedziby.'),
    });
    const g = new GraSieciowa(opcje(daleko, { say }));
    await g.init();
    const w = await g.przygotuj(dane, zbuduj);
    const st = createSim(w, 1);
    g.poStarcie(st, w);
    const sim = new Sim(w, st);
    naDrzwiach(sim, w);
    g.klatka(sim, 10_000, false);
    await chwila();
    expect(say.at(-1)).toBe(
      'That stairwell is more than 600 m from your HQ. The game carries on without claiming the stairwell.',
    );
    // bez sieci przy starcie: zdanie klienta po angielsku i „gramy bez sieci”
    const offline = new GraSieciowa(opcje(atrapaApi({ bezSieci: true })));
    await offline.init();
    await offline.przygotuj(dane, zbuduj);
    expect(offline.komunikatStartu()).toBe('No connection to the game server. Playing offline.');
    const sieci: ApiSieci = {
      zwolnijWszystkie: async () => zle(0, 'siec', 'Brak połączenia z serwerem gry.'),
      zajete: async () => ok({ klatki: [] }),
      zajmij: async (k) => ok({ klatka: { ...k, moja: true } }, 201),
    };
    expect(await startSieci(sieci, zbuduj, C)).toEqual({ ok: false, komunikat: 'No connection to the game server.' });
    ustawJezyk('pl');
    expect(await startSieci(sieci, zbuduj, C)).toEqual({ ok: false, komunikat: 'Brak połączenia z serwerem gry.' });
  });

  it('ponowny start po przegranym wyścigu i zapis z innego konta: komunikat startu w bieżącym języku', async () => {
    const sesja = new Map<string, string>();
    sesja.set(PONOWNY_START, JSON.stringify({ data: dane, stan: { zajete: [k0.budynek], dom: false } }));
    const g = new GraSieciowa(opcje(atrapaApi(), { sesja }));
    await g.init();
    const p = g.ponownyStart();
    await g.przygotuj(p?.data as Loaded, zbuduj);
    ustawJezyk('en');
    expect(g.komunikatStartu()).toBe(
      'Another team got there first. Your HQ is now the next free stairwell: get there before dark.',
    );
    ustawJezyk('pl');
    expect(g.komunikatStartu()).toMatch(/szybsza/);
    const inne = new GraSieciowa(opcje(atrapaApi()));
    await inne.init();
    await inne.przygotuj(dane, zbuduj, { siec: { zajete: [], dom: true, konto: 'Inny' } } as unknown as Save);
    ustawJezyk('en');
    expect(inne.komunikatStartu()).toBe('This save is from another account’s game, so it carries on offline.');
  });
});
