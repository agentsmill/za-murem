/* Górny pasek: temperatura na dworze i w kuchni, ogień w kozie (godziny), drewno na zapas, deski, złom
   i części, jedzenie, zaufanie i wkurzenie. Wartości
   i progi liczy czysta funkcja (do testów), DOM zmienia się tylko po zmianie tekstu. Wartości i podpowiedzi
   (title) w bieżącym języku; krótkie podpisy pod liczbami są w index.html. */

import { SEASONS_EN } from '../content/data.en.ts';
import { L } from '../core/jezyk.ts';
import { BLOK, type Words, type WordsEn, wordsEn, wordsOf } from '../gov/miejsce.ts';
import type { GovState } from '../gov/typy.ts';
import type { SimSnapshot } from '../sim/snapshot.ts';
import { WARM_ENOUGH } from '../sim/tutorial.ts';
import { deg, manyEn, num } from './tekst.ts';

export interface Stat {
  id: string;
  value: string;
  /** ok, mid (uwaga), bad (źle) */
  level: 'ok' | 'mid' | 'bad';
  title: string;
}

const wielka = (t: string): string => t[0].toUpperCase() + t.slice(1);

/** words: słowa miejsca (w domu sąsiedzi, komitet ulicy i zebranie ulicy), bez nich jak w bloku */
export function statsOf(
  s: SimSnapshot,
  gov: GovState | null,
  words: Words = wordsOf(BLOK),
  e: WordsEn = wordsEn(BLOK),
): Stat[] {
  const k = s.stock;
  const food = k.supplies + k.meals;
  // drewno na zapas, bez tego, co już się pali (ogień ma swoje pole)
  const spare = k.woodSklad + k.woodLoose + k.woodCarried;
  const ppl = Math.max(1, s.people.length);
  const kit = s.kitchen;
  // dyżur przy kozie (posterunek 'koza' z karty nocy albo z menu kozy)
  const watch = s.people.filter((p) => p.post === 'koza').map((p) => p.name);
  const trust = gov ? Math.round(gov.trust) : null;
  const anger = gov ? Math.round(gov.anger) : null;
  const fence = Math.round(s.fence.durability * 100);
  const holes = s.fence.holes.length;
  const z = s.zombies;
  // w trybie zombie siatka i stado zamiast temperatury na dworze (ta jest w dymku kuchni)
  const first: Stat[] =
    s.mode === 'zombie'
      ? [
          {
            id: 'sFence',
            value: `${fence}%`,
            level: holes || fence < 50 ? 'bad' : fence < 80 ? 'mid' : 'ok',
            title: L(
              `Siatka trzyma w ${fence}%${holes ? `, otwarte dziury: ${holes}` : ''}. Uszkodzoną wzmacnia się deskami albo złomem.`,
              `The fence is holding at ${fence}%${holes ? `, open holes: ${holes}` : ''}. Shore up the damage with planks or scrap.`,
            ),
          },
          {
            id: 'sHorde',
            value: String(z.near),
            level: z.pressing ? 'bad' : z.near ? 'mid' : 'ok',
            title: L(
              `Szwendacze przy siatce: ${z.near}, napiera ${z.pressing}, na całej mapie ${z.all}. Na dworze ${deg(s.outdoor)}.`,
              `Shamblers at the fence: ${z.near}, pressing against it: ${z.pressing}, on the whole map: ${z.all}. Outside ${deg(s.outdoor)}.`,
            ),
          },
        ]
      : [
          {
            id: 'sOut',
            value: deg(s.outdoor),
            level: s.outdoor < 0 ? 'bad' : s.outdoor < 8 ? 'mid' : 'ok',
            title: L(
              `Na dworze ${deg(s.outdoor)}, ${s.seasonName}`,
              `Outside ${deg(s.outdoor)}, ${SEASONS_EN[s.season] ?? s.seasonName}`,
            ),
          },
        ];
  return [
    ...first,
    {
      id: 'sKit',
      value: kit === null ? '–' : deg(kit),
      level: kit === null ? 'mid' : kit < 12 ? 'bad' : kit < WARM_ENOUGH ? 'mid' : 'ok',
      title:
        kit === null
          ? L('Siedziba nie ma kuchni z kozą', 'HQ has no kitchen with a stove')
          : L(
              `W kuchni ${words.zarzad.dk} ${deg(kit)}${s.kozaLit ? `, koza pali się jeszcze ${num(k.fireHours)} h` : ', koza zimna'}`,
              `${wielka(e.krotko)}’s kitchen: ${deg(kit)}${s.kozaLit ? `, the stove has ${num(k.fireHours)} h of fire left` : ', the stove is cold'}`,
            ),
    },
    {
      id: 'sFire',
      value: s.kozaLit ? `${num(k.fireHours)} h` : L('zimna', 'cold'),
      level: !s.kozaLit ? (kit !== null && kit < WARM_ENOUGH ? 'bad' : 'mid') : k.fireHours < 0.5 ? 'mid' : 'ok',
      title: `${
        s.kozaLit
          ? L(
              `Ognia w kozie na ${num(k.fireHours)} h. ${words.Zarzad} sam dokłada, póki jest drewno.`,
              `Fire in the stove for ${num(k.fireHours)} h. ${e.Zarzad} keeps feeding it while there is wood.`,
            )
          : L(
              'Koza zimna. Bez ognia kuchnia stygnie: zetnijcie drzewo albo spalcie mebel.',
              'The stove is cold. Without a fire the kitchen cools down: chop down a tree or burn some furniture.',
            )
      }${
        watch.length
          ? L(
              ` Przy kozie czuwa ${watch.join(', ')}: dokłada do rana.`,
              ` On stove watch: ${watch.join(', ')}, keeping it going till morning.`,
            )
          : ''
      }`,
    },
    {
      id: 'sWood',
      value: String(spare),
      level: spare === 0 ? 'bad' : spare < 6 ? 'mid' : 'ok',
      title: L(
        `Drewno na zapas: w składzie ${k.woodSklad}, luzem ${k.woodLoose}, w rękach ${k.woodCarried}`,
        `Wood: ${k.woodSklad} in the woodpile, ${k.woodLoose} lying around, ${k.woodCarried} being carried`,
      ),
    },
    // materiały z odzysku: deski, złom i części; na telefonie jedno pole zbiorcze (CSS chowa jedno albo drugie)
    {
      id: 'sBoards',
      value: String(k.boards),
      level: k.boards ? 'ok' : 'mid',
      title: L(
        `Deski: ${k.boards}. Na łaty, naprawy i budowę. Dają je ${words.szukanie.zrodla.deski}.`,
        `Planks: ${k.boards}. For patches, repairs and building. They come from ${e.szukanie.zrodla.deski}.`,
      ),
    },
    {
      id: 'sScrap',
      value: String(k.scrap),
      level: k.scrap ? 'ok' : 'mid',
      title: L(
        `Złom: ${k.scrap}. Na łaty, zasieki i naprawy rur i pieców. Dają go przeszukiwanie i rozbiórka śmieci.`,
        `Scrap: ${k.scrap}. For patches, barricades and fixing pipes and cookers. It comes from ${e.szukanie.zrodla.zlom}.`,
      ),
    },
    {
      id: 'sParts',
      value: String(k.parts),
      level: k.parts ? 'ok' : 'mid',
      title: L(
        `Części: ${k.parts}. Do rur, pieców i kuchni społecznej. Dają je przeszukiwanie i rozbiórka sprzętów.`,
        `Parts: ${k.parts}. For pipes, cookers and the community kitchen. They come from ${e.szukanie.zrodla.czesci}.`,
      ),
    },
    {
      id: 'sMats',
      value: `${k.boards}·${k.scrap}·${k.parts}`,
      level: k.boards || k.scrap || k.parts ? 'ok' : 'mid',
      title: L(
        `Deski ${k.boards}, złom ${k.scrap}, części ${k.parts}. Dają je przeszukiwanie i rozbiórka.`,
        `Planks ${k.boards}, scrap ${k.scrap}, parts ${k.parts}. Searching and taking things apart gets you more.`,
      ),
    },
    {
      id: 'sFood',
      value: String(food),
      level: food < ppl ? 'bad' : food < ppl * 3 ? 'mid' : 'ok',
      title: L(
        `Jedzenie: zapasy ${k.supplies}, ugotowane porcje ${k.meals}, gazu na ${k.gasCooks} gotowań`,
        `Food: ${k.supplies} in stock, ${k.meals} cooked portions, gas left for ${manyEn(k.gasCooks, 'meal', 'meals')}`,
      ),
    },
    {
      id: 'sTrust',
      value: trust === null ? '–' : String(trust),
      level: trust === null ? 'mid' : trust < 30 ? 'bad' : trust < 45 ? 'mid' : 'ok',
      title: L(
        `Zaufanie ${words.mieszkancy.d} do ${words.zarzad.d} (0–100). Przy zerze ludzie odejdą.`,
        `${wielka(e.mieszkancy)}’ trust in ${e.krotko} (0–100). At zero, people leave.`,
      ),
    },
    {
      id: 'sAnger',
      value: anger === null ? '–' : String(anger),
      level: anger === null ? 'mid' : anger > 60 ? 'bad' : anger > 40 ? 'mid' : 'ok',
      title: L(
        `Wkurzenie ${words.mieszkancy.d} (0–100). Przy stu ${words.walne} odwoła ${words.zarzad.krotko}.`,
        `${wielka(e.mieszkancy)}’ anger (0–100). At 100, ${e.walne} votes ${e.krotko} out.`,
      ),
    },
  ];
}

const shown = new Map<string, string>();

/** wpisuje wartości do pasku (span.stat > b) tylko po zmianie */
export function renderStats(list: Stat[]): void {
  for (const s of list) {
    const key = `${s.value}|${s.level}|${s.title}`;
    if (shown.get(s.id) === key) continue;
    shown.set(s.id, key);
    const el = document.getElementById(s.id);
    if (!el) continue;
    el.hidden = false;
    el.className = `stat ${s.level}`;
    el.title = s.title;
    const b = el.querySelector('b');
    if (b) b.textContent = s.value;
  }
}
