/* Angielska treść do tablic z 0.3 (src/content/data.ts zostaje bajt w bajt, pilnuje go test zgodności): dziedziny,
   zapasy, pory roku, cechy, zawody, wstęp z lore w obu trybach i przyczyny zgonów. Słowa ze słowniczka
   docs/SLOWNICZEK-EN.md. Zawody i cechy w stanie gry to polskie napisy i klucze; interfejs tłumaczy je przy rysowaniu
   (`zawodEn`, `TRAITS_EN`), a zarząd składa z nich angielską stronę swoich zdań. */

import { mieszkancyEn } from '../mieszkancy/fachy.en.ts';
import type { BuildingClass, Dom, EndingId, LawPath, Res } from './data.ts';
import { PROFS } from './data.ts';

export const DOM_EN: Record<Dom, string> = {
  bud: 'Building',
  cieplo: 'Heating',
  elek: 'Electrics',
  med: 'Medicine',
  uprawa: 'Farming',
  it: 'IT',
  obrona: 'Defence',
};

export const RL_EN: Record<Res, string> = {
  opal: 'Fuel',
  jedzenie: 'Food',
  zlom: 'Scrap',
  czesci: 'Parts',
  leki: 'Meds',
  prad: 'Power',
};

/** jak SEASONS: jesień, zima, wiosna, lato */
export const SEASONS_EN: readonly string[] = ['autumn', 'winter', 'spring', 'summer'];

export const CLS_EN: Record<BuildingClass, string> = {
  blok: 'Block',
  dom: 'House',
  sklep: 'Pavilion',
  szkola: 'School',
  przychodnia: 'Clinic',
  garaz: 'Garages',
  hala: 'Warehouse',
  kosciol: 'Church',
  inne: 'Building',
};

/** cechy po kluczu z TRAITS; po angielsku jedna forma dla obu płci */
export const TRAITS_EN: Record<string, { name: string; desc: string }> = {
  pracowity: { name: 'Hard-working', desc: 'As a supervisor: work +10%.' },
  leniwy: { name: 'Lazy', desc: 'As a supervisor: work −10%, but always knows where the coffee is.' },
  lubiany: { name: 'Well-liked', desc: 'Trust +0.3 a day.' },
  klotliwy: { name: 'Quarrelsome', desc: 'Anger +0.3 a day.' },
  odwazny: { name: 'Brave', desc: 'Crews with them get hurt less often.' },
  tchorz: { name: 'Cowardly', desc: 'Crews with them get hurt more often.' },
  optymista: { name: 'Optimist', desc: 'Anger −0.2 a day.' },
  hipochondryk: { name: 'Hypochondriac', desc: 'Goes through 0.1 Meds a day, even when healthy.' },
  gadula: { name: 'Chatterbox', desc: 'Talks the longest at meetings. That’s it.' },
  excel: { name: 'Excel wizard', desc: 'As common room supervisor: research +5%. Beautiful spreadsheets.' },
  twardy: { name: 'Tough', desc: 'Falls ill less often and is less likely to die on a run.' },
};

/** zawody z PROFS po męskiej nazwie; po angielsku jedna forma dla obu płci */
export const PROFS_EN: Record<string, string> = {
  'Emerytowany inżynier': 'Retired engineer',
  Hydraulik: 'Plumber',
  Elektryk: 'Electrician',
  'Lekarz rodzinny': 'GP',
  Pielęgniarz: 'Nurse',
  'Ratownik medyczny': 'Paramedic',
  Ogrodnik: 'Gardener',
  Działkowiec: 'Allotment holder',
  'Nauczyciel fizyki': 'Physics teacher',
  Programista: 'Programmer',
  'Prompt engineer': 'Prompt engineer',
  'Mechanik samochodowy': 'Car mechanic',
  Kucharz: 'Cook',
  'Ochroniarz z galerii': 'Shopping centre security',
  Kurier: 'Courier',
  'Doradca ds. ESG': 'ESG consultant',
  'Influencer survivalowy': 'Survival influencer',
  'Student biotechnologii': 'Biotech student',
  'Monter klimatyzacji': 'Air-con fitter',
  'Informatyk z urzędu': 'Council IT support',
  Murarz: 'Bricklayer',
  Weterynarz: 'Vet',
};

/** męska nazwa zawodu z PROFS po męskiej albo żeńskiej, zapisanej małymi literami (wydarzenia z 0.3 piszą
    `prof.toLowerCase()`) */
const MESKA = new Map<string, string>(
  PROFS.flatMap((p) => [[p[0].toLowerCase(), p[0]] as const, [p[1].toLowerCase(), p[0]] as const]),
);

/** Zawód ze stanu gry po angielsku: z PROFS (obie formy, w dowolnej wielkości liter, jak w tekstach wydarzeń), potem
    zawody mieszkańców z adresu; nieznany zostaje bez zmian. Wielkość pierwszej litery jak w podanym napisie. */
export function zawodEn(prof: string): string {
  const male = MESKA.get(prof.toLowerCase());
  const en = male ? PROFS_EN[male] : mieszkancyEn(prof);
  if (!en) return prof;
  const lower = prof[0] === prof[0]?.toLowerCase();
  // skrót na początku („GP”, „ESG consultant”) zostaje wielkimi literami także w środku zdania
  if (lower && /^[A-Z]{2,}\b/.test(en)) return en;
  return lower ? en[0].toLowerCase() + en.slice(1) : en[0].toUpperCase() + en.slice(1);
}

/** drogi uchwał jak PATHS */
export const PATHS_EN: Record<LawPath, string> = {
  base: 'Survival',
  porzadek: 'Order',
  wspolnota: 'Community',
  tech: 'Technocracy',
};

/** zakończenia gry jak ENDINGS (w bloku; przy domu jednorodzinnym zarząd ma własne, src/gov/tresc.en.ts) */
export const ENDINGS_EN: Record<EndingId, { title: string; text: string }> = {
  twierdza: {
    title: 'Fortress',
    text: 'The estate has become a fortress. The gates shut at eight, the guards know everyone by name and keep an eye on all of them. Nobody goes hungry, and nobody asks any more when the next general meeting is. Beyond the wall they speak of you with respect. Inside, people speak more and more quietly.',
  },
  wspolnota: {
    title: 'Community',
    text: 'Every block has its own council, its own meetings and its own row over the rota. It is loud, slow and inefficient, but people stay, because it is their place. Other settlements send delegations to see how it works.',
  },
  technokracja: {
    title: 'Technocracy',
    text: 'The AI model salvaged from the bank’s servers is now chair of the co-op. Rations are fair to the gram, rotas are optimal, and meetings last four minutes. Nobody knows who actually controls it. For now, everyone is fed.',
  },
  odwolanie: {
    title: 'The general meeting recalled the board',
    text: 'The anger spilled out into the stairwells. An extraordinary general meeting gathered in the common room and voted you out by acclamation. The new board started by changing the locks.',
  },
  exodus: {
    title: 'The estate emptied out',
    text: 'People stopped believing you would get them through. Family by family, they left for other estates. All that’s left is empty stairwells and service charge bills from 2047.',
  },
  pustka: {
    title: 'Nobody survived',
    text: 'The last resident let the stove go out. The estate stands empty, and the delivery drone is still circling over the roof.',
  },
};

/** przyczyna zgonu ze stanu symulacji (Dead.cause) do zdań: „of wounds” (bez płci, której wpis zgonu nie ma) */
const PRZYCZYNY_EN: Record<string, string> = {
  rany: 'of wounds',
  gorączka: 'of fever after being bitten',
  amputacja: 'during an amputation',
};
export const przyczynaEn = (cause: string): string => PRZYCZYNY_EN[cause] ?? cause;

/* Wstępy jak LORE i LORE_ZOMBIE w data.ts (lore bez zmian: rok 2051, bakteria od miedzi z 2026 roku, prezydent bez
   imienia). */
export const LORE_EN: string =
  'It is 2051. It all started a quarter of a century ago, in 2026, when a green startup asked its AI model for a bacterium that could recover copper from e-waste. The model exceeded expectations. The strain escaped the lab and started eating cables in walls, underground and up on the poles. For three years everyone blamed the outages on scrap thieves, and by the time someone joined the dots, the bacterium was already touring the world in containers full of e-waste. After that, things fell apart slowly: the President of the United States began his tenth term, the dollar moved to a subscription plan, the cloud went down, and the fridges, cars and door intercoms are still waiting for an update. The EU banned wood burners the day before the power went out. Influencers pivoted to survival, ESG consultants to porridge. Only what was sealed airtight survived. That, and one institution: the housing cooperative. You are the board now.';

export const LORE_ZOMBIE_EN: string =
  'It is 2051. Nobody remembers any more how it started. The AI model in the bank’s server room has three hypotheses and presents each one with total confidence. Only one thing is certain: we all carry it. Whoever dies gets back up, and whoever gets bitten dies of fever within a day. Shamblers are slow and stupid, but they follow noise and gather in herds. The President of the United States, now in his tenth term, has announced that the situation is under control. Only what was fenced in survived. That, and one institution: the housing cooperative. You have shored up the fence around the yard with planks, and there is a spear and an old revolver in the basement. You are the board now.';

/** ogłoszenia ze słupa jak ADS w data.ts, po tych samych numerach (wieść od wędrowca w src/sim/wedrowcy.ts) */
export const ADS_EN: readonly string[] = [
  'Will swap an electric scooter for a jar of pickles.',
  'Buying AA batteries. Paying in buckwheat or carbon credits.',
  'Free to a good home: smart doorbell. Still asks for the Wi-Fi password.',
  'Axe-handling lessons. Formerly a mindfulness coach.',
  'For sale: NFT of a cat, or will swap for an armful of wood.',
  'Looking for a charger for a car that hasn’t moved since 2048.',
  'Will swap a Python textbook for a roll of toilet paper.',
  'A delivery drone has been circling the block for three years. Finders keepers.',
  'Guitar lessons by the campfire. Repertoire: whatever we can remember.',
  'Missing: ginger cat. Answers to Algorithm.',
  'Subscription fridge, locked, full. Password welcome.',
  'Former ESG consultant seeks work. Can calculate the carbon footprint of a campfire.',
  'Will take any number of jars. Returnable.',
  'For sale: subscription heat pump. Subscription expired.',
];
