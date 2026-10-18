/* Panel „Wasz zarząd” na karcie startowej (docs/superpowers/specs/2026-10-18-druzyna-design.md, układ A z makiety):
   liczba osób 1–5 i dwa tryby. Z adresu (domyślny): zarząd w wybranej liczbie to mieszkańcy siedziby z generatora
   mieszkańców (src/sim/lokatorzy.ts), a bez tabel mieszkańców osoby z ziarna adresu jak dawniej. Własny: drużyna
   z panelu, każdą osobę da się ułożyć w edytorze albo wylosować. Zasady osoby i losowanie są w src/content/druzyna.ts
   (te same sprawdza symulacja); tu stan panelu, jego HTML i obsługa zdarzeń.

   Stan (liczba, tryb, własna drużyna) przeglądarka pamięta pod własnym kluczem (DRUZYNA_KEY), osobno od zapisu gry,
   więc przy następnej grze panel jest taki, jak go zostawiono. Własna drużyna zostaje w pamięci także po powrocie do
   losowania z adresu i przy mniejszej liczbie osób (gra bierze pierwsze n). Sekcja startuje zwinięta do jednej
   linijki z podsumowaniem (na telefonie i na komputerze), więc karta startowa z przykładami i atrybucją mapy mieści
   się na ekranie jak dotąd, a kto chce od razu grać, nie ma czego przeklikiwać.

   Stan i HTML to czyste funkcje (testy w Node), klasa Druzyna spina je z DOM w bloku #druzyna z index.html. Pola
   tekstowe (imię, wiek, historia) zmieniają stan bez przerysowania panelu, żeby kliknięcie zaraz po pisaniu trafiało
   w przycisk; reszta przerysowuje panel i oddaje fokus temu samemu elementowi. Losowanie w panelu nie musi być
   powtarzalne: każde kliknięcie dostaje świeże ziarno, ale idzie przez Rng z src/core/rng.ts.

   Język (src/core/jezyk.ts): napisy, zawody, cechy i dziedziny w bieżącym języku przy rysowaniu. Wylosowana historia,
   której gracz nie zmienił (osoba ma ziarno), jest zawsze w bieżącym języku: składa się z ziarna przy wczytaniu stanu,
   przy każdym losowaniu i po zmianie języka (Druzyna.odswiez, woła ją main.ts), a angielska ma te same zdania co
   polska. Historia wpisana przez gracza (bez ziarna) zostaje w języku, w którym ją napisał. W pamięci przeglądarki
   zawód to dalej męska polska nazwa z PROFS, a cechy to klucze, w obu językach. */

import './druzyna.css';
import { DOM_EN } from '../content/data.en.ts';
import { DOM, type Dom, PROFS, TRAITS } from '../content/data.ts';
import {
  BUDZET,
  bledyOsoby,
  CECHY_DOBRE,
  CECHY_ZLE,
  dobreImie,
  dodajPunkt,
  dziedziny,
  HISTORIA_MAX,
  historiaZ,
  historiaZEn,
  losujCechy,
  losujDruzyne,
  losujOsobe,
  maksimum,
  moznaDodac,
  moznaOdjac,
  naprawOsobe,
  nazwaCechy,
  nazwaCechyEn,
  nazwaZawodu,
  nazwaZawoduEn,
  OSOB_DOMYSLNIE,
  OSOB_MAX,
  OSOB_MIN,
  type OsobaDruzyny,
  oczyscImie,
  odejmijPunkt,
  opisCechyEn,
  POTRZEBNE,
  pierwszeImie,
  przytnijWiek,
  wiekZawodu,
  zajete,
  zmienZawod,
  zostalo,
} from '../content/druzyna.ts';
import { jezyk, L } from '../core/jezyk.ts';
import { mulberry, type Rng } from '../core/rng.ts';
import { many } from './karta.ts';
import { esc, manyEn } from './tekst.ts';

export const DRUZYNA_KEY = 'za-murem-0.4-druzyna';
/** najwyższy poziom umiejętności w grze (kratki w edytorze) */
const POZIOMY = 4;

export interface StanDruzyny {
  /** liczba osób zarządu 1–5 */
  n: number;
  /** własna drużyna (true) albo losowanie z adresu */
  wlasny: boolean;
  /** własna drużyna, do 5 osób; gra bierze pierwsze n */
  team: OsobaDruzyny[];
}

/** stan widoku, poza pamięcią: sekcja rozwinięta i osoba otwarta w edytorze (−1: żadna) */
export interface Widok {
  open: boolean;
  sel: number;
}

export const stanDomyslny = (): StanDruzyny => ({ n: OSOB_DOMYSLNIE, wlasny: false, team: [] });

const liczba = (v: unknown): number =>
  typeof v === 'number' && Number.isInteger(v) ? Math.max(OSOB_MIN, Math.min(OSOB_MAX, v)) : OSOB_DOMYSLNIE;

/** Stan z pamięci przeglądarki: zły zapis to stan domyślny, złe osoby poprawione według zasad (naprawOsobe). */
export function wczytajStan(raw: string | null, rnd: Rng): StanDruzyny {
  const s = stanDomyslny();
  if (!raw) return s;
  try {
    const x = JSON.parse(raw) as Partial<StanDruzyny> & { v?: number };
    if (!x || typeof x !== 'object' || x.v !== 1) return s;
    s.n = liczba(x.n);
    s.wlasny = x.wlasny === true;
    const team = Array.isArray(x.team) ? x.team.slice(0, OSOB_MAX) : [];
    for (const o of team) {
      if (bledyOsoby(o).length) console.warn('Wasz zarząd: osoba z pamięci przeglądarki poprawiona według zasad.');
      s.team.push(naprawOsobe(o, rnd, zajete(s.team).used));
    }
    // wylosowane historie w bieżącym języku (pamięć mogła je zapisać w drugim)
    for (const o of s.team) odswiezHistorie(o);
    if (s.wlasny) uzupelnij(s, rnd);
  } catch {
    return stanDomyslny();
  }
  return s;
}

export const zapisStanu = (s: StanDruzyny): string => JSON.stringify({ v: 1, n: s.n, wlasny: s.wlasny, team: s.team });

/** Opcje dla createSim: liczba osób, a we własnym trybie także drużyna (pierwsze n osób, bez ziarna historii). */
export function opcjeGry(s: StanDruzyny): { core: number; team?: OsobaDruzyny[] } {
  if (!s.wlasny) return { core: s.n };
  const team = s.team
    .slice(0, s.n)
    .map(({ ziarno: _, ...o }) => ({ ...o, skills: { ...o.skills }, traits: [...o.traits] }));
  return { core: team.length, team };
}

/** dopełnia własną drużynę do n osób (nowe osoby losowe, z dziedziną z kolejności zarządu z adresu) */
export function uzupelnij(s: StanDruzyny, rnd: Rng): void {
  while (s.team.length < s.n) {
    const o = losujOsobe(rnd, { ...zajete(s.team), need: POTRZEBNE[s.team.length] });
    odswiezHistorie(o);
    s.team.push(o);
  }
}

export function ustawLiczbe(s: StanDruzyny, n: number, rnd: Rng): void {
  s.n = liczba(n);
  if (s.wlasny) uzupelnij(s, rnd);
}

/** „Stwórz własny zarząd” albo kliknięcie osoby: drużyna z pamięci, a gdy jej brak albo jest za mała, losowanie */
export function wlaczWlasny(s: StanDruzyny, rnd: Rng): void {
  s.wlasny = true;
  uzupelnij(s, rnd);
}

/** „Wróć do losowania z adresu”: własna drużyna zostaje w pamięci */
export function wlaczZAdresu(s: StanDruzyny): void {
  s.wlasny = false;
}

export function losujWszystkich(s: StanDruzyny, rnd: Rng): void {
  s.team = losujDruzyne(rnd, s.n);
  for (const o of s.team) odswiezHistorie(o);
}

/** nowa osoba na miejscu k: imię i zawód inne niż reszty drużyny */
export function losujCalaOsobe(s: StanDruzyny, k: number, rnd: Rng): void {
  if (!s.team[k]) return;
  s.team[k] = losujOsobe(rnd, zajete(s.team.filter((_, i) => i !== k)));
  odswiezHistorie(s.team[k]);
}

/** Historia z ziarna od nowa w bieżącym języku: po zmianie danych, po losowaniu i po zmianie języka (gdy gracz jej
    nie pisał sam, czyli osoba ma ziarno). Angielska ma te same zdania co polska z tego ziarna. */
export function odswiezHistorie(o: OsobaDruzyny): void {
  if (o.ziarno !== undefined) o.story = jezyk() === 'en' ? historiaZEn(o.ziarno, o) : historiaZ(o.ziarno, o);
}

/** podsumowanie w nagłówku zwiniętej sekcji */
export function podsumowanie(s: StanDruzyny): string {
  if (!s.wlasny)
    return L(
      `${many(s.n, 'osoba', 'osoby', 'osób')} z siedziby pod adresem`,
      `${manyEn(s.n, 'person', 'people')} at your address`,
    );
  const imiona = s.team
    .slice(0, s.n)
    .map((o) => pierwszeImie(o.name))
    .join(', ');
  return L(`własny: ${imiona}`, `your own: ${imiona}`);
}

const osobaW = (s: StanDruzyny, w: Widok): OsobaDruzyny | null =>
  s.wlasny && w.sel >= 0 && w.sel < s.n ? (s.team[w.sel] ?? null) : null;

/** zawód osoby do pokazania: po polsku w formie płci, po angielsku jedna forma */
const zawodOsoby = (o: OsobaDruzyny): string => (jezyk() === 'en' ? nazwaZawoduEn(o.prof) : nazwaZawodu(o.prof, o.f));

/** środek kafelka osoby: imię i nazwisko, zawód i wiek */
export const chipInner = (o: OsobaDruzyny): string =>
  `<b>${esc(oczyscImie(o.name))}</b><small>${esc(zawodOsoby(o))}, ${o.age}</small>`;

function radio(name: string, value: string, text: string, checked: boolean): string {
  return `<label class="mode-o"><input type="radio" name="${name}" value="${value}"${checked ? ' checked' : ''}><span>${text}</span></label>`;
}

function skillRow(o: OsobaDruzyny, d: Dom): string {
  const v = o.skills[d] ?? 0;
  const max = maksimum(o.prof, d);
  const n = L(DOM[d], DOM_EN[d]);
  const pips = Array.from({ length: POZIOMY }, (_, i) => `<i class="${i < v ? 'on' : i < max ? '' : 'x'}"></i>`).join(
    '',
  );
  return `<div class="dz-sk"><span class="dz-skn">${n}</span><button type="button" class="dz-pm" data-dz="minus" data-d="${d}" aria-label="${n}: ${L('mniej', 'less')}"${moznaOdjac(o, d) ? '' : ' disabled'}>−</button><span class="dz-pips" role="img" aria-label="${n}: ${L(`${v} z ${max}`, `${v} of ${max}`)}">${pips}</span><button type="button" class="dz-pm" data-dz="plus" data-d="${d}" aria-label="${n}: ${L('więcej', 'more')}"${moznaDodac(o, d) ? '' : ' disabled'}>+</button><b class="dz-skv">${v}</b></div>`;
}

const rodzajCechy = (t: string): string =>
  CECHY_DOBRE.includes(t) ? 'dobra' : CECHY_ZLE.includes(t) ? 'zla' : 'obojetna';

function editor(o: OsobaDruzyny, k: number): string {
  const en = jezyk() === 'en';
  const [a, b] = wiekZawodu(o.prof);
  const profs = PROFS.map(
    (p) =>
      `<option value="${esc(p[0])}"${p[0] === o.prof ? ' selected' : ''}>${esc(en ? nazwaZawoduEn(p[0]) : p[o.f ? 1 : 0])}</option>`,
  ).join('');
  const tags = o.traits
    .map(
      (t) =>
        `<span class="tag dz-${rodzajCechy(t)}" title="${esc(en ? opisCechyEn(t) : (TRAITS[t]?.desc ?? ''))}">${esc(en ? nazwaCechyEn(t) : nazwaCechy(t, o.f))}</span>`,
    )
    .join('');
  // zawody-żarty nie wydadzą całego budżetu: podpowiedź mówi to wprost, żeby gasnący „+” nie wyglądał na błąd
  const cap = dziedziny(o.prof).reduce((s, d) => s + maksimum(o.prof, d), 0);
  const hint =
    cap < BUDZET
      ? L(
          `Ten zawód wyda najwyżej ${cap} z ${BUDZET} punktów.`,
          `This profession can spend at most ${cap} of the ${BUDZET} points.`,
        )
      : L(
          `Tylko dziedziny z zawodu, razem najwyżej ${BUDZET} punktów.`,
          `Only the profession’s skills, ${BUDZET} points in total at most.`,
        );
  return [
    `<div class="dz-ed" role="group" aria-label="${L(`Osoba ${k + 1}`, `Person ${k + 1}`)}">`,
    `<div class="dz-f dz-f-name"><label for="dzName">${L('Imię i nazwisko', 'Full name')}</label><input id="dzName" data-dz="name" maxlength="40" value="${esc(o.name)}" autocomplete="off" spellcheck="false"></div>`,
    `<div class="dz-f dz-f-who"><div class="dz-pair"><div><span class="dz-k" id="dzSexL">${L('Płeć', 'Sex')}</span><span class="mode" role="radiogroup" aria-labelledby="dzSexL">${radio('dzSex', 'k', L('K', 'F'), o.f)}${radio('dzSex', 'm', 'M', !o.f)}</span></div><div><label for="dzAge">${L('Wiek', 'Age')}</label><span class="dz-line"><input id="dzAge" data-dz="age" type="number" inputmode="numeric" min="${a}" max="${b}" step="1" value="${o.age}"><small class="dz-dim">${L(`${a}–${b} lat`, `${a} to ${b}`)}</small></span></div></div></div>`,
    `<div class="dz-f dz-f-prof"><label for="dzProf">${L('Zawód', 'Profession')}</label><select id="dzProf" data-dz="prof">${profs}</select></div>`,
    `<div class="dz-f dz-f-skills"><div class="dz-line dz-split"><span class="dz-k">${L('Umiejętności', 'Skills')}</span><span class="dz-pts" aria-live="polite">${L(`zostało ${zostalo(o.skills)} z ${BUDZET}`, `${zostalo(o.skills)} of ${BUDZET} left`)}</span></div>${dziedziny(
      o.prof,
    )
      .map((d) => skillRow(o, d))
      .join('')}<p class="dz-dim">${hint}</p></div>`,
    `<div class="dz-f dz-f-traits"><div class="dz-line dz-split"><span class="dz-k">${L('Cechy', 'Traits')}</span><button type="button" class="btn" data-dz="traits">${L('Losuj cechy', 'Reroll traits')}</button></div><div class="dz-tags">${tags}</div><p class="dz-dim">${L('Dobra i zła albo dwie złe, nigdy dwie dobre.', 'Good and bad, or two bad. Never two good.')}</p></div>`,
    `<div class="dz-f dz-f-story"><div class="dz-line dz-split"><label for="dzStory">${L('Historia', 'Story')}</label><span class="dz-line"><small class="dz-dim dz-cnt">${o.story.length}/${HISTORIA_MAX}</small><button type="button" class="btn" data-dz="story">${L('Wylosuj historię', 'Reroll story')}</button></span></div><textarea id="dzStory" data-dz="storytext" maxlength="${HISTORIA_MAX}" rows="4">${esc(o.story)}</textarea></div>`,
    `<div class="dz-foot"><button type="button" class="btn ghost" data-dz="close">${L('Gotowe', 'Done')}</button><button type="button" class="btn" data-dz="person">${L('Losuj całą osobę', 'Reroll person')}</button></div>`,
    '</div>',
  ].join('');
}

/** HTML całej sekcji (środek elementu #druzyna). Zwinięta: nagłówek z podsumowaniem. Rozwinięta: w nagłówku liczba
    osób i przyciski trybu, pod nim kafelki osób, podpowiedź i edytor otwartej osoby. */
export function htmlPanelu(s: StanDruzyny, w: Widok): string {
  const toggle = `<button type="button" class="btn ghost dz-toggle" data-dz="toggle" aria-expanded="${w.open}" aria-controls="dzBody">${
    w.open ? L('Zwiń', 'Hide') : L('Zmień', 'Change')
  }</button>`;
  const title = `<h2 class="dz-title" id="dzTitle">${L('Wasz zarząd', 'Your board')}</h2>`;
  if (!w.open)
    return `<div class="dz-head">${title}<span class="dz-sum">${esc(podsumowanie(s))}</span>${toggle}</div><div class="dz-body" id="dzBody" hidden></div>`;
  const counts = Array.from({ length: OSOB_MAX }, (_, i) => radio('dzN', String(i + 1), String(i + 1), s.n === i + 1));
  const acts = s.wlasny
    ? `<button type="button" class="btn" data-dz="all">${L('Losuj wszystkich', 'Reroll everyone')}</button><button type="button" class="btn ghost" data-dz="addr">${L('Wróć do losowania z adresu', 'Use people from the address')}</button>`
    : `<button type="button" class="btn lamp" data-dz="own">${L('Stwórz własny zarząd', 'Create your own board')}</button>`;
  const bar = `<div class="dz-bar"><span class="dz-line"><span class="dz-k" id="dzNL">${L('Ile osób', 'How many')}</span><span class="mode" role="radiogroup" aria-labelledby="dzNL">${counts.join('')}</span></span><span class="dz-acts">${acts}</span></div>`;
  const chips = Array.from({ length: s.n }, (_, k) => {
    const o = s.wlasny ? s.team[k] : undefined;
    return o
      ? `<button type="button" class="dz-chip${k === w.sel ? ' sel' : ''}" data-dz="pick" data-k="${k}" aria-pressed="${k === w.sel}">${chipInner(o)}</button>`
      : `<button type="button" class="dz-chip dz-los" data-dz="pick" data-k="${k}"><b>${L(`Osoba ${k + 1}`, `Person ${k + 1}`)}</b><small>${L('z siedziby', 'from the address')}</small></button>`;
  }).join('');
  const o = osobaW(s, w);
  const note = !s.wlasny
    ? L(
        'Gra wybierze zarząd spośród mieszkańców siedziby po wczytaniu osiedla. Mniej osób to trudniejsza gra.',
        'Once the estate loads, the game picks your board from the people at your address. Fewer people, harder game.',
      )
    : o
      ? ''
      : L(
          'Wybierzcie osobę, żeby ją zmienić. Mniej osób to trudniejsza gra.',
          'Pick someone to edit them. Fewer people, harder game.',
        );
  return [
    `<div class="dz-head">${title}${bar}${toggle}</div>`,
    '<div class="dz-body" id="dzBody">',
    `<div class="dz-row">${chips}</div>`,
    note ? `<p class="dz-note">${note}</p>` : '',
    o ? editor(o, w.sel) : '',
    '</div>',
  ].join('');
}

/** świeże ziarno na każde kliknięcie (bez Math.random: losowanie i tak idzie przez mulberry z rng.ts) */
function swiezy(): Rng {
  let seed = Date.now() >>> 0;
  try {
    seed = globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  } catch {
    // bez crypto zostaje zegar
  }
  return mulberry(seed);
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;
const pamiec = (): Store | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

/** klucz elementu do oddania mu fokusu po przerysowaniu */
function focusKey(el: HTMLElement): string | null {
  if (el instanceof HTMLInputElement && el.type === 'radio') return `input[name="${el.name}"]:checked`;
  const dz = el.dataset.dz;
  if (!dz) return null;
  return `[data-dz="${dz}"]${el.dataset.k ? `[data-k="${el.dataset.k}"]` : ''}${el.dataset.d ? `[data-d="${el.dataset.d}"]` : ''}`;
}

export class Druzyna {
  private readonly root: HTMLElement;
  private readonly store: Store | null;
  private readonly s: StanDruzyny;
  private readonly w: Widok;

  /** open: sekcja od razu rozwinięta (domyślnie zwinięta); store: pamięć zamiast localStorage (null: bez pamięci) */
  constructor(root: HTMLElement, opts: { open?: boolean; store?: Store | null } = {}) {
    this.root = root;
    this.store = opts.store === undefined ? pamiec() : opts.store;
    let raw: string | null = null;
    try {
      raw = this.store?.getItem(DRUZYNA_KEY) ?? null;
    } catch {
      raw = null;
    }
    this.s = wczytajStan(raw, swiezy());
    this.w = { open: opts.open ?? false, sel: -1 };
    root.addEventListener('click', (e) => this.click(e));
    root.addEventListener('change', (e) => this.change(e));
    root.addEventListener('input', (e) => this.input(e));
    root.addEventListener('keydown', (e) => this.key(e));
    this.render();
  }

  /** opcje zarządu do createSim */
  opcje(): { core: number; team?: OsobaDruzyny[] } {
    return opcjeGry(this.s);
  }

  /** Po zmianie języka (woła main.ts): wylosowane historie, których gracz nie zmienił (osoby z ziarnem), składa od
      nowa w bieżącym języku i zapisuje w pamięci, a panel rysuje od nowa w tym samym stanie (rozwinięty albo zwinięty,
      ta sama otwarta osoba). Historia napisana przez gracza zostaje, jak była. */
  odswiez(): void {
    let zmiana = false;
    for (const o of this.s.team) {
      const przed = o.story;
      odswiezHistorie(o);
      zmiana ||= o.story !== przed;
    }
    if (zmiana) this.save();
    this.render();
  }

  private cur(): OsobaDruzyny | null {
    return osobaW(this.s, this.w);
  }

  private save(): void {
    try {
      this.store?.setItem(DRUZYNA_KEY, zapisStanu(this.s));
    } catch {
      // bez dostępu do pamięci panel działa do końca tej wizyty
    }
  }

  private render(): void {
    const a = document.activeElement as HTMLElement | null;
    const key = a && this.root.contains(a) ? focusKey(a) : null;
    this.root.innerHTML = htmlPanelu(this.s, this.w);
    if (!key) return;
    let el = this.root.querySelector<HTMLElement>(key);
    // przycisk, który właśnie się wyłączył (koniec punktów), oddaje fokus drugiemu w tym samym wierszu
    if (el instanceof HTMLButtonElement && el.disabled)
      el = el.parentElement?.querySelector<HTMLElement>('button:not(:disabled)') ?? null;
    (el ?? this.root.querySelector<HTMLElement>('[data-dz="toggle"]'))?.focus();
  }

  /** kafelek, licznik i historia otwartej osoby bez przerysowania panelu (pola tekstowe zostają pod palcami) */
  private parts(): void {
    const o = this.cur();
    if (!o) return;
    const chip = this.root.querySelector(`[data-dz="pick"][data-k="${this.w.sel}"]`);
    if (chip) chip.innerHTML = chipInner(o);
    const ta = this.root.querySelector<HTMLTextAreaElement>('#dzStory');
    if (ta && document.activeElement !== ta && ta.value !== o.story) ta.value = o.story;
    const cnt = this.root.querySelector('.dz-cnt');
    if (cnt) cnt.textContent = `${o.story.length}/${HISTORIA_MAX}`;
  }

  private click(e: MouseEvent): void {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button[data-dz]');
    if (!b || !this.root.contains(b)) return;
    const s = this.s;
    const w = this.w;
    const o = this.cur();
    const d = b.dataset.d as Dom | undefined;
    /** „Gotowe” zamyka edytor, a fokus wraca na kafelek tej osoby */
    let back = -1;
    switch (b.dataset.dz) {
      case 'toggle':
        w.open = !w.open;
        break;
      case 'own':
        wlaczWlasny(s, swiezy());
        w.sel = -1;
        break;
      case 'addr':
        wlaczZAdresu(s);
        w.sel = -1;
        break;
      case 'all':
        losujWszystkich(s, swiezy());
        break;
      case 'pick': {
        const k = Number(b.dataset.k);
        if (!s.wlasny) {
          wlaczWlasny(s, swiezy());
          w.sel = k;
        } else w.sel = w.sel === k ? -1 : k;
        break;
      }
      case 'close':
        back = w.sel;
        w.sel = -1;
        break;
      case 'plus':
        if (o && d) dodajPunkt(o, d);
        break;
      case 'minus':
        if (o && d) odejmijPunkt(o, d);
        break;
      case 'traits':
        if (!o) return;
        o.traits = losujCechy(swiezy());
        odswiezHistorie(o);
        break;
      case 'story':
        if (!o) return;
        o.ziarno = Math.floor(swiezy()() * 4294967296) | 0;
        odswiezHistorie(o);
        break;
      case 'person':
        losujCalaOsobe(s, w.sel, swiezy());
        break;
      default:
        return;
    }
    this.save();
    this.render();
    if (back >= 0) this.root.querySelector<HTMLElement>(`[data-dz="pick"][data-k="${back}"]`)?.focus();
  }

  private change(e: Event): void {
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    const o = this.cur();
    if (t.name === 'dzN') {
      ustawLiczbe(this.s, Number(t.value), swiezy());
      if (this.w.sel >= this.s.n) this.w.sel = -1;
    } else if (t.name === 'dzSex' && o) {
      o.f = t.value === 'k';
      odswiezHistorie(o);
    } else if (t.dataset.dz === 'prof' && o) {
      zmienZawod(o, t.value);
      odswiezHistorie(o);
    } else if (t.dataset.dz === 'age' && o) {
      // wiek poza widełkami wraca do najbliższej granicy, bez przerysowania (kliknięcie obok trafia w cel)
      o.age = przytnijWiek(Number(t.value), o.prof);
      t.value = String(o.age);
      odswiezHistorie(o);
      this.parts();
      this.save();
      return;
    } else if (t.dataset.dz === 'name' && o) {
      // puste albo złe imię wraca do ostatniego dobrego
      t.value = oczyscImie(o.name);
      t.removeAttribute('aria-invalid');
      return;
    } else return;
    this.save();
    this.render();
  }

  private input(e: Event): void {
    const t = e.target as HTMLInputElement | HTMLTextAreaElement;
    const o = this.cur();
    if (!o) return;
    if (t.dataset.dz === 'name') {
      const ok = dobreImie(t.value);
      if (ok) o.name = oczyscImie(t.value);
      t.toggleAttribute('aria-invalid', !ok);
    } else if (t.dataset.dz === 'age') {
      const v = Number(t.value);
      const [a, b] = wiekZawodu(o.prof);
      if (!Number.isInteger(v) || v < a || v > b) return;
      o.age = v;
      odswiezHistorie(o);
    } else if (t.dataset.dz === 'storytext') {
      o.story = t.value.slice(0, HISTORIA_MAX);
      delete o.ziarno;
    } else return;
    this.parts();
    this.save();
  }

  private key(e: KeyboardEvent): void {
    // Escape w edytorze zamyka go i oddaje fokus kafelkowi osoby
    if (e.key !== 'Escape' || !this.cur()) return;
    const k = this.w.sel;
    this.w.sel = -1;
    this.render();
    this.root.querySelector<HTMLElement>(`[data-dz="pick"][data-k="${k}"]`)?.focus();
  }
}
