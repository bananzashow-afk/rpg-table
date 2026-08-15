#!/usr/bin/env node
/**
 * Public tunnel via localtunnel (fallback when Cloudflare quick tunnel is blocked).
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import localtunnel from 'localtunnel';

const PORT = Number(process.env.PORT || 3001);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const urlFile = path.join(root, '.public-url');

console.log('');
console.log('Поднимаю публичный туннель (localtunnel) → порт', PORT);
console.log('Убедись, что сервер запущен: npm run serve');
console.log('');

const tunnel = await localtunnel({ port: PORT });

writeFileSync(urlFile, tunnel.url + '\n', 'utf8');

console.log('========================================');
console.log('  ПУБЛИЧНАЯ ССЫЛКА (весь интернет):');
console.log(`  ${tunnel.url}`);
console.log('========================================');
console.log('Эту ссылку открывай на телефоне и шли друзьям.');
console.log('Если localtunnel спросит пароль в браузере — это IP твоего ПК');
console.log('(его покажет страница), введи и продолжи.');
console.log('Остановка: Ctrl+C');
console.log('');

tunnel.on('close', () => {
  console.log('Туннель закрыт');
  process.exit(0);
});

tunnel.on('error', (err: Error) => {
  console.error('Ошибка туннеля:', err.message);
  process.exit(1);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    tunnel.close();
  });
}
