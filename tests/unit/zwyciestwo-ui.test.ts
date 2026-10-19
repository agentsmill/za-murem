/* Okna warunków zwycięstwa (src/ui/zwyciestwo.ts, docs/superpowers/specs/2026-10-19-warunki-zwyciestwa-design.md,
   „Stan, odczyt i okna”): ekran „Drogi do zwycięstwa” z Menu i epilog zwycięstwa. Czyste funkcje dają HTML w kształcie
   `Sheet`, więc testy idą w Node, bez DOM, na samym `body` i `foot`; wygląd ocenia się w prawdziwym Chromium na zrzutach.
   Dwa języki: po polsku teksty z tabeli planu etapu 1, po angielsku te same bez polskiej litery i polskiego słówka.
   Poprawki po recenzji końcowej: zdanie „co dalej” pod następnym kamieniem, drogi z „Wkrótce” bez następnego kamienia,
   ostatnie zdanie epilogu ludności z prawdziwymi liczbami (ludzie dziś, spis 2021, polska liczba mnoga).
   Droga technologii: wejście z atrapy nie ma odczytu badań, więc jej wiersz ma w większości testów dawne „Wkrótce” i sześć
   szarych kamieni; wiersz z odczytem (złoty pierwszy kamień ze zdaniem o pracowni, od drugiego kamienia „Wkrótce” o prądzie)
   ma własne scenariusze w „ekranie dróg”, a epilog fabryki w obu trybach i językach sprawdza zwyciestwo-technologia.test.ts.
   Na końcu przegląd źródeł: każda para `L('…', '…')` i `tx('…', '…')` w module, także z gałęzi, których żaden scenariusz
   nie dotyka. */

import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import type { LawPath } from '../../src/content/data.ts';
import { tx, ustawJezyk } from '../../src/core/jezyk.ts';
import type { GameMode, GovInput, GovState } from '../../src/gov/typy.ts';
import { emptyEffects } from '../../src/gov/wspolne.ts';
import { newGov } from '../../src/gov/zarzad.ts';
import { DROGI, type Droga, krokZwyciestwa, nazwaDrogi, ocenDrogi, wlaczZwyciestwo } from '../../src/gov/zwyciestwo.ts';
import { confirmSheet, menuSheet, type Sheet } from '../../src/ui/okna.ts';
import { drogiSheet, epilogSheet, type StatyEpilogu, statyEpilogu } from '../../src/ui/zwyciestwo.ts';
import { Atrapa } from './gov-atrapa.ts';
import { POLSKIE, polskieSlowa } from './po-angielsku.ts';

afterEach(() => ustawJezyk('pl'));

const KOLEJNOSC: Droga[] = ['technologia', 'teren', 'lek', 'ludnosc', 'cuda'];

/** wejście z atrapy (cztery osoby i czterech mieszkańców) z nadpisanymi polami */
const wej = (over: Partial<GovInput> = {}): GovInput => ({ ...new Atrapa(1).input(), ...over });

/** stan zarządu z włączonymi drogami i wpisanymi kamieniami (logikę kamieni sprawdza zwyciestwo.test.ts) */
function stan(kamienie: Partial<Record<Droga, number>> = {}, mode: GameMode = 'zwykly'): GovState {
  const st = newGov(1, mode);
  wlaczZwyciestwo(st);
  Object.assign(st.zwyciestwo!.kamienie, kamienie);
  return st;
}

const drogi = (st: GovState, i: GovInput): Sheet => drogiSheet(ocenDrogi(st, i));

/** cały tekst okna */
const wszystko = (s: Sheet) => `${s.kicker} ${s.title} ${s.body} ${s.foot}`;
/** wiersze dróg z ciała okna, każdy od `<li class="zw-droga` do początku następnego */
const wiersze = (s: Sheet): string[] => s.body.split('<li class="zw-droga').slice(1);
const wiersz = (s: Sheet, droga: Droga): string => wiersze(s).find((w) => w.includes(`data-droga="${droga}"`))!;
/** ile kamieni wiersza ma daną klasę (zaliczony, nastepny, dalszy) */
const ile = (w: string, klasa: string): number => (w.match(new RegExp(`class="zw-kamien ${klasa}"`, 'g')) ?? []).length;
/** klasy kamieni wiersza po kolei (zw-zaliczony, zw-nastepny, zw-dalszy) */
const klasyKamieni = (w: string): string[] => [...w.matchAll(/class="zw-kamien (zw-\w+)"/g)].map((m) => m[1]);
/** kamienie wiersza jako kawałki HTML, każdy od klasy kamienia do końca jego <li> */
const kamienie = (w: string): string[] => w.split('<li class="zw-kamien ').slice(1);

const STATY: StatyEpilogu = { dzien: 12, ludzi: 130, zmarli: 3, uchwaly: 2 };

/** zdania ścieżek uchwał po polsku i po angielsku, dosłownie z planu */
const SCIEZKI: Record<string, { pl: string; en: string }> = {
  porzadek: {
    pl: 'Brama zamyka się o dwudziestej, a straż zna każdego nowego z imienia.',
    en: 'The gate shuts at eight and the watch knows every newcomer by name.',
  },
  wspolnota: {
    pl: 'Każda klatka ma swoje zebranie i swoją kłótnię o grafik, ale nikt nie chce się wyprowadzać.',
    en: 'Every stairwell has its own meeting and its own row over the rota, but nobody wants to move out.',
  },
  tech: {
    pl: 'Model z dysków banku układa grafiki co do minuty. Nikt nie pyta, kto go kontroluje.',
    en: 'The model from the bank’s disks plans the rotas to the minute. Nobody asks who controls it.',
  },
  brak: {
    pl: 'Zarząd dalej się spiera, czy to już osada, czy jeszcze spółdzielnia.',
    en: 'The board is still arguing whether this is a settlement now or still a housing co-op.',
  },
};

/** dwa pierwsze zdania epilogu ludności (bez zmian); trzecie ma prawdziwe liczby (`ZDANIE_LUDZI`) */
const PODWORKO = {
  pl: 'Na podwórku znowu jest gwarno. Na klatkach wiszą grafiki dyżurów, dzieci mają swoją bandę, a ktoś już pisze regulamin trzepaka.',
  en: 'The yard is noisy again. Rotas hang in the stairwells, the kids have their own gang, and someone is already drafting rules for the carpet rack.',
};

/** ostatnie zdanie epilogu ludności ze spisem 2021 i bez niego, dosłownie z poprawek po recenzji końcowej */
const ZDANIE_LUDZI = {
  zeSpisem: (ludzi: string, spis: string) => ({
    pl: `Mieszka tu ${ludzi}, a w 2021 roku, kiedy wszyscy zamawiali jedzenie przez aplikację, mieszkało ${spis}.`,
    en: `${ludzi} live here now; in 2021, back when everyone ordered food through an app, there were ${spis}.`,
  }),
  bezSpisu: (ludzi: string) => ({
    pl: `Mieszka tu ${ludzi} i nikt już nie zamawia jedzenia przez aplikację.`,
    en: `${ludzi} live here now, and nobody orders food through an app any more.`,
  }),
};

describe('ekran dróg (drogiSheet)', () => {
  it('okno z tytułem „Drogi do zwycięstwa”, przyciskiem powrotu i zamykane bez decyzji', () => {
    const s = drogi(stan(), wej());
    expect(s.title).toBe('Drogi do zwycięstwa');
    expect(s.kicker).toBe('Za Murem 0.4');
    expect(s.tone).toBe('drogi');
    expect(s.closable).toBe(true);
    expect(s.foot).toContain('data-act="zw-wroc"');
    expect(s.foot).toContain('>Wróć<');
  });

  it('pięć wierszy dokładnie w kolejności z logiki: technologia, teren, lek, ludność, cuda', () => {
    const s = drogi(stan(), wej());
    expect(wiersze(s)).toHaveLength(5);
    expect([...s.body.matchAll(/data-droga="(\w+)"/g)].map((m) => m[1])).toEqual(KOLEJNOSC);
    // nazwy dróg stoją w tej samej kolejności
    const nazwy = ['Prąd bez miedzi', 'Za Murem', 'Wyłącznik z pakietu premium', 'Nowe osiedle', 'Cuda'];
    const miejsca = nazwy.map((n) => s.body.indexOf(`>${n}<`));
    expect(miejsca.every((m) => m > 0)).toBe(true);
    expect(miejsca).toEqual([...miejsca].sort((a, b) => a - b));
  });

  it('każdy wiersz ma wszystkie kamienie swojej drogi, po polsku, w kolejności', () => {
    const s = drogi(stan(), wej());
    for (const droga of KOLEJNOSC) {
      const w = wiersz(s, droga);
      const w0 = DROGI[droga].kamienie.map((k) => k.pl);
      expect(ile(w, 'zw-(?:zaliczony|nastepny|dalszy)'), droga).toBe(w0.length);
      const miejsca = w0.map((k) => w.indexOf(k));
      expect(
        miejsca.every((m) => m > 0),
        droga,
      ).toBe(true);
      expect(miejsca, droga).toEqual([...miejsca].sort((a, b) => a - b));
    }
  });

  it('„Wkrótce: …” przy technologii (bez odczytu badań), leku i cudach; teren dopiero po pierwszym kamieniu; ludność go nie ma', () => {
    const s = drogi(stan(), wej());
    expect(wiersz(s, 'technologia')).toContain('Wkrótce: badania w pracowni i sieć bez miedzi.');
    expect(wiersz(s, 'lek')).toContain('Wkrótce: dalekie wyprawy po lek.');
    expect(wiersz(s, 'cuda')).toContain('Wkrótce: cuda z późnych badań.');
    expect(wiersz(s, 'teren')).not.toContain('Wkrótce');
    expect(wiersz(s, 'ludnosc')).not.toContain('Wkrótce');
    const po = drogi(stan({ teren: 1 }), wej());
    expect(wiersz(po, 'teren')).toContain('Wkrótce: sąsiednie kwadraty i mur.');
  });

  it('przy ludności „{ile} z {cel}” i pasek postępu z tymi samymi liczbami', () => {
    const s = drogi(stan(), wej({ ludnosc: 12 }));
    const w = wiersz(s, 'ludnosc');
    expect(w).toContain('12 z 250');
    expect(w).toMatch(/<progress class="zw-pasek" max="250" value="12"/);
    // inne drogi nie mają paska ani liczb
    for (const droga of KOLEJNOSC.filter((d) => d !== 'ludnosc')) {
      expect(wiersz(s, droga), droga).not.toContain('<progress');
      expect(wiersz(s, droga), droga).not.toMatch(/\d+ z \d+/);
    }
    // cel z danych 2021 i z trybu gry
    expect(wiersz(drogi(stan(), wej({ ludnosc: 40, ludnosc2021: 1000 })), 'ludnosc')).toContain('40 z 500');
    expect(wiersz(drogi(stan({}, 'zombie'), wej({ ludnosc: 40 })), 'ludnosc')).toContain('40 z 125');
  });

  it('ludność ponad celem: liczby prawdziwe, a pasek pełny', () => {
    const w = wiersz(drogi(stan(), wej({ ludnosc: 300 })), 'ludnosc');
    expect(w).toContain('300 z 250');
    expect(w).toMatch(/max="250" value="250"/);
  });

  it('zaliczone kamienie mają klasę zaliczonego, następny wyróżnienie, reszta jest dalsza', () => {
    const s = drogi(stan({ ludnosc: 3 }), wej({ ludnosc: 60 }));
    const w = wiersz(s, 'ludnosc');
    expect(ile(w, 'zw-zaliczony')).toBe(3);
    expect(ile(w, 'zw-nastepny')).toBe(1);
    expect(ile(w, 'zw-dalszy')).toBe(1);
    // klasy idą po kolei: trzy zaliczone, potem następny, potem dalszy
    const klasy = [...w.matchAll(/class="zw-kamien (zw-\w+)"/g)].map((m) => m[1]);
    expect(klasy).toEqual(['zw-zaliczony', 'zw-zaliczony', 'zw-zaliczony', 'zw-nastepny', 'zw-dalszy']);
    // droga grywalna bez kamieni (teren przed pierwszym): pierwszy jest następny, żaden nie jest zaliczony
    const pusta = wiersz(s, 'teren');
    expect(ile(pusta, 'zw-zaliczony')).toBe(0);
    expect(ile(pusta, 'zw-nastepny')).toBe(1);
    expect(ile(pusta, 'zw-dalszy')).toBe(4);
    expect(klasyKamieni(pusta)[0]).toBe('zw-nastepny');
  });

  it('droga z „Wkrótce” rysuje otwarte kamienie jako dalsze: bez złotego następnego i bez „Następny:”', () => {
    const s = drogi(stan({ technologia: 0, teren: 1, lek: 0, cuda: 1 }), wej());
    for (const droga of ['technologia', 'teren', 'lek', 'cuda'] as const) {
      const w = wiersz(s, droga);
      expect(w, droga).toContain('class="zw-wkrotce"');
      expect(ile(w, 'zw-nastepny'), droga).toBe(0);
      expect(w, droga).not.toContain('Następny');
      expect(w, droga).not.toContain('zw-dalej');
    }
    // zaliczone zostają zaliczone, reszta jest dalsza
    expect(klasyKamieni(wiersz(s, 'technologia'))).toEqual(Array(6).fill('zw-dalszy'));
    expect(klasyKamieni(wiersz(s, 'teren'))).toEqual(['zw-zaliczony', ...Array(4).fill('zw-dalszy')]);
    expect(klasyKamieni(wiersz(s, 'cuda'))).toEqual(['zw-zaliczony', 'zw-dalszy', 'zw-dalszy']);
    // dopisek dla czytnika ekranu mają tylko zaliczone
    expect(wiersz(s, 'teren').match(/class="sr">Zaliczone: </g)).toHaveLength(1);
    // droga bez „Wkrótce” (teren przed pierwszym kamieniem, ludność) dalej ma złoty następny
    const grywalne = drogi(stan(), wej());
    expect(klasyKamieni(wiersz(grywalne, 'teren'))[0]).toBe('zw-nastepny');
    expect(klasyKamieni(wiersz(grywalne, 'ludnosc'))[0]).toBe('zw-nastepny');
    expect(wiersz(grywalne, 'teren')).toContain('Następny: ');
  });

  it('technologia z odczytem badań: złoty następny kamień ze zdaniem „co dalej” przy zerze i jednym kamieniu, potem „Wkrótce” o prądzie', () => {
    const odczyt = wej({ badania: { pracownia: false, zbadane: 0, era: 0, koncowa: false, siecWlaczona: false } });
    // zero kamieni: pierwszy kamień jest następny i ma zdanie o pracowni, bez „Wkrótce”
    const start = wiersz(drogi(stan(), odczyt), 'technologia');
    expect(klasyKamieni(start)).toEqual(['zw-nastepny', ...Array(5).fill('zw-dalszy')]);
    expect(start).toContain(
      'Pracownia postawiona</span><span class="zw-dalej">Postawcie pracownię w pokoju waszego mieszkania (Budowa, zakładka Dom).</span>',
    );
    expect(start).toContain('Następny: ');
    expect(start).not.toContain('Wkrótce');
    // jeden kamień: następny jest „Pierwsze badanie” ze zdaniem o stole pracowni
    const jeden = wiersz(drogi(stan({ technologia: 1 }), odczyt), 'technologia');
    expect(klasyKamieni(jeden)).toEqual(['zw-zaliczony', 'zw-nastepny', ...Array(4).fill('zw-dalszy')]);
    expect(jeden).toContain(
      'Pierwsze badanie</span><span class="zw-dalej">Posadźcie kogoś przy stole pracowni i wybierzcie kartkę na tablicy badań.</span>',
    );
    expect(jeden).not.toContain('Wkrótce');
    // od dwóch kamieni: „Wkrótce” o prądzie, otwarte kamienie szare, bez „Następny:” i bez zdania „co dalej”
    for (const n of [2, 3, 4, 5]) {
      const w = wiersz(drogi(stan({ technologia: n }), odczyt), 'technologia');
      expect(w, `${n}`).toContain('<p class="zw-wkrotce">Wkrótce: ery 3–6 czekają na prąd z projektu gospodarki.</p>');
      expect(klasyKamieni(w), `${n}`).toEqual([...Array(n).fill('zw-zaliczony'), ...Array(6 - n).fill('zw-dalszy')]);
      expect(w, `${n}`).not.toContain('Następny');
      expect(w, `${n}`).not.toContain('zw-dalej');
      expect(w, `${n}`).not.toContain('zw-wygrana');
    }
    // przebyta do końca: odznaka, wszystkie kamienie zaliczone, ani „Wkrótce”, ani „co dalej”
    const koniec = wiersz(drogi(stan({ technologia: 6 }), odczyt), 'technologia');
    expect(koniec).toContain('zw-wygrana');
    expect(koniec).toContain('>Zwycięstwo<');
    expect(klasyKamieni(koniec)).toEqual(Array(6).fill('zw-zaliczony'));
    expect(koniec).not.toContain('Wkrótce');
    expect(koniec).not.toContain('zw-dalej');
    // reszta ekranu bez zmian: lek i cuda dalej z „Wkrótce”, pasek tylko przy ludności
    const ekran = drogi(stan(), odczyt);
    expect(wiersz(ekran, 'lek')).toContain('Wkrótce: dalekie wyprawy po lek.');
    expect(wiersz(ekran, 'technologia')).not.toContain('<progress');
  });

  it('technologia z odczytem badań po angielsku: „co dalej” i „Coming soon” o prądzie, bez polskich słów', () => {
    ustawJezyk('en');
    const odczyt = wej({ badania: { pracownia: false, zbadane: 0, era: 0, koncowa: false, siecWlaczona: false } });
    const start = drogi(stan(), odczyt);
    expect(wiersz(start, 'technologia')).toContain(
      'Research room built</span><span class="zw-dalej">Build a research room in a room of your flat (Build, Home tab).</span>',
    );
    const jeden = drogi(stan({ technologia: 1 }), odczyt);
    expect(wiersz(jeden, 'technologia')).toContain(
      'class="zw-dalej">Sit someone at the research table and pick a card on the research board.<',
    );
    const dalej = drogi(stan({ technologia: 3 }), odczyt);
    expect(wiersz(dalej, 'technologia')).toContain(
      '<p class="zw-wkrotce">Coming soon: eras 3–6 are waiting for power from the economy project.</p>',
    );
    expect(wiersz(dalej, 'technologia')).toContain('Copper-free grid');
    expect(wiersz(dalej, 'technologia')).toContain('class="sr">Done: <');
    for (const ekran of [start, jeden, dalej]) {
      expect(wszystko(ekran)).not.toMatch(POLSKIE);
      expect(polskieSlowa(wszystko(ekran))).toEqual([]);
    }
  });

  it('pod następnym kamieniem stoi zdanie „co dalej”: próg ludności, siedem poranków z licznikiem, płot dla terenu', () => {
    const zdanie = (w: string) => kamienie(w).filter((k) => k.includes('class="zw-dalej"'));
    // kamień „25 osób” jest następny i tylko on ma zdanie
    const przed = wiersz(drogi(stan({ ludnosc: 1 }), wej({ ludnosc: 12 })), 'ludnosc');
    expect(zdanie(przed)).toHaveLength(1);
    expect(zdanie(przed)[0].startsWith('zw-nastepny"')).toBe(true);
    expect(zdanie(przed)[0]).toContain('25 osób</span><span class="zw-dalej">Zbierzcie 25 osób pod zarządem.</span>');
    // ostatni kamień: licznik poranków dosłownie ze stanu
    const st = stan({ ludnosc: 4 });
    st.zwyciestwo!.dniCelu = 3;
    const ostatni = wiersz(drogi(st, wej({ ludnosc: 260 })), 'ludnosc');
    expect(zdanie(ostatni)).toHaveLength(1);
    expect(zdanie(ostatni)[0]).toContain(
      'Cel przez 7 dni</span><span class="zw-dalej">Utrzymajcie cel 7 poranków z rzędu',
    );
    expect(zdanie(ostatni)[0]).toContain(
      'o 6:00 nikt z zarządu nie jest głodny, a zaufanie wynosi co najmniej 50 (3 z 7).',
    );
    // teren przed pierwszym kamieniem: płot
    const teren = wiersz(drogi(stan(), wej()), 'teren');
    expect(zdanie(teren)).toHaveLength(1);
    expect(zdanie(teren)[0]).toContain('Otoczcie wspólnym płotem pierwszy sąsiedni budynek.');
    // po pierwszym kamieniu terenu zdanie znika (jest „Wkrótce”), a droga przebyta do końca nie ma go wcale
    expect(drogi(stan({ teren: 1 }), wej()).body).not.toContain('Otoczcie');
    expect(zdanie(wiersz(drogi(stan({ ludnosc: 5 }), wej({ ludnosc: 260 })), 'ludnosc'))).toEqual([]);
    // technologia, lek i cuda nie mają zdania w ogóle
    const wkrotce = drogi(stan(), wej());
    for (const droga of ['technologia', 'lek', 'cuda'] as const)
      expect(wiersz(wkrotce, droga)).not.toContain('zw-dalej');
  });

  it('zdanie „co dalej” zmienia się z licznikiem i z kamieniem, a nie stoi na jednym tekście', () => {
    const zdaniaLudnosci = (st: GovState) => {
      const w = wiersz(drogi(st, wej({ ludnosc: 60 })), 'ludnosc');
      return w.match(/class="zw-dalej">([^<]*)</)?.[1];
    };
    expect(zdaniaLudnosci(stan({ ludnosc: 0 }))).toBe('Zbierzcie 10 osób pod zarządem.');
    expect(zdaniaLudnosci(stan({ ludnosc: 2 }))).toBe('Zbierzcie 50 osób pod zarządem.');
    expect(zdaniaLudnosci(stan({ ludnosc: 3 }))).toBe('Zbierzcie 125 osób pod zarządem.');
    const st = stan({ ludnosc: 4 });
    expect(zdaniaLudnosci(st)).toContain('(0 z 7).');
    st.zwyciestwo!.dniCelu = 6;
    expect(zdaniaLudnosci(st)).toContain('(6 z 7).');
  });

  it('zdanie „co dalej” idzie przez ucieczkę HTML', () => {
    const p = ocenDrogi(stan(), wej());
    const zly = { ...p[3], zaliczone: 1, dalej: tx('<b>a</b> & "b"', '<b>a</b>') };
    const s = drogiSheet([zly]);
    expect(s.body).not.toContain('<b>a');
    expect(s.body).toContain('&lt;b&gt;a&lt;/b&gt; &amp; &quot;b&quot;');
  });

  it('czytelnikowi ekranu mówią zaliczone i następny; wyróżnienie nie jest tylko kolorem', () => {
    const w = wiersz(drogi(stan({ ludnosc: 2 }), wej({ ludnosc: 30 })), 'ludnosc');
    expect(w.match(/class="sr">Zaliczone: </g)).toHaveLength(2);
    expect(w.match(/class="sr">Następny: </g)).toHaveLength(1);
    expect(w).toContain('aria-hidden="true"');
  });

  it('całkiem przebyta droga ma klasę wygranej i odznakę „Zwycięstwo”, a żaden kamień nie jest następny', () => {
    const s = drogi(stan({ ludnosc: 5, cuda: 1 }), wej({ ludnosc: 260 }));
    const w = wiersz(s, 'ludnosc');
    expect(w.startsWith('zw-wygrana"') || w.startsWith(' zw-wygrana"')).toBe(true);
    expect(w).toContain('>Zwycięstwo<');
    expect(ile(w, 'zw-zaliczony')).toBe(5);
    expect(ile(w, 'zw-nastepny')).toBe(0);
    // inne wiersze bez odznaki i bez klasy
    expect(wiersz(s, 'cuda')).not.toContain('zw-wygrana');
    expect(wiersz(s, 'cuda')).not.toContain('>Zwycięstwo<');
    expect(s.body.match(/zw-wygrana/g)).toHaveLength(1);
  });

  it('droga przebyta do końca nie ma już zdania „Wkrótce” (teren po pięciu kamieniach, lek i cuda)', () => {
    const s = drogi(stan({ teren: 5, lek: 5, cuda: 3 }), wej());
    for (const droga of ['teren', 'lek', 'cuda'] as const) {
      expect(wiersz(s, droga), droga).toContain('zw-wygrana');
      expect(wiersz(s, droga), droga).not.toContain('Wkrótce');
    }
    // niedokończona nadal je ma
    expect(wiersz(drogi(stan({ cuda: 2 }), wej()), 'cuda')).toContain('Wkrótce: cuda z późnych badań.');
  });

  it('kamień raz zaliczony zostaje na ekranie, gdy ludność spadnie (stan trzyma kamienie, nie odczyt)', () => {
    const st = stan();
    const fx = emptyEffects();
    krokZwyciestwa(st, wej({ ludnosc: 60 }), fx);
    expect(ile(wiersz(drogi(st, wej({ ludnosc: 60 })), 'ludnosc'), 'zw-zaliczony')).toBe(3);
    const spadek = drogi(st, wej({ ludnosc: 5 }));
    expect(ile(wiersz(spadek, 'ludnosc'), 'zw-zaliczony')).toBe(3);
    expect(wiersz(spadek, 'ludnosc')).toContain('5 z 250');
  });

  it('bez włączonych dróg (stary stan) ekran też się rysuje: nic zaliczonego, ludność z liczbami', () => {
    const s = drogi(newGov(1), wej({ ludnosc: 8 }));
    expect(wiersze(s)).toHaveLength(5);
    expect(s.body).not.toContain('zw-zaliczony');
    expect(wiersz(s, 'ludnosc')).toContain('8 z 250');
  });

  it('w trybie zombie droga leku nazywa się „Lek”', () => {
    const s = drogi(stan({}, 'zombie'), wej());
    expect(wiersz(s, 'lek')).toContain('>Lek<');
    expect(s.body).not.toContain('Wyłącznik z pakietu premium');
    expect(drogi(stan(), wej()).body).toContain('>Wyłącznik z pakietu premium<');
  });

  it('nazwy dróg i kamienie idą przez ucieczkę HTML', () => {
    const p = ocenDrogi(stan(), wej());
    const zly = { ...p[0], nazwa: tx('<i>A</i> & "B"', '<i>A</i>'), kamienie: [tx('<b>k</b>', '<b>k</b>')] };
    const s = drogiSheet([zly]);
    expect(s.body).not.toContain('<i>A');
    expect(s.body).not.toContain('<b>k');
    expect(s.body).toContain('&lt;i&gt;A&lt;/i&gt; &amp; &quot;B&quot;');
  });

  it('pusta lista dróg nie wywraca okna', () => {
    const s = drogiSheet([]);
    expect(wiersze(s)).toHaveLength(0);
    expect(s.title).toBe('Drogi do zwycięstwa');
  });

  it('po angielsku: tytuł, nazwy, kamienie, „Coming soon” i liczby, bez polskiej litery ani słówka', () => {
    ustawJezyk('en');
    const s = drogi(stan({ ludnosc: 3 }), wej({ ludnosc: 60 }));
    expect(s.title).toBe('Roads to victory');
    expect(s.foot).toContain('>Back<');
    const nazwy = ['Power without copper', 'Za Murem', 'The premium-tier kill switch', 'A new estate', 'Wonders'];
    for (const n of nazwy) expect(s.body, n).toContain(`>${n}<`);
    expect(wiersz(s, 'technologia')).toContain('Coming soon: research and a copper-free grid.');
    expect(wiersz(s, 'lek')).toContain('Coming soon: long runs for the cure.');
    expect(wiersz(s, 'cuda')).toContain('Coming soon: wonders from late research.');
    expect(wiersz(s, 'ludnosc')).toContain('60 of 250');
    expect(wiersz(s, 'ludnosc')).toContain('Halfway there');
    expect(wiersz(s, 'ludnosc')).toContain('class="sr">Done: <');
    expect(wiersz(s, 'ludnosc')).toContain('class="sr">Next: <');
    expect(wszystko(s)).not.toMatch(POLSKIE);
    expect(polskieSlowa(wszystko(s))).toEqual([]);
    expect(wszystko(s)).not.toContain('Wkrótce');
    // teren po pierwszym kamieniu i droga wygrana też po angielsku
    const po = drogi(stan({ teren: 1, ludnosc: 5 }), wej({ ludnosc: 260 }));
    expect(wiersz(po, 'teren')).toContain('Coming soon: neighbouring squares and the wall.');
    expect(po.body).toContain('>Victory<');
    expect(wszystko(po)).not.toMatch(POLSKIE);
    expect(polskieSlowa(wszystko(po))).toEqual([]);
  });

  it('po angielsku „co dalej” pod następnym kamieniem, a drogi z „Coming soon” bez „Next:”', () => {
    ustawJezyk('en');
    const st = stan({ ludnosc: 1 });
    const s = drogi(st, wej({ ludnosc: 30 }));
    expect(wiersz(s, 'ludnosc')).toContain('class="zw-dalej">Get 25 people under the board.<');
    expect(wiersz(s, 'teren')).toContain('class="zw-dalej">Put a shared fence round the first building next door.<');
    st.zwyciestwo!.kamienie.ludnosc = 4;
    st.zwyciestwo!.dniCelu = 2;
    const ostatni = drogi(st, wej({ ludnosc: 260 }));
    expect(wiersz(ostatni, 'ludnosc')).toContain(
      'class="zw-dalej">Hold the target for 7 mornings in a row: at 6:00 nobody on the board is hungry and trust is at least 50 (2 of 7).<',
    );
    for (const droga of ['technologia', 'lek', 'cuda'] as const) {
      expect(wiersz(s, droga), droga).not.toContain('Next: ');
      expect(ile(wiersz(s, droga), 'zw-nastepny'), droga).toBe(0);
    }
    expect(wiersz(s, 'ludnosc')).toContain('class="sr">Next: <');
    for (const ekran of [s, ostatni]) {
      expect(wszystko(ekran)).not.toMatch(POLSKIE);
      expect(polskieSlowa(wszystko(ekran))).toEqual([]);
    }
  });

  it('po angielsku zombie: droga leku to „The cure”', () => {
    ustawJezyk('en');
    const s = drogi(stan({}, 'zombie'), wej());
    expect(wiersz(s, 'lek')).toContain('>The cure<');
    expect(s.body).not.toContain('premium-tier');
  });
});

describe('epilog zwycięstwa (epilogSheet)', () => {
  it('kicker „Zwycięstwo”, tytuł to nazwa drogi, tekst drogi ludnościowej dosłownie', () => {
    const s = epilogSheet('ludnosc', null, 'zwykly', STATY);
    expect(s.kicker).toBe('Zwycięstwo');
    expect(s.title).toBe('Nowe osiedle');
    expect(s.tone).toBe('zwyciestwo');
    // dwa pierwsze zdania bez zmian, trzecie z liczbą ludzi (STATY nie ma spisu 2021)
    expect(s.body).toContain(`${PODWORKO.pl} ${ZDANIE_LUDZI.bezSpisu('130 osób').pl}`);
  });

  it('ostatnie zdanie ma prawdziwe liczby: ze spisem 2021 ludzie dziś i spis, bez niego tylko ludzie', () => {
    const ze = epilogSheet('ludnosc', null, 'zwykly', { ...STATY, spis: 2623 }).body;
    expect(ze).toContain(`${PODWORKO.pl} ${ZDANIE_LUDZI.zeSpisem('130 osób', '2623').pl}`);
    const bez = epilogSheet('ludnosc', null, 'zwykly', STATY).body;
    expect(bez).toContain(`${PODWORKO.pl} ${ZDANIE_LUDZI.bezSpisu('130 osób').pl}`);
    expect(bez).not.toContain('w 2021 roku');
    // żaden nie twierdzi, że ludzi jest „połowa” z 2021 roku (przy przycięciu celu do 120–500 to nieprawda)
    for (const body of [ze, bez]) {
      expect(body).not.toContain('połowa tylu');
      expect(body).not.toContain('Half as many');
    }
  });

  it('liczba mnoga przy ludziach: 1 osoba, 62 osoby, 125 osób, także 112 osób', () => {
    const body = (ludzi: number) => epilogSheet('ludnosc', null, 'zwykly', { ...STATY, ludzi }).body;
    expect(body(0)).toContain('Mieszka tu 0 osób i nikt');
    expect(body(1)).toContain('Mieszka tu 1 osoba i nikt');
    for (const n of [2, 4, 22, 62, 63, 104]) expect(body(n), `${n}`).toContain(`Mieszka tu ${n} osoby i nikt`);
    for (const n of [5, 12, 14, 21, 112, 125, 500]) expect(body(n), `${n}`).toContain(`Mieszka tu ${n} osób i nikt`);
    // to samo ze spisem: liczba mnoga dotyczy tylko ludzi dziś, spis to goła liczba
    const ze = epilogSheet('ludnosc', null, 'zwykly', { ...STATY, ludzi: 63, spis: 2622 }).body;
    expect(ze).toContain(
      'Mieszka tu 63 osoby, a w 2021 roku, kiedy wszyscy zamawiali jedzenie przez aplikację, mieszkało 2622.',
    );
  });

  it('spis do niczego (0, ujemny, NaN, nieskończony) to epilog bez spisu', () => {
    for (const spis of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const body = epilogSheet('ludnosc', null, 'zwykly', { ...STATY, spis }).body;
      expect(body, `${spis}`).toContain(ZDANIE_LUDZI.bezSpisu('130 osób').pl);
      expect(body, `${spis}`).not.toContain('w 2021 roku');
    }
  });

  it('liczby ostatniego zdania idą przez num: całkowite, bez ułamków', () => {
    const body = epilogSheet('ludnosc', null, 'zwykly', { ...STATY, ludzi: 130.6, spis: 2623.4 }).body;
    expect(body).toContain('Mieszka tu 131 osób, a w 2021 roku');
    expect(body).toContain('mieszkało 2623.');
  });

  it('zdanie ścieżki uchwał dla każdej z czterech wartości, zawsze tylko jedno', () => {
    const wartosci: [LawPath | null, keyof typeof SCIEZKI][] = [
      ['porzadek', 'porzadek'],
      ['wspolnota', 'wspolnota'],
      ['tech', 'tech'],
      [null, 'brak'],
    ];
    for (const [path, klucz] of wartosci) {
      const body = epilogSheet('ludnosc', path, 'zwykly', STATY).body;
      expect(body, String(path)).toContain(SCIEZKI[klucz].pl);
      for (const inne of Object.keys(SCIEZKI).filter((k) => k !== klucz))
        expect(body, `${path} bez zdania ${inne}`).not.toContain(SCIEZKI[inne].pl);
    }
  });

  it('droga „Przetrwanie” (base) nie jest ścieżką: zdanie neutralne', () => {
    expect(epilogSheet('ludnosc', 'base', 'zwykly', STATY).body).toContain(SCIEZKI.brak.pl);
  });

  it('zdanie ścieżki stoi po tekście drogi', () => {
    const body = epilogSheet('ludnosc', 'wspolnota', 'zwykly', STATY).body;
    expect(body.indexOf(SCIEZKI.wspolnota.pl)).toBeGreaterThan(body.indexOf(PODWORKO.pl));
    expect(body.indexOf(SCIEZKI.wspolnota.pl)).toBeGreaterThan(body.indexOf('Mieszka tu 130 osób'));
  });

  it('statystyki: dzień, ludzie, zmarli i uchwały', () => {
    const body = epilogSheet('ludnosc', null, 'zwykly', STATY).body;
    expect(body).toContain('Dzień 12');
    expect(body).toContain('Ludzi: 130');
    expect(body).toContain('Zmarli: 3');
    expect(body).toContain('Uchwały: 2');
    expect(body.match(/class="zw-stat"/g)).toHaveLength(4);
    // zero też jest liczbą
    const zera = epilogSheet('ludnosc', null, 'zwykly', { dzien: 1, ludzi: 0, zmarli: 0, uchwaly: 0 }).body;
    expect(zera).toContain('Zmarli: 0');
    expect(zera).toContain('Uchwały: 0');
  });

  it('dwa przyciski: „Graj dalej” (główny) i „Nowa gra”', () => {
    const s = epilogSheet('ludnosc', null, 'zwykly', STATY);
    expect(s.foot.match(/<button /g)).toHaveLength(2);
    expect(s.foot).toMatch(/<button type="button" class="btn go" data-act="zw-dalej">Graj dalej<\/button>/);
    expect(s.foot).toMatch(/<button type="button" class="btn ghost" data-act="zw-nowa">Nowa gra<\/button>/);
    // „Graj dalej” jest ostatni (po prawej), „Nowa gra” przed nim
    expect(s.foot.indexOf('zw-nowa')).toBeLessThan(s.foot.indexOf('zw-dalej'));
  });

  it('okno nie zamyka się samo: odpowiedzi wymaga (jak raport i uchwała)', () => {
    expect(epilogSheet('ludnosc', null, 'zwykly', STATY).closable).toBeFalsy();
  });

  it('tytuł zależy od trybu: droga leku w zombie to „Lek”, w zwykłym „Wyłącznik z pakietu premium”', () => {
    expect(epilogSheet('lek', null, 'zombie', STATY).title).toBe('Lek');
    expect(epilogSheet('lek', null, 'zwykly', STATY).title).toBe('Wyłącznik z pakietu premium');
    expect(epilogSheet('lek', null, 'zombie', STATY).title).toBe(nazwaDrogi('lek', 'zombie').pl);
  });

  it('droga bez własnego tekstu dostaje tekst zastępczy z nazwą drogi, a ścieżka i statystyki zostają', () => {
    // własny tekst mają ludność i technologia (fabryka, w obu trybach inna)
    for (const droga of KOLEJNOSC.filter((d) => d !== 'ludnosc' && d !== 'technologia')) {
      const s = epilogSheet(droga, 'porzadek', 'zwykly', STATY);
      expect(s.title, droga).toBe(nazwaDrogi(droga, 'zwykly').pl);
      expect(s.body, droga).toContain(`Droga „${nazwaDrogi(droga, 'zwykly').pl}” przebyta do końca.`);
      expect(s.body, droga).not.toContain(PODWORKO.pl);
      expect(s.body, droga).not.toContain('Mieszka tu');
      expect(s.body, droga).toContain(SCIEZKI.porzadek.pl);
      expect(s.body, droga).toContain('Ludzi: 130');
    }
  });

  it('liczby w statystykach idą przez num: całkowite, bez ułamków', () => {
    const body = epilogSheet('ludnosc', null, 'zwykly', { dzien: 12.4, ludzi: 130.6, zmarli: 3, uchwaly: 2 }).body;
    expect(body).toContain('Dzień 12');
    expect(body).toContain('Ludzi: 131');
  });

  it('po angielsku: teksty, ścieżki, statystyki i przyciski, bez polskiej litery ani słówka', () => {
    ustawJezyk('en');
    const s = epilogSheet('ludnosc', 'wspolnota', 'zwykly', STATY);
    expect(s.kicker).toBe('Victory');
    expect(s.title).toBe('A new estate');
    expect(s.body).toContain(`${PODWORKO.en} ${ZDANIE_LUDZI.bezSpisu('130 people').en}`);
    expect(s.body).toContain(SCIEZKI.wspolnota.en);
    expect(s.body).toContain('Day 12');
    expect(s.body).toContain('People: 130');
    expect(s.body).toContain('Deaths: 3');
    expect(s.body).toContain('Resolutions: 2');
    expect(s.foot).toContain('>Keep playing<');
    expect(s.foot).toContain('>New game<');
    for (const [path, klucz] of [
      ['porzadek', 'porzadek'],
      ['tech', 'tech'],
      [null, 'brak'],
    ] as const) {
      const e = epilogSheet('ludnosc', path, 'zwykly', STATY);
      expect(e.body, String(path)).toContain(SCIEZKI[klucz].en);
      expect(wszystko(e), String(path)).not.toMatch(POLSKIE);
      expect(polskieSlowa(wszystko(e)), String(path)).toEqual([]);
    }
    expect(wszystko(s)).not.toMatch(POLSKIE);
    expect(polskieSlowa(wszystko(s))).toEqual([]);
  });

  it('po angielsku ostatnie zdanie: ze spisem i bez, liczba pojedyncza i mnoga, bez polskich słów', () => {
    ustawJezyk('en');
    const ze = epilogSheet('ludnosc', null, 'zwykly', { ...STATY, spis: 2623 });
    expect(ze.body).toContain(`${PODWORKO.en} ${ZDANIE_LUDZI.zeSpisem('130 people', '2623').en}`);
    expect(wszystko(ze)).not.toMatch(POLSKIE);
    expect(polskieSlowa(wszystko(ze))).toEqual([]);
    const body = (ludzi: number) => epilogSheet('ludnosc', null, 'zwykly', { ...STATY, ludzi }).body;
    expect(body(1)).toContain('1 person lives here now, and nobody orders food through an app any more.');
    expect(body(2)).toContain('2 people live here now, and nobody orders food');
    expect(body(0)).toContain('0 people live here now, and nobody orders food');
    expect(body(130)).not.toContain('Half as many');
  });

  it('angielski epilogu trzyma się słowniczka: the yard, carpet rack, apostrof typograficzny', () => {
    ustawJezyk('en');
    const body = epilogSheet('ludnosc', 'tech', 'zwykly', STATY).body;
    expect(body).toContain('The yard is noisy again.');
    expect(body).toContain('rules for the carpet rack.');
    expect(body).toContain('the bank’s disks');
    expect(body).not.toMatch(/courtyard|carpet-beating|bank's/);
  });

  it('po angielsku także tekst zastępczy i tytuł leku w zombie', () => {
    ustawJezyk('en');
    const s = epilogSheet('teren', null, 'zwykly', STATY);
    expect(s.title).toBe('Za Murem');
    expect(s.body).toContain('The road “Za Murem” is complete.');
    expect(wszystko(s)).not.toMatch(POLSKIE);
    expect(polskieSlowa(wszystko(s))).toEqual([]);
    expect(epilogSheet('lek', null, 'zombie', STATY).title).toBe('The cure');
    expect(epilogSheet('lek', null, 'zwykly', STATY).title).toBe('The premium-tier kill switch');
  });
});

describe('statystyki epilogu (statyEpilogu)', () => {
  it('dzień z wejścia, ludzie jak liczy droga, zmarli z listy zgonów, uchwały to podpisane', () => {
    const st = stan();
    st.laws.signed = { u_racje: true, u_zmiana: true, u_cofnieta: false };
    const i = wej({
      day: 14,
      ludnosc: 140,
      dead: [
        { id: 'a', name: 'A', cause: 'rany', tick: 1 },
        { id: '', name: 'B', cause: 'rany', tick: 2 },
      ],
    });
    expect(statyEpilogu(st, i)).toEqual({ dzien: 14, ludzi: 140, zmarli: 2, uchwaly: 2 });
  });

  it('spis 2021 z odczytu, gdy jest do użytku; inaczej pola nie ma', () => {
    expect(statyEpilogu(stan(), wej({ ludnosc2021: 2623 })).spis).toBe(2623);
    for (const n of [undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY])
      expect('spis' in statyEpilogu(stan(), wej({ ludnosc2021: n })), `${n}`).toBe(false);
  });

  it('bez pól `ludnosc` i `dead` ludzie to zarząd i mieszkańcy, zmarłych zero, bez uchwał zero', () => {
    const i = wej({ day: 3 });
    expect(i.dead).toBeUndefined();
    expect(i.ludnosc).toBeUndefined();
    expect(statyEpilogu(stan(), i)).toEqual({ dzien: 3, ludzi: 8, zmarli: 0, uchwaly: 0 });
  });
});

describe('Menu', () => {
  it('„Drogi do zwycięstwa” stoi pod „Jak grać”, a przed zapisem i powrotem na ekran startowy', () => {
    const m = menuSheet('Zapis co godzinę gry.');
    const kolejnosc = [...m.body.matchAll(/data-act="(menu-[\w-]+)"/g)].map((x) => x[1]);
    expect(kolejnosc).toEqual(['menu-back', 'menu-help', 'menu-zwyciestwo', 'menu-start']);
    expect(m.body).toContain('>Drogi do zwycięstwa<');
  });

  it('po angielsku przycisk to „Roads to victory”', () => {
    ustawJezyk('en');
    const m = menuSheet('The game saves itself.');
    expect(m.body).toContain('>Roads to victory<');
    expect(m.body).not.toContain('Drogi do zwycięstwa');
  });
});

describe('potwierdzenie „Nowa gra” (confirmSheet z własnym zdaniem)', () => {
  it('bez zdania zostaje „Tego nie da się cofnąć.”, ze zdaniem je zastępuje (z ucieczką HTML)', () => {
    expect(confirmSheet('Nowa gra').body).toBe('<p>Tego nie da się cofnąć.</p>');
    const s = confirmSheet('Nowa gra', 'Ta gra zostaje w zapisie <b>i tyle</b>.');
    expect(s.body).toBe('<p>Ta gra zostaje w zapisie &lt;b&gt;i tyle&lt;/b&gt;.</p>');
    expect(s.body).not.toContain('Tego nie da się cofnąć');
    // przyciski i zamykanie jak zawsze: „Nie” wraca, drugi przycisk potwierdza etykietą polecenia
    expect(s.foot).toContain('data-act="confirm-no"');
    expect(s.foot).toContain('data-act="confirm-yes">Nowa gra<');
    expect(s.closable).toBe(true);
    ustawJezyk('en');
    expect(confirmSheet('New game').body).toBe('<p>This cannot be undone.</p>');
    expect(confirmSheet('New game', 'It stays saved.').body).toBe('<p>It stays saved.</p>');
  });
});

describe('przegląd źródeł src/ui/zwyciestwo.ts', () => {
  /** Pary napisów `L('pl', 'en')` i `tx('pl', 'en')` z dosłownych tekstów (apostrofy, cudzysłowy albo odwrócone
      apostrofy, także w kilku wierszach); `${…}` w szablonie zastępuje słowo „x”. Wywołania z nazwami zamiast
      dosłownych tekstów tu nie wchodzą, pilnują ich scenariusze wyżej. */
  function pary(plik: string): { pl: string; en: string }[] {
    const zrodlo = readFileSync(plik, 'utf8');
    const lit = String.raw`(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|\x60((?:[^\x60\\]|\\.)*)\x60)`;
    const re = new RegExp(String.raw`(?<![\w.$])(?:L|tx)\(\s*${lit}\s*,\s*${lit}\s*,?\s*\)`, 'g');
    const czysc = (s: string) => s.replace(/\$\{[^}]*\}/g, 'x').replace(/\\(.)/g, '$1');
    return [...zrodlo.matchAll(re)].map((m) => ({
      pl: czysc(m[1] ?? m[2] ?? m[3]),
      en: czysc(m[4] ?? m[5] ?? m[6]),
    }));
  }

  it('każda para napisów ma angielską stronę bez polskich słów i różną od polskiej', () => {
    const lista = pary('src/ui/zwyciestwo.ts');
    // pilnuje, że wzorzec łapie wywołania (teksty epilogu, ścieżki, okna i statystyki)
    expect(lista.length).toBeGreaterThanOrEqual(20);
    for (const { pl, en } of lista) {
      expect(pl.length, en).toBeGreaterThan(0);
      expect(en.length, pl).toBeGreaterThan(0);
      expect(polskieSlowa(en), en).toEqual([]);
      expect(en, pl).not.toBe(pl);
    }
  });
});
