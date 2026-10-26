/* Karta osady AI (docs/superpowers/plans/2026-10-24-osada-ai-etap-2.md, zadanie 5; projekt docs/superpowers/specs/2026-10-20-osada-ai-design.md,
   „Jak to wygląda dla gracza”: klik w ich budynek otwiera kartę osady, a bez naszych ludzi na miejscu karta pokazuje to, co
   widzieliśmy ostatnio). To zwykła karta w miejscu karty osoby i karty budynku (`#card`, src/main.ts), bez PixiJS: tutaj tylko jej
   HTML (`kartaOsadyHtml`) i dane, które do niego idą (`daneKartyOsady`).

   Co mówi. Nazwa osady (z kierunku od domu, src/ai/kwadrat.ts), kierunek („Leży na zachód od was.”) i liczby „z ostatniego kontaktu
   (dzień N)”: ludność i budowle, które poseł podał w karcie pierwszego kontaktu (`StanOsady.kontakt`, src/ui/osada.ts), przez `num`
   z src/ui/tekst.ts. To wszystko, co gracz wie: etap 2 nie ma naszych ludzi na miejscu, więc nic na karcie nie pochodzi z bieżącej gry
   osady („żadna strona nie widzi więcej niż jej ludzie”, decyzja 6 specyfikacji). Dlatego `daneKartyOsady` czyta z osady tylko
   odkrycie, kontakt i świat (nazwę z kierunkiem), a test pilnuje, że nie sięga po nic innego i że osada, która od kontaktu upadła
   albo odwołała zarząd, ma kartę taką samą jak przedtem (rozstrzygnięcie kontrolera, runda poprawek 1). Wieść o upadku albo
   odwołaniu to wiedza z żywej gry, a „zdanie posła zapamiętane przy kontakcie” wymagałoby nowego pola w zapisie (format zapisu
   zostaje), więc w etapie 2 karta go nie ma; o upadku i o odwołaniu ich zarządu mówi sama karta posła w chwili kontaktu
   (src/gov/kontakt.ts). Bez przycisków dyplomacji (wysłać posła, wymiana, pakt, danina to etap 3) i bez czegokolwiek, co nie wynika
   z kontaktu.

   Jedyny przycisk to zamknięcie (`data-card="osada-zamknij"`, obsługuje go main.ts jak inne przyciski karty; Esc zamyka kartę tak
   samo). Teksty w obu językach przez `L` i `tr` w chwili wywołania, nazwa i kierunek jako `Tx` z osady, ucieczka HTML przez `esc`. */

import { L, type Tx, tr } from '../core/jezyk.ts';
import type { OsadaGry } from './osada.ts';
import { esc, num } from './tekst.ts';

/** Co karta osady wie: nazwa i kierunek osady oraz liczby z kontaktu, nic z jej bieżącej gry. */
export interface DaneKartyOsady {
  nazwa: Tx;
  /** kierunek od domu do osady: „na zachód” / “to the west” */
  kierunek: Tx;
  /** ludność i budowle z kontaktu (`dzien` to dzień naszej gry, w którym poseł je podał) */
  kontakt: { dzien: number; ludnosc: number; budowle: number };
}

/** HTML karty osady w bieżącym języku. Jeden przycisk (zamknięcie), reszta to tekst. */
export function kartaOsadyHtml(o: DaneKartyOsady): string {
  const k = o.kontakt;
  const zamknij = L('Zamknij kartę', 'Close the card');
  return [
    `<header class="osada-glowa"><h2>${esc(tr(o.nazwa))}</h2><button type="button" class="card-x" data-card="osada-zamknij" aria-label="${esc(zamknij)}" title="${esc(`${zamknij} (Esc)`)}">×</button></header>`,
    `<p class="osada-kierunek">${esc(L(`Leży ${tr(o.kierunek)} od was.`, `It lies ${tr(o.kierunek)} of you.`))}</p>`,
    `<h3 class="apt-h">${esc(L(`Z ostatniego kontaktu (dzień ${num(k.dzien, 0)})`, `From the last contact (day ${num(k.dzien, 0)})`))}</h3>`,
    `<ul class="apt-list"><li class="apt-i"><span>${L('Mieszkańcy', 'Population')}</span><b class="apt-c">${num(k.ludnosc, 0)}</b></li><li class="apt-i"><span>${L('Budowle', 'Buildings')}</span><b class="apt-c">${num(k.budowle, 0)}</b></li></ul>`,
    `<p class="doing">${esc(L('To wszystko, co o nich wiecie.', 'That is all you know about them.'))}</p>`,
  ].join('');
}

/** Dane karty z osady gry: tylko to, co gracz wie z kontaktu (nazwa, kierunek, liczby z kontaktu); null, gdy osada nie jest odkryta
    albo nie ma kontaktu (karty wtedy nie ma). Z osady czyta tylko `odkryta`, `kontakt` i `swiat`: upadek, licznik odwołań i jej gra
    to wiedza z żywej gry, więc karta ich nie zna (test podaje obiekt, który notuje każde odczytane pole). */
export function daneKartyOsady(o: Pick<OsadaGry, 'odkryta' | 'kontakt' | 'swiat'>): DaneKartyOsady | null {
  const k = o.kontakt;
  const s = o.swiat;
  if (!o.odkryta || !k || !s) return null;
  return { nazwa: s.nazwa, kierunek: s.kierunek, kontakt: { dzien: k.dzien, ludnosc: k.ludnosc, budowle: k.budowle } };
}
