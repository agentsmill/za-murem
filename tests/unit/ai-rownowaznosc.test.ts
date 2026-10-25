/* Równoważność silnika podstawowego z botem `zawsze-warta` (src/ai/silnik.ts, src/ai/gra.ts i `playWithGov` z tests/unit/gov-play.ts),
   etap 1 osady AI (docs/superpowers/plans/2026-10-21-osada-ai-etap-1.md, zadania 1 i 2). Te testy żyły w tests/unit/ai-gra.test.ts;
   w etapie 2 (zadanie 1) poszły do osobnego pliku, bo to ponad połowa czasu tamtego pliku (gry porównuje się dwa razy: pętla gry
   i `playWithGov`), a vitest puszcza pliki równolegle. Pilnują, że silnik podstawowy w pętli gry daje te same skróty co
   `playWithGov(..., 'zawsze-warta', ...)`, także z okolicą miasta, obcymi i drogami do zwycięstwa, z łańcuchami kart (opcja
   `lancuchy`), a na Lanciego (ziarno 18) przez 10 dni oraz na Zielonkach (ziarno 14, mieszkańcy z adresu jak w przeglądarce)
   przez 10 dni, czyli także po pierwszym przydziale warty na karcie nocy (10. dzień), którego krótkie przebiegi nie dosięgają
   (obie pętle muszą go mieć po 7 albo 8 dobach, w tej samej sekundzie; ziarna trzeba wybierać od nowa po zmianie, która
   przesuwa kolejność kart). Każda pętla dostaje własny, świeży świat (`swiezySwiat`): gra zmienia siatkę świata w miejscu
   (`ustawSiatke`, `initFence`, `dociagnijSiatke`), więc druga gra na tym samym obiekcie startuje od innego stanu i skróty
   rozjeżdżają się bez żadnego błędu silnika. Tych gier nie bierze się z pamięci pliku (`graPoDniach`): porównanie ma dotyczyć
   gry ciągłej, bez zapisów po drodze. Po każdej grze test sprawdza też `bledy`: `krokGry` łapie wyjątki decydenta i gra idzie dalej,
   więc rzut, który niczego nie zmienia w skrócie, przeszedłby bez śladu. */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { type GraAi, grajDo, nowaGraAi } from '../../src/ai/gra.ts';
import { silnikPodstawowy } from '../../src/ai/silnik.ts';
import { TICKS_PER_DAY, TICKS_PER_SECOND } from '../../src/sim/clock.ts';
import { przygotujGre } from '../../tools/bot-osada.ts';
import { swiezySwiat } from './ai-pomoc.ts';
import { type PlayResult, playWithGov } from './gov-play.ts';
import { okolicaZGeo } from './miasto-play.ts';

const demo = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../public/demo/przymorze.json'), 'utf8'));
const demoLanciego = JSON.parse(
  fs.readFileSync(path.resolve(import.meta.dirname, '../../public/demo/lanciego.json'), 'utf8'),
);

/** Gałąź przydziału warty na karcie nocy (zdjęcie chorego z warty, najbardziej wypoczęty na pierwszy posterunek) jest naprawdę
    w przebiegu obu pętli: obie przydzieliły wartę po `dni` dobach od startu i w tej samej sekundzie przy ekranie. Gdy zmiana
    w grze przesunie trajektorię i gałąź zniknie, test pada tu, a nie na pustym warunku. */
function sprawdzGalazWarty(g: GraAi, wzor: PlayResult, dni: number): void {
  const silnikowa = g.dziennik!.find((m) => m.t === 'noc' && m.klucz.startsWith('warta:'));
  const wzorcowa = wzor.decisions.find((d) => d.kind === 'przydział' && d.text.includes(': warta '));
  expect(silnikowa).toBeDefined();
  expect(wzorcowa).toBeDefined();
  expect(silnikowa!.s * TICKS_PER_SECOND).toBeGreaterThan(dni * TICKS_PER_DAY);
  expect(wzorcowa!.s * TICKS_PER_SECOND).toBeGreaterThan(dni * TICKS_PER_DAY);
  expect(wzorcowa!.s).toBe(silnikowa!.s);
}

describe('równoważność z playWithGov', () => {
  it('silnik podstawowy daje ten sam skrót co playWithGov zawsze-warta przez 3 dni', () => {
    const g = nowaGraAi(swiezySwiat('przymorze'), 11);
    grajDo(g, silnikPodstawowy, 3 * TICKS_PER_DAY);
    expect(g.bledy).toEqual([]);
    const wzor = playWithGov(swiezySwiat('przymorze'), 11, 'zawsze-warta', 3, 4);
    expect(g.sim.st.tick).toBe(3 * TICKS_PER_DAY);
    expect(g.sim.hash()).toBe(wzor.hash);
    // zarząd ten sam co u wzorca: te same uchwały, karty i wydarzenia
    expect(JSON.stringify(g.gov)).toBe(JSON.stringify(wzor.gov));
  });

  it('z okolicą miasta, obcymi i drogami do zwycięstwa też ten sam skrót co playWithGov z tymi opcjami', () => {
    const okolica = okolicaZGeo(demo.geo);
    const g = nowaGraAi(swiezySwiat('przymorze'), 12, { obcy: true, okolica, ludnosc2021: 900 });
    grajDo(g, silnikPodstawowy, 3 * TICKS_PER_DAY);
    expect(g.bledy).toEqual([]);
    const wzor = playWithGov(swiezySwiat('przymorze'), 12, 'zawsze-warta', 3, 4, {
      obcy: true,
      miasto: { okolica },
      zwyciestwo: { ludnosc2021: 900 },
    });
    expect(g.sim.hash()).toBe(wzor.hash);
    expect(JSON.stringify(g.gov)).toBe(JSON.stringify(wzor.gov));
  });

  it.each([
    ['zielonki', 12],
    ['lanciego', 13],
  ])('na demie %s (ziarno %i) też ten sam skrót co playWithGov przez 2 dni', (demoKlucz, ziarno) => {
    const g = nowaGraAi(swiezySwiat(demoKlucz), ziarno);
    grajDo(g, silnikPodstawowy, 2 * TICKS_PER_DAY);
    expect(g.bledy).toEqual([]);
    const wzor = playWithGov(swiezySwiat(demoKlucz), ziarno, 'zawsze-warta', 2, 4);
    expect(g.sim.hash()).toBe(wzor.hash);
    expect(JSON.stringify(g.gov)).toBe(JSON.stringify(wzor.gov));
  });

  it('Lanciego, ziarno 18, 10 dni z obcymi i okolicą: ten sam skrót co playWithGov, także po przydziale warty na karcie', () => {
    // tu pierwsza karta nocy bez warty z propozycji zarządu wypada 10. dnia (sekunda przy ekranie 8840): wtedy wchodzi
    // gałąź przydziału warty (zdjęcie chorego z warty, najbardziej wypoczęty na pierwszy posterunek), której 2–3-dniowe
    // przebiegi nie dosięgają. Ziarna, które tu stały, wypadały z tej gałęzi po kolejnych scaleniach, które przesuwały
    // kolejność kart: 14 po scaleniu nocnego posiłku (zadanie 7, część A; na świeżym świecie skróty były równe, ale gałęzi
    // w przebiegu nie było), 12 po scaleniu wydarzeń etapów 4–5 (odstęp kart 110–200 s i narrator; część B). Przegląd ziaren
    // 11–20 na tym scaleniu (12 dni): gałąź ma w 10 dniach tylko Lanciego 18 (sekunda 8840)
    const okolica = okolicaZGeo(demoLanciego.geo);
    const g = nowaGraAi(swiezySwiat('lanciego'), 18, { obcy: true, okolica, ludnosc2021: 900, dziennik: true });
    grajDo(g, silnikPodstawowy, 10 * TICKS_PER_DAY);
    expect(g.bledy).toEqual([]);
    const wzor = playWithGov(swiezySwiat('lanciego'), 18, 'zawsze-warta', 10, 4, {
      obcy: true,
      miasto: { okolica },
      zwyciestwo: { ludnosc2021: 900 },
    });
    sprawdzGalazWarty(g, wzor, 7);
    expect(g.sim.st.tick).toBe(10 * TICKS_PER_DAY);
    expect(g.sim.hash()).toBe(wzor.hash);
    expect(JSON.stringify(g.gov)).toBe(JSON.stringify(wzor.gov));
  });

  it('Zielonki, ziarno 14, 10 dni z mieszkańcami z adresu (jak w przeglądarce): ten sam skrót co playWithGov po przydziale warty', async () => {
    // z mieszkańcami z generatora przebieg jest inny niż na świecie z `demoWorld`: pierwsza karta nocy bez warty z propozycji
    // zarządu wypada tu w sekundzie 8840 (10. dzień; ziarno 19, które tu stało, miało 7880 przed scaleniem wydarzeń etapów 4–5
    // i nie ma tej gałęzi po nim). Każda pętla dostaje własny, świeży świat (`przygotujGre` buduje go od nowa): gra zmienia
    // siatkę świata, więc druga gra na tym samym obiekcie startuje od innego stanu (Zielonki 11: skróty rozjeżdżają się już
    // w dniu 2, choć na świeżych światach są równe)
    const silnikGra = await przygotujGre('zielonki', 14, false);
    const wzorGra = await przygotujGre('zielonki', 14, false);
    const g = nowaGraAi(silnikGra.w, 14, {
      core: 4,
      obcy: true,
      mieszkancy: silnikGra.opts.mieszkancy,
      okolica: silnikGra.opts.okolica,
      ludnosc2021: silnikGra.opts.ludnosc2021,
      dziennik: true,
    });
    grajDo(g, silnikPodstawowy, 10 * TICKS_PER_DAY);
    expect(g.bledy).toEqual([]);
    const wzor = playWithGov(wzorGra.w, 14, 'zawsze-warta', 10, 4, {
      obcy: true,
      mieszkancy: wzorGra.opts.mieszkancy,
      miasto: { okolica: wzorGra.opts.okolica! },
      zwyciestwo: { ludnosc2021: wzorGra.opts.ludnosc2021 },
    });
    sprawdzGalazWarty(g, wzor, 8);
    expect(g.sim.st.tick).toBe(10 * TICKS_PER_DAY);
    expect(g.sim.hash()).toBe(wzor.hash);
    expect(JSON.stringify(g.gov)).toBe(JSON.stringify(wzor.gov));
  }, 120_000);

  it('z łańcuchami kart (opcja lancuchy) ten sam skrót co playWithGov z lancuchy: true, a kroki łańcuchów naprawdę się zaczęły', () => {
    // gra w przeglądarce ma łańcuchy domyślnie (`newGov(…, true)`): wybór wątków losuje z ziarna zarządu, kroki z gościem
    // czekają pod bramą, a okna kroków to wydarzenia jak inne, więc odpowiedź domyślna (pierwszy dozwolony wybór) musi dawać
    // to samo co wzorzec. Przymorze 12 w 6 dób: trzy wątki (Światło w oknie, List, Szczekanie), dwa skończone i trzeci rozpoczęty
    const okolica = okolicaZGeo(demo.geo);
    const g = nowaGraAi(swiezySwiat('przymorze'), 12, { obcy: true, okolica, ludnosc2021: 900, lancuchy: true });
    grajDo(g, silnikPodstawowy, 6 * TICKS_PER_DAY);
    expect(g.bledy).toEqual([]);
    const wzor = playWithGov(swiezySwiat('przymorze'), 12, 'zawsze-warta', 6, 4, {
      obcy: true,
      miasto: { okolica },
      zwyciestwo: { ludnosc2021: 900 },
      lancuchy: true,
    });
    // łańcuchy naprawdę grały: wątki wybrane i co najmniej trzy kroki rozpoczęte (nie przechodzi na pustym warunku)
    expect(g.gov.lancuchy).toBe(true);
    expect(g.gov.watki?.wybrane.length).toBe(3);
    const kroki = Object.values(g.gov.watki?.krok ?? {}).reduce((a, n) => a + n, 0);
    expect(kroki).toBeGreaterThanOrEqual(3);
    expect(g.sim.hash()).toBe(wzor.hash);
    expect(JSON.stringify(g.gov)).toBe(JSON.stringify(wzor.gov));
  });
});
