/* Wiki, kategoria „Zarząd” (src/ui/wiki-zarzad.ts): wiersze dziennego dryfu zaufania i wkurzenia sprawdzone na `dailyDrift`
   po obu stronach każdego progu, uchwały z `M1_LAWS`, `lawEffects`, `raidChance` i `defenseAt`, tytuły końców i raportu oraz
   przypięcia liczb zarządu, które siedzą w kodzie na stałe (kolory czipów, kara za pominięcie uchwały, bramka na kłódkę). */

import { afterEach, describe, expect, it } from 'vitest';
import { ENDINGS, LAW_CD, PATHS } from '../../src/content/data.ts';
import { ustawJezyk } from '../../src/core/jezyk.ts';
import { defenseAt, raidChance } from '../../src/gov/noc.ts';
import { FIRST_LAWS, M1_LAWS } from '../../src/gov/tresc.ts';
import { dailyDrift, lawEffects } from '../../src/gov/uchwaly.ts';
import { LAW_HOUR, LAW_MINUTE, newGov } from '../../src/gov/zarzad.ts';
import type { Needs } from '../../src/sim/needs.ts';
import { GUARD_UNTIL } from '../../src/sim/sim.ts';
import { signed } from '../../src/ui/tekst.ts';
import { type Artykul, artykul } from '../../src/ui/wiki.ts';
import { sondaOsoba, sondaStan, sondaStanZUchwalami, sondaWejscie } from '../../src/ui/wiki-sondy.ts';
import { ZARZAD } from '../../src/ui/wiki-zarzad.ts';
import { kontekst, zrodlo } from './wiki-pomoc.ts';

afterEach(() => ustawJezyk('pl'));

const ART = (id: string, wariant: 'blok' | 'dom' = 'blok'): Artykul => {
  const a = artykul(id, kontekst(wariant));
  if (!a) throw new Error(`brak artykułu ${id}`);
  return a;
};
const FAKT = (a: Artykul, id: string): string => {
  const f = a.fakty.find((x) => x.id === id);
  if (!f) throw new Error(`${a.id}: brak faktu ${id} (${a.fakty.map((x) => x.id).join(', ')})`);
  return f.v;
};

/** dzienny dryf [zaufanie, wkurzenie] dla jednej osoby o neutralnych potrzebach z podmianą */
function dryf(
  needs: Partial<Needs> = {},
  o: { ognisko?: boolean; spalone?: number; cechy?: string[] } = {},
): [number, number] {
  const st = sondaStan();
  st.evening.campfire = !!o.ognisko;
  const i = sondaWejscie({
    people: [sondaOsoba({ needs: { warm: 50, food: 40, safe: 50, ...needs } as Needs, traits: o.cechy ?? [] })],
    burned: Array.from({ length: o.spalone ?? 0 }, () => ({})) as never,
  });
  return dailyDrift(st, i);
}
const zaokr = (v: number): number => Math.round(v * 100) / 100;

describe('dryf zaufania i wkurzenia: wiersze z progami', () => {
  const NAZWA: Record<string, keyof Needs> = { Ciepło: 'warm', Najedzenie: 'food', Bezpieczeństwo: 'safe' };

  /** różnica dryfu (miara 0: zaufanie, 1: wkurzenie) między stroną progu, której dotyczy wiersz, a neutralną wartością */
  function sprawdz(a: Artykul, miara: 0 | 1): number {
    let wiersze = 0;
    for (const f of a.fakty) {
      const m = /^(Ciepło|Najedzenie|Bezpieczeństwo) (poniżej|od|powyżej) (\d+)$/.exec(f.k);
      if (!m) continue;
      wiersze++;
      const klucz = NAZWA[m[1]];
      const prog = Number(m[3]);
      const wartosc = (v: number) => dryf({ [klucz]: v })[miara];
      const neutralna = dryf()[miara];
      // wiersz mówi o skutku względem neutralnego dnia; liczymy go na wartości po właściwej stronie progu i tuż przed nim
      const po = m[2] === 'poniżej' ? prog - 0.5 : m[2] === 'od' ? prog : prog + 0.5;
      const przed = m[2] === 'poniżej' ? prog : m[2] === 'od' ? prog - 0.5 : prog;
      expect(zaokr(wartosc(po) - wartosc(przed)), f.k).not.toBe(0);
      const efekt = zaokr(wartosc(po) - neutralna);
      expect(f.v, f.k).toBe(`${signed(efekt)} dziennie, gdy dotyczy wszystkich`);
    }
    return wiersze;
  }

  it('zaufanie: zimno, ciepło, najedzenie, bezpieczeństwo', () => {
    expect(sprawdz(ART('zarzad:zaufanie'), 0)).toBe(4);
  });

  it('wkurzenie: zimno, głód, najedzenie, strach', () => {
    expect(sprawdz(ART('zarzad:wkurzenie'), 1)).toBe(4);
  });

  it('dryf bez niczego dobrego ani złego i dodatki: ognisko, meble, cechy', () => {
    const t = ART('zarzad:zaufanie');
    const w = ART('zarzad:wkurzenie');
    expect(FAKT(t, 'baza')).toBe(`${signed(dryf()[0])} dziennie`);
    expect(FAKT(w, 'baza')).toBe(`${signed(dryf()[1])} dziennie`);
    expect(FAKT(w, 'ognisko')).toBe(`${signed(zaokr(dryf({}, { ognisko: true })[1] - dryf()[1]))} dziennie`);
    expect(FAKT(w, 'meble')).toContain(signed(zaokr(dryf({}, { spalone: 1 })[1] - dryf()[1])));
    expect(FAKT(t, 'lubiany')).toBe(`${signed(zaokr(dryf({}, { cechy: ['lubiany'] })[0] - dryf()[0]))} dziennie`);
    expect(FAKT(w, 'klotliwy')).toBe(`${signed(zaokr(dryf({}, { cechy: ['klotliwy'] })[1] - dryf()[1]))} dziennie`);
    expect(FAKT(w, 'optymista')).toBe(`${signed(zaokr(dryf({}, { cechy: ['optymista'] })[1] - dryf()[1]))} dziennie`);
  });

  it('start gry: zaufanie i wkurzenie z `newGov`', () => {
    const st = newGov(1);
    expect(ZARZAD.start).toEqual([st.trust, st.anger]);
    expect(FAKT(ART('zarzad:zaufanie'), 'start')).toBe(String(st.trust));
    expect(FAKT(ART('zarzad:wkurzenie'), 'start')).toBe(String(st.anger));
  });
});

describe('uchwały: fakty z M1_LAWS i z funkcji zarządu', () => {
  const ids = Object.keys(M1_LAWS);

  it('droga, wymagania, skutek od razu i co rano są z tabeli', () => {
    for (const id of ids) {
      const l = M1_LAWS[id];
      const a = ART(`uchwala:${id}`);
      expect(FAKT(a, 'sciezka'), id).toBe(PATHS[l.path]);
      if (l.req) expect(FAKT(a, 'wymaga'), id).toContain('„');
      if (!l.req) expect(FAKT(a, 'wymaga'), id).toBe('nic');
      const od = FAKT(a, 'od-razu');
      if (l.imm?.[0]) expect(od, id).toContain(`zaufanie ${signed(l.imm[0])}`);
      if (l.imm?.[1]) expect(od, id).toContain(`wkurzenie ${signed(l.imm[1])}`);
      if (!l.imm) expect(od, id).toBe('brak');
      const dz = FAKT(a, 'dziennie');
      if (l.daily?.[0]) expect(dz, id).toContain(`zaufanie ${signed(l.daily[0])}`);
      if (l.daily?.[1]) expect(dz, id).toContain(`wkurzenie ${signed(l.daily[1])}`);
      if (!l.daily) expect(dz, id).toBe('brak');
      expect(FAKT(a, 'pierwszy'), id).toBe((FIRST_LAWS as readonly string[]).includes(id) ? 'jest' : 'nie ma');
    }
  });

  it('warty i brama: obrona bramy, siła warty i szansa napadu', () => {
    const i = sondaWejscie();
    const bez = sondaStan();
    const warty = sondaStanZUchwalami('u_warty');
    expect(FAKT(ART('uchwala:u_warty'), 'obrona')).toBe(
      signed(defenseAt(warty, i, 'brama', []) - defenseAt(bez, i, 'brama', [])),
    );
    const ile = (id: string) => Math.round((raidChance(sondaStanZUchwalami(id), i) - raidChance(bez, i)) * 100);
    expect(FAKT(ART('uchwala:u_warty'), 'napad')).toBe(`${signed(ile('u_warty'), 0)} pkt`);
    expect(FAKT(ART('uchwala:u_brama'), 'napad')).toBe(`${signed(ile('u_brama'), 0)} pkt`);
    expect(FAKT(ART('uchwala:u_warty'), 'warta')).toBe('×1,25');
    expect(lawEffects(sondaStanZUchwalami('u_brama')).gateClosed).toBe(true);
    expect(FAKT(ART('uchwala:u_brama'), 'zamknieta')).toBe(`${ZARZAD.bramaZamyka}:00–${GUARD_UNTIL}:00`);
  });

  it('jedzenie, meble i zebrania: mnożniki z lawEffects', () => {
    const e = (id: string) => lawEffects(sondaStanZUchwalami(id));
    expect(FAKT(ART('uchwala:u_racje'), 'porcja')).toBe(`×${String(e('u_racje').foodMult).replace('.', ',')}`);
    expect(FAKT(ART('uchwala:u_kociol'), 'porcja')).toBe(`×${String(e('u_kociol').foodMult).replace('.', ',')}`);
    expect(e('u_kociol').sharedMeals).toBe(true);
    expect(FAKT(ART('uchwala:u_meble'), 'kara')).toBe(`×${String(e('u_meble').burnMood).replace('.', ',')}`);
    expect(e('u_zebrania').workStart).toBe(9);
    expect(FAKT(ART('uchwala:u_zebrania'), 'start')).toBe('9:00 zamiast 8:00');
  });

  it('podpisana uchwała zostaje na stałe: nic w grze jej nie cofa', () => {
    for (const plik of [
      'src/gov/uchwaly.ts',
      'src/gov/zarzad.ts',
      'src/gov/wydarzenia.ts',
      'src/gov/noc.ts',
      'src/gov/zwyciestwo.ts',
    ]) {
      const kod = zrodlo(plik);
      expect(kod, plik).not.toMatch(/signed\[[^\]]+\] = false|delete [\w.]*signed\[/);
    }
    expect(zrodlo('src/gov/uchwaly.ts')).toContain('st.laws.signed[id] = true;');
  });

  it('zebranie: godzina, termin, odstęp i pierwsza lista', () => {
    const a = ART('zarzad:zebranie');
    expect(FAKT(a, 'godzina')).toBe(`${LAW_HOUR}:${LAW_MINUTE}`);
    expect(FAKT(a, 'odstep')).toBe(`${LAW_CD / 60} h`);
    expect(FIRST_LAWS.length).toBe(3);
    expect(ART('zarzad:uchwaly').fakty.length).toBe(ids.length);
  });
});

describe('przypięcia liczb zarządu do kodu', () => {
  it('kolory czipów zaufania i wkurzenia', () => {
    const pasek = zrodlo('src/ui/pasek.ts');
    const [zz, zy] = ZARZAD.czipZaufanie;
    const [wz, wy] = ZARZAD.czipWkurzenie;
    expect(pasek).toContain(`trust < ${zz} ? 'bad' : trust < ${zy} ? 'mid' : 'ok'`);
    expect(pasek).toContain(`anger > ${wz} ? 'bad' : anger > ${wy} ? 'mid' : 'ok'`);
  });

  it('pominięcie pierwszej uchwały, zaufanie za wyprawę z łupem i brama na kłódkę', () => {
    expect(zrodlo('src/gov/zarzad.ts')).toContain(`if (st.lawDay === 1) mood(st, ${ZARZAD.pominiecie}, 0);`);
    expect(zrodlo('src/gov/noc.ts')).toContain(`mood(st, ${ZARZAD.lupWyprawy}, 0);`);
    const sim = zrodlo('src/sim/sim.ts');
    expect(sim).toContain(`if (h === ${ZARZAD.bramaZamyka}) this.setGate(false);`);
    expect(sim).toContain("else if (h === GUARD_UNTIL && modeOf(st) !== 'zombie') this.setGate(true);");
  });

  it('koniec gry: wkurzenie 100, zaufanie 0, nikogo w zarządzie', () => {
    const z = zrodlo('src/gov/zarzad.ts');
    expect(z).toContain("if (!i.people.length) st.over = 'pustka';");
    expect(z).toContain("else if (st.anger >= 100) st.over = 'odwolanie';");
    expect(z).toContain("else if (st.trust <= 0) st.over = 'exodus';");
    const a = ART('zarzad:koniec');
    expect(FAKT(a, 'odwolanie')).toBe(ENDINGS.odwolanie.title);
    expect(FAKT(a, 'exodus')).toBe(ENDINGS.exodus.title);
    expect(FAKT(a, 'pustka')).toBe(ENDINGS.pustka.title);
  });

  it('raport: napisy okna i tytuły', () => {
    const okna = zrodlo('src/ui/okna.ts');
    for (const f of [
      "L('Kuchnia rano', 'Kitchen this morning')",
      "L('Zabrali', 'Taken')",
      "L('Z wypraw', 'Brought back')",
      "L('Ranni', 'Hurt')",
      "L('Nowy dzień', 'New day')",
      "L('Podpisać', 'Sign')",
      "L('Nic dziś nie uchwalamy', 'No resolution today')",
    ])
      expect(okna, f).toContain(f);
    expect(FAKT(ART('zarzad:raport'), 'tytuly')).toBe('Spokojna noc / Napad odparty / Szabrownicy weszli');
  });
});
