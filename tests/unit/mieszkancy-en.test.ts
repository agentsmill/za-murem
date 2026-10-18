/* Mieszkańcy z adresu po angielsku (src/mieszkancy/angielski.ts, szablony.en.ts, fachy.en.ts): angielskie bliźniaki
   szablonów, kierunki, krewni, fachy i dawne zawody, a na trzech demach z public/demo/ (tabele z public/data/mieszkancy/,
   atrapa `fetch` czyta pliki) historia, rodzina i zawód każdej osoby siedziby, porównane z polską stroną
   z src/sim/lokatorzy.ts. Polskie wyniki generatora pilnują złote skróty w mieszkancy-generuj.test.ts; tu dodatkowo,
   że zbieranie źródeł zdań nie zmienia polskich historii. */

import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { zawodEn } from '../../src/content/data.en.ts';
import { hashString } from '../../src/core/rng.ts';
import { dawniejEn, type LokatorEn, lokatorzyEn } from '../../src/mieszkancy/angielski.ts';
import { budynkiZCzlonkami } from '../../src/mieszkancy/budynki.ts';
import {
  DAWNE_ZAWODY_EN,
  dawnyZawodEn,
  FACHY_EN,
  fachEn,
  mieszkancyEn,
  ZAWODY_MIESZKANCOW_EN,
} from '../../src/mieszkancy/fachy.en.ts';
import { DAWNE_ZAWODY, FACHY } from '../../src/mieszkancy/fachy.ts';
import { budynkiObszaru, generujBudynek } from '../../src/mieszkancy/generuj.ts';
import { historieWyniku, type ZrodloZdania, zdaniaGospodarstwa } from '../../src/mieszkancy/historie.ts';
import { kronika, zbiorImion } from '../../src/mieszkancy/kronika.ts';
import { losDla } from '../../src/mieszkancy/los.ts';
import { odmien } from '../../src/mieszkancy/odmiana.ts';
import { oznaczGeo } from '../../src/mieszkancy/oznacz.ts';
import {
  DOKAD_EN,
  type KontekstEn,
  KREWNI_EN,
  rodzinaEn,
  SKAD_EN,
  SZABLONY_EN,
  slotyEn,
  wielkaEn,
  wypelnijEn,
  zPrzedimkiem,
} from '../../src/mieszkancy/szablony.en.ts';
import { KREWNI, type Krewny, SKAD, SZABLONY, type Szablon, slotySzablonu } from '../../src/mieszkancy/szablony.ts';
import type { Osoba, WynikBudynku } from '../../src/mieszkancy/typy.ts';
import { type DaneMieszkancow, wczytajDaneMieszkancow } from '../../src/mieszkancy/wczytaj.ts';
import { type LokatorzyGry, lokatorzyGry, type OsobaGry, osobaGry, osobyZeZmianami } from '../../src/sim/lokatorzy.ts';
import type { Geo } from '../../src/world/geo.ts';
import { buildWorld } from '../../src/world/world.ts';
import { POLSKIE, polskieSlowa } from './po-angielsku.ts';

const KORZEN = path.resolve(import.meta.dirname, '../..');
const PUBLIC = path.join(KORZEN, 'public');
const DEMA = ['przymorze', 'lanciego', 'zielonki'] as const;
type NazwaDema = (typeof DEMA)[number];
/** Miasta z kierunków wyjazdu zostają polskie (słowniczek). */
const MIASTA = ['Warszawa', 'Kraków', 'Wrocław', 'Łódź', 'Poznań', 'Gdańsk'];
/** Polski szablon zaczyna się od osoby głównej jako podmiotu (jak `PODMIOT` w historie.ts). */
const PODMIOT = /^\{o:mian\} (?!i )/;

/** Atrapa `fetch`: ścieżka względna to plik w public/, brak pliku to 404 (jak w lokatorzy.test.ts). */
const plikowy = (async (adr: string) => {
  const plik = path.join(PUBLIC, adr);
  if (!fs.existsSync(plik)) return new Response('brak', { status: 404 });
  return new Response(fs.readFileSync(plik));
}) as unknown as typeof fetch;

interface Demo {
  geo: Geo;
  dane: DaneMieszkancow;
  l: LokatorzyGry;
}
const dema = new Map<NazwaDema, Demo>();
const demo = (nazwa: NazwaDema): Demo => {
  const d = dema.get(nazwa);
  if (!d) throw new Error(`demo ${nazwa} nie wczytane`);
  return d;
};

beforeAll(async () => {
  for (const nazwa of DEMA) {
    const d = JSON.parse(fs.readFileSync(path.join(PUBLIC, `demo/${nazwa}.json`), 'utf8')) as {
      geo: Geo;
      addr: string;
      street?: string;
    };
    const dane = await wczytajDaneMieszkancow(d.geo.c[0], d.geo.c[1], plikowy);
    if (!dane) throw new Error(`brak danych mieszkańców dla ${nazwa}`);
    const geo = oznaczGeo(d.geo, budynkiZCzlonkami(d.geo, dane.gmina, dane.kraj));
    // ziarno jak w grze (main.ts): z adresu
    const world = buildWorld(geo, { seed: Number.parseInt(hashString(d.addr), 16) || 2051, street: d.street });
    const l = lokatorzyGry(world, geo, dane, { core: 4 });
    if (!l) throw new Error(`lokatorzyGry dało null dla ${nazwa}`);
    dema.set(nazwa, { geo, dane, l });
  }
});

// ---------------------------------------------------------------- pomoc

/** Polska osoba gry z lokatorzy.ts (historia z `Gospodarstwo.historia` jej domu). */
function polska(w: WynikBudynku, o: Osoba, historie?: ReadonlyMap<string, string[]>): OsobaGry {
  const dom = w.gospodarstwa.find((g) => g.czlonkowie.includes(o.id));
  return osobaGry(o, w, (dom && (historie ? historie.get(dom.id) : dom.historia)) ?? []);
}

/** Zdania historii: kropka kończy zdanie, gdy dalej stoi spacja, poza skrótem „ds.” z polskich zawodów („doradca
    ds. ESG”, w kawałkach jako „ds.·ESG”); nazwy miejsc dem nie mają kropek. */
const zdania = (t: string | undefined): string[] => (t ? t.replace(/\bds\. /g, 'ds.·').split(/(?<=\.) (?=\S)/) : []);

/** Liczby zdania (lata, wiek, numery w nazwach) po wycięciu napisów, które w obu językach są te same (imiona,
    nazwy miejsc). */
function liczby(t: string, wytnij: readonly string[]): string[] {
  let s = t;
  for (const d of [...wytnij].sort((a, b) => b.length - a.length)) if (d) s = s.replaceAll(d, ' ');
  return [...s.matchAll(/\d+/g)].map((m) => m[0]);
}

/** Imiona, nazwiska, nazwy miejsc z kroniki i miasta: to, co po angielsku zostaje polskie. */
function dozwolone(w: WynikBudynku, l: LokatorzyGry, inne: readonly string[] = []): string[] {
  const miejsca = l.kronika.flatMap((e) => (e.miejsce ? [e.miejsce] : []));
  return [...new Set([...w.osoby.flatMap((o) => [o.imie, o.nazwisko]), ...miejsca, ...MIASTA, ...inne])];
}

const KREWNY_PL = new Map(Object.entries(KREWNI).map(([k, f]) => [f.mian, k as Krewny]));

/** Linijka rodziny jako lista [krewny, imię, wiek]; polskie rzeczowniki zamienia na klucze `Krewny`. */
function krewniZLinii(linia: string, pl: boolean): [string, string, string][] {
  if (!linia) return [];
  return linia.split(', ').map((x) => {
    const m = /^(\S+) (.+) \((\d+)\)$/.exec(x);
    if (!m) throw new Error(`zła linijka rodziny: ${linia}`);
    const k = pl ? KREWNY_PL.get(m[1]) : (Object.entries(KREWNI_EN).find(([, v]) => v === m[1])?.[0] as Krewny);
    if (!k) throw new Error(`nieznany krewny w linijce: ${linia}`);
    return [k, m[2], m[3]];
  });
}

/** Porównanie osoby po polsku i po angielsku: te same zdania (liczba, kolejność, liczby w każdym), ta sama rodzina,
    zawód z tablic; angielski bez polskich słów poza `ok`. Zwraca listę błędów. */
function porownaj(pl: OsobaGry, en: LokatorEn | undefined, ok: readonly string[], kto: string): string[] {
  const bledy: string[] = [];
  if (!en) return [`${kto}: brak wpisu`];
  if ((pl.story === undefined) !== (en.story === undefined)) bledy.push(`${kto}: historia ${pl.story} / ${en.story}`);
  const zp = zdania(pl.story);
  const ze = zdania(en.story);
  if (zp.length !== ze.length)
    bledy.push(`${kto}: ${zp.length} zdań po polsku, ${ze.length} po angielsku: ${pl.story} / ${en.story}`);
  else
    zp.forEach((z, i) => {
      if (liczby(z, ok).join() !== liczby(ze[i], ok).join())
        bledy.push(`${kto}: liczby w zdaniu ${i}: ${z} / ${ze[i]}`);
      if (z.startsWith('Dawniej ') !== (i === 0 && /^(Once |An? .* before the fall)/.test(ze[i])))
        bledy.push(`${kto}: linijka o zawodzie: ${z} / ${ze[i]}`);
    });
  const kp = krewniZLinii(pl.rodzina, true);
  const ke = krewniZLinii(en.rodzina, false);
  if (JSON.stringify(kp) !== JSON.stringify(ke)) bledy.push(`${kto}: rodzina ${pl.rodzina} / ${en.rodzina}`);
  if (en.prof !== mieszkancyEn(pl.prof)) bledy.push(`${kto}: zawód ${pl.prof} → ${en.prof}`);
  const polskie = polskieSlowa(`${en.story ?? ''} ${en.rodzina} ${en.prof}`, ok);
  if (polskie.length) bledy.push(`${kto}: polskie słowa ${polskie.join(', ')} w: ${en.story} | ${en.rodzina}`);
  return bledy;
}

// ---------------------------------------------------------------- szablony

/** Dane, które ma polski szablon, gdy pasuje (warunki `pasuje` i `slotMa` w historie.ts), jako klucze `slotyEn`. */
function dostepne(s: Szablon): Set<string> {
  const pl = slotySzablonu(s.tekst);
  const d = new Set(['o', 'g', 'rok', 'wiek']);
  // `kim` bierze się z osoby powiązanej, para w stanie ma partnera
  if (pl.some((x) => x.startsWith('p:') || x === 'pg') || s.kim || s.para) {
    d.add('p');
    d.add('pg');
  }
  if (pl.some((x) => x.startsWith('k:')) || s.kim) d.add('k');
  for (const x of ['rodzina', 'dokad', 'skad', 'miejsce', 'fach']) if (pl.includes(x)) d.add(x);
  if (pl.includes('zawod') || s.zawod) d.add('zawod');
  return d;
}

describe('angielskie bliźniaki szablonów (szablony.en.ts)', () => {
  it('każdy szablon z szablony.ts ma bliźniaka, w tej samej kolejności, i nic ponad to', () => {
    expect(Object.keys(SZABLONY_EN)).toEqual(SZABLONY.map((s) => s.id));
  });

  it('bliźniak: jedno zdanie z kropką, bez pauz, bez „you” i bez pierwszej osoby', () => {
    for (const s of SZABLONY) {
      const en = SZABLONY_EN[s.id];
      expect(en, s.id).toMatch(/\.$/);
      expect(en.slice(0, -1), s.id).not.toMatch(/[.!?;]/);
      expect(en, s.id).not.toMatch(/[—–]| - /);
      expect(en, s.id).not.toMatch(/\b(you|your|yours|I|me|my)\b/i);
      expect(en, s.id).not.toMatch(/\b(floor|storey|flat (no|number)|No\.)\b/i);
    }
  });

  it('bliźniak bierze tylko dane, które ma polski szablon, i te same liczby (rok, wiek)', () => {
    for (const s of SZABLONY) {
      const en = slotyEn(SZABLONY_EN[s.id]);
      const pl = slotySzablonu(s.tekst);
      const d = dostepne(s);
      for (const slot of en) expect(d.has(slot), `${s.id}: {${slot}}`).toBe(true);
      for (const liczba of ['rok', 'wiek'])
        expect(en.filter((x) => x === liczba).length, `${s.id}: ${liczba}`).toBe(pl.filter((x) => x === liczba).length);
      // nazwa miejsca raz po polsku, raz po angielsku
      expect(en.filter((x) => x === 'miejsce').length, s.id).toBe(pl.filter((x) => x === 'miejsce').length);
    }
  });

  it('szablon z osobą główną jako podmiotem ma bliźniaka od imienia, które da się zastąpić zaimkiem', () => {
    const podmiot = SZABLONY.filter((s) => PODMIOT.test(s.tekst));
    expect(podmiot.length).toBeGreaterThan(50);
    for (const s of podmiot) expect(SZABLONY_EN[s.id].startsWith('{o} '), s.id).toBe(true);
  });

  it('każdy bliźniak dla obu płci, także z zaimkiem zamiast imienia, nie ma polskich słów ani slotów', () => {
    const marek = { imie: 'Marek', f: false };
    const halina = { imie: 'Halina', f: true };
    const ok = ['Marek', 'Halina', 'Kowalski', 'Apteka Pod Lipą'];
    let zdan = 0;
    for (const s of SZABLONY) {
      for (const glowna of [marek, halina]) {
        for (const powiazana of [marek, halina]) {
          const k: KontekstEn = {
            glowna,
            powiazana,
            krewny: KREWNI_EN.matka,
            rodzina: rodzinaEn('Kowalski'),
            rok: 2031,
            wiek: 40,
            dokad: DOKAD_EN['do Niemiec'],
            skad: SKAD_EN['do Niemiec'],
            miejsce: 'Apteka Pod Lipą',
            zawod: fachEn('ksiegowy'),
            fach: fachEn('zielarz'),
          };
          const en = SZABLONY_EN[s.id];
          const warianty = PODMIOT.test(s.tekst) ? [en, `{g:he|she}${en.slice(3)}`] : [en];
          for (const t of warianty) {
            const tekst = wielkaEn(wypelnijEn(t, k));
            expect(polskieSlowa(tekst, ok), `${s.id}: ${tekst}`).toEqual([]);
            expect(tekst, s.id).not.toMatch(/[{}]|undefined/);
            expect(tekst[0], s.id).toBe(tekst[0].toUpperCase());
            zdan++;
          }
        }
      }
    }
    expect(zdan).toBeGreaterThan(SZABLONY.length * 4);
  });

  it('wypełnianie: imiona bez odmiany, zaimki z płci, rodzina, kierunki, przedimki', () => {
    const k: KontekstEn = {
      glowna: { imie: 'Halina', f: true },
      powiazana: { imie: 'Marek', f: false },
      krewny: 'son',
      rodzina: rodzinaEn('Kowalski'),
      rok: 2031,
      wiek: 74,
      dokad: 'to Germany',
      skad: 'from Germany',
      zawod: 'ESG consultant',
      fach: 'herbalist',
    };
    expect(wypelnijEn('{o:s} {k} {p} went {dokad} in {rok}.', k)).toBe('Halina’s son Marek went to Germany in 2031.');
    expect(wypelnijEn('{g:he|she} and {pg:his|her} {wiek}', k)).toBe('she and his 74');
    expect(wielkaEn(wypelnijEn('{rodzina} came back {skad}.', k))).toBe('The Kowalski family came back from Germany.');
    expect(wypelnijEn('{o}: once {a:zawod}, now {a:fach}.', k)).toBe(
      'Halina: once an ESG consultant, now a herbalist.',
    );
    for (const zly of ['{x}', '{o:dop}', '{g:he}', '{rok', 'rok}', '{}'])
      expect(() => wypelnijEn(zly, k), zly).toThrow();
    expect(() => wypelnijEn('{miejsce}', k)).toThrow();
    expect(() => wypelnijEn('{p}', { glowna: k.glowna })).toThrow();
  });

  it('przedimek nieokreślony po wymowie: skróty po literach, e-, u-', () => {
    const przyklady: [string, string][] = [
      ['ESG consultant', 'an ESG consultant'],
      ['NFT creator', 'an NFT creator'],
      ['IT technician', 'an IT technician'],
      ['UX designer', 'a UX designer'],
      ['e-scooter courier', 'an e-scooter courier'],
      ['oil-cooled server minder', 'an oil-cooled server minder'],
      ['estate warden', 'an estate warden'],
      ['influencer', 'an influencer'],
      ['herbalist', 'a herbalist'],
      ['heat pump fitter', 'a heat pump fitter'],
      ['startup intern', 'a startup intern'],
      ['university lecturer', 'a university lecturer'],
      ['undertaker', 'an undertaker'],
    ];
    for (const [nazwa, oczekiwane] of przyklady) expect(zPrzedimkiem(nazwa)).toBe(oczekiwane);
  });
});

// ---------------------------------------------------------------- słowa

describe('kierunki, krewni, fachy i dawne zawody po angielsku', () => {
  it('każdy kierunek wyjazdu z silnika ma angielskie „dokąd” i „skąd”, miasta po polsku, kraje po angielsku', () => {
    const zrodlo = fs.readFileSync(path.join(KORZEN, 'src/mieszkancy/czas-dokad.ts'), 'utf8');
    const kierunki = [...zrodlo.matchAll(/'((?:do|na|za|w) [^']+)'/g)].map((m) => m[1]);
    expect(kierunki.length).toBeGreaterThan(15);
    for (const k of new Set([...kierunki, 'do krewnych', ...Object.keys(SKAD)])) {
      expect(DOKAD_EN[k], k).toMatch(/^(to |abroad$)/);
      expect(SKAD_EN[k], k).toMatch(/^from /);
      expect(polskieSlowa(`${DOKAD_EN[k]} ${SKAD_EN[k]}`, MIASTA), k).toEqual([]);
    }
    expect(DOKAD_EN['do Niemiec']).toBe('to Germany');
    expect(DOKAD_EN['do Krakowa']).toBe('to Kraków');
    expect(SKAD_EN['za granicę']).toBe('from abroad');
    expect(DOKAD_EN['na przedmieścia']).toBe('to the suburbs');
  });

  it('każdy krewny ma angielski rzeczownik', () => {
    expect(Object.keys(KREWNI_EN).sort()).toEqual(Object.keys(KREWNI).sort());
    for (const v of Object.values(KREWNI_EN)) expect(v).toMatch(/^[a-z]+$/);
  });

  it('każdy fach i każdy dawny zawód w obu formach płci ma angielską nazwę bez polskich słów', () => {
    expect(Object.keys(FACHY_EN).sort()).toEqual(FACHY.map((f) => f.id).sort());
    expect(Object.keys(DAWNE_ZAWODY_EN).sort()).toEqual(DAWNE_ZAWODY.map((z) => z.m).sort());
    const nazwy = [...FACHY.flatMap((f) => [f.m, f.k]), ...DAWNE_ZAWODY.flatMap((z) => [z.m, z.k])];
    for (const n of [...nazwy, 'dziecko', 'mieszkanka', 'mieszkaniec']) {
      const en = ZAWODY_MIESZKANCOW_EN[n];
      expect(en, n).toBeDefined();
      expect(en, n).toMatch(/^[a-zA-Z][a-zA-Z’ -]*$/);
      expect(en, n).toBe(en.trim());
      expect(polskieSlowa(en), n).toEqual([]);
      expect(mieszkancyEn(n), n).toBe(en);
    }
    for (const f of FACHY) expect(fachEn(f.id), f.id).toBe(ZAWODY_MIESZKANCOW_EN[f.m]);
    expect(fachEn('nieznany')).toBeUndefined();
    expect(mieszkancyEn('toString')).toBeUndefined();
    // nazwa w innej wielkości liter (nagłówek z wielkiej, wydarzenia z 0.3 małymi literami)
    expect(mieszkancyEn('Felczerka')).toBe('medic');
    expect(mieszkancyEn('doradczyni ds. esg')).toBe('ESG consultant');
    expect(zawodEn('Felczer')).toBe('Medic');
  });

  it('ta sama polska nazwa fachu i dawnego zawodu ma tę samą angielską', () => {
    const fachy = new Map(FACHY.flatMap((f) => [[f.m, FACHY_EN[f.id]] as const, [f.k, FACHY_EN[f.id]] as const]));
    let wspolne = 0;
    for (const z of DAWNE_ZAWODY) {
      const en = DAWNE_ZAWODY_EN[z.m];
      for (const [pl, i] of [
        [z.m, 0],
        [z.k, 1],
      ] as const) {
        const fach = fachy.get(pl);
        if (fach === undefined) continue;
        wspolne++;
        expect(typeof en === 'string' ? en : en[i], pl).toBe(fach);
      }
    }
    expect(wspolne).toBeGreaterThanOrEqual(10);
  });

  it('satyra zostaje satyrą, a angielski ma formy płci tylko tam, gdzie je ma', () => {
    expect(dawnyZawodEn('prompt engineerka')).toBe('prompt engineer');
    expect(dawnyZawodEn('doradczyni ds. ESG')).toBe('ESG consultant');
    expect(dawnyZawodEn('pośredniczka w handlu gruntami w metawersum')).toBe('metaverse estate agent');
    expect(dawnyZawodEn('listonosz')).toBe('postman');
    expect(dawnyZawodEn('listonoszka')).toBe('postwoman');
    expect(fachEn('szeptacz')).toBe('model whisperer');
    expect(fachEn('przetwory')).toBe('pickling pensioner');
  });

  it('zawodEn z data.en.ts tłumaczy fach z karty tak samo jak tablica mieszkańców', () => {
    for (const n of [...FACHY.flatMap((f) => [f.m, f.k]), 'dziecko', 'mieszkanka', 'mieszkaniec'])
      expect(zawodEn(n), n).toBe(ZAWODY_MIESZKANCOW_EN[n]);
  });

  it('linijka „Dawniej X, dziś Y.” po angielsku dla każdej pary zawodu i fachu', () => {
    for (const z of DAWNE_ZAWODY) {
      for (const f of FACHY) {
        const t = dawniejEn(dawnyZawodEn(z.k) ?? '', FACHY_EN[f.id]);
        expect(t, t).toMatch(/^(Once an? [^,]+, now an? [^,]+\.|An? [^,]+ before the fall and still one now\.)$/);
        expect(polskieSlowa(t), t).toEqual([]);
      }
    }
    expect(dawniejEn('ESG consultant', 'rations accountant')).toBe('Once an ESG consultant, now a rations accountant.');
    expect(dawniejEn('doctor', 'doctor')).toBe('A doctor before the fall and still one now.');
    expect(dawniejEn('electrician', 'electrician')).toBe('An electrician before the fall and still one now.');
  });
});

// ---------------------------------------------------------------- lokatorzyEn

describe('lokatorzyEn na demach', () => {
  it('zbieranie źródeł zdań nie zmienia polskich historii (te same co Gospodarstwo.historia)', () => {
    for (const nazwa of DEMA) {
      const { l, dane } = demo(nazwa);
      const zebrane = new Map<string, ZrodloZdania[]>();
      const z = historieWyniku(l.siedziba, l.kronika, dane.odmiana, zebrane);
      expect(z, nazwa).toEqual(historieWyniku(l.siedziba, l.kronika, dane.odmiana));
      const uzyte = new Map<string, number>();
      for (const h of l.siedziba.gospodarstwa) {
        expect(z.get(h.id), h.id).toEqual(h.historia ?? []);
        // te same szablony co w zdaniaGospodarstwa, po jednym źródle na zdanie
        const r = losDla('historie', l.siedziba.budynek.klucz, h.id);
        const ids = zdaniaGospodarstwa(h, l.siedziba, l.kronika, dane.odmiana, r, uzyte).map((x) => x.szablon);
        expect(
          zebrane.get(h.id)?.map((x) => x.szablon),
          h.id,
        ).toEqual(ids);
      }
    }
  });

  it('każda osoba siedziby ma angielską rodzinę i zawód, a historię tam, gdzie polska; te same zdania', () => {
    let historii = 0;
    for (const nazwa of DEMA) {
      const { l, dane } = demo(nazwa);
      const en = lokatorzyEn(l, dane, new Map());
      expect(en.size, nazwa).toBe(l.siedziba.osoby.length);
      const ok = dozwolone(l.siedziba, l);
      const bledy: string[] = [];
      for (const o of l.siedziba.osoby) {
        const pl = polska(l.siedziba, o);
        if (pl.story) historii++;
        bledy.push(...porownaj(pl, en.get(o.id), ok, `${nazwa} ${o.id}`));
      }
      expect(bledy, nazwa).toEqual([]);
    }
    expect(historii).toBeGreaterThan(100);
  });

  it('zarząd i lokatorzy parteru (osoby gry) mają wpisy z ich `ref`', () => {
    for (const nazwa of DEMA) {
      const { l, dane } = demo(nazwa);
      const en = lokatorzyEn(l, dane, new Map());
      for (const p of [...l.zarzad, ...l.lokatorzy.flatMap((m) => m.osoby)]) {
        const e = en.get(p.ref);
        expect(e, `${nazwa} ${p.ref}`).toBeDefined();
        expect(e?.prof, p.ref).toBe(mieszkancyEn(p.prof));
        expect(e?.story === undefined, p.ref).toBe(p.story === undefined);
      }
    }
  });

  it('te same dane dają ten sam angielski, a wejście zostaje nietknięte', () => {
    for (const nazwa of DEMA) {
      const { l, dane } = demo(nazwa);
      const przed = JSON.stringify(l);
      const imiona = new Map([[l.siedziba.osoby[0].id, 'Zbyszko']]);
      const a = lokatorzyEn(l, dane, imiona);
      const b = lokatorzyEn(l, dane, imiona);
      expect([...a], nazwa).toEqual([...b]);
      expect(JSON.stringify(l), nazwa).toBe(przed);
      expect([...imiona]).toEqual([[l.siedziba.osoby[0].id, 'Zbyszko']]);
    }
  });

  it('imię gracza wchodzi do angielskiej historii i do rodziny krewnych, a zdania zostają te same', () => {
    /** imię jako całe słowo */
    const slowo = (imie: string): RegExp => new RegExp(`(^|[^\\p{L}])${imie}(?![\\p{L}])`, 'u');
    let sprawdzone = 0;
    for (const nazwa of DEMA) {
      const { l, dane } = demo(nazwa);
      const w = l.siedziba;
      const bez = lokatorzyEn(l, dane, new Map());
      // osoba, której imię stoi w jej angielskiej historii i której imienia nie nosi nikt inny w budynku
      const o = w.osoby.find(
        (x) => slowo(x.imie).test(bez.get(x.id)?.story ?? '') && w.osoby.filter((y) => y.imie === x.imie).length === 1,
      );
      if (!o) continue;
      const nowe = o.plec === 'K' ? 'Jagienka' : 'Zbyszko';
      const zmiana = { imie: nowe, formy: odmien(nowe, o.plec, dane.odmiana.tabela, dane.odmiana.koncowki).formy };
      const en = lokatorzyEn(l, dane, new Map([[o.id, nowe]]));
      const domownicy = w.gospodarstwa.find((g) => g.czlonkowie.includes(o.id))?.czlonkowie ?? [];
      const pl = osobyZeZmianami(
        l,
        dane,
        { [o.id]: zmiana },
        w.osoby.map((x) => x.id),
      );
      const ok = dozwolone(w, l, [nowe]);
      for (const id of domownicy) {
        const e = en.get(id);
        expect(slowo(o.imie).test(e?.story ?? ''), `${nazwa} ${id}: ${e?.story}`).toBe(false);
        if (slowo(o.imie).test(bez.get(id)?.story ?? '')) expect(e?.story, id).toMatch(slowo(nowe));
        const p = pl.get(id);
        if (p) expect(porownaj(p, e, ok, `${nazwa} ${id}`), id).toEqual([]);
      }
      // krewni widzą nowe imię w linijce rodziny
      for (const [id, e] of en) {
        if (bez.get(id)?.rodzina.includes(` ${o.imie} (`)) expect(e.rodzina, id).toContain(` ${nowe} (`);
      }
      sprawdzone++;
    }
    expect(sprawdzone).toBeGreaterThanOrEqual(2);
  });

  it('brak wpisu albo pusty wpis w imionach to imię z generatora', () => {
    const { l, dane } = demo('przymorze');
    const a = lokatorzyEn(l, dane, new Map());
    const b = lokatorzyEn(l, dane, new Map(l.siedziba.osoby.map((o) => [o.id, ''])));
    expect([...b]).toEqual([...a]);
  });
});

/** całe obszary dem: sam plik trwa około 30 s, a w pełnym przebiegu obok botów drugi test przekraczał 60 s */
const CIEZKI = 240_000;

describe('lokatorzyEn na całych obszarach dem i innych kronikach', () => {
  /** Każdy budynek mieszkalny obszaru jako siedziba: wszystkie historie bez polskich słów i z tymi samymi zdaniami.
      `ziarno` to inna kronika osiedla niż w grze. */
  function sprawdzBudynki(nazwa: NazwaDema, ziarno?: string) {
    const { geo, dane, l } = demo(nazwa);
    const budynki = budynkiObszaru(geo, dane.gmina, dane.kraj);
    const k = ziarno === undefined ? l.kronika : kronika(geo, budynki, zbiorImion(dane.imiona), ziarno);
    const bledy: string[] = [];
    const szablony = new Set<string>();
    let historii = 0;
    for (const b of budynki) {
      const w = generujBudynek(b, dane.gmina, dane.kraj, { ...dane, kronika: k });
      const lw: LokatorzyGry = { ...l, siedziba: w, kronika: k };
      const zebrane = new Map<string, ZrodloZdania[]>();
      historieWyniku(w, k, dane.odmiana, zebrane);
      for (const zz of zebrane.values()) for (const z of zz) szablony.add(z.szablon);
      const en = lokatorzyEn(lw, dane, new Map());
      const ok = dozwolone(w, lw);
      for (const o of w.osoby) {
        const pl = polska(w, o);
        if (pl.story) historii++;
        bledy.push(...porownaj(pl, en.get(o.id), ok, `${nazwa} ${o.id}`));
      }
    }
    return { bledy, szablony, historii };
  }

  it('każdy budynek obszaru trzech dem: angielskie historie bez polskich słów i z tymi samymi zdaniami', () => {
    const szablony = new Set<string>();
    for (const nazwa of DEMA) {
      const wynik = sprawdzBudynki(nazwa);
      expect(wynik.bledy.slice(0, 10), nazwa).toEqual([]);
      expect(wynik.historii, nazwa).toBeGreaterThan(nazwa === 'zielonki' ? 20 : 500);
      for (const s of wynik.szablony) szablony.add(s);
    }
    expect(szablony.size).toBeGreaterThan(120);
  }, CIEZKI);

  it('inne kroniki osiedla (inne ziarna): więcej szablonów kroniki i miejsc, dalej bez polskich słów', () => {
    const szablony = new Set<string>();
    for (const nazwa of DEMA) {
      for (let i = 0; i < 3; i++) {
        const wynik = sprawdzBudynki(nazwa, `en-${i}`);
        expect(wynik.bledy.slice(0, 10), `${nazwa} ${i}`).toEqual([]);
        for (const s of wynik.szablony) szablony.add(s);
      }
    }
    expect(szablony.size).toBeGreaterThan(135);
  }, CIEZKI);

  it('budynek, w którym żadne imię nie ma pewnej odmiany: szablony zapasowe po angielsku, te same zdania', () => {
    const { l, dane } = demo('przymorze');
    const w = structuredClone(l.siedziba);
    for (const o of w.osoby) o.imie = `${o.imie}2`;
    const historie = historieWyniku(w, l.kronika, dane.odmiana);
    const zebrane = new Map<string, ZrodloZdania[]>();
    historieWyniku(w, l.kronika, dane.odmiana, zebrane);
    const zapasowe = new Set(SZABLONY.filter((s) => s.zapas).map((s) => s.id));
    const uzyte = [...zebrane.values()].flat().filter((z) => zapasowe.has(z.szablon));
    expect(uzyte.length).toBeGreaterThan(3);
    const en = lokatorzyEn({ ...l, siedziba: w }, dane, new Map());
    const ok = dozwolone(w, l);
    const bledy = w.osoby.flatMap((o) => porownaj(polska(w, o, historie), en.get(o.id), ok, o.id));
    expect(bledy.slice(0, 10)).toEqual([]);
  });
});

// ---------------------------------------------------------------- reguły modułów

describe('src/mieszkancy/*.en.ts i angielski.ts: reguły modułu', () => {
  for (const nazwa of ['angielski.ts', 'szablony.en.ts', 'fachy.en.ts']) {
    const plik = path.join(KORZEN, 'src/mieszkancy', nazwa);
    const surowe = fs.readFileSync(plik, 'utf8');
    const zrodlo = surowe.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    it(`${nazwa}: zaczyna się komentarzem, bez Math.random, dat i trygonometrii`, () => {
      expect(surowe.startsWith('/* ')).toBe(true);
      expect(zrodlo).not.toMatch(/Math\.(sin|cos|exp|log|pow|hypot|tan|atan|atan2|random)\b/);
      expect(zrodlo).not.toMatch(/\bDate\b/);
    });

    it(`${nazwa}: z sim tylko typy, bez ui, render, gov i Node`, () => {
      expect(zrodlo).not.toMatch(/^import (?!type ).* from '\.\.\/sim\//m);
      expect(zrodlo).not.toMatch(/from '\.\.\/(ui|render|gov)\//);
      expect(zrodlo).not.toMatch(/from 'node:/);
    });

    it(`${nazwa}: teksty bez pauz i półpauz`, () => {
      const literaly = [...zrodlo.matchAll(/'([^'\n]*)'/g)].map((m) => m[1]);
      for (const t of literaly) expect(t, t).not.toMatch(/[—–]/);
      // angielskie teksty bez polskich znaków poza miastami i kluczami (polskie napisy z fachy.ts i czas-dokad.ts)
      if (nazwa === 'szablony.en.ts')
        for (const t of literaly.filter((x) => /^(to|from|the|a|an) |\{/.test(x)))
          expect(polskieSlowa(t.replace(/\{[^}]*\}/g, ' '), MIASTA), t).toEqual([]);
    });
  }

  it('angielskie nazwy z fachy.en.ts nie mają polskich znaków', () => {
    for (const v of [...Object.values(FACHY_EN), ...Object.values(DAWNE_ZAWODY_EN).flat()])
      expect(v).not.toMatch(POLSKIE);
  });
});
