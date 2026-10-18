/* Karta spotkania z lokatorami sąsiedniego budynku (M2 fala 2, docs/M2-fala-2.md) i zdania po spotkaniu oraz przy
   cudzych drzwiach. Czyste funkcje: dostają odczyt stanu (spotkanie, gospodarstwo, wybory z src/sim/sasiedzi.ts)
   i zwracają okno (Sheet) albo zdanie. Okna nie da się zamknąć bez wyboru, bo nasi stoją w drzwiach i czekają.
   Przycisk wyboru ma data-act „meet” i data-arg z wyborem; obsługę (polecenie meet do symulacji) robi main.ts.
   Napisy z src/content/napisy-sasiedzi.ts w bieżącym języku (tr z src/core/jezyk.ts); imiona i nazwiska zostają,
   zawody i nazwa budynku z mapy idą po angielsku. */

import { BUDYNEK, type Dwa, KARTA, type Kto, WYBOR, ZA_MALO_JEDZENIA, zdanie } from '../content/napisy-sasiedzi.ts';
import { tr } from '../core/jezyk.ts';
import type { Gospodarstwo, Napis, Spotkanie, WyborKarty, WyborSpotkania } from '../sim/sasiedzi.ts';
import type { Sheet } from './okna.ts';
import { esc, pct } from './tekst.ts';

/** to, czego karta potrzebuje ze stanu gry */
export interface WidokSpotkania {
  sp: Pick<Spotkanie, 'nr' | 'atak' | 'gdzie' | 'wywazone'>;
  g: Pick<Gospodarstwo, 'osoby' | 'znani' | 'zamiar' | 'nastroj' | 'rel' | 'szabrownicy' | 'ugryziony' | 'pytali'>;
  wybory: readonly WyborKarty[];
  /** porcje jedzenia w naszych zapasach */
  jedzenie: number;
  /** nazwa budynku (z mapy, po polsku jak w świecie) */
  budynek: string;
  /** budynek to dom jednorodzinny (w środku „w domu”, nie „w mieszkaniu”) */
  dom?: boolean;
}

/** napis na przycisku wyboru: szansa przy wyborach, które ją mają */
function etykieta(w: WyborKarty): string {
  const s = pct(w.szansa ?? 0);
  const f: Record<WyborSpotkania, () => Dwa> = {
    rozmowa: WYBOR.rozmowa,
    jedzenie: WYBOR.jedzenie,
    zaproszenie: () => WYBOR.zaproszenie(s),
    zabranie: () => WYBOR.zabranie(s),
    odejscie: WYBOR.odejscie,
    obrona: () => WYBOR.obrona(s),
    uspokojenie: () => WYBOR.uspokojenie(s),
    ucieczka: WYBOR.ucieczka,
    przegonic: () => WYBOR.przegonic(s),
    reka: WYBOR.reka,
  };
  return tr(f[w.k]());
}

/** okno spotkania: kto stoi w drzwiach, jak patrzy, co o nas myśli, i wybory */
export function spotkanieSheet(v: WidokSpotkania): Sheet {
  const { sp, g } = v;
  const title = sp.atak
    ? KARTA.tytul.atak
    : g.szabrownicy
      ? KARTA.tytul.szabrownicy
      : v.dom && sp.gdzie === 'mieszkanie'
        ? KARTA.tytul.dom
        : KARTA.tytul[sp.gdzie];
  const who = g.osoby.map((o) => `<li class="line">${esc(tr(KARTA.osoba(o.name, o.age, o.prof)))}</li>`).join('');
  // szabrownicy to nie lokatorzy: bez znajomości i stosunku do zarządu
  const look = [
    tr(g.szabrownicy ? KARTA.szabrownicy : g.znani ? KARTA.znani : KARTA.obcy),
    tr(KARTA.zamiar[g.zamiar]),
    tr(KARTA.nastroj[g.nastroj]),
  ].join(' ');
  const body = [
    `<ul class="lines">${who}</ul>`,
    `<p>${esc(look)}</p>`,
    g.ugryziony !== undefined && !g.pytali ? `<p>${esc(tr(KARTA.reka))}</p>` : '',
    g.szabrownicy ? '' : `<p class="sub">${esc(tr(KARTA.relacja(g.rel)))}</p>`,
    sp.wywazone && !g.szabrownicy ? `<p>${esc(tr(KARTA.wywazone))}</p>` : '',
    sp.atak ? `<p class="doing">${esc(tr(KARTA.bezRozmowy))}</p>` : '',
    v.wybory.some((w) => w.k === 'jedzenie') ? `<p class="doing">${esc(tr(KARTA.zapasy(v.jedzenie)))}</p>` : '',
  ].join('');
  const buttons = v.wybory
    .map((w) => {
      const danger = w.k === 'zabranie' || w.k === 'obrona';
      const why = !w.ok && w.k === 'jedzenie' ? ` title="${esc(tr(ZA_MALO_JEDZENIA))}"` : '';
      return `<button type="button" class="btn${danger ? ' danger' : ''}" data-act="meet" data-arg="${w.k}"${
        w.ok ? '' : ' disabled'
      }${why}>${esc(etykieta(w))}</button>`;
    })
    .join('');
  return {
    tone: sp.atak ? 'napad' : 'sasiedzi',
    kicker: `${esc(tr(KARTA.naglowek))} · ${esc(tr(BUDYNEK.nazwa(v.budynek)))}`,
    title: esc(tr(title)),
    body,
    foot: `<div class="choices">${buttons}</div>`,
  };
}

/** zdanie do podpowiedzi po napisie z symulacji (pusty napis, gdy nie ma czego powiedzieć); nazwa: budynek napisu */
export function zdanieNapisu(n: Pick<Napis, 'co' | 'ile' | 'info' | 'ilu'>, kto: Kto | null, nazwa?: string): string {
  return tr(zdanie(n.co, { kto, ile: n.ile, info: n.info, nazwa, ilu: n.ilu }));
}
