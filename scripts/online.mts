#!/usr/bin/env node
/**
 * Public URL via Tunnelmole (no interstitial).
 * Keeps / reuses https://sk3lis-ip-95-135-228-35.tunnelmole.net when possible.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = process.env.PORT || '3001';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const urlFile = path.join(root, '.public-url');
const PREFERRED =
  (process.env.PUBLIC_TUNNEL_HOST || 'sk3lis-ip-95-135-228-35.tunnelmole.net')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');

let published: string | null = null;
let child: ChildProcess | null = null;

function saveUrl(url: string) {
  const clean = url.replace(/[),.;]+$/, '').replace(/\/$/, '');
  published = clean;
  writeFileSync(urlFile, `${clean}\n`, 'utf8');
  console.log('');
  console.log('========================================');
  console.log('  ИГРА — одна ссылка для всех:');
  console.log(`  ${clean}`);
  console.log('========================================');
  console.log('Обновления: npm start  (туннель не трогать)');
  console.log('Остановка туннеля: Ctrl+C');
  console.log('');
}

async function urlAlive(host: string): Promise<boolean> {
  try {
    const res = await fetch(`https://${host}/api/health`, {
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function scanLine(line: string) {
  console.log(line);
  const m = line.match(/https:\/\/[a-z0-9.-]+\.tunnelmole\.(?:net|com)/i);
  if (m) saveUrl(m[0]);
}

async function keepAlive() {
  await new Promise<void>((resolve) => {
    const stop = () => {
      child?.kill();
      resolve();
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    child?.on('exit', () => resolve());
  });
}

const saved = existsSync(urlFile) ? readFileSync(urlFile, 'utf8').trim() : '';
const savedHost = saved.replace(/^https?:\/\//, '').replace(/\/$/, '');
const tryHosts = [...new Set([PREFERRED, savedHost].filter(Boolean))];

for (const host of tryHosts) {
  if (await urlAlive(host)) {
    saveUrl(`https://${host}`);
    console.log('Туннель уже работает — оставляю как есть.');
    await new Promise(() => {
      /* keep process open so npm run online stays "running" */
    });
    process.exit(0);
  }
}

console.log('');
console.log(`Публичный туннель → localhost:${PORT}`);
console.log(`Желаемый хост: ${PREFERRED}`);
console.log('Сервер должен слушать этот порт (npm start).');
console.log('');

// Custom subdomains need a Tunnelmole subscription — free mode gets a random URL.
// For always-on with PC off use: npm run deploy:fly
console.log('→ npx --yes tunnelmole@2.3.1', PORT);
console.log('(фиксированный хост только с подпиской Tunnelmole; для ПК выкл. — Fly.io)\n');

child = spawn('npx', ['--yes', 'tunnelmole@2.3.1', PORT], {
  cwd: root,
  shell: true,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env },
});

if (child.stdout) createInterface({ input: child.stdout }).on('line', scanLine);
if (child.stderr) createInterface({ input: child.stderr }).on('line', scanLine);

child.on('exit', (code) => {
  if (!published) process.exit(code ?? 1);
});

await keepAlive();
