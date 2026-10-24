/* Wiki, kategoria „Praca” (src/ui/wiki-praca.ts): zdania o pracy bez poleceń, wychodzeniu za siatkę i kuchni, które wiki
   pisze ręcznie, stoją w kodzie gry w tej postaci, a listy i progi w faktach są z tabel (NOWE, PROGI_DOMYSLNE, KROK_PROGU). */

import { afterEach, describe, expect, it } from 'vitest';
import { ustawJezyk } from '../../src/core/jezyk.ts';
import { NOWE, PROG_MAX, PROGI_DOMYSLNE, RODZAJE, ZAPAS_OPALU } from '../../src/sim/praca.ts';
import { WZNOW_PROBY } from '../../src/sim/sim.ts';
import { type Artykul, artykul } from '../../src/ui/wiki.ts';
import { rodzajNazwa } from '../../src/ui/wiki-praca.ts';
import { kontekst, zrodlo } from './wiki-pomoc.ts';

afterEach(() => ustawJezyk('pl'));

const ART = (id: string): Artykul => {
  const a = artykul(id, kontekst('blok'));
  if (!a) throw new Error(`brak artykułu ${id}`);
  return a;
};
const FAKT = (a: Artykul, id: string): string => {
  const f = a.fakty.find((x) => x.id === id);
  if (!f) throw new Error(`${a.id}: brak faktu ${id}`);
  return f.v;
};

describe('praca bez poleceń: zdania wpisane ręcznie stoją w kodzie', () => {
  it('nocą pracują tylko Ogień i Kuchnia', () => {
    expect(zrodlo('src/sim/sim.ts')).toContain("if (noc && r !== 'ogien' && r !== 'kuchnia') continue;");
    expect(ART('praca:automat').zdania.join(' ')).toContain('Nocą pracują tylko Ogień i Kuchnia');
  });

  it('pierwszy ranek: dzień 2 o 6:00 po samouczku, najpóźniej dzień 3 o 6:00', () => {
    const praca = zrodlo('src/sim/praca.ts');
    expect(praca).toContain('if (od(3)) return true;');
    expect(praca).toContain('return od(2) && (st.tut.step === TUT_STEPS.length || st.tut.step === -1);');
    expect(praca).toContain('return d > dzien || (d === dzien && hourOf(st.tick) >= 6);');
    expect(FAKT(ART('praca:automat'), 'start')).toBe('dzień 2 o 6:00 po samouczku, a najpóźniej dzień 3 o 6:00');
  });

  it('rodzaje od pierwszego ranka to NOWE', () => {
    const v = FAKT(ART('praca:automat'), 'nowe');
    for (const r of RODZAJE) expect(v.includes(rodzajNazwa(r)), r).toBe(NOWE.has(r));
  });

  it('za siatkę bez polecenia wychodzi tylko osoba z przełącznikiem, za dnia i bez wroga w pobliżu', () => {
    const sim = zrodlo('src/sim/sim.ts');
    expect(sim).toContain("if (p.kind !== 'core' || !zaSiatke(this.st, p.person) || this.night()) return false;");
    expect(sim).toContain('return !this.wrogBlisko([tile, this.tileOf(p), this.exitTile]);');
    const a = ART('praca:zasiatke');
    expect(FAKT(a, 'zwykly')).toBe('włączony');
    expect(FAKT(a, 'zombie')).toBe('wyłączony');
    expect(zrodlo('src/sim/praca.ts')).toContain("return modeOf(st) !== 'zombie';");
  });

  it('kuchnia gotuje raz dziennie godzinę przed obiadem, gdy jest kuchnia społeczna albo wspólny kocioł', () => {
    const sim = zrodlo('src/sim/sim.ts');
    expect(sim).toContain("return this.st.laws.sharedMeals || this.hasBuilt('kuchnia_spoleczna');");
    expect(sim).toContain('return MEAL_HOURS.some((mh) => h === mh - 1)');
  });

  it('rozkaz przerwany walką wraca WZNOW_PROBY − 1 razy', () => {
    expect(ART('praca:polecenia').zdania.join(' ')).toContain(`najwyżej ${WZNOW_PROBY - 1} razy`);
  });

  it('progi zapasów są z tabeli', () => {
    const a = ART('praca:zapas');
    expect(FAKT(a, 'drewno')).toBe(String(PROGI_DOMYSLNE.drewno));
    expect(FAKT(a, 'deski')).toBe(String(PROGI_DOMYSLNE.deski));
    expect(FAKT(a, 'czesci')).toBe(String(PROGI_DOMYSLNE.czesci));
    expect(FAKT(a, 'rezerwa')).toContain(String(ZAPAS_OPALU));
    expect(FAKT(a, 'max')).toBe(String(PROG_MAX));
  });
});
