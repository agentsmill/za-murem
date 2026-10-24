/* Warstwa jedzenia silnika osady AI, etap 1 (docs/superpowers/plans/2026-10-21-osada-ai-etap-1.md, zadanie 4).
   Powód: po ogrzanej sypialni gry kończy głód (dni 19–29, docs/ocena/2026-10-20-zima-w-grach-botow.md, sekcja 7 punkt 4):
   zapas startowy (40 porcji) schodzi do zera około 9. dnia, zarząd traci zdrowie (z 90 do 0 w pięć dni), a bez zdrowych
   nie ma ani dyżuru przy kozie, ani warty, więc zimno wraca i wkurzenie rośnie do odwołania.

   Miara zapasu to porcje surowe i ugotowane (`GovStock.supplies` i `meals`) na głowę, czyli na osobę zarządu
   (`jedzenieNaGlowe`). Z zapasu zarządu jedzą tylko osoby zarządu: mieszkańcy siedziby jedzą własne porcje i nie mają głodu
   w symulacji (garnek `potTarget` liczy samo rdzeń), a symulacja liczy tak samo okazję do werbunku (`okazjaWerbunku`:
   porcje na osobę z zarządu). Do zadania 7 mieszkańcy liczyli się w głowach (mieszkańcy przechodzą do zarządu przy awansach, a w zadaniu 4
   wynik bez nich mieścił się w szumie), ale w Przymorzu i Lanciego jest ich 11–15 na 5–7 osób zarządu, więc zapas „na głowę”
   wychodził 2–3 razy mniejszy, niż jest naprawdę: werbunek, przyjęcia i wyprawy po jedzenie uznawały zapas za zbyt mały. Z głowami
   równymi osobom zarządu, razem z zaproszeniami bez wymogu wolnego łóżka (src/ai/rozwoj.ts), zarząd rośnie z 6–7 do 9–11 osób,
   a średni dzień końca gry (żyje = 45) rośnie o 2,4 ± 0,8 (120 przebiegów, ziarna 11–50). `stacNaPrzyjecie` mówi, czy po
   przyjęciu n osób zostaną co najmniej 2 porcje na osobę zarządu (korzysta z niego warstwa okien z zadania 5 przy wydarzeniach
   z przyjęciem, ocena traktuje przy tym przyjętych mieszkańców jak jedzących: ostrożnie).

   `turaJedzenia` idzie co 30 sekund przy ekranie (pilnuje tego `silnik` w src/ai/silnik.ts) i robi dwie rzeczy:
   - wyprawa dzienna po jedzenie, gdy zapasu jest poniżej 2 porcji na głowę. Idzie tą drogą co gracz z mapy miasta
     (`Rece.wyslij` z celem z `celZMiejsca` miejsca z `GovInput.okolica`), więc obowiązują te same zasady wysyłki
     (`powodOdmowy`: zapas miejsca, mapa lokalna, ktoś już tam idzie). Warstwa dokłada swoje: wyprawa wychodzi tylko między 8:00
     a 15:00 (wraca przed zmrokiem: najdłuższa, jednej osoby do miejsca w zasięgu mapy, trwa niecałe cztery godziny), jedna
     naraz, z dwiema najzdrowszymi osobami, które dadzą radę (`canGo`). Wyjątek: wyprawa nie zabiera ostatniej osoby ze
     zdrowiem co najmniej 40 (`ZDROWIE_DYZURU` z zima.ts), bo ta tej nocy czuwa przy kozie; idą wtedy słabsi, a gdy może iść
     tylko jedna osoba, idzie sama (głód nie czeka na drugą; pomiar: z obowiązkowymi dwiema osobami wynik w granicach szumu).
     Cel to miejsce, z którego da się wynieść jedzenie. Spodziewany łup dwóch osób to środek przedziału łupu razy 1,6
     (mnożnik za dwie osoby w `rozliczWyprawe`), ucięty do tego, co zostało w miejscu, i do udźwigu. Z miejsc, z których
     wyjdzie co najmniej `MIN_LUP` porcji (sklepy spożywcze), wybiera najbliższe; gdy takich nie ma, to z największym łupem
     (sklepik, stacja, ogrodnik). Najbliższe miejsce poza mapą lokalną bywa sklepikiem z jedną porcją na wyprawę, a trzydzieści
     metrów dalej stoi sklep spożywczy z siedmioma;
   - od 2. dnia jeden ogródek na podwórku, gdy go nie ma i gdy plan pracowni nie czeka na deski. Ogródek daje 2 porcje na
     3 doby jesienią, zimą nic, wiosną 4, latem 6, więc to dodatek na dalszą grę, a nie ratunek na pierwszy głód. Deski mają
     najpierw iść na pracownię (z niej koza z beczki w sypialni): w Zielonkach, gdzie desek jest mało, ogródek stawiany razem
     z planem pracowni zjadał je (pracowni brakowało części, ogródkowi nie) i pracownia nie stawała do końca gry (pomiar:
     Zielonki 17,2 dnia zamiast 20,0).
   Kuchnia społeczna (15% mniej jedzenia na osobę) nie jest budowana: pomiar +0,2 dnia za 14 złomu i 10 części.

   `uchwalaNaGlod` nie jest częścią tury warstwy, tylko pomocnikiem wyboru uchwały (`wyborUchwaly` w src/ai/okna.ts): przy
   mniej niż 1 porcji na głowę mówi, że uchwałą jest wspólny kocioł (`u_kociol`: jedzenie rozdziela się po równo, posiłki
   o stałych porach, zaufanie +2), o ile jest dozwolony. Kocioł jest na ścieżce „wspólnota”, a `u_warty` na ścieżce „porządek”:
   kto podpisał jedną, ma drugą zablokowaną do końca gry. Silnik podpisuje kocioł już w pierwszym oknie uchwał (tam głodu jeszcze
   nie ma, więc robi to `wyborUchwaly` bez względu na zapas), więc w jego grze reguła głodu nie ma już czego podpisywać; nadrabia
   dopiero wtedy, gdy kocioł nie został podpisany w pierwszym oknie, a ścieżka nie jest jeszcze wybrana.

   Warstwa czyta stan gry jak gracz (`wejscie`, `SimState`, świat) i działa tylko rękami (`Rece`); nie ma własnego stanu
   poza stanem gry (ogródek i wyprawy wynikają z niego), niczego nie losuje i nie czyta zegara. Moduły gra.ts, silnik.ts
   i jedzenie.ts importują się nawzajem; cykl jest bezpieczny, bo nikt nie używa cudzego importu przy ładowaniu modułu, tylko
   w ciele funkcji. */

import { powodOdmowy } from '../gov/dzienne.ts';
import type { GovInput, Prompt } from '../gov/typy.ts';
import { type Cel, celZMiejsca, UDZWIG_NA_OSOBE, wDrodze, zostaloZMiejsca } from '../gov/wyprawy.ts';
import { naMapieLokalnej } from '../world/miasto.ts';
import { type GraAi, type Rece, wejscie } from './gra.ts';
import { miejsceNa } from './miejsca.ts';
import { ZDROWIE_DYZURU } from './zima.ts';

/** poniżej tylu porcji na głowę idzie wyprawa po jedzenie, a po przyjęciu zostaje ich co najmniej tyle */
export const MIN_NA_GLOWE = 2;
/** poniżej tylu porcji na głowę silnik woli uchwałę o wspólnym kotle */
export const GLOD_NA_GLOWE = 1;
/** uchwała o wspólnym kotle (src/gov/tresc.ts) */
const KOCIOL = 'u_kociol';
/** ogródek od tego dnia (dzień 1 to samouczek i pierwszy wieczór) */
const OGRODEK_OD_DNIA = 2;
/** wyprawy wychodzą od 8:00 do 14:59: wracają przed zmrokiem, a o 20:00 gra karta nocy */
const WYPRAWA_OD_GODZINY = 8;
const WYPRAWA_DO_GODZINY = 15;
/** ile osób idzie na wyprawę: dwie dają łup ×1,6, krótszą drogę przeszukania i mniejsze ryzyko (`rozliczWyprawe`) */
const OSOB_NA_WYPRAWE = 2;
/** mnożnik łupu za dwie osoby i więcej w `rozliczWyprawe` (src/gov/noc.ts) */
const MNOZNIK_LUPU_ZA_DWIE_OSOBY = 1.6;
/** miejsce, z którego da się wynieść co najmniej tyle porcji, jest „z jedzeniem”: bliższe, ale ubogie ustępuje mu miejsca */
const MIN_LUP = 3;

const porcje = (i: GovInput): number => i.stock.supplies + (i.stock.meals ?? 0);
/** głowy: osoby zarządu, czyli ci, którzy jedzą z zapasu zarządu (mieszkańcy siedziby jedzą własne porcje) */
const glowy = (i: GovInput): number => i.people.length;

/** Porcje surowe i ugotowane w zapasie na osobę zarządu. */
export function jedzenieNaGlowe(i: GovInput): number {
  return porcje(i) / Math.max(1, glowy(i));
}

/** Czy przyjąć `n` nowych osób do zarządu: po przyjęciu co najmniej `MIN_NA_GLOWE` porcje na osobę zarządu. */
export function stacNaPrzyjecie(i: GovInput, n: number): boolean {
  return porcje(i) >= MIN_NA_GLOWE * (glowy(i) + n);
}

/** Uchwała o wspólnym kotle, gdy jedzenia jest poniżej 1 porcji na głowę i kocioł jest do podpisania; inaczej null. */
export function uchwalaNaGlod(i: GovInput, p: Extract<Prompt, { k: 'uchwala' }>): string | null {
  if (jedzenieNaGlowe(i) >= GLOD_NA_GLOWE) return null;
  return p.options.some((o) => o.id === KOCIOL && o.s === 'ok') ? KOCIOL : null;
}

/** Ogródek na podwórku od 2. dnia, gdy nie stoi ani nie czeka plan. */
function turaOgrodka(g: GraAi, r: Rece, i: GovInput): void {
  const st = g.sim.st;
  if (i.day < OGRODEK_OD_DNIA) return;
  if (st.things.some((t) => t.kind === 'ogrodek') || st.builds.some((b) => b.kind === 'ogrodek')) return;
  // deski mają najpierw iść na pracownię (z niej koza z beczki w sypialni): ogródek zabrałby je jej w świecie, w którym
  // ich mało (Zielonki), i zima zostałaby bez ogrzanej sypialni
  if (st.builds.some((b) => b.kind === 'pracownia')) return;
  const miejsce = miejsceNa(st, g.w, 'ogrodek');
  if (miejsce) r.polecenie({ t: 'build', ids: [], kind: 'ogrodek', ...miejsce });
}

/** Ile porcji przyniosą z miejsca dwie osoby: środek przedziału łupu razy 1,6, najwyżej tyle, ile zostało i ile unoszą. */
function spodziewanyLup(g: GraAi, cel: Cel): number {
  const przedzial = cel.lup.supplies;
  if (!przedzial) return 0;
  const srednia = ((przedzial[0] + przedzial[1]) / 2) * MNOZNIK_LUPU_ZA_DWIE_OSOBY;
  return Math.min(srednia, zostaloZMiejsca(g.gov, cel), UDZWIG_NA_OSOBE * OSOB_NA_WYPRAWE);
}

/** bliższe miejsce wygrywa, przy tej samej odległości mniejszy klucz (tak samo porządkuje cele zarząd) */
const blizej = (a: Cel, b: Cel): boolean => a.odl < b.odl || (a.odl === b.odl && a.klucz < b.klucz);

/** Cel wyprawy po jedzenie: najbliższe miejsce z łupem co najmniej `MIN_LUP`, a gdy takiego nie ma, to z największym łupem
    (przy remisie bliższe). Miejsca, do których zarząd nie wyśle wyprawy (mapa lokalna, wyczerpane, ktoś już tam idzie),
    odpadają przez `powodOdmowy`. */
function celWyprawy(g: GraAi, i: GovInput): Cel | null {
  let najblizsze: { cel: Cel; lup: number } | null = null;
  let najobfitsze: { cel: Cel; lup: number } | null = null;
  for (const m of i.okolica ?? []) {
    if (naMapieLokalnej(m)) continue;
    const cel = celZMiejsca(m);
    const lup = spodziewanyLup(g, cel);
    if (lup <= 0 || powodOdmowy(g.gov, i, cel)) continue;
    if (lup >= MIN_LUP && (!najblizsze || blizej(cel, najblizsze.cel))) najblizsze = { cel, lup };
    if (!najobfitsze || lup > najobfitsze.lup || (lup === najobfitsze.lup && blizej(cel, najobfitsze.cel)))
      najobfitsze = { cel, lup };
  }
  return (najblizsze ?? najobfitsze)?.cel ?? null;
}

/** Osoby na wyprawę: najzdrowsze spośród tych, które przejdą zasady wysyłki, do dwóch, ale nie ta, która jest ostatnią
    zdrową (zdrowie co najmniej `ZDROWIE_DYZURU`) w domu: ona tej nocy czuwa przy kozie. Przy remisie zdrowia mniejsze id. */
function ekipa(g: GraAi, i: GovInput, cel: Cel): string[] {
  const dyzurni = i.people.filter((p) => !p.away && !wDrodze(g.gov, p.id) && p.needs.health >= ZDROWIE_DYZURU);
  const chetni = i.people
    .filter((p) => !powodOdmowy(g.gov, i, cel, [p.id]))
    .sort((a, b) => b.needs.health - a.needs.health || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const ids: string[] = [];
  for (const p of chetni) {
    if (ids.length >= OSOB_NA_WYPRAWE) break;
    // wyprawa zabrałaby ostatnią zdrową osobę z domu: dyżur przy kozie zostałby bez nikogo
    const zabieraOstatniego =
      dyzurni.some((d) => d.id === p.id) && dyzurni.every((d) => d.id === p.id || ids.includes(d.id));
    if (!zabieraOstatniego) ids.push(p.id);
  }
  return ids;
}

/** Wyprawa dzienna po jedzenie: poniżej `MIN_NA_GLOWE` porcji na głowę, między 8:00 a 15:00, gdy nikt nie jest w drodze. */
function turaWyprawy(g: GraAi, r: Rece, i: GovInput): void {
  if (jedzenieNaGlowe(i) >= MIN_NA_GLOWE) return;
  if (i.hour < WYPRAWA_OD_GODZINY || i.hour >= WYPRAWA_DO_GODZINY) return;
  if (!g.gov.miasto || g.gov.wyprawy?.length) return;
  const cel = celWyprawy(g, i);
  if (!cel) return;
  const ids = ekipa(g, i, cel);
  if (ids.length) r.wyslij(cel, ids);
}

/** Jedna tura warstwy (co 30 s przy ekranie): wyprawa po jedzenie, gdy zapasu brakuje, i ogródek na podwórku. */
export function turaJedzenia(g: GraAi, r: Rece): void {
  const i = wejscie(g);
  turaWyprawy(g, r, i);
  turaOgrodka(g, r, i);
}
