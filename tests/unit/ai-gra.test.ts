/* Gra prowadzona przez decydenta (src/ai/gra.ts) i silnik podstawowy (src/ai/silnik.ts), etap 1 osady AI
   (docs/superpowers/plans/2026-10-21-osada-ai-etap-1.md, zadania 1 i 2; docs/superpowers/plans/2026-10-24-osada-ai-etap-2.md,
   zadanie 1). Równoważność silnika podstawowego z `playWithGov` jest w tests/unit/ai-rownowaznosc.test.ts, a pomocnik gier-prefiksów
   (`graPoDniach`) ma testy w tests/unit/ai-pomoc.test.ts. Tu pilnowane jest:
   - haków decydenta: `start` raz przed pierwszym krokiem, `tura` co sekundę przy ekranie;
   - determinizmu: dwie gry w jednym procesie przeplatane nierówno, zapis i wczytanie w połowie (także w środku
     sekundy) i odtworzenie ruchów rąk z dziennika na świeżej grze dają ten sam przebieg;
   - rąk gry: każde działanie decydenta idzie przez `Rece` i do dziennika, wyprawa dzienna wychodzi przez `wyslij`;
   - okien zarządu: okno, którego decydent nie zamknie, dostaje odpowiedź domyślną w tej samej sekundzie, a okno nieznanego
     rodzaju (z innej gałęzi) tylko z opcją `odpowiedzNaNieznane`, bez niej zostaje i idzie do zawieszonych (także u silnika);
   - końca gry: po `gov.over` `krokGry` nie rusza czasu i nie woła decydenta;
   - okien zawieszonych: okno, którego nie zamknie nawet odpowiedź domyślna, zapisuje się w `GraAi.zawieszone` (ostatnie 100
     wpisów, licznik wszystkich) i nie jest ponawiane w tej samej sekundzie;
   - błędów decydenta: rzut z `start`, `okno` albo `tura` łapie `krokGry`, zapisuje w `GraAi.bledy` (ostatnie 50, licznik
     wszystkich, tekst bez stosu) i gra idzie dalej tak samo jak z decydentem, który w tym miejscu nic nie robi;
   - tempa przeglądarki: z opcją `tempoPrzegladarki` potwierdzenie raportu przekazuje wejście jak main.ts;
   - łańcuchów kart: opcja `lancuchy` włącza je jak nowa gra w przeglądarce (bez niej zarząd nie wybiera wątków), a zapis
     i wczytanie w połowie gry z łańcuchami (wątki, haki, rozpoczęte kroki) nie zmieniają przebiegu.
   Gry, które kilka testów zaczyna tak samo, biorą się z pamięci pliku (`graPoDniach`); testy zapisu i wczytania zagrywają
   jedną grę ciągłą i robią z niej zapisy po drodze, żeby porównanie dotyczyło gry bez przerw. */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  type Decydent,
  type GraAi,
  grajDo,
  krokGry,
  MAX_BLEDOW,
  MAX_ZAWIESZONYCH,
  nowaGraAi,
  type OpcjeGryAi,
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
import { graPoDniach, swiezySwiat, szpieg } from './ai-pomoc.ts';
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

describe('haki decydenta', () => {
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
    // każda gra osobno: doba gry silnikiem z pamięci (`graPoDniach` oddaje grę niezależną od innych)
    const solo = (demoKlucz: string, ziarno: number): string => skrotGry(graPoDniach(demoKlucz, ziarno, 1));
    const przymorze = solo('przymorze', 11);
    const zielonki = solo('zielonki', 12);
    const a = nowaGraAi(swiezySwiat('przymorze'), 11);
    const b = nowaGraAi(swiezySwiat('zielonki'), 12);
    // nierówno: siedem kroków jednej gry, trzy drugiej, ten sam decydent w obu
    while (a.sim.st.tick < doba || b.sim.st.tick < doba) {
      for (let k = 0; k < 7 && a.sim.st.tick < doba; k++) krokGry(a, silnik);
      for (let k = 0; k < 3 && b.sim.st.tick < doba; k++) krokGry(b, silnik);
    }
    expect(skrotGry(a)).toBe(przymorze);
    expect(skrotGry(b)).toBe(zielonki);
  });

  it('zapis i wczytanie w połowie nie zmieniają przebiegu', () => {
    // Jedna gra ciągła mija wszystkie przerwy: zapis w przerwie to odczyt, który jej nie rusza, a gra wczytana z niego ma dojść
    // do tego samego skrótu co ona. Przerwy: po pierwszej półminucie (pamięć silnika już zapisana), po pełnej dobie i w środku
    // sekundy; między sekundami decydent nie ma żadnego stanu poza pamięcią w grze (pamięć niepustą sprawdza osobny test silnika
    // podstawowego).
    const ciagla = nowaGraAi(swiezySwiat('przymorze'), 11);
    const zapisy: { zapis: ZapisGryAi; skrot: string }[] = [];
    for (const przerwa of [700, TICKS_PER_DAY, TICKS_PER_DAY + 7]) {
      grajDo(ciagla, silnik, przerwa);
      zapisy.push({ zapis: JSON.parse(JSON.stringify(zapiszGre(ciagla))) as ZapisGryAi, skrot: skrotGry(ciagla) });
    }
    grajDo(ciagla, silnik, 2 * TICKS_PER_DAY);
    for (const { zapis, skrot } of zapisy) {
      // wczytana gra dostaje świeży świat, jak w przeglądarce (nowy start buduje świat od nowa)
      const b = wczytajGre(swiezySwiat('przymorze'), zapis);
      expect(b.pamiec).toEqual(zapis.pamiec);
      expect(skrotGry(b)).toBe(skrot);
      grajDo(b, silnik, 2 * TICKS_PER_DAY);
      expect(skrotGry(b), `przerwa w ticku ${zapis.sim.tick}`).toBe(skrotGry(ciagla));
    }
  });

  it('zapis jest głęboką kopią: gra po zapisie ani po wczytaniu nie rusza zapisu', () => {
    const a = graPoDniach('przymorze', 11, 1);
    const zapis = zapiszGre(a);
    const json = JSON.stringify(zapis);
    grajDo(a, silnik, TICKS_PER_DAY + 2000);
    expect(JSON.stringify(zapis)).toBe(json);
    // ten sam zapis wczytany dwa razy to dwie niezależne gry z tym samym przebiegiem
    const b = wczytajGre(swiezySwiat('przymorze'), zapis);
    const c = wczytajGre(swiezySwiat('przymorze'), zapis);
    grajDo(b, silnik, TICKS_PER_DAY + 2000);
    expect(JSON.stringify(zapis)).toBe(json);
    grajDo(c, silnik, TICKS_PER_DAY + 2000);
    expect(skrotGry(c)).toBe(skrotGry(b));
    expect(skrotGry(b)).toBe(skrotGry(a));
  });

  it('odtworzenie ruchów rąk z dziennika na świeżej grze daje ten sam stan', () => {
    const g = nowaGraAi(swiezySwiat('przymorze'), 11, { dziennik: true });
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
    const swieza = nowaGraAi(swiezySwiat('przymorze'), 11);
    grajDo(swieza, odtwarzacz(dziennik), 2 * TICKS_PER_DAY);
    expect(swieza.sim.hash()).toBe(g.sim.hash());
    expect(JSON.stringify(swieza.gov)).toBe(JSON.stringify(g.gov));
  });
});

describe('łańcuchy kart (opcja lancuchy)', () => {
  const opcje = () => ({ obcy: true, okolica: okolicaZGeo(demo.geo), ludnosc2021: 900, lancuchy: true });

  it('bez opcji zarząd gry nie ma łańcuchów (jak w botach), z opcją ma je tak, jak nowa gra w przeglądarce', () => {
    const bez = nowaGraAi(swiezySwiat('przymorze'), 12);
    expect(bez.gov.lancuchy).toBeUndefined();
    expect(bez.opts.lancuchy).toBeUndefined();
    const z = nowaGraAi(swiezySwiat('przymorze'), 12, { lancuchy: true });
    expect(z.gov.lancuchy).toBe(true);
    expect(z.opts.lancuchy).toBe(true);
    // wątki sezonu powstają dopiero przy pierwszym wydarzeniu, nie przy starcie
    expect(z.gov.watki).toBeUndefined();
  });

  it('bez opcji gra nie wybiera wątków ani nie zakłada stanu łańcuchów nawet po kilku dobach (uprząż sprzed łańcuchów gra tak samo)', () => {
    const bez = graPoDniach('przymorze', 12, 4, { ...opcje(), lancuchy: false });
    expect(bez.gov.watki).toBeUndefined();
    expect(bez.gov.lancuchy).toBeUndefined();
    // a z opcją te same cztery doby mają wątki i rozpoczęte kroki
    const z = graPoDniach('przymorze', 12, 4, opcje());
    expect(z.gov.watki?.wybrane.length).toBe(3);
  });

  it('z łańcuchami zapis i wczytanie w połowie nie zmieniają przebiegu: wątki, haki i kroki jadą w zapisie', () => {
    // jedna gra ciągła, zapisy w przerwach jak w teście wyżej
    const ciagla = nowaGraAi(swiezySwiat('przymorze'), 12, opcje());
    const zapisy: { zapis: ZapisGryAi; watki: unknown; skrot: string }[] = [];
    for (const przerwa of [2 * TICKS_PER_DAY + 7, 3 * TICKS_PER_DAY]) {
      grajDo(ciagla, silnik, przerwa);
      // do przerwy wątki są wybrane, a jakiś krok rozpoczęty: zapis musi to przenieść (nie przechodzi na pustym warunku)
      expect(Object.values(ciagla.gov.watki?.krok ?? {}).some((n) => n > 0)).toBe(true);
      zapisy.push({
        zapis: JSON.parse(JSON.stringify(zapiszGre(ciagla))) as ZapisGryAi,
        watki: structuredClone(ciagla.gov.watki),
        skrot: skrotGry(ciagla),
      });
    }
    grajDo(ciagla, silnik, 4 * TICKS_PER_DAY);
    for (const { zapis, watki, skrot } of zapisy) {
      const b = wczytajGre(swiezySwiat('przymorze'), zapis);
      expect(b.gov.lancuchy).toBe(true);
      expect(b.gov.watki).toEqual(watki);
      expect(skrotGry(b)).toBe(skrot);
      grajDo(b, silnik, 4 * TICKS_PER_DAY);
      expect(skrotGry(b)).toBe(skrotGry(ciagla));
    }
  });
});

describe('pamięć silnika podstawowego', () => {
  it('drzewo, do którego nikt nie doszedł, idzie do pominiętych, a następne polecenie dostaje inne', () => {
    const g = nowaGraAi(swiezySwiat('przymorze'), 11, { dziennik: true });
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
    const kopia = wczytajGre(swiezySwiat('przymorze'), JSON.parse(JSON.stringify(zapiszGre(g))) as ZapisGryAi);
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
    const opcja = (id: string, s: LawOption['s']): LawOption => ({ id, s }) as LawOption;
    /** ruchy rąk, którymi odpowiedź domyślna odpowiada na okno; `nieznane` to trzeci argument (bez niego jak dawniej) */
    const odpowiedz = (p: unknown, nieznane?: boolean): string[] => {
      const { r, ruchy } = szpieg();
      odpowiedzDomyslna(p as Prompt, r, nieznane);
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

    it('trzeci argument false: nieznany rodzaj okna nie dostaje odpowiedzi, znane rodzaje zawsze', () => {
      const nieznane = { k: 'nowe_okno', choices: [{ ok: false }, { ok: true }] };
      expect(odpowiedz(nieznane, true)).toEqual(['wydarzenie:1']);
      expect(odpowiedz(nieznane, false)).toEqual([]);
      expect(odpowiedz({ k: 'nowe_okno' }, false)).toEqual([]);
      // bez trzeciego argumentu jak dawniej: odpowiedź jak na wydarzenie
      expect(odpowiedz(nieznane)).toEqual(['wydarzenie:1']);
      // znane rodzaje nie zależą od tej decyzji
      for (const nz of [true, false]) {
        expect(odpowiedz({ k: 'raport', report: { day: 1 } }, nz)).toEqual(['raport']);
        expect(odpowiedz({ k: 'karta', card: { day: 1 }, assign: {} }, nz)).toEqual(['zatwierdz']);
        expect(odpowiedz({ k: 'zwyciestwo', droga: 'ludnosc' }, nz)).toEqual(['dalej']);
        expect(odpowiedz({ k: 'wydarzenie', id: 'x', choices: [{ ok: false }, { ok: true }] }, nz)).toEqual([
          'wydarzenie:1',
        ]);
      }
    });
  });
});

describe('okna zawieszone', () => {
  /** okno nowego rodzaju, którego nie zamknie ani decydent, ani odpowiedź domyślna (`wybierz` nic nie zmienia) */
  const nowe = { k: 'nowe_okno', id: 'x', choices: [{ ok: true }] } as unknown as Prompt;

  it('okno, którego nie zamknie nawet odpowiedź domyślna, zapisuje się i nie jest ponawiane w tej samej sekundzie', () => {
    // z opcją odpowiedzNaNieznane okno nowego rodzaju dostaje odpowiedź domyślną (wybór jak w wydarzeniu), a że `wybierz`
    // sztucznego okna niczego nie zmienia, zostaje ono zawieszone
    const g = nowaGraAi(demoWorld('przymorze'), 11, { dziennik: true, odpowiedzNaNieznane: true });
    expect(g.zawieszone).toEqual([]);
    expect(g.zawieszonychRazem).toBe(0);
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
    expect(g.zawieszonychRazem).toBe(3);
  });

  it('nieznany rodzaj okna bez odpowiedzNaNieznane zostaje i trafia do zawieszone, z opcją dostaje wybór 0', () => {
    const graj = (opts: OpcjeGryAi, decydent: Decydent): GraAi => {
      const g = nowaGraAi(demoWorld('przymorze'), 11, { dziennik: true, ...opts });
      sztuczne.okno = nowe;
      try {
        grajDo(g, decydent, 3 * TICKS_PER_SECOND);
      } finally {
        sztuczne.okno = null;
      }
      return g;
    };
    const wybory = (g: GraAi): RuchRak[] => g.dziennik!.filter((m) => m.t === 'wydarzenie');
    const zawieszone = [1, 2, 3].map((s) => ({ k: 'nowe_okno', s }));
    // decydent, który nie rusza okna, i silnik: żaden z nich ani odpowiedź domyślna gry nie odpowiada na nieznany rodzaj okna
    for (const decydent of [{ okno: () => {}, tura: () => {} }, silnik]) {
      for (const opts of [{}, { odpowiedzNaNieznane: false }]) {
        const bez = graj(opts, decydent);
        expect(bez.zawieszone, JSON.stringify(opts)).toEqual(zawieszone);
        expect(wybory(bez), JSON.stringify(opts)).toEqual([]);
      }
    }
    // z opcją: pierwszy dozwolony wybór (indeks 0) od odpowiedzi domyślnej gry, a silnik odpowiada tak samo już sam; okno
    // sztuczne zostaje na miejscu, więc i tak ląduje w zawieszonych
    const doNothing = graj({ odpowiedzNaNieznane: true }, { okno: () => {}, tura: () => {} });
    expect(wybory(doNothing)).toEqual([
      { s: 1, t: 'wydarzenie', k: 0 },
      { s: 2, t: 'wydarzenie', k: 0 },
      { s: 3, t: 'wydarzenie', k: 0 },
    ]);
    expect(doNothing.zawieszone).toEqual(zawieszone);
    const zSilnikiem = graj({ odpowiedzNaNieznane: true }, silnik);
    expect(wybory(zSilnikiem).length).toBeGreaterThanOrEqual(3);
    for (const m of wybory(zSilnikiem)) expect(m).toMatchObject({ t: 'wydarzenie', k: 0 });
    // opcja jedzie w zapisie gry jak inne opcje
    expect(wczytajGre(demoWorld('przymorze'), zapiszGre(doNothing)).opts.odpowiedzNaNieznane).toBe(true);
  });

  it('1000 sekund z zawieszonym oknem: lista trzyma ostatnie 100 wpisów, a licznik zna wszystkie', () => {
    const g = nowaGraAi(demoWorld('przymorze'), 11);
    sztuczne.okno = nowe;
    try {
      grajDo(g, { okno: () => {}, tura: () => {} }, 1000 * TICKS_PER_SECOND);
    } finally {
      sztuczne.okno = null;
    }
    expect(MAX_ZAWIESZONYCH).toBe(100);
    expect(g.zawieszone).toHaveLength(100);
    expect(g.zawieszonychRazem).toBe(1000);
    // ostatnie sto sekund, po kolei
    expect(g.zawieszone[0]).toEqual({ k: 'nowe_okno', s: 901 });
    expect(g.zawieszone.at(-1)).toEqual({ k: 'nowe_okno', s: 1000 });
    expect(g.zawieszone.map((z) => z.s)).toEqual(Array.from({ length: 100 }, (_, n) => 901 + n));
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

  it('zawieszone nie wchodzi do zapisu ani do skrótu gry: wczytana gra zaczyna z pustą listą i zerowym licznikiem', () => {
    const g = nowaGraAi(demoWorld('przymorze'), 11);
    const skrot = skrotGry(g);
    g.zawieszone.push({ k: 'nowe_okno', s: 7 });
    g.zawieszonychRazem = 1;
    expect(skrotGry(g)).toBe(skrot);
    const zapis = zapiszGre(g);
    expect(Object.keys(zapis).sort()).toEqual(['gov', 'opts', 'pamiec', 'seed', 'sim', 'v']);
    const wczytana = wczytajGre(demoWorld('przymorze'), zapis);
    expect(wczytana.zawieszone).toEqual([]);
    expect(wczytana.zawieszonychRazem).toBe(0);
  });
});

describe('błędy decydenta', () => {
  /** decydent, który nic nie robi i nie rzuca: wzorzec skrótu dla decydentów, którzy rzucają zamiast coś zrobić */
  const nicNieRobi: Decydent = { start: () => {}, okno: () => {}, tura: () => {} };
  const doba = TICKS_PER_DAY;

  it('decydent rzuca w oknie i w turze: gra idzie dalej, okna zamyka odpowiedź domyślna, błędy mają miejsce, sekundę i tekst bez stosu', () => {
    const sekundyOkien: number[] = [];
    const rzuca: Decydent = {
      okno: (gr) => {
        sekundyOkien.push(sekunda(gr));
        throw new Error('rzut w oknie');
      },
      tura: (gr) => {
        if (sekunda(gr) % 100 === 0) throw new Error('rzut w turze');
      },
    };
    const a = nowaGraAi(swiezySwiat('przymorze'), 11, { dziennik: true });
    expect(() => grajDo(a, rzuca, doba)).not.toThrow();
    expect(a.sim.st.tick).toBe(doba);
    // błędy: każde okno ma wpis z sekundą, w której decydent je dostał, a tura jeden na każdą setną sekundę
    expect(sekundyOkien.length).toBeGreaterThanOrEqual(3);
    expect(a.bledy.length).toBeLessThan(MAX_BLEDOW);
    expect(a.bledy.filter((b) => b.gdzie === 'okno')).toEqual(
      sekundyOkien.map((s) => ({ s, gdzie: 'okno', tekst: 'Error: rzut w oknie' })),
    );
    expect(a.bledy.filter((b) => b.gdzie === 'tura')).toEqual(
      Array.from({ length: 9 }, (_, n) => ({ s: (n + 1) * 100, gdzie: 'tura', tekst: 'Error: rzut w turze' })),
    );
    expect(a.bledowRazem).toBe(a.bledy.length);
    // tekst nie niesie stosu
    for (const b of a.bledy) {
      expect(b.tekst).not.toContain('\n');
      expect(b.tekst).not.toContain(' at ');
    }
    // okna zamknęła odpowiedź domyślna: nic nie zawisło, a w dzienniku są jej ruchy (raport, uchwała, karta nocy)
    expect(a.zawieszone).toEqual([]);
    const rodzaje = new Set(a.dziennik!.map((m) => m.t));
    for (const t of ['raport', 'uchwala', 'zatwierdz'] as const) expect(rodzaje).toContain(t);
    // i to samo, co zrobiłby decydent, który zamiast rzutu nic nie robi
    const b = nowaGraAi(swiezySwiat('przymorze'), 11, { dziennik: true });
    grajDo(b, nicNieRobi, doba);
    expect(b.bledy).toEqual([]);
    expect(skrotGry(a)).toBe(skrotGry(b));
    expect(a.dziennik).toEqual(b.dziennik);
  });

  it('decydent rzuca w starcie: błąd z sekundą 0, gra rusza i idzie tak samo jak z decydentem, który nic nie robi', () => {
    const rzuca: Decydent = {
      ...nicNieRobi,
      start: () => {
        throw new Error('rzut w starcie');
      },
    };
    const a = nowaGraAi(swiezySwiat('przymorze'), 11);
    expect(() => grajDo(a, rzuca, 3 * TICKS_PER_SECOND)).not.toThrow();
    expect(a.sim.st.tick).toBe(3 * TICKS_PER_SECOND);
    expect(a.bledy).toEqual([{ s: 0, gdzie: 'start', tekst: 'Error: rzut w starcie' }]);
    const b = nowaGraAi(swiezySwiat('przymorze'), 11);
    grajDo(b, nicNieRobi, 3 * TICKS_PER_SECOND);
    expect(skrotGry(a)).toBe(skrotGry(b));
  });

  it('tekst błędu: nazwa i komunikat bez stosu, każda rzucona wartość daje napis, długi komunikat jest ucięty', () => {
    const rzutPrzez = (wartosc: unknown): string => {
      const g = nowaGraAi(demoWorld('przymorze'), 11);
      grajDo(
        g,
        {
          ...nicNieRobi,
          tura: () => {
            throw wartosc;
          },
        },
        TICKS_PER_SECOND,
      );
      expect(g.bledy).toHaveLength(1);
      expect(g.bledy[0]).toMatchObject({ s: 1, gdzie: 'tura' });
      return g.bledy[0].tekst;
    };
    expect(rzutPrzez(new TypeError('zły typ'))).toBe('TypeError: zły typ');
    expect(rzutPrzez('sam napis')).toBe('sam napis');
    expect(rzutPrzez(42)).toBe('42');
    expect(rzutPrzez(null)).toBe('null');
    expect(rzutPrzez(undefined)).toBe('undefined');
    // wartość, której nie da się zamienić na napis, nie może wywrócić gry (obsługa błędu sama nie rzuca)
    const zlosliwa = {
      toString() {
        throw new Error('toString rzuca');
      },
    };
    expect(rzutPrzez(zlosliwa)).toEqual(expect.any(String));
    // komunikat z całym stanem gry w środku nie może rosnąć bez końca
    const dlugi = rzutPrzez(new Error('x'.repeat(10_000)));
    expect(dlugi.startsWith('Error: xxx')).toBe(true);
    expect(dlugi.length).toBeLessThan(500);
  });

  it('decydent rzuca co sekundę: lista trzyma ostatnie MAX_BLEDOW błędów, licznik zna wszystkie, a gra idzie jak z decydentem, który nic nie robi', () => {
    const rzuca: Decydent = {
      ...nicNieRobi,
      tura: (gr) => {
        throw new Error(`sekunda ${sekunda(gr)}`);
      },
    };
    const a = nowaGraAi(swiezySwiat('przymorze'), 11);
    grajDo(a, rzuca, 120 * TICKS_PER_SECOND);
    expect(MAX_BLEDOW).toBe(50);
    expect(a.bledy).toHaveLength(MAX_BLEDOW);
    expect(a.bledowRazem).toBe(120);
    expect(a.bledy.map((b) => b.s)).toEqual(Array.from({ length: MAX_BLEDOW }, (_, n) => 71 + n));
    expect(a.bledy.at(-1)).toEqual({ s: 120, gdzie: 'tura', tekst: 'Error: sekunda 120' });
    const b = nowaGraAi(swiezySwiat('przymorze'), 11);
    grajDo(b, nicNieRobi, 120 * TICKS_PER_SECOND);
    expect(skrotGry(a)).toBe(skrotGry(b));
  });

  it('błąd w jednym z dwóch przeplatanych decydentów nie dotyka drugiej gry', () => {
    const rzuca: Decydent = {
      ...nicNieRobi,
      tura: () => {
        throw new Error('rzut');
      },
    };
    const a = nowaGraAi(swiezySwiat('przymorze'), 11);
    const b = nowaGraAi(swiezySwiat('zielonki'), 12);
    for (let k = 0; k < 40 * TICKS_PER_SECOND; k++) {
      krokGry(a, rzuca);
      krokGry(b, nicNieRobi);
    }
    expect(a.bledowRazem).toBe(40);
    expect(b.bledy).toEqual([]);
    expect(b.bledowRazem).toBe(0);
  });

  it('błędy nie wchodzą do zapisu ani do skrótu gry: wczytana gra zaczyna z pustą listą i zerowym licznikiem', () => {
    const g = nowaGraAi(demoWorld('przymorze'), 11);
    const skrot = skrotGry(g);
    g.bledy.push({ s: 3, gdzie: 'okno', tekst: 'Error: x' });
    g.bledowRazem = 1;
    expect(skrotGry(g)).toBe(skrot);
    const wczytana = wczytajGre(demoWorld('przymorze'), zapiszGre(g));
    expect(wczytana.bledy).toEqual([]);
    expect(wczytana.bledowRazem).toBe(0);
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
    const ciagla = nowaGraAi(swiezySwiat('przymorze'), 11, { tempoPrzegladarki: true });
    grajDo(ciagla, silnik, TICKS_PER_DAY);
    const b = wczytajGre(swiezySwiat('przymorze'), JSON.parse(JSON.stringify(zapiszGre(ciagla))) as ZapisGryAi);
    expect(b.opts.tempoPrzegladarki).toBe(true);
    grajDo(ciagla, silnik, 2 * TICKS_PER_DAY);
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
