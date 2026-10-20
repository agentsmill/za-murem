/* Pozy pionków z pracy w symulacji (pawn.job: t, phase) i z rąk (carry, job.n): rąbanie i rozbieranie
   mebla siekierą, niesienie naręcza drewna, klęczenie przy kozie (grzanie rąk, dokładanie drewna),
   gotowanie, siedzenie na krześle przy stole, sen w łóżku pod kocem (także na łóżkach piętrowych)
   albo na podłodze, warta z lampą (praca 'guard' przy bramie albo dziurze), czuwanie przy kozie
   (guard na posterunku KOZA_POST), warta na wieży (rysuje się przed jej sprite'em) i drzemka wartownika (guard
   w fazie 4). Prace M2: przeszukiwanie i przebieranie śmieci na kolanach, rozbiórka siekierą, naprawa, budowa
   i zajmowanie mieszkania młotkiem (podłoga, rura i grządki na kolanach), niesienie desek albo złomu na łatę,
   naprawę i budowę; przyjęty (praca 'arrive') idzie jak każdy mieszkaniec. Fala 2: przy cudzych drzwiach
   wyważanie zamachem, deski i pukanie młotkiem, zamek na kolanach, pomieszczenie sąsiada przeszukuje
   na kolanach. Gość wpuszczony na noc (praca 'gosc', what 'spi') śpi na ziemi przy ognisku jak śpiący na podłodze.
   Klatki liczone z czasu gry, bez stanu w symulacji. Dokładanie do kozy trwa w symulacji jeden tick, więc widok pamięta je
   chwilę (FeedWatch). Czyste funkcje bez PixiJS. */

import { type WeaponId, weaponOf } from '../sim/bron.ts';
import { BITE_CD } from '../sim/zombie.ts';
import { type ArmPose, thrusts } from './art/bron.ts';
import { FRAMES, type Lie, lieHead, type Pose, type ZPose } from './art/people.ts';
import type { ThingLike } from './section.ts';

/** Napierający szwendacze stoją na środkach kafelków, więc tłum przy jednym miejscu siatki nakładałby się w jeden
    sprite. Widok rozstawia ich stałym przesunięciem z numeru pionka: wzdłuż siatki o co najwyżej 0,9 kafelka na
    każdą stronę i w głąb ulicy (kierunek `away` od siatki, wektor osiowy) o 0 do 1 kafelka, nigdy w stronę siatki.
    Stan gry się nie zmienia. */
export function crowdJitter(id: number, away: readonly [number, number] = [0, 1]): [number, number] {
  const h = Math.imul(id + 1, 2654435761) >>> 0;
  const along = (((h >>> 8) % 1000) / 1000 - 0.5) * 1.8;
  const depth = ((h >>> 18) % 1000) / 1000;
  return [away[0] * depth - away[1] * along, away[1] * depth + away[0] * along];
}

/** to, czego poza potrzebuje z pionka (Pawn z symulacji pasuje bez zmian) */
export interface PawnLike {
  id: number;
  kind: string;
  x: number;
  y: number;
  /** 0 dół, 1 góra, 2 lewo, 3 prawo */
  dir: number;
  walk: number;
  pi: number;
  path: { length: number };
  carry: number;
  /** n i what: sztuki w rękach poza drewnem i co to za sztuki ('deski', 'zlom', 'czesci', 'leki', 'jedzenie');
      what w pracy 'wreck' to sposób ('szukaj', 'rozbierz'), w 'saw' produkt (n zawsze 0) */
  job: { t: string; phase: number; target: number; n?: number; what?: string } | null;
  /** wrogi człowiek (napadnięty handlarz, jego ludzie): po ciosie poza zamachu jak w walce */
  wrogi?: boolean;
  /** broń w rękach i tick, od którego znowu uderzy (z niego: kiedy był ostatni cios) */
  weapon?: WeaponId | null;
  cd?: number;
}

/** to, czego pozy prac M2 potrzebują ze stanu gry poza rzeczami */
export interface PoseCtx {
  /** uszkodzenia (st.damage): rodzaj po indeksie, praca repair ma indeks w target */
  damage?: readonly { kind: string }[];
  /** plany budowy (st.builds): rodzaj po id, praca build ma id planu w target */
  builds?: readonly { id: number; kind: string }[];
  /** łóżka piętrowe, na których śpią dwie osoby (id rzeczy) */
  bunkFull?: ReadonlySet<number>;
}

export type ThingWithId = ThingLike & { id?: number };

export interface PoseView {
  pose: Pose;
  dir: number;
  frame: number;
  /** leży: w łóżku albo na podłodze, o to strona głowy, (x, y) punkt głowy w pikselach świata */
  lie?: { kind: Lie; o: number; x: number; y: number };
  /** kolejność rysowania, gdy inna niż y pionka (po łóżku, przed albo po krześle) */
  z?: number;
  /** nakładka broni: trzymanie, cios, celowanie (klatka jak frame); brak: broni nie widać */
  arm?: ArmPose;
  /** szwendacz: klatka z atlasu szwendaczy (chód albo ugryzienie) */
  zpose?: ZPose;
}

const TILE = 32;
const BEDS = new Set(['lozko', 'wersalka', 'lozka_pietrowe']);
/** wierzch materaca łóżka i siedziska wersalki w pikselach ekranu (lozko, wersalka w rzeczy.ts) */
const MATTRESS = 9;
/** wierzch dolnego i górnego materaca łóżek piętrowych (lozka w budowle.ts) */
const BUNK_LOW = 10;
const BUNK_HIGH = 26;
/** posterunek warty przy kozie zarządu (KOZA_POST w sim.ts): czuwa przy ogniu, bez latarni */
export const KOZA_POST = -1;
/** posterunek warty na wieży (WIEZA_POST w sim.ts): wartownik stoi na kafelku wieży i rysuje się przed nią, bo sprite
    wieży (z kabiną na palach) zasłoniłby go, a z wieży ma być widoczny */
export const WIEZA_POST = -3;
/** cykl czuwania przy kozie (s gry): tyle klęczy przy ogniu, resztę stoi */
const VIGIL = 19;
const VIGIL_KNEEL = 14;
/** ułożenie śpiącego na podłodze według kierunku: głową w górę, w górę, w lewo, w prawo */
const FLOOR_O = [0, 0, 3, 1] as const;

/**
 * Punkt poduszki śpiącego (piksele świata) i strona głowy: łóżko głową do ściany rot, wersalka wzdłuż.
 * Łóżka piętrowe mają ten sam obrys co łóżko; mattress to wysokość materaca (dolny albo górny).
 */
export function bedHead(bed: ThingLike, mattress = MATTRESS): { x: number; y: number; o: number } {
  const rot = bed.rot & 3;
  const sofa = bed.kind === 'wersalka';
  // model łóżka 32 × 64 z poduszką w (16, 10), wersalki 64 × 32 z głową w (11, 18); obrót jak place() w bryly.ts
  const [W, D, mx, my] = sofa ? [64, 32, 11, 18] : [32, 64, 16, 10];
  const [X, Y] = rot === 1 ? [D - my, mx] : rot === 2 ? [W - mx, D - my] : rot === 3 ? [my, W - mx] : [mx, my];
  return { x: bed.x * TILE + X, y: bed.y * TILE + Y - mattress, o: sofa ? (rot + 3) % 4 : rot };
}

/** kafelek łóżka od strony głowy (przy ścianie rot) */
function headTile(bed: ThingLike): [number, number] {
  const rot = bed.rot & 3;
  return rot === 1 ? [bed.x + bed.w - 1, bed.y] : rot === 2 ? [bed.x, bed.y + bed.h - 1] : [bed.x, bed.y];
}

const covers = (t: ThingLike, x: number, y: number) =>
  Math.floor(x) >= t.x && Math.floor(x) < t.x + t.w && Math.floor(y) >= t.y && Math.floor(y) < t.y + t.h;

/**
 * Poza pionka w chwili t (sekundy gry). feeding: właśnie dokłada do kozy (FeedWatch). Praca na miejscu
 * daje pozę pracy (faza 1, a łatanie, naprawa i budowa w fazie 2), deski albo złom w rękach niesienie
 * materiału, drewno naręcze, reszta to zwykły chód. ctx: uszkodzenia, plany i pełne łóżka piętrowe.
 */
export function poseOf(
  p: PawnLike,
  t: number,
  things: readonly ThingWithId[],
  feeding = false,
  ctx: PoseCtx = {},
): PoseView {
  const moving = p.pi < p.path.length;
  const step = moving ? Math.floor(p.walk * 2.6) % FRAMES : 0;
  const dir = p.dir & 3;
  // pionki nie pracują w takt
  const tt = t + (p.id % 7) * 0.13;
  const j = p.job;
  const tick = t * 20;
  if (p.kind === 'zombie') {
    // tuż po ugryzieniu rzut; stojąc (przy siatce) kołysze się, w drodze chwiejny chód
    const since = BITE_CD - ((p.cd ?? 0) - tick);
    if (!moving && j?.phase === 3 && since >= 0 && since < 12)
      return { pose: 'walk', dir, frame: since < 5 ? 0 : 1, zpose: 'bite' };
    return { pose: 'walk', dir, frame: moving ? step : Math.floor(tt * 1.6) % FRAMES, zpose: 'lurch' };
  }
  // walka: cios albo strzał; warta pokazuje go chwilę po ciosie, potem wraca do pozy z lampą
  const w = weaponOf(p.weapon);
  const since = w.cd - ((p.cd ?? Number.NEGATIVE_INFINITY) - tick);
  const struck = since >= 0 && since < 12;
  if (!moving && ((j?.phase === 1 && (j.t === 'fight' || (j.t === 'guard' && struck))) || (p.wrogi && struck))) {
    if (w.ammo || thrusts(p.weapon)) return { pose: 'aim', dir, frame: since >= 0 && since < 4 ? 1 : 0, arm: 'aim' };
    const frame = since >= 0 && since < 4 ? 1 : since >= 0 && since < 10 ? 2 : 0;
    return { pose: 'swing', dir, frame, arm: 'swing' };
  }
  const swing = (): PoseView => ({ pose: 'chop', dir, frame: [0, 0, 1, 2][Math.floor(tt * 5) % 4] });
  const knees = (): PoseView => ({ pose: 'search', dir, frame: Math.floor(tt * 1.6) % 2 });
  const hammer = (): PoseView => ({ pose: 'hammer', dir, frame: Math.floor(tt * 3) % 2 });
  if (!moving && feeding) return { pose: 'crouch', dir, frame: 1 + (Math.floor(tt * 2.5) % 2) };
  // przyjęty idzie zza bramy do swojego mieszkania (praca 'arrive'): jak każdy idący mieszkaniec,
  // a czekając za bramą na swoją kolej, stoi
  if (j?.t === 'arrive') return { pose: 'walk', dir, frame: step, arm: 'hold' };
  // deski albo złom w rękach na łatę, naprawę albo budowę (bez nazwy materiału: deski z łat M1), także
  // w drodze po kolejną stertę; w fazie pracy materiał jest już przy łacie, uszkodzeniu albo planie
  if (
    j &&
    j.phase !== 2 &&
    (j.n ?? 0) > 0 &&
    (j.t === 'patch' || j.t === 'repair' || j.t === 'build' || j.t === 'brace' || j.t === 'carry')
  )
    return { pose: !j.what || j.what === 'deski' ? 'planks' : 'scrap', dir, frame: step };
  if (!moving && j && j.phase === 2)
    switch (j.t) {
      case 'patch':
      case 'brace':
        return hammer();
      case 'repair': {
        const k = ctx.damage?.[j.target]?.kind;
        return k === 'rura' || k === 'podloga' ? knees() : hammer();
      }
      case 'build': {
        // plan budowy (M2) albo ognisko z M1, które było pracą build: rozpalanie na kolanach
        const k = ctx.builds?.find((b) => b.id === j.target)?.kind;
        if (!k) return { pose: 'crouch', dir, frame: 0 };
        return k === 'ogrodek' ? knees() : hammer();
      }
      case 'campfire':
        return { pose: 'crouch', dir, frame: 0 };
    }
  // śpiący na ziemi bez łóżka (na podłodze) albo gość wpuszczony na noc, który kładzie się przy ognisku
  const floor = (): PoseView => {
    const o = FLOOR_O[dir];
    const [hx, hy] = lieHead(o);
    return {
      pose: 'walk',
      dir,
      frame: 0,
      lie: { kind: 'floor', o, x: p.x * TILE + hx - 24, y: p.y * TILE + hy - 26 },
      z: p.y,
    };
  };
  if (!moving && j?.t === 'gosc' && j.what === 'spi') return floor();
  if (!moving && j?.t === 'guard' && j.phase === 4) return { pose: 'doze', dir, frame: 0 };
  if (!moving && j && j.phase === 1)
    switch (j.t) {
      case 'chop':
      case 'burn':
        return swing();
      case 'search':
        return knees();
      case 'dismantle': {
        // śmieci przebiera na kolanach, mebel rozbiera siekierą
        const thing = things.find((x) => x.id === j.target);
        return thing?.kind === 'smieci' ? knees() : swing();
      }
      case 'claim':
        return hammer();
      // wrak: przeszukuje na kolanach (schowek, bagażnik), rozbiera z łomem albo młotkiem
      case 'wreck':
        return j.what === 'rozbierz' ? hammer() : knees();
      // warsztat: piłuje i obrabia przy stole
      case 'saw':
        return hammer();
      // M2 fala 2: cudze drzwi (wyważanie zamachem, deski i pukanie młotkiem, zamek na kolanach), przeszukanie
      // pomieszczenia sąsiada na kolanach
      case 'door':
        if (j.what === 'force') return swing();
        if (j.what === 'open') return { pose: 'crouch', dir, frame: 0 };
        return hammer();
      case 'loot':
        return knees();
      case 'warm':
        return { pose: 'crouch', dir, frame: 0 };
      case 'cook':
        return { pose: 'cook', dir, frame: Math.floor(tt * 2) % 2 };
      case 'guard': {
        if (j.target === WIEZA_POST) {
          const tower = things.find((c) => c.kind === 'wieza');
          return {
            pose: 'guard',
            dir,
            frame: Math.floor(tt) % 2,
            arm: 'hold',
            ...(tower ? { z: tower.y + tower.h + 0.01 } : {}),
          };
        }
        if (j.target !== KOZA_POST) return { pose: 'guard', dir, frame: Math.floor(tt) % 2, arm: 'hold' };
        // czuwanie przy kozie: na krześle siedzi, bez krzesła klęczy przy ogniu i co jakiś czas wstaje
        const chair = things.find((c) => c.kind === 'krzeslo' && covers(c, p.x, p.y));
        if (chair) return { pose: 'sit', dir, frame: 0, z: chair.y + chair.h + (dir === 1 ? -0.01 : 0.01) };
        return (tt + p.id * 3.7) % VIGIL < VIGIL_KNEEL
          ? { pose: 'crouch', dir, frame: 0 }
          : { pose: 'walk', dir, frame: 0 };
      }
      case 'eat': {
        // na krześle siedzi; plecami do patrzącego za oparciem (krzesło rysuje się po nim)
        const chair = things.find((c) => c.kind === 'krzeslo' && covers(c, p.x, p.y));
        if (chair) return { pose: 'sit', dir, frame: 0, z: chair.y + chair.h + (dir === 1 ? -0.01 : 0.01) };
        break;
      }
      case 'sleep': {
        const bed = things.find((b) => b.id === j.target && BEDS.has(b.kind));
        if (bed?.kind === 'lozka_pietrowe') {
          // sam śpi na górze (widać go); we dwoje ten od strony głowy na górze, drugi na dole pod górnym
          const [hx, hy] = headTile(bed);
          const low = !!ctx.bunkFull?.has(bed.id ?? -1) && (Math.floor(p.x) !== hx || Math.floor(p.y) !== hy);
          const h = bedHead(bed, low ? BUNK_LOW : BUNK_HIGH);
          return { pose: 'walk', dir, frame: 0, lie: { kind: 'bed', ...h }, z: bed.y + bed.h + (low ? -0.02 : 0.02) };
        }
        if (bed) {
          const h = bedHead(bed);
          return { pose: 'walk', dir, frame: 0, lie: { kind: 'bed', ...h }, z: bed.y + bed.h + 0.02 };
        }
        return floor();
      }
    }
  if (p.carry > 0) return { pose: 'carry', dir, frame: step };
  return { pose: 'walk', dir, frame: step, arm: 'hold' };
}

/** jak długo widać dokładanie do kozy po wrzuceniu drewna: 2 s gry (20 ticków na sekundę) */
export const FEED_TICKS = 40;

/**
 * Dokładanie do kozy: w symulacji drewno z rąk trafia do kozy w jednym ticku (koniec pracy refuel albo
 * powrót czuwającego na posterunek). Widok zauważa spadek drewna w rękach po drodze z drewnem do kozy
 * (refuel w fazie 1, guard w fazie 3) i pokazuje klęczenie z polanem przez FEED_TICKS, dopóki pionek
 * stoi w miejscu.
 */
export class FeedWatch {
  private last = new Map<number, { carry: number; refuel: boolean }>();
  private until = new Map<number, { tick: number; x: number; y: number }>();

  feeding(p: PawnLike, tick: number): boolean {
    const prev = this.last.get(p.id);
    // drewno do kozy niesie praca refuel (faza 1) albo czuwający przy kozie (guard, faza 3)
    const refuel =
      !!p.job && ((p.job.t === 'refuel' && p.job.phase === 1) || (p.job.t === 'guard' && p.job.phase === 3));
    if (prev?.refuel && p.carry < prev.carry) this.until.set(p.id, { tick: tick + FEED_TICKS, x: p.x, y: p.y });
    this.last.set(p.id, { carry: p.carry, refuel });
    const f = this.until.get(p.id);
    if (!f) return false;
    if (tick >= f.tick || Math.hypot(p.x - f.x, p.y - f.y) > 0.3) {
      this.until.delete(p.id);
      return false;
    }
    return true;
  }

  forget(id: number): void {
    this.last.delete(id);
    this.until.delete(id);
  }
}
