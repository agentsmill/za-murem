/* Panel Pracy (docs/superpowers/specs/2026-10-19-praca-ludzi-design.md, „Interfejs”): treść panelu z priorytetami
   rodzajów pracy zarządu. Czyste funkcje z odczytu symulacji do HTML, bez DOM, więc da się je sprawdzić w Node
   (DOM i delegację kliknięć robi panelpracy.ts, jak buildPanelHtml z budowa.ts i panelbudowy.ts).
   Kontrakt:
   - `widokPracy(snap, …)` składa `WidokPracy` z odczytu (`SimSnapshot`): wiersz na osobę zarządu po numerze osoby,
     progi i widoczne rodzaje. `nalozPolecenia` nakłada na widok polecenia ustawień, które czekają w kolejności
     symulacji (gra na pauzie nie wykonuje kroku, a panel ma się zmienić od razu).
   - `pracaPanelHtml(v, en)` robi treść: lead (zdanie o strzałce „za siatkę” przy osobie mówi, że jest domyślnie
     włączona w trybie zwykłym, a wyłączona w zombie; stan każdej osoby z odczytu to `aria-pressed` przycisku
     `data-zasiatke`; na komputerze z regułą klawiatury: Tab i strzałki wybierają komórkę,
     cyfry 0–4 ustawiają priorytet, spacja i Enter zmieniają o jeden, a po kliknięciu myszą spacja i 1–4 znów
     sterują grą; panelpracy.ts to pilnuje), „Trzymać w zapasie” (drewno, deski, części, w trybie zombie dzidy: minus,
     liczba, plus po 5) i tabelę, w której wiersz to osoba, a kolumna to rodzaj pracy w kolejności `RODZAJE`. W trybie
     zombie nad tabelą stoi stała linia `.pr-uwaga` o szwendaczach za siatką (podpowiedź z `say()` chowa się na telefonie
     pod panelem, a ostrzeżenie ma być widać tam, gdzie jest przełącznik „za siatkę”). Gdy nikt w zarządzie nie ma
     Ognia (priorytet 0 i bez stałego zajęcia Ogień), nad tabelą stoi też linia `data-uwaga="ogien"` (`BEZ_OGNIA`).
     Znaczniki, na których stoją zrzuty i delegacja: komórka `data-prio="<osoba>:<rodzaj>"` z cyfrą 1–4 albo pustą
     treścią (nie robi), `data-prog="<co>:<+n|-n>"`, `data-zasiatke="<osoba>"` i nagłówek `data-kol="<rodzaj>"`.
   - Kolumna `badania` jest tylko wtedy, gdy rodzaj jest w `widoczne` (gałąź z badaniami); dzidy tylko w trybie zombie.
   - Język idzie parametrem `en`, nie z globalnego `jezyk()`, żeby funkcja była czysta; angielskie nazwy rodzajów
     według docs/SLOWNICZEK-EN.md. */

import { zawodEn } from '../content/data.en.ts';
import { type Tx, tx } from '../core/jezyk.ts';
import {
  PROG_MAX,
  PROGI_DOMYSLNE,
  type Priorytet,
  type Progi,
  RODZAJE,
  type RodzajPracy,
  ZAPAS_OPALU,
} from '../sim/praca.ts';
import type { Command } from '../sim/sim.ts';
import type { SimSnapshot } from '../sim/snapshot.ts';
import { esc } from './tekst.ts';

/** o ile zmienia próg jeden klik plusa albo minusa */
export const KROK_PROGU = 5;

/** wiersz tabeli: jedna osoba zarządu */
export interface WierszPracy {
  /** indeks osoby w `st.people`: klucz ustawień i poleceń */
  osoba: number;
  imie: string;
  /** zawód ze stanu (po polsku, tłumaczony przy rysowaniu) */
  zawod: string;
  /** priorytety w kolejności `RODZAJE` (0: nie robi) */
  prio: readonly Priorytet[];
  stale: RodzajPracy | null;
  zaSiatke: boolean;
}

export interface WidokPracy {
  wiersze: readonly WierszPracy[];
  /** rodzaje, które w tej grze istnieją (kolumny), w kolejności `RODZAJE` */
  widoczne: readonly RodzajPracy[];
  progi: Progi;
  /** tryb zombie: w progach są dzidy */
  zombie: boolean;
  /** telefon: podpowiedzi mówią „stuknij” */
  touch: boolean;
  /** kolumna, której nagłówek kliknięto (null: żadna) */
  kol: RodzajPracy | null;
  /** ile zleceń tego rodzaju czeka (`sim.ileZlecen`), do nagłówka wybranej kolumny */
  zlecen: number;
}

/* ---------- napisy ---------- */

const NAZWY: Record<RodzajPracy, Tx> = {
  ogien: tx('Ogień', 'Fire'),
  kuchnia: tx('Kuchnia', 'Kitchen'),
  budowa: tx('Budowa', 'Build'),
  naprawy: tx('Naprawy', 'Repair'),
  drwal: tx('Drwal', 'Woodcutting'),
  noszenie: tx('Noszenie', 'Hauling'),
  warsztat: tx('Warsztat', 'Workshop'),
  szaber: tx('Szaber', 'Scavenging'),
  badania: tx('Badania', 'Research'),
};

const OPISY: Record<RodzajPracy, Tx> = {
  ogien: tx('Dokładanie do kozy i noszenie drewna do składu.', 'Feeding the stove and carrying wood to the woodpile.'),
  kuchnia: tx('Gotowanie, kiedy trzeba.', 'Cooking when it’s needed.'),
  budowa: tx(
    'Budowa według planów i dokańczanie wspólnego płotu.',
    'Building the plans and finishing the shared fence.',
  ),
  naprawy: tx(
    'Łatanie dziur w siatce i naprawy w naszych mieszkaniach.',
    'Patching holes in the fence and repairs in our flats.',
  ),
  drwal: tx(
    'Ścinanie drzew, póki drewna jest mniej niż próg.',
    'Chopping trees while there is less wood than the stock level.',
  ),
  noszenie: tx(
    'Noszenie łupu z ulicy i z cudzych budynków na podwórko.',
    'Carrying loot from the street and other buildings into the yard.',
  ),
  warsztat: tx('Deski, części i dzidy do progu zapasu.', 'Planks, parts and spears up to the stock level.'),
  szaber: tx('Przeszukiwanie pustych pomieszczeń i wraków.', 'Searching empty rooms and wrecks.'),
  badania: tx('Praca przy badaniach.', 'Work on research.'),
};

const PROGI: Record<keyof Progi, { nazwa: Tx; opis: Tx }> = {
  drewno: {
    nazwa: tx('drewno', 'wood'),
    opis: tx(
      `Drwal ścina drzewa, póki w obrębie siatki leży mniej drewna niż tyle. 0 wyłącza. Warsztat piłuje na deski tylko drewno ponad ten próg i zawsze zostawia ${ZAPAS_OPALU} sztuk na opał.`,
      `Woodcutters keep chopping while there is less wood than this inside the fence. 0 turns it off. The workshop only saws wood above this level into planks and always leaves ${ZAPAS_OPALU} pieces for the stove.`,
    ),
  },
  deski: {
    nazwa: tx('deski', 'planks'),
    opis: tx(
      'Warsztat piłuje deski z nadwyżki drewna, póki desek jest mniej niż tyle. 0 wyłącza.',
      'The workshop saws planks from spare wood while there are fewer than this. 0 turns it off.',
    ),
  },
  czesci: {
    nazwa: tx('części', 'parts'),
    opis: tx(
      'Warsztat robi części z nadwyżki złomu, póki części jest mniej niż tyle. 0 wyłącza.',
      'The workshop makes parts from spare scrap while there are fewer than this. 0 turns it off.',
    ),
  },
  dzidy: {
    nazwa: tx('dzidy', 'spears'),
    opis: tx(
      'Warsztat robi dzidy dla nieuzbrojonych, póki dzid jest mniej niż tyle. 0 wyłącza.',
      'The workshop makes spears for the unarmed while there are fewer than this. 0 turns it off.',
    ),
  },
};

const wJezyku = (t: Tx, en: boolean): string => (en ? t.en : t.pl);

/** Dymek przełącznika „za siatkę”: ten sam w panelu Pracy i na karcie osoby. Mówi też, jaka jest wartość domyślna
    (decyzja Mateusza 19.10.2026: włączony w trybie zwykłym, wyłączony w zombie, `zaSiatkeDomyslnie` w src/sim/praca.ts);
    bez apostrofów i cudzysłowów, bo test porównuje go z atrybutem `title` po `esc`. */
export const ZA_SIATKE_OPIS: Tx = tx(
  'Może wychodzić za siatkę bez polecenia (za dnia). Domyślnie włączone w trybie zwykłym, wyłączone w trybie zombie.',
  'Can go outside the fence without orders (by day). On by default in normal mode, off in zombie mode.',
);
/** ostrzeżenie trybu zombie przy wychodzeniu za siatkę: w panelu Pracy (stała linia) i w podpowiedzi po włączeniu
    przełącznika (karta osoby ma krótszą wersję) */
export const ZA_SIATKE_ZOMBIE: Tx = tx(
  'Za siatką są szwendacze: kto tam wyjdzie sam, ryzykuje ugryzienie.',
  'There are shamblers outside the fence: anyone who goes out on their own risks a bite.',
);

/** ostrzeżenie w panelu Pracy, gdy nikt w zarządzie nie ma Ognia (priorytet 0 i bez stałego zajęcia Ogień): jedna
    pomyłka w kolumnie nie może po cichu zgasić kozy */
export const BEZ_OGNIA: Tx = tx(
  'Nikt w zarządzie nie ma włączonego Ognia: nikt sam nie dołoży do kozy.',
  'Nobody on the board has Fire switched on: nobody will feed the stove on their own.',
);

/** krótka nazwa rodzaju pracy (nagłówek kolumny, karta osoby) */
export const nazwaRodzaju = (r: RodzajPracy, en: boolean): string => wJezyku(NAZWY[r], en);
/** jedno zdanie o tym, co obejmuje rodzaj pracy (dymek nagłówka i wiersz pod tabelą) */
export const opisRodzaju = (r: RodzajPracy, en: boolean): string => wJezyku(OPISY[r], en);

/* ---------- priorytet ---------- */

/** Następny priorytet po kliknięciu: 1 → 2 → 3 → 4 → 0 (pusto) → 1; `wstecz` (prawy przycisk) w drugą stronę:
    1 → 0 → 4 → 3 → 2 → 1. */
export function nastepnyPriorytet(p: Priorytet, wstecz = false): Priorytet {
  if (wstecz) return (p === 1 ? 0 : p === 0 ? 4 : p - 1) as Priorytet;
  return (p === 0 ? 1 : p === 4 ? 0 : p + 1) as Priorytet;
}

/* ---------- widok z odczytu ---------- */

/** Widok panelu z odczytu symulacji: osoby zarządu po numerze osoby (kolejność wierszy nie skacze, gdy ktoś dojdzie
    albo odejdzie), progi i widoczne rodzaje z odczytu. `kol` i `zlecen` podaje wywołujący (liczba zleceń jest na
    żądanie, tylko dla wybranej kolumny). */
export function widokPracy(
  snap: Pick<SimSnapshot, 'people' | 'praca' | 'mode'>,
  o: { kol: RodzajPracy | null; zlecen: number; touch: boolean },
): WidokPracy {
  return {
    wiersze: snap.people
      .map((p) => ({
        osoba: p.osoba,
        imie: p.first,
        zawod: p.prof,
        prio: p.praca.prio,
        stale: p.praca.stale,
        zaSiatke: p.praca.zaSiatke,
      }))
      .sort((a, b) => a.osoba - b.osoba),
    widoczne: snap.praca.widoczne,
    progi: { ...snap.praca.progi },
    zombie: snap.mode === 'zombie',
    touch: o.touch,
    kol: o.kol,
    zlecen: o.zlecen,
  };
}

/** ustawienia pracy jednej osoby, jak w odczycie (`SimPerson.praca`) */
export interface PracaOsoby {
  prio: readonly Priorytet[];
  stale: RodzajPracy | null;
  zaSiatke: boolean;
}

/** Polecenia ustawień osoby (`prio`, `stale`, `zasiatke`), które jeszcze czekają w kolejności symulacji, nałożone po kolei
    na jej ustawienia: pauza nie wykonuje kroków, więc bez tego panel i karta nie ruszyłyby się po kliknięciu. Reguły
    jak w symulacji (priorytet spoza 0–4 i nieznany rodzaj są pomijane). Wejścia nie zmienia. */
export function nalozPraceOsoby(
  p: PracaOsoby,
  osoba: number,
  cmds: readonly Command[],
): { prio: Priorytet[]; stale: RodzajPracy | null; zaSiatke: boolean } {
  const wynik = { prio: [...p.prio], stale: p.stale, zaSiatke: p.zaSiatke };
  for (const c of cmds) {
    if ((c.t !== 'prio' && c.t !== 'stale' && c.t !== 'zasiatke') || c.osoba !== osoba) continue;
    if (c.t === 'prio') {
      const k = RODZAJE.indexOf(c.rodzaj);
      if (k >= 0 && Number.isInteger(c.prio) && c.prio >= 0 && c.prio <= 4) wynik.prio[k] = c.prio;
    } else if (c.t === 'stale') {
      if (c.rodzaj === null || RODZAJE.includes(c.rodzaj)) wynik.stale = c.rodzaj;
    } else wynik.zaSiatke = c.on === true;
  }
  return wynik;
}

/** Wszystkie polecenia ustawień pracy (osób i progów), które czekają, nałożone na widok (patrz `nalozPraceOsoby`). Próg
    jak w symulacji: tylko liczba, przycięta do 0–999. Wejścia nie zmienia. */
export function nalozPolecenia(v: WidokPracy, cmds: readonly Command[]): WidokPracy {
  const progi = { ...v.progi };
  for (const c of cmds) {
    if (c.t !== 'prog' || typeof c.n !== 'number' || Number.isNaN(c.n) || !Object.hasOwn(progi, c.co)) continue;
    progi[c.co] = Math.min(PROG_MAX, Math.max(0, Math.trunc(c.n)));
  }
  return { ...v, wiersze: v.wiersze.map((w) => ({ ...w, ...nalozPraceOsoby(w, w.osoba, cmds) })), progi };
}

/* ---------- HTML ---------- */

/** strzałka przez linię: wyjście za siatkę (znak przełącznika w wierszu osoby) */
const IKONA_ZA_SIATKE =
  '<svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true" focusable="false"><path d="M1 7h8M6 3.5 9.5 7 6 10.5M12.5 2v10" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** Treść panelu Pracy: lead, „Trzymać w zapasie”, linia o wybranej kolumnie i tabela osób. Nagłówek (kicker, ✕) robi
    panelpracy.ts. */
export function pracaPanelHtml(v: WidokPracy, en: boolean): string {
  const t = (pl: string, eng: string): string => (en ? eng : pl);
  // przełącznik „za siatkę” (strzałka przy osobie) ma domyślną zależną od trybu; lead mówi tę, która obowiązuje w grze
  const domyslnie = v.zombie ? t('wyłączona', 'off') : t('włączona', 'on');
  const lead = `<p class="lead">${esc(
    t(
      `Tak pracują sami, kiedy nikt im nie rozkazuje. 1 to najpierw, 4 na końcu, puste: nie robi. ${
        v.touch ? 'Stuknij komórkę, żeby zmienić.' : 'Klik zmienia, prawy przycisk w drugą stronę.'
      } Gwiazdka to stałe zajęcie z karty osoby. Strzałka przy osobie pozwala jej wychodzić za siatkę za dnia bez polecenia (domyślnie ${domyslnie}).`,
      `This is how they work when nobody gives an order. 1 goes first, 4 last, blank: won’t do it. ${
        v.touch ? 'Tap a cell to change it.' : 'Click to change, right-click to go back.'
      } A star marks the fixed job set on the person’s card. The arrow beside a person lets them go outside the fence by day without orders (${domyslnie} by default).`,
    ),
  )}</p>`;
  // reguła klawiatury (na telefonie nie ma czego opisywać): fokus po kliknięciu zdejmuje panelpracy.ts, więc spacja
  // i 1–4 po myszy sterują grą, a na komórce, do której doszło się Tabem albo strzałkami, cyfry ustawiają priorytet
  const klawiatura = v.touch
    ? ''
    : `<p class="lead pr-klaw">${esc(
        t(
          'Z klawiatury: Tab i strzałki wybierają komórkę, cyfry 0–4 ustawiają jej priorytet, spacja i Enter zmieniają o jeden. Po kliknięciu myszą spacja i 1–4 znów sterują grą.',
          'From the keyboard: Tab and the arrows pick a cell, digits 0–4 set its priority, Space and Enter step it by one. After a mouse click, Space and 1–4 control the game again.',
        ),
      )}</p>`;

  const klucze: (keyof Progi)[] = ['drewno', 'deski', 'czesci'];
  if (v.zombie) klucze.push('dzidy');
  const prog = (co: keyof Progi): string => {
    const n = v.progi[co] ?? PROGI_DOMYSLNE[co];
    const nazwa = wJezyku(PROGI[co].nazwa, en);
    const o = (kierunek: -1 | 1): string => {
      const znak = kierunek < 0 ? '-' : '+';
      const wylaczony = kierunek < 0 ? n <= 0 : n >= PROG_MAX;
      const opis = en
        ? `${nazwa}: ${kierunek < 0 ? `${KROK_PROGU} fewer` : `${KROK_PROGU} more`}`
        : `${nazwa}: ${kierunek < 0 ? `o ${KROK_PROGU} mniej` : `o ${KROK_PROGU} więcej`}`;
      return `<button type="button" class="pr-step" data-prog="${co}:${znak}${KROK_PROGU}" aria-label="${esc(opis)}"${
        wylaczony ? ' disabled' : ''
      }>${kierunek < 0 ? '−' : '+'}</button>`;
    };
    return `<div class="pr-prog" title="${esc(wJezyku(PROGI[co].opis, en))}"><span class="pr-prog-k">${esc(nazwa)}</span>${o(-1)}<b class="pr-v" data-wart="${co}">${n}</b>${o(1)}</div>`;
  };
  const zapas = `<section class="pr-zapas" aria-label="${esc(t('Trzymać w zapasie', 'Keep in stock'))}"><h3 class="pr-h">${esc(
    t('Trzymać w zapasie', 'Keep in stock'),
  )}</h3><div class="pr-progi">${klucze.map(prog).join('')}</div></section>`;

  if (!v.wiersze.length)
    return `${lead}${klawiatura}${zapas}<p class="build-empty">${esc(t('Nikogo w zarządzie.', 'Nobody on the board.'))}</p>`;

  const naglowek = (r: RodzajPracy): string => {
    const wybrana = v.kol === r;
    return `<th scope="col" class="pr-th"><button type="button" class="pr-kol${wybrana ? ' sel' : ''}" data-kol="${r}" aria-pressed="${wybrana}" title="${esc(
      opisRodzaju(r, en),
    )}"><span class="pr-kol-t">${esc(nazwaRodzaju(r, en))}</span>${wybrana ? `<b class="pr-n">${v.zlecen}</b>` : ''}</button></th>`;
  };
  const komorka = (w: WierszPracy, r: RodzajPracy): string => {
    const p = w.prio[RODZAJE.indexOf(r)] ?? 0;
    const etykieta = `${w.imie}, ${nazwaRodzaju(r, en)}: ${p ? p : t('nie robi', 'won’t do it')}${
      w.stale === r ? ` (${t('stałe zajęcie', 'fixed job')})` : ''
    }`;
    return `<td class="pr-td"><button type="button" class="pr-c p${p}${w.stale === r ? ' stale' : ''}" data-prio="${w.osoba}:${r}" aria-label="${esc(
      etykieta,
    )}">${p ? p : ''}</button></td>`;
  };
  const wiersz = (w: WierszPracy): string => {
    const tytulOut = wJezyku(ZA_SIATKE_OPIS, en);
    return `<tr data-osoba="${w.osoba}"><th scope="row" class="pr-os"><span class="pr-im">${esc(w.imie)}</span><small class="pr-zaw">${esc(
      en ? zawodEn(w.zawod) : w.zawod,
    )}</small><button type="button" class="pr-out" data-zasiatke="${w.osoba}" aria-pressed="${w.zaSiatke}" aria-label="${esc(
      `${w.imie}: ${t('może wychodzić za siatkę', 'can go outside the fence')}`,
    )}" title="${esc(tytulOut)}">${IKONA_ZA_SIATKE}</button></th>${v.widoczne.map((r) => komorka(w, r)).join('')}</tr>`;
  };

  const info = v.kol
    ? `<p class="pr-info"><b>${esc(nazwaRodzaju(v.kol, en))}</b> · ${esc(t('zleceń do wzięcia', 'jobs waiting'))}: <b>${v.zlecen}</b><span class="pr-opis">${esc(
        opisRodzaju(v.kol, en),
      )}</span></p>`
    : `<p class="pr-info">${esc(
        t(
          `${v.touch ? 'Stuknij' : 'Kliknij'} nazwę rodzaju pracy, żeby zobaczyć, ile zleceń czeka.`,
          `${v.touch ? 'Tap' : 'Click'} a job name to see how many jobs are waiting.`,
        ),
      )}</p>`;

  // tryb zombie: ostrzeżenie stoi nad tabelą przez cały czas, nie tylko po włączeniu przełącznika (telefon nie ma tam podpowiedzi)
  const uwaga = v.zombie
    ? `<p class="pr-uwaga" role="note"><span class="pr-uwaga-i" aria-hidden="true">!</span>${esc(wJezyku(ZA_SIATKE_ZOMBIE, en))}</p>`
    : '';
  // nikt nie ma Ognia (priorytet 0 i bez stałego zajęcia Ogień): koza zgaśnie, a nikt sam do niej nie dołoży
  const kOgien = RODZAJE.indexOf('ogien');
  const ogien = v.wiersze.some((w) => (w.prio[kOgien] ?? 0) > 0 || w.stale === 'ogien');
  const bezOgnia = ogien
    ? ''
    : `<p class="pr-uwaga pr-bez-ognia" role="alert" data-uwaga="ogien"><span class="pr-uwaga-i" aria-hidden="true">!</span>${esc(wJezyku(BEZ_OGNIA, en))}</p>`;

  const kolumny = `<colgroup><col class="pr-col-os">${v.widoczne.map(() => '<col class="pr-col-k">').join('')}</colgroup>`;
  const tabela = `<table class="pr-tab">${kolumny}<thead><tr><th scope="col" class="pr-os"><span class="sr">${esc(
    t('Osoba', 'Person'),
  )}</span></th>${v.widoczne.map(naglowek).join('')}</tr></thead><tbody>${v.wiersze.map(wiersz).join('')}</tbody></table>`;

  return `${lead}${klawiatura}${zapas}${info}${bezOgnia}${uwaga}${tabela}`;
}
