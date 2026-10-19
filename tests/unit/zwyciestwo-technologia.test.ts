/* Droga technologii „Prąd bez miedzi” w ramie zwycięstwa (src/gov/zwyciestwo.ts, src/ui/zwyciestwo.ts; plan
   docs/superpowers/plans/2026-10-19-warunki-zwyciestwa-technologia.md, zadanie 2). Sześć kamieni liczy się z odczytu
   badań (`GovInput.badania` i `GovInput.techDone`) po kolei i bez cofania: pracownia, pierwsze badanie, era 3, włączona
   sieć, generator fuzji i uruchomiona fabryka (`badania.fabryka`, etap 2). Przy braku pracowni i przed pierwszym
   badaniem ekran mówi „co dalej”, od drugiego kamienia „Wkrótce” o prądzie z projektu gospodarki (ery 3–6 są dziś
   odwrócone), a bez odczytu badań zostaje dawny „Wkrótce”. Epilog fabryki ma własne zdanie w każdym trybie i języku.
   Czyste funkcje na wejściu z atrapy (tests/unit/gov-atrapa.ts), bez symulacji i bez sieci; na końcu jeden scenariusz
   z odczytem z prawdziwej symulacji (Przymorze z dema), żeby `GovInput.badania` składane w src/sim/gov.ts zgadzało się
   z tym, czego droga oczekuje. W grze etapu 1 odczyt dochodzi najdalej do drugiego kamienia, więc dalsze kamienie
   ustawiają tu testy wprost. */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ustawJezyk } from '../../src/core/jezyk.ts';
import { hashString } from '../../src/core/rng.ts';
import type { GameMode, GovInput, GovState } from '../../src/gov/typy.ts';
import { emptyEffects } from '../../src/gov/wspolne.ts';
import { loadGov, newGov, pending, saveGov } from '../../src/gov/zarzad.ts';
import {
  DROGI,
  grajDalej,
  krokZwyciestwa,
  nazwaDrogi,
  ocenDrogi,
  type PostepDrogi,
  wlaczZwyciestwo,
  wygrajDroge,
} from '../../src/gov/zwyciestwo.ts';
import { TECHS } from '../../src/sim/badania.ts';
import { footprint } from '../../src/sim/budowle.ts';
import { govInput } from '../../src/sim/gov.ts';
import { createSim, Sim, type SimState, type Thing } from '../../src/sim/sim.ts';
import { allowedAnchors } from '../../src/ui/budowa.ts';
import type { Sheet } from '../../src/ui/okna.ts';
import { epilogSheet, type StatyEpilogu } from '../../src/ui/zwyciestwo.ts';
import { buildWorld } from '../../src/world/world.ts';
import { Atrapa } from './gov-atrapa.ts';
import { POLSKIE, polskieSlowa } from './po-angielsku.ts';

afterEach(() => ustawJezyk('pl'));

type Badania = NonNullable<GovInput['badania']>;
const BEZ_BADAN: Badania = { pracownia: false, zbadane: 0, era: 0, koncowa: false, siecWlaczona: false };

/** sześć kamieni drogi dosłownie z planu: polski i angielski napis po kolei */
const KAMIENIE: [string, string][] = [
  ['Pracownia postawiona', 'Research room built'],
  ['Pierwsze badanie', 'First research'],
  ['Era 3', 'Era 3'],
  ['Sieć bez miedzi', 'Copper-free grid'],
  ['Generator fuzji', 'Fusion generator'],
  ['Fabryka ruszyła', 'The factory is running'],
];

/** „Wkrótce” z odczytem badań (od drugiego kamienia) i bez odczytu (dawne zdanie), dosłownie z planu */
const WKROTCE_PRAD = {
  pl: 'Wkrótce: ery 3–6 czekają na prąd z projektu gospodarki.',
  en: 'Coming soon: eras 3–6 are waiting for power from the economy project.',
};
const WKROTCE_BEZ_ODCZYTU = {
  pl: 'Wkrótce: badania w pracowni i sieć bez miedzi.',
  en: 'Coming soon: research and a copper-free grid.',
};

/** „Co dalej” przy zerze i jednym kamieniu, dosłownie z planu */
const DALEJ = [
  {
    pl: 'Postawcie pracownię w pokoju waszego mieszkania (Budowa, zakładka Dom).',
    en: 'Build a research room in a room of your flat (Build, Home tab).',
  },
  {
    pl: 'Posadźcie kogoś przy stole pracowni i wybierzcie kartkę na tablicy badań.',
    en: 'Sit someone at the research table and pick a card on the research board.',
  },
];

/** epilog fabryki w obu trybach i językach, dosłownie z planu */
const EPILOG = {
  zwykly: {
    pl: 'Fabryka ruszyła. Bioroboty, których bakteria nie rusza, kładą nowe linie od waszej bramy przez całe miasto, a superserwer liczy, kto pierwszy dostanie prąd.',
    en: 'The factory is running. Biorobots the bacterium cannot touch are laying new lines from your gate across the whole city, while the superserver works out who gets power first.',
  },
  zombie: {
    pl: 'Fabryka ruszyła. Humanoidalni żołnierze wychodzą z bramy i czyszczą miasto ze szwendaczy, kwartał po kwartale, a superserwer pisze im rozkazy i regulamin.',
    en: 'The factory is running. Humanoid soldiers march out of the gate and clear the city of walkers, block by block, while the superserver writes their orders and their terms of service.',
  },
} as const;

/** wejście z atrapy bez odczytu badań (gra bez badań albo odczyt, którego nie ma) */
const bez = (over: Partial<GovInput> = {}): GovInput => ({ ...new Atrapa(1).input(), ...over });
/** wejście z atrapy z odczytem badań (wszystko wyłączone poza tym, co podano) i listą zbadanych technologii */
const wej = (b: Partial<Badania> = {}, techDone: string[] = [], over: Partial<GovInput> = {}): GovInput => ({
  ...bez(),
  badania: { ...BEZ_BADAN, ...b },
  techDone,
  ...over,
});

/** zbadane technologie kolejnych etapów (identyfikatory z drzewa badań) */
const DO_ERY_3 = ['t_okna', 't_spawanie', 't_panele'];
const DO_SIECI = [...DO_ERY_3, 't_siec'];
const DO_GENERATORA = [...DO_SIECI, 't_fuzja'];
/** cały łańcuch ery 6 aż do fabryki zwykłej gry (superserwer i fabryka biorobotów) */
const DO_FABRYKI = [...DO_GENERATORA, 't_superserwer', 't_fabryka_bio'];

/** odczyty, z których każdy spełnia o jeden kamień więcej niż poprzedni; pierwsza liczba to liczba kamieni drogi */
const ETAPY: [number, GovInput][] = [
  [1, wej({ pracownia: true })],
  [2, wej({ pracownia: true, zbadane: 1, era: 1 }, ['t_okna'])],
  [3, wej({ pracownia: true, zbadane: 3, era: 3 }, DO_ERY_3)],
  [4, wej({ pracownia: true, zbadane: 4, era: 6, siecWlaczona: true }, DO_SIECI)],
  [5, wej({ pracownia: true, zbadane: 5, era: 6, siecWlaczona: true }, DO_GENERATORA)],
  [6, wej({ pracownia: true, zbadane: 7, era: 6, siecWlaczona: true, koncowa: true, fabryka: true }, DO_FABRYKI)],
];
const etap = (n: number): GovInput => ETAPY[n - 1][1];

/** stan zarządu z włączonymi drogami */
function wlaczony(mode: GameMode = 'zwykly'): GovState {
  const st = newGov(1, mode);
  wlaczZwyciestwo(st);
  return st;
}

/** jeden krok zwycięstwa; oddaje skutki tego kroku */
function krok(st: GovState, i: GovInput) {
  const fx = emptyEffects();
  krokZwyciestwa(st, i, fx);
  return fx;
}

const z = (st: GovState) => st.zwyciestwo!;
const kamienie = (st: GovState) => st.zwyciestwo?.kamienie.technologia ?? 0;
/** droga technologii z oceny dróg */
const tech = (st: GovState, i: GovInput): PostepDrogi => ocenDrogi(st, i).find((d) => d.droga === 'technologia')!;
/** stan z włączonymi drogami i zapisanymi kamieniami technologii (logikę kamieni sprawdzają testy niżej) */
const zKamieniami = (n: number, mode: GameMode = 'zwykly'): GovState => {
  const st = wlaczony(mode);
  z(st).kamienie.technologia = n;
  return st;
};

describe('definicja drogi technologii', () => {
  it('dokładnie sześć kamieni, po polsku i po angielsku, w tej kolejności', () => {
    expect(DROGI.technologia.kamienie.map((k) => [k.pl, k.en])).toEqual(KAMIENIE);
    expect([DROGI.technologia.nazwa.pl, DROGI.technologia.nazwa.en]).toEqual([
      'Prąd bez miedzi',
      'Power without copper',
    ]);
  });

  it('nazwa drogi jest ta sama w obu trybach (tylko lek zmienia nazwę)', () => {
    expect(nazwaDrogi('technologia', 'zwykly')).toEqual(nazwaDrogi('technologia', 'zombie'));
  });

  it('generator, od którego zależy piąty kamień, jest w drzewie badań pod tym identyfikatorem (era 6)', () => {
    expect(TECHS.find((t) => t.id === 't_fuzja')?.era).toBe(6);
  });
});

describe('kamienie z odczytu badań', () => {
  it('bez odczytu badań droga stoi na zerze, także gdy techDone coś ma', () => {
    const st = wlaczony();
    krok(st, bez());
    krok(st, bez({ techDone: DO_GENERATORA }));
    expect(z(st).kamienie.technologia).toBeUndefined();
    expect(st.log).toHaveLength(0);
  });

  it('odczyt bez pracowni i bez badań nie daje kamienia', () => {
    const st = wlaczony();
    krok(st, wej());
    expect(z(st).kamienie.technologia).toBeUndefined();
    expect(st.log).toHaveLength(0);
  });

  it('ciąg odczytów: pracownia 1, pierwsze badanie 2, era 3 daje 3, włączona sieć 4, generator 5, fabryka 6', () => {
    const st = wlaczony();
    for (const [ile, i] of ETAPY) {
      const wpisy = st.log.length;
      const fx = krok(st, i);
      expect(kamienie(st), `${ile}`).toBe(ile);
      // jeden nowy wpis w kronice (wielką czcionką), po polsku i po angielsku; podpowiedź to ten sam wpis
      expect(st.log, `${ile}`).toHaveLength(wpisy + 1);
      const wpis = st.log.at(-1)!;
      expect(wpis.txt, `${ile}`).toEqual({
        pl: `Droga „Prąd bez miedzi”: ${KAMIENIE[ile - 1][0]}.`,
        en: `Power without copper: ${KAMIENIE[ile - 1][1]}.`,
      });
      expect(wpis.big, `${ile}`).toBe(true);
      expect(fx.log, `${ile}`).toEqual([wpis.txt]);
    }
  });

  it('kilka kamieni naraz to kilka wpisów po kolei, po jednym na kamień', () => {
    const st = wlaczony();
    krok(st, etap(4));
    expect(kamienie(st)).toBe(4);
    expect(st.log.map((l) => l.txt.pl)).toEqual(KAMIENIE.slice(0, 4).map(([pl]) => `Droga „Prąd bez miedzi”: ${pl}.`));
  });

  it('ten sam odczyt drugi raz niczego nie dopisuje', () => {
    const st = wlaczony();
    krok(st, etap(3));
    expect(kamienie(st)).toBe(3);
    const przed = JSON.stringify(st);
    const fx = krok(st, etap(3));
    expect(JSON.stringify(st)).toBe(przed);
    expect(fx.log).toEqual([]);
  });

  it('pierwsze badanie liczy się też po rozbiórce pracowni (zbadana technologia wystarcza na dwa pierwsze kamienie)', () => {
    const st = wlaczony();
    krok(st, wej({ pracownia: false, zbadane: 1, era: 1 }, ['t_okna']));
    expect(kamienie(st)).toBe(2);
  });

  it('kamienie idą po kolei: późniejszy warunek bez wcześniejszych nic nie daje', () => {
    const przypadki: [string, GovInput, number][] = [
      ['sieć włączona, nic więcej', wej({ siecWlaczona: true }), 0],
      ['sama flaga fabryki', wej({ fabryka: true }), 0],
      ['generator w techDone bez badań', wej({}, ['t_fuzja']), 0],
      ['sieć włączona przy samej pracowni', wej({ pracownia: true, siecWlaczona: true }), 1],
      ['era 3 bez żadnej zbadanej technologii', wej({ pracownia: true, era: 3 }), 1],
      ['sieć włączona bez ery 3', wej({ pracownia: true, zbadane: 5, era: 2, siecWlaczona: true }), 2],
      ['generator bez włączonej sieci', wej({ pracownia: true, zbadane: 5, era: 6 }, DO_GENERATORA), 3],
      [
        'fabryka uruchomiona bez włączonej sieci (z generatorem)',
        wej({ pracownia: true, zbadane: 5, era: 6, fabryka: true }, DO_GENERATORA),
        3,
      ],
      [
        'fabryka uruchomiona bez generatora',
        wej({ pracownia: true, zbadane: 4, era: 6, siecWlaczona: true, fabryka: true }, DO_SIECI),
        4,
      ],
    ];
    for (const [opis, i, ile] of przypadki) {
      const st = wlaczony();
      krok(st, i);
      expect(kamienie(st), opis).toBe(ile);
    }
  });

  it('fabryka zbadana (`koncowa`), ale jeszcze nie uruchomiona, szóstego kamienia nie daje', () => {
    const st = wlaczony();
    krok(st, wej({ pracownia: true, zbadane: 7, era: 6, siecWlaczona: true, koncowa: true }, DO_FABRYKI));
    expect(kamienie(st)).toBe(5);
    expect(z(st).wygrane).toEqual([]);
    expect(z(st).epilogi).toEqual([]);
    // `fabryka: false` znaczy to samo co brak pola
    krok(
      st,
      wej({ pracownia: true, zbadane: 7, era: 6, siecWlaczona: true, koncowa: true, fabryka: false }, DO_FABRYKI),
    );
    expect(kamienie(st)).toBe(5);
  });

  it('kamienie nie maleją, gdy odczyt spadnie (rozbiórka pracowni, brak badań, brak odczytu)', () => {
    const st = wlaczony();
    krok(st, etap(3));
    const wpisy = st.log.length;
    krok(st, wej());
    expect(kamienie(st)).toBe(3);
    krok(st, wej({ pracownia: false, zbadane: 0, era: 0, siecWlaczona: false }, []));
    expect(kamienie(st)).toBe(3);
    krok(st, bez());
    expect(kamienie(st)).toBe(3);
    // ekran dróg czyta kamienie ze stanu, a nie z chwilowego odczytu
    expect(tech(st, wej()).zaliczone).toBe(3);
    expect(tech(st, bez()).zaliczone).toBe(3);
    // odczyt wraca: te same kamienie nie liczą się drugi raz
    krok(st, etap(3));
    expect(kamienie(st)).toBe(3);
    expect(st.log).toHaveLength(wpisy);
  });

  it('po rozbiórce pracowni droga idzie dalej od tego samego miejsca, gdy badania wrócą', () => {
    const st = wlaczony();
    krok(st, etap(2));
    krok(st, wej({ pracownia: false, zbadane: 1, era: 1 }, ['t_okna']));
    expect(kamienie(st)).toBe(2);
    krok(st, etap(4));
    expect(kamienie(st)).toBe(4);
    expect(st.log).toHaveLength(4);
  });

  it('droga technologii nie rusza pozostałych dróg ani niczego poza stanem zwycięstwa i kroniką', () => {
    const st = wlaczony();
    const bezZwyciestwa = (s: GovState) => {
      const kopia = JSON.parse(JSON.stringify(s));
      delete kopia.zwyciestwo;
      delete kopia.log;
      return kopia;
    };
    const przed = bezZwyciestwa(st);
    const fx = krok(st, etap(6));
    expect(bezZwyciestwa(st)).toEqual(przed);
    expect(fx).toEqual({ ...emptyEffects(), log: fx.log });
    expect(Object.keys(z(st).kamienie)).toEqual(['technologia']);
  });

  it('stan z kamieniami technologii przechodzi przez zapis i wczytanie i idzie dalej tak samo', () => {
    const a = wlaczony();
    const b = wlaczony();
    krok(a, etap(3));
    krok(b, etap(3));
    const c = loadGov(saveGov(b));
    expect(z(c).kamienie.technologia).toBe(3);
    krok(a, etap(5));
    krok(c, etap(5));
    expect(JSON.stringify(c)).toBe(JSON.stringify(a));
  });
});

describe('zwycięstwo drogą technologii', () => {
  it('piąty kamień to jeszcze nie zwycięstwo', () => {
    const st = wlaczony();
    krok(st, etap(5));
    expect(kamienie(st)).toBe(5);
    expect(z(st).wygrane).toEqual([]);
    expect(z(st).epilogi).toEqual([]);
    expect(pending(st, etap(5))).toBeNull();
  });

  it('szósty kamień: wygrana z dniem i godziną, epilog w kolejce, okno z pending, „Graj dalej” zdejmuje epilog', () => {
    const st = wlaczony();
    krok(st, etap(5));
    const i = etap(6);
    krok(st, i);
    expect(kamienie(st)).toBe(6);
    expect(z(st).wygrane).toEqual([{ droga: 'technologia', dzien: i.day, godzina: i.hour }]);
    expect(z(st).epilogi).toEqual(['technologia']);
    expect(pending(st, i)).toEqual({ k: 'zwyciestwo', droga: 'technologia' });
    grajDalej(st);
    expect(pending(st, i)).toBeNull();
    // kolejne kroki tego samego odczytu nie wygrywają drugi raz
    for (let n = 0; n < 5; n++) krok(st, i);
    expect(z(st).wygrane).toHaveLength(1);
    expect(z(st).epilogi).toEqual([]);
  });

  it('wszystkie sześć kamieni naraz (stary zapis z gotowym odczytem) też kończy się jednym zwycięstwem', () => {
    const st = wlaczony();
    krok(st, etap(6));
    expect(kamienie(st)).toBe(6);
    expect(st.log).toHaveLength(6);
    expect(z(st).wygrane.map((w) => w.droga)).toEqual(['technologia']);
    expect(z(st).epilogi).toEqual(['technologia']);
  });

  it('po rozbiórce wszystkiego droga zostaje przebyta i nie wygrywa drugi raz', () => {
    const st = wlaczony();
    krok(st, etap(6));
    grajDalej(st);
    krok(st, wej());
    krok(st, bez());
    expect(kamienie(st)).toBe(6);
    expect(z(st).wygrane).toHaveLength(1);
    expect(z(st).epilogi).toEqual([]);
  });

  it('zwycięstwo na żądanie (zrzuty) zalicza komplet sześciu kamieni i kolejkuje epilog technologii', () => {
    const st = newGov(1);
    expect(wygrajDroge(st, 'technologia', 4, 9)).toBe(true);
    expect(z(st).kamienie.technologia).toBe(6);
    expect(z(st).wygrane).toEqual([{ droga: 'technologia', dzien: 4, godzina: 9 }]);
    expect(pending(st, bez())).toEqual({ k: 'zwyciestwo', droga: 'technologia' });
    const d = tech(st, wej());
    expect(d.zaliczone).toBe(6);
    expect([d.wkrotce, d.dalej]).toEqual([null, null]);
  });
});

describe('ocenDrogi dla technologii: „co dalej” i „Wkrótce”', () => {
  it('przy zerze kamieni zdanie o pracowni, bez „Wkrótce”', () => {
    for (const st of [wlaczony(), zKamieniami(0), newGov(1)]) {
      const d = tech(st, wej());
      expect(d.zaliczone).toBe(0);
      expect(d.dalej).toEqual(DALEJ[0]);
      expect(d.wkrotce).toBeNull();
    }
  });

  it('przy jednym kamieniu zdanie o stole pracowni, bez „Wkrótce”', () => {
    const d = tech(zKamieniami(1), wej({ pracownia: true }));
    expect(d.zaliczone).toBe(1);
    expect(d.dalej).toEqual(DALEJ[1]);
    expect(d.wkrotce).toBeNull();
  });

  it('od drugiego kamienia „Wkrótce” o prądzie z projektu gospodarki i żadnego „co dalej”', () => {
    for (let n = 2; n <= 5; n++) {
      const d = tech(zKamieniami(n), wej());
      expect(d.zaliczone, `${n}`).toBe(n);
      expect(d.wkrotce, `${n}`).toEqual(WKROTCE_PRAD);
      expect(d.dalej, `${n}`).toBeNull();
    }
  });

  it('droga przebyta do końca nie ma ani „Wkrótce”, ani „co dalej” (z odczytem badań i bez niego)', () => {
    for (const i of [wej(), bez()]) {
      const d = tech(zKamieniami(6), i);
      expect([d.wkrotce, d.dalej]).toEqual([null, null]);
    }
    // zapisana liczba ponad komplet (zepsuty zapis) też znaczy „przebyta”
    const d = tech(zKamieniami(99), wej());
    expect(d.zaliczone).toBe(6);
    expect([d.wkrotce, d.dalej]).toEqual([null, null]);
  });

  it('bez odczytu badań zostaje dawny „Wkrótce” na każdym etapie, bez „co dalej”', () => {
    for (let n = 0; n <= 5; n++) {
      const d = tech(zKamieniami(n), bez());
      expect(d.wkrotce, `${n}`).toEqual(WKROTCE_BEZ_ODCZYTU);
      expect(d.dalej, `${n}`).toBeNull();
    }
    // stan bez włączonych dróg (stary zapis) też
    expect(tech(newGov(1), bez()).wkrotce).toEqual(WKROTCE_BEZ_ODCZYTU);
  });

  it('o „Wkrótce” rozstrzyga sam odczyt: ten sam stan raz z badaniami, raz bez', () => {
    const st = zKamieniami(0);
    expect(tech(st, wej()).wkrotce).toBeNull();
    expect(tech(st, bez()).wkrotce).toEqual(WKROTCE_BEZ_ODCZYTU);
    z(st).kamienie.technologia = 2;
    expect(tech(st, wej()).wkrotce).toEqual(WKROTCE_PRAD);
    expect(tech(st, bez()).wkrotce).toEqual(WKROTCE_BEZ_ODCZYTU);
  });

  it('„Wkrótce” i „co dalej” nigdy razem, w obu trybach, z odczytem badań i bez', () => {
    for (const mode of ['zwykly', 'zombie'] as const)
      for (const i of [wej(), bez()])
        for (let n = 0; n <= DROGI.technologia.kamienie.length; n++) {
          const d = tech(zKamieniami(n, mode), i);
          expect(d.dalej !== null && d.wkrotce !== null, `${mode} ${n}`).toBe(false);
        }
  });

  it('postęp liczbowy i seria poranków technologii to null', () => {
    for (let n = 0; n <= 6; n++) {
      const d = tech(zKamieniami(n), wej());
      expect(d.postep, `${n}`).toBeNull();
      expect(d.seria, `${n}`).toBeNull();
    }
  });

  it('lista kamieni na ekranie to sześć kamieni drogi, nazwa bez zmian w obu trybach', () => {
    for (const mode of ['zwykly', 'zombie'] as const) {
      const d = tech(zKamieniami(2, mode), wej());
      expect(d.kamienie.map((k) => [k.pl, k.en])).toEqual(KAMIENIE);
      expect(d.nazwa).toEqual({ pl: 'Prąd bez miedzi', en: 'Power without copper' });
    }
  });

  it('po angielsku zdania technologii nie mają polskich liter ani słówek i różnią się od polskich', () => {
    let sprawdzone = 0;
    for (const mode of ['zwykly', 'zombie'] as const)
      for (const i of [wej(), bez()])
        for (let n = 0; n <= 6; n++) {
          const d = tech(zKamieniami(n, mode), i);
          for (const zdanie of [d.dalej, d.wkrotce]) {
            if (!zdanie) continue;
            sprawdzone++;
            expect(zdanie.en, `${mode} ${n}`).not.toMatch(POLSKIE);
            expect(polskieSlowa(zdanie.en), `${mode} ${n}`).toEqual([]);
            expect(zdanie.en, `${mode} ${n}`).not.toBe(zdanie.pl);
          }
        }
    // w każdym trybie: z odczytem 2 zdania „co dalej” i 4 „Wkrótce” (od 2 do 5), bez odczytu 6 „Wkrótce” (od 0 do 5)
    expect(sprawdzone).toBe(2 * (2 + 4 + 6));
  });

  it('jest czysta: nie zmienia ani stanu, ani wejścia', () => {
    const st = zKamieniami(3);
    const i = wej({ pracownia: true, zbadane: 3, era: 3 }, DO_ERY_3);
    const stPrzed = JSON.stringify(st);
    const iPrzed = JSON.stringify(i);
    tech(st, i);
    tech(st, i);
    expect(JSON.stringify(st)).toBe(stPrzed);
    expect(JSON.stringify(i)).toBe(iPrzed);
  });
});

describe('epilog technologii (epilogSheet)', () => {
  const STATY: StatyEpilogu = { dzien: 12, ludzi: 130, zmarli: 3, uchwaly: 2 };
  const wszystko = (s: Sheet) => `${s.kicker} ${s.title} ${s.body} ${s.foot}`;
  /** pierwszy akapit okna (tekst drogi) razem z otwierającym znacznikiem, bez zamykającego */
  const pierwszyAkapit = (s: Sheet) => s.body.split('</p>')[0];

  it('w zwykłej grze bioroboty i superserwer, po polsku i po angielsku, dosłownie', () => {
    expect(epilogSheet('technologia', null, 'zwykly', STATY).body).toContain(
      `<p class="zw-opowiesc">${EPILOG.zwykly.pl}</p>`,
    );
    ustawJezyk('en');
    expect(epilogSheet('technologia', null, 'zwykly', STATY).body).toContain(
      `<p class="zw-opowiesc">${EPILOG.zwykly.en}</p>`,
    );
  });

  it('w trybie zombie humanoidalni żołnierze i superserwer, po polsku i po angielsku, dosłownie', () => {
    expect(epilogSheet('technologia', null, 'zombie', STATY).body).toContain(
      `<p class="zw-opowiesc">${EPILOG.zombie.pl}</p>`,
    );
    ustawJezyk('en');
    expect(epilogSheet('technologia', null, 'zombie', STATY).body).toContain(
      `<p class="zw-opowiesc">${EPILOG.zombie.en}</p>`,
    );
  });

  it('każdy tryb ma tylko swoje zdanie, a tekst nie jest zastępczym „przebyta do końca”', () => {
    for (const lang of ['pl', 'en'] as const) {
      ustawJezyk(lang);
      const zwykly = epilogSheet('technologia', null, 'zwykly', STATY).body;
      const zombie = epilogSheet('technologia', null, 'zombie', STATY).body;
      expect(zwykly, lang).toContain(EPILOG.zwykly[lang]);
      expect(zwykly, lang).not.toContain(EPILOG.zombie[lang]);
      expect(zombie, lang).toContain(EPILOG.zombie[lang]);
      expect(zombie, lang).not.toContain(EPILOG.zwykly[lang]);
      for (const body of [zwykly, zombie]) {
        expect(body, lang).not.toMatch(/przebyta do końca|is complete/);
        // własny tekst drogi, bez zdań o ludności
        expect(body, lang).not.toMatch(/Mieszka tu|live here now|lives here now/);
      }
    }
  });

  it('tytuł to nazwa drogi, a zdanie ścieżki, cztery liczby i oba przyciski zostają jak przy innych drogach', () => {
    const s = epilogSheet('technologia', 'tech', 'zwykly', STATY);
    expect(s.kicker).toBe('Zwycięstwo');
    expect(s.title).toBe('Prąd bez miedzi');
    expect(s.tone).toBe('zwyciestwo');
    expect(s.body).toContain(EPILOG.zwykly.pl);
    expect(s.body).toContain('Model z dysków banku układa grafiki co do minuty.');
    expect(s.body).toContain('Dzień 12');
    expect(s.body).toContain('Ludzi: 130');
    expect(s.foot).toContain('data-act="zw-dalej"');
    expect(s.foot).toContain('data-act="zw-nowa"');
    expect(s.closable).toBeFalsy();
    // zdanie drogi stoi przed zdaniem ścieżki
    expect(s.body.indexOf(EPILOG.zwykly.pl)).toBeLessThan(s.body.indexOf('Model z dysków banku'));
    ustawJezyk('en');
    expect(epilogSheet('technologia', null, 'zombie', STATY).title).toBe('Power without copper');
  });

  it('po angielsku całe okno bez polskich liter i słówek, w obu trybach', () => {
    ustawJezyk('en');
    for (const mode of ['zwykly', 'zombie'] as const)
      for (const path of ['porzadek', 'wspolnota', 'tech', null] as const) {
        const s = epilogSheet('technologia', path, mode, STATY);
        expect(s.body, `${mode} ${path}`).toContain(EPILOG[mode].en);
        expect(wszystko(s), `${mode} ${path}`).not.toMatch(POLSKIE);
        expect(polskieSlowa(wszystko(s)), `${mode} ${path}`).toEqual([]);
      }
  });

  it('pierwszy akapit okna to samo zdanie drogi i nic więcej', () => {
    for (const mode of ['zwykly', 'zombie'] as const)
      expect(pierwszyAkapit(epilogSheet('technologia', null, mode, STATY))).toBe(
        `<p class="zw-opowiesc">${EPILOG[mode].pl}`,
      );
  });

  it('inne drogi dalej mają tekst zastępczy albo własny, niezależnie od trybu', () => {
    expect(epilogSheet('teren', null, 'zombie', STATY).body).toContain('Droga „Za Murem” przebyta do końca.');
    expect(epilogSheet('cuda', null, 'zwykly', STATY).body).toContain('Droga „Cuda” przebyta do końca.');
    expect(epilogSheet('ludnosc', null, 'zombie', STATY).body).toContain('Mieszka tu 130 osób');
  });
});

describe('odczyt z prawdziwej symulacji (Przymorze z dema)', () => {
  const d = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../public/demo/przymorze.json'), 'utf8'));
  const seed = Number.parseInt(hashString(d.addr), 16) || 2051;
  const w = buildWorld(d.geo, { seed, street: d.street });

  /** pracownia postawiona od razu (jak po finishBuild) w pierwszym miejscu, które canPlace przepuszcza */
  function postawPracownie(st: SimState): Thing {
    const i = allowedAnchors(st, w, 'pracownia', 0)[0];
    if (i === undefined) throw new Error('nie ma miejsca na pracownię');
    const f = footprint('pracownia', 0);
    const t: Thing = {
      id: st.nextThing++,
      kind: 'pracownia',
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

  it('od świeżej gry do generatora: kamienie z govInput, a fabryki gra etapu 1 nie uruchamia (zwycięstwa nie ma)', () => {
    for (const mode of ['zwykly', 'zombie'] as const) {
      const st = createSim(w, seed, { core: 4, mode });
      const sim = new Sim(w, st);
      const gov = wlaczony(mode);
      const idz = () => {
        const i = govInput(st, w, 0);
        krok(gov, i);
        return i;
      };

      // świeża gra: odczyt jest, kamieni nie ma, ekran mówi, że trzeba postawić pracownię (etap 2 dołoży do odczytu
      // z symulacji pole `fabryka`, a wtedy zmieni się ten wzorzec i sprawdzenie niżej, że pola jeszcze nie ma)
      let i = idz();
      expect(i.badania, mode).toEqual(BEZ_BADAN);
      expect(kamienie(gov), mode).toBe(0);
      expect(tech(gov, i).dalej, mode).toEqual(DALEJ[0]);
      expect(tech(gov, i).wkrotce, mode).toBeNull();

      // pracownia stoi: pierwszy kamień, ekran mówi o stole pracowni
      postawPracownie(st);
      i = idz();
      expect(kamienie(gov), mode).toBe(1);
      expect(tech(gov, i).dalej, mode).toEqual(DALEJ[1]);

      // pierwsze badanie: drugi kamień, od teraz „Wkrótce” o prądzie
      st.techDone = ['t_okna'];
      i = idz();
      expect(kamienie(gov), mode).toBe(2);
      expect(tech(gov, i).wkrotce, mode).toEqual(WKROTCE_PRAD);
      expect(tech(gov, i).dalej, mode).toBeNull();

      // era 3 (ery 3–6 gracz dziś nie zbada, więc stan wpisany wprost)
      st.techDone = [...DO_ERY_3];
      i = idz();
      expect(i.badania?.era, mode).toBe(3);
      expect(kamienie(gov), mode).toBe(3);

      // sieć zbadana, ale jeszcze nie włączona: nadal trzeci kamień; po poleceniu `siec` w pracowni czwarty
      st.techDone = [...DO_SIECI];
      i = idz();
      expect(i.badania?.siecWlaczona, mode).toBe(false);
      expect(kamienie(gov), mode).toBe(3);
      sim.push({ t: 'siec', ids: [] });
      sim.step();
      i = idz();
      expect(i.badania?.siecWlaczona, mode).toBe(true);
      expect(kamienie(gov), mode).toBe(4);

      // generator fuzji w techDone: piąty kamień
      st.techDone = [...DO_GENERATORA];
      i = idz();
      expect(i.techDone, mode).toContain('t_fuzja');
      expect(kamienie(gov), mode).toBe(5);

      // fabryka bieżącego trybu zbadana (`koncowa`), ale odczyt nie zna jeszcze uruchomionej fabryki (etap 2): bez
      // szóstego kamienia, bez zwycięstwa i bez epilogu
      st.techDone = [...DO_GENERATORA, mode === 'zombie' ? 't_fabryka_hum' : 't_fabryka_bio'];
      i = idz();
      expect(i.badania?.koncowa, mode).toBe(true);
      expect(i.badania && 'fabryka' in i.badania, mode).toBe(false);
      expect(kamienie(gov), mode).toBe(5);
      expect(z(gov).wygrane, mode).toEqual([]);
      expect(z(gov).epilogi, mode).toEqual([]);
    }
  });
});
