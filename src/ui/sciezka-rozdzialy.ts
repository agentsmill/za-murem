/* Rozdziały ścieżki celów (docs/superpowers/specs/2026-10-19-sciezka-celow-design.md): treść rozdziałów głównej ścieżki
   i ich kolejność (`ROZDZIALY`). Silnik, stan i HTML okienka leżą w src/ui/sciezka.ts; tu jest to, co spec mówi o każdym
   celu: tekst, podpowiedź, warunek zaliczenia, a przy niektórych dopisek „czeka”, termin i okno, w którym cel dostaje
   linię „Cel: …”. Moduł bierze z silnika same typy (`import type`: `DefCelu`, `DefRozdzialu`, `OdczytCelow`,
   `StanSciezki`), więc nie ma cyklu importów w czasie wykonania; silnik bierze stąd `ROZDZIALY`.

   R0 to `goalsOf` (src/ui/cele.ts) opakowany w rozdział: te same teksty, te same zaliczenia, a drewno na wieczór trzyma
   stan ścieżki. R1 to cele drugiego dnia: przeszukać, postawić pierwszą budowlę, wzmocnić obwód (w trybie zombie zrobić
   dzidę), zebrać drewno na całą noc i dać komuś dyżur przy kozie. Dwa ostatnie mają termin i rozstrzyga je karta nocy:
   drewno liczy się z karty (`gov.night.card.wood`, a przed kartą z tą samą potrzebą, którą karta pokaże o 20:00),
   dyżur z przydziału `warta:koza` po zatwierdzeniu karty. Liczą się tylko karty, które powstały po otwarciu rozdziału
   (plan nocy z tego samego dnia, ale sprzed wczytania gry, czeka na następną noc). Dalsze rozdziały dochodzą w kolejnych
   zadaniach planu. */

import { L } from '../core/jezyk.ts';
import type { Words, WordsEn } from '../gov/miejsce.ts';
import { CARD_HOUR, KOZA_KEY, MORNING, WOOD_PER_HOUR } from '../gov/noc.ts';
import type { GovInput, NightPlan } from '../gov/typy.ts';
import { atHour } from '../gov/wspolne.ts';
import { START_KIT } from '../sim/bron.ts';
import { BUILDS_EN } from '../sim/budowle.en.ts';
import { BUILDS } from '../sim/budowle.ts';
import { minutesAt } from '../sim/clock.ts';
import { PATCH_COST, SPEAR_BOARDS, SPEAR_SCRAP } from '../sim/sim.ts';
import { TUT_STEPS } from '../sim/tutorial.ts';
import { costText } from './budowa.ts';
import { type Goal, goalsOf, NIGHT_WOOD, najtanszeBudowle, zombieMode } from './cele.ts';
import type { DefCelu, DefRozdzialu, OdczytCelow, StanSciezki } from './sciezka.ts';
import { manyEn, num } from './tekst.ts';

/* ---------------------------------------------------------------- R0. Pierwszy dzień */

/** zapas drewna jak w oknie celów od zawsze: skład, luzem i w rękach (bez drewna w ogniu) */
const zapasDrewna = (o: OdczytCelow): number =>
  o.snap.stock.woodSklad + o.snap.stock.woodLoose + o.snap.stock.woodCarried;

/** Cele pierwszego dnia z `goalsOf` (src/ui/cele.ts) dla tego odczytu. Zaliczenie drewna rozstrzyga stan ścieżki, nie
    ta lista, więc `woodReady` nie jest tu potrzebne: teksty i kroki samouczka od niego nie zależą. */
const r0Lista = (o: OdczytCelow): Goal[] =>
  goalsOf(o.st, o.gov, {
    touch: o.touch,
    kitchen: o.snap.kitchen,
    hour: o.snap.hour,
    ...(o.zaznaczony !== undefined ? { selected: o.zaznaczony } : {}),
    wood: zapasDrewna(o),
    words: o.words,
    wordsEn: o.wordsEn,
    w: o.w,
  });

const r0Cel = (o: OdczytCelow, key: Goal['key']): Goal =>
  r0Lista(o).find((g) => g.key === key) ?? { key, text: '', how: '', done: false };

/** po pierwszej nocy albo po zatwierdzeniu karty nocy: termin drewna na wieczór minął */
const poTerminieWieczoru = (o: OdczytCelow): boolean => (o.gov?.reports.length ?? 0) > 0 || !!o.gov?.night?.confirmed;

const R0: DefRozdzialu = {
  k: 'r0',
  tytul: () => L('Pierwszy dzień', 'Day one'),
  cele: [
    ...TUT_STEPS.map(
      (key): DefCelu => ({
        key,
        jest: (o) => o.st.tut.step >= 0,
        tekst: (o) => r0Cel(o, key).text,
        jak: (o) => r0Cel(o, key).how,
        zrobiony: (o) => r0Cel(o, key).done,
      }),
    ),
    {
      key: 'drewno',
      jest: (o) => o.st.tut.step >= 0,
      tekst: (o) => r0Cel(o, 'drewno').text,
      jak: (o) => r0Cel(o, 'drewno').how,
      // zapas raz zaliczony zostaje zaliczony (koza zje drewno do wieczora); po terminie zaliczyć się już nie da
      zrobiony: (o) => !poTerminieWieczoru(o) && o.st.tut.step >= TUT_STEPS.length && zapasDrewna(o) >= NIGHT_WOOD,
      przepadl: poTerminieWieczoru,
    },
    {
      key: 'noc',
      tekst: (o) => r0Cel(o, 'noc').text,
      jak: (o) => r0Cel(o, 'noc').how,
      zrobiony: (o) => (o.gov?.reports.length ?? 0) > 0,
    },
  ],
};

/* ---------------------------------------------------------------- R1. Drugi dzień */

/** Drewno na całą noc przy dyżurze, jak liczy je karta nocy o 20:00 (`nightWood` w src/gov/noc.ts): WOOD_PER_HOUR na
    godzinę razy 10 godzin od CARD_HOUR do MORNING razy liczba palenisk (`GovInput.paleniska`, bez pola jedno). Ta sama
    liczba stoi w podpowiedzi celu przed kartą, a karta pokaże ją o 20:00. */
export const potrzebaDrewna = (i: Pick<GovInput, 'paleniska'> | null): number =>
  Math.ceil(((MORNING - CARD_HOUR + 24) % 24) * WOOD_PER_HOUR * (i?.paleniska ?? 1));

/** po zamknięciu pierwszego raportu: raport jest, a okno raportu już nie */
const poPierwszymRaporcie = (o: OdczytCelow): boolean => !!o.gov && o.gov.reports.length >= 1 && !o.gov.report;

/** Plan nocy (karta), który powstał po otwarciu rozdziału. Karta powstaje o CARD_HOUR dnia `plan.day`, więc liczy się, jeśli
    ta godzina nie jest wcześniejsza niż chwila otwarcia rozdziału. Plan sprzed otwarcia (gra wczytana po zatwierdzeniu
    karty) czeka na następną noc. Plan bez dnia (atrapa) się nie liczy. */
const kartaPoOtwarciu = (o: OdczytCelow, s: StanSciezki): NightPlan | null => {
  const n = o.gov?.night;
  return n && atHour(n.day, CARD_HOUR) >= minutesAt(s.od) ? n : null;
};

/** karta nocy z tej nocy ma w przydziałach dyżur przy kozie */
const maDyzur = (n: NightPlan): boolean => Object.values(n.assign ?? {}).includes(KOZA_KEY);

/** „Budowa (przycisk u góry albo B)”; na dotyku sam przycisk */
const przyciskBudowy = (touch: boolean): string =>
  touch
    ? L('Przycisk Budowa u góry', 'The Build button at the top')
    : L('Budowa (przycisk u góry albo B)', 'Build (button at the top, or B)');

function budowlaJak(o: OdczytCelow): string {
  const { words: w, wordsEn: e, touch } = o;
  const b = przyciskBudowy(touch);
  // dwie budowle, które biorą najmniej materiału spośród tych, które da się postawić (koszty stroi bot, więc nie wpisuję
  // ich na sztywno)
  const kinds = najtanszeBudowle(o.st);
  const tanie = kinds.map((k) => `${L(BUILDS[k].name.toLowerCase(), BUILDS_EN[k].the)} (${costText(BUILDS[k].cost)})`);
  // dopiski: zasieki liczą się też do celu obwodu (którego w zombie nie ma), a w domu jednorodzinnym deski i złom mają
  // też sąsiednie domy
  const obok = (x: Words['szukanie']['obok'] | WordsEn['szukanie']['obok']): string =>
    x ? (touch ? x.dotyk : x.mysz) : '';
  const dopisek = (...zdania: string[]): string =>
    zdania
      .filter(Boolean)
      .map((z) => ` ${z}`)
      .join('');
  const zasieki = !zombieMode(o.st, o.gov) && kinds.includes('zasieki');
  return L(
    `${b}: dowolna budowla. Najmniej materiału biorą ${tanie.join(' i ')}. ${w.Zarzad} sam przyniesie materiały i zbuduje. Materiał daje przeszukiwanie i rozbiórka.${dopisek(
      zasieki ? 'Zasieki liczą się też do obwodu.' : '',
      obok(w.szukanie.obok),
    )}`,
    `${b}: any structure will do. The cheapest are ${tanie.join(' and ')}. ${e.Zarzad} will fetch the materials and do the building. Searching and taking things apart give you materials.${dopisek(
      zasieki ? 'A barricade also counts for the perimeter.' : '',
      obok(e.szukanie.obok),
    )}`,
  );
}

function obwodJak(o: OdczytCelow): string {
  const dziury = num(o.snap.fence.holes.length, 0);
  const zasieki = costText(BUILDS.zasieki.cost);
  const b = o.touch ? L('Przycisk Budowa u góry', 'The Build button at the top') : L('Budowa', 'Build');
  return L(
    `${b}, zakładka Obwód: ${BUILDS.zasieki.name} w miejscu odcinka siatki (${zasieki}) albo łatanie: ${
      o.touch ? 'przytrzymajcie palec na dziurze' : 'prawy przycisk na dziurze'
    }, „Załatać dziurę” (${PATCH_COST} deski albo ${PATCH_COST} złomu na łatę). Otwartych dziur: ${dziury}.`,
    `${b}, Perimeter tab: a ${BUILDS_EN.zasieki.name.toLowerCase()} in place of a stretch of fence (${zasieki}), or patch the holes: ${
      o.touch ? 'press and hold on a hole' : 'right-click a hole'
    }, “Patch the hole” (${PATCH_COST} planks or ${PATCH_COST} scrap a patch). Open holes: ${dziury}.`,
  );
}

/** dzidy w rękach zarządu i w magazynie oraz tyle, ile było ich na starcie trybu zombie */
const dzidy = (o: OdczytCelow): { sa: number; start: number } => ({
  sa:
    o.st.pawns.filter((p) => p.kind === 'core' && p.weapon === 'dzida').length +
    (o.st.store.arms ?? []).filter((x) => x === 'dzida').length,
  start: [...START_KIT.zombie.core, ...START_KIT.zombie.store].filter((x) => x === 'dzida').length,
});

function dzidaJak(o: OdczytCelow): string {
  const { words: w, wordsEn: e, touch } = o;
  return L(
    `${touch ? 'Przytrzymajcie palec na stercie desek albo złomu' : 'Prawy przycisk na stercie desek albo złomu'}: „Zrobić dzidę” (${SPEAR_BOARDS} deski i ${SPEAR_SCRAP} złom). Dzida sięga szwendaczy przez siatkę. Deski i złom dają przeszukiwanie ${w.szukanie.d} i rozbiórka.`,
    `${touch ? 'Press and hold on a pile of planks or scrap' : 'Right-click a pile of planks or scrap'}: “Make a spear” (${manyEn(SPEAR_BOARDS, 'plank', 'planks')} and ${SPEAR_SCRAP} scrap). A spear reaches shamblers through the fence. Planks and scrap come from searching ${e.szukanie.d} and taking things apart.`,
  );
}

function drewnoNaNocJak(o: OdczytCelow): string {
  const { words: w, wordsEn: e, touch } = o;
  const mam = num(Math.floor(o.snap.stock.wood), 0);
  const trzeba = num(potrzebaDrewna(o.input), 0);
  if (zombieMode(o.st, o.gov))
    return L(
      `Drewna ${mam} z ${trzeba}, razem z tym w kozie. Za siatką są szwendacze: spalcie meble ${w.szukanie.w} („Spalić …”) albo idźcie po drzewo za dnia z dzidą, kiedy pod siatką jest pusto.`,
      `Wood: ${mam} of ${trzeba}, counting what’s in the stove. There are shamblers outside the fence: burn furniture ${e.szukanie.w} (“Burn the …”), or go for a tree by day with a spear when nobody is at the fence.`,
    );
  return L(
    `Drewna ${mam} z ${trzeba}, razem z tym w kozie: tyle zje noc od ${CARD_HOUR}:00 do ${MORNING}:00 przy dyżurze, sztuka na godzinę. ${
      touch ? 'Stuknijcie pień drzewa' : 'Prawy przycisk na drzewie: „Ściąć drzewo”'
    }; za dnia ${w.brama.m} stoi otwarta.`,
    `Wood: ${mam} of ${trzeba}, counting what’s in the stove: that’s what the night from ${CARD_HOUR}:00 to ${MORNING}:00 burns with a stove watch, one piece an hour. ${
      touch ? 'Tap the trunk of a tree' : 'Right-click a tree: “Chop down the tree”'
    }; ${e.brama} stays open by day.`,
  );
}

const R1: DefRozdzialu = {
  k: 'r1',
  tytul: () => L('Drugi dzień', 'Day two'),
  otwiera: poPierwszymRaporcie,
  cele: [
    {
      key: 'przeszukaj',
      tekst: (o) => L(`Przeszukajcie ${o.words.szukanie.b}.`, `Search ${o.wordsEn.szukanie.b}.`),
      jak: (o) =>
        o.touch
          ? L(o.words.szukanie.jak.dotyk, o.wordsEn.szukanie.jak.dotyk)
          : L(o.words.szukanie.jak.mysz, o.wordsEn.szukanie.jak.mysz),
      // co przeszukane, daje stan gry: mieszkania siedziby, a od fali 2 także pomieszczenia sąsiednich budynków
      zrobiony: (o) =>
        o.st.apts.some((a) => a.searched.length > 0) ||
        (o.st.sasiedzi?.budynki ?? []).some(
          (b) => b.przeszukane.length > 0 || b.mieszkania.some((m) => m.przeszukane.length > 0),
        ),
    },
    {
      key: 'budowla',
      tekst: () => L('Postawcie pierwszą budowlę.', 'Put up your first structure.'),
      jak: budowlaJak,
      zrobiony: (o) => o.st.things.some((t) => t.kind in BUILDS),
    },
    {
      key: 'obwod',
      // w trybie zombie siatka jest wzmocniona i bez dziur, a zasieki przed szwendaczami nie chronią lepiej niż ona:
      // zamiast obwodu dzida dla warty
      jest: (o) => !zombieMode(o.st, o.gov),
      tekst: () => L('Wzmocnijcie obwód.', 'Strengthen the perimeter.'),
      jak: obwodJak,
      zrobiony: (o) => o.st.things.some((t) => t.kind === 'zasieki') || o.snap.fence.holes.length === 0,
    },
    {
      key: 'dzida',
      jest: (o) => zombieMode(o.st, o.gov),
      tekst: () => L('Zróbcie dzidę dla warty.', 'Make a spear for the watch.'),
      jak: dzidaJak,
      zrobiony: (o) => {
        const d = dzidy(o);
        return d.sa > d.start;
      },
    },
    {
      key: 'drewno2',
      tekst: () => L('Zbierzcie drewno na całą noc.', 'Get in enough wood for the whole night.'),
      jak: drewnoNaNocJak,
      // rozstrzyga karta nocy: zaliczony, gdy karta pokazuje zapas równy potrzebie, przepadł, gdy zatwierdzona bez niego
      zrobiony: (o, s) => {
        const wood = kartaPoOtwarciu(o, s)?.card?.wood;
        return !!wood && wood.have >= wood.need;
      },
      przepadl: (o, s) => !!kartaPoOtwarciu(o, s)?.confirmed,
    },
    {
      key: 'dyzur',
      tekst: () => L('Dajcie komuś dyżur przy kozie.', 'Put someone on stove watch.'),
      jak: () =>
        L(
          'Na karcie nocy o 20:00 wybierzcie przy jednej osobie „Czuwa przy kozie”. Bez dyżuru koza gaśnie, kiedy wszyscy zasną.',
          'On the Night orders at 20:00, pick “Watches the stove” for one person. Without a stove watch the fire goes out once everyone is asleep.',
        ),
      okno: 'karta',
      // czeka do karty nocy; zaliczony przy zatwierdzeniu karty z `warta:koza`, przepadł przy zatwierdzeniu bez niego
      czeka: (o, s) => (kartaPoOtwarciu(o, s) ? null : L(`czeka do ${CARD_HOUR}:00`, `waiting for ${CARD_HOUR}:00`)),
      zrobiony: (o, s) => {
        const n = kartaPoOtwarciu(o, s);
        return !!n?.confirmed && maDyzur(n);
      },
      przepadl: (o, s) => !!kartaPoOtwarciu(o, s)?.confirmed,
    },
  ],
};

/** Rozdziały głównej ścieżki po kolei; dalsze (R2–R8) dochodzą w kolejnych zadaniach planu. */
export const ROZDZIALY: readonly DefRozdzialu[] = [R0, R1];
