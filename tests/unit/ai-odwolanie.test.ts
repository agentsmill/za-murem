/* Nowy zarząd osady po odwołaniu (src/ai/odwolanie.ts), etap 2 osady AI (docs/superpowers/plans/2026-10-24-osada-ai-etap-2.md,
   zadanie 3, rozstrzygnięcie kontrolera 1 do decyzji 10 ze specyfikacji: „Odwołanie ich zarządu daje nowy zarząd zamiast końca
   osady”). `krokGry` staje, gdy `gov.over` jest ustawione; osada w grze nie może stanąć, więc po odwołaniu dostaje nowy zarząd i
   idzie dalej, słabsza. Testy na prawdziwym świecie osady (Przymorze, kwadrat wybrany przez `wybierzOsade`): odwołanie
   wymuszone wkurzeniem 100, nowy start zaufania i wkurzenia, wpis w kronice, dalsza gra bez błędów, determinizm (zapis tuż po
   nowym zarządzie daje ten sam przebieg), kolejne odwołanie, a pustka i exodus nie są odwołaniem (osada upada, to sprawa
   gospodarza w src/ui/osada.ts). Liczby startu (zaufanie, wkurzenie) są w nagłówku modułu z pomiarem. */

import { beforeAll, describe, expect, it } from 'vitest';
import { type GraAi, grajDo, krokGry, nowaGraAi, skrotGry, wczytajGre, zapiszGre } from '../../src/ai/gra.ts';
import { swiatZGeo, wybierzOsade, ziarnoOsady } from '../../src/ai/kwadrat.ts';
import { nowyZarzad, START_WKURZENIA, START_ZAUFANIA } from '../../src/ai/odwolanie.ts';
import { silnik } from '../../src/ai/silnik.ts';
import { hashString } from '../../src/core/rng.ts';
import { newGov } from '../../src/gov/zarzad.ts';
import { dayOf, TICKS_PER_DAY, TICKS_PER_SECOND } from '../../src/sim/clock.ts';
import { mieszkancyZapisu } from '../../src/sim/osiedle.ts';
import { ukladZGeo } from '../../src/world/kwadraty.ts';
import { daneDema, wczytajDemo } from '../../tools/osada-kwadraty.ts';

const DEMO = 'przymorze';
let demo: ReturnType<typeof wczytajDemo>;
let dane: Awaited<ReturnType<typeof daneDema>>;
let SEED = 0;

beforeAll(async () => {
  demo = wczytajDemo(DEMO);
  dane = await daneDema(DEMO);
  SEED = Number.parseInt(hashString(demo.addr), 16) || 2051;
}, 120_000);

/** świeża gra osady (świat taki, jak daje wybór kwadratu: gra zmienia swój świat w miejscu, więc każda dostaje własny) */
function swiezaGra(): GraAi {
  const swiat = wybierzOsade(SEED, demo.kwadraty, dane, ukladZGeo(demo.geo));
  if (!swiat) throw new Error('Przymorze bez osady');
  return nowaGraAi(swiat.world, ziarnoOsady(SEED, swiat.sx, swiat.sy), swiat.opcje);
}

/** wczytanie gry osady z zapisu na świeżym świecie, tak jak robi to gospodarz (src/ui/osada.ts) */
function wczytaj(zapis: ReturnType<typeof zapiszGre>): GraAi {
  const swiat = wybierzOsade(SEED, demo.kwadraty, dane, ukladZGeo(demo.geo))!;
  const z = swiatZGeo(swiat.geo, ziarnoOsady(SEED, swiat.sx, swiat.sy), dane);
  mieszkancyZapisu(z.world, z.geo, dane, zapis.sim);
  return wczytajGre(z.world, zapis);
}

/** wymusza odwołanie: wkurzenie 100, a gra dochodzi do pełnej sekundy, w której zarząd to sprawdza */
function odwolaj(g: GraAi): void {
  g.gov.anger = 100;
  const doKonca = g.sim.st.tick + 2 * TICKS_PER_SECOND;
  while (g.sim.st.tick < doKonca && !g.gov.over) krokGry(g, silnik);
}

describe('nowyZarzad: start nowego zarządu', () => {
  it('nowy zarząd jest słabszy od świeżego (mniej zaufania, więcej wkurzenia), ale daleko od progu odwołania i exodusu', () => {
    const swiezy = newGov(1);
    expect(START_ZAUFANIA).toBeLessThan(swiezy.trust);
    expect(START_WKURZENIA).toBeGreaterThan(swiezy.anger);
    // zapas do odwołania (100) i do exodusu (0) zostaje: zarząd ma czas coś zrobić, zanim zebranie znowu go odwoła
    expect(START_WKURZENIA).toBeLessThanOrEqual(70);
    expect(START_ZAUFANIA).toBeGreaterThanOrEqual(20);
  });
});

describe('nowyZarzad: odwołanie wymuszone w grze osady', { timeout: 300_000 }, () => {
  it('odwołanie daje nowy zarząd: gra nie jest skończona, ma nowy start, wpis w kronice w obu językach, a tick stoi', () => {
    const g = swiezaGra();
    grajDo(g, silnik, 3 * TICKS_PER_DAY);
    expect(g.gov.over).toBeNull();
    const kronikaPrzed = g.gov.log.length;
    odwolaj(g);
    expect(g.gov.over).toBe('odwolanie');
    const tick = g.sim.st.tick;

    expect(nowyZarzad(g)).toBe(true);
    expect(g.gov.over).toBeNull();
    expect(g.gov.trust).toBe(START_ZAUFANIA);
    expect(g.gov.anger).toBe(START_WKURZENIA);
    // czas się nie cofa ani nie przesuwa
    expect(g.sim.st.tick).toBe(tick);
    // wpis w kronice (duży, w obu językach), po wpisie o końcu gry z zarządu
    expect(g.gov.log.length).toBeGreaterThan(kronikaPrzed);
    const wpis = g.gov.log[g.gov.log.length - 1];
    expect(wpis.big).toBe(true);
    expect(wpis.txt.pl).toMatch(/odwoła/i);
    expect(wpis.txt.pl).toMatch(/nowy|nowego|nowym/i);
    expect(wpis.txt.en).toMatch(/recall/i);
    expect(wpis.txt.en).toMatch(/new/i);
    expect(wpis.txt.en).not.toMatch(/[ąćęłńóśźż]/i);
    expect(wpis.day).toBe(dayOf(tick));
  });

  it('gra idzie dalej po nowym zarządzie: dwie doby bez błędów, bez natychmiastowego odwołania, tick rośnie jak zawsze', () => {
    const g = swiezaGra();
    grajDo(g, silnik, 3 * TICKS_PER_DAY);
    odwolaj(g);
    const tick = g.sim.st.tick;
    expect(nowyZarzad(g)).toBe(true);
    grajDo(g, silnik, tick + 2 * TICKS_PER_DAY);
    expect(g.bledy).toEqual([]);
    expect(g.gov.over).toBeNull();
    expect(g.sim.st.tick).toBe(tick + 2 * TICKS_PER_DAY);
    // wkurzenie nie wróciło do 100 w kilka sekund: zarząd ma dalej okna i tury (zaufanie i wkurzenie się ruszają)
    expect(g.gov.anger).toBeLessThan(100);
  });

  it('kolejne odwołanie też daje nowy zarząd (osada żyje, dopóki nie upadnie z pustki albo exodusu)', () => {
    const g = swiezaGra();
    grajDo(g, silnik, 3 * TICKS_PER_DAY);
    odwolaj(g);
    expect(nowyZarzad(g)).toBe(true);
    grajDo(g, silnik, g.sim.st.tick + TICKS_PER_DAY);
    odwolaj(g);
    expect(g.gov.over).toBe('odwolanie');
    expect(nowyZarzad(g)).toBe(true);
    expect(g.gov.over).toBeNull();
    expect(g.gov.trust).toBe(START_ZAUFANIA);
    expect(g.gov.anger).toBe(START_WKURZENIA);
    grajDo(g, silnik, g.sim.st.tick + TICKS_PER_DAY);
    expect(g.bledy).toEqual([]);
  });

  it('wynik zależy tylko od stanu gry: te same gry dają ten sam skrót, a zapis zrobiony tuż po nowym zarządzie nie zmienia przebiegu', () => {
    const a = swiezaGra();
    const b = swiezaGra();
    for (const g of [a, b]) {
      grajDo(g, silnik, 3 * TICKS_PER_DAY);
      odwolaj(g);
      expect(nowyZarzad(g)).toBe(true);
    }
    expect(skrotGry(a)).toBe(skrotGry(b));
    // zapis (przez JSON, jak w localStorage) tuż po nowym zarządzie, wczytanie na świeżym świecie
    const wczytana = wczytaj(JSON.parse(JSON.stringify(zapiszGre(a))));
    expect(skrotGry(wczytana)).toBe(skrotGry(a));
    const koniec = a.sim.st.tick + 2 * TICKS_PER_DAY;
    grajDo(a, silnik, koniec);
    grajDo(wczytana, silnik, koniec);
    expect(a.bledy).toEqual([]);
    expect(wczytana.bledy).toEqual([]);
    expect(skrotGry(wczytana)).toBe(skrotGry(a));
  });
});

describe('nowyZarzad: co nie jest odwołaniem', { timeout: 300_000 }, () => {
  it('bez końca gry albo przy pustce i exodusie nic nie robi (false, stan bez zmian)', () => {
    const g = swiezaGra();
    grajDo(g, silnik, TICKS_PER_DAY);
    const przed = skrotGry(g);
    expect(nowyZarzad(g)).toBe(false);
    expect(skrotGry(g)).toBe(przed);
    for (const koniec of ['pustka', 'exodus'] as const) {
      g.gov.over = koniec;
      const kopia = JSON.stringify(g.gov);
      expect(nowyZarzad(g), koniec).toBe(false);
      expect(g.gov.over, koniec).toBe(koniec);
      expect(JSON.stringify(g.gov), koniec).toBe(kopia);
    }
  });
});
