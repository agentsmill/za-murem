/* Karta nocy: pod każdą listą wyboru stoi ukryta linia `.pick-full` z pełnym tekstem wybranej opcji. Zamknięta lista wyboru
   na telefonie ucina długie opcje („Warta przy dziurze od południowego wschodu, obr…”), a okno (src/ui/okno.ts) pokazuje tę linię,
   gdy tekst się nie mieści; tu sprawdza się markup, który rysuje `nightSheet` (czysta funkcja, bez DOM), a to, kiedy linię widać,
   mierzy scenariusz `uklad-karta-nocy-wybor-*` w Chromium (`npm run shots`). */

import { describe, expect, it } from 'vitest';
import { tx } from '../../src/core/jezyk.ts';
import type { NightCard, NightCardPerson, NightOption } from '../../src/gov/typy.ts';
import { nightSheet, optionShort } from '../../src/ui/okna.ts';
import { esc } from '../../src/ui/tekst.ts';

const opcje = (): NightOption[] => [
  { key: 'sen', label: tx('Śpi', 'Sleeps'), ok: true },
  {
    key: 'warta:d3',
    label: tx('Warta przy dziurze od południowego wschodu', 'Watch at the hole on the south-east side'),
    ok: true,
    guard: 4.7,
  },
  { key: 'warta:brama', label: tx('Warta przy bramie', 'Watch at the gate'), ok: true, guard: 2.1 },
];

const osoba = (id: string, name: string, proposal: string): NightCardPerson => ({
  id,
  name,
  needs: { food: 60, warm: 60, rest: 62, health: 100, safe: 60, mood: 60 },
  proposal,
  options: opcje(),
});

const karta = (): NightCard => ({
  day: 1,
  chance: 0.4,
  chanceWord: tx('średnia', 'medium'),
  forecast: tx('', ''),
  posts: [{ key: 'warta:d3', name: tx('przy dziurze', 'at the hole'), weak: 1 }],
  loss: { wood: 0, supplies: 5 },
  people: [osoba('a', 'Maksym Jakubowski', 'sen'), osoba('b', 'Marlena Lubińska', 'warta:d3')],
  advice: tx('', ''),
});

describe('karta nocy: pełny tekst wybranej opcji pod listą wyboru', () => {
  it('po każdej liście stoi ukryta linia z tekstem wybranej opcji, przed linią ze skutkiem wyboru', () => {
    const c = karta();
    const assign = { a: 'sen', b: 'warta:d3' };
    const html = nightSheet(c, assign, { chance: 0.4, now: 0.3, watchers: 1 }).body;
    // dwie osoby, dwie listy, dwie linie
    expect(html.match(/<select class="pick"/g)).toHaveLength(2);
    expect(html.match(/<p class="pick-full"/g)).toHaveLength(2);
    // linia stoi zaraz po liście i przed linią `opt` ze skutkiem, jest ukryta (pokazuje ją dopiero okno, gdy tekst się nie mieści)
    // i nie jest czytana przez czytniki ekranu (lista ma własną etykietę)
    const wzor =
      /<\/select><p class="pick-full" aria-hidden="true" hidden>([^<]*)<\/p><p class="opt" data-for="(\w+)">/g;
    const linie = [...html.matchAll(wzor)].map((m) => ({ tekst: m[1], id: m[2] }));
    expect(linie.map((l) => l.id)).toEqual(['a', 'b']);
    // tekst linii to dokładnie to, co lista pokazuje po zamknięciu: etykieta, obrona i „propozycja”
    const proponowana = optionShort(c.people[1].options[1], true);
    expect(proponowana).toContain('obrona 4,7');
    expect(proponowana).toContain('propozycja');
    expect(linie[0].tekst).toBe(esc(optionShort(c.people[0].options[0], true)));
    expect(linie[1].tekst).toBe(esc(proponowana));
  });

  it('po zmianie przydziału linia dostaje tekst nowo wybranej opcji (bez „propozycji”, bo to nie ona)', () => {
    const c = karta();
    const html = nightSheet(c, { a: 'warta:brama', b: 'warta:d3' }, { chance: 0.4, now: 0.3, watchers: 2 }).body;
    const wzor = /<p class="pick-full" aria-hidden="true" hidden>([^<]*)<\/p><p class="opt" data-for="a">/;
    const tekst = wzor.exec(html)?.[1];
    expect(tekst).toBe(esc(optionShort(c.people[0].options[2], false)));
    expect(tekst).toContain('obrona 2,1');
    expect(tekst).not.toContain('propozycja');
  });
});
