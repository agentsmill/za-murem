/* Karta osoby: paski potrzeb, chwilowe nastroje z powodami, co teraz robi i co ma tej nocy, a dla osoby z własnej
   drużyny albo z generatora mieszkańców historia pod zawodem (jedna linijka, cała po kliknięciu; stan rozwinięcia
   trzyma main.ts). Osoba z generatora (`ref`) ma jeszcze wiersz rodziny pod zawodem, napis, że mieszkańcy są
   wymyśleni, i przycisk zmiany imienia (`data-card="imie"`: main.ts otwiera w karcie edytor z src/ui/imiona.ts, także
   na karcie mieszkańca; w grze z sąsiadami przycisku nie ma, `opts.imie`). Karta mieszkańca (opts.lokator) jest tylko do odczytu: bez broni i amputacji, to rozkazy dla
   zarządu. Żadnego numeru mieszkania ani piętra w tekstach. Zwraca HTML z odczytu symulacji (SimPerson), bez DOM, więc
   da się go sprawdzić w Node.

   Praca ludzi (src/sim/praca.ts): pod opisem pracy karta zarządu ma wybór stałego zajęcia (`data-card="stale"`,
   lista rozwijana; main.ts słucha `change`) i przełącznik „może wychodzić za siatkę” (`data-card="zasiatke"`), a w trybie
   zombie jedno zdanie, że za siatką są szwendacze. Opis pracy wziętej bez polecenia dostaje dopisek „(sam)”, „(sama)”
   albo „(on own)”, żeby było widać, że to ustawienia z panelu Pracy, a nie rozkaz; snu, posiłku i grzania się nie
   oznaczamy, bo to nie praca. Karta mieszkańca (tylko do odczytu) nie ma ani ustawień, ani dopisku.

   Język: karta rysuje się w bieżącym języku (src/core/jezyk.ts). Polskie napisy ze stanu (zawód, cechy, powody
   nastrojów) to identyfikatory tłumaczone tutaj (zawodEn, TRAITS_EN, nastrojEn), opis pracy (`doing`) przychodzi już
   w bieżącym języku z jobText. Historia i rodzina z generatora są w stanie po polsku i tak zostają, chyba że
   `opts.en` poda ich angielską wersję; wiek po angielsku to sama liczba („Plumber, 52”). */

import { DOM_EN, TRAITS_EN, zawodEn } from '../content/data.en.ts';
import { DOM, type Dom, TRAITS } from '../content/data.ts';
import { nazwaCechy } from '../content/druzyna.ts';
import { nastrojEn } from '../content/nastroje.en.ts';
import { wiek } from '../content/people.ts';
import { jezyk, L, tr } from '../core/jezyk.ts';
import { BLOK, type Words, type WordsEn, wordsEn, wordsOf } from '../gov/miejsce.ts';
import { AMMO_EN, WEAPONS, WEAPONS_EN } from '../sim/bron.ts';
import { TICKS_PER_HOUR } from '../sim/clock.ts';
import { NEED_LABELS, NEED_LABELS_EN, type Needs } from '../sim/needs.ts';
import { RODZAJE, type RodzajPracy } from '../sim/praca.ts';
import type { SimPerson } from '../sim/snapshot.ts';
import { nazwaRodzaju, ZA_SIATKE_OPIS } from './praca.ts';
import { esc, manyEn, signed } from './tekst.ts';

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

/** ugryzienie z czasem; przycisk amputacji tylko wtedy, gdy karta pozwala na rozkazy i da się jeszcze uciąć */
function biteHtml(p: SimPerson, tick: number, orders: boolean, words: Words, e: WordsEn): string {
  if (!p.bite) return '';
  const ago = Math.max(0, Math.floor(((tick - p.bite.at) * 60) / TICKS_PER_HOUR));
  const left = Math.max(0, Math.ceil(p.bite.left / TICKS_PER_HOUR));
  const cut =
    orders && p.bite.amputate
      ? ` <button type="button" class="btn mini bad" data-card="amputate" title="${L(
          `Ktoś z ${words.zarzad.dk} z medycyną utnie kończynę: pół godziny, nie zawsze się udaje`,
          `Someone from ${e.krotko} with Medicine takes the limb off: half an hour, and it doesn’t always work`,
        )}">${L('Amputować', 'Amputate')}</button>`
      : '';
  if (jezyk() === 'en') {
    const h = Math.floor(ago / 60);
    const when = h ? `${h} h ${String(ago % 60).padStart(2, '0')} min` : `${ago} min`;
    return `<p class="bite">Bitten${p.bite.limb ? ' on the arm' : ''} ${when} ago. The fever will kill ${p.f ? 'her' : 'him'} in ${left} h.${cut}</p>`;
  }
  const who = p.f ? 'Ugryziona' : 'Ugryziony';
  const where = p.bite.limb ? ' w rękę' : '';
  return `<p class="bite">${who}${where} ${Math.floor(ago / 60)}:${String(ago % 60).padStart(2, '0')} temu. Gorączka zabije za ${left} h.${cut}</p>`;
}

/** broń z amunicją i przycisk zmiany; ugryzienie z czasem i amputacją, póki da się ją zrobić */
function armHtml(p: SimPerson, tick: number, words: Words, e: WordsEn): string {
  const w = p.weapon ? WEAPONS[p.weapon] : WEAPONS.piesci;
  const en = jezyk() === 'en';
  const name = en ? WEAPONS_EN[w.id].name : w.name;
  const ammo =
    w.ammo && p.ammo !== null
      ? ` (${en ? manyEn(p.ammo, AMMO_EN[w.ammo].one, AMMO_EN[w.ammo].other) : many(p.ammo, ...AMMO_WORDS[w.ammo])})`
      : '';
  const arm = `<p class="arm">${L('Broń:', 'Weapon:')} <b>${esc(name)}</b>${esc(ammo)} <button type="button" class="btn mini" data-card="arm">${L('Zmień', 'Swap')}</button></p>`;
  return arm + biteHtml(p, tick, true, words, e);
}

/** obecni krewni z generatora w jednej linijce (bez numerów mieszkań) */
function rodzinaHtml(rodzina: string | undefined): string {
  return rodzina
    ? `<p class="rodzina"><span class="rodzina-k">${L('Rodzina:', 'Family:')}</span> ${esc(rodzina)}</p>`
    : '';
}

/** Napis dla osób z generatora, że mieszkańcy są wymyśleni (RODO: widać go na każdej takiej karcie, także na telefonie,
    na zrzucie i w edytorze imienia z src/ui/imiona.ts). */
export const FIKCJA = 'Mieszkańcy są wymyśleni na podstawie danych GUS i PESEL.';
/** ten sam napis po angielsku (GUS to spis powszechny, PESEL to rejestr imion i nazwisk) */
export const FIKCJA_EN = 'Residents are invented, based on GUS census and PESEL name data.';

/** Napis o fikcji i przycisk własnego imienia (bez przycisku, gdy `imie` jest false). Osoby z losowania z adresu
    i z drużyny gracza nie mają żadnego z nich. */
function fikcjaHtml(p: SimPerson, imie: boolean): string {
  if (!p.ref) return '';
  const btn = imie
    ? `<button type="button" class="btn mini" data-card="imie" title="${L(
        'Własne imię tej osoby; zostaje tylko w tej przeglądarce',
        'A name of your own for this person; it stays in this browser only',
      )}">${L('Zmień imię', 'Rename')}</button>`
    : '';
  return `<div class="osoba-fikcja"><p class="fikcja">${L(FIKCJA, FIKCJA_EN)}</p>${btn}</div>`;
}

/** historia osoby: przycisk z tekstem, zwinięty do jednej linijki albo rozwinięty */
export function storyHtml(story: string | undefined, open: boolean): string {
  if (!story) return '';
  const hint = open ? L('Zwiń historię', 'Show less') : L('Cała historia', 'Whole story');
  return `<button type="button" class="story" data-card="story" aria-expanded="${open}" title="${hint}"><span class="story-t">${esc(story)}</span></button>`;
}

export interface CardOpts {
  /** mieszkaniec siedziby: karta tylko do odczytu, bez broni i amputacji (rozkazy dla zarządu) */
  lokator?: boolean;
  /** przycisk zmiany imienia osoby z generatora (domyślnie jest; false w grze z sąsiadami, `imionaWGrze`) */
  imie?: boolean;
  /** angielska wersja tekstów osoby z generatora (zawód, historia, rodzina) na kartę po angielsku; czego brak, to
      zawód przez zawodEn, a historia i rodzina ze stanu */
  en?: { prof?: string; story?: string; rodzina?: string };
  /** słowa miejsca po polsku i po angielsku (w domu komitet ulicy); bez nich jak w bloku */
  words?: Words;
  wordsEn?: WordsEn;
  /** rodzaje pracy, które w tej grze istnieją (opcje stałego zajęcia); bez tego wszystkie poza badaniami, których
      gra może jeszcze nie mieć */
  widoczne?: readonly RodzajPracy[];
  /** tryb zombie: pod przełącznikiem „za siatkę” jest ostrzeżenie o szwendaczach */
  zombie?: boolean;
}

/** prace, które pionek zaczyna sam, ale nie są pracą zarządu z panelu (sen, posiłek, grzanie się) i droga bez
    polecenia (schronienie, powrót z wyprawy, nowa osoba idzie do siedziby, pomocnicy przy poleceniu): bez dopisku;
    automat pracy nie zaczyna drogi `go`, jego łańcuchy prac mają własne rodzaje */
const BEZ_DOPISKA: ReadonlySet<string> = new Set(['sleep', 'eat', 'warm', 'go']);

/** opis pracy z dopiskiem „(sam)” / „(sama)” / „(on own)”, gdy osoba zarządu wzięła pracę bez polecenia gracza
    (`oznacz` fałszywe na karcie mieszkańca, który rozkazów nie dostaje, więc „sam” nic by tam nie mówiło) */
function doingHtml(p: SimPerson, en: boolean, oznacz: boolean): string {
  const dopisek =
    oznacz && p.sam && !(p.job && BEZ_DOPISKA.has(p.job))
      ? ` <span class="sam">${en ? '(on own)' : p.f ? '(sama)' : '(sam)'}</span>`
      : '';
  return `<p class="doing">${esc(p.doing)}${dopisek}</p>`;
}

/** Ustawienia pracy osoby zarządu: stałe zajęcie (osoba bierze zlecenia tego rodzaju przed wszystkimi innymi) i przełącznik
    „może wychodzić za siatkę”; w trybie zombie pod nim jedno zdanie o szwendaczach. */
export function pracaKartaHtml(p: SimPerson, o: { widoczne?: readonly RodzajPracy[]; zombie?: boolean } = {}): string {
  const en = jezyk() === 'en';
  const lista = o.widoczne ?? RODZAJE.filter((r) => r !== 'badania');
  const opcje = [
    `<option value=""${p.praca.stale ? '' : ' selected'}>${L('brak', 'none')}</option>`,
    ...lista.map(
      (r) => `<option value="${r}"${p.praca.stale === r ? ' selected' : ''}>${esc(nazwaRodzaju(r, en))}</option>`,
    ),
  ].join('');
  const opis = L(
    'Osoba bierze zlecenia tego rodzaju przed wszystkimi innymi, także gdy w panelu Pracy ma tam puste',
    'This person takes jobs of this kind before anything else, even if the Work panel has it blank',
  );
  const siatka = tr(ZA_SIATKE_OPIS);
  const ostrzezenie = o.zombie
    ? `<p class="pk-warn">${L(
        'Za siatką są szwendacze: ryzyko ugryzienia.',
        'Shamblers outside the fence: risk of a bite.',
      )}</p>`
    : '';
  return `<div class="pk"><label class="pk-row" title="${esc(opis)}"><span class="pk-k">${L('Stałe zajęcie', 'Fixed job')}</span><select class="pk-sel" data-card="stale">${opcje}</select></label><button type="button" class="btn mini pk-out" data-card="zasiatke" aria-pressed="${p.praca.zaSiatke}" title="${esc(
    siatka,
  )}">${L('Może wychodzić za siatkę', 'Can go outside the fence')}</button>${ostrzezenie}</div>`;
}

export function personCard(
  p: SimPerson,
  tick: number,
  tonight?: string,
  storyOpen = false,
  opts: CardOpts = {},
): string {
  const en = jezyk() === 'en';
  const words = opts.words ?? wordsOf(BLOK);
  const e = opts.wordsEn ?? wordsEn(BLOK);
  const skills = Object.entries(p.skills)
    .map(([d, v]) => `<span class="tag skill">${en ? (DOM_EN[d as Dom] ?? DOM[d as Dom]) : DOM[d as Dom]} ${v}</span>`)
    .join('');
  const traits = p.traits
    .map((t) => {
      const name = en ? (TRAITS_EN[t]?.name ?? nazwaCechy(t, p.f)) : nazwaCechy(t, p.f);
      const desc = en ? (TRAITS_EN[t]?.desc ?? '') : (TRAITS[t]?.desc ?? '');
      return `<span class="tag" title="${esc(desc)}">${esc(name)}</span>`;
    })
    .join('');
  const maimed = p.maimed
    ? `<span class="tag" title="${L('Po amputacji: gorzej trafia', 'After an amputation: worse aim')}">${L('kikut', 'stump')}</span>`
    : '';
  const bars = NEED_ORDER.map((k) => {
    const v = Math.round(p.needs[k]);
    return `<div class="need ${needLevel(v)}"><span class="need-k">${en ? NEED_LABELS_EN[k] : NEED_LABELS[k]}</span><i class="need-bar" style="--v:${v}%"></i><b class="need-v">${v}</b></div>`;
  }).join('');
  const moods = p.moods
    .filter((m) => m.until > tick)
    .sort((a, b) => a.d - b.d)
    .map((m) => {
      const h = Math.ceil((m.until - tick) / TICKS_PER_HOUR);
      return `<li class="mood ${m.d < 0 ? 'neg' : 'pos'}" title="${L(`jeszcze ${h} h`, `${h} h left`)}"><span>${esc(en ? nastrojEn(m.why) : m.why)}</span><b class="mood-v">${signed(m.d, 0)}</b></li>`;
    })
    .join('');
  const prof = en ? (opts.en?.prof ?? zawodEn(p.prof)) : p.prof;
  return [
    `<h2>${esc(p.name)}</h2>`,
    // osoba z generatora: zawód i wiek zostają też na zwartej karcie telefonu (klasa `gen`, spec §9)
    `<p class="sub${p.ref ? ' gen' : ''}">${esc(prof)}, ${en ? p.age : wiek(p.age)}</p>`,
    rodzinaHtml(en ? (opts.en?.rodzina ?? p.rodzina) : p.rodzina),
    storyHtml(en ? (opts.en?.story ?? p.story) : p.story, storyOpen),
    `<div class="tags">${skills}${traits}${maimed}</div>`,
    opts.lokator ? biteHtml(p, tick, false, words, e) : armHtml(p, tick, words, e),
    `<div class="needs">${bars}</div>`,
    moods ? `<ul class="moods">${moods}</ul>` : '',
    tonight ? `<p class="tonight">${esc(tonight)}</p>` : '',
    doingHtml(p, en, !opts.lokator),
    opts.lokator ? '' : pracaKartaHtml(p, { widoczne: opts.widoczne, zombie: opts.zombie }),
    fikcjaHtml(p, opts.imie !== false),
  ].join('');
}

/** kilka osób naraz: imiona i podpowiedź */
export function groupCard(names: string[], touch: boolean): string {
  return `<h2>${L('Zaznaczeni', 'Selected')}: ${names.length}</h2><p class="sub">${names.map(esc).join(', ')}</p><p class="doing">${
    touch
      ? L('Stuknięcie w miejsce: polecenie dla wszystkich.', 'Tap a spot to give everyone an order.')
      : L('Prawy przycisk: polecenie dla wszystkich.', 'Right-click a spot to give everyone an order.')
  }</p>`;
}
