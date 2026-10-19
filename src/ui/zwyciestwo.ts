/* Okna warunków zwycięstwa (docs/superpowers/specs/2026-10-19-warunki-zwyciestwa-design.md, „Stan, odczyt i okna”):
   ekran „Drogi do zwycięstwa” z Menu i epilog zwycięstwa, czyli okno z `pending` (src/gov/zarzad.ts). Czyste funkcje dają
   HTML w kształcie `Sheet`, jak okna z okna.ts, więc testy idą w Node na samym `body` i `foot`; „Graj dalej” (`grajDalej`
   i zapis), „Nowa gra” z potwierdzeniem, pauzę i powrót do gry robi main.ts, bo tylko on zna stan gry i okno. Wygląd
   (zwyciestwo.css) ocenia się w prawdziwym Chromium na zrzutach, nie w testach.

   Kontrakt.
   - `drogiSheet(p)`: okno z pięcioma wierszami `PostepDrogi` (z `ocenDrogi`) w tej kolejności, w jakiej przyszły. Wiersz
     (`data-droga`) ma nazwę drogi, listę kamieni milowych, a pod nią: przy drodze z liczbami („{ile} z {cel} osób” i pasek)
     postęp, przy drodze bez podstawy zdanie „Wkrótce: …”. Kamień ma klasę `zw-zaliczony` (zrobiony), `zw-nastepny` (pierwszy
     niezrobiony) albo `zw-dalszy` (reszta, szara); czytelnikowi ekranu mówi to ukryty dopisek „Zaliczone:” i „Następny:”,
     więc stan nie jest tylko kolorem. Pod następnym kamieniem stoi zdanie „co dalej” (`PostepDrogi.dalej`, klasa
     `zw-dalej`), jeśli logika je poda. Droga z „Wkrótce” nie ma czego zdobyć już teraz, więc nie ma następnego kamienia:
     jej otwarte kamienie są wszystkie `zw-dalszy`, bez złotego wyróżnienia i bez dopisku „Następny:”. Droga przebyta do
     końca ma klasę `zw-wygrana` i odznakę „Zwycięstwo”; zdanie „Wkrótce” pokazuje się tylko wtedy, gdy logika je poda
     (`PostepDrogi.wkrotce`, po przebyciu drogi jest puste). Przycisk „Wróć” (`zw-wroc`) wraca do Menu, a okno zamyka się
     też Esc i kliknięciem obok.
   - `epilogSheet(droga, path, mode, staty)`: okno zwycięstwa nad grą (tabliczka w złocie): tytuł to nazwa drogi (w zombie
     droga leku to „Lek”), tekst drogi, po nim zdanie ścieżki uchwał (`GovState.laws.path`: Porządek, Wspólnota, Technokracja,
     a bez ścieżki zdanie neutralne), cztery liczby (dzień, ludzie, zmarli, uchwały) i dwa przyciski: „Graj dalej”
     (`zw-dalej`, główny) i „Nowa gra” (`zw-nowa`). Okno nie zamyka się samo (odpowiedź jest obowiązkowa, jak przy
     raporcie). Własny tekst mają droga ludnościowa i droga technologii. Ludnościowa: dwa zdania o podwórku i trzecie
     z prawdziwymi liczbami, czyli ilu ludzi mieszka tu dziś (`staty.ludzi`, polska liczba mnoga) i, gdy spis 2021 jest do
     użytku (`staty.spis`), ilu mieszkało w 2021 roku; epilog nie twierdzi, że ludzi jest „połowa” z 2021, bo cel jest
     przycięty do 120–500. Technologii: „Fabryka ruszyła.” i jedno zdanie o fabryce bieżącego trybu, w zwykłej grze
     o biorobotach, których bakteria nie rusza, w zombie o humanoidalnych żołnierzach, oba z superserwerem (tryb z
     `GovState.mode`, bez liczb). Pozostałe drogi dostają krótki tekst zastępczy z nazwą drogi, a własne dojdą razem
     z nimi.
   - `statyEpilogu(st, i)`: liczby do epilogu z odczytu i stanu zarządu: dzień gry, ludzie pod zarządem (tak jak liczy
     droga: `ludnoscOf`), zmarli (zarząd i mieszkańcy, `GovInput.dead`), podpisane uchwały i, gdy `GovInput.ludnosc2021`
     jest liczbą skończoną i dodatnią, spis 2021 (`spis`).
   Nic stąd nie zmienia stanu zarządu i niczego nie losuje. Napisy od razu po polsku i angielsku (słowa z
   docs/SLOWNICZEK-EN.md); liczby idą przez `num` (src/ui/tekst.ts), a nazwy i kamienie przez ucieczkę HTML. */

import './zwyciestwo.css';
import type { LawPath } from '../content/data.ts';
import { L, mnogaPl, type Tx, tr, tx, txCat } from '../core/jezyk.ts';
import type { GameMode, GovInput, GovState } from '../gov/typy.ts';
import { type Droga, ludnoscOf, maDaneSpisu, nazwaDrogi, type PostepDrogi } from '../gov/zwyciestwo.ts';
import { btn, type Sheet } from './okna.ts';
import { esc, manyEn, num } from './tekst.ts';

/** Liczby epilogu: dzień gry, ludzie pod zarządem, zmarli od początku gry i podpisane uchwały (cztery kafelki), a do
    tego ludność kwadratu domu w 2021 roku według spisu (`GovInput.ludnosc2021`), jeśli jest do użytku: z niej epilog
    ludności mówi, ilu ludzi mieszkało tu dawniej. Bez spisu pola nie ma. */
export interface StatyEpilogu {
  dzien: number;
  ludzi: number;
  zmarli: number;
  uchwaly: number;
  spis?: number;
}

/** Liczby do epilogu z odczytu i stanu zarządu (zmarli: zarząd i mieszkańcy; uchwały: te, które obowiązują; spis tylko
    wtedy, gdy `ludnosc2021` jest liczbą skończoną i dodatnią). */
export function statyEpilogu(st: GovState, i: GovInput): StatyEpilogu {
  return {
    dzien: i.day,
    ludzi: ludnoscOf(i),
    zmarli: i.dead?.length ?? 0,
    uchwaly: Object.values(st.laws.signed).filter(Boolean).length,
    ...(maDaneSpisu(i.ludnosc2021) ? { spis: i.ludnosc2021 } : {}),
  };
}

// ---------------------------------------------------------------- ekran dróg

/** liczba do paska i napisu: skończona, nieujemna, całkowita */
const calkowita = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);

/** Postęp drogi z liczbami: pasek i „{ile} z {cel} osób” (pasek nie wychodzi poza cel, napis mówi prawdę). */
function postepHtml(nazwa: Tx, p: { ile: number; cel: number }): string {
  const ile = calkowita(p.ile);
  const cel = Math.max(1, calkowita(p.cel));
  const liczby = L(`${num(ile, 0)} z ${num(cel, 0)} osób`, `${num(ile, 0)} of ${num(cel, 0)} people`);
  return `<div class="zw-postep"><progress class="zw-pasek" max="${cel}" value="${Math.min(ile, cel)}" aria-label="${esc(
    tr(nazwa),
  )}"></progress><span class="zw-liczby">${esc(liczby)}</span></div>`;
}

/** Jeden kamień milowy: zaliczony (przed `zaliczone`), następny (numer `nastepny`, pod nim zdanie „co dalej” `dalej`,
    jeśli je ma) albo dalszy; stan mówi też ukryty dopisek. `nastepny` poza listą (−1): droga nie ma następnego kamienia. */
function kamienHtml(k: Tx, n: number, zaliczone: number, nastepny: number, dalej: Tx | null): string {
  const [klasa, sr] =
    n < zaliczone
      ? ['zw-zaliczony', L('Zaliczone: ', 'Done: ')]
      : n === nastepny
        ? ['zw-nastepny', L('Następny: ', 'Next: ')]
        : ['zw-dalszy', ''];
  const co = n === nastepny && dalej ? `<span class="zw-dalej">${esc(tr(dalej))}</span>` : '';
  return `<li class="zw-kamien ${klasa}"><span class="zw-znak" aria-hidden="true"></span>${
    sr ? `<span class="sr">${sr}</span>` : ''
  }<span class="zw-tekst">${esc(tr(k))}</span>${co}</li>`;
}

/** Wiersz drogi: nazwa (z odznaką, gdy przebyta do końca), kamienie (następny ze zdaniem „co dalej”), a pod nimi postęp
    albo „Wkrótce: …”. */
function drogaHtml(d: PostepDrogi): string {
  const wygrana = d.kamienie.length > 0 && d.zaliczone >= d.kamienie.length;
  const postep = d.postep ? postepHtml(d.nazwa, d.postep) : '';
  // czy „Wkrótce” się pokazuje, rozstrzyga logika (`PostepDrogi.wkrotce`); okno nie ma własnej reguły. Droga z „Wkrótce”
  // nie ma czego zdobyć już teraz, więc nie wyróżnia następnego kamienia: wszystkie otwarte są szare
  const wkrotce = d.wkrotce ? `<p class="zw-wkrotce">${esc(tr(d.wkrotce))}</p>` : '';
  const nastepny = d.wkrotce ? -1 : d.zaliczone;
  return `<li class="zw-droga${wygrana ? ' zw-wygrana' : ''}" data-droga="${esc(d.droga)}"><div class="zw-glowa"><h3 class="zw-nazwa">${esc(
    tr(d.nazwa),
  )}</h3>${wygrana ? `<span class="zw-odznaka">${L('Zwycięstwo', 'Victory')}</span>` : ''}</div><ol class="zw-kamienie">${d.kamienie
    .map((k, n) => kamienHtml(k, n, d.zaliczone, nastepny, d.dalej))
    .join('')}</ol>${postep}${wkrotce}</li>`;
}

/** Ekran „Drogi do zwycięstwa” z Menu: wiersze dróg z `ocenDrogi`, przycisk „Wróć” do Menu, zamykany bez decyzji. */
export function drogiSheet(p: PostepDrogi[]): Sheet {
  return {
    tone: 'drogi',
    kicker: 'Za Murem 0.4',
    title: L('Drogi do zwycięstwa', 'Roads to victory'),
    body: `<p class="lead">${L(
      'Każda droga ma kamienie milowe, a zwycięstwo nie kończy gry: możecie grać dalej.',
      'Each road has milestones, and a victory does not end the game: you can keep playing.',
    )}</p><ul class="zw-drogi">${p.map(drogaHtml).join('')}</ul>`,
    foot: btn('zw-wroc', L('Wróć', 'Back'), 'btn go'),
    closable: true,
  };
}

// ---------------------------------------------------------------- epilog

/** Dwa pierwsze zdania epilogu drogi ludnościowej, bez liczb. Trzecie (`zdanieLudzi`) mówi, ilu ludzi tu dziś mieszka
    i, jeśli spis 2021 jest do użytku, ilu mieszkało kiedyś: celem jest połowa spisu w przedziale 120–500, więc „połowa
    tylu ludzi, co w 2021” bywała nieprawdą. */
const PODWORKO = tx(
  'Na podwórku znowu jest gwarno. Na klatkach wiszą grafiki dyżurów, dzieci mają swoją bandę, a ktoś już pisze regulamin trzepaka.',
  'The yard is noisy again. Rotas hang in the stairwells, the kids have their own gang, and someone is already drafting rules for the carpet rack.',
);

/** Ostatnie zdanie epilogu ludności z prawdziwymi liczbami: ludzie dziś (polska liczba mnoga przy „osób”) i, gdy jest
    spis 2021, ilu mieszkało wtedy; bez spisu samo „nikt już nie zamawia jedzenia przez aplikację”. */
function zdanieLudzi(staty: StatyEpilogu): Tx {
  const osoby = mnogaPl(staty.ludzi, 'osoba', 'osoby', 'osób');
  const ludzie = manyEn(Math.round(staty.ludzi), 'person', 'people');
  const live = Math.round(staty.ludzi) === 1 ? 'lives' : 'live';
  if (!maDaneSpisu(staty.spis))
    return tx(
      `Mieszka tu ${osoby} i nikt już nie zamawia jedzenia przez aplikację.`,
      `${ludzie} ${live} here now, and nobody orders food through an app any more.`,
    );
  const spis = num(staty.spis, 0);
  return tx(
    `Mieszka tu ${osoby}, a w 2021 roku, kiedy wszyscy zamawiali jedzenie przez aplikację, mieszkało ${spis}.`,
    `${ludzie} ${live} here now; in 2021, back when everyone ordered food through an app, there were ${spis}.`,
  );
}

/** Epilog drogi technologii, zwykła gra: fabryka biorobotów odpornych na bakterię miedzi i superserwer, który liczy, kto
    pierwszy dostanie prąd. Bez liczb. */
const FABRYKA_ZWYKLA = tx(
  'Fabryka ruszyła. Bioroboty, których bakteria nie rusza, kładą nowe linie od waszej bramy przez całe miasto, a superserwer liczy, kto pierwszy dostanie prąd.',
  'The factory is running. Biorobots the bacterium cannot touch are laying new lines from your gate across the whole city, while the superserver works out who gets power first.',
);

/** Epilog drogi technologii w trybie zombie: fabryka humanoidalnych żołnierzy, którzy czyszczą miasto ze szwendaczy, i
    superserwer, który pisze im rozkazy i regulamin. Bez liczb. */
const FABRYKA_ZOMBIE = tx(
  'Fabryka ruszyła. Humanoidalni żołnierze wychodzą z bramy i czyszczą miasto ze szwendaczy, kwartał po kwartale, a superserwer pisze im rozkazy i regulamin.',
  'The factory is running. Humanoid soldiers march out of the gate and clear the city of walkers, block by block, while the superserver writes their orders and their terms of service.',
);

/** Zdanie końcowe epilogu według ścieżki uchwał (`GovState.laws.path`); `brak` dla gry bez ścieżki. */
const SCIEZKA: Readonly<Record<'porzadek' | 'wspolnota' | 'tech' | 'brak', Tx>> = {
  porzadek: tx(
    'Brama zamyka się o dwudziestej, a straż zna każdego nowego z imienia.',
    'The gate shuts at eight and the watch knows every newcomer by name.',
  ),
  wspolnota: tx(
    'Każda klatka ma swoje zebranie i swoją kłótnię o grafik, ale nikt nie chce się wyprowadzać.',
    'Every stairwell has its own meeting and its own row over the rota, but nobody wants to move out.',
  ),
  tech: tx(
    'Model z dysków banku układa grafiki co do minuty. Nikt nie pyta, kto go kontroluje.',
    'The model from the bank’s disks plans the rotas to the minute. Nobody asks who controls it.',
  ),
  brak: tx(
    'Zarząd dalej się spiera, czy to już osada, czy jeszcze spółdzielnia.',
    'The board is still arguing whether this is a settlement now or still a housing co-op.',
  ),
};

/** Zdanie ścieżki: Porządek, Wspólnota i Technokracja mają własne, wszystko inne (brak ścieżki, „Przetrwanie”) neutralne. */
function sciezkaOf(path: LawPath | null): Tx {
  return path === 'porzadek' || path === 'wspolnota' || path === 'tech' ? SCIEZKA[path] : SCIEZKA.brak;
}

/** Tekst drogi w epilogu: własny (ludność: dwa zdania i zdanie z liczbami ludzi; technologia: fabryka bieżącego trybu),
    a bez niego krótki zastępczy z nazwą drogi. */
function epilogTekst(droga: Droga, mode: GameMode, staty: StatyEpilogu): Tx {
  if (droga === 'ludnosc') return txCat(PODWORKO, ' ', zdanieLudzi(staty));
  if (droga === 'technologia') return mode === 'zombie' ? FABRYKA_ZOMBIE : FABRYKA_ZWYKLA;
  const nazwa = nazwaDrogi(droga, mode);
  return tx(`Droga „${nazwa.pl}” przebyta do końca.`, `The road “${nazwa.en}” is complete.`);
}

/** Epilog zwycięstwa drogą `droga`: tekst drogi, zdanie ścieżki uchwał `path`, cztery liczby i dwa przyciski. */
export function epilogSheet(droga: Droga, path: LawPath | null, mode: GameMode, staty: StatyEpilogu): Sheet {
  const stat = (t: string) => `<li class="zw-stat">${esc(t)}</li>`;
  return {
    tone: 'zwyciestwo',
    kicker: L('Zwycięstwo', 'Victory'),
    title: esc(tr(nazwaDrogi(droga, mode))),
    body: `<p class="zw-opowiesc">${esc(tr(epilogTekst(droga, mode, staty)))}</p><p class="zw-sciezka">${esc(
      tr(sciezkaOf(path)),
    )}</p><ul class="zw-staty">${[
      stat(L(`Dzień ${num(staty.dzien, 0)}`, `Day ${num(staty.dzien, 0)}`)),
      stat(L(`Ludzi: ${num(staty.ludzi, 0)}`, `People: ${num(staty.ludzi, 0)}`)),
      stat(L(`Zmarli: ${num(staty.zmarli, 0)}`, `Deaths: ${num(staty.zmarli, 0)}`)),
      stat(L(`Uchwały: ${num(staty.uchwaly, 0)}`, `Resolutions: ${num(staty.uchwaly, 0)}`)),
    ].join('')}</ul>`,
    foot: `${btn('zw-nowa', L('Nowa gra', 'New game'), 'btn ghost')}${btn('zw-dalej', L('Graj dalej', 'Keep playing'), 'btn go')}`,
  };
}
