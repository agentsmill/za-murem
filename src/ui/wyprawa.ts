/* Okno planu wyprawy z mapy miasta (docs/superpowers/specs/2026-10-18-mapa-miasta-design.md, „Mapa miasta i minimapa
   na ekranie”, akapit o wysyłaniu): po „Wyślij wyprawę” na karcie miejsca gracz wybiera osoby z zarządu, widzi
   podsumowanie (wyjście, powrót, ryzyko słowem, ile uniosą, ile zostało w miejscu) i potwierdza. Czyste funkcje dają
   HTML w kształcie `Sheet`; samo wysłanie (`wyslijWyprawe`), skutki w symulacji, zapis i powrót do mapy robi
   main.ts, bo tylko on zna symulację i okno.

   Kontrakt.
   - `planWyprawySheet(cel, i, st, wybrani, odmowa?)`: okno planu. `wybrani` to id osób z zarządu (`GovPerson.id`).
     Każda osoba jest przyciskiem (`data-act="wp-osoba"`, w `data-arg` id, `aria-pressed` mówi, czy jest wybrana).
     Niezdolna jest wyszarzona (`disabled`) z powodem i nie liczy się do wybranych, choćby podano jej id. Przycisk
     „Wyślij wyprawę” (po angielsku „Send a supply run”, tak samo jak na karcie miejsca w src/ui/miasto.ts;
     `data-act="wyslij"`, w `data-arg` klucz miejsca) jest aktywny dokładnie wtedy, gdy
     `wyslijWyprawe` dla `kogoWyslac` by się udało. Podsumowanie liczy `podgladWyprawy` dla wysyłanych osób i zmienia się
     z ich liczbą (więcej osób, krótsze przeszukanie, większy udźwig, mniejsze ryzyko). `odmowa` (powód z nieudanego
     `wyslijWyprawe`) pokazuje się w oknie nad podsumowaniem, a okno zostaje otwarte.
   - Powody dla osób i dla całej wyprawy bierze wyłącznie `powodOdmowy` z src/gov/dzienne.ts, ta sama co przy wysyłaniu
     i na karcie miejsca, więc okno, karta i wysłanie nie mogą się rozjechać. Powód wspólny (po zmroku, za daleko,
     wybrane do cna, miejsce z mapy osiedla) nie wyszarza osób jedna po drugiej, tylko stoi nad podsumowaniem i wyszarza „Wyślij”.
   - `kogoWyslac(cel, i, st, wybrani)`: id wybranych i zdolnych, w kolejności zarządu: to dostaje `wyslijWyprawe`.
     `domyslniWybrani(cel, i, st, pionki)`: wybór na start z zaznaczenia w grze (id pionków → osoby z zarządu).
   - `odswiezPlan(okno, ...)`: po kliknięciu osoby zmienia w otwartym oknie tylko to, co się zmieniło (znaczniki osób,
     podsumowanie, przycisk), więc przewinięcie listy i fokus zostają. To jedyne miejsce z DOM; reszta to czyste funkcje
     (testy w Node), a wygląd oglądają zrzuty (`npm run shots -- miasto-wysylanie`).
   Nic stąd nie zmienia stanu zarządu ani wejścia i niczego nie losuje. Napisy od razu po polsku i angielsku
   (słowa z docs/SLOWNICZEK-EN.md); nazwy osób i miejsca, powody i atrybuty `data-*` idą przez ucieczkę HTML. */

import './wyprawa.css';
import { jezyk, L, type Tx, tr } from '../core/jezyk.ts';
import { kiedyWraca, podgladWyprawy, powodOdmowy } from '../gov/dzienne.ts';
import type { GovInput, GovPerson, GovState } from '../gov/typy.ts';
import { clockOf, gameMin } from '../gov/wspolne.ts';
import { type Cel, ryzykoSlowem } from '../gov/wyprawy.ts';
import { WEAPONS, WEAPONS_EN, type WeaponId } from '../sim/bron.ts';
import { czas, odleglosc } from './miasto.ts';
import { plural, type Sheet } from './okna.ts';
import type { Modal } from './okno.ts';
import { esc, manyEn, pct } from './tekst.ts';

/** Dlaczego tej osoby nie można wybrać albo null. To powód z `powodOdmowy` dla niej samej, ale nie powód wspólny
    dla całej wyprawy (`wspolny`): ten stoi nad podsumowaniem i wyszarza tylko „Wyślij”. */
function powodOsoby(st: GovState, i: GovInput, cel: Cel, id: string, wspolny: Tx | null): Tx | null {
  const p = powodOdmowy(st, i, cel, [id]);
  return p && (!wspolny || p.pl !== wspolny.pl) ? p : null;
}

/** Id wybranych i zdolnych osób, w kolejności zarządu, bez nieznanych i bez powtórzeń: to idzie do `wyslijWyprawe`. */
export function kogoWyslac(cel: Cel, i: GovInput, st: GovState, wybrani: ReadonlySet<string>): string[] {
  const wspolny = powodOdmowy(st, i, cel);
  return i.people.filter((p) => wybrani.has(p.id) && !powodOsoby(st, i, cel, p.id, wspolny)).map((p) => p.id);
}

/** Wybór na start z zaznaczenia w grze: osoby z zarządu, których pionek (`GovPerson.pawn`) jest w `pionki`, o ile
    zdolne do tej wyprawy. Pionki spoza zarządu (mieszkańcy, obcy) są pomijane. */
export function domyslniWybrani(cel: Cel, i: GovInput, st: GovState, pionki: ReadonlySet<number>): Set<string> {
  const zaznaczeni = new Set(i.people.filter((p) => pionki.has(p.pawn)).map((p) => p.id));
  return new Set(kogoWyslac(cel, i, st, zaznaczeni));
}

/** broń osoby w bieżącym języku; bez broni (albo z nieznanym id) gołe ręce */
function bron(p: GovPerson): string {
  const id: WeaponId = p.weapon && Object.hasOwn(WEAPONS, p.weapon) ? (p.weapon as WeaponId) : 'piesci';
  return jezyk() === 'en' ? WEAPONS_EN[id].name : WEAPONS[id].name;
}

/** Wiersz osoby: przycisk-przełącznik z imieniem, siłami, zdrowiem i bronią; niezdolna jest wyszarzona z powodem. */
function osobaHtml(p: GovPerson, wybrany: boolean, nie: Tx | null): string {
  const stan = `${L('siły', 'energy')} ${Math.round(p.needs.rest)} · ${L('zdrowie', 'health')} ${Math.round(
    p.needs.health,
  )} · ${L('broń', 'weapon')}: ${bron(p)}`;
  return `<li class="wp-os"><button type="button" class="wp-pick" data-act="wp-osoba" data-arg="${esc(p.id)}" aria-pressed="${
    wybrany ? 'true' : 'false'
  }"${nie ? ' disabled' : ''}><span class="wp-ptak" aria-hidden="true"></span><span class="who-t"><b class="who-n">${esc(
    p.name,
  )}</b> <small class="who-s">${esc(stan)}</small>${nie ? ` <small class="wp-powod">${esc(tr(nie))}</small>` : ''}</span></button></li>`;
}

/** sztuk po polsku z odmianą (1 sztuka, 2 sztuki, 5 sztuk), po angielsku item(s) */
const sztuk = (n: number): string =>
  jezyk() === 'en' ? manyEn(n, 'item', 'items') : `${n} ${plural(n, 'sztuka', 'sztuki', 'sztuk')}`;

/** Podsumowanie wyprawy dla wysyłanych osób `ids` (niepuste) albo pusty napis: wyjście teraz, powrót, czas poza
    osiedlem, ryzyko słowem i w procentach, udźwig i ile zostało w miejscu; po zmroku dopisek o powrocie rano. */
function podsumowanieHtml(cel: Cel, i: GovInput, st: GovState, ids: string[]): string {
  if (!ids.length) return '';
  const pg = podgladWyprawy(st, i, cel, ids);
  const kiedy = kiedyWraca(pg.powrot, i.day);
  const ryzyko = ryzykoSlowem(pg.ryzyko);
  // powrót w późniejszym dniu niż wyjście to powrót rano po przeczekaniu zmroku
  const rano = Math.floor(pg.powrot / 1440) > Math.floor(gameMin(i) / 1440);
  const wiersze: [string, string][] = [
    [L('Wyjście', 'Leaving'), L(`teraz, ${clockOf(i)}`, `now, ${clockOf(i)}`)],
    [L('Powrót', 'Back'), tr(kiedy)],
    [L('Czas poza osiedlem', 'Time away'), czas(pg.czasMin)],
    [L('Ryzyko', 'Risk'), `${tr(ryzyko)} (${pct(pg.ryzyko)})`],
    [L('Udźwig', 'Can carry'), L(`do ${pg.unosza} sztuk`, `up to ${sztuk(pg.unosza)}`)],
  ];
  if (pg.zostalo !== null) wiersze.push([L('Zostało w miejscu', 'Left there'), sztuk(pg.zostalo)]);
  return `<dl class="wp-sum">${wiersze.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>${
    rano
      ? `<p class="wp-rano">${L(
          'Wrócą dopiero rano: po zmroku nikt nie chodzi po mieście.',
          'They’ll only be back in the morning: nobody walks the city after dark.',
        )}</p>`
      : ''
  }`;
}

/** Część okna, którą zmienia wybór osób: podsumowanie i powód (albo `odmowa` po nieudanym wysłaniu). Zwraca HTML do
    `[data-wp-stan]` i to, czy wolno wysłać. */
function stanHtml(
  cel: Cel,
  i: GovInput,
  st: GovState,
  wybrani: ReadonlySet<string>,
  odmowa?: Tx | null,
): { html: string; mozna: boolean } {
  const ids = kogoWyslac(cel, i, st, wybrani);
  const powod = powodOdmowy(st, i, cel, ids);
  const pokaz = odmowa ?? powod;
  return {
    html: `${pokaz ? `<p class="wp-why" role="${odmowa ? 'alert' : 'status'}">${esc(tr(pokaz))}</p>` : ''}${podsumowanieHtml(cel, i, st, ids)}`,
    mozna: !powod,
  };
}

/** przyciski stopki: powrót do mapy i potwierdzenie (wyszarzone, gdy nie wolno wysłać) */
const stopka = (cel: Cel, mozna: boolean): string =>
  `<button type="button" class="btn ghost" data-act="wp-wroc">${L('Wróć do mapy', 'Back to the map')}</button><button type="button" class="btn go" data-act="wyslij" data-arg="${esc(
    cel.klucz,
  )}"${mozna ? '' : ' disabled'}>${L('Wyślij wyprawę', 'Send a supply run')}</button>`;

/** Okno planu wyprawy do `cel` dla zarządu `st` i wejścia `i`; `wybrani` to id wybranych osób, `odmowa` powód
    z nieudanego `wyslijWyprawe` (okno zostaje otwarte). Zamykane bez decyzji (Esc, klik obok). */
export function planWyprawySheet(
  cel: Cel,
  i: GovInput,
  st: GovState,
  wybrani: ReadonlySet<string>,
  odmowa?: Tx | null,
): Sheet {
  const wspolny = powodOdmowy(st, i, cel);
  const wysylani = new Set(kogoWyslac(cel, i, st, wybrani));
  const osoby = i.people.map((p) => osobaHtml(p, wysylani.has(p.id), powodOsoby(st, i, cel, p.id, wspolny))).join('');
  const stan = stanHtml(cel, i, st, wybrani, odmowa);
  return {
    tone: 'wyprawa',
    kicker: L('Wyprawa po zapasy', 'Supply run'),
    title: esc(tr(cel.nazwa)),
    body: `<div class="wp" data-wp><p class="lead">${L(
      `${odleglosc(cel.odl, 'pl')} stąd. Kogo wysyłacie?`,
      `${odleglosc(cel.odl, 'en')} from the estate. Who goes?`,
    )}</p><ul class="wp-lista">${osoby}</ul><div class="wp-stan" data-wp-stan>${stan.html}</div></div>`,
    foot: stopka(cel, stan.mozna),
    closable: true,
  };
}

/** Odświeża otwarte okno planu po zmianie wyboru: znaczniki osób, podsumowanie i przycisk „Wyślij”. Listy osób nie
    buduje od nowa, więc przewinięcie i fokus zostają. Bez okna z planem nic nie robi. */
export function odswiezPlan(
  okno: Pick<Modal, 'find'>,
  cel: Cel,
  i: GovInput,
  st: GovState,
  wybrani: ReadonlySet<string>,
  odmowa?: Tx | null,
): void {
  const wp = okno.find('[data-wp]');
  if (!wp) return;
  const wysylani = new Set(kogoWyslac(cel, i, st, wybrani));
  for (const b of wp.querySelectorAll<HTMLElement>('[data-act="wp-osoba"]'))
    b.setAttribute('aria-pressed', wysylani.has(b.dataset.arg ?? '') ? 'true' : 'false');
  const stan = stanHtml(cel, i, st, wybrani, odmowa);
  const el = okno.find('[data-wp-stan]');
  if (el) el.innerHTML = stan.html;
  const wyslij = okno.find<HTMLButtonElement>('[data-act="wyslij"]');
  if (wyslij) wyslij.disabled = !stan.mozna;
}
