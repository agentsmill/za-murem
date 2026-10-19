/* Stan badań, wiedza osady, stany kartek i tempo (docs/superpowers/specs/2026-10-19-badania-design.md, sekcje „Wiedza”,
   „Tempo” i „Stan, polecenia, determinizm”). Stan z createSim na Przymorzu (jak w budowle-tech.test.ts), umiejętności
   i osoby ustawione ręcznie, żeby wynik nie zależał od losowania fachów. */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Dom } from '../../src/content/data.ts';
import type { Person } from '../../src/content/people.ts';
import { hashString } from '../../src/core/rng.ts';
import {
  badaniaDom,
  badaniaWidoczne,
  eraBadan,
  kartka,
  koncowaZbadana,
  kosztTech,
  krzywaUmiejetnosci,
  TECH_BY,
  TEMPO_BAZOWE,
  type TechNowa,
  tempoOsoby,
  wiedza,
} from '../../src/sim/badania.ts';
import { createSim, Sim, type SimState } from '../../src/sim/sim.ts';
import { buildWorld } from '../../src/world/world.ts';

const d = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../public/demo/przymorze.json'), 'utf8'));
const seed = Number.parseInt(hashString(d.addr), 16) || 2051;
const w = buildWorld(d.geo, { seed, street: d.street });

/** świeży stan, w którym nikt nie ma żadnej umiejętności (losowe fachy nie mieszają w wynikach) */
function stan(): SimState {
  const st = createSim(w, seed, { core: 4 });
  for (const o of st.people) o.skills = {};
  return st;
}

/** pionek zarządu numer k (kolejność z createSim) i jego osoba */
const zarzad = (st: SimState, k: number) => {
  const p = st.pawns.filter((q) => q.kind === 'core')[k];
  return { p, o: st.people[p.person] };
};

/** pierwszy mieszkaniec siedziby bez osoby dostaje nową osobę z podanymi umiejętnościami */
function dajOsobeLokatorowi(st: SimState, skills: Partial<Record<Dom, number>>) {
  const p = st.pawns.find((q) => q.kind === 'resident' && q.person < 0);
  if (!p) throw new Error('Brak lokatora bez osoby');
  st.people.push({ ...structuredClone(st.people[0]), id: `lok-${p.id}`, skills });
  p.person = st.people.length - 1;
  return p;
}

const osoba = (skills: Partial<Record<Dom, number>>, traits: string[] = []): Pick<Person, 'skills' | 'traits'> => ({
  skills,
  traits,
});

/** czynności przywracające dane technologii po teście, w kolejności odwrotnej do zmian */
let przywroc: Array<() => void> = [];

/** zmienia pole technologii na czas jednego testu: zapamiętuje, czy pole było i jaką miało wartość, a po teście
    przywraca dokładnie to (brak pola zostaje brakiem pola) */
function tymczasowo<K extends 'wymagaBudowli' | 'tryb'>(id: string, pole: K, wartosc: TechNowa[K]): void {
  const t = TECH_BY[id];
  const mialo = Object.hasOwn(t, pole);
  const stara = t[pole];
  t[pole] = wartosc;
  przywroc.push(() => {
    if (mialo) t[pole] = stara;
    else delete t[pole];
  });
}

afterEach(() => {
  for (const f of przywroc.reverse()) f();
  przywroc = [];
});

describe('badania: wiedza osady', () => {
  it('bierze najwyższą umiejętność w dziedzinie wśród zarządu', () => {
    const st = stan();
    expect(wiedza(st, 'bud')).toBe(0);
    zarzad(st, 0).o.skills = { bud: 1, med: 2 };
    zarzad(st, 2).o.skills = { bud: 3 };
    expect(wiedza(st, 'bud')).toBe(3);
    expect(wiedza(st, 'med')).toBe(2);
    expect(wiedza(st, 'it')).toBe(0);
  });

  it('lokator siedziby z osobą się liczy, lokator bez osoby i pionki spoza osady z osobą nie', () => {
    const st = stan();
    // osoba z najwyższą umiejętnością leży na końcu listy, więc wyjdzie przy błędnym indeksie −1 (at(-1))
    st.people.push({ ...structuredClone(st.people[0]), id: 'ostatnia', skills: { bud: 5 } });
    const iOstatnia = st.people.length - 1;
    const bezOsoby = st.pawns.filter((q) => q.kind === 'resident' && q.person < 0);
    expect(bezOsoby.length).toBeGreaterThanOrEqual(3);
    const [lokator, sasiad, szabrownik] = bezOsoby;
    expect(wiedza(st, 'bud')).toBe(0);

    // ta sama osoba liczy się u lokatora siedziby, a u pionków spoza osady nie
    lokator.person = iOstatnia;
    expect(wiedza(st, 'bud')).toBe(5);
    lokator.person = -1;
    sasiad.kind = 'sasiad';
    sasiad.person = iOstatnia;
    szabrownik.kind = 'szabrownik';
    szabrownik.person = iOstatnia;
    expect(wiedza(st, 'bud')).toBe(0);

    dajOsobeLokatorowi(st, { cieplo: 2 });
    expect(wiedza(st, 'cieplo')).toBe(2);
    expect(wiedza(st, 'bud')).toBe(0);
  });

  it('osoba na wyprawie się nie liczy, po powrocie znowu tak', () => {
    const st = stan();
    const { p, o } = zarzad(st, 1);
    o.skills = { elek: 3 };
    expect(wiedza(st, 'elek')).toBe(3);
    p.away = true;
    expect(wiedza(st, 'elek')).toBe(0);
    const lokator = dajOsobeLokatorowi(st, { elek: 2 });
    expect(wiedza(st, 'elek')).toBe(2);
    lokator.away = true;
    expect(wiedza(st, 'elek')).toBe(0);
    p.away = false;
    expect(wiedza(st, 'elek')).toBe(3);
  });

  it('książki dodają do wiedzy najwyżej 2 na dziedzinę', () => {
    const st = stan();
    zarzad(st, 0).o.skills = { uprawa: 1 };
    st.books = { uprawa: 1 };
    expect(wiedza(st, 'uprawa')).toBe(2);
    st.books = { uprawa: 2, med: 1 };
    expect(wiedza(st, 'uprawa')).toBe(3);
    expect(wiedza(st, 'med')).toBe(1);
    st.books = { uprawa: 7 };
    expect(wiedza(st, 'uprawa')).toBe(3);
    expect(wiedza(st, 'bud')).toBe(0);
  });
});

describe('badania: stany kartek', () => {
  it('t_okna jest do wzięcia przy wiedzy 1, a bez wiedzy „brak wiedzy” z ma 0 i trzeba 1', () => {
    const st = stan();
    const brak = kartka(st, 't_okna', 'zwykly');
    expect(brak).toEqual({
      id: 't_okna',
      stan: 'brak_wiedzy',
      postep: 0,
      koszt: kosztTech('t_okna'),
      brakuje: [],
      ma: 0,
      trzeba: 1,
    });
    zarzad(st, 0).o.skills = { bud: 1 };
    const wolna = kartka(st, 't_okna', 'zwykly');
    expect(wolna.stan).toBe('do_wziecia');
    expect(wolna.ma).toBe(1);
    expect(wolna.trzeba).toBe(1);
  });

  it('książka daje wiedzę, której brakuje osadzie', () => {
    const st = stan();
    st.books = { bud: 1 };
    expect(kartka(st, 't_okna', 'zwykly').stan).toBe('do_wziecia');
  });

  it('t_spawanie czeka na t_okna, a po zbadaniu jest do wzięcia przy wiedzy 2', () => {
    const st = stan();
    zarzad(st, 0).o.skills = { bud: 2 };
    const najpierw = kartka(st, 't_spawanie', 'zwykly');
    expect(najpierw.stan).toBe('najpierw');
    expect(najpierw.brakuje).toEqual(['t_okna']);
    expect(najpierw.ma).toBe(2);
    expect(najpierw.trzeba).toBe(2);
    st.techDone = ['t_okna'];
    const wolna = kartka(st, 't_spawanie', 'zwykly');
    expect(wolna.stan).toBe('do_wziecia');
    expect(wolna.brakuje).toEqual([]);
    zarzad(st, 0).o.skills = { bud: 1 };
    expect(kartka(st, 't_spawanie', 'zwykly').stan).toBe('brak_wiedzy');
  });

  it('technologia bez działania jest odwrócona, także gdy jej wymagania nie są zbadane', () => {
    const st = stan();
    expect(TECH_BY.t_panele.dziala).toBe(false);
    expect(kartka(st, 't_panele', 'zwykly').stan).toBe('odwrocona');
    st.techDone = ['t_okna', 't_spawanie'];
    zarzad(st, 0).o.skills = { elek: 4 };
    expect(kartka(st, 't_panele', 'zwykly').stan).toBe('odwrocona');
  });

  it('technologia z innego trybu gry jest odwrócona', () => {
    const st = stan();
    zarzad(st, 0).o.skills = { bud: 1 };
    tymczasowo('t_okna', 'tryb', 'zombie');
    expect(kartka(st, 't_okna', 'zwykly').stan).toBe('odwrocona');
    expect(kartka(st, 't_okna', 'zombie').stan).toBe('do_wziecia');
  });

  it('zbadana po wpisaniu do techDone, bez względu na wiedzę i wybór', () => {
    const st = stan();
    st.techDone = ['t_okna'];
    st.research = { cur: 't_okna', prog: { t_okna: 12 }, at: { t_okna: 100 } };
    const k = kartka(st, 't_okna', 'zwykly');
    expect(k.stan).toBe('zbadana');
    expect(k.brakuje).toEqual([]);
  });

  it('wymagana budowla działa jak wymagana technologia: najpierw, dopóki nie stoi', () => {
    const st = stan();
    zarzad(st, 0).o.skills = { bud: 1 };
    tymczasowo('t_okna', 'wymagaBudowli', ['warsztat']);
    const najpierw = kartka(st, 't_okna', 'zwykly');
    expect(najpierw.stan).toBe('najpierw');
    expect(najpierw.brakuje).toEqual(['warsztat']);
    expect(st.things.some((t) => t.kind === 'warsztat')).toBe(false);
    st.things.push({ ...structuredClone(st.things[0]), id: 9999, kind: 'warsztat' });
    expect(kartka(st, 't_okna', 'zwykly').stan).toBe('do_wziecia');
  });

  it('brakuje wymienia najpierw technologie, potem budowle', () => {
    const st = stan();
    tymczasowo('t_spawanie', 'wymagaBudowli', ['warsztat']);
    expect(kartka(st, 't_spawanie', 'zwykly').brakuje).toEqual(['t_okna', 'warsztat']);
  });

  it('wybrana technologia jest w toku, a gdy wiedza spadnie poniżej poziomu, stoi z zachowanym postępem', () => {
    const st = stan();
    const { o } = zarzad(st, 0);
    o.skills = { bud: 2 };
    st.techDone = ['t_okna'];
    st.research = { cur: 't_spawanie', prog: { t_spawanie: 7 }, at: {} };
    const wToku = kartka(st, 't_spawanie', 'zwykly');
    expect(wToku.stan).toBe('w_toku');
    expect(wToku.postep).toBe(7);
    expect(wToku.koszt).toBe(kosztTech('t_spawanie'));

    o.skills = { bud: 1 };
    const stoi = kartka(st, 't_spawanie', 'zwykly');
    expect(stoi.stan).toBe('stoi');
    expect(stoi.postep).toBe(7);
    expect(stoi.ma).toBe(1);
    expect(stoi.trzeba).toBe(2);

    // inna, niewybrana kartka w tej samej dziedzinie nie stoi, tylko czeka na wiedzę
    st.research.cur = null;
    expect(kartka(st, 't_spawanie', 'zwykly').stan).toBe('brak_wiedzy');
    expect(kartka(st, 't_spawanie', 'zwykly').postep).toBe(7);
  });

  it('wybrana technologia, której wymaganie zniknęło, jest „najpierw”, a nie w toku', () => {
    const st = stan();
    zarzad(st, 0).o.skills = { bud: 2 };
    st.research = { cur: 't_spawanie', prog: {}, at: {} };
    expect(kartka(st, 't_spawanie', 'zwykly').stan).toBe('najpierw');
  });

  it('nieznana technologia to błąd', () => {
    expect(() => kartka(stan(), 't_nie_ma', 'zwykly')).toThrow('Nieznana technologia');
  });
});

describe('badania: tempo', () => {
  it('krzywa umiejętności to 1 + 0,1 · poziom (bez umiejętności dzisiejsze tempo)', () => {
    expect(krzywaUmiejetnosci(0)).toBeCloseTo(1, 10);
    expect(krzywaUmiejetnosci(2)).toBeCloseTo(1.2, 10);
    expect(krzywaUmiejetnosci(4)).toBeCloseTo(1.4, 10);
  });

  it('bez umiejętności i cech tempo to TEMPO_BAZOWE · krzywa(0)', () => {
    expect(tempoOsoby(osoba({}), 'bud')).toBe(TEMPO_BAZOWE * krzywaUmiejetnosci(0));
    expect(tempoOsoby(osoba({ med: 3 }), 'bud')).toBe(TEMPO_BAZOWE * krzywaUmiejetnosci(0));
  });

  it('umiejętność w dziedzinie badania przyspiesza', () => {
    expect(tempoOsoby(osoba({ bud: 2 }), 'bud')).toBeGreaterThan(tempoOsoby(osoba({}), 'bud'));
    expect(tempoOsoby(osoba({ bud: 2 }), 'bud')).toBeCloseTo(TEMPO_BAZOWE * krzywaUmiejetnosci(2), 10);
  });

  it('pracowity bada szybciej niż bez cechy, a leniwy wolniej; Mistrz Excela +5%', () => {
    const bez = tempoOsoby(osoba({ bud: 1 }), 'bud');
    const pracowity = tempoOsoby(osoba({ bud: 1 }, ['pracowity']), 'bud');
    const leniwy = tempoOsoby(osoba({ bud: 1 }, ['leniwy']), 'bud');
    const excel = tempoOsoby(osoba({ bud: 1 }, ['excel']), 'bud');
    expect(pracowity).toBeGreaterThan(bez);
    expect(bez).toBeGreaterThan(leniwy);
    expect(pracowity / bez).toBeCloseTo(1.1, 10);
    expect(leniwy / bez).toBeCloseTo(0.9, 10);
    expect(excel / bez).toBeCloseTo(1.05, 10);
    expect(tempoOsoby(osoba({ bud: 1 }, ['pracowity', 'excel']), 'bud') / bez).toBeCloseTo(1.1 * 1.05, 10);
    // cechy bez wpływu na badania nic nie zmieniają
    expect(tempoOsoby(osoba({ bud: 1 }, ['odwazny', 'lubiany']), 'bud')).toBe(bez);
  });
});

describe('badania: odczyty stanu', () => {
  it('badaniaDom to dziedzina bieżącego badania, null bez badania', () => {
    const st = stan();
    expect(badaniaDom(st)).toBeNull();
    st.research = { cur: null, prog: {}, at: {} };
    expect(badaniaDom(st)).toBeNull();
    st.research.cur = 't_spawanie';
    expect(badaniaDom(st)).toBe('bud');
    st.research.cur = 't_kozy';
    expect(badaniaDom(st)).toBe('cieplo');
    st.research.cur = 't_nie_ma';
    expect(badaniaDom(st)).toBeNull();
  });

  it('badania są widoczne, gdy stoi pracownia albo stan badań już istnieje', () => {
    const st = stan();
    expect(badaniaWidoczne(st)).toBe(false);
    st.research = { cur: null, prog: {}, at: {} };
    expect(badaniaWidoczne(st)).toBe(true);
    delete st.research;
    expect(badaniaWidoczne(st)).toBe(false);
    st.things.push({ ...structuredClone(st.things[0]), id: 9999, kind: 'pracownia' });
    expect(badaniaWidoczne(st)).toBe(true);
  });

  it('eraBadan to najwyższa era zbadanych technologii, 0 bez badań', () => {
    const st = stan();
    expect(eraBadan(st)).toBe(0);
    st.techDone = [];
    expect(eraBadan(st)).toBe(0);
    st.techDone = ['t_okna'];
    expect(eraBadan(st)).toBe(1);
    st.techDone = ['t_okna', 't_spawanie', 't_kozy'];
    expect(eraBadan(st)).toBe(2);
    // identyfikatory spoza drzewka (testy budowli wpisują własne) nie psują wyniku
    st.techDone.push('t_test');
    expect(eraBadan(st)).toBe(2);
  });

  it('koncowaZbadana mówi, czy technologia końcowa jest w techDone', () => {
    const st = stan();
    expect(koncowaZbadana(st)).toBe(false);
    st.techDone = ['t_okna', 't_spawanie'];
    expect(koncowaZbadana(st)).toBe(false);
    st.techDone.push('t_siec');
    expect(koncowaZbadana(st)).toBe(true);
  });
});

describe('badania: stan nie powstaje sam', () => {
  it('research i books nie ma w świeżym stanie ani po new Sim, więc skróty stanu się nie zmieniają', () => {
    const st = createSim(w, seed, { core: 4 });
    for (const klucz of ['research', 'books']) {
      expect(klucz in st).toBe(false);
      expect(JSON.stringify(st)).not.toContain(`"${klucz}"`);
    }
    const sim = new Sim(w, st);
    for (const klucz of ['research', 'books']) expect(klucz in sim.st).toBe(false);
    expect(sim.hash()).toBe(hashString(JSON.stringify(sim.st)));
  });

  it('odczyty nie dopisują pól do stanu', () => {
    const st = stan();
    const przed = JSON.stringify(st);
    wiedza(st, 'bud');
    kartka(st, 't_okna', 'zwykly');
    badaniaDom(st);
    badaniaWidoczne(st);
    eraBadan(st);
    koncowaZbadana(st);
    expect(JSON.stringify(st)).toBe(przed);
  });
});
