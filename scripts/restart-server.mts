#!/usr/bin/env node
/**
 * Restart the game server on PORT (default 3001).
 * Leaves public tunnels (tunnelmole) untouched so the same URL keeps working.
 */
import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = process.env.PORT || '3001';
const extraPorts = (process.env.FREE_PORTS || '3002')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function pidsOnPort(port: string): number[] {
  try {
    if (process.platform === 'win32') {
      const out = execSync(
        `powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue).OwningProcess | Select-Object -Unique"`,
        { encoding: 'utf8' },
      );
      return out
        .split(/\r?\n/)
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0 && n !== process.pid);
    }
    const out = execSync(`lsof -t -iTCP:${port} -sTCP:LISTEN || true`, { encoding: 'utf8' });
    return out
      .split(/\s+/)
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0 && n !== process.pid);
  } catch {
    return [];
  }
}

const existing = [...new Set([...pidsOnPort(PORT), ...extraPorts.flatMap((p) => pidsOnPort(p))])];
for (const pid of existing) {
  console.log(`Освобождаю порт ${PORT} (pid ${pid})…`);
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGTERM');
    }
  } catch {
    /* already gone */
  }
}

if (existing.length) {
  await new Promise((r) => setTimeout(r, 800));
}

console.log(`Запускаю RPG Table на порту ${PORT}…`);
const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'serve'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, PORT },
  shell: true,
});

child.on('exit', (code) => process.exit(code ?? 0));
