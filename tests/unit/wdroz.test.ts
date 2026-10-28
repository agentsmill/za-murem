/* Skrypt wdrożenia deploy/hetzner/wdroz.sh (etap 1, zadanie 13, poprawka): zwykłe wdrożenie (testowe, z dowolnej
   gałęzi) nie dotyka serwera produkcji `api-prod`, a produkcja idzie tylko trybem ZM_PROD=1 z czystej gałęzi `main`.
   Skrypt chodzi na atrapach ssh, rsync, scp, docker i npm w katalogu tymczasowym (adres z zakresu dokumentacyjnego
   203.0.113.x, „serwer" to katalog na dysku, a polecenia docker tylko trafiają do dziennika), więc test niczego nie
   wysyła i nie łączy się z siecią. Dziennik atrap mówi, które polecenia by poszły na serwer. */

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
  for (const n of ['ssh', 'rsync', 'scp', 'docker', 'npm']) {
    const plik = join(bin, n);
    writeFileSync(plik, n === 'ssh' ? ATRAPA_SSH : ATRAPA_LOG);
    chmodSync(plik, 0o755);
  }
  if (envSerwera !== undefined) writeFileSync(join(srv, '.env'), envSerwera, { mode: 0o600 });

  return {
    repo,
    srv,
    log,
    uruchom(env = {}) {
      const srodowisko = {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        ZM_LOG: log,
        ZM_SRV: srv,
        ZM_IP: IP,
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
