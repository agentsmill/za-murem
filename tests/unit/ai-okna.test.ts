/* Okna zarządu silnika osady AI (src/ai/okna.ts), etap 1 osady AI (docs/superpowers/plans/2026-10-21-osada-ai-etap-1.md,
   zadania 5 i 6): wybór w wydarzeniu przez ocenę skutków na kopiach zarządu i uchwała według potrzeb. Pilnuje pięciu rzeczy:
   - oceny skutków (`ocenSkutki`): zapasy (jedzenie ×3, drewno ×1, reszta ×0,5), zaufanie +2 i wkurzenie −2 za punkt, rany −10,
     zgony −50, przyjęcia ±4 na osobę według zapasu jedzenia, koniec gry −1000 i dwie wagi dodane po pomiarze: pożar −15
     (gaszenie wygrywa z ewakuacją klatki) i łata na dziurę +6 (zarząd łata złomem, a nie automat pracy deskami); ocena stanu
     po wyborze, więc porównuje wybory z jednego okna (to, co było przed wyborem, się skraca);
   - wyboru w wydarzeniu (`wyborWydarzenia`): każdy dozwolony wybór na kopiach zarządu, najlepsza ocena, przy remisie niższy
     indeks, prawdziwy zarząd i wejście bez zmian (JSON przed i po), okno bez dozwolonego wyboru daje 0;
   - oceny wyboru bez znajomości losu (zadanie 6): kopie mają ziarna pochodne, a nie stan prawdziwego generatora, i jest ich
     `KOPII_OCENY`, więc wybór silnika nie zależy od tego, czy hazard się uda, a losowania zmieniają się z oknem;
   - okna wieloetapowego (`odpowiedzNaWydarzenie`): wybór z `zostaje` (np. „Obejrzeć ręce” przy gościu w trybie zombie) nie
     zamyka okna, więc decydent czyta `pending` po każdym wyborze i odpowiada na kolejny krok;
   - uchwały (`wyborUchwaly`): w pierwszym oknie wspólny kocioł (droga wspólnoty; `u_warty` z drogi porządku blokuje go do końca
     gry, a kocioł blokuje wartę i bramę), potem tylko według potrzeby (głód: kocioł), a bez potrzeby nic: ani racje
     głodowe (posiłek dopiero poniżej 25 i nikt nie je w nocy: zarząd nocuje przy najedzeniu 0–10 mimo pełnej spiżarni), ani
     zebrania i meble na opał, które kosztują wkurzenie albo pracę, a silnikowi nic nie dają; test w prawdziwej grze niżej.
   Zarząd i wejście z atrapy (tests/unit/gov-atrapa.ts), bez symulacji; wybór wydarzeń w prawdziwej grze sprawdza
   ai-rozwoj.test.ts. */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Decydent, grajDo } from '../../src/ai/gra.ts';
import {
  KOPII_OCENY,
  MAX_KROKOW_OKNA,
  najlepszyIndeks,
  ocenSkutki,
  odpowiedzNaWydarzenie,
  WAGI,
  wyborUchwaly,
  wyborWydarzenia,
} from '../../src/ai/okna.ts';
import { silnik } from '../../src/ai/silnik.ts';
import { tx } from '../../src/core/jezyk.ts';
import { mulberry } from '../../src/core/rng.ts';
import { type Gosc, KTO, type KtoId, osobyGrupy } from '../../src/gov/goscie.ts';
import { frazaSkad } from '../../src/gov/goscie-teksty.ts';
import type { GovEffects, GovGosc, GovInput, GovState, LawOption, Prompt } from '../../src/gov/typy.ts';
import { emptyEffects } from '../../src/gov/wspolne.ts';
import { eventView, M1_EVENTS } from '../../src/gov/wydarzenia.ts';
import { chooseEvent, newGov, pending } from '../../src/gov/zarzad.ts';
import { dayOf, TICKS_PER_DAY } from '../../src/sim/clock.ts';
import { przygotujGre } from '../../tools/bot-osada.ts';
import { Atrapa, at, TPH } from './gov-atrapa.ts';

type Wydarzenie = Extract<Prompt, { k: 'wydarzenie' }>;
type Uchwala = Extract<Prompt, { k: 'uchwala' }>;

/** tick atrapy o danej porze (jak `tickAt` w gosc-zarzad.test.ts) */
const tickAt = (day: number, hour: number): number => Math.round(((at(day, hour) - 15 * 60) * TPH) / 60);

/** atrapa z zapasem jedzenia (4 osoby zarządu i 4 mieszkańców, czyli 8 głów) */
function atrapa(jedzenie: number): Atrapa {
  const atr = new Atrapa(3);
  atr.supplies = jedzenie;
  atr.tick = tickAt(3, 16);
  return atr;
}

const efekty = (o: Partial<GovEffects> = {}): GovEffects => ({ ...emptyEffects(), ...o });

/** różnica oceny względem wyboru bez skutków (stała część: zaufanie i wkurzenie sprzed wyboru) */
function roznica(fx: GovEffects, i: GovInput, po: GovState = newGov(3)): number {
  return ocenSkutki(fx, po, i) - ocenSkutki(emptyEffects(), newGov(3), i);
}

describe('ocenSkutki', () => {
  const i = atrapa(40).input();

  it('zapasy: jedzenie ×3, drewno ×1, złom, części i leki ×0,5', () => {
    expect(WAGI.jedzenie).toBe(3);
    expect(roznica(efekty({ stock: { wood: 0, supplies: 2, scrap: 0, parts: 0, meds: 0 } }), i)).toBe(6);
    expect(roznica(efekty({ stock: { wood: 3, supplies: 0, scrap: 0, parts: 0, meds: 0 } }), i)).toBe(3);
    expect(roznica(efekty({ stock: { wood: 0, supplies: 0, scrap: 2, parts: 2, meds: 2 } }), i)).toBe(3);
    // wydatek to ujemna ocena
    expect(roznica(efekty({ stock: { wood: -1, supplies: -3, scrap: -2, parts: 0, meds: 0 } }), i)).toBe(-1 - 9 - 1);
  });

  it('zaufanie +2, wkurzenie −2 za punkt (zarząd po wyborze)', () => {
    const po = newGov(3);
    po.trust += 3;
    po.anger += 4;
    expect(roznica(efekty(), i, po)).toBe(2 * 3 - 2 * 4);
  });

  it('rany −10: chorzy (najwyżej tylu, ilu ludzi w zarządzie), ugryzieni, spadek zdrowia i choroba rano', () => {
    expect(i.people).toHaveLength(4);
    expect(roznica(efekty({ sick: 2 }), i)).toBe(-20);
    // chorych do rozdania jest więcej niż ludzi: symulacja osłabia najwyżej każdego z zarządu
    expect(roznica(efekty({ sick: 9 }), i)).toBe(-40);
    expect(roznica(efekty({ bitten: ['a'] }), i)).toBe(-10);
    expect(roznica(efekty({ goscRozkaz: [{ id: 'g1', co: 'ugryziony' }] }), i)).toBe(-10);
    // osoba ze spadkiem zdrowia liczy się raz, choćby miała dwa wpisy; poprawa zdrowia i inne potrzeby to nie rana
    const id = i.people[0].id;
    const fx = efekty({
      needs: [
        { id, d: { health: -5 } },
        { id, d: { health: -3 } },
        { id: i.people[1].id, d: { health: 4, rest: -8 } },
      ],
    });
    expect(roznica(fx, i)).toBe(-10);
    // choroba odłożona na rano z wydarzenia (`later.sick`)
    const po = newGov(3);
    po.later.push({ day: 3, stock: {}, line: tx('x', 'x'), sick: 1 });
    expect(roznica(efekty(), i, po)).toBe(-10);
  });

  it('zgony −50: odchodzący z zarządu, wyrzuceni i mieszkańcy, którzy odchodzą', () => {
    expect(roznica(efekty({ leave: ['a'] }), i)).toBe(-50);
    expect(roznica(efekty({ wyrzuc: ['a', 'b'] }), i)).toBe(-100);
    expect(roznica(efekty({ residents: -1 }), i)).toBe(-50);
  });

  it('przyjęcia: +4 na osobę, gdy po przyjęciu starcza 2 porcje na głowę, inaczej −4', () => {
    // 8 głów; 40 porcji: po przyjęciu 3 osób 11 głów, 22 porcje potrzebne
    expect(roznica(efekty({ residents: 3 }), i)).toBe(12);
    // ten sam skutek bez zapasu: −4 na osobę (stały składnik oceny zapasu jest taki sam w obu wejściach, więc różnica wprost)
    const biedne = atrapa(10).input();
    expect(roznica(efekty({ residents: 3 }), biedne)).toBe(-12);
    // granica: 8 głów + 1 przyjęty = 18 porcji
    expect(roznica(efekty({ residents: 1 }), atrapa(18).input())).toBe(4);
    expect(roznica(efekty({ residents: 1 }), atrapa(17).input())).toBe(-4);
    // osoba dołączająca do zarządu i mieszkańcy liczą się razem
    const osoba = { ...i.people[0], id: 'x' } as unknown as GovEffects['join'][number];
    expect(roznica(efekty({ join: [osoba], residents: 2 }), i)).toBe(12);
  });

  it('przyjęcie grupy gościa (rozkaz zostan albo zarzad) liczy żywych członków grupy z wejścia', () => {
    const goscie: GovGosc[] = [
      { id: 'g1', faza: 'brama', tile: 1, gdzie: { x: 1, y: 1 }, pawns: [100, 101, 102], zywi: [0, 2], ukradl: 0 },
    ];
    const z = { ...i, goscie };
    expect(roznica(efekty({ goscRozkaz: [{ id: 'g1', co: 'zostan' }] }), z)).toBe(8);
    expect(roznica(efekty({ goscRozkaz: [{ id: 'g1', co: 'zarzad' }] }), z)).toBe(8);
    // wpuszczenie na noc i odprawa nikogo nie przyjmują
    expect(
      roznica(
        efekty({
          goscRozkaz: [
            { id: 'g1', co: 'noc' },
            { id: 'g1', co: 'odejdz' },
          ],
        }),
        z,
      ),
    ).toBe(0);
    // wizyta, której nie ma w wejściu, nie daje przyjęć
    expect(roznica(efekty({ goscRozkaz: [{ id: 'g9', co: 'zostan' }] }), z)).toBe(0);
  });

  it('łata na dziurę +6 za dziurę (zarząd łata złomem, a bez tego automat pracy zużyje na łatę kilka desek)', () => {
    expect(roznica(efekty({ patch: 1 }), i)).toBe(WAGI.lata);
    expect(roznica(efekty({ patch: 2 }), i)).toBe(2 * WAGI.lata);
    expect(WAGI.lata).toBe(6);
  });

  it('pożar −15 (spalony mebel, strach i gorszy nastrój wszystkich)', () => {
    // bez tej wagi ewakuacja klatki wygrywa z gaszeniem: karta „Pożar od kozy” wraca co dobę, a przebiegi kończą się o 5 dni wcześniej
    expect(roznica(efekty({ fire: true }), i)).toBe(WAGI.pozar);
    expect(WAGI.pozar).toBe(-15);
  });

  it('koniec gry jest najgorszym skutkiem', () => {
    const po = newGov(3);
    po.over = 'odwolanie';
    expect(roznica(efekty(), i, po)).toBe(WAGI.koniec);
    expect(WAGI.koniec).toBeLessThan(-500);
  });
});

describe('najlepszyIndeks', () => {
  it('najwyższa ocena, przy remisie niższy indeks, wybory bez oceny (niedozwolone) pomija', () => {
    expect(najlepszyIndeks([1, 5, 3])).toBe(1);
    expect(najlepszyIndeks([4, 4, 2])).toBe(0);
    expect(najlepszyIndeks([-3, 7, 7, 1])).toBe(1);
    expect(najlepszyIndeks([null, -5, null, -5])).toBe(1);
    expect(najlepszyIndeks([null, null])).toBe(0);
    expect(najlepszyIndeks([])).toBe(0);
  });
});

/** zarząd z otwartym oknem „Ludzie pod bramą” (6 osób, w atrapie 4 wolne miejsca) bez gościa z klocków */
function oknoUchodzcow(jedzenie: number): { gov: GovState; i: GovInput; p: Wydarzenie } {
  const gov = newGov(3);
  gov.ev.active = { id: 'uchodzcy', d: { n: 6, from: 'z Wilanowa', spec: null } };
  const i = atrapa(jedzenie).input();
  const p = pending(gov, i);
  if (p?.k !== 'wydarzenie') throw new Error('brak okna wydarzenia');
  return { gov, i, p };
}

/** pełny przegląd wyborów na kopiach, jak w planie: ocena po `chooseEvent` każdego dozwolonego wyboru */
function przeglad(gov: GovState, i: GovInput, p: Wydarzenie): (number | null)[] {
  return p.choices.map((c, k) => {
    if (!c.ok) return null;
    const kopia = structuredClone(gov);
    return ocenSkutki(chooseEvent(kopia, i, k), kopia, i);
  });
}

describe('wyborWydarzenia', () => {
  it('z zapasem przyjmuje wszystkich, bez zapasu odprawia (przyjęcia ±4 na osobę)', () => {
    const syty = oknoUchodzcow(40);
    expect(syty.p.choices.map((c) => c.label.pl)).toEqual([
      'Przyjąć tylu, ilu się zmieści (4)',
      'Dać Jedzenie 3 na drogę',
      'Przyjąć wszystkich (2 osoby będą spać na podłodze)',
      'Odprawić',
    ]);
    expect(wyborWydarzenia(syty.gov, syty.i, syty.p)).toBe(2);
    const glodny = oknoUchodzcow(20);
    expect(wyborWydarzenia(glodny.gov, glodny.i, glodny.p)).toBe(3);
  });

  it('wynik to indeks z najwyższą oceną w pełnym przeglądzie na kopiach (remis: niższy indeks)', () => {
    const wybrane = new Set<number>();
    for (const jedzenie of [0, 5, 20, 24, 28, 40, 100]) {
      const { gov, i, p } = oknoUchodzcow(jedzenie);
      const oceny = przeglad(gov, i, p);
      // najlepszy indeks wprost z pętli, bez funkcji pomocniczej silnika: pierwszy z najwyższych dozwolonych
      let oczekiwany = -1;
      oceny.forEach((o, k) => {
        if (o !== null && (oczekiwany < 0 || o > (oceny[oczekiwany] as number))) oczekiwany = k;
      });
      expect(wyborWydarzenia(gov, i, p), `jedzenie ${jedzenie}: ${JSON.stringify(oceny)}`).toBe(oczekiwany);
      wybrane.add(oczekiwany);
    }
    // przegląd rozróżnia wybory: przy różnym zapasie wygrywają różne indeksy, więc test nie przechodzi na stałej odpowiedzi
    expect(wybrane.size).toBeGreaterThanOrEqual(2);
  });

  it('nie wybiera wyboru niedozwolonego, choćby jego brak skutków wypadał najlepiej', () => {
    // bez jedzenia „Dać Jedzenie 3” jest niedozwolone; jego ocena (brak skutków) byłaby wyższa niż każdego z dozwolonych
    const { gov, i, p } = oknoUchodzcow(0);
    expect(p.choices[1].ok).toBe(false);
    const k = wyborWydarzenia(gov, i, p);
    expect(p.choices[k].ok).toBe(true);
    expect(p.choices[k].label.pl).toBe('Odprawić');
  });

  it('okno bez dozwolonego wyboru daje 0', () => {
    const { gov, i, p } = oknoUchodzcow(40);
    const zamkniete: Wydarzenie = { ...p, choices: p.choices.map((c) => ({ ...c, ok: false })) };
    expect(wyborWydarzenia(gov, i, zamkniete)).toBe(0);
  });

  it('prawdziwy zarząd i wejście zostają bez zmian (JSON przed i po)', () => {
    for (const jedzenie of [0, 40]) {
      const { gov, i, p } = oknoUchodzcow(jedzenie);
      const przedGov = JSON.stringify(gov);
      const przedWejscie = JSON.stringify(i);
      wyborWydarzenia(gov, i, p);
      expect(JSON.stringify(gov)).toBe(przedGov);
      expect(JSON.stringify(i)).toBe(przedWejscie);
      // okno dalej czeka na prawdziwy wybór
      expect(gov.ev.active).toMatchObject({ id: 'uchodzcy' });
    }
  });

  it('pożar od kozy: gasi (drewno i jedna osoba chora), a nie ewakuuje (spalony mebel, strach, gorszy nastrój wszystkich)', () => {
    // bez wagi pożaru ewakuacja wygrywała (wkurzenie +2 kosztuje mniej niż drewno i choroba); dziennie przychodziła taka karta
    const gov = newGov(3);
    gov.ev.active = { id: 'pozar', d: { b: 0 } };
    const i = atrapa(40).input();
    const p = pending(gov, i);
    if (p?.k !== 'wydarzenie') throw new Error('brak okna wydarzenia');
    expect(p.choices.map((c) => c.label.pl)).toEqual(['Gasić wszyscy razem', 'Ewakuować klatkę']);
    const oceny = przeglad(gov, i, p);
    expect(oceny[0]!).toBeGreaterThan(oceny[1]!);
    expect(wyborWydarzenia(gov, i, p)).toBe(0);
    // ewakuacja to rzeczywiście pożar w skutkach, gaszenie nie
    expect(chooseEvent(structuredClone(gov), i, 1).fire).toBe(true);
    expect(chooseEvent(structuredClone(gov), i, 0).fire).toBe(false);
  });

  it('ślady przy siatce: łata dziurę za złom, a nie wiesza puszek (łata oszczędza deski, których brakuje pracowni)', () => {
    // bez wagi łaty silnik wieszał puszki: dziura zostawała otwarta, a automat pracy łatał ją deskami (3–4 sztuki), których
    // w Zielonkach brakowało na pracownię (14), więc koza z beczki nie stawała
    const gov = newGov(3);
    gov.ev.active = { id: 'slady', d: { where: tx('przy garażach', 'by the garages') } };
    const atr = atrapa(40);
    atr.scrap = 10;
    const i = atr.input();
    const p = pending(gov, i);
    if (p?.k !== 'wydarzenie') throw new Error('brak okna wydarzenia');
    expect(p.choices.map((c) => c.label.pl)).toEqual([
      'Załatać przed nocą (Złom 2)',
      'Powiesić puszki z kamykami',
      'Udawać, że nic nie widać',
    ]);
    expect(chooseEvent(structuredClone(gov), i, 0).patch).toBe(1);
    expect(wyborWydarzenia(gov, i, p)).toBe(0);
    // bez złomu łata jest niedozwolona: puszki
    const bezZlomu = atrapa(40);
    bezZlomu.scrap = 1;
    const j = bezZlomu.input();
    const q = pending(gov, j);
    if (q?.k !== 'wydarzenie') throw new Error('brak okna wydarzenia');
    expect(q.choices[0].ok).toBe(false);
    expect(wyborWydarzenia(gov, j, q)).toBe(1);
  });

  it('kopia zarządu z tym samym stanem daje te same skutki co prawdziwy zarząd (podstawa oceny na kopiach)', () => {
    const { gov, i, p } = oknoUchodzcow(40);
    const k = wyborWydarzenia(gov, i, p);
    const kopia = structuredClone(gov);
    const naKopii = chooseEvent(kopia, i, k);
    const naprawde = chooseEvent(gov, i, k);
    expect(naprawde).toEqual(naKopii);
    expect(JSON.stringify(gov)).toBe(JSON.stringify(kopia));
  });
});

// ---------------------------------------------------------------- ocena wyboru bez znajomości losu

/* Silnik nie zna wyniku losowań, których gracz znać nie może. Prawdziwy wybór losuje generator zarządu (`GovState.rng`),
   a gdyby ocena szła na kopii z tym samym stanem generatora, silnik wiedziałby z góry, czy np. przegrany w kłótni odejdzie
   (30%), i omijałby te wybory, które się nie udadzą. Kopie mają więc ziarna pochodne, niezależne od stanu prawdziwego
   generatora, a ocena wyboru to średnia z kilku kopii. Prawdziwa karta z losowym skutkiem, w której wybór silnika
   zmieniałby się z losowaniem, nie istnieje (kłótnia ma wybór „mediacja”, który wygrywa zawsze), więc test podmienia
   wybory karty na pewny zysk i hazard. */

const klotnia = M1_EVENTS.find((e) => e.id === 'klotnia')!;

/** Okno „Kłótnia o grafik” z podmienionymi wyborami (spy na definicji karty, przywracany po teście): wybór 0 to pewne 2 porcje
    jedzenia (6 punktów oceny), wybór 1 to hazard: z szansą `szansa` 5 porcji (15 punktów), inaczej nic. Losuje generator
    zarządu (`h.rng`), jak karty z losowym skutkiem. `wywolania` liczy uruchomienia `run` każdego wyboru, czyli kopie, na
    których silnik oceniał wybory. */
function oknoHazardu(szansa: number): { gov: GovState; i: GovInput; p: Wydarzenie; wywolania: [number, number] } {
  const wywolania: [number, number] = [0, 0];
  vi.spyOn(klotnia, 'choices').mockImplementation((h) => [
    {
      label: tx('Pewny zysk', 'Sure thing'),
      ok: true,
      run: () => {
        wywolania[0]++;
        h.addRes('jedzenie', 2);
      },
    },
    {
      label: tx('Hazard', 'Gamble'),
      ok: true,
      run: () => {
        wywolania[1]++;
        if (h.rng() < szansa) h.addRes('jedzenie', 5);
      },
    },
  ]);
  const gov = newGov(3);
  const i = atrapa(40).input();
  gov.ev.active = { id: 'klotnia', d: { a: i.people[0].id, b: i.people[1].id } };
  const p = pending(gov, i);
  if (p?.k !== 'wydarzenie') throw new Error('brak okna wydarzenia');
  return { gov, i, p, wywolania };
}

describe('wyborWydarzenia bez znajomości losu', () => {
  afterEach(() => vi.restoreAllMocks());

  it('wybór silnika nie zależy od stanu generatora prawdziwego zarządu, choć skutek hazardu od niego zależy', () => {
    const { gov, i, p } = oknoHazardu(0.5);
    const wybory = new Set<number>();
    const skutki = new Set<number>();
    for (let n = 1; n <= 24; n++) {
      const zarzad = structuredClone(gov);
      zarzad.rng.s = Math.imul(n, 0x9e3779b1) | 0;
      // prawdziwy zarząd z tym stanem generatora: hazard raz się udaje (5 porcji), raz nie (0)
      skutki.add(chooseEvent(structuredClone(zarzad), i, 1).stock.supplies);
      wybory.add(wyborWydarzenia(zarzad, i, p));
    }
    expect([...skutki].sort()).toEqual([0, 5]);
    // a silnik wybiera zawsze to samo: nie widzi, czy hazard się uda
    expect([...wybory]).toHaveLength(1);
  });

  it('każdy wybór jest oceniany na kilku kopiach zarządu (średnia), nie na jednej', () => {
    const { gov, i, p, wywolania } = oknoHazardu(0.5);
    expect(KOPII_OCENY).toBeGreaterThanOrEqual(3);
    wyborWydarzenia(gov, i, p);
    expect(wywolania).toEqual([KOPII_OCENY, KOPII_OCENY]);
  });

  it('losowania w kopiach zmieniają się z oknem: hazard o szansie 1/2 wygrywa w części okien, nie we wszystkich i nie w żadnym', () => {
    // gdyby ziarna kopii zależały tylko od okna i wyboru, ten sam hazard dostawałby te same losowania w każdym oknie tego
    // rodzaju (zawsze wygrywałby albo zawsze przegrywał), a silnik przez całą grę wierzyłby w jedną, przypadkową szansę
    const { gov, i, p } = oknoHazardu(0.5);
    const okien = 200;
    let hazard = 0;
    for (let n = 0; n < okien; n++)
      if (wyborWydarzenia(gov, { ...i, tick: i.tick + n * 20, screen: i.screen + n }, p) === 1) hazard++;
    // z kilku kopii hazard (15 punktów przy trafieniu) przebija pewne 6 punktów przy kilku trafieniach z kopii: około połowy okien
    expect(hazard).toBeGreaterThan(okien * 0.1);
    expect(hazard).toBeLessThan(okien * 0.9);
  });

  it('prawdziwy zarząd losuje dalej swoim generatorem: ocena nie zużywa ani nie zmienia jego ziarna', () => {
    const { gov, i, p } = oknoHazardu(0.5);
    const przed = JSON.stringify(gov.rng);
    wyborWydarzenia(gov, i, p);
    expect(JSON.stringify(gov.rng)).toBe(przed);
  });
});

// ---------------------------------------------------------------- okno wieloetapowe

let licznikOsob = 1;
/** gość z ręcznie ustawionymi klockami, jak `reczny` w gosc-zarzad.test.ts */
function gosc(over: Partial<Gosc> & { ilu?: number } = {}): Gosc {
  const { ilu, ...rest } = over;
  const kto: KtoId = rest.kto ?? 'wedrowiec';
  const osoby =
    rest.osoby ?? osobyGrupy(mulberry(5), () => licznikOsob++, kto, ilu ?? KTO[kto].ilu[0], new Set<string>());
  osoby.forEach((p, k) => {
    p.id = `g1p${k}`;
  });
  return {
    id: 'g1',
    kto,
    chce: 'nocleg',
    ma: 'nic',
    haczyk: 'prawda',
    skad: { strona: 'n', nazwa: frazaSkad('apteka', 'Pod Różą') },
    ...rest,
    osoby,
  };
}

/** zarząd w trybie zombie z kartą gościa pod bramą (wizyta aktywna, grupa stoi w fazie `brama`) */
function oknoGoscia(g: Gosc): { gov: GovState; i: GovInput } {
  const gov = newGov(3, 'zombie');
  const atr = atrapa(30);
  atr.meds = 3;
  atr.woodSklad = 10;
  const wpis: GovGosc = {
    id: g.id,
    faza: 'brama',
    tile: 1234,
    gdzie: { x: 34, y: 12 },
    pawns: g.osoby.map((_, k) => 100 + k),
    zywi: g.osoby.map((_, k) => k),
    ukradl: 0,
  };
  const i: GovInput = { ...atr.input(), screen: 1000, kozaLit: true, goscie: [wpis], napady: [] };
  gov.goscie = { n: 1, czytane: 0, aktywny: { gosc: g, od: 900, karta: true } };
  gov.ev.active = { id: 'gosc', d: { id: g.id } };
  return { gov, i };
}

describe('odpowiedzNaWydarzenie: okno wieloetapowe', () => {
  const ugryziony = () => gosc({ kto: 'ocaleni', ilu: 3, chce: 'nocleg', haczyk: 'ugryziony', ugryziony: 1 });

  /** wykonuje odpowiedź na bieżące okno gościa, zapisując wybory (prawdziwe `chooseEvent` na stanie) */
  function odpowiedz(s: { gov: GovState; i: GovInput }): number[] {
    const wybory: number[] = [];
    const p = pending(s.gov, s.i);
    if (p?.k !== 'wydarzenie') throw new Error('brak okna wydarzenia');
    odpowiedzNaWydarzenie(
      s.gov,
      () => s.i,
      p,
      (k) => {
        wybory.push(k);
        chooseEvent(s.gov, s.i, k);
      },
    );
    return wybory;
  }

  it('wybór „Obejrzeć ręce” zostawia okno, więc odpowiedź ma drugi krok i zamyka okno', () => {
    const s = oknoGoscia(ugryziony());
    const przed = eventView(s.gov, s.i)!;
    expect(przed.choices.map((c) => c.label.pl)).toEqual([
      'Wpuścić na noc',
      'Podać jedzenie przez siatkę (Jedzenie 1)',
      'Obejrzeć ręce',
      'Odprawić',
    ]);
    const wybory = odpowiedz(s);
    // krok 1: obejrzeć ręce (wpuszczenie ugryzionego kosztuje ranę, odprawa zaufanie), krok 2: bez ręki już nie ma wyboru
    expect(wybory).toHaveLength(2);
    expect(wybory[0]).toBe(2);
    expect(s.gov.goscie!.aktywny!.obejrzano).toBe('ugryziony');
    const po = s.gov.ev.active;
    expect(po).toBeNull();
    expect(pending(s.gov, s.i)).toBeNull();
    // drugi krok nie wybrał niedozwolonego ani nieistniejącego wyboru
    expect(wybory[1]).toBeGreaterThanOrEqual(0);
    expect(wybory[1]).toBeLessThan(3);
  });

  it('drugi krok widzi nowe okno (bez „Obejrzeć ręce”), a nie stare', () => {
    const s = oknoGoscia(ugryziony());
    const pierwsze = eventView(s.gov, s.i)!;
    const wybory = odpowiedz(s);
    // gdyby drugi krok wybierał z listy pierwszego okna, wybór o indeksie 3 („Odprawić”) trafiłby w nieistniejący
    expect(pierwsze.choices).toHaveLength(4);
    expect(wybory[1]).not.toBe(3);
    expect(wybory[1]).toBe(1);
  });

  it('zdrowy gość: „Obejrzeć ręce” kosztuje zaufanie, więc odpowiedź nie sięga po nie i kończy w jednym kroku', () => {
    const s = oknoGoscia(gosc({ kto: 'ocaleni', ilu: 3, chce: 'nocleg', haczyk: 'prawda' }));
    const wybory = odpowiedz(s);
    expect(wybory).toHaveLength(1);
    expect(s.gov.ev.active).toBeNull();
  });

  it('okno, które po wyborze się nie zmieniło (wybór się nie udał), kończy odpowiedź po jednym wyborze', () => {
    const s = oknoGoscia(ugryziony());
    const p = pending(s.gov, s.i);
    if (p?.k !== 'wydarzenie') throw new Error('brak okna');
    let wywolania = 0;
    odpowiedzNaWydarzenie(
      s.gov,
      () => s.i,
      p,
      () => {
        wywolania++;
      },
    );
    expect(wywolania).toBe(1);
  });

  it('okno, które zmienia się po każdym wyborze, dostaje najwyżej MAX_KROKOW_OKNA odpowiedzi', () => {
    const s = oknoGoscia(ugryziony());
    const p = pending(s.gov, s.i);
    if (p?.k !== 'wydarzenie') throw new Error('brak okna');
    let wywolania = 0;
    // wybór zmienia tekst okna za każdym razem (obejrzane ręce na przemian ugryziony i czysty), więc zarząd pyta dalej
    odpowiedzNaWydarzenie(
      s.gov,
      () => s.i,
      p,
      () => {
        s.gov.goscie!.aktywny!.obejrzano = wywolania++ % 2 ? 'czysty' : 'ugryziony';
      },
    );
    expect(MAX_KROKOW_OKNA).toBe(4);
    expect(wywolania).toBe(MAX_KROKOW_OKNA);
  });
});

// ---------------------------------------------------------------- uchwały

function opcja(id: string, s: LawOption['s'] = 'ok'): LawOption {
  return { id, name: tx(id, id), path: 'base', desc: tx('', ''), s };
}

function oknoUchwaly(opcje: LawOption[], first = false): Uchwala {
  return { k: 'uchwala', day: first ? 1 : 3, first, options: opcje };
}

/** wejście z podanym zapasem jedzenia i dziurami w siatce (reszta z atrapy: 4 osoby zarządu i 4 mieszkańców) */
function wejscieUchwal(jedzenie: number, dziury = 0): GovInput {
  const i = atrapa(jedzenie).input();
  const fence = i.fence ?? { holes: [], durability: 1 };
  return { ...i, fence: { ...fence, holes: fence.holes.slice(0, dziury), durability: dziury ? 0.4 : 1 } };
}

describe('wyborUchwaly', () => {
  const pierwsze = [opcja('u_warty'), opcja('u_kociol'), opcja('u_meble')];
  const pozniej = (...ids: string[]) => ids.map((id) => opcja(id));

  it('w pierwszym oknie wspólny kocioł (droga wspólnoty), choćby jedzenia było w bród', () => {
    expect(wyborUchwaly(wejscieUchwal(100), oknoUchwaly(pierwsze, true))).toBe('u_kociol');
    expect(wyborUchwaly(wejscieUchwal(0), oknoUchwaly(pierwsze, true))).toBe('u_kociol');
  });

  it('w pierwszym oknie bez możliwości kotła i bez potrzeby: nic (nie pierwsza dozwolona)', () => {
    const bezKotla = [opcja('u_warty'), opcja('u_kociol', 'lock'), opcja('u_meble')];
    expect(wyborUchwaly(wejscieUchwal(100), oknoUchwaly(bezKotla, true))).toBeNull();
  });

  it('głód (poniżej 1 porcji na głowę): kocioł, a gdy go nie ma (podpisany, zablokowany), nic: racje kosztują wkurzenie', () => {
    const glodny = wejscieUchwal(5);
    expect(wyborUchwaly(glodny, oknoUchwaly(pozniej('u_zebrania', 'u_kociol', 'u_racje', 'u_meble')))).toBe('u_kociol');
    expect(wyborUchwaly(glodny, oknoUchwaly(pozniej('u_zebrania', 'u_racje', 'u_meble')))).toBeNull();
    const zablokowany = [opcja('u_kociol', 'lock'), opcja('u_racje'), opcja('u_meble')];
    expect(wyborUchwaly(glodny, oknoUchwaly(zablokowany))).toBeNull();
  });

  it('dziury w siatce nie wybierają uchwały: warta i brama należą do drogi porządku, którą kocioł z pierwszego okna zamyka', () => {
    const zDziurami = wejscieUchwal(100, 2);
    expect(zDziurami.fence?.holes).toHaveLength(2);
    expect(wyborUchwaly(zDziurami, oknoUchwaly(pozniej('u_zebrania', 'u_warty', 'u_meble')))).toBeNull();
    // także brama na kłódkę, gdy ktoś inny podpisał wartę (wtedy brama jest dozwolona)
    expect(
      wyborUchwaly(zDziurami, oknoUchwaly([opcja('u_warty', 'done'), opcja('u_brama'), opcja('u_meble')])),
    ).toBeNull();
  });

  it('głód przy dziurach w siatce: kocioł, nie warta', () => {
    const i = wejscieUchwal(5, 2);
    expect(wyborUchwaly(i, oknoUchwaly(pozniej('u_warty', 'u_kociol')))).toBe('u_kociol');
  });

  it('bez potrzeby nie podpisuje niczego, choćby coś było dozwolone (zebrania, racje i meble kosztują wkurzenie i pracę)', () => {
    const syty = wejscieUchwal(100);
    expect(wyborUchwaly(syty, oknoUchwaly(pozniej('u_zebrania', 'u_racje', 'u_meble')))).toBeNull();
    // zimno też nie wybiera uchwały: żadna uchwała nie grzeje
    const zimno: GovInput = { ...syty, people: syty.people.map((p) => ({ ...p, needs: { ...p.needs, warm: 5 } })) };
    expect(wyborUchwaly(zimno, oknoUchwaly(pozniej('u_zebrania', 'u_racje')))).toBeNull();
  });

  it('bez dozwolonej uchwały null (zarząd nic nie uchwala)', () => {
    const wszystkoZamkniete = [opcja('u_warty', 'lock'), opcja('u_kociol', 'cd'), opcja('u_meble', 'done')];
    expect(wyborUchwaly(wejscieUchwal(100), oknoUchwaly(wszystkoZamkniete))).toBeNull();
    expect(wyborUchwaly(wejscieUchwal(0), oknoUchwaly([], false))).toBeNull();
  });
});

describe('uchwały silnika w prawdziwej grze (Przymorze, ziarno 11, jak w przeglądarce)', () => {
  it('silnik nie podpisuje u_racje do dnia 8, choć okna uchwał ją oferują; podpisuje kocioł i nic więcej', async () => {
    // Racje głodowe: posiłek dopiero poniżej 25 i najwyżej dwa na dobę, a w nocy nikt nie je, więc zarząd nocuje przy najedzeniu
    // 0–10 mimo pełnej spiżarni (Przymorze 11–15, dni 14–17: 67 godzin głodu na przebieg wobec 10 bez racji). Jako „pierwsza
    // dozwolona” w oknie z dnia 5 racje wpadały do każdego przebiegu.
    const g = await przygotujGre('przymorze', 11, false);
    const okna: { dzien: number; oferowane: string[]; podpisane: string | null }[] = [];
    const rejestrujacy: Decydent = {
      ...silnik,
      okno(gr, p, r) {
        if (p.k === 'uchwala') {
          const przed = Object.keys(gr.gov.laws.signed).length;
          silnik.okno(gr, p, r);
          const nowa = Object.keys(gr.gov.laws.signed).slice(przed)[0] ?? null;
          okna.push({
            dzien: dayOf(gr.sim.st.tick),
            oferowane: p.options.filter((o) => o.s === 'ok').map((o) => o.id),
            podpisane: nowa,
          });
          return;
        }
        silnik.okno(gr, p, r);
      },
    };
    grajDo(g, rejestrujacy, 8 * TICKS_PER_DAY);
    expect(g.gov.laws.signed.u_racje).toBeFalsy();
    expect(g.sim.st.laws.foodMult).toBeGreaterThanOrEqual(1);
    // racje były do wzięcia w kolejnych oknach (po pierwszym wieczorze co dobę: odnowienie 36 godzin gry już minęło, a nic nowego
    // nie podpisano), więc test nie przechodzi na pustym warunku
    expect(okna.length).toBeGreaterThanOrEqual(5);
    expect(okna[0].dzien).toBe(1);
    for (const o of okna.slice(1)) expect(o.oferowane, `dzień ${o.dzien}`).toContain('u_racje');
    // kocioł z pierwszego wieczoru (jedzenie schodzi o 10% szybciej, ale posiłki są o stałych porach) i żadnej innej uchwały
    expect(okna[0].podpisane).toBe('u_kociol');
    expect(okna.slice(1).map((o) => o.podpisane)).toEqual(okna.slice(1).map(() => null));
    expect(Object.keys(g.gov.laws.signed)).toEqual(['u_kociol']);
  }, 120_000);
});
