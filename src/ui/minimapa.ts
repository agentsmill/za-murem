/* Minimapa miasta (docs/superpowers/specs/2026-10-18-mapa-miasta-design.md, „Mapa miasta i minimapa na ekranie”): mały
   kwadrat w rogu ekranu gry z okolicą osiedla. Kropki w kolorach kategorii miejsc (te same kolory co ikony okna mapy,
   `ikonaKategorii`), koło mapy lokalnej 192 m, siedziba pośrodku i znaczniki wypraw w drodze w miejscu celu.
   Stuknięcie albo Enter i spacja na przycisku otwierają okno mapy miasta (`otworz`, w grze `openMiasto`). Minimapa
   gry nie zatrzymuje, niczego nie zmienia i niczego nie pobiera: rysuje to, co gra już ma (okolica po filtrze nazw
   i stan zarządu), a nazw miejsc nie pokazuje wcale.

   Kontrakt.
   - Czyste funkcje (testy w Node): `punktyMinimapy` (metry od adresu na piksele kwadratu o boku `bok` i połowie boku
     `zasiegM` m; x na wschód w prawo, y na południe w dół, północ u góry, bez obrotu świata, jak `Miejsce`; miejsca poza
     zasięgiem odpadają, cel wyprawy poza zasięgiem staje na brzegu w swoją stronę, żeby znacznik nie znikał; koło
     mapy lokalnej ma promień `192 * bok / (2 * zasiegM)`), `celeWypraw` (położenie celów wypraw w drodze: dzienne
     z `st.wyprawy` i nocne z `st.night.exp`, jeszcze niewrócone; cele z TARGETS nie mają prawdziwego położenia, więc
     ich nie ma), `podpisWypraw` i `czyPoraNaOdswiezenie` (kiedy rysować od nowa).
   - Klasa `Minimapa` (tylko przeglądarka) trzyma elementy z index.html (`#minimapa`: przycisk z płótnem i atrybucja
     map pod spodem). `ustaw(zrodlo)` włącza ją dla nowej gry (null chowa: opcja `?miasto=0` i osiedle zapasowe nie mają
     miasta), `odswiez()` wołane co klatkę z `drawState` sprawdza stan najwyżej raz na ODSWIEZ_MS i rysuje tylko przy
     zmianie (znaczniki wypraw, rozmiar, gęstość pikseli). Ukryta stylem (telefon, niski ekran) niczego nie rysuje.
   Bez hypot, sin i cos; nic stąd nie trafia do stanu gry. */

import { type Cel, MAX_OKOLICA_M } from '../gov/wyprawy.ts';
import { css } from '../render/art/palette.ts';
import { type Miejsce, PROMIEN_MAPY_LOKALNEJ } from '../world/miasto.ts';
import { CIEMNY, ikonaKategorii, LAD, LAMPA, SIEDZIBA } from './miasto.ts';

/** połowa boku minimapy w metrach od adresu: cała okolica, którą dostaje zarząd (do 720 m) */
export const ZASIEG_MINIMAPY_M = MAX_OKOLICA_M;
/** stan minimapy sprawdzany najwyżej raz na tyle milisekund */
export const ODSWIEZ_MS = 500;

// ---------------------------------------------------------------- czyste funkcje

/** Punkty do narysowania w pikselach kwadratu minimapy (lewy górny róg to (0, 0)). */
export interface PunktyMinimapy {
  ikony: { px: number; py: number; kat: string }[];
  wyprawy: { px: number; py: number }[];
  mapaLokalna: { px: number; py: number; r: number };
}

/** Miejsca, znaczniki wypraw i koło mapy lokalnej na kwadracie o boku `bok` pikseli, który obejmuje `zasiegM` metrów od
    adresu w każdą stronę (adres (0, 0) leży w środku). Miejsce poza kwadratem odpada (brzeg wliczony), cel wyprawy
    poza kwadratem stoi na jego brzegu w kierunku celu. Kolejność wejścia zostaje. Wejścia nie zmienia. */
export function punktyMinimapy(
  okolica: readonly Miejsce[],
  wyprawy: readonly { x: number; y: number }[],
  bok: number,
  zasiegM: number,
): PunktyMinimapy {
  const sr = bok / 2;
  const dzielnik = 2 * zasiegM;
  const ikony: PunktyMinimapy['ikony'] = [];
  for (const m of okolica) {
    if (Math.abs(m.x) > zasiegM || Math.abs(m.y) > zasiegM) continue;
    ikony.push({ px: sr + (m.x * bok) / dzielnik, py: sr + (m.y * bok) / dzielnik, kat: m.kat });
  }
  const znaczniki = wyprawy.map(({ x, y }) => {
    // za daleko: skala po dalszej osi, więc znacznik leży na brzegu kwadratu na prostej od adresu do celu
    const d = Math.max(Math.abs(x), Math.abs(y));
    const k = d > zasiegM ? zasiegM / d : 1;
    return { px: sr + (x * k * bok) / dzielnik, py: sr + (y * k * bok) / dzielnik };
  });
  return { ikony, wyprawy: znaczniki, mapaLokalna: { px: sr, py: sr, r: (PROMIEN_MAPY_LOKALNEJ * bok) / dzielnik } };
}

/** To, co minimapa czyta ze stanu zarządu (`GovState` pasuje): wyprawy dzienne w drodze i noc z wyprawami z karty. */
export interface WyprawyStanu {
  wyprawy?: readonly { cel: Cel }[];
  night?: {
    confirmed: boolean;
    returned: readonly string[];
    exp: readonly { target: string; cel?: Cel }[];
  } | null;
}

/** Położenie celów wypraw, które są teraz w drodze: dzienne z `wyprawy`, nocne z zatwierdzonej karty (grupa, która nie
    wróciła, i ma opis celu; stare grupy bez opisu go nie mają). Cel z TARGETS (`kat === null`, (0, 0)) nie ma
    prawdziwego położenia, więc go nie ma w wyniku: nie ma sensu rysować go w środku mapy. */
export function celeWypraw(st: WyprawyStanu | null): { x: number; y: number }[] {
  if (!st) return [];
  const cele: Cel[] = [];
  for (const w of st.wyprawy ?? []) cele.push(w.cel);
  const n = st.night;
  if (n?.confirmed) for (const e of n.exp) if (e.cel && !n.returned.includes(e.target)) cele.push(e.cel);
  return cele.filter((c) => c.kat !== null).map((c) => ({ x: c.x, y: c.y }));
}

/** Podpis znaczników wypraw: równy, dopóki się nie zmienią (minimapę rysujemy od nowa tylko przy zmianie). */
export function podpisWypraw(wyprawy: readonly { x: number; y: number }[]): string {
  return wyprawy.map((w) => `${w.x},${w.y}`).join(';');
}

/** Czy minął czas na kolejne sprawdzenie stanu: pierwsze od razu, potem co ODSWIEZ_MS; zegar, który się cofnął (nowa
    gra, zmiana karty), nie blokuje. */
export function czyPoraNaOdswiezenie(teraz: number, ostatnio: number | null): boolean {
  return ostatnio === null || teraz < ostatnio || teraz - ostatnio >= ODSWIEZ_MS;
}

// ---------------------------------------------------------------- rysowanie (tylko przeglądarka)

/** Skąd minimapa bierze dane: okolica po filtrze nazw i stan zarządu (wyprawy w drodze). */
export interface ZrodloMinimapy {
  okolica: readonly Miejsce[];
  st: () => WyprawyStanu | null;
}

/** Stan minimapy do testów w przeglądarce i zrzutów (`window.zm.minimapa().stan()`). */
export interface StanMinimapy {
  /** czy jest włączona dla tej gry (nie schowana przez `ustaw(null)`) */
  wlaczona: boolean;
  /** czy stoi na ekranie (nie schowana stylem: telefon, niski ekran) */
  widoczna: boolean;
  /** bok płótna w pikselach CSS (0, gdy schowana) */
  bok: number;
  /** ile razy narysowano od nowa i ile miejsc i znaczników wypraw było na ostatnim rysunku */
  rysunki: number;
  ikony: number;
  wyprawy: number;
}

/** rozmiar kropki miejsca w pikselach CSS: obrys i środek (nieparzyste, żeby kropka stała na pikselu) */
const KROPKA_OBRYS = 5;
const KROPKA = 3;

export class Minimapa {
  private readonly root: HTMLElement;
  private readonly cv: HTMLCanvasElement | null;
  private readonly ctx: CanvasRenderingContext2D | null;
  private zr: ZrodloMinimapy | null = null;
  private ostatnio: number | null = null;
  private podpis = '';
  private rysunki = 0;
  private ikony = 0;
  private wyprawy = 0;
  private widoczna = false;
  private bok = 0;

  /** `root`: element z index.html (`#minimapa`: przycisk z płótnem i atrybucja); `otworz`: co robi stuknięcie. Przycisk
      po kliknięciu myszą albo dotykiem oddaje fokus (`detail` > 0), żeby spacja, która w grze zatrzymuje czas, nie
      otwierała okna drugi raz; z klawiatury (Enter, spacja) fokus zostaje. */
  constructor(root: HTMLElement, otworz: () => void) {
    this.root = root;
    this.cv = root.querySelector<HTMLCanvasElement>('canvas');
    this.ctx = this.cv?.getContext('2d') ?? null;
    const przycisk = root.querySelector<HTMLButtonElement>('button');
    przycisk?.addEventListener('click', (e) => {
      if (e.detail > 0) przycisk.blur();
      otworz();
    });
  }

  /** Włącza minimapę dla nowej gry (rysuje od razu przy najbliższym `odswiez`); null chowa ją całkiem. */
  ustaw(zr: ZrodloMinimapy | null): void {
    this.zr = zr;
    this.root.hidden = !zr;
    this.podpis = '';
    this.ostatnio = null;
    this.widoczna = false;
  }

  /** Sprawdza stan najwyżej raz na ODSWIEZ_MS (`teraz` w milisekundach, domyślnie zegar strony) i rysuje od nowa tylko
      przy zmianie znaczników wypraw, rozmiaru albo gęstości pikseli. Schowana stylem nie rysuje niczego. */
  odswiez(teraz: number = performance.now()): void {
    const { zr, cv, ctx } = this;
    if (!zr || !cv || !ctx || !czyPoraNaOdswiezenie(teraz, this.ostatnio)) return;
    this.ostatnio = teraz;
    const bok = Math.round(cv.clientWidth);
    this.widoczna = bok > 0;
    this.bok = bok;
    if (!this.widoczna) {
      this.podpis = '';
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    const cele = celeWypraw(zr.st());
    const podpis = `${bok}@${dpr}|${podpisWypraw(cele)}`;
    if (podpis === this.podpis) return;
    this.podpis = podpis;
    this.rysuj(ctx, cv, bok, dpr, punktyMinimapy(zr.okolica, cele, bok, ZASIEG_MINIMAPY_M));
  }

  stan(): StanMinimapy {
    return {
      wlaczona: !!this.zr,
      widoczna: this.widoczna,
      bok: this.widoczna ? this.bok : 0,
      rysunki: this.rysunki,
      ikony: this.ikony,
      wyprawy: this.wyprawy,
    };
  }

  /** ląd, koło mapy lokalnej (miejsca w nim przygaszone: nie są celami), kropki kategorii, siedziba, znaczniki wypraw */
  private rysuj(
    ctx: CanvasRenderingContext2D,
    cv: HTMLCanvasElement,
    bok: number,
    dpr: number,
    p: PunktyMinimapy,
  ): void {
    cv.width = cv.height = Math.round(bok * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = css(LAD);
    ctx.fillRect(0, 0, bok, bok);
    const { px: ox, py: oy, r } = p.mapaLokalna;
    ctx.beginPath();
    ctx.arc(ox, oy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgb(230 165 64 / 0.16)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = LAMPA;
    ctx.stroke();
    // miejsca z mapy osiedla pod spodem i przygaszone, reszta na wierzchu; w każdej grupie najpierw wszystkie obrysy,
    // potem wszystkie środki, żeby gęsta kępa miejsc nie zlewała się w ciemną plamę
    const wKole = (i: { px: number; py: number }) => (i.px - ox) * (i.px - ox) + (i.py - oy) * (i.py - oy) <= r * r;
    const kropki = (grupa: PunktyMinimapy['ikony'], alfa: number) => {
      ctx.globalAlpha = alfa;
      ctx.fillStyle = CIEMNY;
      for (const i of grupa) ctx.fillRect(Math.round(i.px) - 2, Math.round(i.py) - 2, KROPKA_OBRYS, KROPKA_OBRYS);
      for (const i of grupa) {
        ctx.fillStyle = ikonaKategorii(i.kat).tlo;
        ctx.fillRect(Math.round(i.px) - 1, Math.round(i.py) - 1, KROPKA, KROPKA);
      }
      ctx.globalAlpha = 1;
    };
    kropki(
      p.ikony.filter((i) => wKole(i)),
      0.5,
    );
    kropki(
      p.ikony.filter((i) => !wKole(i)),
      1,
    );
    // siedziba: domek 7×7 z ramką, jedna kratka to jeden piksel
    const hx = Math.round(ox) - 4;
    const hy = Math.round(oy) - 4;
    ctx.fillStyle = CIEMNY;
    ctx.fillRect(hx, hy, 9, 9);
    ctx.fillStyle = SIEDZIBA.tlo;
    ctx.fillRect(hx + 1, hy + 1, 7, 7);
    ctx.fillStyle = SIEDZIBA.znak;
    SIEDZIBA.wzor.forEach((wiersz, rz) => {
      for (let q = 0; q < 7; q++) if (wiersz[q] === '#') ctx.fillRect(hx + 1 + q, hy + 1 + rz, 1, 1);
    });
    // wyprawy w drodze: pierścień w kolorze lampy na ciemnym obrysie, nie bliżej brzegu niż promień
    const rw = 5;
    for (const w of p.wyprawy) {
      const x = Math.min(bok - rw, Math.max(rw, w.px));
      const y = Math.min(bok - rw, Math.max(rw, w.py));
      ctx.beginPath();
      ctx.arc(x, y, rw, 0, Math.PI * 2);
      ctx.fillStyle = 'rgb(230 165 64 / 0.4)';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = CIEMNY;
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = LAMPA;
      ctx.stroke();
    }
    this.rysunki++;
    this.ikony = p.ikony.length;
    this.wyprawy = p.wyprawy.length;
  }
}
