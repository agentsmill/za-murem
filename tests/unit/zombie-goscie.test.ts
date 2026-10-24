/* Goście w trybie zombie przy stadzie przy siatce (Task 16, część 3): szwendacz do 6 m od któregoś z grupy płoszy ją po drodze
   do bramy (src/sim/sim.ts, `goscPlosz`), więc zarząd planuje wizytę dopiero wtedy, gdy przy siatce nie kręci się więcej niż
   `PROG_ULICY` szwendaczy (`GovInput.horde.near`). Wylosowana wizyta (`gosc`, `powrot`) czeka w `GovState.goscie.czeka` na spokój
   do `CZEKA_MAX` minut gry; karty z 0.3 i kroki łańcuchów z gościem (`GEventDef.gosc`) w ogóle nie wypadają, póki stado jest
   duże. W trybie zwykłym nic się nie zmienia. Na końcu spis na prawdziwej symulacji: kartę gościa widzi co najmniej 40% wizyt. */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { GovInput, GovState } from '../../src/gov/typy.ts';
import { podmienLancuchy } from '../../src/gov/watki.ts';
import { CZEKA_MAX, PROG_ULICY, ulicaWolna } from '../../src/gov/wizyta.ts';
import { emptyEffects, gameMin } from '../../src/gov/wspolne.ts';
import { eventTick, M1_EVENTS, makeHost } from '../../src/gov/wydarzenia.ts';
import { govUpdate, loadGov, newGov, saveGov } from '../../src/gov/zarzad.ts';
import { swiatMieszkancow } from '../../tools/bot-mieszkancy.ts';
import { Atrapa, at, TPH } from './gov-atrapa.ts';
import { playWithGov } from './gov-play.ts';

afterEach(() => podmienLancuchy(null));

const horda = (near: number): NonNullable<GovInput['horde']> => ({
  near,
  pressing: near,
  killed: 0,
  breaches: 0,
  bites: 0,
  tonight: 8,
});
const tickAt = (day: number, hour: number, minute = 0): number =>
  Math.round(((at(day, hour, minute) - 15 * 60) * TPH) / 60);

interface Stan {
  gov: GovState;
  i: GovInput;
}

/** zarząd, w którego puli jest tylko `gosc` (reszta wydarzeń „niedawno była”), dzień 3 o 16:00, gra z obcymi (lista gości pusta) */
function tylkoGosc(mode: 'zwykly' | 'zombie', near: number | null, seed = 3): Stan {
  podmienLancuchy([]);
  const gov = newGov(seed, mode);
  const atr = new Atrapa(seed);
  atr.supplies = 30;
  atr.tick = tickAt(3, 16);
  const i: GovInput = {
    ...atr.input(),
    screen: 5000,
    kozaLit: true,
    goscie: [],
    napady: [],
    ...(near === null ? {} : { horde: horda(near) }),
  };
  for (const e of M1_EVENTS) if (e.id !== 'gosc') gov.ev.last[e.id] = gameMin(i);
  gov.ev.next = 0;
  gov.ev.warm = 0;
  return { gov, i };
}

describe('ulicaWolna', () => {
  it('w trybie zwykłym zawsze, w zombie przy najwyżej PROG_ULICY szwendaczach przy siatce albo bez odczytu stada', () => {
    expect(ulicaWolna('zwykly', { horde: horda(50) })).toBe(true);
    expect(ulicaWolna('zombie', {})).toBe(true);
    expect(ulicaWolna('zombie', { horde: horda(0) })).toBe(true);
    expect(ulicaWolna('zombie', { horde: horda(PROG_ULICY) })).toBe(true);
    expect(ulicaWolna('zombie', { horde: horda(PROG_ULICY + 1) })).toBe(false);
  });

  it('host mówi to samo co funkcja', () => {
    const s = tylkoGosc('zombie', PROG_ULICY + 3);
    expect(makeHost(s.gov, s.i, emptyEffects()).ulicaWolna()).toBe(false);
    const w = tylkoGosc('zombie', 0);
    expect(makeHost(w.gov, w.i, emptyEffects()).ulicaWolna()).toBe(true);
  });
});

describe('wizyta wylosowana przy stadzie przy siatce', () => {
  it('w trybie zombie przy dużym stadzie nie planuje się od razu: wizyta czeka, a goscAktywny jest prawdą', () => {
    const s = tylkoGosc('zombie', 9);
    const fx = emptyEffects();
    eventTick(s.gov, s.i, fx, false);
    expect(fx.gosc).toBeUndefined();
    expect(s.gov.goscie?.czeka).toEqual({ co: 'gosc', od: gameMin(s.i) });
    expect(s.gov.goscie?.aktywny).toBeUndefined();
    expect(s.gov.goscie?.n).toBe(0);
    expect(makeHost(s.gov, s.i, emptyEffects()).goscAktywny()).toBe(true);
    // czekająca wizyta zajmuje miejsce: waga `gosc` to 0, więc nic drugiego się nie odkłada
    expect(M1_EVENTS.find((e) => e.id === 'gosc')!.w(makeHost(s.gov, s.i, emptyEffects()))).toBe(0);
  });

  it('gdy przy siatce się przerzedzi, wizyta idzie do planu (raz), a czekanie się kończy', () => {
    const s = tylkoGosc('zombie', 9);
    eventTick(s.gov, s.i, emptyEffects(), false);
    expect(s.gov.goscie?.czeka).toBeDefined();
    // kolejne sekundy przy dużym stadzie: nadal czeka
    const fxCzeka = emptyEffects();
    eventTick(s.gov, { ...s.i, screen: s.i.screen + 30, horde: horda(9) }, fxCzeka, false);
    expect(fxCzeka.gosc).toBeUndefined();
    expect(s.gov.goscie?.czeka).toBeDefined();
    // spokój przy siatce: plan
    const fx = emptyEffects();
    eventTick(s.gov, { ...s.i, screen: s.i.screen + 60, horde: horda(0) }, fx, false);
    expect(fx.gosc?.id).toBe('g1');
    expect(s.gov.goscie?.czeka).toBeUndefined();
    expect(s.gov.goscie?.aktywny?.gosc.id).toBe('g1');
    expect(s.gov.goscie?.n).toBe(1);
  });

  it('czekająca wizyta przepada po CZEKA_MAX minutach gry bez spokoju, bez planu i bez śladu', () => {
    const s = tylkoGosc('zombie', 9);
    eventTick(s.gov, s.i, emptyEffects(), false);
    const od = s.gov.goscie!.czeka!.od;
    const przed = emptyEffects();
    eventTick(s.gov, { ...s.i, screen: s.i.screen + 2, horde: horda(9) }, przed, false);
    expect(s.gov.goscie?.czeka?.od).toBe(od);
    // minęło więcej niż CZEKA_MAX minut gry
    const pozno = CZEKA_MAX + 5;
    const i = {
      ...s.i,
      // ekran jeszcze przed następnym losowaniem (po pustym losowaniu RETRY sekund), żeby kolejne losowanie nie odłożyło wizyty od nowa
      screen: s.i.screen + 4,
      day: 3 + Math.floor((16 * 60 + pozno) / 1440),
      hour: Math.floor((16 * 60 + pozno) / 60) % 24,
      minute: (16 * 60 + pozno) % 60,
      horde: horda(9),
    };
    const fx = emptyEffects();
    eventTick(s.gov, i, fx, false);
    expect(fx.gosc).toBeUndefined();
    expect(s.gov.goscie?.czeka).toBeUndefined();
    expect(s.gov.goscie?.n).toBe(0);
  });

  it('w trybie zwykłym wizyta planuje się od razu, choćby odczyt stada był duży, i nic nie czeka', () => {
    const s = tylkoGosc('zwykly', 40);
    const fx = emptyEffects();
    eventTick(s.gov, s.i, fx, false);
    expect(fx.gosc?.id).toBe('g1');
    expect(s.gov.goscie?.czeka).toBeUndefined();
  });

  it('w trybie zombie bez odczytu stada albo przy spokoju planuje się od razu', () => {
    for (const near of [null, 0, PROG_ULICY]) {
      const s = tylkoGosc('zombie', near);
      const fx = emptyEffects();
      eventTick(s.gov, s.i, fx, false);
      expect(fx.gosc?.id, `near ${near}`).toBe('g1');
      expect(s.gov.goscie?.czeka, `near ${near}`).toBeUndefined();
    }
  });

  it('zapis i wczytanie w czasie czekania nie zmieniają przebiegu', () => {
    const s = tylkoGosc('zombie', 9);
    eventTick(s.gov, s.i, emptyEffects(), false);
    const kopia = loadGov(saveGov(s.gov));
    expect(kopia.goscie?.czeka).toEqual(s.gov.goscie?.czeka);
    const i = { ...s.i, screen: s.i.screen + 40, horde: horda(1) };
    const a = emptyEffects();
    const b = emptyEffects();
    eventTick(s.gov, i, a, false);
    eventTick(kopia, i, b, false);
    expect(b.gosc).toEqual(a.gosc);
    expect(a.gosc).toBeDefined();
    expect(saveGov(kopia)).toBe(saveGov(s.gov));
  });

  it('karta z 0.3 z gościem (dzieci) nie wypada przy dużym stadzie, a przy spokoju wypada', () => {
    podmienLancuchy([]);
    const wypadla = (near: number): number => {
      let n = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const gov = newGov(seed, 'zombie');
        const atr = new Atrapa(seed);
        atr.tick = tickAt(3, 11);
        const i: GovInput = { ...atr.input(), screen: 5000, goscie: [], napady: [], horde: horda(near) };
        for (const e of M1_EVENTS) if (e.id !== 'dzieci') gov.ev.last[e.id] = gameMin(i);
        gov.ev.next = 0;
        gov.ev.warm = 0;
        const fx = emptyEffects();
        eventTick(gov, i, fx, false);
        if (fx.gosc && gov.goscie?.aktywny?.kartaId === 'dzieci') n++;
      }
      return n;
    };
    expect(wypadla(9)).toBe(0);
    expect(wypadla(0)).toBeGreaterThan(0);
  });

  it('krok łańcucha z gościem (dach, trzeci krok) czeka na spokój zamiast ginąć po cichu i dopiero wtedy planuje wizytę z kartą kroku', () => {
    const gov = newGov(6, 'zombie');
    const atr = new Atrapa(6);
    atr.tick = tickAt(3, 16);
    const i: GovInput = { ...atr.input(), screen: 5000, goscie: [], napady: [], horde: horda(9) };
    for (const e of M1_EVENTS) gov.ev.last[e.id] = 1e12;
    gov.ev.done.dym = true;
    gov.ev.next = 0;
    gov.ev.warm = 0;
    gov.watki = { wybrane: ['dach'], haki: { dach_2: { t: 0 } }, krok: { dach: 2 } };
    for (let k = 0; k < 40 && !gov.goscie?.czeka; k++) {
      const fx = emptyEffects();
      eventTick(gov, { ...i, screen: i.screen + 10 * k }, fx, false);
      expect(fx.gosc, 'przy dużym stadzie żadnego planu').toBeUndefined();
    }
    expect(gov.goscie?.czeka).toMatchObject({ co: 'krok', id: 'dach_3' });
    expect(gov.watki?.krok.dach).toBe(3);
    // czekający krok nie jest sprzątany jako przepadły: wizyta dalej czeka przez kolejne sekundy
    eventTick(gov, { ...i, screen: i.screen + 500, horde: horda(9) }, emptyEffects(), false);
    expect(gov.goscie?.czeka).toMatchObject({ co: 'krok', id: 'dach_3' });
    // spokój: plan z kartą kroku
    const fx = emptyEffects();
    eventTick(gov, { ...i, screen: i.screen + 501, horde: horda(0) }, fx, false);
    expect(fx.gosc).toBeDefined();
    expect(gov.goscie?.czeka).toBeUndefined();
    expect(gov.goscie?.aktywny?.kartaId).toBe('dach_3');
  });

  it('govUpdate przez całą dobę z dużym stadem nie wystawia gości w trybie zombie', () => {
    podmienLancuchy([]);
    const gov = newGov(4, 'zombie');
    const atr = new Atrapa(4);
    atr.tick = tickAt(2, 8);
    let plany = 0;
    for (let s = 0; s < 1500; s++) {
      atr.tick += 20;
      if (atr.tick % TPH < 20) atr.hourly(1);
      const fx = govUpdate(gov, { ...atr.input(), goscie: [], horde: horda(12) });
      atr.apply(fx);
      if (fx.gosc) plany++;
    }
    expect(plany).toBe(0);
  });
});

// ---------------------------------------------------------------- spis na prawdziwej symulacji

describe('spis gości w trybie zombie (prawdziwa symulacja, Przymorze z mieszkańcami i obcymi)', () => {
  it('co najmniej 40% wizyt dochodzi do karty pod bramą, a gości nie brakuje', async () => {
    const demo = JSON.parse(
      fs.readFileSync(path.resolve(import.meta.dirname, '../../public/demo/przymorze.json'), 'utf8'),
    );
    let wizyty = 0;
    let karty = 0;
    for (const seed of [4, 5, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17]) {
      const { world, mieszkancy } = await swiatMieszkancow(demo, seed, 4);
      const ids = new Set<string>();
      const zKarta = new Set<string>();
      playWithGov(world, seed, 'zawsze-warta', 5, 4, {
        mieszkancy,
        obcy: true,
        mode: 'zombie',
        obserwuj: (gov, i) => {
          for (const g of i.goscie ?? []) ids.add(g.id);
          const a = gov.goscie?.aktywny;
          if (a?.karta) zKarta.add(a.gosc.id);
        },
      });
      wizyty += ids.size;
      karty += zKarta.size;
    }
    // mała próba (12 gier po 5 dób, około 9 wizyt); większy spis (120 gier: bez zasady 15% wizyt z kartą, z zasadą 62%) to tools/spis-kart.ts
    expect(wizyty).toBeGreaterThanOrEqual(6);
    expect(karty / wizyty).toBeGreaterThanOrEqual(0.4);
  }, 120_000);
});
