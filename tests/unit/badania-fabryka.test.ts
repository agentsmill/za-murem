/* Łańcuch fabryki na tablicy badań (docs/superpowers/plans/2026-10-19-warunki-zwyciestwa-technologia.md, zadanie 1;
   docs/superpowers/specs/2026-10-19-warunki-zwyciestwa-design.md, sekcja „1. Technologiczna”): za „Siecią bez miedzi”,
   która przestaje być technologią końcową, idą w erze 6 odwrócone kartki Generator fuzji i Superserwer AI, a na końcu
   fabryka bieżącego trybu: Fabryka biorobotów w zwykłej grze, Fabryka humanoidów w trybie zombie. Tylko fabryka jest
   technologią końcową (złota kartka „Cel”), tablica pokazuje w każdym trybie 28 kartek z jednym celem, a „Włączyć sieć”
   zależy od zbadanej sieci, nie od fabryki. Przymorze z dema. */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ustawJezyk } from '../../src/core/jezyk.ts';
import { hashString } from '../../src/core/rng.ts';
import {
  ERY,
  KOSZT_ERY,
  kartka,
  koncowaZbadana,
  kosztTech,
  nazwaTech,
  siecWlaczona,
  siecZbadana,
  TECH_BY,
  TECHS,
} from '../../src/sim/badania.ts';
import { type BuildKind, footprint } from '../../src/sim/budowle.ts';
import { commandsAt } from '../../src/sim/orders.ts';
import { createSim, Sim, type SimState, type Thing } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import type { GameMode } from '../../src/sim/tryb.ts';
import { tablicaHtml, uklad } from '../../src/ui/badania.ts';
import { allowedAnchors } from '../../src/ui/budowa.ts';
import { buildWorld } from '../../src/world/world.ts';

const d = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../public/demo/przymorze.json'), 'utf8'));
const seed = Number.parseInt(hashString(d.addr), 16) || 2051;
const w = buildWorld(d.geo, { seed, street: d.street });

afterEach(() => ustawJezyk('pl'));

/** cztery nowe technologie w kolejności za `t_siec`, dokładnie z tabeli planu (opisy `dzialanie` słowo w słowo) */
const NOWE = [
  {
    id: 't_fuzja',
    nazwa: { pl: 'Generator fuzji', en: 'Fusion generator' },
    dom: 'elek',
    lvl: 4,
    cost: 160,
    koszt: 480,
    req: ['t_siec'],
    dzialanie: {
      pl: 'Generator fuzji: mała gwiazda w kontenerze po paczkomacie. Prąd dla serwera i fabryki.',
      en: 'Fusion generator: a small star in an old parcel-locker container. Power for the server and the factory.',
    },
  },
  {
    id: 't_superserwer',
    nazwa: { pl: 'Superserwer AI', en: 'AI superserver' },
    dom: 'it',
    lvl: 4,
    cost: 170,
    koszt: 510,
    req: ['t_fuzja'],
    dzialanie: {
      pl: 'Superserwer AI z dawnego centrum danych. Sam pisze sobie regulamin, ale fabrykę poprowadzi.',
      en: 'An AI superserver from an old data centre. It writes its own terms of service, but it will run the factory.',
    },
  },
  {
    id: 't_fabryka_bio',
    nazwa: { pl: 'Fabryka biorobotów', en: 'Biorobot factory' },
    dom: 'bud',
    lvl: 4,
    cost: 200,
    koszt: 600,
    req: ['t_superserwer'],
    tryb: 'zwykly',
    dzialanie: {
      pl: 'Fabryka biorobotów odpornych na bakterię miedzi. Bioroboty położą nowe linie w całym mieście.',
      en: 'A factory of biorobots immune to the copper bacterium. They will lay new lines across the whole city.',
    },
  },
  {
    id: 't_fabryka_hum',
    nazwa: { pl: 'Fabryka humanoidów', en: 'Humanoid factory' },
    dom: 'bud',
    lvl: 4,
    cost: 200,
    koszt: 600,
    req: ['t_superserwer'],
    tryb: 'zombie',
    dzialanie: {
      pl: 'Fabryka humanoidalnych żołnierzy. Wyjdą z bramy i oczyszczą miasto ze szwendaczy.',
      en: 'A factory of humanoid soldiers. They will march out of the gate and clear the city of walkers.',
    },
  },
] as const;
const FABRYKA: Record<GameMode, string> = { zwykly: 't_fabryka_bio', zombie: 't_fabryka_hum' };
const INNA: Record<GameMode, string> = { zwykly: 't_fabryka_hum', zombie: 't_fabryka_bio' };
const TRYBY: readonly GameMode[] = ['zwykly', 'zombie'];

/** gotowa budowla postawiona od razu (jak po finishBuild) w pierwszym miejscu, które canPlace przepuszcza */
function place(st: SimState, kind: BuildKind): Thing {
  const i = allowedAnchors(st, w, kind, 0)[0];
  if (i === undefined) throw new Error(`nie ma miejsca na ${kind}`);
  const f = footprint(kind, 0);
  const t: Thing = {
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
  };
  st.things.push(t);
  return t;
}

/** świeża gra w danym trybie; pracownia i zbadane technologie dopiero na życzenie */
function gra(mode: GameMode, opts: { pracownia?: boolean; techDone?: string[] } = {}) {
  const st = createSim(w, seed, { core: 4, mode });
  const prac = opts.pracownia ? place(st, 'pracownia') : undefined;
  if (opts.techDone) st.techDone = [...opts.techDone];
  return { st, sim: new Sim(w, st), prac };
}

const rdzen = (st: SimState) => st.pawns.filter((p) => p.kind === 'core').map((p) => p.id);
const kafel = (t: Thing) => t.y * w.size + t.x;
const pozycjaSieci = (st: SimState, prac: Thing) =>
  commandsAt(st, w, rdzen(st), kafel(prac)).find((m) => m.cmd.t === 'siec');

/** tablica badań w danym trybie (stan z samym stanem badań, bez pracowni) */
function tablica(mode: GameMode, wybrana: string | null = null, techDone: string[] = []): string {
  const st = createSim(w, seed, { core: 4, mode });
  st.techDone = [...techDone];
  st.research = { cur: null, prog: {}, at: {} };
  const b = snapshot(st, w).tablica;
  if (!b) throw new Error('brak odczytu badań');
  return tablicaHtml(b, { wybrana, mode });
}

/** html jednej kartki z tablicy (od jej przycisku do końca) */
function kartkaHtml(html: string, id: string): string {
  const m = html.match(new RegExp(`<button[^>]*class="tb-kartka[^"]*"[^>]*data-tech="${id}"[\\s\\S]*?</button>`));
  if (!m) throw new Error(`brak kartki ${id}`);
  return m[0];
}
const ile = (html: string, wzor: RegExp) => (html.match(wzor) ?? []).length;
const szczegoly = (html: string) => html.slice(html.indexOf('class="tb-szczegoly'), html.indexOf('<footer'));

describe('łańcuch fabryki: dane technologii', () => {
  it('cztery nowe identyfikatory stoją zaraz za t_siec i w tej kolejności; razem 29 technologii', () => {
    const ids = TECHS.map((t) => t.id);
    expect(ids).toHaveLength(29);
    expect(new Set(ids).size).toBe(29);
    const i = ids.indexOf('t_siec');
    expect(i).toBe(24);
    expect(ids.slice(i)).toEqual(['t_siec', ...NOWE.map((t) => t.id)]);
  });

  it('każda ma dane z tabeli: era 6, dziedzina, poziom, wymagania, nazwa i opis w obu językach', () => {
    for (const n of NOWE) {
      const t = TECH_BY[n.id];
      expect({ era: t.era, dom: t.dom, lvl: t.lvl, req: [...t.req] }, n.id).toEqual({
        era: 6,
        dom: n.dom,
        lvl: n.lvl,
        req: [...n.req],
      });
      expect(t.dziala, n.id).toBe(false);
      expect([...t.odblokowuje], n.id).toEqual([]);
      expect(t.wymagaBudowli, n.id).toBeUndefined();
      expect(t.dzialanieZombie, n.id).toBeUndefined();
      expect(nazwaTech(n.id), n.id).toEqual(n.nazwa);
      expect(t.dzialanie, n.id).toEqual(n.dzialanie);
    }
  });

  it('koszt to koszt bazowy razy mnożnik ery 6: 480, 510, 600 i 600', () => {
    expect(NOWE.map((n) => kosztTech(n.id))).toEqual([480, 510, 600, 600]);
    for (const n of NOWE) expect(kosztTech(n.id), n.id).toBe(n.cost * KOSZT_ERY[6]);
  });

  it('po angielsku: nazwy wszystkich czterech technologii i ich opisy, bez polskich liter', () => {
    const polskie = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;
    expect(NOWE.map((n) => nazwaTech(n.id).en)).toEqual([
      'Fusion generator',
      'AI superserver',
      'Biorobot factory',
      'Humanoid factory',
    ]);
    for (const n of NOWE) {
      expect(TECH_BY[n.id].dzialanie.en, n.id).toBe(n.dzialanie.en);
      expect(TECH_BY[n.id].dzialanie.en, n.id).not.toMatch(polskie);
    }
  });

  it('stare t_serwer z 0.3 zostaje osobną technologią ery 5: Superserwer AI nie nadpisuje „Serwera z odzysku”', () => {
    expect(TECH_BY.t_serwer.era).toBe(5);
    expect(nazwaTech('t_serwer')).toEqual({ pl: 'Serwer z odzysku', en: 'Salvaged server' });
    expect(TECH_BY.t_model.req).toContain('t_serwer');
    expect(TECH_BY.t_superserwer.req).not.toContain('t_serwer');
  });

  it('dokładnie dwie technologie są końcowe: obie fabryki, każda w swoim trybie; sieć już nie', () => {
    const koncowe = TECHS.filter((t) => t.koncowa);
    expect(koncowe.map((t) => [t.id, t.tryb])).toEqual([
      ['t_fabryka_bio', 'zwykly'],
      ['t_fabryka_hum', 'zombie'],
    ]);
    expect(TECH_BY.t_siec.koncowa).toBeUndefined();
    // tryb mają tylko fabryki
    expect(TECHS.filter((t) => t.tryb !== undefined).map((t) => t.id)).toEqual(['t_fabryka_bio', 't_fabryka_hum']);
  });

  it('sieć zostaje z własnym opisem i z opisem cichym na tryb zombie, jakiego nie ma żadna inna technologia', () => {
    expect(TECH_BY.t_siec.dzialanie.pl).toMatch(/aluminium/);
    expect(TECH_BY.t_siec.dzialanieZombie?.pl).toMatch(/cicha/);
    expect(TECHS.filter((t) => t.dzialanieZombie).map((t) => t.id)).toEqual(['t_siec']);
  });

  for (const tryb of TRYBY) {
    it(`kartki ery 6 są odwrócone w trybie ${tryb}, także z zaliczonymi wymaganiami, i nie da się ich wybrać do badania`, () => {
      const era6 = ['t_siec', ...NOWE.map((n) => n.id)];
      const wczesniejsze = TECHS.map((t) => t.id).filter((id) => !era6.includes(id));
      era6.forEach((id, i) => {
        // wszystko z er 1–5 i poprzednie z ery 6 zbadane: jedyny powód odwrócenia to brak działania w nowej grze
        const { st, sim } = gra(tryb, { pracownia: true, techDone: [...wczesniejsze, ...era6.slice(0, i)] });
        expect(kartka(st, id, tryb).stan, id).toBe('odwrocona');
        sim.push({ t: 'research', ids: [], tech: id });
        sim.step();
        expect(st.research?.cur ?? null, id).not.toBe(id);
      });
    });
  }
});

describe('łańcuch fabryki: tablica badań', () => {
  for (const tryb of TRYBY) {
    it(`tryb ${tryb}: kartka fabryki tego trybu jest, fabryki drugiego trybu nie ma, a złota kartka celu jest jedna`, () => {
      const html = tablica(tryb);
      expect(ile(html, new RegExp(`data-tech="${FABRYKA[tryb]}"`, 'g'))).toBe(1);
      expect(html).not.toContain(`data-tech="${INNA[tryb]}"`);
      // sznurki drugiej fabryki też znikają
      expect(html).not.toContain(`data-do="${INNA[tryb]}"`);
      expect(html).not.toContain(`data-od="${INNA[tryb]}"`);
      expect(ile(html, /class="tb-cel"/g)).toBe(1);
      const k = kartkaHtml(html, FABRYKA[tryb]);
      expect(k).toMatch(/class="tb-kartka [^"]*\bkoncowa\b/);
      expect(k).toContain('class="tb-cel">Cel<');
      expect(k).toContain('data-stan="odwrocona"');
      // dokładnie jedna kartka z klasą „koncowa” na tablicy
      expect(ile(html, /class="tb-kartka [^"]*\bkoncowa\b/g)).toBe(1);
    });

    it(`tryb ${tryb}: 28 kartek, a sznurków tyle, ile wymagań między kartkami tego trybu`, () => {
      const html = tablica(tryb);
      const naTablicy = TECHS.filter((t) => t.tryb === undefined || t.tryb === tryb);
      expect(naTablicy).toHaveLength(28);
      expect(ile(html, /class="tb-kartka/g)).toBe(28);
      expect(ile(html, /<path class="tb-nic/g)).toBe(naTablicy.reduce((a, t) => a + t.req.length, 0));
      for (const id of ['t_siec', 't_fuzja', 't_superserwer']) expect(html).toContain(`data-tech="${id}"`);
    });
  }

  it('sieć, generator i serwer nie są celem: bez złotej pinezki i bez dopisku „Cel”', () => {
    const html = tablica('zwykly');
    for (const id of ['t_siec', 't_fuzja', 't_superserwer']) {
      const k = kartkaHtml(html, id);
      expect(k, id).not.toMatch(/\bkoncowa\b/);
      expect(k, id).not.toContain('tb-cel');
      expect(k, id).toContain('Do tego trzeba prądu.');
    }
  });

  it('szczegóły odwróconej kartki z własnym opisem (sieć, generator, serwer, fabryka) dopisują, że trzeba do tego prądu', () => {
    for (const [tryb, id] of [
      ['zwykly', 't_siec'],
      ['zwykly', 't_fuzja'],
      ['zwykly', 't_superserwer'],
      ['zwykly', 't_fabryka_bio'],
      ['zombie', 't_fabryka_hum'],
    ] as const) {
      const s = szczegoly(tablica(tryb, id));
      expect(s, id).toContain('Do tego trzeba prądu');
      expect(s, id).not.toContain('data-akcja="badaj"');
    }
    // opis, nie tylko dopisek
    expect(szczegoly(tablica('zwykly', 't_fuzja'))).toContain('mała gwiazda w kontenerze po paczkomacie');
    expect(szczegoly(tablica('zwykly', 't_superserwer'))).toContain('Sam pisze sobie regulamin');
    expect(szczegoly(tablica('zombie', 't_fabryka_hum'))).toContain('oczyszczą miasto ze szwendaczy');
    // zwykła odwrócona kartka ma „Do tego trzeba prądu” jako opis, więc dopisek się nie dubluje
    expect(ile(szczegoly(tablica('zwykly', 't_panele')), /Do tego trzeba prądu/g)).toBe(1);
  });

  it('tylko fabryka bieżącego trybu ma w szczegółach znaczek „Cel”', () => {
    expect(szczegoly(tablica('zwykly', 't_fabryka_bio'))).toContain('class="tb-cel">Cel<');
    expect(szczegoly(tablica('zombie', 't_fabryka_hum'))).toContain('class="tb-cel">Cel<');
    for (const id of ['t_siec', 't_fuzja', 't_superserwer'])
      expect(szczegoly(tablica('zwykly', id)), id).not.toContain('tb-cel');
  });

  it('po angielsku: nazwy kartek, dopisek „Cel” i „This needs power.”, nic po polsku', () => {
    ustawJezyk('en');
    const html = tablica('zwykly', 't_fuzja');
    for (const nazwa of ['Fusion generator', 'AI superserver', 'Biorobot factory']) expect(html).toContain(nazwa);
    expect(html).not.toContain('Humanoid factory');
    expect(szczegoly(html)).toContain('a small star in an old parcel-locker container');
    expect(szczegoly(html)).toContain('This needs power.');
    expect(html).toContain('class="tb-cel">Goal<');
    expect(html).not.toContain('Do tego trzeba prądu');
    const zombie = tablica('zombie');
    expect(zombie).toContain('Humanoid factory');
    expect(zombie).not.toContain('Biorobot factory');
  });

  for (const tryb of TRYBY) {
    it(`układ w trybie ${tryb}: sieć, generator, serwer i fabryka jedna pod drugą, bez nachodzenia i bez dłuższej planszy`, () => {
      const naTablicy = TECHS.filter((t) => t.tryb === undefined || t.tryb === tryb);
      const poz = uklad(naTablicy);
      const kolumna = ['t_siec', 't_fuzja', 't_superserwer', FABRYKA[tryb]].map((id) => poz.get(id)!);
      const ostatniaKol = ERY.length - 1;
      for (const p of kolumna) expect(p.kol).toBe(ostatniaKol);
      for (const p of kolumna) expect(p.x).toBe(kolumna[0].x);
      // kolejne wiersze, każdy niżej od poprzedniego
      for (let i = 1; i < kolumna.length; i++) expect(kolumna[i].wiersz).toBe(kolumna[i - 1].wiersz + 1);
      // cztery kartki to cała kolumna ery 6
      expect(naTablicy.filter((t) => t.era === 6).map((t) => t.id)).toEqual([
        't_siec',
        't_fuzja',
        't_superserwer',
        FABRYKA[tryb],
      ]);
      // nowa kolumna nie jest niższa od najwyższej z poprzednich: plansza nie rośnie i nie dostaje przewijania
      const inne = naTablicy.filter((t) => t.era !== 6).map((t) => poz.get(t.id)!.wiersz);
      expect(kolumna[kolumna.length - 1].wiersz).toBeLessThanOrEqual(Math.max(...inne));
      // szerokość planszy to dalej sześć er, 1106 px (od niej zależy skala na laptopach, `skalaPlanszy`)
      expect(tablica(tryb)).toContain('class="tb-board" style="width:1106px;');
    });
  }
});

describe('łańcuch fabryki: koncowaZbadana i siecZbadana', () => {
  const stanZ = (mode: GameMode, techDone?: string[]): SimState => {
    const st = createSim(w, seed, { core: 4, mode });
    if (techDone) st.techDone = techDone;
    return st;
  };

  it('sama sieć nie jest zbadanym celem, w żadnym trybie', () => {
    for (const mode of TRYBY) expect(koncowaZbadana(stanZ(mode, ['t_siec'])), mode).toBe(false);
  });

  it('fabryka bieżącego trybu daje prawdę, fabryka drugiego trybu fałsz', () => {
    expect(koncowaZbadana(stanZ('zwykly', ['t_fabryka_bio']))).toBe(true);
    expect(koncowaZbadana(stanZ('zwykly', ['t_fabryka_hum']))).toBe(false);
    expect(koncowaZbadana(stanZ('zombie', ['t_fabryka_hum']))).toBe(true);
    expect(koncowaZbadana(stanZ('zombie', ['t_fabryka_bio']))).toBe(false);
  });

  it('cały łańcuch bez fabryki to jeszcze nie cel; z fabryką bieżącego trybu to cel, także gdy w techDone jest i druga', () => {
    const lancuch = ['t_siec', 't_fuzja', 't_superserwer'];
    for (const mode of TRYBY) expect(koncowaZbadana(stanZ(mode, lancuch)), mode).toBe(false);
    expect(koncowaZbadana(stanZ('zwykly', [...lancuch, 't_fabryka_hum', 't_fabryka_bio']))).toBe(true);
    expect(koncowaZbadana(stanZ('zombie', [...lancuch, 't_fabryka_bio', 't_fabryka_hum']))).toBe(true);
  });

  it('bez badań i dla zapisu sprzed trybów (bez pola mode) fałsz, a stary zapis liczy się jako zwykła gra', () => {
    expect(koncowaZbadana(stanZ('zwykly'))).toBe(false);
    const stary = stanZ('zwykly', ['t_fabryka_bio']);
    delete stary.mode;
    expect(koncowaZbadana(stary)).toBe(true);
    const staryHum = stanZ('zwykly', ['t_fabryka_hum']);
    delete staryHum.mode;
    expect(koncowaZbadana(staryHum)).toBe(false);
  });

  it('siecZbadana: prawda tylko ze zbadaną t_siec, w obu trybach, i nic nie dopisuje do stanu', () => {
    for (const mode of TRYBY) {
      expect(siecZbadana(stanZ(mode)), mode).toBe(false);
      expect(siecZbadana(stanZ(mode, ['t_okna', 't_model'])), mode).toBe(false);
      expect(siecZbadana(stanZ(mode, ['t_siec'])), mode).toBe(true);
      expect(siecZbadana(stanZ(mode, ['t_okna', 't_siec', 't_fuzja'])), mode).toBe(true);
      // sama fabryka, bez sieci w techDone, nie jest zbadaną siecią
      expect(siecZbadana(stanZ(mode, [FABRYKA[mode]])), mode).toBe(false);
    }
    const st = stanZ('zwykly', ['t_siec']);
    const przed = JSON.stringify(st);
    siecZbadana(st);
    koncowaZbadana(st);
    expect(JSON.stringify(st)).toBe(przed);
  });
});

describe('łańcuch fabryki: Włączyć sieć bez fabryki', () => {
  for (const tryb of TRYBY) {
    it(`tryb ${tryb}: menu pracowni ma „Włączyć sieć” przy zbadanej sieci bez fabryki, a polecenie ustawia research.siec`, () => {
      const { st, sim, prac } = gra(tryb, { pracownia: true, techDone: ['t_siec'] });
      expect(koncowaZbadana(st)).toBe(false);
      const m = pozycjaSieci(st, prac!)!;
      expect(m).toBeTruthy();
      expect(m.label).toBe('Włączyć sieć');
      expect(m.confirm).toBe(true);
      expect(m.quick).toBe(false);
      expect(m.cmd).toEqual({ t: 'siec', ids: rdzen(st) });
      expect(st.research?.siec).toBeUndefined();
      sim.push(m.cmd);
      sim.step();
      expect(st.research?.siec).toBe(true);
      expect(siecWlaczona(st)).toBe(true);
      // fabryki dalej nie ma, a pozycja po włączeniu znika
      expect(koncowaZbadana(st)).toBe(false);
      expect(pozycjaSieci(st, prac!)).toBeUndefined();
    });

    it(`tryb ${tryb}: sama fabryka bez zbadanej sieci nie włącza sieci: ani w menu, ani poleceniem`, () => {
      const { st, sim, prac } = gra(tryb, { pracownia: true, techDone: [FABRYKA[tryb]] });
      expect(koncowaZbadana(st)).toBe(true);
      expect(pozycjaSieci(st, prac!)).toBeUndefined();
      sim.push({ t: 'siec', ids: [] });
      sim.step();
      expect(siecWlaczona(st)).toBe(false);
      expect(st.research).toBeUndefined();
    });
  }

  it('bez pracowni polecenie siec nic nie robi nawet przy zbadanej sieci i fabryce', () => {
    const { st, sim } = gra('zwykly', { techDone: ['t_siec', 't_fuzja', 't_superserwer', 't_fabryka_bio'] });
    sim.push({ t: 'siec', ids: [] });
    sim.step();
    expect(siecWlaczona(st)).toBe(false);
    expect(st.research).toBeUndefined();
  });

  it('po angielsku „Switch on the grid”', () => {
    const { st, prac } = gra('zwykly', { pracownia: true, techDone: ['t_siec'] });
    ustawJezyk('en');
    expect(pozycjaSieci(st, prac!)?.label).toBe('Switch on the grid');
  });
});
