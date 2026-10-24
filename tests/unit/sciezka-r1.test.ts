/* R1. Drugi dzień (docs/superpowers/specs/2026-10-19-sciezka-celow-design.md, „R1. Drugi dzień”) na prawdziwej
   symulacji z zarządem: Przymorze, Lanciego i Zielonki w obu trybach. Po pierwszym raporcie pięć celów (w trybie zombie
   dzida zamiast obwodu); każdy warunek jest fałszywy przed czynnością i prawdziwy po niej: przeszukanie (też pomieszczenia
   u sąsiadów), pierwsza budowla, obwód, dzida. Drewno na całą noc i dyżur przy kozie rozstrzyga karta nocy o 20:00:
   zapas równy potrzebie z karty zalicza, o sztukę mniej daje „przepadł” dopiero po zatwierdzeniu, a podpowiedź przed kartą
   pokazuje tę samą potrzebę, którą karta pokaże (także z kozą z beczki: dwa paleniska, potrzeba 20); dyżur czeka do 20:00,
   zalicza się z `warta:koza` na zatwierdzonej karcie, a bez niego przepada. Termin mają tylko te dwa cele. Teksty bez
   polskich liter po angielsku i bez słów z bloku w domu; ścieżka niczego w grze nie zmienia (ten sam skrót symulacji
   i stan zarządu z krokami ścieżki i bez nich), a po zapisie i wczytaniu widok jest ten sam. */

import { afterEach, describe, expect, it } from 'vitest';
import { ustawJezyk } from '../../src/core/jezyk.ts';
import { CARD_HOUR, KOZA_KEY, nightWood, WOOD_PER_HOUR } from '../../src/gov/noc.ts';
import type { GovInput, NightCard } from '../../src/gov/typy.ts';
import { setNight } from '../../src/gov/zarzad.ts';
import { BUILDS } from '../../src/sim/budowle.ts';
import { commandsAt } from '../../src/sim/orders.ts';
import { nowyBudynek } from '../../src/sim/sasiedzi.ts';
import type { Command } from '../../src/sim/sim.ts';
import type { GameMode } from '../../src/sim/tryb.ts';
import { allowedAnchors } from '../../src/ui/budowa.ts';
import { potrzebaDrewna } from '../../src/ui/sciezka-rozdzialy.ts';
import { FORBIDDEN_DOM } from './miejsce-pomoc.ts';
import { polskieSlowa } from './po-angielsku.ts';
import { doorWhere, core as rdzen } from './sasiedzi-pomoc.ts';
import {
  bezAutomatu,
  cel,
  cele,
  DEMA,
  type Demo,
  doba,
  doKarty,
  doKartyZDrewnem,
  type Gra,
  godzina,
  graj,
  klon,
  krok,
  odczyt,
  odpowiedz,
  poPierwszymRaporcie,
  przezZapis,
  TRYBY,
  ustawDrewno,
  wDomu,
  wejscie,
  widok,
} from './sciezka-pomoc.ts';

afterEach(() => ustawJezyk('pl'));

const KOMBINACJE = DEMA.flatMap((key) => TRYBY.map((mode) => [key, mode] as const));

/** polecenie „Przeszukać …” w pokoju pustego mieszkania (w domu: pokoju domu komitetu) */
function polecenieSzukania(g: Gra): Command {
  const { st, w } = g.sim;
  const ids = [rdzen(g.sim)[0].id];
  for (const r of w.interior.rooms) {
    const m = commandsAt(st, w, ids, w.interior.room.indexOf(r.id)).find((x) => x.cmd.t === 'search');
    if (m) return m.cmd;
  }
  throw new Error('nie ma pokoju do przeszukania');
}

/** zasieki od planu do gotowej budowli: złom na podwórku dla całego kosztu, plan w pierwszym dozwolonym miejscu */
function postawZasieki(g: Gra): void {
  const { sim } = g;
  const { st, w } = sim;
  const koszt = BUILDS.zasieki.cost.zlom ?? 10;
  const sterta = st.things.find((t) => t.kind === 'zlom');
  if (!sterta) throw new Error('na podwórku nie ma sterty złomu');
  sterta.n = koszt + 2;
  const a = allowedAnchors(st, w, 'zasieki', 0)[0];
  sim.push({ t: 'build', ids: [rdzen(sim)[0].id], kind: 'zasieki', x: a % w.size, y: Math.floor(a / w.size), rot: 0 });
  graj(g, (x) => x.sim.st.things.some((t) => t.kind === 'zasieki'), {}, 1500);
}

/** Gra tuż po pierwszym raporcie bez automatu pracy ludzi: nikt sam nie przeszukuje, nie łata ani nie zbiera drewna, więc
    zapas drewna i to, co zrobione, zależą tylko od testu (z automatem zarząd do wieczora ma 30–50 sztuk drewna). */
function gra(key: Demo, mode: GameMode): Gra {
  return bezAutomatu(poPierwszymRaporcie(key, mode));
}

/** cele R1, które przepadły (cele pierwszego dnia też są w stanie ścieżki) */
const przepadleR1 = (g: Gra): string[] => g.sciezka.przepadle.filter((k) => k.startsWith('r1.')).sort();
const zrobioneR1 = (g: Gra): string[] =>
  Object.keys(g.sciezka.zrobione)
    .filter((k) => k.startsWith('r1.'))
    .sort();

/** drewno na całą noc: ile karta nocy wymaga przy tej liczbie palenisk */
const potrzeba = (g: Gra): number => potrzebaDrewna(wejscie(g));

/** przydział „Czuwa przy kozie” pierwszej osobie, która może czuwać */
const dajDyzur = (g: Gra, card: NightCard): void => {
  const kto = card.people.find((p) => p.options.some((o) => o.key === KOZA_KEY && o.ok));
  if (!kto) throw new Error('nikt nie może czuwać przy kozie');
  expect(setNight(g.gov, kto.id, KOZA_KEY)).toBe(true);
};

/** wszystkie teksty widoku (tytuł, tekst, podpowiedź, dopisek) */
const teksty = (g: Gra, touch: boolean): string[] => {
  const w = widok(g, { touch }).rozdzial!;
  return [w.tytul, ...w.cele.flatMap((c) => [c.text, c.how, c.czeka ?? ''])];
};

describe.each(KOMBINACJE)('R1 po pierwszym raporcie: %s %s', (key, mode) => {
  it('pięć celów: przeszukaj, budowla, obwód albo dzida, drewno na noc, dyżur; żaden niezrobiony, dyżur czeka', () => {
    const g = poPierwszymRaporcie(key, mode);
    expect(godzina(g)).toBeLessThan(8);
    expect(doba(g)).toBe(2);
    const w = widok(g).rozdzial!;
    expect(w.k).toBe('r1');
    expect(w.tytul).toBe('Drugi dzień');
    expect(w.cele.map((c) => c.key)).toEqual(
      mode === 'zombie'
        ? ['przeszukaj', 'budowla', 'dzida', 'drewno2', 'dyzur']
        : ['przeszukaj', 'budowla', 'obwod', 'drewno2', 'dyzur'],
    );
    expect(w.cele.every((c) => !c.done)).toBe(true);
    expect(w.cele.find((c) => c.key === 'dyzur')).toMatchObject({ czeka: 'czeka do 20:00', okno: 'karta' });
    expect(w.cele.filter((c) => c.key !== 'dyzur').every((c) => !c.czeka)).toBe(true);
    expect(w.biezacy?.key).toBe('przeszukaj');
    ustawJezyk('en');
    const en = widok(g).rozdzial!;
    expect(en.tytul).toBe('Day two');
    expect(en.cele.find((c) => c.key === 'dyzur')?.czeka).toBe('waiting for 20:00');
  });

  it('teksty: po angielsku bez polskich liter i słówek, w domu bez słów z bloku, bez myślników; mysz i dotyk', () => {
    const g = poPierwszymRaporcie(key, mode);
    for (const touch of [false, true]) {
      const pl = teksty(g, touch);
      for (const t of pl) {
        expect(t, t).not.toMatch(/[—–]/);
        if (wDomu(key)) expect(t, t).not.toMatch(FORBIDDEN_DOM);
      }
      ustawJezyk('en');
      const en = teksty(g, touch);
      ustawJezyk('pl');
      expect(en.length).toBe(pl.length);
      for (const t of en) {
        expect(polskieSlowa(t), t).toEqual([]);
        expect(t, t).not.toMatch(/[—–]/);
      }
      // po angielsku też w domu bez słów z bloku
      if (wDomu(key)) for (const t of en) expect(t, t).not.toMatch(/\b(flat|stairwell|block)\b/i);
      // dotyk i mysz różnią się podpowiedzią przeszukania i budowy
      if (touch) expect(pl.join(' ')).toContain('Przycisk Budowa u góry');
      else expect(pl.join(' ')).toContain('Budowa (przycisk u góry albo B)');
    }
  });

  it('przeszukaj: fałsz przed poleceniem, prawda po przeszukanym pomieszczeniu', () => {
    const g = poPierwszymRaporcie(key, mode);
    expect(cel(g, 'przeszukaj').done).toBe(false);
    expect(g.sim.st.apts.every((a) => a.searched.length === 0)).toBe(true);
    g.sim.push(polecenieSzukania(g));
    // polecenie samo niczego nie zalicza: liczy się przeszukane pomieszczenie
    g.sim.step();
    expect(cel(g, 'przeszukaj').done).toBe(false);
    graj(g, (x) => x.sim.st.apts.some((a) => a.searched.length > 0), {}, 600);
    expect(cel(g, 'przeszukaj').done).toBe(true);
    expect(widok(g).rozdzial!.biezacy?.key).not.toBe('przeszukaj');
    // zaliczenie trwa
    expect(g.sciezka.zrobione).toHaveProperty(['r1.przeszukaj']);
  });

  // Przymorze nie ma sąsiedniego budynku z drzwiami, które spełniają warunek (jak w dawnym teście ze spotkanie-ui)
  if (key !== 'przymorze')
    it('przeszukaj: pomieszczenie przeszukane u sąsiadów też zalicza cel', () => {
      const g = poPierwszymRaporcie(key, mode);
      const { w } = g.sim;
      expect(cel(g, 'przeszukaj').done).toBe(false);
      const { bid } = doorWhere(w, mode, () => true, wDomu(key) ? ['dom'] : ['blok']);
      g.sim.st.sasiedzi = { budynki: [nowyBudynek(w, mode, bid, null)], spotkanie: null, nr: 0, napis: null, n: 0 };
      expect(cel(g, 'przeszukaj').done, 'budynek sąsiada otwarty w stanie, ale nic nieprzeszukane').toBe(false);
      g.sim.st.sasiedzi.budynki[0].przeszukane.push(0);
      expect(cel(g, 'przeszukaj').done).toBe(true);
    });

  it('budowla: fałsz przed gotową budowlą (plan nie wystarcza), prawda po gotowych zasiekach', () => {
    const g = poPierwszymRaporcie(key, mode);
    expect(cel(g, 'budowla').done).toBe(false);
    postawZasieki(g);
    expect(g.sim.st.things.some((t) => t.kind === 'zasieki')).toBe(true);
    expect(cel(g, 'budowla').done).toBe(true);
    expect(g.sciezka.zrobione).toHaveProperty(['r1.budowla']);
  });

  it('plan budowli bez gotowej budowli nie zalicza celu', () => {
    const g = poPierwszymRaporcie(key, mode);
    const { st, w } = g.sim;
    const a = allowedAnchors(st, w, 'ogrodek', 0)[0];
    g.sim.push({ t: 'build', ids: [], kind: 'ogrodek', x: a % w.size, y: Math.floor(a / w.size), rot: 0 });
    g.sim.step();
    expect(st.builds.some((b) => b.kind === 'ogrodek')).toBe(true);
    expect(cel(g, 'budowla').done).toBe(false);
  });

  if (mode === 'zwykly')
    it('obwód: fałsz przy otwartych dziurach, prawda po zasiekach albo gdy nie ma otwartej dziury', () => {
      const g = poPierwszymRaporcie(key, mode);
      const dziury = odczyt(g).snap.fence.holes.length;
      expect(dziury).toBeGreaterThan(0);
      expect(cel(g, 'obwod').done).toBe(false);
      expect(cel(g, 'obwod').how).toContain(`Otwartych dziur: ${dziury}.`);
      // wszystkie dziury załatane (zarząd łata po cichu: polecenie `mend`)
      const h = klon(g);
      h.sim.push({ t: 'mend', ids: [], n: dziury });
      h.sim.step();
      expect(odczyt(h).snap.fence.holes.length).toBe(0);
      expect(cel(h, 'obwod').done).toBe(true);
      expect(cel(h, 'obwod').how).toContain('Otwartych dziur: 0.');
      // zasieki liczą się do obwodu i do pierwszej budowli
      postawZasieki(g);
      expect(cel(g, 'obwod').done).toBe(true);
      expect(cel(g, 'budowla').done).toBe(true);
    });
  else
    it('dzida: fałsz na starcie, prawda po zrobionej dzidzie; obwodu w trybie zombie nie ma', () => {
      const g = poPierwszymRaporcie(key, mode);
      expect(cele(g).map((c) => c.key)).not.toContain('obwod');
      expect(cel(g, 'dzida').done).toBe(false);
      g.sim.push({ t: 'craft', ids: [rdzen(g.sim)[0].id], item: 'dzida' });
      g.sim.step();
      expect(cel(g, 'dzida').done, 'polecenie samo niczego nie zalicza').toBe(false);
      graj(g, (x) => cel(x, 'dzida').done, {}, 900);
      expect(g.sciezka.zrobione).toHaveProperty(['r1.dzida']);
    });

  it('ścieżka niczego w grze nie zmienia: ten sam skrót symulacji i ten sam stan zarządu z krokami ścieżki i bez nich', () => {
    const a = poPierwszymRaporcie(key, mode);
    const b = klon(a);
    // od rana do wieczora i przez kartę nocy
    const warunek = (x: Gra) => doba(x) === 2 && godzina(x) >= 21;
    graj(a, warunek, {}, 1200);
    graj(b, warunek, { bezKroku: true }, 1200);
    expect(a.sim.hash()).toBe(b.sim.hash());
    expect(JSON.stringify(a.gov)).toBe(JSON.stringify(b.gov));
    // stan ścieżki zmienia się tylko w grze, która ją liczyła
    expect(b.sciezka).toEqual(poPierwszymRaporcie(key, mode).sciezka);
  });
});

describe.each(KOMBINACJE)('R1: podpowiedzi z liczbami %s %s', (key, mode) => {
  it('teksty zgodne z projektem (mysz, polski i angielski)', () => {
    const g = poPierwszymRaporcie(key, mode);
    const o = odczyt(g);
    const holes = o.snap.fence.holes.length;
    const n = Math.floor(o.snap.stock.wood);
    const dom = wDomu(key);
    const c = (k: string) => cel(g, k);

    expect(c('przeszukaj').text).toBe(dom ? 'Przeszukajcie dom.' : 'Przeszukajcie puste mieszkanie.');
    expect(
      c('przeszukaj').how.startsWith(`Zaznaczcie kogoś z ${dom ? 'komitetu' : 'zarządu'} i prawy przycisk w `),
    ).toBe(true);
    expect(c('budowla').text).toBe('Postawcie pierwszą budowlę.');
    expect(c('budowla').how).toContain(
      'Budowa (przycisk u góry albo B): dowolna budowla. Najmniej materiału biorą zasieki (złom 10) i ogródek (deski 14). ',
    );
    expect(c('budowla').how).toContain(
      `${dom ? 'Komitet ulicy' : 'Zarząd'} sam przyniesie materiały i zbuduje. Materiał pochodzi z przeszukiwania i rozbiórki.`,
    );
    if (mode === 'zwykly') {
      expect(c('budowla').how).toContain('Zasieki liczą się też do obwodu.');
      expect(c('obwod').text).toBe('Wzmocnijcie obwód.');
      expect(c('obwod').how).toBe(
        `Budowa, zakładka Obwód: Zasieki w miejscu odcinka siatki (złom 10) albo łatanie: prawy przycisk na dziurze, „Załatać dziurę” (3 deski albo 3 złomu na łatę). Otwartych dziur: ${holes}.`,
      );
    } else {
      expect(c('budowla').how).not.toContain('Zasieki liczą się też do obwodu.');
      expect(c('dzida').text).toBe('Zróbcie dzidę dla warty.');
      expect(c('dzida').how).toBe(
        `Prawy przycisk na stercie desek albo złomu: „Zrobić dzidę” (2 deski i 1 złom). Dzida sięga szwendaczy przez siatkę. Deski i złom pochodzą z przeszukiwania ${dom ? 'domu' : 'pustych mieszkań'} i z rozbiórki.`,
      );
    }
    if (dom)
      expect(c('budowla').how).toContain('Deski i złom mają też sąsiednie domy: prawy przycisk na ich drzwiach.');
    else expect(c('budowla').how).not.toContain('sąsiednie');

    expect(c('drewno2').text).toBe('Zbierzcie drewno na całą noc.');
    expect(c('drewno2').how).toBe(
      mode === 'zombie'
        ? `Drewna ${n} z 10, razem z tym w kozie. Za siatką są szwendacze: spalcie meble ${dom ? 'w domu' : 'w pustym mieszkaniu'} („Spalić …”) albo idźcie po drzewo za dnia z dzidą, kiedy pod siatką jest pusto.`
        : `Drewna ${n} z 10, razem z tym w kozie: tyle zje noc od 20:00 do 6:00 przy dyżurze, sztuka na godzinę. Prawy przycisk na drzewie: „Ściąć drzewo”; za dnia ${dom ? 'furtka' : 'brama'} stoi otwarta.`,
    );
    expect(c('dyzur').text).toBe('Dajcie komuś dyżur przy kozie.');
    expect(c('dyzur').how).toBe(
      'Na karcie nocy o 20:00 wybierzcie przy jednej osobie „Czuwa przy kozie”. Bez dyżuru koza gaśnie, kiedy wszyscy zasną.',
    );

    ustawJezyk('en');
    expect(c('przeszukaj').text).toBe(dom ? 'Search the house.' : 'Search an empty flat.');
    expect(c('budowla').text).toBe('Put up your first structure.');
    expect(c('budowla').how).toContain(
      'Build (button at the top, or B): any structure will do. The cheapest are the barricade (scrap 10) and the vegetable patch (planks 14). ',
    );
    if (mode === 'zwykly') {
      expect(c('budowla').how).toContain('A barricade also counts for the perimeter.');
      expect(c('obwod').text).toBe('Strengthen the perimeter.');
      expect(c('obwod').how).toBe(
        `Build, Perimeter tab: a barricade in place of a stretch of fence (scrap 10), or patch the holes: right-click a hole, “Patch the hole” (3 planks or 3 scrap a patch). Open holes: ${holes}.`,
      );
    } else {
      expect(c('dzida').text).toBe('Make a spear for the watch.');
      expect(c('dzida').how).toBe(
        `Right-click a pile of planks or scrap: “Make a spear” (2 planks and 1 scrap). A spear reaches shamblers through the fence. Planks and scrap come from searching ${dom ? 'the house' : 'empty flats'} and taking things apart.`,
      );
    }
    if (dom)
      expect(c('budowla').how).toContain('The houses next door have planks and scrap too: right-click their door.');
    expect(c('drewno2').text).toBe('Get in enough wood for the whole night.');
    expect(c('drewno2').how).toBe(
      mode === 'zombie'
        ? `Wood: ${n} of 10, counting what’s in the stove. There are shamblers outside the fence: burn furniture ${dom ? 'in the house' : 'in an empty flat'} (“Burn the …”), or go for a tree by day with a spear when nobody is at the fence.`
        : `Wood: ${n} of 10, counting what’s in the stove: that’s what the night from 20:00 to 6:00 burns with a stove watch, one piece an hour. Right-click a tree: “Chop down the tree”; ${dom ? 'the garden gate' : 'the gate'} stays open by day.`,
    );
    expect(c('dyzur').text).toBe('Put someone on stove watch.');
    expect(c('dyzur').how).toBe(
      'On the Night orders at 20:00, pick “Watches the stove” for one person. Without a stove watch the fire goes out once everyone is asleep.',
    );
  });

  it('dotyk: te same cele z podpowiedziami dla palca', () => {
    const g = poPierwszymRaporcie(key, mode);
    const c = (k: string) => cel(g, k, { touch: true });
    const dom = wDomu(key);
    expect(
      c('przeszukaj').how.startsWith(`Stuknijcie kogoś z ${dom ? 'komitetu' : 'zarządu'} i przytrzymajcie palec `),
    ).toBe(true);
    expect(c('budowla').how.startsWith('Przycisk Budowa u góry: dowolna budowla.')).toBe(true);
    if (dom)
      expect(c('budowla').how).toContain('Deski i złom mają też sąsiednie domy: przytrzymajcie palec na ich drzwiach.');
    if (mode === 'zwykly') {
      expect(
        c('obwod').how.startsWith('Przycisk Budowa u góry, zakładka Obwód: Zasieki w miejscu odcinka siatki'),
      ).toBe(true);
      expect(c('obwod').how).toContain('przytrzymajcie palec na dziurze, „Załatać dziurę”');
      expect(c('drewno2').how).toContain('Stuknijcie pień drzewa; za dnia');
    } else {
      expect(c('dzida').how.startsWith('Przytrzymajcie palec na stercie desek albo złomu: „Zrobić dzidę”')).toBe(true);
    }
    ustawJezyk('en');
    if (mode === 'zwykly') {
      expect(c('obwod').how).toContain('The Build button at the top, Perimeter tab: a barricade');
      expect(c('obwod').how).toContain('press and hold on a hole, “Patch the hole”');
      expect(c('drewno2').how).toContain('Tap the trunk of a tree; ');
    }
  });
});

describe.each(KOMBINACJE)('R1: karta nocy, drewno i dyżur: %s %s', (key, mode) => {
  it('drewno na noc: zapas równy potrzebie z karty zalicza cel, gdy karta się pokaże; dyżur przestaje czekać', () => {
    const g = gra(key, mode);
    const trzeba = potrzeba(g);
    expect(trzeba).toBe(10);
    // przed kartą cel jest do zrobienia (nie czeka), dyżur czeka do 20:00
    expect(godzina(g)).toBeLessThan(CARD_HOUR);
    expect(cel(g, 'drewno2')).toMatchObject({ done: false });
    expect(cel(g, 'drewno2').czeka).toBeUndefined();
    expect(cel(g, 'dyzur').czeka).toBe('czeka do 20:00');
    const card = doKartyZDrewnem(g, trzeba);
    expect(card.wood).toMatchObject({ have: trzeba, need: trzeba });
    expect(g.gov.night?.confirmed).toBe(false);
    // karta jeszcze otwarta, a cel już zaliczony: rozstrzygnęły go liczby z karty
    expect(cel(g, 'drewno2').done).toBe(true);
    expect(cel(g, 'drewno2').missed).toBeUndefined();
    expect(zrobioneR1(g)).toEqual(['r1.drewno2']);
    // dyżur nie czeka (jest karta, na której się go wybiera), ale jeszcze nie jest zrobiony: karta niezatwierdzona
    expect(cel(g, 'dyzur')).toMatchObject({ done: false });
    expect(cel(g, 'dyzur').czeka).toBeUndefined();
    expect(przepadleR1(g)).toEqual([]);
  });

  it('drewno na noc: sztuka mniej niż potrzeba nie zalicza, a po zatwierdzeniu karty cel przepada', () => {
    const g = gra(key, mode);
    const trzeba = potrzeba(g);
    const card = doKartyZDrewnem(g, trzeba - 1);
    expect(card.wood).toMatchObject({ have: trzeba - 1, need: trzeba });
    // karta otwarta: cel jeszcze nie przepadł (termin trwa do zatwierdzenia), a podpowiedź mówi ile brakuje
    expect(cel(g, 'drewno2')).toMatchObject({ done: false });
    expect(cel(g, 'drewno2').missed).toBeUndefined();
    expect(cel(g, 'drewno2').how).toContain(`${trzeba - 1} z ${trzeba}`);
    expect(przepadleR1(g)).toEqual([]);
    // zatwierdzenie bez zapasu: przepadł (skreślony, policzony jak zrobiony)
    odpowiedz(g, { k: 'karta', card, assign: { ...g.gov.night!.assign } });
    expect(g.gov.night?.confirmed).toBe(true);
    expect(cel(g, 'drewno2')).toMatchObject({ done: true, missed: true });
    expect(przepadleR1(g)).toContain('r1.drewno2');
    expect(zrobioneR1(g)).not.toContain('r1.drewno2');
    // zapas, który pojawi się po zatwierdzeniu, przepadłego celu nie ratuje
    ustawDrewno(g.sim, 40);
    expect(cel(g, 'drewno2')).toMatchObject({ done: true, missed: true });
    expect(zrobioneR1(g)).not.toContain('r1.drewno2');
  });

  it('drewno na noc: zapas ponad potrzebę przed kartą jeszcze niczego nie zalicza, a potrzeba nie zależy od godziny', () => {
    const g = gra(key, mode);
    const trzeba = potrzeba(g);
    for (const godz of [8, 12, 16, 19]) {
      graj(g, (x) => godzina(x) >= godz, {}, 700);
      expect(potrzeba(g), `o ${godz}:00`).toBe(trzeba);
      ustawDrewno(g.sim, trzeba + 5);
      // zapas ponad potrzebę przed kartą jeszcze niczego nie zalicza: rozstrzyga karta
      expect(cel(g, 'drewno2'), `o ${godz}:00`).toMatchObject({ done: false });
      expect(cel(g, 'drewno2').how).toContain(`z ${trzeba}`);
    }
    expect(zrobioneR1(g)).toEqual([]);
  });

  it('dyżur: przepada, gdy karta jest zatwierdzona bez „Czuwa przy kozie”', () => {
    const g = gra(key, mode);
    const card = doKartyZDrewnem(g, potrzeba(g));
    // propozycja zarządu nie daje dyżuru przy kozie: wybiera go gracz
    expect(Object.values(g.gov.night!.assign)).not.toContain(KOZA_KEY);
    expect(cel(g, 'dyzur').done).toBe(false);
    odpowiedz(g, { k: 'karta', card, assign: { ...g.gov.night!.assign } });
    expect(cel(g, 'dyzur')).toMatchObject({ done: true, missed: true });
    expect(przepadleR1(g)).toEqual(['r1.dyzur']);
    expect(zrobioneR1(g)).toEqual(['r1.drewno2']);
  });

  it('dyżur: zalicza się przy zatwierdzeniu karty z „Czuwa przy kozie”, nie przy samym przydziale', () => {
    const g = gra(key, mode);
    const card = doKartyZDrewnem(g, potrzeba(g));
    expect(cel(g, 'dyzur').done).toBe(false);
    dajDyzur(g, card);
    expect(Object.values(g.gov.night!.assign)).toContain(KOZA_KEY);
    expect(cel(g, 'dyzur').done, 'przydział na karcie bez zatwierdzenia').toBe(false);
    odpowiedz(g, { k: 'karta', card, assign: { ...g.gov.night!.assign } });
    expect(cel(g, 'dyzur')).toMatchObject({ done: true });
    expect(cel(g, 'dyzur').missed).toBeUndefined();
    expect(zrobioneR1(g)).toEqual(['r1.drewno2', 'r1.dyzur']);
    expect(przepadleR1(g)).toEqual([]);
  });

  it('dyżur czeka od rana do 20:00, w tym o 19:30 przy zebraniu, i przestaje czekać dopiero z kartą nocy', () => {
    const g = gra(key, mode);
    expect(cel(g, 'dyzur').czeka).toBe('czeka do 20:00');
    // w południe i tuż przed kartą nadal czeka, a bieżący cel jest inny
    graj(g, (x) => godzina(x) >= 12, {}, 700);
    expect(cel(g, 'dyzur').czeka).toBe('czeka do 20:00');
    expect(widok(g).rozdzial!.biezacy?.key).not.toBe('dyzur');
    graj(g, (x) => godzina(x) >= 19, {}, 700);
    expect(cel(g, 'dyzur').czeka).toBe('czeka do 20:00');
    expect(zrobioneR1(g)).not.toContain('r1.dyzur');
    expect(przepadleR1(g)).toEqual([]);
  });

  it('termin mają tylko drewno na noc i dyżur: po nocy bez niczego żaden inny cel nie jest przepadły', () => {
    const g = gra(key, mode);
    // noc bez zapasu i bez dyżuru: zatwierdzona propozycja zarządu, potem raport rano
    graj(g, (x) => x.gov.reports.length >= 2 && !x.gov.report, {}, 1500);
    expect(g.gov.reports.length).toBe(2);
    expect(przepadleR1(g)).toEqual(['r1.drewno2', 'r1.dyzur']);
    // trzy pozostałe cele nie mają terminu: rozdział na nie czeka (bez automatu nikt ich sam nie zrobił)
    const w = widok(g).rozdzial!;
    expect(w.k).toBe('r1');
    expect(w.cele.filter((c) => !c.done).map((c) => c.key)).toEqual(
      mode === 'zombie' ? ['przeszukaj', 'budowla', 'dzida'] : ['przeszukaj', 'budowla', 'obwod'],
    );
    expect(w.cele.filter((c) => c.missed).map((c) => c.key)).toEqual(['drewno2', 'dyzur']);
    expect(w.biezacy?.key).toBe('przeszukaj');
    // i zostają do zrobienia także po kolejnych dobach
    graj(g, (x) => x.gov.reports.length >= 3 && !x.gov.report, {}, 1500);
    expect(przepadleR1(g)).toEqual(['r1.drewno2', 'r1.dyzur']);
    expect(widok(g).rozdzial?.k).toBe('r1');
  });

  it('z automatem pracy ludzi drewno jest takie, jakie zebrali ludzie, a cel zgadza się z kartą co do sztuki', () => {
    const g = poPierwszymRaporcie(key, mode);
    const card = doKarty(g);
    expect(card.wood).toBeDefined();
    const { have, need } = card.wood!;
    expect(need).toBe(10);
    expect(have).toBe(Math.floor(odczyt(g).snap.stock.wood));
    // zaliczony wtedy i tylko wtedy, gdy karta pokazuje zapas co najmniej równy potrzebie
    expect(cel(g, 'drewno2').done).toBe(have >= need);
    odpowiedz(g, { k: 'karta', card, assign: { ...g.gov.night!.assign } });
    krok(g);
    expect(g.sciezka.przepadle.includes('r1.drewno2')).toBe(have < need);
    expect(g.sciezka.zrobione['r1.drewno2'] !== undefined).toBe(have >= need);
  });

  it('całe R1: wszystkie pięć celów rozstrzygnięte zamyka rozdział, a pierwszy ani drugi dzień nie wracają', () => {
    const g = gra(key, mode);
    // trzy cele bez terminu: przeszukanie, budowla, obwód albo dzida
    g.sim.push(polecenieSzukania(g));
    graj(g, (x) => x.sim.st.apts.some((a) => a.searched.length > 0), {}, 600);
    if (mode === 'zombie') {
      g.sim.push({ t: 'craft', ids: [rdzen(g.sim)[0].id], item: 'dzida' });
      graj(g, (x) => cel(x, 'dzida').done, {}, 900);
    }
    postawZasieki(g);
    expect(
      cele(g)
        .filter((c) => !c.done)
        .map((c) => c.key),
    ).toEqual(['drewno2', 'dyzur']);
    // karta nocy: drewno wystarcza, dyżur dany
    const card = doKartyZDrewnem(g, potrzeba(g));
    expect(cel(g, 'drewno2').done).toBe(true);
    dajDyzur(g, card);
    odpowiedz(g, { k: 'karta', card, assign: { ...g.gov.night!.assign } });
    krok(g);
    expect(przepadleR1(g)).toEqual([]);
    expect(zrobioneR1(g)).toHaveLength(5);
    // rozdział skończony: okienko pokazuje następny rozdział albo jest schowane, drugiego dnia już nie ma
    expect(widok(g).rozdzial?.k).not.toBe('r1');
    expect(widok(g).rozdzial?.k).not.toBe('r0');
    // następny to R2 „Ludzie i noc”, otwarty w chwili zamknięcia R1, z licznikami z tej chwili
    expect(g.sciezka.rozdzial).toBe('r2');
    expect(g.sciezka.od).toBe(g.sim.st.tick);
    expect(widok(g).rozdzial?.tytul).toBe('Ludzie i noc');
    expect(g.sciezka.start.raporty).toBe(g.gov.reports.length);
  });
});

describe('R1: podpowiedź drewna przed kartą pokazuje potrzebę, którą pokaże karta', () => {
  it.each(KOMBINACJE)('%s %s: jedna koza, potrzeba 10, ta sama na podpowiedzi i na karcie', (key, mode) => {
    const g = gra(key, mode);
    expect(potrzeba(g)).toBe(10);
    // zapas liczony jak na karcie: skład, luzem, w rękach i w ogniu
    const n = Math.floor(odczyt(g).snap.stock.wood);
    expect(cel(g, 'drewno2').how).toContain(`${n} z 10`);
    const card = doKartyZDrewnem(g, 7);
    expect(card.wood).toMatchObject({ have: 7, need: 10 });
    expect(cel(g, 'drewno2').how).toContain('7 z 10');
    expect(card.wood?.need).toBe(nightWood({ ...wejscie(g), hour: CARD_HOUR, minute: 0 }).need);
  });

  it.each(KOMBINACJE)('%s %s: z kozą z beczki dwa paleniska, potrzeba 20 w podpowiedzi i na karcie', (key, mode) => {
    const g = gra(key, mode);
    const { st, w } = g.sim;
    // koza z beczki w mieszkaniu zarządu (po badaniu pieców): z kozą zarządu dwa paleniska
    st.techDone = ['t_kozy'];
    const a = allowedAnchors(st, w, 'koza_beczka', 0)[0];
    st.things.push({
      id: st.nextThing++,
      kind: 'koza_beczka',
      x: a % w.size,
      y: Math.floor(a / w.size),
      w: 1,
      h: 1,
      rot: 0,
      n: 1,
      fuel: 0,
      by: -1,
      owner: -1,
    });
    expect(wejscie(g).paleniska).toBe(2);
    expect(potrzeba(g)).toBe(20);
    const n = Math.floor(odczyt(g).snap.stock.wood);
    expect(cel(g, 'drewno2').how).toContain(`${n} z 20`);
    // zapas równy 20 zalicza cel na karcie, 19 nie
    const pelny = klon(g);
    const k1 = doKartyZDrewnem(pelny, 20);
    expect(k1.wood).toMatchObject({ have: 20, need: 20 });
    expect(cel(pelny, 'drewno2').done).toBe(true);
    const niepelny = klon(g);
    const k2 = doKartyZDrewnem(niepelny, 19);
    expect(k2.wood).toMatchObject({ have: 19, need: 20 });
    expect(cel(niepelny, 'drewno2').done).toBe(false);
    odpowiedz(niepelny, { k: 'karta', card: k2, assign: { ...niepelny.gov.night!.assign } });
    expect(cel(niepelny, 'drewno2')).toMatchObject({ done: true, missed: true });
    expect(przepadleR1(niepelny)).toContain('r1.drewno2');
  });

  it('potrzeba z odczytu zgadza się z nightWood o 20:00 dla każdej liczby palenisk', () => {
    const g = poPierwszymRaporcie('przymorze');
    const i = wejscie(g);
    for (const paleniska of [undefined, 1, 2, 3, 4, 7]) {
      const wej: GovInput = { ...i, hour: CARD_HOUR, minute: 0, ...(paleniska ? { paleniska } : {}) };
      if (paleniska === undefined) delete wej.paleniska;
      expect(potrzebaDrewna(wej), `paleniska ${paleniska}`).toBe(nightWood(wej).need);
      expect(potrzebaDrewna(wej)).toBe(10 * WOOD_PER_HOUR * (paleniska ?? 1));
    }
    expect(potrzebaDrewna(null)).toBe(10);
  });
});

describe('R1: zapis, wczytanie i stare zapisy', () => {
  it.each(KOMBINACJE)('%s %s: zapis i wczytanie w środku rozdziału i przy karcie dają ten sam widok', (key, mode) => {
    const g = gra(key, mode);
    graj(g, (x) => godzina(x) >= 14, {}, 700);
    const widokPrzed = JSON.stringify(widok(g));
    const wczytana = przezZapis(g);
    expect(JSON.stringify(widok(wczytana))).toBe(widokPrzed);
    // i dalej tak samo przez kartę nocy
    const a = klon(g);
    const card = doKartyZDrewnem(a, 10);
    const b = przezZapis(a);
    expect(JSON.stringify(widok(b))).toBe(JSON.stringify(widok(a)));
    odpowiedz(a, { k: 'karta', card, assign: { ...a.gov.night!.assign } });
    odpowiedz(b, { k: 'karta', card: b.gov.night!.card, assign: { ...b.gov.night!.assign } });
    expect(JSON.stringify(widok(b))).toBe(JSON.stringify(widok(a)));
    expect(przepadleR1(a)).toEqual(['r1.dyzur']);
    expect(przepadleR1(b)).toEqual(['r1.dyzur']);
  });

  it('karta nocy zatwierdzona przed otwarciem rozdziału (wczytana gra) nie rozstrzyga dyżuru ani drewna: czekają na następną noc', () => {
    const k = gra('lanciego', 'zwykly');
    const card = doKartyZDrewnem(k, 3);
    odpowiedz(k, { k: 'karta', card, assign: { ...k.gov.night!.assign } });
    graj(k, (x) => godzina(x) >= 21, {}, 200);
    expect(k.gov.night?.confirmed).toBe(true);
    // stary zapis: ścieżka od zera, gra po zatwierdzeniu karty (21:00 drugiego dnia)
    k.sciezka = { ...k.sciezka, rozdzial: 'r0', od: 0, zrobione: {}, przepadle: [] };
    expect(krok(k).rozdzial).toBe('r1');
    expect(k.sciezka.od).toBe(k.sim.st.tick);
    expect(przepadleR1(k)).toEqual([]);
    expect(cel(k, 'drewno2')).toMatchObject({ done: false });
    expect(cel(k, 'dyzur')).toMatchObject({ done: false, czeka: 'czeka do 20:00' });
    // następna noc: karta z kolejnego dnia rozstrzyga oba cele
    const nastepna = doKartyZDrewnem(k, 10);
    expect(nastepna.day).toBe(3);
    expect(cel(k, 'drewno2').done).toBe(true);
    expect(cel(k, 'dyzur').czeka).toBeUndefined();
    odpowiedz(k, { k: 'karta', card: nastepna, assign: { ...k.gov.night!.assign } });
    expect(cel(k, 'dyzur')).toMatchObject({ done: true, missed: true });
  });

  it('karta otwarta w chwili wczytania starego stanu liczy się jak karta po otwarciu rozdziału tylko wtedy, gdy powstała po nim', () => {
    const g = gra('przymorze', 'zwykly');
    // gra stoi na otwartej karcie nocy dnia 2, a ścieżka (stary zapis) otwiera się przed jej godziną
    const card = doKartyZDrewnem(g, 12);
    g.sciezka = { ...g.sciezka, rozdzial: 'r0', od: 0, zrobione: {}, przepadle: [] };
    // otwarcie w chwili wczytania: karta powstała o 20:00, a wczytanie jest już po niej
    expect(krok(g).rozdzial).toBe('r1');
    expect(card.wood?.have).toBe(12);
    expect(cel(g, 'drewno2')).toMatchObject({ done: false });
    expect(cel(g, 'dyzur').czeka).toBe('czeka do 20:00');
  });
});
