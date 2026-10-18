/* Powody chwilowych nastrojów po angielsku (karta osoby). W stanie symulacji powód to polski napis i zarazem klucz
   (ten sam powód drugi raz tylko przedłuża nastrój), więc zostaje po polsku, a tłumaczymy go przy rysowaniu: dokładne
   napisy z tablicy, napisy z imieniem albo meblem przez wzorce. Nowy powód w kodzie potrzebuje wpisu tutaj: pilnuje
   tego tests/unit/slowniki-en.test.ts, który zbiera powody literałami z src/. */

export const NASTROJE_EN: Readonly<Record<string, string>> = {
  // symulacja: jedzenie, sen, palenie mebli, walka
  'Ciepły posiłek': 'Hot meal',
  'Zimne z puszki': 'Cold, straight from the tin',
  'Głodowe racje': 'Starvation rations',
  'Wspólny posiłek': 'Shared meal',
  'Spanie na podłodze': 'Slept on the floor',
  'Palimy meble': 'Burning our own furniture',
  'Rozbieramy cudze mieszkanie': 'Stripping someone else’s flat',
  'Dobiłem obcego': 'I finished off a stranger',
  'Dobiłem sąsiada': 'I finished off a neighbour',
  'Zabiłem człowieka': 'I killed someone',
  Amputacja: 'Amputation',
  'Uratowaliśmy go': 'We saved a life',
  'Gorączka po ugryzieniu': 'Fever from a bite',
  'Szabrownicy weszli na podwórko': 'Looters got into the yard',
  'Przegoniliśmy szabrowników': 'We ran the looters off',
  // handlarz pod bramą (NAPISY.nastroj w src/sim/handlarz.ts)
  'Napadliśmy na handlarza': 'We robbed the trader',
  // zarząd: noc, wyprawy, wydarzenia
  'Sprawy spółdzielni': 'Co-op business',
  'Sprawy ulicy': 'Street business',
  'Pożar od kozy': 'The stove started a fire',
  Choroba: 'Illness',
  'Całą noc przy kozie': 'All night by the stove',
  'Całą noc na warcie': 'All night on watch',
  'Ledwo uciekłem': 'I barely got away',
  'Ledwo uciekłam': 'I barely got away',
  'Wróciłem z łupem': 'I came back with loot',
  'Wróciłam z łupem': 'I came back with loot',
  'Mamy psa': 'We have a dog',
  'Algorytm się znalazł': 'Algorithm came home',
};

/** „Spalili moją wersalkę”: mebel w bierniku z zaimkiem (MINE w src/sim/sim.ts) */
const MOJE_EN: Readonly<Record<string, string>> = {
  'moje krzesło': 'my chair',
  'mój stół': 'my table',
  'moje łóżko': 'my bed',
  'moją wersalkę': 'my sofa bed',
  'moją meblościankę': 'my wall unit',
  'moją rzecz': 'my things',
};

/** powód nastroju ze stanu po angielsku; nieznany zostaje po polsku */
export function nastrojEn(why: string): string {
  const exact = NASTROJE_EN[why];
  if (exact) return exact;
  const death = /^Śmierć: (.+)$/.exec(why);
  if (death) return `${death[1]} died`;
  const burned = /^Spalili (.+)$/.exec(why);
  if (burned && MOJE_EN[burned[1]]) return `They burned ${MOJE_EN[burned[1]]}`;
  return why;
}
