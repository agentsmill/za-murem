/* Sąsiednie budynki, czyste funkcje (docs/M2-fala-2.md): drzwi na start z udziałami z projektu, rodzaje drzwi na
   prawdziwych budynkach, znani sąsiedzi, łup usług i mieszkań, zapasy, lokatorzy zapasowi, zamiar i nastrój, wybory
   spotkania i ich skutki. */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hashString, mulberry } from '../../src/core/rng.ts';
import { lootOf } from '../../src/sim/mieszkania.ts';
import {
  domyZapasowe,
  drzwiBudynku,
  drzwiMieszkaniaNaStart,
  drzwiNaStart,
  type Gospodarstwo,
  type KontekstSpotkania,
  lupMieszkania,
  lupUslug,
  poczatek,
  przechodnie,
  skutek,
  wDomu,
  wnetrze,
  wybory,
  znaniBudynki,
} from '../../src/sim/sasiedzi.ts';
import { buildWorld, type World } from '../../src/world/world.ts';

const worlds = new Map<string, World>();
const demo = (key: string): World => {
  let w = worlds.get(key);
  if (!w) {
    const d = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, `../../public/demo/${key}.json`), 'utf8'));
    w = buildWorld(d.geo, { seed: Number.parseInt(hashString(d.addr), 16) || 2051, street: d.street });
    worlds.set(key, w);
  }
  return w;
};
const byName = (w: World, name: string) => w.buildings.find((b) => b.name === name)!;

const dom = (over: Partial<Gospodarstwo> = {}): Gospodarstwo => ({
  osoby: [{ first: 'Halina', name: 'Halina Zając', f: true, prof: 'emerytka', skills: {}, age: 71, traits: [] }],
  apt: 0,
  klatka: 0,
  znani: false,
  zamiar: 'nieufni',
  nastroj: 'spokoj',
  rel: 0,
  zapasy: { jedzenie: 4 },
  gdzie: 'u_siebie',
  ...over,
});
const ctx = (over: Partial<KontekstSpotkania> = {}): KontekstSpotkania => ({
  jedzenie: 10,
  uzbrojeni: 0,
  mode: 'zwykly',
  mowca: null,
  ...over,
});

describe('sąsiedzi: drzwi', () => {
  const share = (mode: 'zwykly' | 'zombie', ludzie: boolean) => {
    const n = 3000;
    const c = { wywazone: 0, klucz: 0, klamka: 0 };
    for (let t = 0; t < n; t++) {
      const d = drzwiNaStart({ seed: 11 }, mode, 7, t, { ludzie, odUlicy: false });
      if (d.s === 'wywazone') c.wywazone++;
      else if (d.k) c.klucz++;
      else c.klamka++;
    }
    return { wywazone: c.wywazone / n, klucz: c.klucz / n, klamka: c.klamka / n };
  };

  it('stan na start z udziałami z projektu i deterministycznie', () => {
    const z = share('zwykly', true);
    expect(z.wywazone).toBe(0);
    expect(Math.abs(z.klucz - 0.7)).toBeLessThan(0.04);
    const p = share('zwykly', false);
    expect(Math.abs(p.wywazone - 0.35)).toBeLessThan(0.04);
    expect(Math.abs(p.klucz - 0.35)).toBeLessThan(0.04);
    expect(Math.abs(p.klamka - 0.3)).toBeLessThan(0.04);
    expect(share('zombie', true).klucz).toBe(1);
    const zp = share('zombie', false);
    expect(Math.abs(zp.wywazone - 0.5)).toBeLessThan(0.04);
    expect(Math.abs(zp.klucz - 0.3)).toBeLessThan(0.04);
    expect(drzwiNaStart({ seed: 11 }, 'zwykly', 7, 123, { ludzie: false, odUlicy: false })).toEqual(
      drzwiNaStart({ seed: 11 }, 'zwykly', 7, 123, { ludzie: false, odUlicy: false }),
    );
  });

  it('drzwi od ulicy budynku przy podwórku: zawsze na klucz, nigdy wyważone', () => {
    for (let t = 0; t < 500; t++)
      for (const mode of ['zwykly', 'zombie'] as const)
        expect(drzwiNaStart({ seed: 3 }, mode, 2, t, { ludzie: false, odUlicy: true })).toEqual({
          t,
          s: 'zamkniete',
          k: true,
        });
  });

  it('drzwi mieszkań: zamieszkane na klucz, ze szwendaczem zamknięte, puste otwarte albo wyważone', () => {
    const m = { apt: 0, dom: 0, przeszukane: [] };
    expect(drzwiMieszkaniaNaStart(5, { ...m, stan: 'mieszkancy' }, false)).toEqual({ t: 5, s: 'zamkniete', k: true });
    expect(drzwiMieszkaniaNaStart(5, { ...m, stan: 'puste', zombie: true }, false)).toEqual({ t: 5, s: 'zamkniete' });
    expect(drzwiMieszkaniaNaStart(5, { ...m, stan: 'puste' }, false).s).toBe('otwarte');
    expect(drzwiMieszkaniaNaStart(5, { ...m, stan: 'puste' }, true).s).toBe('wywazone');
    expect(['otwarte', 'wywazone'].every((s) => przechodnie(s as 'otwarte'))).toBe(true);
    expect(['zamkniete', 'na_klucz', 'zabite'].some((s) => przechodnie(s as 'zabite'))).toBe(false);
  });

  it('rodzaje drzwi na Lanciego 10F (trzy klatki, sześć mieszkań) i w domu w Batowicach', () => {
    const w = demo('lanciego');
    const b = byName(w, 'Blok nr 10F');
    const dz = drzwiBudynku(w, b.id);
    const apts = Math.max(...wnetrze(w, b.id).rooms.map((r) => r.apt)) + 1;
    expect(
      dz.zewn
        .filter((d) => d.wejscie >= 0)
        .map((d) => d.wejscie)
        .sort(),
    ).toEqual([0, 1, 2]);
    for (const d of dz.zewn) expect(w.bid[d.out]).not.toBe(b.id);
    // każde mieszkanie ma drzwi wejściowe, a kafelek przed nimi to posadzka po drugiej stronie
    expect(new Set(dz.mieszkan.values()).size).toBe(apts);
    for (const [d, a] of dz.mieszkan) {
      const it = wnetrze(w, b.id);
      const front = dz.przed.get(d)!;
      expect(it.rooms[it.room[front]].apt).not.toBe(a);
    }
    const z = demo('zielonki');
    const h = byName(z, 'Dom nr 12');
    const hd = drzwiBudynku(z, h.id);
    expect(hd.zewn.length).toBeGreaterThanOrEqual(1);
    expect(hd.mieszkan.size).toBe(0);
  });

  it('znani: trzy najbliższe budynki mieszkalne do 120 m od drzwi siedziby', () => {
    expect(znaniBudynki(demo('przymorze')).map((id) => demo('przymorze').buildings[id].name)).toEqual([
      'Blok nr 8B',
      'Blok nr 8C',
      'Blok nr 8D',
    ]);
    expect(znaniBudynki(demo('zielonki')).map((id) => demo('zielonki').buildings[id].name)).toEqual([
      'Dom 28',
      'Dom nr 12',
      'Dom nr 8',
    ]);
  });
});

describe('sąsiedzi: łup i lokatorzy', () => {
  it('łup usług według rodzaju budynku', () => {
    const sum = (cls: 'przychodnia' | 'garaz' | 'sklep') => {
      const t: Record<string, number> = {};
      for (let s = 1; s <= 500; s++)
        for (const [m, n] of Object.entries(lupUslug(cls, 'sala', 20, mulberry(s)))) t[m] = (t[m] ?? 0) + n;
      return t;
    };
    const med = sum('przychodnia');
    expect(med.leki).toBeGreaterThan(3 * (med.jedzenie ?? 0));
    const gar = sum('garaz');
    expect(gar.zlom).toBeGreaterThan(gar.deski ?? 0);
    expect(gar.jedzenie ?? 0).toBe(0);
    const shop = sum('sklep');
    expect(shop.jedzenie).toBeGreaterThan(shop.leki ?? 0);
  });

  it('tryb zombie: z mieszkania z wymarcia dwa razy więcej jedzenia', () => {
    let seen = 0;
    for (let s = 1; s <= 200; s++) {
      const plain = lootOf('wymarcie', 'kuchnia', 8, mulberry(s));
      const z = lupMieszkania('wymarcie', 'kuchnia', 8, mulberry(s), 'zombie');
      expect(z.jedzenie ?? 0).toBe((plain.jedzenie ?? 0) * 2);
      expect(lupMieszkania('wymarcie', 'kuchnia', 8, mulberry(s), 'zwykly')).toEqual(plain);
      if (plain.jedzenie) seen++;
    }
    expect(seen).toBeGreaterThan(50);
  });

  it('lokatorzy zapasowi: deterministycznie, gospodarstwa 1–4 osób w zamieszkanych mieszkaniach', () => {
    const w = demo('lanciego');
    const b = byName(w, 'Blok nr 10F');
    const a = domyZapasowe(w, wnetrze(w, b.id), new Set());
    const c = domyZapasowe(w, wnetrze(w, b.id), new Set());
    expect(c).toEqual(a);
    const lived = a.stany.filter((s) => s.state === 'mieszkancy').map((s) => s.apt);
    expect(a.domy.map((d) => d.apt)).toEqual(lived);
    for (const d of a.domy) {
      expect(d.osoby.length).toBeGreaterThanOrEqual(1);
      expect(d.osoby.length).toBeLessThanOrEqual(4);
      for (const o of d.osoby) expect(o.name).toContain(o.first);
    }
  });

  it('zamiar i nastrój: cechy, głód przy dzieciach i tryb zombie', () => {
    const o = dom().osoby[0];
    const r = () => mulberry(5);
    expect(poczatek([{ ...o, traits: ['lubiany'] }], { jedzenie: 9 }, false, 'zwykly', r()).zamiar).toBe('zyczliwi');
    expect(poczatek([{ ...o, traits: ['klotliwy'] }], { jedzenie: 9 }, false, 'zwykly', r()).zamiar).toBe('nieufni');
    expect(poczatek([{ ...o, traits: ['klotliwy', 'odwazny'] }], { jedzenie: 9 }, false, 'zwykly', r())).toEqual({
      zamiar: 'wrodzy',
      nastroj: 'gniew',
    });
    const kid = { ...o, first: 'Kacper', age: 9 };
    expect(poczatek([o, kid], { jedzenie: 1 }, false, 'zwykly', r()).zamiar).toBe('zdesperowani');
    expect(poczatek([o], { jedzenie: 9 }, true, 'zwykly', r()).nastroj).toBe('zal');
    let robbers = 0;
    for (let s = 1; s <= 700; s++) {
      const p = poczatek([o], { jedzenie: 9 }, false, 'zombie', mulberry(s));
      if (p.zamiar === 'wrodzy') robbers++;
      else expect(p.nastroj).toBe('strach');
    }
    expect(Math.abs(robbers / 700 - 1 / 7)).toBeLessThan(0.04);
  });

  it('w domu: nocą zawsze, w trybie zombie zawsze, za dnia około 60%', () => {
    let home = 0;
    for (let day = 0; day < 400; day++) {
      expect(wDomu(3, 9, 0, day, 23, 'zwykly')).toBe(true);
      expect(wDomu(3, 9, 0, day, 12, 'zombie')).toBe(true);
      if (wDomu(3, 9, 0, day, 12, 'zwykly')) home++;
    }
    expect(Math.abs(home / 400 - 0.6)).toBeLessThan(0.07);
  });
});

describe('sąsiedzi: wybory spotkania i skutki', () => {
  const ks = (list: { k: string }[]) => list.map((x) => x.k);

  it('wybory: atak, zwykła karta, zaproszenie od relacji albo dla życzliwych i zdesperowanych', () => {
    expect(ks(wybory({ atak: true }, dom({ zamiar: 'wrodzy' }), ctx()))).toEqual(['obrona', 'uspokojenie', 'ucieczka']);
    expect(ks(wybory({ atak: false }, dom(), ctx()))).toEqual(['rozmowa', 'jedzenie', 'zabranie', 'odejscie']);
    expect(ks(wybory({ atak: false }, dom({ rel: 20 }), ctx()))).toContain('zaproszenie');
    expect(ks(wybory({ atak: false }, dom({ zamiar: 'zdesperowani' }), ctx()))).toContain('zaproszenie');
    expect(wybory({ atak: false }, dom(), ctx({ jedzenie: 1 })).find((x) => x.k === 'jedzenie')?.ok).toBe(false);
    // uzbrojeni z naszych: mniejsza szansa oporu
    const opor = (u: number) => wybory({ atak: false }, dom(), ctx({ uzbrojeni: u })).find((x) => x.k === 'zabranie')!;
    expect(opor(2).szansa!).toBeLessThan(opor(0).szansa!);
  });

  it('skutki: rozmowa, jedzenie, zabranie bez oporu, uspokojenie bez końca spotkania, ucieczka', () => {
    const r0 = () => 0.99;
    expect(skutek('rozmowa', dom(), { atak: false, wywazone: false }, ctx(), 'inni', r0)).toMatchObject({
      co: 'rozmowa',
      rel: 10,
      koniec: true,
      info: 'inni',
    });
    expect(
      skutek('jedzenie', dom({ zamiar: 'zdesperowani' }), { atak: false, wywazone: false }, ctx(), 'nic', r0),
    ).toMatchObject({ rel: 25, zamiar: 'zyczliwi', nastroj: 'nadzieja', dajemy: 2 });
    // r = 0,99: brak oporu (szansa oporu nieufnych 0,35)
    expect(skutek('zabranie', dom(), { atak: false, wywazone: false }, ctx(), 'nic', r0)).toMatchObject({
      co: 'zabranie',
      rel: -80,
      zamiar: 'wrodzy',
      zabrane: true,
    });
    const calm = skutek(
      'uspokojenie',
      dom({ zamiar: 'wrodzy', nastroj: 'gniew' }),
      { atak: true, wywazone: true },
      ctx(),
      'nic',
      () => 0,
    );
    expect(calm).toMatchObject({ co: 'uspokojenie_tak', koniec: false, zamiar: 'nieufni' });
    expect(skutek('ucieczka', dom(), { atak: true, wywazone: true }, ctx(), 'nic', r0)).toMatchObject({
      co: 'ucieczka',
      odwrot: true,
      rel: -10,
    });
    expect(skutek('odejscie', dom({ rel: 3 }), { atak: false, wywazone: true }, ctx(), 'nic', r0).rel).toBe(-2);
  });
});
