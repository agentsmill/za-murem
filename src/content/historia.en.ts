/* Historie osób z własnej drużyny zarządu po angielsku (docs/superpowers/specs/2026-10-18-angielski-design.md, sekcja
   „Treść generowana”). Kawałki odpowiadają polskim z src/content/historia.ts jeden do jednego: te same zawody,
   pokolenia (w tej samej kolejności kluczy), cechy, ta sama długość i kolejność każdej listy. Zdania nie tłumaczą
   polskich słowo w słowo: mają ten sam fach, tę samą cechę i ten sam żart, napisany tak, żeby działał po angielsku
   (brytyjski angielski, słowa ze słowniczka docs/SLOWNICZEK-EN.md).

   Kontrakt: losujHistorieEn robi dokładnie te same losowania co losujHistorie (wybierzZdania odtwarza je po kolei
   i zapamiętuje numery zdań), więc to samo ziarno daje tę samą historię w obu językach. Ma też tyle samo zdań co polska:
   polska historia dłuższa niż HISTORIA_MAX traci ostatnie zdanie, angielska traci to samo; gdyby angielska i tak była
   za długa, traci kolejne zdania od końca jak polska. Zapis kawałków jak po polsku: `{g:męska|żeńska}` to forma
   według płci osoby, tu zaimki (he/she, him/her, his/her, himself/herself). Zdania nie mają imienia ani zaimków
   o kimś trzecim z płcią (prezydent, lekarka), żeby zaimki zawsze mówiły o tej osobie. */

import type { Lang } from '../core/jezyk.ts';
import type { Rng } from '../core/rng.ts';
import {
  type DoHistorii,
  HISTORIA_MAX,
  type Pokolenie,
  pokolenie,
  SATYRA,
  wypelnijPlec,
  Z_CECHY,
  zdaniaFachu,
} from './historia.ts';

/** Skąd osoba ma fach, jak FACH: te same zawody, pokolenia i liczba zdań. */
export const FACH_EN: Readonly<Record<string, Partial<Record<Pokolenie, readonly string[]>>>> = {
  'Emerytowany inżynier': {
    starsi: [
      '{g:He|She} designed boiler rooms before AI assistants existed and still does the sums on paper, so the whole estate brings {g:him|her} sketches on the back of a calendar.',
      'The co-op pays {g:his|her} pension in pearl barley, so {g:he|she} carries on working: nobody else on the estate can work out a floor slab without software.',
      'On the day of the Great Logout {g:he|she} was the only person in the office who knew where the slide rule was, and {g:he|she} has carried it around ever since.',
    ],
  },
  Hydraulik: {
    mlodzi: [
      '{g:He|She} learnt the trade from the old plumber in the next stairwell, who liked to say that a potbelly stove is just a radiator without the app.',
    ],
    srodek: [
      'At college {g:he|she} trained in a virtual reality headset and never held a real pipe wrench until the first rising main froze.',
    ],
    starsi: [
      '{g:He|She} was fitting pipes back in the old days, so nobody on the estate dares to rush {g:him|her}, not even when the rising main has been leaking for three days.',
    ],
  },
  Elektryk: {
    mlodzi: [
      '{g:He|She} took over from the estate’s old electrician, who left {g:him|her} a tin of varnish, a roll of tape and a notebook with the wiring of every stairwell drawn in it.',
    ],
    srodek: [
      'Before the fall {g:he|she} fitted smart sockets; now {g:he|she} patches short lengths of cable the bacterium keeps eating and carries varnish and tape like a rosary.',
    ],
    starsi: [
      'In year zero {g:he|she} fixed three short circuits a day and blamed every one of them on scrap thieves, which {g:he|she} is still ashamed of.',
    ],
  },
  'Lekarz rodzinny': {
    mlodzi: [
      '{g:He|She} qualified at a medical school that had moved into a basement, from textbooks missing half their pages, and treats people with whatever happens to be to hand.',
    ],
    srodek: [
      'At medical school {g:his|her} assistant diagnosed faster than the professor; since the Great Logout {g:he|she} has done it alone, by candlelight, with a textbook on {g:his|her} lap.',
    ],
    starsi: [
      '{g:He|She} has been a GP for thirty years and still tells patients “the prescription will be on the app”, and nobody on the estate laughs any more.',
    ],
  },
  Pielęgniarz: {
    mlodzi: [
      '{g:He|She} learnt nursing on shifts in a school turned hospital, where the entire kit was one thermometer and a calm voice.',
    ],
    srodek: [
      '{g:He|She} does the same job as before the fall, just without the machines, so {g:he|she} counts pulses on a watch that needs winding.',
    ],
    starsi: [
      '{g:He|She} worked thirty years of night shifts and insists that the end of civilisation is simply a very long night shift.',
    ],
  },
  'Ratownik medyczny': {
    mlodzi: [
      '{g:He|She} trained when the ambulances were already locked behind a subscription, so {g:he|she} runs to the sick and makes stretchers out of wardrobe doors.',
    ],
    srodek: [
      '{g:He|She} drove an ambulance for as long as the ambulance agreed to drive, and since it stopped {g:he|she} has been running round the estate with a bag.',
    ],
  },
  Ogrodnik: {
    mlodzi: [
      '{g:He|She} learnt gardening on the lawn outside the block, which {g:he|she} dug up before anyone had said {g:he|she} could.',
    ],
    srodek: [
      '{g:He|She} started out with an app that recognised weeds from a photo and ended up recognising them by taste.',
    ],
    starsi: [
      'For thirty years {g:he|she} mowed the lawns outside office blocks, and now {g:he|she} grows potatoes on them and nobody rings up to complain.',
    ],
  },
  Działkowiec: {
    srodek: [
      '{g:He|She} inherited the allotment from {g:his|her} grandad and was embarrassed by it for years, until allotments turned out to be the only part of town that still worked.',
    ],
    starsi: [
      'For half {g:his|her} life {g:he|she} was told allotments were a thing of the past, and now the whole co-op comes to {g:him|her} for seedlings and advice.',
    ],
  },
  'Nauczyciel fizyki': {
    mlodzi: [
      '{g:He|She} learnt physics from a textbook found in the school basement and now teaches the children in the stairwell how a dynamo works.',
    ],
    srodek: [
      'At school {g:he|she} did physics homework with the assistant on {g:his|her} phone; since the Great Logout {g:he|she} has been that assistant, only in the stairwell and paid in barley.',
    ],
    starsi: [
      'For thirty years nobody listened to {g:his|her} lessons on the dynamo, and now the whole estate turns up for them and brings its own chairs.',
    ],
  },
  Programista: {
    mlodzi: [
      'People call {g:him|her} a programmer because {g:he|she} writes out on paper how to get the boiler room controller running, and now and then it even works.',
    ],
    srodek: [
      'From {g:his|her} first job {g:he|she} wrote code together with a model in the cloud, and after the Great Logout {g:he|she} spent a week not knowing where to start.',
    ],
  },
  'Prompt engineer': {
    mlodzi: [
      'On the estate {g:he|she} is known as a fridge whisperer: {g:he|she} spends hours sweet-talking a dead subscription fridge, and every so often it opens.',
      '{g:He|She} was a child during the Great Logout and remembers only adults crying over phones, so {g:he|she} is as polite to the bank’s surviving model as to the co-op chair.',
    ],
    srodek: [
      'As a child {g:he|she} wrote prompts faster than essays and still starts every request with “act as”.',
      '{g:He|She} wrote prompts for money from {g:his|her} teens until 2034, when the model said “Sorry, something went wrong, please try again later”, and {g:he|she} is still waiting for later.',
    ],
  },
  'Mechanik samochodowy': {
    mlodzi: [
      '{g:He|She} knows cars from the wrecks {g:he|she} played in as a child, so {g:he|she} fixes whatever still rolls: bikes, prams and wheelbarrows.',
    ],
    srodek: [
      '{g:He|She} trained as a mechanic when cars updated themselves overnight, and now repairs bikes and generators, because the cars are stuck behind a subscription.',
    ],
    starsi: [
      '{g:He|She} fixed cars for as long as you could get into one without an app, and now builds generators out of parts {g:he|she} used to call scrap.',
    ],
  },
  Kucharz: {
    mlodzi: [
      '{g:He|She} learnt to cook over a campfire with whatever was going and still doesn’t see why anyone ever needed a cooker with a screen.',
    ],
    srodek: [
      'In the old days {g:he|she} cooked from videos where everything took thirty seconds, and now {g:he|she} cooks from nothing, over a fire, in no rush at all.',
    ],
    starsi: [
      'For twenty years {g:he|she} ran a restaurant kitchen rated on an app, and now {g:he|she} cooks on the stove and says the critics here are tougher.',
    ],
  },
  'Ochroniarz z galerii': {
    mlodzi: [
      '{g:He|She} guards a shopping centre that has never had a shop in {g:his|her} lifetime, only a market and a scrapyard, and takes the job very seriously.',
    ],
    srodek: [
      '{g:He|She} started out minding the security gates at the shopping centre exit and ended up making sure nobody walked off with the rest of the shopping centre.',
    ],
    starsi: [
      '{g:He|She} stood by the security gates at the shopping centre for twenty years and can still tell at a glance who has something under their coat.',
    ],
  },
  Kurier: {
    mlodzi: [
      '{g:He|She} runs letters between estates, because there is no signal, and the parcel lockers stand full and shut like safes.',
    ],
    srodek: [
      '{g:He|She} delivered parcels for an app that timed {g:him|her} to the second on every floor, and now runs letters and nobody rates {g:him|her} out of five stars.',
    ],
  },
  'Doradca ds. ESG': {
    mlodzi: [
      '{g:He|She} inherited a ring binder marked ESG from an aunt and has been calculating the carbon footprint of every bonfire on the estate ever since.',
    ],
    srodek: [
      'Before the fall {g:he|she} wrote net zero reports, and now {g:he|she} keeps the fuel register and hands in a quarterly report that nobody reads.',
    ],
  },
  'Influencer survivalowy': {
    mlodzi: [
      'By the campfire {g:he|she} talks survival as if filming an episode and always signs off with “like and subscribe”, though nobody remembers what that means.',
      '{g:He|She} has a channel nobody watches, because there is nothing to watch it on, so {g:he|she} performs the episodes live by the campfire, ad breaks included.',
    ],
  },
  'Student biotechnologii': {
    mlodzi: [
      '{g:He|She} studies in the doctor’s basement lab and grows cultures from cable swabs to find out where on the estate the bacterium lives.',
      '{g:He|She} grows the copper bacterium in dishes of fruit jelly and is the only person on the estate who talks about it fondly.',
    ],
  },
  'Monter klimatyzacji': {
    mlodzi: [
      '{g:He|She} has only ever seen heat pumps as scrap with an expired subscription, so {g:he|she} builds stoves and chimneys and promises a hand-cranked fan for the summer.',
    ],
    srodek: [
      '{g:He|She} started out on heat pumps by subscription, and since the subscriptions lapsed {g:he|she} has been putting in stoves and running flues out of windows.',
    ],
    starsi: [
      'For thirty years {g:he|she} fitted air conditioners controlled from a phone, and now {g:he|she} puts in stoves and says it is the same trade, only more honest.',
    ],
  },
  'Informatyk z urzędu': {
    mlodzi: [
      'The council went back to paper but kept the IT post, so {g:he|she} minds a cupboard of old forms and restarts anything that still lights up.',
    ],
    srodek: [
      'For years {g:he|she} told council staff to turn it off and on again, and after the Great Logout it turned out to work on people too.',
    ],
    starsi: [
      '{g:He|She} spent thirty years rebooting council computers and now knows where the old forms are kept and how to restart whatever is left.',
    ],
  },
  Murarz: {
    mlodzi: [
      '{g:He|She} learnt bricklaying on demolition jobs and still scrapes the old mortar off every salvaged brick before using it.',
    ],
    srodek: [
      'When {g:he|she} started out, walls were 3D printed in concrete, and {g:he|she} only picked up a brick once the printers stopped.',
    ],
    starsi: [
      '{g:He|She} lays bricks the way {g:he|she} did thirty years ago, except the bricks now come from demolition and the mortar gets mixed in an old bath.',
    ],
  },
  Weterynarz: {
    mlodzi: [
      '{g:He|She} treats goats, hens and dogs, and people too when the doctor is out, and talks to all of them in the same calm voice.',
    ],
    srodek: [
      '{g:He|She} qualified when the biggest problem at the surgery was cats on grain-free diets, and now treats goats, hens and people.',
    ],
    starsi: [
      'For thirty years {g:he|she} vaccinated every dog on the estate, and now {g:he|she} vaccinates whatever {g:he|she} can and stitches up people too when it comes to that.',
    ],
  },
};

/** Jedna rzecz z cechy, jak Z_CECHY: te same klucze i liczba zdań. */
export const Z_CECHY_EN: Readonly<Record<string, readonly string[]>> = {
  pracowity: [
    'Up before everyone else, {g:he|she} is always the first to notice that nobody fed the stove overnight.',
    '{g:He|She} can’t sit still without a job to do, so on days off {g:he|she} sorts nails by size.',
  ],
  leniwy: [
    '{g:He|She} has a gift for vanishing when wood needs carrying, but always knows where the last packet of coffee is.',
    '{g:He|She} says {g:he|she} is saving {g:his|her} strength for the winter and has been doing so with great dedication since July.',
  ],
  lubiany: [
    '{g:He|She} knows everyone on the estate by name, cats included, and nobody can stay cross with {g:him|her} for long.',
    'At meetings people shuffle along the bench so that {g:he|she} will sit next to them.',
  ],
  klotliwy: [
    '{g:He|She} registers a dissenting opinion at every meeting, even on motions {g:he|she} tabled {g:himself|herself}.',
    '{g:He|She} has already fallen out with half the estate and just hasn’t got round to the other half yet.',
  ],
  odwazny: [
    '{g:He|She} is always the first down into a dark basement and the last one out.',
    'When something bangs about behind the garages, {g:he|she} doesn’t ask what it is, just picks up a torch.',
  ],
  tchorz: [
    '{g:He|She} fears the dark, basements and pigeons, but nobody is quicker to hear someone fiddling with the gate.',
    '{g:He|She} goes on supply runs reluctantly, always in the middle of the group, where it’s supposedly least draughty.',
  ],
  optymista: [
    '{g:He|She} announces every winter as the last hard one and says so every year with exactly the same conviction.',
    '{g:He|She} reckons that if the bacterium has eaten the cables, at least nobody cold-calls any more.',
  ],
  hipochondryk: [
    '{g:He|She} hears something sinister in every cough and knows every leaflet in the co-op’s first aid kit by heart.',
    'Every day {g:he|she} takes {g:his|her} temperature with the estate’s only thermometer and writes it down in a notebook.',
  ],
  gadula: [
    '{g:He|She} talks the longest at meetings, usually about something that isn’t on the agenda.',
    'Every story {g:he|she} tells starts in year zero, even the one about a lost glove.',
  ],
  excel: [
    'The co-op’s stores live in {g:his|her} squared exercise book, in tables so neat the board signs them unread.',
    '{g:He|She} adds up whole columns in {g:his|her} head and misses only one thing: colour-coding the cells.',
  ],
  twardy: [
    'All winter {g:he|she} goes about in just a jumper, and nobody can remember the last time {g:he|she} was ill.',
    'Once {g:he|she} fell off a garage roof, dusted {g:himself|herself} off and went back to finish the job.',
  ],
};

/** Szczegół satyryczny, jak SATYRA: ta sama liczba zdań w tej samej kolejności. */
export const SATYRA_EN: readonly string[] = [
  'In a drawer {g:he|she} keeps a phone that has been waiting years for an update, and checks once a week whether it’s arrived.',
  '{g:He|She} has a carbon neutral certificate in a frame and in winter hangs it as close to the stove as it will go.',
  '{g:He|She} collects chargers for everything, certain that the power will come back and then everyone will come to {g:him|her}.',
  'The intercom in {g:his|her} stairwell still asks visitors to log in, so everyone climbs in through the basement window.',
  '{g:He|She} remembers the home Wi-Fi password better than the neighbours’ names and sometimes recites it in {g:his|her} sleep.',
  'On {g:his|her} balcony there is a grant-funded solar panel that survived because nobody ever connected it.',
  '{g:He|She} wears a step counter that has shown zero for years and says it is very motivating.',
  '{g:He|She} keeps {g:his|her} carbon credits in an old tea caddy and believes they will be worth something again one day.',
  '{g:He|She} keeps an electric scooter in the basement and apologises to it once a year.',
  '{g:He|She} has a robot hoover that has stood in the corner for years and now serves as a podium for the cat.',
  '{g:His|Her} car outside the block is waiting for an update, and so is {g:he|she}, because {g:his|her} wellies are in the boot.',
  'Under the bed {g:he|she} keeps a box of cables for devices long gone and guards it like a safe, because there’s copper inside.',
  '{g:He|She} starts every day by checking whether the phone has found a signal, and ends every day the same way.',
  '{g:He|She} is sure the President of the United States will fix everything in the tenth term; there just hasn’t been time yet.',
  'In {g:his|her} wardrobe hangs a hoodie from the green recycling startup, which {g:he|she} wears inside out so nobody sees the logo.',
  '{g:His|Her} TV is so flat that in winter it doubles as a chopping board.',
  'An app-controlled coffee machine has pride of place in {g:his|her} flat, and {g:he|she} brews nettle tea beside it through a strainer.',
  '{g:He|She} carries a bank card in {g:his|her} wallet and sometimes taps it on a door, for luck.',
  'On {g:his|her} fridge is the assistant’s last reply before the Great Logout, “Please try again later”, and now and then {g:he|she} does.',
];

/** Zdania o fachu po angielsku, wybrane jak zdaniaFachu: pokolenie osoby, a bez zdań dla niego wszystkie po kolei. */
export function zdaniaFachuEn(prof: string, age: number): readonly string[] {
  const t = FACH_EN[prof] ?? {};
  const own = t[pokolenie(age)];
  if (own?.length) return own;
  return Object.values(t).flatMap((x) => x ?? []);
}

/** Zdanie historii jako miejsce na liście (te same listy w obu językach mają te same miejsca). */
export type Zdanie =
  | { co: 'fach'; i: number }
  | { co: 'cecha'; cecha: string; i: number }
  | { co: 'satyra'; i: number };

/** numer na liście tak, jak liczy go pick z src/core/rng.ts */
const nr = (n: number, rnd: Rng): number => Math.floor(rnd() * n);

/** Losowania losujHistorie po kolei, z numerami zdań zamiast tekstu: fach, cecha (która i które zdanie), satyra,
    a przy dwóch zdaniach do wyboru jeszcze jedno losowanie (odpada cecha albo satyra, przy trzech kolejność). */
export function wybierzZdania(rnd: Rng, o: DoHistorii): Zdanie[] {
  const out: Zdanie[] = [];
  const fach = zdaniaFachu(o.prof, o.age);
  if (fach.length) out.push({ co: 'fach', i: nr(fach.length, rnd) });
  const traits = o.traits.filter((t) => Z_CECHY[t]?.length);
  let trait: Zdanie | null = null;
  if (traits.length) {
    const cecha = traits[nr(traits.length, rnd)];
    trait = { co: 'cecha', cecha, i: nr(Z_CECHY[cecha].length, rnd) };
  }
  const satire: Zdanie = { co: 'satyra', i: nr(SATYRA.length, rnd) };
  const rest = trait ? [trait, satire] : [satire];
  if (rest.length === 2) {
    const r = rnd();
    if (r < 0.5) rest.splice(r < 0.25 ? 0 : 1, 1);
    else if (r >= 0.75) rest.reverse();
  }
  out.push(...rest);
  return out;
}

/** tekst zdania w języku, z formami według płci */
function tekstZdania(z: Zdanie, o: DoHistorii, lang: Lang): string {
  const en = lang === 'en';
  const s =
    z.co === 'fach'
      ? (en ? zdaniaFachuEn(o.prof, o.age) : zdaniaFachu(o.prof, o.age))[z.i]
      : z.co === 'cecha'
        ? (en ? Z_CECHY_EN : Z_CECHY)[z.cecha]?.[z.i]
        : (en ? SATYRA_EN : SATYRA)[z.i];
  return wypelnijPlec(s ?? '', o.f);
}

/** zdania sklejone, a za długie (ponad HISTORIA_MAX) bez zdań od końca, póki są więcej niż dwa; jak losujHistorie */
function przytnij(zdania: readonly string[]): { tekst: string; ile: number } {
  let ile = zdania.length;
  let tekst = zdania.join(' ');
  while (tekst.length > HISTORIA_MAX && ile > 2) {
    ile--;
    tekst = zdania.slice(0, ile).join(' ');
  }
  return { tekst: tekst.slice(0, HISTORIA_MAX), ile };
}

/** Historia z wybranych zdań w danym języku. Po polsku to dokładnie losujHistorie; po angielsku te same zdania, tyle
    samo, ile zostało po polsku (i najwyżej HISTORIA_MAX znaków). */
export function zlozHistorie(zdania: readonly Zdanie[], o: DoHistorii, lang: Lang): string {
  const pl = przytnij(zdania.map((z) => tekstZdania(z, o, 'pl')));
  if (lang === 'pl') return pl.tekst;
  return przytnij(zdania.slice(0, pl.ile).map((z) => tekstZdania(z, o, 'en'))).tekst;
}

/** Historia osoby po angielsku: te same losowania i te same zdania co losujHistorie, więc ten sam generator (to samo
    ziarno) i te same dane dają tę samą historię co po polsku. */
export const losujHistorieEn = (rnd: Rng, o: DoHistorii): string => zlozHistorie(wybierzZdania(rnd, o), o, 'en');
