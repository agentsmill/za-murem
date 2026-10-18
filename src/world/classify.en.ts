/* Nazwa budynku po angielsku do rysowania. Świat nazywa budynki po polsku (nameOf w classify.ts: nazwa z OSM, ulica
   z numerem, a bez nich typ budynku z numerem, „Blok nr 12” albo „Blok 3”) i nie zależy od języka, bo nazwa siedziby
   wchodzi do zdań zarządu. Nazwy z OSM i adresy to nazwy własne i zostają; nazwa złożona z typu budynku dostaje
   angielski typ z CLS_EN: „Blok nr 12” → „Block 12”, „Garaże 2” → „Garages 2”. */

import { CLS_EN } from '../content/data.en.ts';
import { type BuildingClass, CLS } from '../content/data.ts';

/** nazwa budynku ze świata po angielsku; nazwa własna albo adres zostaje bez zmian */
export function nazwaBudynkuEn(name: string): string {
  for (const k of Object.keys(CLS) as BuildingClass[]) {
    const pl = CLS[k];
    if (!name.startsWith(`${pl} `)) continue;
    // reszta to sam numer („12”, „3a”), z „nr” albo bez
    const num = /^(?:nr )?(\S+)$/.exec(name.slice(pl.length + 1))?.[1];
    if (num && /\d/.test(num)) return `${CLS_EN[k]} ${num}`;
  }
  return name;
}
