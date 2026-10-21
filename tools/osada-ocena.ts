/* Ocena przebiegów osady AI, etap 1 (docs/superpowers/plans/2026-10-21-osada-ai-etap-1.md, zadanie 2): czyste funkcje bez
   gry i bez wyjścia na ekran, żeby werdykt dało się sprawdzić na syntetycznych przebiegach (tests/unit/ai-ocena.test.ts).
   Przebiegi liczy uprząż `npm run bot:osada` (tools/bot-osada.ts), a tu jest tylko to, co z nich wynika.

   Przebieg to jedna gra silnika: demo, ziarno, długość w dobach (`dni`; gra zaczyna się o 15:00 dnia 1, więc ostatni
   poranek wypada w dniu `dni + 1`), koniec gry (`gov.over`: pustka, odwołanie albo exodus, z dniem, w którym nastąpił;
   null: dożył końca) i poranki, czyli stan o 6:00 każdego dnia po kroku zarządu z tej chwili (od dnia 2; przebieg, który
   skończył się wcześniej, ma ich mniej). Numer dnia to dzień gry (`dayOf`), ten sam, który widzi gracz.

   Cel kontrolny etapu (Global Constraints planu, bramka w specyfikacji osady AI), osobno na każdym demie:
   - przeżycie `dni` dób (bez `gov.over`) w co najmniej `przezyc` z `zZiaren` przebiegów;
   - pierwszy kamień ludności (10 osób, pierwszy poranek z co najmniej tyloma ludźmi pod zarządem) najpóźniej w dniu
     `kamien[1]` w co najmniej tylu samych przebiegach; dolna granica pasma `kamien[0]` jest uwagą, nie błędem: Przymorze
     i Lanciego startują z 9 osobami, więc kamień bywa tam już w pierwszych dniach i silnik nie ma jak (ani po co)
     opóźniać go do dnia 8;
   - na koniec przebiegu co najmniej `floor(dni / budowlaNaDni)` stojących budowli, też w co najmniej tylu przebiegach.
   Przy innej liczbie ziaren niż `zZiaren` wymagana liczba przebiegów skaluje się proporcjonalnie (w górę), więc trzy
   ziarna muszą dożyć wszystkie, a dziesięć: osiem. */

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
  /** jedna budowla na tyle dni gry */
  budowlaNaDni: number;
}

export const PROGI: Progi = { przezyc: 4, zZiaren: 5, kamien: [8, 15], budowlaNaDni: 3 };

/** pierwszy kamień drogi ludnościowej do zwycięstwa (src/gov/zwyciestwo.ts: progi 10, 25 i 50 osób) */
export const LUDNOSC_KAMIENIA = 10;

export function przezyl(p: Przebieg): boolean {
  return p.koniec === null;
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
    porażką nie są (kamień przed dolną granicą pasma). Pusta lista przebiegów nie przechodzi. */
export function werdykt(
  p: readonly Przebieg[],
  progi: Progi = PROGI,
): { ok: boolean; bledy: string[]; uwagi: string[] } {
  const bledy: string[] = [];
  const uwagi: string[] = [];
  if (!p.length) bledy.push('brak przebiegów do oceny');
  const dema = [...new Set(p.map((x) => x.demo))];
  const [odDnia, doDnia] = progi.kamien;
  for (const demo of dema) {
    const grupa = p.filter((x) => x.demo === demo);
    const n = grupa.length;
    const trzeba = wymagane(n, progi);

    const zyje = grupa.filter(przezyl).length;
    if (zyje < trzeba) {
      const konce = grupa
        .filter((x) => x.koniec)
        .map((x) => `ziarno ${x.ziarno} dzień ${x.koniec!.dzien} ${x.koniec!.przyczyna}`);
      bledy.push(`${demo}: przeżyło ${zyje} z ${n} przebiegów, wymagane ${trzeba}${lista(konce)}`);
    }

    const kamienie = grupa.map((x) => ({ ziarno: x.ziarno, dzien: dzienKamienia(x) }));
    const naCzas = kamienie.filter((k) => k.dzien !== null && k.dzien <= doDnia);
    if (naCzas.length < trzeba) {
      const poza = kamienie
        .filter((k) => k.dzien === null || k.dzien > doDnia)
        .map((k) => `ziarno ${k.ziarno} ${k.dzien === null ? 'bez kamienia' : `dzień ${k.dzien}`}`);
      bledy.push(
        `${demo}: pierwszy kamień ludności (${LUDNOSC_KAMIENIA} osób) najpóźniej w dniu ${doDnia} tylko w ${naCzas.length} z ${n} przebiegów, wymagane ${trzeba}${lista(poza)}`,
      );
    }
    const wczesne = kamienie.filter((k) => k.dzien !== null && k.dzien < odDnia);
    if (wczesne.length)
      uwagi.push(
        `${demo}: kamień ludności przed dniem ${odDnia} (poniżej pasma, to nie błąd) w ${wczesne.length} z ${n} przebiegów: ${wczesne.map((k) => `ziarno ${k.ziarno} dzień ${k.dzien}`).join(', ')}`,
      );

    const budowle = grupa.map((x) => ({
      ziarno: x.ziarno,
      ma: budowleNaKoniec(x),
      cel: Math.floor(x.dni / progi.budowlaNaDni),
    }));
    const dosc = budowle.filter((b) => b.ma >= b.cel);
    if (dosc.length < trzeba) {
      const malo = budowle.filter((b) => b.ma < b.cel).map((b) => `ziarno ${b.ziarno} ma ${b.ma} z ${b.cel}`);
      bledy.push(
        `${demo}: budowle na koniec przebiegu (jedna na ${progi.budowlaNaDni} dni) wystarczają tylko w ${dosc.length} z ${n} przebiegów, wymagane ${trzeba}${lista(malo)}`,
      );
    }
  }
  return { ok: bledy.length === 0, bledy, uwagi };
}
