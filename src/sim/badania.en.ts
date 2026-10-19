/* Badania po angielsku do napisów (src/sim/badania.ts zostaje po polsku, pilnuje go tests/unit/badania-dane.test.ts):
   nazwy technologii i er oraz zdania o działaniu technologii w nowej grze, po tych samych kluczach co TECHS i ERY.
   Polskie nazwy 24 technologii z 0.3 i pięciu er biorą się z src/content/data.ts, które zostaje bajt w bajt, więc
   angielskie leżą tutaj. Słowa ze słowniczka docs/SLOWNICZEK-EN.md (koza to „the stove”, siedziba to „HQ”, karta nocy
   to „Night orders”, ogródek to „vegetable patch”, zasieki to „barricade”, a barykady z wraków to „Wreck walls”). */

/** nazwa technologii po angielsku, po identyfikatorze (24 z 0.3 w kolejności data.ts i technologia końcowa) */
export const NAZWY_TECH_EN: Readonly<Record<string, string>> = {
  t_kozy: 'Stoves in the flats',
  t_okna: 'Plastic sheeting and blankets on the windows',
  t_konserwy: 'Jars and drying rooms',
  t_zielarstwo: 'Herbalism from the allotments',
  t_wieza: 'Towers from scaffolding',
  t_spawanie: 'Welding with car batteries',
  t_barykady: 'Wreck walls',
  t_wezel: 'Heating substation start-up',
  t_szklarnia: 'Greenhouses from plastic sheeting',
  t_grzyby: 'Mushrooms in the basements',
  t_ambu: 'Field infirmary',
  t_panele: 'Panels from the mall roof',
  t_akumulatory: 'Batteries from electric SUVs',
  t_wiatrak: 'Windmills from alternators',
  t_gazo: 'Wood gasifier',
  t_swiatlo: 'LEDs in the stairwells',
  t_radio: 'Shortwave radio',
  t_mesh: 'Estate mesh network',
  t_pompy: 'Heat pumps from air conditioners',
  t_druk: '3D printer from bottles',
  t_hydro: 'Rooftop hydroponics',
  t_drony: 'Drones from the old deliveries',
  t_serwer: 'Salvaged server',
  t_model: 'Local language model',
  t_siec: 'Copper-free grid',
};

/** nazwa ery po angielsku, po numerze ery (1–5 jak ERAS w data.ts, 6 to era technologii końcowej) */
export const NAZWY_ERY_EN: Readonly<Record<number, string>> = {
  1: 'First weeks',
  2: 'Tinkering',
  3: 'Power',
  4: 'Communications',
  5: 'Silicon',
  6: 'Without copper',
};

/** zdanie o działaniu technologii w nowej grze, tylko dla tych, które coś robią (dziala w TECHS) */
export const DZIALANIE_EN: Readonly<Record<string, string>> = {
  t_kozy:
    'A potbelly stove made from a barrel, set up in a room, the kitchen or the hallway of your flat, close to a window (the flue goes out through it). Heats the room like the kitchen stove and burns wood the same way. The board stokes it on its own.',
  t_okna: '+3°C in the rooms of your flats, free of charge.',
  t_konserwy: '+20% yield from vegetable patches, greenhouses and mushroom farms.',
  t_zielarstwo: 'A vegetable patch sometimes gives meds at harvest: one med, with a one in three chance.',
  t_wieza: 'A tower in the yard and a new Tower post on the Night orders.',
  t_spawanie: 'The workshop makes parts 1.5× faster.',
  t_barykady: 'A wreck wall on a stretch of the fence, sturdier than the plain barricade. Costs mostly scrap.',
  t_wezel:
    'A boiler in the HQ stairwell (in a house, the hallway) heats all your flats at once, but burns a lot of wood. The board stokes it on its own.',
  t_szklarnia: 'A greenhouse in the yard: like a vegetable patch, but in winter it yields as it does in autumn.',
  t_grzyby:
    'A mushroom farm in the bathroom of your flat. A smaller yield than a vegetable patch, but steady all year round.',
  t_ambu: 'Health comes back 1.6× faster (wounds from fighting, chill, hunger).',
};

/** technologia bez działania w nowej grze: kartka leży odwrócona, dopóki ktoś nie dopisze działania */
export const PRAD_EN = 'This needs power.';

/** opis technologii końcowej w trybie zwykłym: sieć bez miedzi, której bakteria nie ruszy (cel drzewka) */
export const SIEC_EN =
  'A grid of aluminium instead of copper, optical fibre and resin-sealed cells: power the bacterium will not touch.';

/** opis technologii końcowej w trybie zombie: ta sama sieć, a do tego cicha, bo hałas ściąga stado (projekt warunków
    zwycięstwa) */
export const SIEC_ZOMBIE_EN = `${SIEC_EN} In this mode it is also silent, because noise draws the herd.`;
