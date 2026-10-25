/* Karta osady AI (docs/superpowers/plans/2026-10-24-osada-ai-etap-2.md, zadanie 5; projekt docs/superpowers/specs/2026-10-20-osada-ai-design.md,
   „Jak to wygląda dla gracza”: klik w ich budynek otwiera kartę osady, a bez naszych ludzi na miejscu karta pokazuje to, co
   widzieliśmy ostatnio). To zwykła karta w miejscu karty osoby i karty budynku (`#card`, src/main.ts), bez PixiJS: tutaj tylko jej
   HTML (`kartaOsadyHtml`) i dane, które do niego idą (`daneKartyOsady`).

   Co mówi. Nazwa osady (z kierunku od domu, src/ai/kwadrat.ts), kierunek („Leży na zachód od was.”) i liczby „z ostatniego kontaktu
   (dzień N)”: ludność i budowle, które poseł podał w karcie pierwszego kontaktu (`StanOsady.kontakt`, src/ui/osada.ts), przez `num`
   z src/ui/tekst.ts. NIGDY nie pokazuje liczb z bieżącej gry osady: etap 2 nie ma naszych ludzi na miejscu, więc gracz wie tyle, ile
   usłyszał, a podgląd na żywo byłby wiedzą, której nikt nie zdobył („żadna strona nie widzi więcej niż jej ludzie”). Dlatego
   `daneKartyOsady` czyta z osady tylko to, co gracz mógł zobaczyć (odkrycie, kontakt, nazwę, kierunek, upadek i to, że zarząd był
   odwoływany), a test pilnuje, że sięgnięcie po cokolwiek innego rzuca. Dwie wieści zmieniają kartę, bo bez nich kłamałaby, że osada
   żyje i ma te same władze: upadek (dzień i powód, zdaniem jak w karcie posła, src/gov/kontakt.ts) i to, że zarząd był już
   odwoływany (bez licznika: liczba odwołań to liczba z gry osady). Nic poza tym: bez przycisków dyplomacji (wysłać posła, wymiana,
   pakt, danina to etap 3) i bez czegokolwiek, co nie wynika z kontaktu.

   Jedyny przycisk to zamknięcie (`data-card="osada-zamknij"`, obsługuje go main.ts jak inne przyciski karty; Esc zamyka kartę tak
   samo). Teksty w obu językach przez `L` i `tr` w chwili wywołania, nazwa i kierunek jako `Tx` z osady, ucieczka HTML przez `esc`.
   Słowo zarządu w zdaniu o odwołaniu daje wołający (`zarzad`: w bloku „zarząd”, w domu „komitet”, jak w karcie posła). */

import { L, type Tx, tr, tx } from '../core/jezyk.ts';
import type { OsadaGry } from './osada.ts';
import { esc, num } from './tekst.ts';

/** Co karta osady wie: nazwa i kierunek osady, liczby z kontaktu, a opcjonalnie wieści, które zmieniają kartę. */
export interface DaneKartyOsady {
  nazwa: Tx;
  /** kierunek od domu do osady: „na zachód” / “to the west” */
  kierunek: Tx;
  /** ludność i budowle z kontaktu (`dzien` to dzień naszej gry, w którym poseł je podał) */
  kontakt: { dzien: number; ludnosc: number; budowle: number };
  /** osada upadła: dzień jej gry i powód */
  upadla?: { dzien: number; powod: 'pustka' | 'exodus' };
  /** zarząd osady był już odwoływany (bez licznika) */
  odwolana?: true;
  /** słowo zarządu w zdaniu o odwołaniu (domyślnie „zarząd”, w domu „komitet”) */
  zarzad?: Tx;
}

/** powód upadku osady słowami z karty posła (src/gov/kontakt.ts) */
const POWOD_UPADKU: Record<'pustka' | 'exodus', Tx> = {
  pustka: tx('nikt tam nie przeżył', 'nobody there survived'),
  exodus: tx('ludzie przestali wierzyć i rozeszli się', 'the people lost faith and scattered'),
};

/** zdanie o upadku osady: dzień jej gry i powód */
function zdanieUpadku(u: NonNullable<DaneKartyOsady['upadla']>): string {
  const powod = POWOD_UPADKU[u.powod];
  return L(
    `Osada upadła w dniu ${num(u.dzien, 0)}: ${powod.pl}.`,
    `The settlement fell on day ${num(u.dzien, 0)}: ${powod.en}.`,
  );
}

/** HTML karty osady w bieżącym języku. Jeden przycisk (zamknięcie), reszta to tekst. */
export function kartaOsadyHtml(o: DaneKartyOsady): string {
  const k = o.kontakt;
  const zarzad = o.zarzad ?? tx('zarząd', 'board');
  const zamknij = L('Zamknij kartę', 'Close the card');
  return [
    `<header class="osada-glowa"><h2>${esc(tr(o.nazwa))}</h2><button type="button" class="card-x" data-card="osada-zamknij" aria-label="${esc(zamknij)}" title="${esc(`${zamknij} (Esc)`)}">×</button></header>`,
    `<p class="osada-kierunek">${esc(L(`Leży ${tr(o.kierunek)} od was.`, `It lies ${tr(o.kierunek)} of you.`))}</p>`,
    `<h3 class="apt-h">${esc(L(`Z ostatniego kontaktu (dzień ${num(k.dzien, 0)})`, `From the last contact (day ${num(k.dzien, 0)})`))}</h3>`,
    `<ul class="apt-list"><li class="apt-i"><span>${L('Mieszkańcy', 'Population')}</span><b class="apt-c">${num(k.ludnosc, 0)}</b></li><li class="apt-i"><span>${L('Budowle', 'Buildings')}</span><b class="apt-c">${num(k.budowle, 0)}</b></li></ul>`,
    o.upadla ? `<p class="apt-why">${esc(zdanieUpadku(o.upadla))}</p>` : '',
    o.odwolana
      ? `<p class="apt-why">${esc(L(`Ich ${zarzad.pl} był już odwoływany.`, `Their ${zarzad.en} has already been recalled.`))}</p>`
      : '',
    `<p class="doing">${esc(L('To wszystko, co o nich wiecie.', 'That is all you know about them.'))}</p>`,
  ].join('');
}

/** Dane karty z osady gry: tylko to, co gracz mógł zobaczyć (odkrycie, kontakt, nazwa, kierunek, upadek, to, że zarząd był
    odwoływany); null, gdy osada nie jest odkryta albo nie ma kontaktu (karty wtedy nie ma). Z `odwolania` robi samo „było”, a z
    gry osady nie czyta nic (test podaje obiekt, który rzuca przy każdym innym polu). */
export function daneKartyOsady(
  o: Pick<OsadaGry, 'odkryta' | 'kontakt' | 'swiat' | 'upadla' | 'odwolania'>,
  zarzad?: Tx,
): DaneKartyOsady | null {
  const k = o.kontakt;
  const s = o.swiat;
  if (!o.odkryta || !k || !s) return null;
  const u = o.upadla;
  return {
    nazwa: s.nazwa,
    kierunek: s.kierunek,
    kontakt: { dzien: k.dzien, ludnosc: k.ludnosc, budowle: k.budowle },
    ...(u ? { upadla: { dzien: u.dzien, powod: u.powod } } : {}),
    ...(o.odwolania > 0 ? { odwolana: true as const } : {}),
    ...(zarzad ? { zarzad } : {}),
  };
}
