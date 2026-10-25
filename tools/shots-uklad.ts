/* Zrzuty i sprawdzenia układu nakładek na ekranie gry do `npm run shots` (scenariusze uklad-*): poprawki z przeglądu
   spójności przed publikacją. Każdy scenariusz mierzy to, o czym mówi znalezisko, i pada, gdy układ jest zły:

   - górny pasek na telefonie 360, 375, 390 i 412 px, po polsku i po angielsku, w trybie zwykłym i zombie: odstęp między
     etykietami kafelków stanu (co najmniej `MIN_LUKA_ETYKIET` px), etykiety i wartości w obrębie kafelków, stan w jednym
     wierszu, pasek nie wyższy niż przed zmianą; ta sama próba z wartościami, które trafiają się dopiero późno w grze
     (trzycyfrowe drewno, „−12°C”, „12,5 h”, „60·40·20”): tam kafelki mogą zawinąć się do drugiego wiersza, ale nic na
     nic nie nachodzi (`uklad-pasek-telefon-*`);
   - nazwa osiedla na szyldzie paska na telefonie mieści się bez wielokropka i bez powiększania paska
     (`uklad-pasek-telefon-*`, `uklad-nazwa-telefon`);
   - górny pasek na komputerze 1280, 1366, 1440 i 1920 px: ten sam układ w trzech demach, obu trybach i obu językach, czyli
     dwa wiersze: tempo i zegar u góry, stan i przyciski w drugim wierszu (`uklad-pasek-komputer`);
   - karta nocy na telefonie: zamknięta lista wyboru ucina długie opcje, więc pod nią stoi pełny tekst wybranej opcji,
     a na komputerze, gdzie tekst się mieści, tej linii nie ma (`uklad-karta-nocy-wybor-*`);
   - błędy okna „ResizeObserver loop completed with undelivered notifications” przy przełączaniu karty osoby, okienka celów
     i paneli, z okienkiem celów wyższym niż miejsce nad kartą, żeby jego ograniczenie naprawdę się zmieniało
     (`uklad-resize-observer-*`);
   - stos nakładek na telefonie (cele, lista ludzi, karta osoby, podpowiedź u dołu, szuflada budowy): nic nie nachodzi na
     nic i imię na karcie osoby jest zawsze widać (`uklad-stos-telefon*`);
   - znacznik przewijania okienka celów ograniczonego do miejsca nad kartą osoby, tylko gdy treść wystaje
     (`uklad-cele-przewijanie`). */

import path from 'node:path';
import type { Page } from '@playwright/test';
import { dotykowy, GRA, kliknij, poHudzie, przewin, start, ustawJezyk } from './shots-cele.ts';

/** scenariusz w kształcie, który przyjmuje tools/shots.ts (jego `Shot` nie jest wyeksportowany) */
export interface ShotUklad {
  name: string;
  query: string;
  w?: number;
  h?: number;
  touch?: boolean;
  lang?: 'en' | 'pl';
  run: (page: Page, base: string) => Promise<void>;
}

/** Najmniejszy odstęp między tekstami sąsiednich etykiet na pasku stanu (px): przy mniejszym „ZAUFANIE” i „WKURZENIE” czyta
    się jak jedno słowo. */
const MIN_LUKA_ETYKIET = 6;
/** To samo dla wartości kafelków (liczby pod etykietami). */
const MIN_LUKA_WARTOSCI = 4;
/** Wysokość paska telefonu przed poprawką była 120 px (360 i 375) albo 123 px (390 i 412); pasek z trzema wierszami nie ma być
    wyższy. */
const MAX_PASEK_TELEFON = 124;
/** Najmniejsza czcionka nazwy osiedla na szyldzie (px): poniżej szyld jest nieczytelny. */
const MIN_NAZWA_PX = 12;

const SZEROKOSCI_TELEFONU = [360, 375, 390, 412] as const;
const SZEROKOSCI_KOMPUTERA = [1280, 1366, 1440, 1920] as const;
const DEMA = ['przymorze', 'lanciego', 'zielonki'] as const;

/** Wartości kafelków paska z późnej gry (najszersze, jakie się tam trafiają); `hud` nie nadpisuje ich, dopóki prawdziwa wartość
    się nie zmieni, a przy `speed=0` nic się nie zmienia. */
const WARTOSCI_PO_LATACH: Record<string, string> = {
  sFence: '100%',
  sHorde: '25',
  sOut: '−12°C',
  sKit: '−12°C',
  sFire: '12,5 h',
  sWood: '150',
  sMats: '60·40·20',
  sFood: '300',
  sTrust: '100',
  sAnger: '100',
};

interface Prosty {
  l: number;
  t: number;
  r: number;
  b: number;
}

/** klatki animacji (układ po zmianie okna dochodzi w następnej) */
export const klatki = (page: Page, n = 3): Promise<void> =>
  page.evaluate(
    (k) =>
      new Promise<void>((resolve) => {
        let i = 0;
        const krok = () => (++i >= k ? resolve() : requestAnimationFrame(krok));
        requestAnimationFrame(krok);
      }),
    n,
  );

/** Rozwija zwinięty pasek stanu (telefon: stuknięcie w linię); gdy pasek nie jest zwinięty (komputer, wersja bez zwijania), nic nie robi. */
export async function rozwinPasek(page: Page): Promise<void> {
  const zwiniety = await page.evaluate(() => document.getElementById('stats')!.hasAttribute('data-zwiniete'));
  if (!zwiniety) return;
  await kliknij(page, '#stats', true);
  await poHudzie(page);
}

/** zmiana rozmiaru okna i czekanie, aż układ i nazwa osiedla na szyldzie (liczona w następnej klatce) dojdą */
export async function rozmiar(page: Page, w: number, h: number): Promise<void> {
  await page.setViewportSize({ width: w, height: h });
  await klatki(page, 4);
  await poHudzie(page);
}

/* ---------------------------------------------------------------- górny pasek na telefonie */

interface KafelekPomiar {
  id: string;
  etykieta: string;
  wartosc: string;
  k: Prosty;
  v: Prosty;
  box: Prosty;
}

export interface PasekPomiar {
  pasek: number;
  /** liczba wierszy kafelków stanu (po pionowym położeniu kafelków) */
  wiersze: number;
  kafelki: KafelekPomiar[];
  nazwa: { tekst: string; ucieta: boolean; px: number };
  /** szyld, zegar i przycisk mapy w jednym (pierwszym) wierszu paska */
  pierwszyWiersz: boolean;
}

export const pasekTelefonu = (page: Page): Promise<PasekPomiar> =>
  page.evaluate(() => {
    const prosty = (r: DOMRect) => ({ l: r.left, t: r.top, r: r.right, b: r.bottom });
    const rg = document.createRange();
    const tekst = (e: Element): DOMRect => {
      rg.selectNodeContents(e);
      return rg.getBoundingClientRect();
    };
    const kafelki = [...document.querySelectorAll<HTMLElement>('#stats .stat')]
      .filter((e) => !e.hidden && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0)
      .map((e) => {
        const k = e.querySelector('.stat-k')!;
        const v = e.querySelector('.stat-v')!;
        return {
          id: e.id,
          etykieta: k.textContent ?? '',
          wartosc: v.textContent ?? '',
          k: prosty(tekst(k)),
          v: prosty(tekst(v)),
          box: prosty(e.getBoundingClientRect()),
        };
      });
    const stany = document.getElementById('stats')!;
    const pseudo = getComputedStyle(stany, '::after');
    const strzalka =
      pseudo.content !== 'none' && pseudo.content !== 'normal' && stany.hasAttribute('data-zwiniete') === false
        ? Number.parseFloat(pseudo.height) + Number.parseFloat(pseudo.marginTop || '0')
        : 0;
    const nazwa = document.getElementById('osName')!;
    const szyld = document.querySelector('#top .sign')!.getBoundingClientRect();
    const mapa = document.getElementById('btnMiasto')!.getBoundingClientRect();
    const zegar = document.querySelector('#top .clock')!.getBoundingClientRect();
    const wTymSamym = (a: DOMRect, b: DOMRect) => a.top < b.bottom && b.top < a.bottom;
    return {
      // pasek bez strzałki stanu: rozwinięty pasek stanu ma pod kafelkami pasek ze strzałką (`.stats::after`), który nie jest wierszem
      pasek: document.getElementById('top')!.getBoundingClientRect().height - strzalka,
      wiersze: new Set(kafelki.map((x) => Math.round(x.box.t))).size,
      kafelki,
      nazwa: {
        tekst: nazwa.textContent ?? '',
        // scrollWidth i clientWidth są całkowite: nazwa dłuższa o ułamek piksela dostaje wielokropek, a one się nie różnią
        ucieta: tekst(nazwa).width > nazwa.getBoundingClientRect().width + 0.01,
        px: Number.parseFloat(getComputedStyle(nazwa).fontSize),
      },
      pierwszyWiersz: wTymSamym(szyld, mapa) && wTymSamym(szyld, zegar),
    };
  });

/** teksty kafelków w tym samym wierszu: najmniejszy odstęp (etykiet i wartości) i kafelki, w których tekst wystaje */
function odstepy(p: PasekPomiar): { etykiety: number; wartosci: number; wystaje: string[] } {
  let etykiety = Number.POSITIVE_INFINITY;
  let wartosci = Number.POSITIVE_INFINITY;
  const wystaje: string[] = [];
  p.kafelki.forEach((a, i) => {
    for (const [nazwa, t] of [
      ['etykieta', a.k],
      ['wartość', a.v],
    ] as const)
      if (t.l < a.box.l - 0.5 || t.r > a.box.r + 0.5)
        wystaje.push(`${nazwa} „${nazwa === 'etykieta' ? a.etykieta : a.wartosc}”`);
    const b = p.kafelki[i + 1];
    if (!b || Math.abs(a.box.t - b.box.t) > 6) return;
    etykiety = Math.min(etykiety, b.k.l - a.k.r);
    wartosci = Math.min(wartosci, b.v.l - a.v.r);
  });
  return { etykiety, wartosci, wystaje };
}

/** Sprawdza pasek telefonu przy bieżącej szerokości okna: odstępy, wiersze, wysokość paska i szyld z nazwą osiedla. Zwraca
    opis do dziennika. */
export function sprawdzPasek(opis: string, p: PasekPomiar, o: { jedenWiersz: boolean; nazwa: boolean }): string {
  const o1 = odstepy(p);
  const zle: string[] = [];
  if (o1.etykiety < MIN_LUKA_ETYKIET)
    zle.push(`etykiety kafelków dzieli ${o1.etykiety.toFixed(1)} px (najmniej ${MIN_LUKA_ETYKIET} px)`);
  if (o1.wartosci < MIN_LUKA_WARTOSCI)
    zle.push(`wartości kafelków dzieli ${o1.wartosci.toFixed(1)} px (najmniej ${MIN_LUKA_WARTOSCI} px)`);
  if (o1.wystaje.length) zle.push(`tekst wystaje z kafelka: ${o1.wystaje.join(', ')}`);
  if (o.jedenWiersz && p.wiersze !== 1) zle.push(`kafelki stanu w ${p.wiersze} wierszach zamiast w jednym`);
  if (p.pasek > MAX_PASEK_TELEFON + (o.jedenWiersz ? 0 : 40))
    zle.push(`pasek ma ${Math.round(p.pasek)} px (najwyżej ${MAX_PASEK_TELEFON})`);
  if (o.nazwa) {
    if (p.nazwa.ucieta) zle.push(`nazwa osiedla „${p.nazwa.tekst}” urwana wielokropkiem (${p.nazwa.px} px)`);
    if (p.nazwa.px < MIN_NAZWA_PX) zle.push(`nazwa osiedla ma ${p.nazwa.px} px (najmniej ${MIN_NAZWA_PX} px)`);
    if (!p.pierwszyWiersz) zle.push('szyld, zegar i „Mapa” nie są w jednym wierszu paska');
  }
  const linia = `${opis}: pasek ${Math.round(p.pasek)} px, kafelków ${p.kafelki.length} w ${p.wiersze} wierszu, odstęp etykiet ${o1.etykiety.toFixed(1)} px, wartości ${o1.wartosci.toFixed(1)} px, nazwa „${p.nazwa.tekst}” ${p.nazwa.px} px${p.nazwa.ucieta ? ' (UCIĘTA)' : ''}`;
  console.log(`  ${linia}${zle.length ? `, NARUSZENIA: ${zle.length}` : ''}`);
  if (zle.length) throw new Error(`${opis}: ${zle.join('; ')}`);
  return linia;
}

/** Pasek stanu telefonu w czterech szerokościach, jedno demo: odstępy etykiet, nazwa osiedla, pasek w trzech wierszach; potem
    to samo z wartościami z późnej gry (kafelki mogą wtedy zawinąć się do drugiego wiersza, ale nic na nic nie nachodzi). */
const pasekTelefon = (name: string, lang: 'pl' | 'en', zombie: boolean, out: string): ShotUklad => ({
  name,
  query: '',
  w: 390,
  h: 844,
  lang,
  run: async (page, base) => {
    await start(page, base, `demo=przymorze${zombie ? '&tryb=zombie' : ''}&${GRA}`);
    await rozwinPasek(page);
    for (const w of SZEROKOSCI_TELEFONU) {
      await rozmiar(page, w, 844);
      sprawdzPasek(`${name} ${w} px`, await pasekTelefonu(page), { jedenWiersz: true, nazwa: true });
      const bar = await page.evaluate(() => document.getElementById('top')!.getBoundingClientRect().bottom);
      await page.screenshot({
        path: path.join(out, `${name}-${w}.png`),
        clip: { x: 0, y: 0, width: w, height: Math.ceil(bar) + 6 },
      });
    }
    await page.evaluate((v) => {
      for (const [id, wartosc] of Object.entries(v)) {
        const b = document.querySelector(`#${id} .stat-v`);
        if (b) b.textContent = wartosc;
      }
    }, WARTOSCI_PO_LATACH);
    for (const w of SZEROKOSCI_TELEFONU) {
      await rozmiar(page, w, 844);
      sprawdzPasek(`${name} ${w} px, wartości z późnej gry`, await pasekTelefonu(page), {
        jedenWiersz: false,
        nazwa: false,
      });
    }
    await rozmiar(page, 390, 844);
  },
});

/** Nazwy osiedli z dwóch pozostałych dem na szyldzie telefonu (przymorze sprawdza `uklad-pasek-telefon-*`): dłuższa nazwa
    dostaje mniejszą czcionkę zamiast wielokropka, a pasek nie rośnie. */
const nazwaTelefon = (name: string): ShotUklad => ({
  name,
  query: '',
  w: 390,
  h: 844,
  run: async (page, base) => {
    for (const demo of ['lanciego', 'zielonki'] as const) {
      await start(page, base, `demo=${demo}&${GRA}`);
      await rozwinPasek(page);
      for (const w of SZEROKOSCI_TELEFONU) {
        await rozmiar(page, w, 844);
        sprawdzPasek(`${name} ${demo} ${w} px`, await pasekTelefonu(page), { jedenWiersz: true, nazwa: true });
      }
    }
  },
});

/* ---------------------------------------------------------------- górny pasek na komputerze */

interface PasekKomputera {
  /** nazwa elementu → numer wiersza paska (0 to pierwszy) */
  wiersz: Record<string, number>;
  /** lewe krawędzie przycisków w pasku (do kolejności) i prawa krawędź „Menu” względem wnętrza paska */
  lewa: Record<string, number>;
  doPrawej: number;
  pasek: number;
  wierszeStatow: number;
}

const ELEMENTY_PASKA: [string, string][] = [
  ['szyld', '#top .sign'],
  ['zegar', '#top .clock'],
  ['tempo', '#speed'],
  ['alarm', '#btnAlarm'],
  ['stan', '#stats'],
  ['mapa', '#btnMiasto'],
  ['praca', '#btnPraca'],
  ['budowa', '#btnBuild'],
  ['menu', '#btnMenu'],
];

/** wiersz paska każdego elementu (po pionowym środku), kolejność przycisków i dosunięcie „Menu” do prawej krawędzi */
const pasekKomputera = (page: Page, elementy: [string, string][], z: { badania: boolean }): Promise<PasekKomputera> =>
  page.evaluate(
    ([lista, badania]) => {
      // przycisk „Badania” stoi w pasku dopiero od pracowni: scenariusz pokazuje najszerszy pasek, jaki się trafia
      if (badania) document.getElementById('btnResearch')!.hidden = false;
      const wyniki = lista.map(([nazwa, sel]) => {
        const e = document.querySelector<HTMLElement>(sel);
        const r = e && !e.hidden && getComputedStyle(e).display !== 'none' ? e.getBoundingClientRect() : null;
        return { nazwa, r: r && r.width > 0 ? r : null };
      });
      const srodki = [...new Set(wyniki.filter((x) => x.r).map((x) => Math.round((x.r!.top + x.r!.bottom) / 2)))].sort(
        (a, b) => a - b,
      );
      // środki w odległości do 14 px to ten sam wiersz (szyld jest wyższy od przycisków, ale ich środki się schodzą)
      const wiersze: number[][] = [];
      for (const s of srodki) {
        const ost = wiersze[wiersze.length - 1];
        if (ost && s - ost[ost.length - 1] <= 14) ost.push(s);
        else wiersze.push([s]);
      }
      const numer = (r: DOMRect) => {
        const s = Math.round((r.top + r.bottom) / 2);
        return wiersze.findIndex((w) => w.includes(s));
      };
      const wiersz: Record<string, number> = {};
      const lewa: Record<string, number> = {};
      for (const x of wyniki)
        if (x.r) {
          wiersz[x.nazwa] = numer(x.r);
          lewa[x.nazwa] = x.r.left;
        }
      if (badania) {
        const r = document.getElementById('btnResearch')!.getBoundingClientRect();
        wiersz.badania = numer(r);
        lewa.badania = r.left;
      }
      const pasek = document.getElementById('top')!;
      const p = pasek.getBoundingClientRect();
      const cs = getComputedStyle(pasek);
      const menu = document.getElementById('btnMenu')!.getBoundingClientRect();
      const kafelki = [...document.querySelectorAll<HTMLElement>('#stats .stat')].filter(
        (e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0,
      );
      return {
        wiersz,
        lewa,
        doPrawej: p.right - Number.parseFloat(cs.paddingRight) - Number.parseFloat(cs.borderRightWidth) - menu.right,
        pasek: p.height,
        wierszeStatow: new Set(kafelki.map((e) => Math.round(e.getBoundingClientRect().top))).size,
      };
    },
    [elementy, z.badania] as const,
  );

/** Górny pasek na komputerze ma w każdym demie, trybie i języku, i od 1280 do 1920 px, ten sam układ: tempo gry i zegar
    w pierwszym wierszu, stan i przyciski („Mapa miasta”, „Praca”, „Budowa”, „Menu”) w drugim, przyciski w tej kolejności
    i dosunięte do prawej krawędzi. Wcześniej wiersz, w którym łamał się pasek, zależał od długości nazwy osiedla, liczby kafelków
    trybu zombie i języka (raz stan siedział w pierwszym wierszu, raz obok przycisków w drugim, raz „Mapa miasta” została sama
    na końcu pierwszego). */
const pasekKomputer = (name: string, out: string): ShotUklad => ({
  name,
  query: '',
  w: 1440,
  h: 900,
  run: async (page, base) => {
    const wzor = { szyld: 0, zegar: 0, tempo: 0, alarm: 0, stan: 1, mapa: 1, praca: 1, budowa: 1, menu: 1 };
    const podpis = (w: Record<string, number>) =>
      Object.entries(w)
        .map(([k, v]) => `${k}:${v}`)
        .join(' ');
    const zle: string[] = [];
    let ile = 0;
    for (const demo of DEMA)
      for (const zombie of [false, true]) {
        await start(page, base, `demo=${demo}${zombie ? '&tryb=zombie' : ''}&${GRA}`);
        for (const lang of ['pl', 'en'] as const) {
          await ustawJezyk(page, lang);
          for (const szer of SZEROKOSCI_KOMPUTERA)
            for (const badania of [false, true]) {
              if (badania && szer !== 1280) continue;
              await rozmiar(page, szer, 900);
              const p = await pasekKomputera(page, ELEMENTY_PASKA, { badania });
              ile++;
              const opis = `${demo} ${zombie ? 'zombie' : 'zwykły'} ${lang} ${szer} px${badania ? ' z „Badaniami”' : ''}`;
              const wzorB = badania ? { ...wzor, badania: 1 } : wzor;
              const jest = podpis(p.wiersz);
              const blad: string[] = [];
              if (jest !== podpis(wzorB)) blad.push(`wiersze: ${jest} zamiast ${podpis(wzorB)}`);
              if (p.wierszeStatow !== 1) blad.push(`stan w ${p.wierszeStatow} wierszach`);
              const kolejnosc = [
                p.lewa.mapa,
                p.lewa.praca,
                p.lewa.budowa,
                ...(badania ? [p.lewa.badania] : []),
                p.lewa.menu,
              ];
              if (kolejnosc.some((x, i) => i > 0 && x <= kolejnosc[i - 1])) blad.push('przyciski nie idą po kolei');
              if (Math.abs(p.doPrawej) > 1.5) blad.push(`„Menu” ${p.doPrawej.toFixed(1)} px od prawej krawędzi paska`);
              if (blad.length) zle.push(`${opis}: ${blad.join('; ')}`);
              if (szer === 1440 && !badania && lang === 'pl')
                await page.screenshot({
                  path: path.join(out, `${name}-${demo}-${zombie ? 'zombie' : 'zwykly'}.png`),
                  clip: { x: 0, y: 0, width: 1440, height: Math.ceil(p.pasek) + 24 },
                });
            }
        }
      }
    console.log(`  ${ile} pomiarów paska na komputerze, naruszeń ${zle.length}`);
    for (const z of zle.slice(0, 40)) console.log(`    ${z}`);
    if (zle.length)
      throw new Error(`pasek na komputerze: ${zle.length} z ${ile} pomiarów ma inny układ (pierwszy: ${zle[0]})`);
  },
});

/* ---------------------------------------------------------------- karta nocy: pełny tekst opcji */

interface WyborPomiar {
  id: string;
  /** tekst wybranej opcji */
  tekst: string;
  /** szerokość tego tekstu w czcionce listy i szerokość pola listy */
  szerTekstu: number;
  szerPola: number;
  /** linia pod listą z pełnym tekstem: jej tekst i czy widać ją na ekranie */
  pelny: { tekst: string; widac: boolean } | null;
}

const wybory = (page: Page): Promise<WyborPomiar[]> =>
  page.evaluate(() => {
    const plotno = document.createElement('canvas').getContext('2d')!;
    return [...document.querySelectorAll<HTMLSelectElement>('#sheet select.pick')].map((s) => {
      const cs = getComputedStyle(s);
      plotno.font = cs.font;
      const tekst = s.selectedOptions[0]?.text ?? '';
      const p = s.parentElement!.querySelector<HTMLElement>('.pick-full');
      const r = p?.getBoundingClientRect();
      return {
        id: s.dataset.id ?? '',
        tekst,
        szerTekstu: plotno.measureText(tekst).width,
        szerPola: s.clientWidth,
        pelny: p
          ? {
              tekst: p.textContent ?? '',
              widac: !p.hidden && getComputedStyle(p).display !== 'none' && !!r && r.width > 0 && r.height > 0,
            }
          : null,
      };
    });
  });

/** Lista wyboru ucina tekst, gdy jest dłuższy niż jej pole bez dopełnienia (do tego strzałka, która zabiera jeszcze ok. 24 px). */
const ucina = (w: WyborPomiar): boolean => w.szerTekstu > w.szerPola - 16;
/** Tekst mieści się z zapasem, więc dodatkowa linia byłaby zbędna. */
const miesciSie = (w: WyborPomiar): boolean => w.szerTekstu < w.szerPola - 90;

/** Karta nocy 20:00 dnia 1: każda lista wyboru, która ucina wybraną opcję, ma pod sobą widoczną linię z jej pełnym tekstem
    (a mieszcząca się opcja nie ma tej linii); zmiana wyboru zmienia też linię; to samo po angielsku. */
const kartaNocyWybor = (name: string, w: number, h: number, out: string): ShotUklad => ({
  name,
  query: '',
  w,
  h,
  run: async (page, base) => {
    const dotyk = dotykowy(w);
    await start(page, base, `demo=przymorze&${GRA}`);
    const o = await przewin(page, () => false, { dotyk, stop: ['karta'] });
    if (o !== 'karta') throw new Error(`${name}: przed 20:00 nie otworzyła się karta nocy (${o})`);
    await page.waitForSelector('#sheet select.pick');
    await poHudzie(page);
    const sprawdz = async (opis: string, wymagajUcietej: boolean): Promise<void> => {
      const lista = await wybory(page);
      const zle: string[] = [];
      let ucietych = 0;
      for (const x of lista) {
        if (ucina(x)) {
          ucietych++;
          if (!x.pelny?.widac)
            zle.push(
              `„${x.tekst}” jest ucięte (${Math.round(x.szerTekstu)} > ${x.szerPola} px), a pod listą nie ma pełnego tekstu`,
            );
          else if (x.pelny.tekst !== x.tekst) zle.push(`linia pod listą „${x.pelny.tekst}” zamiast „${x.tekst}”`);
        } else if (miesciSie(x) && x.pelny?.widac) zle.push(`„${x.tekst}” się mieści, a pod listą stoi zbędna linia`);
      }
      console.log(
        `  ${opis}: list ${lista.length}, uciętych ${ucietych}${zle.length ? `, NARUSZENIA: ${zle.length}` : ''}`,
      );
      if (zle.length) throw new Error(`${opis}: ${zle.join('; ')}`);
      if (wymagajUcietej && !ucietych)
        throw new Error(`${opis}: żadna lista nie ucina tekstu, scenariusz niczego nie dowodzi`);
    };
    await sprawdz(`${name}, po polsku`, dotyk);
    await page.screenshot({ path: path.join(out, `${name}-pl.png`) });
    // zmiana wyboru: pełny tekst idzie za nowym wyborem
    const zmieniono = await page.evaluate(() => {
      const s = [...document.querySelectorAll<HTMLSelectElement>('#sheet select.pick')].find((q) =>
        [...q.options].some((op) => !op.disabled && op.value !== q.value && op.value.startsWith('warta:')),
      );
      if (!s) return null;
      const nowa = [...s.options].find((op) => !op.disabled && op.value !== s.value && op.value.startsWith('warta:'))!;
      return { id: s.dataset.id ?? '', wartosc: nowa.value };
    });
    if (zmieniono) {
      await page.selectOption(`#sheet select.pick[data-id="${zmieniono.id}"]`, zmieniono.wartosc);
      await poHudzie(page);
      await sprawdz(`${name}, po zmianie wyboru`, false);
    }
    await ustawJezyk(page, 'en');
    await page.waitForSelector('#sheet select.pick');
    await poHudzie(page);
    await sprawdz(`${name}, po angielsku`, dotyk);
    await page.screenshot({ path: path.join(out, `${name}-en.png`) });
  },
});

/* ---------------------------------------------------------------- ResizeObserver */

/** Okienko celów wyższe od miejsca nad kartą osoby (powiększona czcionka celów): ograniczenie wysokości z karty naprawdę się
    zmienia, kiedy karta się pojawia i znika, a o to potyka się pomiar wysokości nakładek w src/main.ts. */
const CELE_WYSOKIE = '.goal, .goal-how { font-size: 20px !important }';

/** Przełącza kartę osoby, okienko celów i panele budowy oraz Pracy, a potem liczy błędy okna „ResizeObserver loop completed
    with undelivered notifications” (Playwright ich nie zgłasza, bo to nie wyjątki; serwer deweloperski Vite pisze je jako
    „[Unhandled error]”). Ma ich być zero. */
const resizeObserver = (name: string, w: number, h: number): ShotUklad => ({
  name,
  query: '',
  w,
  h,
  run: async (page, base) => {
    const dotyk = dotykowy(w);
    await page.addInitScript(() => {
      const okno = window as unknown as { __roUklad: string[] };
      okno.__roUklad = [];
      window.addEventListener('error', (e) => {
        if (/ResizeObserver/.test(e.message)) okno.__roUklad.push(e.message);
      });
    });
    await start(page, base, `demo=przymorze&${GRA}`);
    await page.evaluate(() => window.zm!.rozdzial('r1'));
    await page.addStyleTag({ content: CELE_WYSOKIE });
    await poHudzie(page);
    const rundy = 6;
    for (let k = 0; k < rundy; k++) {
      await kliknij(page, '#lista .lp >> nth=0', dotyk);
      await klatki(page);
      await kliknij(page, '#goals .goals-head >> nth=0', dotyk);
      await klatki(page);
      await kliknij(page, '#goals .goals-head >> nth=0', dotyk);
      await klatki(page);
      await kliknij(page, '#btnBuild', dotyk);
      await klatki(page);
      await page.keyboard.press('Escape');
      await klatki(page);
      if (!dotyk) {
        await page.keyboard.press('p');
        await klatki(page);
        await page.keyboard.press('Escape');
        await klatki(page);
      }
      await page.keyboard.press('Escape');
      await klatki(page);
    }
    await poHudzie(page, 3);
    const bledy = await page.evaluate(() => (window as unknown as { __roUklad: string[] }).__roUklad);
    console.log(`  ${rundy} rund przełączania karty, celów i paneli: błędów okna ${bledy.length}`);
    if (bledy.length) throw new Error(`${name}: ${bledy.length}× „${bledy[0]}”`);
  },
});

/* ---------------------------------------------------------------- stos nakładek na telefonie */

export interface Stos {
  szyld: Prosty | null;
  cele: Prosty | null;
  lista: Prosty | null;
  karta: Prosty | null;
  podpowiedz: Prosty | null;
  tekstPodpowiedzi: string;
  szuflada: Prosty | null;
  przybysze: Prosty | null;
  /** przyciski przybliżenia przy prawej krawędzi */
  przyciski: Prosty | null;
  /** czy środek nazwy i linii rodziny na karcie osoby jest naprawdę widać (nic nad nimi nie leży) */
  nazwaKarty: boolean | null;
  rodzinaKarty: boolean | null;
  bieznyCel: Prosty | null;
}

export const stos = (page: Page): Promise<Stos> =>
  page.evaluate(() => {
    const widoczny = (e: Element | null): e is HTMLElement => {
      if (!(e instanceof HTMLElement) || e.hidden || getComputedStyle(e).display === 'none') return false;
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const prosty = (r: DOMRect): { l: number; t: number; r: number; b: number } => ({
      l: r.left,
      t: r.top,
      r: r.right,
      b: r.bottom,
    });
    const jeden = (sel: string) => {
      const e = document.querySelector(sel);
      return widoczny(e) ? prosty(e.getBoundingClientRect()) : null;
    };
    const chipy = [...document.querySelectorAll('#lista .lp')].filter(widoczny).map((e) => e.getBoundingClientRect());
    const lista = chipy.length
      ? {
          l: Math.min(...chipy.map((c) => c.left)),
          t: Math.min(...chipy.map((c) => c.top)),
          r: Math.max(...chipy.map((c) => c.right)),
          b: Math.max(...chipy.map((c) => c.bottom)),
        }
      : null;
    // czy w środku elementu karty leży on sam (a nie chip, okienko celów albo podpowiedź)
    const naWierzchu = (sel: string): boolean | null => {
      const e = document.querySelector<HTMLElement>(sel);
      if (!widoczny(e)) return null;
      const r = e.getBoundingClientRect();
      const na = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!na && (na === e || e.contains(na) || (na.closest('#card') !== null && na.closest('#lista') === null));
    };
    const bie = document.querySelector('#goals li.now');
    const bieR = bie ? bie.getBoundingClientRect() : null;
    const jak = bie?.querySelector('.goal-how')?.getBoundingClientRect();
    return {
      szyld: jeden('#top'),
      cele: jeden('#goals'),
      lista,
      karta: jeden('#card'),
      podpowiedz: jeden('#hint'),
      tekstPodpowiedzi: document.getElementById('hint')?.textContent ?? '',
      szuflada: jeden('#buildPanel'),
      przybysze: jeden('#arrive'),
      przyciski: jeden('.mapctl'),
      nazwaKarty: naWierzchu('#card h2'),
      rodzinaKarty: naWierzchu('#card .rodzina, #card .sub.gen'),
      bieznyCel: bieR ? { l: bieR.left, t: bieR.top, r: bieR.right, b: Math.max(bieR.bottom, jak?.bottom ?? 0) } : null,
    };
  });

const przeciecie = (a: Prosty | null, b: Prosty | null): number => {
  if (!a || !b) return 0;
  const w = Math.min(a.r, b.r) - Math.max(a.l, b.l);
  const h = Math.min(a.b, b.b) - Math.max(a.t, b.t);
  return w > 0.5 && h > 0.5 ? Math.round(w * h) : 0;
};

/** wszystkie pary nakładek, które na siebie nachodzą (karta i szuflada: dozwolone to szuflada na okienku celów, bo szuflada
    leży z zamysłu nad rozwiniętą listą) */
export function nachodzenia(s: Stos, o: { szufladaNaCelach: boolean }): string[] {
  const pary: [string, Prosty | null, string, Prosty | null][] = [
    ['okienko celów', s.cele, 'lista ludzi', s.lista],
    ['okienko celów', s.cele, 'karta osoby', s.karta],
    ['lista ludzi', s.lista, 'karta osoby', s.karta],
    ['przyciski przybliżenia', s.przyciski, 'karta osoby', s.karta],
    ['podpowiedź', s.podpowiedz, 'okienko celów', s.cele],
    ['podpowiedź', s.podpowiedz, 'lista ludzi', s.lista],
    ['podpowiedź', s.podpowiedz, 'karta osoby', s.karta],
    ['podpowiedź', s.podpowiedz, 'pasek', s.szyld],
    ['szuflada budowy', s.szuflada, 'lista ludzi', s.lista],
    ['szuflada budowy', s.szuflada, 'karta osoby', s.karta],
    ['szuflada budowy', s.szuflada, 'podpowiedź', s.podpowiedz],
    ['komunikat o przybyszach', s.przybysze, 'okienko celów', s.cele],
    ['komunikat o przybyszach', s.przybysze, 'lista ludzi', s.lista],
  ];
  const zle = pary
    .filter(([, a, , b]) => przeciecie(a, b) > 0)
    .map(([na, a, nb, b]) => `${na} nachodzi na ${nb} (${przeciecie(a, b)} px²)`);
  if (!o.szufladaNaCelach && przeciecie(s.szuflada, s.cele) > 0) zle.push('szuflada budowy nachodzi na okienko celów');
  // szuflada nie zakrywa bieżącego celu z jego podpowiedzią (leży pod nim)
  if (s.szuflada && s.bieznyCel && s.szuflada.t < s.bieznyCel.b - 1)
    zle.push(
      `szuflada budowy zakrywa bieżący cel (szuflada od ${Math.round(s.szuflada.t)} px, cel do ${Math.round(s.bieznyCel.b)} px)`,
    );
  return zle;
}

/** Telefon z rozwiniętym okienkiem celów (rozdział R1, pięć celów), kartą osoby i podpowiedzią startową: lista ludzi stoi nad
    kartą, nie zakrywa jej imienia ani rodziny, podpowiedź jest czytelna i leży w wolnym miejscu między listą a kartą, a okienko
    celów kurczy się (i przewija w środku) tyle, ile trzeba. Potem szuflada budowy: lista ludzi nie leży na jej kafelkach. */
const stosTelefon = (
  name: string,
  w: number,
  h: number,
  v: { zombie: boolean; en: boolean },
  out: string,
): ShotUklad => ({
  name,
  query: '',
  w,
  h,
  touch: true,
  lang: v.en ? 'en' : 'pl',
  run: async (page, base) => {
    await start(page, base, `demo=przymorze${v.zombie ? '&tryb=zombie' : ''}&${GRA}`);
    // podpowiedź startowa wisi 9 s od początku gry: pomiar mieści się w tym czasie, a na wypadek wolnej maszyny jest
    // sprawdzenie, że naprawdę była
    await page.evaluate(() => window.zm!.rozdzial('r1'));
    await poHudzie(page);
    await kliknij(page, '#goals .goals-head >> nth=0', true);
    await poHudzie(page);
    await kliknij(page, '#lista .lp >> nth=0', true);
    await page.waitForSelector('#card:not([hidden])');
    await poHudzie(page);
    let s = await stos(page);
    if (!s.tekstPodpowiedzi)
      throw new Error(`${name}: podpowiedź startowa zniknęła przed pomiarem (maszyna zbyt wolna?)`);
    const opis = `${name} ${w}×${h}`;
    let zle = nachodzenia(s, { szufladaNaCelach: true });
    if (s.nazwaKarty === false) zle.push('imię na karcie osoby jest przykryte');
    if (s.rodzinaKarty === false) zle.push('linia rodziny na karcie osoby jest przykryta');
    const cele = s.cele ? `${Math.round(s.cele.t)}–${Math.round(s.cele.b)}` : '-';
    console.log(
      `  ${opis}, podpowiedź startowa: cele ${cele}, lista ${s.lista ? `${Math.round(s.lista.t)}–${Math.round(s.lista.b)}` : '-'}, podpowiedź ${s.podpowiedz ? `${Math.round(s.podpowiedz.t)}–${Math.round(s.podpowiedz.b)}` : '-'}, karta ${s.karta ? Math.round(s.karta.t) : '-'}${zle.length ? `, NARUSZENIA: ${zle.length}` : ''}`,
    );
    if (zle.length) throw new Error(`${opis}, podpowiedź startowa: ${zle.join('; ')}`);
    await page.screenshot({ path: path.join(out, `${name}-podpowiedz.png`) });
    // druga podpowiedź, już po zniknięciu startowej: alarm („Do broni!”) mówi o tym u dołu przez kilka sekund
    await kliknij(page, '#btnAlarm', true);
    await page.waitForFunction(() => document.getElementById('hint')!.textContent !== '', null, { timeout: 3000 });
    // układ dochodzi w kilku klatkach (podpowiedź, okienko celów, lista ludzi), toast trwa dłużej niż ta chwila
    await poHudzie(page, 1);
    s = await stos(page);
    zle = nachodzenia(s, { szufladaNaCelach: true });
    if (s.nazwaKarty === false) zle.push('imię na karcie osoby jest przykryte');
    console.log(
      `  ${opis}, podpowiedź po alarmie: „${s.tekstPodpowiedzi.slice(0, 40)}”${zle.length ? `, NARUSZENIA: ${zle.length}` : ''}`,
    );
    if (zle.length) throw new Error(`${opis}, podpowiedź po alarmie: ${zle.join('; ')}`);
    await kliknij(page, '#btnAlarm', true);
    // szuflada budowy od dołu: karta i podpowiedź się chowają, lista ludzi nie leży na szufladzie
    await kliknij(page, '#btnBuild', true);
    await page.waitForSelector('#buildPanel .tile');
    await poHudzie(page);
    s = await stos(page);
    zle = nachodzenia(s, { szufladaNaCelach: true });
    console.log(
      `  ${opis}, szuflada budowy: ${s.szuflada ? `od ${Math.round(s.szuflada.t)} px` : 'brak'}, lista ${s.lista ? 'widoczna' : 'schowana'}${zle.length ? `, NARUSZENIA: ${zle.length}` : ''}`,
    );
    if (zle.length) throw new Error(`${opis}, szuflada budowy: ${zle.join('; ')}`);
    await page.screenshot({ path: path.join(out, `${name}-szuflada.png`) });
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
  },
});

/* ---------------------------------------------------------------- znacznik przewijania okienka celów */

interface Przewijanie {
  wystaje: boolean;
  dol: boolean;
  gora: boolean;
  /** to, co widać: maska u dołu okienka i cień pod przyklejonym nagłówkiem */
  maska: boolean;
  cien: boolean;
  przewiniecie: number;
}

const przewijanieCelow = (page: Page): Promise<Przewijanie> =>
  page.evaluate(() => {
    const g = document.getElementById('goals')!;
    const cs = getComputedStyle(g);
    const glowa = g.querySelector<HTMLElement>(':scope > .goals-head');
    const maska = `${cs.maskImage} ${cs.getPropertyValue('-webkit-mask-image')}`;
    const znacznik = g.dataset.przewija ?? '';
    return {
      wystaje: g.scrollHeight > g.clientHeight + 1,
      dol: znacznik === 'dol' || znacznik === 'oba',
      gora: znacznik === 'gora' || znacznik === 'oba',
      maska: /gradient/.test(maska),
      cien: !!glowa && getComputedStyle(glowa).boxShadow !== 'none',
      przewiniecie: Math.round(g.scrollTop),
    };
  });

/** Okienko celów, które nie mieści się nad kartą osoby (okno 1440×640: rozdział R1 z kartą), pokazuje, że się przewija:
    zanik u dołu, gdy poniżej jest jeszcze treść, i cień pod przyklejonym nagłówkiem, gdy treść jest już przewinięta; bez
    karty, kiedy wszystko się mieści, nie ma żadnego znaku. */
const celePrzewijanie = (name: string, out: string): ShotUklad => ({
  name,
  query: '',
  w: 1440,
  h: 640,
  run: async (page, base) => {
    await start(page, base, `demo=przymorze&${GRA}`);
    await page.evaluate(() => window.zm!.rozdzial('r1'));
    await poHudzie(page, 3);
    const opis = (s: string) => `${name}, ${s}`;
    const rzuc = (o: string, p: Przewijanie, czego: string) => {
      throw new Error(`${opis(o)}: ${czego} (${JSON.stringify(p)})`);
    };
    // bez karty okienko się mieści: żadnego znaku
    let p = await przewijanieCelow(page);
    console.log(`  bez karty: ${JSON.stringify(p)}`);
    if (p.wystaje)
      throw new Error(`${opis('bez karty')}: okienko już nie mieści się w oknie, scenariusz niczego nie dowodzi`);
    if (p.dol || p.gora || p.maska || p.cien) rzuc('bez karty', p, 'znak przewijania, choć treść się mieści');
    // z kartą okienko jest ograniczone: treść wystaje pod dolną krawędź, więc zanik u dołu
    await page.click('#lista .lp >> nth=0');
    await page.waitForSelector('#card:not([hidden])');
    await poHudzie(page, 3);
    await page.evaluate(() => {
      document.getElementById('goals')!.scrollTop = 0;
    });
    await poHudzie(page);
    p = await przewijanieCelow(page);
    console.log(`  z kartą, na początku listy: ${JSON.stringify(p)}`);
    if (!p.wystaje) throw new Error(`${opis('z kartą')}: okienko się mieści, scenariusz niczego nie dowodzi`);
    if (!p.dol || !p.maska) rzuc('z kartą, na początku listy', p, 'brak zaniku u dołu, choć niżej jest jeszcze treść');
    if (p.gora || p.cien) rzuc('z kartą, na początku listy', p, 'cień pod nagłówkiem, choć lista stoi na początku');
    await page.screenshot({ path: path.join(out, `${name}-poczatek.png`) });
    // na końcu listy: nic pod spodem (bez zaniku u dołu), ale treść jest przewinięta (cień pod nagłówkiem)
    await page.evaluate(() => {
      const g = document.getElementById('goals')!;
      g.scrollTop = g.scrollHeight;
    });
    await poHudzie(page);
    p = await przewijanieCelow(page);
    console.log(`  z kartą, na końcu listy: ${JSON.stringify(p)}`);
    if (p.dol || p.maska) rzuc('z kartą, na końcu listy', p, 'zanik u dołu, choć niżej nie ma już treści');
    if (!p.gora || !p.cien) rzuc('z kartą, na końcu listy', p, 'brak znaku, że treść jest przewinięta');
    await page.screenshot({ path: path.join(out, `${name}-koniec.png`) });
    // w środku: oba znaki
    await page.evaluate(() => {
      const g = document.getElementById('goals')!;
      g.scrollTop = (g.scrollHeight - g.clientHeight) / 2;
    });
    await poHudzie(page);
    p = await przewijanieCelow(page);
    console.log(`  z kartą, w środku listy: ${JSON.stringify(p)}`);
    if (!p.dol || !p.gora || !p.maska || !p.cien)
      rzuc('z kartą, w środku listy', p, 'brak jednego ze znaków przewijania');
    // karta znika: okienko znów się mieści i znaki znikają
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.getElementById('card')!.hidden, null, { timeout: 3000 });
    await poHudzie(page, 3);
    p = await przewijanieCelow(page);
    console.log(`  po zamknięciu karty: ${JSON.stringify(p)}`);
    if (p.wystaje) throw new Error(`${opis('po zamknięciu karty')}: okienko dalej wystaje`);
    if (p.dol || p.gora || p.maska || p.cien) rzuc('po zamknięciu karty', p, 'znak przewijania, choć treść się mieści');
  },
});

/* ---------------------------------------------------------------- lista scenariuszy */

export function ukladShots(out: string): ShotUklad[] {
  return [
    pasekTelefon('uklad-pasek-telefon-pl-zwykly', 'pl', false, out),
    pasekTelefon('uklad-pasek-telefon-pl-zombie', 'pl', true, out),
    pasekTelefon('uklad-pasek-telefon-en-zwykly', 'en', false, out),
    pasekTelefon('uklad-pasek-telefon-en-zombie', 'en', true, out),
    nazwaTelefon('uklad-nazwa-telefon'),
    pasekKomputer('uklad-pasek-komputer', out),
    kartaNocyWybor('uklad-karta-nocy-wybor-telefon', 390, 844, out),
    kartaNocyWybor('uklad-karta-nocy-wybor-komputer', 1440, 900, out),
    resizeObserver('uklad-resize-observer-komputer', 1440, 900),
    resizeObserver('uklad-resize-observer-telefon', 390, 844),
    stosTelefon('uklad-stos-telefon', 390, 844, { zombie: false, en: false }, out),
    stosTelefon('uklad-stos-telefon-en', 390, 844, { zombie: false, en: true }, out),
    stosTelefon('uklad-stos-telefon-zombie', 390, 844, { zombie: true, en: false }, out),
    stosTelefon('uklad-stos-telefon-360', 360, 740, { zombie: false, en: false }, out),
    celePrzewijanie('uklad-cele-przewijanie', out),
  ];
}
