/* Ponowne losowanie po wypadnięciu `gosc` w `eventTick` (src/gov/wydarzenia.ts): po planie wizyty zarząd losuje jeszcze raz wśród
   reszty. Jeśli to losowanie trafi w kartę z gościem (krok łańcucha albo karta z 0.3), ma przejść tą samą drogą co pierwsze:
   `planujKarte` planuje wizytę, a karta otwiera się dopiero pod bramą, zamiast pokazać się od razu bez nikogo na mapie.
   Normalnie po planie wizyty `goscAktywny` zeruje wagę każdej karty z gościem, więc test podmienia `planujGoscia` na atrapę, która
   nie zakłada wizyty (jak plan, który przepadł od razu): wtedy ponowne losowanie może wybrać krok `woda_1`. */

import { describe, expect, it, vi } from 'vitest';
import * as wizyta from '../../src/gov/wizyta.ts';
import { dalej, nowySwiat } from './watki-tresc-play.ts';

vi.mock('../../src/gov/wizyta.ts', async (oryginal) => ({
  ...(await oryginal<typeof import('../../src/gov/wizyta.ts')>()),
  planujGoscia: vi.fn(() => ({}) as never),
}));

describe('ponowne losowanie po gosciu: karta z gościem idzie przez plan wizyty', () => {
  it('krok łańcucha z gościem wylosowany po `gosc` planuje wizytę, a karta czeka pod bramą', () => {
    let sprawdzone = 0;
    for (let seed = 1; seed <= 40 && sprawdzone < 3; seed++) {
      vi.mocked(wizyta.planujGoscia).mockClear();
      const s = nowySwiat('woda', { seed });
      // gość z klocków wraca do puli (nowySwiat zamraża zwykłe karty), żeby mógł wypaść jako pierwszy
      s.gov.ev.last.gosc = -1e9;
      expect(dalej(s), `ziarno ${seed}: coś się otworzyło`).toBe(true);
      // interesują nas tylko gry, w których pierwsze losowanie trafiło w `gosc`
      if (vi.mocked(wizyta.planujGoscia).mock.calls.length === 0) continue;
      sprawdzone++;
      const ev = s.gov.ev.active!;
      expect(ev.id, `ziarno ${seed}`).toBe('woda_1');
      // karta z `gid` to karta oddana przez `goscTick` pod bramą, a wizyta jest zaplanowana przez `planujKarte`
      expect((ev.d as { gid?: string }).gid, `ziarno ${seed}: karta ma wizytę`).toBeTruthy();
      expect(s.wizyty, `ziarno ${seed}: wizyta jest w symulacji`).toHaveLength(1);
      expect(s.gov.goscie?.aktywny?.kartaId).toBe('woda_1');
      expect(s.wizyty[0].faza).toBe('brama');
    }
    expect(sprawdzone, 'gry, w których pierwsze losowanie to gość z klocków').toBeGreaterThan(0);
  });
});
