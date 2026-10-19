/* Treść okien interfejsu: karta nocy, uchwała, wydarzenie, poranny raport, potwierdzenia (palenie mebli, włączenie
   sieci, polecenia nieodwracalne), menu (z linią o źródłach danych mieszkańców i przyciskiem ekranu dróg do
   zwycięstwa, który rysuje src/ui/zwyciestwo.ts), jak grać (sterowanie, budowa, praca ludzi z panelem Pracy i klawiszem
   P, zarząd, tryb zombie) i koniec gry. Czyste funkcje: dostają odczyt zarządu i zwracają HTML w czterech częściach
   (nagłówek, tytuł, treść, przyciski); przyciski mają data-act i data-arg, które obsługuje main.ts. Okno wydarzenia
   z miejscem na mapie (`Prompt.gdzie`) ma przed wyborami przycisk „Pokaż” (`event-show`): main.ts jedzie kamerą na
   miejsce i zostawia okno otwarte.
   Napisy okien są w bieżącym języku (L() przy rysowaniu, Tx w tablicach). Teksty zarządu (Tx albo polski napis ze
   starego zapisu) idą przez tr(), więc okna działają z oboma kształtami; zarządu ten moduł nie tłumaczy. Słowa
   wspólnoty (w domu komitet ulicy, w bloku zarząd spółdzielni) biorą ze słownika miejsca po polsku i po angielsku
   (words, e); bez niego mówią jak w bloku. Lista wyboru karty nocy (optionText) wyszarza „Wartę na wieży”, gdy wszystkie
   miejsca wieży zajmują inni (jak setAssign w src/gov/noc.ts). */

import { ENDINGS_EN, PATHS_EN } from '../content/data.en.ts';
import { ENDINGS, type EndingId, PATHS } from '../content/data.ts';
import { L, type Tx, tr, tx } from '../core/jezyk.ts';
import { BLOK, type Words, type WordsEn, wordsEn, wordsOf } from '../gov/miejsce.ts';
import {
  deterrence,
  KOZA_KEY,
  untilWord,
  WIEZA,
  WIEZA_KEY,
  WOOD_PER_HOUR,
  watchersOf,
  wiezaPelna,
} from '../gov/noc.ts';
import type {
  GovInput,
  GovState,
  LawOption,
  LootKey,
  NightCard,
  NightOption,
  NightReport,
  Prompt,
  StockDelta,
} from '../gov/typy.ts';
import { TICKS_PER_HOUR } from '../sim/clock.ts';
import { FURNITURE_EN } from '../sim/nazwy.en.ts';
import { BURN_TICKS, BURNABLE, FURNITURE_ACC } from '../sim/sim.ts';
import { FENCE_BEARS } from '../sim/zombie.ts';
import { esc, manyEn, num, pct, signed } from './tekst.ts';

export interface Sheet {
  /** mały napis nad tytułem, jak na tabliczce */
  kicker: string;
  title: string;
  body: string;
  foot: string;
  /** odcień okna: noc (granat), zebranie, wydarzenie, raport, menu, sąsiedzi (spotkanie), napad (sąsiedzi atakują),
      mapa miasta (okno na cały ekran, src/ui/miasto.ts), plan wyprawy z mapy (zwykłe okno w barwie mapy,
      src/ui/wyprawa.ts), ekran dróg do zwycięstwa (szeroka tabliczka w złocie) i epilog zwycięstwa (ta sama barwa,
      zwykła szerokość), oba z src/ui/zwyciestwo.ts, i odkrycie (karta po ukończeniu badania, w kolorze korka
      tablicy) */
  tone:
    | 'noc'
    | 'uchwala'
    | 'wydarzenie'
    | 'raport'
    | 'menu'
    | 'ogien'
    | 'koniec'
    | 'sasiedzi'
    | 'napad'
    | 'miasto'
    | 'wyprawa'
    | 'drogi'
    | 'zwyciestwo'
    | 'odkrycie';
  /** można zamknąć bez decyzji (Esc, poza oknem) */
  closable?: boolean;
}

/** nazwy rodzajów łupu w obu językach (karta nocy, raport, karta miejsca na mapie miasta) */
export const LOOT: Record<LootKey, Tx> = {
  wood: tx('drewno', 'wood'),
  supplies: tx('jedzenie', 'food'),
  scrap: tx('złom', 'scrap'),
  parts: tx('części', 'parts'),
  meds: tx('leki', 'meds'),
};

/** „drewno 3, jedzenie 2” (wartości bezwzględne, bez zer; po angielsku „wood 3, food 2”) */
export function lootText(d: Partial<StockDelta>): string {
  return (Object.entries(d) as [LootKey, number][])
    .filter(([, v]) => v)
    .map(([k, v]) => `${tr(LOOT[k])} ${Math.abs(v)}`)
    .join(', ');
}

const gainText = (g: NightOption['gain']): string =>
  (Object.entries(g ?? {}) as [LootKey, [number, number]][])
    .filter(([, r]) => r[1] > 0)
    .map(([k, [a, b]]) => `${tr(LOOT[k])} ${a === b ? a : `${a}–${b}`}`)
    .join(', ');

/** przycisk okna: `data-act` (i `data-arg`) obsługuje main.ts; `label` idzie do HTML bez ucieczki */
export const btn = (act: string, label: string, cls = 'btn', arg = '', extra = '') =>
  `<button type="button" class="${cls}" data-act="${act}"${arg ? ` data-arg="${esc(arg)}"` : ''}${extra}>${label}</button>`;

/** tekst zarządu w bieżącym języku albo zastępczy napis, gdy pola brak (jak ?? przy zwykłych napisach) */
const or = (t: Tx | string | null | undefined, fallback: string): string =>
  t === null || t === undefined ? fallback : tr(t);
const wielka = (s: string) => s[0].toUpperCase() + s.slice(1);

/** 1 sztukę, 2 sztuki, 5 sztuk */
export const plural = (n: number, one: string, few: string, many: string): string => {
  const d = n % 10;
  const t = n % 100;
  return n === 1 ? one : d >= 2 && d <= 4 && (t < 12 || t > 14) ? few : many;
};

// ---------------------------------------------------------------- karta nocy

/** krótki opis opcji na liście wyboru */
export function optionShort(o: NightOption, proposal: boolean): string {
  let s = tr(o.label);
  // dyżur przy kozie nie broni siatki (czuwa w kuchni), więc bez obrony
  if (o.key.startsWith('warta:') && o.key !== KOZA_KEY)
    s += L(`, obrona ${num(o.guard ?? 0)}`, `, defence ${num(o.guard ?? 0)}`);
  else if (o.key.startsWith('wyprawa:')) s += L(`, ryzyko ${pct(o.risk ?? 0)}`, `, risk ${pct(o.risk ?? 0)}`);
  if (!o.ok) s += ` (${or(o.why, L('nie da rady', 'not possible'))})`;
  else if (proposal) s += L(' · propozycja', ' · suggested');
  return s;
}

/** Tekst i dostępność opcji `o` na liście wyboru osoby `id` przy obecnym przydziale: jak `optionShort`, a pełna wieża
    (wszystkie jej miejsca zajęte przez innych) jest wyszarzona z dopiskiem. Woła ją okno karty przy rysowaniu i przy
    każdej zmianie przydziału, żeby lista każdej osoby zgadzała się z `setAssign`. */
export function optionText(
  card: NightCard,
  assign: Record<string, string>,
  id: string,
  o: NightOption,
  proposal: boolean,
): { text: string; disabled: boolean } {
  const full = o.key === WIEZA_KEY && wiezaPelna(card, assign, id);
  return {
    text: full ? `${optionShort(o, proposal)} (${L('wieża pełna', 'tower full')})` : optionShort(o, proposal),
    disabled: !o.ok || full,
  };
}

/** co znaczy wybór: zysk, ryzyko, obrona i uwaga z karty */
export function optionDetail(o: NightOption): string {
  if (!o.ok) return or(o.why, L('Nie da rady.', 'Not possible.'));
  if (o.key === 'sen')
    return or(o.note, L('Wyśpi się i rano będzie mieć siły.', 'Gets a full night’s sleep and wakes up with energy.'));
  if (o.key === KOZA_KEY)
    return or(o.note, L('Nie śpi i pilnuje ognia w kozie.', 'Stays up and keeps the stove going.'));
  if (o.key.startsWith('warta:')) return `${L('Obrona', 'Defence')} ${num(o.guard ?? 0)}. ${tr(o.note)}`.trim();
  const g = gainText(o.gain);
  const risk = pct(o.risk ?? 0);
  return L(
    `Ryzyko kłopotów ${risk}.${g ? ` Może przynieść: ${g}.` : ''} ${tr(o.note)}`,
    `Risk of trouble ${risk}.${g ? ` Might bring back: ${g}.` : ''} ${tr(o.note)}`,
  ).trim();
}

export interface NightOdds {
  /** szansa bez warty (z karty) i z obecnym przydziałem */
  chance: number;
  now: number;
  watchers: number;
}

/** szansa napadu przy obecnym przydziale: warta (z karty i ta, która już stoi z menu) i światło odstraszają
    jak przy zatwierdzeniu */
export function nightOdds(gov: GovState, i: GovInput, card: NightCard, assign: Record<string, string>): NightOdds {
  const watchers = watchersOf(i, assign);
  return { chance: card.chance, now: card.chance * deterrence(gov, i, watchers), watchers };
}

/** blok z szansą, stratami i miejscami do pilnowania (przerysowywany po każdej zmianie przydziału) */
export function oddsHtml(
  card: NightCard,
  assign: Record<string, string>,
  odds: NightOdds,
  names: Record<string, string>,
): string {
  const loss = lootText(card.loss) || L('niewiele, wszystko jest pod dachem', 'not much, it is all indoors');
  // wieża to przydział, nie miejsce napadu: jej wiersz jest za miejscami do pilnowania
  const rows = [
    ...card.posts.map((p) => ({ key: p.key, name: tr(p.name) })),
    ...(card.wieza ? [{ key: WIEZA, name: L('na wieży', 'on the tower') }] : []),
  ];
  const posts = rows
    .map((p) => {
      const who = Object.entries(assign)
        .filter(([, k]) => k === `warta:${p.key}`)
        .map(([id]) => names[id] ?? id);
      return `<li class="post ${who.length ? 'kept' : 'open'}"><span class="post-k">${esc(p.name)}</span><b class="post-v">${
        who.length ? esc(who.join(', ')) : L('nikt', 'nobody')
      }</b></li>`;
    })
    .join('');
  const level = odds.now < 0.25 ? 'ok' : odds.now < 0.5 ? 'mid' : 'bad';
  const koza = Object.entries(assign)
    .filter(([, k]) => k === KOZA_KEY)
    .map(([id]) => names[id] ?? id);
  const h = card.horde;
  if (h) {
    const fence = Math.round(h.fence * 100);
    return `<div class="odds"><div class="odd ${h.size >= 35 ? 'bad' : 'mid'}"><small class="odd-k">${L(
      'Stado nocą',
      'Herd tonight',
    )}</small><b class="odd-v">${L(`około ${h.size}`, `about ${h.size}`)}</b><em class="odd-note">${esc(
      tr(h.word),
    )} · ${L('strzał ściąga więcej', 'a shot draws more')}</em></div><div class="odd ${fence < 50 ? 'bad' : fence < 80 ? 'mid' : 'ok'}"><small class="odd-k">${L(
      'Siatka',
      'Fence',
    )}</small><b class="odd-v">${fence}%</b><em class="odd-note">${L(
      'dzida sięga przez siatkę',
      'a spear reaches through it',
    )}</em></div>${card.wood ? fuelHtml(card.wood, koza) : ''}</div><ul class="posts">${posts}</ul>`;
  }
  return `<div class="odds"><div class="odd ${level}"><small class="odd-k">${L(
    'Spróbują wejść',
    'Raid chance',
  )}</small><b class="odd-v">${pct(odds.now)}</b><em class="odd-note">${
    odds.watchers
      ? L(`bez warty ${pct(odds.chance)}`, `${pct(odds.chance)} with no watch`)
      : L('nikt nie pilnuje', 'nobody on watch')
  }</em></div><div class="odd"><small class="odd-k">${L(
    'Jeśli wejdą, zabiorą',
    'If they get in, they take',
  )}</small><b class="odd-loss">${esc(loss)}</b></div>${
    card.wood ? fuelHtml(card.wood, koza) : ''
  }</div><ul class="posts">${posts}</ul>`;
}

/** koza w nocy: do której będzie ogień przy obecnym przydziale, kto czuwa i drewno w zapasie na noc */
export function fuelHtml(wd: NonNullable<NightCard['wood']>, koza: string[]): string {
  const full = wd.have >= wd.need;
  const none = wd.have < WOOD_PER_HOUR;
  const v = !koza.length
    ? L('zgaśnie', 'goes out')
    : full
      ? L('do rana', 'till morning')
      : none
        ? L('bez drewna', 'no wood')
        : L(`do ${untilWord(wd.until)}`, `till ${wd.until === '0:00' ? 'midnight' : wd.until}`);
  const level = !koza.length || none ? 'bad' : full ? 'ok' : 'mid';
  const who = koza.length
    ? L(`czuwa ${koza.join(', ')}`, `stove watch: ${koza.join(', ')}`)
    : L('nikt nie czuwa', 'no stove watch');
  return `<div class="odd fuel ${level}"><small class="odd-k">${L(
    'Koza w nocy',
    'Stove overnight',
  )}</small><b class="odd-v">${esc(v)}</b><em class="odd-note">${esc(who)} · ${L(
    `drewno ${wd.have} szt., noc zje ${wd.need} (${WOOD_PER_HOUR} na godzinę)`,
    `wood ${wd.have}, the night needs ${wd.need} (${WOOD_PER_HOUR} an hour)`,
  )}</em></div>`;
}

export function nightSheet(
  card: NightCard,
  assign: Record<string, string>,
  odds: NightOdds,
  words: Words = wordsOf(BLOK),
  e: WordsEn = wordsEn(BLOK),
): Sheet {
  const names = Object.fromEntries(card.people.map((p) => [p.id, p.name]));
  const rows = card.people
    .map((p) => {
      const sel = assign[p.id] ?? p.proposal;
      const opts = p.options
        .map((o) => {
          const t = optionText(card, assign, p.id, o, o.key === p.proposal);
          return `<option value="${esc(o.key)}"${o.key === sel ? ' selected' : ''}${t.disabled ? ' disabled' : ''}>${esc(t.text)}</option>`;
        })
        .join('');
      const cur = p.options.find((o) => o.key === sel) ?? p.options[0];
      return `<li class="mate"><div class="who"><b class="who-n">${esc(p.name)}</b><small class="who-s">${L(
        'siły',
        'energy',
      )} ${Math.round(p.needs.rest)} · ${L('zdrowie', 'health')} ${Math.round(
        p.needs.health,
      )}</small></div><select class="pick" data-id="${esc(p.id)}" aria-label="${L('Ta noc', 'Tonight')}: ${esc(
        p.name,
      )}">${opts}</select><p class="opt" data-for="${esc(p.id)}">${esc(optionDetail(cur))}</p></li>`;
    })
    .join('');
  const first = card.day === 1;
  const advice = tr(card.advice);
  return {
    tone: 'noc',
    kicker: L('Karta nocy, 20:00', 'Night orders, 20:00'),
    title: first
      ? L('Pierwsza noc za siatką', 'First night behind the fence')
      : L(`Noc ${card.day}`, `Night ${card.day}`),
    body: `<p class="lead">${
      card.horde
        ? L(
            'Za siatką zbiera się stado. Kto stoi z dzidą przy siatce, kto śpi, a kto wychodzi po zapasy?',
            'A herd is gathering beyond the fence. Who stands at the fence with a spear, who sleeps, and who goes out for supplies?',
          )
        : first
          ? L(
              'Dym z kozy widać z daleka. Kto śpi, kto pilnuje, a kto idzie po zapasy?',
              'Smoke from the stove can be seen for miles. Who sleeps, who keeps watch, and who goes out for supplies?',
            )
          : L(
              'Kto śpi, kto pilnuje siatki albo kozy, a kto idzie po zapasy?',
              'Who sleeps, who watches the fence or the stove, and who goes out for supplies?',
            )
    }</p><div data-odds>${oddsHtml(card, assign, odds, names)}</div><ul class="crew">${rows}</ul>${
      advice
        ? `<p class="advice"><b class="advice-k">${L(`${words.Zarzad} radzi:`, `${e.Zarzad} suggests:`)}</b> <span data-advice>${esc(advice)}</span></p>`
        : ''
    }`,
    foot: `${btn('night-reset', L(`Jak radzi ${words.zarzad.krotko}`, `As ${e.krotko} suggests`), 'btn ghost')}${btn(
      'night-go',
      L('Zacznijcie noc', 'Start the night'),
      'btn go',
    )}`,
  };
}

// ---------------------------------------------------------------- uchwała

function lawItem(o: LawOption): string {
  const tag = o.path === 'base' ? '' : `<span class="tag ${o.path}">${esc(L(PATHS[o.path], PATHS_EN[o.path]))}</span>`;
  const act =
    o.s === 'ok'
      ? btn('law', L('Podpisać', 'Sign'), 'btn go', o.id)
      : `<p class="law-why">${esc(
          o.s === 'done'
            ? L('Już obowiązuje.', 'Already in force.')
            : or(o.why, L('Teraz nie można.', 'Not possible right now.')),
        )}</p>`;
  return `<li class="law ${o.s}"><div class="law-head"><b class="law-n">${esc(tr(o.name))}</b>${tag}</div><p class="law-d">${esc(
    tr(o.desc),
  )}</p>${act}</li>`;
}

export function lawSheet(
  p: Extract<Prompt, { k: 'uchwala' }>,
  words: Words = wordsOf(BLOK),
  e: WordsEn = wordsEn(BLOK),
): Sheet {
  return {
    tone: 'uchwala',
    kicker: L(`Zebranie ${words.zarzad.dk}, dzień ${p.day}, 19:30`, `${e.zebranie}, day ${p.day}, 19:30`),
    title: p.first ? L('Pierwsza uchwała', 'First resolution') : L(`Uchwała ${words.zarzad.dk}`, e.uchwala),
    body: `<p class="lead">${
      p.first
        ? L(
            `Wieczór przy kozie. ${wielka(words.mieszkancy.m)} czekają, jakie zasady ustalicie na pierwszą noc. Jedną uchwałę można podjąć dziś, następną najwcześniej za półtorej doby.`,
            `An evening by the stove. The ${e.mieszkancy} are waiting to hear what rules you will set for the first night. You can pass one resolution today, and the next one in a day and a half at the earliest.`,
          )
        : L(
            'Można podjąć jedną uchwałę. Drogi porządku i wspólnoty się wykluczają.',
            'You can pass one resolution. The Order and Community paths rule each other out.',
          )
    }</p><ul class="laws">${p.options.map(lawItem).join('')}</ul>`,
    foot: btn(
      'law-skip',
      p.first
        ? L('Nic dziś nie uchwalamy (zaufanie −1)', 'No resolution today (trust −1)')
        : L('Nic dziś nie uchwalamy', 'No resolution today'),
      'btn ghost',
    ),
  };
}

// ---------------------------------------------------------------- wydarzenie

export function eventSheet(
  p: Extract<Prompt, { k: 'wydarzenie' }>,
  words: Words = wordsOf(BLOK),
  e: WordsEn = wordsEn(BLOK),
): Sheet {
  const text = tr(p.text)
    .split(/\n+/)
    .map((l) => `<p>${esc(l)}</p>`)
    .join('');
  return {
    tone: 'wydarzenie',
    kicker: L(words.naglowek, e.naglowek),
    title: esc(tr(p.title)),
    body: text,
    // karta z miejscem na mapie: „Pokaż” (kamera jedzie na miejsce, okno zostaje) przed wyborami
    foot: `${p.gdzie ? btn('event-show', L('Pokaż', 'Show'), 'btn ghost') : ''}<div class="choices">${p.choices
      .map((c, k) => btn('event', esc(tr(c.label)), 'btn', String(k), c.ok ? '' : ' disabled'))
      .join('')}</div>`,
  };
}

// ---------------------------------------------------------------- raport

const RAID_TITLE: Record<NightReport['raid'], Tx> = {
  brak: tx('Spokojna noc', 'A quiet night'),
  odparty: tx('Napad odparty', 'Raid fought off'),
  wtargnięcie: tx('Szabrownicy weszli', 'Looters got in'),
};

export function reportSheet(r: NightReport): Sheet {
  const lines = r.lines.map((l) => `<li class="line">${esc(tr(l))}</li>`).join('');
  const stolen = lootText(r.stolen);
  const loot = lootText(r.loot);
  const kit = r.kitchen ?? null;
  const warm = kit === null ? '' : kit >= 18 ? ' good' : kit < 15 ? ' bad' : '';
  const tally = [
    kit !== null
      ? `<li class="tal${warm}"><small class="tal-k">${L('Kuchnia rano', 'Kitchen this morning')}</small><b>${Math.round(kit)}°C${
          r.koza?.length ? L(`, przy kozie ${esc(r.koza.join(', '))}`, `, stove watch: ${esc(r.koza.join(', '))}`) : ''
        }</b></li>`
      : '',
    stolen ? `<li class="tal bad"><small class="tal-k">${L('Zabrali', 'Taken')}</small><b>${esc(stolen)}</b></li>` : '',
    loot
      ? `<li class="tal good"><small class="tal-k">${L('Z wypraw', 'Brought back')}</small><b>${esc(loot)}</b></li>`
      : '',
    ...r.hurt.map(
      (h) =>
        `<li class="tal bad"><small class="tal-k">${L('Ranni', 'Hurt')}</small><b>${esc(h.name)}, ${L(
          'zdrowie',
          'health',
        )} ${signed(h.d, 0)}</b></li>`,
    ),
  ].join('');
  const meter = (label: string, v: number, d: number, good: boolean) =>
    `<div class="meter"><small class="meter-k">${label}</small><b class="meter-v">${Math.round(v)}</b><em class="meter-d${
      d === 0 ? '' : good ? ' good' : ' bad'
    }">${signed(d)}</em></div>`;
  return {
    tone: 'raport',
    kicker: L(`Raport, dzień ${r.day + 1}, 6:00`, `Morning report, day ${r.day + 1}, 6:00`),
    title: tr(RAID_TITLE[r.raid]),
    body: `<ul class="lines">${lines}</ul>${tally ? `<ul class="tally">${tally}</ul>` : ''}<div class="meters">${meter(
      L('Zaufanie', 'Trust'),
      r.trust,
      r.dTrust,
      r.dTrust >= 0,
    )}${meter(L('Wkurzenie', 'Anger'), r.anger, r.dAnger, r.dAnger <= 0)}</div>`,
    foot: btn('report-ok', L('Nowy dzień', 'New day'), 'btn go'),
  };
}

// ---------------------------------------------------------------- palenie mebli

export function burnSheet(
  kind: string,
  owner: string | null,
  softer: boolean,
  words: Words = wordsOf(BLOK),
  e: WordsEn = wordsEn(BLOK),
): Sheet {
  const wood = BURNABLE[kind] ?? 1;
  const hours = (wood * BURN_TICKS) / TICKS_PER_HOUR;
  const what = L(FURNITURE_ACC[kind] ?? 'mebel', FURNITURE_EN[kind] ?? 'furniture');
  return {
    tone: 'ogien',
    kicker: L('Meble na opał', 'Furniture for fuel'),
    title: L(`Spalić ${esc(what)}?`, `Burn the ${esc(what)}?`),
    body: `<p>${L(
      `Da ${wood} ${plural(wood, 'sztukę', 'sztuki', 'sztuk')} drewna, około ${num(hours)} h ognia w kozie. Mebla już nie będzie.`,
      `Good for ${manyEn(wood, 'piece', 'pieces')} of wood, about ${num(hours)} h of fire in the stove. Once it’s gone, it’s gone.`,
    )}</p><p>${
      owner
        ? L(
            `To mebel osoby: ${esc(owner)}. Bardzo to przeżyje, a reszta ${words.zarzad.dk} też to poczuje.`,
            `It belongs to ${esc(owner)}, who will take it hard, and the rest of ${e.krotko} will feel it too.`,
          )
        : L(
            `${words.Zarzad} to poczuje: palimy coś, co ktoś kiedyś kupił na raty.`,
            `${e.Zarzad} will feel it: someone once bought this on interest-free instalments.`,
          )
    }${softer ? L(' Uchwała „Meble na opał” łagodzi to o połowę.', ' The “Furniture for fuel” resolution halves that.') : ''}</p>`,
    foot: `${btn('burn-no', L('Zostawić', 'Keep it'), 'btn ghost')}${btn('burn-yes', L('Spalić', 'Burn it'), 'btn danger')}`,
    closable: true,
  };
}

// ---------------------------------------------------------------- menu, jak grać, koniec

/** Skąd są wymyśleni mieszkańcy: linia z sekcji „Linia do ekranu »O grze«” w public/data/mieszkancy/LICENCJE.md
    (plik robi tools/dane/licencje.ts; test pilnuje, żeby tekst się zgadzał), a obok link do całego pliku. */
export const DANE_MIESZKANCOW =
  'Dane demograficzne: GUS (NSP 2021 z publikacją „Warunki mieszkaniowe w Polsce”, BDL na CC BY 4.0, BREC 2021, tablice trwania życia 2025, Prognoza ludności 2023-2060, Rocznik Demograficzny 2025, Sytuacja demograficzna Polski do 2025 r.) i Eurostat (CC BY 4.0), przetworzone na wymyślonych mieszkańców; imiona i nazwiska: rejestr PESEL, Ministerstwo Cyfryzacji, dane.gov.pl (CC0); odmiana: SGJP (BSD-2, pełna nota w repozytorium).';
/** to samo zdanie po angielsku; nazwy źródeł, publikacji i instytucji zostają takie jak w LICENCJE.md */
export const DANE_MIESZKANCOW_EN =
  'Demographic data: GUS (NSP 2021 census with the publication “Warunki mieszkaniowe w Polsce”, BDL under CC BY 4.0, BREC 2021, life tables 2025, Prognoza ludności 2023-2060, Rocznik Demograficzny 2025, Sytuacja demograficzna Polski do 2025 r.) and Eurostat (CC BY 4.0), processed into made-up residents; first names and surnames: PESEL register, Ministerstwo Cyfryzacji, dane.gov.pl (CC0); name declension: SGJP (BSD-2, full notice in the repository).';
export const LICENCJE_MIESZKANCOW = 'data/mieszkancy/LICENCJE.md';

export function menuSheet(note: string): Sheet {
  return {
    tone: 'menu',
    kicker: 'Za Murem 0.4',
    title: 'Menu',
    body: `<div class="menu-list">${btn('menu-back', L('Wróć do gry', 'Back to the game'), 'btn go')}${btn(
      'menu-help',
      L('Jak grać', 'How to play'),
    )}${btn('menu-zwyciestwo', L('Drogi do zwycięstwa', 'Roads to victory'))}${btn(
      'menu-start',
      L('Zapisz i wróć do ekranu startowego', 'Save and go back to the start screen'),
    )}</div><p class="fine">${esc(note)}</p><p class="fine dane">${esc(
      L(DANE_MIESZKANCOW, DANE_MIESZKANCOW_EN),
    )} <a href="${LICENCJE_MIESZKANCOW}" target="_blank" rel="noopener">${L('Źródła i licencje', 'Sources and licences')}</a></p>`,
    foot: '',
    closable: true,
  };
}

/** pomoc trybu zombie: szwendacze, stado, broń, ugryzienia */
const ZOMBIE_HELP = tx(
  `<h3 class="help-h">Tryb zombie</h3><ul class="help"><li>Za siatką snują się szwendacze. Są wolni, ale idą za hałasem i za tym, co widzą. Nocą przychodzi stado i napiera na siatkę, a każdej nocy jest ich więcej.</li><li>Dzida sięga przez siatkę: warta z dzidą zabija tych, którzy napierają. Nóż, łom i siekiera działają dopiero po tej samej stronie siatki. Strzał zabija od razu, ale słychać go z daleka i ściąga następnych.</li><li>Kilku szwendaczy siatki nie przewróci, tylko ją zużywają. Pada dopiero pod tłumem: od ${FENCE_BEARS} napierających w jednym miejscu, tym szybciej, im więcej ich jest. Dźgajcie napierających, zanim się zbiorą, a zużytą siatkę wzmacniajcie.</li><li>Uszkodzoną siatkę wzmacnia się deskami albo złomem, a dziurę łata. Dzidę robi się z desek i złomu na stercie. „Do broni!” wysyła wszystkich zdolnych na wartę przy siatce.</li><li>Ugryzienie to gorączka i śmierć w niecałą dobę. Kto ugryziony w rękę albo nogę, tego da się uratować amputacją w ciągu dwóch godzin. Każdy zmarły wstaje po godzinie, chyba że ktoś go dobije.</li></ul>`,
  `<h3 class="help-h">Zombie mode</h3><ul class="help"><li>Shamblers drift around beyond the fence. They are slow, but they follow noise and anything they can see. At night the herd comes and presses against the fence, and every night there are more of them.</li><li>A spear reaches through the fence: a guard with a spear kills the ones pressing against it. A knife, crowbar or axe only works on the same side of the fence. A shot kills outright, but it can be heard from far away and draws more of them in.</li><li>A few shamblers cannot bring the fence down; they only wear it out. It goes under a crowd: ${FENCE_BEARS} or more pressing in one spot, and the bigger the crowd, the faster. Spear the ones pressing before they bunch up, and shore up the worn fence.</li><li>Shore up a damaged fence with planks or scrap, and patch any hole. Spears are made from planks and scrap: use “Make a spear” on a pile of either. “To arms!” sends everyone who can fight to stand watch at the fence.</li><li>A bite means fever and death in less than a day. Anyone bitten on an arm or a leg can be saved by amputation within two hours. Everyone who dies gets back up an hour later, unless somebody finishes them off.</li></ul>`,
);

/** pomoc o budowie i przeszukiwaniu (M2, fala 1): w bloku pustych mieszkań, w domu domu komitetu (słownik miejsca) */
function buildHelp(touch: boolean, words: Words, e: WordsEn): string {
  const s = words.szukanie;
  const fetch = tx(
    `${words.Zarzad} sam przynosi materiały i buduje. Deski, złom i części dają przeszukiwanie ${s.d} i rozbiórka.`,
    `${e.Zarzad} fetches the materials and does the building. Planks, scrap and parts come from searching ${e.szukanie.d} and taking things apart.`,
  );
  const items = touch
    ? [
        tx(
          'Przycisk Budowa u góry otwiera panel budowy: zakładki Dom, Podwórko i Obwód, z miniaturą, kosztem, czasem pracy i działaniem.',
          'The Build button at the top opens the build panel: Home, Yard and Perimeter tabs, each with a thumbnail, cost, work time and effect.',
        ),
        tx(
          'Po wyborze plan budowy jedzie za palcem: stuknięcie stawia, przyciski na dole obracają i anulują. Zielony plan da się postawić, czerwony mówi, czemu nie.',
          'Once you pick one, the plan follows your finger: tap to place it, the buttons at the bottom rotate and cancel. A green plan fits; a red one tells you why not.',
        ),
        fetch,
        tx(s.pomoc.dotyk, e.szukanie.pomoc.dotyk),
      ]
    : [
        tx(
          'Przycisk Budowa u góry albo klawisz B otwiera panel budowy: zakładki Dom, Podwórko i Obwód, z miniaturą, kosztem, czasem pracy i działaniem.',
          'The Build button at the top, or the B key, opens the build panel: Home, Yard and Perimeter tabs, each with a thumbnail, cost, work time and effect.',
        ),
        tx(
          'Po wyborze plan budowy jedzie za kursorem: lewy klik stawia, R obraca, prawy klik albo Esc anuluje, z Shiftem stawia się kilka naraz. Zielony plan da się postawić, czerwony mówi, czemu nie.',
          'Once you pick one, the plan follows the cursor: left-click places it, R rotates, right-click or Esc cancels, and with Shift you can place several in a row. A green plan fits; a red one tells you why not.',
        ),
        fetch,
        tx(s.pomoc.mysz, e.szukanie.pomoc.mysz),
      ];
  return `<h3 class="help-h">${esc(L(s.naglowek, e.szukanie.naglowek))}</h3><ul class="help">${items
    .map((t) => `<li>${esc(tr(t))}</li>`)
    .join('')}</ul>`;
}

/** Pomoc o pracy ludzi (docs/superpowers/specs/2026-10-19-praca-ludzi-design.md): panel Pracy (przycisk u góry i klawisz
    P), priorytety rodzajów pracy, zapasy, reguła klawiatury w tabeli (ta sama, co w leadzie panelu, patrz
    src/ui/panelpracy.ts) i ustawienia na karcie osoby. Bez słów miejsca: tekst jest taki sam w bloku i w domu. */
function workHelp(touch: boolean): string {
  const stock = tx(
    'Plus i minus pod „Trzymać w zapasie” ustawiają, ile drewna, desek i części ma leżeć w zapasie; 0 wyłącza.',
    'The plus and minus buttons under “Keep in stock” set how much wood, planks and parts to keep; 0 turns it off.',
  );
  const card = tx(
    'Na karcie osoby można dać jej stałe zajęcie (zlecenia tego rodzaju bierze przed wszystkimi) i pozwolić jej wychodzić za siatkę za dnia bez polecenia.',
    'On a person’s card you can give them a fixed job (they take jobs of that kind before anything else) and let them go outside the fence by day without orders.',
  );
  const items = touch
    ? [
        tx(
          'Przycisk Praca u góry otwiera panel Pracy: tabela, kto czym zajmuje się sam, gdy nikt nie wydaje rozkazów. 1 to najpierw, 4 na końcu, puste: nie robi. Stuknij komórkę, żeby zmienić priorytet, przytrzymaj, żeby cofnąć.',
          'The Work button at the top opens the Work panel: a table of what each person does on their own when nobody gives an order. 1 goes first, 4 last, blank: won’t do it. Tap a cell to change it, press and hold to go back.',
        ),
        stock,
        card,
      ]
    : [
        tx(
          'Przycisk Praca u góry albo klawisz P otwiera panel Pracy: tabela, kto czym zajmuje się sam, gdy nikt nie wydaje rozkazów. 1 to najpierw, 4 na końcu, puste: nie robi. Klik w komórkę zmienia priorytet, prawy przycisk w drugą stronę.',
          'The Work button at the top, or the P key, opens the Work panel: a table of what each person does on their own when nobody gives an order. 1 goes first, 4 last, blank: won’t do it. Click a cell to change it, right-click to go back.',
        ),
        stock,
        tx(
          'Z klawiatury: Tab i strzałki wybierają komórkę, cyfry 0–4 ustawiają jej priorytet. Po kliknięciu myszą spacja i 1–4 znów sterują grą.',
          'From the keyboard: Tab and the arrows pick a cell, digits 0–4 set its priority. After a mouse click, Space and 1–4 control the game again.',
        ),
        card,
      ];
  return `<h3 class="help-h">${L('Praca', 'Work')}</h3><ul class="help">${items
    .map((t) => `<li>${esc(tr(t))}</li>`)
    .join('')}</ul>`;
}

/** potwierdzenie polecenia, którego nie da się cofnąć (rozbiórka, zajęcie mieszkania; palenie ma własne okno); `note`
    zastępuje zdanie „Tego nie da się cofnąć.” tam, gdzie byłoby nieprawdziwe (nowa gra po zwycięstwie zostawia zapis) */
export function confirmSheet(label: string, note?: string): Sheet {
  return {
    tone: 'ogien',
    kicker: L('Na pewno?', 'Are you sure?'),
    title: esc(label),
    body: `<p>${note === undefined ? L('Tego nie da się cofnąć.', 'This cannot be undone.') : esc(note)}</p>`,
    foot: `${btn('confirm-no', L('Nie', 'No'), 'btn ghost')}${btn('confirm-yes', label, 'btn go')}`,
    closable: true,
  };
}

/** potwierdzenie włączenia sieci (badania, zbadana sieć bez miedzi): nieodwracalne, więc z potwierdzeniem; włączona sieć
    to czwarty kamień drogi technologii, a epilog daje dopiero fabryka; przyciski jak w `confirmSheet`, więc obsługuje je
    ten sam kod w main.ts */
export function siecSheet(): Sheet {
  return {
    tone: 'ogien',
    kicker: L('Na pewno?', 'Are you sure?'),
    title: L('Włączyć sieć bez miedzi?', 'Switch on the copper-free grid?'),
    body: `<p>${L('Tej nocy zapalą się okna w całym terenie.', 'Tonight every window on your ground will light up.')}</p><p>${L(
      'Tego nie da się cofnąć.',
      'This cannot be undone.',
    )}</p>`,
    foot: `${btn('confirm-no', L('Nie', 'No'), 'btn ghost')}${btn('confirm-yes', L('Włączyć sieć', 'Switch on the grid'), 'btn go')}`,
    closable: true,
  };
}

export function helpSheet(
  touch: boolean,
  zombie = false,
  words: Words = wordsOf(BLOK),
  e: WordsEn = wordsEn(BLOK),
): Sheet {
  const z = words.zarzad.dk;
  const ctl = touch
    ? L(
        `<li>Stuknięcie w człowieka z ${z} zaznacza go.</li><li>Rząd portretów pod paskiem to wasi ludzie: stuknięcie w portret zaznacza osobę i pokazuje ją na mapie, drugie stuknięcie prowadzi za nią kamerę.</li><li>Stuknięcie w miejsce wydaje najprostsze polecenie: idź, zetnij, zanieś, dołóż.</li><li>Przytrzymanie palca pokazuje wszystkie polecenia w tym miejscu, także palenie mebli.</li><li>Jeden palec przesuwa mapę, dwa przybliżają.</li>`,
        `<li>Tap someone from ${e.krotko} to select them.</li><li>The row of portraits under the top bar is your people: tap a portrait to select them and show them on the map, tap again to make the camera follow.</li><li>Tap a spot to give the simplest order: go, chop, haul, feed the stove.</li><li>Press and hold to see every order for that spot, burning furniture included.</li><li>One finger moves the map, two fingers zoom.</li>`,
      )
    : L(
        `<li>Klik zaznacza człowieka z ${z}, Shift i przeciąganie zaznacza ramką kilku naraz.</li><li>Rząd portretów pod paskiem to wasi ludzie, z ikonami głodu, zimna, ran, ugryzienia, snu, warty, wyprawy i badań: klik zaznacza osobę i pokazuje ją na mapie, drugi klik prowadzi za nią kamerę, Shift dokłada do zaznaczenia. Klawisze Q i E przełączają ludzi po kolei.</li><li>Prawy przycisk pokazuje polecenia w tym miejscu: idź, zetnij, zanieś do składu, dołóż do kozy, gotuj, spal mebel.</li><li>Kółko przybliża, przeciąganie przesuwa mapę, WASD też.</li><li>Na gładziku kliknięcie dwoma palcami albo Ctrl+klik to prawy przycisk, szczypanie przybliża, dwa palce przesuwają mapę.</li><li>Spacja to pauza, 1–4 tempo (do 8×).</li>`,
        `<li>Click someone from ${e.krotko} to select them; Shift-drag to select several with a box.</li><li>The row of portraits under the top bar is your people, with icons for hunger, cold, wounds, bites, sleep, watch, runs and research: click one to select them and show them on the map, click again to make the camera follow, Shift-click to add to the selection. Keys Q and E step through them one by one.</li><li>Right-click shows the orders for that spot: go, chop, haul to the woodpile, feed the stove, cook, burn furniture.</li><li>Scroll to zoom; drag or use WASD to move the map.</li><li>On a trackpad, a two-finger click or Ctrl+click works as a right-click; pinch to zoom and swipe with two fingers to move the map.</li><li>Space pauses, 1–4 set the speed (up to 8×).</li>`,
      );
  return {
    tone: 'menu',
    kicker: 'Za Murem 0.4',
    title: L('Jak grać', 'How to play'),
    body: `<h3 class="help-h">${L('Sterowanie', 'Controls')}</h3><ul class="help">${ctl}</ul>${buildHelp(touch, words, e)}${workHelp(touch)}<h3 class="help-h">${L(words.Zarzad, e.Zarzad)}</h3><ul class="help">${L(
      `<li>Prowadzicie ${words.zarzad.pelny} w 2051 roku. Czterech ludzi, koza w kuchni i dziurawa siatka wokół podwórka.</li><li>Pilnujcie potrzeb na karcie osoby: najedzenie, ciepło, siły, zdrowie, bezpieczeństwo i nastrój.</li><li>Koza zjada drewno. Pole „koza” u góry mówi, na ile godzin starczy ognia; przed nocą zgromadźcie zapas (ścinanie drzew albo meble na opał).</li><li>O 19:30 zebranie i uchwała, o 20:00 karta nocy: kto śpi, kto trzyma wartę, kto czuwa przy kozie, kto idzie na wyprawę. Bez dyżuru koza gaśnie w nocy, bo wszyscy śpią. Noc biegnie potem szybciej (6×), rano raport i wasze tempo wraca.</li><li>Zaufanie i wkurzenie ${words.mieszkancy.d} liczą się z każdej decyzji. Przy zerowym zaufaniu ludzie odejdą, przy pełnym wkurzeniu ${words.walne} odwoła ${words.zarzad.krotko}.</li><li>Każdy z ${z} ma jedną broń, zapasowa leży w magazynie (karta osoby: „Zmień”). Prawy przycisk na wrogu: „Atakuj”. Warta bije sama, jeśli wróg jest w zasięgu jej broni.</li>`,
      `<li>You are ${e.pelny} in 2051. Four people, a potbelly stove in the kitchen and a fence full of holes around the yard.</li><li>Watch everyone’s needs on their card: Fed, Warmth, Energy, Health, Safety and Mood.</li><li>The stove eats wood. The “stove” box at the top shows how many hours of fire are left; stock up before night (chop down trees or burn furniture).</li><li>At 19:30 ${e.krotko} meets and passes a resolution, and at 20:00 come the Night orders: who sleeps, who keeps watch, who sits up with the stove, who goes on a run. With nobody on stove watch, the fire goes out overnight, because everyone is asleep. After that the night runs faster (6×), and in the morning you get a report and your own speed back.</li><li>Every decision moves the ${e.mieszkancy}’ trust and anger. At zero trust people leave; at full anger ${e.walne} votes ${e.krotko} out.</li><li>Everyone on ${e.krotko} carries one weapon, and spares are kept in the storeroom (person card: “Swap”). Right-click an enemy: “Attack”. The watch fights on its own when an enemy comes within reach of its weapons.</li>`,
    )}</ul>${zombie ? tr(ZOMBIE_HELP) : ''}<h3 class="help-h">${L('Na razie', 'For now')}</h3><p>${L(
      `W wersji 0.4 są noce za siatką, budowa, ${words.szukanie.wersja}, przybysze i tryb zombie. Badania, zima i reszta gospodarki przyjdą w kolejnych wersjach.`,
      `Version 0.4 has nights behind the fence, building, ${e.szukanie.wersja}, newcomers and Zombie mode. Research, winter and the rest of the economy will come in later versions.`,
    )}</p>`,
    foot: btn('help-back', L('Wróć', 'Back'), 'btn go'),
    closable: true,
  };
}

export function endSheet(id: EndingId, words: Words = wordsOf(BLOK), e: WordsEn = wordsEn(BLOK)): Sheet {
  // zakończenia z wersją dla miejsca ze słownika (w domu bez walnego i klatek), reszta z 0.3
  const pl = words.koniec[id] ?? ENDINGS[id];
  const en = e.koniec[id] ?? ENDINGS_EN[id];
  return {
    tone: 'koniec',
    kicker: L('Koniec gry', 'Game over'),
    title: esc(L(pl.title, en.title)),
    body: `<p>${esc(L(pl.text, en.text))}</p>`,
    foot: btn('end-start', L('Od nowa', 'Start again'), 'btn go'),
  };
}
