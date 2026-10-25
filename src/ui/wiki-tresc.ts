/* Wiki w grze: zebranie artykułów wszystkich kategorii w jedną listę definicji (`definicjeTresc`). Każda kategoria ma swój
   moduł z ręcznie pisanymi tekstami i faktami liczonymi z tabel gry (src/ui/wiki-start.ts i kolejne wiki-*.ts); tutaj tylko
   kolejność, w jakiej rejestr (src/ui/wiki.ts) je widzi. Nic nie buduje się przy ładowaniu: definicje niosą funkcje. */

import { definicjeBadania } from './wiki-badania.ts';
import { definicjeBron } from './wiki-bron.ts';
import { definicjeBudowle } from './wiki-budowle.ts';
import { definicjeDrogi } from './wiki-drogi.ts';
import { definicjeLudzie } from './wiki-ludzie.ts';
import { definicjeMiasto } from './wiki-miasto.ts';
import { definicjeNoc } from './wiki-noc.ts';
import { definicjePraca } from './wiki-praca.ts';
import { definicjeSasiedzi } from './wiki-sasiedzi.ts';
import { definicjeStart } from './wiki-start.ts';
import type { Def } from './wiki-typy.ts';
import { definicjeWydarzenia } from './wiki-wydarzenia.ts';
import { definicjeZarzad } from './wiki-zarzad.ts';
import { definicjeZasoby } from './wiki-zasoby.ts';
import { definicjeZombie } from './wiki-zombie.ts';

export function definicjeTresc(): Def[] {
  return [
    ...definicjeStart(),
    ...definicjeZasoby(),
    ...definicjeBudowle(),
    ...definicjeBadania(),
    ...definicjeLudzie(),
    ...definicjeBron(),
    ...definicjePraca(),
    ...definicjeNoc(),
    ...definicjeZarzad(),
    ...definicjeWydarzenia(),
    ...definicjeMiasto(),
    ...definicjeSasiedzi(),
    ...definicjeDrogi(),
    ...definicjeZombie(),
  ];
}
