/* Osoby w gospodarstwach na spis 2021: rozkład wieku rejonu, pula, z której losujemy wiek, i szkice gospodarstw
   (kto jest czyim partnerem, matką, ojcem). Wiek liczymy jako `w = 2020 - rocznik`, czyli wiek w dniu spisu
   (31.03.2021) dla urodzonych po marcu i wiek na koniec 2020 roku dla wszystkich. Same `+ - * /`, porównania
   i `Math.round/floor/min/max`; losowanie tylko przez los.ts. */

import type { Rng } from '../core/rng.ts';
import { dopasujIpf } from './ipf.ts';
import { szansa, wazony } from './los.ts';
import type { GrupaWieku, KluczQx, Marginesy, TabeleGminy, TabeleKraju } from './tabele.ts';
import type { Osoba, Plec } from './typy.ts';

export const ROK_WIEKU = 2020;
export const MAX_WIEK = 100;
const WIEKI = MAX_WIEK + 1;
const GRUPY: readonly GrupaWieku[] = ['0-9', '10-19', '20-29', '30-39', '40-49', '50-59', '60-69', '70-79', '80+'];
const LICZBA_GRUP = GRUPY.length;
const PLCI: readonly Plec[] = ['M', 'K'];
const grupaWieku = (w: number): number => (w >= 80 ? 8 : Math.floor(w / 10));

/** Urodzeni od stycznia do marca (90 dni z 365) mają w dniu spisu o rok więcej, niż wynika z `2020 - rocznik`. */
const UDZIAL_I_KWARTALU = 90 / 365;

// ---------------------------------------------------------------- rozkład wieku rejonu

/** Rozkład płci i wieku `w` w rejonie: `udzial[płeć][w]` (płeć 0 = M, 1 = K, w od 0 do 100), suma po obu płciach 1,
    i sumy grup 10-letnich `grupy[płeć][grupa]` (grupa 8 to 80+). */
export interface CelWieku {
  udzial: [Float64Array, Float64Array];
  grupy: [Float64Array, Float64Array];
}

/** Ile osób dożywa wieku x (0-100) z tablicy trwania życia, względnie: l(0) = 1. Prawdopodobieństwa zgonu qx są na
    100 000. */
function dozywaja(qx: readonly number[]): Float64Array {
  const l = new Float64Array(WIEKI);
  let v = 1;
  for (let x = 0; x <= MAX_WIEK; x++) {
    l[x] = v;
    v *= 1 - (qx[x] ?? 0) / 100000;
  }
  return l;
}

/** Wiek w dniu spisu rozpisany na lata: grupa 10-letnia rejonu dzielona na dwie 5-letnie według proporcji gminy
    (`wiek2021`, bez gminy po połowie), w 5-latce po równo; 80+ do 100 lat: 80-84 i 85+ według gminy, a 85+ (bez
    gminy całe 80+) według liczby dożywających z tablicy trwania życia (miasta albo wieś). Potem przesunięcie na `w`:
    urodzeni w I kwartale mają `w` o rok mniejsze niż wiek w dniu spisu, a dzieci urodzone w I kwartale 2021 dostają
    rocznik 2020 (uproszczenie: 0,25% ludności o kwartał starsze). Zwraca `null`, gdy marginesy wieku są zerowe. */
export function celWieku(m: Marginesy, g: TabeleGminy | null, k: TabeleKraju, miejska: boolean): CelWieku | null {
  const udzial: [Float64Array, Float64Array] = [new Float64Array(WIEKI), new Float64Array(WIEKI)];
  let razem = 0;
  PLCI.forEach((plec, p) => {
    const a = new Float64Array(WIEKI + 1);
    const piatki = g?.wiek2021[plec];
    for (let i = 0; i < 8; i++) {
      const n = Math.max(0, m.wiek[plec][GRUPY[i]] || 0);
      const c1 = piatki ? piatki[2 * i] : 1;
      const c2 = piatki ? piatki[2 * i + 1] : 1;
      const pierwsza = c1 + c2 > 0 ? c1 / (c1 + c2) : 0.5;
      for (let y = 0; y < 5; y++) {
        a[10 * i + y] = (n * pierwsza) / 5;
        a[10 * i + 5 + y] = (n * (1 - pierwsza)) / 5;
      }
    }
    const l = dozywaja(k.qx[`${miejska ? 'miasta' : 'wies'}${plec}` as KluczQx]);
    let l80 = 0;
    let l85 = 0;
    for (let x = 80; x <= MAX_WIEK; x++) {
      l80 += l[x];
      if (x >= 85) l85 += l[x];
    }
    const n80 = Math.max(0, m.wiek[plec]['80+'] || 0);
    const c16 = piatki ? piatki[16] : 0;
    const c17 = piatki ? piatki[17] : 0;
    // bez gminy 80-84 według dożywających; tablica, w której nikt nie dożywa 85 lat, kończy grupę na 84
    const do84 = l85 > 0 ? (c16 + c17 > 0 ? c16 / (c16 + c17) : (l80 - l85) / l80) : 1;
    for (let x = 80; x <= MAX_WIEK; x++)
      a[x] = x < 85 ? (n80 * do84) / 5 : l85 > 0 ? (n80 * (1 - do84) * l[x]) / l85 : 0;
    const u = udzial[p];
    u[0] = a[0] + UDZIAL_I_KWARTALU * a[1];
    for (let w = 1; w <= MAX_WIEK; w++) u[w] = (1 - UDZIAL_I_KWARTALU) * a[w] + UDZIAL_I_KWARTALU * a[w + 1];
    for (let w = 0; w <= MAX_WIEK; w++) razem += u[w];
  });
  if (!(razem > 0)) return null;
  const grupy: [Float64Array, Float64Array] = [new Float64Array(LICZBA_GRUP), new Float64Array(LICZBA_GRUP)];
  for (let p = 0; p < 2; p++) {
    for (let w = 0; w <= MAX_WIEK; w++) {
      udzial[p][w] /= razem;
      grupy[p][grupaWieku(w)] += udzial[p][w];
    }
  }
  return { udzial, grupy };
}

// ---------------------------------------------------------------- pula wieku

/** Do kwot grup dodajemy tyle osób „na zapas”, rozłożonych jak rejon. W małym budynku zapas przeważa i losowanie
    idzie prawie wprost z rozkładu rejonu (rodzeństwo w tym samym wieku jest możliwe), a przy tysiącach osób pula
    wyrównuje to, co struktura rodzin przesunęła. Decyzja generatora, strojona na rejonach dem. */
const ZAPAS = 60;
/** Grupa wyczerpana ponad kwotę zostaje z taką częścią wagi, żeby okno wieku nigdy nie było puste. */
const PODLOGA = 0.02;
/** Wagi całkowite do `wazony`: udział × mnożnik × 10^8 (udział jednego rocznika to rząd 0,005). */
const SKALA = 1e8;
const WAGI: number[] = [];

/** Kody osób w szkicu: płeć z puli albo ustalona. */
export const Z_PULI = -1;
const M = 0;
const K = 1;

/** Pula wieku dla jednego budynku albo rejonu: kwoty grup płeć × wiek 10-letni to udział rejonu × liczba osób do
    obsadzenia (plus zapas), a każda wylosowana osoba zmniejsza kwotę swojej grupy o jeden. Waga rocznika to jego
    udział w rejonie razy to, co zostało z kwoty grupy (nie mniej niż `PODLOGA`). */
export class Pula {
  private readonly cel: CelWieku;
  private readonly zostalo = new Float64Array(2 * LICZBA_GRUP);
  private readonly poczatek = new Float64Array(2 * LICZBA_GRUP);
  private readonly mnoznik = new Float64Array(2 * LICZBA_GRUP);

  /** `zapas` to osoby dodane do kwot (domyślnie `ZAPAS`); bardzo duży zapas to losowanie wprost z rozkładu rejonu. */
  constructor(cel: CelWieku, osob: number, zapas = ZAPAS) {
    this.cel = cel;
    for (let p = 0; p < 2; p++) {
      for (let gr = 0; gr < LICZBA_GRUP; gr++) {
        const v = cel.grupy[p][gr] * (osob + zapas);
        this.poczatek[p * LICZBA_GRUP + gr] = v;
        this.zostalo[p * LICZBA_GRUP + gr] = v;
      }
    }
  }

  /** Losuje płeć (`Z_PULI` albo 0 = M, 1 = K) i wiek w z przedziału [od, doW] (przycinany do 0-100). Zwraca
      `płeć * 128 + w`. Okno bez żadnej wagi (rejon bez ludzi w tym wieku) losuje po równo. */
  losuj(r: Rng, plec: number, od: number, doW: number): number {
    od = Math.max(0, Math.min(MAX_WIEK, od));
    doW = Math.max(od, Math.min(MAX_WIEK, doW));
    for (let i = 0; i < 2 * LICZBA_GRUP; i++) {
      this.mnoznik[i] = this.poczatek[i] > 0 ? Math.max(PODLOGA, this.zostalo[i] / this.poczatek[i]) : 0;
    }
    const pierwsza = plec === K ? K : M;
    const ostatnia = plec === M ? M : K;
    const dl = doW - od + 1;
    WAGI.length = 0;
    let suma = 0;
    for (let p = pierwsza; p <= ostatnia; p++) {
      const u = this.cel.udzial[p];
      for (let w = od; w <= doW; w++) {
        const v = Math.round(u[w] * this.mnoznik[p * LICZBA_GRUP + grupaWieku(w)] * SKALA);
        WAGI.push(v);
        suma += v;
      }
    }
    if (suma === 0) WAGI.fill(1);
    const i = wazony(r, WAGI);
    const p = pierwsza + Math.floor(i / dl);
    const w = od + (i % dl);
    this.zostalo[p * LICZBA_GRUP + grupaWieku(w)] -= 1;
    return p * 128 + w;
  }
}

// ---------------------------------------------------------------- rodziny i szkice gospodarstw

/** Osoba w szkicu gospodarstwa: płeć, dopuszczalny wiek i krewni, wszyscy wcześniej na liście. */
export interface Szkic {
  plec: number;
  od: number;
  do: number;
  /** Rodzice w tym gospodarstwie: matka 18-42 lata starsza, ojciec 18-50. */
  rodzice?: number[];
  /** Partner: płeć przeciwna, wiek ±5 lat. */
  partner?: number;
  /** Krewny albo współlokator: wiek ±15 lat od tej osoby. */
  obok?: number;
  /** Dziecko rodziców, którzy nie muszą mieć 60+, więc może być małoletnie (`oznaczMaloletnich`). */
  dziecko?: boolean;
}

/** Wagi rodzin rejonu: pary bez dzieci i z dziećmi (małżeństwa i związki razem), samotne matki i ojcowie, liczba
    dzieci 1, 2, 3, 4+ w rodzinach z dziećmi. */
export interface WagiRodzin {
  paraBez: number;
  paraZ: number;
  matka: number;
  ojciec: number;
  dzieci: [number, number, number, number];
}

export function wagiRodzin(m: Marginesy): WagiRodzin {
  const r = m.rodziny;
  const d = m.dzieci;
  return {
    paraBez: r.malzBez + r.zwBez,
    paraZ: r.malzZ + r.zwZ,
    matka: r.matka,
    ojciec: r.ojciec,
    dzieci: [d['1'], d['2'], d['3'], d['4+']],
  };
}

/** Rodzina w gospodarstwie jednorodzinnym: 0 para bez dzieci, 1 para z dziećmi, 2 matka, 3 ojciec; liczba dzieci
    i liczba pozostałych osób (dziadek albo babcia, rodzeństwo, lokator). */
interface Opcja {
  typ: number;
  dzieci: number;
  inni: number;
}

/** Układy rodziny jednorodzinnego gospodarstwa jednej wielkości z wagami całkowitymi (ta sama kolejność). */
export interface OpcjeJedno {
  opcje: Opcja[];
  wagi: number[];
}

/** Ziarno IPF: każda osoba spoza rodziny zmniejsza wagę układu czterokrotnie, więc przy równych brzegach
    gospodarstwo wypełniają najpierw dzieci. Decyzja generatora (GUS nie podaje osób spoza rodzin na rejon). */
const KARA_ZA_INNEGO = 0.25;
export const MAX_OSOB = 10;

/** Układy rodzin w gospodarstwach jednorodzinnych wielkości 2-10 (indeks tablicy to wielkość; 0 i 1 jak 2):
    tabela wielkość × typ rodziny × liczba dzieci (0-4) z ziarnem „typ × dzieci × kara za osoby spoza rodziny”
    dopasowana IPF do trzech brzegów rejonu: `wgWielkosci[n]` (oczekiwane gospodarstwa jednorodzinne wielkości n),
    typów rodzin (`rodziny`) i liczby dzieci (`dzieci`), oba przeskalowane do liczby gospodarstw jednorodzinnych.
    Zakładamy, że rodziny w gospodarstwach wielorodzinnych mają ten sam rozkład typów i dzieci. Dzięki temu dzieci
    w rejonie jest tyle, ile podaje GUS, a nie tyle, ile zostawią osoby spoza rodziny. */
export function opcjeJedno(wr: WagiRodzin, wgWielkosci: readonly number[]): OpcjeJedno[] {
  const typy = [wr.paraBez, wr.paraZ, wr.matka, wr.ojciec].map((v) => Math.max(0, v));
  const zDziecmi = typy[1] + typy[2] + typy[3];
  const sumaDzieci = wr.dzieci.reduce((a, v) => a + Math.max(0, v), 0);
  const dz = (c: number): number => (sumaDzieci > 0 ? Math.max(0, wr.dzieci[c - 1]) / sumaDzieci : c === 1 ? 1 : 0);
  const kara = (inni: number): number => {
    let v = 1;
    for (let i = 0; i < inni; i++) v *= KARA_ZA_INNEGO;
    return v;
  };
  const opcje: Opcja[] = [];
  const wielkosc: number[] = [];
  const ziarno: number[] = [];
  for (let n = 2; n <= MAX_OSOB; n++) {
    const dodaj = (typ: number, dzieci: number, dorosli: number, waga: number): void => {
      const inni = n - dorosli - dzieci;
      if (inni < 0) return;
      opcje.push({ typ, dzieci, inni });
      wielkosc.push(n - 2);
      ziarno.push(waga * kara(inni));
    };
    dodaj(0, 0, 2, typy[0]);
    for (let c = 1; c <= 4; c++) {
      dodaj(1, c, 2, typy[1] * dz(c));
      dodaj(2, c, 1, typy[2] * dz(c));
      dodaj(3, c, 1, typy[3] * dz(c));
    }
  }
  const brzegN = Array.from({ length: MAX_OSOB - 1 }, (_, i) => Math.max(0, wgWielkosci[i + 2] ?? 0));
  const jednorodzinne = brzegN.reduce((a, v) => a + v, 0);
  const wszystkieTypy = typy[0] + zDziecmi;
  const naGospodarstwa = wszystkieTypy > 0 ? jednorodzinne / wszystkieTypy : 0;
  const x =
    naGospodarstwa > 0
      ? dopasujIpf(ziarno, [
          { indeks: wielkosc, brzeg: brzegN },
          { indeks: opcje.map((o) => o.typ), brzeg: typy.map((v) => v * naGospodarstwa) },
          {
            indeks: opcje.map((o) => o.dzieci),
            brzeg: [0, 1, 2, 3, 4].map((c) => (c === 0 ? typy[0] : zDziecmi * dz(c)) * naGospodarstwa),
          },
        ])
      : ziarno;
  const wynik: OpcjeJedno[] = [];
  for (let n = 2; n <= MAX_OSOB; n++) {
    const tu: number[] = [];
    for (let i = 0; i < opcje.length; i++) if (wielkosc[i] === n - 2) tu.push(i);
    let wagiN = tu.map((i) => x[i]);
    if (!(wagiN.reduce((a, v) => a + v, 0) > 0)) wagiN = tu.map((i) => ziarno[i]);
    const razem = wagiN.reduce((a, v) => a + v, 0);
    wynik[n] = {
      opcje: tu.map((i) => opcje[i]),
      wagi: wagiN.map((v) => (razem > 0 ? Math.round((v / razem) * 1e6) : 1)),
    };
  }
  wynik[0] = wynik[2];
  wynik[1] = wynik[2];
  return wynik;
}

/** Pary, samotne matki, samotni ojcowie: wagi rodziny starszego albo młodszego pokolenia w gospodarstwie
    wielorodzinnym. */
const wagiTypuRodziny = (wr: WagiRodzin): number[] => {
  const t = [wr.paraBez + wr.paraZ, wr.matka, wr.ojciec].map((v) => Math.max(0, Math.round(v)));
  return t.every((v) => v === 0) ? [1, 0, 0] : t;
};

/** Gospodarstwo jako lista szkiców osób, pierwsza to głowa (najstarsze pokolenie). `f60`: w gospodarstwie jest osoba
    60+ (głowa albo dziadek ma co najmniej 60 lat), bez niej wszyscy mają najwyżej 59. Nierodzinne: głowa 20+
    i współlokatorzy ±15 lat. Jednorodzinne: para albo samotny rodzic z dziećmi, reszta to osoby spoza rodziny, a gdy
    w gospodarstwie 60+ jest na nie miejsce, w połowie przypadków pierwsza z nich to dziadek albo babcia (matka albo
    ojciec głowy rodziny). Dwu- i trzyrodzinne: starsze pokolenie (para albo samotny rodzic z niezamężnym dzieckiem)
    i jedna albo dwie rodziny ich dzieci z wnukami, czyli trzy pokolenia. */
export function szkicGospodarstwa(
  r: Rng,
  sklad: string,
  f60: boolean,
  n: number,
  wr: WagiRodzin,
  jedno: OpcjeJedno,
): Szkic[] {
  const lista: Szkic[] = [];
  const gora = f60 ? MAX_WIEK : 59;
  const dodaj = (s: Szkic): number => lista.push(s) - 1;
  const plecRodzica = (typ: number): number => (typ === 2 ? K : typ === 3 ? M : Z_PULI);

  if (sklad === 'nier1' || sklad === 'nier+') {
    const glowa = dodaj({ plec: Z_PULI, od: f60 ? 60 : 20, do: gora });
    for (let i = 1; i < n; i++) dodaj({ plec: Z_PULI, od: 18, do: gora, obok: glowa });
    return lista;
  }

  if (sklad === 'jedno') {
    const o = jedno.opcje[Math.max(0, wazony(r, jedno.wagi))];
    const dziadek = f60 && o.inni > 0 && szansa(r, 5000);
    const rodzice: number[] = [];
    if (dziadek) rodzice.push(dodaj({ plec: Z_PULI, od: 60, do: MAX_WIEK }));
    const glowaRodziny = dodaj({
      plec: plecRodzica(o.typ),
      od: f60 && !dziadek ? 60 : 20,
      do: gora,
      rodzice: dziadek ? rodzice : undefined,
    });
    const dzieciRodzice = [glowaRodziny];
    if (o.typ <= 1) dzieciRodzice.push(dodaj({ plec: Z_PULI, od: 18, do: gora, partner: glowaRodziny }));
    const moze = !(f60 && !dziadek);
    for (let i = 0; i < o.dzieci; i++) dodaj({ plec: Z_PULI, od: 0, do: gora, rodzice: dzieciRodzice, dziecko: moze });
    for (let i = dziadek ? 1 : 0; i < o.inni; i++) dodaj({ plec: Z_PULI, od: 18, do: gora, obok: glowaRodziny });
    return lista;
  }

  // dwu- i trzyrodzinne: starsze pokolenie, potem rodziny dzieci
  const typy = wagiTypuRodziny(wr);
  const rodzinStarszych = wazony(r, typy);
  const najstarszy = dodaj({
    plec: rodzinStarszych === 0 ? Z_PULI : rodzinStarszych === 1 ? K : M,
    od: f60 ? 60 : 36,
    do: gora,
  });
  const starsi = [najstarszy];
  if (rodzinStarszych === 0) starsi.push(dodaj({ plec: Z_PULI, od: 36, do: gora, partner: najstarszy }));
  else dodaj({ plec: Z_PULI, od: 0, do: gora, rodzice: starsi, dziecko: !f60 });
  const mlodsze = sklad === 'dwu' ? 1 : 2;
  const rodziceWnukow: number[][] = [];
  for (let j = 0; j < mlodsze; j++) {
    const typ = wazony(r, typy);
    const glowa = dodaj({ plec: typ === 0 ? Z_PULI : typ === 1 ? K : M, od: 18, do: gora, rodzice: starsi });
    const rodzina = [glowa];
    if (typ === 0) rodzina.push(dodaj({ plec: Z_PULI, od: 18, do: gora, partner: glowa }));
    else dodaj({ plec: Z_PULI, od: 0, do: gora, rodzice: rodzina, dziecko: true }); // samotny rodzic: co najmniej jedno
    rodziceWnukow.push(rodzina);
  }
  const wolne = n - lista.length;
  for (let i = 0; i < wolne; i++) {
    dodaj({ plec: Z_PULI, od: 0, do: gora, rodzice: rodziceWnukow[i % mlodsze], dziecko: true });
  }
  return lista;
}

/** Przedział wieku osoby ze szkicu, gdy krewni wcześniej na liście mają już wiek `wiek` i płeć `plec`. */
function przedzial(s: Szkic, wiek: readonly number[], plec: readonly number[]): [number, number] {
  let od = 0;
  let doW = MAX_WIEK;
  if (s.partner !== undefined) {
    od = Math.max(od, wiek[s.partner] - 5);
    doW = Math.min(doW, wiek[s.partner] + 5);
  }
  for (const p of s.rodzice ?? []) {
    od = Math.max(od, wiek[p] - (plec[p] === K ? 42 : 50));
    doW = Math.min(doW, wiek[p] - 18);
  }
  if (s.obok !== undefined) {
    od = Math.max(od, wiek[s.obok] - 15);
    doW = Math.min(doW, wiek[s.obok] + 15);
  }
  // przedział z krewnych jest zawsze niepusty (szkice tak ustawiają dolne granice); własny przycina go, a gdy są
  // sprzeczne, bierzemy wiek z przedziału krewnych najbliższy własnemu
  const odS = Math.max(od, s.od);
  const doS = Math.min(doW, s.do);
  if (odS <= doS) return [odS, doS];
  return s.od > doW ? [doW, doW] : [od, od];
}

/** Ile dzieci w szkicach może być małoletnich (`dziecko`). */
export function mozliweMaloletnie(budynek: readonly Szkic[][]): number {
  let n = 0;
  for (const lista of budynek) for (const s of lista) if (s.dziecko) n++;
  return n;
}

/** Małoletni (do 17 lat) są w gospodarstwach tylko dziećmi, więc ich liczbę ustalamy z góry: każde dziecko, które
    może być małoletnie, jest nim z szansą `p10k` na 10 000 (spis.ts liczy ją jako „ilu małoletnich chcemy / ile
    jest takich dzieci”), a pozostałe mają co najmniej 18 lat. Bez tego dzieci starszych matek zajmują wiek dorosły,
    a dzieci w wieku szkolnym brakuje. Potem zawężamy wiek krewnych w górę drzewa: rodzic jest starszy od dziecka
    o 18-42 lata (ojciec do 50), partner różni się o najwyżej 5 lat. Zawężenie, które dałoby pusty przedział,
    pomijamy. */
export function oznaczMaloletnich(r: Rng, budynek: readonly Szkic[][], p10k: number): void {
  const zawez = (s: Szkic, od: number, doW: number): void => {
    const nOd = Math.max(s.od, od);
    const nDo = Math.min(s.do, doW);
    if (nOd <= nDo) {
      s.od = nOd;
      s.do = nDo;
    }
  };
  for (const lista of budynek) {
    for (const s of lista) {
      if (!s.dziecko) continue;
      if (szansa(r, p10k)) zawez(s, 0, 17);
      else zawez(s, 18, MAX_WIEK);
    }
    for (let i = lista.length - 1; i >= 0; i--) {
      const s = lista[i];
      for (const p of s.rodzice ?? []) zawez(lista[p], s.od + 18, s.do + (lista[p].plec === M ? 50 : 42));
      if (s.partner !== undefined) zawez(lista[s.partner], s.od - 5, s.do + 5);
    }
  }
}

/** Udział osób w wieku od `od` do `doW` w rozkładzie rejonu (obie płcie). */
export function udzialWieku(cel: CelWieku, od: number, doW: number): number {
  let v = 0;
  for (let p = 0; p < 2; p++) for (let w = od; w <= doW; w++) v += cel.udzial[p][w];
  return v;
}

/** Wiek i płeć dla szkiców jednego gospodarstwa z puli, po kolei, i gotowe osoby z identyfikatorami
    `${klucz}/o${numer}` od `numer`. Partnerzy wskazują siebie nawzajem, dzieci matkę i ojca z gospodarstwa. */
export function osobyZeSzkicu(r: Rng, pula: Pula, szkice: readonly Szkic[], klucz: string, numer: number): Osoba[] {
  const wiek: number[] = [];
  const plec: number[] = [];
  const osoby: Osoba[] = [];
  for (let i = 0; i < szkice.length; i++) {
    const s = szkice[i];
    const [od, doW] = przedzial(s, wiek, plec);
    const chce = s.partner !== undefined ? 1 - plec[s.partner] : s.plec;
    const kod = pula.losuj(r, chce, od, doW);
    plec.push(kod >= 128 ? K : M);
    wiek.push(kod % 128);
    const o: Osoba = {
      id: `${klucz}/o${numer + i}`,
      plec: PLCI[plec[i]],
      rocznik: ROK_WIEKU - wiek[i],
      imie: '',
      nazwisko: '',
      stan: 'tu',
    };
    for (const p of s.rodzice ?? []) {
      if (plec[p] === K) o.matka = osoby[p].id;
      else o.ojciec = osoby[p].id;
    }
    if (s.partner !== undefined) {
      o.partner = osoby[s.partner].id;
      osoby[s.partner].partner = o.id;
    }
    osoby.push(o);
  }
  return osoby;
}
