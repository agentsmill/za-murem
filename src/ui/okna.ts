/* Treść okien interfejsu: karta nocy, uchwała, wydarzenie, poranny raport, potwierdzenie palenia mebli,
   menu (z linią o źródłach danych mieszkańców), jak grać i koniec gry. Czyste funkcje: dostają odczyt zarządu i zwracają HTML w czterech częściach
   (nagłówek, tytuł, treść, przyciski); przyciski mają data-act i data-arg, które obsługuje main.ts. */

import { ENDINGS, type EndingId, PATHS } from '../content/data.ts';
import { tr } from '../core/jezyk.ts';
import { deterrence, KOZA_KEY, untilWord, WOOD_PER_HOUR, watchersOf } from '../gov/noc.ts';
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
import { BURN_TICKS, BURNABLE, FURNITURE_ACC } from '../sim/sim.ts';
import { esc, num, pct, signed } from './tekst.ts';

export interface Sheet {
  /** mały napis nad tytułem, jak na tabliczce */
  kicker: string;
  title: string;
  body: string;
  foot: string;
  /** odcień okna: noc (granat), zebranie, wydarzenie, raport, menu */
  tone: 'noc' | 'uchwala' | 'wydarzenie' | 'raport' | 'menu' | 'ogien' | 'koniec';
  /** można zamknąć bez decyzji (Esc, poza oknem) */
  closable?: boolean;
}

const LOOT: Record<LootKey, string> = {
  wood: 'drewno',
  supplies: 'jedzenie',
  scrap: 'złom',
  parts: 'części',
  meds: 'leki',
};

/** „drewno 3, jedzenie 2” (wartości bezwzględne, bez zer) */
export function lootText(d: Partial<StockDelta>): string {
  return (Object.entries(d) as [LootKey, number][])
    .filter(([, v]) => v)
    .map(([k, v]) => `${LOOT[k]} ${Math.abs(v)}`)
    .join(', ');
}

const gainText = (g: NightOption['gain']): string =>
  (Object.entries(g ?? {}) as [LootKey, [number, number]][])
    .filter(([, r]) => r[1] > 0)
    .map(([k, [a, b]]) => `${LOOT[k]} ${a === b ? a : `${a}–${b}`}`)
    .join(', ');

const btn = (act: string, label: string, cls = 'btn', arg = '', extra = '') =>
  `<button type="button" class="${cls}" data-act="${act}"${arg ? ` data-arg="${esc(arg)}"` : ''}${extra}>${label}</button>`;

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
  if (o.key.startsWith('warta:') && o.key !== KOZA_KEY) s += `, obrona ${num(o.guard ?? 0)}`;
  else if (o.key.startsWith('wyprawa:')) s += `, ryzyko ${pct(o.risk ?? 0)}`;
  if (!o.ok) s += ` (${o.why ? tr(o.why) : 'nie da rady'})`;
  else if (proposal) s += ' · propozycja';
  return s;
}

/** co znaczy wybór: zysk, ryzyko, obrona i uwaga z karty */
export function optionDetail(o: NightOption): string {
  if (!o.ok) return o.why ? tr(o.why) : 'Nie da rady.';
  if (o.key === 'sen') return o.note ? tr(o.note) : 'Wyśpi się i rano będzie mieć siły.';
  if (o.key === KOZA_KEY) return o.note ? tr(o.note) : 'Nie śpi i pilnuje ognia w kozie.';
  if (o.key.startsWith('warta:')) return `Obrona ${num(o.guard ?? 0)}. ${tr(o.note)}`.trim();
  const g = gainText(o.gain);
  return `Ryzyko kłopotów ${pct(o.risk ?? 0)}.${g ? ` Może przynieść: ${g}.` : ''} ${tr(o.note)}`.trim();
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
  const loss = lootText(card.loss) || 'niewiele, wszystko jest pod dachem';
  const posts = card.posts
    .map((p) => {
      const who = Object.entries(assign)
        .filter(([, k]) => k === `warta:${p.key}`)
        .map(([id]) => names[id] ?? id);
      return `<li class="post ${who.length ? 'kept' : 'open'}"><span class="post-k">${esc(tr(p.name))}</span><b class="post-v">${
        who.length ? esc(who.join(', ')) : 'nikt'
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
    return `<div class="odds"><div class="odd ${h.size >= 35 ? 'bad' : 'mid'}"><small class="odd-k">Stado nocą</small><b class="odd-v">około ${h.size}</b><em class="odd-note">${esc(
      tr(h.word),
    )} · strzał ściąga więcej</em></div><div class="odd ${fence < 50 ? 'bad' : fence < 80 ? 'mid' : 'ok'}"><small class="odd-k">Siatka</small><b class="odd-v">${fence}%</b><em class="odd-note">dzida sięga przez siatkę</em></div>${
      card.wood ? fuelHtml(card.wood, koza) : ''
    }</div><ul class="posts">${posts}</ul>`;
  }
  return `<div class="odds"><div class="odd ${level}"><small class="odd-k">Spróbują wejść</small><b class="odd-v">${pct(odds.now)}</b><em class="odd-note">${
    odds.watchers ? `bez warty ${pct(odds.chance)}` : 'nikt nie pilnuje'
  }</em></div><div class="odd"><small class="odd-k">Jeśli wejdą, zabiorą</small><b class="odd-loss">${esc(loss)}</b></div>${
    card.wood ? fuelHtml(card.wood, koza) : ''
  }</div><ul class="posts">${posts}</ul>`;
}

/** koza w nocy: do której będzie ogień przy obecnym przydziale, kto czuwa i drewno w zapasie na noc */
export function fuelHtml(wd: NonNullable<NightCard['wood']>, koza: string[]): string {
  const full = wd.have >= wd.need;
  const none = wd.have < WOOD_PER_HOUR;
  const v = !koza.length ? 'zgaśnie' : full ? 'do rana' : none ? 'bez drewna' : `do ${untilWord(wd.until)}`;
  const level = !koza.length || none ? 'bad' : full ? 'ok' : 'mid';
  const who = koza.length ? `czuwa ${koza.join(', ')}` : 'nikt nie czuwa';
  return `<div class="odd fuel ${level}"><small class="odd-k">Koza w nocy</small><b class="odd-v">${esc(v)}</b><em class="odd-note">${esc(
    who,
  )} · drewno ${wd.have} szt., noc zje ${wd.need} (2 na godzinę)</em></div>`;
}

export function nightSheet(card: NightCard, assign: Record<string, string>, odds: NightOdds): Sheet {
  const names = Object.fromEntries(card.people.map((p) => [p.id, p.name]));
  const rows = card.people
    .map((p) => {
      const sel = assign[p.id] ?? p.proposal;
      const opts = p.options
        .map(
          (o) =>
            `<option value="${esc(o.key)}"${o.key === sel ? ' selected' : ''}${o.ok ? '' : ' disabled'}>${esc(optionShort(o, o.key === p.proposal))}</option>`,
        )
        .join('');
      const cur = p.options.find((o) => o.key === sel) ?? p.options[0];
      return `<li class="mate"><div class="who"><b class="who-n">${esc(p.name)}</b><small class="who-s">siły ${Math.round(
        p.needs.rest,
      )} · zdrowie ${Math.round(p.needs.health)}</small></div><select class="pick" data-id="${esc(p.id)}" aria-label="Ta noc: ${esc(
        p.name,
      )}">${opts}</select><p class="opt" data-for="${esc(p.id)}">${esc(optionDetail(cur))}</p></li>`;
    })
    .join('');
  const first = card.day === 1;
  return {
    tone: 'noc',
    kicker: `Karta nocy, 20:00`,
    title: first ? 'Pierwsza noc za siatką' : `Noc ${card.day}`,
    body: `<p class="lead">${
      card.horde
        ? 'Za siatką zbiera się stado. Kto stoi z dzidą przy siatce, kto śpi, a kto wychodzi po zapasy?'
        : first
          ? 'Dym z kozy widać z daleka. Kto śpi, kto pilnuje, a kto idzie po zapasy?'
          : 'Kto śpi, kto pilnuje siatki albo kozy, a kto idzie po zapasy?'
    }</p><div data-odds>${oddsHtml(card, assign, odds, names)}</div><ul class="crew">${rows}</ul>${
      tr(card.advice)
        ? `<p class="advice"><b class="advice-k">Zarząd radzi:</b> <span data-advice>${esc(tr(card.advice))}</span></p>`
        : ''
    }`,
    foot: `${btn('night-reset', 'Jak radzi zarząd', 'btn ghost')}${btn('night-go', 'Zacznijcie noc', 'btn go')}`,
  };
}

// ---------------------------------------------------------------- uchwała

function lawItem(o: LawOption): string {
  const tag = o.path === 'base' ? '' : `<span class="tag ${o.path}">${esc(PATHS[o.path])}</span>`;
  const act =
    o.s === 'ok'
      ? btn('law', 'Podpisać', 'btn go', o.id)
      : `<p class="law-why">${esc(o.s === 'done' ? 'Już obowiązuje.' : o.why ? tr(o.why) : 'Teraz nie można.')}</p>`;
  return `<li class="law ${o.s}"><div class="law-head"><b class="law-n">${esc(tr(o.name))}</b>${tag}</div><p class="law-d">${esc(
    tr(o.desc),
  )}</p>${act}</li>`;
}

export function lawSheet(p: Extract<Prompt, { k: 'uchwala' }>): Sheet {
  return {
    tone: 'uchwala',
    kicker: `Zebranie zarządu, dzień ${p.day}, 19:30`,
    title: p.first ? 'Pierwsza uchwała' : 'Uchwała zarządu',
    body: `<p class="lead">${
      p.first
        ? 'Wieczór przy kozie. Mieszkańcy czekają, jakie zasady ustalicie na pierwszą noc. Jedną uchwałę można podjąć dziś, następną najwcześniej za półtorej doby.'
        : 'Można podjąć jedną uchwałę. Drogi porządku i wspólnoty się wykluczają.'
    }</p><ul class="laws">${p.options.map(lawItem).join('')}</ul>`,
    foot: btn('law-skip', p.first ? 'Nic dziś nie uchwalamy (zaufanie −1)' : 'Nic dziś nie uchwalamy', 'btn ghost'),
  };
}

// ---------------------------------------------------------------- wydarzenie

export function eventSheet(p: Extract<Prompt, { k: 'wydarzenie' }>): Sheet {
  const text = tr(p.text)
    .split(/\n+/)
    .map((l) => `<p>${esc(l)}</p>`)
    .join('');
  return {
    tone: 'wydarzenie',
    kicker: 'Na osiedlu',
    title: esc(tr(p.title)),
    body: text,
    foot: `<div class="choices">${p.choices
      .map((c, k) => btn('event', esc(tr(c.label)), 'btn', String(k), c.ok ? '' : ' disabled'))
      .join('')}</div>`,
  };
}

// ---------------------------------------------------------------- raport

const RAID_TITLE: Record<NightReport['raid'], string> = {
  brak: 'Spokojna noc',
  odparty: 'Napad odparty',
  wtargnięcie: 'Szabrownicy weszli',
};

export function reportSheet(r: NightReport): Sheet {
  const lines = r.lines.map((l) => `<li class="line">${esc(tr(l))}</li>`).join('');
  const stolen = lootText(r.stolen);
  const loot = lootText(r.loot);
  const kit = r.kitchen ?? null;
  const warm = kit === null ? '' : kit >= 18 ? ' good' : kit < 15 ? ' bad' : '';
  const tally = [
    kit !== null
      ? `<li class="tal${warm}"><small class="tal-k">Kuchnia rano</small><b>${Math.round(kit)}°C${
          r.koza?.length ? `, przy kozie ${esc(r.koza.join(', '))}` : ''
        }</b></li>`
      : '',
    stolen ? `<li class="tal bad"><small class="tal-k">Zabrali</small><b>${esc(stolen)}</b></li>` : '',
    loot ? `<li class="tal good"><small class="tal-k">Z wypraw</small><b>${esc(loot)}</b></li>` : '',
    ...r.hurt.map(
      (h) =>
        `<li class="tal bad"><small class="tal-k">Ranni</small><b>${esc(h.name)}, zdrowie ${signed(h.d, 0)}</b></li>`,
    ),
  ].join('');
  const meter = (label: string, v: number, d: number, good: boolean) =>
    `<div class="meter"><small class="meter-k">${label}</small><b class="meter-v">${Math.round(v)}</b><em class="meter-d${
      d === 0 ? '' : good ? ' good' : ' bad'
    }">${signed(d)}</em></div>`;
  return {
    tone: 'raport',
    kicker: `Raport, dzień ${r.day + 1}, 6:00`,
    title: RAID_TITLE[r.raid],
    body: `<ul class="lines">${lines}</ul>${tally ? `<ul class="tally">${tally}</ul>` : ''}<div class="meters">${meter(
      'Zaufanie',
      r.trust,
      r.dTrust,
      r.dTrust >= 0,
    )}${meter('Wkurzenie', r.anger, r.dAnger, r.dAnger <= 0)}</div>`,
    foot: btn('report-ok', 'Nowy dzień', 'btn go'),
  };
}

// ---------------------------------------------------------------- palenie mebli

export function burnSheet(kind: string, owner: string | null, softer: boolean): Sheet {
  const wood = BURNABLE[kind] ?? 1;
  const hours = (wood * BURN_TICKS) / TICKS_PER_HOUR;
  const what = FURNITURE_ACC[kind] ?? 'mebel';
  return {
    tone: 'ogien',
    kicker: 'Meble na opał',
    title: `Spalić ${esc(what)}?`,
    body: `<p>Da ${wood} ${plural(wood, 'sztukę', 'sztuki', 'sztuk')} drewna, około ${num(hours)} h ognia w kozie. Mebla już nie będzie.</p><p>${
      owner
        ? `To mebel osoby: ${esc(owner)}. Bardzo to przeżyje, a reszta zarządu też to poczuje.`
        : 'Zarząd to poczuje: palimy coś, co ktoś kiedyś kupił na raty.'
    }${softer ? ' Uchwała „Meble na opał” łagodzi to o połowę.' : ''}</p>`,
    foot: `${btn('burn-no', 'Zostawić', 'btn ghost')}${btn('burn-yes', 'Spalić', 'btn danger')}`,
    closable: true,
  };
}

// ---------------------------------------------------------------- menu, jak grać, koniec

/** Skąd są wymyśleni mieszkańcy: linia z sekcji „Linia do ekranu »O grze«” w public/data/mieszkancy/LICENCJE.md
    (plik robi tools/dane/licencje.ts; test pilnuje, żeby tekst się zgadzał), a obok link do całego pliku. */
export const DANE_MIESZKANCOW =
  'Dane demograficzne: GUS (NSP 2021 z publikacją „Warunki mieszkaniowe w Polsce”, BDL na CC BY 4.0, BREC 2021, tablice trwania życia 2025, Prognoza ludności 2023-2060, Rocznik Demograficzny 2025, Sytuacja demograficzna Polski do 2025 r.) i Eurostat (CC BY 4.0), przetworzone na wymyślonych mieszkańców; imiona i nazwiska: rejestr PESEL, Ministerstwo Cyfryzacji, dane.gov.pl (CC0); odmiana: SGJP (BSD-2, pełna nota w repozytorium).';
export const LICENCJE_MIESZKANCOW = 'data/mieszkancy/LICENCJE.md';

export function menuSheet(note: string): Sheet {
  return {
    tone: 'menu',
    kicker: 'Za Murem 0.4',
    title: 'Menu',
    body: `<div class="menu-list">${btn('menu-back', 'Wróć do gry', 'btn go')}${btn('menu-help', 'Jak grać')}${btn(
      'menu-start',
      'Zapisz i wróć do ekranu startowego',
    )}</div><p class="fine">${esc(note)}</p><p class="fine dane">${esc(DANE_MIESZKANCOW)} <a href="${LICENCJE_MIESZKANCOW}" target="_blank" rel="noopener">Źródła i licencje</a></p>`,
    foot: '',
    closable: true,
  };
}

/** pomoc trybu zombie: szwendacze, stado, broń, ugryzienia */
const ZOMBIE_HELP =
  '<h3 class="help-h">Tryb zombie</h3><ul class="help"><li>Za siatką snują się szwendacze. Są wolni, ale idą za hałasem i za tym, co widzą. Nocą przychodzi stado i napiera na siatkę, a każdej nocy jest ich więcej.</li><li>Dzida sięga przez siatkę: warta z dzidą zabija tych, którzy napierają. Nóż, łom i siekiera działają dopiero po tej samej stronie siatki. Strzał zabija od razu, ale słychać go z daleka i ściąga następnych.</li><li>Uszkodzoną siatkę wzmacnia się deskami albo złomem, a dziurę łata. Dzidę robi się z desek i złomu na stercie. „Do broni!” wysyła wszystkich zdolnych na wartę przy siatce.</li><li>Ugryzienie to gorączka i śmierć w niecałą dobę. Kto ugryziony w rękę albo nogę, tego da się uratować amputacją w ciągu dwóch godzin. Każdy zmarły wstaje po godzinie, chyba że ktoś go dobije.</li></ul>';

/** pomoc o budowie i pustych mieszkaniach (M2, fala 1) */
function buildHelp(touch: boolean): string {
  const items = touch
    ? [
        'Przycisk Budowa u góry otwiera menu budowy: pomieszczenie, podwórko i obwód, z kosztem, czasem pracy i działaniem.',
        'Po wyborze plan budowy jedzie za palcem: stuknięcie stawia, przyciski na dole obracają i anulują. Zielony plan da się postawić, czerwony mówi, czemu nie.',
        'Zarząd sam przynosi materiały i buduje. Deski, złom i części dają przeszukiwanie pustych mieszkań i rozbiórka.',
        'Stuknięcie w mieszkanie siedziby pokazuje jego kartę: czy jest puste, dlaczego, co do naprawy i co już przeszukane. Przytrzymanie palca w mieszkaniu: Przeszukać, Rozebrać, Naprawić, Zająć mieszkanie.',
      ]
    : [
        'Przycisk Budowa u góry albo klawisz B otwiera menu budowy: pomieszczenie, podwórko i obwód, z kosztem, czasem pracy i działaniem.',
        'Po wyborze plan budowy jedzie za kursorem: lewy klik stawia, R obraca, prawy klik albo Esc anuluje, z Shiftem stawia się kilka naraz. Zielony plan da się postawić, czerwony mówi, czemu nie.',
        'Zarząd sam przynosi materiały i buduje. Deski, złom i części dają przeszukiwanie pustych mieszkań i rozbiórka.',
        'Klik w mieszkanie siedziby pokazuje jego kartę: czy jest puste, dlaczego, co do naprawy i co już przeszukane. Prawy przycisk w mieszkaniu: Przeszukać, Rozebrać, Naprawić, Zająć mieszkanie.',
      ];
  return `<h3 class="help-h">Budowa i puste mieszkania</h3><ul class="help">${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
}

/** potwierdzenie polecenia, którego nie da się cofnąć (rozbiórka, zajęcie mieszkania; palenie ma własne okno) */
export function confirmSheet(label: string): Sheet {
  return {
    tone: 'ogien',
    kicker: 'Na pewno?',
    title: esc(label),
    body: '<p>Tego nie da się cofnąć.</p>',
    foot: `${btn('confirm-no', 'Nie', 'btn ghost')}${btn('confirm-yes', label, 'btn go')}`,
    closable: true,
  };
}

export function helpSheet(touch: boolean, zombie = false): Sheet {
  const ctl = touch
    ? '<li>Stuknięcie w człowieka z zarządu zaznacza go.</li><li>Stuknięcie w miejsce wydaje najprostsze polecenie: idź, zetnij, zanieś, dołóż.</li><li>Przytrzymanie palca pokazuje wszystkie polecenia w tym miejscu, także palenie mebli.</li><li>Jeden palec przesuwa mapę, dwa przybliżają.</li>'
    : '<li>Klik zaznacza człowieka z zarządu, Shift i przeciąganie zaznacza ramką kilku naraz.</li><li>Prawy przycisk pokazuje polecenia w tym miejscu: idź, zetnij, zanieś do składu, dołóż do kozy, gotuj, spal mebel.</li><li>Kółko przybliża, przeciąganie przesuwa mapę, WASD też.</li><li>Na gładziku kliknięcie dwoma palcami albo Ctrl+klik to prawy przycisk, szczypanie przybliża, dwa palce przesuwają mapę.</li><li>Spacja to pauza, 1–4 tempo (do 8×).</li>';
  return {
    tone: 'menu',
    kicker: 'Za Murem 0.4',
    title: 'Jak grać',
    body: `<h3 class="help-h">Sterowanie</h3><ul class="help">${ctl}</ul>${buildHelp(touch)}<h3 class="help-h">Zarząd</h3><ul class="help"><li>Prowadzicie zarząd spółdzielni w 2051 roku. Czterech ludzi, koza w kuchni i dziurawa siatka wokół podwórka.</li><li>Pilnujcie potrzeb na karcie osoby: najedzenie, ciepło, siły, zdrowie, bezpieczeństwo i nastrój.</li><li>Koza zjada drewno. Pole „koza” u góry mówi, na ile godzin starczy ognia; przed nocą zgromadźcie zapas (ścinanie drzew albo meble na opał).</li><li>O 19:30 zebranie i uchwała, o 20:00 karta nocy: kto śpi, kto trzyma wartę, kto czuwa przy kozie, kto idzie na wyprawę. Bez dyżuru koza gaśnie w nocy, bo wszyscy śpią. Noc biegnie potem szybciej (6×), rano raport i wasze tempo wraca.</li><li>Zaufanie i wkurzenie mieszkańców liczą się z każdej decyzji. Przy zerowym zaufaniu ludzie odejdą, przy pełnym wkurzeniu walne odwoła zarząd.</li><li>Każdy z zarządu ma jedną broń, zapasowa leży w magazynie (karta osoby: „Zmień”). Prawy przycisk na wrogu: „Atakuj”. Warta bije sama, jeśli wróg jest w zasięgu jej broni.</li></ul>${zombie ? ZOMBIE_HELP : ''}<h3 class="help-h">Na razie</h3><p>W wersji 0.4 są noce za siatką, budowa, puste mieszkania do przeszukania i naprawy, przybysze i tryb zombie. Badania, zima i reszta gospodarki przyjdą w kolejnych wersjach.</p>`,
    foot: btn('help-back', 'Wróć', 'btn go'),
    closable: true,
  };
}

export function endSheet(id: EndingId): Sheet {
  const e = ENDINGS[id];
  return {
    tone: 'koniec',
    kicker: 'Koniec gry',
    title: esc(e.title),
    body: `<p>${esc(e.text)}</p>`,
    foot: btn('end-start', 'Od nowa', 'btn go'),
  };
}
