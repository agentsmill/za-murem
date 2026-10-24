/* Pomocnik gier-prefiksów (`graDoTicku`, `graPoDniach` w tests/unit/ai-pomoc.ts), etap 2 osady AI
   (docs/superpowers/plans/2026-10-24-osada-ai-etap-2.md, zadanie 1). Pomocnik liczy grę silnikiem raz na plik testów i każdemu
   testowi oddaje nową grę wczytaną z zapisu, więc musi dawać skróty takie jak gra zagrana od zera i bez przerw, w dowolnej
   kolejności zapytań, i nie wolno mu mieszać gier: osobne światy, stany i dzienniki, osobne punkty dla innych opcji i decydentów. */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { type Decydent, grajDo, nowaGraAi, skrotGry } from '../../src/ai/gra.ts';
import { silnik, silnikPodstawowy } from '../../src/ai/silnik.ts';
import { TICKS_PER_DAY, TICKS_PER_SECOND } from '../../src/sim/clock.ts';
import { graDoTicku, graPoDniach, swiezySwiat } from './ai-pomoc.ts';
import { okolicaZGeo } from './miasto-play.ts';

const demo = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../public/demo/przymorze.json'), 'utf8'));

describe('graPoDniach i graDoTicku: wspólne gry-prefiksy testów', () => {
  // Pomocnik z tests/unit/ai-pomoc.ts liczy grę raz na plik i oddaje każdemu testowi nową grę wczytaną z zapisu. Skróty mają
  // być te same, co gry zagrane od zera i bez przerw, w dowolnej kolejności zapytań (od zera, z punktu wcześniejszego, dokładnie
  // w punkcie i wcześniej niż wszystkie punkty).
  const dni = (n: number): number => Math.round(n * TICKS_PER_DAY);

  it('skróty jak gra ciągła od zera w kolejności zapytań: od zera, z wcześniejszego punktu, z punktu na granicy doby, sprzed wszystkich punktów', () => {
    const ciagla = nowaGraAi(swiezySwiat('przymorze'), 11);
    const wzorzec = new Map<number, string>();
    for (const d of [0.3, 0.5, 1, 1.2]) {
      grajDo(ciagla, silnik, dni(d));
      wzorzec.set(d, skrotGry(ciagla));
    }
    // 0,5 doby od zera; 1,2 doby z punktu 0,5 (po drodze granica doby 1); 1 doba to punkt z granicy; 0,3 doby sprzed wszystkich punktów
    for (const d of [0.5, 1.2, 1, 0.3]) {
      const g = graPoDniach('przymorze', 11, d);
      expect(g.sim.st.tick, `${d} doby`).toBe(dni(d));
      expect(skrotGry(g), `${d} doby`).toBe(wzorzec.get(d));
    }
    // ten sam punkt jeszcze raz (pamięć) i ten sam tick podany w tickach
    expect(skrotGry(graPoDniach('przymorze', 11, 1.2))).toBe(wzorzec.get(1.2));
    expect(skrotGry(graDoTicku('przymorze', 11, dni(1)))).toBe(wzorzec.get(1));
  });

  it('każde wywołanie oddaje osobną grę ze świeżym światem: gra jednej nie rusza drugiej ani pamięci', () => {
    const a = graPoDniach('przymorze', 11, 0.3);
    const b = graPoDniach('przymorze', 11, 0.3);
    // (`expect(a).not.toBe(b)` liczyłby głębokie porównanie obu gier dla komunikatu: kilka sekund na świecie 384 × 384)
    expect(a === b).toBe(false);
    expect(a.w === b.w).toBe(false);
    expect(a.sim.st === b.sim.st).toBe(false);
    const skrot = skrotGry(b);
    grajDo(a, silnik, dni(0.6));
    a.sim.st.things.length = 0;
    expect(skrotGry(b)).toBe(skrot);
    expect(skrotGry(graPoDniach('przymorze', 11, 0.3))).toBe(skrot);
  });

  it('opcje i decydent są częścią klucza: inne opcje albo inny decydent to inna gra', () => {
    const zwykla = graPoDniach('przymorze', 11, 0.3);
    const zOkolica = graPoDniach('przymorze', 11, 0.3, { okolica: okolicaZGeo(demo.geo) });
    expect(zOkolica.opts.okolica).toBeDefined();
    expect(zwykla.opts.okolica).toBeUndefined();
    expect(zOkolica.gov.miasto).toBeDefined();
    // silnik podstawowy gra tę samą dobę inaczej niż silnik z warstwami (skrót pamięci silnika)
    const podstawowy = graPoDniach('przymorze', 11, 0.3, {}, silnikPodstawowy);
    expect(skrotGry(podstawowy)).not.toBe(skrotGry(zwykla));
    expect(skrotGry(graPoDniach('przymorze', 11, 0.3, {}, silnikPodstawowy))).toBe(skrotGry(podstawowy));
  });

  it('gra, która skończyła się wcześniej, wraca skończona (bez ruszania czasu poza koniec)', () => {
    const konczy: Decydent = {
      okno: () => {},
      tura: (g) => {
        if (g.sim.st.tick >= 5 * TICKS_PER_SECOND) g.gov.over = 'pustka';
      },
    };
    // koniec nie jest częścią zapisu skrótu, ale jest w stanie zarządu (`gov.over`), który zapis przenosi
    const g = graPoDniach('przymorze', 11, 1, {}, konczy);
    expect(g.gov.over).toBe('pustka');
    expect(g.sim.st.tick).toBe(5 * TICKS_PER_SECOND);
    expect(graPoDniach('przymorze', 11, 1, {}, konczy).sim.st.tick).toBe(5 * TICKS_PER_SECOND);
  });

  it('z opcją dziennik gra ma dziennik ruchów od ticku 0, jak gra zagrana od zera, także po wczytaniu z punktu', () => {
    const odZera = nowaGraAi(swiezySwiat('przymorze'), 11, { dziennik: true });
    grajDo(odZera, silnik, dni(0.3));
    const dziennik03 = structuredClone(odZera.dziennik!);
    grajDo(odZera, silnik, dni(0.5));
    // pierwsze zapytanie: 0,5 doby od zera; drugie: 0,3 doby, czyli sprzed jedynego punktu, więc znów od zera
    const a = graPoDniach('przymorze', 11, 0.5, { dziennik: true });
    expect(a.dziennik).toEqual(odZera.dziennik);
    expect(a.dziennik!.length).toBeGreaterThan(0);
    const b = graPoDniach('przymorze', 11, 0.3, { dziennik: true });
    expect(b.dziennik).toEqual(dziennik03);
    // dziennik jest kopią: ruch dopisany jednej grze nie trafia do drugiej ani do pamięci
    b.dziennik!.push({ s: 1, t: 'dalej' });
    expect(graPoDniach('przymorze', 11, 0.3, { dziennik: true }).dziennik).toEqual(dziennik03);
    // gra z punktu dopisuje do tego samego dziennika dalej i dochodzi do tego samego stanu
    grajDo(b, silnik, dni(0.5));
    expect(skrotGry(b)).toBe(skrotGry(odZera));
    expect(b.dziennik!.slice(0, dziennik03.length)).toEqual(dziennik03);
    expect(b.dziennik!.slice(dziennik03.length + 1)).toEqual(odZera.dziennik!.slice(dziennik03.length));
    // bez opcji dziennika gry go nie mają
    expect(graPoDniach('przymorze', 11, 0.3).dziennik).toBeUndefined();
  });
});
