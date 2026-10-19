/* Ludność dla zarządu: `GovInput.ludnosc` (droga ludnościowa do zwycięstwa, src/gov/zwyciestwo.ts) to dokładnie
   `populacja(st).razem` z odczytu symulacji (zarząd, także na wyprawie, i mieszkańcy siedziby; bez sąsiadów i gości),
   na trzech demach i po przyjęciu uchodźców (applyGov z fx.residents), po dołączeniu osoby do zarządu i po odejściu.
   `EventHost.pop()` (wydarzenia zarządu) czyta tę samą liczbę przez `ludnoscOf`: na prawdziwych wejściach daje to samo
   co przed zmianą (zarząd plus mieszkańcy), a bez pola `ludnosc` (atrapy) wraca do zarządu i mieszkańców. */

import { describe, expect, it } from 'vitest';
import { makePerson } from '../../src/content/people.ts';
import { mulberry } from '../../src/core/rng.ts';
import type { GovEffects, GovInput } from '../../src/gov/typy.ts';
import { emptyEffects } from '../../src/gov/wspolne.ts';
import { makeHost } from '../../src/gov/wydarzenia.ts';
import { newGov } from '../../src/gov/zarzad.ts';
import { ludnoscOf } from '../../src/gov/zwyciestwo.ts';
import { applyGov, govInput } from '../../src/sim/gov.ts';
import type { Sim } from '../../src/sim/sim.ts';
import { populacja } from '../../src/sim/snapshot.ts';
import { core, demoWorld, newGame } from './sasiedzi-pomoc.ts';

const DEMA = ['przymorze', 'lanciego', 'zielonki'] as const;

const fx = (f: (e: GovEffects) => void): GovEffects => {
  const e = emptyEffects();
  f(e);
  return e;
};

/** liczba, którą dziś liczy EventHost.pop(): zarząd plus mieszkańcy z odczytu */
const dzisiaj = (i: GovInput): number => i.people.length + (i.residents ?? 0);

describe('GovInput.ludnosc', () => {
  it('GovInput.ludnosc równe populacja(st).razem na trzech demach i po przyjęciu uchodźców', () => {
    for (const klucz of DEMA) {
      const sim = newGame(klucz);
      const st = sim.st;
      const w = demoWorld(klucz);
      const sprawdz = (co: string) => {
        const i = govInput(st, w, 0);
        expect(i.ludnosc, `${klucz}: ${co}`).toBe(populacja(st).razem);
        expect(i.ludnosc, `${klucz}: ${co} (zarząd + mieszkańcy)`).toBe(dzisiaj(i));
        return i.ludnosc!;
      };
      const start = sprawdz('start');
      expect(start).toBeGreaterThanOrEqual(4);
      // uchodźcy przychodzą zza bramy (fx.residents), nikt nie znika, kto nie ma łóżka
      applyGov(
        st,
        w,
        fx((e) => (e.residents = 3)),
      );
      const po = sprawdz('po przyjęciu uchodźców');
      // w domu jednorodzinnym (Zielonki) mieszkańcy nie mają mieszkań i nikt nie przychodzi
      const dodani = klucz === 'zielonki' ? 0 : 3;
      expect(po).toBe(start + dodani);
      // osoba dołącza do zarządu (fx.join)
      applyGov(
        st,
        w,
        fx((e) => {
          e.join = [makePerson(mulberry(77), new Set(st.people.map((q) => q.first)), () => st.nextId++)];
        }),
      );
      expect(sprawdz('po dołączeniu do zarządu')).toBe(po + 1);
      // wyprawa za mapą dalej jest w zarządzie
      core(sim)[0].away = true;
      expect(sprawdz('z wyprawą')).toBe(po + 1);
      // wyprowadzka części mieszkańców
      applyGov(
        st,
        w,
        fx((e) => (e.residents = -2)),
      );
      expect(sprawdz('po wyprowadzce')).toBe(po + 1 - Math.min(2, dodani));
      // przebieg gry bez zmian w liczbie: nikt nie ginie bez powodu, a gości i sąsiadów nie wlicza
      for (let k = 0; k < 400; k++) sim.step();
      sprawdz('po 400 krokach');
    }
  });

  it('goście i sąsiedzi na mapie nie zmieniają ludności', () => {
    const sim = newGame('lanciego');
    const st = sim.st;
    const w = demoWorld('lanciego');
    const przed = govInput(st, w, 0).ludnosc;
    const wzor = st.pawns.find((p) => p.kind === 'resident')!;
    let id = 9000;
    for (const kind of ['sasiad', 'szabrownik', 'zombie', 'handlarz', 'wedrowiec', 'obcy', 'zbir'] as const)
      st.pawns.push({ ...structuredClone(wzor), id: id++, kind });
    expect(govInput(st, w, 0).ludnosc).toBe(przed);
  });

  it('to samo pole czyta droga do zwycięstwa (ludnoscOf)', () => {
    const sim = newGame('przymorze');
    const i = govInput(sim.st, demoWorld('przymorze'), 0);
    expect(ludnoscOf(i)).toBe(populacja(sim.st).razem);
  });
});

describe('EventHost.pop()', () => {
  const host = (i: GovInput) => makeHost(newGov(3), i, emptyEffects());

  it('EventHost.pop() przez ludnoscOf daje to samo co dziś', () => {
    for (const klucz of DEMA) {
      const sim: Sim = newGame(klucz);
      const w = demoWorld(klucz);
      const i = govInput(sim.st, w, 0);
      expect(host(i).pop(), klucz).toBe(dzisiaj(i));
      expect(host(i).pop(), klucz).toBe(ludnoscOf(i));
      expect(host(i).pop(), klucz).toBe(populacja(sim.st).razem);
      // po przyjęciu uchodźców tak samo
      applyGov(
        sim.st,
        w,
        fx((e) => (e.residents = 2)),
      );
      const po = govInput(sim.st, w, 0);
      expect(host(po).pop(), `${klucz} po uchodźcach`).toBe(dzisiaj(po));
    }
  });

  it('pop() jest jednym źródłem z ludnoscOf: pole ludnosc wygrywa, a bez niego zarząd i mieszkańcy', () => {
    const sim = newGame('lanciego');
    const i = govInput(sim.st, demoWorld('lanciego'), 0);
    expect(host({ ...i, ludnosc: 31 }).pop()).toBe(31);
    expect(host({ ...i, ludnosc: undefined }).pop()).toBe(dzisiaj(i));
    expect(host({ ...i, ludnosc: undefined, residents: undefined }).pop()).toBe(i.people.length);
  });
});
