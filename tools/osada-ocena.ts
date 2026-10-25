/* Ocena przebiegów osady AI (docs/superpowers/plans/2026-10-21-osada-ai-etap-1.md, zadania 2 i 3; miara bramki od zadania 2
   etapu 2, docs/superpowers/plans/2026-10-24-osada-ai-etap-2.md, z decyzji Mateusza z 24.10.2026): czyste funkcje bez gry
   i bez wyjścia na ekran, żeby werdykt dało się sprawdzić na syntetycznych przebiegach (tests/unit/ai-ocena.test.ts).
   Przebiegi liczy uprząż `npm run bot:osada` (tools/bot-osada.ts), a tu jest tylko to, co z nich wynika.

   Ocena nie zależy od tego, jak grano: przebiegi z gry z łańcuchami kart (domyślnie, jak w przeglądarce) i bez nich
   (`--bez-lancuchow` w uprzęży) liczą się tymi samymi progami, a to, jak grano, mówi nagłówek wyjścia uprzęży.

   Przebieg to jedna gra silnika: demo, ziarno, długość w dobach (`dni`; gra zaczyna się o 15:00 dnia 1, więc ostatni
   poranek wypada w dniu `dni + 1`), koniec gry (`gov.over`: pustka, odwołanie albo exodus, z dniem, w którym nastąpił;
   null: dożył końca) i poranki, czyli stan o 6:00 każdego dnia po kroku zarządu z tej chwili (od dnia 2; przebieg, który
   skończył się wcześniej, ma ich mniej). Numer dnia to dzień gry (`dayOf`), ten sam, który widzi gracz.

   Bramka etapu (decyzja 2 Mateusza, 24.10.2026), osobno na każdym demie, które może mieć osadę:
   - zarząd nie został odwołany (koniec gry, `gov.over`, z jakiejkolwiek przyczyny) wcześniej niż w dniu `odwolanieOdDnia`
     (30), albo wcale, w co najmniej `przezyc` z `zZiaren` przebiegów. Silnik gra dalej po odwołaniu w projekcie (osada żyje z
     nowym zarządem), więc „przeżycie 45 dni bez odwołania”, jak było w etapie 1, jest ostrzejsze niż to, czego potrzebuje gra;
   - pierwszy kamień ludności (10 osób, pierwszy poranek z co najmniej tyloma ludźmi pod zarządem) najpóźniej w dniu
     `kamien[1]` w co najmniej tylu samych przebiegach; dolna granica pasma `kamien[0]` jest uwagą, nie błędem: Przymorze
     i Lanciego startują z 9 osobami, więc kamień bywa tam już w pierwszych dniach i silnik nie ma jak (ani po co)
     opóźniać go do dnia 8.
   Budowle (`budowleStojace`) zostają w tabeli uprzęży, ale nie wchodzą do werdyktu: mierzą zasób desek, nie silnik (ze 300
   deskami na starcie 10, 8 i 6 budowli zamiast 4, 1 i 1, a 15 nie wychodzi nigdzie; raport etapu 1, rozdział 7.4).
   Przy innej liczbie ziaren niż `zZiaren` wymagana liczba przebiegów skaluje się proporcjonalnie (w górę), więc trzy
   ziarna muszą zaliczyć wszystkie, a dziesięć: osiem.
   Trzy wyjątki od oceny dema, żeby werdykt nie mówił o tym, czego nie zmierzono ani czego nie dotyczy:
   - demo, którego dom nie spełnia reguły miejsca osady (`swiatOsady` z geo domu, src/ai/kwadrat.ts), jest „poza regułą
     miejsca”: jego przebiegi są w tabeli, ale nie wchodzą do werdyktu (wpis w `pominiete`), bo osada nie stanie na takim
     miejscu; jeśli nie zostaje żadne demo do oceny, werdykt nie przechodzi (nie ma czego oceniać);
   - demo, w którym któryś przebieg się nie udał (proces padł, limit czasu, zawieszone okno zarządu, błąd decydenta), nie jest oceniane
     w ogóle: zostaje wpis „nie oceniono” w `nieocenione`, a pozostałe przebiegi tego dema nie liczą się do werdyktu
     (brakujący przebieg nie jest porażką silnika, tylko dziurą w pomiarze); werdykt jako całość nie przechodzi;
   - przy przebiegu krótszym niż dolna granica dnia kamienia (`--dni` poniżej `kamien[1]`) kryterium kamienia jest
     pomijane z uwagą, bo przebieg nie dociera do dnia, w którym kamień ma już być; przy przebiegu krótszym niż
     `odwolanieOdDnia` kryterium odwołania sprawdza tylko dni przebiegu, co mówi uwaga. */

import { budowleStojace } from '../src/sim/budowle.ts';

/** Stojące budowle osady (rodzaje z `BUILDS` poza obwodem: bez zasieków i barykady): jedna miara „budowli” w uprzęży, ta sama
    funkcja z src/sim/budowle.ts, której używa gra do tego, co zarząd widzi o osadzie (`OsadaGry.dlaZarzadu`). Liczba idzie do tabeli i
    poranków, a do werdyktu nie wchodzi (decyzja 2). Wystawiona stąd, żeby uprząż i jej testy importowały ją po staremu. */
export { budowleStojace };

/** Stan osady o 6:00 jednego dnia. Zarząd i ludność liczone jak `populacja` (src/sim/snapshot.ts), `jedzenie` to porcje
    surowe i ugotowane, `drewno` całe drewno w sztukach (z ogniem w paleniskach), `zimni` i `glodni` to osoby zarządu
    z ciepłem poniżej 40 i najedzeniem poniżej 25 (progi dziennego dryfu wkurzenia, `dailyDrift` w src/gov/uchwaly.ts). */
export interface DzienPrzebiegu {
  dzien: number;
  ludnosc: number;
  zarzad: number;
  budowle: number;
  badania: number;
  jedzenie: number;
  drewno: number;
  zimni: number;
  glodni: number;
  zaufanie: number;
  wkurzenie: number;
}

export interface Przebieg {
  demo: string;
  ziarno: number;
  dni: number;
  /** null: gra dożyła końca przebiegu */
  koniec: { dzien: number; przyczyna: string } | null;
  /** o 6:00 każdego dnia, od dnia 2 */
  poranki: DzienPrzebiegu[];
}

export interface Progi {
  /** ile przebiegów z `zZiaren` ma spełnić każde kryterium */
  przezyc: number;
  zZiaren: number;
  /** pasmo dni pierwszego kamienia ludności: górna granica jest wymaganiem, dolna uwagą */
  kamien: [number, number];
  /** pierwsze odwołanie zarządu (koniec gry) nie wcześniej niż w tym dniu gry, albo wcale */
  odwolanieOdDnia: number;
}

export const PROGI: Progi = { przezyc: 4, zZiaren: 5, kamien: [8, 15], odwolanieOdDnia: 30 };

/** Przebieg, który się nie udał (proces padł, przekroczył limit czasu, zostawił zawieszone okno zarządu albo decydent rzucił
    błąd, który `krokGry` złapał): demo, ziarno i powód po polsku. Dema z takim przebiegiem werdykt pomija. */
export interface BlednyPrzebieg {
  demo: string;
  ziarno: number;
  powod: string;
}

/** Demo, którego dom nie spełnia reguły miejsca osady: demo i powód (`opisPowoduOdrzucenia` w tools/bot-osada.ts). Takie demo
    werdykt pomija. */
export interface PozaRegula {
  demo: string;
  powod: string;
}

export interface Werdykt {
  ok: boolean;
  /** powody porażki ocenionych dem */
  bledy: string[];
  /** rzeczy do zobaczenia, które porażką nie są */
  uwagi: string[];
  /** dema pominięte w ocenie z powodu błędnych przebiegów, po jednej linii na demo */
  nieocenione: string[];
  /** dema poza regułą miejsca: nie liczą się do werdyktu, po jednej linii na demo */
  pominiete: string[];
}

/** pierwszy kamień drogi ludnościowej do zwycięstwa (src/gov/zwyciestwo.ts: progi 10, 25 i 50 osób) */
export const LUDNOSC_KAMIENIA = 10;

/** Gra dożyła końca przebiegu (bez końca gry z jakiejkolwiek przyczyny). */
export function przezyl(p: Przebieg): boolean {
  return p.koniec === null;
}

/** Zarząd nie został odwołany (gra nie skończyła się) wcześniej niż w dniu `dzien`: bez końca gry albo z końcem w dniu
    `dzien` lub później. Dzień końca to dzień gry w chwili `gov.over`. Przyczyna końca nie ma znaczenia (pustka i exodus
    też są porażką przed tym dniem). */
export function bezOdwolaniaPrzed(p: Przebieg, dzien: number): boolean {
  return p.koniec === null || p.koniec.dzien >= dzien;
}

/** Dzień pierwszego poranka z co najmniej `LUDNOSC_KAMIENIA` ludźmi pod zarządem albo null, gdy takiego nie było. Liczy się
    pierwszy raz: ludność, która potem spada, kamienia nie cofa (tak samo w grze: kamienie nie maleją). */
export function dzienKamienia(p: Przebieg): number | null {
  return p.poranki.find((d) => d.ludnosc >= LUDNOSC_KAMIENIA)?.dzien ?? null;
}

/** Ludność o 6:00 danego dnia albo null, gdy przebieg do niego nie dotrwał. */
export function ludnoscWDniu(p: Przebieg, dzien: number): number | null {
  return p.poranki.find((d) => d.dzien === dzien)?.ludnosc ?? null;
}

/** Stojące budowle z ostatniego poranka (0 bez poranków); przebieg, który skończył się wcześniej, ma tyle, ile zdążył. */
export function budowleNaKoniec(p: Przebieg): number {
  return p.poranki.at(-1)?.budowle ?? 0;
}

/** Ile z `n` przebiegów musi spełnić kryterium: `przezyc` z `zZiaren` w górę (4 z 5, 3 z 3, 8 z 10). */
function wymagane(n: number, progi: Progi): number {
  return Math.min(n, Math.ceil((n * progi.przezyc) / progi.zZiaren));
}

const lista = (wpisy: string[]): string => (wpisy.length ? `; ${wpisy.join(', ')}` : '');

/** Werdykt dla wszystkich przebiegów: osobno każde demo (w kolejności pojawienia się), każde kryterium osobno. `bledy` to
    powody porażki, każdy z nazwą dema, liczbą przebiegów i ziarnami, które zawiodły; `uwagi` to rzeczy do zobaczenia, które
    porażką nie są (kamień przed dolną granicą pasma, pominięte kryterium kamienia, przebieg krótszy niż dzień odwołania).
    `bledne` to przebiegi, które się nie udały: demo z takim przebiegiem trafia do `nieocenione` i nie jest oceniane (jego
    udane przebiegi też), a werdykt jako całość nie przechodzi. `poza` to dema, których dom nie spełnia reguły miejsca osady:
    nie są oceniane w ogóle (ani ich przebiegi, ani błędne przebiegi), wpisują się do `pominiete` i nie psują werdyktu; gdy nie
    zostaje żadne demo do oceny, werdykt nie przechodzi. Pusta lista przebiegów (bez błędnych i bez dem poza regułą) nie
    przechodzi. */
export function werdykt(
  p: readonly Przebieg[],
  progi: Progi = PROGI,
  bledne: readonly BlednyPrzebieg[] = [],
  poza: readonly PozaRegula[] = [],
): Werdykt {
  const bledy: string[] = [];
  const uwagi: string[] = [];
  const nieocenione: string[] = [];
  const pominiete = poza.map((x) => `${x.demo}: poza regułą miejsca (${x.powod}), nie liczy się do werdyktu`);
  const pozaDema = new Set(poza.map((x) => x.demo));
  if (!p.length && !bledne.length && !poza.length) bledy.push('brak przebiegów do oceny');
  const dema = [...new Set([...p.map((x) => x.demo), ...bledne.map((x) => x.demo)])].filter((d) => !pozaDema.has(d));
  if (!dema.length && (p.length || bledne.length || poza.length))
    bledy.push('żadne demo nie spełnia reguły miejsca osady: nie ma czego oceniać');
  const [odDnia, doDnia] = progi.kamien;
  for (const demo of dema) {
    const zleWDemie = bledne.filter((x) => x.demo === demo);
    if (zleWDemie.length) {
      const opis = zleWDemie.map((x) => `ziarno ${x.ziarno}: ${x.powod}`).join(', ');
      nieocenione.push(`${demo}: nie oceniono (przebiegi z błędem: ${opis})`);
      continue;
    }
    const grupa = p.filter((x) => x.demo === demo);
    const n = grupa.length;
    const trzeba = wymagane(n, progi);

    const bezOdwolania = grupa.filter((x) => bezOdwolaniaPrzed(x, progi.odwolanieOdDnia)).length;
    if (bezOdwolania < trzeba) {
      const konce = grupa
        .filter((x) => !bezOdwolaniaPrzed(x, progi.odwolanieOdDnia))
        .map((x) => `ziarno ${x.ziarno} dzień ${x.koniec!.dzien} ${x.koniec!.przyczyna}`);
      bledy.push(
        `${demo}: bez odwołania przed dniem ${progi.odwolanieOdDnia} tylko w ${bezOdwolania} z ${n} przebiegów, wymagane ${trzeba}${lista(konce)}`,
      );
    }
    // przebieg krótszy niż dzień odwołania sprawdza odwołanie tylko w swoich dniach
    const krotkieOdwolanie = grupa.filter((x) => x.dni < progi.odwolanieOdDnia);
    if (krotkieOdwolanie.length)
      uwagi.push(
        `${demo}: przebieg trwa ${Math.min(...krotkieOdwolanie.map((x) => x.dni))} dni, krócej niż do dnia ${progi.odwolanieOdDnia}: odwołanie zarządu sprawdzone tylko w tych dniach`,
      );

    // przebieg krótszy niż dzień, w którym kamień ma już być, nie pozwala go ocenić (ani uczciwie uznać, ani odrzucić)
    const krotkie = grupa.filter((x) => x.dni < doDnia);
    if (krotkie.length) {
      uwagi.push(
        `${demo}: kryterium kamienia ludności pominięte, bo przebieg trwa ${Math.min(...krotkie.map((x) => x.dni))} dni, krócej niż do dnia ${doDnia}, w którym kamień ma już być`,
      );
    } else {
      const kamienie = grupa.map((x) => ({ ziarno: x.ziarno, dzien: dzienKamienia(x) }));
      const naCzas = kamienie.filter((k) => k.dzien !== null && k.dzien <= doDnia);
      if (naCzas.length < trzeba) {
        const spoznione = kamienie
          .filter((k) => k.dzien === null || k.dzien > doDnia)
          .map((k) => `ziarno ${k.ziarno} ${k.dzien === null ? 'bez kamienia' : `dzień ${k.dzien}`}`);
        bledy.push(
          `${demo}: pierwszy kamień ludności (${LUDNOSC_KAMIENIA} osób) najpóźniej w dniu ${doDnia} tylko w ${naCzas.length} z ${n} przebiegów, wymagane ${trzeba}${lista(spoznione)}`,
        );
      }
      const wczesne = kamienie.filter((k) => k.dzien !== null && k.dzien < odDnia);
      if (wczesne.length)
        uwagi.push(
          `${demo}: kamień ludności przed dniem ${odDnia} (poniżej pasma, to nie błąd) w ${wczesne.length} z ${n} przebiegów: ${wczesne.map((k) => `ziarno ${k.ziarno} dzień ${k.dzien}`).join(', ')}`,
        );
    }
  }
  return { ok: bledy.length === 0 && nieocenione.length === 0, bledy, uwagi, nieocenione, pominiete };
}
