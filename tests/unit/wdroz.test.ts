/* Skrypt wdrożenia deploy/hetzner/wdroz.sh (etap 1, zadanie 13, poprawka): zwykłe wdrożenie (testowe, z dowolnej
   gałęzi) nie dotyka serwera produkcji `api-prod`, a produkcja idzie tylko trybem ZM_PROD=1 z czystej gałęzi `main` równej `origin/main`.
   Skrypt chodzi na atrapach ssh, rsync, scp, docker i npm w katalogu tymczasowym (adres z zakresu dokumentacyjnego
   203.0.113.x, „serwer" to katalog na dysku, a polecenia docker tylko trafiają do dziennika), więc test niczego nie
   wysyła i nie łączy się z siecią (`origin` to lokalne repozytorium bare w katalogu tymczasowym). Dziennik atrap
   mówi, które polecenia by poszły na serwer. */

import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const SKRYPT = readFileSync(new URL('../../deploy/hetzner/wdroz.sh', import.meta.url), 'utf8');
const IP = '203.0.113.7';

/** atrapa ssh: loguje wywołanie, odmawia obcych hostów, polecenia docker tylko loguje, resztę (odczyt i zapis .env)
    wykonuje na katalogu „serwera" zamiast /srv/za-murem */
const ATRAPA_SSH = `#!/bin/bash
echo "ssh $*" >> "$ZM_LOG"
case "$1" in root@203.0.113.*) ;; *) echo "atrapa ssh: obcy host $1" >&2; exit 97 ;; esac
cmd="$2"
case "$cmd" in *docker*) exit 0 ;; esac
cmd="\${cmd//\\/srv\\/za-murem/$ZM_SRV}"
exec sh -c "$cmd"
`;
const ATRAPA_LOG = `#!/bin/bash
echo "$(basename "$0") $*" >> "$ZM_LOG"
`;
/** atrapa npm: loguje też, z jaką wartością VITE_SIEC wywołano budowę (ustawioną w otoczeniu przez skrypt) */
const ATRAPA_NPM = `#!/bin/bash
echo "npm $* VITE_SIEC=\${VITE_SIEC-nieustawione}" >> "$ZM_LOG"
`;

let katalogi: string[] = [];
afterEach(() => {
  for (const k of katalogi) rmSync(k, { recursive: true, force: true });
  katalogi = [];
});

const git = (repo: string, ...argumenty: string[]) =>
  spawnSync(
    'git',
    ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', '-c', 'commit.gpgsign=false', ...argumenty],
    {
      cwd: repo,
      encoding: 'utf8',
    },
  );

interface Srodowisko {
  repo: string;
  srv: string;
  log: string;
  /** repozytorium bare udające origin */
  zdalne: string;
  /** commit na origin/main z innego klonu (jak push kolegi); lokalny main zostaje w tyle */
  commitNaZdalnym(): void;
  uruchom(env?: Record<string, string>): { status: number | null; stdout: string; stderr: string };
  dziennik(): string;
  env(): string;
}

/** repozytorium próbne na gałęzi main (czyste drzewo), katalog „serwera" i atrapy; `env` to zawartość .env na serwerze */
function przygotuj(envSerwera?: string): Srodowisko {
  const katalog = mkdtempSync(join(tmpdir(), 'zm-wdroz-'));
  katalogi.push(katalog);
  const repo = join(katalog, 'repo');
  const srv = join(katalog, 'srv');
  const bin = join(katalog, 'bin');
  const log = join(katalog, 'dziennik.log');
  for (const d of ['deploy/hetzner/conf-obok', 'deploy/hetzner/conf', 'server', 'src/net']) {
    mkdirSync(join(repo, d), { recursive: true });
  }
  mkdirSync(srv);
  mkdirSync(bin);
  writeFileSync(log, '');
  writeFileSync(join(repo, 'deploy/hetzner/wdroz.sh'), SKRYPT, { mode: 0o755 });
  for (const p of [
    'deploy/hetzner/compose.obok.yml',
    'deploy/hetzner/compose.yml',
    'deploy/hetzner/conf-obok/Caddyfile',
    'deploy/hetzner/conf/Caddyfile',
    'server/Dockerfile',
    'server/Dockerfile.dockerignore',
    'server/app.ts',
    'src/net/protokol.ts',
  ]) {
    writeFileSync(join(repo, p), `# ${p}\n`);
  }
  writeFileSync(join(repo, '.gitignore'), 'dist/\n');
  mkdirSync(join(repo, 'dist'));
  writeFileSync(join(repo, 'dist/index.html'), '<html></html>\n');
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'start');
  const zdalne = join(katalog, 'zdalne.git');
  git(katalog, 'init', '-q', '--bare', '-b', 'main', zdalne);
  git(repo, 'remote', 'add', 'origin', zdalne);
  git(repo, 'push', '-q', 'origin', 'main');
  for (const n of ['ssh', 'rsync', 'scp', 'docker', 'npm']) {
    const plik = join(bin, n);
    writeFileSync(plik, n === 'ssh' ? ATRAPA_SSH : n === 'npm' ? ATRAPA_NPM : ATRAPA_LOG);
    chmodSync(plik, 0o755);
  }
  if (envSerwera !== undefined) writeFileSync(join(srv, '.env'), envSerwera, { mode: 0o600 });

  return {
    repo,
    srv,
    log,
    zdalne,
    commitNaZdalnym() {
      const inny = join(katalog, 'inny');
      git(katalog, 'clone', '-q', zdalne, inny);
      writeFileSync(join(inny, 'kolega.txt'), 'x\n');
      git(inny, 'add', '-A');
      git(inny, 'commit', '-q', '-m', 'kolega');
      git(inny, 'push', '-q', 'origin', 'main');
    },
    uruchom(env = {}) {
      const srodowisko = {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        ZM_LOG: log,
        ZM_SRV: srv,
        ZM_IP: IP,
        GIT_TERMINAL_PROMPT: '0',
        ...env,
      };
      // bezpiecznik: ssh, rsync, scp, docker i npm MUSZĄ być atrapami z katalogu tymczasowego
      for (const n of ['ssh', 'rsync', 'scp', 'docker', 'npm']) {
        const gdzie = spawnSync('sh', ['-c', `command -v ${n}`], { env: srodowisko, encoding: 'utf8' }).stdout.trim();
        if (gdzie !== join(bin, n)) throw new Error(`${n} nie jest atrapą: ${gdzie}`);
      }
      const w = spawnSync('bash', [join(repo, 'deploy/hetzner/wdroz.sh')], {
        env: srodowisko,
        encoding: 'utf8',
        cwd: repo,
      });
      return { status: w.status, stdout: w.stdout, stderr: w.stderr };
    },
    dziennik: () => readFileSync(log, 'utf8'),
    env: () => (existsSync(join(srv, '.env')) ? readFileSync(join(srv, '.env'), 'utf8') : ''),
  };
}

const SEKRETY_TESTU = 'ZM_PROXY_SEKRET_TEST=wartosc-testu-1\nZM_KONTAKT=kontakt@example.test\n';
const SEKRETY_PROD = 'ZM_PROXY_SEKRET_PROD=wartosc-prod-2\nZM_LICZNIKI_TOKEN=wartosc-token-3\n';
const WSZYSTKIE = `SITE=za-murem.${IP.replaceAll('.', '-')}.sslip.io\nIP=${IP}\nZM_SIEC=cergo_default\n${SEKRETY_TESTU}${SEKRETY_PROD}`;
const WARTOSCI = ['wartosc-testu-1', 'wartosc-prod-2', 'wartosc-token-3', 'kontakt@example.test'];

describe('wdroz.sh: zwykłe wdrożenie (test)', () => {
  it('nie wymaga sekretów produkcji: ostrzega nazwami brakujących zmiennych testu i idzie dalej', () => {
    const s = przygotuj('');
    const w = s.uruchom({ ZM_SIEC: 'cergo_default' });
    expect(w.status).toBe(0);
    expect(w.stderr).toContain('UWAGA: w .env na serwerze brak ZM_PROXY_SEKRET_TEST');
    expect(w.stderr).toContain('UWAGA: w .env na serwerze brak ZM_KONTAKT');
    // brak sekretów produkcji nie jest tu ostrzeżeniem ani błędem
    expect(w.stderr).not.toContain('ZM_PROXY_SEKRET_PROD');
    expect(w.stderr).not.toContain('ZM_LICZNIKI_TOKEN');
    expect(s.dziennik()).toContain('docker compose up -d --build --remove-orphans');
  });

  it('nie rusza serwera produkcji: żadnego --profile, żadnego api-prod, źródła tylko do serwer-zrodla', () => {
    const s = przygotuj(WSZYSTKIE);
    const w = s.uruchom({ ZM_SIEC: 'cergo_default' });
    expect(w.status).toBe(0);
    const dziennik = s.dziennik();
    expect(dziennik).not.toContain('--profile');
    expect(dziennik).not.toContain('api-prod');
    expect(dziennik).not.toContain('serwer-prod');
    expect(dziennik).toContain(`root@${IP}:/srv/za-murem/serwer-zrodla/`);
    expect(w.stderr).not.toContain('UWAGA');
    // wartości sekretów nie trafiają do wyjścia ani do poleceń
    for (const wartosc of WARTOSCI) {
      expect(w.stdout + w.stderr + dziennik).not.toContain(wartosc);
    }
    // .env: odświeżone trzy własne linie, sekrety zachowane
    expect(s.env()).toContain('ZM_PROXY_SEKRET_PROD=wartosc-prod-2');
    expect(s.env()).toContain(`IP=${IP}`);
  });

  it('buduje grę z VITE_SIEC=1 (?siec=1 znika najpierw na serwerze testowym), także gdy w otoczeniu jest inna wartość', () => {
    for (const otoczenie of [{}, { VITE_SIEC: '0' }]) {
      const s = przygotuj(WSZYSTKIE);
      const w = s.uruchom({ ZM_SIEC: 'cergo_default', ...otoczenie });
      expect(w.status).toBe(0);
      expect(s.dziennik()).toContain('npm run build VITE_SIEC=1');
    }
    // bez ZM_SIEC (własny serwer z Caddy) tak samo
    const wlasny = przygotuj(WSZYSTKIE);
    expect(wlasny.uruchom().status).toBe(0);
    expect(wlasny.dziennik()).toContain('npm run build VITE_SIEC=1');
  });

  it('idzie z dowolnej gałęzi i z brudnego drzewa (nocna integracja)', () => {
    const s = przygotuj(WSZYSTKIE);
    git(s.repo, 'checkout', '-q', '-b', 'pelna-gra');
    writeFileSync(join(s.repo, 'server/app.ts'), '# zmieniony\n');
    writeFileSync(join(s.repo, 'nowy.txt'), 'x\n');
    const w = s.uruchom({ ZM_SIEC: 'cergo_default' });
    expect(w.status).toBe(0);
    expect(s.dziennik()).not.toContain('api-prod');
  });
});

describe('wdroz.sh: produkcja (ZM_PROD=1)', () => {
  const PROD = { ZM_SIEC: 'cergo_default', ZM_PROD: '1' };

  it('z gałęzi innej niż main odmawia, zanim cokolwiek pójdzie na serwer', () => {
    const s = przygotuj(WSZYSTKIE);
    git(s.repo, 'checkout', '-q', '-b', 'pelna-gra');
    const w = s.uruchom(PROD);
    expect(w.status).toBe(1);
    expect(w.stderr).toContain("Produkcja idzie tylko z gałęzi main, a tu jest 'pelna-gra'");
    expect(s.dziennik()).toBe('');
  });

  it('z brudnego drzewa (zmiana albo nowy plik) odmawia, zanim cokolwiek pójdzie na serwer', () => {
    const s = przygotuj(WSZYSTKIE);
    writeFileSync(join(s.repo, 'nowy.txt'), 'x\n');
    const w = s.uruchom(PROD);
    expect(w.status).toBe(1);
    expect(w.stderr).toContain('Drzewo robocze nie jest czyste');
    expect(s.dziennik()).toBe('');
    git(s.repo, 'add', 'nowy.txt');
    git(s.repo, 'commit', '-q', '-m', 'nowy');
    writeFileSync(join(s.repo, 'server/app.ts'), '# zmieniony\n');
    expect(s.uruchom(PROD).status).toBe(1);
    expect(s.dziennik()).toBe('');
  });

  it('main przed origin/main (niewypchnięte commity) odmawia, zanim cokolwiek pójdzie na serwer', () => {
    const s = przygotuj(WSZYSTKIE);
    writeFileSync(join(s.repo, 'server/app.ts'), '# niezrecenzowana zmiana\n');
    git(s.repo, 'add', '-A');
    git(s.repo, 'commit', '-q', '-m', 'lokalnie');
    const w = s.uruchom(PROD);
    expect(w.status).toBe(1);
    expect(w.stderr).toContain('Lokalny main wyprzedza origin/main (niewypchnięte commity: 1)');
    expect(s.dziennik()).toBe('');
  });

  it('main za origin/main (stary kod) odmawia, zanim cokolwiek pójdzie na serwer', () => {
    const s = przygotuj(WSZYSTKIE);
    s.commitNaZdalnym();
    // lokalny main jeszcze nie wie o nowym commicie: skrypt sam robi fetch
    const w = s.uruchom(PROD);
    expect(w.status).toBe(1);
    expect(w.stderr).toContain('Lokalny main jest za origin/main (brakuje commitów: 1)');
    expect(w.stderr).toContain('git pull --ff-only');
    expect(s.dziennik()).toBe('');
  });

  it('main rozjechany z origin/main odmawia, zanim cokolwiek pójdzie na serwer', () => {
    const s = przygotuj(WSZYSTKIE);
    s.commitNaZdalnym();
    writeFileSync(join(s.repo, 'server/app.ts'), '# lokalnie\n');
    git(s.repo, 'add', '-A');
    git(s.repo, 'commit', '-q', '-m', 'lokalnie');
    const w = s.uruchom(PROD);
    expect(w.status).toBe(1);
    expect(w.stderr).toContain('się rozeszły (tylko lokalnie: 1, tylko na origin/main: 1)');
    expect(s.dziennik()).toBe('');
  });

  it('main równy origin/main (po pull) przechodzi dalej', () => {
    const s = przygotuj(WSZYSTKIE);
    s.commitNaZdalnym();
    expect(s.uruchom(PROD).status).toBe(1);
    git(s.repo, 'pull', '-q', '--ff-only', 'origin', 'main');
    const w = s.uruchom(PROD);
    expect(w.status).toBe(0);
    expect(s.dziennik()).toContain('docker compose --profile prod up -d --build api-prod');
  });

  it('gdy origin jest nieosiągalny (fetch nie działa), odmawia zamiast wdrażać na ślepo', () => {
    const s = przygotuj(WSZYSTKIE);
    git(s.repo, 'remote', 'set-url', 'origin', join(s.repo, 'nie-ma-takiego-repozytorium.git'));
    const w = s.uruchom(PROD);
    expect(w.status).toBe(1);
    expect(w.stderr).toContain('Nie udało się pobrać origin/main');
    expect(s.dziennik()).toBe('');
  });

  it('bez ZM_SIEC odmawia (api-prod jest tylko w compose.obok.yml)', () => {
    const s = przygotuj(WSZYSTKIE);
    const w = s.uruchom({ ZM_PROD: '1' });
    expect(w.status).toBe(1);
    expect(w.stderr).toContain('ZM_PROD=1 działa tylko obok innej aplikacji');
    expect(s.dziennik()).toBe('');
  });

  it('bez sekretów produkcji w .env staje po samym odczycie .env: bez rsync, docker i zmian', () => {
    const s = przygotuj(`SITE=x\nZM_SIEC=cergo_default\n${SEKRETY_TESTU}`);
    const przed = s.env();
    const w = s.uruchom(PROD);
    expect(w.status).toBe(1);
    expect(w.stderr).toContain('ZM_PROXY_SEKRET_PROD ZM_LICZNIKI_TOKEN');
    // ZM_PROXY_SEKRET_TEST nie jest tu wymagany
    expect(w.stderr).not.toContain('ZM_PROXY_SEKRET_TEST');
    const dziennik = s.dziennik();
    expect(dziennik.trim().split('\n')).toHaveLength(1);
    expect(dziennik).toMatch(/^ssh root@203\.0\.113\.7 cd \/srv\/za-murem && for z in ZM_PROXY_SEKRET_PROD/);
    expect(dziennik).not.toContain('rsync');
    expect(dziennik).not.toContain('docker');
    expect(s.env()).toBe(przed);
    for (const wartosc of WARTOSCI) expect(w.stdout + w.stderr + dziennik).not.toContain(wartosc);
  });

  it('z main, czystego drzewa i pełnych sekretów podnosi tylko api-prod z własnego katalogu źródeł', () => {
    const s = przygotuj(WSZYSTKIE);
    const przed = s.env();
    const w = s.uruchom(PROD);
    expect(w.status).toBe(0);
    const linie = s.dziennik().trim().split('\n');
    // odczyt .env, compose, źródła do serwer-prod, jedno polecenie docker
    expect(linie).toHaveLength(4);
    expect(linie[0]).toMatch(/^ssh .*for z in ZM_PROXY_SEKRET_PROD ZM_LICZNIKI_TOKEN ZM_KONTAKT SITE ZM_SIEC/);
    expect(linie[1]).toMatch(
      /^rsync -az deploy\/hetzner\/compose\.obok\.yml root@203\.0\.113\.7:\/srv\/za-murem\/compose\.yml$/,
    );
    expect(linie[2]).toMatch(
      /^rsync -azR --delete server\/Dockerfile .* root@203\.0\.113\.7:\/srv\/za-murem\/serwer-prod\/$/,
    );
    expect(linie[3]).toBe(`ssh root@${IP} cd /srv/za-murem && docker compose --profile prod up -d --build api-prod`);
    const dziennik = s.dziennik();
    // nie dotyka gry, serwera testowego, Caddy ani budowy gry
    expect(dziennik).not.toContain('serwer-zrodla');
    expect(dziennik).not.toContain('/www/');
    expect(dziennik).not.toContain('dist/');
    expect(dziennik).not.toContain('npm');
    expect(dziennik).not.toContain('caddy');
    expect(dziennik).not.toContain('restart');
    expect(dziennik).not.toContain('--remove-orphans');
    // .env bez zmian, sekretów nikt nie wypisał
    expect(s.env()).toBe(przed);
    for (const wartosc of WARTOSCI) expect(w.stdout + w.stderr + dziennik).not.toContain(wartosc);
    expect(w.stdout).toContain('Produkcja (api-prod) wdrożona z gałęzi main');
  });
});

describe('deploy/hetzner/README.md i nagłówek wdroz.sh: krok 0, kolejność wdrożenia, sprawdzenie podglądu', () => {
  const README = readFileSync(new URL('../../deploy/hetzner/README.md', import.meta.url), 'utf8');
  /** treść punktu listy „Kolejność, gdy jest OK” o danym numerze (do początku następnego punktu) */
  const punkt = (n: number): string => {
    const od = README.indexOf(`\n${n}. `);
    const doNastepnego = README.indexOf(`\n${n + 1}. `, od + 1);
    expect(od, `brak punktu ${n}`).toBeGreaterThan(-1);
    return README.slice(od, doNastepnego === -1 ? undefined : doNastepnego);
  };

  it('krok 0: każda gałąź wdrażana na serwer testowy musi zawierać tę zmianę, trzy powody i wycofanie z kopii bazy', () => {
    const k0 = punkt(0);
    for (const g of ['pelna-gra', 'noc-integracja', 'wyjscie-na-swiat']) expect(k0, g).toContain(g);
    expect(k0).toMatch(/zanim/i);
    // trzy powody: schemat bazy (wersja 3 kontra 1, pętla restartów), nadpisany .env, usunięty api-prod jako sierota
    expect(k0).toContain('Baza ma schemat w wersji 3');
    expect(k0).toContain('wersji 1');
    expect(k0).toContain('pętl');
    expect(k0).toContain('.env');
    expect(k0).toContain('printf');
    expect(k0).toContain('sierot');
    expect(k0).toContain('api-prod');
    // wycofanie: kopia bazy sprzed wdrożenia z ZM_KOPIE, krok po kroku jak w server/README.md
    expect(k0).toContain('ZM_KOPIE');
    expect(k0).toContain('Przywracanie z kopii');
    expect(k0).toContain('server/README.md');
    expect(k0).toContain('docker compose stop api');
  });

  it('nagłówek wdroz.sh jednym zdaniem odsyła do kroku 0 i podaje powody', () => {
    const naglowek = SKRYPT.split('\nset -euo pipefail')[0];
    expect(naglowek).toContain('pelna-gra');
    expect(naglowek).toContain('schemat');
    expect(naglowek).toContain('wersji 3');
    expect(naglowek).toContain('.env');
    expect(naglowek).toContain('sierot');
    expect(naglowek).toContain('krok 0');
    // stary opis „gałąź bez tego wdroz.sh…” (który nie dotyczył niczego, co by go czytało) zniknął
    expect(naglowek).not.toContain('gałąź bez tego wdroz.sh');
  });

  it('api-prod wdraża się dopiero po zatwierdzeniu informacji o danych osobowych, a OK Mateusza przed tym obejmuje Vercel, podglądy i serwer testowy', () => {
    const ok = punkt(1);
    expect(ok).toContain('OK Mateusza');
    expect(ok).toMatch(/projektu na Vercelu/i);
    expect(ok).toMatch(/zmienne podglądów/i);
    expect(ok).toMatch(/serwer testowy/i);
    expect(ok).not.toContain('ZM_PROD=1');
    // wszystko, co dotyka produkcji (sekrety produkcji, blok Caddy, ZM_PROD=1), jest w punktach po zatwierdzeniu informacji
    const indeksZatwierdzenia = README.indexOf('zatwierdzeniu informacji o danych osobowych', README.indexOf('\n0. '));
    expect(indeksZatwierdzenia).toBeGreaterThan(-1);
    expect(README.indexOf('ZM_PROD=1 ZM_IP=')).toBeGreaterThan(indeksZatwierdzenia);
    expect(README.indexOf('dopisujemy raz: skrypt poniżej')).toBeGreaterThan(indeksZatwierdzenia);
    const poZatwierdzeniu = README.slice(indeksZatwierdzenia - 300, indeksZatwierdzenia + 700);
    expect(poZatwierdzeniu).toContain('?siec=1');
    expect(poZatwierdzeniu).toContain('zamurem.vercel.app');
    expect(poZatwierdzeniu).toContain('miejsca');
  });

  it('sprawdzenie podglądu ma cztery dodatkowe sprawdzenia: X-Real-IP 301 razy, zapis 2–3 MB, /api/adres z parametrem, docker ps po zwykłym wdrożeniu', () => {
    const od = README.indexOf('### Sprawdzenie podglądu');
    expect(od).toBeGreaterThan(-1);
    const nastepny = README.indexOf('\n### ', od + 1);
    const sekcja = README.slice(od, nastepny === -1 ? undefined : nastepny);
    expect(sekcja).toContain('/api/zdrowie');
    expect(sekcja).toContain('"ip": "proxy"');
    expect(sekcja).toMatch(/X-Real-IP/);
    expect(sekcja).toContain('301');
    expect(sekcja).toContain('429');
    expect(sekcja).toMatch(/2.3 MB/);
    expect(sekcja).toContain('/api/adres?q=');
    expect(sekcja).toContain('docker ps');
    expect(sekcja).toContain('api-prod');
  });

  it('opis restartu planowego nie twierdzi, że skrypt wdrożenia i stos cergo są bez zmian', () => {
    expect(README).not.toContain('Skrypt wdrożenia i stos cergo bez zmian');
    const i = README.indexOf('Obie zmienne wejdą na serwer przy najbliższym wdrożeniu');
    expect(i).toBeGreaterThan(-1);
    const zdanie = README.slice(i, README.indexOf('\n', i));
    // zmienne wchodzą razem ze zmianami wdroz.sh i compose.obok.yml z tej gałęzi (krok 0)
    expect(zdanie).toMatch(/krok(u)? 0/);
  });
});
