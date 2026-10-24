/* Wiki w grze, kategoria „Tryb zombie”: szwendacze, stado, hałas i światło nocą, siatka pod naporem, ugryzienie i amputacja,
   zmarli, którzy wstają, dzida i warta przy siatce, plus artykuł o tym, co zmienia sam tryb. Liczby biorą się z tabel gry:
   szwendacze i stado z src/sim/zombie.ts (zdrowie, prędkość, wzrok, liczebność za dnia i w stadzie według dnia, napór na
   siatkę: `pushOf`), ugryzienie, gorączka, wstawanie i amputacja z src/sim/sim.ts (`BITE_INFECT`, `FEVER_TICKS`…), broń z
   src/sim/bron.ts (`WEAPONS`: zasięg, obrażenia, hałas, czy sięga przez siatkę), hałas ze stałych wraków, drzwi
   (`HALAS` z src/sim/sasiedzi.ts) i psa. Czas złamania świeżego kafelka siatki przy tłoku liczy się z `pushOf`, tak jak w
   symulacji. Te zasady działają tylko w trybie zombie, więc każdy artykuł ma uwagę o trybie gry (`WikiCtx.zombie`): w zwykłej
   grze mówi, że nic z tego się w niej nie dzieje (dzida i warta istnieją w obu trybach i mają własną uwagę). */

import { L, mnogaPl, wielka } from '../core/jezyk.ts';
import { AMMO_EN, type AMMO_NAMES, START_KIT, WEAPONS, WEAPONS_EN, type WeaponId } from '../sim/bron.ts';
import { TICKS_PER_SECOND } from '../sim/clock.ts';
import { REINFORCED_HP } from '../sim/perimeter.ts';
import { DZIDY_ZOMBIE, PROGI_DOMYSLNE } from '../sim/praca.ts';
import { HALAS } from '../sim/sasiedzi.ts';
import {
  AMPUTATE_TICKS,
  AMPUTATE_WINDOW,
  BARYKADA_HP,
  BITE_INFECT,
  BRACE_COST,
  BRACE_HP,
  BRACE_TICKS,
  CAMPFIRE_LIGHT,
  CRAFT_TICKS,
  FEVER_TICKS,
  GUARD_UNTIL,
  LAMP_REACH,
  LIMB,
  NOISE_TICKS,
  PATCH_COST,
  PATCH_TICKS,
  RISE_TICKS,
  SPEAR_BOARDS,
  SPEAR_SCRAP,
  WIEZA_ZASIEG,
  ZASIEKI_HP,
} from '../sim/sim.ts';
import { WRECK_SEARCH_NOISE, WRECK_STRIP_NOISE } from '../sim/surowce.ts';
import {
  ambientCount,
  BITE_CD,
  BITE_DMG,
  BITE_HIT,
  BITE_HIT_FIGHTING,
  BITE_REACH,
  CHASE_SPEED,
  CROWD_RADIUS,
  DISPERSE,
  FAR,
  FENCE_BEARS,
  FENCE_FLOOR,
  HORDE_FROM,
  HORDE_HOURS,
  hordeSize,
  MAX_ZOMBIES,
  NEAR,
  pushOf,
  RING_FROM,
  RING_TO,
  SIGHT_DAY,
  SIGHT_NIGHT,
  ZOMBIE_HP,
  ZOMBIE_SPEED,
} from '../sim/zombie.ts';
import { SZCZEK_HALAS } from '../sim/zwierzeta.ts';
import { manyEn, num } from './tekst.ts';
import { czasTickow, listaI, polecenie, proc, wCyt } from './wiki-slowa.ts';
import { type Def, def, fakt, type Tresc, type WikiCtx } from './wiki-typy.ts';

// ---------------------------------------------------------------- drobiazgi

const BRON_IDS = Object.keys(WEAPONS) as WeaponId[];

/** nazwa broni w mianowniku, bieżący język */
export const bronNazwa = (id: WeaponId): string => L(WEAPONS[id].name, WEAPONS_EN[id].name);

/** ile trafień zabija szwendacza daną bronią (celność nie wchodzi w rachubę) */
export const trafienia = (id: WeaponId): number => Math.ceil(ZOMBIE_HP / WEAPONS[id].dmg);

/** broń do wyliczanek w zdaniach: po polsku mianownik, po angielsku z rodzajnikiem („the knife”, „bare hands”) */
const bronW = (id: WeaponId): string => L(WEAPONS[id].name, WEAPONS_EN[id].the);

/** liczba metrów z jednostką; ułamek z przecinkiem */
const NB = '\u00A0';
const m = (v: number): string => `${num(v, v === Math.round(v) ? 0 : 1)}${NB}m`;

/** zakres w metrach: „od 15 do 40 m” (po angielsku „15 to 40 m”) i do faktów „15–40 m” */
const odDo = (a: number, b: number): string => L(`od ${num(a, 0)} do ${m(b)}`, `${num(a, 0)} to ${m(b)}`);
const zakres = (a: number, b: number): string => `${num(a, 0)}–${m(b)}`;

/** sekundy przy tempie 1× */
const sek = (ticks: number): string => `${num(ticks / TICKS_PER_SECOND, ticks % TICKS_PER_SECOND ? 1 : 0)}${NB}s`;

const osob = (n: number): string => L(mnogaPl(n, 'osoba', 'osoby', 'osób'), manyEn(n, 'person', 'people'));

/** broń z rodzajnikiem do wyliczanek po angielsku („a revolver”, „an axe”, „bare hands”) i w bierniku po polsku */
const bronZ = (id: WeaponId): string => {
  if (id === 'piesci') return L(WEAPONS[id].acc, WEAPONS_EN[id].name);
  const en = WEAPONS_EN[id].name;
  return L(WEAPONS[id].acc, `${/^[aeiou]/i.test(en) ? 'an' : 'a'} ${en}`);
};

/** „w jednym trafieniu”, „w 2 trafieniach” */
const wTrafieniach = (n: number): string =>
  L(n === 1 ? 'w jednym trafieniu' : `w ${n} trafieniach`, `in ${manyEn(n, 'hit', 'hits')}`);

/** Uwaga o trybie gry: artykuł opisuje zasady trybu zombie. W zwykłej grze nic z tego się nie dzieje (`zwykla` podaje
    własne zdanie dla rzeczy, które istnieją w obu trybach). */
function uwagaTrybu(c: WikiCtx, zwykla?: string): string {
  if (c.zombie)
    return L(
      'Grasz w trybie zombie: to dzieje się w waszej grze.',
      'You are playing Zombie mode: this happens in your game.',
    );
  return (
    zwykla ??
    L(
      'To zasada trybu zombie. Wasza gra toczy się w trybie zwykłym, więc nic z tego się w niej nie dzieje.',
      'This is a rule of Zombie mode. Your game is in the normal mode, so none of this happens in it.',
    )
  );
}

/** Ile gry zajmuje złamanie świeżego kafelka siatki (REINFORCED_HP), gdy napiera na niego `n` szwendaczy naraz; null: nigdy
    (do progu `FENCE_BEARS` napierający tylko zużywają kafelek). Każdy napierający zdejmuje `pushOf(n, hp)` na krok. */
export function czasDoZbicia(n: number): number | null {
  if (n <= FENCE_BEARS) return null;
  return REINFORCED_HP / (n * pushOf(n, REINFORCED_HP));
}

/** czas złamania w grze jako napis: „1,7 h”, „16 min”, a gdy kafelek nie pęknie: „nigdy” */
const kiedy = (n: number): string => {
  const t = czasDoZbicia(n);
  return t === null ? L('nigdy', 'never') : czasTickow(t);
};

/** ile osób zarządu zaczyna z bronią w trybie zombie i jaką (kolejność jak w `START_KIT`) */
const bronNaStart = (): WeaponId[] => START_KIT.zombie.core.filter((x): x is WeaponId => x !== null);

const NOCE = [1, 2, 3, 5, 10];

/** hałas przy drzwiach sąsiednich budynków (`HALAS` z src/sim/sasiedzi.ts): klucz tabeli i opis po polsku i angielsku */
const DRZWI: readonly [keyof typeof HALAS, string, string][] = [
  ['otwieranie', 'otwieranie drzwi', 'opening a door'],
  ['pukanie', 'pukanie', 'knocking'],
  ['wywazanie', 'wyważanie drzwi budynku', 'forcing a building’s door'],
  ['wywazanieLom', 'wyważanie drzwi budynku łomem', 'forcing a building’s door with a crowbar'],
  ['mieszkanie', 'wyważanie drzwi mieszkania', 'forcing a flat door'],
  ['mieszkanieLom', 'wyważanie drzwi mieszkania łomem', 'forcing a flat door with a crowbar'],
  ['deski', 'zabijanie drzwi deskami', 'nailing a door shut'],
  ['odbijanie', 'odbijanie desek z drzwi', 'prising the boards off a door'],
];

/** amunicja z liczbą: „12 naboi”, „12 rounds” (formy mnogie do odmiany, bo AMMO_NAMES ma tylko mianownik) */
const AMMO_PL: Record<keyof typeof AMMO_NAMES, [string, string, string]> = {
  naboje: ['nabój', 'naboje', 'naboi'],
  loftki: ['loftka', 'loftki', 'loftek'],
  belty: ['bełt', 'bełty', 'bełtów'],
};
const amunicja = (klucz: keyof typeof AMMO_NAMES, n: number): string =>
  L(mnogaPl(n, ...AMMO_PL[klucz]), `${n} ${n === 1 ? AMMO_EN[klucz].one : AMMO_EN[klucz].other}`);

// ---------------------------------------------------------------- artykuły

export function definicjeZombie(): Def[] {
  return [
    def(
      'zombie:tryb',
      'zombie',
      () => L('Tryb zombie', 'Zombie mode'),
      (c): Tresc => {
        const w = c.words;
        const e = c.e;
        const start = bronNaStart();
        const ammo = Object.entries(START_KIT.zombie.ammo).filter(([, n]) => n > 0) as [
          keyof typeof AMMO_NAMES,
          number,
        ][];
        return {
          zdania: [
            L(
              'Tryb zombie wybiera się na ekranie startowym: ten sam adres i ta sama mapa, ale za siatką snują się szwendacze, a nocą przychodzi stado.',
              'You pick Zombie mode on the start screen: the same address and the same map, but shamblers drift around beyond the fence and a herd comes at night.',
            ),
            L(
              `Siatka jest od początku cała i wzmocniona, a ${w.brama.m} zamknięta.`,
              `The fence is whole and reinforced from the start, and ${e.brama} is shut.`,
            ),
            L(
              'Każdy zmarły wstaje, a ugryzienie oznacza gorączkę i śmierć w niecałą dobę.',
              'Everyone who dies gets back up, and a bite means fever and death in less than a day.',
            ),
            L(
              `Pierwsze ${osob(start.length)} dostają kolejno ${listaI(start.map(bronZ))}, a w magazynie leżą jeszcze ${listaI(START_KIT.zombie.store.map(bronNazwa))}.`,
              `The first ${osob(start.length)} start with ${listaI(start.map(bronZ))}, and the storeroom also holds ${listaI(START_KIT.zombie.store.map(bronZ))}.`,
            ),
            L(
              'Za siatkę nikt nie wychodzi bez polecenia, bo przełącznik „może wychodzić za siatkę” jest tu domyślnie wyłączony.',
              'Nobody goes outside the fence without orders, because the “can go outside the fence” switch is off by default here.',
            ),
          ],
          uwaga: uwagaTrybu(c),
          fakty: [
            fakt('siatka', L('Siatka na start', 'Fence at the start'), `${REINFORCED_HP}%`),
            fakt(
              'brama',
              L(`${wielka(w.brama.m)} na start`, `${wielka(e.brama)} at the start`),
              L('zamknięta', 'shut'),
            ),
            fakt(
              'napady',
              L('Napady szabrowników', 'Looter raids'),
              L('nie ma, ich miejsce zajmuje stado', 'none, the herd takes their place'),
            ),
            fakt('bron-start', L('Broń na start', 'Weapons at the start'), start.map(bronNazwa).join(', ')),
            fakt(
              'magazyn',
              L('W magazynie na start', 'In the storeroom at the start'),
              START_KIT.zombie.store.map(bronNazwa).join(', '),
            ),
            ...ammo.map(([klucz, n]) =>
              fakt(`amunicja-${klucz}`, L('Amunicja na start', 'Ammunition at the start'), amunicja(klucz, n)),
            ),
            fakt('dzidy', L('Zapas dzid, który robi warsztat', 'Spear stock the workshop keeps'), `${DZIDY_ZOMBIE}`),
          ],
          zobacz: [
            'zombie:szwendacze',
            'zombie:stado',
            'zombie:halas',
            'zombie:siatka',
            'zombie:ugryzienie',
            'zombie:wstawanie',
            'zombie:dzida',
            'zombie:warta',
            'noc:napad',
          ],
        };
      },
      'zombie szwendacze tryb gry stado walking dead',
    ),

    def(
      'zombie:szwendacze',
      'zombie',
      () => L('Szwendacze', 'Shamblers'),
      (c): Tresc => {
        const grupy = [...new Set(BRON_IDS.map(trafienia))].sort((a, b) => a - b);
        const opis = grupy.map((n, i) => {
          const bron = listaI(BRON_IDS.filter((id) => trafienia(id) === n).map(bronW));
          return i === 0
            ? L(`${bron} zabijają go ${wTrafieniach(n)}`, `${bron} kill it ${wTrafieniach(n)}`)
            : `${bron} ${wTrafieniach(n)}`;
        });
        return {
          zdania: [
            L(
              'Szwendacze to zarażeni, którzy snują się za siatką: są wolni, ale idą za hałasem i za tym, co widzą.',
              'Shamblers are the infected who drift around beyond the fence: they are slow, but they follow noise and anything they can see.',
            ),
            L(
              `Idą z prędkością ${proc(ZOMBIE_SPEED)} ludzkiej, a za widzianą ofiarą ${proc(CHASE_SPEED)}.`,
              `They move at ${proc(ZOMBIE_SPEED)} of a person’s speed, and ${proc(CHASE_SPEED)} when chasing someone they see.`,
            ),
            L(
              `Widzą na ${m(SIGHT_DAY)} za dnia i na ${m(SIGHT_NIGHT)} nocą, a człowieka w świetle także nocą na ${m(SIGHT_DAY)}.`,
              `They see ${m(SIGHT_DAY)} by day and ${m(SIGHT_NIGHT)} at night, and a person standing in light ${m(SIGHT_DAY)} even at night.`,
            ),
            L(
              `Za dnia snuje się ich ${ambientCount(1)} pierwszego dnia i o ${ambientCount(2) - ambientCount(1)} więcej z każdym dniem, najwyżej ${ambientCount(1000)}, w pasie ${odDo(FAR, NEAR)} od siatki.`,
              `By day there are ${ambientCount(1)} of them on the first day and ${ambientCount(2) - ambientCount(1)} more each day, at most ${ambientCount(1000)}, in a band ${odDo(FAR, NEAR)} from the fence.`,
            ),
            L(
              `Szwendacz ma ${ZOMBIE_HP} zdrowia: ${listaI(opis)}.`,
              `A shambler has ${ZOMBIE_HP} health: ${listaI(opis)}.`,
            ),
          ],
          uwaga: uwagaTrybu(c),
          fakty: [
            fakt('zdrowie', L('Zdrowie', 'Health'), `${ZOMBIE_HP}`),
            fakt('predkosc', L('Prędkość (człowiek = 100%)', 'Speed (a person = 100%)'), proc(ZOMBIE_SPEED)),
            fakt('poscig', L('Prędkość w pościgu', 'Speed in pursuit'), proc(CHASE_SPEED)),
            fakt('wzrok-dzien', L('Wzrok za dnia', 'Sight by day'), m(SIGHT_DAY)),
            fakt('wzrok-noc', L('Wzrok nocą', 'Sight at night'), m(SIGHT_NIGHT)),
            fakt('pas', L('Pas za dnia od siatki', 'Daytime band from the fence'), zakres(FAR, NEAR)),
            fakt('maks', L('Najwięcej na mapie', 'Most on the map'), `${MAX_ZOMBIES}`),
            ...[1, 5, 10].map((d) =>
              fakt(`dzien-${d}`, L(`Za dnia, dzień ${d}`, `By day, day ${d}`), `${ambientCount(d)}`),
            ),
            ...BRON_IDS.map((id) =>
              fakt(`trafienia-${id}`, L(`Trafień: ${bronNazwa(id)}`, `Hits: ${bronNazwa(id)}`), `${trafienia(id)}`),
            ),
          ],
          jak: [
            polecenie(c, ['szwendaczu', 'a shambler'], ['Atakuj szwendacza', 'Attack the shambler']),
            L(
              'Za siatką mogą atakować tylko osoby z bronią, która przez nią sięga.',
              'Beyond the fence only people with a weapon that reaches through it can attack.',
            ),
          ],
          zobacz: ['zombie:stado', 'zombie:halas', 'zombie:siatka', 'zombie:ugryzienie', 'zombie:dzida'],
        };
      },
      'szwendacz zombie zarażeni wróg shambler walker infected',
    ),

    def(
      'zombie:stado',
      'zombie',
      () => L('Stado', 'The herd'),
      (c): Tresc => ({
        zdania: [
          L(
            `Stado to nocna fala szwendaczy: od ${HORDE_FROM}:00 wychodzi z okolicy i idzie prosto pod siatkę.`,
            `The herd is the night wave of shamblers: from ${HORDE_FROM}:00 it leaves the surroundings and heads straight for the fence.`,
          ),
          L(
            `Pierwszej nocy liczy ${hordeSize(1)} szwendaczy, a każdej następnej o ${hordeSize(2) - hordeSize(1)} więcej, najwyżej ${hordeSize(1000)}.`,
            `On the first night it has ${hordeSize(1)} shamblers, and ${hordeSize(2) - hordeSize(1)} more each night after that, at most ${hordeSize(1000)}.`,
          ),
          L(
            `Przychodzą grupami przez ${HORDE_HOURS} godziny, z pasa ${odDo(RING_FROM, RING_TO)} od siatki, a o ${DISPERSE}:00 stado się rozchodzi.`,
            `They arrive in groups over ${HORDE_HOURS} hours, from a band ${odDo(RING_FROM, RING_TO)} from the fence, and at ${DISPERSE}:00 the herd breaks up.`,
          ),
          L(
            'Do stada najpierw dołączają szwendacze, którzy już się snują, a z okolicy dochodzi tylko brakująca reszta.',
            'Shamblers already drifting about join the herd first, and only the missing rest comes in from the surroundings.',
          ),
          L(
            'Czip „stado” u góry pokazuje, ilu szwendaczy jest przy siatce, a w dymku też ilu napiera i ilu jest na całej mapie.',
            'The “herd” chip at the top shows how many shamblers are at the fence, and its tooltip also says how many are pressing and how many are on the whole map.',
          ),
        ],
        uwaga: uwagaTrybu(c),
        fakty: [
          fakt('start', L('Stado wychodzi o', 'The herd sets out at'), `${HORDE_FROM}:00`),
          fakt('trwa', L('Przychodzi przez', 'It arrives over'), L(`${HORDE_HOURS} godziny`, `${HORDE_HOURS} hours`)),
          fakt('rozchodzi', L('Rozchodzi się o', 'It breaks up at'), `${DISPERSE}:00`),
          fakt(
            'pas',
            L('Skąd przychodzi', 'Where it comes from'),
            L(`${zakres(RING_FROM, RING_TO)} od siatki`, `${zakres(RING_FROM, RING_TO)} from the fence`),
          ),
          ...NOCE.map((n) => fakt(`noc-${n}`, L(`Stado, noc ${n}`, `Herd, night ${n}`), `${hordeSize(n)}`)),
          fakt('maks', L('Najwięcej na mapie', 'Most on the map'), `${MAX_ZOMBIES}`),
        ],
        zobacz: ['zombie:szwendacze', 'zombie:siatka', 'zombie:warta', 'zombie:halas', 'noc:napad'],
      }),
      'stado noc horda herd horde',
    ),

    def(
      'zombie:halas',
      'zombie',
      () => L('Hałas i światło', 'Noise and light'),
      (c): Tresc => {
        const strzaly = (['rewolwer', 'strzelba'] as const).map((id) => `${bronNazwa(id)} ${m(WEAPONS[id].noise)}`);
        const swiatlo = LAMP_REACH * WIEZA_ZASIEG;
        return {
          zdania: [
            L(
              'Szwendacze idą na hałas: cios, strzał albo wyważone drzwi niosą się na kilka do kilkudziesięciu metrów, a szwendacze w tym promieniu ruszają w to miejsce.',
              'Shamblers follow noise: a blow, a shot or a forced door carries a few to a few dozen metres, and shamblers inside that radius head for the spot.',
            ),
            L(
              `Najgłośniejsze są strzały (${listaI(strzaly)}), a dzida (${m(WEAPONS.dzida.noise)}) i kusza (${m(WEAPONS.kusza.noise)}) są prawie bezgłośne.`,
              `Gunshots are the loudest (${listaI(strzaly)}), while a spear (${m(WEAPONS.dzida.noise)}) and a crossbow (${m(WEAPONS.kusza.noise)}) are almost silent.`,
            ),
            L(
              `Hałas robią też wraki (przeszukanie ${m(WRECK_SEARCH_NOISE)}, rozbiórka ${m(WRECK_STRIP_NOISE)}), drzwi sąsiadów (do ${m(HALAS.wywazanie)}) i szczekający pies (${m(SZCZEK_HALAS)}).`,
              `Wrecks make noise too (searching ${m(WRECK_SEARCH_NOISE)}, stripping ${m(WRECK_STRIP_NOISE)}), so do the neighbours’ doors (up to ${m(HALAS.wywazanie)}) and a barking dog (${m(SZCZEK_HALAS)}).`,
            ),
            L(
              `Nocą szwendacz widzi człowieka na ${m(SIGHT_NIGHT)}, a na ${m(SIGHT_DAY)} tylko wtedy, gdy ten stoi w świetle.`,
              `At night a shambler sees a person ${m(SIGHT_NIGHT)} away, and ${m(SIGHT_DAY)} away only if that person stands in light.`,
            ),
            L(
              `Światło dają lampa warty (${m(LAMP_REACH)}, na wieży ${m(swiatlo)}) i płonące ognisko (${m(CAMPFIRE_LIGHT)}), więc wartownik i ognisko widać z dalej.`,
              `Light comes from a guard’s lamp (${m(LAMP_REACH)}, ${m(swiatlo)} on the tower) and a burning campfire (${m(CAMPFIRE_LIGHT)}), so a guard or a campfire can be seen from further away.`,
            ),
          ],
          uwaga: uwagaTrybu(c),
          fakty: [
            ...BRON_IDS.filter((id) => WEAPONS[id].noise > 0).map((id) =>
              fakt(`halas-${id}`, L(`Hałas: ${bronNazwa(id)}`, `Noise: ${bronNazwa(id)}`), m(WEAPONS[id].noise)),
            ),
            fakt('wrak-szukanie', L('Hałas: przeszukanie wraku', 'Noise: searching a wreck'), m(WRECK_SEARCH_NOISE)),
            fakt('wrak-rozbiorka', L('Hałas: rozbiórka wraku', 'Noise: stripping a wreck'), m(WRECK_STRIP_NOISE)),
            fakt('pies', L('Hałas: szczekanie psa', 'Noise: a dog barking'), m(SZCZEK_HALAS)),
            ...DRZWI.map(([klucz, pl, en]) =>
              fakt(`drzwi-${klucz}`, L(`Hałas: ${pl}`, `Noise: ${en}`), m(HALAS[klucz])),
            ),
            fakt(
              'trwa',
              L('Hałas słychać przez', 'The noise is heard for'),
              L(`${sek(NOISE_TICKS)} przy tempie 1×`, `${sek(NOISE_TICKS)} at 1× speed`),
            ),
            fakt('wzrok-dzien', L('Wzrok za dnia', 'Sight by day'), m(SIGHT_DAY)),
            fakt('wzrok-noc', L('Wzrok nocą', 'Sight at night'), m(SIGHT_NIGHT)),
            fakt('lampa', L('Lampa warty', 'Guard’s lamp'), m(LAMP_REACH)),
            fakt('lampa-wieza', L('Lampa warty na wieży', 'Guard’s lamp on the tower'), m(swiatlo)),
            fakt('ognisko', L('Ognisko', 'Campfire'), m(CAMPFIRE_LIGHT)),
          ],
          zobacz: ['zombie:szwendacze', 'zombie:stado', 'zombie:warta', 'zasob:wraki', 'budowla:wieza'],
        };
      },
      'hałas dźwięk światło lampa ognisko strzał noise light sound gunshot',
    ),

    def(
      'zombie:siatka',
      'zombie',
      () => L('Siatka pod naporem', 'The fence under pressure'),
      (c): Tresc => {
        const zbicie = (n: number) =>
          fakt(`zbicie-${n}`, L(`Świeży kafelek, ${n} napierających`, `Fresh tile, ${n} pressing`), kiedy(n));
        return {
          zdania: [
            L(
              `W trybie zombie siatka zaczyna cała i wzmocniona (${REINFORCED_HP}%), a kilku szwendaczy jej nie przewróci: do ${FENCE_BEARS} napierających w jednym miejscu tylko ją zużywają.`,
              `In Zombie mode the fence starts whole and reinforced (${REINFORCED_HP}%), and a few shamblers cannot bring it down: up to ${FENCE_BEARS} pressing in one spot only wear it out.`,
            ),
            L(
              `Pada pod tłumem: od ${FENCE_BEARS + 1} napierających w promieniu ${num(CROWD_RADIUS, 0)} kafelków od naciskanego miejsca kafelek traci wytrzymałość tym szybciej, im ich więcej.`,
              `It goes under a crowd: with ${FENCE_BEARS + 1} or more pressing within ${num(CROWD_RADIUS, 0)} tiles of the spot, the tile loses durability the faster, the more of them there are.`,
            ),
            L(
              `Poniżej progu zużyty kafelek nie spada niżej niż do ${FENCE_FLOOR}, a ten, który spadnie do zera, staje się dziurą, przez którą stado wlewa się na podwórko.`,
              `Below the limit a worn tile does not drop under ${FENCE_FLOOR}, and one that drops to zero becomes a hole through which the herd pours into the yard.`,
            ),
            L(
              `Uszkodzony kafelek wzmacnia się poleceniem „Wzmocnić siatkę” (${BRACE_COST} szt. desek albo złomu, o ${BRACE_HP}, do 100), a dziurę łata „Załatać dziurę” (${PATCH_COST} szt. desek albo złomu).`,
              `A damaged tile is shored up with “Shore up the fence” (${BRACE_COST} planks or scrap, by ${BRACE_HP}, up to 100), and a hole is patched with “Patch the hole” (${PATCH_COST} planks or scrap).`,
            ),
            L(
              `Zasieki (${ZASIEKI_HP}) i barykada z wraków (${BARYKADA_HP}) na odcinku siatki są mocniejsze, a ${c.words.brama.m} nie puszcza pod naporem.`,
              `A barricade (${ZASIEKI_HP}) and a wreck wall (${BARYKADA_HP}) on a stretch of the fence are stronger, and ${c.e.brama} does not give way under pressure.`,
            ),
          ],
          uwaga: uwagaTrybu(c),
          fakty: [
            fakt('start', L('Siatka na start', 'Fence at the start'), `${REINFORCED_HP}`),
            fakt('prog', L('Zużywa do', 'Wears down at'), L(`${FENCE_BEARS} napierających`, `${FENCE_BEARS} pressing`)),
            fakt(
              'promien',
              L('Tłok liczy się w promieniu', 'The crowd is counted within'),
              L(`${CROWD_RADIUS} kafelków`, `${CROWD_RADIUS} tiles`),
            ),
            fakt('dol', L('Zużycie nie schodzi poniżej', 'Wear does not go below'), `${FENCE_FLOOR}`),
            zbicie(FENCE_BEARS),
            zbicie(FENCE_BEARS + 2),
            zbicie(FENCE_BEARS + 6),
            zbicie(FENCE_BEARS + 14),
            fakt(
              'wzmocnienie',
              L('Wzmocnienie kafelka', 'Shoring up a tile'),
              L(
                `${BRACE_COST} szt., ${czasTickow(BRACE_TICKS)}, o ${BRACE_HP}`,
                `${BRACE_COST} pieces, ${czasTickow(BRACE_TICKS)}, by ${BRACE_HP}`,
              ),
            ),
            fakt(
              'lata',
              L('Łata na dziurę', 'Patch on a hole'),
              L(`${PATCH_COST} szt., ${czasTickow(PATCH_TICKS)}`, `${PATCH_COST} pieces, ${czasTickow(PATCH_TICKS)}`),
            ),
            fakt(
              'czip',
              L('Czip „siatka” u góry', 'The “fence” chip at the top'),
              L(
                'procent wytrzymałości siatki, w dymku też największy tłok',
                'the percentage of fence durability, with the biggest crowd in the tooltip',
              ),
            ),
            fakt('zasieki', L('Zasieki', 'Barricade'), `${ZASIEKI_HP}`),
            fakt('barykada', L('Barykada z wraków', 'Wreck wall'), `${BARYKADA_HP}`),
          ],
          jak: [
            polecenie(
              c,
              ['uszkodzonym kafelku siatki', 'a damaged fence tile'],
              ['Wzmocnić siatkę', 'Shore up the fence'],
            ),
            polecenie(c, ['dziurze w siatce', 'a hole in the fence'], ['Załatać dziurę', 'Patch the hole']),
          ],
          zobacz: ['zombie:stado', 'zombie:warta', 'zombie:dzida', 'budowla:zasieki', 'budowla:barykada', 'zasob:zlom'],
        };
      },
      'siatka płot napór tłok dziura łata wzmocnienie fence pressure crowd hole patch',
    ),

    def(
      'zombie:ugryzienie',
      'zombie',
      () => L('Ugryzienie i amputacja', 'Bites and amputation'),
      (c): Tresc => ({
        zdania: [
          L(
            `Szwendacz gryzie z ${m(BITE_REACH)} i trafia w ${proc(BITE_HIT)} prób, a w kogoś, kto walczy albo stoi na warcie twarzą do wroga, w ${proc(BITE_HIT_FIGHTING)}.`,
            `A shambler bites from ${m(BITE_REACH)} and hits ${proc(BITE_HIT)} of the time, but ${proc(BITE_HIT_FIGHTING)} against someone who is fighting or standing watch facing the enemy.`,
          ),
          L(
            `Każde trafienie zabiera ${BITE_DMG} zdrowia i zaraża w ${proc(BITE_INFECT)} przypadków, a w ${proc(LIMB)} zakażeń jest to ręka albo noga.`,
            `Each hit takes ${BITE_DMG} health and infects ${proc(BITE_INFECT)} of the time, and ${proc(LIMB)} of infections are on an arm or a leg.`,
          ),
          L(
            `Zakażony ma gorączkę i umiera po ${czasTickow(FEVER_TICKS)} gry, a jego zdrowie spada przez ten czas do zera.`,
            `An infected person has a fever and dies after ${czasTickow(FEVER_TICKS)} of game time, and their health falls to zero over that time.`,
          ),
          L(
            `Ugryzionego w rękę albo nogę może uratować amputacja w ciągu ${czasTickow(AMPUTATE_WINDOW)} od ugryzienia: robi ją ktoś inny z ${c.words.zarzad.dk}, trwa ${czasTickow(AMPUTATE_TICKS)} i nie zawsze się udaje.`,
            `Someone bitten on an arm or a leg can be saved by amputation within ${czasTickow(AMPUTATE_WINDOW)} of the bite: another person from ${c.e.krotko} does it, it takes ${czasTickow(AMPUTATE_TICKS)} and does not always work.`,
          ),
          L(
            'Szansa rośnie z umiejętnością medycyny operującego i z lekiem w zapasie, a uratowany zostaje z kikutem i gorzej trafia.',
            'The chance rises with the surgeon’s Medicine skill and with a med pack in the stock, and the survivor is left with a stump and aims worse.',
          ),
        ],
        uwaga: uwagaTrybu(c),
        fakty: [
          fakt('zasieg', L('Zasięg ugryzienia', 'Bite reach'), m(BITE_REACH)),
          fakt('przerwa', L('Przerwa między ugryzieniami', 'Time between bites'), sek(BITE_CD)),
          fakt('trafienie', L('Trafia', 'Hit chance'), proc(BITE_HIT)),
          fakt('trafienie-walka', L('Trafia w walczącego', 'Hit chance against a fighter'), proc(BITE_HIT_FIGHTING)),
          fakt('obrazenia', L('Zabiera zdrowia', 'Health taken'), `${BITE_DMG}`),
          fakt('zakazenie', L('Trafienie zaraża', 'A hit infects'), proc(BITE_INFECT)),
          fakt('konczyna', L('Zakażenie w rękę albo nogę', 'Infection on an arm or a leg'), proc(LIMB)),
          fakt('goraczka', L('Gorączka do śmierci', 'Fever until death'), czasTickow(FEVER_TICKS)),
          fakt('okno', L('Amputacja najpóźniej po', 'Amputation at the latest after'), czasTickow(AMPUTATE_WINDOW)),
          fakt('zabieg', L('Zabieg trwa', 'The operation takes'), czasTickow(AMPUTATE_TICKS)),
        ],
        jak: [
          L(
            'Otwórzcie kartę ugryzionego: w wierszu o ugryzieniu jest przycisk „Amputować”, o ile ugryzienie jest w rękę albo nogę i nie minęły dwie godziny.',
            'Open the bitten person’s card: the bite line has an “Amputate” button as long as the bite is on an arm or a leg and two hours have not passed.',
          ),
        ],
        zobacz: ['zasob:leki', 'zombie:wstawanie', 'zombie:szwendacze', 'potrzeba:health'],
      }),
      'ugryzienie amputacja gorączka zakażenie bite amputate fever infection',
    ),

    def(
      'zombie:wstawanie',
      'zombie',
      () => L('Zmarli, którzy wstają', 'The dead who rise'),
      (c): Tresc => ({
        zdania: [
          L(
            `W trybie zombie każdy zmarły wstaje jako szwendacz po ${czasTickow(RISE_TICKS)}, chyba że ktoś go wcześniej dobije.`,
            `In Zombie mode everyone who dies gets back up as a shambler after ${czasTickow(RISE_TICKS)}, unless somebody finishes them off first.`,
          ),
          L(
            `Ugryziony umiera po ${czasTickow(FEVER_TICKS)} gorączki i wstaje godzinę później.`,
            `A bitten person dies after ${czasTickow(FEVER_TICKS)} of fever and gets up an hour later.`,
          ),
          L(
            'Zwłoki, które wstaną, mają polecenie „Dobić”, a uzbrojeni dobijają je odruchowo, gdy czekają albo grzeją się w pobliżu.',
            'A body that will rise has the “Finish off the body” order, and armed people finish them off by reflex when they wait or warm themselves nearby.',
          ),
          L(
            'Dobicie trwa sekundę, ale psuje dobijającemu nastrój na dobę.',
            'Finishing a body off takes a second, but it spoils the mood of whoever does it for a day.',
          ),
          L(
            'Zabity szwendacz zostaje trupem i nie wstaje drugi raz.',
            'A shambler you kill stays a corpse and does not get up again.',
          ),
        ],
        uwaga: uwagaTrybu(c),
        fakty: [
          fakt('wstaje', L('Zmarły wstaje po', 'The dead get up after'), czasTickow(RISE_TICKS)),
          fakt('goraczka', L('Gorączka do śmierci', 'Fever until death'), czasTickow(FEVER_TICKS)),
          fakt('dobicie', L('Dobicie trwa', 'Finishing off takes'), sek(TICKS_PER_SECOND)),
        ],
        jak: [polecenie(c, ['zwłokach', 'a body'], ['Dobić', 'Finish off the body'])],
        zobacz: ['zombie:ugryzienie', 'zombie:szwendacze', 'zombie:warta'],
      }),
      'zwłoki zmarły wstaje dobić trup umrzeć body rise corpse dead',
    ),

    def(
      'zombie:dzida',
      'zombie',
      () => L('Dzida', 'The spear'),
      (c): Tresc => {
        const d = WEAPONS.dzida;
        return {
          zdania: [
            L(
              'Dzida sięga przez siatkę: warta z dzidą kłuje szwendaczy, którzy napierają, i nie musi wychodzić na ulicę.',
              'A spear reaches through the fence: a guard with a spear stabs the shamblers pressing against it without going out into the street.',
            ),
            L(
              `Ma zasięg ${m(d.reach)}, zadaje ${d.dmg} obrażeń co ${sek(d.cd)}, trafia w ${proc(d.hit)} prób i prawie nie robi hałasu (${m(d.noise)}).`,
              `It has a reach of ${m(d.reach)}, deals ${d.dmg} damage every ${sek(d.cd)}, hits ${proc(d.hit)} of the time and makes next to no noise (${m(d.noise)}).`,
            ),
            L(
              `Robi się ją poleceniem „Zrobić dzidę” na stercie desek albo złomu: ${SPEAR_BOARDS} deski i ${SPEAR_SCRAP} złom, godzina pracy.`,
              `You make one with the “Make a spear” order on a pile of planks or scrap: ${SPEAR_BOARDS} planks and ${SPEAR_SCRAP} scrap, an hour of work.`,
            ),
            L(
              `Gdy stoi warsztat, ${c.words.zarzad.m} sam robi dzidy dla nieuzbrojonych, póki ich zapas jest mniejszy od progu, który w trybie zombie wynosi ${DZIDY_ZOMBIE}.`,
              `Once a workshop stands, ${c.e.krotko} makes spears for the unarmed on its own while the stock is below a level that is ${DZIDY_ZOMBIE} in Zombie mode.`,
            ),
            L(
              'Próg zmienia się w panelu Pracy, a zero wyłącza robienie dzid.',
              'You change the level in the Work panel, and zero switches spear making off.',
            ),
          ],
          uwaga: uwagaTrybu(
            c,
            L(
              'Dzidę da się zrobić także w zwykłej grze, ale tam próg dzid jest zerem, więc warsztat nie robi ich sam.',
              'You can make a spear in the normal game too, but there the spear level is zero, so the workshop does not make them on its own.',
            ),
          ),
          fakty: [
            fakt('zasieg', L('Zasięg', 'Reach'), m(d.reach)),
            fakt('obrazenia', L('Obrażenia', 'Damage'), `${d.dmg}`),
            fakt('przerwa', L('Przerwa między ciosami', 'Time between blows'), sek(d.cd)),
            fakt('trafienie', L('Trafia', 'Hit chance'), proc(d.hit)),
            fakt('halas', L('Hałas', 'Noise'), m(d.noise)),
            fakt(
              'siatka',
              L('Sięga przez siatkę', 'Reaches through the fence'),
              d.fence ? L('tak', 'yes') : L('nie', 'no'),
            ),
            fakt(
              'koszt',
              L('Koszt', 'Cost'),
              L(`${SPEAR_BOARDS} deski, ${SPEAR_SCRAP} złom`, `${SPEAR_BOARDS} planks, ${SPEAR_SCRAP} scrap`),
            ),
            fakt('praca', L('Praca', 'Work'), czasTickow(CRAFT_TICKS)),
            fakt('prog', L('Próg dzid w trybie zombie', 'Spear level in Zombie mode'), `${DZIDY_ZOMBIE}`),
            fakt(
              'prog-zwykly',
              L('Próg dzid w zwykłej grze', 'Spear level in the normal game'),
              `${PROGI_DOMYSLNE.dzidy}`,
            ),
          ],
          jak: [
            polecenie(c, ['stercie desek albo złomu', 'a pile of planks or scrap'], ['Zrobić dzidę', 'Make a spear']),
          ],
          zobacz: ['zombie:warta', 'zombie:siatka', 'zasob:deski', 'zasob:zlom', 'budowla:warsztat', 'praca:warsztat'],
        };
      },
      'dzida włócznia broń spear weapon',
    ),

    def(
      'zombie:warta',
      'zombie',
      () => L('Warta przy siatce', 'Watch at the fence'),
      (c): Tresc => {
        const przez = BRON_IDS.filter((id) => WEAPONS[id].fence);
        const bez = BRON_IDS.filter((id) => !WEAPONS[id].fence && id !== 'piesci');
        return {
          zdania: [
            L(
              `Warta to osoba na posterunku do ${GUARD_UNTIL}:00, która sama bije wrogów w zasięgu swojej broni.`,
              `A watch is a person on post until ${GUARD_UNTIL}:00 who strikes enemies within reach of their weapon without being told to.`,
            ),
            L(
              'W trybie zombie karta nocy proponuje wartę „przy siatce”, a stojący tam przesuwa się do miejsca, gdzie napiera najwięcej szwendaczy.',
              'In Zombie mode the Night orders offer a post “at the fence”, and whoever stands there moves to wherever most shamblers are pressing.',
            ),
            L(
              `Przez siatkę sięgają ${listaI(przez.map(bronW))}, a ${listaI(bez.map(bronW))} działają dopiero po tej samej stronie siatki.`,
              `${listaI(przez.map(bronW))} reach through the fence, while ${listaI(bez.map(bronW))} only work on the same side of it.`,
            ),
            L(
              'Broń palna sama przez siatkę nie strzela, bo strzał ściąga stado: strzela tylko na rozkaz „Atakuj szwendacza”.',
              'A firearm does not fire through the fence on its own, because a shot draws the herd: it fires only on the order “Attack the shambler”.',
            ),
            L(
              '„Do broni!” u góry wysyła na wartę przy siatce wszystkich zdolnych, a ten sam przycisk potem odwołuje alarm.',
              '“To arms!” at the top sends everyone fit to stand watch at the fence, and the same button then calls the alarm off.',
            ),
          ],
          uwaga: uwagaTrybu(
            c,
            L(
              `Warta jest też w zwykłej grze, ale tam stoi ${c.words.brama.przy} i przy dziurach w siatce i pilnuje przed szabrownikami, nie przed szwendaczami.`,
              `There is a watch in the normal game too, but there it stands at ${c.e.brama} and at the holes in the fence and guards against looters, not shamblers.`,
            ),
          ),
          fakty: [
            fakt('do', L('Warta trwa do', 'The watch lasts until'), `${GUARD_UNTIL}:00`),
            fakt('lampa', L('Lampa wartownika', 'Guard’s lamp'), m(LAMP_REACH)),
            fakt('lampa-wieza', L('Lampa na wieży', 'Lamp on the tower'), m(LAMP_REACH * WIEZA_ZASIEG)),
            ...BRON_IDS.map((id) =>
              fakt(
                `siatka-${id}`,
                L(`Przez siatkę: ${bronNazwa(id)}`, `Through the fence: ${bronNazwa(id)}`),
                WEAPONS[id].fence ? L('tak', 'yes') : L('nie', 'no'),
              ),
            ),
          ],
          jak: [
            polecenie(c, ['siatce', 'the fence'], ['Pilnować przy siatce', 'Keep watch at the fence']),
            L(
              `Na karcie nocy wybierzcie posterunek ${wCyt(L('przy siatce', 'at the fence'))}.`,
              `On the Night orders pick the post ${wCyt(L('przy siatce', 'at the fence'))}.`,
            ),
          ],
          zobacz: ['zombie:siatka', 'zombie:dzida', 'zombie:stado', 'noc:napad', 'budowla:wieza'],
        };
      },
      'warta wartownik posterunek do broni alarm watch guard post alarm',
    ),
  ];
}
