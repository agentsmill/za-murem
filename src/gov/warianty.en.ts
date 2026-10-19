/* Angielskie teksty wydarzeń z 0.3 tak, jak gra je pokazuje: treść z src/content/events.ts z nakładkami M1
   z src/gov/warianty.ts (pora, miejsce, warianty dla domu i bloku, „Drewno” zamiast „Opał”). Polska treść zostaje bajt
   w bajt, a angielska powstaje tu z tych samych danych wydarzenia (ActiveEvent.d) i tego samego gospodarza, z tymi
   samymi warunkami co polska: dom albo blok, jacy sąsiedzi (bloki, domy, nikt), garaże, najwyższy budynek, ognisko,
   wolne miejsca, uchwały. Wpisy do kroniki z wyborów 0.3 przychodzą jako gotowe polskie zdania (z drewnem i zwrotami
   miejsca z nakładki), więc `log` tłumaczy polski wpis na angielski; to bezpieczne, bo treść 0.3 jest zamrożona testem
   zgodności. Polskie napisy z list w danych (skąd przyszli ludzie, tytuły książek) tłumaczą tabele
   z warianty-dane.en.ts.

   Kontrakt: funkcje tylko czytają gospodarza (zapasy, miejsce, słowa, ludzie) i nigdy nie losują (`h.rng`,
   `h.shuffle`, `h.makePerson`) ani nic nie zmieniają, bo gra woła je obok polskich w tej samej chwili. Napisy wyborów
   idą w kolejności wyborów z gry; gdyby polska nakładka miała ich inną liczbę, wracają polskie napisy, żeby żaden
   napis nie trafił do cudzego wyboru. Wydarzenie bez wpisu tutaj pokazuje się po angielsku z polskim tekstem, a test
   pokrycia (tests/unit/wydarzenia03-en.test.ts) to łapie. Słowa: docs/SLOWNICZEK-EN.md. */

import { zawodEn } from '../content/data.en.ts';
import type { Cost } from '../content/data.ts';
import { zPrzedimkiem } from '../mieszkancy/szablony.en.ts';
import { nazwaBudynkuEn } from '../world/classify.en.ts';
import type { GovHost } from './tresc.ts';
import { bookEn, costEn, costPlEn, dziedzinaEn, fromEn, TOWER_EN } from './warianty-dane.en.ts';

// biome-ignore lint/suspicious/noExplicitAny: dane wydarzeń z 0.3 mają różne kształty
type D = any;

export interface EventEn {
  title: (h: GovHost, d: D) => string;
  text: (h: GovHost, d: D) => string;
  /** napisy wyborów w kolejności wyborów z gry (po nakładce); pl to ich polskie napisy, z „Drewno” zamiast „Opał” */
  labels: (h: GovHost, d: D, pl: readonly string[]) => string[];
  /** polski wpis do kroniki z wyboru k (już z drewnem i zwrotami miejsca) po angielsku; null, gdy wpisu nie zna */
  log?: (pl: string, h: GovHost, d: D, k: number) => string | null;
}

// ---------------------------------------------------------------- warunki jak w warianty.ts

const dom = (h: GovHost) => h.place().kind === 'dom';
/** sąsiedzi to domy: teksty o domach obok zamiast o blokach */
const domyObok = (h: GovHost) => h.neighbours() === 'domy';
/** w okolicy nie ma sąsiadów */
const nikt = (h: GovHost) => h.neighbours() === null;
const wielka = (s: string) => s[0].toUpperCase() + s.slice(1);

// ---------------------------------------------------------------- drobiazgi języka

/** zaimki z płci osoby (słowniczek: she/her, he/him); bez osoby they */
function zaimki(p: { f: boolean } | null | undefined) {
  if (!p) return { on: 'they', go: 'them' };
  return p.f ? { on: 'she', go: 'her' } : { on: 'he', go: 'him' };
}

/** „1 person”, „7 people” */
const ludzie = (n: number) => (n === 1 ? '1 person' : `${n} people`);
/** mała liczba słownie („a family of three”), większa cyframi */
const SLOWNIE = ['no', 'one', 'two', 'three', 'four', 'five', 'six'];
const slownie = (n: number) => SLOWNIE[n] ?? String(n);

/** zawód do środka zdania: małą literą, skróty bez zmiany („GP”, „ESG consultant”) */
function zawod(prof: string): string {
  const en = zawodEn(prof);
  return /^[A-Z]{2}/.test(en) ? en : en[0].toLowerCase() + en.slice(1);
}

/** budynek z danych 0.3 (hqName, buildingName): nazwa siedziby zostaje, zastępcze polskie nazwy po angielsku */
function budynek(b: string): string {
  if (b === 'siedziby') return 'the board’s block';
  if (b === 'z sąsiedztwa') return 'a block nearby';
  // nazwa z mapy bez ulicy („Blok nr 12”) po angielsku, adres z ulicą zostaje
  return nazwaBudynkuEn(b);
}

/** ognisko na podwórku, a bez niego koza */
const ogien = (h: GovHost) => (h.campfire() ? 'the campfire' : 'the stove');

// ---------------------------------------------------------------- kronika

type Wzorzec = readonly [RegExp, (m: RegExpExecArray) => string];

/** tłumacz wpisów do kroniki: najpierw dokładne zdania, potem wzorce z imionami, liczbami i nazwami */
function wpisy(zdania: Readonly<Record<string, string>>, wzorce: readonly Wzorzec[] = []): EventEn['log'] {
  const exact = new Map(Object.entries(zdania));
  return (pl) => {
    const en = exact.get(pl);
    if (en !== undefined) return en;
    for (const [re, f] of wzorce) {
      const m = re.exec(pl);
      if (m) return f(m);
    }
    return null;
  };
}

/** gdzie spadł dron: z 0.3 za garażami, w domu bez garaży według sąsiadów (log w nakładce) */
const DRON_GDZIE: Readonly<Record<string, string>> = {
  'za garażami': 'behind the garages',
  'za płotem': 'on the other side of the fence',
  'w ogrodzie sąsiadów': 'in the neighbours’ garden',
};

// ---------------------------------------------------------------- wydarzenia

interface Offer {
  give: Cost;
  take: Cost;
}

const WYDARZENIA: Record<string, EventEn> = {
  handlarz: {
    title: () => 'A trader with a trolley',
    text: (h) =>
      `A bloke with a supermarket trolley is waiting at ${h.wordsEn().brama}. He’ll do one swap, then he’s off.`,
    labels: (_h, d) => [...(d.o as Offer[]).map((o) => `Get ${costEn(o.give)} for ${costEn(o.take)}`), 'No deal'],
    log: wpisy({}, [[/^Wymiana: (.+) za (.+)\.$/, (m) => `Trade: ${costPlEn(m[1])} for ${costPlEn(m[2])}.`]]),
  },

  dzieci: {
    title: () => 'Kids with scrap',
    text: (h) =>
      domyObok(h)
        ? 'Kids from the houses nearby have wheeled round a barrow of sheet metal and pipes from a shed they took apart. They want something to eat.'
        : 'Kids from the blocks next door have dragged over a trolley of sheet metal and pipes from the shopping pavilion they’ve been taking apart. They want something to eat.',
    labels: () => ['Scrap 6 for Food 1', 'Scrap 10 for Food 2', 'Not now'],
  },

  lodowka: {
    title: () => 'Fridge on subscription',
    text: (h) =>
      dom(h)
        ? 'The neighbours next door left in 2048, and their fridge is still full. Locked for good: the subscription died along with the manufacturer’s server.'
        : 'A flat on the third floor has a full fridge in it. Locked for good: the subscription ran out in 2048, and the manufacturer’s server went with it.',
    labels: () => ['Crack the lock (Electrics 2)', 'Smash it open with a crowbar'],
    log: wpisy({
      'Lodówka otwarta. W środku słoiki i coś, co kiedyś było serem.':
        'The fridge is open. Inside: jars, and something that used to be cheese.',
    }),
  },

  dron: {
    title: () => 'Delivery drone',
    text: (h) =>
      `For three years a drone has been circling over ${dom(h) ? 'the street' : 'the estate'} with an order nobody picked up. It charges in the sun and refuses to give up.`,
    labels: () => ['Shoot it down with a catapult', 'Leave it, let it fly'],
    log: wpisy(
      {
        'Dron zostaje maskotką osiedla.': 'The drone stays. It’s the estate’s mascot now.',
        'Dron zostaje maskotką ulicy.': 'The drone stays. It’s the street’s mascot now.',
      },
      [
        [
          /^Dron spadł (za garażami|za płotem|w ogrodzie sąsiadów)\. W paczce zestaw sushi z 2048 roku, nikt nie spróbował\.$/,
          (m) => `The drone came down ${DRON_GDZIE[m[1]]}. In the parcel: a sushi set from 2048. Nobody tried it.`,
        ],
      ],
    ),
  },

  automat: {
    title: () => 'The parcel locker opened itself',
    text: (h) =>
      dom(h)
        ? 'After three years, the parcel locker by the shop has opened every compartment at once. Half the street comes running.'
        : 'After three years, the parcel locker by the shopping pavilion has opened every compartment at once. A crowd is forming.',
    labels: (h) => [
      'Share it out equally',
      dom(h) ? 'Take it to the committee’s shed' : 'Take it to the co-op storeroom',
    ],
  },

  auto: {
    title: () => 'The car is waiting for an update',
    text: (h) =>
      `A self-driving car ${dom(h) ? 'on the neighbours’ drive' : 'in the car park'} has been waiting for an update since 2048. It flashes its lights whenever someone walks past.`,
    labels: () => ['Strip it for batteries and parts', 'Turn it into a hen house'],
  },

  czynsz: {
    // w domu nie ma czynszu, jest rata kredytu
    title: (h) => (dom(h) ? 'Mortgage instalment for 2047' : 'Unpaid service charge for 2047'),
    text: (h) =>
      dom(h)
        ? `Someone has brought a letter from the bank: an overdue mortgage instalment on the house from 2047, plus interest and a reminder fee. ${nikt(h) ? 'People' : 'The neighbours'} are asking whether the street committee will be collecting dues too.`
        : 'Someone has brought a letter from the old co-op: unpaid service charge for 2047, plus interest. People are asking whether the new board will be collecting too.',
    labels: (h) => [
      dom(h) ? 'Announce the committee collects no dues' : 'Write it off for everyone',
      h.campfire() ? 'Burn the letter on the campfire' : 'Burn the letter in the stove',
    ],
  },

  krypto: {
    title: () => 'Paid in tokens',
    text: (h) =>
      `${domyObok(h) ? 'The neighbour from over the fence' : 'A neighbour from the block next door'} wants to buy 5 wood off you. He’s paying in tokens, which he swears are about to bounce back.`,
    labels: () => ['Take the tokens', 'Laugh at him'],
    log: wpisy({ 'Tokeny dalej czekają na odbicie.': 'The tokens are still waiting to bounce back.' }),
  },

  ksiazki: {
    title: (h) => (dom(h) ? 'A box in the loft' : 'A box in the basement'),
    text: (h, d) => `A box of books has turned up in the ${dom(h) ? 'loft' : 'basement'}. On top: “${bookEn(d.name)}”.`,
    labels: (h) => [dom(h) ? 'On the shelf by the stove' : 'To the common room', 'For kindling'],
    log: wpisy({}, [
      [
        /^Nowa książka (w świetlicy|na półce przy kozie): „(.+)” \((.+) \+1\)\.$/,
        (m) =>
          `New book ${m[1] === 'w świetlicy' ? 'in the common room' : 'on the shelf by the stove'}: “${bookEn(m[2])}” (${dziedzinaEn(m[3])} +1).`,
      ],
    ]),
  },

  aktywisci: {
    title: () => 'Protest against the stoves',
    text: (h) =>
      dom(h)
        ? 'A handful of activists from the next street are protesting against the smoke from your chimney. They’re frozen to the bone themselves.'
        : 'A handful of activists from the next estate are protesting against the smoke from your stoves. They’re frozen to the bone themselves.',
    labels: () => ['Invite them in to warm up', 'Agree to plant trees together in the spring'],
    log: wpisy({
      'Aktywiści grzali się przy kozie do rana i poszli protestować gdzie indziej.':
        'The activists warmed up by the stove until morning, then went off to protest somewhere else.',
    }),
  },

  influencer: {
    title: () => 'The survival influencer',
    text: (h, d) => {
      const z = zaimki(d.p);
      return `${d.p.name} is filming a vlog at ${h.wordsEn().brama} with a battery-powered ring light. ${wielka(z.on)} says ${z.on} has two million followers. There’s been no internet for three years.`;
    },
    labels: (h, d) => {
      const z = zaimki(d.p);
      return [`Take ${z.go} into ${dom(h) ? 'the house' : 'the co-op'}`, `Let ${z.go} film somewhere else`];
    },
  },

  uchodzcy: {
    title: (h) => (dom(h) ? 'A family at the garden gate' : 'People at the gate'),
    text: (h, d) => {
      const free = h.free();
      const from = fromEn(d.from);
      const spec = d.spec ? ` Among them: ${d.spec.name}, ${zawod(d.spec.prof)}.` : '';
      if (dom(h))
        return `A family of ${slownie(d.n)} is standing at the garden gate. They’ve come ${from} and are asking to be let in. ${free ? `Free beds in the house: ${free}.` : 'There are no free beds in the house, so they would sleep on the kitchen floor.'}${spec}`;
      return `At the gate, ${ludzie(d.n)} ${d.n === 1 ? 'is' : 'are'} asking to be let in. They’ve come ${from}. Free beds in the block: ${free}.${spec}`;
    },
    // te same warunki co wybory w nakładce: wszyscy albo tylu, ilu się zmieści, jedzenie, wszyscy na podłogę, odprawa
    labels: (h, d) => {
      const free = h.free();
      const out: string[] = [];
      if (free >= d.n) out.push('Take everyone in');
      else if (free > 0) out.push(`Take in as many as fit (${free})`);
      out.push('Give them food for the road (Food 3)');
      if (free < d.n) out.push(`Take everyone in (${ludzie(d.n - free)} on the floor)`);
      out.push('Send them away');
      return out;
    },
    log: wpisy({}, [
      [
        /^Przyjęliście (\d+) (?:osobę|osoby|osób) (.+?)\.(?: (\d+) (?:osoba|osoby|osób) (?:będą|będzie) spać na podłodze\.)?$/,
        (m) =>
          `You took in ${ludzie(Number(m[1]))} ${fromEn(m[2])}.${m[3] ? ` ${m[3]} of them will sleep on the floor.` : ''}`,
      ],
    ]),
  },

  fachowiec: {
    title: () => 'Someone knows their stuff',
    text: (h, d) => {
      const p = d.p;
      const z = zaimki(p);
      const who = dom(h)
        ? `${p.name} ${h.neighbourEn() ?? 'from over the fence'}`
        : d.lok
          ? `${p.name} from your stairwell`
          : `${p.name} from ${budynek(d.b)}`;
      return `${who} let it slip by ${ogien(h)} that ${z.on} used to be ${zPrzedimkiem(zawod(p.prof))}. ${wielka(z.on)} kept quiet until now in case someone put ${z.go} to work.`;
    },
    labels: (_h, d) => {
      const z = zaimki(d.p);
      return [`Put ${z.go} to work`, `Let ${z.go} rest`];
    },
  },

  klotnia: {
    title: () => 'Row over the rota',
    text: (h, d) =>
      `${h.spec(d.a)?.name} and ${h.spec(d.b)?.name} have fallen out over the stove watch rota. ${dom(h) ? 'The rest of the house is listening through the wall.' : 'Half the stairwell has taken one side, half the other.'}`,
    labels: (h, d) => [
      dom(h) ? 'Mediate at the kitchen table' : 'Mediate in the common room',
      `${h.spec(d.a)?.first} is right`,
      `${h.spec(d.b)?.first} is right`,
    ],
    log: wpisy({}, [
      [
        /^(.+) (?:obraził się i wyprowadził|obraziła się i wyprowadziła) (do innego osiedla|na inną ulicę)\.$/,
        (m) => `${m[1]} took offence and moved to ${m[2] === 'na inną ulicę' ? 'another street' : 'another estate'}.`,
      ],
    ]),
  },

  pozar: {
    title: () => 'Stove fire',
    text: (h, d) =>
      dom(h)
        ? 'A badly placed stove has set the kitchen floor alight. Smoke is filling the whole house.'
        : `A flat in ${budynek(h.buildingName(d.b))} has caught fire from a badly placed stove. Smoke is pouring into the stairwell.`,
    labels: (h) => ['Everyone grab a bucket', dom(h) ? 'Run out into the garden' : 'Evacuate the stairwell'],
    log: wpisy(
      {
        'Pożar ugaszony. Spłonął zapas opału z piwnicy.':
          'The fire is out. The firewood stored in the basement burned.',
        'Pożar ugaszony. Spłonęło drewno ułożone przy kozie.': 'The fire is out. The wood stacked by the stove burned.',
        'Ogień zjadł meble przy kozie. Dym wszedł do każdego pokoju.':
          'The fire ate the furniture around the stove. Smoke got into every room.',
      },
      [
        [
          /^Klatka w budynku (.+) spłonęła\. Mniej miejsc do mieszkania\.$/,
          (m) => `The stairwell in ${budynek(m[1])} burned out. Fewer places to live.`,
        ],
      ],
    ),
  },

  kradziez: {
    title: () => 'Theft from the basement',
    // sprawca z klatki (d.lok): głodny mieszkaniec z imieniem, zamiast mieszkania na parterze
    text: (_h, d) =>
      d.lok
        ? `Overnight, someone made off with ${d.loss} food from the basement of ${budynek(d.b)}. The footprints lead to your stairwell, and everyone knows who has been eating too little for days: ${d.p.name}.`
        : `Overnight, someone made off with ${d.loss} food from the basement of ${budynek(d.b)}. The footprints lead to a ground-floor flat.`,
    labels: (h, d) => [
      ...(h.law('u_sad') ? ['Residents’ court'] : []),
      'Throw the culprit off the estate',
      ...(d.lok ? [`Feed ${zaimki(d.p).go} from the pot`] : []),
      'Turn a blind eye',
    ],
    log: wpisy(
      {
        'Sąd koleżeński: sprawca odpracuje szkodę przy kuchni.':
          'Residents’ court: the culprit will work off the damage in the kitchen.',
      },
      [
        [
          /^(.+) (?:zjadł|zjadła) miskę z kotła, pierwszy raz od kilku dni do syta\.$/,
          (m) => `${m[1]} had a bowl from the pot, the first proper meal in days.`,
        ],
      ],
    ),
  },

  // w M1 nie przychodzi (waga 0 w nakładce), ale stary zapis może mieć to okno otwarte
  wesele: {
    title: () => 'A wedding in the stairwell',
    text: (h, d) =>
      `${h.spec(d.a)?.name} and ${h.spec(d.b)?.name} want to get married in the common room. It would be the first wedding since the fall.`,
    labels: () => ['Throw a wedding (Food 6)', 'Keep it small, no party'],
    log: wpisy({
      'Wesele do rana. Ktoś grał na akordeonie.': 'The wedding went on until morning. Someone played the accordion.',
    }),
  },

  odejscie: {
    title: () => 'Someone wants to leave',
    text: (h, d) => {
      const p = h.spec(d.p);
      const where = dom(h) && p ? 'the next street' : 'the estate across the tracks';
      return `${p?.name} says life is better on ${where}, and wants to move there.`;
    },
    labels: (h, d) => {
      const z = zaimki(h.spec(d.p));
      return [`Talk ${z.go} round (Food 4)`, `Let ${z.go} go`];
    },
    log: wpisy({}, [
      [
        /^(.+) (?:odszedł|odeszła) (z osiedla|z ulicy)\.$/,
        (m) => `${m[1]} has left the ${m[2] === 'z ulicy' ? 'street' : 'estate'}.`,
      ],
    ]),
  },

  obserwacja: {
    title: () => 'Someone is watching you',
    text: (h) => {
      const t = h.place().tower;
      const from = t
        ? TOWER_EN[t]
        : dom(h)
          ? 'From the bushes at the end of the street'
          : 'From the roof of the shopping centre';
      return `${from}, someone is watching ${dom(h) ? 'your house' : 'your block'} through binoculars. They’ve been at it since morning.`;
    },
    labels: () => ['Double the watch tonight', 'Pretend nothing’s going on'],
  },
};

/** po id wydarzenia z OLD_EVENTS; napisy wyborów tylko wtedy, gdy jest ich tyle, ile wyborów w grze */
export const EVENTS_EN: Record<string, EventEn> = Object.fromEntries(
  Object.entries(WYDARZENIA).map(([id, e]): [string, EventEn] => [
    id,
    {
      ...e,
      labels: (h, d, pl) => {
        const en = e.labels(h, d, pl);
        return en.length === pl.length ? en : [...pl];
      },
    },
  ]),
);
