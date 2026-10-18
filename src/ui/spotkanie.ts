/* Karta spotkania z lokatorami sąsiedniego budynku (M2 fala 2, docs/M2-fala-2.md) i zdania po spotkaniu oraz przy
   cudzych drzwiach. Czyste funkcje: dostają odczyt stanu (spotkanie, gospodarstwo, wybory z src/sim/sasiedzi.ts)
   i zwracają okno (Sheet) albo zdanie. Okna nie da się zamknąć bez wyboru, bo nasi stoją w drzwiach i czekają.
   Przycisk wyboru ma data-act „meet” i data-arg z wyborem; obsługę (polecenie meet do symulacji) robi main.ts.
   Napisy z src/content/napisy-sasiedzi.ts, na razie po polsku. */

import { KARTA, type Kto, WYBOR, ZA_MALO_JEDZENIA, zdanie } from '../content/napisy-sasiedzi.ts';
import type { Gospodarstwo, Napis, Spotkanie, WyborKarty, WyborSpotkania } from '../sim/sasiedzi.ts';
import type { Sheet } from './okna.ts';
import { esc, pct } from './tekst.ts';

/** to, czego karta potrzebuje ze stanu gry */
export interface WidokSpotkania {
  sp: Pick<Spotkanie, 'nr' | 'atak' | 'gdzie' | 'wywazone'>;
  g: Pick<Gospodarstwo, 'osoby' | 'znani' | 'zamiar' | 'nastroj' | 'rel'>;
  wybory: readonly WyborKarty[];
  /** porcje jedzenia w naszych zapasach */
  jedzenie: number;
  /** nazwa budynku (z mapy) */
  budynek: string;
}

/** napis na przycisku wyboru: szansa przy wyborach, które ją mają */
function etykieta(w: WyborKarty): string {
  const s = pct(w.szansa ?? 0);
  const f: Record<WyborSpotkania, () => { pl: string }> = {
    rozmowa: WYBOR.rozmowa,
    jedzenie: WYBOR.jedzenie,
    zaproszenie: () => WYBOR.zaproszenie(s),
    zabranie: () => WYBOR.zabranie(s),
    odejscie: WYBOR.odejscie,
    obrona: () => WYBOR.obrona(s),
    uspokojenie: () => WYBOR.uspokojenie(s),
    ucieczka: WYBOR.ucieczka,
  };
  return f[w.k]().pl;
}

/** okno spotkania: kto stoi w drzwiach, jak patrzy, co o nas myśli, i wybory */
export function spotkanieSheet(v: WidokSpotkania): Sheet {
  const { sp, g } = v;
  const title = sp.atak ? KARTA.tytul.atak : KARTA.tytul[sp.gdzie];
  const who = g.osoby.map((o) => `<li class="line">${esc(KARTA.osoba(o.name, o.age, o.prof).pl)}</li>`).join('');
  const look = [(g.znani ? KARTA.znani : KARTA.obcy).pl, KARTA.zamiar[g.zamiar].pl, KARTA.nastroj[g.nastroj].pl].join(
    ' ',
  );
  const body = [
    `<ul class="lines">${who}</ul>`,
    `<p>${esc(look)}</p>`,
    `<p class="sub">${esc(KARTA.relacja(g.rel).pl)}</p>`,
    sp.wywazone ? `<p>${esc(KARTA.wywazone.pl)}</p>` : '',
    sp.atak ? `<p class="doing">${esc(KARTA.bezRozmowy.pl)}</p>` : '',
    v.wybory.some((w) => w.k === 'jedzenie') ? `<p class="doing">${esc(KARTA.zapasy(v.jedzenie).pl)}</p>` : '',
  ].join('');
  const buttons = v.wybory
    .map((w) => {
      const danger = w.k === 'zabranie' || w.k === 'obrona';
      const why = !w.ok && w.k === 'jedzenie' ? ` title="${esc(ZA_MALO_JEDZENIA.pl)}"` : '';
      return `<button type="button" class="btn${danger ? ' danger' : ''}" data-act="meet" data-arg="${w.k}"${
        w.ok ? '' : ' disabled'
      }${why}>${esc(etykieta(w))}</button>`;
    })
    .join('');
  return {
    tone: sp.atak ? 'napad' : 'sasiedzi',
    kicker: `${esc(KARTA.naglowek.pl)} · ${esc(v.budynek)}`,
    title: esc(title.pl),
    body,
    foot: `<div class="choices">${buttons}</div>`,
  };
}

/** zdanie do podpowiedzi po napisie z symulacji (pusty napis, gdy nie ma czego powiedzieć) */
export function zdanieNapisu(n: Pick<Napis, 'co' | 'ile' | 'info'>, kto: Kto | null): string {
  return zdanie(n.co, { kto, ile: n.ile, info: n.info }).pl;
}
