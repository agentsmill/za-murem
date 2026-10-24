/* Wiki w grze: zebranie artykułów wszystkich kategorii w jedną listę definicji (`definicjeTresc`). Każda kategoria ma swój
   moduł z ręcznie pisanymi tekstami i faktami liczonymi z tabel gry (src/ui/wiki-start.ts i kolejne wiki-*.ts); tutaj tylko
   kolejność, w jakiej rejestr (src/ui/wiki.ts) je widzi. Nic nie buduje się przy ładowaniu: definicje niosą funkcje. */

import { definicjeBudowle } from './wiki-budowle.ts';
import { definicjeDrogi } from './wiki-drogi.ts';
import { definicjeMiasto } from './wiki-miasto.ts';
import { definicjeSasiedzi } from './wiki-sasiedzi.ts';
import { definicjeStart } from './wiki-start.ts';
import type { Def } from './wiki-typy.ts';
import { definicjeZasoby } from './wiki-zasoby.ts';
import { definicjeZombie } from './wiki-zombie.ts';

export function definicjeTresc(): Def[] {
  return [
    ...definicjeStart(),
    ...definicjeZasoby(),
    ...definicjeBudowle(),
    ...definicjeMiasto(),
    ...definicjeSasiedzi(),
    ...definicjeDrogi(),
    ...definicjeZombie(),
  ];
}
