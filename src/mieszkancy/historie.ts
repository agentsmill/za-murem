/* Historie gospodarstw: dwa, trzy zdania o każdym gospodarstwie z dziennika zdarzeń silnika (czas.ts), kroniki osiedla
   (kronika.ts), dawnych zawodów i fachów (fachy.ts), złożone z szablonów (szablony.ts) z poprawną odmianą imion
   (odmiana.ts). Generator (generuj.ts) woła `historieBudynku` po imionach i fachach, z kroniką liczoną raz na obszar.

   Fakty. Z dziennika budynku zbieramy fakty o członkach gospodarstwa i ich krewnych (`faktyGospodarstwa`): powrót do
   opieki nad rodzicem, owdowienie, przydział mieszkania (tylko gospodarstwa `odOddania`, przez osobę z przydziałem albo
   jej dziecko, wnuka czy małżonka), emigracja i wyprowadzka krewnych, którzy nadal są poza domem (dzieci, rodzeństwo,
   wnuki, rodzice; oboje rodzice jednym zdaniem), powrót osoby z gospodarstwa, urodzenie, zgon rodzica, dziadka albo
   rodzeństwa (śmierci dzieci nie opisujemy), związek i wprowadzka. Wyprowadzki z obszaru, wyludnienie i wyjazd sierot
   silnik zapisuje tak samo (`wyprowadzka`), więc rozróżniamy je po kierunku (`dokad`): wyludnienie ma własne kierunki,
   „do krewnych” to sieroty (pomijane, bo gospodarstwo wtedy znika). Ten sam krewny dla kilku członków to jeden fakt,
   przypięty do najbliższej osoby (małżonek, rodzic albo dziecko, rodzeństwo, dziadkowie albo wnuki).

   Wybór. Zdania o zdarzeniach idą według wagi typu (`WAGI_ZDARZEN`: powrót do opieki, owdowienie, przydział, emigracja,
   powrót, reszta); remis rozstrzyga losowanie. Najwyżej dwa typy, każdy raz, i tylko taki, dla którego jest pasujący
   szablon. Potem, gdy ktoś z gospodarstwa mieszkał tu przed 2029 rokiem, jedno zdanie wspólne: z kroniki (wspólne
   zdarzenie z jej rokiem albo prawdziwe miejsce z jej nazwą) albo z dawnych czasów; najpierw dla bohatera historii (osoby
   z najważniejszego zdarzenia), potem dla tych, którzy pamiętają dawne czasy. Historia ma dwa albo trzy zdania: trzy,
   gdy są dwa zdarzenia i zdanie wspólne, inaczej trzecie z szansą 1/2; brakujące zdania dopełniają kolejne zdarzenia,
   zdanie wspólne, stan gospodarstwa w 2051 (samotność, para, trzy pokolenia, fach). W budynku szablony się nie
   powtarzają, dopóki są inne pasujące: wybieramy spośród najrzadziej dotąd użytych (`uzyte`, wspólne dla budynku).
   Zdania stoją w kolejności lat. Gdy zdanie zaczyna się od osoby, od której zaczynało się poprzednie, imię odpada
   („Agnieszka mieszka w mieszkaniu po babci… Wróciła z Wrocławia w 2031…”).

   Odmiana. Imiona w zdaniach tylko w formach z `odmien`; gdy odmiana imienia nie jest pewna (`pewne: false`), szablon
   z tym imieniem w przypadku innym niż mianownik nie pasuje i wchodzi szablon z mianownikiem („Halina: syn wyjechał…”).
   Nazwisko rodziny w liczbie mnogiej tylko z pewnej odmiany (`formyNazwiska`). Rzeczowniki pokrewieństwa z `KREWNI`.

   RODO: żadnych numerów mieszkań, pięter ani ulic; prawdziwe miejsca tylko z kroniki (`WpisKroniki.miejsce`, już po
   filtrze nazw w kronika.ts). Kategorię miejsca rozpoznajemy po rzeczowniku przed nawiasem w tekście kroniki
   (`kategoriaWpisu`), a temat wpisu bez miejsca po wzorcu tekstu (`tematWpisu`, `TEMATY_KRONIKI`); test pilnuje, że
   kroniki dem rozpoznają się w całości.

   Determinizm: ziarno `losDla('historie', klucz budynku, id gospodarstwa)`, losowanie przez los.ts (całkowite). Moduł
   działa w przeglądarce i w Node, nie zmienia wejścia (indeksy budynku trzyma w WeakMap), a `historieBudynku` dopisuje
   tylko pole `historia` gospodarstwom wyniku, który wywołujący sam stworzył. */

import type { Rng } from '../core/rng.ts';
import { fachOsoby, type IdFachu, nazwaFachu, zawodOsoby } from './fachy.ts';
import type { WpisKroniki } from './kronika.ts';
import { calkowita, losDla, szansa } from './los.ts';
import { type Formy, formyNazwiska, odmien, type TabelaKoncowek, type TabelaOdmiany } from './odmiana.ts';
import {
  KIERUNKI_WYLUDNIENIA,
  type Kierunek,
  type KontekstSzablonu,
  KREWNI,
  type Krewny,
  type RodzajSzablonu,
  type RodzajZawodu,
  type RodzajZdarzenia,
  SKAD,
  SZABLONY,
  type Szablon,
  slotySzablonu,
  TEMATY_KRONIKI,
  wypelnij,
} from './szablony.ts';
import type { Gospodarstwo, Osoba, Wpis, WynikBudynku } from './typy.ts';

/** Tabele odmiany dla historii (R49): słownik SGJP i tablica końcówek zgadywacza. */
export interface Odmiana {
  tabela: TabelaOdmiany;
  koncowki: TabelaKoncowek;
}

/** Waga typu zdarzenia w wyborze zdań: im większa, tym ważniejsze zdarzenie. */
export const WAGI_ZDARZEN: Readonly<Record<RodzajZdarzenia, number>> = {
  powrotOpieka: 6,
  owdowienie: 5,
  przydzial: 4,
  emigracja: 3,
  powrot: 2,
  urodzenie: 1,
  zgon: 1,
  wyprowadzka: 1,
  zwiazek: 1,
  wprowadzka: 1,
};

const ROK_ZERO = 2026;
/** Kto mieszkał tu przed tym rokiem, pamięta dawne czasy osiedla (odkrycie bakterii około 2029). */
const ROK_ODKRYCIA = 2029;
/** Szansa na 10 000 trzeciego zdania, gdy nie wynika z materiału. */
const SZANSA_TRZECIEGO = 5000;
const DOROSLY = 18;
/** Klucz kolejności zdań: dawne czasy tuż przed rokiem zero, stan w 2051 na końcu. */
const KLUCZ_DAWNYCH = ROK_ZERO - 0.5;
const KLUCZ_STANU = 9999;

// ---------------------------------------------------------------- pokrewieństwo

const RODZICE = new Set<Krewny>(['matka', 'ojciec']);
/** Bliskość krewnego (mniej to bliżej): do kogo przypiąć fakt, który dotyczy kilku członków gospodarstwa. */
const BLISKOSC: Record<Krewny, number> = {
  maz: 0,
  zona: 0,
  matka: 1,
  ojciec: 1,
  rodzice: 1,
  syn: 1,
  corka: 1,
  brat: 2,
  siostra: 2,
  babcia: 3,
  dziadek: 3,
  wnuk: 3,
  wnuczka: 3,
};
const ZMARLI_OPISYWANI = new Set<Krewny>(['matka', 'ojciec', 'babcia', 'dziadek', 'brat', 'siostra']);
const WYJEZDNI_OPISYWANI = new Set<Krewny>(['syn', 'corka', 'brat', 'siostra', 'wnuk', 'wnuczka', 'matka', 'ojciec']);
const Z_PRZYDZIALEM = new Set<Krewny>(['matka', 'ojciec', 'babcia', 'dziadek', 'maz', 'zona']);

const rodzicOsoby = (o: Osoba, wg: ReadonlyMap<string, Osoba>): Osoba[] =>
  [o.matka, o.ojciec].flatMap((id) => {
    const p = id === undefined ? undefined : wg.get(id);
    return p ? [p] : [];
  });

/** Kim jest `p` dla `o`: małżonek, rodzic, dziecko, rodzeństwo (wspólna matka albo ojciec), dziadek albo wnuk.
    `undefined`, gdy nikim z tych. Rodzaj rzeczownika bierze się z płci `p`. */
export function pokrewienstwo(o: Osoba, p: Osoba, wg: ReadonlyMap<string, Osoba>): Krewny | undefined {
  if (o.id === p.id) return undefined;
  const m = p.plec === 'M';
  if (o.partner === p.id || p.partner === o.id) return m ? 'maz' : 'zona';
  if (o.matka === p.id) return 'matka';
  if (o.ojciec === p.id) return 'ojciec';
  if (p.matka === o.id || p.ojciec === o.id) return m ? 'syn' : 'corka';
  const wspolnyRodzic =
    (o.matka !== undefined && o.matka === p.matka) || (o.ojciec !== undefined && o.ojciec === p.ojciec);
  if (wspolnyRodzic) return m ? 'brat' : 'siostra';
  if (rodzicOsoby(o, wg).some((r) => r.matka === p.id || r.ojciec === p.id)) return m ? 'dziadek' : 'babcia';
  if (rodzicOsoby(p, wg).some((r) => r.matka === o.id || r.ojciec === o.id)) return m ? 'wnuk' : 'wnuczka';
  return undefined;
}

// ---------------------------------------------------------------- indeks budynku

interface Indeks {
  wg: Map<string, Osoba>;
  dzieci: Map<string, Osoba[]>;
  /** Osoby, których `partner` wskazuje na klucz. */
  partnerzy: Map<string, Osoba[]>;
  /** Wpisy według `kto` i według `z`, w kolejności dziennika (chronologicznie). */
  wpisy: Map<string, Wpis[]>;
  wpisyZ: Map<string, Wpis[]>;
  przydzialy: Wpis[];
  /** Pamięć `pobyty` na osobę. */
  pobyty: Map<string, [number, number][]>;
}
const INDEKSY = new WeakMap<WynikBudynku, Indeks>();

function dopisz<T>(m: Map<string, T[]>, k: string, v: T): void {
  const l = m.get(k);
  if (l) l.push(v);
  else m.set(k, [v]);
}

function indeks(w: WynikBudynku): Indeks {
  const gotowy = INDEKSY.get(w);
  if (gotowy) return gotowy;
  const ind: Indeks = {
    wg: new Map(),
    dzieci: new Map(),
    partnerzy: new Map(),
    wpisy: new Map(),
    wpisyZ: new Map(),
    przydzialy: [],
    pobyty: new Map(),
  };
  for (const o of w.osoby) {
    ind.wg.set(o.id, o);
    for (const r of [o.matka, o.ojciec]) if (r !== undefined) dopisz(ind.dzieci, r, o);
    if (o.partner !== undefined) dopisz(ind.partnerzy, o.partner, o);
  }
  for (const e of w.dziennik) {
    dopisz(ind.wpisy, e.kto, e);
    if (e.z !== undefined) dopisz(ind.wpisyZ, e.z, e);
    if (e.typ === 'przydzial') ind.przydzialy.push(e);
  }
  INDEKSY.set(w, ind);
  return ind;
}

/** Krewni osoby, o których mówi `pokrewienstwo`: małżonkowie, rodzice, dziadkowie, dzieci, wnuki, rodzeństwo. */
function krewni(o: Osoba, ind: Indeks): Osoba[] {
  const wynik = new Map<string, Osoba>();
  const dodaj = (p: Osoba | undefined): void => {
    if (p && p.id !== o.id) wynik.set(p.id, p);
  };
  if (o.partner !== undefined) dodaj(ind.wg.get(o.partner));
  for (const p of ind.partnerzy.get(o.id) ?? []) dodaj(p);
  const rodzice = rodzicOsoby(o, ind.wg);
  for (const r of rodzice) {
    dodaj(r);
    for (const d of rodzicOsoby(r, ind.wg)) dodaj(d);
    for (const s of ind.dzieci.get(r.id) ?? []) dodaj(s);
  }
  for (const d of ind.dzieci.get(o.id) ?? []) {
    dodaj(d);
    for (const wn of ind.dzieci.get(d.id) ?? []) dodaj(wn);
  }
  return [...wynik.values()];
}

const PRZYJAZDY = new Set(['wprowadzka', 'urodzenie', 'powrot', 'powrotOpieka']);
const WYJAZDY = new Set(['wyprowadzka', 'emigracja']);

/** Lata, w których osoba mieszkała w budynku, jako przedziały [od, do] (włącznie). Kto nie ma wpisu przyjazdu ani
    urodzenia na początku, mieszkał tu od zawsze (spis 2021 i wcześniej). */
function pobyty(o: Osoba, ind: Indeks): [number, number][] {
  const gotowe = ind.pobyty.get(o.id);
  if (gotowe) return gotowe;
  const wpisy = ind.wpisy.get(o.id) ?? [];
  const pierwszy = wpisy[0];
  let tu = !(pierwszy && (pierwszy.typ === 'wprowadzka' || pierwszy.typ === 'urodzenie'));
  let od = Number.NEGATIVE_INFINITY;
  const wynik: [number, number][] = [];
  for (const e of wpisy) {
    if (PRZYJAZDY.has(e.typ) && !tu) {
      tu = true;
      od = e.rok;
    } else if ((WYJAZDY.has(e.typ) || e.typ === 'zgon') && tu) {
      tu = false;
      wynik.push([od, e.rok]);
    }
  }
  if (tu) wynik.push([od, Number.POSITIVE_INFINITY]);
  ind.pobyty.set(o.id, wynik);
  return wynik;
}
const bylTu = (o: Osoba, rok: number, ind: Indeks): boolean =>
  rok >= o.rocznik && pobyty(o, ind).some(([od, doRoku]) => od <= rok && rok <= doRoku);
/** Osoba mieszkała tu przed odkryciem (2029), więc pamięta dawne czasy osiedla. */
const zDawnychCzasow = (o: Osoba, ind: Indeks): boolean =>
  o.rocznik < ROK_ODKRYCIA && pobyty(o, ind).some(([od]) => od < ROK_ODKRYCIA);

// ---------------------------------------------------------------- fakty

/** Fakt z dziennika do opisania jednym zdaniem: kto (osoba główna, członek gospodarstwa), z kim, kiedy i jak. */
export interface Fakt {
  typ: RodzajZdarzenia;
  waga: number;
  rok: number;
  glowna: Osoba;
  powiazana?: Osoba;
  kim?: Krewny;
  dokad?: string;
  kierunek?: Kierunek;
  emigrant?: boolean;
  towarzysz?: boolean;
  zyje?: boolean;
  rodzenstwo?: boolean;
  zRodzina?: boolean;
  przyjezdny?: boolean;
  /** Osoba główna ma innego krewnego o tym samym pokrewieństwie (drugi brat): zdanie musi podać imię krewnego. */
  niejednoznaczny?: boolean;
  /** Osoba główna mieszkała tu w roku zdarzenia. */
  tuWtedy?: boolean;
  /** Owdowienie: od tamtej pory nikt do tej osoby nie dołączył i ona się nie przeniosła. */
  samotnie?: boolean;
}

function kierunekWyjazdu(dokad: string | undefined): Kierunek {
  if (dokad === 'do krewnych') return 'krewni';
  return dokad !== undefined && KIERUNKI_WYLUDNIENIA.has(dokad) ? 'wyludnienie' : 'kraj';
}

/** Fakty o gospodarstwie z dziennika budynku `w` (bez wyboru i bez losowania), w kolejności znalezienia. */
export function faktyGospodarstwa(gosp: Gospodarstwo, w: WynikBudynku): Fakt[] {
  const ind = indeks(w);
  const { wg } = ind;
  const czlonkowie = gosp.czlonkowie.flatMap((id) => {
    const o = wg.get(id);
    return o ? [o] : [];
  });
  const wDomu = new Set(gosp.czlonkowie);
  const fakty = new Map<string, { f: Fakt; bliskosc: number }>();
  const dodaj = (klucz: string, f: Omit<Fakt, 'waga'>, bliskosc: number): void => {
    const stary = fakty.get(klucz);
    if (!stary || bliskosc < stary.bliskosc) fakty.set(klucz, { f: { ...f, waga: WAGI_ZDARZEN[f.typ] }, bliskosc });
  };
  const kim = (o: Osoba, p: Osoba | undefined): Krewny | undefined => (p ? pokrewienstwo(o, p, wg) : undefined);
  const osoba = (id: string | undefined): Osoba | undefined => (id === undefined ? undefined : wg.get(id));
  const para = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
  // śmierć małżonka kogoś stąd opisuje owdowienie, więc nie powtarzamy jej jako śmierci rodzica
  const wdowcow = new Set(
    czlonkowie.flatMap((m) => (ind.wpisy.get(m.id) ?? []).flatMap((e) => (e.typ === 'owdowienie' && e.z ? [e.z] : []))),
  );

  for (const m of czlonkowie) {
    const wlasne = ind.wpisy.get(m.id) ?? [];
    for (const [i, e] of wlasne.entries()) {
      const z = osoba(e.z);
      switch (e.typ) {
        case 'powrotOpieka':
          if (z) {
            const rodzenstwo = (ind.dzieci.get(z.id) ?? []).some((d) => d.id !== m.id && !wDomu.has(d.id));
            const f = { typ: e.typ, rok: e.rok, glowna: m, powiazana: z, kim: kim(m, z), dokad: e.dokad };
            dodaj(`opieka|${m.id}|${e.rok}`, { ...f, zyje: z.stan === 'tu', rodzenstwo }, 0);
          }
          break;
        case 'owdowienie':
          if (z) {
            const samotnie =
              !wlasne.some((x) => x.rok > e.rok && PRZYJAZDY.has(x.typ)) &&
              !(ind.wpisyZ.get(m.id) ?? []).some((x) => x.rok > e.rok && PRZYJAZDY.has(x.typ));
            const f = { typ: e.typ, rok: e.rok, glowna: m, powiazana: z, kim: kim(m, z), samotnie };
            dodaj(`owdowienie|${m.id}|${e.rok}`, f, 0);
          }
          break;
        case 'powrot': {
          // towarzysz wraca razem z osobą, która sama ma wpis powrotu z tego roku; gdy ona też tu mieszka, mówi o tym jej fakt
          const towarzysz =
            z !== undefined &&
            (ind.wpisy.get(z.id) ?? []).some(
              (x) => x.rok === e.rok && (x.typ === 'powrot' || x.typ === 'powrotOpieka'),
            );
          if (towarzysz && wDomu.has(z.id)) break;
          const wyjazd = wlasne.slice(0, i).findLast((x) => WYJAZDY.has(x.typ));
          dodaj(
            `powrot|${m.id}|${e.rok}`,
            {
              typ: e.typ,
              rok: e.rok,
              glowna: m,
              powiazana: z,
              kim: kim(m, z),
              dokad: e.dokad,
              towarzysz,
              emigrant: wyjazd?.typ === 'emigracja',
            },
            0,
          );
          break;
        }
        case 'urodzenie':
          dodaj(`urodzenie|${m.id}`, { typ: e.typ, rok: e.rok, glowna: m, powiazana: z, kim: kim(m, z) }, 0);
          break;
        case 'zwiazek':
          if (z) {
            const zyje = z.stan === 'tu' && wDomu.has(z.id);
            dodaj(`zwiazek|${para(m.id, z.id)}|${e.rok}`, { typ: e.typ, rok: e.rok, glowna: m, powiazana: z, zyje }, 0);
          }
          break;
        case 'wprowadzka': {
          const doPartnera =
            z !== undefined &&
            (ind.wpisy.get(z.id) ?? []).some((x) => x.typ === 'zwiazek' && x.z === m.id && x.rok === e.rok);
          if (z && doPartnera) {
            // partner, który wprowadził się do kogoś stąd; gdy ten ktoś też tu mieszka, fakt jest jego (bliskość 0)
            const zyje = z.stan === 'tu' && wDomu.has(z.id);
            const f = { typ: 'zwiazek' as const, rok: e.rok, glowna: m, powiazana: z, przyjezdny: true, zyje };
            dodaj(`zwiazek|${para(m.id, z.id)}|${e.rok}`, f, 1);
            break;
          }
          if (z && wDomu.has(z.id)) break; // przyszedł z głową gospodarstwa, która tu mieszka: mówi o tym jej fakt
          const zRodzina =
            z !== undefined || (ind.wpisyZ.get(m.id) ?? []).some((x) => x.typ === 'wprowadzka' && x.rok === e.rok);
          dodaj(
            `wprowadzka|${m.id}|${e.rok}`,
            { typ: e.typ, rok: e.rok, glowna: m, powiazana: z, kim: kim(m, z), zRodzina },
            0,
          );
          break;
        }
        default:
          break;
      }
    }

    for (const p of krewni(m, ind)) {
      if (wDomu.has(p.id)) continue;
      const k = pokrewienstwo(m, p, wg);
      if (!k) continue;
      const bliskosc = BLISKOSC[k];
      const wpisyP = ind.wpisy.get(p.id) ?? [];
      if (p.stan === 'zmarl' && ZMARLI_OPISYWANI.has(k) && !wdowcow.has(p.id)) {
        const zgon = wpisyP.find((x) => x.typ === 'zgon');
        if (zgon) dodaj(`zgon|${p.id}`, { typ: 'zgon', rok: zgon.rok, glowna: m, powiazana: p, kim: k }, bliskosc);
      }
      if (p.stan !== 'wyjechal' || !WYJEZDNI_OPISYWANI.has(k)) continue;
      const wyjazd = wpisyP.findLast((x) => WYJAZDY.has(x.typ));
      if (!wyjazd) continue;
      const kierunek = kierunekWyjazdu(wyjazd.dokad);
      if (kierunek === 'krewni') continue;
      const lider = osoba(wyjazd.z);
      const kLidera =
        lider && lider.stan === 'wyjechal' && !wDomu.has(lider.id) ? pokrewienstwo(m, lider, wg) : undefined;
      // jechał z kimś z rodziny, o kim też będzie zdanie (lider jest poza domem): zdanie należy do lidera
      if (kLidera && WYJEZDNI_OPISYWANI.has(kLidera)) continue;
      const towarzysze = (ind.wpisyZ.get(p.id) ?? []).filter((x) => x.rok === wyjazd.rok && x.typ === wyjazd.typ);
      const drugiRodzic = towarzysze.some((x) => {
        const q = wg.get(x.kto);
        const kq = q && q.stan === 'wyjechal' ? pokrewienstwo(m, q, wg) : undefined;
        return kq !== undefined && RODZICE.has(kq);
      });
      const typ = wyjazd.typ === 'emigracja' ? 'emigracja' : 'wyprowadzka';
      const f = { typ, rok: wyjazd.rok, glowna: m, powiazana: p, dokad: wyjazd.dokad, kierunek } as const;
      dodaj(`wyjazd|${p.id}`, { ...f, kim: RODZICE.has(k) && drugiRodzic ? 'rodzice' : k }, bliskosc);
    }

    // dziecko wróciło opiekować się tą osobą, ale już tu nie mieszka
    for (const e of ind.wpisyZ.get(m.id) ?? []) {
      const d = e.typ === 'powrotOpieka' && !wDomu.has(e.kto) ? wg.get(e.kto) : undefined;
      if (d) {
        const f = { typ: 'powrotOpieka' as const, rok: e.rok, glowna: m, powiazana: d, kim: kim(m, d), dokad: e.dokad };
        dodaj(`opieka|${d.id}|${e.rok}`, { ...f, zyje: d.stan === 'tu' }, 1);
      }
    }
  }

  if (gosp.odOddania) {
    for (const e of ind.przydzialy) {
      const wlasciciel = wg.get(e.kto);
      if (!wlasciciel) continue;
      if (wDomu.has(wlasciciel.id)) {
        dodaj('przydzial', { typ: 'przydzial', rok: e.rok, glowna: wlasciciel }, 0);
        break;
      }
      let najblizszy: { m: Osoba; k: Krewny } | undefined;
      for (const m of czlonkowie) {
        const k = pokrewienstwo(m, wlasciciel, wg);
        if (k && Z_PRZYDZIALEM.has(k) && (!najblizszy || BLISKOSC[k] < BLISKOSC[najblizszy.k])) najblizszy = { m, k };
      }
      if (najblizszy) {
        const f = {
          typ: 'przydzial' as const,
          rok: e.rok,
          glowna: najblizszy.m,
          powiazana: wlasciciel,
          kim: najblizszy.k,
        };
        dodaj('przydzial', f, BLISKOSC[najblizszy.k]);
        break;
      }
    }
  }
  return [...fakty.values()].map(({ f }) => {
    const p = f.powiazana;
    const niejednoznaczny =
      f.kim !== undefined &&
      p !== undefined &&
      DO_IMIENIA.has(f.typ) &&
      [...krewni(f.glowna, ind), ...czlonkowie].some(
        (q) => q.id !== p.id && q.id !== f.glowna.id && pokrewienstwo(f.glowna, q, wg) === f.kim,
      );
    return { ...f, niejednoznaczny, tuWtedy: bylTu(f.glowna, f.rok, ind) };
  });
}
/** Typy, w których krewny bez imienia mógłby się pomylić z innym krewnym o tym samym pokrewieństwie. */
const DO_IMIENIA = new Set<RodzajZdarzenia>(['zgon', 'wyprowadzka', 'emigracja']);

// ---------------------------------------------------------------- kronika

/** Rzeczownik kategorii przed nazwą w nawiasie, tak jak pisze go kronika (SLOWNIK w kronika.ts, `rzecz` w mianowniku
    i miejscowniku): „W aptece (Apteka Pod Lwem) …”, „Przychodnia (Baltmed) …”. Kategorie `sklep` i `inne` to „lokal”. */
const KATEGORIE_KRONIKI: readonly (readonly [string, readonly string[]])[] = [
  ['szkola', ['Szkoła', 'W szkole']],
  ['przedszkole', ['Przedszkole', 'W przedszkolu']],
  ['zlobek', ['Żłobek', 'W żłobku']],
  ['przychodnia', ['Przychodnia', 'W przychodni']],
  ['apteka', ['Apteka', 'W aptece']],
  ['spozywczy', ['Sklep spożywczy', 'W sklepie spożywczym']],
  ['lokal', ['Lokal', 'W lokalu']],
  ['elektronika', ['Sklep z elektroniką', 'W sklepie z elektroniką']],
  ['ubrania', ['Sklep z ubraniami', 'W sklepie z ubraniami']],
  ['budowlany', ['Sklep z narzędziami i częściami', 'W sklepie z narzędziami i częściami']],
  ['ogrodnik', ['Sklep ogrodniczy', 'W sklepie ogrodniczym']],
  ['biblioteka', ['Biblioteka', 'W bibliotece']],
  ['bank', ['Bank', 'W banku']],
  ['stacja', ['Stacja paliw', 'Na stacji paliw']],
  ['kosciol', ['Kościół', 'W kościele']],
  ['urzad', ['Placówka', 'W placówce']],
];

/** Wpis kroniki z prawdziwą nazwą miejsca w nawiasie („W aptece (Apteka Pod Lwem)…”). Miejsce z nazwą zamienioną na
    opis („apteka”) albo nazwą samej kategorii nie ma nawiasu i nie jest nazwane. */
const nazwane = (e: WpisKroniki): boolean => e.miejsce !== undefined && e.tekst.includes(`(${e.miejsce})`);

/** Kategoria miejsca wpisu kroniki (klucz jak w kronika.ts, `lokal` dla sklepów i lokali) albo `undefined`, gdy wpis
    nie ma nazwanego miejsca albo rzeczownik przed nawiasem jest nieznany. */
export function kategoriaWpisu(e: WpisKroniki): string | undefined {
  if (!nazwane(e)) return undefined;
  const przed = e.tekst.slice(0, e.tekst.indexOf(` (${e.miejsce})`));
  return KATEGORIE_KRONIKI.find(([, formy]) => formy.includes(przed))?.[0];
}

/** Temat wpisu kroniki bez miejsca (`TEMATY_KRONIKI`) albo `undefined`. */
export function tematWpisu(e: WpisKroniki): string | undefined {
  if (e.miejsce !== undefined) return undefined;
  return TEMATY_KRONIKI.find(([, wzorzec]) => wzorzec.test(e.tekst))?.[0];
}

// ---------------------------------------------------------------- szablony: warunki

const PO_RODZAJU = new Map<RodzajSzablonu, Szablon[]>();
for (const s of SZABLONY) dopisz(PO_RODZAJU, s.rodzaj, s);
const SLOTY = new Map<string, string[]>(SZABLONY.map((s) => [s.id, slotySzablonu(s.tekst)]));
const szablonyRodzaju = (r: RodzajSzablonu): readonly Szablon[] => PO_RODZAJU.get(r) ?? [];
/** Szablony miejsc według kategorii i szablony kroniki według tematu: kandydaci tylko z pasującego klucza. */
const PO_KATEGORII = new Map<string, Szablon[]>();
for (const s of szablonyRodzaju('miejsce')) for (const k of s.kategoria ?? []) dopisz(PO_KATEGORII, k, s);
const PO_TEMACIE = new Map<string, Szablon[]>();
for (const s of szablonyRodzaju('kronika')) if (s.temat !== undefined) dopisz(PO_TEMACIE, s.temat, s);

/** Na czym stoi zdanie: fakt z dziennika, wpis kroniki, dawne czasy albo stan gospodarstwa. */
interface Podstawa {
  rodzaj: RodzajSzablonu;
  rok: number;
  /** Wiek osoby głównej, który sprawdzają `wiekOd`/`wiekDo` i który wypisuje `{wiek}`. */
  wiek: number;
  klucz: number;
  glowna: Osoba;
  powiazana?: Osoba;
  fakt?: Fakt;
  miejsce?: string;
  kategoria?: string;
  temat?: string;
  para?: boolean;
  pokolenia?: boolean;
  dzieci?: boolean;
  ciasno?: boolean;
}

interface Kandydat {
  s: Szablon;
  p: Podstawa;
}

/** Cechy gospodarstwa w 2051 dla szablonów stanu. */
interface Dom {
  czlonkowie: Osoba[];
  wDomu: Set<string>;
  sam: boolean;
  blok: boolean;
  rokStanu: number;
}

function rodzajZawodu(o: Osoba): RodzajZawodu | undefined {
  const z = zawodOsoby(o);
  if (!z || o.dawnyZawod === undefined) return undefined;
  if (z.satyra) return 'satyra';
  if (o.dawnyZawod === 'emeryt' || o.dawnyZawod === 'emerytka') return 'emeryt';
  if (/student|uczeń|uczennica/.test(o.dawnyZawod)) return 'nauka';
  return 'zwykly';
}

function nazwaFachuOsoby(o: Osoba): string | undefined {
  return fachOsoby(o) ? nazwaFachu(o.fach as IdFachu, o.plec) : undefined;
}

/** Odmiana imion i nazwisk w jednym wywołaniu historii (pamięć na osobę). */
class Odmiany {
  private readonly imiona = new Map<string, { formy: Formy; pewne: boolean }>();
  private readonly rodziny = new Map<string, string | undefined>();
  private readonly odm: Odmiana;
  constructor(odm: Odmiana) {
    this.odm = odm;
  }

  imie(o: Osoba): { formy: Formy; pewne: boolean } {
    let w = this.imiona.get(o.id);
    if (!w) {
      w = odmien(o.imie, o.plec, this.odm.tabela, this.odm.koncowki);
      this.imiona.set(o.id, w);
    }
    return w;
  }

  /** Nazwisko rodziny osoby w mianowniku liczby mnogiej, tylko gdy odmiana jest pewna. */
  rodzina(o: Osoba): string | undefined {
    if (this.rodziny.has(o.id)) return this.rodziny.get(o.id);
    const meskie = o.plec === 'M' ? o.nazwisko : meskieNazwisko(o.nazwisko, this.odm.tabela);
    const { formy, pewne } = formyNazwiska(meskie, this.odm.tabela, this.odm.koncowki);
    const zgodne = (o.plec === 'M' ? formy.m.mian : formy.k.mian) === o.nazwisko;
    const wynik = pewne && zgodne && o.nazwisko !== '' ? formy.mnoga : undefined;
    this.rodziny.set(o.id, wynik);
    return wynik;
  }
}

const ZENSKIE_NA_MESKIE = new WeakMap<TabelaOdmiany, Map<string, string>>();
/** Męska forma nazwiska kobiety: ze słownika (żeński mianownik → klucz), a bez słownika końcówka -ska, -cka, -dzka
    na -ski, -cki, -dzki; inne nazwiska kobiet są takie jak męskie (Nowak). */
function meskieNazwisko(zenskie: string, t: TabelaOdmiany): string {
  let mapa = ZENSKIE_NA_MESKIE.get(t);
  if (!mapa) {
    mapa = new Map();
    for (const [m, f] of Object.entries(t.nazwiska)) if (!mapa.has(f.k.mian)) mapa.set(f.k.mian, m);
    ZENSKIE_NA_MESKIE.set(t, mapa);
  }
  const zeSlownika = mapa.get(zenskie);
  if (zeSlownika) return zeSlownika;
  return /(sk|ck|dzk)a$/.test(zenskie) ? `${zenskie.slice(0, -1)}i` : zenskie;
}

function pasuje(
  s: Szablon,
  p: Podstawa,
  dom: Dom,
  odm: Odmiany,
  uzyteTu: ReadonlySet<string>,
  motywy: ReadonlySet<string>,
): boolean {
  if (uzyteTu.has(s.id) || (s.motyw && motywy.has(s.motyw))) return false;
  const f = p.fakt;
  if (s.od !== undefined && p.rok < s.od) return false;
  if (s.do !== undefined && p.rok > s.do) return false;
  if (s.wiekOd !== undefined && p.wiek < s.wiekOd) return false;
  if (s.wiekDo !== undefined && p.wiek > s.wiekDo) return false;
  if (s.kim && !(f?.kim && s.kim.includes(f.kim))) return false;
  if (s.bezPowiazanej && p.powiazana) return false;
  if (s.kierunek && !(f?.kierunek && s.kierunek.includes(f.kierunek))) return false;
  if (s.dokadTylko && !(f?.dokad && s.dokadTylko.includes(f.dokad))) return false;
  if (f?.niejednoznaczny && !s.imiennie) return false;
  const flaga = (wartosc: boolean | undefined, warunek: boolean | undefined): boolean =>
    warunek === undefined || (wartosc ?? false) === warunek;
  if (!flaga(f?.emigrant, s.emigrant) || !flaga(f?.towarzysz, s.towarzysz) || !flaga(f?.zyje, s.zyje)) return false;
  if (!flaga(f?.tuWtedy, s.tuWtedy) || !flaga(f?.samotnie, s.samotnie)) return false;
  if (!flaga(f?.rodzenstwo, s.rodzenstwo) || !flaga(f?.zRodzina, s.zRodzina) || !flaga(f?.przyjezdny, s.przyjezdny))
    return false;
  if (!flaga(dom.sam, s.sam) || !flaga(dom.blok, s.blok)) return false;
  if (!flaga(p.para, s.para) || !flaga(p.pokolenia, s.pokolenia)) return false;
  if (!flaga(p.dzieci, s.dzieci) || !flaga(p.ciasno, s.ciasno)) return false;
  if (s.zawod) {
    const z = rodzajZawodu(p.glowna);
    if (!z || (s.zawod !== 'dowolny' && s.zawod !== z)) return false;
  }
  if (s.kategoria && !(p.kategoria && s.kategoria.includes(p.kategoria))) return false;
  if (s.temat !== undefined && s.temat !== p.temat) return false;
  for (const slot of SLOTY.get(s.id) ?? []) {
    if (!slotMa(slot, p, odm)) return false;
  }
  return true;
}

/** Czy podstawa ma wartość dla slotu, a imię w przypadku innym niż mianownik ma pewną odmianę. */
function slotMa(slot: string, p: Podstawa, odm: Odmiany): boolean {
  if (slot.startsWith('o:')) return slot === 'o:mian' || odm.imie(p.glowna).pewne;
  if (slot.startsWith('p:')) return p.powiazana !== undefined && (slot === 'p:mian' || odm.imie(p.powiazana).pewne);
  if (slot.startsWith('k:')) return p.fakt?.kim !== undefined;
  switch (slot) {
    case 'g':
      return true;
    case 'pg':
      return p.powiazana !== undefined;
    case 'rodzina':
      return odm.rodzina(p.glowna) !== undefined;
    case 'rok':
    case 'wiek':
      return true;
    case 'dokad':
      return !!p.fakt?.dokad;
    case 'skad':
      return p.fakt?.dokad !== undefined && Object.hasOwn(SKAD, p.fakt.dokad);
    case 'miejsce':
      return !!p.miejsce;
    case 'zawod':
      return p.glowna.dawnyZawod !== undefined;
    case 'fach':
      return nazwaFachuOsoby(p.glowna) !== undefined;
    default:
      return false;
  }
}

function kontekst(p: Podstawa, odm: Odmiany): KontekstSzablonu {
  const f = p.fakt;
  return {
    glowna: { ...p.glowna, formy: odm.imie(p.glowna).formy },
    powiazana: p.powiazana ? { ...p.powiazana, formy: odm.imie(p.powiazana).formy } : undefined,
    rodzina: odm.rodzina(p.glowna),
    rok: p.rok,
    wiek: p.wiek,
    dokad: f?.dokad,
    skad: f?.dokad !== undefined && Object.hasOwn(SKAD, f.dokad) ? SKAD[f.dokad] : undefined,
    miejsce: p.miejsce,
    krewny: f?.kim ? KREWNI[f.kim] : undefined,
    zawod: p.glowna.dawnyZawod,
    fach: nazwaFachuOsoby(p.glowna),
  };
}

// ---------------------------------------------------------------- wybór zdań

/** Zdanie historii z identyfikatorem szablonu i jego rodzajem (do testów i narzędzi). */
export interface Zdanie {
  tekst: string;
  szablon: string;
  rodzaj: RodzajSzablonu;
}

const najstarszy = (osoby: readonly Osoba[]): Osoba =>
  osoby.reduce((a, b) => (b.rocznik < a.rocznik ? b : a), osoby[0]);
const wielka = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
/** Szablon zaczyna się od osoby głównej jako jedynego podmiotu (nie „{o:mian} i {p:mian}…”, nie „{o:mian}: …”). */
const PODMIOT = /^\{o:mian\} (?!i )/;

/** Zdania historii gospodarstwa z ich szablonami. `uzyte` liczy użycia szablonów w budynku (wspólne dla gospodarstw
    jednego budynku, zmieniane w miejscu); bez niego liczy od zera. */
export function zdaniaGospodarstwa(
  gosp: Gospodarstwo,
  w: WynikBudynku,
  kronika: readonly WpisKroniki[],
  odmiana: Odmiana,
  r: Rng,
  uzyte: Map<string, number> = new Map(),
): Zdanie[] {
  const ind = indeks(w);
  const czlonkowie = gosp.czlonkowie.flatMap((id) => {
    const o = ind.wg.get(id);
    return o ? [o] : [];
  });
  if (czlonkowie.length === 0) return [];
  const odm = new Odmiany(odmiana);
  const dom: Dom = {
    czlonkowie,
    wDomu: new Set(gosp.czlonkowie),
    sam: czlonkowie.length === 1,
    blok: w.budynek.typ === 'blok',
    rokStanu: w.rok ?? 2051,
  };
  const wybrane: Kandydat[] = [];
  const uzyteTu = new Set<string>();
  const motywy = new Set<string>();

  /** Wybiera spośród pasujących kandydatów najrzadziej używany w budynku szablon (remis losuje). */
  const bierz = (kandydaci: readonly Kandydat[]): boolean => {
    const wszystkie = kandydaci.filter((k) => pasuje(k.s, k.p, dom, odm, uzyteTu, motywy));
    if (wszystkie.length === 0) return false;
    // szablony zapasowe (imię po dwukropku) tylko wtedy, gdy nie pasuje żaden zwykły
    const zwykle = wszystkie.filter((k) => !k.s.zapas);
    const pasujace = zwykle.length ? zwykle : wszystkie;
    const ile = (k: Kandydat): number => uzyte.get(k.s.id) ?? 0;
    const najmniej = Math.min(...pasujace.map(ile));
    const rzadkie = pasujace.filter((k) => ile(k) === najmniej);
    const k = rzadkie[calkowita(r, 0, rzadkie.length - 1)];
    wybrane.push(k);
    uzyteTu.add(k.s.id);
    if (k.s.motyw) motywy.add(k.s.motyw);
    uzyte.set(k.s.id, najmniej + 1);
    return true;
  };

  // zdarzenia od najważniejszego; remis po losowym kluczu
  const fakty = faktyGospodarstwa(gosp, w)
    .map((f) => ({ f, los: calkowita(r, 0, 9999) }))
    .sort((a, b) => b.f.waga - a.f.waga || a.los - b.los)
    .map((x) => x.f);
  const typy = new Set<string>();
  let nastepny = 0;
  const zdarzenie = (): boolean => {
    for (; nastepny < fakty.length; nastepny++) {
      const f = fakty[nastepny];
      if (typy.has(f.typ)) continue;
      const p: Podstawa = {
        rodzaj: f.typ,
        rok: f.rok,
        wiek: f.rok - f.glowna.rocznik,
        klucz: f.rok,
        glowna: f.glowna,
        powiazana: f.powiazana,
        fakt: f,
      };
      if (bierz(szablonyRodzaju(f.typ).map((s) => ({ s, p })))) {
        typy.add(f.typ);
        nastepny++;
        return true;
      }
    }
    return false;
  };
  zdarzenie();
  zdarzenie();

  const bohater = wybrane[0]?.p.glowna ?? najstarszy(czlonkowie);
  const kolejnosc = (osoby: readonly Osoba[]): Osoba[] => [bohater, ...osoby.filter((o) => o.id !== bohater.id)];
  const nazwaneMiejsca = kronika.filter(nazwane);
  const miejsceDawne = nazwaneMiejsca.length ? nazwaneMiejsca[calkowita(r, 0, nazwaneMiejsca.length - 1)].miejsce : '';

  /** Zdanie wspólne (kronika, miejsce, dawne czasy) dla pierwszej z osób, która ma pasujący szablon. */
  const wspolne = (osoby: readonly Osoba[]): boolean => {
    for (const o of osoby) {
      const kandydaci: Kandydat[] = [];
      for (const e of kronika) {
        if (e.rok >= dom.rokStanu || !bylTu(o, e.rok, ind)) continue;
        const baza = { rok: e.rok, wiek: e.rok - o.rocznik, klucz: e.rok, glowna: o };
        const kategoria = kategoriaWpisu(e);
        if (kategoria) {
          const p: Podstawa = { ...baza, rodzaj: 'miejsce', miejsce: e.miejsce, kategoria };
          for (const s of PO_KATEGORII.get(kategoria) ?? []) kandydaci.push({ s, p });
        }
        const temat = tematWpisu(e);
        if (temat) {
          const p: Podstawa = { ...baza, rodzaj: 'kronika', temat };
          for (const s of PO_TEMACIE.get(temat) ?? []) kandydaci.push({ s, p });
        }
      }
      if (zDawnychCzasow(o, ind)) {
        const p: Podstawa = {
          rodzaj: 'dawne',
          rok: ROK_ZERO,
          wiek: ROK_ZERO - o.rocznik,
          klucz: KLUCZ_DAWNYCH,
          glowna: o,
          miejsce: miejsceDawne || undefined,
        };
        for (const s of szablonyRodzaju('dawne')) kandydaci.push({ s, p });
      }
      if (bierz(kandydaci)) return true;
    }
    return false;
  };

  const stan = (): boolean => {
    const najstarsza = najstarszy(czlonkowie);
    const [a, b] = czlonkowie;
    const partnerzy = czlonkowie.length === 2 && a.partner === b.id && b.partner === a.id;
    const pokolenia = czlonkowie.some(
      (m) =>
        rodzicOsoby(m, ind.wg).some((x) => dom.wDomu.has(x.id)) &&
        (ind.dzieci.get(m.id) ?? []).some((d) => dom.wDomu.has(d.id)),
    );
    // stan opowiada najpierw o dorosłych (bohater, gdy jest dorosły), potem o dzieciach, w kolejności gospodarstwa
    const dorosly = (o: Osoba): boolean => dom.rokStanu - o.rocznik >= DOROSLY;
    const kolejka = kolejnosc(czlonkowie).sort((x, y) => Number(dorosly(y)) - Number(dorosly(x)));
    for (const o of kolejka) {
      const dzieci = (ind.dzieci.get(o.id) ?? []).some(
        (d) => dom.wDomu.has(d.id) && dom.rokStanu - d.rocznik < DOROSLY,
      );
      const glownyDom = o.id === najstarsza.id;
      const p: Podstawa = {
        rodzaj: 'stan',
        rok: dom.rokStanu,
        wiek: dom.rokStanu - o.rocznik,
        klucz: KLUCZ_STANU,
        glowna: o,
        powiazana: partnerzy ? czlonkowie.find((x) => x.id !== o.id) : undefined,
        para: !!partnerzy,
        pokolenia: pokolenia && glownyDom,
        ciasno: czlonkowie.length >= 4 && glownyDom,
        dzieci,
      };
      if (bierz(szablonyRodzaju('stan').map((s) => ({ s, p })))) return true;
    }
    return false;
  };

  const pamietaDawne = czlonkowie.filter((o) => zDawnychCzasow(o, ind));
  let wspolnych = 0;
  if (pamietaDawne.length && wspolne(kolejnosc(pamietaDawne))) wspolnych++;
  const cel = wybrane.length >= 3 || szansa(r, SZANSA_TRZECIEGO) ? 3 : 2;
  const zrodla: (() => boolean)[] = [
    zdarzenie,
    () => wspolnych === 0 && wspolne(kolejnosc(czlonkowie)) && ++wspolnych > 0,
    stan,
    () => wspolnych < 2 && wspolne(kolejnosc(czlonkowie)) && ++wspolnych > 0,
    stan,
  ];
  for (const zrodlo of zrodla) {
    while (wybrane.length < cel && zrodlo()) {
      // kolejne zdarzenia, dopóki są; pozostałe źródła dają najwyżej jedno zdanie
      if (zrodlo !== zdarzenie) break;
    }
    if (wybrane.length >= cel) break;
  }

  // kolejność lat; imię odpada, gdy poprzednie zdanie zaczynało się od imienia tej samej osoby (nie dwa razy z rzędu)
  const kolejne = wybrane.map((k, i) => ({ k, i })).sort((a, b) => a.k.p.klucz - b.k.p.klucz || a.i - b.i);
  let poprzedni: string | undefined;
  return kolejne.map(({ k }) => {
    const podmiot = PODMIOT.test(k.s.tekst);
    const bezImienia = podmiot && poprzedni === k.p.glowna.id;
    const tekst = bezImienia ? k.s.tekst.slice('{o:mian} '.length) : k.s.tekst;
    poprzedni = podmiot && !bezImienia ? k.p.glowna.id : undefined;
    return { tekst: wielka(wypelnij(tekst, kontekst(k.p, odm))), szablon: k.s.id, rodzaj: k.s.rodzaj };
  });
}

/** Historia gospodarstwa: 2-3 zdania (`zdaniaGospodarstwa` bez szablonów). Ziarno `r` podaje wywołujący:
    `losDla('historie', klucz budynku, id gospodarstwa)`. */
export function historiaGospodarstwa(
  gosp: Gospodarstwo,
  w: WynikBudynku,
  kronika: readonly WpisKroniki[],
  odmiana: Odmiana,
  r: Rng,
  uzyte?: Map<string, number>,
): string[] {
  return zdaniaGospodarstwa(gosp, w, kronika, odmiana, r, uzyte).map((z) => z.tekst);
}

/** Dopisuje historię każdemu gospodarstwu budynku, w kolejności `w.gospodarstwa`, z ziarnem
    `losDla('historie', klucz budynku, id gospodarstwa)` i licznikiem szablonów wspólnym dla budynku. Zmienia tylko pole
    `historia` w gospodarstwach `w`: wolno ją wołać tylko na wyniku, który wywołujący sam stworzył (generuj.ts). */
export function historieBudynku(w: WynikBudynku, kronika: readonly WpisKroniki[], odmiana: Odmiana): void {
  const uzyte = new Map<string, number>();
  for (const h of w.gospodarstwa) {
    h.historia = historiaGospodarstwa(h, w, kronika, odmiana, losDla('historie', w.budynek.klucz, h.id), uzyte);
  }
}
