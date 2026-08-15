#!/usr/bin/env node
/**
 * Deploy RPG Table to Fly.io so it stays online with the PC off.
 * Requires: Docker Desktop running + flyctl logged in.
 *
 *   npm run deploy:fly
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const urlFile = path.join(root, '.public-url');

function run(cmd: string, args: string[], allowFail = false): string {
  console.log(`\n→ ${cmd} ${args.join(' ')}\n`);
  const res = spawnSync(cmd, args, {
    cwd: root,
    stdio: ['inherit', 'pipe', 'pipe'],
    encoding: 'utf8',
    shell: true,
    env: process.env,
  });
  const out = `${res.stdout ?? ''}${res.stderr ?? ''}`;
  process.stdout.write(out);
  if (res.status !== 0 && !allowFail) {
    process.exit(res.status ?? 1);
  }
  return out;
}

function which(bin: string): boolean {
  const r = spawnSync(bin, ['--version'], { shell: true, encoding: 'utf8' });
  return r.status === 0;
}

if (!which('flyctl') && !which('fly')) {
  console.error('flyctl не найден. Установи: https://fly.io/docs/hands-on/install-flyctl/');
  console.error('PowerShell: iwr https://fly.io/install.ps1 -useb | iex');
  process.exit(1);
}

const fly = which('flyctl') ? 'flyctl' : 'fly';

const auth = spawnSync(fly, ['auth', 'whoami'], { shell: true, encoding: 'utf8' });
if (auth.status !== 0) {
  console.log('Нужен вход в Fly.io — открою браузер…');
  run(fly, ['auth', 'login']);
}

if (!existsSync(path.join(root, 'fly.toml'))) {
  console.error('Нет fly.toml');
  process.exit(1);
}

const toml = readFileSync(path.join(root, 'fly.toml'), 'utf8');
const appMatch = toml.match(/^app\s*=\s*['"]([^'"]+)['"]/m);
const app = appMatch?.[1] ?? 'rpg-table-purrple';

run(fly, ['apps', 'create', app, '--org', 'personal'], true);
run(fly, ['volumes', 'create', 'rpg_data', '--region', 'fra', '--size', '1', '--app', app, '--yes'], true);
run(fly, ['deploy', '--ha=false', '--app', app]);

const hostname = `${app}.fly.dev`;
const publicUrl = `https://${hostname}`;
run(fly, ['secrets', 'set', `PUBLIC_URL=${publicUrl}`, '--app', app], true);
writeFileSync(urlFile, `${publicUrl}\n`, 'utf8');

console.log('');
console.log('========================================');
console.log('  ИГРА ВСЕГДА ОНЛАЙН (ПК не нужен):');
console.log(`  ${publicUrl}`);
console.log('========================================');
console.log('Обновления: npm run deploy:fly');
console.log('');
