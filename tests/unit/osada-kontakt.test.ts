/* Pierwszy kontakt z osadą AI (docs/superpowers/plans/2026-10-24-osada-ai-etap-2.md, zadanie 4; projekt
   docs/superpowers/specs/2026-10-20-osada-ai-design.md, „Jak to wygląda dla gracza”): w dniu kontaktu (4, 5 albo 6, z ziarna
   osady) od 9:00 przychodzi pod bramę poseł z osady i odsłania ją, bez względu na to, co gracz mu odpowie. To zwykła karta
   zarządu (`src/gov/kontakt.ts`, id `posel`), wyzwalana z sytuacji jak `pogrzeb`: wchodzi tylko wtedy, gdy wejście zarządu ma
   osadę (`GovInput.osada`, tylko z ?osada=1, gdy osada już powstała) i nie jest odkryta, nie losuje niczego i nie zużywa
   losowań, więc gra bez osady jest bajt w bajt dzisiejsza. Wybory karty ruszają tylko zaufanie, wkurzenie i kronikę zarządu
   (rozstrzygnięcie kontrolera: silnik osady o nas nie wie), a skutek `odkryjOsade` z liczbami, które poseł podał, odsłania
   osadę w grze (`OsadaGry.odkryj`, src/ui/osada.ts).
   Pliki: karta i jej czas na atrapie zarządu (bez symulacji), przebiegi na atrapie ze zwykłą polityką gracza, zapis w połowie,
   przebiegi bez osady (skróty zarządu sprzed zmiany), a na końcu gospodarz z prawdziwą osadą (Przymorze z mieszkańcami z
   generatora): `GovInput.osada` z gry osady i odsłonięcie po karcie. */

import { describe, expect, it } from 'vitest';
import { kierunekOsady, nazwaOsady } from '../../src/ai/kwadrat.ts';
import { tx } from '../../src/core/jezyk.ts';
import { hashString, mulberry, type Rng } from '../../src/core/rng.ts';
import {
  type DanePosla,
  DNI_KONTAKTU,
  dzienKontaktu,
  GODZINA_POSLA,
  PIERWSZY_DZIEN_KONTAKTU,
  POSEL_EVENT,
} from '../../src/gov/kontakt.ts';
import { BLOK } from '../../src/gov/miejsce.ts';
import type { GovInput, GovPlace, GovState, OdkrycieOsady, WejscieOsady } from '../../src/gov/typy.ts';
import { emptyEffects, QUIET } from '../../src/gov/wspolne.ts';
import { GAP_PO, GAP_ROZRZUT, M1_EVENTS, makeHost } from '../../src/gov/wydarzenia.ts';
import { chooseEvent, govUpdate, lawEffects, loadGov, newGov, pending, saveGov } from '../../src/gov/zarzad.ts';
import { Atrapa, answer, at, run, TPH, TPS } from './gov-atrapa.ts';
import { FORBIDDEN_DOM } from './miejsce-pomoc.ts';
import { pl, polskieSlowa } from './po-angielsku.ts';

// ---------------------------------------------------------------------------------------------------------------------
// Dane i pomocniki
// ---------------------------------------------------------------------------------------------------------------------

/** osada na północy od domu, jak ją nazywa gra (nazwa i kierunek z kwadratu (0, −1), y rośnie na południe) */
const POLNOC = { ...nazwaOsady(0, -1), kierunek: kierunekOsady(0, -1).kierunek };

/** to, co zarząd wie o osadzie z północy: żywa, 23 osoby, 6 budowli, zarząd osady nie odwołany, nieodkryta, kontakt w dniu 5 */
const osadaWej = (over: Partial<WejscieOsady> = {}): WejscieOsady => ({
  nazwa: POLNOC.nazwa,
  nazwaZ: POLNOC.nazwaZ,
  kierunek: POLNOC.kierunek,
  odkryta: false,
  dzienKontaktu: 5,
  ludnosc: 23,
  budowle: 6,
  odwolania: 0,
  ...over,
});

/** dom jednorodzinny wśród domów: ulica, furtka i komitet ulicy zamiast spółdzielni, bramy i zarządu */
const DOM: GovPlace = { ...BLOK, kind: 'dom', blocks: 0, houses: 3, near: 'domy', garages: null };

const def = M1_EVENTS.find((e) => e.id === 'posel')!;

/** wejście zarządu: dzień 5, 10:00, osada z północy; atrapa dokłada resztę */
function wejscie(over: Partial<GovInput> = {}, seed = 1): GovInput {
  return { ...new Atrapa(seed).input(), day: 5, hour: 10, minute: 0, screen: 5000, osada: osadaWej(), ...over };
}

/** Zarząd po ciszy pierwszego dnia, bez zaległych okien i z losowaniem kart odsuniętym w nieskończoność: widać tylko to, co
    przychodzi z sytuacji (karta nocy, wieczorne zebranie i raport nie przeszkadzają, bo ich doby są już policzone). */
function zarzad(dzien: number, seed = 1, tryb: 'zwykly' | 'zombie' = 'zwykly'): GovState {
  const gov = newGov(seed, tryb);
  gov.ev.warm = 0;
  gov.ev.next = 1e12;
  gov.cardDay = dzien;
  gov.lawDay = dzien;
  return gov;
}

/** czy po jednym kroku zarządu czeka karta posła */
function czekaPosel(gov: GovState, i: GovInput): boolean {
  govUpdate(gov, i);
  return gov.ev.active?.id === 'posel';
}

/** zarząd z czekającą kartą posła (przez ten sam krok zarządu, który ją wystawia w grze) i wejście, z którym czeka */
function zKarta(over: Partial<GovInput> = {}, seed = 1) {
  const gov = zarzad(over.day ?? 5, seed);
  const i = wejscie(over, seed);
  govUpdate(gov, i);
  expect(gov.ev.active?.id, 'karta posła ma czekać').toBe('posel');
  return { gov, i };
}

/** host zarządu i dane karty z `make`, bez wystawiania jej przez zarząd (teksty, wybory) */
function hostKarty(over: Partial<GovInput> = {}, seed = 1) {
  const gov = newGov(seed);
  const i = wejscie(over, seed);
  const fx = emptyEffects();
  const h = makeHost(gov, i, fx);
  const d = def.make(h)!;
  expect(d, 'make ma dać dane karty').not.toBeNull();
  return { gov, i, fx, h, d };
}

const polskaKarta = (over: Partial<GovInput> = {}) => {
  const { h, d } = hostKarty(over);
  return { title: def.title(h, d).pl, text: def.text(h, d).pl, choices: def.choices(h, d).map((c) => c.label.pl) };
};
const angielskaKarta = (over: Partial<GovInput> = {}) => {
  const { h, d } = hostKarty(over);
  return { title: def.title(h, d).en, text: def.text(h, d).en, choices: def.choices(h, d).map((c) => c.label.en) };
};

// ---------------------------------------------------------------------------------------------------------------------
// Przebieg na atrapie: nasz zarząd gra dni z osadą w wejściu i odpowiada na wszystko pierwszym wyborem
// ---------------------------------------------------------------------------------------------------------------------

interface Posel {
  dzien: number;
  godzina: number;
  minuta: number;
  dane: DanePosla;
}

/** Gra zarządu na atrapie. Gospodarz tej gry (jak main.ts) trzyma stan osady: `odkryta` zmienia się dopiero po skutku
    `odkryjOsade`, a każdy taki skutek trafia do `odkrycia`. `osada` null to gra bez osady (wejście bez pola). */
class Gra {
  gov: GovState;
  atr: Atrapa;
  r: Rng;
  odkryta = false;
  odkrycia: OdkrycieOsady[] = [];
  posly: Posel[] = [];

  private readonly osada: Partial<WejscieOsady> | null;
  private readonly odkrywaj: boolean;

  constructor(seed: number, osada: Partial<WejscieOsady> | null, lancuchy = false, odkrywaj = true) {
    this.gov = newGov(seed, 'zwykly', lancuchy);
    this.atr = new Atrapa(seed);
    this.r = mulberry(seed ^ 0x51ed);
    this.osada = osada;
    this.odkrywaj = odkrywaj;
    this.odkryta = osada?.odkryta ?? false;
  }

  input(): GovInput {
    return {
      ...this.atr.input(),
      ...(this.osada ? { osada: osadaWej({ ...this.osada, odkryta: this.odkryta }) } : {}),
    };
  }

  minuta(): number {
    return at(this.atr.day, this.atr.hour, this.atr.minute);
  }

  /** gra do minuty `doMin`; z `stojNaPoslu` staje na karcie posła, zanim ktoś na nią odpowie (zwraca true) */
  graj(doMin: number, stojNaPoslu = false): boolean {
    while (this.minuta() < doMin) {
      this.atr.tick++;
      if (this.atr.tick % TPH === 0) this.atr.hourly(lawEffects(this.gov).foodMult);
      if (this.atr.tick % TPS !== 0) continue;
      this.atr.apply(govUpdate(this.gov, this.input()));
      for (let k = 0; k < 5; k++) {
        const p = pending(this.gov, this.input());
        if (!p) break;
        if (p.k === 'wydarzenie' && p.id === 'posel') {
          this.posly.push({
            dzien: this.atr.day,
            godzina: this.atr.hour,
            minuta: this.atr.minute,
            dane: structuredClone(this.gov.ev.active!.d as DanePosla),
          });
          if (stojNaPoslu) return true;
          const fx = chooseEvent(this.gov, this.input(), 0);
          if (fx.odkryjOsade) {
            this.odkrycia.push(fx.odkryjOsade);
            if (this.odkrywaj) this.odkryta = true;
          }
          this.atr.apply(fx);
          continue;
        }
        answer(this.gov, this.atr, p, 'propozycja', this.r);
      }
    }
    return false;
  }

  /** kopia gry po zapisie i wczytaniu zarządu (atrapa i gospodarz kopiowane wprost) */
  poZapisie(): Gra {
    const k = new Gra(this.gov.seed, this.osada, !!this.gov.lancuchy, this.odkrywaj);
    k.gov = loadGov(saveGov(this.gov));
    k.atr = this.atr.clone();
    k.r = this.r;
    k.odkryta = this.odkryta;
    return k;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Kiedy poseł przychodzi
// ---------------------------------------------------------------------------------------------------------------------

describe('poseł z osady: kiedy przychodzi', () => {
  it('karta jest zwykłą kartą zarządu ze stałymi zasadami: id posel, tylko zwykły tryb, dzień i wieczór, poza losowaniem', () => {
    expect(def).toBe(POSEL_EVENT);
    expect(def.id).toBe('posel');
    expect(def.tryby).toEqual(['zwykly']);
    expect([...def.when].sort()).toEqual(['dzien', 'wieczor']);
    expect(def.once).toBe(true);
    // waga zero: nie wchodzi do puli losowania w żadnej chwili (przychodzi z sytuacji)
    for (const over of [{}, { osada: undefined }, { hour: 21 }, { place: DOM }, { osada: osadaWej({ odkryta: true }) }])
      expect(def.w(makeHost(newGov(1), wejscie(over), emptyEffects()))).toBe(0);
  });

  it('dzień kontaktu to 4, 5 albo 6, z ziarna osady: cztery trzy, pierwszy dzień i godzina w stałych', () => {
    expect(PIERWSZY_DZIEN_KONTAKTU).toBe(4);
    expect(DNI_KONTAKTU).toBe(3);
    expect(GODZINA_POSLA).toBe(9);
    expect([0, 1, 2, 3, 4, 5, 3000000000, 3000000001, 3000000002].map(dzienKontaktu)).toEqual([
      4, 5, 6, 4, 5, 6, 4, 5, 6,
    ]);
    const dni = new Set(Array.from({ length: 60 }, (_, k) => dzienKontaktu(Number.parseInt(hashString(`z${k}`), 16))));
    expect([...dni].sort()).toEqual([4, 5, 6]);
  });

  it.each([4, 5, 6])('w dniu kontaktu %i: o 8:59 nic, o 9:00 karta posła (bez losowania kart)', (dzien) => {
    const gov = zarzad(dzien);
    const osada = osadaWej({ dzienKontaktu: dzien });
    expect(czekaPosel(gov, wejscie({ day: dzien, hour: 8, minute: 59, osada }))).toBe(false);
    expect(gov.ev.done.posel).toBeUndefined();
    expect(czekaPosel(gov, wejscie({ day: dzien, hour: 9, minute: 0, osada }))).toBe(true);
    expect(gov.ev.done.posel).toBe(true);
  });

  it('nic w dniach przed dniem kontaktu, o żadnej porze', () => {
    for (const dzien of [4, 5, 6]) {
      const gov = zarzad(dzien - 1);
      for (const hour of [9, 12, 17, 19, 21])
        expect(czekaPosel(gov, wejscie({ day: dzien - 1, hour, osada: osadaWej({ dzienKontaktu: dzien }) }))).toBe(
          false,
        );
    }
  });

  it('nigdy przed 4. dniem, nawet gdy wejście podaje wcześniejszy dzień kontaktu', () => {
    const osada = osadaWej({ dzienKontaktu: 1 });
    for (const dzien of [1, 2, 3]) {
      const gov = zarzad(dzien);
      for (const hour of [9, 10, 15, 21]) expect(czekaPosel(gov, wejscie({ day: dzien, hour, osada }))).toBe(false);
      expect(gov.ev.done.posel).toBeUndefined();
    }
    expect(czekaPosel(zarzad(4), wejscie({ day: 4, hour: 9, osada }))).toBe(true);
  });

  it('nie przychodzi w nocy ani przed 9:00, a wieczorem tak', () => {
    for (const hour of [22, 23, 0, 3, 5, 6, 7, 8])
      expect(czekaPosel(zarzad(5), wejscie({ day: 5, hour, minute: 30 })), `godzina ${hour}`).toBe(false);
    // dzień po dniu kontaktu: przed 9:00 też nic (karta czeka na swoją godzinę)
    expect(czekaPosel(zarzad(6), wejscie({ day: 6, hour: 8, minute: 30 }))).toBe(false);
    expect(czekaPosel(zarzad(5), wejscie({ day: 5, hour: 21, minute: 30 }))).toBe(true);
  });

  it('opóźniona przychodzi, gdy tylko wolno: w dniu po dniu kontaktu od 9:00', () => {
    const gov = zarzad(6);
    expect(czekaPosel(gov, wejscie({ day: 6, hour: 9, minute: 0 }))).toBe(true);
  });

  it('wystawia dokładnie raz: po wystawieniu i po odpowiedzi nie wraca, nawet gdy gospodarz zapomni odkryć osadę', () => {
    const { gov, i } = zKarta();
    chooseEvent(gov, i, 0);
    expect(gov.ev.active).toBeNull();
    for (let dzien = 5; dzien <= 12; dzien++)
      for (const hour of [9, 10, 14, 18, 21]) {
        govUpdate(gov, wejscie({ day: dzien, hour, screen: 5000 + dzien * 1000 + hour }));
        expect(gov.ev.active?.id ?? '', `dzień ${dzien} ${hour}:00`).not.toBe('posel');
        gov.ev.active = null;
      }
  });

  it('nie przychodzi, gdy czeka uchwała, raport albo inna karta, tylko po nich', () => {
    for (const blokada of ['uchwala', 'raport', 'karta'] as const) {
      const gov = zarzad(5);
      if (blokada === 'uchwala') gov.lawPending = true;
      if (blokada === 'raport')
        gov.report = {
          day: 4,
          lines: [tx('x', 'x')],
          raid: 'brak',
          stolen: emptyEffects().stock,
          loot: emptyEffects().stock,
          hurt: [],
          tired: [],
          trust: 50,
          anger: 20,
          dTrust: 0,
          dAnger: 0,
        };
      if (blokada === 'karta') gov.ev.active = { id: 'dym', d: { lok: undefined } };
      const i = wejscie({ day: 5, hour: 10 });
      govUpdate(gov, i);
      expect(gov.ev.done.posel, blokada).toBeUndefined();
      expect(gov.ev.active?.id ?? '', blokada).not.toBe('posel');
      gov.lawPending = false;
      gov.report = null;
      gov.ev.active = null;
      expect(czekaPosel(gov, { ...i, screen: i.screen + 1 }), `po ${blokada}`).toBe(true);
    }
  });

  it('po decyzji gracza czeka QUIET sekund przy ekranie, nie wchodzi drugim oknem z rzędu', () => {
    const gov = zarzad(5);
    gov.decisions.push({ s: 4990, k: 'wydarzenie' });
    expect(czekaPosel(gov, wejscie({ screen: 4990 + QUIET - 1 }))).toBe(false);
    expect(czekaPosel(gov, wejscie({ screen: 4990 + QUIET }))).toBe(true);
  });

  it('tylko gdy wejście ma osadę i jest nieodkryta: bez pola, z odkrytą i w trybie zombie karty nie ma', () => {
    const dziesiec = (gov: GovState, osada: WejscieOsady | undefined) => {
      for (let dzien = 4; dzien <= 10; dzien++)
        for (const hour of [9, 12, 19, 21])
          if (czekaPosel(gov, wejscie({ day: dzien, hour, screen: 5000 + dzien * 100 + hour, osada }))) return true;
      return false;
    };
    expect(dziesiec(zarzad(4), undefined)).toBe(false);
    expect(dziesiec(zarzad(4), osadaWej({ odkryta: true }))).toBe(false);
    expect(dziesiec(zarzad(4, 1, 'zombie'), osadaWej())).toBe(false);
    expect(dziesiec(zarzad(4), osadaWej())).toBe(true);
  });

  it('w pełnej grze na atrapie: jedna karta, w dniu kontaktu od 9:00, w dzień (przed zebraniem i kartą nocy)', () => {
    for (const dzien of [4, 5, 6])
      for (const seed of [1, 2, 3, 4])
        for (const lancuchy of [false, true]) {
          const g = new Gra(seed, { dzienKontaktu: dzien }, lancuchy);
          g.graj(at(dzien + 2, 7));
          const opis = `kontakt w dniu ${dzien}, ziarno ${seed}, łańcuchy ${lancuchy}`;
          expect(g.posly.length, opis).toBe(1);
          const p = g.posly[0];
          expect(p.dzien, opis).toBe(dzien);
          expect(p.godzina, opis).toBeGreaterThanOrEqual(9);
          expect(p.godzina, opis).toBeLessThan(19);
          expect(p.dane).toMatchObject({ dzien, ludnosc: 23, budowle: 6 });
          expect(g.odkrycia, opis).toEqual([{ dzien, ludnosc: 23, budowle: 6 }]);
          expect(g.odkryta).toBe(true);
        }
  });

  it('gospodarz, który nie odkrywa osady, i tak widzi jedną kartę (powtórek pilnuje stan zarządu, nie osady)', () => {
    const g = new Gra(2, { dzienKontaktu: 4 }, false, false);
    g.graj(at(10, 7));
    expect(g.posly.length).toBe(1);
    expect(g.odkryta).toBe(false);
  });

  it('bez osady w wejściu przez dziesięć dób ani jednej karty posła, a z odkrytą osadą też', () => {
    const bez = new Gra(3, null);
    bez.graj(at(10, 7));
    expect(bez.posly).toEqual([]);
    expect(bez.gov.ev.done.posel).toBeUndefined();
    const odkryta = new Gra(3, { odkryta: true });
    odkryta.graj(at(10, 7));
    expect(odkryta.posly).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Wybory karty
// ---------------------------------------------------------------------------------------------------------------------

describe('poseł z osady: wybory', () => {
  it('trzy wybory, wszystkie dostępne, po polsku i po angielsku', () => {
    const { h, d } = hostKarty();
    const wybory = def.choices(h, d);
    expect(wybory.map((c) => c.ok)).toEqual([true, true, true]);
    expect(wybory.map((c) => c.label.pl)).toEqual([
      'Wysłuchać go przy bramie',
      'Zaprosić do środka na herbatę z pokrzyw',
      'Podziękować i odprawić',
    ]);
    expect(wybory.map((c) => c.label.en)).toEqual([
      'Hear him out at the gate',
      'Invite him in for nettle tea',
      'Thank him and send him away',
    ]);
  });

  it.each([0, 1, 2])('wybór %i odsłania osadę z liczbami, które poseł podał (dzień, ludność, budowle)', (k) => {
    const { gov, i } = zKarta({ osada: osadaWej({ ludnosc: 31, budowle: 4 }) });
    const fx = chooseEvent(gov, i, k);
    expect(fx.odkryjOsade).toEqual({ dzien: 5, ludnosc: 31, budowle: 4 });
    expect(gov.ev.active).toBeNull();
    expect(gov.ev.done.posel).toBe(true);
  });

  it('liczby w skutku to te z chwili wystawienia karty, nie z chwili odpowiedzi', () => {
    const { gov, i } = zKarta({ osada: osadaWej({ ludnosc: 23, budowle: 6 }) });
    // do odpowiedzi osada urosła i dzień minął, ale poseł powiedział to, co powiedział
    const pozniej = wejscie({ day: 6, hour: 8, osada: osadaWej({ ludnosc: 40, budowle: 9 }) });
    const fx = chooseEvent(gov, { ...i, ...pozniej }, 2);
    expect(fx.odkryjOsade).toEqual({ dzien: 5, ludnosc: 23, budowle: 6 });
  });

  it('wybory ruszają tylko zaufanie, wkurzenie i kronikę: ani zapasów, ani ludzi, ani nastrojów, ani napadu', () => {
    const skutki = [
      { trust: +1, anger: 0 },
      { trust: +2, anger: +1 },
      { trust: -1, anger: 0 },
    ];
    skutki.forEach((s, k) => {
      const { gov, i } = zKarta();
      const t0 = gov.trust;
      const a0 = gov.anger;
      const fx = chooseEvent(gov, i, k);
      expect(gov.trust - t0, `zaufanie, wybór ${k}`).toBe(s.trust);
      expect(gov.anger - a0, `wkurzenie, wybór ${k}`).toBe(s.anger);
      expect(
        Object.values(fx.stock).every((v) => v === 0),
        `zapasy, wybór ${k}`,
      ).toBe(true);
      expect(fx.needs).toEqual([]);
      expect(fx.moods).toEqual([]);
      expect(fx.join).toEqual([]);
      expect(fx.leave).toEqual([]);
      expect(fx.residents).toBe(0);
      expect(fx.sick).toBe(0);
      expect(fx.patch).toBe(0);
      expect(fx.fire).toBe(false);
      expect(fx.raid).toBeNull();
      expect(fx.guards).toEqual([]);
      expect(fx.gosc).toBeUndefined();
      expect(fx.zwierze).toBeUndefined();
      expect(gov.later).toEqual([]);
      expect(gov.flags).toEqual({ dog: false, flashlight: false, torch: false });
      // dwa wpisy w kronice: wybór (tytuł: napis) i skutek
      expect(fx.log.length, `kronika, wybór ${k}`).toBe(2);
    });
  });

  it('kronika: wpis o wyborze z tytułem karty i wpis o tym, co się stało, z nazwą osady i kierunkiem', () => {
    const logi = [0, 1, 2].map((k) => {
      const { gov, i } = zKarta();
      const przed = gov.log.length;
      chooseEvent(gov, i, k);
      return gov.log.slice(przed).map((l) => l.txt);
    });
    for (const [k, wpisy] of logi.entries()) {
      expect(wpisy.length, `wybór ${k}`).toBe(2);
      expect(wpisy[0].pl).toMatch(/^Poseł z osady na północy: /);
      expect(wpisy[0].en).toMatch(/^An envoy from the settlement to the north: /);
      expect(wpisy[1].pl, `wybór ${k}`).toMatch(/^Osada na północy: poseł /);
      expect(wpisy[1].en, `wybór ${k}`).toMatch(/^Settlement to the north: the envoy /);
    }
    expect(logi[0][1].pl).toContain('Teraz wiecie, co leży na północ od was.');
    expect(logi[0][1].en).toContain('Now you know what lies to the north of you.');
    expect(logi[1][1].pl).toContain('herbaty z pokrzyw');
    expect(logi[2][1].pl).toContain('wiecie już, co leży na północ od was');
    expect(logi[2][1].en).toContain('left without his tea');
  });

  it('po odpowiedzi odstęp do następnej karty liczy się jak po każdej decyzji: wpis o decyzji i zwykły odstęp między kartami', () => {
    const { gov, i } = zKarta();
    gov.ev.next = 0;
    chooseEvent(gov, i, 0);
    expect(gov.decisions.at(-1)).toEqual({ s: i.screen, k: 'wydarzenie' });
    expect(gov.ev.next).toBeGreaterThanOrEqual(i.screen + GAP_PO);
    expect(gov.ev.next).toBeLessThan(i.screen + GAP_PO + GAP_ROZRZUT);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Tekst karty
// ---------------------------------------------------------------------------------------------------------------------

describe('poseł z osady: tekst', () => {
  it('tytuł z nazwą osady (z kierunku), obok kierunek i to, co poseł mówi: ludność i budowle w chwili kontaktu', () => {
    const k = polskaKarta();
    expect(k.title).toBe('Poseł z osady na północy');
    const [scena, osada] = k.text.split('\n');
    expect(scena).toBe(
      'Pod bramą stoi obcy z białą szmatą na kiju. Na piersi ma plakietkę „Poseł”, wydrukowaną chyba na ostatnim tuszu w okolicy. Przyszedł się przedstawić, bo sąsiadów wypada znać, i prosi o rozmowę z zarządem.',
    );
    expect(osada).toBe('Mówi, że jego osada leży na północ od was. Mieszkają tam 23 osoby i stoi 6 budowli.');
    const e = angielskaKarta();
    expect(e.title).toBe('An envoy from the settlement to the north');
    const [scenaEn, osadaEn] = e.text.split('\n');
    expect(scenaEn).toBe(
      'A stranger is standing at the gate with a white rag on a stick. His badge says “Envoy”, printed with what must be the last ink in the area. He has come to introduce himself, because it pays to know your neighbours, and he asks to speak to the board.',
    );
    expect(osadaEn).toBe(
      'He says their settlement lies to the north of you, with 23 people living there and 6 buildings standing.',
    );
  });

  it('kierunek idzie z gry: inna strona świata, inny tytuł i zdanie', () => {
    const { kierunek, nazwaZ, nazwa } = { ...nazwaOsady(1, 1), kierunek: kierunekOsady(1, 1).kierunek };
    const k = polskaKarta({ osada: osadaWej({ nazwa, nazwaZ, kierunek }) });
    expect(k.title).toBe('Poseł z osady na południowym wschodzie');
    expect(k.text).toContain('leży na południowy wschód od was');
    const e = angielskaKarta({ osada: osadaWej({ nazwa, nazwaZ, kierunek }) });
    expect(e.title).toBe('An envoy from the settlement to the south-east');
    expect(e.text).toContain('lies to the south-east of you');
  });

  it.each([
    [1, 'Mieszka tam 1 osoba', '1 person living there'],
    [2, 'Mieszkają tam 2 osoby', '2 people living there'],
    [4, 'Mieszkają tam 4 osoby', '4 people living there'],
    [5, 'Mieszka tam 5 osób', '5 people living there'],
    [12, 'Mieszka tam 12 osób', '12 people living there'],
    [22, 'Mieszkają tam 22 osoby', '22 people living there'],
    [25, 'Mieszka tam 25 osób', '25 people living there'],
  ])('ludność %i: polska liczba mnoga i zgoda czasownika, angielska liczba', (n, pol, ang) => {
    const over = { osada: osadaWej({ ludnosc: n }) };
    expect(polskaKarta(over).text).toContain(pol);
    expect(angielskaKarta(over).text).toContain(ang);
  });

  it.each([
    [1, 'stoi 1 budowla', '1 building standing'],
    [2, 'stoją 2 budowle', '2 buildings standing'],
    [3, 'stoją 3 budowle', '3 buildings standing'],
    [5, 'stoi 5 budowli', '5 buildings standing'],
    [14, 'stoi 14 budowli', '14 buildings standing'],
    [23, 'stoją 23 budowle', '23 buildings standing'],
  ])('budowle %i: polska liczba mnoga i zgoda czasownika, angielska liczba', (n, pol, ang) => {
    const over = { osada: osadaWej({ budowle: n }) };
    expect(polskaKarta(over).text).toContain(`i ${pol}.`);
    expect(angielskaKarta(over).text).toContain(`and ${ang}.`);
  });

  it('bez budowli: nic jeszcze nie postawili (nie „stoi 0 budowli”)', () => {
    const over = { osada: osadaWej({ budowle: 0 }) };
    expect(polskaKarta(over).text).toContain('Mieszkają tam 23 osoby, ale nic jeszcze nie postawili.');
    expect(angielskaKarta(over).text).toContain('with 23 people living there and nothing built yet.');
    expect(polskaKarta(over).text).not.toMatch(/\b0 budowli/);
  });

  it('w bloku brama i zarząd, w domu furtka i komitet ulicy (słowa ze słownika miejsca), w obu językach', () => {
    const blok = { pl: polskaKarta({ place: BLOK }), en: angielskaKarta({ place: BLOK }) };
    expect(blok.pl.text).toContain('Pod bramą stoi obcy');
    expect(blok.pl.text).toContain('rozmowę z zarządem.');
    expect(blok.pl.choices[0]).toBe('Wysłuchać go przy bramie');
    expect(blok.en.text).toContain('standing at the gate');
    expect(blok.en.text).toContain('speak to the board.');
    expect(blok.en.choices[0]).toBe('Hear him out at the gate');
    const dom = { pl: polskaKarta({ place: DOM }), en: angielskaKarta({ place: DOM }) };
    expect(dom.pl.text).toContain('Pod furtką stoi obcy');
    expect(dom.pl.text).toContain('rozmowę z komitetem ulicy.');
    expect(dom.pl.choices[0]).toBe('Wysłuchać go przy furtce');
    expect(dom.en.text).toContain('standing at the garden gate');
    expect(dom.en.text).toContain('speak to the street committee.');
    expect(dom.en.choices[0]).toBe('Hear him out at the garden gate');
    // reszta tekstu ta sama w obu miejscach
    expect(dom.pl.title).toBe(blok.pl.title);
    expect(dom.pl.text.split('\n')[1]).toBe(blok.pl.text.split('\n')[1]);
  });

  it('w domu żaden napis karty (tytuł, tekst, wybory, kronika) nie mówi o bloku, klatce ani spółdzielni', () => {
    for (const ustaw of [{ place: DOM }, { place: { ...DOM, shop: 70 } }]) {
      for (const osada of [
        osadaWej(),
        osadaWej({ odwolania: 2 }),
        osadaWej({ upadla: { dzien: 5, powod: 'pustka' } }),
        osadaWej({ upadla: { dzien: 4, powod: 'exodus' } }),
        osadaWej({ budowle: 0, ludnosc: 1 }),
      ]) {
        const w = { ...ustaw, osada };
        const k = polskaKarta(w);
        const teksty = [k.title, k.text, ...k.choices];
        for (let n = 0; n < 3; n++) {
          const { gov, i } = zKarta(w);
          const przed = gov.log.length;
          chooseEvent(gov, i, n);
          teksty.push(...gov.log.slice(przed).map((l) => pl(l.txt)));
        }
        for (const t of teksty) expect(t).not.toMatch(FORBIDDEN_DOM);
      }
    }
  });

  it('po angielsku bez polskich słów i polskich liter we wszystkich napisach karty i kroniki', () => {
    for (const place of [BLOK, DOM])
      for (const osada of [
        osadaWej(),
        osadaWej({ odwolania: 1 }),
        osadaWej({ odwolania: 3 }),
        osadaWej({ upadla: { dzien: 5, powod: 'pustka' } }),
        osadaWej({ upadla: { dzien: 4, powod: 'exodus' } }),
        osadaWej({ ludnosc: 1, budowle: 0 }),
      ]) {
        const { h, d } = hostKarty({ place, osada });
        const teksty = [def.title(h, d).en, def.text(h, d).en, ...def.choices(h, d).map((c) => c.label.en)];
        for (let n = 0; n < 3; n++) {
          const { gov, i } = zKarta({ place, osada });
          const przed = gov.log.length;
          chooseEvent(gov, i, n);
          teksty.push(...gov.log.slice(przed).map((l) => l.txt.en));
        }
        for (const t of teksty) expect(polskieSlowa(t), t).toEqual([]);
      }
  });

  it('cudzysłowy polskie w polskim tekście i angielskie w angielskim, bez prostych i bez pauz', () => {
    const { h, d } = hostKarty();
    const pol = def.text(h, d).pl;
    const ang = def.text(h, d).en;
    expect(pol).toContain('„Poseł”');
    expect(ang).toContain('“Envoy”');
    for (const t of [pol, ang, def.title(h, d).pl, def.title(h, d).en]) {
      expect(t).not.toContain('"');
      expect(t).not.toMatch(/[—–]/);
    }
  });

  it('odwołanie zarządu osady przed kontaktem: jedno zdanie z liczby odwołań, nic ponad to', () => {
    const o = (n: number) => ({ osada: osadaWej({ odwolania: n }) });
    expect(polskaKarta(o(1)).text.split('\n')[1]).toBe(
      'Mówi, że jego osada leży na północ od was. Mieszkają tam 23 osoby i stoi 6 budowli. Dodaje, że ich zarząd odwołano już raz.',
    );
    expect(polskaKarta(o(2)).text).toContain('Dodaje, że ich zarząd odwołano już dwa razy.');
    expect(polskaKarta(o(3)).text).toContain('Dodaje, że ich zarząd odwołano już 3 razy.');
    expect(polskaKarta(o(0)).text).not.toContain('odwołano');
    expect(angielskaKarta(o(1)).text.split('\n')[1]).toBe(
      'He says their settlement lies to the north of you, with 23 people living there and 6 buildings standing. He adds that their board has already been recalled once.',
    );
    expect(angielskaKarta(o(2)).text).toContain('has already been recalled twice.');
    expect(angielskaKarta(o(3)).text).toContain('has already been recalled 3 times.');
    // w domu ich organ nazywa się tak jak nasz: komitet
    expect(polskaKarta({ ...o(1), place: DOM }).text).toContain('ich komitet odwołano już raz');
    expect(angielskaKarta({ ...o(1), place: DOM }).text).toContain('their committee has already been recalled once');
  });

  it('osada upadła: poseł mówi o upadku w dniu i z powodu, bez liczb ludności i budowli', () => {
    const upadek = (powod: 'pustka' | 'exodus') => ({ osada: osadaWej({ upadla: { dzien: 5, powod }, odwolania: 1 }) });
    const pustka = polskaKarta(upadek('pustka')).text.split('\n')[1];
    expect(pustka).toBe(
      'Mówi, że jego osada leżała na północ od was, ale już jej nie ma. Upadła w dniu 5: nikt tam nie przeżył.',
    );
    expect(polskaKarta(upadek('exodus')).text.split('\n')[1]).toBe(
      'Mówi, że jego osada leżała na północ od was, ale już jej nie ma. Upadła w dniu 5: ludzie przestali wierzyć i rozeszli się.',
    );
    expect(angielskaKarta(upadek('pustka')).text.split('\n')[1]).toBe(
      'He says their settlement lay to the north of you, but it is gone now. It fell on day 5: nobody there survived.',
    );
    expect(angielskaKarta(upadek('exodus')).text.split('\n')[1]).toBe(
      'He says their settlement lay to the north of you, but it is gone now. It fell on day 5: the people lost faith and scattered.',
    );
    for (const t of [polskaKarta(upadek('pustka')).text, angielskaKarta(upadek('exodus')).text]) {
      expect(t).not.toMatch(/23|budowl|buildings|odwołano|recalled/);
    }
  });

  it('upadek i odwołania odsłaniają osadę tak samo: skutek ma te same trzy liczby', () => {
    const { gov, i } = zKarta({ osada: osadaWej({ upadla: { dzien: 4, powod: 'exodus' }, ludnosc: 0, budowle: 2 }) });
    expect(chooseEvent(gov, i, 1).odkryjOsade).toEqual({ dzien: 5, ludnosc: 0, budowle: 2 });
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Zapis w połowie
// ---------------------------------------------------------------------------------------------------------------------

describe('poseł z osady: zapis i wczytanie', () => {
  it('karta czeka w stanie zarządu: po zapisie i wczytaniu to samo okno, ten sam skutek wyboru, ten sam dalszy przebieg', () => {
    const g = new Gra(3, { dzienKontaktu: 5 });
    expect(g.graj(at(8, 7), true), 'karta ma czekać').toBe(true);
    const p1 = pending(g.gov, g.input());
    expect(p1).toMatchObject({ k: 'wydarzenie', id: 'posel' });
    const k = g.poZapisie();
    const p2 = pending(k.gov, k.input());
    expect(p2).toEqual(p1);
    // karta niesie swoje dane, więc czeka tak samo, gdy wejście osady już nie ma (osada nie wczytała się, tryb bez flagi)
    const bezOsady = { ...k.atr.input() };
    expect(pending(k.gov, bezOsady)).toEqual(p1);
    // ta sama odpowiedź, ten sam skutek, ten sam stan
    for (const wybor of [0, 1, 2]) {
      const a = g.poZapisie();
      const b = g.poZapisie();
      const fa = chooseEvent(a.gov, a.input(), wybor);
      const fb = chooseEvent(b.gov, { ...b.atr.input() }, wybor);
      expect(fb).toEqual(fa);
      expect(saveGov(b.gov)).toBe(saveGov(a.gov));
    }
    // dalszy przebieg obu gier (z kartą bez odpowiedzi w obu) jest ten sam i kart jest jedna
    const a = g.poZapisie();
    const b = g.poZapisie();
    a.graj(at(10, 7));
    b.graj(at(10, 7));
    expect(saveGov(b.gov)).toBe(saveGov(a.gov));
    expect(a.posly.length + b.posly.length).toBe(2);
    expect(a.odkrycia).toEqual(b.odkrycia);
  });

  it('zapis po odpowiedzi: wczytana gra nie pokazuje karty drugi raz, nawet jeśli osada w wejściu wciąż nieodkryta', () => {
    const g = new Gra(4, { dzienKontaktu: 4 });
    g.graj(at(5, 7));
    expect(g.posly.length).toBe(1);
    const k = g.poZapisie();
    k.odkryta = false;
    k.graj(at(9, 7));
    expect(k.posly).toEqual([]);
  });

  it('dane karty są zwykłym JSON-em w obu językach: zapis nie gubi ani nie zmienia tekstów', () => {
    const { gov } = zKarta();
    const d = gov.ev.active!.d as DanePosla;
    expect(JSON.parse(JSON.stringify(d))).toEqual(d);
    for (const t of [d.nazwa, d.nazwaZ, d.kierunek]) {
      expect(typeof t.pl).toBe('string');
      expect(typeof t.en).toBe('string');
    }
    const wczytany = loadGov(saveGov(gov));
    expect(wczytany.ev.active).toEqual(gov.ev.active);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Gra bez osady jest dzisiejsza
// ---------------------------------------------------------------------------------------------------------------------

/** Skróty stanu zarządu (`hashString(saveGov(gov))`) po siedmiu dobach na atrapie, z gry sprzed tej zmiany (HEAD c8454c32): ziarno,
    polityka gracza, łańcuchy kart włączone albo nie. Przypięte jako liczby, bo test determinizmu zarządu (zarzad.test.ts) porównuje
    przebiegi tylko ze sobą i nie zauważyłby, że karta posła przestawiła losowania w grze bez osady. */
const SKROTY_PRZED: readonly [number, 'losowo' | 'nigdy-warty' | 'propozycja', boolean, string][] = [
  [1, 'losowo', false, '28d4771d'],
  [1, 'losowo', true, '316416b3'],
  [1, 'nigdy-warty', false, 'ce6e3de8'],
  [1, 'nigdy-warty', true, '15e699e6'],
  [1, 'propozycja', false, 'ee7a5970'],
  [1, 'propozycja', true, '92286963'],
  [2, 'losowo', false, '353b01a4'],
  [2, 'losowo', true, 'f59d48d2'],
  [2, 'nigdy-warty', false, 'c9c02da6'],
  [2, 'nigdy-warty', true, '7cea096b'],
  [2, 'propozycja', false, 'f555eed4'],
  [2, 'propozycja', true, 'e3eb499d'],
  [3, 'losowo', false, 'a8b6716a'],
  [3, 'losowo', true, 'eb759964'],
  [3, 'nigdy-warty', false, '3a0baab6'],
  [3, 'nigdy-warty', true, 'd0c7a62a'],
  [3, 'propozycja', false, '96c43df9'],
  [3, 'propozycja', true, '8774945f'],
];

describe('gra bez osady jest bajt w bajt dzisiejsza', () => {
  it('skróty stanu zarządu z przebiegów na atrapie (siedem dób, trzy polityki, z łańcuchami i bez) są takie jak przed zmianą', () => {
    for (const [seed, polityka, lancuchy, skrot] of SKROTY_PRZED) {
      const r = run(seed, polityka, at(7, 7), undefined, lancuchy);
      expect(hashString(saveGov(r.gov)), `${seed} ${polityka} ${lancuchy ? 'łańcuchy' : 'bez'}`).toBe(skrot);
    }
  });

  it('żadna karta z wagą większą od zera w żadnej chwili gry bez osady nie jest kartą posła: pula losowania jest ta sama', () => {
    const wagi = new Set<string>();
    for (const seed of [1, 2, 3])
      for (const hour of [9, 12, 16, 20, 23]) {
        const h = makeHost(
          newGov(seed),
          { ...new Atrapa(seed).input(), day: 5, hour, screen: 5000, kozaLit: true },
          emptyEffects(),
        );
        for (const e of M1_EVENTS) if (e.w(h) > 0) wagi.add(e.id);
      }
    expect(wagi.has('posel')).toBe(false);
    expect(wagi.size).toBeGreaterThan(20);
  });

  it('z osadą w wejściu przed godziną kontaktu stan zarządu jest ten sam co bez osady: karta nie losuje i nie zużywa losowań', () => {
    for (const lancuchy of [false, true])
      for (const seed of [1, 2, 5]) {
        const z = new Gra(seed, { dzienKontaktu: 6 }, lancuchy);
        const bez = new Gra(seed, null, lancuchy);
        z.graj(at(6, 8, 59));
        bez.graj(at(6, 8, 59));
        expect(z.posly, `ziarno ${seed}`).toEqual([]);
        expect(saveGov(z.gov), `ziarno ${seed}, łańcuchy ${lancuchy}`).toBe(saveGov(bez.gov));
      }
  });

  it('pierwszą różnicą jest sama karta posła (wpis w kronice), wcześniej stany są te same', () => {
    const z = new Gra(1, { dzienKontaktu: 5 });
    const bez = new Gra(1, null);
    z.graj(at(5, 8, 59));
    bez.graj(at(5, 8, 59));
    expect(saveGov(z.gov)).toBe(saveGov(bez.gov));
    z.graj(at(5, 19), true);
    bez.graj(at(5, 19));
    expect(z.gov.log.some((l) => l.txt.pl === 'Poseł z osady na północy')).toBe(true);
    expect(bez.gov.log.some((l) => l.txt.pl.startsWith('Poseł'))).toBe(false);
  });
});
