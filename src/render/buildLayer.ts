/* Budowa w widoku (M2, fala 1): plany z st.builds jako półprzezroczyste duchy budowli z paskiem
   postępu (materiały na bursztynowo, praca na zielono) i podgląd stawiania z trybu budowy: duch
   pod kursorem na zielono albo czerwono, jego kafelki i podświetlone kafelki dozwolone albo
   niedozwolone. Duchy planów stoją w warstwie pionków (sortowane po y), paski i podgląd stawiania
   nad mapą światła, żeby było je widać także nocą. */

import { type Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { BUILDS, type BuildKind } from '../sim/budowle.ts';
import type { Sprite as ArtSprite, ThingSpec } from './art/rzeczy.ts';
import { BUILD_BASE } from './art/rzeczy.ts';

const TILE = 32;

/** plan budowy z symulacji (st.builds); need i have to materiały, work praca wykonana w tickach */
export interface BuildPlan {
  id: number;
  kind: string;
  x: number;
  y: number;
  rot: number;
  need?: Partial<Record<string, number>>;
  have?: Partial<Record<string, number>>;
  work?: number;
}

/** podgląd stawiania (view.setPlacement) */
export interface Placement {
  kind: BuildKind;
  /** lewy górny kafelek podstawy i ustawienie */
  x: number;
  y: number;
  rot: number;
  /** czy da się tu postawić (canPlace) */
  ok: boolean;
  /** kafelki do podświetlenia: dozwolone na zielono, niedozwolone na czerwono */
  tiles?: { ok?: readonly number[]; bad?: readonly number[] };
}

type ArtOf = (spec: ThingSpec) => { tex: Texture; sp: ArtSprite };

/** podstawa budowli w kafelkach po obrocie */
export function buildFootprint(kind: BuildKind, rot: number): { w: number; h: number } {
  const [a, b] = BUILD_BASE[kind];
  return rot & 1 ? { w: b, h: a } : { w: a, h: b };
}

/** postęp planu: materiały (przyniesione / potrzebne) i praca (wykonana / cała), oba 0..1 */
export function planProgress(p: BuildPlan): { mats: number; work: number } {
  const need = Object.values(p.need ?? {}).reduce((a: number, v) => a + (v ?? 0), 0);
  const have = Object.values(p.have ?? {}).reduce((a: number, v) => a + (v ?? 0), 0);
  const def = BUILDS[p.kind as BuildKind];
  return {
    mats: need > 0 ? Math.min(1, have / need) : 1,
    work: def && def.work > 0 ? Math.min(1, (p.work ?? 0) / def.work) : 0,
  };
}

export class BuildLayer {
  /** paski postępu planów i podgląd stawiania (nad mapą światła) */
  readonly overlay: Container;
  private readonly bars = new Graphics();
  private readonly tiles = new Graphics();
  private readonly ghost = new Sprite();
  private readonly actors: Container;
  private plans = new Map<number, { sprite: Sprite; key: string }>();
  private placement: Placement | null = null;

  constructor(actors: Container, overlay: Container) {
    this.actors = actors;
    this.overlay = overlay;
    this.ghost.visible = false;
    this.overlay.addChild(this.tiles, this.ghost, this.bars);
  }

  /** ile duchów planów jest na mapie (do zrzutów) */
  get count(): number {
    return this.plans.size;
  }

  setPlacement(p: Placement | null): void {
    this.placement = p;
  }

  /**
   * Duchy planów i podgląd stawiania na tę klatkę. artOf: tekstura rzeczy z opisu sprite'a (ta sama
   * pamięć co rzeczy), hidden: czy kafelek jest pod dachem bez przekroju (plan w środku niewidoczny).
   */
  update(plans: readonly BuildPlan[], artOf: ArtOf, hidden: (x: number, y: number) => boolean): void {
    const seen = new Set<number>();
    this.bars.clear();
    for (const p of plans) {
      if (!(p.kind in BUILDS)) continue;
      const kind = p.kind as BuildKind;
      const rot = (p.rot & 3) as 0 | 1 | 2 | 3;
      const fp = buildFootprint(kind, rot);
      const spec = { kind, rot, seed: 0 } as ThingSpec;
      const key = `${kind}:${rot}:${p.x}:${p.y}`;
      let e = this.plans.get(p.id);
      if (!e || e.key !== key) {
        e?.sprite.destroy();
        const art = artOf(spec);
        const sprite = new Sprite(art.tex);
        sprite.anchor.set(art.sp.ax / art.sp.w, art.sp.ay / art.sp.h);
        sprite.position.set((p.x + fp.w / 2) * TILE, (p.y + fp.h) * TILE);
        sprite.zIndex = p.y + fp.h;
        sprite.alpha = 0.45;
        sprite.tint = 0xa8ccff;
        this.actors.addChild(sprite);
        e = { sprite, key };
        this.plans.set(p.id, e);
      }
      seen.add(p.id);
      const under = hidden(p.x + fp.w / 2, p.y + fp.h - 0.5);
      e.sprite.visible = !under;
      if (under) continue;
      // pasek nad podstawą: tło, materiały, praca
      const { mats, work } = planProgress(p);
      const bw = fp.w * TILE - 8;
      const bx = p.x * TILE + 4;
      const by = p.y * TILE - 6;
      this.bars.rect(bx - 1, by - 1, bw + 2, 6).fill({ color: 0x15171a, alpha: 0.85 });
      if (mats > 0) this.bars.rect(bx, by, Math.max(1, Math.round(bw * mats)), 2).fill(0xd8a040);
      if (work > 0) this.bars.rect(bx, by + 2, Math.max(1, Math.round(bw * work)), 2).fill(0x6fbf5a);
    }
    for (const [id, e] of this.plans)
      if (!seen.has(id)) {
        e.sprite.destroy();
        this.plans.delete(id);
      }
    this.drawPlacement(artOf);
  }

  private drawPlacement(artOf: ArtOf): void {
    const g = this.tiles;
    g.clear();
    const p = this.placement;
    if (!p || !(p.kind in BUILDS)) {
      this.ghost.visible = false;
      return;
    }
    const fp = buildFootprint(p.kind, p.rot);
    const cell = (i: number, w: number, color: number, alpha: number) => {
      const x = i % w;
      const y = (i - x) / w;
      g.rect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2).fill({ color, alpha });
    };
    const w = this.mapSize;
    for (const i of p.tiles?.ok ?? []) cell(i, w, 0x5ac85a, 0.18);
    for (const i of p.tiles?.bad ?? []) cell(i, w, 0xd8584a, 0.18);
    const color = p.ok ? 0x5ac85a : 0xd8584a;
    g.rect(p.x * TILE, p.y * TILE, fp.w * TILE, fp.h * TILE)
      .fill({ color, alpha: 0.28 })
      .stroke({ width: 2, color, alpha: 0.9 });
    const art = artOf({ kind: p.kind, rot: (p.rot & 3) as 0 | 1 | 2 | 3, seed: 0 } as ThingSpec);
    this.ghost.texture = art.tex;
    this.ghost.anchor.set(art.sp.ax / art.sp.w, art.sp.ay / art.sp.h);
    this.ghost.position.set((p.x + fp.w / 2) * TILE, (p.y + fp.h) * TILE);
    this.ghost.alpha = 0.6;
    this.ghost.tint = p.ok ? 0xc8ffc8 : 0xffb0a8;
    this.ghost.visible = true;
  }

  /** szerokość mapy w kafelkach (do zamiany indeksów kafelków na pozycje) */
  mapSize = 1;
}
