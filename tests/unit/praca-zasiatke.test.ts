/* Domyślna wartość przełącznika „może wychodzić za siatkę” (decyzja Mateusza 19.10.2026): włączony w trybie zwykłym,
   wyłączony w trybie zombie (`zaSiatkeDomyslnie`, src/sim/praca.ts). Powód: wewnątrz siatki rosną jedno–dwa drzewa na
   mapę, więc przy wyłączonym przełączniku nikt sam nie zetnie drewna i koza zgaśnie. Sprawdzamy trzy rzeczy: grę (zarząd
   z domyślnym przełącznikiem wychodzi za dnia i ścina drzewa za siatką, w zombie nikt nie wychodzi, a jawne wyłączenie
   przywraca dawne zachowanie), odczyt dla interfejsu (`snapshot`, panel Pracy, karta osoby pokazują włączony przełącznik
   w trybie zwykłym i wyłączony w zombie) oraz teksty o wartości domyślnej po polsku i po angielsku. Same funkcje i polecenia
   (zbicie do domyślnej, zgodność ze starym zapisem): praca.test.ts i praca-polecenia.test.ts. */

import { afterEach, describe, expect, it } from 'vitest';
import { ustawJezyk } from '../../src/core/jezyk.ts';
import { TICKS_PER_HOUR, TICKS_PER_SECOND } from '../../src/sim/clock.ts';
import { zaSiatke } from '../../src/sim/praca.ts';
import type { Sim } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import { personCard } from '../../src/ui/karta.ts';
import { helpSheet } from '../../src/ui/okna.ts';
import { pracaPanelHtml, widokPracy, ZA_SIATKE_OPIS } from '../../src/ui/praca.ts';
import { polskieSlowa } from './po-angielsku.ts';
import { bezPrzelacznika, doRana, skonczSamouczek } from './praca-pomoc.ts';
import { core, demoWorld, newGame } from './sasiedzi-pomoc.ts';

afterEach(() => ustawJezyk('pl'));

/** wartość atrybutu `aria-pressed` pierwszego przycisku z danym znacznikiem */
function wcisniety(html: string, znacznik: string): boolean | null {
  const m = new RegExp(`<button[^>]*${znacznik}[^>]*aria-pressed="(true|false)"`).exec(html);
  return m ? m[1] === 'true' : null;
}

describe('gra: zarząd z domyślnym przełącznikiem', () => {
  /** Dziesięć godzin dnia 2 od 6:00 (po samouczku, gdy automat już pracuje), zarząd sam: ile razy (co sekundę przy
      ekranie) ktoś z zarządu stał poza naszym terenem przy pracy bez polecenia, której cel leży poza naszym terenem,
      i ile drzew ścięto. Z `wylacz` każdemu z zarządu przełącznik jest jawnie wyłączony. */
  function dzien(key: string, tryb: 'zwykly' | 'zombie', wylacz: boolean): { wyjscia: number; scieto: number } {
    const sim: Sim = newGame(key, tryb, 5);
    sim.step();
    skonczSamouczek(sim);
    if (wylacz) bezPrzelacznika(sim);
    doRana(sim, 2);
    const w = sim.w;
    const scieto0 = sim.st.felled.length;
    let wyjscia = 0;
    for (let k = 0; k < 10 * TICKS_PER_HOUR; k++) {
      sim.step();
      if (k % TICKS_PER_SECOND) continue;
      for (const p of core(sim)) {
        if (p.away || !p.job || p.job.order) continue;
        if (sim.naszTerenKafelek(Math.floor(p.y) * w.size + Math.floor(p.x))) continue;
        if (p.job.tile >= 0 && !sim.naszTerenKafelek(p.job.tile)) wyjscia++;
      }
    }
    return { wyjscia, scieto: sim.st.felled.length - scieto0 };
  }

  it('tryb zwykły: bez żadnego polecenia zarząd za dnia sam wychodzi za siatkę i ścina drzewa, a z wyłączonym przełącznikiem nie', () => {
    for (const key of ['lanciego', 'przymorze', 'zielonki']) {
      const domyslnie = dzien(key, 'zwykly', false);
      const wylaczony = dzien(key, 'zwykly', true);
      expect(domyslnie.wyjscia, `${key}: wyjścia`).toBeGreaterThan(0);
      expect(wylaczony.wyjscia, `${key}: wyjścia z wyłączonym`).toBe(0);
      expect(domyslnie.scieto, `${key}: ścięte drzewa`).toBeGreaterThan(wylaczony.scieto);
    }
  });

  it('tryb zombie: domyślnie nikt nie wychodzi za siatkę bez polecenia', () => {
    for (const key of ['lanciego', 'przymorze', 'zielonki']) {
      expect(dzien(key, 'zombie', false).wyjscia, key).toBe(0);
    }
  });

  it('tryb zombie: jawne włączenie przełącznika puszcza za siatkę (zmiana domyślnej, a nie zakaz)', () => {
    const sim = newGame('przymorze', 'zombie', 5);
    for (const p of core(sim)) sim.push({ t: 'zasiatke', ids: [], osoba: p.person, on: true });
    sim.step();
    for (const p of core(sim)) expect(zaSiatke(sim.st, p.person)).toBe(true);
    expect(sim.st.praca?.osoby?.[core(sim)[0].person]).toEqual({ zaSiatke: true });
  });
});

describe('odczyt i interfejs: przełącznik pokazuje domyślną trybu', () => {
  const widocznyPrzelacznik = (sim: Sim, osoba: number, zombie: boolean) => {
    const w = demoWorld('przymorze');
    const snap = snapshot(sim.st, w);
    const ludzie = snap.people;
    const panel = pracaPanelHtml(widokPracy(snap, { kol: null, zlecen: 0, touch: false }), false);
    const karta = personCard(ludzie[osoba], 0, undefined, false, { widoczne: snap.praca.widoczne, zombie });
    return { snap, panel, karta, o: ludzie[osoba] };
  };

  it('tryb zwykły: odczyt, panel Pracy i karta osoby pokazują przełącznik włączony u każdego z zarządu', () => {
    const sim = newGame('przymorze', 'zwykly', 5);
    const { snap, panel } = widocznyPrzelacznik(sim, 0, false);
    expect(snap.people).toHaveLength(4);
    for (const [k, p] of snap.people.entries()) {
      expect(p.praca.zaSiatke, `odczyt ${p.first}`).toBe(true);
      expect(wcisniety(panel, `data-zasiatke="${p.osoba}"`), `panel ${p.first}`).toBe(true);
      const karta = widocznyPrzelacznik(sim, k, false).karta;
      expect(wcisniety(karta, 'data-card="zasiatke"'), `karta ${p.first}`).toBe(true);
    }
  });

  it('tryb zombie: odczyt, panel i karta pokazują przełącznik wyłączony', () => {
    const sim = newGame('przymorze', 'zombie', 5);
    const { snap, panel } = widocznyPrzelacznik(sim, 0, true);
    for (const [k, p] of snap.people.entries()) {
      expect(p.praca.zaSiatke, `odczyt ${p.first}`).toBe(false);
      expect(wcisniety(panel, `data-zasiatke="${p.osoba}"`), `panel ${p.first}`).toBe(false);
      const karta = widocznyPrzelacznik(sim, k, true).karta;
      expect(wcisniety(karta, 'data-card="zasiatke"'), `karta ${p.first}`).toBe(false);
    }
  });

  it('wyłączenie przez gracza w trybie zwykłym pokazuje się tylko u tej osoby i wraca po ponownym włączeniu', () => {
    const sim = newGame('przymorze', 'zwykly', 5);
    const [a, b] = core(sim);
    sim.push({ t: 'zasiatke', ids: [], osoba: a.person, on: false });
    sim.step();
    const po = snapshot(sim.st, demoWorld('przymorze')).people;
    expect(po.find((p) => p.osoba === a.person)!.praca.zaSiatke).toBe(false);
    expect(po.find((p) => p.osoba === b.person)!.praca.zaSiatke).toBe(true);
    sim.push({ t: 'zasiatke', ids: [], osoba: a.person, on: true });
    sim.step();
    expect(snapshot(sim.st, demoWorld('przymorze')).people.every((p) => p.praca.zaSiatke)).toBe(true);
  });
});

describe('teksty o wartości domyślnej', () => {
  const widok = (zombie: boolean) => {
    const sim = newGame('przymorze', zombie ? 'zombie' : 'zwykly', 5);
    return widokPracy(snapshot(sim.st, demoWorld('przymorze')), { kol: null, zlecen: 0, touch: false });
  };

  it('dymek przełącznika mówi po polsku i po angielsku: włączony w trybie zwykłym, wyłączony w zombie', () => {
    expect(ZA_SIATKE_OPIS.pl).toContain('Domyślnie włączone w trybie zwykłym');
    expect(ZA_SIATKE_OPIS.pl).toContain('wyłączone w trybie zombie');
    expect(ZA_SIATKE_OPIS.en).toContain('On by default in normal mode');
    expect(ZA_SIATKE_OPIS.en).toContain('off in zombie mode');
    expect(polskieSlowa(ZA_SIATKE_OPIS.en, [])).toEqual([]);
  });

  it('lead panelu Pracy: tryb zwykły mówi „domyślnie włączona”, zombie „domyślnie wyłączona”', () => {
    expect(pracaPanelHtml(widok(false), false)).toContain('(domyślnie włączona)');
    expect(pracaPanelHtml(widok(true), false)).toContain('(domyślnie wyłączona)');
    ustawJezyk('en');
    const zwykly = pracaPanelHtml(widok(false), true);
    const zombie = pracaPanelHtml(widok(true), true);
    expect(zwykly).toContain('(on by default)');
    expect(zombie).toContain('(off by default)');
    expect(polskieSlowa(zwykly, ['Anna', 'Marek', 'Krysia'])).toEqual([]);
  });

  it('Pomoc: zdanie o przełączniku na karcie osoby zna obie wartości domyślne, po polsku i po angielsku', () => {
    const pl = helpSheet(false).body;
    expect(pl).toContain('W trybie zwykłym to pozwolenie jest domyślnie włączone, w trybie zombie wyłączone.');
    ustawJezyk('en');
    const en = helpSheet(false).body;
    expect(en).toContain('In normal mode this is on by default, in zombie mode it is off.');
  });
});
