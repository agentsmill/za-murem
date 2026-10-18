/* Angielska treść do tablic z 0.3 (src/content/data.ts zostaje bajt w bajt, pilnuje go test zgodności): dziedziny,
   zapasy, pory roku, cechy, zawody, wstęp z lore w obu trybach i przyczyny zgonów. Słowa ze słowniczka
   docs/SLOWNICZEK-EN.md. Zawody i cechy w stanie gry to polskie napisy i klucze; interfejs tłumaczy je przy rysowaniu
   (`zawodEn`, `TRAITS_EN`), a zarząd składa z nich angielską stronę swoich zdań. */

import { mieszkancyEn } from '../mieszkancy/fachy.en.ts';
import type { BuildingClass, Dom, Res } from './data.ts';
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
  hala: 'Hall',
  kosciol: 'Church',
  inne: 'Building',
};

/** cechy po kluczu z TRAITS; po angielsku jedna forma dla obu płci */
export const TRAITS_EN: Record<string, { name: string; desc: string }> = {
  pracowity: { name: 'Hard-working', desc: 'As a supervisor: +10% to work.' },
  leniwy: { name: 'Lazy', desc: 'As a supervisor: −10%, but always knows where the coffee is.' },
  lubiany: { name: 'Well-liked', desc: 'Trust +0.3 a day.' },
  klotliwy: { name: 'Quarrelsome', desc: 'Anger +0.3 a day.' },
  odwazny: { name: 'Brave', desc: 'Crews with them get hurt less often.' },
  tchorz: { name: 'Cowardly', desc: 'Crews with them get hurt more often.' },
  optymista: { name: 'Optimist', desc: 'Anger −0.2 a day.' },
  hipochondryk: { name: 'Hypochondriac', desc: 'Goes through 0.1 Meds a day, even when healthy.' },
  gadula: { name: 'Chatterbox', desc: 'Talks the longest at meetings. That is all.' },
  excel: { name: 'Excel wizard', desc: 'As common room supervisor: research +5%. Gorgeous reports.' },
  twardy: { name: 'Tough', desc: 'Falls ill less often and dies on runs less often.' },
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
  return lower ? en[0].toLowerCase() + en.slice(1) : en[0].toUpperCase() + en.slice(1);
}

/** przyczyna zgonu ze stanu symulacji (Dead.cause) do zdań: „of their wounds” */
const PRZYCZYNY_EN: Record<string, string> = {
  rany: 'of their wounds',
  gorączka: 'after a bite',
  amputacja: 'during an amputation',
};
export const przyczynaEn = (cause: string): string => PRZYCZYNY_EN[cause] ?? cause;

/* Wstępy jak LORE i LORE_ZOMBIE w data.ts (lore bez zmian: rok 2051, bakteria od miedzi z 2026 roku, prezydent bez
   imienia). */
export const LORE_EN: string =
  'It is 2051. It all started a quarter of a century ago, in 2026, when a green startup asked its AI model for a bacterium that could recover copper from e-waste. The model exceeded expectations. The strain escaped the lab and started eating cables in walls, underground and up on the poles. For three years everyone blamed the outages on scrap thieves, and by the time someone joined the dots, the bacterium was already touring the world in containers full of e-waste. After that, things fell apart slowly: the President of the United States began his tenth term, the dollar moved to a subscription plan, the cloud went down, and the fridges, cars and door intercoms are still waiting for an update. The EU banned wood burners the day before the power went out. Influencers pivoted to survival, ESG consultants to porridge. Only the airtight survived, plus one institution: the housing cooperative. You are the board now.';

export const LORE_ZOMBIE_EN: string =
  'It is 2051. Nobody remembers any more how it started. The AI model in the bank’s server room has three hypotheses and presents each one with total confidence. Only one thing is certain: we all carry it. Whoever dies gets back up, and whoever gets bitten dies of fever within a day. Shamblers are slow and stupid, but they follow noise and gather in herds. The President of the United States, now in his tenth term, has announced that the situation is under control. Only the fenced-in survived, plus one institution: the housing cooperative. You have shored up the fence around the yard with planks, and there is a spear and an old revolver in the basement. You are the board now.';
