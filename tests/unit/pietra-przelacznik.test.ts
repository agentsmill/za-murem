import fs from 'node:fs';
import path from 'node:path';
import type { Application } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { buildScene, CHUNK, type Scene, TILE } from '../../src/render/art/scene.ts';
import type { ChunkPainter, ScenePatch } from '../../src/render/chunks.ts';
import { sectionPietra } from '../../src/render/pietro.ts';
import { chunkiParteru, chunkiPietra, widokPietra } from '../../src/render/pietroWidok.ts';
import { IN, sectionOf } from '../../src/render/section.ts';
import { GameView } from '../../src/render/view.ts';
import type { Pawn, SimState } from '../../src/sim/sim.ts';
import { STATYCZNE } from '../../src/ui/jezyk.ts';
import { nastepnePietro, podpowiedz, pozycjeListy } from '../../src/ui/pietra.ts';
import { demoSwiat } from './pietra-pomoc.ts';

let pamiec: Scene | null = null;
/** scena Lanciego (dużo budynków od dwóch do czternastu kondygnacji) z siedzibą w przekroju; budowana raz */
function lanciego(): Scene {
  if (!pamiec) {
    const w = demoSwiat('lanciego', false);
    pamiec = buildScene(w);
    pamiec.section = sectionOf(w);
  }
  return pamiec;
}

/** kawałki, które dotyka obrys (prostokąt) budynku id: wzór niezależny od testowanej funkcji */
function kawalkiBudynku(sc: Scene, id: number): number[] {
  const b = sc.w.buildings[id];
  const out: number[] = [];
  for (let cy = Math.floor(b.y0 / CHUNK); cy <= Math.floor(b.y1 / CHUNK); cy++)
    for (let cx = Math.floor(b.x0 / CHUNK); cx <= Math.floor(b.x1 / CHUNK); cx++) out.push(cy * sc.chunks + cx);
  return out;
}

describe('kawałki z przekrojem piętra (chunkiPietra)', () => {
  it('na piętrze 1 są wszystkie kawałki dotknięte budynkiem z więcej niż jedną kondygnacją, w tym siedziby', () => {
    const sc = lanciego();
    const zbior = chunkiPietra(sc, 1);
    const wysokie = sc.w.buildings.filter((b) => sc.styles[b.id].levels > 1);
    expect(wysokie.length).toBeGreaterThan(10);
    for (const b of wysokie) for (const k of kawalkiBudynku(sc, b.id)) expect(zbior.has(k)).toBe(true);
    // siedziba ma cztery kondygnacje, więc jej kawałki są w zbiorze
    expect(sc.styles[sc.section!.building].levels).toBeGreaterThan(1);
    for (const k of kawalkiBudynku(sc, sc.section!.building)) expect(zbior.has(k)).toBe(true);
  });

  it('nie ma w nim kawałka, w którym są wyłącznie budynki jednokondygnacyjne', () => {
    const sc = lanciego();
    const zbior = chunkiPietra(sc, 1);
    const wysokie = new Set<number>();
    const niskie = new Set<number>();
    for (const b of sc.w.buildings)
      for (const k of kawalkiBudynku(sc, b.id)) (sc.styles[b.id].levels > 1 ? wysokie : niskie).add(k);
    const tylkoNiskie = [...niskie].filter((k) => !wysokie.has(k));
    // bez takich kawałków test niczego by nie sprawdzał
    expect(tylkoNiskie.length).toBeGreaterThan(0);
    for (const k of tylkoNiskie) expect(zbior.has(k)).toBe(false);
    // i nic ponad kawałki wysokich budynków
    expect([...zbior].sort((a, b) => a - b)).toEqual([...wysokie].sort((a, b) => a - b));
  });

  it('wyższe piętro ma coraz mniej kawałków, a nad najwyższym budynkiem zbiór jest pusty', () => {
    const sc = lanciego();
    const naj = Math.max(...sc.styles.map((s) => s.levels));
    expect(naj).toBeGreaterThan(3);
    let poprzedni = Number.POSITIVE_INFINITY;
    for (let l = 1; l <= naj; l++) {
      const zbior = chunkiPietra(sc, l);
      expect(zbior.size).toBeLessThanOrEqual(poprzedni);
      poprzedni = zbior.size;
    }
    expect(chunkiPietra(sc, 1).size).toBeGreaterThan(chunkiPietra(sc, naj - 1).size);
    expect(chunkiPietra(sc, naj - 1).size).toBeGreaterThan(0);
    expect(chunkiPietra(sc, naj).size).toBe(0);
  });

  it('parter (0) i wartości ujemne dają pusty zbiór: tam kawałki wnętrza liczy siedziba', () => {
    const sc = lanciego();
    expect(chunkiPietra(sc, 0).size).toBe(0);
    expect(chunkiPietra(sc, -1).size).toBe(0);
  });
});

describe('kawałki z przekrojem parteru (chunkiParteru)', () => {
  it('bez sąsiadów to dokładnie kawałki siedziby, jak liczył je widok od zawsze', () => {
    const sc = lanciego();
    const zbior = chunkiParteru(sc);
    expect([...zbior].sort((a, b) => a - b)).toEqual(kawalkiBudynku(sc, sc.section!.building).sort((a, b) => a - b));
    expect(zbior.size).toBeGreaterThan(0);
  });

  it('otwarty sąsiad dokłada swoje kawałki do kawałków siedziby', () => {
    const sc = lanciego();
    const siedziba = new Set(kawalkiBudynku(sc, sc.section!.building));
    // sąsiad, który ma kawałek poza siedzibą
    const sasiad = sc.w.buildings.find(
      (b) => b.id !== sc.section!.building && kawalkiBudynku(sc, b.id).some((k) => !siedziba.has(k)),
    )!;
    expect(sasiad).toBeDefined();
    const z = { ...sc, section: { ...sc.section!, otwarte: new Set([sasiad.id]) } };
    const zbior = chunkiParteru(z);
    for (const k of siedziba) expect(zbior.has(k)).toBe(true);
    for (const k of kawalkiBudynku(sc, sasiad.id)) expect(zbior.has(k)).toBe(true);
    expect(zbior.size).toBe(new Set([...siedziba, ...kawalkiBudynku(sc, sasiad.id)]).size);
  });

  it('scena bez przekroju nie ma kawałków z przekrojem', () => {
    expect(chunkiParteru({ ...lanciego(), section: null }).size).toBe(0);
  });
});

describe('widoczność wnętrz przy wyborze piętra (widokPietra)', () => {
  it('bez przekroju nic nie jest widać ani na parterze, ani na piętrze', () => {
    expect(widokPietra(false, 0)).toEqual({ wnetrza: false, aktywne: false });
    expect(widokPietra(false, 2)).toEqual({ wnetrza: false, aktywne: false });
  });

  it('przekrój na parterze pokazuje wnętrza, jak dotąd', () => {
    expect(widokPietra(true, 0)).toEqual({ wnetrza: true, aktywne: false });
  });

  it('przekrój na piętrze jest aktywny, ale wnętrz parteru (osób, mebli, świateł) nie pokazuje', () => {
    expect(widokPietra(true, 1)).toEqual({ wnetrza: false, aktywne: true });
    expect(widokPietra(true, 2)).toEqual({ wnetrza: false, aktywne: true });
  });
});

/* Widok bez przeglądarki (jak w przeglad-zombie-drobne.test.ts): GameView buduje się w Node, więc kawałki, wersje i łatki
   sprawdza się na polach prywatnych; rysowania PixiJS tu nie ma (to zrzuty ekranu). */

/** to, co w slocie kawałka rusza ustawPietro (tekstury to w teście zaślepki) */
interface Gniazdo {
  near: object | null;
  far: object | null;
  cut: object | null;
  ver: number;
  stale: number;
}
interface WnetrzeWidoku {
  slots: Gniazdo[];
  cutChunks: Set<number>;
  painter: ChunkPainter;
  cutOn: boolean;
}

/** bity stale z view.ts (NEAR_BIT, FAR_BIT, CUT_BIT) */
const NEAR = 1;
const FAR = 2;
const CUT = 4;

/** widok z sceną Lanciego na parterze, każdy kawałek ze wszystkimi trzema teksturami, i zapis łatek dla workerów */
function widok(): { view: GameView; v: WnetrzeWidoku; sc: Scene; lata: ScenePatch[] } {
  const sc: Scene = { ...lanciego(), pietro: 0, pietra: null };
  const view = new GameView();
  view.scene = sc;
  const v = view as unknown as WnetrzeWidoku;
  v.slots = Array.from({ length: sc.chunks * sc.chunks }, () => ({ near: {}, far: {}, cut: {}, ver: 0, stale: 0 }));
  v.cutChunks = chunkiParteru(sc);
  const lata: ScenePatch[] = [];
  v.painter = { patch: (p: ScenePatch) => lata.push(p) } as unknown as ChunkPainter;
  return { view, v, sc, lata };
}

describe('wybór piętra w widoku (GameView.ustawPietro)', () => {
  it('piętro wchodzi do sceny i do łatki dla workerów, a kawałki z przekrojem są budynkami z tym piętrem', () => {
    const { view, v, sc, lata } = widok();
    const sec = sectionPietra(demoSwiat('lanciego', false))!;
    view.ustawPietro(2, sec);
    expect(view.pietro).toBe(2);
    expect(sc.pietro).toBe(2);
    expect(sc.pietra).toBe(sec);
    expect(lata).toHaveLength(1);
    expect(lata[0]).toMatchObject({ pietro: 2, pietra: sec });
    expect([...v.cutChunks].sort((a, b) => a - b)).toEqual([...chunkiPietra(sc, 2)].sort((a, b) => a - b));
  });

  it('stary i nowy zbiór kawałków dostają nową wersję i nieaktualny przekrój, a bliski i daleki zostają ważne', () => {
    const { view, v, sc } = widok();
    const stare = new Set(v.cutChunks);
    const sec = sectionPietra(demoSwiat('lanciego', false))!;
    // piętro 5: siedziba (cztery kondygnacje) go nie ma, więc jej kawałki są tylko w starym zbiorze
    view.ustawPietro(5, sec);
    const nowe = chunkiPietra(sc, 5);
    const suma = new Set([...stare, ...nowe]);
    // oba zbiory mają kawałki, których nie ma w drugim, więc test odróżnia sumę od samego nowego albo starego
    expect([...stare].some((k) => !nowe.has(k))).toBe(true);
    expect([...nowe].some((k) => !stare.has(k))).toBe(true);
    v.slots.forEach((s, k) => {
      if (suma.has(k)) {
        expect(s.ver).toBe(1);
        expect(s.stale).toBe(CUT);
      } else {
        expect(s.ver).toBe(0);
        expect(s.stale).toBe(0);
      }
    });
  });

  it('nie czyści tego, co już było nieaktualne, i nie oznacza przekroju, którego kawałek nie ma', () => {
    const { view, v } = widok();
    const k = [...v.cutChunks][0];
    v.slots[k].stale = NEAR | FAR;
    const bez = [...v.cutChunks][1];
    v.slots[bez].cut = null;
    view.ustawPietro(2, sectionPietra(demoSwiat('lanciego', false))!);
    expect(v.slots[k].stale).toBe(NEAR | FAR | CUT);
    expect(v.slots[bez].stale).toBe(0);
    expect(v.slots[bez].ver).toBe(1);
  });

  it('scenę piętra wysyła raz: następny wybór niesie samo piętro, a powrót na parter { pietro: 0 }', () => {
    const { view, v, sc, lata } = widok();
    const sec = sectionPietra(demoSwiat('lanciego', false))!;
    view.ustawPietro(2, sec);
    view.ustawPietro(3, sec);
    view.ustawPietro(0, null);
    expect(lata).toHaveLength(3);
    expect(lata[1]).toMatchObject({ pietro: 3 });
    expect('pietra' in lata[1]).toBe(false);
    expect(lata[2]).toMatchObject({ pietro: 0 });
    expect('pietra' in lata[2]).toBe(false);
    expect(view.pietro).toBe(0);
    expect(sc.pietro).toBe(0);
    // scena piętra zostaje w scenie na następny wybór
    expect(sc.pietra).toBe(sec);
    // parter: znowu siedziba, tak jak widok liczy ją od zawsze
    expect([...v.cutChunks].sort((a, b) => a - b)).toEqual([...chunkiParteru(sc)].sort((a, b) => a - b));
  });

  it('powrót na parter unieważnia przekrój kawałków piętra, bo zmieniła się ich zawartość', () => {
    const { view, v } = widok();
    const sec = sectionPietra(demoSwiat('lanciego', false))!;
    view.ustawPietro(2, sec);
    for (const s of v.slots) s.stale = 0;
    const naPietrze = new Set(v.cutChunks);
    view.ustawPietro(0, null);
    const suma = new Set([...naPietrze, ...v.cutChunks]);
    v.slots.forEach((s, k) => {
      expect(s.ver).toBe(suma.has(k) ? 2 : 0);
      expect(s.stale).toBe(suma.has(k) ? CUT : 0);
    });
  });

  it('bez sceny nic nie robi', () => {
    const view = new GameView();
    expect(() => view.ustawPietro(2, sectionPietra(demoSwiat('lanciego', false)))).not.toThrow();
    expect(view.pietro).toBe(0);
  });
});

describe('widoczność wnętrz parteru w widoku (wnetrza, pietroAktywne, pick, pickResident)', () => {
  const SEC = sectionPietra(demoSwiat('lanciego', false))!;

  it('wnetrza i pietroAktywne idą za przekrojem i piętrem', () => {
    const { view, v } = widok();
    expect([view.wnetrza, view.pietroAktywne()]).toEqual([false, false]);
    v.cutOn = true;
    expect([view.wnetrza, view.pietroAktywne()]).toEqual([true, false]);
    view.ustawPietro(2, SEC);
    expect([view.wnetrza, view.pietroAktywne()]).toEqual([false, true]);
    view.ustawPietro(0, null);
    expect([view.wnetrza, view.pietroAktywne()]).toEqual([true, false]);
    v.cutOn = false;
    expect([view.wnetrza, view.pietroAktywne()]).toEqual([false, false]);
  });

  /** pionek stojący na kafelku i kliknięcie dokładnie w niego (kamera na pionku, zoom 1) */
  function klik(view: GameView, p: Pick<Pawn, 'x' | 'y'>) {
    view.app = { screen: { width: 800, height: 600 } } as unknown as Application;
    view.cam = { x: p.x * TILE, y: p.y * TILE, zoom: 1 };
    return (st: SimState) => ({ pick: view.pick(st, 400, 300), lokator: view.pickResident(st, 400, 300) });
  }
  const pionek = (kind: string, x: number, y: number) =>
    ({ id: 1, kind, person: 0, away: false, x, y }) as unknown as Pawn;
  const stan = (p: Pawn) => ({ pawns: [p] }) as unknown as SimState;

  it('pod dachem siedziby lokatora da się kliknąć tylko, gdy widać wnętrza parteru, a zarząd na parterze zawsze', () => {
    const { view, v, sc } = widok();
    const i = sc.section!.cell.indexOf(IN.FLOOR);
    const x = (i % sc.w.size) + 0.5;
    const y = Math.floor(i / sc.w.size) + 0.5;
    const zarzad = pionek('core', x, y);
    const lokator = pionek('resident', x, y);
    const kliknij = klik(view, zarzad);

    // zbliżenie na parterze: widać wnętrze, więc obaj są klikalni
    v.cutOn = true;
    expect(kliknij(stan(zarzad)).pick).toBe(zarzad);
    expect(kliknij(stan(lokator)).lokator).toBe(lokator);
    // piętro: wnętrze parteru schowane jak pod dachem, nikogo nie widać, więc nie da się go kliknąć
    view.ustawPietro(2, SEC);
    expect(kliknij(stan(zarzad)).pick).toBeNull();
    expect(kliknij(stan(lokator)).lokator).toBeNull();
    // także z daleka (bez przekroju), bo rysuje się dach albo strop
    v.cutOn = false;
    expect(kliknij(stan(zarzad)).pick).toBeNull();
    expect(kliknij(stan(lokator)).lokator).toBeNull();
    // parter z daleka: lokatora pod dachem nie widać (pickResident tak miał od zawsze), a zarząd jest klikalny jak
    // przed widokiem pięter (pick nie sprawdza tam widoczności)
    view.ustawPietro(0, null);
    expect(kliknij(stan(zarzad)).pick).toBe(zarzad);
    expect(kliknij(stan(lokator)).lokator).toBeNull();
  });

  it('na dworze zarząd i lokatora da się kliknąć zawsze, także na piętrze', () => {
    const { view, v } = widok();
    const zarzad = pionek('core', 0.5, 0.5);
    const lokator = pionek('resident', 0.5, 0.5);
    const kliknij = klik(view, zarzad);
    for (const [cutOn, pietro] of [
      [false, 0],
      [true, 0],
      [true, 2],
    ] as const) {
      v.cutOn = cutOn;
      if (pietro) view.ustawPietro(pietro, SEC);
      else view.ustawPietro(0, null);
      expect(kliknij(stan(zarzad)).pick).toBe(zarzad);
      expect(kliknij(stan(lokator)).lokator).toBe(lokator);
    }
  });
});

describe('lista pięter (pozycjeListy)', () => {
  it('od najwyższego piętra w dół do parteru, wybrane jest tylko jedno', () => {
    const poz = pozycjeListy([0, 1, 2, 3], 2);
    expect(poz.map((p) => p.pietro)).toEqual([3, 2, 1, 0]);
    expect(poz.filter((p) => p.wybrane).map((p) => p.pietro)).toEqual([2]);
  });

  it('podpis parteru to „parter”, pozostałych „piętro”, po angielsku „ground floor” i „floor”', () => {
    const poz = pozycjeListy([0, 1, 2, 3], 0);
    expect(poz.map((p) => p.podpis.pl)).toEqual(['piętro', 'piętro', 'piętro', 'parter']);
    expect(poz.map((p) => p.podpis.en)).toEqual(['floor', 'floor', 'floor', 'ground floor']);
    expect(poz[3].wybrane).toBe(true);
  });

  it('lista z samym parterem ma jedną pozycję, wybraną (kafelek nie ma pozycji bez celu)', () => {
    const poz = pozycjeListy([0], 0);
    expect(poz).toHaveLength(1);
    expect(poz[0]).toMatchObject({ pietro: 0, wybrane: true });
  });

  it('nie zmienia podanej listy', () => {
    const lista = [0, 1, 2];
    pozycjeListy(lista, 1);
    expect(lista).toEqual([0, 1, 2]);
  });
});

describe('podpowiedź przy kafelku piętra (podpowiedz)', () => {
  it('na parterze nie ma podpowiedzi, cokolwiek się dzieje', () => {
    for (const cutOn of [false, true])
      for (const zarzadUkryty of [false, true]) expect(podpowiedz({ pietro: 0, cutOn, zarzadUkryty })).toBeNull();
  });

  it('piętro z daleka (bez przekroju) prosi o przybliżenie, także gdy zarząd jest schowany', () => {
    for (const zarzadUkryty of [false, true]) {
      const t = podpowiedz({ pietro: 2, cutOn: false, zarzadUkryty });
      expect(t).toEqual({ pl: 'Przybliż, żeby zajrzeć na piętro', en: 'Zoom in to look at the floor' });
    }
  });

  it('piętro z bliska i zarząd pod stropem albo dachem: zarząd jest na parterze', () => {
    expect(podpowiedz({ pietro: 2, cutOn: true, zarzadUkryty: true })).toEqual({
      pl: 'Zarząd jest na parterze',
      en: 'The board is on the ground floor',
    });
  });

  it('piętro z bliska i zarząd poza obrysem zakrytego budynku: bez podpowiedzi', () => {
    expect(podpowiedz({ pietro: 2, cutOn: true, zarzadUkryty: false })).toBeNull();
  });

  it('teksty nie mówią o numerze piętra ani o osobach (RODO)', () => {
    for (const o of [
      { pietro: 3, cutOn: false, zarzadUkryty: false },
      { pietro: 3, cutOn: true, zarzadUkryty: true },
    ]) {
      const t = podpowiedz(o)!;
      expect(t.pl).not.toMatch(/\d/);
      expect(t.en).not.toMatch(/\d/);
    }
  });
});

describe('krok o piętro (nastepnePietro)', () => {
  const lista = [0, 1, 2, 3];

  it('w górę i w dół o jedno', () => {
    expect(nastepnePietro(lista, 1, 1)).toBe(2);
    expect(nastepnePietro(lista, 2, -1)).toBe(1);
    expect(nastepnePietro(lista, 0, 1)).toBe(1);
    expect(nastepnePietro(lista, 3, -1)).toBe(2);
  });

  it('na najwyższym piętrze krok w górę zostaje, na parterze krok w dół zostaje', () => {
    expect(nastepnePietro(lista, 3, 1)).toBe(3);
    expect(nastepnePietro(lista, 0, -1)).toBe(0);
  });

  it('piętro spoza listy zaciska do jej krańców', () => {
    expect(nastepnePietro(lista, 7, 1)).toBe(3);
    expect(nastepnePietro(lista, 7, -1)).toBe(3);
    expect(nastepnePietro(lista, -2, -1)).toBe(0);
    expect(nastepnePietro(lista, -2, 1)).toBe(0);
  });

  it('lista z samym parterem nigdzie nie prowadzi', () => {
    expect(nastepnePietro([0], 0, 1)).toBe(0);
    expect(nastepnePietro([0], 0, -1)).toBe(0);
  });
});

describe('kafelek piętra w index.html', () => {
  const html = fs.readFileSync(path.resolve(import.meta.dirname, '../../index.html'), 'utf8');

  it('jest przyciskiem z angielskim podpisem i liczbą, schowany, dopóki gra nie włączy widoku pięter', () => {
    expect(html).toMatch(/<button[^>]*\bid="btnFloor"/);
    expect(html).toContain('<small class="stat-k">floor</small>');
    expect(html).toContain('title="Floor"');
    expect(html).toMatch(/<[^>]*\bid="floorSel"[^>]*\bhidden\b/);
    expect(html).toMatch(/<[^>]*\bid="floorList"[^>]*\brole="menu"/);
    expect(html).toMatch(/<[^>]*\bid="floorNote"[^>]*\brole="status"/);
  });

  it('stoi w pasku po liczniku klatek, przed „Mapą miasta”, a między nią a „Budową” nic nie ma', () => {
    const fps = html.indexOf('id="fps"');
    const kafelek = html.indexOf('id="btnFloor"');
    const miasto = html.indexOf('id="btnMiasto"');
    expect(fps).toBeGreaterThan(0);
    expect(kafelek).toBeGreaterThan(fps);
    expect(miasto).toBeGreaterThan(kafelek);
    // arkusze miasta (miasto.css) opierają się na sąsiedztwie #btnMiasto + #btnBuild
    expect(html).toMatch(/id="btnMiasto"[\s\S]*?<\/button>\s*<button[^>]*\bid="btnBuild"/);
  });

  it('ma wpis napisów statycznych w obu językach (src/ui/jezyk.ts)', () => {
    const wpisy = STATYCZNE.filter((s) => s.sel.startsWith('#btnFloor'));
    expect(wpisy.map((s) => s.sel).sort()).toEqual(['#btnFloor', '#btnFloor .stat-k']);
    expect(wpisy.find((s) => s.sel === '#btnFloor .stat-k')!.tekst).toEqual({ pl: 'piętro', en: 'floor' });
    expect(wpisy.find((s) => s.sel === '#btnFloor')!.title).toEqual({ pl: 'Piętro', en: 'Floor' });
  });
});
