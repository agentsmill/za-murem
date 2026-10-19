/* Tablica korkowa badań (docs/superpowers/specs/2026-10-19-badania-design.md, sekcja „Tablica badań”, wariant C ze
   szkiców: tablica w pracowni na pełnym ekranie z pauzą). Czyste funkcje bez DOM i bez PixiJS, z testem w Node
   (tests/unit/badania-tablica.test.ts), jak buildPanelHtml w budowa.ts; DOM, pauzę i klawisze robi main.ts.

   `tablicaHtml(b, { wybrana, mode })` składa całe wnętrze warstwy z odczytu `SimSnapshot.tablica`: nagłówek z przyciskiem
   „Wróć do gry” (`data-akcja="zamknij"`), kolumny er z `ERY` od lewej (nagłówek ery na pasku papieru), kartkę na
   każdą technologię na kolorowej pinezce (stany z `kartka`: zbadana z pieczątką, w toku z paskiem postępu, do wzięcia,
   „nikt się nie zna”, „najpierw”, odwrócona; technologia końcowa ze złotą pinezką i dopiskiem „Cel”, technologia
   z budowlą z dopiskiem „budowla”), czerwony sznurek SVG od wymagania do kartki, szczegóły wybranej kartki (nazwa,
   działanie w nowej grze, dziedzina i poziom, wymagania, koszt i szacowany czas przy obecnej obsadzie, kto w osadzie
   zna dziedzinę, przycisk `data-akcja="badaj"` z `data-arg` technologii) i pasek obsady na dole (kto siedzi przy
   stole, bieżące badanie z postępem, półka z książkami w każdej z sześciu dziedzin). Kartki wskazuje `data-tech`.
   Technologia z polem `tryb` innym niż bieżący tryb gry nie ma kartki ani sznurków.

   Układ jest policzony, a nie ręczny: `uklad` ustawia kartki w kolumnach er (kolumna to indeks ery w `ERY`, wiersze
   wychodzą ze średniej wierszy wymagań, żeby sznurki szły prosto), więc nowa technologia czy era dochodzi bez zmiany
   tego pliku. Wszystko leży na jednej planszy o stałym rozmiarze w pikselach (`.tb-board`): kartki i sznurki mają
   wspólne współrzędne, a na wąskim ekranie przewija się sama plansza w jej własnym oknie (`.tb-wrap`). Na laptopach
   (1280 i 1366 px) plansza kurczy się do szerokości okna (`skalaPlanszy`, CSS `zoom` z `--tb-skala`, ustawia main.ts),
   żeby ostatnia era i szczegóły były widoczne bez przewijania w poziomie; na telefonie zostaje w skali 1 i się przewija.

   `odkrycieSheet(id)` to karta „Odkrycie” z pauzą po ukończeniu badania, w stylu kartki z tablicy (odcień `odkrycie`):
   nazwa i działanie technologii, co odblokowuje, przyciski „Postaw <budowla>” (tylko gdy odblokowuje budowlę),
   „Następne badanie” (otwiera tablicę) i „Dalej”; wywołuje ją main.ts ze stanu symulacji jak spotkanie z sąsiadami.

   `czyOtworzycSama` to warunek samego otwarcia tablicy (raz po wyborze, nigdy przy innym oknie, napadzie ani alarmie).
   `usiadaPodpowiedz` to podpowiedź po „Badać”, gdy zaznaczonych jest więcej osób niż wolnych miejsc przy stole.
   Napisy: polskie w L(…) tutaj, angielskie w badania.en.ts; nazwy technologii i er z src/sim/badania.ts, dziedziny
   z DOM i DOM_EN, zawody przez zawodEn. */

import { DOM_EN, zawodEn } from '../content/data.en.ts';
import { DOM, TECH_DOMS, type TechDom } from '../content/data.ts';
import { L, tr } from '../core/jezyk.ts';
import { BRAK_MIEJSCA, ERY, type Kartka, nazwaEry, nazwaTech, TECH_BY, TECHS, type TechNowa } from '../sim/badania.ts';
import { BUILDS_EN } from '../sim/budowle.en.ts';
import { BUILDS, type BuildKind } from '../sim/budowle.ts';
import { dayOf } from '../sim/clock.ts';
import type { SimBadania } from '../sim/snapshot.ts';
import type { GameMode } from '../sim/tryb.ts';
import { EN } from './badania.en.ts';
import { buildName, postawLabel } from './budowa.ts';
import type { Sheet } from './okna.ts';
import { esc, num } from './tekst.ts';

/** wymiary kartki i planszy w pikselach (współrzędne wspólne dla kartek i sznurków) */
export const KARTA_W = 140;
export const KARTA_H = 64;
const ODSTEP_X = 186;
const ODSTEP_Y = 84;
const MARGINES = 18;
/** pas nad kartkami na nagłówki er */
const GORA = 58;
const DOL = 30;

export interface Pozycja {
  /** kolumna: indeks ery w `ERY` */
  kol: number;
  wiersz: number;
  /** lewy górny róg kartki na planszy */
  x: number;
  y: number;
}

/** Układ kartek: kolumna to era (indeks w `ERY`), a wiersz wychodzi ze średniej wierszy wymagań z wcześniejszych er,
    żeby sznurki szły prosto, z miejscem dla każdej kartki (wiersze w kolumnie się nie powtarzają). Technologia, która
    wymaga czegoś z tej samej ery, leży w tej samej kolumnie zaraz pod wymaganiem. Technologia z erą spoza `ERY` nie
    dostaje miejsca. */
export function uklad(techs: readonly Pick<TechNowa, 'id' | 'era' | 'req'>[]): Map<string, Pozycja> {
  const wiersze = new Map<string, number>();
  const out = new Map<string, Pozycja>();
  ERY.forEach((era, kol) => {
    const karty = techs.filter((t) => t.era === era.nr);
    const wEra = new Set(karty.map((t) => t.id));
    const srodek = (t: (typeof karty)[number]): number => {
      const r = t.req.filter((x) => wiersze.has(x)).map((x) => wiersze.get(x) as number);
      return r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0;
    };
    const glowne = karty
      .filter((t) => !t.req.some((r) => wEra.has(r)))
      .map((t, i) => ({ t, i, chce: Math.floor(srodek(t)) }))
      .sort((a, b) => a.chce - b.chce || a.i - b.i);
    const kolejnosc: { t: (typeof karty)[number]; chce: number }[] = [];
    const stoi = new Set<string>();
    // zależny od karty z tej samej ery idzie zaraz za nią
    const dodaj = (t: (typeof karty)[number], chce: number) => {
      stoi.add(t.id);
      kolejnosc.push({ t, chce });
      for (const k of karty) if (!stoi.has(k.id) && k.req.includes(t.id)) dodaj(k, 0);
    };
    for (const g of glowne) dodaj(g.t, g.chce);
    // karta z cyklem wymagań w tej samej erze (błąd danych) też dostaje miejsce
    for (const k of karty) if (!stoi.has(k.id)) dodaj(k, 0);
    let poprzedni = -1;
    for (const { t, chce } of kolejnosc) {
      const wiersz = Math.max(poprzedni + 1, chce);
      poprzedni = wiersz;
      wiersze.set(t.id, wiersz);
      out.set(t.id, { kol, wiersz, x: MARGINES + kol * ODSTEP_X, y: GORA + wiersz * ODSTEP_Y });
    }
  });
  return out;
}

/** ścieżka sznurka od wymagania do kartki: między kolumnami z prawego brzegu wymagania do lewego brzegu kartki
    (łagodny łuk), w tej samej kolumnie ze środka dolnej krawędzi wyżej do środka górnej krawędzi niżej */
function sznurek(od: Pozycja, do_: Pozycja): string {
  if (od.kol === do_.kol) {
    const x1 = od.x + KARTA_W / 2;
    const y1 = od.y + KARTA_H;
    const x2 = do_.x + KARTA_W / 2;
    const y2 = do_.y;
    return `M${x1},${y1} Q${x1 + 12},${(y1 + y2) / 2} ${x2},${y2}`;
  }
  const x1 = od.x + KARTA_W;
  const y1 = od.y + KARTA_H / 2;
  const x2 = do_.x;
  const y2 = do_.y + KARTA_H / 2;
  const k = Math.min(70, (x2 - x1) / 2);
  return `M${x1},${y1} C${x1 + k},${y1} ${x2 - k},${y2} ${x2},${y2}`;
}

/** przekrzywienia kartek (stopnie) i kolory pinezek: stałe, w kolejności technologii, więc plansza wygląda tak samo
    przy każdym otwarciu */
const PRZECHYLY = [-1.6, 0.9, -0.6, 1.5, -1.1, 0.4, 1.2];
const PINEZKI = ['#c0392b', '#2457a8', '#2e7d32', '#e6a540'];
const PINEZKA_CEL = '#d4a017';

const domNazwa = (d: TechDom): string => L(DOM[d], DOM_EN[d]);

/** nazwa czegoś, co kartka „najpierw” każe zbadać albo postawić: technologia albo budowla */
function nazwaBrakujacego(id: string): string {
  if (Object.hasOwn(TECH_BY, id)) return tr(nazwaTech(id));
  if (Object.hasOwn(BUILDS, id)) return L(BUILDS[id as BuildKind].name, BUILDS_EN[id as BuildKind].name);
  return id;
}

/** punkty do wyświetlenia: postęp w dół, koszt w górę (koszt bywa ułamkiem przez mnożnik ery), żeby kartka nie
    pokazała „25 / 25” przed końcem */
const postepTxt = (v: number): string => num(Math.floor(v), 0);
const kosztTxt = (v: number): string => num(Math.ceil(v), 0);

/** „Ciepło 2, macie 1”: dziedzina, poziom, którego technologia wymaga, i wiedza osady */
const brakWiedzy = (t: TechNowa, k: Kartka): string =>
  L(`${domNazwa(t.dom)} ${k.trzeba}, macie ${num(k.ma, 0)}`, EN.brakWiedzy(domNazwa(t.dom), k.trzeba, num(k.ma, 0)));

/** czas do końca w bieżącym języku: godziny gry, od dwóch dób dni */
function kiedy(godziny: number): string {
  if (godziny < 1) return L('poniżej godziny gry', EN.podGodzine);
  if (godziny < 48) {
    const h = Math.ceil(godziny);
    return L(`ok. ${num(h, 0)} h gry`, EN.godziny(num(h, 0)));
  }
  const d = Math.round(godziny / 24);
  return L(`ok. ${num(d, 0)} dni`, EN.dni(num(d, 0)));
}

/** jedna kartka na pince; odwrócona pokazuje tylko tytuł i brak prądu */
function kartkaHtml(t: TechNowa, k: Kartka, p: Pozycja, i: number, wybrana: boolean): string {
  const nazwa = esc(tr(nazwaTech(t.id)));
  const dom = `${domNazwa(t.dom)} ${t.lvl}`;
  let meta: string;
  switch (k.stan) {
    case 'w_toku':
      meta = `${dom} · ${postepTxt(k.postep)} / ${kosztTxt(k.koszt)}`;
      break;
    case 'stoi':
      meta = L(`Stoi: ${brakWiedzy(t, k)}`, EN.stoiBrak(brakWiedzy(t, k)));
      break;
    case 'brak_wiedzy':
      meta = brakWiedzy(t, k);
      break;
    case 'najpierw':
      meta = `${L('najpierw: ', EN.najpierw)}${k.brakuje.map(nazwaBrakujacego).join(', ')}`;
      break;
    case 'odwrocona':
      meta = L('Do tego trzeba prądu.', EN.prad);
      break;
    default:
      meta = `${dom} · ${kosztTxt(k.koszt)}`;
  }
  const pasek =
    k.stan === 'w_toku' || k.stan === 'stoi'
      ? `<span class="tb-pasek"><i style="width:${Math.min(100, Math.round((100 * k.postep) / k.koszt))}%"></i></span>`
      : '';
  const znaczki =
    (t.odblokowuje.length ? `<i class="tb-bud">${L('budowla', EN.budowla)}</i>` : '') +
    (t.koncowa ? `<i class="tb-cel">${L('Cel', EN.cel)}</i>` : '');
  const stempel = k.stan === 'zbadana' ? `<b class="tb-stempel">${L('ZROBIONE', EN.zrobione)}</b>` : '';
  const klasy = `tb-kartka ${k.stan}${t.koncowa ? ' koncowa' : ''}${wybrana ? ' sel' : ''}`;
  const pin = t.koncowa ? PINEZKA_CEL : PINEZKI[i % PINEZKI.length];
  return `<button type="button" class="${klasy}" data-tech="${t.id}" data-stan="${k.stan}" aria-pressed="${wybrana}" title="${esc(`${tr(nazwaTech(t.id))} · ${meta}`)}" style="left:${p.x}px;top:${p.y}px;--rot:${PRZECHYLY[i % PRZECHYLY.length]}deg;--pin:${pin}"><span class="tb-nazwa">${nazwa}</span><small class="tb-meta">${esc(meta)}</small>${pasek}${znaczki}${stempel}</button>`;
}

/** dzień ukończenia technologii z odkryć albo null, gdy odkrycia nie mają o niej wpisu */
const dzienOdkrycia = (b: SimBadania, id: string): number | null => {
  const o = b.odkrycia.find((x) => x.id === id);
  return o ? dayOf(o.tick) : null;
};

/** osoba na liście: imię, zawód i umiejętność w dziedzinie */
const osobaHtml = (o: { name: string; prof: string; skill: number }, dom: TechDom | null): string =>
  `<span class="tb-os"><b>${esc(o.name)}</b> <small class="tb-os-z">${esc(L(o.prof, zawodEn(o.prof)))}${
    dom ? `, ${esc(domNazwa(dom))} ${o.skill}` : ''
  }</small></span>`;

/** szczegóły wybranej kartki: powiększona kartka z boku tablicy (na telefonie wysuwa się od dołu) */
function szczegolyHtml(
  b: SimBadania,
  o: { wybrana: string | null; mode: GameMode },
  kart: Map<string, Kartka>,
): string {
  const t = o.wybrana !== null && Object.hasOwn(TECH_BY, o.wybrana) ? TECH_BY[o.wybrana] : undefined;
  const k = t && kart.get(t.id);
  if (!t || !k) {
    return `<aside class="tb-szczegoly pusto" aria-live="polite"><p>${L('Wybierzcie kartkę, żeby zobaczyć szczegóły.', EN.kliknij)}</p></aside>`;
  }
  const dom = domNazwa(t.dom);
  const opis = o.mode === 'zombie' ? (t.dzialanieZombie ?? t.dzialanie) : t.dzialanie;
  const wymagania = t.req
    .map((r) => {
      const gotowa = kart.get(r)?.stan === 'zbadana';
      return `<li class="tb-wym ${gotowa ? 'ok' : 'brak'}" title="${esc(L(gotowa ? 'Zbadane' : 'Do zbadania', gotowa ? EN.zbadaneKrotko : EN.doZbadania))}">${esc(tr(nazwaTech(r)))}</li>`;
    })
    .join('');
  const wiedza = `${L('Wiedza osady', EN.wiedzaOsady)}: ${num(k.ma, 0)}, ${L('trzeba', EN.trzeba)} ${k.trzeba}`;
  const lista = b.znaja[t.dom] ?? [];
  const ksiazek = b.ksiazki[t.dom] ?? 0;
  const znaja = `<p class="tb-d-zna"><b>${L('Znają dziedzinę', EN.zna)}:</b> ${
    lista.length
      ? lista.map((x) => osobaHtml(x, t.dom)).join('')
      : `<span class="tb-os">${L('nikt w osadzie', EN.nikogoNie)}</span>`
  }${ksiazek ? `<span class="tb-os tb-ks">${L(`książki: ${ksiazek}`, EN.ksiazki(ksiazek))}</span>` : ''}</p>`;
  let stan = '';
  let przycisk = '';
  let koszt = '';
  if (k.stan === 'zbadana') {
    const dzien = dzienOdkrycia(b, t.id);
    stan = `<p class="tb-d-stan ok">${dzien === null ? L('Zbadane.', EN.zbadane(null)) : L(`Zbadane, dzień ${dzien}.`, EN.zbadane(dzien))}</p>`;
  } else if (k.stan === 'odwrocona') {
    // technologia końcowa ma własny opis (sieć), a dopisek o prądzie dokłada tablica ze stanu kartki
    stan = t.koncowa ? `<p class="tb-d-stan brak">${L('Do tego trzeba prądu.', EN.prad)}</p>` : '';
  } else {
    if (k.stan === 'najpierw')
      stan = `<p class="tb-d-stan brak">${L('Najpierw zbadajcie', EN.najpierwZbadajcie)}: ${esc(k.brakuje.map(nazwaBrakujacego).join(', '))}.</p>`;
    else if (k.stan === 'brak_wiedzy')
      stan = `<p class="tb-d-stan brak">${L('Nikt się nie zna', EN.nikt)}: ${esc(brakWiedzy(t, k))}. ${L('Potrzebna osoba z umiejętnością albo książka.', EN.potrzebna)}</p>`;
    else if (k.stan === 'stoi')
      stan = `<p class="tb-d-stan brak">${L('Badanie stoi: wiedza spadła poniżej poziomu. Postęp zostaje.', EN.stoiOpis)} ${esc(brakWiedzy(t, k))}.</p>`;
    else if (b.cur === t.id) stan = `<p class="tb-d-stan ok">${L('Badamy to teraz.', EN.badaneTeraz)}</p>`;
    koszt = `<p class="tb-d-koszt">${L(`Koszt ${kosztTxt(k.koszt)} pkt, postęp ${postepTxt(k.postep)}.`, EN.koszt(kosztTxt(k.koszt), postepTxt(k.postep)))}`;
    // czas do końca tylko tam, gdzie postęp w ogóle rośnie (kartka do wzięcia albo w toku), z bieżącą obsadą stołu
    if (k.stan === 'do_wziecia' || k.stan === 'w_toku')
      koszt += ` ${
        b.tempo > 0
          ? L(
              `Do końca ${kiedy((k.koszt - k.postep) / b.tempo)}, przy obecnej obsadzie.`,
              EN.czas(kiedy((k.koszt - k.postep) / b.tempo)),
            )
          : L('Nikt nie siedzi przy stole, więc czasu nie da się policzyć.', EN.bezObsady)
      }`;
    koszt += '</p>';
    if (k.stan === 'do_wziecia') {
      const zmiana = b.cur !== null && b.cur !== t.id;
      przycisk = `<button type="button" class="btn go" data-akcja="badaj" data-arg="${t.id}">${L(zmiana ? 'Zmień na to badanie' : 'Badać', zmiana ? EN.zmien : EN.badaj)}</button>${
        zmiana ? `<p class="tb-d-uwaga">${L('Postęp obecnego badania zostaje.', EN.zmienPostep)}</p>` : ''
      }`;
    }
  }
  const era = `${L('Era', EN.era)} ${t.era} · ${tr(nazwaEry(t.era))} · ${dom} ${t.lvl}`;
  return `<aside class="tb-szczegoly${t.koncowa ? ' koncowa' : ''}" aria-live="polite" data-wybrana="${t.id}"><h3 class="tb-d-nazwa">${esc(tr(nazwaTech(t.id)))}${t.koncowa ? ` <i class="tb-cel">${L('Cel', EN.cel)}</i>` : ''}</h3><p class="tb-d-era">${esc(era)}</p><p class="tb-d-opis">${esc(tr(opis))}</p>${
    t.req.length ? `<p class="tb-d-h">${L('Wymaga', EN.wymaga)}:</p><ul class="tb-d-wym">${wymagania}</ul>` : ''
  }${stan}${koszt}${k.stan !== 'zbadana' && k.stan !== 'odwrocona' ? `<p class="tb-d-wiedza">${esc(wiedza)}.</p>${znaja}` : ''}${przycisk}</aside>`;
}

/** pasek obsady na dole: kto siedzi przy stole, bieżące badanie z postępem i czasem do końca, półka z książkami */
function obsadaHtml(b: SimBadania, kart: Map<string, Kartka>): string {
  const cur = b.cur !== null && Object.hasOwn(TECH_BY, b.cur) ? TECH_BY[b.cur] : undefined;
  const dom = cur?.dom ?? null;
  const ludzie = b.siedza.length
    ? b.siedza.map((s) => osobaHtml(s, dom)).join(' ')
    : `<span class="tb-pusto">${L('Nikt nie siedzi.', EN.pusto)}${cur ? ` ${L('Zarząd sadza się z menu pracowni.', EN.pustoPodpowiedz)}` : ''}</span>`;
  const k = cur && kart.get(cur.id);
  let badanie: string;
  if (!cur || !k) badanie = `<span class="tb-pusto">${L('Żadne badanie nie jest wybrane.', EN.nicNieWybrano)}</span>`;
  else {
    const dokonca = k.stan === 'w_toku' && b.tempo > 0 ? kiedy((k.koszt - k.postep) / b.tempo) : null;
    badanie = `<b>${L('Bada się', EN.badamy)}:</b> ${esc(tr(nazwaTech(cur.id)))} <span class="tb-postep"><span class="tb-pasek"><i style="width:${Math.min(100, Math.round((100 * k.postep) / k.koszt))}%"></i></span> <span class="tb-liczby">${postepTxt(k.postep)} / ${kosztTxt(k.koszt)}</span>${
      dokonca
        ? `, ${L(`koniec za ${dokonca}`, EN.koniec(dokonca))}`
        : k.stan === 'stoi'
          ? `, ${L('stoi', EN.stoiKrotko)}`
          : ''
    }</span>`;
  }
  const polka = TECH_DOMS.map((d) => {
    const n = b.ksiazki[d] ?? 0;
    return `<span class="tb-ksiazki" data-dom="${d}" data-n="${n}" title="${esc(`${domNazwa(d)}, ${L(`książki: ${n}`, EN.ksiazki(n))}`)}">${esc(domNazwa(d))} <b>${n}</b></span>`;
  }).join('');
  return `<footer class="tb-obsada"><div class="tb-ob-ludzie"><b>${L('Przy stole', EN.obsada)}:</b> ${ludzie}</div><div class="tb-ob-badanie">${badanie}</div><div class="tb-polka"><b>${L('Półka', EN.polka)}:</b> ${polka}</div></footer>`;
}

/** Całe wnętrze tablicy badań. wybrana: technologia, której szczegóły widać (null: podpowiedź); mode: tryb gry
    (kartki z innym `tryb` znikają, a w trybie zombie szczegóły biorą opis `dzialanieZombie`). */
export function tablicaHtml(b: SimBadania, o: { wybrana: string | null; mode: GameMode }): string {
  const kart = new Map(b.kartki.map((k) => [k.id, k]));
  const techs = TECHS.filter((t) => (t.tryb === undefined || t.tryb === o.mode) && kart.has(t.id));
  const poz = uklad(techs);
  const wiersze = Math.max(0, ...[...poz.values()].map((p) => p.wiersz));
  const szer = MARGINES * 2 + (ERY.length - 1) * ODSTEP_X + KARTA_W;
  const wys = GORA + wiersze * ODSTEP_Y + KARTA_H + DOL;
  const naglowki = ERY.map(
    (e, kol) =>
      `<div class="tb-era" style="left:${MARGINES + kol * ODSTEP_X}px;--rot:${kol % 2 ? 1.2 : -1.4}deg">${e.nr}. ${esc(tr(nazwaEry(e.nr)))}</div>`,
  ).join('');
  const nici = techs
    .flatMap((t) =>
      t.req.flatMap((r) => {
        const od = poz.get(r);
        const do_ = poz.get(t.id);
        if (!od || !do_ || !kart.has(r)) return [];
        const sel = o.wybrana === r || o.wybrana === t.id;
        const przyg = kart.get(t.id)?.stan === 'odwrocona';
        return [
          `<path class="tb-nic${sel ? ' sel' : ''}${przyg ? ' przyg' : ''}" data-od="${r}" data-do="${t.id}" d="${sznurek(od, do_)}"/>`,
        ];
      }),
    )
    .join('');
  const kartki = techs
    .map((t, i) => {
      const p = poz.get(t.id);
      const k = kart.get(t.id);
      return p && k ? kartkaHtml(t, k, p, i, o.wybrana === t.id) : '';
    })
    .join('');
  return `<header class="tb-bar"><div class="tb-tytul"><b id="tbTytul">${L('Tablica badań', EN.tytul)}</b><small class="tb-pauza">${L('Gra stoi', EN.stoi)}</small></div><button type="button" class="btn go" data-akcja="zamknij" title="Esc · T">${L('Wróć do gry', EN.wroc)}</button></header><div class="tb-glowna"><div class="tb-wrap" tabindex="0"><div class="tb-board" style="width:${szer}px;height:${wys}px"><svg class="tb-nici" width="${szer}" height="${wys}" viewBox="0 0 ${szer} ${wys}" aria-hidden="true"><defs><marker id="tbSupel" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse"><circle cx="4" cy="4" r="3" fill="#b3261e"/></marker></defs>${nici}</svg>${naglowki}${kartki}</div></div>${szczegolyHtml(b, o, kart)}</div>${obsadaHtml(b, kart)}`;
}

/** najmniejsza skala planszy na szerokim ekranie: mniejsze kartki byłyby nieczytelne, więc poniżej plansza zostaje szersza
    od okna i przewija się w poziomie */
export const SKALA_MIN = 0.7;

/** Skala planszy dla okna o szerokości `okno` (px, wnętrze okna planszy bez ramy i paska przewijania) i planszy
    o szerokości `plansza` (px w skali 1): 1, gdy plansza się mieści, inaczej `okno / plansza` zaokrąglone w dół do
    tysięcznych (żeby po przeskalowaniu mieściła się co do piksela), ale nie mniej niż SKALA_MIN. Bez sensownych wymiarów
    (ukryta tablica ma okno 0) skala 1. */
export function skalaPlanszy(okno: number, plansza: number): number {
  if (!(okno > 0) || !(plansza > 0)) return 1;
  return Math.max(SKALA_MIN, Math.min(1, Math.floor((okno / plansza) * 1000) / 1000));
}

/** Podpowiedź po „Badać”, gdy zaznaczonych jest więcej osób niż wolnych miejsc przy stole (`wolne` z `wolneMiejsca`):
    ile usiądzie i że reszta nie ma miejsca; gdy miejsc nie ma wcale, ten sam napis co wyszarzone „Badać” w menu. null,
    gdy usiądą wszyscy (zostaje zwykłe „Zajmie się badaniami.”). */
export function usiadaPodpowiedz(wolne: number, zaznaczonych: number): string | null {
  if (wolne >= zaznaczonych) return null;
  if (wolne < 1) return tr(BRAK_MIEJSCA);
  return L(`Usiądą ${wolne} z ${zaznaczonych}, przy stole nie ma więcej miejsc.`, EN.usiada(wolne, zaznaczonych));
}

/** Czy tablica ma się otworzyć sama (z pauzą): tylko gdy stoi pracownia, żadne badanie nie jest wybrane, tablica nie jest
    otwarta, nie czeka ani nie jest otwarte żadne inne okno (karta nocy, uchwała, wydarzenie, raport, spotkanie, karta
    odkrycia, panel budowy), nie trwa napad ani „Do broni!” (ani stado pod siatką) i tablica nie otwierała się już sama od
    ostatniego wyboru badania (`byla`: gracz ją zamknął bez wyboru, więc nie wyskakuje drugi raz). */
export function czyOtworzycSama(o: {
  pracownia: boolean;
  cur: string | null;
  otwarta: boolean;
  oknoCzeka: boolean;
  napad: boolean;
  alarm: boolean;
  byla: boolean;
}): boolean {
  return o.pracownia && o.cur === null && !o.otwarta && !o.oknoCzeka && !o.napad && !o.alarm && !o.byla;
}

/** Karta „Odkrycie” po ukończeniu badania `id`: nazwa technologii w tytule, jedno zdanie o tym, co daje (w trybie zombie
    opis `dzialanieZombie`), co odblokowuje, i przyciski: „Postaw <budowla>” (`odkrycie-postaw`, `data-arg` to rodzaj
    budowli; po jednym na budowlę, dziś najwyżej jeden), „Następne badanie” (`odkrycie-nastepne`) i „Dalej”
    (`odkrycie-dalej`). Esc i klik obok też zamykają (jak „Dalej”). Nieznana technologia (np. ze starego zapisu) daje kartę
    z samym identyfikatorem i bez przycisku stawiania. */
export function odkrycieSheet(id: string, mode: GameMode = 'zwykly'): Sheet {
  const t = Object.hasOwn(TECH_BY, id) ? TECH_BY[id] : undefined;
  const budowle = (t?.odblokowuje ?? []).filter((k): k is BuildKind => Object.hasOwn(BUILDS, k));
  const opis = t ? tr(mode === 'zombie' ? (t.dzialanieZombie ?? t.dzialanie) : t.dzialanie) : '';
  const odblokowuje = budowle.length
    ? `<p class="odk-nowe">${L('Odblokowuje', EN.odblokowuje)}: ${esc(budowle.map(buildName).join(', '))}.</p>`
    : '';
  const przyciski = [
    ...budowle.map(
      (k) =>
        `<button type="button" class="btn go" data-act="odkrycie-postaw" data-arg="${k}">${esc(postawLabel(k))}</button>`,
    ),
    `<button type="button" class="btn${budowle.length ? '' : ' go'}" data-act="odkrycie-nastepne">${L('Następne badanie', EN.nastepne)}</button>`,
    `<button type="button" class="btn ghost" data-act="odkrycie-dalej">${L('Dalej', EN.dalej)}</button>`,
  ];
  return {
    tone: 'odkrycie',
    kicker: esc(t ? `${L('Badania', EN.badania)} · ${domNazwa(t.dom)} ${t.lvl}` : L('Badania', EN.badania)),
    title: esc(`${L('Odkrycie', EN.odkrycie)}: ${t ? tr(nazwaTech(id)) : id}`),
    body: `${opis ? `<p class="odk-opis">${esc(opis)}</p>` : ''}${odblokowuje}`,
    foot: przyciski.join(''),
    closable: true,
  };
}
