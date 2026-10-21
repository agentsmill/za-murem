/* Pies i kot jako pionki (docs/superpowers/specs/2026-10-19-wydarzenia-design.md, sekcja 3, „Pies i kot”): stałe i czyste
   funkcje dla Sim (src/sim/sim.ts) i rysowania. Karta „Pies przy siatce” (flaga `dog`) i „Kot w piwnicy” (flaga `cat`)
   w zarządzie nie kończą się na kartce: zarząd wysyła `GovEffects.zwierze`, a symulacja wystawia pionek (polecenie
   'zwierze'). Właścicielem życia zwierzęcia jest symulacja: `SimState.zwierzeta` mówi, że pies żyje albo zginął
   (`zginal`) i że kot żyje; zarząd tylko to czyta (`GovInput.zwierzeta`).

   Pies. Pojawia się za siatką, przy kafelku na zewnątrz bramy (`outsideOf(gateTiles)[0]`, tak jak goście), i wchodzi
   bramą: zamknięta albo na kłódkę go nie zatrzymuje (przeciska się pod nią, więc ma warstwę zarządu, a reszta siatki,
   także dziury, jest dla niego zamknięta). Za dnia snuje się po podwórku najwyżej PIES_OBSZAR m od środka bramy, nocą
   (22:00–6:00, jak ludzie i goście) leży przy bramie od środka, dwa kroki od niej (obok stoi warta, a skrzydło bramy
   zasłaniałoby go). Gdy wróg (szabrownik, szwendacz, wrogi człowiek; nie
   gość i nie wędrowiec) jest w promieniu SZCZEK_ZASIEG m, szczeka co najwyżej raz na SZCZEK_CD ticków (5 s): napis nad
   psem widać SZCZEK_NAPIS ticków (`SimState.szczek.tick` to tick ostatniego szczeknięcia), a w trybie zombie szczekanie
   to też hałas SZCZEK_HALAS m (`addNoise`: szwendacze w tym promieniu idą na dźwięk). Pies jest ofiarą szwendaczy jak
   człowiek (`isPrey`) i ma PIES_HP życia; po śmierci nie zostaje po nim nic poza wpisem `zginal` (bez zwłok, bez
   wstawania, bez wpisu zmarłych i bez żałoby osiedla).

   Kot. Pojawia się przed kozą zarządu, tam śpi nocą, za dnia chodzi po mieszkaniu zarządu. Nie jest ofiarą szwendaczy
   i nie ginie.

   Oba nie mają potrzeb (`needs` null), nie biorą poleceń i nie są nigdzie liczone jako ludzie: nie ma ich w mieszkańcach,
   zmarłych, odczycie ludności ani w statystykach. Praca 'zwierze' (`what`: 'wchodzi', 'wloczy', 'stoi', 'idzie', 'lezy')
   ma `tile` −1, żeby nie rezerwowała kafelków innym. Losowanie tylko ze `st.rng`, bez trygonometrii i `Math.hypot`. */

import { tx } from '../core/jezyk.ts';
import { TICKS_PER_SECOND } from './clock.ts';

export type { ZwierzetaStan } from '../gov/typy.ts';

/** rodzaje pionków, które są zwierzętami */
export type RodzajZwierzecia = 'pies' | 'kot';
const ZWIERZETA: ReadonlySet<string> = new Set<RodzajZwierzecia>(['pies', 'kot']);

/** czy rodzaj pionka to zwierzę (pies albo kot): nie człowiek, nie osoba, bez potrzeb */
export const jestZwierzeciem = (kind: string): kind is RodzajZwierzecia => ZWIERZETA.has(kind);

/** życie psa (szwendacz gryzie za 15, więc trzy trafienia) */
export const PIES_HP = 40;
/** wróg w tym promieniu (m) od psa: pies szczeka */
export const SZCZEK_ZASIEG = 15;
/** w trybie zombie szczekanie jest hałasem o tym promieniu (m) */
export const SZCZEK_HALAS = 12;
/** najkrótsza przerwa między szczeknięciami (ticki, 5 s): hałas nie dochodzi co krok i napis nie migocze */
export const SZCZEK_CD = 5 * TICKS_PER_SECOND;
/** napis „Hau!” widać tyle ticków od szczeknięcia (2 s) */
export const SZCZEK_NAPIS = 2 * TICKS_PER_SECOND;
/** za dnia pies kręci się najwyżej tyle metrów od środka bramy (od strony podwórka) */
export const PIES_OBSZAR = 10;
/** prędkość względem człowieka: pies truchta, kot człapie */
export const PIES_TEMPO = 1.3;
export const KOT_TEMPO = 0.8;

/** napis nad szczekającym psem */
export const NAPIS_SZCZEKU = tx('Hau!', 'Woof!');
/** imię psa z karty „Pies przy siatce” (w kronice zarządu i w teksty zgonu) */
export const PIES_IMIE = tx('Abonament', 'Subscription');

/** czy napis szczekania jeszcze widać: ostatnie szczeknięcie w `szczek.tick` było nie dawniej niż SZCZEK_NAPIS temu */
export const napisSzczekuWidac = (szczek: { tick: number } | undefined, tick: number): boolean =>
  !!szczek && tick >= szczek.tick && tick - szczek.tick < SZCZEK_NAPIS;
