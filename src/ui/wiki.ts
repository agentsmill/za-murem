/* Wiki w grze (prośba Mateusza: „żeby ludzie rozumieli, co jest czym i co się czym robi”): rejestr artykułów, leniwe
   budowanie ich treści, wyszukiwarka i HTML okna. Czyste funkcje, bez DOM i bez PixiJS, więc da się je sprawdzić w Node;
   DOM i zdarzenia (otwarcie z Menu, klik w czip paska, pole wyszukiwania) robi src/ui/wiki-okno.ts, a podpina je main.ts.

   Kontrakt.
   - Artykuły żyją w modułach kategorii (src/ui/wiki-*.ts, zebranych w wiki-tresc.ts) jako `Def`: stały `id`
     („zasob:drewno”, „budowla:warsztat”, „badanie:t_kozy”…), kategoria, tytuł i funkcja treści. Rejestr sprawdza, że
     identyfikatory się nie powtarzają. Nic nie buduje się przy ładowaniu modułu ani przy starcie gry: tytuł liczy się przy
     rysowaniu listy, treść dopiero przy otwarciu artykułu (`artykul`) albo przy pierwszym wyszukiwaniu po treści.
   - Treść powstaje w bieżącym języku (`L()`), więc pamięć podręczna (`WeakMap` po kontekście) kluczuje po języku; zmiana
     języka w Menu rysuje okno od nowa i artykuł buduje się jeszcze raz. Kontekst (`WikiCtx`) niesie słownik miejsca: dom
     czyta „furtka” i „komitet”, blok „brama” i „zarząd”, a tryb zombie i urządzenie wpływają tylko na wybrane zdania.
   - Wiki jest dokumentacją, nie widokiem na żywo: bierze z tabel gry (koszty budowli, badania, uchwały, rodzaje pracy,
     broń, potrzeby, kategorie miejsc, drogi do zwycięstwa) jedynie stałe dane i funkcje bez stanu, więc zmiana liczby w grze
     zmienia i wiki. Testy (tests/unit/wiki*.test.ts) pilnują pokrycia, zgodności faktów z tabelami, języka i odnośników.
   - Okno: lewa kolumna z polem wyszukiwania i listą kategorii (`<details>`), po prawej artykuł; na telefonie (do 767 px)
     jedna kolumna naraz, lista albo artykuł z przyciskiem powrotu (`data-widok` na korzeniu `.wiki-uklad`, przełącza je wiki-okno.ts).
     Przyciski mają `data-act` („wiki-art” z `data-arg` = id artykułu, „wiki-lista”, „wiki-wroc”) jak reszta okien.
   - Czipy paska (`CZIPY`): identyfikator elementu w index.html → artykuł. Wiązanie idzie po identyfikatorze, nie po układzie
     paska, żeby zmiana układu na telefonie nie psuła wiki. */

import { jezyk, L, tr } from '../core/jezyk.ts';
import type { Sheet } from './okna.ts';
import { esc } from './tekst.ts';
import { definicjeTresc } from './wiki-tresc.ts';
import { type Artykul, type Def, KATEGORIE, type KatId, nazwaKategorii, type WikiCtx } from './wiki-typy.ts';

export * from './wiki-typy.ts';

/** artykuł pokazywany po prawej, gdy nic nie wybrano */
export const ARTYKUL_STARTOWY = 'start:zacznij';

/** Czipy górnego paska, które otwierają wiki: id elementu (index.html, src/ui/pasek.ts) → artykuł. */
export const CZIPY: Readonly<Record<string, string>> = {
  sFence: 'zombie:siatka',
  sHorde: 'zombie:stado',
  sOut: 'start:temperatura',
  sKit: 'start:temperatura',
  sFire: 'zasob:koza',
  sWood: 'zasob:drewno',
  sBoards: 'zasob:deski',
  sScrap: 'zasob:zlom',
  sParts: 'zasob:czesci',
  sMats: 'zasob:odzysk',
  sFood: 'zasob:jedzenie',
  sTrust: 'zarzad:zaufanie',
  sAnger: 'zarzad:wkurzenie',
};

/** Zapasy zarządu (`STOCK_KEYS` z src/gov/wspolne.ts) → artykuł; test sprawdza, że żadnego nie brakuje. */
export const ARTYKUL_ZAPASU: Readonly<Record<'wood' | 'supplies' | 'scrap' | 'parts' | 'meds', string>> = {
  wood: 'zasob:drewno',
  supplies: 'zasob:jedzenie',
  scrap: 'zasob:zlom',
  parts: 'zasob:czesci',
  meds: 'zasob:leki',
};

/** Potrzeby (`Needs` z src/sim/needs.ts) → artykuł. */
export const ARTYKUL_POTRZEBY: Readonly<Record<'food' | 'warm' | 'rest' | 'health' | 'safe' | 'mood', string>> = {
  food: 'potrzeba:food',
  warm: 'potrzeba:warm',
  rest: 'potrzeba:rest',
  health: 'potrzeba:health',
  safe: 'potrzeba:safe',
  mood: 'potrzeba:mood',
};

// ---------------------------------------------------------------- rejestr

let REJESTR: readonly Def[] | null = null;
let PO_ID: ReadonlyMap<string, Def> | null = null;

/** Wszystkie definicje w kolejności kategorii (w kategorii: kolejność, w jakiej autorzy je wpisali). Składa się raz. */
export function rejestr(): readonly Def[] {
  if (REJESTR) return REJESTR;
  const wszystkie = definicjeTresc();
  const widziane = new Set<string>();
  for (const d of wszystkie) {
    if (widziane.has(d.id)) throw new Error(`wiki: powtórzony identyfikator artykułu „${d.id}”`);
    widziane.add(d.id);
  }
  REJESTR = [...wszystkie].sort((a, b) => KATEGORIE.indexOf(a.kat) - KATEGORIE.indexOf(b.kat));
  PO_ID = new Map(REJESTR.map((d) => [d.id, d]));
  return REJESTR;
}

export function maArtykul(id: string): boolean {
  rejestr();
  return PO_ID!.has(id);
}

/** Tytuł artykułu w bieżącym języku albo null, gdy takiego artykułu nie ma. */
export function tytulArtykulu(id: string, c: WikiCtx): string | null {
  rejestr();
  return PO_ID!.get(id)?.tytul(c) ?? null;
}

const PAMIEC = new WeakMap<WikiCtx, Map<string, Artykul>>();

/** Artykuł zbudowany w bieżącym języku (pamięć podręczna po kontekście i języku) albo null dla nieznanego `id`. */
export function artykul(id: string, c: WikiCtx): Artykul | null {
  rejestr();
  const d = PO_ID!.get(id);
  if (!d) return null;
  let m = PAMIEC.get(c);
  if (!m) PAMIEC.set(c, (m = new Map()));
  const klucz = `${jezyk()}|${id}`;
  let a = m.get(klucz);
  if (!a) {
    const t = d.buduj(c);
    a = {
      id,
      kat: d.kat,
      tytul: d.tytul(c),
      zdania: t.zdania,
      ...(t.uwaga ? { uwaga: t.uwaga } : {}),
      fakty: t.fakty ?? [],
      jak: t.jak ?? [],
      zobacz: [...new Set(t.zobacz ?? [])].filter((x) => x !== id),
      przyciski: t.przyciski ?? [],
    };
    m.set(klucz, a);
  }
  return a;
}

// ---------------------------------------------------------------- wyszukiwarka

/** Tekst do porównań: małe litery, bez ogonków (także „ł”), tylko litery i cyfry rozdzielone spacją. */
export const normalizuj = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ł/g, 'l')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

export interface Wynik {
  id: string;
  kat: KatId;
  tytul: string;
}

/** Artykuły pasujące do zapytania: każde słowo zapytania musi wystąpić w tytule, treści, faktach albo dodatkowych słowach;
    tytuł waży więcej niż treść. Przy pierwszym zapytaniu w danym języku buduje treść wszystkich artykułów (kilka
    milisekund), potem korzysta z pamięci. Puste zapytanie nie daje nic. */
export function szukaj(q: string, c: WikiCtx, limit = 60): Wynik[] {
  const tokeny = normalizuj(q).split(' ').filter(Boolean);
  if (!tokeny.length) return [];
  const trafione: { w: Wynik; punkty: number; nr: number }[] = [];
  rejestr().forEach((d, nr) => {
    const a = artykul(d.id, c)!;
    const tytul = normalizuj(a.tytul);
    const slowaTytulu = tytul.split(' ');
    const tekst = normalizuj(
      [a.tytul, ...a.zdania, a.uwaga ?? '', ...a.fakty.map((f) => `${f.k} ${f.v}`), ...a.jak, d.slowa ?? ''].join(' '),
    );
    let punkty = 0;
    for (const t of tokeny) {
      if (slowaTytulu.some((s) => s.startsWith(t))) punkty += 5;
      else if (tytul.includes(t)) punkty += 3;
      else if (tekst.includes(t)) punkty += 1;
      else return;
    }
    trafione.push({ w: { id: d.id, kat: d.kat, tytul: a.tytul }, punkty, nr });
  });
  return trafione
    .sort((x, y) => y.punkty - x.punkty || x.nr - y.nr)
    .slice(0, limit)
    .map((x) => x.w);
}

// ---------------------------------------------------------------- HTML

/** Stan okna wiki: wybrany artykuł (null: lista, a po prawej artykuł startowy), tekst wyszukiwania i skąd otwarto okno
    (z Menu przycisk wraca do Menu, z czipa paska zamyka okno). */
export interface WikiStan {
  art: string | null;
  q: string;
  zMenu: boolean;
}

const przycisk = (act: string, napis: string, cls = 'btn', arg = ''): string =>
  `<button type="button" class="${cls}" data-act="${act}"${arg ? ` data-arg="${esc(arg)}"` : ''}>${esc(napis)}</button>`;

/** pozycja listy: przycisk z tytułem; wybrany artykuł ma `aria-current` */
function pozycja(id: string, tytul: string, aktywny: string | null, kat?: string): string {
  return `<li><button type="button" class="wiki-poz" data-act="wiki-art" data-arg="${esc(id)}"${
    id === aktywny ? ' aria-current="true"' : ''
  }>${esc(tytul)}${kat ? ` <small class="wiki-poz-kat">${esc(kat)}</small>` : ''}</button></li>`;
}

/** Lista po lewej: grupy kategorii (otwarta ta z wybranym artykułem, a bez wyboru pierwsza) albo, przy niepustym
    wyszukiwaniu, płaska lista wyników z kategorią przy każdym. */
export function listaHtml(st: Pick<WikiStan, 'art' | 'q'>, c: WikiCtx): string {
  const q = st.q.trim();
  if (q) {
    const wyniki = szukaj(q, c);
    if (!wyniki.length) return `<p class="wiki-brak">${esc(L('Nic nie znaleziono.', 'Nothing found.'))}</p>`;
    return `<ul class="wiki-wyniki">${wyniki
      .map((w) => pozycja(w.id, w.tytul, st.art, tr(nazwaKategorii(w.kat, c))))
      .join('')}</ul>`;
  }
  rejestr();
  const aktywna = st.art ? (PO_ID!.get(st.art)?.kat ?? KATEGORIE[0]) : KATEGORIE[0];
  return KATEGORIE.map((kat) => {
    const defs = rejestr().filter((d) => d.kat === kat);
    if (!defs.length) return '';
    return `<details class="wiki-kat" data-kat="${kat}"${kat === aktywna ? ' open' : ''}><summary>${esc(
      tr(nazwaKategorii(kat, c)),
    )} <small class="wiki-n">${defs.length}</small></summary><ul class="wiki-poz-lista">${defs
      .map((d) => pozycja(d.id, d.tytul(c), st.art))
      .join('')}</ul></details>`;
  }).join('');
}

/** Treść jednego artykułu: kategoria, tytuł, zdania, uwaga, blok faktów, kroki i odnośniki. Nieznany `id` daje artykuł
    startowy. */
export function artykulHtml(id: string | null, c: WikiCtx): string {
  const a = artykul(id ?? ARTYKUL_STARTOWY, c) ?? artykul(ARTYKUL_STARTOWY, c)!;
  const kat = esc(tr(nazwaKategorii(a.kat, c)));
  const fakty = a.fakty.length
    ? `<dl class="wiki-fakty">${a.fakty
        .map((f) => `<div class="wiki-fakt" data-fakt="${esc(f.id)}"><dt>${esc(f.k)}</dt><dd>${esc(f.v)}</dd></div>`)
        .join('')}</dl>`
    : '';
  const jak = a.jak.length
    ? `<h4 class="wiki-h">${esc(L('Jak to zrobić', 'How to do it'))}</h4><ul class="help wiki-jak">${a.jak
        .map((s) => `<li>${esc(s)}</li>`)
        .join('')}</ul>`
    : '';
  const zobacz = a.zobacz
    .map((z) => ({ z, t: tytulArtykulu(z, c) }))
    .filter((x): x is { z: string; t: string } => x.t !== null);
  const zobaczHtml = zobacz.length
    ? `<h4 class="wiki-h">${esc(L('Zobacz też', 'See also'))}</h4><ul class="wiki-zobacz">${zobacz
        .map(
          ({ z, t }) =>
            `<li><button type="button" class="wiki-link" data-act="wiki-art" data-arg="${esc(z)}">${esc(t)}</button></li>`,
        )
        .join('')}</ul>`
    : '';
  const przyciski = a.przyciski.length
    ? `<p class="wiki-akcje">${a.przyciski.map((p) => przycisk(p.act, p.napis, 'btn')).join(' ')}</p>`
    : '';
  return `<article class="wiki-art" data-art="${esc(a.id)}"><header class="wiki-art-glowa">${przycisk(
    'wiki-lista',
    `← ${L('Lista', 'List')}`,
    'btn ghost wiki-wstecz',
  )}<small class="wiki-art-kat">${kat}</small><h3 class="wiki-tytul">${esc(a.tytul)}</h3></header><p class="wiki-zdania">${a.zdania
    .map(esc)
    .join(
      ' ',
    )}</p>${a.uwaga ? `<p class="wiki-uwaga">${esc(a.uwaga)}</p>` : ''}${fakty}${jak}${przyciski}${zobaczHtml}</article>`;
}

/** Okno wiki w kształcie `Sheet`: pole wyszukiwania i lista po lewej, artykuł po prawej. Tytuł okna to „Wiki”, a stopka ma
    jeden przycisk: „Wróć” do Menu albo „Zamknij”, gdy okno otwarto z czipa paska. */
export function wikiSheet(st: WikiStan, c: WikiCtx): Sheet {
  const szukaj = L('Szukaj w wiki', 'Search the wiki');
  return {
    tone: 'wiki',
    kicker: 'Za Murem 0.4',
    title: 'Wiki',
    body: `<div class="wiki-uklad" data-widok="${st.art ? 'art' : 'lista'}"><nav class="wiki-nav" aria-label="Wiki"><label class="wiki-szukaj"><span class="sr">${esc(
      szukaj,
    )}</span><input type="search" class="wiki-q" value="${esc(st.q)}" placeholder="${esc(
      szukaj,
    )}" autocomplete="off" spellcheck="false" enterkeyhint="search"></label><div class="wiki-lista" id="wikiLista">${listaHtml(
      st,
      c,
    )}</div></nav><section class="wiki-tresc" id="wikiTresc" tabindex="-1">${artykulHtml(st.art, c)}</section></div>`,
    foot: przycisk('wiki-wroc', st.zMenu ? L('Wróć', 'Back') : L('Zamknij', 'Close'), 'btn go'),
    closable: true,
  };
}
