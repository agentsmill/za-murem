/* Okazje ścieżki celów (docs/superpowers/specs/2026-10-19-sciezka-celow-design.md, sekcja „Okazje”): krótkie rozdziały nad
   rozdziałem ścieżki, otwierane przez zdarzenie w grze. Silnik, stan i HTML okienka leżą w src/ui/sciezka.ts (`krokOkazji`,
   `DefOkazji`); tu jest to, co spec mówi o każdej okazji: wyzwalacz, tytuł z „Teraz:” / “Now:”, cele (tekst, podpowiedź,
   warunek zaliczenia) i to, kiedy zdarzenie mija. Moduł bierze z silnika same typy (`import type`), więc nie ma cyklu
   importów w czasie wykonania; silnik bierze stąd `OKAZJE`.

   Kolejność w `OKAZJE` to ważność: najpierw to, co zagraża życiu (O5 ugryzienie, O6 zmarły wstanie, O4 stado pod siatką, O3
   napad), potem zima (O8, dodana 20.10.2026 po badaniu zimy), na końcu goście (O2 handlarz, O1 wędrowiec, O7 obca ekipa).
   Widać najwyżej jedną: ważniejsza wypiera niższą, a niższa wraca, gdy ważniejsza się skończy.

   Goście pod bramą nie mają okazji (zadanie 13): goście z klocków, karty z 0.3 z gościem (`uchodzcy`, `influencer`, `dzieci`,
   „Fachowiec” w domu) i kroki łańcuchów z grupą pod bramą to pionki rodzaju `gosc`, a ich karta sama prowadzi decyzję
   („Przyjąć do spółdzielni”, „Wpuścić na noc”, „Odprawić”), więc okazja podpowiadałaby to samo drugi raz. Żaden wyzwalacz poniżej
   nie czyta grupy pod bramą; pilnuje tego tests/unit/sciezka-nowi.test.ts („okazje a karta gościa”). Co innego okazje, które
   gość wywoła skutkiem decyzji albo śmiercią (napad za pościgiem, ugryzienie przyjętego, zwłoki po zabitym gościu): to już
   osobne zdarzenia, a karta gościa jest wtedy zamknięta.

   Wyzwalacze czytają odczyt gry z jednej chwili (`OdczytCelow`): pionki wędrowca, handlarza i obcej ekipy, napad z migawki
   (`snap.raid`), stado (`snap.zombies.pressing`), ugryzienie (`snap.people[].bite`), zwłoki (rzeczy `zwloki` z `fuel`).
   Okazja, która dotyczy jednego pionka albo jednej rzeczy (wędrowiec, handlarz, ugryziony, zwłoki), trzyma jej id w stanie
   (`cel`), więc pilnuje właśnie jej, a nie dowolnej innej. Zdarzenie, które mija razem ze skutkiem celu (udana amputacja
   zdejmuje ugryzienie, dobicie zdejmuje czas wstania), zalicza cel: silnik liczy cele przed zamknięciem na tym samym odczycie.
   Dwa wyzwalacze mają próg z histerezą, żeby okazja nie gasła w połowie celu: stado otwiera się od trzech napierających, ale
   trwa, dopóki ktoś napiera (topniejące pod dzidami to ten sam napór, a cel każe zabić trzech), i do 6:00; okazja ugryzienia
   otwiera się tylko wtedy, gdy jest komu amputować (ktoś inny z zarządu, na miejscu i w stanie, jak w karcie osoby: bez
   niego cel byłby nie do zrobienia), a trwa do końca okna amputacji.

   Werbunek w O1 (praca ludzi): po rozmowie dochodzi pytanie o rękę (`reka`, tylko w zombie, bo co piąty ocalały ukrywa
   ugryzienie) i zaproszenie (`zapros`). Oba zaliczają się za próbę, nie za wynik: praca zarządu z wędrowcem (`startZapros`) jest
   krótka, więc oprócz niej cel czyta trwałe ślady wyniku w stanie gry (pytanie zapisane w rozmowie, wieść o odmowie albo o ręce,
   wędrowiec, który został zarządem albo mieszkańcem), a okienko, które nie zdążyło zobaczyć pracy, i tak zalicza. Zaproszenie
   czeka na miejsce, gdy nie ma gdzie przyjąć wędrowca (pełny zarząd bez wolnego łóżka mieszkańców). Okazja z samym zagadaniem
   zamykała się po rozmowie; teraz trwa, dopóki wędrowiec stoi przy siatce, a niezrobiony werbunek wraca z każdym następnym.

   Tryb gry. O1 w zombie mówi „ocalały” (te same pionki, inni ludzie), O3 istnieje tylko w zwykłym (szabrowników w zombie nie
   ma), O4, O5 i O6 tylko w zombie (stado, ugryzienie, wstający zmarli); O2 przychodzi w zombie od czwartego dnia, rzadko
   (czas wizyt ustawia symulacja, nie ta lista). Słowa miejsca ze słownika (`Words`, `WordsEn`): brama albo furtka, a w
   podpowiedzi zimy lokum (mieszkanie albo dom); słowa zarządu w okazjach nie ma, bo podpowiedź zwłok nie obiecuje już, że
   wolny z zarządu dobije sam (automat dobija tylko uzbrojony i nie za siatką). Mysz i dotyk różnią się zawsze tak samo.

   O8 „Zima idzie” (spec: „Okazje”, O8): badanie zimy 20.10.2026 pokazało, że tylko ogrzana sypialnia daje zarządowi 5–12 dni
   zimy więcej, a gracz nie ma skąd tego wiedzieć (koza w kuchni grzeje pokój przez drzwi tylko o 4°C ponad pogodę). Okazja
   otwiera się od ósmego dnia roku (trzy dni przed zimą) do trzeciego dnia zimy (dzień 13) i od następnej jesieni (dzień 48,
   88…), gdy w żadnym pokoju do spania (rodzaj `pokoj` naszego mieszkania) nie stoi ogrzewanie (koza z beczki albo kocioł;
   koza zarządu stoi w kuchni) i gdy da się ją zrobić: ktoś zna się na cieple (albo książka, albo koza z beczki zbadana)
   i któryś pokój do spania ma kafelek w zasięgu okna, na którym koza z beczki może stanąć (reguły `canPlace` bez rzeczy na
   kafelku, które da się usunąć). Cele: zbadać kozę z beczki (`t_kozy`), potem postawić ją w pokoju do spania; podpowiedź
   mówi, że koza w kuchni sypialni nie dogrzeje i że koza z beczki potrzebuje okna (rura), a tam, gdzie któryś pokój do
   spania okna nie ma, że trzeba łóżek piętrowych w pokoju z oknem i kozy tam. Na Lanciego żaden z czterech pokoi nie ma
   okna w zasięgu (okna mają tam tylko kuchnia i łazienka), więc okazji tam nie ma: koza z beczki stanęłaby tylko w kuchni,
   a łóżka piętrowe wolno stawiać wyłącznie w pokojach. Dowód w tests/unit/sciezka-okazje.test.ts. Okno okazji to sześć dni
   (8–13), nie cała zima: zima stoi nad gośćmi, a zwinięte okienko na telefonie pokazuje wtedy tylko okazję i chowa rozdział,
   więc dłużej niż trzy dni zimy okazja zasłaniałaby ścieżkę. Po oknie mija bez zaliczenia i wraca z następną jesienią. */

import { L } from '../core/jezyk.ts';
import { waszeLokum } from '../gov/miejsce.ts';
import { kartka } from '../sim/badania.ts';
import { BUILDS_EN } from '../sim/budowle.en.ts';
import { BUILDS, canPlace, nearWindow, ZASIEG_OKNA } from '../sim/budowle.ts';
import { SEASON_DAYS } from '../sim/clock.ts';
import { OFFER_TIMES } from '../sim/handlarz.ts';
import { type HouseLike, houseOf, kozaFront } from '../sim/house.ts';
import { alarmOn, okazjaWerbunku } from '../sim/sim.ts';
import { modeOf } from '../sim/tryb.ts';
import { NAPISY } from '../sim/wedrowcy.ts';
import { DISPERSE, FENCE_BEARS, HORDE_FROM } from '../sim/zombie.ts';
import type { World } from '../world/world.ts';
import { costText } from './budowa.ts';
import { zombieMode } from './cele.ts';
import type { DefOkazji, OdczytCelow, StanSciezki } from './sciezka.ts';
import { bezWypraw, budowaZakladka } from './sciezka-rozdzialy.ts';
import { num } from './tekst.ts';

/* ---------------------------------------------------------------- wspólne */

/** pionek wędrowca, który przystanął przy siatce (faza 1): rozmowa i zaproszenie możliwe tylko wtedy */
const wedrowcaPrzySiatce = (o: OdczytCelow) => o.st.pawns.find((p) => p.kind === 'wedrowiec' && p.job?.phase === 1);

/** pionek o id ze stanu okazji (`cel`); z `kind` tylko taki rodzaj, bez niego jakikolwiek (zwerbowany wędrowiec zostaje tym
    samym pionkiem i zmienia tylko rodzaj: zarząd albo mieszkaniec) */
const pionekOkazji = (o: OdczytCelow, s: StanSciezki, kind?: string) =>
  s.okazja?.cel === undefined
    ? undefined
    : o.st.pawns.find((p) => p.id === s.okazja!.cel && (kind === undefined || p.kind === kind));

/** „Zaznaczcie kogoś i prawy przycisk” albo na dotyku „Stuknijcie kogoś i przytrzymajcie palec” */
const zaznaczIKlik = (o: OdczytCelow): string =>
  o.touch ? 'Stuknijcie kogoś i przytrzymajcie palec' : 'Zaznaczcie kogoś i prawy przycisk';
const selectAndClick = (o: OdczytCelow): string =>
  o.touch ? 'Tap someone and press and hold on' : 'Select someone and right-click';
/** „prawy przycisk” albo „przytrzymajcie palec” (z wielką literą na początku zdania: `Prawy`) */
const klik = (o: OdczytCelow, naPoczatku = false): string => {
  const t = o.touch ? 'przytrzymajcie palec' : 'prawy przycisk';
  return naPoczatku ? t.charAt(0).toUpperCase() + t.slice(1) : t;
};
const click = (o: OdczytCelow): string => (o.touch ? 'press and hold on' : 'right-click');

/** wspólny cel „ogłoście alarm”: warunek to przycisk „Do broni!” (polecenie czeka w kolejce na krok, także na pauzie) */
const alarmZrobiony = (o: OdczytCelow): boolean => alarmOn(o.st);

/* ---------------------------------------------------------------- O1. Wędrowiec */

/** Praca zarządu z tym wędrowcem: zaproszenie (`zapros`) albo pytanie o rękę (`reka`), obie to praca `zapros` z `what` równym
    poleceniu (`startZapros` w src/sim/sim.ts). Trwa dojście do siatki i dwie minuty gry rozmowy przez siatkę. */
const pracaWerbunku = (o: OdczytCelow, s: StanSciezki, what: 'zapros' | 'reka'): boolean =>
  o.st.pawns.some(
    (p) => p.kind === 'core' && p.job?.t === 'zapros' && p.job.what === what && p.job.target === s.okazja?.cel,
  );

/** Wieść z wyniku werbunku (pytanie o rękę albo odmowa), która powstała po otwarciu okazji: zostaje w stanie do następnej wieści,
    więc trwały ślad pracy, której okienko mogło nie zobaczyć (praca trwa około dwóch minut gry, okienko liczy się co 200 ms,
    a przy szybkim tempie to jeden–dwa odświeżenia). */
const wiescPoOtwarciu = (o: OdczytCelow, s: StanSciezki, ...teksty: string[]): boolean => {
  const w = o.st.obcy?.wiesc;
  return !!w && w.tick >= (s.okazja?.od ?? 0) && teksty.includes(w.text);
};

/** Zaproszenie ma dokąd trafić: zarząd ma miejsce albo mieszkańcy wolne łóżko. Bez tego menu pokazuje „Brak miejsca”, a w domu
    jednorodzinnym przy pełnym zarządzie nic (`okazjaWerbunku`). */
const jestMiejsceNaZaproszenie = (o: OdczytCelow): boolean => {
  const dokad = okazjaWerbunku(o.st, o.w).dokad;
  return dokad === 'zarzad' || dokad === 'mieszkaniec';
};

/** Nazwa pozycji menu z zaproszeniem wędrowca bez szansy w nawiasie: menu dopisuje szansę samo (`werbunekAt` w src/sim/orders.ts),
    a podpowiedź cytuje sam początek. Przy pełnym zarządzie menu zaprasza mieszkańca („Zaprosić do nas jako mieszkańca (N%)”,
    po angielsku „Invite to stay as a resident (N%)”), inaczej zarząd („Zaprosić do nas (N% szans)”), a bez miejsca pozycja jest
    wyszarzona pod nazwą bez liczby (`NAPISY.zaprosicBez`). Podpowiedź zawsze cytuje tę nazwę, którą gracz zobaczy w menu. */
const szansaWNawiasie = / \(.*\)$/;
function nazwaZaproszenia(o: OdczytCelow): { pl: string; en: string } {
  const n = okazjaWerbunku(o.st, o.w).dokad === 'mieszkaniec' ? NAPISY.zaprosicMieszkanca(0) : NAPISY.zaprosicBez;
  return { pl: n.pl.replace(szansaWNawiasie, ''), en: n.en.replace(szansaWNawiasie, '') };
}

const O1: DefOkazji = {
  k: 'o1',
  // w zombie to ocalały: te same pionki, inna rozmowa
  tytul: (o) =>
    zombieMode(o.st, o.gov)
      ? L('Teraz: ocalały przy siatce', 'Now: a survivor at the fence')
      : L('Teraz: wędrowiec przy siatce', 'Now: a wanderer at the fence'),
  cel: (o) => wedrowcaPrzySiatce(o)?.id ?? -1,
  trwa: (o, s) => pionekOkazji(o, s, 'wedrowiec')?.job?.phase === 1,
  cele: [
    {
      key: 'zagadaj',
      tekst: (o) =>
        zombieMode(o.st, o.gov)
          ? L('Zagadajcie ocalałego.', 'Talk to the survivor.')
          : L('Zagadajcie wędrowca.', 'Talk to the wanderer.'),
      jak: (o) => {
        const zombie = zombieMode(o.st, o.gov);
        return L(
          `${zaznaczIKlik(o)} na ${zombie ? 'ocalałym' : 'wędrowcu'}: „Zagadać”. Rozmowa przez siatkę przynosi wieść: o handlarzu, o autach do przeszukania.`,
          `${selectAndClick(o)} the ${zombie ? 'survivor' : 'wanderer'}: “Talk to the wanderer”. A chat through the fence brings news: about the trader, about cars worth searching.`,
        );
      },
      // chwilowy stan: wędrowiec po rozmowie (praca `wander` z `what` równym „zagadany”), zaliczany, gdy okienko go zobaczy
      zrobiony: (o, s) => pionekOkazji(o, s, 'wedrowiec')?.job?.what === 'zagadany',
    },
    {
      // O1.2 werbunek [praca-ludzi], tylko w zombie: co piąty ocalały ukrywa ugryzienie, więc przed zaproszeniem pytanie o rękę
      // (w zwykłym trybie menu go nie ma, `startZapros` je odrzuca)
      key: 'reka',
      jest: (o) => zombieMode(o.st, o.gov),
      tekst: () => L('Zapytajcie ocalałego o rękę.', 'Ask the survivor to show their arm.'),
      jak: (o) =>
        L(
          `Po rozmowie ${klik(o)} na ocalałym: „${NAPISY.zapytacORege.pl}”. Co piąty ukrywa ugryzienie.`,
          `After the chat, ${click(o)} the survivor: “${NAPISY.zapytacORege.en}”. One in five is hiding a bite.`,
        ),
      // Liczy się samo pytanie, nie to, co wędrowiec odpowie. Praca `zapros` z `what` równym „reka” trwa krótko, więc oprócz niej
      // trwałe ślady: pytanie zapisane w rozmowie (czysta ręka; rozmowa trwa, dopóki wędrowiec stoi przy siatce) i wieść o
      // wyniku (ukryte ugryzienie: wędrowiec odchodzi, rozmowa znika, a wieść zostaje)
      zrobiony: (o, s) =>
        pracaWerbunku(o, s, 'reka') ||
        (o.st.obcy?.rozmowa?.id === s.okazja?.cel && o.st.obcy?.rozmowa?.pytali === true) ||
        wiescPoOtwarciu(o, s, NAPISY.rekaCzysta(true).pl, NAPISY.rekaUgryziona(true).pl),
    },
    {
      // O1.3 werbunek [praca-ludzi]: po rozmowie „Zaprosić do nas” z szansą w procentach (liczbę pokazuje menu, podpowiedź
      // cytuje nazwę pozycji bez niej i mówi, że szansa stoi obok; bez „(… szans)”, które gracz czyta jak urwany tekst)
      key: 'zapros',
      tekst: (o) =>
        zombieMode(o.st, o.gov)
          ? L('Zaproście ocalałego do siebie.', 'Invite the survivor to stay.')
          : L('Zaproście wędrowca do siebie.', 'Invite the wanderer to stay.'),
      jak: (o) => {
        const kto = zombieMode(o.st, o.gov) ? { pl: 'ocalałym', en: 'survivor' } : { pl: 'wędrowcu', en: 'wanderer' };
        const nazwa = nazwaZaproszenia(o);
        return L(
          `Po rozmowie ${klik(o)} na ${kto.pl}: „${nazwa.pl}”. Gdy jest miejsce, menu podaje przy tej pozycji szansę w procentach; rośnie z jedzeniem w zapasie i wolnym łóżkiem, spada po napaści na obcych.`,
          `After the chat, ${click(o)} the ${kto.en}: “${nazwa.en}”. When there is room, the menu shows the chance in percent beside it; it goes up with food in stock and a free bed, and down after you rob strangers.`,
        );
      },
      // zaproszenia nie ma gdzie przyjąć (pełny zarząd bez wolnego łóżka mieszkańców, w domu wcale): cel czeka na miejsce
      czeka: (o) => (jestMiejsceNaZaproszenie(o) ? null : L('czeka na miejsce', 'waiting for a place')),
      // Liczy się próba, nie szczęście: praca `zapros` z `what` równym „zapros” (dojście i dwie minuty rozmowy przez siatkę),
      // a po niej trwałe ślady wyniku: wędrowiec jest już zarządem albo mieszkańcem (udane zaproszenie zmienia rodzaj tego
      // samego pionka) albo wieść o odmowie (nieudane zaproszenie, także „nie mamy już miejsca”)
      zrobiony: (o, s) => {
        const zombie = zombieMode(o.st, o.gov);
        const p = pionekOkazji(o, s);
        return (
          pracaWerbunku(o, s, 'zapros') ||
          (!!p && (p.kind === 'core' || p.kind === 'resident')) ||
          wiescPoOtwarciu(o, s, NAPISY.odmowa(zombie).pl, NAPISY.bezMiejsca(zombie).pl)
        );
      },
    },
  ],
};

/* ---------------------------------------------------------------- O2. Handlarz */

/** handlarz czekający pod bramą (faza 1: stoi z wózkiem i ofertami) */
const handlarzPodBrama = (o: OdczytCelow) => {
  const id = o.st.obcy?.trader ?? -1;
  return id < 0 ? undefined : o.st.pawns.find((p) => p.id === id && p.kind === 'handlarz' && p.job?.phase === 1);
};

const O2: DefOkazji = {
  k: 'o2',
  tytul: (o) => L(`Teraz: handlarz ${o.words.brama.pod}`, `Now: the trader at ${o.wordsEn.brama}`),
  cel: (o) => handlarzPodBrama(o)?.id ?? -1,
  trwa: (o, s) => {
    const h = handlarzPodBrama(o);
    return !!h && h.id === s.okazja?.cel;
  },
  cele: [
    {
      key: 'wymiana',
      tekst: () => L('Wymieńcie coś z handlarzem.', 'Trade with the trader.'),
      jak: (o) =>
        L(
          `${zaznaczIKlik(o)} na handlarzu albo wózku: „Dać … za …”. Złom jest tu walutą. Napaść też jest w menu, ale wieść pójdzie do innych handlarzy.`,
          `${selectAndClick(o)} the trader or his cart: “Give … for …”. Scrap is the currency here. Robbing him is on the menu too, but word will reach the other traders.`,
        ),
      // w czasie wizyty któraś oferta przyjęta (każda ma `OFFER_TIMES` razy, a wymiana odejmuje jedno); oferty znikają z wizytą
      zrobiony: (o) => !!o.st.obcy?.offers.some((x) => x.left < OFFER_TIMES),
    },
  ],
};

/* ---------------------------------------------------------------- O3. Napad szabrowników */

/** napad trwa (faza 1: szabrownicy za siatką, faza 2: wchodzą albo uciekają) */
const napadTrwa = (o: OdczytCelow): boolean => {
  const r = o.snap.raid;
  return !!r && (r.phase === 1 || r.phase === 2);
};

const O3: DefOkazji = {
  k: 'o3',
  tytul: () => L('Teraz: szabrownicy za siatką', 'Now: looters at the fence'),
  // szabrowników w trybie zombie nie ma (stado zamiast nich)
  otwiera: (o) => !zombieMode(o.st, o.gov) && napadTrwa(o),
  trwa: napadTrwa,
  cele: [
    {
      key: 'alarm',
      tekst: () => L('Ogłoście alarm.', 'Sound the alarm.'),
      jak: (o) =>
        L(
          `Przycisk „Do broni!” u góry: wszyscy zdolni idą na wartę ${o.words.brama.przy}. Po wszystkim „Odwołaj”. ${klik(o, true)} na szabrowniku: „Atakuj szabrownika”.`,
          `The “To arms!” button at the top: everyone who can stand goes on watch at ${o.wordsEn.brama}. Afterwards, “Stand down”. ${
            o.touch ? 'Press and hold on' : 'Right-click'
          } a looter: “Attack the looter”.`,
        ),
      zrobiony: alarmZrobiony,
    },
    {
      key: 'odparty',
      tekst: () => L('Odeprzyjcie napad.', 'Fight off the raid.'),
      jak: (o) =>
        L(
          `Liczy się warta, która nie śpi, światło przy siatce i broń. Na noc można też zamknąć ${o.words.brama.b}: ${klik(o)} na niej, „Zamknąć ${o.words.brama.b}”.`,
          `What counts is a watch that’s awake, light by the fence and weapons. You can also shut ${o.wordsEn.brama} for the night: ${
            o.touch ? 'press and hold on it' : 'right-click it'
          }, “Close ${o.wordsEn.brama}”.`,
        ),
      // rozstrzygnięcie napadu tej okazji: ostatni napad w migawce to ten, który okazję otworzył (nowy zastępuje stary)
      zrobiony: (o) => o.snap.raid?.outcome === 'odparty',
    },
  ],
};

/* ---------------------------------------------------------------- O4. Stado pod siatką */

/** noc stada: od HORDE_FROM (21:00) do DISPERSE (6:00) */
const nocStada = (o: OdczytCelow): boolean => o.snap.hour >= HORDE_FROM || o.snap.hour < DISPERSE;

/** ilu napierających otwiera okazję stada */
const NAPIERAJACYCH_OD = 3;
/** ilu zabitych od otwarcia zalicza cel stada */
const ZABITYCH = 3;

const O4: DefOkazji = {
  k: 'o4',
  tytul: () => L('Teraz: stado pod siatką', 'Now: the herd at the fence'),
  otwiera: (o) => zombieMode(o.st, o.gov) && nocStada(o) && o.snap.zombies.pressing >= NAPIERAJACYCH_OD,
  // trwa do ostatniego napierającego (topniejące pod dzidami stado to ten sam napór) i do rana
  trwa: (o) => zombieMode(o.st, o.gov) && nocStada(o) && o.snap.zombies.pressing >= 1,
  cele: [
    {
      key: 'alarm',
      tekst: () => L('Ogłoście alarm.', 'Sound the alarm.'),
      jak: () =>
        L(
          `„Do broni!” u góry: wszyscy zdolni idą na wartę przy siatce. Dźgajcie napierających, zanim w jednym miejscu zbierze się ich ${num(FENCE_BEARS, 0)}.`,
          `The “To arms!” button: everyone who can stand goes on watch at the fence. Spear the ones pressing in before ${num(FENCE_BEARS, 0)} of them bunch up in one spot.`,
        ),
      zrobiony: alarmZrobiony,
    },
    {
      key: 'zabici',
      tekst: () => L('Zabijcie trzech napierających.', 'Kill three of the ones pressing in.'),
      jak: (o) =>
        L(
          `Warta z dzidą bije sama; ${klik(o)} na szwendaczu: „Atakuj szwendacza”. Rano wzmocnijcie zużytą siatkę: ${klik(o)} na niej, „Wzmocnić siatkę”.`,
          `A guard with a spear fights on their own; ${click(o)} a shambler: “Attack the shambler”. In the morning shore up the worn fence: ${
            o.touch ? 'press and hold on it' : 'right-click it'
          }, “Shore up the fence”.`,
        ),
      // licznik zabitych (szwendacze i ludzie) większy o trzy niż przy otwarciu okazji; wcześniejsi się nie liczą
      zrobiony: (o, s) => (o.st.tally?.killed ?? 0) >= (s.okazja?.zabici ?? 0) + ZABITYCH,
    },
  ],
};

/* ---------------------------------------------------------------- O5. Ugryzienie */

/** ktoś z zarządu może teraz amputować (jak w karcie osoby: nie ugryziony, na miejscu, ze zdrowiem ponad 20) */
const maChirurga = (o: OdczytCelow, pacjent: number): boolean =>
  o.snap.people.some((q) => q.pawn !== pacjent && !q.away && q.needs.health > 20);

const O5: DefOkazji = {
  k: 'o5',
  tytul: () => L('Teraz: ugryzienie', 'Now: a bite'),
  // ugryzienie w kończynę, które da się jeszcze uciąć, i ktoś, kto to zrobi
  cel: (o) => o.snap.people.find((p) => !!p.bite?.limb && p.bite.amputate && maChirurga(o, p.pawn))?.pawn ?? -1,
  trwa: (o, s) => {
    const p = o.snap.people.find((q) => q.pawn === s.okazja?.cel);
    return !!p?.bite?.limb && p.bite.amputate;
  },
  cele: [
    {
      key: 'amputacja',
      tekst: (o, s) => {
        const imie = o.snap.people.find((p) => p.pawn === s.okazja?.cel)?.first;
        return L(`Ratujcie: ${imie ?? 'ktoś'} potrzebuje amputacji.`, `Save ${imie ?? 'someone'}: amputate.`);
      },
      jak: () =>
        L(
          'Na karcie ugryzionej osoby „Amputować”: zrobi to ktoś z medycyną, pół godziny, nie zawsze się udaje. Po dwóch godzinach jest za późno.',
          'On the bitten person’s card, “Amputate”: someone with Medicine does it, half an hour, and it doesn’t always work. After two hours it’s too late.',
        ),
      // po udanej amputacji ugryzienia już nie ma, a osoba ma kikut (kto miał kikut wcześniej, a znowu został ugryziony, ma
      // ugryzienie, więc cel nie zalicza się sam)
      zrobiony: (o, s) => {
        const p = o.snap.people.find((q) => q.pawn === s.okazja?.cel);
        return !!p?.maimed && !p.bite;
      },
    },
  ],
};

/* ---------------------------------------------------------------- O6. Zmarły wstanie */

/** zwłoki, które wstaną (czas wstania `fuel` większy od zera); dobite i zwłoki obcych w zwykłym trybie mają zero */
const cialoWstanie = (o: OdczytCelow) => o.st.things.find((t) => t.kind === 'zwloki' && t.fuel > 0);

const O6: DefOkazji = {
  k: 'o6',
  tytul: () => L('Teraz: zmarły wstanie', 'Now: the dead will rise'),
  cel: (o) => cialoWstanie(o)?.id ?? -1,
  trwa: (o, s) => {
    const c = o.st.things.find((t) => t.id === s.okazja?.cel);
    return !!c && c.kind === 'zwloki' && c.fuel > 0;
  },
  cele: [
    {
      key: 'dobic',
      tekst: () => L('Dobijcie ciało, zanim wstanie.', 'Finish off the body before it gets up.'),
      // bez obietnicy, że wolny z zarządu dobije sam: automat (`startFinish`) dobija tylko uzbrojony, w obrębie 12 m i nie za
      // siatką, więc poza płotem i bez broni nikt tego nie zrobi
      jak: (o) =>
        L(
          `${klik(o, true)} na ciele: „Dobić”. Każdy zmarły wstaje po godzinie.`,
          `${o.touch ? 'Press and hold on' : 'Right-click'} the body: “Finish off the body”. Everyone who dies gets back up an hour later.`,
        ),
      // dobite zwłoki leżą dalej z `fuel` równym zero; zwłoki, które wstały, znikają z rzeczy
      zrobiony: (o, s) => {
        const c = o.st.things.find((t) => t.id === s.okazja?.cel);
        return !!c && c.kind === 'zwloki' && c.fuel === 0;
      },
    },
  ],
};

/* ---------------------------------------------------------------- O7. Obcy przy aucie */

/** obca ekipa idzie do wraku albo go przeszukuje (faza poniżej 2: potem odchodzi) */
const ekipaPrzyWraku = (o: OdczytCelow): boolean =>
  o.st.pawns.some((p) => p.kind === 'obcy' && p.job?.t === 'scavenge' && (p.job.phase ?? 4) < 2);

const O7: DefOkazji = {
  k: 'o7',
  tytul: () => L('Teraz: obcy przy aucie', 'Now: strangers at a car'),
  trwa: ekipaPrzyWraku,
  cele: [
    {
      key: 'wrak',
      tekst: () => L('Przeszukajcie wrak przy ulicy.', 'Search a wreck by the road.'),
      jak: (o) =>
        L(
          `${klik(o, true)} na aucie: „Przeszukać …”, a po przeszukaniu „Rozebrać …” na złom i części. Obcych od auta odgoni „Przegonić”.`,
          `${o.touch ? 'Press and hold on' : 'Right-click'} a car: “Search …”, and once it’s searched, “Strip …” for scrap and parts. “Chase them off” sends the strangers away from the car.`,
        ),
      // praca zarządu przy wraku; znaczniki w `st.wraki` stawia też ekipa, więc same nie zaliczają
      zrobiony: (o) => o.st.pawns.some((p) => p.kind === 'core' && p.job?.t === 'wreck'),
    },
  ],
};

/* ---------------------------------------------------------------- O8. Zima idzie */

/** badanie, które daje kozę z beczki */
const BADANIE_KOZY = 't_kozy';
/** od którego dnia roku (z 40) okazja się otwiera: trzy dni przed zimą, która zaczyna się jedenastego */
const OD_DNIA = 8;
/** do którego dnia roku trwa: trzeci dzień zimy (dni 8, 9, 10 to jesień, 11, 12, 13 to zima). Okno jest krótkie, bo zwinięte
    okienko na telefonie pokazuje wtedy tylko okazję i chowa rozdział, a zima stoi nad gośćmi: gdyby trwała do końca zimy
    (dzień 20), wisiałaby tam nad rozdziałem do 13 dni. Po oknie mija bez zaliczenia i wraca z następną jesienią. */
const DO_DNIA = OD_DNIA + 5;

/** czy dzień gry leży w oknie okazji: dni 8–13 każdego roku (rok ma cztery pory po 10 dni, więc też 48–53, 88–93…) */
const wOknieZimy = (dzien: number): boolean => {
  const dnia = ((dzien - 1) % (4 * SEASON_DAYS)) + 1;
  return dnia >= OD_DNIA && dnia <= DO_DNIA;
};

/** Kafelki pokoju, na których koza z beczki mogłaby stanąć, gdyby nic ich nie zajmowało: reguły `canPlace` miejsca „okno”
    (w zasięgu okna własnego pomieszczenia, poza składem drewna i kafelkiem przed kozą zarządu, nie na ścianie). Meble i plany
    dochodzą osobno, bo gracz może je usunąć; geometria jest stała dla świata, więc liczy się raz na pokój. */
const miejscaWPokojach = new WeakMap<World, Map<number, number[]>>();

function miejscaPokoju(w: World, h: HouseLike, id: number): number[] {
  let mapa = miejscaWPokojach.get(w);
  if (!mapa) {
    mapa = new Map();
    miejscaWPokojach.set(w, mapa);
  }
  let m = mapa.get(id);
  if (!m) {
    const przed = kozaFront(h, w.size);
    m = [];
    for (let i = 0; i < h.room.length; i++)
      if (h.room[i] === id && !w.blocked[i] && !h.sklad.includes(i) && i !== przed && nearWindow(h, i, w.size))
        m.push(i);
    mapa.set(id, m);
  }
  return m;
}

/** Pokoje do spania naszych mieszkań (rodzaj `pokoj`: tylko w nich zarząd śpi w łóżkach i na podłodze) z kafelkami, na
    których koza z beczki mogłaby stanąć. Bez wnętrza siedziby pusta lista. */
function sypialnie(o: OdczytCelow): { id: number; miejsca: number[] }[] {
  const h = houseOf(o.w);
  if (!h) return [];
  const nasze = new Set(o.st.apts.filter((a) => a.ours).map((a) => a.apt));
  return h.rooms
    .filter((r) => r.kind === 'pokoj' && nasze.has(r.apt))
    .map((r) => ({ id: r.id, miejsca: miejscaPokoju(o.w, h, r.id) }));
}

/** pokój, w którym stoi rzecz (kafelek jej lewego górnego rogu), albo −1 */
const pokojRzeczy = (o: OdczytCelow, h: HouseLike, t: { x: number; y: number }): number => h.room[t.y * o.w.size + t.x];

/** W którymś pokoju do spania stoi ogrzewanie: koza albo koza z beczki w tym pokoju, albo kocioł (grzeje wszystkie nasze
    mieszkania naraz, gdziekolwiek stoi). Liczy się to, co stoi, niezależnie od tego, czy się pali. */
function ogrzewanaSypialnia(o: OdczytCelow, spalnie: readonly { id: number }[]): boolean {
  const h = houseOf(o.w);
  if (!h || !spalnie.length) return false;
  if (o.st.things.some((t) => t.kind === 'kociol')) return true;
  const ids = new Set(spalnie.map((s) => s.id));
  return o.st.things.some((t) => (t.kind === 'koza' || t.kind === 'koza_beczka') && ids.has(pokojRzeczy(o, h, t)));
}

/** Osada może zbadać kozę z beczki: już zbadana albo kartka do wzięcia (ktoś zna się na cieple, także na wyprawie, albo jest
    książka). Kartka w toku też, bez wiedzy kartka „stoi”, więc nie. */
function mozeBadacKoze(o: OdczytCelow): boolean {
  const stan = kartka(bezWypraw(o.st), BADANIE_KOZY, modeOf(o.st)).stan;
  return stan === 'zbadana' || stan === 'do_wziecia' || stan === 'w_toku';
}

/** Zima idzie: dzień w oknie okazji, żaden pokój do spania nie jest ogrzewany, któryś ma miejsce przy oknie i kozę da się
    zbadać. Ten sam warunek jest też warunkiem trwania: gdy ogrzewanie stanie, zima się skończy albo zabraknie wiedzy,
    okazja mija. */
function zimaIdzie(o: OdczytCelow): boolean {
  if (!wOknieZimy(o.snap.day)) return false;
  const spalnie = sypialnie(o);
  if (!spalnie.some((s) => s.miejsca.length > 0)) return false;
  if (ogrzewanaSypialnia(o, spalnie)) return false;
  return mozeBadacKoze(o);
}

/** Ile miejsc przy oknie w pokojach do spania jest teraz wolnych (bez mebli i planów), tak jakby koza z beczki była już
    zbadana: tyle zobaczy gracz w menu budowy po badaniu. */
function wolneMiejscaKozy(o: OdczytCelow): number {
  const probe = { ...o.st, techDone: [...(o.st.techDone ?? []), BADANIE_KOZY] };
  let n = 0;
  for (const s of sypialnie(o))
    for (const i of s.miejsca)
      if (canPlace(probe, o.w, 'koza_beczka', i % o.w.size, Math.floor(i / o.w.size), 0).ok) n++;
  return n;
}

/** stoi pracownia (tablica badań istnieje) */
const maPracownie = (o: OdczytCelow): boolean => o.st.things.some((t) => t.kind === 'pracownia');

function kozyJak(o: OdczytCelow): string {
  const b = budowaZakladka(o.touch);
  const lab = maPracownie(o);
  const koszt = costText(BUILDS.pracownia.cost);
  const dalej = lab
    ? L(
        `Tablica badań (przycisk Badania u góry${o.touch ? '' : ' albo T'}): ${o.touch ? 'stuknięcie' : 'klik'} w kartkę z kozami, potem „Badać”.`,
        `The Research board (Research button at the top${o.touch ? '' : ', or T'}): ${o.touch ? 'tap' : 'click'} the card with the stoves, then “Research”.`,
      )
    : L(
        `Najpierw pracownia: ${b}, zakładka Dom: ${BUILDS.pracownia.name} (${koszt}) w pokoju ${waszeLokum(o.words)}. Potem tablica badań: kartka z kozami, „Badać”.`,
        `First a research room: ${b}, Home tab: ${BUILDS_EN.pracownia.name} (${koszt}) in a room of ${o.wordsEn.lokal.w}. Then the Research board: the card with the stoves, “Research”.`,
      );
  return L(
    `Zima idzie, a koza w kuchni nie dogrzeje sypialni: w mrozie ludzie wstają zmarznięci i rośnie wkurzenie. Koza z beczki grzeje pokój, w którym stoi. ${dalej}`,
    `Winter is coming, and the stove in the kitchen won’t warm the bedroom: in a hard frost people wake up frozen and tempers rise. A barrel stove heats the room it stands in. ${dalej}`,
  );
}

function beczkaJak(o: OdczytCelow): string {
  const b = budowaZakladka(o.touch);
  const zasieg = num(ZASIEG_OKNA, 0);
  const koza = costText(BUILDS.koza_beczka.cost);
  // któryś pokój do spania bez okna w zasięgu: łóżka piętrowe w pokoju z oknem i koza tam
  const bezOkna = sypialnie(o).some((s) => s.miejsca.length === 0);
  const pietrowe = costText(BUILDS.lozka_pietrowe.cost);
  const lozka = bezOkna
    ? L(
        ` Pokój bez okna odpada: postawcie ${BUILDS.lozka_pietrowe.name} (${pietrowe}) w pokoju z oknem i kozę tam.`,
        ` A room with no window won’t do: put up ${BUILDS_EN.lozka_pietrowe.name} (${pietrowe}) in a room with a window and the stove there.`,
      )
    : '';
  // przy oknie stoją meble: spalić (rozebrać meble zarządu nie wolno)
  const spalic =
    wolneMiejscaKozy(o) === 0
      ? L(
          ` Przy oknie brak miejsca? ${klik(o, true)} na meblu: „Spalić …”.`,
          ` No space by the window? ${o.touch ? 'Press and hold on' : 'Right-click'} a piece of furniture: “Burn the …”.`,
        )
      : '';
  return L(
    `Koza w kuchni sypialni zimą nie dogrzeje. ${b}, zakładka Dom: ${BUILDS.koza_beczka.name} (${koza}) w pokoju, w którym śpicie, najwyżej ${zasieg} m od okna, bo rura idzie przez okno.${lozka}${spalic}`,
    `The stove in the kitchen won’t warm the bedroom in winter. ${b}, Home tab: ${BUILDS_EN.koza_beczka.name} (${koza}) in the room where you sleep, within ${zasieg} m of a window, because the flue goes out through the window.${lozka}${spalic}`,
  );
}

/** koza z beczki stoi w którymś pokoju do spania */
const beczkaWSypialni = (o: OdczytCelow): boolean => {
  const h = houseOf(o.w);
  if (!h) return false;
  const ids = new Set(sypialnie(o).map((s) => s.id));
  return o.st.things.some((t) => t.kind === 'koza_beczka' && ids.has(pokojRzeczy(o, h, t)));
};

const O8: DefOkazji = {
  k: 'o8',
  tytul: () => L('Teraz: zima idzie', 'Now: winter is coming'),
  trwa: zimaIdzie,
  cele: [
    {
      key: 'kozy',
      tekst: () => L('Zbadajcie kozę z beczki.', 'Research the barrel stove.'),
      jak: kozyJak,
      // tablica badań dostaje linię „Cel: …”, dopóki badanie jest do zrobienia
      okno: 'tablica',
      zrobiony: (o) => !!o.st.techDone?.includes(BADANIE_KOZY),
    },
    {
      key: 'beczka',
      tekst: () =>
        L('Postawcie kozę z beczki w pokoju, w którym śpicie.', 'Put a barrel stove in the room where you sleep.'),
      jak: beczkaJak,
      czeka: (o) => (o.st.techDone?.includes(BADANIE_KOZY) ? null : L('czeka na badanie', 'waiting for the research')),
      zrobiony: beczkaWSypialni,
    },
  ],
};

/** Okazje w kolejności ważności: życie (ugryzienie, zwłoki, stado, napad), zima, goście (handlarz, wędrowiec, ekipa). */
export const OKAZJE: readonly DefOkazji[] = [O5, O6, O4, O3, O8, O2, O1, O7];
