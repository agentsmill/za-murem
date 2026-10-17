/* Górny pasek: temperatura na dworze i w kuchni, ogień w kozie (godziny), drewno na zapas, deski, złom
   i części, jedzenie, zaufanie i wkurzenie. Wartości
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
  // drewno na zapas, bez tego, co już się pali (ogień ma swoje pole)
  const spare = k.woodSklad + k.woodLoose + k.woodCarried;
  const ppl = Math.max(1, s.people.length);
  const kit = s.kitchen;
  // dyżur przy kozie (posterunek 'koza' z karty nocy albo z menu kozy)
  const watch = s.people.filter((p) => p.post === 'koza').map((p) => p.name);
  const trust = gov ? Math.round(gov.trust) : null;
  const anger = gov ? Math.round(gov.anger) : null;
  const fence = Math.round(s.fence.durability * 100);
  const holes = s.fence.holes.length;
  const z = s.zombies;
  // w trybie zombie siatka i stado zamiast temperatury na dworze (ta jest w dymku kuchni)
  const first: Stat[] =
    s.mode === 'zombie'
      ? [
          {
            id: 'sFence',
            value: `${fence}%`,
            level: holes || fence < 50 ? 'bad' : fence < 80 ? 'mid' : 'ok',
            title: `Siatka trzyma w ${fence}%${holes ? `, otwarte dziury: ${holes}` : ''}. Uszkodzoną wzmacnia się deskami albo złomem.`,
          },
          {
            id: 'sHorde',
            value: String(z.near),
            level: z.pressing ? 'bad' : z.near ? 'mid' : 'ok',
            title: `Szwendacze przy siatce: ${z.near}, napiera ${z.pressing}, na całej mapie ${z.all}. Na dworze ${deg(s.outdoor)}.`,
          },
        ]
      : [
          {
            id: 'sOut',
            value: deg(s.outdoor),
            level: s.outdoor < 0 ? 'bad' : s.outdoor < 8 ? 'mid' : 'ok',
            title: `Na dworze ${deg(s.outdoor)}, ${s.seasonName}`,
          },
        ];
  return [
    ...first,
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
      id: 'sFire',
      value: s.kozaLit ? `${num(k.fireHours)} h` : 'zimna',
      level: !s.kozaLit ? (kit !== null && kit < WARM_ENOUGH ? 'bad' : 'mid') : k.fireHours < 0.5 ? 'mid' : 'ok',
      title: `${
        s.kozaLit
          ? `Ognia w kozie na ${num(k.fireHours)} h. Zarząd sam dokłada, póki jest drewno.`
          : 'Koza zimna. Bez ognia kuchnia stygnie: zetnijcie drzewo albo spalcie mebel.'
      }${watch.length ? ` Przy kozie czuwa ${watch.join(', ')}: dokłada do rana.` : ''}`,
    },
    {
      id: 'sWood',
      value: String(spare),
      level: spare === 0 ? 'bad' : spare < 6 ? 'mid' : 'ok',
      title: `Drewno na zapas: w składzie ${k.woodSklad}, luzem ${k.woodLoose}, w rękach ${k.woodCarried}`,
    },
    // materiały z odzysku: deski, złom i części; na telefonie jedno pole zbiorcze (CSS chowa jedno albo drugie)
    {
      id: 'sBoards',
      value: String(k.boards),
      level: k.boards ? 'ok' : 'mid',
      title: `Deski: ${k.boards}. Na łaty, naprawy i budowę. Dają je przeszukiwanie pustych mieszkań i rozbiórka mebli.`,
    },
    {
      id: 'sScrap',
      value: String(k.scrap),
      level: k.scrap ? 'ok' : 'mid',
      title: `Złom: ${k.scrap}. Na łaty, zasieki i naprawy rur i pieców. Dają go przeszukiwanie i rozbiórka śmieci.`,
    },
    {
      id: 'sParts',
      value: String(k.parts),
      level: k.parts ? 'ok' : 'mid',
      title: `Części: ${k.parts}. Do rur, pieców i kuchni społecznej. Dają je przeszukiwanie i rozbiórka sprzętów.`,
    },
    {
      id: 'sMats',
      value: `${k.boards}·${k.scrap}·${k.parts}`,
      level: k.boards || k.scrap || k.parts ? 'ok' : 'mid',
      title: `Deski ${k.boards}, złom ${k.scrap}, części ${k.parts}. Dają je przeszukiwanie i rozbiórka.`,
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
    el.hidden = false;
    el.className = `stat ${s.level}`;
    el.title = s.title;
    const b = el.querySelector('b');
    if (b) b.textContent = s.value;
  }
}
