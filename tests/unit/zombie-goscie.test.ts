/* Goście w trybie zombie (Task 16, część 3): grupa w drodze pod bramę i pod bramą ucieka dopiero przed szwendaczem, który podszedł
   na zasięg ugryzienia (`SPOOK_GOSC`, src/sim/gosc.ts), a nie na 6 m jak wędrowcy (`SPOOK_R`); bez tego kartę pod bramą widziało
   13–15% wylosowanych wizyt. Test jednostkowy promienia leży w gosc-sim.test.ts, tu spis na prawdziwej symulacji (Przymorze
   z mieszkańcami z generatora i obcymi, tryb zombie, 5 dób, polityka zawsze-warta): co najmniej 40% wylosowanych wizyt kończy
   się kartą pod bramą i kart gościa jest co najmniej jedna na grę. Większy spis (do 120 gier, z łańcuchami i bez) to tools/spis-kart.ts. */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SPOOK_GOSC } from '../../src/sim/gosc.ts';
import { SPOOK_R } from '../../src/sim/wedrowcy.ts';
import { BITE_REACH } from '../../src/sim/zombie.ts';
import { swiatMieszkancow } from '../../tools/bot-mieszkancy.ts';
import { playWithGov } from './gov-play.ts';

describe('promień płoszenia gości w trybie zombie', () => {
  it('to zasięg ugryzienia, a wędrowcy i ekipy płoszą się dalej jak dotąd', () => {
    expect(SPOOK_GOSC).toBe(BITE_REACH);
    expect(SPOOK_GOSC).toBeLessThan(SPOOK_R);
    expect(SPOOK_R).toBe(6);
  });
});

describe('spis gości w trybie zombie (prawdziwa symulacja)', () => {
  it('co najmniej 40% wylosowanych wizyt kończy się kartą pod bramą, a kart gościa jest co najmniej jedna na grę', async () => {
    const demo = JSON.parse(
      fs.readFileSync(path.resolve(import.meta.dirname, '../../public/demo/przymorze.json'), 'utf8'),
    );
    const ziarna = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
    let wizyty = 0;
    let karty = 0;
    for (const seed of ziarna) {
      const { world, mieszkancy } = await swiatMieszkancow(demo, seed, 4);
      const ids = new Set<string>();
      const zKarta = new Set<string>();
      playWithGov(world, seed, 'zawsze-warta', 5, 4, {
        mieszkancy,
        obcy: true,
        mode: 'zombie',
        obserwuj: (gov, i) => {
          for (const g of i.goscie ?? []) ids.add(g.id);
          const a = gov.goscie?.aktywny;
          if (a?.karta) zKarta.add(a.gosc.id);
        },
      });
      wizyty += ids.size;
      karty += zKarta.size;
    }
    // przed zmianą promienia (6 m): 13% wizyt z kartą i 1,2 karty gościa na grę (20 gier po 5 dób); po: 46% i 4,2 w tych 12 grach
    expect(wizyty).toBeGreaterThanOrEqual(60);
    expect(karty / wizyty).toBeGreaterThanOrEqual(0.4);
    expect(karty / ziarna.length).toBeGreaterThanOrEqual(1);
  }, 120_000);
});
