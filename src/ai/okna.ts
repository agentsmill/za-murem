/* Okna zarządu silnika osady AI, etap 1 (docs/superpowers/plans/2026-10-21-osada-ai-etap-1.md, zadanie 5): wybór w wydarzeniu
   przez ocenę skutków na kopii zarządu i uchwała według potrzeb. Karta nocy ma własną odpowiedź w src/ai/silnik.ts (warta,
   dyżur przy kozie), raport i epilog zwycięstwa idą odpowiedzią domyślną z src/ai/gra.ts.

   Wydarzenie. Skutki wyboru zna tylko zarząd, który je liczy (`chooseEvent` zmienia stan zarządu, w tym jego ziarno, i
   oddaje `GovEffects`), więc silnik próbuje każdy dozwolony wybór na głębokiej kopii zarządu (`structuredClone`), ocenia go
   (`ocenSkutki`) i wybiera najlepszy; prawdziwy zarząd i wejście zostają nietknięte. Kopia startuje z tym samym ziarnem
   i stanem co prawdziwy zarząd, więc prawdziwy wybór da dokładnie to, co ocena na kopii (także losowania w skutkach, np.
   30% szansy, że przegrany w kłótni odejdzie). Przy remisie wygrywa niższy indeks (kolejność z okna). Okno bez dozwolonego
   wyboru daje 0: wybór się nie uda, a okno dostanie odpowiedź domyślną albo zostanie zawieszone (src/ai/gra.ts).

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
   Do wag z planu dochodzą dwie z pomiaru (30 przebiegów, ziarna 11–20, trzy dema; liczby to średni dzień końca gry):
   - pożar −15 (`GovEffects.fire`: spalony mebel przy kozie, strach i gorszy nastrój wszystkich). Karta „Pożar od kozy” wraca co
     dobę, a „Ewakuować klatkę” kosztuje według planu tylko wkurzenie +2, więc wygrywała z „Gasić wszyscy razem” (drewno −3
     i jedna osoba chora, razem −13): silnik z samymi wagami z planu kończył w dniu 17,6 wobec 22,9 przy odpowiedzi domyślnej,
     z wagą pożaru 24,0;
   - łata na dziurę +6 za dziurę (`GovEffects.patch`: karta „Ślady przy siatce” pozwala załatać dziurę za 2 złomu). Bez tej wagi
     silnik wieszał puszki, dziura zostawała otwarta, a automat pracy łatał ją deskami (3–4 sztuki), których w Zielonkach brakuje
     na pracownię (14): pracownia i koza z beczki nie stawały w 6 z 10 przebiegów. Z wagą łaty 31,3 wobec 30,4 (przy kotle
     jako jedynej uchwale), a w Zielonkach 11–15 pracownia i koza stoją w 5 z 5.
   Pozostałe skutki, których ocena nie widzi (książki na półkę, nastroje chwilowe, potrzeby osób, kłamca wpuszczony na noc),
   pomiar nie rozróżnił (w granicach szumu), więc zostają niewycenione do strojenia.

   Okno wieloetapowe. Wybór z `GChoice.zostaje` (np. „Obejrzeć ręce” przy gościu w trybie zombie) nie zamyka okna: zarząd
   pyta dalej o to samo okno (ten sam rodzaj i identyfikator), z nowym tekstem i wyborami. `odpowiedzNaWydarzenie` czyta
   `pending` po każdym wyborze i odpowiada na kolejny krok (najwyżej `MAX_KROKOW_OKNA`; okno, które po wyborze się nie
   zmieniło, kończy odpowiedź), a okno, które mimo to zostanie, dostanie odpowiedź domyślną od `krokGry`.

   Uchwała (`wyborUchwaly`). W pierwszym oknie wspólny kocioł (droga wspólnoty): `u_warty` należy do drogi porządku i
   podpisana blokuje kocioł do końca gry (src/gov/uchwaly.ts), a pierwszego wieczoru głodu jeszcze nie ma, więc reguła
   „głód → kocioł” nigdy by nie zadziałała. Potem tylko według potrzeb: głód (poniżej 1 porcji na głowę) to kocioł, słaba
   siatka (dziury) to warta i brama na kłódkę; zimno uchwały nie wybiera, bo żadna uchwała M1 nie grzeje (kocioł dzieli
   jedzenie, a ciepło dają kozy). Bez potrzeby `null`: zarząd nic nie uchwala. Plan i orzeczenie kontrolera kończyły regułę słowami
   „potem pierwsza dozwolona”, ale pomiar (30 przebiegów, ziarna 11–20, trzy dema, silnik z wagą pożaru) pokazał, że każda
   dodatkowa uchwała kosztuje życie: wszystkie trzy, które zostają po kotle (zebrania, racje, meble na opał), dają średni dzień
   końca 24,0, bez mebli 25,2, bez mebli i zebrań 26,6, a sam kocioł 30,4 (Przymorze 45,1: 2 z 10 dożyły dnia 45; kocioł plus
   racje przy głodzie 29,9). Uchwały te dokładają wkurzenie (racje +0,4 dziennie, meble +2 od razu i +0,1 dziennie) albo
   opóźniają pracę (zebrania: od 9:00), a silnik nie ma z nich pożytku (nie pali mebli, a racje nie uratowały nikogo przed głodem).
   Powrót do „pierwszej dozwolonej” to jedna linia: `return mozna[0] ?? null`.

   Moduł niczego nie losuje, nie czyta zegara, nie importuje DOM ani modułów Node ani niczego z tests/ i tools/. Importuje
   src/gov (zarząd) i src/ai/jedzenie.ts (miary zapasu); gra.ts, silnik.ts i warstwy importują się nawzajem, ale tu nikt nie
   używa cudzego importu przy ładowaniu modułu, tylko w ciele funkcji. */

import type { GovEffects, GovInput, GovState, Prompt, StockDelta } from '../gov/typy.ts';
import { chooseEvent, pending } from '../gov/zarzad.ts';
import { GLOD_NA_GLOWE, jedzenieNaGlowe, stacNaPrzyjecie, uchwalaNaGlod } from './jedzenie.ts';

type Wydarzenie = Extract<Prompt, { k: 'wydarzenie' }>;
type Uchwala = Extract<Prompt, { k: 'uchwala' }>;

/** Wagi oceny skutków: jeden miernik dla wszystkich wyborów w oknie. Liczby z planu, poza `koniec`, `pozar` i `lata` (dodane po pomiarze). */
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

/** uchwała o wspólnym kotle (droga wspólnoty), pierwszy wybór pierwszego wieczoru */
const KOCIOL = 'u_kociol';
/** uchwały na słabą siatkę: warta przy bramie, potem brama na kłódkę (wymaga warty) */
const NA_STRAZ = ['u_warty', 'u_brama'] as const;
/** siatka jest słaba, gdy ma dziury albo wytrzymałość poniżej tej wartości (0–1) */
const SLABA_SIATKA = 0.5;

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

/** Wybór w wydarzeniu: każdy dozwolony wybór na kopii zarządu (`structuredClone`), najlepsza ocena skutków, przy remisie
    niższy indeks. Prawdziwy zarząd i wejście zostają bez zmian. */
export function wyborWydarzenia(gov: GovState, i: GovInput, p: Wydarzenie): number {
  return najlepszyIndeks(
    p.choices.map((c, k) => {
      if (!c.ok) return null;
      const kopia = structuredClone(gov);
      return ocenSkutki(chooseEvent(kopia, i, k), kopia, i);
    }),
  );
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

/** czy siatka jest słaba: ma otwarte dziury albo wytrzymałość poniżej `SLABA_SIATKA` */
const slabaSiatka = (i: GovInput): boolean =>
  !!i.fence && (i.fence.holes.length > 0 || i.fence.durability < SLABA_SIATKA);

/** Uchwała według potrzeb: w pierwszym oknie wspólny kocioł, potem głód (kocioł) i słaba siatka (warta, brama na kłódkę); `null`,
    gdy nic nie jest potrzebne albo potrzebna uchwała nie jest dozwolona (zarząd nic nie uchwala). */
export function wyborUchwaly(i: GovInput, p: Uchwala): string | null {
  const mozna = p.options.filter((o) => o.s === 'ok').map((o) => o.id);
  const dozwolona = (ids: readonly string[]): string | undefined => ids.find((id) => mozna.includes(id));
  if (p.first) {
    const kociol = dozwolona([KOCIOL]);
    if (kociol) return kociol;
  }
  if (jedzenieNaGlowe(i) < GLOD_NA_GLOWE) {
    const naGlod = uchwalaNaGlod(i, p);
    if (naGlod) return naGlod;
  }
  if (slabaSiatka(i)) {
    const naStraz = dozwolona(NA_STRAZ);
    if (naStraz) return naStraz;
  }
  return null;
}
