/* Wiki w grze, kategoria „Zasoby”: drewno, deski, złom, części, jedzenie, leki, amunicja, koza i ogień, palenie mebli,
   ognisko, materiały z odzysku i wraki. Skąd się bierze każdy zasób i do czego służy, liczy się z tabel gry: koszty budowli
   (`BUILDS`), przepisy warsztatu (`RECIPES`), rozbiórka (`DISMANTLE`, `WRECK_STRIP`), spalanie (`BURNABLE`, `BURN_TICKS`),
   zbiory (`GARDEN_YIELD`), progi pracy (`PROGI_DOMYSLNE`) i start (`FOOD_START`, `START_KIT`). Źródła desek, złomu i części
   w tekście biorą słownik miejsca (`Words.szukanie.zrodla`): w bloku przeszukiwanie pustych mieszkań, w domu domu i gruzu.
   Zapasy zarządu (`STOCK_KEYS`) mają tu po jednym artykule: `ARTYKUL_ZAPASU` w src/ui/wiki.ts. */

import { SEASONS_EN } from '../content/data.en.ts';
import { SEASONS } from '../content/data.ts';
import { L } from '../core/jezyk.ts';
import { PIECZARKI_PLON } from '../sim/badania.ts';
import { AMMO_EN, AMMO_NAMES, START_KIT, WEAPONS } from '../sim/bron.ts';
import { BUILDS, type BuildKind, type Mat } from '../sim/budowle.ts';
import { TICKS_PER_HOUR } from '../sim/clock.ts';
import { MAT_EN } from '../sim/mieszkania.en.ts';
import { DISMANTLE } from '../sim/mieszkania.ts';
import { FURNITURE_EN } from '../sim/nazwy.en.ts';
import { HUNGRY, PECKISH } from '../sim/needs.ts';
import { PROGI_DOMYSLNE, ZAPAS_OPALU } from '../sim/praca.ts';
import { ZABIJANIE_DESKI } from '../sim/sasiedzi.ts';
import {
  BRACE_COST,
  BURN_TICKS,
  BURNABLE,
  CAMPFIRE_CAP,
  CAMPFIRE_LIGHT,
  CAMPFIRE_WOOD,
  CARRY,
  COLD_MEAL,
  COOK_TICKS,
  FOOD_START,
  GARDEN_YIELD,
  GAS_START,
  KOZA_CAP,
  KOZA_EVENING,
  KOZA_MIN,
  KOZA_WARM,
  MEAL,
  PATCH_COST,
  SOCIAL_KITCHEN,
  SPEAR_BOARDS,
  SPEAR_SCRAP,
  STACK,
  woodFrom,
} from '../sim/sim.ts';
import {
  pracaPrzepisu,
  RECIPES,
  WRECK_SEARCH_NOISE,
  WRECK_SEARCH_TICKS,
  WRECK_STRIP,
  WRECK_STRIP_NOISE,
  WRECK_STRIP_TICKS,
  wreckStripTicks,
} from '../sim/surowce.ts';
import type { Tree } from '../world/world.ts';
import { buildName, MAT_NAME } from './budowa.ts';
import { deg, num } from './tekst.ts';
import { czasTickow, polecenie, proc } from './wiki-slowa.ts';
import { type Def, def, fakt } from './wiki-typy.ts';

/** nazwa materiału w bieżącym języku */
export const matNazwa = (m: Mat): string => L(MAT_NAME[m], MAT_EN[m]);

/** mianownik nazw mebli z `BURNABLE` (tabela gry ma tylko biernik) */
const MEBLE_PL: Record<string, string> = {
  krzeslo: 'krzesło',
  stol: 'stół',
  lozko: 'łóżko',
  wersalka: 'wersalka',
  mebloscianka: 'meblościanka',
};
export const mebelNazwa = (k: string): string => L(MEBLE_PL[k] ?? k, FURNITURE_EN[k] ?? k);

const SPRZET_PL: Record<string, string> = {
  kuchenka: 'kuchenka',
  lodowka: 'lodówka',
  wanna: 'wanna',
  umywalka: 'umywalka',
  koza: 'koza',
};
const SPRZET_EN: Record<string, string> = {
  kuchenka: 'cooker',
  lodowka: 'fridge',
  wanna: 'bath',
  umywalka: 'washbasin',
  koza: 'stove',
};
const sprzetNazwa = (k: string): string => L(SPRZET_PL[k], SPRZET_EN[k]);

const MEBLE_Z_ROZBIORKI = Object.keys(MEBLE_PL);
const SPRZETY_Z_ROZBIORKI = Object.keys(SPRZET_PL);

/** budowle, w których kosztach jest materiał, z liczbą sztuk (kolejność z `BUILDS`) */
export function uzycieWBudowlach(m: Mat): { kind: BuildKind; n: number }[] {
  return (Object.keys(BUILDS) as BuildKind[])
    .map((kind) => ({ kind, n: BUILDS[kind].cost[m] ?? 0 }))
    .filter((x) => x.n > 0);
}

/** „Warsztat 20, Magazyn 30”: te same budowle w bieżącym języku */
export const budowlyTekst = (m: Mat): string =>
  uzycieWBudowlach(m)
    .map((x) => `${buildName(x.kind)} ${x.n}`)
    .join(', ');

/** „2 drewna → 1 deska, 20 min” z przepisu warsztatu (z badaniami w `techDone` krótszy czas części) */
export function przepis(what: 'deski' | 'czesci', techDone?: readonly string[]): string {
  const r = RECIPES[what];
  const wynik = what === 'deski' ? L('1 deska', '1 plank') : L('1 część', '1 part');
  const z = what === 'deski' ? L('drewna', 'wood') : L('złomu', 'scrap');
  return `${r.n} ${z} → ${wynik}, ${czasTickow(pracaPrzepisu(what, techDone))}`;
}

const sezonLista = (wartosci: readonly number[]): string =>
  SEASONS.map((_, i) => `${L(SEASONS[i], SEASONS_EN[i])} ${wartosci[i]}`).join(', ');

/** „stół: deski 2; łóżko: deski 2” z tabeli rozbiórki (`DISMANTLE`) dla wybranych rzeczy */
function rozbiorka(rodzaje: string[], nazwa: (k: string) => string): string {
  return rodzaje
    .map((k) => {
      const co = (Object.entries(DISMANTLE[k]) as [Mat, number][]).map(([m, n]) => `${matNazwa(m)} ${n}`).join(', ');
      return `${nazwa(k)}: ${co}`;
    })
    .join('; ');
}

/** drzewo o koronie 2 m do przykładu w faktach (liczy `woodFrom`) */
const drzewo = (kind: Tree['kind']): Tree => ({ x: 0, y: 0, kind, r: 2, seed: 0 });

export function definicjeZasoby(): Def[] {
  return [
    def(
      'zasob:drewno',
      'zasoby',
      () => L('Drewno', 'Wood'),
      (c) => {
        const { words: w, e } = c;
        return {
          zdania: [
            L(
              'Drewno to opał dla kozy i surowiec na deski.',
              'Wood is fuel for the stove and the raw material for planks.',
            ),
            L(
              `Jedna sztuka pali się w kozie ${czasTickow(BURN_TICKS)} gry, więc zimą drewna ubywa najszybciej ze wszystkiego.`,
              `One piece burns in the stove for ${czasTickow(BURN_TICKS)} of game time, so in winter wood runs out faster than anything else.`,
            ),
            L(
              'Dają je ścinane drzewa, spalone meble i łup z wypraw, a handlarz kupuje je za jedzenie.',
              'You get it from felled trees, burned furniture and loot from supply runs, and the trader buys it for food.',
            ),
            L(
              'Czip „drewno” liczy zapas w składzie przy kozie, luzem na podwórku i w rękach, bez tego, co już się pali.',
              'The “wood” chip counts the woodpile by the stove, loose wood in the yard and wood being carried, but not what is already burning.',
            ),
          ],
          fakty: [
            fakt(
              'pali',
              L('Pali się w kozie', 'Burns in the stove'),
              L(`1 szt. na ${czasTickow(BURN_TICKS)}`, `1 piece per ${czasTickow(BURN_TICKS)}`),
            ),
            fakt('koza', L('Koza mieści naraz', 'The stove holds'), L(`${KOZA_CAP} szt.`, `${KOZA_CAP} pieces`)),
            fakt('rece', L('W rękach', 'In the hands'), L(`${CARRY} szt.`, `${CARRY} pieces`)),
            fakt('stos', L('Na kafelku składu', 'On a woodpile tile'), L(`${STACK} szt.`, `${STACK} pieces`)),
            fakt(
              'drzewo',
              L('Ze ściętego drzewa (korona 2 m)', 'From a felled tree (2 m crown)'),
              L(
                `${woodFrom(drzewo(0))} szt., z krzaka ${woodFrom(drzewo(2))}`,
                `${woodFrom(drzewo(0))} pieces, ${woodFrom(drzewo(2))} from a bush`,
              ),
            ),
            fakt(
              'meble',
              L('Ze spalonego mebla', 'From burned furniture'),
              Object.keys(BURNABLE)
                .map((k) => `${mebelNazwa(k)} ${BURNABLE[k]}`)
                .join(', '),
            ),
            fakt('deski', L('Na deski', 'Into planks'), przepis('deski')),
            fakt(
              'rezerwa',
              L('Warsztat zostawia na opał', 'The workshop keeps for fuel'),
              L(`${ZAPAS_OPALU} szt.`, `${ZAPAS_OPALU} pieces`),
            ),
            fakt(
              'prog',
              L('Drwal tnie, póki jest mniej niż', 'The woodcutter chops while there is less than'),
              L(
                `${PROGI_DOMYSLNE.drewno} szt. (próg w panelu Pracy)`,
                `${PROGI_DOMYSLNE.drewno} pieces (the level in the Work panel)`,
              ),
            ),
          ],
          jak: [
            polecenie(c, ['drzewie', 'a tree'], ['Ściąć drzewo', 'Chop down the tree']),
            L(
              `Praca „Drwal” tnie drzewa sama, póki drewna jest mniej niż próg; w trybie zombie drzewa za siatką stoją wśród szwendaczy, a ${w.brama.m} jest zamknięta.`,
              `The “Woodcutting” job chops trees on its own while there is less wood than the stock level; in Zombie mode the trees outside the fence stand among the shamblers, and ${e.brama} is shut.`,
            ),
            polecenie(c, ['stosie drewna', 'a pile of wood'], ['Zanieść do składu', 'Carry to the woodpile']),
          ],
          zobacz: ['zasob:koza', 'zasob:meble', 'zasob:deski', 'praca:drwal', 'noc:koza', 'start:temperatura'],
        };
      },
      'opał drzewo pień skład paliwo fuel',
    ),

    def(
      'zasob:deski',
      'zasoby',
      () => L('Deski', 'Planks'),
      (c) => {
        const { words: w, e } = c;
        return {
          zdania: [
            L(
              'Deski to podstawowy materiał na łaty, naprawy i większość budowli.',
              'Planks are the basic material for patches, repairs and most buildings.',
            ),
            L(
              `Dają je ${w.szukanie.zrodla.deski}, a warsztat piłuje je z drewna.`,
              `They come from ${e.szukanie.zrodla.deski}, and the workshop saws them from wood.`,
            ),
            L(
              'Zarząd nosi deski na podwórko i zużywa je sam, kiedy łata dziurę, naprawia coś albo buduje.',
              'The people carry planks into the yard and use them up on their own when they patch a hole, repair something or build.',
            ),
          ],
          fakty: [
            fakt('przepis', L('Z drewna w warsztacie', 'Sawn from wood'), przepis('deski')),
            fakt('budowle', L('W kosztach budowli', 'In building costs'), budowlyTekst('deski')),
            fakt(
              'lata',
              L('Łata na dziurę', 'Fence patch'),
              L(`${PATCH_COST} szt. desek albo złomu`, `${PATCH_COST} planks or scrap`),
            ),
            fakt(
              'wzmocnienie',
              L('Wzmocnienie siatki', 'Shoring up the fence'),
              L(`${BRACE_COST} szt. desek albo złomu`, `${BRACE_COST} planks or scrap`),
            ),
            fakt(
              'dzida',
              L('Dzida', 'Spear'),
              L(`${SPEAR_BOARDS} deski i ${SPEAR_SCRAP} złom`, `${SPEAR_BOARDS} planks and ${SPEAR_SCRAP} scrap`),
            ),
            fakt(
              'drzwi',
              L('Zabicie drzwi deskami', 'Nailing a door shut'),
              L(`${ZABIJANIE_DESKI} deski`, `${ZABIJANIE_DESKI} planks`),
            ),
            fakt(
              'rozbiorka',
              L('Z rozbiórki mebli', 'From taking furniture apart'),
              rozbiorka(
                MEBLE_Z_ROZBIORKI.filter((k) => DISMANTLE[k].deski),
                mebelNazwa,
              ),
            ),
            fakt(
              'prog',
              L('Warsztat piłuje, póki jest mniej niż', 'The workshop saws while there are fewer than'),
              L(
                `${PROGI_DOMYSLNE.deski} szt. (próg w panelu Pracy)`,
                `${PROGI_DOMYSLNE.deski} (the level in the Work panel)`,
              ),
            ),
          ],
          jak: [
            L(
              'Gdy stoi warsztat, menu poleceń zawiera „Piłować deskę z drewna” i piłowanie kilku desek naraz.',
              'Once a workshop stands, the order menu offers “Saw wood into a plank” and sawing several planks at once.',
            ),
            polecenie(
              c,
              ['meblu w pustym pokoju', 'a piece of furniture in an empty room'],
              ['Rozebrać …', 'Take apart the …'],
            ),
          ],
          zobacz: ['zasob:odzysk', 'zasob:drewno', 'budowla:warsztat', 'praca:warsztat', 'zasob:meble'],
        };
      },
      'deska materiał budowlany planks',
    ),

    def(
      'zasob:zlom',
      'zasoby',
      () => L('Złom', 'Scrap'),
      (c) => {
        const { words: w, e } = c;
        return {
          zdania: [
            L(
              'Złom to metal z odzysku: idzie na łaty, zasieki, barykady i naprawy rur i pieców.',
              'Scrap is salvaged metal: it goes into patches, barricades and repairs to pipes and cookers.',
            ),
            L(
              `Dają go ${w.szukanie.zrodla.zlom}, rozbiórka wraków i łup z wypraw, a handlarz przyjmuje go jak walutę.`,
              `It comes from ${e.szukanie.zrodla.zlom}, stripped wrecks and loot from supply runs, and the trader takes it as currency.`,
            ),
            L('Z dwóch sztuk złomu warsztat robi część.', 'The workshop turns two pieces of scrap into a part.'),
          ],
          fakty: [
            fakt('przepis', L('Na części w warsztacie', 'Made into parts'), przepis('czesci')),
            fakt('budowle', L('W kosztach budowli', 'In building costs'), budowlyTekst('zlom')),
            fakt(
              'lata',
              L('Łata na dziurę', 'Fence patch'),
              L(`${PATCH_COST} szt. złomu albo desek`, `${PATCH_COST} scrap or planks`),
            ),
            fakt(
              'wzmocnienie',
              L('Wzmocnienie siatki', 'Shoring up the fence'),
              L(`${BRACE_COST} szt. złomu albo desek`, `${BRACE_COST} scrap or planks`),
            ),
            fakt(
              'dzida',
              L('Dzida', 'Spear'),
              L(`${SPEAR_SCRAP} złom i ${SPEAR_BOARDS} deski`, `${SPEAR_SCRAP} scrap and ${SPEAR_BOARDS} planks`),
            ),
            fakt(
              'wrak',
              L('Z rozbiórki wraku', 'From stripping a wreck'),
              `${L('maluch', 'Fiat 126p')} ${WRECK_STRIP.maluch.zlom}, ${L('polonez', 'Polonez')} ${WRECK_STRIP.polonez.zlom}`,
            ),
            fakt(
              'sprzety',
              L('Z rozbiórki sprzętów', 'From taking appliances apart'),
              rozbiorka(
                SPRZETY_Z_ROZBIORKI.filter((k) => DISMANTLE[k].zlom),
                sprzetNazwa,
              ),
            ),
          ],
          jak: [
            polecenie(c, ['wraku', 'a wreck'], ['Rozebrać malucha', 'Strip the Fiat 126p']),
            polecenie(
              c,
              ['sprzęcie albo stercie śmieci', 'an appliance or a rubbish heap'],
              ['Rozebrać …', 'Take apart the …'],
            ),
          ],
          zobacz: ['zasob:odzysk', 'zasob:wraki', 'zasob:czesci', 'budowla:zasieki', 'budowla:barykada'],
        };
      },
      'metal rozbiórka scrap',
    ),

    def(
      'zasob:czesci',
      'zasoby',
      () => L('Części', 'Parts'),
      (c) => {
        const { words: w, e } = c;
        return {
          zdania: [
            L(
              'Części to elementy, które przetrwały pod lakierem: alternatory, rozruszniki, zawory, kawałki elektroniki.',
              'Parts are the bits that survived under the paint: alternators, starter motors, valves, scraps of electronics.',
            ),
            L(
              'Potrzebne są do napraw rur i pieców, do kuchni społecznej, pracowni, kotła i do części badań.',
              'They are needed to fix pipes and cookers and for the community kitchen, the research room, the boiler and some researches.',
            ),
            L(
              `Dają je ${w.szukanie.zrodla.czesci}, wraki i wyprawy; warsztat robi je też ze złomu.`,
              `They come from ${e.szukanie.zrodla.czesci}, wrecks and supply runs; the workshop also makes them from scrap.`,
            ),
          ],
          fakty: [
            fakt('przepis', L('Ze złomu w warsztacie', 'Made from scrap'), przepis('czesci')),
            fakt(
              'przepis-spawanie',
              L('Po badaniu spawania', 'After the welding research'),
              przepis('czesci', ['t_spawanie']),
            ),
            fakt('budowle', L('W kosztach budowli', 'In building costs'), budowlyTekst('czesci')),
            fakt(
              'wrak',
              L('Z rozbiórki wraku', 'From stripping a wreck'),
              L(`${WRECK_STRIP.maluch.czesci} szt.`, `${WRECK_STRIP.maluch.czesci} piece`),
            ),
            fakt(
              'prog',
              L('Warsztat robi, póki jest mniej niż', 'The workshop makes parts while there are fewer than'),
              L(
                `${PROGI_DOMYSLNE.czesci} szt. (próg w panelu Pracy)`,
                `${PROGI_DOMYSLNE.czesci} (the level in the Work panel)`,
              ),
            ),
          ],
          jak: [
            polecenie(c, ['wraku', 'a wreck'], ['Przeszukać malucha', 'Search the Fiat 126p']),
            L(
              'Gdy stoi warsztat, menu poleceń zawiera „Zrobić część ze złomu”.',
              'Once a workshop stands, the order menu offers “Make a part from scrap”.',
            ),
          ],
          zobacz: ['zasob:odzysk', 'zasob:zlom', 'budowla:warsztat', 'zasob:wraki', 'badanie:t_spawanie'],
        };
      },
      'część element elektronika parts',
    ),

    def(
      'zasob:jedzenie',
      'zasoby',
      () => L('Jedzenie', 'Food'),
      (c) => {
        const { words: w, e } = c;
        return {
          zdania: [
            L(
              'Jedzenie liczy się w porcjach: zapasy w kuchni i ugotowane porcje w garnku to dwie liczby, które czip „jedzenie” dodaje do siebie.',
              'Food is counted in portions: the stock in the kitchen and the cooked portions in the pot are two numbers, and the “food” chip adds them up.',
            ),
            L(
              'Ciepły posiłek syci lepiej niż zimna porcja z zapasów, ale gotowanie wymaga ognia: gazu w butli albo palącej się kozy.',
              'A hot meal fills people up more than a cold portion from the stock, but cooking needs fire: gas in the cooker or a burning stove.',
            ),
            L(
              'Jedzenie dają ogródki, szklarnia, pieczarkarnia, wyprawy do sklepów i wymiana z handlarzem.',
              'Food comes from the vegetable patches, the greenhouse, the mushroom farm, supply runs to shops and trading.',
            ),
            L(
              `Głodni ludzie tracą zdrowie i nastrój, a ${w.mieszkancy.m} się wkurzają.`,
              `Hungry people lose health and mood, and the ${e.mieszkancy} get angry.`,
            ),
          ],
          fakty: [
            fakt(
              'start',
              L('Zapas na start', 'Stock at the start'),
              L(`${FOOD_START} porcji`, `${FOOD_START} portions`),
            ),
            fakt('posilek', L('Ciepły posiłek (Najedzenie)', 'A hot meal (Fed)'), `+${MEAL}`),
            fakt(
              'zimna',
              L('Zimna porcja z zapasów (Najedzenie)', 'A cold portion from the stock (Fed)'),
              `+${COLD_MEAL}`,
            ),
            fakt('gotowanie', L('Gotowanie trwa', 'Cooking takes'), czasTickow(COOK_TICKS)),
            fakt(
              'gaz',
              L('Gaz w butli na start', 'Gas in the cylinder at the start'),
              L(`${GAS_START / COOK_TICKS} gotowań`, `${GAS_START / COOK_TICKS} cooking sessions`),
            ),
            fakt('glod', L('Idzie jeść, gdy najedzenie poniżej', 'Goes to eat when Fed is below'), `${HUNGRY}`),
            fakt('gotuje', L('Ktoś gotuje, gdy najedzenie poniżej', 'Someone cooks when Fed is below'), `${PECKISH}`),
            fakt(
              'kuchnia',
              L('Kuchnia społeczna', 'Community kitchen'),
              L(`porcja to ${proc(SOCIAL_KITCHEN)} zwykłej`, `a portion is ${proc(SOCIAL_KITCHEN)} of a normal one`),
            ),
            fakt(
              'ogrodek',
              L('Ogródek, plon co 3 dni', 'Vegetable patch, a yield every 3 days'),
              sezonLista(GARDEN_YIELD),
            ),
            fakt(
              'pieczarki',
              L('Pieczarkarnia, plon co 3 dni', 'Mushroom farm, a yield every 3 days'),
              L(`${PIECZARKI_PLON} porcje przez cały rok`, `${PIECZARKI_PLON} portions all year round`),
            ),
          ],
          jak: [
            L(
              'Zarząd gotuje sam, kiedy ktoś robi się głodny; polecenie „Gotować” w menu przy kuchence albo zapasach gotuje od razu.',
              'The people cook on their own when someone gets hungry; the “Cook” order, given at the cooker or the stock, cooks at once.',
            ),
            L(
              'Wyprawę po jedzenie wysyła się z mapy miasta: do sklepu spożywczego, sklepu albo ogrodnika.',
              'Send a food run from the city map: to a food shop, a shop or a garden centre.',
            ),
          ],
          zobacz: [
            'potrzeba:food',
            'budowla:ogrodek',
            'budowla:kuchnia_spoleczna',
            'uchwala:u_racje',
            'uchwala:u_kociol',
            'miasto:wyprawa',
            'wydarzenia:handlarz',
          ],
        };
      },
      'porcje posiłek żywność gotowanie gaz głód zapasy portions meals',
    ),

    def(
      'zasob:leki',
      'zasoby',
      () => L('Leki', 'Meds'),
      () => ({
        zdania: [
          L(
            'Leki to paczki lekarstw i opatrunków, których w 2051 roku prawie nie ma.',
            'Meds are packs of medicines and dressings, which in 2051 are almost impossible to find.',
          ),
          L(
            'Leżą w aptekach i przychodniach, trafiają się w schowkach wraków, a ogródek po badaniu zielarstwa daje je czasem przy plonie.',
            'They lie in pharmacies and clinics, turn up in wreck glove boxes, and a vegetable patch occasionally yields some after the herbalism research.',
          ),
          L(
            'Pomagają przy amputacji, a prosi o nie wielu gości pod bramą.',
            'They help with an amputation, and many guests at the gate ask for them.',
          ),
          L(
            'Handlarz czasem wymienia leki na części albo kupuje je za jedzenie.',
            'The trader sometimes swaps meds for parts or buys them for food.',
          ),
        ],
        fakty: [
          fakt(
            'sklep',
            L('Gdzie szukać', 'Where to look'),
            L('apteka, przychodnia (mapa miasta)', 'pharmacy, clinic (city map)'),
          ),
        ],
        jak: [
          L(
            'Wyprawę po leki wysyła się z mapy miasta do apteki albo przychodni.',
            'Send a run for meds from the city map to a pharmacy or a clinic.',
          ),
        ],
        zobacz: [
          'miejsce:apteka',
          'miejsce:przychodnia',
          'ludzie:ugryzienie',
          'badanie:t_zielarstwo',
          'wydarzenia:handlarz',
        ],
      }),
      'lekarstwa apteka medycyna medicine',
    ),

    def(
      'zasob:amunicja',
      'zasoby',
      () => L('Amunicja', 'Ammunition'),
      (c) => {
        const typ = (id: 'rewolwer' | 'strzelba' | 'kusza'): string => {
          const a = WEAPONS[id].ammo!;
          return L(AMMO_NAMES[a], AMMO_EN[a].name);
        };
        return {
          zdania: [
            L(
              'Broń palna i kusza zużywają amunicję: rewolwer naboje, strzelba loftki, kusza bełty.',
              'Firearms and the crossbow use ammunition: the revolver rounds, the shotgun buckshot, the crossbow bolts.',
            ),
            L(
              'Amunicja leży w magazynie broni, a jej stan widać przy broni na karcie osoby.',
              'The ammunition sits in the arms store, and the count shows beside the weapon on the person card.',
            ),
            L(
              'Nowej nie da się zrobić ani kupić u handlarza: zostaje to, co ktoś przyniesie.',
              'You cannot make new ammunition or buy it from the trader: what you have is what people bring.',
            ),
          ],
          fakty: [
            fakt(
              'start-zombie',
              L('Na start w trybie zombie', 'At the start in Zombie mode'),
              L(`naboje ${START_KIT.zombie.ammo.naboje}`, `rounds ${START_KIT.zombie.ammo.naboje}`),
            ),
            fakt('start-zwykly', L('Na start w trybie zwykłym', 'At the start in Normal mode'), L('brak', 'none')),
            fakt('rewolwer', L('Rewolwer', 'Revolver'), typ('rewolwer')),
            fakt('strzelba', L('Strzelba', 'Shotgun'), typ('strzelba')),
            fakt('kusza', L('Kusza', 'Crossbow'), typ('kusza')),
          ],
          jak: [
            L(
              `Broń zmienia się na karcie osoby przyciskiem „Zmień” (${c.touch ? 'stuknięcie' : 'klik'}); amunicja przechodzi z magazynu do osoby razem z bronią.`,
              `Swap weapons with the “Swap” button on the person card (${c.touch ? 'tap' : 'click'}); the ammunition moves from the store to the person along with the weapon.`,
            ),
          ],
          zobacz: ['bron:rewolwer', 'bron:strzelba', 'bron:kusza', 'ludzie:bron', 'zombie:halas'],
        };
      },
      'naboje loftki bełty strzały amunicja ammo',
    ),

    def(
      'zasob:koza',
      'zasoby',
      () => L('Koza i ogień', 'The stove and the fire'),
      (c) => {
        const { words: w, e } = c;
        return {
          zdania: [
            L(
              `Koza to piecyk w kuchni ${w.zarzad.dk}: pali drewno, grzeje kuchnię i pozwala gotować, gdy kończy się gaz.`,
              `The potbelly stove stands in ${e.krotko}’s kitchen: it burns wood, heats the kitchen and lets you cook when the gas runs out.`,
            ),
            L(
              'Czip „koza” mówi, na ile godzin gry starczy ognia; zarząd sam dokłada, póki jest drewno.',
              'The “stove” chip shows how many game hours of fire are left; people feed it on their own as long as there is wood.',
            ),
            L(
              'Bez polecenia dokładają do niej tylko wtedy, gdy ogień jest potrzebny: ktoś marznie, kuchnia stygnie, trzeba gotować albo zaczyna się wieczór.',
              'Without an order they feed it only when the fire is needed: someone is cold, the kitchen is cooling down, there is cooking to do, or the evening begins.',
            ),
            L('Zimną kozę rozpala się, dokładając do niej drewno.', 'A cold stove is lit by feeding it wood.'),
          ],
          fakty: [
            fakt(
              'pali',
              L('Zjada', 'Burns'),
              L(`1 szt. drewna na ${czasTickow(BURN_TICKS)}`, `1 piece of wood per ${czasTickow(BURN_TICKS)}`),
            ),
            fakt('pojemnosc', L('Mieści naraz', 'Holds'), L(`${KOZA_CAP} szt. drewna`, `${KOZA_CAP} pieces of wood`)),
            fakt(
              'cieplo',
              L('Dokłada, gdy ktoś ma ciepło poniżej', 'Fed when someone’s Warmth is below'),
              `${KOZA_WARM}`,
            ),
            fakt('kuchnia', L('Dokłada, gdy w kuchni poniżej', 'Fed when the kitchen is below'), deg(KOZA_MIN)),
            fakt('wieczor', L('Dokłada wieczorem od', 'Fed in the evening from'), `${KOZA_EVENING}:00`),
          ],
          jak: [
            polecenie(c, ['kozie', 'the stove'], ['Dołożyć do kozy', 'Feed the stove']),
            polecenie(c, ['kozie', 'the stove'], ['Czuwać przy kozie', 'Keep watch by the stove']),
          ],
          zobacz: [
            'zasob:drewno',
            'noc:koza',
            'budowla:koza_beczka',
            'budowla:kociol',
            'start:temperatura',
            'potrzeba:warm',
          ],
        };
      },
      'piecyk ogień opał palenisko kuchnia grzanie stove fire',
    ),

    def(
      'zasob:meble',
      'zasoby',
      () => L('Palenie mebli', 'Burning furniture'),
      (c) => {
        const { words: w, e } = c;
        return {
          zdania: [
            L(
              'Mebel można spalić na opał, ale gra zawsze pyta o potwierdzenie, bo mebla już nie będzie.',
              'A piece of furniture can be burned for fuel, but the game always asks first, because once it’s gone, it’s gone.',
            ),
            L(
              'Spalony mebel trafia najpierw do kozy, a reszta drewna na skład.',
              'The burned furniture goes into the stove first, and the rest of the wood onto the woodpile.',
            ),
            L(
              `Właściciel mebla bardzo to przeżywa, a wkurzenie ${w.mieszkancy.d} rośnie z każdym spalonym meblem.`,
              `The owner takes it hard, and the ${e.mieszkancy}’ anger rises with every piece burned.`,
            ),
            L(
              'Uchwała „Meble na opał” łagodzi te skutki o połowę.',
              'The “Furniture for fuel” resolution halves those effects.',
            ),
          ],
          fakty: Object.keys(BURNABLE).map((k) =>
            fakt(
              `mebel-${k}`,
              mebelNazwa(k).replace(/^./, (x) => x.toUpperCase()),
              L(
                `${BURNABLE[k]} szt. drewna, ${num((BURNABLE[k] * BURN_TICKS) / TICKS_PER_HOUR)} h ognia`,
                `${BURNABLE[k]} pieces of wood, ${num((BURNABLE[k] * BURN_TICKS) / TICKS_PER_HOUR)} h of fire`,
              ),
            ),
          ),
          jak: [
            polecenie(c, ['meblu', 'a piece of furniture'], ['Spalić …', 'Burn the …']),
            L(
              'W sąsiednich budynkach mebli nie wolno palić; w pustym mieszkaniu zarządu można je też rozebrać na deski.',
              'Furniture in neighbouring buildings cannot be burned; furniture in your own empty rooms can also be taken apart for planks.',
            ),
          ],
          zobacz: ['zasob:drewno', 'zasob:koza', 'uchwala:u_meble', 'zarzad:wkurzenie', 'zasob:deski'],
        };
      },
      'meble spalić opał krzesło stół łóżko wersalka meblościanka furniture burn',
    ),

    def(
      'zasob:ognisko',
      'zasoby',
      () => L('Ognisko', 'Campfire'),
      (c) => ({
        zdania: [
          L(
            'Ognisko na podwórku oświetla je, uspokaja ludzi i odstrasza szabrowników.',
            'A campfire in the yard lights it up, calms people down and puts looters off.',
          ),
          L(
            'Wieczorem ludzie sami się przy nim zbierają, a płonące ognisko zmniejsza szansę napadu.',
            'In the evening people gather round it on their own, and a burning campfire lowers the raid chance.',
          ),
          L('Pali się na drewnie, tak jak koza.', 'It burns wood, just like the stove.'),
        ],
        fakty: [
          fakt(
            'drewno',
            L('Rozpalenie kosztuje', 'Lighting it costs'),
            L(`${CAMPFIRE_WOOD} szt. drewna`, `${CAMPFIRE_WOOD} pieces of wood`),
          ),
          fakt(
            'pojemnosc',
            L('Mieści naraz', 'Holds'),
            L(`${CAMPFIRE_CAP} szt. drewna`, `${CAMPFIRE_CAP} pieces of wood`),
          ),
          fakt('swiatlo', L('Zasięg światła', 'Light reaches'), `${CAMPFIRE_LIGHT} m`),
        ],
        jak: [
          polecenie(
            c,
            ['miejscu na podwórku', 'a spot in the yard'],
            ['Rozpalić ognisko tutaj', 'Light a campfire here'],
          ),
        ],
        zobacz: ['zasob:koza', 'noc:napad', 'potrzeba:safe'],
      }),
      'ognisko wieczorem światło campfire',
    ),

    def(
      'zasob:odzysk',
      'zasoby',
      () => L('Materiały z odzysku: deski, złom, części', 'Salvage: planks, scrap, parts'),
      (c) => {
        const { words: w, e } = c;
        return {
          zdania: [
            L(
              'Deski, złom i części to materiały z odzysku: na telefonie czip „d·z·cz” pokazuje je razem.',
              'Planks, scrap and parts are salvaged materials: on a phone the “pl·sc·pa” chip shows them together.',
            ),
            L(
              `Dają je przede wszystkim ${w.szukanie.d} i rozbiórka rzeczy; zarząd nosi je na podwórko i zużywa na łaty, naprawy i budowę.`,
              `They come mainly from searching ${e.szukanie.d} and taking things apart; the people carry them into the yard and use them for patches, repairs and building.`,
            ),
            L(
              'Warsztat przerabia drewno na deski, a złom na części.',
              'The workshop turns wood into planks and scrap into parts.',
            ),
          ],
          fakty: [
            fakt(
              'deski',
              matNazwa('deski'),
              L(`źródła: ${w.szukanie.zrodla.deski}`, `sources: ${e.szukanie.zrodla.deski}`),
            ),
            fakt(
              'zlom',
              matNazwa('zlom'),
              L(`źródła: ${w.szukanie.zrodla.zlom}`, `sources: ${e.szukanie.zrodla.zlom}`),
            ),
            fakt(
              'czesci',
              matNazwa('czesci'),
              L(`źródła: ${w.szukanie.zrodla.czesci}`, `sources: ${e.szukanie.zrodla.czesci}`),
            ),
            fakt(
              'sprzety',
              L('Rozbiórka sprzętów', 'Taking appliances apart'),
              rozbiorka(SPRZETY_Z_ROZBIORKI, sprzetNazwa),
            ),
          ],
          jak: [L(w.szukanie.jak[c.touch ? 'dotyk' : 'mysz'], e.szukanie.jak[c.touch ? 'dotyk' : 'mysz'])],
          zobacz: ['zasob:deski', 'zasob:zlom', 'zasob:czesci', 'zasob:wraki', 'budowla:warsztat'],
        };
      },
      'materiały odzysk szaber deski złom części salvage',
    ),

    def(
      'zasob:wraki',
      'zasoby',
      () => L('Wraki', 'Wrecks'),
      (c) => ({
        zdania: [
          L(
            'Wraki to stare samochody stojące na ulicach: maluchy i polonezy, które można przeszukać, a potem rozebrać.',
            'Wrecks are old cars standing in the streets: Fiat 126ps and Polonezes you can search and then strip.',
          ),
          L(
            'Przeszukanie często daje części i złom, czasem leki albo jedzenie z bagażnika; rozbiórka daje pewny złom i część.',
            'Searching often turns up parts and scrap, sometimes meds or food from the boot; stripping gives a sure amount of scrap and a part.',
          ),
          L(
            'Rozbiórka jest głośna, a z łomem w rękach trwa o połowę krócej.',
            'Stripping is loud, and with a crowbar in hand it takes half as long.',
          ),
          L(
            'Rozebrany wrak zostaje szkieletem, który dalej blokuje drogę.',
            'A stripped wreck stays as a shell that still blocks the way.',
          ),
        ],
        fakty: [
          fakt('szukanie', L('Przeszukanie trwa', 'Searching takes'), czasTickow(WRECK_SEARCH_TICKS)),
          fakt(
            'maluch',
            L('Rozbiórka malucha', 'Stripping a Fiat 126p'),
            `${czasTickow(WRECK_STRIP_TICKS.maluch)} (${L('z łomem', 'with a crowbar')}: ${czasTickow(wreckStripTicks('maluch', true))})`,
          ),
          fakt(
            'polonez',
            L('Rozbiórka poloneza', 'Stripping a Polonez'),
            `${czasTickow(WRECK_STRIP_TICKS.polonez)} (${L('z łomem', 'with a crowbar')}: ${czasTickow(wreckStripTicks('polonez', true))})`,
          ),
          fakt(
            'lup-maluch',
            L('Z malucha', 'From a Fiat 126p'),
            `${matNazwa('zlom')} ${WRECK_STRIP.maluch.zlom}, ${matNazwa('czesci')} ${WRECK_STRIP.maluch.czesci}`,
          ),
          fakt(
            'lup-polonez',
            L('Z poloneza', 'From a Polonez'),
            `${matNazwa('zlom')} ${WRECK_STRIP.polonez.zlom}, ${matNazwa('czesci')} ${WRECK_STRIP.polonez.czesci}`,
          ),
          fakt(
            'halas',
            L('Hałas słychać na', 'The noise carries'),
            L(
              `przeszukanie ${WRECK_SEARCH_NOISE} m, rozbiórka ${WRECK_STRIP_NOISE} m`,
              `searching ${WRECK_SEARCH_NOISE} m, stripping ${WRECK_STRIP_NOISE} m`,
            ),
          ),
        ],
        jak: [
          polecenie(c, ['wraku', 'a wreck'], ['Przeszukać malucha', 'Search the Fiat 126p']),
          polecenie(c, ['wraku', 'a wreck'], ['Rozebrać malucha', 'Strip the Fiat 126p']),
          L(
            'Łup leży w stertach przy aucie: polecenie „Zanieść na podwórko” przenosi go za siatkę do środka.',
            'The loot lies in heaps by the car: the “Carry into the yard” order brings it inside the fence.',
          ),
        ],
        zobacz: ['zasob:zlom', 'zasob:czesci', 'praca:szaber', 'zombie:halas', 'budowla:warsztat'],
      }),
      'samochód auto maluch polonez szaber wreck car',
    ),
  ];
}
