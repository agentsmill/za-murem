/* Wiki w grze, kategoria „Zarząd” (w domu „Komitet ulicy”): zaufanie i wkurzenie (`zarzad:zaufanie`, `zarzad:wkurzenie`, do których
   prowadzą czipy paska), wieczorne zebranie, uchwały w ogóle (`zarzad:uchwaly`) i po jednym artykule na każdą uchwałę z `M1_LAWS`
   (`uchwala:<id>`), poranny raport i koniec gry. Liczby wiki odczytuje z funkcji zarządu: dzienny dryf zaufania i wkurzenia
   z `dailyDrift` (jedną osobą o zmiennych potrzebach, skokami po potrzebie, więc progi „poniżej 40” i „od 50” są z kodu, a nie
   przepisane), skutki uchwał z `lawEffects`, `raidChance`, `defenseAt` i `guardValue`, nazwy i opisy uchwał z `lawNameTx` i
   `lawDescTx` (z wariantem dla domu), tytuły końców z `ENDINGS`, tytuły raportu z `reportSheet`. Ręcznie wpisane są tylko liczby,
   które zarząd ma na stałe w kodzie (progi kolorów czipów, kara za pominięcie pierwszej uchwały, zaufanie za wyprawę z łupem):
   przypina je tests/unit/wiki-zarzad.test.ts do tekstu źródeł. */

import { ENDINGS_EN, PATHS_EN } from '../content/data.en.ts';
import { ENDINGS, type EndingId, LAW_CD, type LawPath, PATHS } from '../content/data.ts';
import { L, tr } from '../core/jezyk.ts';
import { BLOK } from '../gov/miejsce.ts';
import { CARD_DEADLINE, CARD_HOUR, defenseAt, MORNING } from '../gov/noc.ts';
import { FIRST_LAWS, lawDescTx, lawNameTx, M1_LAWS } from '../gov/tresc.ts';
import type { GovInput } from '../gov/typy.ts';
import { dailyDrift, lawEffects } from '../gov/uchwaly.ts';
import { zeroStock } from '../gov/wspolne.ts';
import { LAW_HOUR, LAW_MINUTE } from '../gov/zarzad.ts';
import type { Needs } from '../sim/needs.ts';
import { GUARD_UNTIL, hungerRate, MEAL_HOURS, RATION_HUNGRY, RATION_MEALS, STARVING, WORK_START } from '../sim/sim.ts';
import { reportSheet } from './okna.ts';
import { num, signed } from './tekst.ts';
import { cechaNazwa, SMIERC_MIESZKANIEC, SMIERC_ZARZAD } from './wiki-ludzie.ts';
import { GODZIN_NOCY, NOC, warta, wstawGodz, zmianaSzansy } from './wiki-noc.ts';
import { cyt, godz, proc, wCyt } from './wiki-slowa.ts';
import { leniwie, sondaOsoba, sondaStan, sondaStanZUchwalami, sondaWejscie } from './wiki-sondy.ts';
import { type Def, def, type Fakt, fakt, type Tresc, type WikiCtx } from './wiki-typy.ts';

/** Liczby, które zarząd ma na stałe w kodzie i które wiki podaje wprost; test przypina je do tekstu źródeł. */
export const ZARZAD = {
  /** kolory czipów paska: zaufanie czerwone poniżej pierwszej liczby, żółte poniżej drugiej; wkurzenie czerwone powyżej pierwszej, żółte powyżej drugiej */
  czipZaufanie: [30, 45],
  czipWkurzenie: [60, 40],
  /** zaufanie za pominięcie uchwały pierwszego wieczoru */
  pominiecie: -1,
  /** zaufanie za wyprawę, która przyniosła łup */
  lupWyprawy: 1,
  /** zaufanie i wkurzenie na starcie (z `newGov`) */
  start: [50, 20],
  /** godzina, o której uchwała zamyka bramę na kłódkę (`step` w src/sim/sim.ts; otwiera o `GUARD_UNTIL`) */
  bramaZamyka: 20,
};

// ---------------------------------------------------------------- dryf dzienny z funkcji gry

/** potrzeby, przy których żaden warunek dryfu nie działa (ciepło 40–59, najedzenie 25–49, bezpieczeństwo 35–70) */
const NEUTRALNE = { warm: 50, food: 40, safe: 50 } as const;

interface Dryf {
  needs?: Partial<Needs>;
  ognisko?: boolean;
  spalone?: number;
  cechy?: string[];
}

/** dzienna zmiana zaufania i wkurzenia (`dailyDrift`) dla jednej osoby o danych potrzebach i cechach; reszta jak w neutralny dzień */
function dryf(o: Dryf = {}): [number, number] {
  const st = sondaStan();
  st.evening.campfire = !!o.ognisko;
  const burned = Array.from({ length: o.spalone ?? 0 }, () => ({}));
  const i = sondaWejscie({
    people: [sondaOsoba({ needs: { ...NEUTRALNE, ...o.needs } as Needs, traits: o.cechy ?? [] })],
    burned: burned as unknown as GovInput['burned'],
  });
  return dailyDrift(st, i);
}

const zaokr = (v: number): number => Math.round(v * 100) / 100;

/** o ile cecha zmienia dzienny dryf zaufania i wkurzenia */
const dryfCechy = (cecha: string): { t: number; a: number } => {
  const b = dryf();
  const z = dryf({ cechy: [cecha] });
  return { t: zaokr(z[0] - b[0]), a: zaokr(z[1] - b[1]) };
};

type Potrzeba = keyof typeof NEUTRALNE;

interface Skok {
  potrzeba: Potrzeba;
  /** pierwsza wartość potrzeby po skoku */
  od: number;
  /** czy granica leży „od X” (włącznie), a nie „powyżej X − 1” */
  wlacznie: boolean;
  /** skok w górę zmienia dzienny dryf o tyle */
  dT: number;
  dA: number;
}

/** Skoki dziennego dryfu po potrzebie: przy której wartości dryf się zmienia i o ile, z rozróżnieniem „od X” i „powyżej X”
    (sprawdzane w pół kroku przed granicą). */
function skoki(potrzeba: Potrzeba): Skok[] {
  const wynik: Skok[] = [];
  let [t0, a0] = dryf({ needs: { [potrzeba]: 0 } });
  for (let v = 1; v <= 100; v++) {
    const [t, a] = dryf({ needs: { [potrzeba]: v } });
    if (t !== t0 || a !== a0) {
      const [tp, ap] = dryf({ needs: { [potrzeba]: v - 0.5 } });
      wynik.push({ potrzeba, od: v, wlacznie: tp === t0 && ap === a0, dT: zaokr(t - t0), dA: zaokr(a - a0) });
    }
    t0 = t;
    a0 = a;
  }
  return wynik;
}

const wszystkieSkoki = leniwie(() => (Object.keys(NEUTRALNE) as Potrzeba[]).flatMap(skoki));
const dryfBaza = leniwie(() => dryf());
const dryfOgniska = leniwie(() => zaokr(dryf({ ognisko: true })[1] - dryfBaza()[1]));
const dryfMebla = leniwie(() => zaokr(dryf({ spalone: 1 })[1] - dryfBaza()[1]));

const NAZWY_POTRZEB: Record<Potrzeba, [string, string]> = {
  warm: ['Ciepło', 'Warmth'],
  food: ['Najedzenie', 'Fed'],
  safe: ['Bezpieczeństwo', 'Safety'],
};
const nazwaPotrzeby = (k: Potrzeba): string => L(NAZWY_POTRZEB[k][0], NAZWY_POTRZEB[k][1]);

/** Fakty o dryfie dla jednej miary (T: zaufanie, A: wkurzenie): dla każdego skoku strona progu, która coś zmienia względem
    neutralnego dnia, i jej skutek. Skok poniżej neutralnej wartości potrzeby to gorsza strona („poniżej X”), powyżej to lepsza
    („od X” albo „powyżej X”). Skutek jest dla wszystkich ludzi naraz; przy części ludzi proporcjonalnie. */
function faktyDryfu(miara: 'T' | 'A'): Fakt[] {
  const wynik: Fakt[] = [];
  wszystkieSkoki().forEach((s, n) => {
    const d = miara === 'T' ? s.dT : s.dA;
    if (!d) return;
    const dolna = s.od <= NEUTRALNE[s.potrzeba];
    const strona = dolna
      ? L(`poniżej ${s.od}`, `below ${s.od}`)
      : s.wlacznie
        ? L(`od ${s.od}`, `${s.od} and up`)
        : L(`powyżej ${s.od - 1}`, `above ${s.od - 1}`);
    const efekt = dolna ? -d : d;
    wynik.push(
      fakt(
        `${s.potrzeba}-${n}`,
        `${nazwaPotrzeby(s.potrzeba)} ${strona}`,
        L(`${signed(efekt)} dziennie, gdy dotyczy wszystkich`, `${signed(efekt)} a day when it applies to everyone`),
      ),
    );
  });
  return wynik;
}

/** uchwały, które zmieniają daną miarę (od razu albo co rano), jako „Nazwa: +2 od razu, +0,3 dziennie” */
function uchwalyMiary(miara: 0 | 1, c: WikiCtx): string {
  return Object.keys(M1_LAWS)
    .filter((id) => M1_LAWS[id].imm?.[miara] || M1_LAWS[id].daily?.[miara])
    .map((id) => {
      const czesci: string[] = [];
      const imm = M1_LAWS[id].imm?.[miara];
      const daily = M1_LAWS[id].daily?.[miara];
      if (imm) czesci.push(L(`${signed(imm)} od razu`, `${signed(imm)} at once`));
      if (daily) czesci.push(L(`${signed(daily)} dziennie`, `${signed(daily)} a day`));
      return `${tr(lawNameTx(id, c.place))}: ${czesci.join(', ')}`;
    })
    .join('; ');
}

// ---------------------------------------------------------------- uchwały

const lawIds = (): string[] => Object.keys(M1_LAWS);

/** skutki uchwały w liczbach gry, odczytane z funkcji zarządu (zmiana względem zarządu bez uchwał) */
function skutki(id: string) {
  const baza = lawEffects(sondaStan());
  const e = lawEffects(sondaStanZUchwalami(id));
  const i = sondaWejscie();
  return {
    porcja: e.foodMult / baza.foodMult,
    palenie: e.burnMood / baza.burnMood,
    start: e.workStart,
    bramaZamknieta: e.gateClosed && !baza.gateClosed,
    napad: zmianaSzansy({ uchwaly: [id] }),
    obronaBramy:
      Math.round((defenseAt(sondaStanZUchwalami(id), i, 'brama', []) - defenseAt(sondaStan(), i, 'brama', [])) * 10) /
      10,
    glod: hungerRate(e.foodMult) / hungerRate(baza.foodMult) - 1,
    starcza: 1 - e.foodMult * hungerRate(e.foodMult),
  };
}

const sciezka = (p: LawPath): string => L(PATHS[p], PATHS_EN[p]);
const nazwaUchwaly = (id: string, c: WikiCtx): string => tr(lawNameTx(id, c.place));

/** „zaufanie +2, wkurzenie +0,2” (z „dziennie” przy dziennym) albo „brak” */
function zmiana(v: readonly [number, number] | undefined, dziennie: boolean): string {
  const czesci: string[] = [];
  if (v?.[0]) czesci.push(L(`zaufanie ${signed(v[0])}`, `trust ${signed(v[0])}`));
  if (v?.[1]) czesci.push(L(`wkurzenie ${signed(v[1])}`, `anger ${signed(v[1])}`));
  if (!czesci.length) return L('brak', 'none');
  return `${czesci.join(', ')}${dziennie ? L(' dziennie', ' a day') : ''}`;
}

const pierwsza = (id: string): boolean => (FIRST_LAWS as readonly string[]).includes(id);

function faktyUchwaly(id: string, c: WikiCtx): Fakt[] {
  const l = M1_LAWS[id];
  const wymaga = (l.req ?? []).map((r) => wCyt(nazwaUchwaly(r, c))).join(', ');
  return [
    fakt('opis', L('Tak mówi okno uchwały', 'What the resolution window says'), tr(lawDescTx(id, c.place))),
    fakt('sciezka', L('Droga', 'Path'), sciezka(l.path)),
    fakt('wymaga', L('Wymaga uchwały', 'Needs the resolution'), wymaga || L('nic', 'nothing')),
    fakt('od-razu', L('Od razu', 'At once'), zmiana(l.imm, false)),
    fakt('dziennie', L('Co rano', 'Every morning'), zmiana(l.daily, true)),
    fakt(
      'pierwszy',
      L('Na pierwszym zebraniu', 'At the first meeting'),
      pierwsza(id) ? L('jest', 'on offer') : L('nie ma', 'not offered'),
    ),
  ];
}

const pierwszyWieczor = (id: string): string =>
  pierwsza(id)
    ? L('Można ją podpisać już pierwszego wieczoru.', 'You can sign it on the very first evening.')
    : L(
        'Na pierwszym zebraniu jej nie ma: czeka na kolejne.',
        'It is not offered at the first meeting: it waits for the later ones.',
      );

const drogaWspolnoty = (): string =>
  L('To droga Wspólnoty i zamyka drogę Porządku.', 'It is the Community path and closes the Order path.');

interface OpisUchwaly {
  zdania: string[];
  fakty: Fakt[];
  zobacz: string[];
}

const UCHWALY: Record<string, (c: WikiCtx) => OpisUchwaly> = {
  u_warty: (c) => {
    const s = skutki('u_warty');
    const { words: w, e } = c;
    const ulepszenie = proc(warta().uchwala - 1);
    return {
      zdania: [
        L(
          `Dokłada ${num(s.obronaBramy)} do obrony ${w.brama.d}, wzmacnia każdą wartę o ${ulepszenie} i obniża szansę napadu o ${-s.napad} punktów.`,
          `It adds ${num(s.obronaBramy)} to the defence of ${e.brama}, makes every watch ${ulepszenie} stronger and lowers the raid chance by ${-s.napad} points.`,
        ),
        L(
          `To droga Porządku i warunek uchwały ${wCyt(nazwaUchwaly('u_brama', c))}.`,
          `It is the Order path and a condition for the resolution ${wCyt(nazwaUchwaly('u_brama', c))}.`,
        ),
        L('Nie zmienia ani zaufania, ani wkurzenia.', 'It changes neither trust nor anger.'),
        pierwszyWieczor('u_warty'),
      ],
      fakty: [
        ...faktyUchwaly('u_warty', c),
        fakt('obrona', L(`Obrona ${w.brama.d}`, `Defence of ${e.brama}`), signed(s.obronaBramy)),
        fakt('warta', L('Siła każdej warty', 'Strength of every watch'), `×${num(warta().uchwala, 2)}`),
        fakt('napad', L('Szansa napadu', 'Raid chance'), L(`${signed(s.napad, 0)} pkt`, `${signed(s.napad, 0)} pts`)),
      ],
      zobacz: ['uchwala:u_brama', 'noc:warta', 'noc:napad'],
    };
  },

  u_brama: (c) => {
    const s = skutki('u_brama');
    const { words: w, e } = c;
    const koszt = signed(M1_LAWS.u_brama.daily?.[1] ?? 0);
    return {
      zdania: [
        L(
          `Po zmroku ${w.brama.m} jest zamknięta na kłódkę: nikt nie wchodzi ani nie wychodzi, a klucz ma tylko ${w.zarzad.m}.`,
          `After dark ${e.brama} is padlocked: nobody gets in or out, and only ${e.krotko} has the key.`,
        ),
        L(
          `Szansa napadu spada o ${-s.napad} punktów, a wędrowców spod ${w.brama.d} nikt nie wpuszcza.`,
          `The raid chance falls by ${-s.napad} points, and nobody lets drifters in at ${e.brama}.`,
        ),
        L(`Kosztuje wkurzenie ${koszt} dziennie.`, `It costs anger ${koszt} a day.`),
        L(
          `Wymaga uchwały ${wCyt(nazwaUchwaly('u_warty', c))} i zamyka drogę Wspólnoty.`,
          `It needs the resolution ${wCyt(nazwaUchwaly('u_warty', c))} and closes the Community path.`,
        ),
      ],
      fakty: [
        ...faktyUchwaly('u_brama', c),
        fakt(
          'zamknieta',
          L('Zamknięta na kłódkę', 'Padlocked'),
          s.bramaZamknieta ? `${wstawGodz(ZARZAD.bramaZamyka)}–${wstawGodz(GUARD_UNTIL)}` : '–',
        ),
        fakt(
          'zombie',
          L('W trybie zombie rano', 'In zombie mode in the morning'),
          L('zostaje zamknięta (za nią są szwendacze)', 'stays shut (there are shamblers outside)'),
        ),
        fakt('napad', L('Szansa napadu', 'Raid chance'), L(`${signed(s.napad, 0)} pkt`, `${signed(s.napad, 0)} pts`)),
      ],
      zobacz: ['uchwala:u_warty', 'noc:napad', 'wydarzenia:handlarz'],
    };
  },

  u_zebrania: (c) => {
    const s = skutki('u_zebrania');
    const { words: w, e } = c;
    const zysk = signed(M1_LAWS.u_zebrania.daily?.[0] ?? 0);
    return {
      zdania: [
        L(`Zebrania dodają codziennie ${zysk} zaufania.`, `The meetings add ${zysk} trust every day.`),
        ...(c.dom
          ? []
          : [
              L(
                `Plan dnia ${w.mieszkancy.d} zaczyna się o ${s.start}:00 zamiast o ${WORK_START}:00: wychodzą na podwórko i do pracowni godzinę później.`,
                `The day plan of the ${e.mieszkancy} starts at ${s.start}:00 instead of ${WORK_START}:00: they come out into the yard and to the research room an hour later.`,
              ),
            ]),
        drogaWspolnoty(),
        pierwszyWieczor('u_zebrania'),
      ],
      fakty: [
        ...faktyUchwaly('u_zebrania', c),
        ...(c.dom
          ? []
          : [
              fakt(
                'start',
                L('Początek dnia ludzi z planem', 'Start of the day for people with a plan'),
                L(`${s.start}:00 zamiast ${WORK_START}:00`, `${s.start}:00 instead of ${WORK_START}:00`),
              ),
            ]),
      ],
      zobacz: ['uchwala:u_kociol', 'zarzad:zaufanie', 'zarzad:uchwaly'],
    };
  },

  u_kociol: (c) => {
    const s = skutki('u_kociol');
    const { words: w, e } = c;
    const imm = signed(M1_LAWS.u_kociol.imm?.[0] ?? 0);
    const daily = signed(M1_LAWS.u_kociol.daily?.[0] ?? 0);
    return {
      zdania: [
        L(
          'Wszystkie zapasy idą do jednego garnka przy kozie, a każdy je tyle samo, także ten, kto nie pracuje.',
          'All the food goes into one pot by the stove, and everyone eats the same, including those who do not work.',
        ),
        L(
          `O ${MEAL_HOURS[0]}:00 i ${MEAL_HOURS[1]}:00 ${w.zarzad.m} schodzi się do wspólnego posiłku, a porcje są ${proc(s.porcja - 1)} większe, więc jedzenie schodzi o tyle szybciej.`,
          `At ${MEAL_HOURS[0]}:00 and ${MEAL_HOURS[1]}:00 ${e.krotko} gathers for a shared meal, and portions are ${proc(s.porcja - 1)} bigger, so the food goes down that much faster.`,
        ),
        L(
          `Zaufanie ${imm} od razu i ${daily} dziennie, a po wspólnym posiłku nastrój rośnie.`,
          `Trust ${imm} at once and ${daily} a day, and a shared meal lifts the mood.`,
        ),
        drogaWspolnoty(),
      ],
      fakty: [
        ...faktyUchwaly('u_kociol', c),
        fakt('godziny', L('Wspólny posiłek o', 'Shared meal at'), MEAL_HOURS.map(wstawGodz).join(', ')),
        fakt('porcja', L('Porcja', 'Portion'), `×${num(s.porcja, 2)}`),
        fakt('nastroj', L('Nastrój po wspólnym posiłku', 'Mood after a shared meal'), L('+5 na 12 h', '+5 for 12 h')),
      ],
      zobacz: ['uchwala:u_racje', 'potrzeba:food', 'zasob:jedzenie', 'budowla:kuchnia_spoleczna'],
    };
  },

  u_racje: (c) => {
    const s = skutki('u_racje');
    const koszt = signed(M1_LAWS.u_racje.daily?.[1] ?? 0);
    return {
      zdania: [
        L(
          `Porcje są o ${proc(1 - s.porcja)} mniejsze, ale syci tak samo, więc zapasy schodzą wolniej o około ${proc(s.starcza)}.`,
          `Portions are ${proc(1 - s.porcja)} smaller but fill just as much, so the food runs down about ${proc(s.starcza)} more slowly.`,
        ),
        L(
          `Głód wraca o ${proc(s.glod)} szybciej, ludzie jedzą dopiero przy najedzeniu poniżej ${RATION_HUNGRY} i najwyżej ${RATION_MEALS} razy na dobę, więc na noc kładą się głodni.`,
          `Hunger comes back ${proc(s.glod)} faster, people eat only when Fed drops below ${RATION_HUNGRY} and at most ${RATION_MEALS} times a day, so they go to bed hungry.`,
        ),
        L(
          `Poniżej ${STARVING} jedzą zawsze, a każdy taki posiłek daje nastrój „Głodowe racje”.`,
          `Below ${STARVING} they always eat, and every such meal gives the “Starvation rations” mood.`,
        ),
        L(
          `Kosztuje wkurzenie ${koszt} dziennie i nie należy do żadnej drogi.`,
          `It costs anger ${koszt} a day and belongs to no path.`,
        ),
      ],
      fakty: [
        ...faktyUchwaly('u_racje', c),
        fakt('porcja', L('Porcja z zapasów', 'Portion from the stock'), `×${num(s.porcja, 2)}`),
        fakt('glod', L('Głód wraca szybciej o', 'Hunger comes back faster by'), proc(s.glod)),
        fakt(
          'starcza',
          L('Zapasy schodzą wolniej o około', 'The food runs down more slowly by about'),
          proc(s.starcza),
        ),
        fakt('prog', L('Je poniżej', 'Eats below'), `${RATION_HUNGRY}`),
        fakt('posilki', L('Najwyżej posiłków na dobę', 'At most meals a day'), `${RATION_MEALS}`),
        fakt('zawsze', L('Poniżej tego je zawsze', 'Always eats below'), `${STARVING}`),
        fakt('nastroj', L('Nastrój „Głodowe racje”', 'The “Starvation rations” mood'), L('−3 na 8 h', '−3 for 8 h')),
      ],
      zobacz: ['uchwala:u_kociol', 'potrzeba:food', 'zasob:jedzenie', 'ludzie:nastroje'],
    };
  },

  u_meble: (c) => {
    const s = skutki('u_meble');
    const imm = signed(M1_LAWS.u_meble.imm?.[1] ?? 0);
    const daily = signed(M1_LAWS.u_meble.daily?.[1] ?? 0);
    /** kara po uchwale i bez niej dla nastroju o wartości `d` */
    const kara = (d: number): number => Math.round(d * s.palenie);
    return {
      zdania: [
        c.dom
          ? L(
              'Meble idą do kozy bez pytania domowników o zgodę.',
              'Furniture goes into the stove without asking the household.',
            )
          : L(
              'Meble z pustych mieszkań idą do kozy bez pytania o zgodę.',
              'Furniture from empty flats goes into the stove without asking anyone.',
            ),
        L(
          `Palenie mebli boli ${proc(1 - s.palenie)} mniej: nastrój „Palimy meble” ${signed(kara(-6), 0)} zamiast ${signed(-6, 0)}, a właściciel ${signed(kara(-18), 0)} zamiast ${signed(-18, 0)}.`,
          `Burning furniture hurts ${proc(1 - s.palenie)} less: the “Burning our own furniture” mood is ${signed(kara(-6), 0)} instead of ${signed(-6, 0)}, and the owner’s ${signed(kara(-18), 0)} instead of ${signed(-18, 0)}.`,
        ),
        L(
          `Kosztuje wkurzenie ${imm} od razu i ${daily} dziennie.`,
          `It costs anger ${imm} at once and ${daily} a day.`,
        ),
        pierwszyWieczor('u_meble'),
      ],
      fakty: [
        ...faktyUchwaly('u_meble', c),
        fakt('kara', L('Kara za palenie mebli', 'The penalty for burning furniture'), `×${num(s.palenie, 2)}`),
        fakt(
          'pali',
          L('Palimy meble (wszyscy)', 'Burning our own furniture (everyone)'),
          L(`${signed(kara(-6), 0)} na 12 h`, `${signed(kara(-6), 0)} for 12 h`),
        ),
        fakt(
          'cudze',
          L('Rozbiórka cudzych rzeczy (wszyscy)', 'Taking someone else’s things apart (everyone)'),
          L(`${signed(kara(-10), 0)} na 24 h`, `${signed(kara(-10), 0)} for 24 h`),
        ),
        fakt(
          'wlasciciel',
          L('Właściciel spalonej rzeczy', 'The owner of the burned thing'),
          L(`${signed(kara(-18), 0)} na 48 h`, `${signed(kara(-18), 0)} for 48 h`),
        ),
      ],
      zobacz: ['ludzie:nastroje', 'zasob:meble', 'zasob:koza'],
    };
  },
};

function uchwala(id: string): Def {
  const nazwa = lawNameTx(id, BLOK);
  return def(
    `uchwala:${id}`,
    'zarzad',
    (c) => nazwaUchwaly(id, c),
    (c): Tresc => {
      const o = UCHWALY[id](c);
      return {
        zdania: o.zdania,
        fakty: o.fakty,
        jak: [
          L(
            `Uchwałę podpisujecie na wieczornym zebraniu o ${LAW_HOUR}:${LAW_MINUTE}: ${cyt('Podpisać', 'Sign')} przy tej uchwale.`,
            `You sign the resolution at the evening meeting at ${LAW_HOUR}:${LAW_MINUTE}: press ${cyt('Podpisać', 'Sign')} beside it.`,
          ),
        ],
        zobacz: [...o.zobacz, 'zarzad:uchwaly', 'zarzad:zebranie'],
      };
    },
    `${nazwa.pl} ${nazwa.en}`,
  );
}

// ---------------------------------------------------------------- koniec i raport

/** tytuł końca gry według miejsca w bieżącym języku */
const koniecTytul = (id: EndingId, c: WikiCtx): string =>
  L((c.words.koniec[id] ?? ENDINGS[id]).title, (c.e.koniec[id] ?? ENDINGS_EN[id]).title);

/** tytuły porannego raportu z okna (`reportSheet`): spokojna noc, napad odparty, szabrownicy weszli */
function tytulyRaportu(): string[] {
  const r = (raid: 'brak' | 'odparty' | 'wtargnięcie'): string =>
    reportSheet({
      day: 1,
      lines: [],
      raid,
      stolen: zeroStock(),
      loot: zeroStock(),
      hurt: [],
      tired: [],
      trust: ZARZAD.start[0],
      anger: ZARZAD.start[1],
      dTrust: 0,
      dAnger: 0,
      kitchen: null,
      koza: [],
    }).title;
  return [r('brak'), r('odparty'), r('wtargnięcie')];
}

// ---------------------------------------------------------------- artykuły

export function definicjeZarzad(): Def[] {
  return [
    def(
      'zarzad:zaufanie',
      'zarzad',
      () => L('Zaufanie', 'Trust'),
      (c): Tresc => {
        const { words: w, e } = c;
        const baza = dryfBaza();
        const lubiany = dryfCechy('lubiany').t;
        return {
          zdania: [
            L(
              `Zaufanie mówi, na ile ${w.mieszkancy.m} wierzą w ${w.zarzad.m}: skala 0–100, na starcie ${ZARZAD.start[0]}.`,
              `Trust shows how far the ${e.mieszkancy} believe in ${e.krotko}: a 0–100 scale, ${ZARZAD.start[0]} at the start.`,
            ),
            L(
              'Co rano zmienia się o dzienny dryf z tego, jak ludziom jest: ciepło, najedzenie i bezpieczeństwo go podnoszą, a zimno obniża.',
              'Every morning it moves by a daily drift from how people are doing: warmth, food and safety raise it, and cold lowers it.',
            ),
            L(
              `Poza tym zmieniają je pojedyncze rzeczy: uchwały, wyprawa z łupem (${signed(ZARZAD.lupWyprawy, 0)}), odparty albo udany napad, śmierć kogoś z ${w.zarzad.dk} (${signed(SMIERC_ZARZAD[0], 0)}) i wydarzenia.`,
              `Single things change it too: resolutions, a run that brings back loot (${signed(ZARZAD.lupWyprawy, 0)}), a repelled or a successful raid, a death on ${e.krotko} (${signed(SMIERC_ZARZAD[0], 0)}) and events.`,
            ),
            L('Przy zerze ludzie odchodzą i gra się kończy.', 'At zero people leave and the game ends.'),
          ],
          fakty: [
            fakt('start', L('Na początku', 'At the start'), `${ZARZAD.start[0]}`),
            fakt(
              'czip',
              L('Kolor czipa na pasku', 'Colour of the chip on the top bar'),
              L(
                `czerwony poniżej ${ZARZAD.czipZaufanie[0]}, żółty poniżej ${ZARZAD.czipZaufanie[1]}`,
                `red below ${ZARZAD.czipZaufanie[0]}, amber below ${ZARZAD.czipZaufanie[1]}`,
              ),
            ),
            fakt(
              'baza',
              L('Dryf, gdy nic nie zmienia', 'Drift when nothing changes it'),
              L(`${signed(baza[0])} dziennie`, `${signed(baza[0])} a day`),
            ),
            ...faktyDryfu('T'),
            fakt('lubiany', cechaNazwa('lubiany'), L(`${signed(lubiany)} dziennie`, `${signed(lubiany)} a day`)),
            fakt('uchwaly', L('Uchwały', 'Resolutions'), uchwalyMiary(0, c)),
            fakt('wyprawa', L('Wyprawa z łupem', 'A run with loot'), signed(ZARZAD.lupWyprawy, 0)),
            fakt('odparcie', L('Napad odparty', 'A raid repelled'), signed(NOC.odparcie.zaufanie, 0)),
            fakt('wtargniecie', L('Szabrownicy weszli', 'Looters got in'), signed(NOC.wtargniecie.zaufanie, 0)),
            fakt(
              'smierc',
              L(`Śmierć: ktoś z ${w.zarzad.dk}, ktoś spoza`, `A death: on ${e.krotko}, outside it`),
              `${signed(SMIERC_ZARZAD[0], 0)} / ${signed(SMIERC_MIESZKANIEC[0], 0)}`,
            ),
            fakt(
              'pominiecie',
              L('Pominięta uchwała pierwszego wieczoru', 'Skipping the first evening’s resolution'),
              signed(ZARZAD.pominiecie, 0),
            ),
            fakt('zero', L('Przy zerze', 'At zero'), koniecTytul('exodus', c)),
          ],
          jak: [
            L(
              `Czip „Zaufanie” u góry pokazuje wartość; dbajcie o ciepło, jedzenie i bezpieczeństwo ${w.mieszkancy.d}, a ${w.zarzad.m} nie traci zaufania.`,
              `The “Trust” chip at the top shows the value; look after the warmth, food and safety of the ${e.mieszkancy}, and ${e.krotko} does not lose trust.`,
            ),
          ],
          zobacz: [
            'zarzad:wkurzenie',
            'zarzad:uchwaly',
            'zarzad:raport',
            'zarzad:koniec',
            'potrzeba:warm',
            'potrzeba:food',
          ],
        };
      },
      'zaufanie trust czip pasek',
    ),

    def(
      'zarzad:wkurzenie',
      'zarzad',
      () => L('Wkurzenie', 'Anger'),
      (c): Tresc => {
        const { words: w, e } = c;
        const baza = dryfBaza();
        const klotliwy = dryfCechy('klotliwy').a;
        const optymista = dryfCechy('optymista').a;
        return {
          zdania: [
            L(
              `Wkurzenie mówi, jak bardzo ${w.mieszkancy.m} mają dość: skala 0–100, na starcie ${ZARZAD.start[1]}.`,
              `Anger shows how fed up the ${e.mieszkancy} are: a 0–100 scale, ${ZARZAD.start[1]} at the start.`,
            ),
            L(
              'Co rano zmienia się o dzienny dryf: zimno, głód i strach je podnoszą, a najedzenie i ognisko wieczorem obniżają.',
              'Every morning it moves by a daily drift: cold, hunger and fear raise it, while food and an evening campfire lower it.',
            ),
            L(
              `Podnoszą je też spalone meble (${signed(dryfMebla())} za sztukę), śmierć kogoś z ${w.zarzad.dk} (${signed(SMIERC_ZARZAD[1], 0)}), wtargnięcie szabrowników (${signed(NOC.wtargniecie.wkurzenie, 0)}) i niektóre uchwały.`,
              `Burned furniture raises it too (${signed(dryfMebla())} a piece), as do a death on ${e.krotko} (${signed(SMIERC_ZARZAD[1], 0)}), looters getting in (${signed(NOC.wtargniecie.wkurzenie, 0)}) and some resolutions.`,
            ),
            L(
              `Przy stu ${w.walne} odwołuje ${w.zarzad.krotko} i gra się kończy.`,
              `At a hundred ${e.walne} votes ${e.krotko} out and the game ends.`,
            ),
          ],
          fakty: [
            fakt('start', L('Na początku', 'At the start'), `${ZARZAD.start[1]}`),
            fakt(
              'czip',
              L('Kolor czipa na pasku', 'Colour of the chip on the top bar'),
              L(
                `czerwony powyżej ${ZARZAD.czipWkurzenie[0]}, żółty powyżej ${ZARZAD.czipWkurzenie[1]}`,
                `red above ${ZARZAD.czipWkurzenie[0]}, amber above ${ZARZAD.czipWkurzenie[1]}`,
              ),
            ),
            fakt(
              'baza',
              L('Dryf, gdy nic nie zmienia', 'Drift when nothing changes it'),
              L(`${signed(baza[1])} dziennie`, `${signed(baza[1])} a day`),
            ),
            ...faktyDryfu('A'),
            fakt(
              'ognisko',
              L('Ognisko po 18:00', 'A campfire after 18:00'),
              L(`${signed(dryfOgniska())} dziennie`, `${signed(dryfOgniska())} a day`),
            ),
            fakt(
              'meble',
              L('Każdy spalony mebel', 'Every burned piece of furniture'),
              L(
                `${signed(dryfMebla())} dziennie (z uchwałą o meblach połowa)`,
                `${signed(dryfMebla())} a day (half with the furniture resolution)`,
              ),
            ),
            fakt('klotliwy', cechaNazwa('klotliwy'), L(`${signed(klotliwy)} dziennie`, `${signed(klotliwy)} a day`)),
            fakt(
              'optymista',
              cechaNazwa('optymista'),
              L(`${signed(optymista)} dziennie`, `${signed(optymista)} a day`),
            ),
            fakt('uchwaly', L('Uchwały', 'Resolutions'), uchwalyMiary(1, c)),
            fakt('wtargniecie', L('Szabrownicy weszli', 'Looters got in'), signed(NOC.wtargniecie.wkurzenie, 0)),
            fakt('odparcie', L('Napad odparty', 'A raid repelled'), signed(NOC.odparcie.wkurzenie, 0)),
            fakt(
              'smierc',
              L(`Śmierć: ktoś z ${w.zarzad.dk}, ktoś spoza`, `A death: on ${e.krotko}, outside it`),
              `${signed(SMIERC_ZARZAD[1], 0)} / ${signed(SMIERC_MIESZKANIEC[1], 0)}`,
            ),
            fakt('sto', L('Przy stu', 'At a hundred'), koniecTytul('odwolanie', c)),
          ],
          jak: [
            L(
              'Czip „Wkurzenie” u góry pokazuje wartość; ogrzejcie i nakarmcie ludzi, rozpalcie wieczorem ognisko i nie palcie mebli bez potrzeby.',
              'The “Anger” chip at the top shows the value; warm and feed people, light a campfire in the evening and do not burn furniture without need.',
            ),
          ],
          zobacz: [
            'zarzad:zaufanie',
            'zarzad:uchwaly',
            'zarzad:raport',
            'zarzad:koniec',
            'zasob:ognisko',
            'zasob:meble',
          ],
        };
      },
      'wkurzenie gniew anger czip pasek',
    ),

    def(
      'zarzad:zebranie',
      'zarzad',
      (c) => L(`Wieczorne zebranie ${c.words.zarzad.dk}`, `The evening meeting of ${c.e.krotko}`),
      (c): Tresc => {
        const { words: w, e } = c;
        const pierwsze = (FIRST_LAWS as readonly string[]).map((id) => wCyt(nazwaUchwaly(id, c)));
        return {
          zdania: [
            L(
              `Co wieczór o ${LAW_HOUR}:${LAW_MINUTE} ${w.zarzad.m} zbiera się na zebranie i może podjąć jedną uchwałę, jeśli od poprzedniej minęło dość czasu.`,
              `Every evening at ${LAW_HOUR}:${LAW_MINUTE} ${e.krotko} meets and can pass one resolution, if enough time has passed since the last one.`,
            ),
            L(
              `Okno czeka na decyzję do ${wstawGodz(CARD_DEADLINE)}; jeśli nikt niczego nie podpisze, zebranie kończy się bez uchwały.`,
              `The window waits for a decision until ${wstawGodz(CARD_DEADLINE)}; if nobody signs anything, the meeting ends with no resolution.`,
            ),
            L(
              `Pierwszego wieczoru wybieracie jedną z trzech: ${pierwsze.join(', ')}; odłożenie tej uchwały kosztuje ${-ZARZAD.pominiecie} zaufania.`,
              `On the first evening you pick one of three: ${pierwsze.join(', ')}; putting this resolution off costs ${-ZARZAD.pominiecie} trust.`,
            ),
            L(
              `Po zebraniu o ${wstawGodz(CARD_HOUR)} przychodzi karta nocy.`,
              `After the meeting, at ${wstawGodz(CARD_HOUR)}, the Night orders come.`,
            ),
          ],
          fakty: [
            fakt('godzina', L('Zebranie o', 'The meeting at'), `${LAW_HOUR}:${LAW_MINUTE}`),
            fakt('czeka', L('Czeka na decyzję do', 'Waits for a decision until'), wstawGodz(CARD_DEADLINE)),
            fakt('odstep', L('Odstęp między uchwałami', 'Time between resolutions'), godz(LAW_CD / 60)),
            fakt('pierwsze', L('Pierwszego wieczoru do wyboru', 'On offer on the first evening'), pierwsze.join(', ')),
            fakt(
              'pominiecie',
              L('Odłożenie uchwały pierwszego wieczoru', 'Putting off the first evening’s resolution'),
              L(`zaufanie ${signed(ZARZAD.pominiecie, 0)}`, `trust ${signed(ZARZAD.pominiecie, 0)}`),
            ),
          ],
          jak: [
            L(
              `W oknie zebrania ${cyt('Podpisać', 'Sign')} przy wybranej uchwale, albo ${cyt('Nic dziś nie uchwalamy', 'No resolution today')}.`,
              `In the meeting window press ${cyt('Podpisać', 'Sign')} beside the chosen resolution, or ${cyt('Nic dziś nie uchwalamy', 'No resolution today')}.`,
            ),
          ],
          zobacz: ['zarzad:uchwaly', 'noc:karta', 'zarzad:zaufanie', 'start:czas'],
        };
      },
      'zebranie uchwała wieczór meeting',
    ),

    def(
      'zarzad:uchwaly',
      'zarzad',
      () => L('Uchwały', 'Resolutions'),
      (c): Tresc => {
        const { words: w, e } = c;
        return {
          zdania: [
            L(
              `Uchwała to stała zasada, którą podpisuje ${w.zarzad.m} na wieczornym zebraniu: zmienia liczby w grze i zaufanie albo wkurzenie ${w.mieszkancy.d}.`,
              `A resolution is a standing rule that ${e.krotko} signs at the evening meeting: it changes numbers in the game and the trust or anger of the ${e.mieszkancy}.`,
            ),
            L(
              `Jest ich ${lawIds().length}, w trzech drogach: ${sciezka('base')}, ${sciezka('porzadek')} i ${sciezka('wspolnota')}; kto wybierze jedną z dwóch ostatnich, zamyka drugą.`,
              `There are ${lawIds().length}, in three paths: ${sciezka('base')}, ${sciezka('porzadek')} and ${sciezka('wspolnota')}; whoever picks one of the last two closes the other.`,
            ),
            L(
              `Niektóre wymagają innej: ${wCyt(nazwaUchwaly('u_brama', c))} wymaga uchwały ${wCyt(nazwaUchwaly('u_warty', c))}.`,
              `Some need another: ${wCyt(nazwaUchwaly('u_brama', c))} needs the resolution ${wCyt(nazwaUchwaly('u_warty', c))}.`,
            ),
            L(
              `Jedną uchwałę można podpisać na zebraniu, a następną najwcześniej po ${godz(LAW_CD / 60)}; podpisana zostaje na stałe.`,
              `One resolution can be signed per meeting and the next one no sooner than ${godz(LAW_CD / 60)} later; once signed it stays.`,
            ),
          ],
          fakty: lawIds().map((id) =>
            fakt(
              `uchwala-${id}`,
              nazwaUchwaly(id, c),
              L(
                `${sciezka(M1_LAWS[id].path)}; od razu: ${zmiana(M1_LAWS[id].imm, false)}; co rano: ${zmiana(M1_LAWS[id].daily, true)}`,
                `${sciezka(M1_LAWS[id].path)}; at once: ${zmiana(M1_LAWS[id].imm, false)}; every morning: ${zmiana(M1_LAWS[id].daily, true)}`,
              ),
            ),
          ),
          jak: [
            L(
              `Okno uchwały pojawia się na zebraniu o ${LAW_HOUR}:${LAW_MINUTE}: ${cyt('Podpisać', 'Sign')} przy wybranej uchwale.`,
              `The resolution window appears at the meeting at ${LAW_HOUR}:${LAW_MINUTE}: press ${cyt('Podpisać', 'Sign')} beside the chosen one.`,
            ),
          ],
          zobacz: [...lawIds().map((id) => `uchwala:${id}`), 'zarzad:zebranie', 'zarzad:zaufanie'],
        };
      },
      'uchwały prawo droga porządek wspólnota resolutions law',
    ),

    ...lawIds().map(uchwala),

    def(
      'zarzad:raport',
      'zarzad',
      () => L('Poranny raport', 'The morning report'),
      (): Tresc => {
        const tytuly = tytulyRaportu();
        return {
          zdania: [
            L(
              `O ${wstawGodz(MORNING)} przychodzi raport z nocy: tytuł mówi, czy noc była spokojna, napad odparto, czy szabrownicy weszli.`,
              `At ${wstawGodz(MORNING)} the report on the night arrives: its title says whether the night was quiet, a raid was fought off, or looters got in.`,
            ),
            L(
              'Pod tytułem jest lista tego, co się działo: kto pilnował, kto wrócił z wyprawy i z czym, kto oberwał i jak było w kuchni.',
              'Under the title is a list of what happened: who kept watch, who came back from a run and with what, who got hurt and how the kitchen was.',
            ),
            L(
              `Tabliczki podsumowują kuchnię rano (zielona od ${NOC.kuchnia.cieplo}°C, czerwona poniżej ${NOC.kuchnia.chlodno}°C), to, co zabrano, co przyniesiono z wypraw i kto jest ranny.`,
              `The tiles sum up the kitchen in the morning (green from ${NOC.kuchnia.cieplo}°C, red below ${NOC.kuchnia.chlodno}°C), what was taken, what was brought back from runs and who is hurt.`,
            ),
            L(
              'Na dole są zaufanie i wkurzenie z różnicą po nocy.',
              'At the bottom are trust and anger with the change over the night.',
            ),
          ],
          fakty: [
            fakt('tytuly', L('Tytuł raportu', 'Report title'), tytuly.join(' / ')),
            fakt('godzina', L('Raport o', 'The report at'), wstawGodz(MORNING)),
            fakt('noc', L('Noc od karty do raportu', 'From the card to the report'), godz(GODZIN_NOCY)),
            fakt(
              'kuchnia',
              L('Kuchnia rano: zielona, czerwona', 'Kitchen in the morning: green, red'),
              L(
                `od ${NOC.kuchnia.cieplo}°C, poniżej ${NOC.kuchnia.chlodno}°C`,
                `from ${NOC.kuchnia.cieplo}°C, below ${NOC.kuchnia.chlodno}°C`,
              ),
            ),
            fakt('przycisk', L('Przycisk', 'Button'), cyt('Nowy dzień', 'New day')),
          ],
          jak: [
            L(
              `Przeczytajcie linie raportu, a potem ${cyt('Nowy dzień', 'New day')}: gra wraca do waszego tempa.`,
              `Read the lines of the report, then press ${cyt('Nowy dzień', 'New day')}: the game goes back to your speed.`,
            ),
          ],
          zobacz: ['noc:karta', 'noc:napad', 'noc:koza', 'zarzad:zaufanie', 'zarzad:wkurzenie'],
        };
      },
      'raport rano noc report morning',
    ),

    def(
      'zarzad:koniec',
      'zarzad',
      () => L('Koniec gry', 'Game over'),
      (c): Tresc => {
        const { words: w, e } = c;
        return {
          zdania: [
            L(
              `Grę można przegrać na trzy sposoby: wkurzenie dochodzi do 100, zaufanie spada do zera albo nikt z ${w.zarzad.dk} nie zostaje.`,
              `You can lose in three ways: anger reaches 100, trust falls to zero, or nobody is left on ${e.krotko}.`,
            ),
            L(
              `Przy wkurzeniu 100 ${w.walne} odwołuje ${w.zarzad.krotko}, przy zaufaniu 0 ludzie odchodzą, a bez ludzi nie ma kogo prowadzić.`,
              `At anger 100 ${e.walne} votes ${e.krotko} out, at trust 0 people leave, and with no people there is nobody to lead.`,
            ),
            L(
              'Zakończenia porażki mają własne ekrany, z których wraca się do ekranu startowego i nowej gry.',
              'The defeat endings have screens of their own, from which you go back to the start screen and a new game.',
            ),
            L(
              'Zwycięstwo to osobna sprawa: daje je przejście jednej z dróg, a gra toczy się dalej.',
              'Victory is a separate matter: it comes from completing one of the roads, and the game goes on.',
            ),
          ],
          fakty: [
            fakt('odwolanie', L('Wkurzenie 100', 'Anger 100'), koniecTytul('odwolanie', c)),
            fakt('exodus', L('Zaufanie 0', 'Trust 0'), koniecTytul('exodus', c)),
            fakt('pustka', L('Nikt nie zostaje', 'Nobody left'), koniecTytul('pustka', c)),
          ],
          zobacz: ['zarzad:zaufanie', 'zarzad:wkurzenie', 'drogi:ekran'],
        };
      },
      'koniec gry przegrana odwołanie exodus game over',
    ),
  ];
}
