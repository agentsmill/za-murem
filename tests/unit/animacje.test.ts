import { describe, expect, it } from 'vitest';
import { animacjePostaci, type Metadane, pobierzPaczke } from '../../tools/animacje.ts';

/** metadata.json z paczki PixelLab (uproszczona do pól, których używamy) */
const meta = (animations: Record<string, Record<string, string[]>>): Metadane => ({
  states: [{ folder: 'Idle', frames: { animations } }],
});

const klatki = (nazwa: string, kierunek: string, n: number) =>
  Array.from({ length: n }, (_, i) => `Idle/animations/${nazwa}/${kierunek}/frame_${String(i).padStart(3, '0')}.png`);

describe('animacje postaci z paczki PixelLab (tools/animacje.ts)', () => {
  it('daje animacje po nazwie, z kierunkami i klatkami po kolei', () => {
    const a = animacjePostaci(
      meta({
        chod: { south: klatki('chod', 'south', 4), east: klatki('chod', 'east', 4) },
        klekanie: { south: klatki('klekanie', 'south', 5) },
      }),
    );
    expect(a.map((x) => x.nazwa)).toEqual(['chod', 'klekanie']);
    expect(Object.keys(a[0].kierunki).sort()).toEqual(['east', 'south']);
    expect(a[1].kierunki.south).toHaveLength(5);
    expect(a[0].kierunki.south[2]).toBe('Idle/animations/chod/south/frame_002.png');
  });

  it('klatki sortuje po numerze, także gdy przyszły w innej kolejności', () => {
    const k = klatki('chod', 'south', 4);
    const a = animacjePostaci(meta({ chod: { south: [k[2], k[0], k[3], k[1]] } }));
    expect(a[0].kierunki.south).toEqual(k);
  });

  it('postać bez animacji albo bez stanów daje pustą listę', () => {
    expect(animacjePostaci(meta({}))).toEqual([]);
    expect(animacjePostaci({ states: [] })).toEqual([]);
  });

  it('kilka stanów postaci składa animacje ze wszystkich', () => {
    const m: Metadane = {
      states: [
        { folder: 'Idle', frames: { animations: { chod: { south: klatki('chod', 'south', 4) } } } },
        { folder: 'Ranny', frames: { animations: { stanie: { south: klatki('stanie', 'south', 4) } } } },
      ],
    };
    expect(animacjePostaci(m).map((x) => x.nazwa)).toEqual(['chod', 'stanie']);
  });
});

describe('pobranie paczki postaci (zablokowanej, dopóki animacje się generują)', () => {
  const odpowiedz = (status: number, body = '', retry?: string) =>
    new Response(body, { status, headers: retry ? { 'retry-after': retry } : {} });

  it('po 423 czeka tyle, ile kazał serwer, i ponawia aż do 200', async () => {
    const odp = [odpowiedz(423, 'zajęte', '7'), odpowiedz(423, 'zajęte', '3'), odpowiedz(200, 'ZIP')];
    const czekano: number[] = [];
    const dane = await pobierzPaczke('https://x/paczka', {
      pobierz: (async () => odp.shift()!) as typeof fetch,
      czekaj: async (ms) => {
        czekano.push(ms);
      },
    });
    expect(Buffer.from(dane).toString()).toBe('ZIP');
    expect(czekano).toEqual([7000, 3000]);
  });

  it('inny błąd niż 423 przerywa od razu, a zbyt wiele 423 pod rząd też', async () => {
    await expect(
      pobierzPaczke('https://x/paczka', {
        pobierz: (async () => odpowiedz(500)) as typeof fetch,
        czekaj: async () => {},
      }),
    ).rejects.toThrow('500');
    let razy = 0;
    await expect(
      pobierzPaczke('https://x/paczka', {
        pobierz: (async () => {
          razy++;
          return odpowiedz(423, '', '1');
        }) as typeof fetch,
        czekaj: async () => {},
        proby: 4,
      }),
    ).rejects.toThrow('423');
    expect(razy).toBe(4);
  });
});
