/* Karta osoby z zarządu: paski potrzeb, chwilowe nastroje z powodami, co teraz robi i co ma tej nocy, a dla osoby
   z własnej drużyny historia pod zawodem (jedna linijka, cała po kliknięciu; stan rozwinięcia trzyma main.ts).
   Zwraca HTML z odczytu symulacji (SimPerson), bez DOM, więc da się go sprawdzić w Node. */

import { DOM, type Dom, TRAITS } from '../content/data.ts';
import { nazwaCechy } from '../content/druzyna.ts';
import { wiek } from '../content/people.ts';
import { WEAPONS } from '../sim/bron.ts';
import { TICKS_PER_HOUR } from '../sim/clock.ts';
import { NEED_LABELS, type Needs } from '../sim/needs.ts';
import type { SimPerson } from '../sim/snapshot.ts';
import { esc, signed } from './tekst.ts';

export const NEED_ORDER: readonly (keyof Needs)[] = ['food', 'warm', 'rest', 'health', 'safe', 'mood'];

/** poziom paska: źle poniżej 25, uwaga poniżej 50 */
export const needLevel = (v: number): 'bad' | 'mid' | 'ok' => (v < 25 ? 'bad' : v < 50 ? 'mid' : 'ok');

/** liczba z odmianą: 1 nabój, 2 naboje, 5 naboi */
export function many(n: number, one: string, few: string, lots: string): string {
  const d = n % 10;
  const t = n % 100;
  return `${n} ${n === 1 ? one : d >= 2 && d <= 4 && (t < 12 || t > 14) ? few : lots}`;
}

const AMMO_WORDS: Record<string, [string, string, string]> = {
  naboje: ['nabój', 'naboje', 'naboi'],
  loftki: ['loftka', 'loftki', 'loftek'],
  belty: ['bełt', 'bełty', 'bełtów'],
};

/** broń z amunicją i przycisk zmiany; ugryzienie z czasem i amputacją, póki da się ją zrobić */
function armHtml(p: SimPerson, tick: number): string {
  const w = p.weapon ? WEAPONS[p.weapon] : WEAPONS.piesci;
  const ammo = w.ammo && p.ammo !== null ? ` (${many(p.ammo, ...AMMO_WORDS[w.ammo])})` : '';
  const arm = `<p class="arm">Broń: <b>${esc(w.name)}</b>${esc(ammo)} <button type="button" class="btn mini" data-card="arm">Zmień</button></p>`;
  if (!p.bite) return arm;
  const ago = Math.max(0, Math.floor(((tick - p.bite.at) * 60) / TICKS_PER_HOUR));
  const left = Math.max(0, Math.ceil(p.bite.left / TICKS_PER_HOUR));
  const who = p.f ? 'Ugryziona' : 'Ugryziony';
  const where = p.bite.limb ? ' w rękę' : '';
  const cut = p.bite.amputate
    ? ' <button type="button" class="btn mini bad" data-card="amputate" title="Ktoś z zarządu z medycyną utnie kończynę: pół godziny, nie zawsze się udaje">Amputować</button>'
    : '';
  return `${arm}<p class="bite">${who}${where} ${Math.floor(ago / 60)}:${String(ago % 60).padStart(2, '0')} temu. Gorączka zabije za ${left} h.${cut}</p>`;
}

/** historia osoby: przycisk z tekstem, zwinięty do jednej linijki albo rozwinięty */
export function storyHtml(story: string | undefined, open: boolean): string {
  if (!story) return '';
  const hint = open ? 'Zwiń historię' : 'Cała historia';
  return `<button type="button" class="story" data-card="story" aria-expanded="${open}" title="${hint}"><span class="story-t">${esc(story)}</span></button>`;
}

export function personCard(p: SimPerson, tick: number, tonight?: string, storyOpen = false): string {
  const skills = Object.entries(p.skills)
    .map(([d, v]) => `<span class="tag skill">${DOM[d as Dom]} ${v}</span>`)
    .join('');
  const traits = p.traits
    .map((t) => `<span class="tag" title="${esc(TRAITS[t]?.desc ?? '')}">${esc(nazwaCechy(t, p.f))}</span>`)
    .join('');
  const maimed = p.maimed ? '<span class="tag" title="Po amputacji: gorzej trafia">kikut</span>' : '';
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
    storyHtml(p.story, storyOpen),
    `<div class="tags">${skills}${traits}${maimed}</div>`,
    armHtml(p, tick),
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
