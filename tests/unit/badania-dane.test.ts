/* Dane technologii nowej gry (docs/superpowers/specs/2026-10-19-badania-design.md, sekcje „Technologie ery 1 i 2”,
   „Ery 3–5” i „Dane”): 24 technologie z 0.3 plus łańcuch ery 6 (sieć bez miedzi, generator fuzji, superserwer AI i dwie
   fabryki, z których celem jest ta z bieżącego trybu), ery 1–6, koszty z mnożnikiem ery i nazwy w obu językach. Liczby
   z 0.3 bierze się z TECH, więc test porównuje z nim zamiast spisywać je drugi raz. Łańcuch fabryki ma osobny plik
   (badania-fabryka.test.ts). */

import { describe, expect, it } from 'vitest';
import { ERAS, TECH } from '../../src/content/data.ts';
import { ERY, KOSZT_ERY, kosztTech, maWlasnyOpis, nazwaEry, nazwaTech, TECH_BY, TECHS } from '../../src/sim/badania.ts';

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
/** łańcuch ery 6, w kolejności za siecią; wszystkie odwrócone, ale z własnym opisem zamiast „Do tego trzeba prądu” */
const ERA_6 = ['t_siec', 't_fuzja', 't_superserwer', 't_fabryka_bio', 't_fabryka_hum'];

describe('badania: lista technologii', () => {
  it('29 technologii z unikalnymi identyfikatorami, w kolejności z 0.3, a po nich łańcuch ery 6 z siecią na początku', () => {
    expect(TECHS).toHaveLength(29);
    const ids = TECHS.map((t) => t.id);
    expect(new Set(ids).size).toBe(29);
    expect(ids.slice(0, 24)).toEqual(ID_0_3);
    expect(ids.slice(24)).toEqual(ERA_6);
  });

  it('TECH_BY indeksuje wszystkie technologie po identyfikatorze', () => {
    expect(Object.keys(TECH_BY)).toHaveLength(29);
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
    expect(stan.size).toBe(29);
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

  it('żadna technologia nie wymaga jeszcze budowli, a tryb gry mają tylko dwie fabryki', () => {
    for (const t of TECHS) expect(t.wymagaBudowli, t.id).toBeUndefined();
    expect(Object.fromEntries(TECHS.filter((t) => t.tryb !== undefined).map((t) => [t.id, t.tryb]))).toEqual({
      t_fabryka_bio: 'zwykly',
      t_fabryka_hum: 'zombie',
    });
  });

  it('technologie bez działania w nowej grze, poza pięcioma z ery 6 z własnym opisem, mówią, że trzeba do tego prądu, w obu językach', () => {
    for (const t of TECHS.filter((x) => !x.dziala && !ERA_6.includes(x.id))) {
      expect(t.dzialanie, t.id).toEqual(PRAD);
      expect(maWlasnyOpis(t), t.id).toBe(false);
    }
    for (const t of TECHS.filter((x) => x.dziala)) expect(t.dzialanie.pl, t.id).not.toBe(PRAD.pl);
    // ery 6 opisują swoją rzecz, a „Do tego trzeba prądu” dopisuje im tablica ze stanu kartki
    for (const id of ERA_6) {
      expect(TECH_BY[id].dziala, id).toBe(false);
      expect(TECH_BY[id].dzialanie, id).not.toEqual(PRAD);
      expect(maWlasnyOpis(TECH_BY[id]), id).toBe(true);
    }
  });
});

describe('badania: technologia końcowa i ery', () => {
  it('sieć bez miedzi stoi w ostatniej erze i nie jest już końcowa: celem są dopiero fabryki', () => {
    const t = TECH_BY.t_siec;
    expect(t.koncowa).toBeUndefined();
    expect(t.era).toBe(Math.max(...ERY.map((e) => e.nr)));
    expect(t.dom).toBe('elek');
    expect(t.lvl).toBe(4);
    expect([...t.req]).toEqual(['t_model', 't_pompy', 't_hydro', 't_druk', 't_drony']);
    expect(t.dziala).toBe(false);
    expect(nazwaTech('t_siec')).toEqual({ pl: 'Sieć bez miedzi', en: 'Copper-free grid' });
  });

  it('technologie końcowe to dwie fabryki w ostatniej erze, po jednej na tryb gry, oparte na Superserwerze AI', () => {
    const koncowe = TECHS.filter((t) => t.koncowa);
    expect(koncowe.map((t) => [t.id, t.tryb])).toEqual([
      ['t_fabryka_bio', 'zwykly'],
      ['t_fabryka_hum', 'zombie'],
    ]);
    for (const t of koncowe) {
      expect(t.era).toBe(Math.max(...ERY.map((e) => e.nr)));
      expect(t.dom).toBe('bud');
      expect(t.lvl).toBe(4);
      expect([...t.req]).toEqual(['t_superserwer']);
      expect(t.dziala).toBe(false);
    }
    expect(nazwaTech('t_fabryka_bio')).toEqual({ pl: 'Fabryka biorobotów', en: 'Biorobot factory' });
    expect(nazwaTech('t_fabryka_hum')).toEqual({ pl: 'Fabryka humanoidów', en: 'Humanoid factory' });
  });

  it('sieć bez miedzi opisuje sieć w trybie zwykłym, a jej cichą wersję osobno na tryb zombie', () => {
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
  it('era 1 kosztuje jak w 0.3, a era 2 o 30% więcej (strojenie botem, zadanie 11 planu)', () => {
    expect(KOSZT_ERY[1]).toBe(1);
    expect(KOSZT_ERY[2]).toBe(1.3);
    expect(kosztTech('t_okna')).toBe(12);
    expect(kosztTech('t_wezel')).toBe(35 * 1.3);
  });

  it('koszt to koszt z TECH razy mnożnik ery, a dla ery 6 koszt bazowy (150, 160, 170, 200 i 200) razy mnożnik ery 6', () => {
    for (const id of ID_0_3) expect(kosztTech(id), id).toBe(TECH[id].cost * KOSZT_ERY[TECH[id].era]);
    expect(kosztTech('t_siec')).toBe(150 * KOSZT_ERY[6]);
    expect(ERA_6.map((id) => kosztTech(id))).toEqual([450, 480, 510, 600, 600]);
  });

  it('mnożniki: ery 1–2 z pomiaru bota, ery 3–6 wstępne z planu, i nie maleją z erą', () => {
    expect(KOSZT_ERY).toEqual({ 1: 1, 2: 1.3, 3: 1.5, 4: 2, 5: 2.5, 6: 3 });
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
