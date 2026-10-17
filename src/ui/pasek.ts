/* Górny pasek: temperatura na dworze i w kuchni, drewno, jedzenie, zaufanie i wkurzenie. Wartości
   i progi liczy czysta funkcja (do testów), DOM zmienia się tylko po zmianie tekstu. */

import type { GovState } from '../gov/typy.ts';
import type { SimSnapshot } from '../sim/snapshot.ts';
import { WARM_ENOUGH } from '../sim/tutorial.ts';
import { deg, num } from './tekst.ts';

export interface Stat {
  id: string;
  value: string;
  /** ok, mid (uwaga), bad (źle) */
  level: 'ok' | 'mid' | 'bad';
  title: string;
}

export function statsOf(s: SimSnapshot, gov: GovState | null): Stat[] {
  const k = s.stock;
  const food = k.supplies + k.meals;
  const ppl = Math.max(1, s.people.length);
  const kit = s.kitchen;
  const trust = gov ? Math.round(gov.trust) : null;
  const anger = gov ? Math.round(gov.anger) : null;
  return [
    {
      id: 'sOut',
      value: deg(s.outdoor),
      level: s.outdoor < 0 ? 'bad' : s.outdoor < 8 ? 'mid' : 'ok',
      title: `Na dworze ${deg(s.outdoor)}, ${s.seasonName}`,
    },
    {
      id: 'sKit',
      value: kit === null ? '–' : deg(kit),
      level: kit === null ? 'mid' : kit < 12 ? 'bad' : kit < WARM_ENOUGH ? 'mid' : 'ok',
      title:
        kit === null
          ? 'Siedziba nie ma kuchni z kozą'
          : `W kuchni zarządu ${deg(kit)}${s.kozaLit ? `, koza pali się jeszcze ${num(k.fireHours)} h` : ', koza zimna'}`,
    },
    {
      id: 'sWood',
      value: String(k.wood),
      level: k.wood < 2 ? 'bad' : k.wood < 6 ? 'mid' : 'ok',
      title: `Drewno: w składzie ${k.woodSklad}, luzem ${k.woodLoose}, w rękach ${k.woodCarried}, w kozie na ${num(k.fireHours)} h`,
    },
    {
      id: 'sFood',
      value: String(food),
      level: food < ppl ? 'bad' : food < ppl * 3 ? 'mid' : 'ok',
      title: `Jedzenie: zapasy ${k.supplies}, ugotowane porcje ${k.meals}, gazu na ${k.gasCooks} gotowań`,
    },
    {
      id: 'sTrust',
      value: trust === null ? '–' : String(trust),
      level: trust === null ? 'mid' : trust < 30 ? 'bad' : trust < 45 ? 'mid' : 'ok',
      title: 'Zaufanie mieszkańców do zarządu (0–100). Przy zerze ludzie odejdą.',
    },
    {
      id: 'sAnger',
      value: anger === null ? '–' : String(anger),
      level: anger === null ? 'mid' : anger > 60 ? 'bad' : anger > 40 ? 'mid' : 'ok',
      title: 'Wkurzenie mieszkańców (0–100). Przy stu walne odwoła zarząd.',
    },
  ];
}

const shown = new Map<string, string>();

/** wpisuje wartości do pasku (span.stat > b) tylko po zmianie */
export function renderStats(list: Stat[]): void {
  for (const s of list) {
    const key = `${s.value}|${s.level}|${s.title}`;
    if (shown.get(s.id) === key) continue;
    shown.set(s.id, key);
    const el = document.getElementById(s.id);
    if (!el) continue;
    el.className = `stat ${s.level}`;
    el.title = s.title;
    const b = el.querySelector('b');
    if (b) b.textContent = s.value;
  }
}
