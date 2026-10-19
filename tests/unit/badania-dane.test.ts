/* Dane technologii nowej gry (docs/superpowers/specs/2026-10-19-badania-design.md, sekcje „Technologie ery 1 i 2”,
   „Ery 3–5” i „Dane”): 24 technologie z 0.3 plus technologia końcowa, ery 1–6, koszty z mnożnikiem ery i nazwy w obu
   językach. Liczby z 0.3 bierze się z TECH, więc test porównuje z nim zamiast spisywać je drugi raz. */

import { describe, expect, it } from 'vitest';
import { ERAS, TECH } from '../../src/content/data.ts';
import { ERY, KOSZT_ERY, kosztTech, nazwaEry, nazwaTech, TECH_BY, TECHS } from '../../src/sim/badania.ts';

const ID_0_3 = Object.keys(TECH);
const DZIALAJA = [
  't_kozy',
  't_okna',
  't_konserwy',
  't_zielarstwo',
  't_wieza',
  't_spawanie',
  't_barykady',
  't_wezel',
  't_szklarnia',
  't_grzyby',
  't_ambu',
];
const PRAD = { pl: 'Do tego trzeba prądu.', en: 'This needs power.' };

describe('badania: lista technologii', () => {
  it('25 technologii z unikalnymi identyfikatorami, w kolejności z 0.3 i technologia końcowa na końcu', () => {
    expect(TECHS).toHaveLength(25);
    const ids = TECHS.map((t) => t.id);
    expect(new Set(ids).size).toBe(25);
    expect(ids.slice(0, 24)).toEqual(ID_0_3);
    expect(ids[24]).toBe('t_siec');
  });

  it('TECH_BY indeksuje wszystkie technologie po identyfikatorze', () => {
    expect(Object.keys(TECH_BY)).toHaveLength(25);
    for (const t of TECHS) expect(TECH_BY[t.id]).toBe(t);
  });

  it('każde wymaganie istnieje, a drzewko nie ma cykli', () => {
    for (const t of TECHS) for (const r of t.req) expect(TECH_BY[r], `${t.id} wymaga ${r}`).toBeDefined();
    const stan = new Map<string, 'w-toku' | 'gotowe'>();
    const odwiedz = (id: string): void => {
      const s = stan.get(id);
      expect(s, `cykl przez ${id}`).not.toBe('w-toku');
      if (s === 'gotowe') return;
      stan.set(id, 'w-toku');
      for (const r of TECH_BY[id].req) odwiedz(r);
      stan.set(id, 'gotowe');
    };
    for (const t of TECHS) odwiedz(t.id);
    expect(stan.size).toBe(25);
  });

  it('24 technologie z 0.3 mają era, dom, lvl i req jak w TECH, a polską nazwę z TECH', () => {
    for (const id of ID_0_3) {
      const t = TECH_BY[id];
      const d = TECH[id];
      expect({ era: t.era, dom: t.dom, lvl: t.lvl, req: [...t.req] }).toEqual({
        era: d.era,
        dom: d.dom,
        lvl: d.lvl,
        req: d.req,
      });
      expect(nazwaTech(id).pl).toBe(d.name);
    }
  });
});

describe('badania: co działa w nowej grze', () => {
  it('dziala jest prawdą dokładnie dla 11 technologii ery 1 i 2 z pierwszej tabeli projektu', () => {
    expect(
      TECHS.filter((t) => t.dziala)
        .map((t) => t.id)
        .sort(),
    ).toEqual([...DZIALAJA].sort());
    expect(DZIALAJA.every((id) => TECH_BY[id].era <= 2)).toBe(true);
  });

  it('odblokowuje budowle: kozy, wieża, barykada, kocioł, szklarnia i pieczarkarnia, reszta nic', () => {
    const budowle: Record<string, string[]> = {
      t_kozy: ['koza_beczka'],
      t_wieza: ['wieza'],
      t_barykady: ['barykada'],
      t_wezel: ['kociol'],
      t_szklarnia: ['szklarnia'],
      t_grzyby: ['pieczarkarnia'],
    };
    for (const t of TECHS) expect([...t.odblokowuje], t.id).toEqual(budowle[t.id] ?? []);
  });

  it('żadna technologia nie wymaga jeszcze budowli i żadna nie ma ograniczonego trybu', () => {
    for (const t of TECHS) {
      expect(t.wymagaBudowli, t.id).toBeUndefined();
      expect(t.tryb, t.id).toBeUndefined();
    }
  });

  it('technologie bez działania w nowej grze, poza końcową, mówią, że trzeba do tego prądu, w obu językach', () => {
    for (const t of TECHS.filter((x) => !x.dziala && !x.koncowa)) expect(t.dzialanie, t.id).toEqual(PRAD);
    for (const t of TECHS.filter((x) => x.dziala)) expect(t.dzialanie.pl, t.id).not.toBe(PRAD.pl);
  });
});

describe('badania: technologia końcowa i ery', () => {
  it('dokładnie jedna technologia jest końcowa: Sieć bez miedzi w ostatniej erze', () => {
    const koncowe = TECHS.filter((t) => t.koncowa);
    expect(koncowe.map((t) => t.id)).toEqual(['t_siec']);
    const t = koncowe[0];
    expect(t.era).toBe(Math.max(...ERY.map((e) => e.nr)));
    expect(t.dom).toBe('elek');
    expect(t.lvl).toBe(4);
    expect([...t.req]).toEqual(['t_model', 't_pompy', 't_hydro', 't_druk', 't_drony']);
    expect(t.dziala).toBe(false);
    expect(nazwaTech('t_siec')).toEqual({ pl: 'Sieć bez miedzi', en: 'Copper-free grid' });
  });

  it('technologia końcowa opisuje sieć bez miedzi w trybie zwykłym, a jej cichą wersję osobno na tryb zombie', () => {
    const { dzialanie: d, dzialanieZombie: z } = TECH_BY.t_siec;
    expect(d.pl).toMatch(/aluminium/);
    expect(d.pl).toMatch(/światłowod/);
    expect(d.pl).toMatch(/żywic/);
    expect(d.en).toMatch(/aluminium/);
    expect(d.en).toMatch(/fibre/);
    expect(d.en).toMatch(/resin/);
    // „Do tego trzeba prądu” pokazuje tablica ze stanu odwróconej kartki, nie opis kartki końcowej
    expect(d).not.toEqual(PRAD);
    expect(d.pl).not.toMatch(/cicha/);
    expect(d.en).not.toMatch(/silent/);
    expect(z?.pl).toMatch(/aluminium/);
    expect(z?.pl).toMatch(/cicha/);
    expect(z?.en).toMatch(/silent/);
  });

  it('inne technologie nie mają osobnego opisu na tryb zombie', () => {
    for (const t of TECHS.filter((x) => x.id !== 't_siec')) expect(t.dzialanieZombie, t.id).toBeUndefined();
  });

  it('ery 1–5 mają polskie nazwy z ERAS, a era 6 to „Bez miedzi” / „Without copper”', () => {
    expect(ERY.map((e) => e.nr)).toEqual([1, 2, 3, 4, 5, 6]);
    for (let nr = 1; nr <= 5; nr++) expect(nazwaEry(nr).pl).toBe(ERAS[nr]);
    expect(nazwaEry(6)).toEqual({ pl: 'Bez miedzi', en: 'Without copper' });
  });

  it('każda technologia ma ery, której nazwę da się odczytać', () => {
    const numery = new Set(ERY.map((e) => e.nr));
    for (const t of TECHS) expect(numery.has(t.era), t.id).toBe(true);
  });
});

describe('badania: koszt', () => {
  it('mnożnik ery 1 i 2 jest równy 1, więc koszt jak w 0.3', () => {
    expect(KOSZT_ERY[1]).toBe(1);
    expect(KOSZT_ERY[2]).toBe(1);
    expect(kosztTech('t_okna')).toBe(12);
    expect(kosztTech('t_wezel')).toBe(35);
  });

  it('koszt to koszt z TECH razy mnożnik ery, a dla technologii końcowej 150 razy mnożnik ery 6', () => {
    for (const id of ID_0_3) expect(kosztTech(id), id).toBe(TECH[id].cost * KOSZT_ERY[TECH[id].era]);
    expect(kosztTech('t_siec')).toBe(150 * KOSZT_ERY[6]);
  });

  it('mnożniki zaczynają od wartości z planu i nie maleją z erą', () => {
    expect(KOSZT_ERY).toEqual({ 1: 1, 2: 1, 3: 1.5, 4: 2, 5: 2.5, 6: 3 });
    for (let nr = 2; nr <= 6; nr++) expect(KOSZT_ERY[nr]).toBeGreaterThanOrEqual(KOSZT_ERY[nr - 1]);
  });

  it('nieznana technologia i nieznana era to błąd, a nie cichy brak', () => {
    expect(() => kosztTech('t_nie_ma')).toThrow(/t_nie_ma/);
    expect(() => nazwaTech('t_nie_ma')).toThrow(/t_nie_ma/);
    expect(() => nazwaEry(7)).toThrow(/7/);
  });
});

describe('badania: teksty w obu językach', () => {
  it('każda technologia ma niepuste nazwę i opis działania po polsku i po angielsku', () => {
    for (const t of TECHS) {
      const n = nazwaTech(t.id);
      expect(n.pl.length, `${t.id} nazwa pl`).toBeGreaterThan(0);
      expect(n.en.length, `${t.id} nazwa en`).toBeGreaterThan(0);
      expect(t.dzialanie.pl.length, `${t.id} opis pl`).toBeGreaterThan(0);
      expect(t.dzialanie.en.length, `${t.id} opis en`).toBeGreaterThan(0);
    }
  });

  it('barykady z wraków to po angielsku „Wreck walls”, bo „barricade” ze słowniczka to zasieki', () => {
    expect(nazwaTech('t_barykady').en).toBe('Wreck walls');
    expect(TECH_BY.t_barykady.dzialanie.en).not.toMatch(/barricades? of wrecks|wreck barricade/i);
  });

  it('każda era ma niepustą nazwę w obu językach', () => {
    for (const e of ERY) {
      expect(e.nazwa.pl.length, `era ${e.nr} pl`).toBeGreaterThan(0);
      expect(e.nazwa.en.length, `era ${e.nr} en`).toBeGreaterThan(0);
    }
  });

  it('angielskie napisy nie zawierają polskich liter i nie są kopią polskich', () => {
    const polskie = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;
    for (const t of TECHS) {
      const n = nazwaTech(t.id);
      expect(n.en, `${t.id} nazwa`).not.toMatch(polskie);
      expect(n.en, `${t.id} nazwa`).not.toBe(n.pl);
      expect(t.dzialanie.en, `${t.id} opis`).not.toMatch(polskie);
      expect(t.dzialanie.en, `${t.id} opis`).not.toBe(t.dzialanie.pl);
      if (t.dzialanieZombie) expect(t.dzialanieZombie.en, `${t.id} opis zombie`).not.toMatch(polskie);
    }
    for (const e of ERY) {
      expect(e.nazwa.en, `era ${e.nr}`).not.toMatch(polskie);
      expect(e.nazwa.en, `era ${e.nr}`).not.toBe(e.nazwa.pl);
    }
  });
});
