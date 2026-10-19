/* Atrapa budynków (tests/unit/atrapa-budynki.ts) jako demo „atrapa-budynki” bez pliku w public/demo: strona prosi o
   demo/atrapa-budynki.json, a Playwright odpowiada geometrią zbudowaną w tym procesie. Używają jej zrzuty (tools/shots.ts)
   i pomiar wydajności (tools/perf.ts). */

import type { Page } from '@playwright/test';
import { atrapaBudynki } from '../tests/unit/atrapa-budynki.ts';

export const DEMO_ATRAPA = 'atrapa-budynki';

/** podstawia demo atrapy pod adres demo/atrapa-budynki.json (przed page.goto) */
export async function podstawAtrape(page: Page): Promise<void> {
  const { geo } = atrapaBudynki();
  const body = JSON.stringify({
    key: DEMO_ATRAPA,
    name: 'Atrapa budynków',
    street: 'Ulica Testowa',
    addr: 'Ulica Testowa 1, Atrapa',
    label: 'Atrapa',
    lat: 0,
    lon: 0,
    geo,
  });
  await page.route(`**/demo/${DEMO_ATRAPA}.json`, (r) => r.fulfill({ contentType: 'application/json', body }));
}
