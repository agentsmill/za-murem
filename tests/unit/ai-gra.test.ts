/* Gra prowadzona przez decydenta (src/ai/gra.ts) i silnik podstawowy (src/ai/silnik.ts), etap 1 osady AI
   (docs/superpowers/plans/2026-10-21-osada-ai-etap-1.md, zadania 1 i 2). Pilnuje siedmiu rzeczy:
   - równoważności: silnik podstawowy w pętli gry daje te same skróty co `playWithGov(..., 'zawsze-warta', ...)`,
     także z okolicą miasta, obcymi i drogami do zwycięstwa;
   - determinizmu: dwie gry w jednym procesie przeplatane nierówno, zapis i wczytanie w połowie (także w środku
     sekundy) i odtworzenie ruchów rąk z dziennika na świeżej grze dają ten sam przebieg;
   - rąk gry: każde działanie decydenta idzie przez `Rece` i do dziennika, wyprawa dzienna wychodzi przez `wyslij`;
   - okien zarządu: okno, którego decydent nie zamknie, dostaje odpowiedź domyślną w tej samej sekundzie;
   - końca gry: po `gov.over` `krokGry` nie rusza czasu i nie woła decydenta;
   - okien zawieszonych: okno, którego nie zamknie nawet odpowiedź domyślna (nowy rodzaj z innej gałęzi), zapisuje się
     w `GraAi.zawieszone` i nie jest ponawiane w tej samej sekundzie;
   - tempa przeglądarki: z opcją `tempoPrzegladarki` potwierdzenie raportu przekazuje wejście jak main.ts. */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  type Decydent,
  type GraAi,
  grajDo,
  krokGry,
  nowaGraAi,
  odpowiedzDomyslna,
  type Rece,
  type RuchRak,
  skrotGry,
  wczytajGre,
  wejscie,
  type ZapisGryAi,
  zapiszGre,
  zrobRece,
} from '../../src/ai/gra.ts';
import { silnik, silnikPodstawowy } from '../../src/ai/silnik.ts';
import { powodOdmowy } from '../../src/gov/dzienne.ts';
import type { LawOption, Prompt } from '../../src/gov/typy.ts';
import { QUIET } from '../../src/gov/wspolne.ts';
import { pending } from '../../src/gov/zarzad.ts';
import { wygrajDroge } from '../../src/gov/zwyciestwo.ts';
import { hourOf, TICKS_PER_DAY, TICKS_PER_HOUR, TICKS_PER_SECOND } from '../../src/sim/clock.ts';
import { playWithGov } from './gov-play.ts';
import { najblizszeMiejsce, okolicaZGeo } from './miasto-play.ts';
import { demoWorld } from './sasiedzi-pomoc.ts';

/* `pending` z zarządu przechodzi przez przekładkę: domyślnie to prawdziwe okna, a gdy test ustawi `sztuczne.okno`, ono
   zasłania prawdziwe. Tylko tak da się dać grze okno nowego rodzaju (z innej gałęzi), którego nie zamknie żadna ręka. */
const sztuczne = vi.hoisted(() => ({ okno: null as Prompt | null }));
vi.mock('../../src/gov/zarzad.ts', async (importOriginal) => {
  const oryginal = await importOriginal<typeof import('../../src/gov/zarzad.ts')>();
  return {
    ...oryginal,
    pending: (...a: Parameters<typeof oryginal.pending>) => sztuczne.okno ?? oryginal.pending(...a),
  };
});

const demo = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../public/demo/przymorze.json'), 'utf8'));

/** sekundy przy ekranie (przy 1× tick / 20) */
const sekunda = (g: GraAi): number => Math.floor(g.sim.st.tick / TICKS_PER_SECOND);

/** tożsamość okna zarządu: rodzaj i to, co odróżnia je od następnego tego samego rodzaju */
function klucz(p: Prompt): string {
  switch (p.k) {
    case 'raport':
      return `raport:${p.report.day}`;
    case 'uchwala':
      return `uchwala:${p.day}`;
    case 'karta':
      return `karta:${p.card.day}`;
    case 'zwyciestwo':
      return `zwyciestwo:${p.droga}`;
    default:
      return `${p.k}:${p.id}`;
  }
}

/** ruchy, które zamykają okno zarządu (reszta z dziennika to przygotowanie albo polecenia w grze) */
const ZAMYKAJACE = new Set<RuchRak['t']>(['raport', 'uchwala', 'zatwierdz', 'wydarzenie', 'dalej']);

/** wykonuje jeden wpis dziennika rękami */
function wykonaj(r: Rece, m: RuchRak): void {
  switch (m.t) {
    case 'polecenie':
      r.polecenie(m.c);
      break;
    case 'raport':
      r.potwierdzRaport();
      break;
    case 'uchwala':
      r.podpisz(m.id);
      break;
    case 'noc':
      r.przydziel(m.osoba, m.klucz);
      break;
    case 'zatwierdz':
      r.zatwierdzNoc();
      break;
    case 'wydarzenie':
      r.wybierz(m.k);
      break;
    case 'dalej':
      r.grajDalej();
      break;
    case 'wyprawa':
      r.wyslij(m.cel, m.ids);
      break;
  }
}

/** decydent, który nie myśli: robi to, co zapisano w dzienniku, w tej samej sekundzie i w tym samym haku
    (start przed pierwszym krokiem, okno do ruchu zamykającego okno włącznie, tura na resztę sekundy) */
function odtwarzacz(dziennik: readonly RuchRak[]): Decydent {
  let n = 0;
  return {
    start(_g, r) {
      while (n < dziennik.length && dziennik[n].s === 0) wykonaj(r, dziennik[n++]);
    },
    okno(g, _p, r) {
      while (n < dziennik.length && dziennik[n].s === sekunda(g)) {
        const m = dziennik[n++];
        wykonaj(r, m);
        if (ZAMYKAJACE.has(m.t)) break;
      }
    },
    tura(g, r) {
      while (n < dziennik.length && dziennik[n].s === sekunda(g)) wykonaj(r, dziennik[n++]);
    },
  };
}

describe('równoważność z playWithGov', () => {
  it('silnik podstawowy daje ten sam skrót co playWithGov zawsze-warta przez 3 dni', () => {
    const w = demoWorld('przymorze');
    const g = nowaGraAi(w, 11);
    grajDo(g, silnikPodstawowy, 3 * TICKS_PER_DAY);
    const wzor = playWithGov(w, 11, 'zawsze-warta', 3, 4);
    expect(g.sim.st.tick).toBe(3 * TICKS_PER_DAY);
    expect(g.sim.hash()).toBe(wzor.hash);
    // zarząd ten sam co u wzorca: te same uchwały, karty i wydarzenia
    expect(JSON.stringify(g.gov)).toBe(JSON.stringify(wzor.gov));
  });

  it('z okolicą miasta, obcymi i drogami do zwycięstwa też ten sam skrót co playWithGov z tymi opcjami', () => {
    const w = demoWorld('przymorze');
    const okolica = okolicaZGeo(demo.geo);
    const g = nowaGraAi(w, 12, { obcy: true, okolica, ludnosc2021: 900 });
    grajDo(g, silnikPodstawowy, 3 * TICKS_PER_DAY);
    const wzor = playWithGov(w, 12, 'zawsze-warta', 3, 4, {
      obcy: true,
      miasto: { okolica },
      zwyciestwo: { ludnosc2021: 900 },
    });
    expect(g.sim.hash()).toBe(wzor.hash);
    expect(JSON.stringify(g.gov)).toBe(JSON.stringify(wzor.gov));
  });

  it.each([
    ['zielonki', 12],
    ['lanciego', 13],
  ])('na demie %s (ziarno %i) też ten sam skrót co playWithGov przez 2 dni', (demoKlucz, ziarno) => {
    const w = demoWorld(demoKlucz);
    const g = nowaGraAi(w, ziarno);
    grajDo(g, silnikPodstawowy, 2 * TICKS_PER_DAY);
    const wzor = playWithGov(w, ziarno, 'zawsze-warta', 2, 4);
    expect(g.sim.hash()).toBe(wzor.hash);
    expect(JSON.stringify(g.gov)).toBe(JSON.stringify(wzor.gov));
  });

  it('start woła się raz, przed pierwszym krokiem, a tura co sekundę przy ekranie', () => {
    const g = nowaGraAi(demoWorld('przymorze'), 11);
    const tickiStartu: number[] = [];
    const sekundyTury: number[] = [];
    const d: Decydent = {
      start: (gr) => tickiStartu.push(gr.sim.st.tick),
      okno: () => {},
      tura: (gr) => sekundyTury.push(sekunda(gr)),
    };
    grajDo(g, d, 5 * TICKS_PER_SECOND + 3);
    expect(tickiStartu).toEqual([0]);
    expect(sekundyTury).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('determinizm', () => {
  it('dwie gry przeplatane krok po kroku mają te same skróty co każda osobno', () => {
    const doba = TICKS_PER_DAY;
    const solo = (demoKlucz: string, ziarno: number): string => {
      const g = nowaGraAi(demoWorld(demoKlucz), ziarno);
      grajDo(g, silnik, doba);
      return skrotGry(g);
    };
    const przymorze = solo('przymorze', 11);
    const zielonki = solo('zielonki', 12);
    const a = nowaGraAi(demoWorld('przymorze'), 11);
    const b = nowaGraAi(demoWorld('zielonki'), 12);
    // nierówno: siedem kroków jednej gry, trzy drugiej, ten sam decydent w obu
    while (a.sim.st.tick < doba || b.sim.st.tick < doba) {
      for (let k = 0; k < 7 && a.sim.st.tick < doba; k++) krokGry(a, silnik);
      for (let k = 0; k < 3 && b.sim.st.tick < doba; k++) krokGry(b, silnik);
    }
    expect(skrotGry(a)).toBe(przymorze);
    expect(skrotGry(b)).toBe(zielonki);
  });

  it('zapis i wczytanie w połowie nie zmieniają przebiegu', () => {
    const w = demoWorld('przymorze');
    const ciagla = nowaGraAi(w, 11);
    grajDo(ciagla, silnik, 2 * TICKS_PER_DAY);
    // po pierwszej półminucie (pamięć silnika już zapisana), po pełnej dobie i w środku sekundy; między sekundami
    // decydent nie ma żadnego stanu poza pamięcią w grze (pamięć niepustą sprawdza osobny test silnika podstawowego)
    for (const przerwa of [700, TICKS_PER_DAY, TICKS_PER_DAY + 7]) {
      const a = nowaGraAi(w, 11);
      grajDo(a, silnik, przerwa);
      const zapis = JSON.parse(JSON.stringify(zapiszGre(a))) as ZapisGryAi;
      const b = wczytajGre(w, zapis);
      expect(b.pamiec).toEqual(a.pamiec);
      expect(skrotGry(b)).toBe(skrotGry(a));
      grajDo(b, silnik, 2 * TICKS_PER_DAY);
      expect(skrotGry(b)).toBe(skrotGry(ciagla));
    }
  });

  it('zapis jest głęboką kopią: gra po zapisie ani po wczytaniu nie rusza zapisu', () => {
    const w = demoWorld('przymorze');
    const a = nowaGraAi(w, 11);
    grajDo(a, silnik, TICKS_PER_DAY);
    const zapis = zapiszGre(a);
    const json = JSON.stringify(zapis);
    grajDo(a, silnik, TICKS_PER_DAY + 2000);
    expect(JSON.stringify(zapis)).toBe(json);
    // ten sam zapis wczytany dwa razy to dwie niezależne gry z tym samym przebiegiem
    const b = wczytajGre(w, zapis);
    const c = wczytajGre(w, zapis);
    grajDo(b, silnik, TICKS_PER_DAY + 2000);
    expect(JSON.stringify(zapis)).toBe(json);
    grajDo(c, silnik, TICKS_PER_DAY + 2000);
    expect(skrotGry(c)).toBe(skrotGry(b));
    expect(skrotGry(b)).toBe(skrotGry(a));
  });

  it('odtworzenie ruchów rąk z dziennika na świeżej grze daje ten sam stan', () => {
    const w = demoWorld('przymorze');
    const g = nowaGraAi(w, 11, { dziennik: true });
    // karta nocy z propozycji zarządu ma już wartę, więc silnik niczego na niej nie przydziela; ten decydent dokłada
    // przydziały (wartę każdemu, kto może), żeby dziennik miał też ruchy 'noc'
    const zPrzydzialami: Decydent = {
      ...silnik,
      okno(gr, p, r) {
        if (p.k === 'karta')
          for (const osoba of p.card.people) {
            const warta = osoba.options.find((o) => o.ok && o.key.startsWith('warta:'));
            if (warta) r.przydziel(osoba.id, warta.key);
          }
        silnik.okno(gr, p, r);
      },
    };
    grajDo(g, zPrzydzialami, 2 * TICKS_PER_DAY);
    const dziennik = g.dziennik!;
    const rodzaje = new Set(dziennik.map((m) => m.t));
    for (const t of ['polecenie', 'wydarzenie', 'uchwala', 'noc', 'zatwierdz', 'raport'] as const)
      expect(rodzaje).toContain(t);
    // sekundy rosną razem z dziennikiem
    for (let k = 1; k < dziennik.length; k++) expect(dziennik[k].s).toBeGreaterThanOrEqual(dziennik[k - 1].s);
    const swieza = nowaGraAi(w, 11);
    grajDo(swieza, odtwarzacz(dziennik), 2 * TICKS_PER_DAY);
    expect(swieza.sim.hash()).toBe(g.sim.hash());
    expect(JSON.stringify(swieza.gov)).toBe(JSON.stringify(g.gov));
  });
});

describe('pamięć silnika podstawowego', () => {
  it('drzewo, do którego nikt nie doszedł, idzie do pominiętych, a następne polecenie dostaje inne', () => {
    const w = demoWorld('przymorze');
    const g = nowaGraAi(w, 11, { dziennik: true });
    /** drzewa z poleceń ścięcia po samouczku (samouczek ma sekundę 0) */
    const scinane = (): number[] =>
      g.dziennik!.flatMap((m) => (m.s > 0 && m.t === 'polecenie' && m.c.t === 'chop' ? [m.c.tree] : []));
    while (scinane().length === 0 && g.sim.st.tick < TICKS_PER_DAY) krokGry(g, silnikPodstawowy);
    const pierwsze = scinane()[0];
    expect(g.pamiec).toEqual({ v: 1, pominieteDrzewa: [], zlecone: pierwsze });
    // polecenie przepada, zanim ktokolwiek zrobi krok: tak wygląda drzewo, do którego nie da się dojść
    g.sim.st.cmds.length = 0;
    grajDo(g, silnikPodstawowy, g.sim.st.tick + 10 * TICKS_PER_SECOND);
    const drugie = scinane()[1];
    expect(drugie).not.toBe(pierwsze);
    expect(g.pamiec).toEqual({ v: 1, pominieteDrzewa: [pierwsze], zlecone: drugie });
    // pamięć jedzie w zapisie: wczytana gra pomija te same drzewa i idzie dalej tak samo (drugie drzewo też bez dojścia)
    const kopia = wczytajGre(w, JSON.parse(JSON.stringify(zapiszGre(g))) as ZapisGryAi);
    expect(kopia.pamiec).toEqual(g.pamiec);
    g.sim.st.cmds.length = 0;
    kopia.sim.st.cmds.length = 0;
    grajDo(g, silnikPodstawowy, g.sim.st.tick + 30 * TICKS_PER_SECOND);
    grajDo(kopia, silnikPodstawowy, kopia.sim.st.tick + 30 * TICKS_PER_SECOND);
    const trzecie = scinane()[2];
    expect([pierwsze, drugie]).not.toContain(trzecie);
    expect(g.pamiec.pominieteDrzewa).toEqual([pierwsze, drugie]);
    expect(kopia.pamiec).toEqual(g.pamiec);
    expect(skrotGry(kopia)).toBe(skrotGry(g));
  });
});

describe('okna zarządu', () => {
  it('okno, którego decydent nie zamknie, dostaje odpowiedź domyślną w ciągu 5 sekund przy ekranie', () => {
    const g = nowaGraAi(demoWorld('przymorze'), 11, { dziennik: true });
    const pusty: Decydent = { okno: () => {}, tura: () => {} };
    /** od której sekundy to samo okno czeka na odpowiedź */
    const odKiedy = new Map<string, number>();
    let najdluzej = 0;
    let zatwierdzone = 0;
    for (let k = 0; k < 3 * TICKS_PER_DAY; k++) {
      krokGry(g, pusty);
      if (g.sim.st.tick % TICKS_PER_SECOND) continue;
      const s = sekunda(g);
      const p = pending(g.gov, wejscie(g));
      for (const stare of odKiedy.keys()) if (!p || klucz(p) !== stare) odKiedy.delete(stare);
      if (p) {
        const od = odKiedy.get(klucz(p)) ?? s;
        odKiedy.set(klucz(p), od);
        najdluzej = Math.max(najdluzej, s - od);
      }
      // karta nocy zatwierdzona każdej nocy: o 21:00 każda wieczorna karta jest już za zarządem
      if (hourOf(g.sim.st.tick) === 21 && g.sim.st.tick % TICKS_PER_HOUR === 0) {
        expect(g.gov.night?.confirmed).toBe(true);
        zatwierdzone++;
      }
    }
    expect(najdluzej).toBeLessThanOrEqual(5);
    expect(zatwierdzone).toBe(3);
    // wszystkie okna dało się zamknąć rękami: żadne nie zostało zawieszone
    expect(g.zawieszone).toEqual([]);
    // odpowiedzi domyślne poszły rękami, więc są w dzienniku: uchwała, karta, raport (i ani jedno polecenie gracza)
    const rodzaje = new Set(g.dziennik!.map((m) => m.t));
    for (const t of ['uchwala', 'zatwierdz', 'raport'] as const) expect(rodzaje).toContain(t);
    expect(rodzaje.has('polecenie')).toBe(false);
  });

  it('odpowiedź domyślna tylko tam, gdzie decydent nie zamknął okna: zamknięte przez niego nie dostaje drugiej', () => {
    const g = nowaGraAi(demoWorld('przymorze'), 11, { dziennik: true });
    // decydent zamyka tylko raport i kartę, uchwały i wydarzenia zostawia domyślnej
    const czesciowy: Decydent = {
      okno(_g, p, r) {
        if (p.k === 'raport') r.potwierdzRaport();
        if (p.k === 'karta') r.zatwierdzNoc();
      },
      tura: () => {},
    };
    grajDo(g, czesciowy, 3 * TICKS_PER_DAY);
    const dziennik = g.dziennik!;
    for (const t of ['raport', 'zatwierdz'] as const) {
      const sekundy = dziennik.filter((m) => m.t === t).map((m) => m.s);
      expect(sekundy.length).toBeGreaterThanOrEqual(2);
      expect(new Set(sekundy).size).toBe(sekundy.length);
    }
    expect(dziennik.some((m) => m.t === 'uchwala')).toBe(true);
  });

  it('epilog zwycięstwa, którego decydent nie zamknie, dostaje „graj dalej” w tej samej sekundzie', () => {
    const g = nowaGraAi(demoWorld('przymorze'), 11, { ludnosc2021: 900, dziennik: true });
    expect(wygrajDroge(g.gov, 'ludnosc', 1, 15)).toBe(true);
    expect(pending(g.gov, wejscie(g))).toMatchObject({ k: 'zwyciestwo', droga: 'ludnosc' });
    grajDo(g, { okno: () => {}, tura: () => {} }, TICKS_PER_SECOND);
    expect(g.gov.zwyciestwo?.epilogi).toEqual([]);
    expect(g.gov.zwyciestwo?.wygrane).toHaveLength(1);
    expect(g.dziennik).toEqual([{ s: 1, t: 'dalej' }]);
  });

  describe('odpowiedź domyślna', () => {
    /** ręce, które tylko zapisują, co zrobiono */
    function szpieg(): { r: Rece; ruchy: string[] } {
      const ruchy: string[] = [];
      const r: Rece = {
        polecenie: () => ruchy.push('polecenie'),
        potwierdzRaport: () => ruchy.push('raport'),
        podpisz: (id) => ruchy.push(`uchwala:${id}`),
        przydziel: () => {
          ruchy.push('noc');
          return true;
        },
        zatwierdzNoc: () => ruchy.push('zatwierdz'),
        wybierz: (k) => ruchy.push(`wydarzenie:${k}`),
        grajDalej: () => ruchy.push('dalej'),
        wyslij: () => {
          ruchy.push('wyprawa');
          return true;
        },
      };
      return { r, ruchy };
    }
    const opcja = (id: string, s: LawOption['s']): LawOption => ({ id, s }) as LawOption;
    const odpowiedz = (p: unknown): string[] => {
      const { r, ruchy } = szpieg();
      odpowiedzDomyslna(p as Prompt, r);
      return ruchy;
    };

    it('raport potwierdza, kartę zatwierdza, zwycięstwo gra dalej', () => {
      expect(odpowiedz({ k: 'raport', report: { day: 1 } })).toEqual(['raport']);
      expect(odpowiedz({ k: 'karta', card: { day: 1 }, assign: {} })).toEqual(['zatwierdz']);
      expect(odpowiedz({ k: 'zwyciestwo', droga: 'ludnosc' })).toEqual(['dalej']);
    });

    it('uchwała: pierwsza dozwolona, a gdy żadnej, odłożenie', () => {
      const opcje = [opcja('u_a', 'lock'), opcja('u_b', 'ok'), opcja('u_c', 'ok'), opcja('u_d', 'done')];
      expect(odpowiedz({ k: 'uchwala', day: 2, first: false, options: opcje })).toEqual(['uchwala:u_b']);
      expect(odpowiedz({ k: 'uchwala', day: 2, first: false, options: [opcje[0], opcje[3]] })).toEqual([
        'uchwala:null',
      ]);
    });

    it('wydarzenie: pierwszy dozwolony wybór, a gdy żadnego, pierwszy', () => {
      const wybory = (...ok: boolean[]) => ok.map((o) => ({ label: { pl: '', en: '' }, ok: o }));
      expect(odpowiedz({ k: 'wydarzenie', id: 'x', choices: wybory(false, true, true) })).toEqual(['wydarzenie:1']);
      expect(odpowiedz({ k: 'wydarzenie', id: 'x', choices: wybory(false, false) })).toEqual(['wydarzenie:0']);
    });

    it('nieznany rodzaj okna dostaje odpowiedź jak wydarzenie, także bez wyborów', () => {
      expect(odpowiedz({ k: 'nowe_okno', choices: [{ ok: false }, { ok: true }] })).toEqual(['wydarzenie:1']);
      expect(odpowiedz({ k: 'nowe_okno', choices: [{ ok: false }] })).toEqual(['wydarzenie:0']);
      expect(odpowiedz({ k: 'nowe_okno' })).toEqual(['wydarzenie:0']);
    });
  });
});

describe('okna zawieszone', () => {
  /** okno nowego rodzaju, którego nie zamknie ani decydent, ani odpowiedź domyślna (`wybierz` nic nie zmienia) */
  const nowe = { k: 'nowe_okno', id: 'x', choices: [{ ok: true }] } as unknown as Prompt;

  it('okno, którego nie zamknie nawet odpowiedź domyślna, zapisuje się i nie jest ponawiane w tej samej sekundzie', () => {
    const g = nowaGraAi(demoWorld('przymorze'), 11, { dziennik: true });
    expect(g.zawieszone).toEqual([]);
    const okna: number[] = [];
    const tury: number[] = [];
    const d: Decydent = {
      okno: (gr) => okna.push(sekunda(gr)),
      tura: (gr) => tury.push(sekunda(gr)),
    };
    sztuczne.okno = nowe;
    try {
      grajDo(g, d, 3 * TICKS_PER_SECOND);
    } finally {
      sztuczne.okno = null;
    }
    // decydent raz na sekundę (dawniej do pięciu razy), tura idzie dalej, a okno czeka w zapisie z rodzajem i sekundą
    expect(okna).toEqual([1, 2, 3]);
    expect(tury).toEqual([1, 2, 3]);
    expect(g.zawieszone).toEqual([
      { k: 'nowe_okno', s: 1 },
      { k: 'nowe_okno', s: 2 },
      { k: 'nowe_okno', s: 3 },
    ]);
    // odpowiedź domyślna też raz na sekundę: wydarzenie bez skutku, ale ruch ręki jest w dzienniku
    expect(g.dziennik!.filter((m) => m.t === 'wydarzenie')).toHaveLength(3);
  });

  it('zawieszenie nie psuje gry: po zdjęciu okna idą prawdziwe okna, a lista zostaje tylko z tym, co się zawiesiło', () => {
    const g = nowaGraAi(demoWorld('przymorze'), 11);
    sztuczne.okno = nowe;
    try {
      grajDo(g, silnik, 2 * TICKS_PER_SECOND);
    } finally {
      sztuczne.okno = null;
    }
    expect(g.zawieszone).toHaveLength(2);
    // do 21:00 pierwszego dnia: prawdziwe okna zamykają się dalej, karta nocy z 20:00 jest zatwierdzona
    grajDo(g, silnik, 6 * TICKS_PER_HOUR);
    expect(g.gov.night?.confirmed).toBe(true);
    expect(g.zawieszone).toHaveLength(2);
  });

  it('zawieszone nie wchodzi do zapisu ani do skrótu gry: wczytana gra zaczyna z pustą listą', () => {
    const g = nowaGraAi(demoWorld('przymorze'), 11);
    const skrot = skrotGry(g);
    g.zawieszone.push({ k: 'nowe_okno', s: 7 });
    expect(skrotGry(g)).toBe(skrot);
    expect(wczytajGre(demoWorld('przymorze'), zapiszGre(g)).zawieszone).toEqual([]);
  });
});

describe('tempo przeglądarki', () => {
  /** gra przez 3 dni z decydentem, który sam potwierdza raporty i mierzy, co to zrobiło w zarządzie */
  function raporty(tempo: boolean) {
    const g = nowaGraAi(demoWorld('przymorze'), 11, tempo ? { tempoPrzegladarki: true } : {});
    const pomiary: { decyzje: number; po: number; next: number; przedNext: number; s: number }[] = [];
    const d: Decydent = {
      okno(gr, p, r) {
        if (p.k !== 'raport') {
          odpowiedzDomyslna(p, r);
          return;
        }
        const przed = { decyzje: gr.gov.decisions.length, next: gr.gov.ev.next };
        r.potwierdzRaport();
        pomiary.push({
          decyzje: przed.decyzje,
          po: gr.gov.decisions.length,
          next: gr.gov.ev.next,
          przedNext: przed.next,
          s: sekunda(gr),
        });
      },
      tura: () => {},
    };
    grajDo(g, d, 3 * TICKS_PER_DAY);
    return { g, pomiary };
  }

  it('z opcją potwierdzenie raportu przekazuje wejście: wpada do decyzji i wydarzenie czeka okno ciszy', () => {
    const { g, pomiary } = raporty(true);
    expect(pomiary.length).toBeGreaterThanOrEqual(2);
    for (const m of pomiary) {
      // decyzja rodzaju 'raport' z sekundą przy ekranie, w której raport przeczytano
      expect(m.po).toBe(m.decyzje + 1);
      expect(g.gov.decisions.some((x) => x.k === 'raport' && x.s === m.s)).toBe(true);
      // najbliższe wydarzenie najwcześniej po QUIET sekundach od raportu
      expect(m.next).toBeGreaterThanOrEqual(m.s + QUIET);
      expect(m.next).toBeGreaterThanOrEqual(m.przedNext);
    }
  });

  it('bez opcji raport potwierdza się jak w botach: bez decyzji i bez ciszy po raporcie', () => {
    const { g, pomiary } = raporty(false);
    expect(pomiary.length).toBeGreaterThanOrEqual(2);
    for (const m of pomiary) {
      expect(m.po).toBe(m.decyzje);
      expect(m.next).toBe(m.przedNext);
    }
    expect(g.gov.decisions.some((x) => x.k === 'raport')).toBe(false);
  });

  it('opcja jedzie w zapisie gry: wczytana gra potwierdza raporty tak samo jak gra bez przerwy', () => {
    const w = demoWorld('przymorze');
    const ciagla = nowaGraAi(w, 11, { tempoPrzegladarki: true });
    grajDo(ciagla, silnik, 2 * TICKS_PER_DAY);
    const a = nowaGraAi(w, 11, { tempoPrzegladarki: true });
    grajDo(a, silnik, TICKS_PER_DAY);
    const b = wczytajGre(w, JSON.parse(JSON.stringify(zapiszGre(a))) as ZapisGryAi);
    expect(b.opts.tempoPrzegladarki).toBe(true);
    grajDo(b, silnik, 2 * TICKS_PER_DAY);
    expect(skrotGry(b)).toBe(skrotGry(ciagla));
    expect(ciagla.gov.decisions.some((x) => x.k === 'raport')).toBe(true);
  });
});

describe('koniec gry', () => {
  it('po końcu gry krokGry nic nie robi', () => {
    const g = nowaGraAi(demoWorld('przymorze'), 11);
    g.gov.over = 'odwolanie';
    const wolania = { start: 0, okno: 0, tura: 0 };
    const d: Decydent = {
      start: () => wolania.start++,
      okno: () => wolania.okno++,
      tura: () => wolania.tura++,
    };
    const przed = skrotGry(g);
    expect(() => {
      krokGry(g, d);
      grajDo(g, d, TICKS_PER_DAY);
    }).not.toThrow();
    expect(g.sim.st.tick).toBe(0);
    expect(skrotGry(g)).toBe(przed);
    expect(wolania).toEqual({ start: 0, okno: 0, tura: 0 });
  });

  it('koniec w trakcie gry zatrzymuje czas i decydenta od następnego kroku', () => {
    const g = nowaGraAi(demoWorld('przymorze'), 11);
    let tury = 0;
    const d: Decydent = {
      okno: () => {},
      tura: (gr) => {
        if (++tury === 10) gr.gov.over = 'pustka';
      },
    };
    grajDo(g, d, TICKS_PER_DAY);
    expect(tury).toBe(10);
    expect(g.sim.st.tick).toBe(10 * TICKS_PER_SECOND);
    const hash = g.sim.hash();
    krokGry(g, d);
    expect(g.sim.hash()).toBe(hash);
    expect(tury).toBe(10);
  });

  it('koniec ustawiony w oknie zarządu odbiera decydentowi resztę sekundy', () => {
    const g = nowaGraAi(demoWorld('przymorze'), 11);
    const okna: number[] = [];
    const tury: number[] = [];
    const d: Decydent = {
      okno: (gr) => {
        okna.push(sekunda(gr));
        gr.gov.over = 'odwolanie';
      },
      tura: (gr) => tury.push(sekunda(gr)),
    };
    grajDo(g, d, TICKS_PER_DAY);
    // decydent kończy grę w pierwszym oknie: tej sekundy nie ma już tury ani kolejnych okien, a potem nic
    expect(okna).toHaveLength(1);
    expect(tury).toHaveLength(okna[0] - 1);
    expect(g.sim.st.tick).toBe(okna[0] * TICKS_PER_SECOND);
  });
});

describe('ręce gry', () => {
  it('wejście niesie okolicę i ludność 2021 tylko wtedy, gdy gra je ma, a zarząd dostaje wtedy miasto i drogi', () => {
    const w = demoWorld('przymorze');
    const zwykla = nowaGraAi(w, 11);
    expect(wejscie(zwykla).okolica).toBeUndefined();
    expect(wejscie(zwykla).ludnosc2021).toBeUndefined();
    expect(zwykla.gov.miasto).toBeUndefined();
    expect(zwykla.gov.zwyciestwo).toBeUndefined();
    expect(zwykla.dziennik).toBeUndefined();
    const okolica = okolicaZGeo(demo.geo);
    const g = nowaGraAi(w, 11, { okolica, ludnosc2021: 900, dziennik: true });
    expect(wejscie(g).okolica).toBe(okolica);
    expect(wejscie(g).ludnosc2021).toBe(900);
    expect(g.gov.miasto).toBeDefined();
    expect(g.gov.zwyciestwo).toBeDefined();
    expect(g.dziennik).toEqual([]);
  });

  it('przydział na karcie: udany ruch zmienia kartę i trafia do dziennika, odmowa nie zostawia śladu', () => {
    const g = nowaGraAi(demoWorld('przymorze'), 11, { dziennik: true });
    let karty = 0;
    // decydent zmienia przydział pierwszej osoby, a kartę zostawia odpowiedzi domyślnej
    const d: Decydent = {
      okno(gr, p, r) {
        if (p.k !== 'karta') return;
        karty++;
        const osoba = p.card.people[0];
        const warta = osoba.options.find((o) => o.ok && o.key.startsWith('warta:'))!;
        expect(r.przydziel(osoba.id, 'sen')).toBe(true);
        expect(gr.gov.night!.assign[osoba.id]).toBe('sen');
        expect(r.przydziel(osoba.id, warta.key)).toBe(true);
        expect(gr.gov.night!.assign[osoba.id]).toBe(warta.key);
        expect(r.przydziel(osoba.id, 'wyprawa:nie_ma_takiej')).toBe(false);
        expect(r.przydziel('nie_ma_osoby', 'sen')).toBe(false);
        expect(gr.gov.night!.assign[osoba.id]).toBe(warta.key);
        expect(gr.dziennik!.filter((m) => m.t === 'noc')).toEqual([
          { s: sekunda(gr), t: 'noc', osoba: osoba.id, klucz: 'sen' },
          { s: sekunda(gr), t: 'noc', osoba: osoba.id, klucz: warta.key },
        ]);
      },
      tura: () => {},
    };
    // do 21:00 pierwszego dnia: karta z 20:00 jest już zatwierdzona, a rano jeszcze jej nie zdjęto
    grajDo(g, d, 6 * TICKS_PER_HOUR);
    expect(karty).toBe(1);
    // karta zatwierdzona z przydziałem decydenta
    expect(g.gov.night?.confirmed).toBe(true);
    expect(g.dziennik!.map((m) => m.t)).toContain('zatwierdz');
    // po zatwierdzeniu karty przydział się nie zmienia, więc ręka odmawia
    expect(zrobRece(g).przydziel(g.gov.night!.card.people[0].id, 'sen')).toBe(false);
  });

  it('wyprawa dzienna wychodzi przez wyslij, trafia do dziennika i nie wychodzi drugi raz', () => {
    const w = demoWorld('przymorze');
    const g = nowaGraAi(w, 11, { okolica: okolicaZGeo(demo.geo), dziennik: true });
    // dzień 2, 9:00
    grajDo(g, silnikPodstawowy, 18 * TICKS_PER_HOUR);
    const i = wejscie(g);
    expect([i.day, i.hour]).toEqual([2, 9]);
    const cel = najblizszeMiejsce(g.gov, i, 'spozywczy')!;
    expect(cel).not.toBeNull();
    const ids = i.people
      .filter((p) => !powodOdmowy(g.gov, i, cel, [p.id]))
      .slice(0, 2)
      .map((p) => p.id);
    expect(ids).toHaveLength(2);
    const wpisow = g.dziennik!.length;
    const r = zrobRece(g);
    expect(r.wyslij(cel, ids)).toBe(true);
    expect(g.dziennik!.slice(wpisow)).toEqual([{ s: 18 * 40, t: 'wyprawa', cel, ids }]);
    expect(g.gov.wyprawy).toHaveLength(1);
    // polecenie wyjścia czeka w kolejce symulacji, a osoby idą do bramy i znikają za mapą
    expect(g.sim.st.cmds).toEqual([{ t: 'away', ids: expect.any(Array) }]);
    grajDo(g, silnikPodstawowy, g.sim.st.tick + 600);
    expect(
      wejscie(g)
        .people.filter((p) => p.away)
        .map((p) => p.id),
    ).toEqual(ids);
    // druga wyprawa tych samych osób to odmowa: nic się nie zapisuje
    expect(r.wyslij(cel, ids)).toBe(false);
    expect(g.dziennik!).toHaveLength(wpisow + 1);
    expect(g.gov.wyprawy).toHaveLength(1);
  });
});
