/* Okna zarządu silnika osady AI, etap 1 (docs/superpowers/plans/2026-10-21-osada-ai-etap-1.md, zadania 5 i 6): wybór w wydarzeniu
   przez ocenę skutków na kopiach zarządu i uchwała według potrzeb. Karta nocy ma własną odpowiedź w src/ai/silnik.ts (warta,
   dyżur przy kozie), raport i epilog zwycięstwa idą odpowiedzią domyślną z src/ai/gra.ts.

   Wydarzenie. Skutki wyboru zna tylko zarząd, który je liczy (`chooseEvent` zmienia stan zarządu, w tym jego generator, i
   oddaje `GovEffects`), więc silnik próbuje każdy dozwolony wybór na głębokich kopiach zarządu (`structuredClone`), ocenia je
   (`ocenSkutki`) i wybiera najlepszy; prawdziwy zarząd i wejście zostają nietknięte. Silnik nie zna wyniku losowań, których
   gracz znać nie może (np. 30% szansy, że przegrany w kłótni odejdzie): kopia nie dostaje stanu prawdziwego generatora, tylko
   ziarno pochodne (`ziarnoKopii`: skrót id okna, ticku i numeru kopii, bez losowania i bez zegara), a ocena wyboru
   (`ocenaWyboru`) to średnia z `KOPII_OCENY` kopii. Wszystkie wybory okna dostają te same ziarna (wspólne liczby losowe), więc
   porównanie dwóch wyborów nie zależy od tego, że jednemu trafiły się lepsze losowania, a tick w ziarnie sprawia, że kolejne
   okna tego samego rodzaju dostają inne losowania (bez niego karta wracająca co dobę oceniałaby się zawsze na tych samych
   losowaniach i silnik wierzyłby w jedną przypadkową szansę). Prawdziwy zarząd losuje dalej swoim generatorem, którego ocena
   nie dotyka. Ocena wyboru, którego skutek nie zależy od losowania (wszystkie kopie równe), to ta jedna ocena bez dzielenia,
   żeby remisy wyglądały co do bitu tak jak przy jednej kopii. Losowania przy samym wyborze (generator zarządu) dziś nie zmieniają
   wyboru żadnego okna (jedyny taki skutek to odejście przegranego w kłótni, a „mediacja” wygrywa tam zawsze), więc ta część reguły
   jest zabezpieczeniem na karty, które dojdą z innych gałęzi; co innego ukryte rzuty kart z następnego akapitu, które bez
   przelosowania zmieniałyby wybór w prawie wszystkich oknach gości (186 z 197 w sondzie przeglądu zadania 7). Przy remisie
   wygrywa niższy indeks (kolejność z okna). Okno bez dozwolonego wyboru daje 0: wybór się nie uda, a okno dostanie odpowiedź
   domyślną albo zostanie zawieszone (src/ai/gra.ts).

   Ukryte rzuty kart. Część kart losuje przy tworzeniu rzut, którego nie pokazuje ani tekstem, ani wyborami, a od którego
   zależą skutki wyboru: haczyk gościa pod bramą (`Gosc.haczyk`: chory wpuszczony na noc rozdaje chorobę rano, ugryziony dostaje
   rozkaz „ugryziony”; karta daje tylko trop), kot albo włamywacz za płotem (`halas.cat`) i pomoc albo pułapka w krzyku
   z sąsiedztwa (`krzyk.help`). Kopia zarządu ma ten rzut w stanie, więc ocena na niej by go znała, choć gracz go nie zna
   (a w etapie 2 silnik gra obok gracza). Na każdej kopii oceny silnik losuje te rzuty od nowa (`przelosujUkryte`) z ziarna
   pochodnego (`ziarnoKopii` z dopiskiem „ukryte”, wspólnego dla wszystkich wyborów okna, jak los z poprzedniego akapitu):
   pole karty z `UKRYTE_RZUTY` z szansą z jej `make`, a haczyk gościa z wag generatora gości (`wagaHaczyka`), zawężonych do
   tego, co widać na karcie: haczyki zgodne z tym, kim jest gość, czego chce i co ma (`zgodnyGosc`). Szanse i wagi są kopiami
   stałych z src/gov (`halas`, `krzyk` w tresc.ts, `BAZA_HACZYK` i mnożniki w goscie.ts), więc tests/unit/ai-okna.test.ts
   pilnuje ich dryfu: wywołuje `make` kart z atrapą generatora tuż pod i tuż nad progiem oraz próbkuje `skladGoscia`. Rzut, który karta
   pokazuje albo który odsłonił poprzedni krok okna, zostaje taki, jaki jest: ugryzienie odsłonięte przez „Obejrzeć ręce”
   (`AktywnyGosc.obejrzano`) zostaje, po „czysty” ugryzienia już nie losuje się wcale, a gość, który z natury jest ugryziony
   (ktoś z ugryzionym bliskim), nie ma czego ukrywać. Skutek uboczny: silnik w trybie zombie nie ma powodu sięgać po „Obejrzeć
   ręce” (ocena jest jednokrokowa i nie wycenia wiedzy), więc okno wieloetapowe zdarza się tam tylko, gdy wybór silnika trafi
   w taki krok; tryb zombie jest poza etapem 1.

   Ocena (`ocenSkutki`) liczy stan zarządu po wyborze i skutki, które z niego wyszły; stała część (zaufanie i wkurzenie
   sprzed wyboru) skraca się przy porównaniu wyborów z jednego okna:
   - zapasy: jedzenie ×3, drewno ×1, złom, części i leki ×0,5 (skutki od razu i odłożone na rano w `GovState.later`);
   - zaufanie +2, wkurzenie −2 za punkt;
   - rany −10 na osobę: chorzy do rozdania (najwyżej tylu, ilu osób w zarządzie: symulacja osłabia każdego raz), ugryzieni
     (też gościa wpuszczonego z ukąszeniem), osoby ze spadkiem zdrowia i choroba odłożona na rano;
   - zgony −50 na osobę: ludzie, którzy znikają z osady (odchodzący z zarządu, wyrzuceni, mieszkańcy, którzy odchodzą);
     wydarzenia nie zabijają wprost, więc strata człowieka jest tym, co ocena widzi najbliżej śmierci;
   - przyjęcia ±4 na osobę (nowi do zarządu, nowi mieszkańcy, żywi członkowie grupy gościa przyjętej rozkazem `zostan` albo
     `zarzad`): +4, gdy po przyjęciu starcza 2 porcje na głowę (`stacNaPrzyjecie` z src/ai/jedzenie.ts), inaczej −4;
   - koniec gry (odwołanie, exodus, pustka po wyborze) −1000: żaden zysk nie wart jest końca.
   Do wag z planu dochodzą dwie z pomiaru (30 przebiegów, ziarna 11–20, trzy dema; liczby to średni dzień końca gry, przebieg,
   który dożył 45 dni, liczony jako 45; błąd średniej około ±1,5 dnia):
   - pożar −15 (`GovEffects.fire`: spalony mebel przy kozie, strach i gorszy nastrój wszystkich). Karta „Pożar od kozy” wraca co
     dobę, a „Ewakuować klatkę” kosztuje według planu tylko wkurzenie +2, więc wygrywała z „Gasić wszyscy razem” (drewno −3
     i jedna osoba chora, razem −13): silnik z samymi wagami z planu kończył w dniu 17,6 wobec 22,9 przy odpowiedzi domyślnej,
     z wagą pożaru 24,0;
   - łata na dziurę +6 za dziurę (`GovEffects.patch`: karta „Ślady przy siatce” pozwala załatać dziurę za 2 złomu). Bez tej wagi
     silnik wieszał puszki, dziura zostawała otwarta, a automat pracy łatał ją deskami (3–4 sztuki), których w Zielonkach brakuje
     na pracownię (14): pracownia i koza z beczki nie stawały w 6 z 10 przebiegów. Z wagą łaty 27,7 wobec 26,8 (przy kotle
     jako jedynej uchwale), a w Zielonkach 11–15 pracownia i koza stoją w 5 z 5.
   Pozostałe skutki, których ocena nie widzi (książki na półkę, nastroje chwilowe, potrzeby osób, kłamca wpuszczony na noc),
   pomiar nie rozróżnił (w granicach szumu), więc zostają niewycenione do strojenia.

   Okno wieloetapowe. Wybór z `GChoice.zostaje` (np. „Obejrzeć ręce” przy gościu w trybie zombie) nie zamyka okna: zarząd
   pyta dalej o to samo okno (ten sam rodzaj i identyfikator), z nowym tekstem i wyborami. `odpowiedzNaWydarzenie` czyta
   `pending` po każdym wyborze i odpowiada na kolejny krok (najwyżej `MAX_KROKOW_OKNA`; okno, które po wyborze się nie
   zmieniło, kończy odpowiedź), a okno, które mimo to zostanie, dostanie odpowiedź domyślną od `krokGry`.

   Uchwała (`wyborUchwaly`). W pierwszym oknie wspólny kocioł (droga wspólnoty): `u_warty` należy do drogi porządku i
   podpisana blokuje kocioł do końca gry (src/gov/uchwaly.ts), a pierwszego wieczoru głodu jeszcze nie ma, więc reguła
   „głód → kocioł” nigdy by nie zadziałała. Kocioł zamyka z kolei drogę porządku: `u_warty` i `u_brama` (brama na kłódkę,
   wymaga warty) są po nim zablokowane do końca gry, więc silnik nie podpisuje ani warty, ani bramy na słabą siatkę (była
   taka gałąź, usunięta jako martwa). Potem tylko według potrzeby: głód (poniżej 1 porcji na głowę) to kocioł, o ile jest
   jeszcze dozwolony (`uchwalaNaGlod` z src/ai/jedzenie.ts); zimno uchwały nie wybiera, bo żadna uchwała M1 nie grzeje (kocioł
   dzieli jedzenie, a ciepło dają kozy). Bez potrzeby `null`: zarząd nic nie uchwala. Plan i orzeczenie kontrolera kończyły
   regułę słowami „potem pierwsza dozwolona”, ale pomiar (30 przebiegów, ziarna 11–20, trzy dema, silnik z wagą pożaru; średni
   dzień końca, dożycie 45 dni liczone jako 45, błąd średniej około ±1,5 dnia) pokazał, że dodatkowe uchwały odbierają dni:
   wszystkie trzy, które zostają po kotle (zebrania, racje, meble na opał), dają 24,0, bez mebli 25,2, bez mebli i zebrań
   (zostają racje) 24,8, a sam kocioł 26,8 (Przymorze 34,3: 2 z 10 dożyły dnia 45; kocioł plus racje przy głodzie 26,3).
   Pośrednie warianty mieszczą się w szumie, ale najwyżej jest sam kocioł, na każdym demie nie gorzej niż wszystkie trzy.
   Uchwały te dokładają wkurzenie (racje +0,4 dziennie, meble +2 od razu i +0,1 dziennie) albo opóźniają pracę (zebrania:
   od 9:00), a silnik nie ma z nich pożytku: nie pali mebli, a racje nie uratowały nikogo przed głodem (Przymorze 11–15, dni
   14–17: z racjami najedzenie o 6:00 39,9 i 47 godzin głodu na przebieg, bez samych racji 48,0 i 26).
   Powrót do „pierwszej dozwolonej”, ale bez racji (orzeczenie kontrolera: racje głodowe nigdy), to zamiana ostatniego
   `return null` na `return mozna.find((id) => id !== 'u_racje') ?? null` (na kodzie końcowym 26,5 wobec 27,7 dnia przy samym
   kotle). Test w prawdziwej grze w tests/unit/ai-okna.test.ts pilnuje też, że nic poza kotłem nie jest podpisane, więc przy
   powrocie trzeba go poluzować do samego braku racji.

   Moduł niczego nie losuje, nie czyta zegara, nie importuje DOM ani modułów Node ani niczego z tests/ i tools/. Importuje
   src/gov (zarząd) i src/ai/jedzenie.ts (miary zapasu); gra.ts, silnik.ts i warstwy importują się nawzajem, ale tu nikt nie
   używa cudzego importu przy ładowaniu modułu, tylko w ciele funkcji. */

import { hashString, mulberry, type Rng, ri } from '../core/rng.ts';
import { type Gosc, type HaczykId, haczykiMozliwe, ZIMA, zgodnyGosc } from '../gov/goscie.ts';
import type { AktywnyGosc, GovEffects, GovInput, GovState, Prompt, StockDelta } from '../gov/typy.ts';
import { wizytaKarty } from '../gov/wizyta.ts';
import { chooseEvent, pending } from '../gov/zarzad.ts';
import { stacNaPrzyjecie, uchwalaNaGlod } from './jedzenie.ts';

type Wydarzenie = Extract<Prompt, { k: 'wydarzenie' }>;
type Uchwala = Extract<Prompt, { k: 'uchwala' }>;

/** Wagi oceny skutków: jeden miernik dla wszystkich wyborów w oknie. Liczby z planu, poza trzema dodatkami: `pozar` i `lata`
    (z pomiaru, nagłówek modułu) oraz `koniec` (bezpiecznik, nie z pomiaru: żaden wybór nie powinien kończyć gry). */
export const WAGI = {
  jedzenie: 3,
  drewno: 1,
  reszta: 0.5,
  zaufanie: 2,
  wkurzenie: -2,
  rana: -10,
  zgon: -50,
  przyjecie: 4,
  koniec: -1000,
  pozar: -15,
  lata: 6,
} as const;

/** ile kroków jednego okna wieloetapowego silnik odpowiada sam (potem odpowiedź domyślna z `krokGry`) */
export const MAX_KROKOW_OKNA = 4;

/** na ilu kopiach zarządu, każda z innym ziarnem generatora, silnik ocenia jeden wybór w wydarzeniu */
export const KOPII_OCENY = 3;

/** uchwała o wspólnym kotle (droga wspólnoty), pierwszy wybór pierwszego wieczoru */
const KOCIOL = 'u_kociol';

const zapasy = (s: Partial<StockDelta>): number =>
  (s.supplies ?? 0) * WAGI.jedzenie +
  (s.wood ?? 0) * WAGI.drewno +
  ((s.scrap ?? 0) + (s.parts ?? 0) + (s.meds ?? 0)) * WAGI.reszta;

/** rany wyboru: osoby ranne, chore, ugryzione i choroba odłożona na rano */
function rany(fx: GovEffects, po: GovState, i: GovInput): number {
  const zeSpadkiemZdrowia = new Set<string>();
  for (const n of fx.needs) if ((n.d.health ?? 0) < 0) zeSpadkiemZdrowia.add(n.id);
  // `fx.sick` to chorzy do rozdania: symulacja osłabia najzdrowszych z zarządu po jednym, więc więcej niż ludzi nie ma sensu
  const chorzy = Math.min(Math.max(0, fx.sick), i.people.length);
  const ugryzieni = (fx.bitten?.length ?? 0) + (fx.goscRozkaz ?? []).filter((r) => r.co === 'ugryziony').length;
  const rano = po.later.reduce((a, l) => a + (l.sick ?? 0), 0);
  return zeSpadkiemZdrowia.size + chorzy + ugryzieni + rano;
}

/** ludzie, którzy znikają z osady przez wybór */
const zgony = (fx: GovEffects): number => fx.leave.length + (fx.wyrzuc?.length ?? 0) + Math.max(0, -fx.residents);

/** ludzie, których wybór przyjmuje do osady: nowi w zarządzie, nowi mieszkańcy i żywi członkowie przyjętej grupy gościa */
function przyjeci(fx: GovEffects, i: GovInput): number {
  const grupy = (fx.goscRozkaz ?? [])
    .filter((r) => r.co === 'zostan' || r.co === 'zarzad')
    .reduce((a, r) => a + (i.goscie?.find((g) => g.id === r.id)?.zywi.length ?? 0), 0);
  return fx.join.length + Math.max(0, fx.residents) + grupy;
}

/** Ocena skutków wyboru (im wyżej, tym lepiej): `fx` to skutki z `chooseEvent`, `po` zarząd po wyborze (kopia), `i` wejście
    sprzed wyboru (zapas jedzenia i liczba głów do przyjęć). Wagi i składniki w nagłówku modułu. */
export function ocenSkutki(fx: GovEffects, po: GovState, i: GovInput): number {
  let ocena = zapasy(fx.stock);
  for (const l of po.later) ocena += zapasy(l.stock);
  ocena += WAGI.zaufanie * po.trust + WAGI.wkurzenie * po.anger;
  ocena += WAGI.rana * rany(fx, po, i);
  ocena += WAGI.zgon * zgony(fx);
  const nowi = przyjeci(fx, i);
  if (nowi > 0) ocena += (stacNaPrzyjecie(i, nowi) ? 1 : -1) * WAGI.przyjecie * nowi;
  if (po.over) ocena += WAGI.koniec;
  if (fx.fire) ocena += WAGI.pozar;
  ocena += WAGI.lata * fx.patch;
  return ocena;
}

/** Indeks najwyższej oceny, przy remisie niższy; wpis `null` to wybór niedozwolony i nie wygrywa. Bez żadnej oceny 0. */
export function najlepszyIndeks(oceny: readonly (number | null)[]): number {
  let najlepszy = -1;
  oceny.forEach((o, k) => {
    if (o !== null && (najlepszy < 0 || o > (oceny[najlepszy] as number))) najlepszy = k;
  });
  return Math.max(0, najlepszy);
}

/** Ziarno generatora kopii nr `n` dla okna `id` w chwili `tick`: skrót tekstu (FNV-1a), więc bez losowania i bez zegara, i bez
    związku ze stanem prawdziwego generatora zarządu. */
export function ziarnoKopii(id: string, tick: number, n: number): number {
  return Number.parseInt(hashString(`${id}|${tick}|${n}`), 16) | 0;
}

/** Ukryte rzuty kart wydarzeń: pola danych karty (`GovState.ev.active.d`), które karta losuje przy tworzeniu i nigdzie nie
    pokazuje, i szansa na `true` z jej `make` (src/gov/tresc.ts): `halas.cat` 0,45 (kot, nie włamywacz) i `krzyk.help` 0,5
    (sąsiad naprawdę prosi o pomoc). Karta `wedrowiec` ma w `make` jeszcze `thief` 0,3, ale jej waga to 0 w obu trybach (nie
    wypada, wraca jako gość z klocków), więc wpisu nie ma. To kopia stałych z kart: zmiana szansy w karcie wymaga zmiany także
    tutaj, a test dryfu w tests/unit/ai-okna.test.ts to wykryje. Haczyk gościa ma osobną drogę (`przelosujHaczyk`). */
export const UKRYTE_RZUTY: Readonly<Record<string, readonly { pole: string; szansa: number }[]>> = {
  halas: [{ pole: 'cat', szansa: 0.45 }],
  krzyk: [{ pole: 'help', szansa: 0.5 }],
};

/** Wagi haczyka gościa, kopia prywatnego `BAZA_HACZYK` z src/gov/goscie.ts (mnożniki z `wagiHaczyka` są w `wagaHaczyka`):
    uczciwy gość jest najczęstszy, kłamca i ugryziony rzadsi, chory i ścigany najrzadsi. Zmiana wag w generatorze gości
    wymaga zmiany także tutaj, a test dryfu w tests/unit/ai-okna.test.ts to wykryje. */
const WAGA_HACZYKA: Readonly<Record<HaczykId, number>> = {
  prawda: 4,
  klamie: 1.4,
  chory: 1,
  poscig: 1,
  ugryziony: 1.4,
};

/** zapas jedzenia, powyżej którego kłamca trafia się częściej (×1,5): w generatorze `ctx.zapasy > 20` */
const ZAPAS_KLAMCY = 20;

/** Waga haczyka `h` gościa `g` przy tym wejściu: wagi bazowe, kłamca częściej przy zapasie, chory dwa razy częściej zimą
    i dwa razy częściej, gdy gość jest z natury chory (karta mówi, kim jest). Bez tego, czego gracz wiedzieć nie może
    (narrator po długim spokoju, `ostrzej`). Eksportowana dla testu dryfu względem generatora gości. */
export function wagaHaczyka(h: HaczykId, g: Gosc, i: GovInput): number {
  let w = WAGA_HACZYKA[h];
  if (h === 'klamie' && i.stock.supplies > ZAPAS_KLAMCY) w *= 1.5;
  if (h === 'chory') {
    if (i.season === ZIMA) w *= 2;
    if (g.kto === 'chory') w *= 2;
  }
  return w;
}

/** Jedno losowanie z wag; opcje z wagą ≤ 0 odpadają. */
function losujWazone<T>(opcje: readonly (readonly [T, number])[], los: Rng): T {
  const suma = opcje.reduce((a, [, w]) => a + Math.max(0, w), 0);
  let r = los() * suma;
  let ostatnia = opcje[0][0];
  for (const [v, w] of opcje) {
    if (w <= 0) continue;
    ostatnia = v;
    r -= w;
    if (r < 0) return v;
  }
  return ostatnia;
}

/** Haczyk gościa pod bramą losowany od nowa na kopii: z haczyków, które gość tego rodzaju może mieć w tym trybie i które
    zgadzają się z tym, co widać na karcie (`zgodnyGosc`: czego chce i co ma; gdyby dane gościa były niespójne, ze wszystkich
    możliwych), bez ugryzienia, jeśli „Obejrzeć ręce” pokazało czyste ręce. Zostaje bez zmian, gdy haczyk jest odsłonięty
    (obejrzane ręce ugryzionego) albo nie ma z czego losować (ktoś z ugryzionym bliskim ma zawsze ugryzienie). Dotyczy tylko
    karty `gosc` z wizytą, którą zarząd prowadzi (karty z 0.3 z gościem mają haczyk „prawda”, a „Złapany” ma kłamcę na wierzchu). */
function przelosujHaczyk(kopia: GovState, i: GovInput, los: Rng): void {
  const ev = kopia.ev.active;
  const aktywny: AktywnyGosc | undefined = kopia.goscie?.aktywny;
  if (ev?.id !== 'gosc' || !aktywny || wizytaKarty(ev) !== aktywny.gosc.id) return;
  if (aktywny.obejrzano === 'ugryziony') return;
  const g = aktywny.gosc;
  const tryb = kopia.mode ?? 'zwykly';
  const mozliwe = haczykiMozliwe(g.kto, tryb).filter((h) => !(aktywny.obejrzano === 'czysty' && h === 'ugryziony'));
  const zgodne = mozliwe.filter((h) => zgodnyGosc({ ...g, haczyk: h }, tryb));
  const kandydaci = zgodne.length ? zgodne : mozliwe;
  if (kandydaci.length < 2) return;
  g.haczyk = losujWazone(
    kandydaci.map((h) => [h, wagaHaczyka(h, g, i)] as const),
    los,
  );
  if (g.haczyk === 'ugryziony') g.ugryziony = ri(0, g.osoby.length - 1, los);
  else delete g.ugryziony;
}

/** Przelosowuje na kopii zarządu ukryte rzuty bieżącej karty (`UKRYTE_RZUTY` i haczyk gościa), żeby ocena wyboru nie znała
    tego, czego gracz wiedzieć nie może. Rzuty odsłonięte (przez kartę albo poprzedni krok okna) zostają. Kolejność losowań
    jest stała (najpierw pola karty, potem haczyk), więc ten sam `los` daje tę samą kopię. */
export function przelosujUkryte(kopia: GovState, i: GovInput, los: Rng): void {
  const ev = kopia.ev.active;
  if (!ev) return;
  if (ev.d && typeof ev.d === 'object') for (const r of UKRYTE_RZUTY[ev.id] ?? []) ev.d[r.pole] = los() < r.szansa;
  przelosujHaczyk(kopia, i, los);
}

/** Ocena wyboru `k` w oknie `p`: średnia ocen skutków z `KOPII_OCENY` kopii zarządu, każda z ziarnem pochodnym (`ziarnoKopii`)
    zamiast stanu prawdziwego generatora i z ukrytymi rzutami karty rzuconymi od nowa (`przelosujUkryte`, z drugiego ziarna
    pochodnego), więc silnik nie zna wyniku losowań ani tego, czego karta nie pokazuje. Skutek bez losowania daje na każdej
    kopii tę samą ocenę i wtedy to ona (bez dzielenia). `null`: wybór niedozwolony. */
export function ocenaWyboru(gov: GovState, i: GovInput, p: Wydarzenie, k: number): number | null {
  if (!p.choices[k]?.ok) return null;
  const oceny: number[] = [];
  for (let n = 0; n < KOPII_OCENY; n++) {
    const kopia = structuredClone(gov);
    kopia.rng.s = ziarnoKopii(p.id, i.tick, n);
    przelosujUkryte(kopia, i, mulberry(ziarnoKopii(`${p.id}|ukryte`, i.tick, n)));
    oceny.push(ocenSkutki(chooseEvent(kopia, i, k), kopia, i));
  }
  return oceny.every((o) => o === oceny[0]) ? oceny[0] : oceny.reduce((suma, o) => suma + o, 0) / oceny.length;
}

/** Wybór w wydarzeniu: każdy dozwolony wybór oceniony na kopiach zarządu bez znajomości losu (`ocenaWyboru`), najlepsza ocena,
    przy remisie niższy indeks. Prawdziwy zarząd i wejście zostają bez zmian. */
export function wyborWydarzenia(gov: GovState, i: GovInput, p: Wydarzenie): number {
  return najlepszyIndeks(p.choices.map((_, k) => ocenaWyboru(gov, i, p, k)));
}

/** Odpowiedź na okno wydarzenia razem z kolejnymi krokami: wybór (`wybierz`, czyli ręka gry), a gdy zarząd pyta dalej o to
    samo okno (wybór z `zostaje`), kolejny wybór według nowego okna, najwyżej `MAX_KROKOW_OKNA`. `wejscie` daje bieżące
    wejście zarządu (po każdym wyborze zmienia się stan gry). Okno, które po wyborze się nie zmieniło, kończy odpowiedź:
    wybór się nie udał i ponawianie nic by nie dało. */
export function odpowiedzNaWydarzenie(
  gov: GovState,
  wejscie: () => GovInput,
  p: Wydarzenie,
  wybierz: (k: number) => void,
): void {
  let okno = p;
  for (let krok = 0; krok < MAX_KROKOW_OKNA; krok++) {
    wybierz(wyborWydarzenia(gov, wejscie(), okno));
    const dalej = pending(gov, wejscie());
    if (dalej?.k !== 'wydarzenie' || dalej.id !== okno.id || JSON.stringify(dalej) === JSON.stringify(okno)) return;
    okno = dalej;
  }
}

/** Uchwała według potrzeb: w pierwszym oknie wspólny kocioł, potem kocioł przy głodzie (`uchwalaNaGlod`); `null`, gdy nic nie
    jest potrzebne albo potrzebna uchwała nie jest dozwolona (zarząd nic nie uchwala). Warty ani bramy na kłódkę silnik nie
    podpisuje: po kotle z pierwszego okna obie są zablokowane (nagłówek modułu). */
export function wyborUchwaly(i: GovInput, p: Uchwala): string | null {
  const mozna = p.options.filter((o) => o.s === 'ok').map((o) => o.id);
  if (p.first && mozna.includes(KOCIOL)) return KOCIOL;
  const naGlod = uchwalaNaGlod(i, p);
  if (naGlod) return naGlod;
  return null;
}
