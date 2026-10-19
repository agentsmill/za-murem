/* Rodzaj pracy „Badania” w tabeli Pracy (src/sim/praca.ts) razem z drogą technologii, etap 1 (src/sim/badania.ts): ery 3–6
   są zakryte (`dziala: false`, na tablicy odwrócone), każda fabryka należy do jednego trybu gry, a sieć bez miedzi
   odblokowuje „Włączyć sieć”. Kolumna Badania nie może zlecić badania zakrytego ani niedostępnego: nikt sam nie siada do
   stołu, kolumna pokazuje zero zleceń, a polecenie wyboru takiego badania nic nie zmienia. Po scaleniu `praca-ludzi`
   z `noc-integracja` f13ad36. Sceny są małe: jedna osoba pracuje (z umiejętnością 4 we wszystkich dziedzinach, więc
   domyślny priorytet Badań to 1), reszta zarządu i mieszkańcy na wyprawie, dzień 2, 6:00 po samouczku, pracownia stoi. */

import { describe, expect, it } from 'vitest';
import { kartka, siecZbadana, TECH_BY, TECHS } from '../../src/sim/badania.ts';
import { type BuildKind, footprint } from '../../src/sim/budowle.ts';
import { TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { tickAt } from '../../src/sim/handlarz.ts';
import { priorytet, RODZAJE } from '../../src/sim/praca.ts';
import { BURN_TICKS, type Pawn, type Sim, type Thing } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import { modeOf } from '../../src/sim/tryb.ts';
import { allowedAnchors } from '../../src/ui/budowa.ts';
import { skonczSamouczek } from './praca-pomoc.ts';
import { core, demoWorld, newGame } from './sasiedzi-pomoc.ts';

const KLUCZ = 'przymorze';
const w = demoWorld(KLUCZ);

interface Prywatne {
  koza(): Thing | undefined;
  ileZlecen(r: 'badania'): number;
}
const prv = (sim: Sim): Prywatne => sim as unknown as Prywatne;

/** gotowa pracownia postawiona od razu (jak po finishBuild) w pierwszym miejscu, które canPlace przepuszcza */
function postawPracownie(sim: Sim): void {
  const st = sim.st;
  const kind: BuildKind = 'pracownia';
  const i = allowedAnchors(st, w, kind, 0)[0];
  const f = footprint(kind, 0);
  st.things.push({
    id: st.nextThing++,
    kind,
    x: i % w.size,
    y: Math.floor(i / w.size),
    w: f.w,
    h: f.h,
    rot: 0,
    n: 0,
    fuel: 0,
    by: -1,
    owner: -1,
  });
}

/** Gra na Przymorzu z pracownią, jedna osoba pracuje i ma wszystko na 0 poza Ogniem i Badaniami (Badania na 1) */
function scena(tryb: 'zwykly' | 'zombie') {
  const sim = newGame(KLUCZ, tryb, 5);
  sim.step();
  const st = sim.st;
  skonczSamouczek(sim);
  st.tick = tickAt(2, 6);
  st.pawns = st.pawns.filter((p) => p.kind !== 'zombie');
  for (const q of st.pawns) if (q.kind === 'resident') q.away = true;
  const wszyscy = core(sim);
  const p = wszyscy[0];
  for (const q of wszyscy) {
    q.away = q !== p;
    q.needs!.food = 90;
    q.needs!.rest = 90;
    q.needs!.warm = 60;
  }
  st.people[p.person].skills = { bud: 4, cieplo: 4, elek: 4, med: 4, uprawa: 4, it: 4, obrona: 4 };
  prv(sim).koza()!.fuel = 3 * BURN_TICKS;
  postawPracownie(sim);
  for (const r of RODZAJE) {
    if (r === 'ogien') continue;
    sim.push({ t: 'prio', ids: [], osoba: p.person, rodzaj: r, prio: r === 'badania' ? 1 : 0 });
  }
  sim.step();
  p.job = null;
  p.path = [];
  p.pi = 0;
  p.carry = 0;
  p.wait = st.tick;
  return { sim, p };
}

/** pierwsza technologia o podanej własności z drzewka */
const techId = (ok: (t: (typeof TECHS)[number]) => boolean): string => {
  const t = TECHS.find(ok);
  if (!t) throw new Error('brak technologii do próby');
  return t.id;
};

const badajacy = (sim: Sim): Pawn[] => sim.st.pawns.filter((q) => q.job?.t === 'research');

describe('kolumna Badania nie zleca badania zakrytego ani niedostępnego', () => {
  const przypadki: { opis: string; tryb: 'zwykly' | 'zombie'; id: () => string; stan: string }[] = [
    {
      opis: 'era 3 (zakryta, czeka na prąd)',
      tryb: 'zwykly',
      id: () => techId((t) => t.era === 3 && !t.dziala),
      stan: 'odwrocona',
    },
    {
      opis: 'generator fuzji (najpierw sieć bez miedzi i ery czekające na prąd)',
      tryb: 'zwykly',
      id: () => 't_fuzja',
      stan: 'najpierw',
    },
    {
      opis: 'fabryka humanoidów w zwykłej grze (tylko tryb zombie)',
      tryb: 'zwykly',
      id: () => 't_fabryka_hum',
      stan: 'odwrocona',
    },
    {
      opis: 'fabryka biorobotów w trybie zombie (tylko zwykła gra)',
      tryb: 'zombie',
      id: () => 't_fabryka_bio',
      stan: 'odwrocona',
    },
  ];

  for (const k of przypadki) {
    it(`${k.opis}: nikt sam nie siada do stołu, kolumna ma zero zleceń`, () => {
      const { sim, p } = scena(k.tryb);
      const id = k.id();
      expect(Object.hasOwn(TECH_BY, id)).toBe(true);
      expect(modeOf(sim.st)).toBe(k.tryb);
      // wybór wymuszony wprost w stanie (jak w starym zapisie): polecenie `research` by go nie przepuściło
      sim.st.research = { cur: id, prog: {}, at: {} };
      const stan = kartka(sim.st, id, k.tryb).stan;
      expect(stan).not.toBe('w_toku');
      expect(['odwrocona', 'najpierw']).toContain(stan);
      // osoba z umiejętnością w dziedzinie ma Badania na 1, ale nie ma czego robić
      expect(priorytet(sim.st, p.person, 'badania')).toBe(1);
      expect(prv(sim).ileZlecen('badania')).toBe(0);
      expect(snapshot(sim.st, w).praca.widoczne).toContain('badania');
      for (let n = 0; n < 2 * TICKS_PER_HOUR; n++) {
        sim.step();
        expect(badajacy(sim), `krok ${n}`).toHaveLength(0);
      }
    });
  }

  it('polecenie wyboru zakrytego badania, badania innego trybu i badania bez wymagań nic nie zmienia', () => {
    for (const tryb of ['zwykly', 'zombie'] as const) {
      const { sim } = scena(tryb);
      const zakryte = [
        techId((t) => t.era === 3 && !t.dziala),
        tryb === 'zwykly' ? 't_fabryka_hum' : 't_fabryka_bio',
        't_fuzja',
      ];
      for (const id of zakryte) {
        sim.push({ t: 'research', ids: [], tech: id });
        sim.step();
        expect(sim.st.research?.cur ?? null, `${tryb}: ${id}`).toBeNull();
      }
      // zwykła technologia pierwszej ery wybiera się bez przeszkód
      sim.push({ t: 'research', ids: [], tech: 't_okna' });
      sim.step();
      expect(sim.st.research?.cur).toBe('t_okna');
    }
  });

  it('badanie, którego wiedza osady nie starcza (kartka „stoi”), też nie sadza nikogo przy stole', () => {
    const { sim, p } = scena('zwykly');
    sim.st.research = { cur: 't_okna', prog: {}, at: {} };
    // nikt w osadzie nie zna dziedziny: wiedza poniżej progu kartki
    for (const o of sim.st.people) o.skills = {};
    const stan = kartka(sim.st, 't_okna', 'zwykly').stan;
    expect(stan).toBe('stoi');
    expect(prv(sim).ileZlecen('badania')).toBe(0);
    for (let n = 0; n < TICKS_PER_HOUR; n++) sim.step();
    expect(badajacy(sim)).toHaveLength(0);
    expect(p.job?.t).not.toBe('research');
  });

  it('sieć bez miedzi odblokowuje „Włączyć sieć” bez fabryki, a fabryka drugiego trybu nie daje celu', () => {
    const { sim } = scena('zwykly');
    sim.st.techDone = ['t_siec'];
    expect(siecZbadana(sim.st)).toBe(true);
    // pozytywna kontrola: zwykła technologia z wiedzą jest do wzięcia i sadza osobę przy stole
    sim.st.research = { cur: 't_okna', prog: {}, at: {} };
    expect(kartka(sim.st, 't_okna', 'zwykly').stan).toBe('w_toku');
    expect(prv(sim).ileZlecen('badania')).toBeGreaterThan(0);
    for (let n = 0; n < 600 && !badajacy(sim).length; n++) sim.step();
    expect(badajacy(sim)).toHaveLength(1);
  });
});
