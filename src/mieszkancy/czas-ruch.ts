/* Zdarzenia z szansą na krok 5-letni (czas.ts), po zgonach i urodzeniach, w kolejności ze specyfikacji (rozdział 5):
   wyprowadzka z domu rodziców, związek, przeprowadzka poza obszar (z wyludnieniem po upadku), emigracja, powrót
   (najpierw do opieki nad rodzicem 75+, potem zwykły), wolne mieszkania. Szanse z dzwignie.ts. Każdy etap przegląda
   osoby albo gospodarstwa w kolejności tablic, a osoba z partnerem losuje raz za oboje. */

import type { Rng } from '../core/rng.ts';
import { dokad, type Kierunek, type Obszar } from './czas-dokad.ts';
import {
  jednostka,
  LATA_KROKU,
  najwczesniej,
  najwczesniejJednostki,
  nowaOsoba,
  noweGospodarstwo,
  partnerTu,
  przeciwna,
  przyjmij,
  type Stan,
  wpis,
  wroc,
  wyjedz,
  zajmij,
  zdarzenie,
  zProgow,
  zRodzicami,
} from './czas-stan.ts';
import { DZWIGNIE, PRZEJSCIA } from './dzwignie.ts';
import { calkowita, szansa, wazony } from './los.ts';
import type { TabeleKraju } from './tabele.ts';
import type { Osoba, Plec } from './typy.ts';

export interface Kontekst {
  k: TabeleKraju;
  obszar: Obszar;
  /** Dźwignie upadku działają w tym kroku. */
  upadek: boolean;
}

const wOkresie = (rok: number, o: { od: number; do?: number }): boolean =>
  rok >= o.od && (o.do === undefined || rok <= o.do);
/** Wartość razy mnożnik na 10 000, gdy dźwignia działa w tym roku. */
const dzwignia = (v: number, kt: Kontekst, rok: number, o: { od: number; do?: number; mnoznik: number }): number =>
  kt.upadek && wOkresie(rok, o) ? (v * o.mnoznik) / 10000 : v;

const cel = (s: Stan, r: Rng, kt: Kontekst, kierunek: Kierunek): string =>
  dokad(r, kierunek, kt.obszar, s.budynek.lat, s.budynek.lon);

const koniec = (s: Stan): number => s.poczatek + LATA_KROKU - 1;

/** Osoba z jednostką (partner, małoletnie dzieci) wyjeżdża z szansą `stawka(rok)` na krok. */
function wyjazdJednostki(
  s: Stan,
  r: Rng,
  o: Osoba,
  stawka: (rok: number) => number,
  typ: 'wyprowadzka' | 'emigracja',
  gdzie: () => string,
): void {
  const rok = zdarzenie(s, r, najwczesniejJednostki(s, o), stawka);
  if (rok >= 0) wyjedz(s, jednostka(s, o, rok), rok, typ, gdzie());
}

/** Wyprowadzka z domu rodziców: dorosłe dziecko od 25 lat, które mieszka z matką albo ojcem, z partnerem i dziećmi. */
export function wyprowadzki(s: Stan, r: Rng, kt: Kontekst): void {
  const rozpatrzeni = new Set<Osoba>();
  const progi = PRZEJSCIA.wyprowadzka;
  const n = s.osoby.length;
  for (let i = 0; i < n; i++) {
    const o = s.osoby[i];
    if (o.stan !== 'tu' || rozpatrzeni.has(o) || koniec(s) - o.rocznik < progi[0][0] || !zRodzicami(s, o)) continue;
    rozpatrzeni.add(o);
    const p = partnerTu(s, o);
    if (p) rozpatrzeni.add(p);
    const stawka = (rok: number): number =>
      dzwignia(zProgow(progi, rok - o.rocznik), kt, rok, DZWIGNIE.wyprowadzkaUpadek);
    wyjazdJednostki(s, r, o, stawka, 'wyprowadzka', () => cel(s, r, kt, 'wyprowadzka'));
  }
}

/** Związek: samotni 25-39 lat (bez partnera, który tu mieszka) i partner z zewnątrz w podobnym wieku, który
    wprowadza się do ich gospodarstwa; u kogoś, kto mieszka z rodzicami, rzadziej (`zwiazekZRodzicami`). Dwa wpisy:
    `zwiazek` (kto: mieszkaniec, z: partner) i `wprowadzka` (kto: partner, z: mieszkaniec). */
export function zwiazki(s: Stan, r: Rng): void {
  const progi = PRZEJSCIA.zwiazek;
  const n = s.osoby.length;
  for (let i = 0; i < n; i++) {
    const o = s.osoby[i];
    if (o.stan !== 'tu' || partnerTu(s, o)) continue;
    const wiek = koniec(s) - o.rocznik;
    if (wiek < progi[0][0] || wiek - LATA_KROKU + 1 > progi[progi.length - 1][0]) continue;
    const mnoznik = zRodzicami(s, o) ? PRZEJSCIA.zwiazekZRodzicami : 10000;
    const rok = zdarzenie(s, r, najwczesniej(s, [o]), (rok) => (zProgow(progi, rok - o.rocznik) * mnoznik) / 10000);
    if (rok < 0) continue;
    const roznica = PRZEJSCIA.partnerRoznicaLat;
    const p = nowaOsoba(s, przeciwna(o.plec), o.rocznik + calkowita(r, -roznica, roznica));
    o.partner = p.id;
    p.partner = o.id;
    przyjmij(s, p, s.dom.get(o.id)!);
    wpis(s, { rok, typ: 'zwiazek', kto: o.id, z: p.id });
    wpis(s, { rok, typ: 'wprowadzka', kto: p.id, z: o.id });
  }
}

/** Przeprowadzka poza obszar: dorośli od 20 lat, którzy nie mieszkają z rodzicami (ani ich partner), z jednostką.
    Po upadku do tego wyjazdy całych gospodarstw na wieś (`DZWIGNIE.wyludnienie`). */
export function przeprowadzki(s: Stan, r: Rng, kt: Kontekst): void {
  const rozpatrzeni = new Set<Osoba>();
  const progi = PRZEJSCIA.przeprowadzka;
  const n = s.osoby.length;
  for (let i = 0; i < n; i++) {
    const o = s.osoby[i];
    if (o.stan !== 'tu' || rozpatrzeni.has(o) || koniec(s) - o.rocznik < progi[0][0]) continue;
    const p = partnerTu(s, o);
    rozpatrzeni.add(o);
    if (p) rozpatrzeni.add(p);
    if (zRodzicami(s, o) || (p && zRodzicami(s, p))) continue;
    const stawka = (rok: number): number => zProgow(progi, rok - o.rocznik);
    wyjazdJednostki(s, r, o, stawka, 'wyprowadzka', () => cel(s, r, kt, 'przeprowadzka'));
  }
  if (!kt.upadek) return;
  const w = DZWIGNIE.wyludnienie;
  const szansaWyjazdu = s.budynek.typ === 'dom' ? w.dom : w.blok;
  const liczba = s.gospodarstwa.length;
  for (let i = 0; i < liczba; i++) {
    const g = s.gospodarstwa[i];
    if (g.czlonkowie.length === 0) continue;
    const osoby = g.czlonkowie.map((id) => s.wg.get(id)!);
    const rok = zdarzenie(s, r, najwczesniej(s, osoby), (rok) => (rok >= w.od ? szansaWyjazdu : 0));
    if (rok >= 0) wyjedz(s, osoby, rok, 'wyprowadzka', cel(s, r, kt, 'wyludnienie'));
  }
}

/** Emigracja: dorośli od 18 lat z jednostką. Po upadku od 2035 zero. */
export function emigracje(s: Stan, r: Rng, kt: Kontekst): void {
  const rozpatrzeni = new Set<Osoba>();
  const progi = PRZEJSCIA.emigracja;
  const n = s.osoby.length;
  for (let i = 0; i < n; i++) {
    const o = s.osoby[i];
    if (o.stan !== 'tu' || rozpatrzeni.has(o) || koniec(s) - o.rocznik < progi[0][0]) continue;
    rozpatrzeni.add(o);
    const p = partnerTu(s, o);
    if (p) rozpatrzeni.add(p);
    const stawka = (rok: number): number =>
      dzwignia(zProgow(progi, rok - o.rocznik), kt, rok, DZWIGNIE.emigracjaPo2035);
    wyjazdJednostki(s, r, o, stawka, 'emigracja', () => cel(s, r, kt, 'emigracja'));
  }
}

/** Czy osoba z wyjazdu może wrócić w tym roku: wiek 18-74 i wyjazd w jednym z wcześniejszych lat. */
const mozeWrocic = (s: Stan, o: Osoba, rok: number): boolean =>
  rok - o.rocznik >= PRZEJSCIA.powrot.odWieku &&
  rok - o.rocznik <= PRZEJSCIA.powrot.doWieku &&
  (s.wyjazdy.get(o.id)?.rok ?? rok) < rok;

/** Krewny, który tu mieszka: matka, ojciec, potem dzieci, potem rodzeństwo. */
function krewnyTu(s: Stan, o: Osoba): Osoba | undefined {
  const rodzice = [o.matka, o.ojciec].map((id) => (id === undefined ? undefined : s.wg.get(id)));
  for (const p of rodzice) if (p?.stan === 'tu') return p;
  for (const d of s.dzieci.get(o.id) ?? []) if (d.stan === 'tu') return d;
  for (const p of rodzice) {
    if (!p) continue;
    for (const d of s.dzieci.get(p.id) ?? []) if (d !== o && d.stan === 'tu') return d;
  }
  return undefined;
}

/** Powroty. Najpierw opieka: rodzic od 75 lat sam w mieszkaniu ściąga z szansą `DZWIGNIE.powrotOpieka` jedno dorosłe
    dziecko z wyjazdu (córka waga 3, syn 2), z tymi, którzy z nim wyjechali. Potem zwykłe powroty osób, które
    wyjechały same albo prowadziły jednostkę: emigranci i ci, co wyjechali w kraju (w fali powrotów ×3), do krewnego
    w budynku, a emigranci bez krewnych do wolnego mieszkania. */
export function powroty(s: Stan, r: Rng, kt: Kontekst): void {
  const op = DZWIGNIE.powrotOpieka;
  const stawkaOpieki = (rok: number): number => (kt.upadek && rok >= op.od ? op.upadek : op.bezUpadku);
  const liczba = s.gospodarstwa.length;
  for (let i = 0; i < liczba; i++) {
    const g = s.gospodarstwa[i];
    if (g.czlonkowie.length !== 1) continue;
    const rodzic = s.wg.get(g.czlonkowie[0])!;
    const odWieku = rodzic.rocznik + PRZEJSCIA.opieka.odWieku;
    if (koniec(s) < odWieku) continue;
    const dzieci = (s.dzieci.get(rodzic.id) ?? []).filter((d) => d.stan === 'wyjechal');
    if (dzieci.length === 0) continue;
    const od = Math.max(najwczesniej(s, [rodzic]), odWieku);
    const rok = zdarzenie(s, r, od, (rok) => (dzieci.some((d) => mozeWrocic(s, d, rok)) ? stawkaOpieki(rok) : 0));
    if (rok < 0) continue;
    const wagi = dzieci.map((d) =>
      mozeWrocic(s, d, rok) ? (d.plec === 'K' ? PRZEJSCIA.opieka.corka : PRZEJSCIA.opieka.syn) : 0,
    );
    wroc(s, dzieci[wazony(r, wagi)], g, rok, 'powrotOpieka', rodzic.id);
  }

  const pw = PRZEJSCIA.powrot;
  const n = s.osoby.length;
  for (let i = 0; i < n; i++) {
    const o = s.osoby[i];
    const wyjazd = s.wyjazdy.get(o.id);
    if (o.stan !== 'wyjechal' || !wyjazd || wyjazd.z !== undefined) continue;
    const emigrant = wyjazd.typ === 'emigracja';
    const baza = emigrant ? pw.emigranci : pw.kraj;
    const od = Math.max(najwczesniej(s, [o]), wyjazd.rok + 1);
    const stawka = (rok: number): number =>
      mozeWrocic(s, o, rok) ? dzwignia(baza, kt, rok, DZWIGNIE.falaPowrotow) : 0;
    const rok = zdarzenie(s, r, od, stawka);
    if (rok < 0) continue;
    const krewny = krewnyTu(s, o);
    if (krewny) {
      wroc(s, o, s.dom.get(krewny.id)!, rok, 'powrot', krewny.id);
    } else if (emigrant) {
      const wolne = zajmij(s, rok);
      if (wolne) wroc(s, o, noweGospodarstwo(s, wolne.klatka), rok, 'powrot');
    }
  }
}

/** Wolne mieszkania: każde zajmują w kroku przyjezdni z szansą `DZWIGNIE.zasiedlenie` (bez upadku, a po upadku od
    2031 osobno dla bloku i domu). Mieszkanie zwolnione w kroku dopiero od roku zwolnienia. */
export function zasiedlenie(s: Stan, r: Rng, kt: Kontekst): void {
  const z = DZWIGNIE.zasiedlenie;
  const poUpadku = s.budynek.typ === 'dom' ? z.dom : z.blok;
  const stawka = (rok: number): number => (kt.upadek && rok >= z.od ? poUpadku : z.bezUpadku);
  for (const wolne of s.wolne.slice()) {
    const rok = zdarzenie(s, r, wolne.od, stawka);
    if (rok < 0) continue;
    s.wolne.splice(s.wolne.indexOf(wolne), 1);
    przyjezdni(s, r, kt, rok, wolne.klatka);
  }
}

/** Przyjezdni do wolnego mieszkania w klatce: sam, para albo para z dziećmi (`PRZEJSCIA.przyjezdni`). Głowa
    25-44 lata, partner ±3 lata, dzieci: liczba to kolejność urodzenia najmłodszego z `k.kolejnosc`, najmłodsze do
    9 lat, kolejne starsze o 1-4 lata, matka przy każdym porodzie w wieku 20-40 lat. Każda osoba ma wpis `wprowadzka`,
    a wszyscy poza głową `z` = głowa. */
function przyjezdni(s: Stan, r: Rng, kt: Kontekst, rok: number, klatka: number): void {
  const p = PRZEJSCIA.przyjezdni;
  const sklad = wazony(r, s.budynek.typ === 'dom' ? p.dom : p.blok);
  const g = noweGospodarstwo(s, klatka);
  const plec: Plec = szansa(r, 5000) ? 'M' : 'K';
  const glowa = nowaOsoba(s, plec, rok - calkowita(r, p.odWieku, p.doWieku));
  const wszyscy = [glowa];
  if (sklad >= 1) {
    const roznica = PRZEJSCIA.partnerRoznicaLat;
    const partner = nowaOsoba(s, przeciwna(plec), glowa.rocznik + calkowita(r, -roznica, roznica));
    glowa.partner = partner.id;
    partner.partner = glowa.id;
    wszyscy.push(partner);
    if (sklad === 2) {
      const matka = plec === 'K' ? glowa : partner;
      const ojciec = plec === 'K' ? partner : glowa;
      const wiekMatki = rok - matka.rocznik;
      const najmlodsze = Math.max(0, wiekMatki - p.matkaDo);
      const najstarsze = wiekMatki - p.matkaOd;
      if (najmlodsze <= Math.min(p.najmlodszeDo, najstarsze)) {
        const liczba = wazony(r, kt.k.kolejnosc) + 1;
        const wieki = [calkowita(r, najmlodsze, Math.min(p.najmlodszeDo, najstarsze))];
        while (wieki.length < liczba) {
          const nastepne = wieki[wieki.length - 1] + calkowita(r, 1, 4);
          if (nastepne > najstarsze) break;
          wieki.push(nastepne);
        }
        for (let i = wieki.length - 1; i >= 0; i--) {
          wszyscy.push(nowaOsoba(s, szansa(r, PRZEJSCIA.chlopcy) ? 'M' : 'K', rok - wieki[i], matka, ojciec));
        }
      }
    }
  }
  for (const o of wszyscy) {
    przyjmij(s, o, g);
    wpis(s, o === glowa ? { rok, typ: 'wprowadzka', kto: o.id } : { rok, typ: 'wprowadzka', kto: o.id, z: glowa.id });
  }
}
