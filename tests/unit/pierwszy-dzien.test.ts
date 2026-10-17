/* Pierwszy dzień (decyzja Mateusza, 17.10.2026): dopóki kuchnia się nie nagrzeje, bez losowych wydarzeń; zamiast nich
   jedno z sytuacji: koza się rozpala, ktoś widzi dym i przychodzi. Do rana drugiego dnia tylko wydarzenia pierwszej nocy
   (siatka, obcy, noc), satyra od drugiego dnia. Wejście jak z gry przy 1×: godzina gry trwa 40 s, start o 15:00. */

import { describe, expect, it } from 'vitest';
import { BLOK, placeOf } from '../../src/gov/miejsce.ts';
import type { GovInput, GovState } from '../../src/gov/typy.ts';
import { M1_EVENTS } from '../../src/gov/wydarzenia.ts';
import { ackReport, chooseEvent, confirmNight, govUpdate, newGov, pending, signLaw } from '../../src/gov/zarzad.ts';
import { Atrapa, TPH, TPS } from './gov-atrapa.ts';
import { demoWorld } from './miejsce-pomoc.ts';

const base = new Atrapa(1).input();
const byId = new Map(M1_EVENTS.map((e) => [e.id, e]));

/** wejście w sekundzie s przy ekranie przy 1× */
function inp(s: number, over: Partial<GovInput> = {}): GovInput {
  const m = 15 * 60 + (s * 60) / 40;
  const hour = Math.floor(m / 60) % 24;
  return {
    ...base,
    tick: s * TPS,
    day: Math.floor(m / 1440) + 1,
    hour,
    minute: Math.floor(m) % 60,
    night: hour >= 22 || hour < 6,
    screen: s,
    ...over,
  };
}
/** sekunda przy ekranie przy 1× dla godziny gry (dzień 1 od 15:00) */
const sec = (day: number, hour: number, minute = 0) => ((day - 1) * 24 * 60 + hour * 60 + minute - 15 * 60) * (40 / 60);

/** kroki zarządu od s0 do s1 z wejściem z f; okna odpowiadane od razu; zwraca nowe wydarzenia z sekundą */
function play(gov: GovState, s0: number, s1: number, f: (s: number) => Partial<GovInput>) {
  const seen: { s: number; id: string }[] = [];
  const decided: number[] = [];
  for (let s = s0; s <= s1; s++) {
    const i = inp(s, f(s));
    const had = gov.ev.active;
    govUpdate(gov, i);
    if (gov.ev.active && gov.ev.active !== had) seen.push({ s, id: gov.ev.active.id });
    for (let k = 0; k < 5; k++) {
      const p = pending(gov, i);
      if (!p) break;
      decided.push(s);
      if (p.k === 'wydarzenie')
        chooseEvent(
          gov,
          i,
          Math.max(
            0,
            p.choices.findIndex((c) => c.ok),
          ),
        );
      else if (p.k === 'uchwala') signLaw(gov, i, null);
      else if (p.k === 'karta') confirmNight(gov, i);
      else ackReport(gov, i);
    }
  }
  return { seen, decided };
}

const fresh = () => {
  const gov = newGov(1);
  gov.ev.next = 0;
  return gov;
};

describe('cisza do ciepłej kuchni', () => {
  it('przy zimnej kuchni pierwszego dnia nie ma losowych wydarzeń', () => {
    const { seen } = play(fresh(), 1, 100, () => ({ kitchen: 9, kozaLit: false }));
    expect(seen).toEqual([]);
  });

  it('po ciszy pierwsze wydarzenie najwcześniej 10 s po nagrzaniu kuchni', () => {
    const { seen } = play(fresh(), 1, 140, (s) => ({ kozaLit: s >= 40, kitchen: s < 105 ? 12 : 18 }));
    expect(seen[0]).toEqual({ s: 60, id: 'dym' });
    expect(seen[1].s).toBeGreaterThanOrEqual(115);
    expect(seen[1].s).toBeLessThanOrEqual(130);
  });

  it('bez kuchni (świat bez wnętrza) nie ma ciszy ani dymu', () => {
    const { seen } = play(fresh(), sec(1, 16), sec(1, 16) + 20, () => ({ kitchen: null, kozaLit: false }));
    expect(seen.length).toBe(1);
    expect(byId.get(seen[0].id)?.first).toBe(true);
  });

  it('zimna kuchnia: cisza kończy się o 18:00, wydarzenie przed zebraniem o 19:30', () => {
    const { seen } = play(fresh(), 1, sec(1, 19, 29), () => ({ kitchen: 9, kozaLit: false }));
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0].s).toBeGreaterThanOrEqual(sec(1, 18));
  });

  it('stary zapis bez ev.lit i ev.warm drugiego dnia: wydarzenia jak dotąd, bez dymu', () => {
    const gov = fresh();
    delete gov.ev.lit;
    delete gov.ev.warm;
    const s = sec(2, 10);
    const { seen } = play(gov, s, s + 15, () => ({ kitchen: 20, kozaLit: true }));
    expect(seen.length).toBe(1);
    expect(seen[0].id).not.toBe('dym');
  });
});

describe('dym z komina', () => {
  it('20 s po pierwszym rozpaleniu kozy, raz na grę', () => {
    const gov = fresh();
    const lit = (s: number) => s >= 40 && (s <= 75 || s >= 90);
    const { seen } = play(gov, 1, 100, (s) => ({ kozaLit: lit(s), kitchen: 12 }));
    expect(seen).toEqual([{ s: 60, id: 'dym' }]);
  });

  it('koza rozpalona pierwszy raz o 6:30 drugiego dnia: dym dopiero od 8:00', () => {
    const gov = fresh();
    const { seen } = play(gov, sec(2, 6, 30), sec(2, 8, 10), () => ({ kozaLit: true, kitchen: 18 }));
    expect(seen[0]).toEqual({ s: sec(2, 8), id: 'dym' });
  });

  /** okno dymu w 60 s (koza od 40 s), przed odpowiedzią */
  const dymText = (over: Partial<GovInput>) => {
    const gov = fresh();
    const f = (s: number) => ({ kozaLit: s >= 40, kitchen: 12, ...over });
    play(gov, 1, 59, f);
    govUpdate(gov, inp(60, f(60)));
    const p = pending(gov, inp(60, f(60)));
    return p?.k === 'wydarzenie' ? `${p.title}: ${p.text}` : '';
  };

  it('w bloku sąsiadka z waszej klatki, w bloku bez mieszkańców z bloku obok', () => {
    expect(dymText({})).toMatch(/^Dym z komina: .*pani Krysia z waszej klatki.*u niej w mieszkaniu/);
    expect(dymText({ residents: 0, place: BLOK })).toContain('pani Krysia z bloku obok');
  });

  it('w domu sąsiadka zza płotu, w samotnym domu nikt nie przychodzi', () => {
    const dom = placeOf(demoWorld('zielonki').w);
    const t = dymText({ residents: 0, place: dom });
    expect(t).toContain('Nad dachem idzie dym z komina');
    expect(t).toContain('pani Krysia zza płotu');
    expect(t).toContain('u niej w domu');
    const lone = play(fresh(), 1, 110, (s) => ({ kozaLit: s >= 40, kitchen: 12, place: { ...dom, near: 'nikt' } }));
    expect(lone.seen).toEqual([]);
  });
});

describe('stare zapisy', () => {
  it('otwarte okno „Słoik od sąsiadki” działa jak dym z komina, bez błędu', () => {
    const gov = fresh();
    gov.ev.active = { id: 'sasiadka', d: {} };
    gov.ev.done.sasiadka = true;
    const i = inp(sec(1, 18));
    const p = pending(gov, i);
    expect(p?.k === 'wydarzenie' && p.title).toBe('Dym z komina');
    expect(chooseEvent(gov, i, 0).stock.supplies).toBe(2);
  });

  it('po słoiku od sąsiadki dym nie przychodzi drugi raz', () => {
    const gov = fresh();
    gov.ev.done.sasiadka = true;
    const { seen } = play(gov, 1, 100, (s) => ({ kozaLit: s >= 40, kitchen: 12 }));
    expect(seen).toEqual([]);
  });

  it('nieznane okno w zapisie znika, zamiast blokować grę', () => {
    const gov = fresh();
    gov.ev.active = { id: 'nie-ma-takiego', d: {} };
    expect(() => pending(gov, inp(100))).not.toThrow();
    expect(() => chooseEvent(gov, inp(100), 0)).not.toThrow();
    govUpdate(gov, inp(101, { kitchen: 18 }));
    expect(gov.ev.active?.id).not.toBe('nie-ma-takiego');
  });
});

describe('pierwsza noc', () => {
  it('do 8:00 drugiego dnia tylko wydarzenia pierwszej nocy, potem cała pula', () => {
    let later = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const gov = newGov(seed);
      const atr = new Atrapa(seed);
      while (atr.day < 3) {
        atr.tick++;
        if (atr.tick % TPH === 0) atr.hourly(1);
        if (atr.tick % TPS !== 0) continue;
        const had = gov.ev.active;
        atr.apply(govUpdate(gov, atr.input()));
        const ev = gov.ev.active;
        if (ev && ev !== had) {
          const first = atr.day === 1 || (atr.day === 2 && atr.hour < 8);
          if (first)
            expect(ev.id === 'dym' || byId.get(ev.id)?.first, `${ev.id} dnia ${atr.day} o ${atr.hour}`).toBe(true);
          else if (!byId.get(ev.id)?.first) later++;
        }
        const p = pending(gov, atr.input());
        if (p?.k === 'wydarzenie')
          atr.apply(
            chooseEvent(
              gov,
              atr.input(),
              Math.max(
                0,
                p.choices.findIndex((c) => c.ok),
              ),
            ),
          );
        else if (p?.k === 'uchwala') signLaw(gov, atr.input(), null);
        else if (p?.k === 'karta') atr.apply(confirmNight(gov, atr.input()));
        else if (p?.k === 'raport') ackReport(gov, atr.input());
      }
    }
    // drugiego dnia przychodzą też wydarzenia spoza pierwszej nocy (satyra, ludzie, handel)
    expect(later).toBeGreaterThan(0);
  });

  it('rytm pierwszego dnia przy 1×: decyzja zarządu w każdej minucie do karty nocy', () => {
    const kitchen = (s: number) => (s < 40 ? 9 : Math.min(18, 9 + ((s - 40) * 9) / 65));
    const { decided } = play(fresh(), 1, 240, (s) => ({ kozaLit: s >= 40, kitchen: kitchen(s) }));
    for (let m = 1; m < 4; m++)
      expect(
        decided.some((s) => s >= m * 60 && s < (m + 1) * 60),
        `minuta ${m + 1}`,
      ).toBe(true);
  });
});
