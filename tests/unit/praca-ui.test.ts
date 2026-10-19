/* Panel Pracy i praca na karcie osoby w interfejsie (src/ui/praca.ts, src/ui/karta.ts): treść panelu to czysty HTML
   z widoku pracy (wiersz na osobę, kolumny w kolejności RODZAJE, cyfra priorytetu albo pusta komórka, progi z plusem
   i minusem po 5, nagłówki do kliknięcia), cykl priorytetu 1 → 2 → 3 → 4 → 0 → 1, polecenia czekające nałożone na
   widok (gra na pauzie), widok z odczytu symulacji i wiersze karty (stałe zajęcie, „za siatkę”, dopisek „(sam)”).
   Wszystko w Node bez DOM; wygląd ocenia się w Chromium (`npm run shots -- praca`). */

import { afterEach, describe, expect, it } from 'vitest';
import { ustawJezyk } from '../../src/core/jezyk.ts';
import { PROGI_DOMYSLNE, type Priorytet, RODZAJE, type RodzajPracy } from '../../src/sim/praca.ts';
import { createSim, Sim } from '../../src/sim/sim.ts';
import { type SimPerson, snapshot } from '../../src/sim/snapshot.ts';
import { personCard } from '../../src/ui/karta.ts';
import {
  KROK_PROGU,
  nalozPolecenia,
  nastepnyPriorytet,
  nazwaRodzaju,
  opisRodzaju,
  PROG_MAX,
  pracaPanelHtml,
  type WidokPracy,
  type WierszPracy,
  widokPracy,
} from '../../src/ui/praca.ts';
import { polskieSlowa } from './po-angielsku.ts';
import { demoWorld } from './sasiedzi-pomoc.ts';

afterEach(() => ustawJezyk('pl'));

const prio = (...p: Priorytet[]): Priorytet[] => {
  const out: Priorytet[] = [1, 2, 3, 3, 2, 3, 3, 3, 0];
  p.forEach((v, k) => {
    out[k] = v;
  });
  return out;
};

const wiersz = (osoba: number, imie: string, extra: Partial<WierszPracy> = {}): WierszPracy => ({
  osoba,
  imie,
  zawod: 'Hydraulik',
  prio: prio(),
  stale: null,
  zaSiatke: false,
  ...extra,
});

const WIDOCZNE: RodzajPracy[] = RODZAJE.filter((r) => r !== 'badania');

const widok = (extra: Partial<WidokPracy> = {}): WidokPracy => ({
  wiersze: [
    wiersz(0, 'Anna', { prio: prio(1, 2, 3, 0, 4), stale: 'budowa' }),
    wiersz(1, 'Marek', { zawod: 'Emerytowany inżynier', zaSiatke: true }),
    wiersz(2, 'Krysia', { prio: prio(1, 1, 1, 1, 1, 1, 1, 1, 0), zawod: 'emerytka' }),
  ],
  widoczne: WIDOCZNE,
  progi: { ...PROGI_DOMYSLNE },
  zombie: false,
  touch: false,
  kol: null,
  zlecen: 0,
  ...extra,
});

/** wartość atrybutu pierwszego elementu z danym znacznikiem (np. `data-prio="0:ogien"`) i jego treść */
function komorka(html: string, atrybut: string): { attrs: string; tekst: string } | null {
  const m = new RegExp(`<button[^>]*${atrybut.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^>]*>(.*?)</button>`, 's').exec(
    html,
  );
  if (!m) return null;
  return { attrs: m[0].slice(0, m[0].indexOf('>')), tekst: m[1].replace(/<[^>]*>/g, '').trim() };
}

describe('panel Pracy: treść', () => {
  it('panel: wiersz na osobę, kolumny w kolejności RODZAJE, cyfry i puste komórki', () => {
    const html = pracaPanelHtml(widok(), false);
    // wiersz na osobę, w kolejności z widoku
    const wiersze = [...html.matchAll(/<tr[^>]*data-osoba="(\d+)"/g)].map((m) => Number(m[1]));
    expect(wiersze).toEqual([0, 1, 2]);
    // nagłówki kolumn w kolejności RODZAJE (bez ukrytych badań)
    const kolumny = [...html.matchAll(/data-kol="(\w+)"/g)].map((m) => m[1]);
    expect(kolumny).toEqual(WIDOCZNE);
    // w każdym wierszu komórki w tej samej kolejności
    for (const o of [0, 1, 2]) {
      const komorki = [...html.matchAll(new RegExp(`data-prio="${o}:(\\w+)"`, 'g'))].map((m) => m[1]);
      expect(komorki, `osoba ${o}`).toEqual(WIDOCZNE);
    }
    // cyfry i puste komórki (priorytet 0 to pusta treść)
    expect(komorka(html, 'data-prio="0:ogien"')!.tekst).toBe('1');
    expect(komorka(html, 'data-prio="0:kuchnia"')!.tekst).toBe('2');
    expect(komorka(html, 'data-prio="0:budowa"')!.tekst).toBe('3');
    expect(komorka(html, 'data-prio="0:naprawy"')!.tekst).toBe('');
    expect(komorka(html, 'data-prio="0:drwal"')!.tekst).toBe('4');
    expect(komorka(html, 'data-prio="2:szaber"')!.tekst).toBe('1');
    // imiona, zawód i przełącznik „za siatkę” w wierszu osoby
    for (const imie of ['Anna', 'Marek', 'Krysia']) expect(html).toContain(imie);
    expect(html).toContain('Hydraulik');
    expect(komorka(html, 'data-zasiatke="1"')!.attrs).toContain('aria-pressed="true"');
    expect(komorka(html, 'data-zasiatke="0"')!.attrs).toContain('aria-pressed="false"');
  });

  it('stałe zajęcie jest oznaczone w komórce tej osoby i tylko tam', () => {
    const html = pracaPanelHtml(widok(), false);
    const stale = [...html.matchAll(/<button[^>]*class="[^"]*\bstale\b[^"]*"[^>]*data-prio="([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(stale).toEqual(['0:budowa']);
    expect(pracaPanelHtml(widok({ wiersze: [wiersz(3, 'Jan')] }), false)).not.toMatch(/\bstale\b/);
  });

  it('nazwa osoby w komórce i w etykiecie dla czytnika; imię z HTML jest zabezpieczone', () => {
    const html = pracaPanelHtml(widok({ wiersze: [wiersz(0, '<b>Zły</b>')] }), false);
    expect(html).not.toContain('<b>Zły</b>');
    expect(html).toContain('&lt;b&gt;Zły&lt;/b&gt;');
    const c = komorka(pracaPanelHtml(widok(), false), 'data-prio="0:drwal"')!;
    expect(c.attrs).toContain('aria-label="Anna, Drwal: 4"');
    expect(komorka(pracaPanelHtml(widok(), false), 'data-prio="0:naprawy"')!.attrs).toContain(
      'aria-label="Anna, Naprawy: nie robi"',
    );
  });

  it('Badania ukryte, gdy nie ma ich w widoczne; widoczne tworzą kolumnę z komórkami', () => {
    const bez = pracaPanelHtml(widok(), false);
    expect(bez).not.toContain('data-kol="badania"');
    expect(bez).not.toContain(':badania"');
    const z = pracaPanelHtml(widok({ widoczne: [...RODZAJE] }), false);
    expect(z).toContain('data-kol="badania"');
    expect(z).toContain('data-prio="0:badania"');
    expect([...z.matchAll(/data-kol="(\w+)"/g)].map((m) => m[1])).toEqual([...RODZAJE]);
  });

  it('progi: minus, liczba i plus po 5 dla drewna, desek i części; dzidy tylko w trybie zombie', () => {
    const html = pracaPanelHtml(widok(), false);
    for (const co of ['drewno', 'deski', 'czesci'] as const) {
      expect(html, co).toContain(`data-prog="${co}:-${KROK_PROGU}"`);
      expect(html, co).toContain(`data-prog="${co}:+${KROK_PROGU}"`);
      expect(html, co).toContain(`data-wart="${co}"`);
    }
    expect(KROK_PROGU).toBe(5);
    expect(html).not.toContain('data-prog="dzidy');
    expect(html).not.toContain('data-wart="dzidy"');
    expect(/data-wart="drewno"[^>]*>30</.test(html)).toBe(true);
    expect(/data-wart="deski"[^>]*>20</.test(html)).toBe(true);
    expect(/data-wart="czesci"[^>]*>10</.test(html)).toBe(true);
    const zombie = pracaPanelHtml(widok({ zombie: true, progi: { ...PROGI_DOMYSLNE, dzidy: 12 } }), false);
    expect(zombie).toContain('data-prog="dzidy:-5"');
    expect(zombie).toContain('data-prog="dzidy:+5"');
    expect(/data-wart="dzidy"[^>]*>12</.test(zombie)).toBe(true);
  });

  it('progi: minus przy 0 i plus przy maksimum są wyłączone', () => {
    const zero = pracaPanelHtml(widok({ progi: { drewno: 0, deski: 20, czesci: PROG_MAX, dzidy: 0 } }), false);
    expect(komorka(zero, 'data-prog="drewno:-5"')!.attrs).toContain('disabled');
    expect(komorka(zero, 'data-prog="drewno:+5"')!.attrs).not.toContain('disabled');
    expect(komorka(zero, 'data-prog="czesci:+5"')!.attrs).toContain('disabled');
    expect(komorka(zero, 'data-prog="czesci:-5"')!.attrs).not.toContain('disabled');
  });

  it('nagłówek wybranej kolumny pokazuje, ile zleceń czeka; bez wyboru jest podpowiedź', () => {
    const wybrana = pracaPanelHtml(widok({ kol: 'drwal', zlecen: 7 }), false);
    const naglowek = komorka(wybrana, 'data-kol="drwal"')!;
    expect(naglowek.attrs).toContain('aria-pressed="true"');
    expect(naglowek.tekst).toContain('7');
    expect(komorka(wybrana, 'data-kol="ogien"')!.attrs).toContain('aria-pressed="false"');
    expect(komorka(wybrana, 'data-kol="ogien"')!.tekst).not.toMatch(/\d/);
    expect(wybrana).toContain('class="pr-info"');
    expect(wybrana).toContain('Drwal');
    expect(wybrana).toContain(opisRodzaju('drwal', false));
    // bez wyboru: podpowiedź, bez liczby
    const bez = pracaPanelHtml(widok(), false);
    expect(bez).toContain('class="pr-info"');
    expect(bez).toMatch(/Kliknij nazwę/);
    expect(pracaPanelHtml(widok({ touch: true }), false)).toMatch(/Stuknij nazwę/);
  });

  it('panel po angielsku bez polskich słów (poza imionami)', () => {
    const v = widok({
      zombie: true,
      kol: 'szaber',
      zlecen: 2,
      widoczne: [...RODZAJE],
      progi: { ...PROGI_DOMYSLNE, dzidy: 12 },
    });
    for (const touch of [false, true]) {
      const html = pracaPanelHtml({ ...v, touch }, true);
      expect(polskieSlowa(html, ['Anna', 'Marek', 'Krysia']), `touch ${touch}`).toEqual([]);
      // także dymki i etykiety dla czytnika ekranu, które siedzą w atrybutach
      const atrybuty = [...html.matchAll(/(?:title|aria-label)="([^"]*)"/g)].map((m) => m[1]).join(' | ');
      expect(atrybuty.length).toBeGreaterThan(100);
      expect(polskieSlowa(atrybuty, ['Anna', 'Marek', 'Krysia']), `atrybuty, touch ${touch}`).toEqual([]);
      expect(html).toContain('Woodcutting');
      expect(html).toContain('Scavenging');
      expect(html).toContain('Hauling');
      expect(html).toContain('Keep in stock');
      expect(html).toContain('Retired engineer');
      expect(html).toContain('Plumber');
      expect(html).not.toContain('inżynier');
    }
    // wszystkie nazwy rodzajów po angielsku według słowniczka
    expect(RODZAJE.map((r) => nazwaRodzaju(r, true))).toEqual([
      'Fire',
      'Kitchen',
      'Build',
      'Repair',
      'Woodcutting',
      'Hauling',
      'Workshop',
      'Scavenging',
      'Research',
    ]);
    expect(RODZAJE.map((r) => nazwaRodzaju(r, false))).toEqual([
      'Ogień',
      'Kuchnia',
      'Budowa',
      'Naprawy',
      'Drwal',
      'Noszenie',
      'Warsztat',
      'Szaber',
      'Badania',
    ]);
    for (const r of RODZAJE) expect(polskieSlowa(opisRodzaju(r, true)), r).toEqual([]);
  });

  it('po polsku nie zostaje angielski; nic nie wisi bez opisu', () => {
    const html = pracaPanelHtml(
      widok({ zombie: true, widoczne: [...RODZAJE], progi: { ...PROGI_DOMYSLNE, dzidy: 12 } }),
      false,
    );
    expect(html).toContain('Trzymać w zapasie');
    expect(html).not.toMatch(/Keep in stock|Woodcutting|Scavenging|Hauling/);
    for (const r of RODZAJE) {
      expect(opisRodzaju(r, false).length, r).toBeGreaterThan(10);
      expect(opisRodzaju(r, true).length, r).toBeGreaterThan(10);
    }
  });

  it('pusty zarząd: komunikat zamiast pustej tabeli', () => {
    const html = pracaPanelHtml(widok({ wiersze: [] }), false);
    expect(html).not.toContain('<table');
    expect(html).toContain('Nikogo');
  });
});

describe('panel Pracy: cykl priorytetu i polecenia czekające', () => {
  it('klik: 1 → 2 → 3 → 4 → 0 → 1, prawy przycisk w drugą stronę', () => {
    const wprzod: Priorytet[] = [];
    let p: Priorytet = 1;
    for (let k = 0; k < 5; k++) {
      p = nastepnyPriorytet(p);
      wprzod.push(p);
    }
    expect(wprzod).toEqual([2, 3, 4, 0, 1]);
    const wstecz: Priorytet[] = [];
    p = 1;
    for (let k = 0; k < 5; k++) {
      p = nastepnyPriorytet(p, true);
      wstecz.push(p);
    }
    expect(wstecz).toEqual([0, 4, 3, 2, 1]);
  });

  it('polecenia czekające w kolejce są widoczne od razu (gra na pauzie), reszta widoku bez zmian', () => {
    const v = widok();
    const po = nalozPolecenia(v, [
      { t: 'prio', ids: [], osoba: 0, rodzaj: 'ogien', prio: 3 },
      { t: 'prio', ids: [], osoba: 0, rodzaj: 'ogien', prio: 0 },
      { t: 'stale', ids: [], osoba: 1, rodzaj: 'szaber' },
      { t: 'stale', ids: [], osoba: 0, rodzaj: null },
      { t: 'zasiatke', ids: [], osoba: 2, on: true },
      { t: 'zasiatke', ids: [], osoba: 1, on: false },
      { t: 'prog', ids: [], co: 'drewno', n: 45 },
      { t: 'build', ids: [], kind: 'ogrodek', x: 1, y: 1, rot: 0 },
    ]);
    expect(po.wiersze[0].prio[0]).toBe(0);
    expect(po.wiersze[0].stale).toBeNull();
    expect(po.wiersze[1].stale).toBe('szaber');
    expect(po.wiersze[1].zaSiatke).toBe(false);
    expect(po.wiersze[2].zaSiatke).toBe(true);
    expect(po.progi.drewno).toBe(45);
    expect(po.progi.deski).toBe(20);
    // wejście nie jest zmieniane
    expect(v.wiersze[0].prio[0]).toBe(1);
    expect(v.progi.drewno).toBe(30);
    // bez poleceń ten sam widok
    expect(nalozPolecenia(v, [])).toEqual(v);
    // polecenia dla kogoś spoza tabeli i złe dane nic nie psują
    const zle = nalozPolecenia(v, [
      { t: 'prio', ids: [], osoba: 99, rodzaj: 'ogien', prio: 2 },
      { t: 'prio', ids: [], osoba: 0, rodzaj: 'ogien', prio: 9 as Priorytet },
      { t: 'prog', ids: [], co: 'drewno', n: Number.NaN },
    ]);
    expect(zle).toEqual(v);
    // próg poza zakresem jak w symulacji
    expect(nalozPolecenia(v, [{ t: 'prog', ids: [], co: 'deski', n: 5000 }]).progi.deski).toBe(PROG_MAX);
    expect(nalozPolecenia(v, [{ t: 'prog', ids: [], co: 'deski', n: -3 }]).progi.deski).toBe(0);
  });
});

describe('widok pracy z odczytu symulacji', () => {
  it('wiersze zarządu po numerze osoby, progi i widoczne z odczytu, liczba zleceń wybranej kolumny', () => {
    const w = demoWorld('lanciego');
    const sim = new Sim(w, createSim(w, 5, { core: 4, mode: 'zwykly' }));
    sim.push({ t: 'prio', ids: [], osoba: 1, rodzaj: 'drwal', prio: 0 });
    sim.push({ t: 'stale', ids: [], osoba: 2, rodzaj: 'szaber' });
    sim.push({ t: 'zasiatke', ids: [], osoba: 3, on: true });
    sim.push({ t: 'prog', ids: [], co: 'deski', n: 35 });
    sim.step();
    const snap = snapshot(sim.st, w);
    const v = widokPracy(snap, { kol: 'drwal', zlecen: sim.ileZlecen('drwal'), touch: true });
    expect(v.wiersze.map((x) => x.osoba)).toEqual(snap.people.map((p) => p.osoba).sort((a, b) => a - b));
    expect(v.wiersze).toHaveLength(4);
    expect(v.wiersze[1].prio[RODZAJE.indexOf('drwal')]).toBe(0);
    expect(v.wiersze[2].stale).toBe('szaber');
    expect(v.wiersze[3].zaSiatke).toBe(true);
    expect(v.wiersze[0].imie).toBe(snap.people.find((p) => p.osoba === 0)!.first);
    expect(v.progi).toEqual(snap.praca.progi);
    expect(v.progi.deski).toBe(35);
    expect(v.widoczne).toEqual(snap.praca.widoczne);
    expect(v.widoczne).not.toContain('badania');
    expect(v.zombie).toBe(false);
    expect(v.touch).toBe(true);
    expect(v.kol).toBe('drwal');
    expect(v.zlecen).toBe(sim.ileZlecen('drwal'));
    // gra w trybie zombie pokazuje dzidy z domyślnym progiem 12
    const z = new Sim(w, createSim(w, 5, { core: 4, mode: 'zombie' }));
    const zv = widokPracy(snapshot(z.st, w), { kol: null, zlecen: 0, touch: false });
    expect(zv.zombie).toBe(true);
    expect(zv.progi.dzidy).toBe(12);
    // panel z takiego widoku jest pełny: cztery wiersze i wszystkie widoczne kolumny
    const html = pracaPanelHtml(v, false);
    expect([...html.matchAll(/<tr[^>]*data-osoba=/g)]).toHaveLength(4);
    expect(html).toContain('data-prog="deski:+5"');
    expect(/data-wart="deski"[^>]*>35</.test(html)).toBe(true);
  });
});

/* ---------- karta osoby ---------- */

const osoba = (extra: Partial<SimPerson> = {}): SimPerson => ({
  pawn: 3,
  osoba: 4,
  id: 's5',
  name: 'Anna Kowalska',
  first: 'Anna',
  f: true,
  age: 52,
  prof: 'emerytka',
  skills: { med: 2 },
  traits: ['lubiany'],
  needs: { food: 70, warm: 60, rest: 70, health: 100, safe: 60, mood: 65 },
  moods: [],
  job: null,
  sam: false,
  praca: { prio: [1, 3, 3, 3, 3, 3, 3, 3, 0], stale: null, zaSiatke: false },
  doing: 'Stoi.',
  asleep: false,
  inside: false,
  tile: 0,
  carry: 0,
  away: false,
  post: null,
  weapon: null,
  ammo: null,
  bite: null,
  maimed: false,
  ...extra,
});

describe('karta osoby: praca', () => {
  it('karta: wybór stałego zajęcia i przełącznik „za siatkę”', () => {
    const html = personCard(osoba({ praca: { prio: prio(), stale: 'drwal', zaSiatke: true } }), 0, undefined, false, {
      widoczne: WIDOCZNE,
    });
    expect(html).toContain('data-card="stale"');
    expect(html).toContain('data-card="zasiatke"');
    // opcje: brak i każdy widoczny rodzaj, wybrany zaznaczony
    const opcje = [...html.matchAll(/<option value="([^"]*)"( selected)?>/g)].map((m) => [m[1], !!m[2]]);
    expect(opcje.map((o) => o[0])).toEqual(['', ...WIDOCZNE]);
    expect(opcje.filter((o) => o[1]).map((o) => o[0])).toEqual(['drwal']);
    expect(html).toContain('Stałe zajęcie');
    expect(html).toMatch(/data-card="zasiatke"[^>]*aria-pressed="true"/);
    expect(html).toContain('Może wychodzić za siatkę');
    // bez stałego zajęcia zaznaczone jest „brak”, przełącznik nie wciśnięty
    const bez = personCard(osoba(), 0, undefined, false, { widoczne: WIDOCZNE });
    expect([...bez.matchAll(/<option value="([^"]*)" selected>/g)].map((m) => m[1])).toEqual(['']);
    expect(bez).toMatch(/data-card="zasiatke"[^>]*aria-pressed="false"/);
    // bez listy widocznych karta nie pokazuje badań, których gra jeszcze nie ma
    const domyslnie = personCard(osoba(), 0);
    expect(domyslnie).toContain('<option value="drwal"');
    expect(domyslnie).not.toContain('<option value="badania"');
    // z badaniami w widocznych jest też ten rodzaj
    expect(personCard(osoba(), 0, undefined, false, { widoczne: [...RODZAJE] })).toContain('<option value="badania"');
  });

  it('karta po angielsku: stałe zajęcie i przełącznik bez polskich słów', () => {
    ustawJezyk('en');
    const html = personCard(osoba({ praca: { prio: prio(), stale: 'szaber', zaSiatke: false } }), 0, undefined, false, {
      widoczne: [...RODZAJE],
      zombie: true,
    });
    expect(html).toContain('Fixed job');
    expect(html).toContain('Can go outside the fence');
    expect(html).toContain('<option value="szaber" selected>Scavenging</option>');
    expect(polskieSlowa(html, ['Anna', 'Kowalska', 'emerytka'])).toEqual([]);
  });

  it('w trybie zombie karta ostrzega jednym zdaniem, że za siatką są szwendacze', () => {
    const zwykly = personCard(osoba(), 0, undefined, false, { widoczne: WIDOCZNE });
    expect(zwykly).not.toContain('szwendacz');
    const zombie = personCard(osoba(), 0, undefined, false, { widoczne: WIDOCZNE, zombie: true });
    expect(zombie.match(/class="pk-warn"/g)).toHaveLength(1);
    expect(zombie).toContain('szwendacz');
    ustawJezyk('en');
    const en = personCard(osoba(), 0, undefined, false, { widoczne: WIDOCZNE, zombie: true });
    expect(en).toMatch(/[Ss]hamblers outside the fence/);
    expect(en.match(/class="pk-warn"/g)).toHaveLength(1);
  });

  it('karta mieszkańca (tylko do odczytu) nie ma ustawień pracy', () => {
    const html = personCard(osoba(), 0, undefined, false, { lokator: true, widoczne: WIDOCZNE });
    expect(html).not.toContain('data-card="stale"');
    expect(html).not.toContain('data-card="zasiatke"');
  });

  it('dopisek „(sam)”, „(sama)” i „(on own)” przy pracy wziętej bez polecenia', () => {
    const sam = (extra: Partial<SimPerson>) => personCard(osoba({ sam: true, doing: 'Rąbie drzewo.', ...extra }), 0);
    expect(sam({ f: false })).toContain('Rąbie drzewo. <span class="sam">(sam)</span>');
    expect(sam({ f: true })).toContain('Rąbie drzewo. <span class="sam">(sama)</span>');
    // polecenie gracza: bez dopisku
    expect(personCard(osoba({ sam: false, doing: 'Rąbie drzewo.' }), 0)).not.toContain('(sam');
    expect(personCard(osoba({ sam: false, doing: 'Rąbie drzewo.' }), 0)).toContain(
      '<p class="doing">Rąbie drzewo.</p>',
    );
    ustawJezyk('en');
    expect(sam({ f: true, doing: 'Chopping a tree.' })).toContain('Chopping a tree. <span class="sam">(on own)</span>');
    expect(sam({ f: false, doing: 'Chopping a tree.' })).toContain('<span class="sam">(on own)</span>');
  });

  it('karta mieszkańca nie ma dopisku „(sam)”: mieszkańcy nie dostają rozkazów', () => {
    const html = personCard(osoba({ sam: true, job: 'stay', doing: 'Stoi na podwórku.' }), 0, undefined, false, {
      lokator: true,
    });
    expect(html).toContain('<p class="doing">Stoi na podwórku.</p>');
    expect(html).not.toContain('(sam');
  });

  it('sen, posiłek i grzanie się nie dostają dopisku, choć gra zaczęła je sama', () => {
    for (const job of ['sleep', 'eat', 'warm'] as const)
      expect(personCard(osoba({ sam: true, job, doing: 'Śpi.' }), 0), job).not.toContain('(sam');
    expect(personCard(osoba({ sam: true, job: 'chop', doing: 'Rąbie drzewo.' }), 0)).toContain('(sama)');
  });
});
