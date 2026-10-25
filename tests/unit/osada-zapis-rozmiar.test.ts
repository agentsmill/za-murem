/* Rozmiar zapisu z osadą (src/ui/zapis.ts, src/ui/osada.ts), etap 2 osady AI (docs/superpowers/plans/2026-10-24-osada-ai-etap-2.md,
   zadanie 3, Review Focus 4: dwie gry w jednym zapisie a limit pamięci przeglądarki). Nasza symulacja i osada idą krok w krok przez
   30 dni, potem zapis składa się tak, jak idzie do localStorage (`JSON.stringify`), i sprawdza się dwie granice: cały zapis najwyżej
   4 000 000 znaków (rozmiar ustalony w planie etapu, zmierzono 548 303) i sama osada najwyżej 500 000 (zmierzono 326 366), bo
   dwukrotny wzrost jej stanu przeszedłby przez luźny limit całości niezauważony. Na końcu zapis idzie przez pamięć przeglądarki
   tam i z powrotem: osada wczytuje się z niego z tym samym skrótem gry.

   Test mieszkał w osada-gra.test.ts jako „zapis po 45 dniach” i sam trwał tam 27 s (36 s pod obciążeniem), więc wydłużał ten plik
   ponad 60 s; wydzielony do własnego pliku liczy się równolegle z resztą (przegląd końcowy etapu 2, rada o koszcie testów). 30 dób
   zamiast 45: stan osady rośnie wolno (po 45 dniach było 580 169 znaków, w tym 353 786 osady, z dwoma odwołaniami jej zarządu), a
   limit całości zostaje ponad siedmiokrotnie wyższy od zmierzonego, limit osady ponad półtora raza. Nasza gra to goła symulacja z
   zarządem tylko w zapisie (jak osada: sim + zarząd): rozmiar zależy od osady, a przebieg naszej gry z pełnym zarządem kosztowałby tu
   minutę więcej bez wpływu na wynik. */

import { beforeAll, describe, expect, it } from 'vitest';
import { skrotGry } from '../../src/ai/gra.ts';
import { hashString } from '../../src/core/rng.ts';
import { newGov } from '../../src/gov/zarzad.ts';
import { TICKS_PER_DAY } from '../../src/sim/clock.ts';
import { mapaMieszkancow, mieszkancyNowejGry, opcjaMieszkancow } from '../../src/sim/osiedle.ts';
import { createSim, Sim } from '../../src/sim/sim.ts';
import { nowaOsadaGry, osadaZZapisu } from '../../src/ui/osada.ts';
import { poleOsady, readSave, SAVE_KEY, type Save, worldKey, writeSave } from '../../src/ui/zapis.ts';
import { type Uklad, ukladZGeo } from '../../src/world/kwadraty.ts';
import { buildWorld } from '../../src/world/world.ts';
import { daneDema, wczytajDemo } from '../../tools/osada-kwadraty.ts';

type Demo = ReturnType<typeof wczytajDemo>;
type Dane = Awaited<ReturnType<typeof daneDema>>;

let demo: Demo;
let dane: Dane;
let uklad: Uklad;
/** ziarno naszej gry jak w przeglądarce dla dema: z adresu */
let SEED = 0;

beforeAll(async () => {
  demo = wczytajDemo('przymorze');
  dane = await daneDema('przymorze');
  uklad = ukladZGeo(demo.geo);
  SEED = Number.parseInt(hashString(demo.addr), 16) || 2051;
}, 120_000);

/** długość gry w dobach */
const DNI = 30;

describe('rozmiar zapisu', () => {
  it('zapis po 30 dniach z osadą: JSON.stringify(save).length najwyżej 4 000 000 znaków, a sama osada najwyżej 500 000 (zmierzono 548 303 razem: 221 937 bez osady i 326 366 osady, z jednym odwołaniem jej zarządu)', {
    timeout: 900_000,
  }, () => {
    const geo = mapaMieszkancow(demo.geo, dane);
    const world = buildWorld(geo, { seed: SEED, street: demo.street });
    const l = mieszkancyNowejGry(world, geo, dane, 4);
    const sim = new Sim(
      world,
      createSim(world, SEED, { core: 4, obcy: true, ...(l ? { mieszkancy: opcjaMieszkancow(l) } : {}) }),
    );
    const gov = newGov(SEED, 'zwykly', true);
    const osada = nowaOsadaGry(SEED, dane, uklad);
    osada.dane(demo.kwadraty);
    const koniec = DNI * TICKS_PER_DAY;
    while (sim.st.tick < koniec) {
      sim.step();
      osada.krok(sim.st.tick);
    }
    expect(osada.stan).toBe('jest');
    // ticki obu gier są równe do końca, chyba że osada upadła (wtedy stoi)
    if (!osada.upadla) expect(osada.gra!.sim.st.tick).toBe(sim.st.tick);
    expect(osada.gra!.bledy).toEqual([]);
    expect(osada.gra!.zawieszone).toEqual([]);

    const save: Save = {
      v: 1,
      at: 1,
      data: { geo: demo.geo, name: 'Przymorze', addr: demo.addr, street: demo.street, src: 'demo', key: 'przymorze' },
      seed: SEED,
      sim: sim.st,
      gov,
      screen: 0,
      world: worldKey(sim.w),
      ...poleOsady(osada),
    };
    const tekst = JSON.stringify(save);
    const osadaTekst = JSON.stringify(save.osada);
    console.log(
      `zapis po ${DNI} dniach: ${tekst.length} znaków (bez osady ${tekst.length - osadaTekst.length}, osada ${osadaTekst.length}); osada: odwołań ${osada.odwolania}, upadła ${osada.upadla ? `w dniu ${osada.upadla.dzien}` : 'nie'}`,
    );
    expect(tekst.length).toBeLessThanOrEqual(4_000_000);
    // sama osada (zmierzono 326 366): dwukrotny wzrost jej stanu przeszedłby przez luźny limit całego zapisu niezauważony
    expect(osadaTekst.length).toBeLessThanOrEqual(500_000);

    // przez pamięć przeglądarki tam i z powrotem: ten sam zapis, osada wczytuje się z niego i ma ten sam skrót
    const m = new Map<string, string>();
    const store = {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
    expect(writeSave(save, store)).toBe(true);
    expect(m.get(SAVE_KEY)).toBe(tekst);
    const wczytany = readSave(store);
    expect(wczytany?.osada).toBeDefined();
    const wczytana = osadaZZapisu(wczytany!.osada!, SEED, dane, uklad);
    expect(wczytana.stan).toBe('jest');
    expect(wczytana.odwolania).toBe(osada.odwolania);
    expect(skrotGry(wczytana.gra!)).toBe(skrotGry(osada.gra!));
  });
});
