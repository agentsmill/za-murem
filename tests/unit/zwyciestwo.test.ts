/* Warunki zwycięstwa, etap 1 (src/gov/zwyciestwo.ts): pięć dróg i ich kamienie milowe, droga ludnościowa (cel to
   połowa ludności z 2021 roku, utrzymany przez 7 poranków bez głodu przy zaufaniu co najmniej 50, z wpisem w kronice,
   gdy seria pęka), kamień terenu, zdanie „co dalej” i seria poranków w `ocenDrogi`, kolejka epilogów (FIFO, także ze
   starego kształtu stanu z jednym polem `epilog`) w `pending` i „Graj dalej”. Czyste funkcje na wejściu z atrapy
   symulacji (tests/unit/gov-atrapa.ts), bez symulacji i bez sieci. Moduł jest opcją: bez `wlaczZwyciestwo` stan
   i skróty zarządu zostają jak przed nim. */

import { describe, expect, it } from 'vitest';
import { hashString } from '../../src/core/rng.ts';
import type { GameMode, GovInput, GovState, NightReport } from '../../src/gov/typy.ts';
import { emptyEffects, zeroStock } from '../../src/gov/wspolne.ts';
import { ackReport, govUpdate, loadGov, newGov, pending, saveGov } from '../../src/gov/zarzad.ts';
import {
  celLudnosci,
  DROGI,
  type Droga,
  grajDalej,
  krokZwyciestwa,
  ludnoscOf,
  nazwaDrogi,
  ocenDrogi,
  wlaczZwyciestwo,
  wygrajDroge,
} from '../../src/gov/zwyciestwo.ts';
import { Atrapa, at, run, TPH, TPS } from './gov-atrapa.ts';
import { polskieSlowa } from './po-angielsku.ts';

const DROGI_PO_KOLEI: Droga[] = ['technologia', 'teren', 'lek', 'ludnosc', 'cuda'];
const POLSKIE_LITERY = /[ąćęłńóśźż]/i;
const CEL = 250;

/** wejście z atrapy (cztery osoby i czterech mieszkańców, dzień 1, 15:00) z nadpisanymi polami */
const wej = (over: Partial<GovInput> = {}): GovInput => ({ ...new Atrapa(1).input(), ...over });
/** poranek (6:00) danego dnia */
const rano = (dzien: number, over: Partial<GovInput> = {}): GovInput =>
  wej({ day: dzien, hour: 6, minute: 0, ...over });

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

/** to samo wejście, ale pierwsza osoba z zarządu ma tyle jedzenia */
function zJedzeniem(i: GovInput, food: number): GovInput {
  return { ...i, people: i.people.map((p, k) => (k === 0 ? { ...p, needs: { ...p.needs, food } } : p)) };
}

const teksty = (st: GovState) => st.log.map((l) => l.txt.pl);
const z = (st: GovState) => st.zwyciestwo!;

describe('celLudnosci', () => {
  it('bez danych z 2021 roku cel to 250, z danymi połowa ludności w przedziale 120–500', () => {
    expect(celLudnosci({}, 'zwykly')).toBe(250);
    expect(celLudnosci({ ludnosc2021: 1000 }, 'zwykly')).toBe(500);
    expect(celLudnosci({ ludnosc2021: 100 }, 'zwykly')).toBe(120);
    expect(celLudnosci({ ludnosc2021: 600 }, 'zwykly')).toBe(300);
    // granice przedziału
    expect(celLudnosci({ ludnosc2021: 240 }, 'zwykly')).toBe(120);
    expect(celLudnosci({ ludnosc2021: 241 }, 'zwykly')).toBe(121);
    expect(celLudnosci({ ludnosc2021: 2000 }, 'zwykly')).toBe(500);
  });

  it('w trybie zombie to połowa celu po przycięciu', () => {
    expect(celLudnosci({}, 'zombie')).toBe(125);
    expect(celLudnosci({ ludnosc2021: 100 }, 'zombie')).toBe(60);
    expect(celLudnosci({ ludnosc2021: 600 }, 'zombie')).toBe(150);
    expect(celLudnosci({ ludnosc2021: 5000 }, 'zombie')).toBe(250);
  });

  it('zero, liczba ujemna, NaN i nieskończoność dają cel jak bez danych', () => {
    for (const n of [0, -1, -500, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(celLudnosci({ ludnosc2021: n }, 'zwykly')).toBe(250);
      expect(celLudnosci({ ludnosc2021: n }, 'zombie')).toBe(125);
    }
    expect(celLudnosci({ ludnosc2021: undefined }, 'zwykly')).toBe(250);
  });

  it('żadna liczba nie daje 0, NaN ani celu poza przedziałem (zwykły 120–500, zombie 60–250)', () => {
    const proby = [Number.MIN_VALUE, 1e-9, 0.4, 1, 2, 119, 239, 240, 241, 999, 1000, 1001, 1e6, 1e15, Number.MAX_VALUE];
    for (let n = 1; n <= 1400; n += 7) proby.push(n);
    for (const n of proby) {
      const zwykly = celLudnosci({ ludnosc2021: n }, 'zwykly');
      const zombie = celLudnosci({ ludnosc2021: n }, 'zombie');
      expect(Number.isInteger(zwykly), `${n}`).toBe(true);
      expect(Number.isInteger(zombie), `${n}`).toBe(true);
      expect(zwykly, `${n}`).toBeGreaterThanOrEqual(120);
      expect(zwykly, `${n}`).toBeLessThanOrEqual(500);
      expect(zombie, `${n}`).toBeGreaterThanOrEqual(60);
      expect(zombie, `${n}`).toBeLessThanOrEqual(250);
    }
  });
});

describe('ludnoscOf', () => {
  it('bez pola to zarząd plus mieszkańcy, z polem to pole', () => {
    const i = wej();
    expect(i.people).toHaveLength(4);
    expect(i.residents).toBe(4);
    expect(ludnoscOf(i)).toBe(8);
    expect(ludnoscOf({ ...i, residents: undefined })).toBe(4);
    expect(ludnoscOf({ ...i, ludnosc: 31 })).toBe(31);
    expect(ludnoscOf({ ...i, ludnosc: 0 })).toBe(0);
  });

  it('pole bez sensu (NaN) nie psuje liczenia', () => {
    expect(ludnoscOf(wej({ ludnosc: Number.NaN }))).toBe(8);
  });
});

describe('ocenDrogi', () => {
  it('bez stanu zwycięstwa pięć dróg w stałej kolejności, żadnej nie zaliczono', () => {
    const st = newGov(1);
    const d = ocenDrogi(st, wej());
    expect(d.map((x) => x.droga)).toEqual(DROGI_PO_KOLEI);
    expect(d.every((x) => x.zaliczone === 0)).toBe(true);
    expect(st.zwyciestwo).toBeUndefined();
  });

  it('technologia, lek i cuda mówią „wkrótce”, ludność ma postęp z celem, reszta bez postępu', () => {
    const d = ocenDrogi(newGov(1), wej({ ludnosc: 40 }));
    const po = (droga: Droga) => d.find((x) => x.droga === droga)!;
    for (const droga of ['technologia', 'lek', 'cuda'] as const) {
      expect(po(droga).wkrotce, droga).not.toBeNull();
      expect(po(droga).wkrotce!.pl, droga).toMatch(/^Wkrótce: /);
      expect(po(droga).wkrotce!.en, droga).toMatch(/^Coming soon: /);
      expect(po(droga).postep, droga).toBeNull();
    }
    expect(po('ludnosc').wkrotce).toBeNull();
    expect(po('ludnosc').postep).toEqual({ ile: 40, cel: 250 });
    expect(po('teren').postep).toBeNull();
  });

  it('droga przebyta do końca nie ma już „wkrótce”: reguła mieszka w logice, nie w oknie', () => {
    const st = wlaczony();
    const po = (droga: Droga) => ocenDrogi(st, wej()).find((x) => x.droga === droga)!;
    // komplet kamieni każdej drogi: ani jedna nie mówi „wkrótce”
    Object.assign(z(st).kamienie, { technologia: 5, teren: 5, lek: 5, ludnosc: 5, cuda: 3 });
    for (const d of ocenDrogi(st, wej())) expect(d.wkrotce, d.droga).toBeNull();
    // o jeden kamień mniej: zdanie wraca z dokładnym tekstem, także na terenie, który ma je od pierwszego kamienia
    Object.assign(z(st).kamienie, { technologia: 4, teren: 4, lek: 4, cuda: 2 });
    expect(po('technologia').wkrotce?.pl).toBe('Wkrótce: badania w pracowni i sieć bez miedzi.');
    expect(po('teren').wkrotce?.pl).toBe('Wkrótce: sąsiednie kwadraty i mur.');
    expect(po('lek').wkrotce?.pl).toBe('Wkrótce: dalekie wyprawy po lek.');
    expect(po('cuda').wkrotce?.en).toBe('Coming soon: wonders from late research.');
    // zapisana liczba ponad komplet (zepsuty zapis) też znaczy „przebyta”
    Object.assign(z(st).kamienie, { cuda: 99 });
    expect(po('cuda').zaliczone).toBe(3);
    expect(po('cuda').wkrotce).toBeNull();
  });

  it('postęp ludności bierze cel z danych 2021 i z trybu gry', () => {
    const ludnosc = (st: GovState, i: GovInput) => ocenDrogi(st, i).find((x) => x.droga === 'ludnosc')!.postep;
    expect(ludnosc(newGov(1), wej({ ludnosc: 40, ludnosc2021: 1000 }))).toEqual({ ile: 40, cel: 500 });
    expect(ludnosc(newGov(1, 'zombie'), wej({ ludnosc: 40 }))).toEqual({ ile: 40, cel: 125 });
    // bez pola `ludnosc` ludność to zarząd i mieszkańcy
    expect(ludnosc(newGov(1), wej())).toEqual({ ile: 8, cel: 250 });
  });

  it('nazwy, kamienie i „wkrótce” dokładnie według tabeli tekstów, w obu językach', () => {
    const d = ocenDrogi(newGov(1), wej());
    const tabela: Record<Droga, { nazwa: [string, string]; kamienie: [string, string][] }> = {
      technologia: {
        nazwa: ['Prąd bez miedzi', 'Power without copper'],
        kamienie: [
          ['Pracownia postawiona', 'Research room built'],
          ['Pierwsze badanie', 'First research'],
          ['Era 3', 'Era 3'],
          ['Era 5', 'Era 5'],
          ['Sieć bez miedzi', 'Copper-free grid'],
        ],
      },
      teren: {
        nazwa: ['Za Murem', 'Za Murem'],
        kamienie: [
          ['Pierwszy sąsiad za płotem', 'First neighbour behind the fence'],
          ['Kwadrat domu za obwodem', 'Home square enclosed'],
          ['Pierwszy sąsiedni kwadrat', 'First neighbouring square'],
          ['Pięć kwadratów', 'Five squares'],
          ['Dziewięć kwadratów za murem', 'Nine squares behind the wall'],
        ],
      },
      lek: {
        nazwa: ['Wyłącznik z pakietu premium', 'The premium-tier kill switch'],
        kamienie: [
          ['Trop', 'A lead'],
          ['Pierwsza wyprawa daleka', 'First long run'],
          ['Laboratorium w mieście wojewódzkim', 'The lab in the regional capital'],
          ['Warszawa', 'Warsaw'],
          ['Lek w domu', 'The cure at home'],
        ],
      },
      ludnosc: {
        nazwa: ['Nowe osiedle', 'A new estate'],
        kamienie: [
          ['10 osób', '10 people'],
          ['25 osób', '25 people'],
          ['50 osób', '50 people'],
          ['Połowa celu', 'Halfway there'],
          ['Cel przez 7 dni', 'Target held for 7 days'],
        ],
      },
      cuda: {
        nazwa: ['Cuda', 'Wonders'],
        kamienie: [
          ['Pierwszy cud', 'First wonder'],
          ['Drugi cud', 'Second wonder'],
          ['Trzeci cud', 'Third wonder'],
        ],
      },
    };
    for (const droga of DROGI_PO_KOLEI) {
      const wpis = d.find((x) => x.droga === droga)!;
      expect([wpis.nazwa.pl, wpis.nazwa.en], droga).toEqual(tabela[droga].nazwa);
      expect(
        wpis.kamienie.map((k) => [k.pl, k.en]),
        droga,
      ).toEqual(tabela[droga].kamienie);
    }
    const wkrotce = (droga: Droga) => d.find((x) => x.droga === droga)!.wkrotce;
    expect(wkrotce('technologia')).toEqual({
      pl: 'Wkrótce: badania w pracowni i sieć bez miedzi.',
      en: 'Coming soon: research and a copper-free grid.',
    });
    expect(wkrotce('lek')).toEqual({
      pl: 'Wkrótce: dalekie wyprawy po lek.',
      en: 'Coming soon: long runs for the cure.',
    });
    expect(wkrotce('cuda')).toEqual({
      pl: 'Wkrótce: cuda z późnych badań.',
      en: 'Coming soon: wonders from late research.',
    });
  });

  it('droga leku w trybie zombie nazywa się „Lek”, DROGI i nazwaDrogi się zgadzają', () => {
    const lek = (st: GovState) => ocenDrogi(st, wej()).find((x) => x.droga === 'lek')!.nazwa;
    expect(lek(newGov(1, 'zombie'))).toEqual({ pl: 'Lek', en: 'The cure' });
    expect(lek(newGov(1))).toEqual({ pl: 'Wyłącznik z pakietu premium', en: 'The premium-tier kill switch' });
    // stary zapis bez trybu to zwykła gra
    const stary = newGov(1);
    delete stary.mode;
    expect(lek(stary).pl).toBe('Wyłącznik z pakietu premium');
    expect(nazwaDrogi('lek', 'zombie')).toEqual({ pl: 'Lek', en: 'The cure' });
    expect(nazwaDrogi('ludnosc', 'zombie')).toEqual(DROGI.ludnosc.nazwa);
  });

  it('po angielsku nie ma polskich liter w żadnym napisie dróg', () => {
    for (const mode of ['zwykly', 'zombie'] as const)
      for (const wpis of ocenDrogi(newGov(1, mode), wej())) {
        expect(wpis.nazwa.en).not.toMatch(POLSKIE_LITERY);
        for (const k of wpis.kamienie) expect(k.en).not.toMatch(POLSKIE_LITERY);
        if (wpis.wkrotce) expect(wpis.wkrotce.en).not.toMatch(POLSKIE_LITERY);
      }
  });

  it('jest czysta: nie zmienia ani stanu, ani wejścia, i nie losuje', () => {
    const st = wlaczony();
    krok(st, wej({ ludnosc: 60 }));
    const i = wej({ ludnosc: 60, teren: { przylaczone: 2 } });
    const stPrzed = JSON.stringify(st);
    const iPrzed = JSON.stringify(i);
    ocenDrogi(st, i);
    ocenDrogi(st, i);
    expect(JSON.stringify(st)).toBe(stPrzed);
    expect(JSON.stringify(i)).toBe(iPrzed);
  });

  it('zaliczone to kamienie zapisane w stanie, nie chwilowy odczyt (ludność spadła, kamienie zostały)', () => {
    const st = wlaczony();
    const po = (droga: Droga, i: GovInput) => ocenDrogi(st, i).find((x) => x.droga === droga)!.zaliczone;
    expect(po('ludnosc', wej({ ludnosc: 60 }))).toBe(0);
    krok(st, wej({ ludnosc: 60 }));
    expect(po('ludnosc', wej({ ludnosc: 60 }))).toBe(3);
    expect(po('ludnosc', wej({ ludnosc: 5 }))).toBe(3);
  });
});

describe('„co dalej” i seria poranków w ocenDrogi', () => {
  const po = (st: GovState, i: GovInput, droga: Droga) => ocenDrogi(st, i).find((x) => x.droga === droga)!;
  /** stan z włączonymi drogami, `n` zaliczonymi kamieniami ludności i `dni` porankami celu */
  const zKamieniami = (n: number, dni = 0, mode: GameMode = 'zwykly'): GovState => {
    const st = wlaczony(mode);
    z(st).kamienie.ludnosc = n;
    z(st).dniCelu = dni;
    return st;
  };
  const seriaWpis = (l: { txt: { pl: string } }) => l.txt.pl.startsWith('Seria poranków');

  it('ludność: zdanie „zbierzcie N osób” z progiem następnego kamienia, po polsku i po angielsku', () => {
    const progi = [10, 25, 50, 125];
    progi.forEach((prog, n) => {
      expect(po(zKamieniami(n), wej(), 'ludnosc').dalej, `${n} kamieni`).toEqual({
        pl: `Zbierzcie ${prog} osób pod zarządem.`,
        en: `Get ${prog} people under the board.`,
      });
    });
  });

  it('próg czwartego kamienia idzie za celem: z zapisanego celu, z danych 2021 i z trybu zombie', () => {
    const zapisany = zKamieniami(3);
    z(zapisany).cel = 500;
    expect(po(zapisany, wej(), 'ludnosc').dalej?.pl).toBe('Zbierzcie 250 osób pod zarządem.');
    // zapisany cel wygrywa z bieżącym odczytem
    expect(po(zapisany, wej({ ludnosc2021: 100 }), 'ludnosc').dalej?.pl).toBe('Zbierzcie 250 osób pod zarządem.');
    // bez zapisanego celu cel z bieżących danych
    expect(po(zKamieniami(3), wej({ ludnosc2021: 1000 }), 'ludnosc').dalej?.pl).toBe(
      'Zbierzcie 250 osób pod zarządem.',
    );
    expect(po(zKamieniami(3), wej({ ludnosc2021: 100 }), 'ludnosc').dalej?.pl).toBe('Zbierzcie 60 osób pod zarządem.');
    // zombie: cel 125, połowa w górę to 63
    expect(po(zKamieniami(3, 0, 'zombie'), wej(), 'ludnosc').dalej?.en).toBe('Get 63 people under the board.');
  });

  it('polska liczba mnoga przy progu: „62 osoby”, „65 osób”, „112 osób”, „121 osób”', () => {
    // ludnosc2021 → cel (połowa, 120–500) → próg czwartego kamienia (połowa celu w górę)
    const przypadki: [number, string][] = [
      [240, '60 osób'],
      [246, '62 osoby'],
      [250, '63 osoby'],
      [256, '64 osoby'],
      [260, '65 osób'],
      [448, '112 osób'],
      [482, '121 osób'],
      [1000, '250 osób'],
    ];
    for (const [spis, forma] of przypadki)
      expect(po(zKamieniami(3), wej({ ludnosc2021: spis }), 'ludnosc').dalej?.pl, `spis ${spis}`).toBe(
        `Zbierzcie ${forma} pod zarządem.`,
      );
    // ten sam próg po angielsku jest zawsze „people”
    expect(po(zKamieniami(3), wej({ ludnosc2021: 246 }), 'ludnosc').dalej?.en).toBe('Get 62 people under the board.');
  });

  it('ostatni otwarty kamień ludności: dokładnie zdanie o siedmiu porankach z licznikiem {n} z 7', () => {
    for (const n of [0, 1, 3, 6])
      expect(po(zKamieniami(4, n), wej(), 'ludnosc').dalej, `${n} poranków`).toEqual({
        pl: `Utrzymajcie cel 7 poranków z rzędu: o 6:00 nikt z zarządu nie jest głodny, a zaufanie wynosi co najmniej 50 (${n} z 7).`,
        en: `Hold the target for 7 mornings in a row: at 6:00 nobody on the board is hungry and trust is at least 50 (${n} of 7).`,
      });
  });

  it('ludność przebyta do końca nie ma zdania „co dalej”', () => {
    expect(po(zKamieniami(5, 7), wej(), 'ludnosc').dalej).toBeNull();
    // zapisana liczba ponad komplet (zepsuty zapis) też znaczy „przebyta”
    expect(po(zKamieniami(99, 7), wej(), 'ludnosc').dalej).toBeNull();
  });

  it('teren: przed pierwszym kamieniem zdanie o płocie, potem „Wkrótce” i brak zdania', () => {
    const st = wlaczony();
    expect(po(st, wej(), 'teren').dalej).toEqual({
      pl: 'Otoczcie wspólnym płotem pierwszy sąsiedni budynek.',
      en: 'Put a shared fence round the first building next door.',
    });
    expect(po(st, wej(), 'teren').wkrotce).toBeNull();
    for (const n of [1, 2, 3, 4]) {
      z(st).kamienie.teren = n;
      expect(po(st, wej(), 'teren').dalej, `${n} kamieni`).toBeNull();
      expect(po(st, wej(), 'teren').wkrotce, `${n} kamieni`).not.toBeNull();
    }
    z(st).kamienie.teren = 5;
    expect(po(st, wej(), 'teren').dalej).toBeNull();
  });

  it('technologia, lek i cuda nie mają zdania na żadnym etapie: czekają na projekty („Wkrótce”)', () => {
    for (const mode of ['zwykly', 'zombie'] as const)
      for (const droga of ['technologia', 'lek', 'cuda'] as const)
        for (let n = 0; n <= DROGI[droga].kamienie.length; n++) {
          const st = wlaczony(mode);
          z(st).kamienie[droga] = n;
          expect(po(st, wej(), droga).dalej, `${droga} ${n} ${mode}`).toBeNull();
        }
  });

  it('zdanie „co dalej” i „Wkrótce” nigdy razem, a przebyta droga nie ma żadnego', () => {
    for (const mode of ['zwykly', 'zombie'] as const)
      for (const droga of DROGI_PO_KOLEI)
        for (let n = 0; n <= DROGI[droga].kamienie.length; n++) {
          const st = wlaczony(mode);
          z(st).kamienie[droga] = n;
          const d = po(st, wej(), droga);
          expect(d.dalej !== null && d.wkrotce !== null, `${droga} ${n}`).toBe(false);
          if (n === DROGI[droga].kamienie.length) expect([d.dalej, d.wkrotce], `${droga} ${n}`).toEqual([null, null]);
        }
  });

  it('bez stanu zwycięstwa (stary stan) też: pierwsze zdania i seria od zera', () => {
    const st = newGov(1);
    expect(po(st, wej(), 'ludnosc').dalej?.pl).toBe('Zbierzcie 10 osób pod zarządem.');
    expect(po(st, wej(), 'teren').dalej?.pl).toBe('Otoczcie wspólnym płotem pierwszy sąsiedni budynek.');
    expect(po(st, wej(), 'ludnosc').seria).toEqual({ dni: 0, z: 7 });
    expect(st.zwyciestwo).toBeUndefined();
  });

  it('seria to licznik poranków celu tylko przy drodze ludnościowej, reszta ma null', () => {
    const st = wlaczony();
    for (const d of ocenDrogi(st, wej()))
      expect(d.seria, d.droga).toEqual(d.droga === 'ludnosc' ? { dni: 0, z: 7 } : null);
    for (let d = 1; d <= 3; d++) krok(st, rano(d, { ludnosc: CEL }));
    expect(po(st, wej(), 'ludnosc').seria).toEqual({ dni: 3, z: 7 });
    expect(po(st, wej(), 'teren').seria).toBeNull();
    // przerwana seria wraca do zera
    krok(st, rano(4, zJedzeniem(rano(4, { ludnosc: CEL }), 3)));
    expect(po(st, wej(), 'ludnosc').seria).toEqual({ dni: 0, z: 7 });
  });

  it('zdanie ostatniego kamienia i seria liczą to samo, a po siódmym poranku licznik stoi na 7', () => {
    const st = wlaczony();
    for (let d = 1; d <= 3; d++) krok(st, rano(d, { ludnosc: CEL }));
    const lud = po(st, wej(), 'ludnosc');
    expect(lud.zaliczone).toBe(4);
    expect(lud.seria).toEqual({ dni: 3, z: 7 });
    expect(lud.dalej?.pl).toContain('(3 z 7).');
    expect(lud.dalej?.en).toContain('(3 of 7).');
    for (let d = 4; d <= 7; d++) krok(st, rano(d, { ludnosc: CEL }));
    const wygrana = po(st, wej(), 'ludnosc');
    expect(wygrana.dalej).toBeNull();
    expect(wygrana.seria).toEqual({ dni: 7, z: 7 });
  });

  it('po angielsku zdania „co dalej” nie mają polskich liter ani słówek, na każdym etapie', () => {
    let sprawdzone = 0;
    for (const mode of ['zwykly', 'zombie'] as const)
      for (const droga of ['teren', 'ludnosc'] as const)
        for (let n = 0; n < DROGI[droga].kamienie.length; n++) {
          const st = wlaczony(mode);
          z(st).kamienie[droga] = n;
          z(st).dniCelu = 4;
          const dalej = po(st, wej({ ludnosc2021: 246 }), droga).dalej;
          if (!dalej) continue;
          sprawdzone++;
          expect(dalej.en, `${droga} ${n}`).not.toMatch(POLSKIE_LITERY);
          expect(polskieSlowa(dalej.en), `${droga} ${n}`).toEqual([]);
          expect(dalej.en, `${droga} ${n}`).not.toBe(dalej.pl);
        }
    // w każdym z dwóch trybów: teren jedno zdanie (przed pierwszym kamieniem), ludność pięć (cztery progi i seria)
    expect(sprawdzone).toBe(2 * (1 + 5));
  });

  it('seria poranków zeruje się z wpisem w kronice: jedno zdanie z długością serii, bez wielkiej czcionki', () => {
    const st = wlaczony();
    // seria od zera, która nie ruszyła, nic nie przerywa
    krok(st, rano(1, { ludnosc: CEL - 1 }));
    krok(st, rano(2, { ludnosc: CEL - 1 }));
    expect(st.log.filter(seriaWpis)).toEqual([]);
    for (let d = 3; d <= 5; d++) krok(st, rano(d, { ludnosc: CEL }));
    expect(z(st).dniCelu).toBe(3);
    expect(st.log.filter(seriaWpis)).toEqual([]);
    const fx = krok(st, rano(6, zJedzeniem(rano(6, { ludnosc: CEL }), 3)));
    expect(z(st).dniCelu).toBe(0);
    const wpisy = st.log.filter(seriaWpis);
    expect(wpisy).toHaveLength(1);
    expect(wpisy[0].txt).toEqual({
      pl: 'Seria poranków do celu przerwana po 3 z 7.',
      en: 'The run of mornings towards the target broke after 3 of 7.',
    });
    expect(wpisy[0].big).toBe(false);
    expect(wpisy[0].day).toBe(6);
    expect(wpisy[0].clock).toBe('06:00');
    expect(fx.log).toContainEqual(wpisy[0].txt);
    // seria znów od zera, więc kolejne nieudane poranki nic nie dopisują
    krok(st, rano(7, { ludnosc: CEL - 1 }));
    krok(st, rano(8, zJedzeniem(rano(8, { ludnosc: CEL }), 3)));
    expect(st.log.filter(seriaWpis)).toHaveLength(1);
  });

  it('każda przyczyna przerwania serii dopisuje wpis: za mało ludzi, głód, zaufanie poniżej 50', () => {
    const wpisy = (przerwij: (st: GovState, d: number) => GovInput) => {
      const st = wlaczony();
      st.trust = 60;
      krok(st, rano(1, { ludnosc: CEL }));
      krok(st, rano(2, { ludnosc: CEL }));
      krok(st, przerwij(st, 3));
      return st.log.filter(seriaWpis).map((l) => l.txt.pl);
    };
    const oczekiwany = ['Seria poranków do celu przerwana po 2 z 7.'];
    expect(wpisy((_st, d) => rano(d, { ludnosc: CEL - 1 }))).toEqual(oczekiwany);
    expect(wpisy((_st, d) => zJedzeniem(rano(d, { ludnosc: CEL }), 24))).toEqual(oczekiwany);
    expect(
      wpisy((st, d) => {
        st.trust = 49;
        return rano(d, { ludnosc: CEL });
      }),
    ).toEqual(oczekiwany);
    // kontrola: bez przerwania nie ma wpisu
    expect(wpisy((_st, d) => rano(d, { ludnosc: CEL }))).toEqual([]);
  });

  it('po zwycięstwie licznik stoi i nic nie mówi o przerwaniu serii', () => {
    const st = wlaczony();
    for (let d = 1; d <= 7; d++) krok(st, rano(d, { ludnosc: CEL }));
    const wpisy = st.log.length;
    krok(st, rano(8, zJedzeniem(rano(8, { ludnosc: CEL }), 3)));
    krok(st, rano(9, { ludnosc: 5 }));
    expect(st.log).toHaveLength(wpisy);
    expect(st.log.filter(seriaWpis)).toEqual([]);
    expect(z(st).dniCelu).toBe(7);
  });

  it('wpis o przerwaniu nie rusza zaufania, wkurzenia, zapasów ani ziarna', () => {
    const st = wlaczony();
    for (let d = 1; d <= 3; d++) krok(st, rano(d, { ludnosc: CEL }));
    const bez = (s: GovState) => {
      const kopia = JSON.parse(JSON.stringify(s));
      delete kopia.zwyciestwo;
      delete kopia.log;
      return kopia;
    };
    const przed = bez(st);
    const fx = krok(st, rano(4, zJedzeniem(rano(4, { ludnosc: CEL }), 3)));
    expect(bez(st)).toEqual(przed);
    expect(fx).toEqual({ ...emptyEffects(), log: fx.log });
    expect(fx.log).toHaveLength(1);
  });
});

describe('wlaczZwyciestwo', () => {
  it('dokłada puste liczniki, jest idempotentne i nie rusza reszty stanu', () => {
    const st = newGov(1);
    const rng = { ...st.rng };
    wlaczZwyciestwo(st);
    expect(st.zwyciestwo).toEqual({ kamienie: {}, wygrane: [], dniCelu: 0, ostatniDzien: 0, epilogi: [] });
    expect(st.rng).toEqual(rng);

    const stan = st.zwyciestwo!;
    stan.dniCelu = 3;
    const przed = JSON.stringify(st);
    wlaczZwyciestwo(st);
    expect(st.zwyciestwo).toBe(stan);
    expect(JSON.stringify(st)).toBe(przed);
  });

  it('stan z kamieniami, zwycięstwem i epilogiem przechodzi przez JSON bez zmian', () => {
    const st = wlaczony();
    for (let d = 1; d <= 7; d++) krok(st, rano(d, { ludnosc: CEL }));
    expect(z(st).epilogi).toEqual(['ludnosc']);
    const wczytany = loadGov(saveGov(st));
    expect(wczytany.zwyciestwo).toEqual(st.zwyciestwo);
    expect(JSON.stringify(wczytany)).toBe(JSON.stringify(st));
  });
});

describe('zarząd bez opcji zwycięstwa', () => {
  it('sto wywołań govUpdate nie tworzy stanu zwycięstwa ani wpisów o drogach', () => {
    const gov = newGov(1);
    const atr = new Atrapa(1);
    // poranek z ludnością, która przy włączonych drogach dałaby kamienie
    for (let n = 0; n < 100; n++)
      atr.apply(govUpdate(gov, { ...atr.input(), day: 2, hour: 6, minute: 0, ludnosc: 400 }));
    expect(gov.zwyciestwo).toBeUndefined();
    expect('zwyciestwo' in gov).toBe(false);
    expect(gov.log.filter((l) => l.txt.pl.startsWith('Droga '))).toEqual([]);
  });

  it('cztery doby gry mają te same skróty stanu co przed modułem zwycięstwa', () => {
    // skróty przepięte 19.10.2026 po zmianie puli wydarzeń (pule według trybu, handlarz i wędrowiec z wagą 0):
    // inna pula to inne losowanie zarządu; przed zmianą były 51743a78, 1792dce3 i 7b631d3d, czyli przebieg sprzed
    // modułu zwycięstwa
    const przebiegi = [
      [1, 'propozycja', '32eb97ec'],
      [3, 'zawsze-warta', '88a53f7e'],
      [5, 'losowo', '438e5c9b'],
    ] as const;
    for (const [ziarno, polityka, skrot] of przebiegi) {
      const { gov } = run(ziarno, polityka, at(5, 0));
      expect('zwyciestwo' in gov, `${ziarno}`).toBe(false);
      expect(hashString(JSON.stringify(gov)), `${ziarno} ${polityka}`).toBe(skrot);
    }
  });

  it('krokZwyciestwa bez stanu zwycięstwa nie robi nic', () => {
    const st = newGov(1);
    const przed = JSON.stringify(st);
    const fx = krok(st, rano(2, { ludnosc: 400, teren: { przylaczone: 3 } }));
    expect(JSON.stringify(st)).toBe(przed);
    expect(fx).toEqual(emptyEffects());
  });
});

describe('kamienie ludności', () => {
  it('12 osób: pierwszy kamień i jeden wpis w kronice, drugi krok tych samych danych nic nie dopisuje', () => {
    const st = wlaczony();
    const fx = krok(st, wej({ ludnosc: 12 }));
    expect(z(st).kamienie.ludnosc).toBe(1);
    expect(st.log).toHaveLength(1);
    expect(st.log[0].txt).toEqual({ pl: 'Droga „Nowe osiedle”: 10 osób.', en: 'A new estate: 10 people.' });
    expect(st.log[0].big).toBe(true);
    expect(fx.log).toEqual([st.log[0].txt]);

    const przed = JSON.stringify(st);
    const fx2 = krok(st, wej({ ludnosc: 12 }));
    expect(JSON.stringify(st)).toBe(przed);
    expect(fx2.log).toEqual([]);
  });

  it('60 osób od razu: trzy kamienie i po jednym wpisie na każdy, w kolejności', () => {
    const st = wlaczony();
    krok(st, wej({ ludnosc: 60 }));
    expect(z(st).kamienie.ludnosc).toBe(3);
    expect(teksty(st)).toEqual([
      'Droga „Nowe osiedle”: 10 osób.',
      'Droga „Nowe osiedle”: 25 osób.',
      'Droga „Nowe osiedle”: 50 osób.',
    ]);
    expect(st.log.map((l) => l.txt.en)).toEqual([
      'A new estate: 10 people.',
      'A new estate: 25 people.',
      'A new estate: 50 people.',
    ]);
  });

  it('kamienie dochodzą po kolei, każdy nowy to jeden nowy wpis', () => {
    const st = wlaczony();
    krok(st, wej({ ludnosc: 12 }));
    expect(st.log).toHaveLength(1);
    krok(st, wej({ ludnosc: 26 }));
    expect(z(st).kamienie.ludnosc).toBe(2);
    expect(st.log).toHaveLength(2);
    krok(st, wej({ ludnosc: 60 }));
    expect(z(st).kamienie.ludnosc).toBe(3);
    expect(st.log).toHaveLength(3);
    // „połowa celu” to połowa celu 250, czyli 125
    krok(st, wej({ ludnosc: 124 }));
    expect(z(st).kamienie.ludnosc).toBe(3);
    krok(st, wej({ ludnosc: 125 }));
    expect(z(st).kamienie.ludnosc).toBe(4);
    expect(teksty(st)[3]).toBe('Droga „Nowe osiedle”: Połowa celu.');
    expect(st.log[3].txt.en).toBe('A new estate: Halfway there.');
  });

  it('kamienie progowe: 9 osób to jeszcze nic, 10 to pierwszy, 24 i 25 granica drugiego', () => {
    const st = wlaczony();
    krok(st, wej({ ludnosc: 9 }));
    expect(z(st).kamienie.ludnosc).toBeUndefined();
    expect(st.log).toHaveLength(0);
    krok(st, wej({ ludnosc: 10 }));
    expect(z(st).kamienie.ludnosc).toBe(1);
    krok(st, wej({ ludnosc: 24 }));
    expect(z(st).kamienie.ludnosc).toBe(1);
    krok(st, wej({ ludnosc: 25 }));
    expect(z(st).kamienie.ludnosc).toBe(2);
  });

  it('spadek do 5 osób nie odbiera kamieni ani nie dopisuje wpisów', () => {
    const st = wlaczony();
    krok(st, wej({ ludnosc: 60 }));
    const wpisy = st.log.length;
    krok(st, wej({ ludnosc: 5 }));
    expect(z(st).kamienie.ludnosc).toBe(3);
    expect(st.log).toHaveLength(wpisy);
    // i znów w górę: te same kamienie nie liczą się drugi raz
    krok(st, wej({ ludnosc: 60 }));
    expect(z(st).kamienie.ludnosc).toBe(3);
    expect(st.log).toHaveLength(wpisy);
  });

  it('bez pola `ludnosc` liczy zarząd i mieszkańców (atrapa: 4 + 4 = 8, jeszcze bez kamienia)', () => {
    const st = wlaczony();
    krok(st, wej());
    expect(z(st).kamienie.ludnosc).toBeUndefined();
    // 4 + 20 = 24 osoby: pierwszy kamień, do drugiego brakuje jednej
    krok(st, wej({ residents: 20 }));
    expect(z(st).kamienie.ludnosc).toBe(1);
    krok(st, wej({ residents: 21 }));
    expect(z(st).kamienie.ludnosc).toBe(2);
  });

  it('krok niczego nie zmienia poza stanem zwycięstwa i kroniką: zaufanie, wkurzenie, ziarno, zapasy i skutki', () => {
    const st = wlaczony();
    const bez = (s: GovState) => {
      const kopia = JSON.parse(JSON.stringify(s));
      delete kopia.zwyciestwo;
      delete kopia.log;
      return kopia;
    };
    const przed = bez(st);
    const fx = krok(st, rano(2, { ludnosc: 400, teren: { przylaczone: 3 } }));
    expect(bez(st)).toEqual(przed);
    expect(fx).toEqual({ ...emptyEffects(), log: fx.log });
    expect(fx.log.length).toBeGreaterThan(0);
    expect(fx.stock).toEqual(zeroStock());
  });
});

describe('droga terenu', () => {
  it('pierwszy sąsiad za płotem zalicza pierwszy kamień, mur czeka na dalsze etapy', () => {
    const st = wlaczony();
    krok(st, wej({ teren: { przylaczone: 0 } }));
    expect(z(st).kamienie.teren).toBeUndefined();
    expect(st.log).toHaveLength(0);

    krok(st, wej({ teren: { przylaczone: 1 } }));
    expect(z(st).kamienie.teren).toBe(1);
    expect(st.log).toHaveLength(1);
    expect(st.log[0].txt).toEqual({
      pl: 'Droga „Za Murem”: Pierwszy sąsiad za płotem.',
      en: 'Za Murem: First neighbour behind the fence.',
    });

    // więcej przyłączonych budynków nie daje jeszcze drugiego kamienia
    krok(st, wej({ teren: { przylaczone: 9 } }));
    expect(z(st).kamienie.teren).toBe(1);
    expect(st.log).toHaveLength(1);
  });

  it('bez odczytu terenu nic się nie zalicza', () => {
    const st = wlaczony();
    krok(st, wej());
    expect(z(st).kamienie.teren).toBeUndefined();
  });

  it('„wkrótce” terenu jest puste przed pierwszym kamieniem i niepuste po nim', () => {
    const st = wlaczony();
    const wkrotce = () => ocenDrogi(st, wej({ teren: { przylaczone: 1 } })).find((x) => x.droga === 'teren')!.wkrotce;
    expect(wkrotce()).toBeNull();
    krok(st, wej({ teren: { przylaczone: 1 } }));
    expect(wkrotce()).toEqual({
      pl: 'Wkrótce: sąsiednie kwadraty i mur.',
      en: 'Coming soon: neighbouring squares and the wall.',
    });
  });
});

describe('licznik „cel przez 7 dni”', () => {
  it('liczy poranki: raz na zmianę dnia, od 6:00, a nie sekundy przy ekranie', () => {
    const st = wlaczony();
    // przed 6:00 nowy dzień jeszcze się nie liczy
    krok(st, wej({ day: 2, hour: 5, minute: 59, ludnosc: CEL }));
    expect(z(st).dniCelu).toBe(0);
    expect(z(st).ostatniDzien).toBe(0);
    // od 6:00 raz, choćby krok powtórzono tysiąc razy
    for (let s = 0; s < 1000; s++) krok(st, rano(2, { ludnosc: CEL }));
    expect(z(st).dniCelu).toBe(1);
    expect(z(st).ostatniDzien).toBe(2);
    // reszta doby bez zmian
    for (const hour of [7, 12, 18, 23]) krok(st, wej({ day: 2, hour, ludnosc: CEL }));
    expect(z(st).dniCelu).toBe(1);
    // po północy nowy dzień czeka do 6:00
    krok(st, wej({ day: 3, hour: 0, ludnosc: CEL }));
    krok(st, wej({ day: 3, hour: 5, minute: 59, ludnosc: CEL }));
    expect(z(st).dniCelu).toBe(1);
    krok(st, rano(3, { ludnosc: CEL }));
    expect(z(st).dniCelu).toBe(2);
    expect(z(st).ostatniDzien).toBe(3);
  });

  it('ludność poniżej celu zeruje licznik, równa celowi go liczy', () => {
    const st = wlaczony();
    krok(st, rano(1, { ludnosc: CEL }));
    krok(st, rano(2, { ludnosc: CEL }));
    krok(st, rano(3, { ludnosc: CEL }));
    expect(z(st).dniCelu).toBe(3);
    krok(st, rano(4, { ludnosc: CEL - 1 }));
    expect(z(st).dniCelu).toBe(0);
    krok(st, rano(5, { ludnosc: CEL }));
    expect(z(st).dniCelu).toBe(1);
  });

  it('głodna osoba z zarządu (jedzenie poniżej 25) zeruje licznik, 25 jeszcze nie jest głodem', () => {
    const st = wlaczony();
    krok(st, rano(1, { ludnosc: CEL }));
    krok(st, rano(2, zJedzeniem(rano(2, { ludnosc: CEL }), 25)));
    expect(z(st).dniCelu).toBe(2);
    krok(st, rano(3, zJedzeniem(rano(3, { ludnosc: CEL }), 24.9)));
    expect(z(st).dniCelu).toBe(0);
    krok(st, rano(4, zJedzeniem(rano(4, { ludnosc: CEL }), 0)));
    expect(z(st).dniCelu).toBe(0);
    krok(st, rano(5, { ludnosc: CEL }));
    expect(z(st).dniCelu).toBe(1);
  });

  it('zaufanie 49 zeruje licznik, 50 wystarcza', () => {
    const st = wlaczony();
    st.trust = 50;
    krok(st, rano(1, { ludnosc: CEL }));
    expect(z(st).dniCelu).toBe(1);
    st.trust = 49;
    krok(st, rano(2, { ludnosc: CEL }));
    expect(z(st).dniCelu).toBe(0);
    st.trust = 50;
    krok(st, rano(3, { ludnosc: CEL }));
    expect(z(st).dniCelu).toBe(1);
  });

  it('licznik zeruje się rano, nie w ciągu dnia: głód po południu nic nie zmienia do następnego poranka', () => {
    const st = wlaczony();
    krok(st, rano(1, { ludnosc: CEL }));
    krok(st, rano(2, { ludnosc: CEL }));
    krok(st, zJedzeniem(wej({ day: 2, hour: 15, ludnosc: CEL }), 3));
    expect(z(st).dniCelu).toBe(2);
    krok(st, rano(3, zJedzeniem(rano(3, { ludnosc: CEL }), 3)));
    expect(z(st).dniCelu).toBe(0);
  });

  it('siódma doba: piąty kamień, zwycięstwo z dniem i godziną, epilog ludności i jeden wpis o kamieniu', () => {
    const st = wlaczony();
    for (let d = 1; d <= 6; d++) {
      krok(st, rano(d, { ludnosc: CEL }));
      expect(z(st).dniCelu).toBe(d);
      expect(z(st).epilogi).toEqual([]);
      expect(z(st).wygrane).toEqual([]);
    }
    expect(z(st).kamienie.ludnosc).toBe(4);
    const wpisy = st.log.length;

    const fx = krok(st, rano(7, { ludnosc: CEL }));
    expect(z(st).dniCelu).toBe(7);
    expect(z(st).kamienie.ludnosc).toBe(5);
    expect(z(st).wygrane).toEqual([{ droga: 'ludnosc', dzien: 7, godzina: 6 }]);
    expect(z(st).epilogi).toEqual(['ludnosc']);
    expect(st.log).toHaveLength(wpisy + 1);
    expect(st.log.at(-1)!.txt).toEqual({
      pl: 'Droga „Nowe osiedle”: Cel przez 7 dni.',
      en: 'A new estate: Target held for 7 days.',
    });
    expect(st.log.at(-1)!.big).toBe(true);
    expect(fx.log).toEqual([st.log.at(-1)!.txt]);
  });

  it('godzina zwycięstwa to godzina kroku, który zamknął siódmy poranek', () => {
    const st = wlaczony();
    for (let d = 1; d <= 6; d++) krok(st, rano(d, { ludnosc: CEL }));
    krok(st, wej({ day: 7, hour: 9, minute: 30, ludnosc: CEL }));
    expect(z(st).wygrane).toEqual([{ droga: 'ludnosc', dzien: 7, godzina: 9 }]);
  });

  it('przerwa w liczeniu: głód w szóstym poranku to siedem poranków od nowa', () => {
    const st = wlaczony();
    for (let d = 1; d <= 5; d++) krok(st, rano(d, { ludnosc: CEL }));
    krok(st, rano(6, zJedzeniem(rano(6, { ludnosc: CEL }), 10)));
    expect(z(st).dniCelu).toBe(0);
    for (let d = 7; d <= 12; d++) {
      krok(st, rano(d, { ludnosc: CEL }));
      expect(z(st).epilogi, `dzień ${d}`).toEqual([]);
    }
    krok(st, rano(13, { ludnosc: CEL }));
    expect(z(st).epilogi).toEqual(['ludnosc']);
    expect(z(st).wygrane).toEqual([{ droga: 'ludnosc', dzien: 13, godzina: 6 }]);
  });

  it('po zwycięstwie nic nie wraca: ani drugi epilog, ani drugie zwycięstwo, ani wpisy o kamieniach', () => {
    const st = wlaczony();
    for (let d = 1; d <= 7; d++) krok(st, rano(d, { ludnosc: CEL }));
    grajDalej(st);
    expect(z(st).epilogi).toEqual([]);
    const wpisy = st.log.length;
    // dalsze poranki: raz z głodem (zerowanie), potem znów pełne siedem
    for (let d = 8; d <= 30; d++) {
      const i = d === 12 ? zJedzeniem(rano(d, { ludnosc: CEL }), 5) : rano(d, { ludnosc: CEL });
      krok(st, i);
      expect(z(st).epilogi, `dzień ${d}`).toEqual([]);
    }
    expect(z(st).wygrane).toEqual([{ droga: 'ludnosc', dzien: 7, godzina: 6 }]);
    expect(z(st).kamienie.ludnosc).toBe(5);
    expect(st.log).toHaveLength(wpisy);
  });
});

describe('epilog w pending i „Graj dalej”', () => {
  const raport = (): NightReport => ({
    day: 1,
    lines: [],
    raid: 'brak',
    stolen: zeroStock(),
    loot: zeroStock(),
    hurt: [],
    tired: [],
    trust: 50,
    anger: 20,
    dTrust: 0,
    dAnger: 0,
  });

  it('epilog idzie przed raportem, a po „Graj dalej” wraca to, co czekało bez niego', () => {
    const st = wlaczony();
    const r = raport();
    st.report = r;
    const i = wej();
    expect(pending(st, i)).toEqual({ k: 'raport', report: r });

    z(st).epilogi = ['ludnosc'];
    expect(pending(st, i)).toEqual({ k: 'zwyciestwo', droga: 'ludnosc' });

    grajDalej(st);
    expect(z(st).epilogi).toEqual([]);
    expect(pending(st, i)).toEqual({ k: 'raport', report: r });
  });

  it('epilog idzie też przed uchwałą z wieczornego zebrania', () => {
    const st = wlaczony();
    st.lawPending = true;
    z(st).epilogi = ['ludnosc'];
    expect(pending(st, wej())?.k).toBe('zwyciestwo');
    grajDalej(st);
    expect(pending(st, wej())?.k).toBe('uchwala');
  });

  it('zwycięstwo innej drogi, później, dostaje własny epilog', () => {
    const st = wlaczony();
    for (let d = 1; d <= 7; d++) krok(st, rano(d, { ludnosc: CEL }));
    grajDalej(st);
    // druga droga dochodzi do ostatniego kamienia (tu ręcznie, jak zrobią to odczyty jej przyszłych projektów)
    z(st).kamienie.cuda = DROGI.cuda.kamienie.length;
    krok(st, rano(8, { ludnosc: CEL }));
    expect(z(st).wygrane).toEqual([
      { droga: 'ludnosc', dzien: 7, godzina: 6 },
      { droga: 'cuda', dzien: 8, godzina: 6 },
    ]);
    expect(z(st).epilogi).toEqual(['cuda']);
    expect(pending(st, rano(8, { ludnosc: CEL }))).toEqual({ k: 'zwyciestwo', droga: 'cuda' });
    grajDalej(st);
    // ani ludność, ani cuda nie wygrywają drugi raz
    for (let d = 9; d <= 20; d++) krok(st, rano(d, { ludnosc: CEL }));
    expect(z(st).epilogi).toEqual([]);
    expect(z(st).wygrane).toHaveLength(2);
  });

  it('dwie drogi wygrywają w jednym kroku: dwa epilogi jeden po drugim, w kolejności ekranu', () => {
    const st = wlaczony();
    z(st).kamienie.technologia = DROGI.technologia.kamienie.length;
    z(st).kamienie.cuda = DROGI.cuda.kamienie.length;
    krok(st, rano(3, { ludnosc: 8 }));
    expect(z(st).wygrane.map((w) => w.droga)).toEqual(['technologia', 'cuda']);
    expect(z(st).epilogi).toEqual(['technologia', 'cuda']);
    const i = rano(3, { ludnosc: 8 });
    // okno dostaje pierwszy, drugi czeka za nim
    expect(pending(st, i)).toEqual({ k: 'zwyciestwo', droga: 'technologia' });
    expect(pending(st, i)).toEqual({ k: 'zwyciestwo', droga: 'technologia' });
    grajDalej(st);
    expect(z(st).epilogi).toEqual(['cuda']);
    expect(pending(st, i)).toEqual({ k: 'zwyciestwo', droga: 'cuda' });
    grajDalej(st);
    expect(z(st).epilogi).toEqual([]);
    expect(pending(st, i)).toBeNull();
    // obie wygrane zostają w stanie i żadna nie wraca
    for (let d = 4; d <= 12; d++) krok(st, rano(d, { ludnosc: 8 }));
    expect(z(st).wygrane.map((w) => w.droga)).toEqual(['technologia', 'cuda']);
    expect(z(st).epilogi).toEqual([]);
  });

  it('zwycięstwo, gdy epilog już czeka, staje w kolejce za nim i niczego nie nadpisuje', () => {
    const st = wlaczony();
    z(st).kamienie.technologia = DROGI.technologia.kamienie.length;
    krok(st, rano(3, { ludnosc: 8 }));
    expect(z(st).epilogi).toEqual(['technologia']);
    z(st).kamienie.lek = DROGI.lek.kamienie.length;
    krok(st, rano(4, { ludnosc: 8 }));
    z(st).kamienie.cuda = DROGI.cuda.kamienie.length;
    krok(st, rano(5, { ludnosc: 8 }));
    expect(z(st).wygrane.map((w) => w.droga)).toEqual(['technologia', 'lek', 'cuda']);
    expect(z(st).epilogi).toEqual(['technologia', 'lek', 'cuda']);
    // po kolei, w takiej kolejności, w jakiej drogi wygrały
    const widziane: (string | undefined)[] = [];
    for (let p = pending(st, wej()); p; p = pending(st, wej())) {
      widziane.push(p.k === 'zwyciestwo' ? p.droga : undefined);
      grajDalej(st);
    }
    expect(widziane).toEqual(['technologia', 'lek', 'cuda']);
  });

  it('„Graj dalej” zdejmuje tylko pierwszy epilog, a przy pustej kolejce nic nie psuje', () => {
    const st = wlaczony();
    grajDalej(st);
    expect(z(st).epilogi).toEqual([]);
    z(st).epilogi = ['teren', 'lek', 'cuda'];
    grajDalej(st);
    expect(z(st).epilogi).toEqual(['lek', 'cuda']);
  });

  it('ludność i teren wygrywają w jednym kroku: epilogi w kolejności ekranu, teren przed ludnością', () => {
    const st = wlaczony();
    // ludność wygrywa siódmego poranka, a teren (ręcznie) dochodzi w tym samym kroku
    for (let d = 1; d <= 6; d++) krok(st, rano(d, { ludnosc: CEL }));
    z(st).kamienie.teren = DROGI.teren.kamienie.length;
    krok(st, rano(7, { ludnosc: CEL }));
    // kolejność ekranu: teren stoi przed ludnością
    expect(z(st).epilogi).toEqual(['teren', 'ludnosc']);
    expect(z(st).wygrane.map((w) => w.droga)).toEqual(['teren', 'ludnosc']);
  });

  it('bez epilogu pending jest taki jak przed modułem', () => {
    const st = wlaczony();
    expect(pending(st, wej())).toBeNull();
    expect(pending(newGov(1), wej())).toBeNull();
  });

  it('epilog ustawia dopiero krok, a „Graj dalej” zostawia zapis i wygraną w stanie', () => {
    const st = wlaczony();
    for (let d = 1; d <= 7; d++) krok(st, rano(d, { ludnosc: CEL }));
    const p = pending(st, rano(7, { ludnosc: CEL }));
    expect(p).toEqual({ k: 'zwyciestwo', droga: 'ludnosc' });
    grajDalej(st);
    expect(pending(st, rano(7, { ludnosc: CEL }))).toBeNull();
    expect(z(st).wygrane).toHaveLength(1);
    expect(z(st).kamienie.ludnosc).toBe(5);
  });

  it('kolejne kroki nie ustawiają epilogu tej samej drogi drugi raz, także bez „Graj dalej” po drodze', () => {
    const st = wlaczony();
    for (let d = 1; d <= 7; d++) krok(st, rano(d, { ludnosc: CEL }));
    grajDalej(st);
    for (let d = 8; d <= 20; d++) krok(st, rano(d, { ludnosc: CEL }));
    expect(z(st).epilogi).toEqual([]);
    expect(pending(st, rano(20, { ludnosc: CEL }))).toBeNull();
    expect(z(st).wygrane).toHaveLength(1);
  });

  it('„Graj dalej” bez stanu zwycięstwa nic nie psuje', () => {
    const st = newGov(1);
    const przed = JSON.stringify(st);
    expect(() => grajDalej(st)).not.toThrow();
    expect(JSON.stringify(st)).toBe(przed);
  });
});

describe('zapis i wczytanie', () => {
  it('w połowie licznika dają ten sam stan po kolejnych krokach i to samo zwycięstwo', () => {
    const a = wlaczony();
    const b = wlaczony();
    for (let d = 1; d <= 3; d++) {
      krok(a, rano(d, { ludnosc: CEL }));
      krok(b, rano(d, { ludnosc: CEL }));
    }
    expect(z(b).dniCelu).toBe(3);
    const c = loadGov(saveGov(b));
    for (let d = 4; d <= 9; d++) {
      krok(a, rano(d, { ludnosc: CEL }));
      krok(c, rano(d, { ludnosc: CEL }));
    }
    expect(JSON.stringify(c)).toBe(JSON.stringify(a));
    expect(z(c).wygrane).toEqual([{ droga: 'ludnosc', dzien: 7, godzina: 6 }]);
    expect(z(c).epilogi).toEqual(['ludnosc']);
  });

  it('wczytanie z epilogiem czekającym w oknie oddaje ten sam epilog', () => {
    const st = wlaczony();
    for (let d = 1; d <= 7; d++) krok(st, rano(d, { ludnosc: CEL }));
    const c = loadGov(saveGov(st));
    expect(pending(c, rano(7))).toEqual({ k: 'zwyciestwo', droga: 'ludnosc' });
  });

  it('wczytanie z kolejką dwóch epilogów oddaje je po kolei', () => {
    const st = wlaczony();
    wygrajDroge(st, 'teren', 3, 9);
    wygrajDroge(st, 'cuda', 3, 10);
    const c = loadGov(saveGov(st));
    expect(z(c).epilogi).toEqual(['teren', 'cuda']);
    expect(pending(c, wej())).toEqual({ k: 'zwyciestwo', droga: 'teren' });
    grajDalej(c);
    expect(pending(c, wej())).toEqual({ k: 'zwyciestwo', droga: 'cuda' });
    grajDalej(c);
    expect(pending(c, wej())).toBeNull();
  });

  it('stan sprzed kolejki (jedno pole `epilog` z drogą) czyta się jak kolejkę z jednym epilogiem', () => {
    const st = wlaczony();
    for (let d = 1; d <= 7; d++) krok(st, rano(d, { ludnosc: CEL }));
    // zapis w dawnym kształcie (zapisy deweloperskie): `epilog: Droga | null` zamiast `epilogi`
    const stary = JSON.parse(saveGov(st));
    stary.zwyciestwo.epilog = stary.zwyciestwo.epilogi[0];
    delete stary.zwyciestwo.epilogi;
    const c = loadGov(JSON.stringify(stary));
    wlaczZwyciestwo(c);
    expect(z(c).epilogi).toEqual(['ludnosc']);
    expect('epilog' in z(c)).toBe(false);
    expect(pending(c, rano(7))).toEqual({ k: 'zwyciestwo', droga: 'ludnosc' });
    grajDalej(c);
    expect(pending(c, rano(7))).toBeNull();
    // po tym samym „Graj dalej” taki sam stan jak z nowego kształtu
    grajDalej(st);
    expect(c.zwyciestwo).toEqual(st.zwyciestwo);
    // kolejne poranki: ani drugi epilog, ani drugie zwycięstwo
    for (let d = 8; d <= 20; d++) krok(c, rano(d, { ludnosc: CEL }));
    expect(z(c).epilogi).toEqual([]);
    expect(z(c).wygrane).toHaveLength(1);
  });

  it('stary kształt z `epilog: null` to pusta kolejka, a ponowne włączenie niczego nie zmienia', () => {
    const stary = JSON.parse(saveGov(wlaczony()));
    stary.zwyciestwo.epilog = null;
    delete stary.zwyciestwo.epilogi;
    const c = loadGov(JSON.stringify(stary));
    wlaczZwyciestwo(c);
    expect(z(c).epilogi).toEqual([]);
    expect('epilog' in z(c)).toBe(false);
    const przed = JSON.stringify(c);
    wlaczZwyciestwo(c);
    expect(JSON.stringify(c)).toBe(przed);
  });

  it('stary kształt przechodzi też przez wygrajDroge, bez gubienia czekającego epilogu', () => {
    const stary = JSON.parse(saveGov(wlaczony()));
    stary.zwyciestwo.epilog = 'lek';
    delete stary.zwyciestwo.epilogi;
    const c = loadGov(JSON.stringify(stary));
    expect(wygrajDroge(c, 'cuda', 2, 6)).toBe(true);
    expect(z(c).epilogi).toEqual(['lek', 'cuda']);
  });
});

describe('stary zapis bez stanu zwycięstwa', () => {
  it('włączenie zalicza to, co stan już spełnia, raz i bez epilogu', () => {
    const st = loadGov(saveGov(newGov(1)));
    expect(st.zwyciestwo).toBeUndefined();
    wlaczZwyciestwo(st);

    const i = wej({ day: 30, hour: 15, ludnosc: 30 });
    krok(st, i);
    expect(z(st).kamienie.ludnosc).toBe(2);
    expect(st.log).toHaveLength(2);
    // co sekundę przy ekranie, bez lawiny wpisów
    for (let s = 0; s < 300; s++) krok(st, i);
    expect(st.log).toHaveLength(2);
    expect(z(st).epilogi).toEqual([]);
    expect(z(st).wygrane).toEqual([]);
  });

  it('500 osób: cztery kamienie naraz, ale zwycięstwo dopiero po siedmiu porankach od włączenia', () => {
    const st = loadGov(saveGov(newGov(1)));
    wlaczZwyciestwo(st);
    krok(st, wej({ day: 40, hour: 15, ludnosc: 500 }));
    expect(z(st).kamienie.ludnosc).toBe(4);
    expect(st.log).toHaveLength(4);
    expect(z(st).epilogi).toEqual([]);
    expect(z(st).wygrane).toEqual([]);
    expect(pending(st, wej({ day: 40, hour: 15, ludnosc: 500 }))).toBeNull();
    // siedem poranków z rzędu, licząc od dnia włączenia
    for (let d = 41; d <= 45; d++) krok(st, rano(d, { ludnosc: 500 }));
    expect(z(st).epilogi).toEqual([]);
    krok(st, rano(46, { ludnosc: 500 }));
    expect(z(st).epilogi).toEqual(['ludnosc']);
  });
});

describe('tryb zombie', () => {
  it('cel to połowa: licznik liczy od 125 osób, nie od 250', () => {
    const st = wlaczony('zombie');
    krok(st, rano(1, { ludnosc: 124 }));
    expect(z(st).dniCelu).toBe(0);
    krok(st, rano(2, { ludnosc: 125 }));
    expect(z(st).dniCelu).toBe(1);
    for (let d = 3; d <= 8; d++) krok(st, rano(d, { ludnosc: 125 }));
    expect(z(st).wygrane).toEqual([{ droga: 'ludnosc', dzien: 8, godzina: 6 }]);
    expect(z(st).epilogi).toEqual(['ludnosc']);
  });

  it('„połowa celu” to połowa celu zombie (63 przy 125), zaokrąglona w górę', () => {
    const st = wlaczony('zombie');
    krok(st, wej({ ludnosc: 62 }));
    expect(z(st).kamienie.ludnosc).toBe(3);
    krok(st, wej({ ludnosc: 63 }));
    expect(z(st).kamienie.ludnosc).toBe(4);
  });

  it('przy małym celu połowa celu nie wyprzedza kamienia „50 osób”', () => {
    // dane 2021: 100 osób, cel 120, w zombie 60, połowa 30
    const st = wlaczony('zombie');
    krok(st, wej({ ludnosc: 40, ludnosc2021: 100 }));
    expect(z(st).kamienie.ludnosc).toBe(2);
    krok(st, wej({ ludnosc: 50, ludnosc2021: 100 }));
    expect(z(st).kamienie.ludnosc).toBe(4);
    expect(teksty(st).slice(-2)).toEqual(['Droga „Nowe osiedle”: 50 osób.', 'Droga „Nowe osiedle”: Połowa celu.']);
  });
});

describe('cel z danych 2021 w liczniku', () => {
  it('większe osiedle sprzed upadku to wyższy cel: 300 osób nie wystarcza przy danych 1000 (cel 500)', () => {
    const st = wlaczony();
    krok(st, rano(1, { ludnosc: 300, ludnosc2021: 1000 }));
    expect(z(st).dniCelu).toBe(0);
    krok(st, rano(2, { ludnosc: 500, ludnosc2021: 1000 }));
    expect(z(st).dniCelu).toBe(1);
  });
});

describe('cel zapamiętany w stanie (zamrożony przy pierwszych danych 2021)', () => {
  it('pierwszy krok z danymi 2021 zapisuje cel, tak jak liczy go celLudnosci (zwykły i zombie)', () => {
    const zwykly = wlaczony();
    expect(z(zwykly).cel).toBeUndefined();
    krok(zwykly, wej({ ludnosc: 8, ludnosc2021: 1000 }));
    expect(z(zwykly).cel).toBe(500);
    // 100 osób sprzed upadku to dolna granica 120, w zombie połowa po przycięciu
    const zombie = wlaczony('zombie');
    krok(zombie, wej({ ludnosc: 8, ludnosc2021: 1000 }));
    expect(z(zombie).cel).toBe(250);
    const maly = wlaczony('zombie');
    krok(maly, wej({ ludnosc: 8, ludnosc2021: 100 }));
    expect(z(maly).cel).toBe(60);
  });

  it('późniejszy krok bez danych 2021 zostaje przy zapisanym celu: ludność 300 nie liczy się do 500', () => {
    const st = wlaczony();
    krok(st, rano(1, { ludnosc: 300, ludnosc2021: 1000 }));
    expect(z(st).cel).toBe(500);
    expect(z(st).dniCelu).toBe(0);
    // gdyby cel wrócił do 250, 300 osób liczyłoby poranki
    for (let d = 2; d <= 6; d++) krok(st, rano(d, { ludnosc: 300 }));
    expect(z(st).dniCelu).toBe(0);
    expect(z(st).cel).toBe(500);
    // cel 500 trzyma licznik, także bez danych w wejściu
    for (let d = 7; d <= 13; d++) krok(st, rano(d, { ludnosc: 500 }));
    expect(z(st).wygrane).toEqual([{ droga: 'ludnosc', dzien: 13, godzina: 6 }]);
  });

  it('progi kamieni idą od zapisanego celu także wtedy, gdy późniejsze kroki nie mają danych 2021', () => {
    const st = wlaczony();
    krok(st, wej({ ludnosc: 200, ludnosc2021: 1000 }));
    // połowa celu 500 to 250, więc 200 osób to trzy kamienie (z celem 250 byłby już czwarty)
    expect(z(st).kamienie.ludnosc).toBe(3);
    krok(st, wej({ ludnosc: 249 }));
    expect(z(st).kamienie.ludnosc).toBe(3);
    krok(st, wej({ ludnosc: 250 }));
    expect(z(st).kamienie.ludnosc).toBe(4);
  });

  it('inne dane 2021 w późniejszym kroku nie zmieniają zapisanego celu', () => {
    const st = wlaczony();
    krok(st, rano(1, { ludnosc: 300, ludnosc2021: 1000 }));
    krok(st, rano(2, { ludnosc: 300, ludnosc2021: 100 }));
    expect(z(st).cel).toBe(500);
    // z danymi 100 cel byłby 120 i 300 osób liczyłoby poranek
    expect(z(st).dniCelu).toBe(0);
  });

  it('ocenDrogi czyta zapisany cel, a bez zapisanego liczy na bieżąco i niczego nie zapisuje', () => {
    const ludnosc = (st: GovState, i: GovInput) => ocenDrogi(st, i).find((x) => x.droga === 'ludnosc')!.postep;
    const st = wlaczony();
    // jeszcze nic nie zapisano: cel z bieżących danych, stan bez zmian
    const przed = JSON.stringify(st);
    expect(ludnosc(st, wej({ ludnosc: 40, ludnosc2021: 1000 }))).toEqual({ ile: 40, cel: 500 });
    expect(ludnosc(st, wej({ ludnosc: 40 }))).toEqual({ ile: 40, cel: 250 });
    expect(JSON.stringify(st)).toBe(przed);
    // po zapisie ekran dróg pokazuje ten sam cel także bez danych w wejściu
    krok(st, wej({ ludnosc: 40, ludnosc2021: 1000 }));
    expect(ludnosc(st, wej({ ludnosc: 41 }))).toEqual({ ile: 41, cel: 500 });
    expect(ludnosc(st, wej({ ludnosc: 41, ludnosc2021: 100 }))).toEqual({ ile: 41, cel: 500 });
    // w zombie zapisany cel jest już po połowieniu i nie dzieli się drugi raz
    const zombie = wlaczony('zombie');
    krok(zombie, wej({ ludnosc: 40, ludnosc2021: 1000 }));
    expect(ludnosc(zombie, wej({ ludnosc: 41 }))).toEqual({ ile: 41, cel: 250 });
  });

  it('bez danych 2021 w ogóle nic się nie zapisuje, a cel to 250 jak dotąd', () => {
    const st = wlaczony();
    for (let d = 1; d <= 7; d++) krok(st, rano(d, { ludnosc: CEL }));
    expect('cel' in z(st)).toBe(false);
    expect(z(st).wygrane).toEqual([{ droga: 'ludnosc', dzien: 7, godzina: 6 }]);
    const zombie = wlaczony('zombie');
    krok(zombie, rano(1, { ludnosc: 125 }));
    expect('cel' in z(zombie)).toBe(false);
    expect(z(zombie).dniCelu).toBe(1);
  });

  it('dane bez sensu (0, ujemne, NaN) nie zamrażają celu, dopiero użyteczne dane', () => {
    const st = wlaczony();
    for (const n of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      krok(st, wej({ ludnosc: 8, ludnosc2021: n }));
      expect('cel' in z(st), `${n}`).toBe(false);
    }
    krok(st, wej({ ludnosc: 8, ludnosc2021: 600 }));
    expect(z(st).cel).toBe(300);
  });

  it('zapisany cel przechodzi przez JSON i zarządu (saveGov/loadGov), a dalsze kroki idą od niego', () => {
    const st = wlaczony();
    for (let d = 1; d <= 3; d++) krok(st, rano(d, { ludnosc: 500, ludnosc2021: 1000 }));
    expect(z(st).dniCelu).toBe(3);
    const c = loadGov(saveGov(st));
    expect(z(c).cel).toBe(500);
    expect(JSON.parse(JSON.stringify(z(st)))).toEqual(z(c));
    // wznowiona gra bez tabel: 499 osób nie wystarcza do zapisanego celu 500 (z celem 250 by wystarczyło)
    krok(c, rano(4, { ludnosc: 499 }));
    expect(z(c).dniCelu).toBe(0);
    // ten sam przebieg bez zapisu i wczytania daje ten sam stan
    const a = wlaczony();
    for (let d = 1; d <= 3; d++) krok(a, rano(d, { ludnosc: 500, ludnosc2021: 1000 }));
    krok(a, rano(4, { ludnosc: 499 }));
    expect(JSON.stringify(c)).toBe(JSON.stringify(a));
  });

  it('stan sprzed pola `cel` (stary zapis) liczy cel na bieżąco i zapisuje go przy pierwszych danych', () => {
    const st = loadGov(saveGov(wlaczony()));
    expect('cel' in z(st)).toBe(false);
    // bez danych tak jak dotąd: 250
    krok(st, rano(1, { ludnosc: CEL }));
    expect(z(st).dniCelu).toBe(1);
    expect('cel' in z(st)).toBe(false);
    // dane 2021 pojawiają się później (gra wczytana z tabelami): cel zamraża się od teraz
    krok(st, rano(2, { ludnosc: CEL, ludnosc2021: 1000 }));
    expect(z(st).cel).toBe(500);
    expect(z(st).dniCelu).toBe(0);
  });

  it('zapis celu niczego nie zmienia w kroku poza polem `cel`: kamienie i wpisy tak jak z celem liczonym na bieżąco', () => {
    const st = wlaczony();
    for (const ludnosc of [9, 12, 30, 60, 130, 250, 500]) krok(st, wej({ ludnosc, ludnosc2021: 1000 }));
    // cel 500: progi 10, 25, 50 i połowa 250; 130 osób to jeszcze nie połowa celu
    expect(teksty(st)).toEqual([
      'Droga „Nowe osiedle”: 10 osób.',
      'Droga „Nowe osiedle”: 25 osób.',
      'Droga „Nowe osiedle”: 50 osób.',
      'Droga „Nowe osiedle”: Połowa celu.',
    ]);
    expect(z(st).cel).toBe(500);
    expect(st.trust).toBe(50);
    expect(st.anger).toBe(20);
  });
});

describe('krok zwycięstwa w govUpdate', () => {
  it('govUpdate zalicza kamień z odczytu i oddaje wpis w skutkach', () => {
    const gov = newGov(1);
    wlaczZwyciestwo(gov);
    const atr = new Atrapa(1);
    const fx = govUpdate(gov, { ...atr.input(), ludnosc: 12 });
    expect(z(gov).kamienie.ludnosc).toBe(1);
    expect(fx.log.some((t) => t.pl === 'Droga „Nowe osiedle”: 10 osób.')).toBe(true);
  });

  it('przerwana seria poranków przez cały govUpdate: wpis w kronice i w skutkach tego kroku', () => {
    const gov = newGov(1);
    wlaczZwyciestwo(gov);
    const atr = new Atrapa(1);
    const poranek = (day: number, food: number): GovInput => {
      const i = { ...atr.input(), day, hour: 6, minute: 0, ludnosc: CEL };
      return { ...i, people: i.people.map((p) => ({ ...p, needs: { ...p.needs, food } })) };
    };
    for (let d = 1; d <= 3; d++) govUpdate(gov, poranek(d, 100));
    expect(z(gov).dniCelu).toBe(3);
    expect(gov.log.filter((l) => l.txt.pl.startsWith('Seria poranków'))).toEqual([]);
    const fx = govUpdate(gov, poranek(4, 10));
    expect(z(gov).dniCelu).toBe(0);
    const wpisy = gov.log.filter((l) => l.txt.pl.startsWith('Seria poranków'));
    expect(wpisy.map((l) => l.txt.pl)).toEqual(['Seria poranków do celu przerwana po 3 z 7.']);
    expect(wpisy[0].big).toBe(false);
    expect(fx.log.map((t) => t.pl)).toContain('Seria poranków do celu przerwana po 3 z 7.');
  });

  it('po końcu gry krok zwycięstwa nie liczy kamieni ani zwycięstwa', () => {
    const gov = newGov(1);
    wlaczZwyciestwo(gov);
    const atr = new Atrapa(1);
    govUpdate(gov, { ...atr.input(), people: [], ludnosc: 400, day: 2, hour: 6, minute: 0 });
    expect(gov.over).toBe('pustka');
    expect(z(gov).kamienie).toEqual({});
    expect(z(gov).ostatniDzien).toBe(0);
    expect(z(gov).epilogi).toEqual([]);
  });

  it('siedem poranków przez cały govUpdate: epilog staje przed porannym raportem, po „Graj dalej” raport czeka', () => {
    const gov = newGov(1);
    wlaczZwyciestwo(gov);
    const atr = new Atrapa(1);
    atr.residents = CEL - atr.people.length;
    expect(atr.input().residents).toBe(246);
    const minuta = () => (atr.day - 1) * 1440 + atr.hour * 60 + atr.minute;
    let epilogOd: number | null = null;
    while (minuta() < at(9, 0)) {
      atr.tick++;
      if (atr.tick % TPH === 0) atr.hourly(1);
      if (atr.tick % TPS !== 0) continue;
      // gracz dba o ludzi: najedzeni, a zaufanie nie spada poniżej 60 (cały sens próby to połączenie kroków)
      for (const p of atr.people) p.needs.food = 100;
      gov.trust = Math.max(gov.trust, 60);
      atr.apply(govUpdate(gov, atr.input()));
      if (z(gov).epilogi.length && epilogOd === null) {
        epilogOd = minuta();
        // poranny raport czeka w tej samej chwili, ale epilog jest pierwszy
        expect(gov.report).toBeTruthy();
        expect(pending(gov, atr.input())).toEqual({ k: 'zwyciestwo', droga: 'ludnosc' });
        grajDalej(gov);
        expect(pending(gov, atr.input())?.k).toBe('raport');
        ackReport(gov);
      }
    }
    expect(epilogOd).not.toBeNull();
    // pierwszy poranek liczy się w dniu 1 (start o 15:00), więc siódmy to 7. dzień o 6:00
    expect(z(gov).wygrane).toEqual([{ droga: 'ludnosc', dzien: 7, godzina: 6 }]);
    expect(epilogOd).toBe(at(7, 6));
    expect(z(gov).epilogi).toEqual([]);
    expect(z(gov).kamienie.ludnosc).toBe(5);
    // kamienie od pierwszego dnia, po jednym wpisie, a piąty dopiero siódmego poranka
    expect(gov.log.filter((l) => l.txt.pl.startsWith('Droga ')).map((l) => `${l.day} ${l.txt.pl}`)).toEqual([
      '1 Droga „Nowe osiedle”: 10 osób.',
      '1 Droga „Nowe osiedle”: 25 osób.',
      '1 Droga „Nowe osiedle”: 50 osób.',
      '1 Droga „Nowe osiedle”: Połowa celu.',
      '7 Droga „Nowe osiedle”: Cel przez 7 dni.',
    ]);
  });
});

describe('włączone drogi a reszta zarządu', () => {
  it('przebieg zarządu z drogami i bez nich różni się tylko stanem zwycięstwa i wpisami o drogach', () => {
    const graj = (drogi: boolean) => {
      const gov = newGov(2);
      if (drogi) wlaczZwyciestwo(gov);
      const atr = new Atrapa(2);
      // dużo mieszkańców, żeby drogi miały co zaliczać przez cały przebieg
      atr.residents = 246;
      return run(2, 'propozycja', at(5, 0), { gov, atr });
    };
    const z = graj(true);
    const bez = graj(false);
    expect(z.gov.zwyciestwo!.kamienie.ludnosc).toBeGreaterThanOrEqual(4);
    expect(bez.gov.zwyciestwo).toBeUndefined();

    // wpisy modułu drog w kronice: kamienie („Droga …”) i przerwane serie poranków („Seria poranków …”)
    const wpisDrog = (l: { txt: { pl: string } }) =>
      l.txt.pl.startsWith('Droga ') || l.txt.pl.startsWith('Seria poranków');
    const reszta = (g: GovState) => {
      const kopia = JSON.parse(JSON.stringify(g));
      delete kopia.zwyciestwo;
      kopia.log = kopia.log.filter((l: { txt: { pl: string } }) => !wpisDrog(l));
      return kopia;
    };
    expect(reszta(z.gov)).toEqual(reszta(bez.gov));
    // atrapa dostała te same skutki: ludzie, zapasy, czas
    expect(JSON.stringify(z.atr)).toBe(JSON.stringify(bez.atr));
    // te same decyzje gracza, poza ewentualnym „Graj dalej”
    const bezEpilogu = z.steps.filter((s) => s.kind !== 'zwyciestwo');
    expect(bezEpilogu).toEqual(bez.steps);
  });
});

describe('wygrajDroge (zwycięstwo na żądanie, tylko do zrzutów i prób)', () => {
  it('włącza drogi, wpisuje wygraną z dniem i godziną, zalicza komplet kamieni i ustawia epilog', () => {
    const st = newGov(1);
    expect(st.zwyciestwo).toBeUndefined();
    expect(wygrajDroge(st, 'teren', 3, 14)).toBe(true);
    expect(z(st).wygrane).toEqual([{ droga: 'teren', dzien: 3, godzina: 14 }]);
    expect(z(st).kamienie.teren).toBe(DROGI.teren.kamienie.length);
    expect(z(st).epilogi).toEqual(['teren']);
    expect(pending(st, wej())).toEqual({ k: 'zwyciestwo', droga: 'teren' });
    // ekran dróg widzi drogę jako przebytą
    const teren = ocenDrogi(st, wej()).find((d) => d.droga === 'teren')!;
    expect(teren.zaliczone).toBe(teren.kamienie.length);
    expect(teren.wkrotce).toBeNull();
  });

  it('każda z pięciu dróg: wygrana, komplet jej kamieni i epilog tej drogi', () => {
    for (const droga of DROGI_PO_KOLEI) {
      const st = wlaczony();
      expect(wygrajDroge(st, droga, 2, 6), droga).toBe(true);
      expect(z(st).kamienie[droga], droga).toBe(DROGI[droga].kamienie.length);
      expect(z(st).wygrane, droga).toEqual([{ droga, dzien: 2, godzina: 6 }]);
      expect(z(st).epilogi, droga).toEqual([droga]);
    }
  });

  it('ta sama droga drugi raz: jedna wygrana w stanie, a epilog znowu czeka', () => {
    const st = wlaczony();
    wygrajDroge(st, 'ludnosc', 1, 15);
    grajDalej(st);
    expect(z(st).epilogi).toEqual([]);
    wygrajDroge(st, 'ludnosc', 2, 8);
    expect(z(st).wygrane).toEqual([{ droga: 'ludnosc', dzien: 1, godzina: 15 }]);
    expect(z(st).epilogi).toEqual(['ludnosc']);
  });

  it('ta sama droga dwa razy bez „Graj dalej” po drodze czeka w kolejce raz', () => {
    const st = wlaczony();
    wygrajDroge(st, 'ludnosc', 1, 15);
    wygrajDroge(st, 'ludnosc', 1, 16);
    expect(z(st).epilogi).toEqual(['ludnosc']);
    expect(z(st).wygrane).toEqual([{ droga: 'ludnosc', dzien: 1, godzina: 15 }]);
    grajDalej(st);
    expect(pending(st, wej())).toBeNull();
  });

  it('inna droga po „Graj dalej” dostaje własny epilog, a wcześniejsza wygrana zostaje', () => {
    const st = wlaczony();
    wygrajDroge(st, 'ludnosc', 1, 15);
    grajDalej(st);
    wygrajDroge(st, 'cuda', 1, 16);
    expect(pending(st, wej())).toEqual({ k: 'zwyciestwo', droga: 'cuda' });
    expect(z(st).wygrane.map((w) => w.droga)).toEqual(['ludnosc', 'cuda']);
    grajDalej(st);
    expect(pending(st, wej())).toBeNull();
  });

  it('dwie drogi na żądanie, jedna po drugiej: dwa epilogi po kolei, bez nadpisywania czekającego', () => {
    const st = wlaczony();
    wygrajDroge(st, 'ludnosc', 1, 15);
    wygrajDroge(st, 'teren', 1, 16);
    expect(z(st).epilogi).toEqual(['ludnosc', 'teren']);
    expect(pending(st, wej())).toEqual({ k: 'zwyciestwo', droga: 'ludnosc' });
    grajDalej(st);
    expect(pending(st, wej())).toEqual({ k: 'zwyciestwo', droga: 'teren' });
    grajDalej(st);
    expect(pending(st, wej())).toBeNull();
    expect(z(st).wygrane.map((w) => w.droga)).toEqual(['ludnosc', 'teren']);
  });

  it('nieznana droga: false i stan bez zmian, także bez włączania dróg', () => {
    const st = newGov(1);
    const przed = JSON.stringify(st);
    for (const zla of ['wynalazek', 'toString', '__proto__', 'constructor', '']) {
      expect(wygrajDroge(st, zla as Droga, 1, 6), zla).toBe(false);
    }
    expect(JSON.stringify(st)).toBe(przed);
    expect(st.zwyciestwo).toBeUndefined();
  });

  it('niczego nie rusza poza stanem zwycięstwa: ani kroniki, ani zaufania, ziarna i zapasów', () => {
    const a = newGov(1);
    const b = newGov(1);
    wygrajDroge(a, 'cuda', 4, 9);
    const reszta = (g: GovState) => {
      const kopia = JSON.parse(JSON.stringify(g));
      delete kopia.zwyciestwo;
      return kopia;
    };
    expect(reszta(a)).toEqual(reszta(b));
    expect(a.log).toHaveLength(0);
  });

  it('kolejne kroki nie wygrywają jej drugi raz i nie dopisują wpisów o jej kamieniach', () => {
    const st = wlaczony();
    wygrajDroge(st, 'ludnosc', 1, 15);
    grajDalej(st);
    for (let d = 2; d <= 10; d++) krok(st, rano(d, { ludnosc: 500 }));
    expect(z(st).wygrane).toEqual([{ droga: 'ludnosc', dzien: 1, godzina: 15 }]);
    expect(z(st).epilogi).toEqual([]);
    expect(z(st).kamienie.ludnosc).toBe(5);
    expect(z(st).dniCelu).toBe(0);
    expect(st.log).toHaveLength(0);
  });

  it('stan po wygrajDroge przechodzi przez JSON i oddaje ten sam epilog', () => {
    const st = wlaczony();
    wygrajDroge(st, 'lek', 5, 7);
    const c = loadGov(saveGov(st));
    expect(z(c)).toEqual(z(st));
    expect(pending(c, wej())).toEqual({ k: 'zwyciestwo', droga: 'lek' });
  });
});
