/* Droga do kozy z beczki w pokoju zarządu na Zielonkach w grze jak w przeglądarce, etap 1 osady AI
   (docs/superpowers/plans/2026-10-21-osada-ai-etap-1.md, zadanie 3; plik wydzielony z tests/unit/ai-zima.test.ts w etapie 2,
   zadanie 1, bo to dwie najdłuższe gry tamtego pliku, a vitest puszcza pliki równolegle). Zielonki to dom jednorodzinny bez klatki:
   zarząd śpi w dwóch pokojach, a świat z adresu (mieszkańcy z generatora, obcy, okolica, łańcuchy kart) ma na podwórku gruz, z którego
   rozbiórki wychodzą brakujące deski na pracownię (14 desek). Gra to `przygotujGre` z uprzęży (`npm run bot:osada`), czyli ta
   sama co w przeglądarce; każdy z testów ma własną, bo różnią się ziarnem. */

import { describe, expect, it } from 'vitest';
import { grajDo } from '../../src/ai/gra.ts';
import { pokojZarzadu } from '../../src/ai/miejsca.ts';
import { silnik } from '../../src/ai/silnik.ts';
import { TICKS_PER_DAY } from '../../src/sim/clock.ts';
import { houseOf } from '../../src/sim/house.ts';
import { przygotujGre } from '../../tools/bot-osada.ts';
import { kozaWPokoju } from './ai-pomoc.ts';

describe('droga do kozy z beczki w pokoju zarządu: Zielonki, gra jak w przeglądarce', () => {
  it('Zielonki (dom jednorodzinny, bez klatki), ziarno 12, gra jak w przeglądarce: tak samo do 9. dnia', async () => {
    // w grze świat Zielonek ma na podwórku gruz, z którego rozbiórki wychodzą brakujące deski na pracownię (14 desek)
    const g = await przygotujGre('zielonki', 12, false);
    grajDo(g, silnik, 1 * TICKS_PER_DAY);
    expect(kozaWPokoju(g)).toBe(false);
    grajDo(g, silnik, 9 * TICKS_PER_DAY);
    expect(g.sim.st.techDone).toContain('t_kozy');
    expect(kozaWPokoju(g)).toBe(true);
    // dom jednorodzinny: pokój zarządu to zwykły pokój jego mieszkania, bez klatki i bloku
    const h = houseOf(g.w)!;
    expect(h.rooms[pokojZarzadu(g.sim.st, g.w)]).toMatchObject({ kind: 'pokoj', apt: h.home });
    expect(g.gov.over).toBeNull();
    // `krokGry` łapie błędy decydenta: bez tego sprawdzenia rzut z silnika przeszedłby bez śladu
    expect(g.bledy).toEqual([]);
  }, 120_000);

  it('Zielonki, ziarno 14, gra jak w przeglądarce: koza z beczki ma skąd być zbudowana i stoi do 9. dnia', async () => {
    // tu pierwsze miejsce na kozę zasłaniały pracownia i łóżka ze wszystkich stron: plan stał do końca gry
    const g = await przygotujGre('zielonki', 14, false);
    grajDo(g, silnik, 9 * TICKS_PER_DAY);
    expect(g.sim.st.techDone).toContain('t_kozy');
    expect(kozaWPokoju(g)).toBe(true);
    expect(g.sim.st.builds.filter((b) => b.kind === 'koza_beczka')).toHaveLength(0);
    expect(g.bledy).toEqual([]);
  }, 120_000);
});
