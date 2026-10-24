/* Wiki w grze, kategoria „Noc”: karta nocy o 20:00 (`noc:karta`), warta (`noc:warta`), dyżur przy kozie (`noc:koza`), wyprawa
   z karty (`noc:wyprawa`) i napad szabrowników (`noc:napad`, identyfikator, do którego odsyłają artykuły o trybie zombie
   i o wydarzeniach). Liczby wiki odczytuje z funkcji zarządu, a nie przepisuje: szansę napadu z `raidChance`, odstraszanie z
   `deterrence`, siłę warty z `guardValue`, obronę posterunku z `defenseAt`, liczbę szabrowników z `raidersOf`, straty z
   `lossIfEntered`, ryzyko wyprawy z `expRisk`, progi zdrowia i sił z samej karty (`progiKarty`), drewno na noc z `nightWood`.
   Ręcznie wpisane są tylko liczby, które zarząd ma na stałe w kodzie (okno napadu 23:00–4:00, wzór siły napadu, skutki
   odparcia i wtargnięcia, szansa zaśnięcia na warcie, koszty wyprawy, znaleziska): zebrane w `NOC`, a test
   (tests/unit/wiki-noc.test.ts) przypina je do tekstu src/gov/noc.ts. */

import { L, tr } from '../core/jezyk.ts';
import {
  CARD_DEADLINE,
  CARD_HOUR,
  defenseAt,
  deterrence,
  expRisk,
  guardValue,
  lossIfEntered,
  MORNING,
  nightWood,
  raidChance,
  raidersOf,
  WOOD_PER_HOUR,
  weaponFactor,
} from '../gov/noc.ts';
import { lawNameTx, TARGETS } from '../gov/tresc.ts';
import type { GovInput, GovPerson } from '../gov/typy.ts';
import { BLISKO_DO_M, UDZWIG_NA_OSOBE } from '../gov/wyprawy.ts';
import { REST_AWAKE } from '../sim/needs.ts';
import { num, signed } from './tekst.ts';
import { cechaNazwa, ryzykoMnoznik, wartaMnoznik, wartaNaPoziom } from './wiki-ludzie.ts';
import { cyt, godz, polecenie, proc, wCyt } from './wiki-slowa.ts';
import {
  granica,
  leniwie,
  progiKarty,
  sondaOsoba,
  sondaStan,
  sondaStanZUchwalami,
  sondaWejscie,
} from './wiki-sondy.ts';
import { type Def, def, type Fakt, fakt, type Tresc, type WikiCtx } from './wiki-typy.ts';

/** Liczby, które zarząd ma na stałe w kodzie karty nocy (src/gov/noc.ts) i w jego skutkach; test je przypina. */
export const NOC = {
  /** napad przychodzi w losowej chwili od 23:00 przez 5 godzin */
  napadOd: 23,
  napadGodzin: 5,
  /** siła napadu: 2 + losowo do (2 + 0,55 × numer nocy) */
  silaBaza: 2,
  silaLos: 2,
  silaNaNoc: 0.55,
  /** odparcie: zaufanie, wkurzenie; bezpieczeństwo wszystkich; nastrój stojących na posterunku (12 h) */
  odparcie: { zaufanie: 2, wkurzenie: -1, bezpieczenstwo: 8, nastroj: 6 },
  /** wtargnięcie: zaufanie, wkurzenie; bezpieczeństwo wszystkich; nastrój wszystkich (12 h); rana strażnika z posterunku */
  wtargniecie: { zaufanie: -2, wkurzenie: 4, bezpieczenstwo: -25, nastroj: -8, rana: -25 },
  /** nikt nie spróbował: bezpieczeństwo wszystkich */
  spokoj: 4,
  /** udział złomu zabieranego przy wtargnięciu */
  zlom: 0.3,
  /** szansa zaśnięcia na warcie: siły poniżej 30 i poniżej 15 */
  sen: { zmeczony: [30, 0.15], wyczerpany: [15, 0.5] },
  /** nastrój po nocy na warcie i przy kozie (8 h) */
  nastrojWarta: -2,
  nastrojKoza: -1,
  /** wyprawa: łup grupy razy, koszt sił (blisko, daleko), rana w kłopotach (od, do), szansa ugryzienia w kłopotach (zombie) */
  lupGrupy: 1.6,
  kosztSil: { blisko: -15, daleko: -30 },
  ranaKlopot: [20, 35],
  ugryzienie: 0.35,
  /** znaleziska z wyprawy: amunicja i broń (zwykły tryb, zombie) */
  znaleziskoAmunicja: { zwykly: 0.1, zombie: 0.3, sztuk: [2, 8] },
  znaleziskoBron: { zwykly: 0.08, zombie: 0.12 },
  /** kuchnia rano: ciepło od, chłodno od (°C) */
  kuchnia: { cieplo: 18, chlodno: 15 },
} as const;

// ---------------------------------------------------------------- sondy zarządu

const dziury = (n: number) => Array.from({ length: n }, (_, k) => ({ id: k + 1, size: 0.6 }));

export interface Warunki {
  noc?: number;
  dziury?: number;
  trwalosc?: number;
  lampa?: boolean;
  ognisko?: boolean;
  pies?: boolean;
  uchwaly?: string[];
}

/** wejście zarządu dla nocy `noc` o 20:00 z siatką i światłem według `o` */
function wejscie(o: Warunki = {}): GovInput {
  return sondaWejscie({
    day: o.noc ?? 1,
    hour: 20,
    fence: { holes: dziury(o.dziury ?? 0), durability: o.trwalosc ?? 0.5 },
    light: { campfire: !!o.ognisko, gateLamp: !!o.lampa },
  });
}

/** szansa napadu (z `raidChance`) przy podanych warunkach */
export function szansa(o: Warunki = {}): number {
  const st = sondaStanZUchwalami(...(o.uchwaly ?? []));
  st.flags.dog = !!o.pies;
  return raidChance(st, wejscie(o));
}

/** o ile punktów procentowych zmienia szansę napadu dana zmiana warunków (względem nocy 1 i zwykłej siatki) */
export const zmianaSzansy = (o: Warunki): number => Math.round((szansa(o) - szansa()) * 100);

/** liczby szansy napadu do artykułu */
const napad = leniwie(() => ({
  pierwsza: szansa(),
  szosta: szansa({ noc: 6 }),
  naNoc: zmianaSzansy({ noc: 2 }),
  dziura: zmianaSzansy({ dziury: 1 }),
  slabaSiatka: zmianaSzansy({ trwalosc: 0 }),
  mocnaSiatka: zmianaSzansy({ trwalosc: 1 }),
  lampa: zmianaSzansy({ lampa: true }),
  ognisko: zmianaSzansy({ ognisko: true }),
  pies: zmianaSzansy({ pies: true }),
  warty: zmianaSzansy({ uchwaly: ['u_warty'] }),
  brama: zmianaSzansy({ uchwaly: ['u_brama'] }),
  najmniej: szansa({ trwalosc: 1, lampa: true, ognisko: true, pies: true, uchwaly: ['u_warty', 'u_brama'] }),
  najwiecej: szansa({ noc: 12, dziury: 8, trwalosc: 0 }),
}));

/** o ile zostaje z szansy, gdy przy siatce widać wartę: jedna osoba, dwie osoby, ze światłem (z `deterrence`) */
const odstraszanie = leniwie(() => {
  const st = sondaStan();
  const bez = wejscie();
  const swiatlo = wejscie({ lampa: true });
  return {
    jedna: deterrence(st, bez, 1),
    dwie: deterrence(st, bez, 2),
    jednaSwiatlo: deterrence(st, swiatlo, 1),
    dwieSwiatlo: deterrence(st, swiatlo, 2),
  };
});

/** Progi liczby szabrowników: siły napadu, od których przychodzi dwóch i trzech (z `raidersOf`, skanem po sile). */
const progiNapastnikow = leniwie((): [number, number] => {
  const prog = (n: number): number => {
    for (let x = 0; x < 20; x += 0.01) if (raidersOf(x) >= n) return Math.round(x * 100) / 100;
    return 20;
  };
  return [prog(2), prog(3)];
});

/** obrona bramy bez warty przy słabej i mocnej siatce, z psem i z uchwałą o wartach (z `defenseAt`) */
export const obrona = leniwie(() => {
  const st = sondaStan();
  const stU = sondaStanZUchwalami('u_warty');
  const stPies = sondaStan();
  stPies.flags.dog = true;
  const brama = (s: typeof st, trwalosc: number) => defenseAt(s, wejscie({ trwalosc }), 'brama', []);
  const inne = defenseAt(stPies, wejscie(), 'd1', []);
  return {
    slaba: brama(st, 0),
    mocna: brama(st, 1),
    uchwala: Math.round((brama(stU, 0.5) - brama(st, 0.5)) * 10) / 10,
    pies: Math.round((brama(stPies, 0.5) - brama(st, 0.5)) * 10) / 10,
    piesInne: inne,
    innaWarta: defenseAt(st, wejscie(), 'd1', [{ p: sondaOsoba(), post: 'brama' }]),
  };
});

/** iloraz dwóch wartości warty zaokrąglony do 0,05 (zaokrąglenie `guardValue` do 0,1 psuje dokładniejszy iloraz) */
const iloraz = (a: number, b: number): number => Math.round((a / b) * 20) / 20;

/** siła warty przy bramie osoby wypoczętej, zmęczonej i rannej, progi, na których się zmienia, i mnożniki od uchwały o wartach
    i lampy przy bramie (z `guardValue`, na osobie z bronią palną i Obroną 4, żeby wartość była duża) */
export const warta = leniwie(() => {
  const st = sondaStan();
  const i = sondaWejscie();
  const v = (needs: Partial<GovPerson['needs']>) =>
    guardValue(st, i, sondaOsoba({ needs: needs as GovPerson['needs'] }), 'brama');
  const mocna = sondaOsoba({ arm: 'palna', skills: { obrona: 4 } });
  const lampa = sondaWejscie({ light: { campfire: false, gateLamp: true } });
  const stU = sondaStanZUchwalami('u_warty');
  return {
    wypoczety: v({}),
    zmeczony: v({ rest: 20 }),
    ranny: v({ health: 10 }),
    progSil: granica((x) => v({ rest: x }) > v({ rest: 0 })),
    progZdrowia: granica((x) => v({ health: x }) > v({ health: 0 })),
    bron: {
      wrecz: weaponFactor({ arm: 'wrecz' }),
      dzida: weaponFactor({ arm: 'dzida' }),
      palna: weaponFactor({ arm: 'palna' }),
    },
    uchwala: iloraz(guardValue(stU, i, mocna, 'brama'), guardValue(st, i, mocna, 'brama')),
    lampa: iloraz(guardValue(stU, lampa, mocna, 'brama'), guardValue(stU, i, mocna, 'brama')),
  };
});

/** straty przy wtargnięciu: z drewna luzem, drewna w składzie i zapasów (z `lossIfEntered` na stu sztukach) */
const straty = leniwie(() => {
  const przy = (s: Partial<GovInput['stock']>) =>
    lossIfEntered(sondaWejscie({ stock: { wood: 100, supplies: 100, ...s } as GovInput['stock'] }));
  return {
    luzem: przy({ woodLoose: 100, woodSklad: 0 }).wood / 100,
    sklad: przy({ woodLoose: 0, woodSklad: 100 }).wood / 100,
    zapasy: przy({ woodLoose: 0, woodSklad: 0 }).supplies / 100,
  };
});

/** do wyprawy: progi zdrowia i sił, godziny powrotu i czynniki ryzyka (z `expRisk` i z tabeli celów) */
const wyprawa = leniwie(() => {
  const karta = progiKarty();
  const st = sondaStan();
  const zombie = sondaStan();
  zombie.mode = 'zombie';
  const cel = { ryzyko: 0.4 };
  const razem = expRisk(st, sondaOsoba(), cel, 2) / expRisk(st, sondaOsoba(), cel, 1);
  return {
    karta,
    wracaBlisko: TARGETS.find((t) => t.range === 'blisko')?.back ?? 1,
    wracaDaleko: TARGETS.find((t) => t.range === 'daleko')?.back ?? 5,
    progSil: granica((v) => ryzykoMnoznik({ needs: { rest: v } as GovPerson['needs'] }) < 1.0001),
    progZdrowia: granica((v) => ryzykoMnoznik({ needs: { health: v } as GovPerson['needs'] }) < 1.0001),
    zmeczony: ryzykoMnoznik({ needs: { rest: 0 } as GovPerson['needs'] }),
    ranny: ryzykoMnoznik({ needs: { health: 0 } as GovPerson['needs'] }),
    razem,
    palna: ryzykoMnoznik({ arm: 'palna' }),
    wrecz: ryzykoMnoznik({ arm: 'wrecz' }),
    zombie: expRisk(zombie, sondaOsoba(), cel) / expRisk(st, sondaOsoba(), cel),
  };
});

/** drewno na noc przy dyżurze od 20:00: ile sztuk zjada jedno palenisko (z `nightWood`) */
const drewnoNaNoc = leniwie(() => nightWood(sondaWejscie({ stock: { wood: 0, supplies: 0 } })).need);

export const wstawGodz = (g: number): string => `${g}:00`;

/** sama noc od karty do rana w godzinach */
export const GODZIN_NOCY = (MORNING - CARD_HOUR + 24) % 24;

function faktyNapadu(c: WikiCtx): Fakt[] {
  const { words: w, e } = c;
  const n = napad();
  const o = odstraszanie();
  const ob = obrona();
  const pr = progiNapastnikow();
  const s = straty();
  return [
    fakt(
      'szansa-baza',
      L('Szansa napadu pierwszej i szóstej nocy', 'Raid chance on night 1 and night 6'),
      `${proc(n.pierwsza)} / ${proc(n.szosta)}`,
    ),
    fakt(
      'noc',
      L('Każda noc do szóstej dokłada', 'Every night up to the sixth adds'),
      L(`+${n.naNoc} pkt`, `+${n.naNoc} pts`),
    ),
    fakt(
      'dziura',
      L('Każda dziura w siatce (do czterech)', 'Every hole in the fence (up to four)'),
      L(`+${n.dziura} pkt`, `+${n.dziura} pts`),
    ),
    fakt(
      'siatka',
      L('Zniszczona i nowa siatka', 'A ruined and a new fence'),
      L(
        `${signed(n.slabaSiatka, 0)} i ${signed(n.mocnaSiatka, 0)} pkt`,
        `${signed(n.slabaSiatka, 0)} and ${signed(n.mocnaSiatka, 0)} pts`,
      ),
    ),
    fakt(
      'swiatlo',
      L(`Lampa ${w.brama.przy}, ognisko`, `A lamp at ${e.brama}, campfire`),
      L(`${signed(n.lampa, 0)} i ${signed(n.ognisko, 0)} pkt`, `${signed(n.lampa, 0)} and ${signed(n.ognisko, 0)} pts`),
    ),
    fakt('pies', L('Pies', 'A dog'), L(`${signed(n.pies, 0)} pkt`, `${signed(n.pies, 0)} pts`)),
    fakt(
      'uchwaly',
      L(
        `Uchwały ${wCyt(tr(lawNameTx('u_warty', c.place)))} i ${wCyt(tr(lawNameTx('u_brama', c.place)))}`,
        `The resolutions ${wCyt(tr(lawNameTx('u_warty', c.place)))} and ${wCyt(tr(lawNameTx('u_brama', c.place)))}`,
      ),
      L(`${signed(n.warty, 0)} i ${signed(n.brama, 0)} pkt`, `${signed(n.warty, 0)} and ${signed(n.brama, 0)} pts`),
    ),
    fakt('zakres', L('Najmniej i najwięcej', 'Lowest and highest'), `${proc(n.najmniej)} / ${proc(n.najwiecej)}`),
    fakt(
      'odstraszanie',
      L('Z jedną, dwiema osobami na warcie zostaje', 'With one, two people on watch it stays'),
      `${proc(o.jedna)} / ${proc(o.dwie)}`,
    ),
    fakt(
      'swiatlo-warta',
      L('Ze światłem: jedna, dwie osoby na warcie', 'With a light: one, two people on watch'),
      `${proc(o.jednaSwiatlo)} / ${proc(o.dwieSwiatlo)}`,
    ),
    fakt(
      'okno',
      L('Napad przychodzi', 'The raid comes'),
      `${wstawGodz(NOC.napadOd)}–${wstawGodz((NOC.napadOd + NOC.napadGodzin) % 24)}`,
    ),
    fakt(
      'sila',
      L('Siła napadu', 'Raid strength'),
      L(
        `od ${NOC.silaBaza} do ${NOC.silaBaza + NOC.silaLos} + ${num(NOC.silaNaNoc, 2)} × numer nocy`,
        `from ${NOC.silaBaza} to ${NOC.silaBaza + NOC.silaLos} + ${num(NOC.silaNaNoc, 2)} × night number`,
      ),
    ),
    fakt(
      'ilu',
      L('Dwóch i trzech szabrowników od siły', 'Two and three looters from strength'),
      `${num(pr[0])} / ${num(pr[1])}`,
    ),
    fakt(
      'brama',
      L(
        `Obrona ${w.brama.d} bez warty: zniszczona i nowa siatka`,
        `Defence of ${e.brama} with no watch: ruined and new fence`,
      ),
      `${num(ob.slaba)} / ${num(ob.mocna)}`,
    ),
    fakt(
      'pies-obrona',
      L(
        `Pies dokłada do obrony ${w.brama.d} i innych miejsc`,
        `A dog adds to the defence of ${e.brama} and of other posts`,
      ),
      `${num(ob.pies)} / ${num(ob.piesInne)}`,
    ),
    fakt(
      'odparcie',
      L('Odparcie', 'Repelled'),
      L(
        `zaufanie ${signed(NOC.odparcie.zaufanie, 0)}, wkurzenie ${signed(NOC.odparcie.wkurzenie, 0)}, bezpieczeństwo ${signed(NOC.odparcie.bezpieczenstwo, 0)}`,
        `trust ${signed(NOC.odparcie.zaufanie, 0)}, anger ${signed(NOC.odparcie.wkurzenie, 0)}, safety ${signed(NOC.odparcie.bezpieczenstwo, 0)}`,
      ),
    ),
    fakt(
      'wtargniecie',
      L('Wtargnięcie', 'Looters get in'),
      L(
        `zaufanie ${signed(NOC.wtargniecie.zaufanie, 0)}, wkurzenie ${signed(NOC.wtargniecie.wkurzenie, 0)}, bezpieczeństwo ${signed(NOC.wtargniecie.bezpieczenstwo, 0)}, nastrój ${signed(NOC.wtargniecie.nastroj, 0)}`,
        `trust ${signed(NOC.wtargniecie.zaufanie, 0)}, anger ${signed(NOC.wtargniecie.wkurzenie, 0)}, safety ${signed(NOC.wtargniecie.bezpieczenstwo, 0)}, mood ${signed(NOC.wtargniecie.nastroj, 0)}`,
      ),
    ),
    fakt(
      'straty',
      L('Zabierają', 'They take'),
      L(
        `${proc(s.luzem)} drewna luzem i ${proc(s.sklad)} ze składu, ${proc(s.zapasy)} zapasów, ${proc(NOC.zlom)} złomu`,
        `${proc(s.luzem)} of loose wood and ${proc(s.sklad)} from the woodpile, ${proc(s.zapasy)} of the supplies, ${proc(NOC.zlom)} of the scrap`,
      ),
    ),
    fakt(
      'ranny',
      L('Strażnik z tego miejsca traci zdrowia', 'A guard at that post loses health'),
      `${signed(NOC.wtargniecie.rana, 0)}`,
    ),
  ];
}

export function definicjeNoc(): Def[] {
  return [
    def(
      'noc:karta',
      'noc',
      () => L('Karta nocy', 'The Night orders'),
      (c): Tresc => {
        const { words: w, e } = c;
        const kartaProgi = wyprawa().karta;
        return {
          zdania: [
            L(
              `O ${wstawGodz(CARD_HOUR)} przychodzi karta nocy: dla każdej osoby wybieracie, czy śpi, trzyma wartę, czuwa przy kozie albo idzie na wyprawę.`,
              `At ${wstawGodz(CARD_HOUR)} the Night orders come: for each person you choose whether they sleep, keep watch, sit up by the stove or go on a supply run.`,
            ),
            L(
              `Karta pokazuje szansę napadu, to, co zabiorą, ogień w kozie na noc i miejsca do pilnowania, a ${w.zarzad.m} podpowiada przydział; przycisk „Jak radzi ${w.zarzad.krotko}” do niego wraca.`,
              `The card shows the chance of a raid, what they would take, the fire in the stove for the night and the posts to watch, and ${e.krotko} suggests a line-up; the “As ${e.krotko} suggests” button goes back to it.`,
            ),
            L(
              'Przycisk „Zacznijcie noc” zatwierdza kartę, a czas płynie szybciej (6×) do rana.',
              'The “Start the night” button confirms the card, and time runs faster (6×) until morning.',
            ),
            L(
              `Gdy do ${wstawGodz(CARD_DEADLINE)} nikt nie zatwierdzi karty, zostaje propozycja ${w.zarzad.dk}.`,
              `If nobody confirms the card by ${wstawGodz(CARD_DEADLINE)}, ${e.krotko}’s suggestion stands.`,
            ),
            L(
              `Rano o ${wstawGodz(MORNING)} przychodzi raport z nocy.`,
              `At ${wstawGodz(MORNING)} in the morning the report on the night arrives.`,
            ),
          ],
          fakty: [
            fakt('godzina', L('Karta nocy o', 'The Night orders at'), wstawGodz(CARD_HOUR)),
            fakt('termin', L('Propozycja obowiązuje po', 'The suggestion stands after'), wstawGodz(CARD_DEADLINE)),
            fakt('raport', L('Raport z nocy o', 'The report on the night at'), wstawGodz(MORNING)),
            fakt(
              'opcje',
              L('Do wyboru dla osoby', 'Choices for a person'),
              [
                cyt('Śpi', 'Sleeps'),
                cyt('Czuwa przy kozie', 'Watches the stove'),
                cyt('Warta …', 'Watch …'),
                `${cyt('Warta na wieży', 'Watch on the tower')} ${L('(gdy stoi wieża)', '(with a tower)')}`,
                cyt('Wyprawa blisko …', 'Short run …'),
                cyt('Wyprawa daleko …', 'Long run …'),
              ].join(', '),
            ),
            fakt('warta-prog', L('Warta od zdrowia', 'Watch from health'), `${kartaProgi.warta}`),
            fakt('koza-prog', L('Dyżur przy kozie od zdrowia', 'Stove duty from health'), `${kartaProgi.koza}`),
            fakt(
              'blisko-prog',
              L('Wyprawa blisko od zdrowia i sił', 'A short run from health and energy'),
              `${kartaProgi.blisko.health} / ${kartaProgi.blisko.rest}`,
            ),
            fakt(
              'daleko-prog',
              L('Wyprawa daleko od zdrowia i sił', 'A long run from health and energy'),
              `${kartaProgi.daleko.health} / ${kartaProgi.daleko.rest}`,
            ),
            fakt('sen-noc', L('Noc od karty do rana', 'From the card to morning'), godz(GODZIN_NOCY)),
          ],
          jak: [
            L(
              `Przy każdej osobie wybierzcie z listy, co robi tej nocy, potem ${cyt('Zacznijcie noc', 'Start the night')}.`,
              `Pick from the list beside each person what they do tonight, then ${cyt('Zacznijcie noc', 'Start the night')}.`,
            ),
          ],
          zobacz: ['noc:warta', 'noc:koza', 'noc:wyprawa', 'noc:napad', 'potrzeba:rest', 'zarzad:raport'],
        };
      },
      'karta nocy wieczór propozycja przydział night orders',
    ),

    def(
      'noc:warta',
      'noc',
      () => L('Warta', 'Watch'),
      (c): Tresc => {
        const { words: w, e } = c;
        const o = odstraszanie();
        const sen = NOC.sen;
        return {
          zdania: [
            L(
              `Warta stoi przy jednym z miejsc, którędy szabrownicy mogą wejść: ${w.brama.przy} albo przy dziurze w siatce, a z wieżą także na wieży.`,
              `A watch stands at one of the places where looters can get in: at ${e.brama} or at a hole in the fence, and with a tower also on the tower.`,
            ),
            L(
              `Szabrownicy wybierają miejsce losowo, ale częściej to słabsze: większa dziura albo ${w.brama.m} przy zniszczonej siatce.`,
              `Looters pick the place at random, but the weaker one more often: a bigger hole, or ${e.brama} in a ruined fence.`,
            ),
            L(
              `Warta odstrasza: z jedną osobą szansa napadu spada do ${proc(o.jedna)}, z dwiema do ${proc(o.dwie)}, a przy świetle jeszcze niżej.`,
              `A watch deters: with one person the chance of a raid falls to ${proc(o.jedna)}, with two to ${proc(o.dwie)}, and lower still with a light.`,
            ),
            L(
              `Warta kosztuje noc snu: ${godz(GODZIN_NOCY)} na nogach to ${num(REST_AWAKE * GODZIN_NOCY)} sił, a zmęczony strażnik może zasnąć na posterunku.`,
              `A watch costs a night’s sleep: ${godz(GODZIN_NOCY)} on foot is ${num(REST_AWAKE * GODZIN_NOCY)} energy, and a tired guard may fall asleep at the post.`,
            ),
            L(
              `Rano wartownik ma nastrój ${signed(NOC.nastrojWarta, 0)} na 8 h i najpierw je, potem odsypia.`,
              `In the morning the guard has a mood of ${signed(NOC.nastrojWarta, 0)} for 8 h, and first eats, then catches up on sleep.`,
            ),
          ],
          fakty: [
            fakt(
              'sila',
              L(
                'Siła warty bez dodatków: wypoczęty, zmęczony, ranny',
                'Watch strength with no extras: rested, tired, hurt',
              ),
              `${num(warta().wypoczety)} / ${num(warta().zmeczony)} / ${num(warta().ranny)}`,
            ),
            fakt(
              'progi',
              L('Progi: siły powyżej, zdrowie poniżej', 'Thresholds: energy above, health below'),
              `${warta().progSil} / ${warta().progZdrowia}`,
            ),
            fakt(
              'obrona',
              L('Umiejętność Obrona', 'The Defence skill'),
              L(
                `${signed(Math.round(wartaNaPoziom() * 100), 0)}% na poziom`,
                `${signed(Math.round(wartaNaPoziom() * 100), 0)}% per level`,
              ),
            ),
            fakt(
              'bron',
              L('Broń wręcz, dzida, broń palna lub kusza', 'Melee weapon, spear, firearm or crossbow'),
              `×${num(warta().bron.wrecz, 2)} / ×${num(warta().bron.dzida, 2)} / ×${num(warta().bron.palna, 2)}`,
            ),
            fakt(
              'cechy',
              L(
                `${cechaNazwa('odwazny')} i ${cechaNazwa('tchorz')}`,
                `${cechaNazwa('odwazny')} and ${cechaNazwa('tchorz')}`,
              ),
              `×${num(wartaMnoznik('odwazny'))} / ×${num(wartaMnoznik('tchorz'))}`,
            ),
            fakt('lampa', L(`Lampa ${w.brama.przy}`, `A lamp at ${e.brama}`), `×${num(warta().lampa, 2)}`),
            fakt('uchwala', L('Uchwała o wartach', 'The resolution on watches'), `×${num(warta().uchwala, 2)}`),
            fakt(
              'sen',
              L(
                'Szansa zaśnięcia na warcie: siły poniżej 30, poniżej 15',
                'Chance of falling asleep on watch: energy below 30, below 15',
              ),
              `${proc(sen.zmeczony[1])} / ${proc(sen.wyczerpany[1])}`,
            ),
            fakt(
              'inne-posterunki',
              L('Warta z innego miejsca dokłada do obrony', 'A watch from another post adds to the defence'),
              `${num(obrona().innaWarta)}`,
            ),
            fakt(
              'nastroj',
              L('Nastrój po nocy na warcie', 'Mood after a night on watch'),
              L(`${signed(NOC.nastrojWarta, 0)} na 8 h`, `${signed(NOC.nastrojWarta, 0)} for 8 h`),
            ),
          ],
          jak: [
            L(
              `Na karcie nocy wybierzcie przy osobie ${cyt('Warta …', 'Watch …')} i miejsce.`,
              `On the Night orders pick ${cyt('Warta …', 'Watch …')} beside the person and a place.`,
            ),
            polecenie(c, ['dziurze w siatce', 'a hole in the fence'], ['Pilnować tutaj', 'Keep watch here']),
            polecenie(
              c,
              [w.brama.przy.replace(/^przy /, ''), e.brama],
              [`Pilnować ${w.brama.d}`, `Keep watch at ${e.brama}`],
            ),
          ],
          zobacz: [
            'noc:napad',
            'noc:karta',
            'ludzie:bron',
            'ludzie:umiejetnosci',
            'ludzie:cechy',
            'zasob:ognisko',
            'uchwala:u_warty',
          ],
        };
      },
      'warta wartownik posterunek pilnować strażnik watch guard post',
    ),

    def(
      'noc:koza',
      'noc',
      () => L('Dyżur przy kozie', 'Stove duty'),
      (c): Tresc => {
        const { words: w, e } = c;
        const kartaProgi = wyprawa().karta;
        return {
          zdania: [
            L(
              'Dyżur przy kozie to wybór gracza na karcie nocy: czuwający nie śpi i dokłada drewno do kozy, a przy kozach z beczek i kotle do wszystkich palenisk w siedzibie.',
              'Stove duty is the player’s choice on the Night orders: whoever sits up does not sleep and feeds the stove, and with barrel stoves and a cauldron all the fires in the building.',
            ),
            L(
              `Jedno palenisko zjada ${WOOD_PER_HOUR} szt. drewna na godzinę, więc noc od karty do rana to ${drewnoNaNoc()} szt.`,
              `One fire eats ${WOOD_PER_HOUR} piece of wood an hour, so the night from the card to morning takes ${drewnoNaNoc()} pieces.`,
            ),
            L(
              `Bez dyżuru koza gaśnie w nocy, bo wszyscy śpią, a rano w kuchni jest zimno; ${w.zarzad.m} radzi dyżur, gdy kuchnia stygnie, a drewno jest.`,
              `With nobody on duty the stove goes out in the night, because everyone is asleep, and the kitchen is cold in the morning; ${e.krotko} suggests a duty when the kitchen is cooling and there is wood.`,
            ),
            L(
              `Dyżur wymaga zdrowia ${kartaProgi.koza}, kosztuje noc snu i daje nastrój ${signed(NOC.nastrojKoza, 0)} na 8 h.`,
              `Duty needs health ${kartaProgi.koza}, costs a night’s sleep and gives a mood of ${signed(NOC.nastrojKoza, 0)} for 8 h.`,
            ),
            L(
              `Raport rano mówi, czy koza paliła się całą noc, kto przy niej czuwał i ile stopni jest w kuchni (ciepło od ${NOC.kuchnia.cieplo}°C, chłodno od ${NOC.kuchnia.chlodno}°C).`,
              `The morning report says whether the stove burned all night, who sat up with it and how warm the kitchen is (warm from ${NOC.kuchnia.cieplo}°C, chilly from ${NOC.kuchnia.chlodno}°C).`,
            ),
          ],
          fakty: [
            fakt('drewno-godz', L('Drewno na godzinę na palenisko', 'Wood per hour per fire'), `${WOOD_PER_HOUR}`),
            fakt(
              'drewno-noc',
              L('Drewno na noc od karty do rana', 'Wood for the night from the card to morning'),
              `${drewnoNaNoc()}`,
            ),
            fakt('godziny', L('Noc od karty do rana', 'From the card to morning'), godz(GODZIN_NOCY)),
            fakt('zdrowie', L('Dyżur od zdrowia', 'Duty from health'), `${kartaProgi.koza}`),
            fakt(
              'nastroj',
              L('Nastrój po nocy przy kozie', 'Mood after a night by the stove'),
              L(`${signed(NOC.nastrojKoza, 0)} na 8 h`, `${signed(NOC.nastrojKoza, 0)} for 8 h`),
            ),
            fakt('ogien-od', L('Ogień liczy się do raportu od', 'The fire counts for the report from'), wstawGodz(22)),
          ],
          jak: [
            L(
              `Na karcie nocy wybierzcie przy osobie ${cyt('Czuwa przy kozie', 'Watches the stove')}.`,
              `On the Night orders pick ${cyt('Czuwa przy kozie', 'Watches the stove')} beside the person.`,
            ),
            polecenie(c, ['kozie', 'the stove'], ['Czuwać przy kozie', 'Keep watch by the stove']),
          ],
          zobacz: ['zasob:koza', 'zasob:drewno', 'praca:ogien', 'noc:karta', 'budowla:koza_beczka', 'budowla:kociol'],
        };
      },
      'koza dyżur czuwanie drewno stove duty vigil',
    ),

    def(
      'noc:wyprawa',
      'noc',
      () => L('Wyprawa z karty nocy', 'A supply run from the Night orders'),
      (c): Tresc => {
        const w = wyprawa();
        return {
          zdania: [
            L(
              `Na karcie nocy każdy zdolny może iść na wyprawę po zapasy: blisko (wraca o ${wstawGodz(w.wracaBlisko)}) albo daleko (wraca o ${wstawGodz(w.wracaDaleko)}).`,
              `On the Night orders anyone able can go on a supply run: a short one (back at ${wstawGodz(w.wracaBlisko)}) or a long one (back at ${wstawGodz(w.wracaDaleko)}).`,
            ),
            L(
              `„Blisko” to najbliższe miejsce z okolicy (do ${BLISKO_DO_M} m), „daleko” to miejsce, w którym brakuje wam najwięcej; bez mapy miasta karta ma stałe cele.`,
              `“Short” is the nearest place in the neighbourhood (up to ${BLISKO_DO_M} m), “long” is the place with the most of what you lack; without the city map the card has fixed targets.`,
            ),
            L(
              `Karta pokazuje ryzyko kłopotów i łup dla każdej osoby; w grupie ryzyko jest o ${proc(1 - w.razem)} mniejsze, a łup ${num(NOC.lupGrupy)} razy większy.`,
              `The card shows the risk of trouble and the haul for each person; in a group the risk is ${proc(1 - w.razem)} lower and the haul ${num(NOC.lupGrupy)} times bigger.`,
            ),
            L(
              `Przy kłopotach łup spada o połowę, ktoś traci od ${NOC.ranaKlopot[0]} do ${NOC.ranaKlopot[1]} zdrowia, a w trybie zombie co trzeci kłopot kończy się ugryzieniem.`,
              `With trouble the haul is halved, someone loses ${NOC.ranaKlopot[0]} to ${NOC.ranaKlopot[1]} health, and in zombie mode every third trouble ends in a bite.`,
            ),
            L(
              `Po powrocie wszyscy tracą ${-NOC.kosztSil.blisko} sił (daleko ${-NOC.kosztSil.daleko}), a wynik trafia do porannego raportu.`,
              `On return everyone loses ${-NOC.kosztSil.blisko} energy (${-NOC.kosztSil.daleko} after a long run), and the result goes into the morning report.`,
            ),
          ],
          fakty: [
            fakt('blisko', L('Wyprawa blisko wraca o', 'A short run is back at'), wstawGodz(w.wracaBlisko)),
            fakt('daleko', L('Wyprawa daleko wraca o', 'A long run is back at'), wstawGodz(w.wracaDaleko)),
            fakt(
              'prog-blisko',
              L('Blisko od zdrowia i sił', 'Short from health and energy'),
              `${w.karta.blisko.health} / ${w.karta.blisko.rest}`,
            ),
            fakt(
              'prog-daleko',
              L('Daleko od zdrowia i sił', 'Long from health and energy'),
              `${w.karta.daleko.health} / ${w.karta.daleko.rest}`,
            ),
            fakt('ugryziony', L('Ugryziony', 'A bitten person'), L('nie idzie', 'cannot go')),
            fakt(
              'ryzyko-sily',
              L(`Ryzyko, gdy siły poniżej ${w.progSil}`, `Risk when energy is below ${w.progSil}`),
              `×${num(w.zmeczony)}`,
            ),
            fakt(
              'ryzyko-zdrowie',
              L(`Ryzyko, gdy zdrowie poniżej ${w.progZdrowia}`, `Risk when health is below ${w.progZdrowia}`),
              `×${num(w.ranny)}`,
            ),
            fakt(
              'ryzyko-odwazny',
              L(cechaNazwa('odwazny'), cechaNazwa('odwazny')),
              `×${num(ryzykoMnoznik({ traits: ['odwazny'] }))}`,
            ),
            fakt(
              'ryzyko-tchorz',
              L(cechaNazwa('tchorz'), cechaNazwa('tchorz')),
              `×${num(ryzykoMnoznik({ traits: ['tchorz'] }))}`,
            ),
            fakt(
              'ryzyko-obrona',
              L('Obrona, na poziom', 'Defence, per level'),
              `${signed(Math.round((ryzykoMnoznik({ skills: { obrona: 1 } }) - 1) * 100), 0)}%`,
            ),
            fakt('ryzyko-razem', L('Dwie osoby i więcej', 'Two people or more'), `×${num(w.razem, 2)}`),
            fakt(
              'ryzyko-bron',
              L('Broń palna, broń wręcz lub dzida', 'Firearm, melee weapon or spear'),
              `×${num(w.palna, 2)} / ×${num(w.wrecz, 2)}`,
            ),
            fakt('ryzyko-zombie', L('Tryb zombie', 'Zombie mode'), `×${num(w.zombie)}`),
            fakt('lup-grupa', L('Łup grupy', 'A group’s haul'), `×${num(NOC.lupGrupy)}`),
            fakt(
              'udzwig',
              L('Udźwig miejsca z mapy na osobę', 'Carrying limit per person for a map place'),
              L(`${UDZWIG_NA_OSOBE} szt.`, `${UDZWIG_NA_OSOBE} pieces`),
            ),
            fakt(
              'koszt-sil',
              L('Koszt sił: blisko, daleko', 'Energy cost: short, long'),
              `${signed(NOC.kosztSil.blisko, 0)} / ${signed(NOC.kosztSil.daleko, 0)}`,
            ),
            fakt(
              'znaleziska',
              L(
                'Znaleziska z wyprawy: amunicja, broń (zwykły tryb)',
                'Finds from a run: ammunition, a weapon (normal mode)',
              ),
              `${proc(NOC.znaleziskoAmunicja.zwykly)} / ${proc(NOC.znaleziskoBron.zwykly)}`,
            ),
            fakt(
              'znaleziska-zombie',
              L('Znaleziska z wyprawy w trybie zombie', 'Finds from a run in zombie mode'),
              `${proc(NOC.znaleziskoAmunicja.zombie)} / ${proc(NOC.znaleziskoBron.zombie)}`,
            ),
          ],
          jak: [
            L(
              `Na karcie nocy wybierzcie przy osobie ${cyt('Wyprawa blisko …', 'Short run …')} albo ${cyt('Wyprawa daleko …', 'Long run …')}; przy nazwie miejsca widać ryzyko i łup.`,
              `On the Night orders pick ${cyt('Wyprawa blisko …', 'Short run …')} or ${cyt('Wyprawa daleko …', 'Long run …')} beside the person; the place shows its risk and haul.`,
            ),
            c.touch
              ? L(
                  'Wyprawy w ciągu dnia wysyłacie z mapy miasta: stuknijcie przycisk Mapa miasta u góry.',
                  'You send daytime runs from the city map: tap the City map button at the top.',
                )
              : L(
                  'Wyprawy w ciągu dnia wysyłacie z mapy miasta (klawisz M).',
                  'You send daytime runs from the city map (key M).',
                ),
          ],
          zobacz: ['miasto:wyprawa', 'ludzie:rany', 'ludzie:bron', 'zasob:jedzenie', 'zasob:leki', 'zarzad:raport'],
        };
      },
      'wyprawa zapasy łup ryzyko szaber run loot',
    ),

    def(
      'noc:napad',
      'noc',
      () => L('Napad szabrowników', 'A looters’ raid'),
      (c): Tresc => {
        const { words: w, e } = c;
        const n = napad();
        const pr = progiNapastnikow();
        return {
          zdania: [
            L(
              `Napad to próba wejścia szabrowników na podwórko: w losowej chwili między ${wstawGodz(NOC.napadOd)} a ${wstawGodz((NOC.napadOd + NOC.napadGodzin) % 24)} podchodzą pod jedno z miejsc w siatce.`,
              `A raid is an attempt by looters to get into the yard: at a random moment between ${wstawGodz(NOC.napadOd)} and ${wstawGodz((NOC.napadOd + NOC.napadGodzin) % 24)} they come up to one of the places in the fence.`,
            ),
            L(
              `Szansa, że spróbują, zaczyna się od ${proc(n.pierwsza)}, rośnie z numerem nocy i z każdą dziurą, a maleje przy mocnej siatce, świetle, psie, uchwałach i warcie.`,
              `The chance that they try starts at ${proc(n.pierwsza)}, rises with the night number and with every hole, and falls with a strong fence, light, a dog, resolutions and a watch.`,
            ),
            L(
              `Siła napadu jest losowa i rośnie z dniem; od ${num(pr[0])} przychodzi dwóch szabrowników, od ${num(pr[1])} trzech.`,
              `The strength of a raid is random and grows with the days; from ${num(pr[0])} two looters come, from ${num(pr[1])} three.`,
            ),
            L(
              'Napad jest odparty, gdy obrona miejsca (siatka, pies i warta) jest co najmniej równa jego sile; wtedy rośnie zaufanie i ludzie czują się pewniej.',
              'A raid is repelled when the defence of the place (fence, dog and watch) at least equals its strength; then trust grows and people feel safer.',
            ),
            L(
              `Jeśli wejdą, zabiorą część drewna, zapasów i złomu, spadnie zaufanie i bezpieczeństwo, a jeden strażnik z tego miejsca oberwie. W trybie zombie szabrowników nie ma: przychodzi stado.`,
              `If they get in, they take part of the wood, supplies and scrap, trust and safety fall, and one guard at that place gets hurt. In zombie mode there are no looters: the herd comes instead.`,
            ),
          ],
          fakty: faktyNapadu(c),
          jak: [
            L(
              `Za dnia łatajcie dziury i wzmacniajcie ${w.brama.b}, wieczorem rozpalcie ognisko, a na karcie nocy postawcie wartę przy najsłabszym miejscu.`,
              `By day patch the holes and shore up ${e.brama}, light the campfire in the evening, and on the Night orders put a watch at the weakest place.`,
            ),
            polecenie(c, ['dziurze w siatce', 'a hole in the fence'], ['Załatać dziurę', 'Patch the hole']),
          ],
          zobacz: [
            'noc:warta',
            'noc:karta',
            'potrzeba:safe',
            'ludzie:walka',
            'zombie:szwendacze',
            'zasob:ognisko',
            'uchwala:u_brama',
          ],
        };
      },
      'napad szabrownicy szabrowanie atak raid looters',
    ),
  ];
}
