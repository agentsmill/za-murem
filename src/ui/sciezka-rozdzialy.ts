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
   (plan nocy z tego samego dnia, ale sprzed wczytania gry, czeka na następną noc).

   R2 „Ludzie i noc” uczy listy ludzi (zdarzenie interfejsu `lista`), światła albo dzidy przez siatkę (zwykły tryb: ognisko
   płonące po 18:00 z `gov.evening.campfire`; zombie: pionek zarządu bijący z polecenia szwendacza, `job.order`) i uzbrojonej
   warty (zwykły tryb: broń u `min(2, osób)` osób; zombie: karta nocy zatwierdzona po otwarciu rozdziału z `min(2, osób)`
   przydziałami `warta:siatka` u osób z dzidą, czeka do karty, bez terminu).

   R4 „Zarząd” (w domu „Komitet”) uczy uchwał (podpis po otwarciu, czeka do zebrania; cel nie istnieje, gdy żadnej uchwały nie
   da się już podpisać ani po odnowieniu, chyba że jest zaliczony: stąd `jest(o, s)` ze stanem ścieżki), odczytu porannego
   raportu (obserwacja jak `sily`: raport po otwarciu rozdziału, jakkolwiek zmieniło się wkurzenie, bo o 6:00 rośnie ono
   prawie każdej nocy, a karty wydarzeń nie pokazują skutku dla niego; raport rozpoznaje się po dniu nocy, nie po numerze
   na liście, która ma sufit 10 wpisów; cel czeka do rana i nie bywa bieżący, więc jego podpowiedź się nie pokazuje, a lekcję
   niesie dopisek czekania „Raport rano. Wkurzenie spada, gdy ludzie są najedzeni i w cieple.”, ten sam w obu trybach),
   nowych ludzi (ludność większa niż przy otwarciu) i kart mieszkańców albo budynków (zdarzenie interfejsu). Wariant
   „ludzie” w bloku z mieszkańcami z generatora liczy tylko pionki `resident` z osobą, bo `snap.lokatorzy` ma też
   lokatorów sąsiednich budynków (pionki `sasiad` podczas spotkania), którzy nie powinni przestawiać tekstu w domu.

   R5 „Jedzenie” uczy mapy miasta (wyprawa dzienna w drodze, łup z miejsc z mapy większy niż przy otwarciu) i ogródka. Cele
   z mapy istnieją tylko w grze z oknem mapy miasta, które gra zgłasza flagą `OdczytCelow.mapaMiasta`: z `?miasto=0` i na
   osiedlu zapasowym bez położenia przycisku mapy nie ma, choć `gov.miasto` istnieje; bez flagi, w testach, decyduje
   `gov.miasto`. Rozdziały R2–R8 nie mają terminów: nic z nich nie przepada. R3 (praca ludzi) dochodzi po scaleniu
   `praca-ludzi`, więc po R2 otwiera się R4.

   R6 „Badania” uczy pracowni, wyboru badania na tablicy (linia celu w oknie tablicy), stołu pracowni, pierwszej technologii
   i kartki z ery 2. Cele badań istnieją tylko tam, gdzie osada ma dość wiedzy na kartkę ery 1 albo 2 (`mozeWziacKartke`:
   wiedza jak w `wiedza` z src/sim/badania.ts, ale z osobami na wyprawie), żeby zarząd bez fachu ery 1 nie utknął w rozdziale.
   R7 „Sąsiedzi” uczy pukania (praca przy drzwiach z pukaniem, wynik pukania albo spotkanie), rozmowy w oknie spotkania
   (zalicza się po jego zakończeniu, żeby linia celu była w tym oknie), wejścia do zamkniętego budynku i przeszukania
   pomieszczenia u sąsiada; rozdziału nie ma, gdy w 120 m od siedziby nie stoi ani blok, ani dom. R8 „Drogi do zwycięstwa” uczy
   ekranu dróg, kolejnego kamienia ludności (tekst to „co dalej” z chwili otwarcia rozdziału, bo `tekst` dostaje stan
   ścieżki) i, tam gdzie wspólny płot dosięga sąsiada, terenu (ten sam predykat `terenMozliwy` co ekran dróg). Po R8 okienko
   pokazuje wiersze dróg z „co dalej” (`wierszeDrog`).

   Liczniki „od otwarcia” (`StanSciezki.start`) liczą stąd funkcje `uchwalyPodpisane`, `ludnoscPodZarzadem` i `lupZMiasta`:
   te same wyrażenia czyta `licznikiStartu` w chwili otwarcia rozdziału (src/ui/sciezka.ts) i warunki celów w chwili
   sprawdzenia, więc obie strony porównania nie rozjadą się. */

import { L, tr } from '../core/jezyk.ts';
import { placeOfWorld, sasiedzi, type Words, type WordsEn } from '../gov/miejsce.ts';
import { CARD_HOUR, KOZA_KEY, MORNING, WOOD_PER_HOUR } from '../gov/noc.ts';
import type { GovInput, GovState, NightPlan, NightReport } from '../gov/typy.ts';
import { lawOptions } from '../gov/uchwaly.ts';
import { atHour } from '../gov/wspolne.ts';
import { LAW_HOUR, LAW_MINUTE } from '../gov/zarzad.ts';
import { DALEJ_TEREN, ocenDrogi, type PostepDrogi, terenMozliwy } from '../gov/zwyciestwo.ts';
import { nazwaTech, TECH_BY, TECHS, wiedza } from '../sim/badania.ts';
import { START_KIT } from '../sim/bron.ts';
import { BUILDS_EN } from '../sim/budowle.en.ts';
import { BUILDS } from '../sim/budowle.ts';
import { minutesAt } from '../sim/clock.ts';
import { CAMPFIRE_WOOD, PATCH_COST, type SimState, SPEAR_BOARDS, SPEAR_SCRAP } from '../sim/sim.ts';
import { populacja } from '../sim/snapshot.ts';
import { modeOf } from '../sim/tryb.ts';
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

/* ---------------------------------------------------------------- liczniki „od otwarcia” */

/** Podpisane uchwały bez cofniętych (wpis z `false` się nie liczy); zero bez zarządu. To samo wyrażenie liczy
    `licznikiStartu` w chwili otwarcia rozdziału i cel `uchwala` w chwili sprawdzenia. W grze `signed` ma tylko wartości
    `true`, więc to samo daje `Object.keys(gov.laws.signed).length` z projektu. */
export const uchwalyPodpisane = (gov: GovState | null): number =>
  gov ? Object.values(gov.laws.signed).filter(Boolean).length : 0;

/** Ludność pod zarządem: zarząd i mieszkańcy (`populacja`, ta sama liczba co `GovInput.ludnosc`, czyli `ludnoscOf`
    z dróg do zwycięstwa). Zmiany po otwarciu rozdziału widać tylko jako różnicę z liczbą z chwili otwarcia. */
export const ludnoscPodZarzadem = (st: SimState): number => populacja(st).razem;

/** Łup zabrany z miejsc z mapy miasta (suma `gov.miasto.zabrano`, dzienne i nocne wyprawy); zero bez mapy miasta. */
export const lupZMiasta = (gov: GovState | null): number =>
  Object.values(gov?.miasto?.zabrano ?? {}).reduce((suma, n) => suma + n, 0);

/** Czy zdarzenie interfejsu (lista ludzi, karta mieszkańca, karta budynku, ekran dróg) zdarzyło się od otwarcia rozdziału.
    Liczy się też zdarzenie w tym samym ticku co otwarcie: na pauzie tick stoi, a kliknięcie zaraz po otwarciu rozdziału
    ma ten sam numer. */
const zdarzeniePoOtwarciu = (s: StanSciezki, k: keyof StanSciezki['ui']): boolean => {
  const tick = s.ui[k];
  return tick !== undefined && tick >= s.od;
};

/** cel nocy czeka do karty, która powstała po otwarciu rozdziału (jak dyżur przy kozie w R1) */
const czekaDoKarty = (o: OdczytCelow, s: StanSciezki): string | null =>
  kartaPoOtwarciu(o, s) ? null : L(`czeka do ${CARD_HOUR}:00`, `waiting for ${CARD_HOUR}:00`);

/** dwie osoby, a w mniejszym zarządzie tyle, ile osób jest (progi celów R2) */
const dwieOsoby = (o: OdczytCelow): number => Math.min(2, o.snap.people.length);

/* ---------------------------------------------------------------- R2. Ludzie i noc */

/** klucz przydziału na karcie nocy: warta przy siatce (tylko w trybie zombie) */
const SIATKA_KEY = 'warta:siatka';

/** ktoś z zarządu bije z polecenia gracza szwendacza (polecenie `attack` zakłada pracę `fight` z `order`; bez polecenia
    walczy warta albo ktoś zaatakowany) */
const bijeSzwendacza = (o: OdczytCelow): boolean =>
  o.st.pawns.some((p) => {
    const j = p.job;
    return (
      p.kind === 'core' &&
      j?.t === 'fight' &&
      j.order &&
      o.st.pawns.some((q) => q.id === j.target && q.kind === 'zombie')
    );
  });

const R2: DefRozdzialu = {
  k: 'r2',
  tytul: () => L('Ludzie i noc', 'People and the night'),
  cele: [
    {
      key: 'sily',
      tekst: () => L('Sprawdźcie, kto ma siły na noc.', 'Check who has the energy for tonight.'),
      jak: (o) =>
        o.touch
          ? L(
              'Stuknijcie portret na liście pod paskiem: karta pokaże siły tej osoby.',
              'Tap a portrait in the row under the top bar: the card shows that person’s Energy.',
            )
          : L(
              'Kliknijcie portret na liście pod paskiem: karta pokaże siły tej osoby. Klawisze Q i E przełączają ludzi po kolei.',
              'Click a portrait in the row under the top bar: the card shows that person’s Energy. Keys Q and E step through your people.',
            ),
      zrobiony: (_o, s) => zdarzeniePoOtwarciu(s, 'lista'),
    },
    {
      key: 'ognisko',
      // w trybie zombie światło nocą przyciąga szwendaczy, więc zamiast ogniska dźgnięcie szwendacza przez siatkę
      jest: (o) => !zombieMode(o.st, o.gov),
      tekst: () => L('Rozpalcie ognisko na podwórku.', 'Light a campfire in the yard.'),
      jak: (o) =>
        L(
          `${o.touch ? 'Przytrzymajcie palec' : 'Prawy przycisk'} na wolnym miejscu podwórka: „Rozpalić ognisko tutaj” (${num(CAMPFIRE_WOOD, 0)} drewna). Światło przy siatce płoszy szabrowników i pomaga warcie ich zobaczyć, a wieczór przy ogniu łagodzi wkurzenie. Warta ${o.words.brama.przy} też ma lampę. Liczy się ognisko, które płonie wieczorem.`,
          `${o.touch ? 'Press and hold on' : 'Right-click'} a free spot in the yard: “Light a campfire here” (${num(CAMPFIRE_WOOD, 0)} wood). Light by the fence scares looters off and helps the watch see them, and an evening by the fire takes the edge off the anger. A guard at ${o.wordsEn.brama} carries a lamp too. It counts when the fire is burning in the evening.`,
        ),
      // flagę zarządu ustawia ognisko, które płonie po 18:00; zeruje ją raport rano
      zrobiony: (o) => !!o.gov?.evening.campfire,
    },
    {
      key: 'dzgnij',
      jest: (o) => zombieMode(o.st, o.gov),
      tekst: () => L('Dźgnijcie szwendacza przez siatkę.', 'Spear a shambler through the fence.'),
      jak: (o) =>
        L(
          `${o.touch ? 'Stuknijcie osobę z dzidą i przytrzymajcie palec' : 'Zaznaczcie osobę z dzidą i prawy przycisk'} na szwendaczu przy siatce: „Atakuj szwendacza”. Dzida sięga przez siatkę; strzał zabija od razu, ale ściąga następnych.`,
          `${o.touch ? 'Tap someone with a spear and press and hold on' : 'Select someone with a spear and right-click'} a shambler at the fence: “Attack the shambler”. A spear reaches through the fence; a shot kills outright but draws more of them.`,
        ),
      // chwilowy stan: praca w toku, zaliczana, gdy okienko ją zobaczy
      zrobiony: bijeSzwendacza,
    },
    {
      key: 'uzbrojeni',
      jest: (o) => !zombieMode(o.st, o.gov),
      tekst: () => L('Dajcie broń drugiej osobie.', 'Arm a second person.'),
      jak: (o) =>
        L(
          `Na karcie osoby bez broni ${o.touch ? 'stuknijcie' : 'kliknijcie'} „Zmień”: weźmie nóż albo łom z magazynu. Uzbrojona warta broni się lepiej i karta nocy to liczy.`,
          `On the card of someone without a weapon, ${o.touch ? 'tap' : 'click'} “Swap”: they take the knife or the crowbar from the storeroom. An armed watch holds out better, and the Night orders count it.`,
        ),
      zrobiony: (o) => o.snap.people.filter((p) => p.weapon).length >= dwieOsoby(o),
    },
    {
      key: 'dzidy',
      jest: (o) => zombieMode(o.st, o.gov),
      tekst: () => L('Postawcie na noc dwie dzidy przy siatce.', 'Put two spears on watch at the fence tonight.'),
      jak: () =>
        L(
          'Na karcie nocy wybierzcie „Warta przy siatce” dwóm osobom z dzidą. Drugą dzidę da „Zmień” na karcie osoby (zapasowa z magazynu) albo „Zrobić dzidę”.',
          'On the Night orders, pick “Watch at the fence” for two people with spears. A second spear comes from “Swap” on a person’s card (the spare in the storeroom) or from “Make a spear”.',
        ),
      okno: 'karta',
      // czeka do karty nocy; bez terminu: próba co noc, aż dwie dzidy staną przy siatce
      czeka: czekaDoKarty,
      zrobiony: (o, s) => {
        const n = kartaPoOtwarciu(o, s);
        if (!n?.confirmed) return false;
        const straz = o.snap.people.filter((p) => n.assign?.[p.id] === SIATKA_KEY && p.weapon === 'dzida');
        return straz.length >= dwieOsoby(o);
      },
    },
  ],
};

/* ---------------------------------------------------------------- R4. Zarząd */

const wielka = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Raporty rano, które powstały po otwarciu rozdziału. Raport za noc `day` powstaje o MORNING dnia `day + 1` (`nightTick`
    w src/gov/noc.ts), więc liczy się, gdy ta minuta przypada ściśle po minucie otwarcia rozdziału: raport z tej samej
    minuty co otwarcie (kto zamknął poranny raport i w tym samym ticku otworzył rozdział) jest już obejrzany. Raportów nie
    liczy się od numeru na liście (`start.raporty`): `gov.reports` ma najwyżej 10 wpisów i najstarszy wypada, więc od 11. nocy
    `slice(start.raporty)` byłby zawsze pusty, a cel czekałby na zawsze. Raport powstały po otwarciu rozdziału w minucie jego
    godziny (do półtorej minuty gry przy tempie 1×, do 12 minut przy 8×, bo zarząd liczy się raz na sekundę przy ekranie)
    zalicza się dopiero następnego ranka. */
const raportyPoOtwarciu = (o: OdczytCelow, s: StanSciezki): NightReport[] =>
  (o.gov?.reports ?? []).filter((r) => atHour(r.day + 1, MORNING) > minutesAt(s.od));

/** Czy siedziba ma mieszkańców z osobą z generatora (pionki `resident`). Nie `snap.lokatorzy`: ta lista ma też lokatorów
    sąsiednich budynków (pionki `sasiad` w trakcie spotkania), a tekst celu nie może przeskakiwać z domu na blok. */
const maMieszkancow = (o: OdczytCelow): boolean =>
  o.st.pawns.some((p) => p.kind === 'resident' && p.person >= 0 && !!o.st.people[p.person]);

/** „19:30” z godziny i minuty zebrania zarządu */
const godzinaZebrania = `${LAW_HOUR}:${String(LAW_MINUTE).padStart(2, '0')}`;

/** Czy jakąś uchwałę da się jeszcze podpisać, teraz (`ok`) albo po odnowieniu (`cd`). Zebranie zarząd zwołuje tylko wtedy,
    gdy coś jest `ok` (`govUpdate` w src/gov/zarzad.ts), a z jednej drogi da się podpisać najwyżej cztery z sześciu uchwał,
    więc potem cel „podpiszcie uchwałę” czekałby na zebranie, które nigdy nie przyjdzie. Bez zarządu i jego wejścia (atrapa
    w testach) nie wiadomo, więc cel zostaje. */
const mozeJeszczeUchwalic = (o: OdczytCelow): boolean =>
  !o.gov || !o.input || lawOptions(o.gov, o.input).some((x) => x.s === 'ok' || x.s === 'cd');

/** podpisano uchwałę po otwarciu rozdziału (to samo wyrażenie co w `zrobiony` celu `uchwala` i w jego `jest`) */
const podpisanoPoOtwarciu = (o: OdczytCelow, s: StanSciezki): boolean => uchwalyPodpisane(o.gov) > s.start.uchwaly;

const R4: DefRozdzialu = {
  k: 'r4',
  tytul: (o) => L(wielka(o.words.zarzad.krotko), wielka(o.wordsEn.krotko)),
  cele: [
    {
      key: 'uchwala',
      // nie istnieje, gdy nie ma już czego podpisać; zaliczony (także przez ostatnią podpisaną uchwałę, zanim krok zdążył to
      // zapisać) zostaje na liście
      jest: (o, s) => Object.hasOwn(s.zrobione, 'r4.uchwala') || podpisanoPoOtwarciu(o, s) || mozeJeszczeUchwalic(o),
      tekst: () => L('Podpiszcie kolejną uchwałę.', 'Pass another resolution.'),
      jak: (o) =>
        L(
          `Zebranie ${o.words.zarzad.dk} o ${godzinaZebrania}, kiedy minie półtorej doby od poprzedniej uchwały. Drogi porządku i wspólnoty się wykluczają: pierwsza uchwała z jednej zamyka drugą.`,
          `${o.wordsEn.Zarzad} meets at ${godzinaZebrania} once a day and a half has passed since the last resolution. The Order and Community paths rule each other out: the first resolution on one closes the other.`,
        ),
      okno: 'uchwala',
      // czeka do zebrania (okno uchwały otwiera się o 19:30, o ile odnowienie pozwala)
      czeka: (o) => (o.gov?.lawPending ? null : L('czeka do zebrania', 'waiting for the meeting')),
      zrobiony: podpisanoPoOtwarciu,
    },
    {
      key: 'wkurzenie',
      tekst: () =>
        L(
          'Sprawdźcie rano w raporcie, jak zmieniło się wkurzenie.',
          'Check in the Morning report how the anger moved.',
        ),
      jak: (o) => {
        // w trybie zombie bez ogniska wieczorem: R2 każe tam unikać światła nocą
        const ognisko = !zombieMode(o.st, o.gov);
        return L(
          `Raport rano pokazuje, jak zmieniło się zaufanie i wkurzenie. Wkurzenie spada, gdy ludzie są najedzeni i w cieple${
            ognisko ? ', a wieczorem pali się ognisko' : ''
          }; rośnie od zimna, głodu, palenia mebli, napadów i zgonów. Przy pełnym wkurzeniu ${o.words.walne} odwoła ${o.words.zarzad.krotko}.`,
          `The Morning report shows how trust and anger moved. Anger drops when people are fed and warm${
            ognisko ? ' and a campfire burns in the evening' : ''
          }; it rises with cold, hunger, burnt furniture, raids and deaths. At full anger ${o.wordsEn.walne} votes ${o.wordsEn.krotko} out.`,
        );
      },
      // obserwacja jak `sily`: zalicza poranny raport po otwarciu rozdziału, jakkolwiek zmieniło się wkurzenie (o 6:00 rośnie
      // ono prawie każdej nocy, a karty wydarzeń nie pokazują skutku dla niego, więc gracz nie ma na nie dźwigni). Do raportu
      // cel czeka (nie bywa bieżący, więc jego podpowiedź się nie pokazuje), a lekcję niesie dopisek czekania, ten sam
      // w obu trybach: bez ogniska, bo w zombie R2 każe unikać światła nocą
      czeka: (o, s) =>
        raportyPoOtwarciu(o, s).length
          ? null
          : L(
              'Raport rano. Wkurzenie spada, gdy ludzie są najedzeni i w cieple.',
              'Morning report. Anger drops when people are fed and warm.',
            ),
      zrobiony: (o, s) => raportyPoOtwarciu(o, s).length > 0,
    },
    {
      key: 'nowi',
      tekst: () => L('Przyjmijcie kogoś nowego.', 'Take someone new in.'),
      jak: (o) =>
        L(
          `Ludzi przyprowadzają karty wydarzeń: „Przyjąć wszystkich”, „Wciągnąć do roboty”. Przyjęci idą od ${o.words.brama.d}, a „Pokaż” w komunikacie pokaże ich na mapie. Każdy nowy to ręce do pracy i usta do wykarmienia.`,
          `Event cards bring people to you: “Take everyone in”, “Put him to work”. Newcomers walk in from ${o.wordsEn.brama}, and “Show” on the notice points them out on the map. Every newcomer is a pair of hands and another mouth to feed.`,
        ),
      // zgon w międzyczasie tylko opóźnia cel: liczy się ludność większa niż przy otwarciu
      zrobiony: (o, s) => ludnoscPodZarzadem(o.st) > s.start.ludnosc,
    },
    {
      key: 'ludzie',
      tekst: (o) =>
        maMieszkancow(o)
          ? L('Poznajcie mieszkańców siedziby.', 'Meet the residents of your block.')
          : L('Poznajcie sąsiadów zza płotu.', 'Get to know the neighbours over the fence.'),
      jak: (o) =>
        maMieszkancow(o)
          ? L(
              `${o.touch ? 'Stuknijcie' : 'Kliknijcie'} mieszkańca na podwórku albo w mieszkaniu, kiedy nikt nie jest zaznaczony: karta powie, kim jest i z kim mieszka. Mieszkańcy są wymyśleni.`,
              `${o.touch ? 'Tap' : 'Click'} a resident in the yard or in a flat while nobody is selected: the card tells you who they are and who they live with. The residents are made up.`,
            )
          : L(
              `${o.touch ? 'Stuknijcie' : 'Kliknijcie'} sąsiedni dom, kiedy nikt nie jest zaznaczony: karta powie, kogo z nich znacie i jak się do nich dostać.`,
              `${o.touch ? 'Tap' : 'Click'} a house next door while nobody is selected: the card tells you which neighbours you know and how to get in.`,
            ),
      // karta mieszkańca albo karta cudzego budynku: zależy od tego, co gracz kliknął, a nie od wariantu tekstu
      zrobiony: (_o, s) => zdarzeniePoOtwarciu(s, 'mieszkaniec') || zdarzeniePoOtwarciu(s, 'budynek'),
    },
  ],
};

/* ---------------------------------------------------------------- R5. Jedzenie */

/** Gra ma okno mapy miasta, więc cele z mapy mają sens. Gra mówi to flagą `mapaMiasta` w odczycie (z `?miasto=0` i na osiedlu
    zapasowym bez położenia przycisku mapy nie ma, choć `gov.miasto` istnieje); bez flagi (testy) decyduje `gov.miasto`. */
const zMapaMiasta = (o: OdczytCelow): boolean => o.mapaMiasta ?? !!o.gov?.miasto;

/** „Budowa” albo, na dotyku, „Przycisk Budowa u góry” (jak w celu obwodu) */
const budowaZakladka = (touch: boolean): string =>
  touch ? L('Przycisk Budowa u góry', 'The Build button at the top') : L('Budowa', 'Build');

const R5: DefRozdzialu = {
  k: 'r5',
  tytul: () => L('Jedzenie', 'Food'),
  cele: [
    {
      key: 'wyprawa',
      jest: zMapaMiasta,
      tekst: () => L('Wyślijcie wyprawę z mapy miasta.', 'Send a supply run from the city map.'),
      jak: (o) => {
        const zombie = zombieMode(o.st, o.gov);
        return L(
          `${o.touch ? 'Mapa miasta (przycisk u góry): stuknięcie' : 'Mapa miasta (przycisk u góry albo M): klik'} w miejsce, na jego karcie „Wyślij wyprawę”, wybierzcie osoby i potwierdźcie. Tylko za dnia, od ${MORNING}:00 do ${CARD_HOUR}:00; ryzyko i łup widać przed wyjściem.${
            zombie ? ' Za siatką są szwendacze: ryzyko jest większe, a kłopoty bywają ugryzieniem.' : ''
          }`,
          `${o.touch ? 'City map (button at the top): tap' : 'City map (button at the top, or M): click'} a place, then “Send a supply run” on its card, pick the people and confirm. By day only, from ${MORNING}:00 to ${CARD_HOUR}:00; you see the risk and the haul before they leave.${
            zombie ? ' There are shamblers out there: the risk is higher, and trouble can mean a bite.' : ''
          }`,
        );
      },
      // chwilowy stan: wyprawa dzienna w drodze, zaliczana, gdy okienko ją zobaczy
      zrobiony: (o) => !!o.gov?.wyprawy?.length,
    },
    {
      key: 'lup',
      jest: zMapaMiasta,
      tekst: () => L('Przynieście łup z wyprawy.', 'Bring back loot from a run.'),
      jak: () =>
        L(
          'Wyprawa wraca sama o godzinie z karty miejsca. Ranni wracają z ranami, więc posyłajcie wypoczętych i uzbrojonych. Na karcie nocy wyprawa idzie po zmroku: „Wyprawa blisko” jest bezpieczniejsza, „daleko” przynosi więcej.',
          'The run comes back on its own at the time shown on the place card. The hurt come back hurt, so send rested, armed people. On the Night orders a run goes out after dark: a short run is safer, a long one brings back more.',
        ),
      // liczy też wyprawy nocne do miejsc z mapy: łup z obu idzie do `gov.miasto.zabrano`
      zrobiony: (o, s) => lupZMiasta(o.gov) > s.start.lup,
    },
    {
      key: 'ogrodek',
      tekst: () => L('Postawcie ogródek.', 'Put in a vegetable patch.'),
      jak: (o) => {
        const koszt = costText(BUILDS.ogrodek.cost);
        const b = budowaZakladka(o.touch);
        return L(
          `${b}, zakładka Podwórko: ${BUILDS.ogrodek.name} (${koszt}) na wolnym kawałku podwórka. Po kilku dniach daje jedzenie, jesienią mało.`,
          `${b}, Yard tab: ${BUILDS_EN.ogrodek.name} (${koszt}) on a free bit of the yard. It grows food after a few days; not much in autumn.`,
        );
      },
      zrobiony: (o) => o.st.things.some((t) => t.kind === 'ogrodek'),
    },
  ],
};

/* ---------------------------------------------------------------- R6. Badania */

/** Czy osada ma dość wiedzy, żeby wziąć którąkolwiek kartkę ery `era` w tym trybie gry (`TechNowa.lvl` w jej dziedzinie).
    Liczy `wiedza` z src/sim/badania.ts, ale z osobami na wyprawie: `wiedza` ich nie liczy, a wyprawa mija, więc przez nią
    cele badań nie mogą znikać z listy ani zamykać rozdziału, gdy to ona zna dziedzinę. Cel nie istnieje tylko wtedy, gdy
    wiedzy naprawdę nie ma (zarząd z samych zawodów bez dziedzin ery 1, bez książek). */
function mozeWziacKartke(st: SimState, era: number): boolean {
  const mode = modeOf(st);
  const naMiejscu = st.pawns.some((p) => p.away)
    ? { ...st, pawns: st.pawns.map((p) => (p.away ? { ...p, away: false } : p)) }
    : st;
  return TECHS.some(
    (t) => t.era === era && t.dziala && (t.tryb === undefined || t.tryb === mode) && wiedza(naMiejscu, t.dom) >= t.lvl,
  );
}

/** coś jest już zbadane (technologia w `techDone` albo wpis w `research.at`) */
const zbadanoCos = (st: SimState): boolean =>
  (st.techDone?.length ?? 0) > 0 || Object.keys(st.research?.at ?? {}).length > 0;

/** Postęp w jakimkolwiek badaniu: zapisany postęp większy od zera (zostaje po ukończeniu badania). */
const jestPostepBadania = (st: SimState): boolean => Object.values(st.research?.prog ?? {}).some((v) => v > 0);

/** Praca nad technologią z ery 2: postęp albo ukończenie (identyfikatory spoza drzewka się nie liczą). */
function era2Ruszyla(st: SimState): boolean {
  const era2 = (id: string): boolean => Object.hasOwn(TECH_BY, id) && TECH_BY[id].era === 2;
  return Object.entries(st.research?.prog ?? {}).some(([id, v]) => v > 0 && era2(id)) || (st.techDone ?? []).some(era2);
}

/** `jest` celu badań: istnieje, gdy osada może wziąć kartkę ery `era`, a także wtedy, gdy cel jest już zaliczony albo jego
    warunek już prawdziwy (cel nie znika, kiedy wiedza spadnie po tym, jak się spełnił). Gdy nikt nie zna żadnej dziedziny
    ery 1 (własny zarząd z samych programistów i kurierów, bez książek i lokatorów z wiedzą), cele badań nie blokują
    ścieżki, bo nie da się ich zrobić. */
const jestGdyMoznaBadac =
  (klucz: string, era: 1 | 2, warunek: (st: SimState) => boolean) =>
  (o: OdczytCelow, s: StanSciezki): boolean =>
    Object.hasOwn(s.zrobione, klucz) || warunek(o.st) || mozeWziacKartke(o.st, era);

/** „naszego mieszkania” ze słownika (`Words.lokal.d`) jako „waszego mieszkania”: cele mówią do zarządu na „wy”, jak zdanie
    „co dalej” drogi technologii (src/gov/zwyciestwo.ts); w domu „waszego domu” */
const waszeLokum = (w: Words): string => w.lokal.d.replace(/^naszego /, 'waszego ');

const R6: DefRozdzialu = {
  k: 'r6',
  tytul: () => L('Badania', 'Research'),
  cele: [
    {
      key: 'pracownia',
      tekst: () => L('Postawcie pracownię.', 'Build a research room.'),
      jak: (o) => {
        const koszt = costText(BUILDS.pracownia.cost);
        const b = budowaZakladka(o.touch);
        return L(
          `${b}, zakładka Dom: ${BUILDS.pracownia.name} (${koszt}) w pokoju ${waszeLokum(o.words)}. Części dają przeszukiwanie i warsztat („Zrobić część ze złomu”).`,
          `${b}, Home tab: ${BUILDS_EN.pracownia.name} (${koszt}) in a room of ${o.wordsEn.lokal.w}. Parts come from searching and from the workshop (“Make a part from scrap”).`,
        );
      },
      // postawiona wcześniej zalicza od razu przy otwarciu rozdziału; sam plan budowy nie wystarcza
      zrobiony: (o) => o.st.things.some((t) => t.kind === 'pracownia'),
    },
    {
      key: 'badanie',
      jest: jestGdyMoznaBadac('r6.badanie', 1, (st) => !!st.research?.cur || zbadanoCos(st)),
      tekst: () => L('Wybierzcie pierwsze badanie.', 'Pick your first research.'),
      jak: (o) =>
        L(
          `Tablica badań otwiera się sama, kiedy pracownia stanie, potem pod przyciskiem Badania${
            o.touch ? '' : ' albo T'
          }. ${o.touch ? 'Stuknięcie' : 'Klik'} w kartkę, potem „Badać”.`,
          `The Research board opens by itself once the research room stands; later it’s under the Research button${
            o.touch ? '' : ', or T'
          }. ${o.touch ? 'Tap' : 'Click'} a card, then “Research”.`,
        ),
      okno: 'tablica',
      // wybrane badanie albo już coś zbadane (stan gry, więc wybór sprzed otwarcia rozdziału zalicza od razu)
      zrobiony: (o) => !!o.st.research?.cur || zbadanoCos(o.st),
    },
    {
      key: 'stol',
      jest: jestGdyMoznaBadac('r6.stol', 1, jestPostepBadania),
      tekst: () => L('Posadźcie kogoś przy stole pracowni.', 'Sit someone at the research table.'),
      jak: (o) => {
        // nazwa bieżącego badania jak w menu pracowni („Badać: …”); bez wyboru (gracz go zdjął) wielokropek
        const cur = o.st.research?.cur;
        const nazwa = cur && Object.hasOwn(TECH_BY, cur) ? nazwaTech(cur) : null;
        return L(
          `${o.touch ? 'Stuknijcie osobę i przytrzymajcie palec' : 'Zaznaczcie osobę i prawy przycisk'} na pracowni: „Badać: ${
            nazwa?.pl ?? '…'
          }”. Najszybciej bada ktoś, kto zna dziedzinę kartki; przy stole są dwa miejsca, a ${o.words.mieszkancy.m} z wiedzą siadają sami.`,
          `${o.touch ? 'Tap a person and press and hold on' : 'Select a person and right-click'} the research room: “Research: ${
            nazwa?.en ?? '…'
          }”. Someone who knows the card’s field is fastest; the table has two seats, and ${o.wordsEn.mieszkancy} who know the field sit down on their own.`,
        );
      },
      // postęp jakiegokolwiek badania (siedzi przy stole co najmniej chwilę); zostaje w stanie po ukończeniu badania
      zrobiony: (o) => jestPostepBadania(o.st),
    },
    {
      key: 'odkrycie',
      jest: jestGdyMoznaBadac('r6.odkrycie', 1, (st) => Object.keys(st.research?.at ?? {}).length > 0),
      tekst: () => L('Zbadajcie pierwszą technologię.', 'Finish your first research.'),
      jak: () =>
        L(
          'Karta „Odkrycie” powie, co daje; nowe budowle mają w Budowie znaczek NOWE. Książki znalezione przy przeszukiwaniu dokładają wiedzy.',
          'The Discovery card tells you what it gives you; new structures are marked NEW in Build. Books found while searching add to what you know.',
        ),
      zrobiony: (o) => Object.keys(o.st.research?.at ?? {}).length > 0,
    },
    {
      key: 'era2',
      // kartka ery 2 wymaga w swojej dziedzinie wiedzy 2, a nie tylko zbadanej technologii z ery 1: bez takiej wiedzy cel
      // nie istnieje (każda kartka ery 2 wymaga technologii z tej samej dziedziny, więc wiedza 2 wystarcza na całą drogę)
      jest: jestGdyMoznaBadac('r6.era2', 2, era2Ruszyla),
      tekst: () => L('Zacznijcie badanie z ery 2.', 'Start a research from era 2.'),
      jak: () =>
        L(
          'Kolumny tablicy to ery. Kartka z ery 2 da się wziąć, kiedy zbadacie technologię, której wymaga (nitka na tablicy). Ery 3–6 czekają na prąd.',
          'The board’s columns are eras. An era 2 card can be taken once you finish the technology it needs (the thread on the board). Eras 3–6 are waiting for power.',
        ),
      zrobiony: (o) => era2Ruszyla(o.st),
    },
  ],
};

/* ---------------------------------------------------------------- R7. Sąsiedzi */

/** sąsiedzi stoją w domach, a nie w blokach: tak samo jak rozstrzyga o tym słownik (`Words.sasiad`), według sąsiadów, a w
    samotnym miejscu według siedziby */
function sasiedziWDomach(o: OdczytCelow): boolean {
  const p = placeOfWorld(o.w);
  const s = sasiedzi(p);
  return s === 'domy' || (s === null && p.kind === 'dom');
}

/** napisy, które zostawia sama próba zapukania, gdy nikt nie otwiera („Nikt nie otwiera”, „Ktoś jest, ale nie otwiera”,
    szuranie za drzwiami; `Sim.pukanie`); inne napisy sąsiadów (zamek, ostrzeżenie, wynik spotkania) pukaniem nie są */
const WYNIKI_PUKANIA: ReadonlySet<string> = new Set(['nikt', 'ktos', 'szuranie']);

const R7: DefRozdzialu = {
  k: 'r7',
  tytul: () => L('Sąsiedzi', 'Neighbours'),
  // bez bloku ani domu w 120 m od siedziby (`GovPlace.near`) nie ma do kogo pukać: rozdziału nie ma, a ścieżka idzie dalej
  jest: (o) => sasiedzi(placeOfWorld(o.w)) !== null,
  cele: [
    {
      key: 'pukanie',
      tekst: () => L('Zapukajcie do sąsiadów.', 'Knock on the neighbours’ door.'),
      jak: (o) => {
        const dom = sasiedziWDomach(o);
        const zombie = zombieMode(o.st, o.gov);
        return L(
          `${o.touch ? 'Stuknijcie kogoś i przytrzymajcie palec' : 'Zaznaczcie kogoś i prawy przycisk'} na drzwiach sąsiedniego ${
            dom ? 'domu' : 'bloku'
          }: „Zapukać”. Za dnia ludzie bywają w domu, nocą otwierają niechętnie.${
            zombie ? ' Za siatką są szwendacze: idźcie za dnia, z dzidą.' : ''
          }`,
          `${o.touch ? 'Tap someone and press and hold on' : 'Select someone and right-click'} the door of the ${
            dom ? 'house' : 'block'
          } next door: “Knock”. By day people tend to be in; at night they’re slow to open.${
            zombie ? ' There are shamblers out there: go by day, with a spear.' : ''
          }`,
        );
      },
      // Praca przy drzwiach z pukaniem trwa od polecenia do skutku (dojście, pukanie), więc okienko ją zobaczy. Krótką pracę
      // (osoba stoi już pod drzwiami, szybkie tempo) mogłoby ominąć, więc liczy się też jej trwały ślad w stanie: spotkanie
      // po pukaniu i napis z wynikiem pukania, który zostaje do następnego napisu.
      zrobiony: (o, s) => {
        const sas = o.st.sasiedzi;
        return (
          o.st.pawns.some((p) => p.kind === 'core' && p.job?.t === 'door' && p.job.what === 'knock') ||
          (sas?.nr ?? 0) > s.start.spotkania ||
          (!!sas?.napis && WYNIKI_PUKANIA.has(sas.napis.co) && sas.napis.tick >= s.od)
        );
      },
    },
    {
      key: 'spotkanie',
      tekst: (o) =>
        sasiedziWDomach(o)
          ? L('Porozmawiajcie z sąsiadami.', 'Talk to the neighbours.')
          : L('Porozmawiajcie z lokatorami.', 'Talk to the residents next door.'),
      jak: () =>
        L(
          'Kiedy ktoś otworzy, okno spotkania pokaże, kto stoi w drzwiach i co o was myśli: „Porozmawiać”, „Dać jedzenie (2 porcje)”, „Zaprosić do nas (… szans)”. Kto was zna, chętniej pomoże.',
          'When someone opens up, the meeting window shows who is at the door and what they think of you: “Talk”, “Give them 2 food”, “Invite them to join you (… chance)”. People who know you are more willing to help.',
        ),
      okno: 'spotkanie',
      // Licznik spotkań rośnie z początkiem spotkania, a liczą się tylko te po otwarciu rozdziału. Cel zalicza się dopiero,
      // gdy spotkanie się skończy (gracz wybrał, okno zniknęło): inaczej zaliczałby się w chwili, w której otwiera się okno
      // spotkania, i linia „Cel: …” w tym oknie nigdy by się nie pokazała.
      zrobiony: (o, s) => (o.st.sasiedzi?.nr ?? 0) > s.start.spotkania && !o.st.sasiedzi?.spotkanie,
    },
    {
      key: 'wejscie',
      tekst: () => L('Wejdźcie do zamkniętego budynku.', 'Get into a closed-up building.'),
      jak: (o) => {
        const dom = sasiedziWDomach(o);
        const zombie = zombieMode(o.st, o.gov);
        return L(
          `${o.touch ? 'Przytrzymajcie palec' : 'Prawy przycisk'} na drzwiach: „Otworzyć drzwi”, a zamknięte na klucz „Wyważyć drzwi” (głośno${
            zombie ? ' i ściąga szwendaczy' : ''
          }). ${dom ? 'Pusty dom to łup bez awantury.' : 'Pusty budynek albo mieszkanie bez lokatorów to łup bez awantury.'}`,
          `${o.touch ? 'Press and hold on' : 'Right-click'} a door: “Open the door”, and if it’s locked, “Force the door” (loud${
            zombie ? ', and it draws shamblers' : ''
          }). ${dom ? 'An empty house means loot without a row.' : 'An empty building, or a flat with nobody home, means loot without a row.'}`,
        );
      },
      // budynek, którego wnętrze jest dołączone do mapy (drzwi otwarte albo wyważone)
      zrobiony: (o) => (o.st.sasiedzi?.budynki ?? []).some((b) => b.otwarty),
    },
    {
      key: 'szaber',
      tekst: () => L('Przeszukajcie pomieszczenie u sąsiadów.', 'Search a room next door.'),
      jak: (o) => {
        const dom = sasiedziWDomach(o);
        // w domu bez zdania o piętrze: słowa z bloku (piętro) są zakazane w tekstach dla domu jednorodzinnego
        return L(
          `W otwartym ${dom ? 'domu' : 'budynku'} ${o.touch ? 'przytrzymajcie palec' : 'prawy przycisk'} w ${
            dom ? 'pokoju' : 'pomieszczeniu'
          }: „Przeszukać …”${
            dom ? '' : ', a na schodach „Przeszukać piętro”'
          }. Łup zanieście na podwórko („Zanieść na podwórko”), a drzwi od ulicy możecie potem zabić deskami.`,
          `Inside an open ${dom ? 'house' : 'building'}, ${o.touch ? 'press and hold on' : 'right-click'} a room: “Search the …”${
            dom ? '' : ', or on the stairs “Search a floor upstairs”'
          }. Carry the loot home (“Carry into the yard”); you can nail planks over the street door afterwards.`,
        );
      },
      // pomieszczenie bez mieszkania (klatka, sala), pomieszczenie mieszkania albo piętro, przeszukane u sąsiada
      zrobiony: (o) =>
        (o.st.sasiedzi?.budynki ?? []).some(
          (b) => b.przeszukane.length > 0 || b.pietra > 0 || b.mieszkania.some((m) => m.przeszukane.length > 0),
        ),
    },
  ],
};

/* ---------------------------------------------------------------- R8. Drogi do zwycięstwa */

/** zaliczone kamienie drogi w stanie zarządu; zero bez włączonych dróg */
const kamienie = (gov: GovState | null, droga: 'ludnosc' | 'teren'): number => gov?.zwyciestwo?.kamienie[droga] ?? 0;

/** liczba osób (albo celu) do tekstu: całkowita, nieujemna, z polskim zapisem liczby (`num`), jak na ekranie dróg */
const osoby = (n: number): string => num(Math.max(0, Math.round(n)), 0);

/** Droga ludnościowa z `ocenDrogi` taka, jaka była przy otwarciu rozdziału: z liczbą kamieni z `start.kamienLudnosci`, nie
    z bieżącą. Cel zalicza się, gdy kamieni przybywa, a wtedy bieżące „co dalej” mówiłoby już o następnym progu, więc
    zaliczony cel zmieniałby tekst. Z kopią stanu zarządu (płytką, tylko liczba kamieni), niczego nie zmienia. Bez
    włączonych dróg i bez wejścia zarządu: undefined. */
function drogaLudnosciPrzyOtwarciu(o: OdczytCelow, s: StanSciezki): PostepDrogi | undefined {
  const z = o.gov?.zwyciestwo;
  if (!o.gov || !z || !o.input) return undefined;
  const przy: GovState = {
    ...o.gov,
    zwyciestwo: { ...z, kamienie: { ...z.kamienie, ludnosc: s.start.kamienLudnosci } },
  };
  return ocenDrogi(przy, o.input).find((p) => p.droga === 'ludnosc');
}

const R8: DefRozdzialu = {
  k: 'r8',
  tytul: () => L('Drogi do zwycięstwa', 'Roads to victory'),
  cele: [
    {
      key: 'drogi',
      tekst: () => L('Zajrzyjcie do dróg do zwycięstwa.', 'Have a look at the roads to victory.'),
      jak: () =>
        L(
          'Menu, „Drogi do zwycięstwa”: pięć dróg z kamieniami milowymi; każda kończy się innym epilogiem.',
          'Menu, “Roads to victory”: five roads with milestones; each ends in a different epilogue.',
        ),
      // zdarzenie samego interfejsu: ekran dróg otwarty od otwarcia rozdziału
      zrobiony: (_o, s) => zdarzeniePoOtwarciu(s, 'drogi'),
    },
    {
      key: 'ludnosc',
      // nie istnieje bez dróg i wtedy, gdy droga ludnościowa jest przebyta do końca (nie ma następnego kamienia)
      jest: (o, s) => Object.hasOwn(s.zrobione, 'r8.ludnosc') || !!drogaLudnosciPrzyOtwarciu(o, s)?.dalej,
      // tekst to „co dalej” drogi ludnościowej z ekranu dróg, w tym samym brzmieniu
      tekst: (o, s) => {
        const dalej = drogaLudnosciPrzyOtwarciu(o, s)?.dalej;
        return dalej ? tr(dalej) : L('Zbierzcie więcej osób pod zarządem.', 'Get more people under the board.');
      },
      jak: (o, s) => {
        const d = drogaLudnosciPrzyOtwarciu(o, s);
        const nazwa = d ? tr(d.nazwa) : L('Nowe osiedle', 'A new estate');
        const ile = osoby(d?.postep?.ile ?? 0);
        const cel = osoby(d?.postep?.cel ?? 0);
        return L(
          `${nazwa}: ${ile} z ${cel}. Ludzie przychodzą z kart wydarzeń i od sąsiadów („Zaprosić do nas”).`,
          `${nazwa}: ${ile} of ${cel}. People come from event cards and from next door (“Invite them to join you”).`,
        );
      },
      // kolejny kamień drogi ludnościowej niż przy otwarciu rozdziału; kamień liczy krok zarządu, nie to okienko
      zrobiony: (o, s) => kamienie(o.gov, 'ludnosc') > s.start.kamienLudnosci,
    },
    {
      key: 'teren',
      // tylko tam, gdzie wspólny płot dosięga choć jednego sąsiada (ten sam predykat co ekran dróg) i gdzie są drogi
      jest: (o, s) =>
        Object.hasOwn(s.zrobione, 'r8.teren') ||
        kamienie(o.gov, 'teren') >= 1 ||
        (!!o.gov?.zwyciestwo && (!o.input || terenMozliwy(o.input))),
      tekst: () => tr(DALEJ_TEREN),
      jak: (o) =>
        L(
          `${o.touch ? 'Przytrzymajcie palec' : 'Prawy przycisk'} na drzwiach otwartego budynku obok: „Otoczyć wspólnym płotem (…)”, z kosztem i czasem w menu. Między wami nie może być jezdni.`,
          `${o.touch ? 'Press and hold on' : 'Right-click'} the door of an open building next door: “Put up a shared fence (…)”, with the cost and time in the menu. There can’t be a road between you.`,
        ),
      zrobiony: (o) => kamienie(o.gov, 'teren') >= 1,
    },
  ],
};

/** Wiersze okienka po ostatnim rozdziale: drogi do zwycięstwa, na które gra ma dziś następny krok (`PostepDrogi.dalej` z
    `ocenDrogi`), w kolejności ekranu dróg; pierwszy wiersz jest bieżący. Z samej oceny wynika, co odpada: teren tam, gdzie
    płot nie dosięga sąsiada (`terenMozliwy`) albo po pierwszym kamieniu, technologia po dwóch pierwszych kamieniach
    („Wkrótce”), lek i cuda, droga przebyta do końca. Wiersz to nazwa drogi, „co dalej” i, dla drogi ludnościowej, postęp
    „{ile} z {cel}”. Pusta lista: żadna droga nie ma następnego kroku (okienko się chowa). null: nie ma jak ocenić dróg
    (gra bez zarządu, bez włączonych dróg albo bez jego wejścia). Tylko czyta. */
export function wierszeDrog(o: OdczytCelow): { nazwa: string; dalej: string; postep: string | null }[] | null {
  if (!o.gov?.zwyciestwo || !o.input) return null;
  return ocenDrogi(o.gov, o.input).flatMap((p) =>
    p.dalej
      ? [
          {
            nazwa: tr(p.nazwa),
            dalej: tr(p.dalej),
            postep: p.postep
              ? L(`${osoby(p.postep.ile)} z ${osoby(p.postep.cel)}`, `${osoby(p.postep.ile)} of ${osoby(p.postep.cel)}`)
              : null,
          },
        ]
      : [],
  );
}

/** Rozdziały głównej ścieżki po kolei: pierwszy dzień, drugi dzień, ludzie i noc, zarząd, jedzenie, badania, sąsiedzi, drogi
    do zwycięstwa. R3 (praca ludzi) dochodzi po scaleniu `praca-ludzi`; do tego czasu po R2 otwiera się R4. Po R8 jest
    „koniec”, a okienko pokazuje drogi do zwycięstwa (`wierszeDrog`). */
export const ROZDZIALY: readonly DefRozdzialu[] = [R0, R1, R2, R4, R5, R6, R7, R8];
