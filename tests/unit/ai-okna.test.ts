/* Okna zarządu silnika osady AI (src/ai/okna.ts), etap 1 osady AI (docs/superpowers/plans/2026-10-21-osada-ai-etap-1.md,
   zadania 5–7): wybór w wydarzeniu przez ocenę skutków na kopiach zarządu i uchwała według potrzeb. Pilnuje ośmiu rzeczy:
   - oceny skutków (`ocenSkutki`): zapasy (jedzenie ×3, drewno ×1, reszta ×0,5), zaufanie +2 i wkurzenie −2 za punkt, rany −10,
     zgony −50, przyjęcia ±4 na osobę według zapasu jedzenia, koniec gry −1000 i dwie wagi dodane po pomiarze: pożar −15
     (gaszenie wygrywa z ewakuacją klatki) i łata na dziurę +6 (zarząd łata złomem, a nie automat pracy deskami); ocena stanu
     po wyborze, więc porównuje wybory z jednego okna (to, co było przed wyborem, się skraca);
   - wyboru w wydarzeniu (`wyborWydarzenia`): każdy dozwolony wybór na kopiach zarządu, najlepsza ocena, przy remisie niższy
     indeks, prawdziwy zarząd i wejście bez zmian (JSON przed i po), okno bez dozwolonego wyboru daje 0;
   - oceny wyboru bez znajomości losu (zadanie 6): kopie mają ziarna pochodne, a nie stan prawdziwego generatora, i jest ich
     `KOPII_OCENY`, więc wybór silnika nie zależy od tego, czy hazard się uda, a losowania zmieniają się z oknem;
   - oceny wyboru bez znajomości ukrytych rzutów kart (zadanie 7): haczyk gościa (tryb zwykły i zombie), `halas.cat` i
     `krzyk.help` są rzucane od nowa na każdej kopii (`przelosujUkryte`) z drugiego ziarna pochodnego (`${id}|ukryte`, niezależnego
     od generatora kopii: osobny test pilnuje okablowania), więc wybór silnika nie zależy od prawdziwej wartości rzutu, rzut
     odsłonięty przez poprzedni krok okna zostaje, a przelosowany gość zgadza się z tabelą wykluczeń generatora gości;
   - dryfu stałych skopiowanych z src/gov (zadanie 7): szanse `halas` i `krzyk` (`make` kart z atrapą generatora tuż pod i tuż
     nad progiem) i wagi haczyka gościa (próbkowanie `skladGoscia` wobec `wagaHaczyka`), żeby zmiana w generatorze nie
     rozjechała cicho kopii w silniku;
   - funkcji oceny wprost (zadanie 7): `ziarnoKopii` (stałość, różnice, 32 bity) i `ocenaWyboru` (null dla niedozwolonego, jedna
     ocena bez dzielenia, średnia z kopii o ziarnach pochodnych);
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
  ocenaWyboru,
  ocenSkutki,
  odpowiedzNaWydarzenie,
  przelosujUkryte,
  UKRYTE_RZUTY,
  WAGI,
  wagaHaczyka,
  wyborUchwaly,
  wyborWydarzenia,
  ziarnoKopii,
} from '../../src/ai/okna.ts';
import { silnik } from '../../src/ai/silnik.ts';
import type { Dom } from '../../src/content/data.ts';
import { tx } from '../../src/core/jezyk.ts';
import { mulberry } from '../../src/core/rng.ts';
import {
  type Gosc,
  type HaczykId,
  haczykiMozliwe,
  type KontekstGoscia,
  KTO,
  type KtoId,
  osobyGrupy,
  skladGoscia,
  ZIMA,
  zgodnyGosc,
} from '../../src/gov/goscie.ts';
import { frazaSkad } from '../../src/gov/goscie-teksty.ts';
import { NEW_EVENTS } from '../../src/gov/tresc.ts';
import type { GovEffects, GovGosc, GovInput, GovState, LawOption, Prompt } from '../../src/gov/typy.ts';
import { emptyEffects } from '../../src/gov/wspolne.ts';
import { eventView, M1_EVENTS } from '../../src/gov/wydarzenia.ts';
import { chooseEvent, newGov, pending } from '../../src/gov/zarzad.ts';
import { dayOf, TICKS_PER_DAY } from '../../src/sim/clock.ts';
import type { GameMode } from '../../src/sim/tryb.ts';
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

  it('przyjęcia: +4 na osobę, gdy po przyjęciu starcza 2 porcje na osobę zarządu, inaczej −4', () => {
    // 4 osoby zarządu (i 4 mieszkańców, którzy nie jedzą z zapasu zarządu i się nie liczą); 40 porcji: po przyjęciu 3 osób 7 jedzących,
    // 14 porcji potrzebnych
    expect(roznica(efekty({ residents: 3 }), i)).toBe(12);
    // ten sam skutek bez zapasu: −4 na osobę (stały składnik oceny zapasu jest taki sam w obu wejściach, więc różnica wprost)
    const biedne = atrapa(10).input();
    expect(roznica(efekty({ residents: 3 }), biedne)).toBe(-12);
    // granica: 4 osoby zarządu + 1 przyjęty = 10 porcji (przed zadaniem 7 z mieszkańcami w głowach było to 18)
    expect(roznica(efekty({ residents: 1 }), atrapa(10).input())).toBe(4);
    expect(roznica(efekty({ residents: 1 }), atrapa(9).input())).toBe(-4);
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
    // 4 osoby zarządu: przyjęcie czterech miejsc (i dwóch na podłodze) wymaga 16 porcji
    const glodny = oknoUchodzcow(12);
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

/** zarząd (domyślnie w trybie zombie) z kartą gościa pod bramą (wizyta aktywna, grupa stoi w fazie `brama`) */
function oknoGoscia(g: Gosc, tryb: GameMode = 'zombie'): { gov: GovState; i: GovInput } {
  const gov = newGov(3, tryb);
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

// ---------------------------------------------------------------- ocena wyboru bez znajomości ukrytych rzutów kart

/* Niektóre karty losują przy tworzeniu rzut, którego nie pokazują ani tekstem, ani wyborami, a od którego zależą skutki
   wyboru: haczyk gościa (chory rozdaje chorobę rano, ugryziony dostaje rozkaz „ugryziony”), kot albo włamywacz za płotem
   (`halas.cat`), pomoc albo pułapka w krzyku z sąsiedztwa (`krzyk.help`). Kopia zarządu ma ten rzut w stanie, więc ocena na
   niej by go znała, choć gracz go nie zna. Silnik losuje go więc od nowa na każdej kopii oceny (z ziarna pochodnego, tak jak
   los w `ocenaWyboru`); rzut, który karta pokazuje albo który odsłonił poprzedni krok okna, zostaje taki, jaki jest. */

describe('wyborWydarzenia bez znajomości ukrytych rzutów', () => {
  afterEach(() => vi.restoreAllMocks());

  const HACZYKI_ZWYKLE: readonly HaczykId[] = ['prawda', 'klamie', 'chory', 'poscig'];
  const goscZHaczykiem = (haczyk: HaczykId) =>
    oknoGoscia(gosc({ kto: 'wedrowiec', chce: 'nocleg', ma: 'nic', haczyk }), 'zwykly');
  const oknoWydarzenia = (s: { gov: GovState; i: GovInput }): Wydarzenie => {
    const p = pending(s.gov, s.i);
    if (p?.k !== 'wydarzenie') throw new Error('brak okna wydarzenia');
    return p;
  };

  it('haczyk gościa: wybór silnika jest ten sam przy gościu uczciwym, chorym, kłamcy i ściganym, w każdej chwili', () => {
    // warunek wstępny: gdyby ocena znała haczyk, wybory by się różniły (chory wpuszczony na noc to rana rano, −10)
    const peeking = new Set(
      HACZYKI_ZWYKLE.map((h) => {
        const s = goscZHaczykiem(h);
        const oceny = przeglad(s.gov, s.i, oknoWydarzenia(s));
        return oceny.indexOf(Math.max(...(oceny as number[])));
      }),
    );
    expect(peeking.size).toBeGreaterThanOrEqual(2);
    // silnik: ten sam wybór w każdym z 60 okien (każde w innej chwili, więc z innymi losowaniami kopii)
    for (let n = 0; n < 60; n++) {
      const wybory = HACZYKI_ZWYKLE.map((h) => {
        const s = goscZHaczykiem(h);
        const i = { ...s.i, tick: s.i.tick + n * 20, screen: s.i.screen + n };
        return wyborWydarzenia(s.gov, i, oknoWydarzenia(s));
      });
      expect(new Set(wybory), `okno ${n}: ${wybory}`).toHaveProperty('size', 1);
    }
  });

  it('haczyk gościa w trybie zombie: ten sam wybór przy uczciwym, chorym i ugryzionym (przed obejrzeniem rąk)', () => {
    const nieSpodziewany = (haczyk: HaczykId) =>
      oknoGoscia(
        gosc({
          kto: 'ocaleni',
          ilu: 3,
          chce: 'nocleg',
          haczyk,
          ...(haczyk === 'ugryziony' ? { ugryziony: 1 } : {}),
        }),
      );
    for (let n = 0; n < 60; n++) {
      const wybory = (['prawda', 'chory', 'ugryziony'] as const).map((h) => {
        const s = nieSpodziewany(h);
        return wyborWydarzenia(s.gov, { ...s.i, tick: s.i.tick + n * 20, screen: s.i.screen + n }, oknoWydarzenia(s));
      });
      expect(new Set(wybory), `okno ${n}: ${wybory}`).toHaveProperty('size', 1);
    }
  });

  it('haczyk gościa w oknie, które ma za sobą krok: odsłonięte ugryzienie zostaje, więc silnik nie wpuszcza ugryzionego', () => {
    const ugryziony = gosc({ kto: 'ocaleni', ilu: 3, chce: 'nocleg', haczyk: 'ugryziony', ugryziony: 1 });
    const s = oknoGoscia(ugryziony);
    s.gov.goscie!.aktywny!.obejrzano = 'ugryziony';
    const p = oknoWydarzenia(s);
    expect(p.choices.map((c) => c.label.pl)).toEqual([
      'Wpuścić na noc',
      'Podać jedzenie przez siatkę (Jedzenie 1)',
      'Odprawić',
    ]);
    // w każdej chwili ten sam wybór: nie wpuszcza (rana −10), tylko daje jedzenie przez siatkę
    for (let n = 0; n < 30; n++)
      expect(wyborWydarzenia(s.gov, { ...s.i, tick: s.i.tick + n * 20 }, p), `okno ${n}`).toBe(1);
  });

  it.each([
    ['halas', 'cat'],
    ['krzyk', 'help'],
  ])('karta %s: wybór silnika nie zależy od ukrytego rzutu %s', (id, pole) => {
    // wybory karty podmienione tak, żeby rzut miał znaczenie dla oceny (zakład: +3 jedzenia, gdy rzut jest prawdziwy, inaczej −3)
    const def = M1_EVENTS.find((e) => e.id === id)!;
    vi.spyOn(def, 'choices').mockImplementation((h, d) => [
      {
        label: tx('Zakład', 'Bet'),
        ok: true,
        run: () => h.addRes('jedzenie', (d as Record<string, boolean>)[pole] ? 3 : -3),
      },
      { label: tx('Spokój', 'Calm'), ok: true, run: () => {} },
    ]);
    const okno = (rzut: boolean) => {
      const gov = newGov(3);
      gov.ev.active = { id, d: { [pole]: rzut } };
      const i = atrapa(40).input();
      const p = pending(gov, i);
      if (p?.k !== 'wydarzenie') throw new Error('brak okna wydarzenia');
      return { gov, i, p };
    };
    // z pełną wiedzą rzut rozstrzyga wybór (inaczej test przechodziłby na pustym warunku)
    const znajacy = [true, false].map((rzut) => {
      const { gov, i, p } = okno(rzut);
      const oceny = przeglad(gov, i, p);
      return oceny[0]! > oceny[1]! ? 0 : 1;
    });
    expect(znajacy).toEqual([0, 1]);
    for (let n = 0; n < 60; n++) {
      const wybory = [true, false].map((rzut) => {
        const { gov, i, p } = okno(rzut);
        return wyborWydarzenia(gov, { ...i, tick: i.tick + n * 20 }, p);
      });
      expect(wybory[0], `okno ${n}`).toBe(wybory[1]);
    }
  });

  it('ukryty rzut każdej kopii pochodzi z osobnego ziarna (id|ukryte), niezależnego od generatora kopii', () => {
    // wybór 0 karty zapisuje, co widzi kopia: przelosowany rzut `cat` i pierwsze losowanie generatora kopii (`h.rng()`). Gdyby oba
    // strumienie brały to samo ziarno (np. `mulberry(kopia.rng.s)`), rzut byłby funkcją tego losowania, a skutki wyboru, które
    // losują z generatora, byłyby skorelowane z ukrytym rzutem
    const def = M1_EVENTS.find((e) => e.id === 'halas')!;
    const widziane: { cat: boolean; u: number }[] = [];
    vi.spyOn(def, 'choices').mockImplementation((h, d) => [
      {
        label: tx('Zapis', 'Log'),
        ok: true,
        run: () => {
          widziane.push({ cat: (d as { cat: boolean }).cat, u: h.rng() });
        },
      },
      { label: tx('Nic', 'Nothing'), ok: true, run: () => {} },
    ]);
    const gov = newGov(3);
    gov.ev.active = { id: 'halas', d: { cat: false } };
    const i = atrapa(40).input();
    const p = pending(gov, i);
    if (p?.k !== 'wydarzenie') throw new Error('brak okna wydarzenia');
    const okien = 40;
    for (let w = 0; w < okien; w++) ocenaWyboru(gov, { ...i, tick: i.tick + w * 20 }, p, 0);
    expect(widziane).toHaveLength(okien * KOPII_OCENY);
    widziane.forEach((z, k) => {
      const tick = i.tick + Math.floor(k / KOPII_OCENY) * 20;
      const kopia = k % KOPII_OCENY;
      // dokładnie rzut z ziarna `halas|ukryte|tick|kopia`, z szansą 0,45 karty
      expect(z.cat, `okno ${Math.floor(k / KOPII_OCENY)}, kopia ${kopia}`).toBe(
        mulberry(ziarnoKopii('halas|ukryte', tick, kopia))() < 0.45,
      );
    });
    // i nie jest funkcją pierwszego losowania generatora kopii (przy wspólnym ziarnie zgadzałby się w każdym oknie)
    expect(widziane.some((z) => z.cat !== z.u < 0.45)).toBe(true);
    expect(widziane.some((z) => z.cat === z.u < 0.45)).toBe(true);
  });

  it('prawdziwy zarząd zostaje bez zmian także w oknie gościa (ukryty haczyk przelosowują tylko kopie)', () => {
    const s = goscZHaczykiem('chory');
    const przed = JSON.stringify(s.gov);
    wyborWydarzenia(s.gov, s.i, oknoWydarzenia(s));
    expect(JSON.stringify(s.gov)).toBe(przed);
    expect(s.gov.goscie!.aktywny!.gosc.haczyk).toBe('chory');
  });
});

describe('przelosujUkryte: co ocena losuje od nowa, a co zostawia', () => {
  /** zarząd z kartą `id` i danymi `d` (bez wizyty) */
  const zKarta = (id: string, d: Record<string, unknown>): GovState => {
    const gov = newGov(3);
    gov.ev.active = { id, d };
    return gov;
  };
  const wejscie = atrapa(40).input();
  const ziarna = Array.from({ length: 600 }, (_, n) => n + 1);

  it('tabela ukrytych rzutów: halas.cat 0,45 i krzyk.help 0,5 (wedrowiec.thief ma kartę o wadze 0, więc go nie ma)', () => {
    expect(UKRYTE_RZUTY).toEqual({
      halas: [{ pole: 'cat', szansa: 0.45 }],
      krzyk: [{ pole: 'help', szansa: 0.5 }],
    });
    // karta `wedrowiec` ma w `make` rzut `thief`, ale jej waga to 0 (nie wypada z puli, wraca jako gość z klocków); gdyby ktoś
    // jej tę wagę nadał, rzut stałby się żywy i trzeba go dopisać do `UKRYTE_RZUTY`
    const wedrowiec = NEW_EVENTS.find((e) => e.id === 'wedrowiec')!;
    expect(wedrowiec.w({} as never)).toBe(0);
  });

  it.each([
    ['halas', 'cat', 0.45],
    ['krzyk', 'help', 0.5],
  ])('karta %s: pole %s losuje się od nowa z szansą %f, a reszta danych zostaje', (id, pole, szansa) => {
    let prawda = 0;
    for (const n of ziarna) {
      const kopia = zKarta(id, { [pole]: false, inne: 7, dest: 'na południe' });
      przelosujUkryte(kopia, wejscie, mulberry(n));
      expect(typeof kopia.ev.active!.d[pole]).toBe('boolean');
      expect(kopia.ev.active!.d).toMatchObject({ inne: 7, dest: 'na południe' });
      if (kopia.ev.active!.d[pole]) prawda++;
    }
    expect(prawda / ziarna.length).toBeGreaterThan(szansa - 0.07);
    expect(prawda / ziarna.length).toBeLessThan(szansa + 0.07);
  });

  it('wynik nie zależy od prawdziwej wartości pola: ten sam los daje tę samą kopię', () => {
    for (const n of ziarna.slice(0, 40)) {
      const a = zKarta('halas', { cat: true });
      const b = zKarta('halas', { cat: false });
      przelosujUkryte(a, wejscie, mulberry(n));
      przelosujUkryte(b, wejscie, mulberry(n));
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it('karta bez ukrytego rzutu i stan bez karty zostają bez zmian', () => {
    const uchodzcy = zKarta('uchodzcy', { n: 6, from: 'z Wilanowa', spec: null });
    const przed = JSON.stringify(uchodzcy);
    przelosujUkryte(uchodzcy, wejscie, mulberry(5));
    expect(JSON.stringify(uchodzcy)).toBe(przed);
    const pusty = newGov(3);
    const przedPusty = JSON.stringify(pusty);
    przelosujUkryte(pusty, wejscie, mulberry(5));
    expect(JSON.stringify(pusty)).toBe(przedPusty);
  });

  /** gość pod bramą na kopii: wywołuje `przelosujUkryte` i oddaje jego haczyk i indeks ugryzionego */
  function przelosowany(g: Gosc, n: number, tryb: GameMode = 'zwykly', obejrzano?: 'ugryziony' | 'czysty') {
    const s = oknoGoscia(g, tryb);
    if (obejrzano) s.gov.goscie!.aktywny!.obejrzano = obejrzano;
    przelosujUkryte(s.gov, s.i, mulberry(n));
    return s.gov.goscie!.aktywny!.gosc;
  }
  /** ile razy wypadł każdy haczyk w 600 losowaniach */
  function rozklad(g: Gosc, tryb: GameMode = 'zwykly', obejrzano?: 'ugryziony' | 'czysty'): Record<string, number> {
    const licznik: Record<string, number> = {};
    for (const n of ziarna) {
      const po = przelosowany(g, n, tryb, obejrzano);
      licznik[po.haczyk] = (licznik[po.haczyk] ?? 0) + 1;
    }
    return licznik;
  }

  it('haczyk gościa w zwykłym trybie: uczciwy najczęściej, potem kłamca, chory i ścigany; nigdy ugryziony', () => {
    const r = rozklad(gosc({ kto: 'wedrowiec', chce: 'nocleg', ma: 'nic', haczyk: 'chory' }));
    expect(Object.keys(r).sort()).toEqual(['chory', 'klamie', 'poscig', 'prawda']);
    // wagi 4 : 1,4 : 1 : 1 (atrapa: jesień, zapas 30 porcji, więc kłamca ×1,5 = 2,1), czyli 4 / 8,1 = 49% uczciwych
    expect(r.prawda).toBeGreaterThan(r.klamie);
    expect(r.klamie).toBeGreaterThan(r.chory);
    expect(r.prawda / ziarna.length).toBeGreaterThan(0.42);
    expect(r.prawda / ziarna.length).toBeLessThan(0.56);
    expect(r.chory / ziarna.length).toBeGreaterThan(0.07);
    expect(r.chory / ziarna.length).toBeLessThan(0.18);
  });

  it('gość z natury chory (karta mówi, kim jest) jest zaraźliwy dwa razy częściej, a chory nie jest ścigany', () => {
    const wedrowiec = rozklad(gosc({ kto: 'wedrowiec', chce: 'nocleg', ma: 'nic', haczyk: 'prawda' }));
    const chory = rozklad(gosc({ kto: 'chory', chce: 'leki', ma: 'nic', haczyk: 'prawda' }));
    expect(chory.chory).toBeGreaterThan(1.5 * wedrowiec.chory);
    expect(chory.poscig).toBeUndefined();
  });

  it('czego karta nie dopuszcza, nie wypada: kto prosi o wiadomość, nie jest kłamcą ani ściganym', () => {
    const r = rozklad(gosc({ kto: 'wedrowiec', chce: 'wiadomosc', ma: 'wiadomosc', haczyk: 'prawda' }));
    expect(Object.keys(r).sort()).toEqual(['chory', 'prawda']);
  });

  it('tryb zombie: uczciwy, chory albo ugryziony; indeks ugryzionego mieści się w grupie, a inny haczyk go nie ma', () => {
    const g = gosc({ kto: 'ocaleni', ilu: 3, chce: 'nocleg', haczyk: 'prawda' });
    const r = rozklad(g, 'zombie');
    expect(Object.keys(r).sort()).toEqual(['chory', 'prawda', 'ugryziony']);
    for (const n of ziarna.slice(0, 200)) {
      const po = przelosowany(g, n, 'zombie');
      if (po.haczyk === 'ugryziony') {
        expect(po.ugryziony).toBeGreaterThanOrEqual(0);
        expect(po.ugryziony).toBeLessThan(po.osoby.length);
      } else expect(po.ugryziony).toBeUndefined();
    }
  });

  it('obejrzane ręce: ugryzienie zostaje takie, jakie jest; po „czysty” ugryzienie nie wypada wcale, reszta dalej się losuje', () => {
    const ugryziony = gosc({ kto: 'ocaleni', ilu: 3, chce: 'nocleg', haczyk: 'ugryziony', ugryziony: 2 });
    for (const n of ziarna.slice(0, 50)) {
      const po = przelosowany(ugryziony, n, 'zombie', 'ugryziony');
      expect([po.haczyk, po.ugryziony]).toEqual(['ugryziony', 2]);
    }
    const czysty = rozklad(gosc({ kto: 'ocaleni', ilu: 3, chce: 'nocleg', haczyk: 'prawda' }), 'zombie', 'czysty');
    expect(Object.keys(czysty).sort()).toEqual(['chory', 'prawda']);
  });

  it('ktoś z ugryzionym bliskim ma zawsze ugryzienie: nie ma czego ukrywać, więc nic się nie zmienia', () => {
    const g = gosc({ kto: 'z_ugryzionym', ilu: 2, chce: 'dobic', ma: 'nic', haczyk: 'ugryziony', ugryziony: 1 });
    for (const n of ziarna.slice(0, 50)) {
      const po = przelosowany(g, n, 'zombie');
      expect([po.haczyk, po.ugryziony]).toEqual(['ugryziony', 1]);
    }
  });

  it('przelosowany gość z prawdziwego generatora jest zawsze zgodny z tabelą wykluczeń generatora', () => {
    for (const tryb of ['zwykly', 'zombie'] as const) {
      const ctx: KontekstGoscia = {
        mode: tryb,
        pora: 'wieczor',
        season: 3,
        zapasy: 30,
        okolica: [],
        znane: new Set<Dom>(),
        napady: 0,
        dom: false,
      };
      for (const n of ziarna.slice(0, 250)) {
        const s = oknoGoscia(skladGoscia(mulberry(n), 1, ctx, new Set<string>()), tryb);
        przelosujUkryte(s.gov, s.i, mulberry(n * 7 + 1));
        const po = s.gov.goscie!.aktywny!.gosc;
        expect(zgodnyGosc(po, tryb), `${tryb} ${n}: ${JSON.stringify(po)}`).toBe(true);
        expect(po.ugryziony !== undefined).toBe(po.haczyk === 'ugryziony');
      }
    }
  });

  it('karty z 0.3 z gościem i „Złapany” nie tracą haczyka: kopia zostaje taka, jaka jest', () => {
    const g = gosc({ kto: 'wedrowiec', chce: 'nocleg', ma: 'nic', haczyk: 'klamie' });
    for (const id of ['zlapany', 'uchodzcy']) {
      const s = oknoGoscia(g, 'zwykly');
      s.gov.ev.active = { id, d: id === 'zlapany' ? { id: g.id } : { gid: g.id } };
      const przed = JSON.stringify(s.gov);
      przelosujUkryte(s.gov, s.i, mulberry(3));
      expect(JSON.stringify(s.gov), id).toBe(przed);
    }
  });
});

describe('dryf stałych skopiowanych z src/gov', () => {
  /** atrapa gospodarza karty: `make` kart z ukrytym rzutem czyta tylko `h.rng` */
  const hostZRng = (u: number) => ({ rng: () => u }) as never;

  it.each(Object.entries(UKRYTE_RZUTY).flatMap(([id, rzuty]) => rzuty.map((r) => [id, r.pole, r.szansa] as const)))(
    'karta %s: pole %s jest prawdziwe dokładnie poniżej progu %f z make karty',
    (id, pole, szansa) => {
      const def = M1_EVENTS.find((e) => e.id === id)!;
      const pod = def.make(hostZRng(szansa - 0.001)) as Record<string, unknown>;
      const nad = def.make(hostZRng(szansa + 0.001)) as Record<string, unknown>;
      expect(pod[pole], 'tuż pod progiem').toBe(true);
      expect(nad[pole], 'tuż nad progiem').toBe(false);
    },
  );

  /** gość z generatora, aż uzbiera się `ile` gości danego rodzaju; zlicza ich haczyki */
  function haczykiZGeneratora(kto: KtoId, ctx: KontekstGoscia, ile: number): Record<string, number> {
    const licznik: Record<string, number> = {};
    let zebrano = 0;
    for (let n = 1; zebrano < ile && n < 400_000; n++) {
      const g = skladGoscia(mulberry(n * 7919), 1, ctx, new Set<string>());
      if (g.kto !== kto) continue;
      licznik[g.haczyk] = (licznik[g.haczyk] ?? 0) + 1;
      zebrano++;
    }
    expect(zebrano, `${kto}: za mało gości z generatora`).toBe(ile);
    return licznik;
  }

  it.each([
    ['wędrowiec, jesień, zapas 10', 'wedrowiec', 'zwykly', 0, 10],
    ['wędrowiec, jesień, zapas 30 (kłamca ×1,5)', 'wedrowiec', 'zwykly', 0, 30],
    ['wędrowiec, zima (chory ×2)', 'wedrowiec', 'zwykly', ZIMA, 10],
    ['chory, zima (chory ×4)', 'chory', 'zwykly', ZIMA, 10],
    ['ocaleni, tryb zombie (uczciwy, chory, ugryziony)', 'ocaleni', 'zombie', 0, 10],
  ] as const)('wagi haczyka gościa zgadzają się z generatorem gości: %s', (_opis, kto, tryb, pora, zapas) => {
    const ctx: KontekstGoscia = {
      mode: tryb,
      pora: 'wieczor',
      season: pora,
      zapasy: zapas,
      okolica: [],
      znane: new Set<Dom>(),
      napady: 0,
      dom: false,
    };
    const ile = 3000;
    const licznik = haczykiZGeneratora(kto, ctx, ile);
    const i = { ...atrapa(zapas).input(), season: pora };
    const mozliwe = haczykiMozliwe(kto, tryb);
    const wagi = mozliwe.map((h) => wagaHaczyka(h, { kto } as Gosc, i));
    const suma = wagi.reduce((a, w) => a + w, 0);
    // generator losuje haczyk po rodzaju gościa i przed resztą klocków, więc rozkład haczyka przy danym rodzaju to dokładnie
    // znormalizowane wagi (błąd próbkowania przy 3000 gościach to najwyżej 0,01)
    mozliwe.forEach((h, k) => {
      expect((licznik[h] ?? 0) / ile, `${h}`).toBeGreaterThan(wagi[k] / suma - 0.035);
      expect((licznik[h] ?? 0) / ile, `${h}`).toBeLessThan(wagi[k] / suma + 0.035);
    });
    expect(Object.keys(licznik).sort()).toEqual([...mozliwe].sort());
  });
});

describe('ziarnoKopii i ocenaWyboru wprost', () => {
  it('ziarno pochodne: stałe dla tych samych argumentów, różne dla innego okna, chwili i kopii; 32-bitowe', () => {
    const z = ziarnoKopii('halas', 1000, 0);
    expect(ziarnoKopii('halas', 1000, 0)).toBe(z);
    const inne = [ziarnoKopii('krzyk', 1000, 0), ziarnoKopii('halas', 1020, 0), ziarnoKopii('halas', 1000, 1)];
    for (const x of inne) expect(x).not.toBe(z);
    expect(new Set(inne).size).toBe(3);
    for (const x of [z, ...inne]) expect(x).toBe(x | 0);
  });

  it('ziarno pochodne ukrytych rzutów (z dopiskiem „ukryte”) nie powtarza ziarna generatora kopii', () => {
    expect(ziarnoKopii('halas|ukryte', 1000, 0)).not.toBe(ziarnoKopii('halas', 1000, 0));
  });

  afterEach(() => vi.restoreAllMocks());

  it('ocena wyboru: wybór niedozwolony to null, a wybór bez losowania to jedna ocena równa ocenSkutki (bez dzielenia)', () => {
    const { gov, i, p } = oknoUchodzcow(0);
    expect(p.choices[1].ok).toBe(false);
    expect(ocenaWyboru(gov, i, p, 1)).toBeNull();
    expect(ocenaWyboru(gov, i, p, 99)).toBeNull();
    // skutek bez losowania: dokładnie ocena skutków na jednej kopii
    const kopia = structuredClone(gov);
    expect(ocenaWyboru(gov, i, p, 3)).toBe(ocenSkutki(chooseEvent(kopia, i, 3), kopia, i));
  });

  it('ocena wyboru z losowaniem to średnia ocen z KOPII_OCENY kopii o ziarnach pochodnych', () => {
    // hazard: z szansą 1/2 +15 punktów, inaczej nic; ocena każdej kopii to 0 albo 15 nad stałą częścią, a ocena wyboru ich średnia
    const { gov, i, p } = oknoHazardu(0.5);
    let mieszane = 0;
    for (let n = 0; n < 30; n++) {
      const ii = { ...i, tick: i.tick + n * 20 };
      const oceny = Array.from({ length: KOPII_OCENY }, (_, nr) => {
        const kopia = structuredClone(gov);
        kopia.rng.s = ziarnoKopii(p.id, ii.tick, nr);
        return ocenSkutki(chooseEvent(kopia, ii, 1), kopia, ii);
      });
      if (new Set(oceny).size > 1) mieszane++;
      expect(ocenaWyboru(gov, ii, p, 1), `okno ${n}: ${oceny}`).toBeCloseTo(
        oceny.reduce((a, o) => a + o, 0) / oceny.length,
        10,
      );
    }
    // test nie przechodzi na pustym warunku: w części okien kopie dają różne oceny (hazard raz się udaje, raz nie)
    expect(mieszane).toBeGreaterThan(5);
  });
});

describe('odpowiedzNaWydarzenie: okno wieloetapowe', () => {
  const ugryziony = () => gosc({ kto: 'ocaleni', ilu: 3, chce: 'nocleg', haczyk: 'ugryziony', ugryziony: 1 });

  /** Wykonuje odpowiedź na bieżące okno gościa, zapisując wybory (prawdziwe `chooseEvent` na stanie). Silnik nie widzi
      ugryzienia, zanim ktoś obejrzy ręce, więc sam nie sięga po „Obejrzeć ręce” (ocena jest jednokrokowa): `pierwszy`
      wymusza pierwszy krok, a drugi krok silnik wybiera już sam, z odsłoniętym ugryzieniem. */
  function odpowiedz(s: { gov: GovState; i: GovInput }, pierwszy?: number): number[] {
    const wybory: number[] = [];
    const p = pending(s.gov, s.i);
    if (p?.k !== 'wydarzenie') throw new Error('brak okna wydarzenia');
    odpowiedzNaWydarzenie(
      s.gov,
      () => s.i,
      p,
      (k) => {
        const wybrany = wybory.length === 0 && pierwszy !== undefined ? pierwszy : k;
        wybory.push(wybrany);
        chooseEvent(s.gov, s.i, wybrany);
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
    const wybory = odpowiedz(s, 2);
    // krok 1: obejrzeć ręce (wymuszone), krok 2: bez tej opcji, z odsłoniętym ugryzieniem
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
    const wybory = odpowiedz(s, 2);
    // gdyby drugi krok wybierał z listy pierwszego okna, wybór o indeksie 3 („Odprawić”) trafiłby w nieistniejący
    expect(pierwsze.choices).toHaveLength(4);
    expect(wybory[1]).not.toBe(3);
    // ugryzienie odsłonięte przez pierwszy krok zostaje w ocenie: silnik nie wpuszcza ugryzionego, tylko podaje jedzenie przez siatkę
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

  it('głód (poniżej 1 porcji na osobę zarządu): kocioł, a gdy go nie ma (podpisany, zablokowany), nic: racje kosztują wkurzenie', () => {
    const glodny = wejscieUchwal(3);
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
    const i = wejscieUchwal(3, 2);
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
