/* Warstwa jedzenia silnika osady AI (src/ai/jedzenie.ts, `silnik` w src/ai/silnik.ts), etap 1 osady AI
   (docs/superpowers/plans/2026-10-21-osada-ai-etap-1.md, zadanie 4). Powód warstwy: po ogrzanej sypialni gry kończy głód
   (dni 19–29, docs/ocena/2026-10-20-zima-w-grach-botow.md, sekcja 7 punkt 4): zapas startowy (40 porcji) schodzi do zera
   około 9. dnia, zarząd traci zdrowie, a bez zdrowych nie ma ani dyżuru przy kozie, ani warty. Pilnuje sześciu rzeczy:
   - miar zapasu: `jedzenieNaGlowe` (surowe i ugotowane porcje na osobę zarządu; mieszkańcy siedziby nie jedzą z zapasu
     zarządu i się nie liczą, tak jak w symulacji, zadanie 7) i `stacNaPrzyjecie` (po przyjęciu co najmniej 2 porcje na osobę
     zarządu), z których korzystają wyprawy, uchwała o kotle, werbunek wędrowców i (zadanie 5) wydarzenia z przyjęciem;
   - wyprawy dziennej po jedzenie: poniżej 2 porcji na głowę, tylko między 8:00 a 15:00, jedna naraz, przez mapę miasta jak
     gracz (`Rece.wyslij` z celem z `celZMiejsca`), do najbliższego sklepu z zapasem poza mapą lokalną, z dwiema
     najzdrowszymi osobami, ale tak, żeby ktoś zdrowy został na dyżur przy kozie tej nocy;
   - ogródka: od 2. dnia jeden na podwórku, gdy go nie ma, ale dopiero gdy plan pracowni przestał czekać na deski (w Zielonkach
     ogródek stawiany razem z planem pracowni zjadał jej deski i koza z beczki nie stawała);
   - uchwały o wspólnym kotle: przy mniej niż 1 porcji na głowę `uchwalaNaGlod` wybiera ją (gdy ścieżka „wspólnota” jest jeszcze
     otwarta: po `u_warty` kocioł jest zablokowany), a `silnik` (od zadania 5, `wyborUchwaly` w src/ai/okna.ts) podpisuje kocioł
     już w pierwszym oknie, bo `u_warty` z drogi porządku blokuje go do końca gry, a pierwszego wieczoru głodu jeszcze nie ma;
   - przebiegu w prawdziwej grze (Przymorze, ziarno 11, jak w przeglądarce: obcy, mieszkańcy z adresu, okolica, łańcuchy kart):
     wyprawa w każdym dniu głodu, dolne granice zmierzone na tym przebiegu (zapas co najmniej 5 porcji o 6:00 w dniach 2–15,
     średnie zdrowie zarządu w 12. dniu co najmniej 70, średnie najedzenie o 6:00 w dniach 15–18 co najmniej 30), okno godzin
     i jedna wyprawa naraz. Granice mają łapać brak warstwy: `ZM_JAK_BAZA=1 npx vitest run tests/unit/ai-jedzenie.test.ts` gra
     ten sam przebieg silnikiem bez wypraw po jedzenie i bez ogródka (jak silnik z zadania 3) i testy przebiegu mają wtedy padać.
     Uprząż (`przygotujGre`) gra od części B zadania 7 z łańcuchami kart, jak gra w przeglądarce; liczby w komentarzach tych
     testów to pomiar z łańcuchami, a w nawiasie „bez łańcuchów” ten sam przebieg ze starą uprzęgą (`lancuchy` wyłączone).
     Cel z planu „średnie najedzenie zarządu o 6:00 w dniach 15–25 co najmniej 25” jest tu sprawdzony na tym przebiegu
     (zmierzone 58,5); na wszystkich demach i ziarnach mierzy go bramka etapu (`npm run bot:osada`);
   - determinizmu (zapis i wczytanie w trakcie wyprawy) i kosztu (warstwa najwyżej raz na 30 sekund przy ekranie). */

import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  type Decydent,
  type GraAi,
  grajDo,
  nowaGraAi,
  type Rece,
  skrotGry,
  wczytajGre,
  wejscie,
  type ZapisGryAi,
  zapiszGre,
} from '../../src/ai/gra.ts';
import { jedzenieNaGlowe, stacNaPrzyjecie, turaJedzenia, uchwalaNaGlod } from '../../src/ai/jedzenie.ts';
import { miejsceNa } from '../../src/ai/miejsca.ts';
import { silnik, silnikPodstawowy } from '../../src/ai/silnik.ts';
import { FIRST_LAWS } from '../../src/gov/tresc.ts';
import type { GovInput, LawOption, Prompt } from '../../src/gov/typy.ts';
import { lawState } from '../../src/gov/uchwaly.ts';
import { celZMiejsca, zostaloZMiejsca } from '../../src/gov/wyprawy.ts';
import { dayOf, hourOf, TICKS_PER_HOUR, TICKS_PER_SECOND } from '../../src/sim/clock.ts';
import { houseOf } from '../../src/sim/house.ts';
import { naMapieLokalnej } from '../../src/world/miasto.ts';
import { poranekTick, przygotujGre } from '../../tools/bot-osada.ts';
import { rzecz, szpieg, tickDnia } from './ai-pomoc.ts';
import { najblizszeMiejsce, okolicaZGeo } from './miasto-play.ts';
import { demoWorld } from './sasiedzi-pomoc.ts';

const demo = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../public/demo/przymorze.json'), 'utf8'));

/** gra z mapą miasta jak w przeglądarce (okolica z geo dema, bez mieszkańców z adresu), doprowadzona silnikiem
    podstawowym (bez warstw) do dnia i godziny */
function graNa(dzien: number, godzina: number): GraAi {
  const g = nowaGraAi(demoWorld('przymorze'), 11, { okolica: okolicaZGeo(demo.geo) });
  grajDo(g, silnikPodstawowy, tickDnia(dzien, godzina));
  return g;
}

/** w zapasach dokładnie `porcje` porcji surowego jedzenia (bez ugotowanych) */
function ustawJedzenie(g: GraAi, porcje: number): void {
  const st = g.sim.st;
  st.things = st.things.filter((t) => t.kind !== 'jedzenie' && t.kind !== 'posilek');
  const kafelek = houseOf(g.w)!.sklad[0];
  if (porcje > 0) st.things.push(rzecz(g, 'jedzenie', kafelek % g.w.size, Math.floor(kafelek / g.w.size), porcje));
}

/** osoby zarządu w kolejności pionków, ze zdrowiem i wypoczęciem z podanych list (wypoczęcie domyślnie 80) */
function ustawLudzi(g: GraAi, zdrowie: readonly number[], wypoczecie: readonly number[] = []): string[] {
  const rdzen = g.sim.st.pawns.filter((p) => p.kind === 'core');
  rdzen.forEach((p, k) => {
    p.needs!.health = zdrowie[k] ?? 100;
    p.needs!.rest = wypoczecie[k] ?? 80;
  });
  return rdzen.map((p) => g.sim.st.people[p.person].id);
}

/** Ręce bez tego, co robi warstwa jedzenia: wyprawy nie wychodzą (`wyslij` odmawia), plan ogródka nie powstaje; reszta
    rąk (budowy zimy, drewno, okna zarządu) bez zmian. */
function receBezJedzenia(r: Rece): Rece {
  return {
    ...r,
    wyslij: () => false,
    polecenie: (c) => {
      if (!(c.t === 'build' && c.kind === 'ogrodek')) r.polecenie(c);
    },
  };
}

/** Silnik „jak baza”: silnik z samą zimą, czyli sprzed warstwy jedzenia (wyprawy po jedzenie i ogródek zablokowane w rękach). */
const silnikJakBaza: Decydent = { ...silnik, tura: (g, r) => silnik.tura(g, receBezJedzenia(r)) };

/** Decydent testów przebiegu: silnik, a z `ZM_JAK_BAZA=1` silnik jak baza (pokazuje, że dolne granice łapią brak warstwy). */
const decydentPrzebiegu: Decydent = process.env.ZM_JAK_BAZA === '1' ? silnikJakBaza : silnik;

/** wejście z ręcznie ustawionymi ludźmi i zapasami (reszta z gry) */
function wejscieZ(g: GraAi, ludzie: number, porcje: number, ugotowane = 0, mieszkancy = 0): GovInput {
  const i = wejscie(g);
  return {
    ...i,
    people: i.people.slice(0, ludzie),
    residents: mieszkancy,
    stock: { ...i.stock, supplies: porcje, meals: ugotowane },
  };
}

describe('miary zapasu', () => {
  it('jedzenieNaGlowe liczy surowe i ugotowane porcje na osobę zarządu; mieszkańcy siedziby nie jedzą z zapasu i się nie liczą', () => {
    const g = nowaGraAi(demoWorld('przymorze'), 11);
    // 10 surowych + 6 ugotowanych, 3 osoby zarządu + 5 mieszkańców: 16 / 3 (tak samo liczy okazję do werbunku symulacja,
    // `okazjaWerbunku` w src/sim/sim.ts: porcje na osobę z zarządu; pot dla zarządu `potTarget` też nie liczy mieszkańców)
    expect(jedzenieNaGlowe(wejscieZ(g, 3, 10, 6, 5))).toBeCloseTo(16 / 3, 10);
    expect(jedzenieNaGlowe(wejscieZ(g, 3, 10, 6, 0))).toBe(jedzenieNaGlowe(wejscieZ(g, 3, 10, 6, 40)));
    // bez mieszkańców i bez ugotowanych: same surowe na osoby zarządu
    expect(jedzenieNaGlowe(wejscieZ(g, 4, 10))).toBe(2.5);
    // bez pola mieszkańców (ręczne wejście testów) i bez ugotowanych
    const i = wejscieZ(g, 4, 12);
    delete i.residents;
    delete i.stock.meals;
    expect(jedzenieNaGlowe(i)).toBe(3);
    // pusty zapas
    expect(jedzenieNaGlowe(wejscieZ(g, 4, 0))).toBe(0);
  });

  it('stacNaPrzyjecie: 8 porcji, 3 osoby, przyjęcie 1: tak; przyjęcie 2: nie', () => {
    const g = nowaGraAi(demoWorld('przymorze'), 11);
    const i = wejscieZ(g, 3, 8);
    expect(stacNaPrzyjecie(i, 1)).toBe(true); // 8 / 4 = 2
    expect(stacNaPrzyjecie(i, 2)).toBe(false); // 8 / 5 = 1,6
    // bez przyjęcia liczy się obecny stan: 8 / 3
    expect(stacNaPrzyjecie(i, 0)).toBe(true);
  });

  it('stacNaPrzyjecie liczy też ugotowane porcje, ale nie mieszkańców', () => {
    const g = nowaGraAi(demoWorld('przymorze'), 11);
    // 8 surowych + 4 ugotowane = 12 porcji, 3 osoby zarządu: po trzech przyjęciach 6 jedzących, 12 / 6 = 2; po czterech nie
    expect(stacNaPrzyjecie(wejscieZ(g, 3, 8, 4), 3)).toBe(true);
    expect(stacNaPrzyjecie(wejscieZ(g, 3, 8, 4), 4)).toBe(false);
    // bez ugotowanych tylko 8 porcji: po jednym przyjęciu 8 / 4 = 2, po dwóch 8 / 5
    expect(stacNaPrzyjecie(wejscieZ(g, 3, 8, 0), 1)).toBe(true);
    expect(stacNaPrzyjecie(wejscieZ(g, 3, 8, 0), 2)).toBe(false);
    // mieszkańcy siedziby nie jedzą z zapasu zarządu, więc nie zmieniają odpowiedzi (przed zmianą 8 / 6 mówiło „nie”)
    for (const mieszkancy of [0, 2, 15])
      expect(stacNaPrzyjecie(wejscieZ(g, 3, 8, 0, mieszkancy), 1), `${mieszkancy}`).toBe(true);
  });
});

describe('wyprawa dzienna po jedzenie', () => {
  /** gra w dniu 3 o 9:00 z podanym zapasem i zdrowiem osób zarządu; tura warstwy na ręce-szpiegu */
  function wyprawaPrzy(porcje: number, zdrowie: readonly number[] = [90, 80, 70, 60], godzina = 9) {
    const g = graNa(3, godzina);
    ustawJedzenie(g, porcje);
    const ludzie = ustawLudzi(g, zdrowie);
    const s = szpieg();
    turaJedzenia(g, s.r);
    return { g, s, ludzie };
  }

  it('poniżej 2 porcji na głowę: wychodzi jedna wyprawa do najbliższego sklepu spożywczego z zapasem, poza mapą lokalną', () => {
    const { g, s } = wyprawaPrzy(2);
    expect(s.wyslano).toHaveLength(1);
    const cel = s.wyslano[0].cel;
    // ten sam cel co najbliższy sklep spożywczy bota mapy miasta: poza mapą lokalną, z zapasem
    const i = wejscie(g);
    expect(cel.klucz).toBe(najblizszeMiejsce(g.gov, i, 'spozywczy')!.klucz);
    expect(cel.kat).toBe('spozywczy');
    expect(zostaloZMiejsca(g.gov, cel)).toBeGreaterThan(0);
    expect(naMapieLokalnej(cel)).toBe(false);
  });

  it('z dwiema najzdrowszymi osobami', () => {
    const { s, ludzie } = wyprawaPrzy(2, [70, 95, 60, 85]);
    expect(s.wyslano[0].ids).toEqual([ludzie[1], ludzie[3]]);
  });

  it('przy zapasie na 2 porcje na głowę i więcej wyprawy nie ma', () => {
    const g = graNa(3, 9);
    // zapas liczy się na osoby zarządu: mieszkańcy siedziby nie jedzą z zapasu zarządu (w tej grze są już mieszkańcy, więc test
    // odróżnia obie miary)
    expect(wejscie(g).residents).toBeGreaterThan(0);
    const ludzi = wejscie(g).people.length;
    ustawLudzi(g, [90, 80, 70, 60]);
    for (const [porcje, wyprawa] of [
      [2 * ludzi - 1, true],
      [2 * ludzi, false],
      [5 * ludzi, false],
    ] as const) {
      ustawJedzenie(g, porcje);
      const s = szpieg();
      turaJedzenia(g, s.r);
      expect(s.wyslano.length > 0, `${porcje} porcji, ${ludzi} głów`).toBe(wyprawa);
    }
  });

  it('tylko między 8:00 a 15:00: o 7:00, 15:00 i w nocy nic', () => {
    const g = graNa(3, 7);
    ustawJedzenie(g, 0);
    ustawLudzi(g, [90, 80, 70, 60]);
    const wGodzinie = (godzina: number, minuta = 0): number => {
      grajDo(g, silnikPodstawowy, tickDnia(3, godzina) + (minuta * TICKS_PER_HOUR) / 60);
      expect(hourOf(g.sim.st.tick)).toBe(godzina);
      const s = szpieg();
      turaJedzenia(g, s.r);
      return s.wyslano.length;
    };
    expect(wGodzinie(7, 45)).toBe(0);
    expect(wGodzinie(8, 0)).toBe(1);
    expect(wGodzinie(14, 45)).toBe(1);
    expect(wGodzinie(15, 0)).toBe(0);
    expect(wGodzinie(19, 30)).toBe(0);
    expect(wGodzinie(23, 0)).toBe(0);
  });

  it('nie wysyła drugiej wyprawy, gdy jedna jest w drodze', () => {
    const g = graNa(3, 9);
    ustawJedzenie(g, 0);
    ustawLudzi(g, [90, 80, 70, 60]);
    const s = szpieg();
    turaJedzenia(g, s.r);
    expect(s.wyslano).toHaveLength(1);
    // wyprawa w drodze (wpis zarządu, jak po prawdziwym wysłaniu)
    const { cel, ids } = s.wyslano[0];
    g.gov.wyprawy = [{ id: 1, cel, ids, wyjscie: 0, powrot: 10 ** 6 }];
    const drugi = szpieg();
    turaJedzenia(g, drugi.r);
    expect(drugi.wyslano).toEqual([]);
  });

  it('miejsce wybrane do cna jest pomijane: następne najbliższe z zapasem', () => {
    const g = graNa(3, 9);
    ustawJedzenie(g, 0);
    ustawLudzi(g, [90, 80, 70, 60]);
    const pierwszy = najblizszeMiejsce(g.gov, wejscie(g), 'spozywczy')!;
    g.gov.miasto!.zabrano[pierwszy.klucz] = 10 ** 6;
    expect(zostaloZMiejsca(g.gov, pierwszy)).toBe(0);
    const s = szpieg();
    turaJedzenia(g, s.r);
    expect(s.wyslano).toHaveLength(1);
    expect(s.wyslano[0].cel.klucz).not.toBe(pierwszy.klucz);
    expect(s.wyslano[0].cel.klucz).toBe(najblizszeMiejsce(g.gov, wejscie(g), 'spozywczy')!.klucz);
    expect(s.wyslano[0].cel.odl).toBeGreaterThanOrEqual(pierwszy.odl);
  });

  it('woli sklep z jedzeniem od bliższego sklepiku, który prawie go nie ma', () => {
    // w Przymorzu najbliższe miejsce poza mapą lokalną to „sklep” (jedzenie 0–1 na wyprawę), nie sklep spożywczy
    const g = graNa(3, 9);
    ustawJedzenie(g, 0);
    ustawLudzi(g, [90, 80, 70, 60]);
    const i = wejscie(g);
    const najblizsze = i.okolica!.filter((m) => !naMapieLokalnej(m)).sort((a, b) => a.odl - b.odl)[0];
    expect(celZMiejsca(najblizsze).kat).not.toBe('spozywczy');
    const s = szpieg();
    turaJedzenia(g, s.r);
    expect(s.wyslano[0].cel.kat).toBe('spozywczy');
  });

  it('gra bez mapy miasta (bez okolicy) nie wysyła nikogo i nie rzuca', () => {
    const g = nowaGraAi(demoWorld('przymorze'), 11);
    grajDo(g, silnikPodstawowy, tickDnia(3, 9));
    ustawJedzenie(g, 0);
    const s = szpieg();
    expect(() => turaJedzenia(g, s.r)).not.toThrow();
    expect(s.wyslano).toEqual([]);
  });

  describe('dyżur przy kozie tej nocy', () => {
    it('dwie zdrowe osoby (zdrowie co najmniej 40) i dwie słabe: jedna zdrowa zostaje w domu', () => {
      const { s, ludzie } = wyprawaPrzy(2, [100, 90, 35, 36]);
      const ids = s.wyslano[0].ids;
      // idzie najzdrowsza i jedna ze słabych (obie zdrowe razem zostawiłyby dyżur bez nikogo)
      expect(ids).toHaveLength(2);
      expect(ids).toContain(ludzie[0]);
      expect(ids).not.toContain(ludzie[1]);
      expect(ids).toContain(ludzie[3]);
    });

    it('jedyna zdrowa osoba zostaje: wyprawa z dwiema słabszymi (zdrowie co najmniej 30)', () => {
      const { s, ludzie } = wyprawaPrzy(2, [100, 38, 36, 20]);
      expect(s.wyslano).toHaveLength(1);
      expect([...s.wyslano[0].ids].sort()).toEqual([ludzie[1], ludzie[2]].sort());
    });

    it('nikt nie ma zdrowia co najmniej 40: dyżuru i tak nie będzie, więc idą najzdrowsi, którzy dadzą radę', () => {
      const { s, ludzie } = wyprawaPrzy(2, [39, 36, 33, 20]);
      expect(s.wyslano).toHaveLength(1);
      expect(s.wyslano[0].ids).toEqual([ludzie[0], ludzie[1]]);
    });

    it('gdy może iść tylko jedna osoba, idzie sama (głód nie czeka na drugą)', () => {
      const { s, ludzie } = wyprawaPrzy(2, [32, 25, 20, 10]);
      expect(s.wyslano).toHaveLength(1);
      expect(s.wyslano[0].ids).toEqual([ludzie[0]]);
    });

    it('nikt nie może iść (zdrowie poniżej 30 albo brak sił): wyprawy nie ma', () => {
      expect(wyprawaPrzy(2, [29, 25, 20, 10]).s.wyslano).toEqual([]);
      // zdrowi, ale bez sił na drogę (wypoczęcie poniżej 25)
      const g = graNa(3, 9);
      ustawJedzenie(g, 0);
      ustawLudzi(g, [90, 80, 70, 60], [10, 10, 10, 10]);
      const s = szpieg();
      turaJedzenia(g, s.r);
      expect(s.wyslano).toEqual([]);
    });
  });
});

describe('ogródek', () => {
  it('od 2. dnia: jeden plan ogródka na podwórku, w pierwszym miejscu, które canPlace przepuszcza', () => {
    const g = graNa(2, 9);
    ustawJedzenie(g, 200);
    const s = szpieg();
    turaJedzenia(g, s.r);
    const miejsce = miejsceNa(g.sim.st, g.w, 'ogrodek')!;
    expect(miejsce).not.toBeNull();
    expect(s.polecenia).toEqual([{ t: 'build', ids: [], kind: 'ogrodek', ...miejsce }]);
  });

  it('w 1. dniu jeszcze nie', () => {
    const g = nowaGraAi(demoWorld('przymorze'), 11, { okolica: okolicaZGeo(demo.geo) });
    grajDo(g, silnikPodstawowy, 600);
    expect(dayOf(g.sim.st.tick)).toBe(1);
    const s = szpieg();
    turaJedzenia(g, s.r);
    expect(s.polecenia).toEqual([]);
  });

  it('nie dokłada drugiego, gdy plan albo ogródek już są', () => {
    const g = graNa(2, 9);
    ustawJedzenie(g, 200);
    const miejsce = miejsceNa(g.sim.st, g.w, 'ogrodek')!;
    g.sim.st.builds.push({
      id: g.sim.st.nextThing++,
      kind: 'ogrodek',
      x: miejsce.x,
      y: miejsce.y,
      rot: miejsce.rot,
      need: {},
      have: {},
      work: 0,
      by: -1,
    });
    const s = szpieg();
    turaJedzenia(g, s.r);
    expect(s.polecenia).toEqual([]);
    // plan zamienia się w stojący ogródek: tak samo nic
    g.sim.st.builds.length = 0;
    g.sim.st.things.push({ ...rzecz(g, 'ogrodek', miejsce.x, miejsce.y), w: 3, h: 2 });
    turaJedzenia(g, s.r);
    expect(s.polecenia).toEqual([]);
  });
});

describe('ogródek i deski pracowni', () => {
  it('Zielonki (mało desek), gra jak w przeglądarce: ogródek nie zabiera desek pracowni, więc stoją pracownia i koza z beczki', async () => {
    // gdy plan ogródka (14 desek) powstawał razem z planem pracowni, ogródek stawał pierwszy (pracowni brakowało części),
    // zjadał deski z gruzu i pracownia nie stanęła do końca gry: bez kozy z beczki w sypialni Zielonki (ziarna 11–15) kończyły
    // się średnio w dniu 17,2 zamiast 20,0
    const g = await przygotujGre('zielonki', 11, false);
    grajDo(g, silnik, tickDnia(2, 9));
    const st = g.sim.st;
    expect(st.builds.some((b) => b.kind === 'pracownia')).toBe(true);
    expect(st.builds.some((b) => b.kind === 'ogrodek')).toBe(false);
    grajDo(g, silnik, tickDnia(6, 6));
    expect(st.things.some((t) => t.kind === 'pracownia')).toBe(true);
    expect(st.techDone).toContain('t_kozy');
    expect(st.things.some((t) => t.kind === 'koza_beczka')).toBe(true);
    // ogródek w domu jednorodzinnym (bez klatki i bloku) dostaje miejsce na podwórku, gdy tylko pracownia przestaje czekać
    expect(st.things.some((t) => t.kind === 'ogrodek') || st.builds.some((b) => b.kind === 'ogrodek')).toBe(true);
  }, 120_000);

  it('plan ogródka czeka na pracownię: dopóki jest jej plan, ogródka nie ma, potem jest jeden', () => {
    const g = nowaGraAi(demoWorld('przymorze'), 11, { okolica: okolicaZGeo(demo.geo), dziennik: true });
    grajDo(g, silnik, tickDnia(2, 9));
    const st = g.sim.st;
    const planOgrodka = (): boolean => st.builds.some((b) => b.kind === 'ogrodek');
    // plan pracowni z pierwszej tury warstwy zimy czeka (albo już stoi); ogródek nie powstaje przed jej ukończeniem
    if (st.builds.some((b) => b.kind === 'pracownia')) expect(planOgrodka()).toBe(false);
    grajDo(g, silnik, tickDnia(4, 9));
    expect(st.things.some((t) => t.kind === 'pracownia')).toBe(true);
    expect(planOgrodka() || st.things.some((t) => t.kind === 'ogrodek')).toBe(true);
    const plany = g.dziennik!.filter((m) => m.t === 'polecenie' && m.c.t === 'build' && m.c.kind === 'ogrodek');
    expect(plany).toHaveLength(1);
  });

  it('ogródek bez pracowni w ogóle (gotowe badania, świat bez planu pracowni) nie czeka w nieskończoność', () => {
    // gdy nie ma planu pracowni (stoi albo nigdy nie powstanie), nic nie blokuje ogródka
    const g = graNa(2, 9);
    ustawJedzenie(g, 200);
    g.sim.st.builds = g.sim.st.builds.filter((b) => b.kind !== 'pracownia');
    const s = szpieg();
    turaJedzenia(g, s.r);
    expect(s.polecenia).toHaveLength(1);
    expect(s.polecenia[0]).toMatchObject({ t: 'build', kind: 'ogrodek' });
  });
});

describe('uchwała o wspólnym kotle', () => {
  /** gra na starcie, zanim ktokolwiek podpisał pierwszą uchwałę (silnik podstawowy podpisuje `u_warty` pierwszego wieczoru) */
  const graPrzedUchwala = (): GraAi => nowaGraAi(demoWorld('przymorze'), 11, { okolica: okolicaZGeo(demo.geo) });

  /** okno pierwszej uchwały z trzema możliwościami (jak w pierwszym wieczorze) albo takie, w którym kocioł jest zablokowany
      przez wybraną ścieżkę porządku */
  function oknoUchwaly(g: GraAi, kociolZablokowany: boolean): Extract<Prompt, { k: 'uchwala' }> {
    if (kociolZablokowany) {
      g.gov.laws.signed.u_warty = true;
      g.gov.laws.path = 'porzadek';
    }
    const i = wejscie(g);
    const options: LawOption[] = FIRST_LAWS.map((id) => lawState(g.gov, i, id));
    return { k: 'uchwala', day: 1, first: true, options };
  }

  it('w pierwszym oknie silnik podpisuje u_kociol i z głodu, i przy zapasie; silnik podstawowy dalej u_warty', () => {
    const g = graPrzedUchwala();
    const ludzi = wejscie(g).people.length;
    const okno = oknoUchwaly(g, false);
    expect(okno.options.map((o) => `${o.id}:${o.s}`)).toEqual(['u_warty:ok', 'u_kociol:ok', 'u_meble:ok']);

    ustawJedzenie(g, ludzi - 1);
    expect(jedzenieNaGlowe(wejscie(g))).toBeLessThan(1);
    const glodny = szpieg();
    silnik.okno(g, okno, glodny.r);
    expect(glodny.uchwaly).toEqual(['u_kociol']);
    expect(uchwalaNaGlod(wejscie(g), okno)).toBe('u_kociol');

    // przy zapasie też kocioł: `u_warty` (droga porządku) blokuje go do końca gry, a pierwszego wieczoru głodu jeszcze nie ma
    ustawJedzenie(g, ludzi);
    const syty = szpieg();
    silnik.okno(g, okno, syty.r);
    expect(syty.uchwaly).toEqual(['u_kociol']);
    expect(uchwalaNaGlod(wejscie(g), okno)).toBeNull();
    // silnik podstawowy nie zna tej reguły
    ustawJedzenie(g, 0);
    const podstawowy = szpieg();
    silnikPodstawowy.okno(g, okno, podstawowy.r);
    expect(podstawowy.uchwaly).toEqual(['u_warty']);
  });

  it('zablokowany kocioł (wybrana ścieżka porządku) nie jest podpisywany nawet z głodu', () => {
    const g = graPrzedUchwala();
    ustawJedzenie(g, 0);
    const okno = oknoUchwaly(g, true);
    expect(okno.options.find((o) => o.id === 'u_kociol')!.s).toBe('lock');
    expect(uchwalaNaGlod(wejscie(g), okno)).toBeNull();
    const s = szpieg();
    silnik.okno(g, okno, s.r);
    expect(s.uchwaly).toHaveLength(1);
    expect(s.uchwaly[0]).not.toBe('u_kociol');
  });

  it('w prawdziwej grze silnik podpisuje u_kociol pierwszego wieczoru, a u_warty i u_brama (droga porządku) zostają zablokowane do końca', () => {
    // pierwsze okno uchwały: zapas startowy to 40 porcji na 9 głów (4,4 na głowę), więc głodu nie ma; kocioł wybiera drogę wspólnoty
    const g = graPrzedUchwala();
    grajDo(g, silnik, tickDnia(2, 9));
    expect(g.gov.laws.signed.u_kociol).toBe(true);
    expect(g.gov.laws.signed.u_warty).toBeUndefined();
    expect(g.gov.laws.path).toBe('wspolnota');
    const i = wejscie(g);
    expect(lawState(g.gov, i, 'u_warty').s).toBe('lock');
    // brama na kłódkę też: należy do drogi porządku (i wymaga warty), więc silnik nie ma jak podpisać uchwały na słabą siatkę
    expect(lawState(g.gov, i, 'u_brama').s).toBe('lock');
    // kocioł jest już podpisany, więc w głodzie nie ma czego podpisywać
    ustawJedzenie(g, 0);
    const okno = {
      k: 'uchwala' as const,
      day: 3,
      first: false,
      options: ['u_kociol'].map((id) => lawState(g.gov, i, id)),
    };
    expect(okno.options[0].s).toBe('done');
    expect(uchwalaNaGlod(wejscie(g), okno)).toBeNull();
  });
});

/** Fakty z jednego przebiegu prawdziwej gry (Przymorze, ziarno 11, jak w przeglądarce) do testów niżej. */
interface DzienGry {
  dzien: number;
  /** tuż przed warstwą z 9:00 */
  przed9: { na_glowe: number; zdrowi60: number; dyzurni: number };
  /** wpisy „wyprawa” w dzienniku między 8:00 a 15:00 tego dnia */
  wyprawy: number;
  /** o 6:00: porcje w zapasie (surowe i ugotowane), średnie najedzenie i średnie zdrowie zarządu */
  rano: { porcje: number; najedzenie: number; zdrowie: number };
}

describe('przebieg: Przymorze, ziarno 11, jak w przeglądarce', () => {
  const dni: DzienGry[] = [];
  let g: GraAi;
  let najwiecejWDrodze = 0;

  beforeAll(async () => {
    g = await przygotujGre('przymorze', 11, false);
    g.dziennik = [];
    // jak silnik, ale z pomiarem: ile wypraw w drodze naraz
    const mierzacy: Decydent = {
      ...decydentPrzebiegu,
      tura(gr, r) {
        decydentPrzebiegu.tura(gr, r);
        najwiecejWDrodze = Math.max(najwiecejWDrodze, gr.gov.wyprawy?.length ?? 0);
      },
    };
    for (let d = 2; d <= 25 && !g.gov.over; d++) {
      grajDo(g, mierzacy, poranekTick(d));
      if (g.gov.over) break;
      const iRano = wejscie(g);
      const srednia = (pole: 'food' | 'health'): number =>
        iRano.people.reduce((a, p) => a + p.needs[pole], 0) / iRano.people.length;
      const rano = {
        porcje: iRano.stock.supplies + (iRano.stock.meals ?? 0),
        najedzenie: srednia('food'),
        zdrowie: srednia('health'),
      };
      grajDo(g, mierzacy, tickDnia(d, 9) - 1);
      if (g.gov.over) break;
      const i = wejscie(g);
      const zdrowi = i.people.filter((p) => !p.away && p.needs.health >= 40);
      const przed9 = {
        na_glowe: jedzenieNaGlowe(i),
        zdrowi60: i.people.filter((p) => !p.away && p.needs.health >= 60).length,
        dyzurni: zdrowi.length,
      };
      const od = tickDnia(d, 8) / TICKS_PER_SECOND;
      const doSek = tickDnia(d, 15) / TICKS_PER_SECOND;
      grajDo(g, mierzacy, tickDnia(d, 15));
      const wpisy = g.dziennik!.filter((m) => m.t === 'wyprawa' && m.s >= od && m.s < doSek);
      dni.push({ dzien: d, przed9, wyprawy: wpisy.length, rano });
    }
  }, 300_000);

  it('przy jedzeniu poniżej 2 porcji na głowę za dnia wychodzi wyprawa po jedzenie', () => {
    // dni 3–20, w których o 9:00 jest głód zapasu, dwie osoby mają zdrowie co najmniej 60 i jest ktoś jeszcze (albo któraś z nich
    // zostaje) na dyżur przy kozie: wyprawa wychodzi także wtedy, gdy zdrowych jest tylko dwoje (jedna zostaje w domu, druga idzie
    // z kimś słabszym albo sama). W tym przebiegu takich dni jest jedenaście (9–15 i 17–20; bez łańcuchów dziewięć: 8, 10–12, 14–16,
    // 18, 19), w żadnym zdrowych (zdrowie co najmniej 60) nie jest mniej niż sześcioro (bez łańcuchów pięcioro), więc gałąź „tylko
    // dwoje zdrowych” pinują testy jednostkowe o dyżurze przy kozie tej nocy, nie ten przebieg.
    const wymagajace = dni.filter(
      (d) => d.dzien >= 3 && d.dzien <= 20 && d.przed9.na_glowe < 2 && d.przed9.zdrowi60 >= 2 && d.przed9.dyzurni >= 2,
    );
    // test nie może przejść na pustym warunku
    expect(wymagajace.length).toBeGreaterThanOrEqual(5);
    for (const d of wymagajace)
      expect(d.wyprawy, `dzień ${d.dzien}: ${JSON.stringify(d.przed9)}`).toBeGreaterThanOrEqual(1);
  });

  it('zapas jedzenia o 6:00 wynosi co najmniej 5 porcji w dniach 2–15', () => {
    // z warstwą najmniej 11 porcji (dzień 11; zarząd rośnie tu do 11 osób), bez łańcuchów najmniej 8 (dzień 8), bez warstwy
    // (ten sam przebieg, `ZM_JAK_BAZA=1`) 0 od 9.–10. dnia i odwołanie w 22. dniu (bez łańcuchów w 19.). Granica 5 leży mniej więcej
    // w środku między zapasem z warstwą a pustą spiżarnią.
    const dni2do15 = dni.filter((d) => d.dzien >= 2 && d.dzien <= 15);
    expect(dni2do15.map((d) => d.dzien)).toEqual(Array.from({ length: 14 }, (_, k) => k + 2));
    for (const d of dni2do15) expect(d.rano.porcje, `dzień ${d.dzien}`).toBeGreaterThanOrEqual(5);
  });

  it('średnie zdrowie zarządu o 6:00 w 12. dniu wynosi co najmniej 70', () => {
    // z warstwą 92,9 (bez łańcuchów 84,8), bez warstwy (`ZM_JAK_BAZA=1`) 35,7 (bez łańcuchów 6,6); granica 70 leży między nimi
    const dwunasty = dni.find((d) => d.dzien === 12);
    expect(dwunasty, 'gra musi dożyć 12. dnia').toBeDefined();
    expect(dwunasty!.rano.zdrowie).toBeGreaterThanOrEqual(70);
  });

  it('średnie najedzenie zarządu o 6:00 w dniach 15–18 wynosi co najmniej 30, a gra dożywa 18. dnia', () => {
    // z warstwą 64,4, 62,5, 50,3 i 60,0 (średnio 59,3; bez łańcuchów 42,6, 51,9, 56,6, 50,6, średnio 50,4), bez warstwy
    // (`ZM_JAK_BAZA=1`) 0 w każdym z tych dni (zapas zero od 9.–10. dnia, odwołanie w 22. dniu; bez łańcuchów w 19.). Dolna granica
    // zmierzona na tym przebiegu: 30 leży w środku między warstwą a bazą. Dawna granica 8 stała przy 14,1 sprzed nocnego posiłku
    // przy wielkim głodzie, po którym zarząd nie nocuje już głodny, i przy 59 nie łapałaby połowicznego cofnięcia warstwy; cel
    // etapu (25 w dniach 15–25) niżej. Gra krótsza niż 18 dni nie ma wszystkich czterech dni.
    const dni15do18 = dni.filter((d) => d.dzien >= 15 && d.dzien <= 18);
    expect(dni15do18.map((d) => d.dzien)).toEqual([15, 16, 17, 18]);
    const srednia = dni15do18.reduce((a, d) => a + d.rano.najedzenie, 0) / dni15do18.length;
    expect(srednia).toBeGreaterThanOrEqual(30);
  });

  it('cel etapu: w dniach 15–25 średnie najedzenie zarządu o 6:00 wynosi co najmniej 25, a gra dożywa 25. dnia', () => {
    // Cel z planu („średnie najedzenie zarządu o 6:00 w dniach 15–25 co najmniej 25”) w tym przebiegu: średnia 58,5 (najgorszy dzień
    // 36,7; bez łańcuchów 57,7 i 42,6; po nocnym posiłku przy wielkim głodzie zarząd nie nocuje już głodny). W zadaniu 4, gdy silnik podpisywał `u_warty`
    // pierwszego wieczoru (blokuje kocioł), ten sam przebieg kończył się odwołaniem w 20. dniu, a najedzenie o 6:00 w dniach 3–11
    // wynosiło 16–29 (zarząd je dopiero poniżej 35, a dwie osoby czuwają całą noc bez posiłku). Cel na wszystkich demach i ziarnach
    // mierzy bramka etapu (`npm run bot:osada`, kolumny „głodni” i dzień końca); tu jest on sprawdzony na jednym przebiegu.
    const dni15do25 = dni.filter((d) => d.dzien >= 15 && d.dzien <= 25);
    expect(dni15do25.map((d) => d.dzien)).toEqual(Array.from({ length: 11 }, (_, k) => k + 15));
    const srednia = dni15do25.reduce((a, d) => a + d.rano.najedzenie, 0) / dni15do25.length;
    expect(srednia).toBeGreaterThanOrEqual(25);
  });

  it('wyprawy wychodzą tylko między 8:00 a 15:00 i nigdy dwie naraz', () => {
    const wyjscia = g.dziennik!.filter((m) => m.t === 'wyprawa');
    expect(wyjscia.length).toBeGreaterThan(0);
    for (const m of wyjscia) {
      const godzina = hourOf(m.s * TICKS_PER_SECOND);
      expect(godzina, `dzień ${dayOf(m.s * TICKS_PER_SECOND)}, ${godzina}:00`).toBeGreaterThanOrEqual(8);
      expect(godzina).toBeLessThan(15);
    }
    // co sekundę przy ekranie (po turze silnika) w drodze jest najwyżej jedna wyprawa
    expect(najwiecejWDrodze).toBe(1);
  });

  it('ogródek stoi od pierwszych dni, jeden', () => {
    const ogrodki = g.sim.st.things.filter((t) => t.kind === 'ogrodek');
    expect(ogrodki).toHaveLength(1);
    const plany = g.dziennik!.filter((m) => m.t === 'polecenie' && m.c.t === 'build' && m.c.kind === 'ogrodek');
    expect(plany).toHaveLength(1);
    // od 2. dnia, ale dopiero gdy plan pracowni przestał czekać na deski: w tym przebiegu pracownia staje w 3. dniu
    const dzien = dayOf(plany[0].s * TICKS_PER_SECOND);
    expect(dzien).toBeGreaterThanOrEqual(2);
    expect(dzien).toBeLessThanOrEqual(3);
  });
});

describe('determinizm i koszt warstwy', () => {
  /** gra z silnikiem do chwili, w której jest wyprawa w drodze (zapas wyzerowany o 8:00 dnia 3) */
  function graZWyprawa(): GraAi {
    const g = nowaGraAi(demoWorld('przymorze'), 11, { okolica: okolicaZGeo(demo.geo) });
    grajDo(g, silnik, tickDnia(3, 8));
    ustawJedzenie(g, 0);
    ustawLudzi(g, [90, 80, 70, 60]);
    while (!g.gov.wyprawy?.length && g.sim.st.tick < tickDnia(3, 15)) grajDo(g, silnik, g.sim.st.tick + 20);
    expect(g.gov.wyprawy).toHaveLength(1);
    grajDo(g, silnik, g.sim.st.tick + 400);
    return g;
  }

  it('zapis i wczytanie w trakcie wyprawy nie zmieniają przebiegu', () => {
    const ciagla = graZWyprawa();
    const zapis = JSON.parse(JSON.stringify(zapiszGre(ciagla))) as ZapisGryAi;
    expect(zapis.gov.wyprawy).toHaveLength(1);
    const wczytana = wczytajGre(ciagla.w, zapis);
    expect(wczytana.pamiec).toEqual(ciagla.pamiec);
    const koniec = tickDnia(4, 20);
    grajDo(ciagla, silnik, koniec);
    grajDo(wczytana, silnik, koniec);
    expect(skrotGry(wczytana)).toBe(skrotGry(ciagla));
    // wyprawa, która była w drodze przy zapisie, wróciła (zarząd zapisał wizytę w mieście) i po wczytaniu, i bez przerwy
    for (const gra of [ciagla, wczytana]) {
      const wizyty = Object.values(gra.gov.miasto?.wizyty ?? {}).reduce((a, n) => a + n, 0);
      expect(wizyty).toBeGreaterThanOrEqual(1);
    }
  });

  it('warstwa jedzenia rusza tylko co 30 sekund przy ekranie: licznik w pamięci i sekundy poleceń', () => {
    const g = nowaGraAi(demoWorld('przymorze'), 11, { okolica: okolicaZGeo(demo.geo), dziennik: true });
    grajDo(g, silnik, tickDnia(6, 0));
    const licznik = g.pamiec.wywolania?.jedzenie ?? 0;
    expect(licznik).toBeGreaterThan(0);
    expect(licznik).toBeLessThanOrEqual(Math.floor(tickDnia(6, 0) / (30 * TICKS_PER_SECOND)));
    // polecenia budowy ogródka i wyprawy wychodzą tylko na sekundach warstwy
    const ruchy = g.dziennik!.filter(
      (m) => m.t === 'wyprawa' || (m.t === 'polecenie' && m.c.t === 'build' && m.c.kind === 'ogrodek'),
    );
    expect(ruchy.length).toBeGreaterThanOrEqual(1);
    for (const m of ruchy) expect(m.s % 30, JSON.stringify(m)).toBe(0);
  });
});
