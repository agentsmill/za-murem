/* Preload do prób wrażliwości botów i gry na różnice między silnikami: stosuje łatkę Math z zmiennej ZM_LATKA
   (wartości: latka.ts) przed załadowaniem reszty programu, więc podmiana obejmuje cały proces:
     ZM_LATKA=ulp:hypot node --import ./tools/determinizm/latka-boty.ts tools/bot.ts
     ZM_LATKA=mat node --import ./tools/determinizm/latka-boty.ts tools/bot-zombie.ts
   Skróty wszystkich wariantów są w docs/ocena/determinizm-silnikow.md. Bez ZM_LATKA nic się nie zmienia. */

import { zastosujLatke } from './latka.ts';

zastosujLatke(process.env.ZM_LATKA ?? '');
