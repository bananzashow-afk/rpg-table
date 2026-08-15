import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { loadEnvFile } from './config/loadEnv.js';
import { loadConfig } from './config.js';
import { RoomStore } from './rooms/RoomStore.js';
import { createSocketServer } from './networking/socketServer.js';
import { registerRoomRoutes } from './http/roomRoutes.js';
import { openDatabase } from './db/database.js';

loadEnvFile();
const config = loadConfig();
const app = express();
const httpServer = createServer(app);
const db = openDatabase();
const store = new RoomStore(db);

app.set('trust proxy', 1);

app.use(
  cors({
    origin: config.corsOrigin === '*' ? true : config.corsOrigin,
  }),
);
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, env: config.nodeEnv, time: Date.now() });
});

registerRoomRoutes(app, store);

app.get('/api/invite/:code', (req, res) => {
  const room = store.getRoomByCode(req.params.code ?? '');
  if (!room) {
    res.status(404).json({ ok: false, error: 'ROOM_NOT_FOUND' });
    return;
  }
  const protoHeader = req.headers['x-forwarded-proto'];
  const proto =
    (typeof protoHeader === 'string' ? protoHeader.split(',')[0]?.trim() : undefined) ||
    req.protocol;
  const host = req.get('host');
  const base = host ? `${proto}://${host}` : config.publicUrl;
  res.json({
    ok: true,
    code: room.code,
    name: room.name,
    inviteUrl: `${base}/join/${room.code}`,
  });
});

const dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist =
  process.env.CLIENT_DIST_PATH ||
  path.resolve(dirname, '../../client/dist');
const clientIndex = path.join(clientDist, 'index.html');
const serveClient = existsSync(clientIndex);

if (serveClient) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      next();
      return;
    }
    res.sendFile(clientIndex, (err) => {
      if (err) next(err);
    });
  });
}

createSocketServer(httpServer, config, store);

httpServer.listen(config.port, config.host, () => {
  const lan = listLanAddresses();
  console.log('');
  console.log('========================================');
  console.log(`  На этом ПК:     http://localhost:${config.port}`);
  for (const ip of lan) {
    console.log(`  С телефона/др: http://${ip}:${config.port}`);
  }
  console.log('========================================');
  if (lan.length === 0) {
    console.log('  [!] LAN IP не найден — проверь Wi‑Fi/Ethernet');
  }
  if (!serveClient) {
    console.log('  [!] client/dist не найден — сначала: npm run build');
  }
  console.log('');
});

function listLanAddresses(): string[] {
  const nets = networkInterfaces();
  const out: string[] = [];
  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const e of entries) {
      if (e.family !== 'IPv4' && (e.family as unknown) !== 4) continue;
      if (e.internal) continue;
      // Skip typical VPN/tunnel ranges for the main hint (still useful sometimes)
      if (e.address.startsWith('10.6.') || e.address.startsWith('172.17.')) continue;
      out.push(e.address);
    }
  }
  return out;
}
