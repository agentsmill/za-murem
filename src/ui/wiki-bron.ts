/* Wiki w grze, kategoria „Ludzie” (dalszy ciąg): broń i walka. Artykuł o broni w ogóle (`ludzie:bron`), artykuł o walce
   (`ludzie:walka`) i po jednym artykule na każdą broń z `WEAPONS` (`bron:<id>`). Fakty broni idą wprost z tabeli
   `WEAPONS` (zasięg, obrażenia, odstęp między ciosami, hałas, celność, amunicja, siatka) i z funkcji gry: celność z umiejętnością
   z `hitChance`, liczba ciosów na szwendacza i szabrownika z życia przeciwnika (`ZOMBIE_HP`, `STRANGER_HP`), start z `START_KIT`,
   czas rozbiórki wraku z łomem z `wreckStripTicks`. Ręcznie wpisane są tylko liczby, których gra nie eksportuje
   (progi zdrowia w reakcji na wroga, alarm „Do broni!”, pula broni z wypraw): przypina je tests/unit/wiki-bron.test.ts do tekstu źródeł. */

import { L } from '../core/jezyk.ts';
import {
  AMMO_EN,
  AMMO_NAMES,
  hitChance,
  isFirearm,
  START_KIT,
  WEAPONS,
  WEAPONS_EN,
  type WeaponId,
} from '../sim/bron.ts';
import { TICKS_PER_SECOND } from '../sim/clock.ts';
import {
  CRAFT_TICKS,
  DEFEND_REACH,
  FLEE_HP,
  RESIDENT_FLEE,
  SPEAR_BOARDS,
  SPEAR_SCRAP,
  STRANGER_HP,
} from '../sim/sim.ts';
import { wreckStripTicks } from '../sim/surowce.ts';
import { ZOMBIE_HP } from '../sim/zombie.ts';
import { many } from './karta.ts';
import { num } from './tekst.ts';
import { czasTickow, listaI, polecenie, proc } from './wiki-slowa.ts';
import { type Def, def, type Fakt, fakt, type Tresc } from './wiki-typy.ts';

export const KOLEJNOSC_BRONI: readonly WeaponId[] = [
  'piesci',
  'noz',
  'siekiera',
  'lom',
  'kij',
  'dzida',
  'kusza',
  'rewolwer',
  'strzelba',
];

/** Zdrowie, powyżej którego zarząd z bronią sam staje do walki (`react` w src/sim/sim.ts), poniżej którego wartownik i
    walczący się wycofują, gdy wróg jest tuż obok, liczba wrogów naraz, która wycofuje bez względu na zdrowie, i zdrowie,
    od którego „Do broni!” bierze na wartę (`orderAlarm`). Gra ma je na stałe w kodzie, więc test przypina je do tekstu źródła. */
export const WALKA = { staje: 40, wycofanieWarta: 50, wycofanieWalka: 30, tlum: 3, alarm: 30 };

/** Pula broni ze znalezisk na wyprawach (`finds` w src/gov/noc.ts): w zwykłym trybie trzy, w zombie pięć. */
export const ZNALEZISKA_BRONI: Readonly<Record<'zwykly' | 'zombie', readonly WeaponId[]>> = {
  zwykly: ['noz', 'lom', 'kij'],
  zombie: ['noz', 'lom', 'kij', 'strzelba', 'kusza'],
};

const cap = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** nazwa broni w mianowniku w bieżącym języku, małymi literami */
export const bronNazwa = (id: WeaponId): string => L(WEAPONS[id].name, WEAPONS_EN[id].name);

/** nazwa amunicji (mianownik liczby mnogiej) w bieżącym języku */
export const amunicjaNazwa = (a: keyof typeof AMMO_NAMES): string => L(AMMO_NAMES[a], AMMO_EN[a].name);

/** obrażenia z liczbą i odmianą: „34 obrażenia”, „50 obrażeń” (po angielsku „34 damage”) */
const obrazenia = (n: number): string => L(many(n, 'obrażenie', 'obrażenia', 'obrażeń'), `${n} damage`);

/** amunicja w dopełniaczu do liczby: „12 naboi” (po angielsku nazwa jak w AMMO_EN) */
const AMUNICJA_DOP: Record<keyof typeof AMMO_NAMES, string> = { naboje: 'naboi', loftki: 'loftek', belty: 'bełtów' };
const amunicjaZLiczba = (a: keyof typeof AMMO_NAMES, n: number): string =>
  L(`${n} ${AMUNICJA_DOP[a]}`, `${n} ${AMMO_EN[a].name}`);

/** czas w sekundach: cd kroków symulacji = cd / TICKS_PER_SECOND s */
const sekundy = (cd: number): string => L(`${num(cd / TICKS_PER_SECOND)} s`, `${num(cd / TICKS_PER_SECOND)} s`);

/** ile trafień zabija przeciwnika o danym życiu */
const ciosow = (id: WeaponId, zycie: number): number => Math.ceil(zycie / WEAPONS[id].dmg);

/** hałas ciosu albo strzału w bieżącym języku: „cicho” albo „40 m” */
const halas = (id: WeaponId): string => (WEAPONS[id].noise ? `${num(WEAPONS[id].noise, 0)} m` : L('cicho', 'silent'));

/** Skąd broń bierze się w grze: na starcie w danym trybie (u osób i w magazynie), ze znalezisk i z warsztatu. */
function skad(id: WeaponId): string {
  if (id === 'piesci') return L('zawsze pod ręką', 'always at hand');
  const czesci: string[] = [];
  const tryb = (m: 'zwykly' | 'zombie', plNazwa: string, enNazwa: string): void => {
    const kit = START_KIT[m];
    const osoby = kit.core.filter((w) => w === id).length;
    const magazyn = kit.store.filter((w) => w === id).length;
    if (!osoby && !magazyn) return;
    const pl: string[] = [];
    const en: string[] = [];
    if (osoby) {
      pl.push(`w rękach ${osoby}`);
      en.push(`${osoby} in hands`);
    }
    if (magazyn) {
      pl.push(`w magazynie ${magazyn}`);
      en.push(`${magazyn} in the storeroom`);
    }
    czesci.push(L(`na starcie (${plNazwa}): ${pl.join(', ')}`, `at the start (${enNazwa}): ${en.join(', ')}`));
  };
  tryb('zwykly', 'tryb zwykły', 'normal mode');
  tryb('zombie', 'tryb zombie', 'zombie mode');
  if (id === 'dzida') czesci.push(L('do zrobienia w grze', 'can be made in the game'));
  const znaleziska = (['zwykly', 'zombie'] as const).filter((m) => ZNALEZISKA_BRONI[m].includes(id));
  if (znaleziska.length === 2) czesci.push(L('znaleziska z wypraw', 'finds on supply runs'));
  else if (znaleziska[0] === 'zombie')
    czesci.push(L('znaleziska z wypraw w trybie zombie', 'finds on supply runs in zombie mode'));
  return czesci.length ? czesci.join('; ') : L('tylko jako znalezisko', 'only as a find');
}

/** fakty wspólne dla każdej broni z jej tabeli i z funkcji gry */
function faktyBroni(id: WeaponId): Fakt[] {
  const w = WEAPONS[id];
  const fakty: Fakt[] = [
    fakt('zasieg', L('Zasięg', 'Reach'), `${num(w.reach)} m`),
    fakt('obrazenia', L('Obrażenia', 'Damage'), `${w.dmg}`),
    fakt('odstep', L('Odstęp między ciosami', 'Time between blows'), sekundy(w.cd)),
    fakt('halas', L('Hałas', 'Noise'), halas(id)),
    fakt(
      'celnosc',
      L('Szansa trafienia', 'Hit chance'),
      L(
        `${proc(w.hit)} (z Obroną 4: ${proc(hitChance(w, 4, 100, false))})`,
        `${proc(w.hit)} (with Defence 4: ${proc(hitChance(w, 4, 100, false))})`,
      ),
    ),
    fakt('amunicja', L('Amunicja', 'Ammunition'), w.ammo ? amunicjaNazwa(w.ammo) : L('bez amunicji', 'none')),
    fakt(
      'siatka',
      L('Przez siatkę', 'Through the fence'),
      w.fence ? L('sięga', 'reaches') : L('nie sięga', 'does not reach'),
    ),
    fakt(
      'szwendacz',
      L('Trafień na szwendacza', 'Hits to kill a shambler'),
      `${ciosow(id, ZOMBIE_HP)} (${ZOMBIE_HP} ${L('życia', 'health')})`,
    ),
    fakt(
      'szabrownik',
      L('Trafień na szabrownika', 'Hits to kill a looter'),
      `${ciosow(id, STRANGER_HP)} (${STRANGER_HP} ${L('życia', 'health')})`,
    ),
    fakt('skad', L('Skąd', 'Where from'), skad(id)),
  ];
  return fakty;
}

/** zdania wspólne: kto to jest, ile bije i jak głośno, potem sprawy szczególne broni */
function ogolneZdania(id: WeaponId): string[] {
  const w = WEAPONS[id];
  const nazwa = cap(bronNazwa(id));
  const zdania: string[] = [
    L(
      `${nazwa}: zasięg ${num(w.reach)} m, ${obrazenia(w.dmg)} i ${sekundy(w.cd)} między ciosami.`,
      `${nazwa}: reach ${num(w.reach)} m, ${w.dmg} damage and ${sekundy(w.cd)} between blows.`,
    ),
    w.noise
      ? L(
          `${w.ammo ? 'Strzał' : 'Cios'} słychać na ${num(w.noise, 0)} m, a w trybie zombie szwendacze idą na hałas.`,
          `${w.ammo ? 'A shot' : 'A blow'} can be heard ${num(w.noise, 0)} m away, and in zombie mode shamblers walk towards noise.`,
        )
      : L('Cios jest bezgłośny, więc nie ściąga szwendaczy.', 'A blow is silent, so it does not draw shamblers.'),
  ];
  zdania.push(
    w.fence
      ? L(
          'Sięga przez siatkę, więc strażnik nie musi wychodzić do wroga.',
          'It reaches through the fence, so a guard need not go out to the enemy.',
        )
      : L(
          'Przez siatkę nie sięga: trzeba stanąć po tej samej stronie co wróg.',
          'It does not reach through the fence: you have to stand on the same side as the enemy.',
        ),
  );
  return zdania;
}

/** zdania szczególne broni (po wspólnych), maksymalnie dwa, żeby artykuł zmieścił się w pięciu zdaniach */
function szczegolne(id: WeaponId): string[] {
  switch (id) {
    case 'piesci':
      return [
        L(
          'Tak bije ten, kto nie ma broni, a także ten, komu skończyła się amunicja do broni palnej albo kuszy.',
          'This is how someone fights who has no weapon, or whose firearm or crossbow has run out of ammunition.',
        ),
      ];
    case 'lom':
      return [
        L(
          `Z łomem wraki rozbiera się dwa razy szybciej (maluch w ${czasTickow(wreckStripTicks('maluch', true))} zamiast ${czasTickow(wreckStripTicks('maluch', false))}), a drzwi wyważa o połowę krócej i ciszej.`,
          `With a crowbar wrecks come apart twice as fast (a small car in ${czasTickow(wreckStripTicks('maluch', true))} instead of ${czasTickow(wreckStripTicks('maluch', false))}), and doors are forced in half the time and more quietly.`,
        ),
      ];
    case 'dzida':
      return [
        L(
          `Dzidę robi się z ${SPEAR_BOARDS} desek i ${SPEAR_SCRAP} złomu w ${czasTickow(CRAFT_TICKS)}, a warsztat sam robi je nieuzbrojonym.`,
          `A spear is made from ${SPEAR_BOARDS} planks and ${SPEAR_SCRAP} scrap in ${czasTickow(CRAFT_TICKS)}, and the workshop makes them on its own for the unarmed.`,
        ),
      ];
    case 'kusza':
      return [
        L(
          'W połowie trafień bełt da się odzyskać; kusza strzela cicho, ale powoli.',
          'On half of the hits the bolt can be picked up again; the crossbow shoots quietly, but slowly.',
        ),
      ];
    case 'rewolwer':
    case 'strzelba':
      return [
        L(
          `Gdy zabraknie amunicji, ${bronNazwa(id)} bije jak gołe ręce.`,
          `When the ammunition runs out, the ${bronNazwa(id)} hits like bare hands.`,
        ),
        L(
          'Przy siatce w trybie zombie warta z bronią palną strzela tylko na rozkaz, bo strzał ściąga stado.',
          'At the fence in zombie mode a guard with a firearm shoots only on orders, because a gunshot draws the herd.',
        ),
      ];
    case 'siekiera':
    case 'kij':
    case 'noz':
      return [];
  }
}

function bron(id: WeaponId): Def {
  return def(
    `bron:${id}`,
    'ludzie',
    () => cap(bronNazwa(id)),
    (c): Tresc => {
      const w = WEAPONS[id];
      const zdania = [...ogolneZdania(id), ...szczegolne(id)];
      return {
        zdania,
        fakty: faktyBroni(id),
        jak: [
          c.touch
            ? L(
                'Broń zmienia przycisk „Zmień” na karcie osoby: stuknijcie go, a osoba weźmie następną broń z magazynu.',
                'The “Swap” button on the person card changes the weapon: tap it and the person takes the next weapon from the storeroom.',
              )
            : L(
                'Broń zmienia przycisk „Zmień” na karcie osoby: kliknijcie go, a osoba weźmie następną broń z magazynu.',
                'The “Swap” button on the person card changes the weapon: click it and the person takes the next weapon from the storeroom.',
              ),
        ],
        zobacz: [
          'ludzie:bron',
          'ludzie:walka',
          ...(w.ammo ? ['zasob:amunicja'] : []),
          ...(id === 'dzida' ? ['praca:warsztat'] : []),
          ...(isFirearm(w) ? ['zombie:halas'] : []),
          ...(w.fence ? ['zombie:siatka'] : []),
        ],
      };
    },
    `${WEAPONS[id].name} ${WEAPONS_EN[id].name}`,
  );
}

function faktBroni(id: WeaponId): Fakt {
  const w = WEAPONS[id];
  return fakt(
    `bron-${id}`,
    cap(bronNazwa(id)),
    L(
      `${obrazenia(w.dmg)}, ${num(w.reach)} m, co ${sekundy(w.cd)}${w.ammo ? `, ${amunicjaNazwa(w.ammo)}` : ''}`,
      `${obrazenia(w.dmg)}, ${num(w.reach)} m, every ${sekundy(w.cd)}${w.ammo ? `, ${amunicjaNazwa(w.ammo)}` : ''}`,
    ),
  );
}

/** lista nazw broni z magazynu na start w danym trybie: „u osób: …; w magazynie: …” */
function startTrybu(m: 'zwykly' | 'zombie'): string {
  const kit = START_KIT[m];
  const nazwy = (l: readonly (WeaponId | null)[]) =>
    listaI(l.map((w) => (w ? bronNazwa(w) : L('gołe ręce', 'bare hands'))));
  const amunicja = (Object.keys(kit.ammo) as (keyof typeof kit.ammo)[])
    .filter((a) => kit.ammo[a] > 0)
    .map((a) => amunicjaZLiczba(a, kit.ammo[a]));
  return L(
    `u osób: ${nazwy(kit.core)}; w magazynie: ${nazwy(kit.store)}${amunicja.length ? `; amunicja: ${amunicja.join(', ')}` : ''}`,
    `carried: ${nazwy(kit.core)}; in the storeroom: ${nazwy(kit.store)}${amunicja.length ? `; ammunition: ${amunicja.join(', ')}` : ''}`,
  );
}

export function definicjeBron(): Def[] {
  return [
    def(
      'ludzie:bron',
      'ludzie',
      () => L('Broń', 'Weapons'),
      (c) => ({
        zdania: [
          L(
            `Każdy z ${c.words.zarzad.dk} nosi jedną broń albo walczy gołymi rękami; zapasowa broń i amunicja leżą w magazynie.`,
            `Everyone on ${c.e.krotko} carries one weapon or fights bare-handed; spare weapons and ammunition lie in the storeroom.`,
          ),
          L(
            'Przez siatkę sięgają tylko dzida, kusza i broń palna.',
            'Only the spear, the crossbow and firearms reach through the fence.',
          ),
          L(
            'Broń palna i kusza bez amunicji biją jak gołe ręce, a strzał słychać z daleka i ściąga on szwendaczy.',
            'A firearm or crossbow without ammunition hits like bare hands, and a shot can be heard far away and draws shamblers.',
          ),
          L('Dane każdej broni są w jej własnym artykule.', 'The details of each weapon are in its own article.'),
        ],
        fakty: [
          ...KOLEJNOSC_BRONI.map(faktBroni),
          fakt('start-zwykly', L('Na starcie, tryb zwykły', 'At the start, normal mode'), startTrybu('zwykly')),
          fakt('start-zombie', L('Na starcie, tryb zombie', 'At the start, zombie mode'), startTrybu('zombie')),
        ],
        jak: [
          c.touch
            ? L(
                'Przycisk „Zmień” na karcie osoby podaje następną broń z magazynu; stara wraca do magazynu, a gdy innej nie ma, osoba odkłada tę z rąk.',
                'The “Swap” button on the person card hands over the next weapon from the storeroom; the old one goes back, and if there is no other the person puts the weapon down.',
              )
            : L(
                'Przycisk „Zmień” na karcie osoby podaje następną broń z magazynu; stara wraca do magazynu, a gdy innej nie ma, osoba odkłada tę z rąk.',
                'The “Swap” button on the person card hands over the next weapon from the storeroom; the old one goes back, and if there is no other the person puts the weapon down.',
              ),
          polecenie(c, ['stercie z deskami i złomem', 'a heap of planks and scrap'], ['Zrobić dzidę', 'Make a spear']),
        ],
        zobacz: [...KOLEJNOSC_BRONI.map((id) => `bron:${id}`), 'ludzie:walka', 'zasob:amunicja'],
      }),
      'broń uzbrojenie arsenał weapons arms',
    ),

    def(
      'ludzie:walka',
      'ludzie',
      () => L('Walka i alarm', 'Fighting and the alarm'),
      (c) => {
        const { words: w, e } = c;
        return {
          zdania: [
            L(
              `Kto z ${w.zarzad.dk} ma broń i zdrowie powyżej ${WALKA.staje}, sam staje do walki z wrogiem w promieniu ${DEFEND_REACH} m; reszta chowa się w środku.`,
              `Anyone on ${e.krotko} with a weapon and health above ${WALKA.staje} steps up to fight an enemy within ${DEFEND_REACH} m on their own; the rest hide indoors.`,
            ),
            ...(c.dom
              ? []
              : [
                  L(
                    `${w.mieszkancy.m[0].toUpperCase()}${w.mieszkancy.m.slice(1)} nie walczą, tylko uciekają do siebie przed wrogiem w promieniu ${RESIDENT_FLEE} m.`,
                    `The ${e.mieszkancy} do not fight, they run home from an enemy within ${RESIDENT_FLEE} m.`,
                  ),
                ]),
            L(
              `Wartownik bije sam każdego wroga w zasięgu swojej broni, a wycofuje się do środka, gdy wróg jest tuż obok, a zdrowie spadnie poniżej ${WALKA.wycofanieWarta} (w walce ${WALKA.wycofanieWalka}) albo naciera ${WALKA.tlum} wrogów naraz.`,
              `A guard hits any enemy within reach of their weapon, and pulls back inside when an enemy is right beside them and health drops below ${WALKA.wycofanieWarta} (${WALKA.wycofanieWalka} in a fight) or ${WALKA.tlum} enemies come at once.`,
            ),
            L(
              'Walkę można zlecić: prawy przycisk na wrogu i „Atakuj szwendacza” albo „Atakuj szabrownika”.',
              'You can order a fight: right-click an enemy and pick “Attack the shambler” or “Attack the looter”.',
            ),
            L(
              `Przycisk „Do broni!” u góry stawia na wartę każdego ze zdrowiem powyżej ${WALKA.alarm}, a „Odwołaj” ją zdejmuje.`,
              `The “To arms!” button at the top puts everyone with health above ${WALKA.alarm} on watch, and “Stand down” takes them off.`,
            ),
          ],
          fakty: [
            fakt('zasieg', L(`${w.Zarzad} broni się w promieniu`, `${e.Zarzad} defends within`), `${DEFEND_REACH} m`),
            fakt(
              'zdrowie',
              L('Sam staje do walki ze zdrowiem powyżej', 'Fights on its own with health above'),
              `${WALKA.staje}`,
            ),
            fakt(
              'wycofanie',
              L('Wycofanie z warty i z walki od zdrowia', 'Pulling back from watch and fight below health'),
              `${WALKA.wycofanieWarta} / ${WALKA.wycofanieWalka}`,
            ),
            fakt('szabrownik', L('Życie szabrownika', 'Looter health'), `${STRANGER_HP}`),
            fakt('ucieczka', L('Ranny szabrownik ucieka poniżej', 'A wounded looter flees below'), `${FLEE_HP}`),
            fakt('szwendacz', L('Życie szwendacza', 'Shambler health'), `${ZOMBIE_HP}`),
            fakt(
              'alarm',
              L('„Do broni!” bierze osoby ze zdrowiem powyżej', '“To arms!” takes people with health above'),
              `${WALKA.alarm}`,
            ),
            ...(c.dom
              ? []
              : [
                  fakt(
                    'uciekaja',
                    L(
                      `${cap(w.mieszkancy.m)} uciekają przed wrogiem w promieniu`,
                      `The ${e.mieszkancy} run from an enemy within`,
                    ),
                    `${RESIDENT_FLEE} m`,
                  ),
                ]),
          ],
          jak: [
            c.touch
              ? L(
                  'Stuknijcie osobę z bronią i przytrzymajcie palec na wrogu: „Atakuj …”.',
                  'Tap a person with a weapon and press and hold on the enemy: “Attack …”.',
                )
              : L(
                  'Zaznaczcie osobę z bronią i kliknijcie wroga prawym przyciskiem: „Atakuj …”.',
                  'Select a person with a weapon and right-click the enemy: “Attack …”.',
                ),
          ],
          zobacz: ['ludzie:bron', 'ludzie:rany', 'noc:warta', 'noc:napad', 'zombie:szwendacze'],
        };
      },
      'walka alarm do broni atak fight alarm to arms',
    ),

    ...KOLEJNOSC_BRONI.map(bron),
  ];
}
