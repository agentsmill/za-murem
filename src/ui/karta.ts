/* Karta osoby z zarządu: paski potrzeb, chwilowe nastroje z powodami, co teraz robi i co ma tej nocy.
   Zwraca HTML z odczytu symulacji (SimPerson), bez DOM, więc da się go sprawdzić w Node. */

import { DOM, type Dom, TRAITS } from '../content/data.ts';
import { wiek } from '../content/people.ts';
import { TICKS_PER_HOUR } from '../sim/clock.ts';
import { NEED_LABELS, type Needs } from '../sim/needs.ts';
import type { SimPerson } from '../sim/snapshot.ts';
import { esc, signed } from './tekst.ts';

export const NEED_ORDER: readonly (keyof Needs)[] = ['food', 'warm', 'rest', 'health', 'safe', 'mood'];

/** poziom paska: źle poniżej 25, uwaga poniżej 50 */
export const needLevel = (v: number): 'bad' | 'mid' | 'ok' => (v < 25 ? 'bad' : v < 50 ? 'mid' : 'ok');

export function personCard(p: SimPerson, tick: number, tonight?: string): string {
  const skills = Object.entries(p.skills)
    .map(([d, v]) => `<span class="tag skill">${DOM[d as Dom]} ${v}</span>`)
    .join('');
  const traits = p.traits
    .map((t) => `<span class="tag" title="${esc(TRAITS[t]?.desc ?? '')}">${esc(TRAITS[t]?.name ?? t)}</span>`)
    .join('');
  const bars = NEED_ORDER.map((k) => {
    const v = Math.round(p.needs[k]);
    return `<div class="need ${needLevel(v)}"><span class="need-k">${NEED_LABELS[k]}</span><i class="need-bar" style="--v:${v}%"></i><b class="need-v">${v}</b></div>`;
  }).join('');
  const moods = p.moods
    .filter((m) => m.until > tick)
    .sort((a, b) => a.d - b.d)
    .map((m) => {
      const h = Math.ceil((m.until - tick) / TICKS_PER_HOUR);
      return `<li class="mood ${m.d < 0 ? 'neg' : 'pos'}" title="jeszcze ${h} h"><span>${esc(m.why)}</span><b class="mood-v">${signed(m.d, 0)}</b></li>`;
    })
    .join('');
  return [
    `<h2>${esc(p.name)}</h2>`,
    `<p class="sub">${esc(p.prof)}, ${wiek(p.age)}</p>`,
    `<div class="tags">${skills}${traits}</div>`,
    `<div class="needs">${bars}</div>`,
    moods ? `<ul class="moods">${moods}</ul>` : '',
    tonight ? `<p class="tonight">${esc(tonight)}</p>` : '',
    `<p class="doing">${esc(p.doing)}</p>`,
  ].join('');
}

/** kilka osób naraz: imiona i podpowiedź */
export function groupCard(names: string[], touch: boolean): string {
  return `<h2>Zaznaczeni: ${names.length}</h2><p class="sub">${names.map(esc).join(', ')}</p><p class="doing">${
    touch ? 'Stuknięcie w miejsce: polecenie dla wszystkich.' : 'Prawy przycisk: polecenie dla wszystkich.'
  }</p>`;
}
