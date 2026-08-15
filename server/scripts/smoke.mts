/**
 * Integration smoke test against a running server (Socket.IO).
 * Usage: node --import tsx server/scripts/smoke.mts
 */
import { io, type Socket } from 'socket.io-client';
import {
  ClientEvents,
  ServerEvents,
  type Character,
  type CharacterSummary,
  type RollResult,
  type SessionInfo,
  type RoomPublic,
} from '@rpg-table/shared';

const URL = process.env.SMOKE_URL ?? 'http://localhost:3001';

type Ack =
  | { ok: true; data?: unknown }
  | { ok: false; error: { code: string; message: string } };

function emit<T>(socket: Socket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    socket.timeout(5000).emit(event, payload, (err: Error | null, res: Ack) => {
      if (err) return reject(err);
      if (!res?.ok) return reject(new Error(res?.error?.message ?? 'ack failed'));
      resolve(res.data as T);
    });
  });
}

function waitForRoll(socket: Socket, timeoutMs = 3000): Promise<RollResult | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      socket.off(ServerEvents.ROLL_RESULT, onRoll);
      resolve(null);
    }, timeoutMs);
    function onRoll(roll: RollResult) {
      clearTimeout(t);
      resolve(roll);
    }
    socket.once(ServerEvents.ROLL_RESULT, onRoll);
  });
}

let failed = 0;
function check(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    console.error(`  ✗ ${msg}`);
    failed++;
  }
}

async function main() {
  console.log(`smoke @ ${URL}`);

  const gm = io(URL, { transports: ['websocket'] });
  const player = io(URL, { transports: ['websocket'] });
  const other = io(URL, { transports: ['websocket'] });

  await Promise.all([
    new Promise<void>((r) => gm.on('connect', () => r())),
    new Promise<void>((r) => player.on('connect', () => r())),
    new Promise<void>((r) => other.on('connect', () => r())),
  ]);

  const created = await emit<{
    session: SessionInfo;
    room: RoomPublic;
    characters?: Character[];
    summaries?: CharacterSummary[];
  }>(gm, ClientEvents.ROOM_CREATE, { playerName: 'МастерТест', roomName: 'Smoke' });
  check(!!created.session.sessionToken, 'create room + session');
  check(created.session.role === 'GM', 'creator is GM');
  check(/^DND-[A-Z0-9]{5}$/.test(created.room.code), `room code format (${created.room.code})`);
  check((created.characters?.length ?? 0) >= 1, 'GM gets own character');

  const joined = await emit<{
    session: SessionInfo;
    room: RoomPublic;
    characters?: Character[];
    summaries?: CharacterSummary[];
  }>(player, ClientEvents.ROOM_JOIN, { playerName: 'Алекс', code: created.room.code });
  check(joined.session.role === 'PLAYER', 'joiner is PLAYER');
  check(joined.room.players.length >= 2, 'two players in room');
  check((joined.characters?.length ?? 0) === 1, 'player receives only own character');
  const alexChar = joined.characters?.[0];
  check(!!alexChar && alexChar.ownerPlayerId === joined.session.playerId, 'player character owned by self');

  const otherJoined = await emit<{
    session: SessionInfo;
    room: RoomPublic;
    characters?: Character[];
  }>(other, ClientEvents.ROOM_JOIN, {
    playerName: 'Кирилл',
    code: created.room.code,
  });
  check((otherJoined.characters?.length ?? 0) === 1, 'other player receives only own character');
  check(
    otherJoined.characters?.[0]?.id !== alexChar?.id,
    'other player does not receive Alex character',
  );

  // Public roll from player — everyone should receive
  const publicWait = Promise.all([
    waitForRoll(gm),
    waitForRoll(player),
    waitForRoll(other),
  ]);
  await emit(player, ClientEvents.ROLL_REQUEST, {
    visibility: 'PUBLIC',
    groups: [
      { id: 'g1', dice: [{ sides: 20, count: 1 }] },
      { id: 'g2', dice: [{ sides: 6, count: 3 }] },
      {
        id: 'g3',
        dice: [
          { sides: 20, count: 1 },
          { sides: 4, count: 3 },
        ],
      },
    ],
  });
  const [rGm, rPl, rOt] = await publicWait;
  check(!!rGm && !!rPl && !!rOt, 'PUBLIC roll delivered to all');
  check(rGm!.groups.length === 3, 'three group results');
  check(
    rGm!.groups.every((g) => g.diceTotal === g.dice.reduce((s, d) => s + d.value, 0) && g.total === g.diceTotal),
    'group totals match dice (no modifier)',
  );
  check(rGm!.id === rPl!.id && rPl!.id === rOt!.id, 'same roll id for all recipients');

  // PLAYER_AND_GM — other player must NOT receive
  const secretPlayerWaits = Promise.all([
    waitForRoll(gm),
    waitForRoll(player),
    waitForRoll(other, 1200),
  ]);
  await emit(player, ClientEvents.ROLL_REQUEST, {
    visibility: 'PLAYER_AND_GM',
    groups: [{ id: 's1', dice: [{ sides: 20, count: 1 }] }],
  });
  const [spGm, spPl, spOt] = await secretPlayerWaits;
  check(!!spGm && !!spPl, 'PLAYER_AND_GM visible to roller + GM');
  check(spOt === null, 'PLAYER_AND_GM hidden from other player');

  // GM_ONLY — players must NOT receive
  const gmOnlyWaits = Promise.all([
    waitForRoll(gm),
    waitForRoll(player, 1200),
    waitForRoll(other, 1200),
  ]);
  await emit(gm, ClientEvents.ROLL_REQUEST, {
    visibility: 'GM_ONLY',
    groups: [{ id: 'gm1', dice: [{ sides: 20, count: 1 }] }],
  });
  const [goGm, goPl, goOt] = await gmOnlyWaits;
  check(!!goGm, 'GM_ONLY visible to GM');
  check(goPl === null && goOt === null, 'GM_ONLY hidden from players');

  // Max dice rejection
  let rejected = false;
  try {
    await emit(player, ClientEvents.ROLL_REQUEST, {
      visibility: 'PUBLIC',
      groups: [{ id: 'x', dice: [{ sides: 6, count: 21 }] }],
    });
  } catch {
    rejected = true;
  }
  check(rejected, 'rejects 21 dice');

  // Player cannot use GM_ONLY
  let badVis = false;
  try {
    await emit(player, ClientEvents.ROLL_REQUEST, {
      visibility: 'GM_ONLY',
      groups: [{ id: 'x', dice: [{ sides: 20, count: 1 }] }],
    });
  } catch {
    badVis = true;
  }
  check(badVis, 'player cannot request GM_ONLY');

  // Reconnect
  const token = joined.session.sessionToken;
  player.disconnect();
  const player2 = io(URL, { transports: ['websocket'] });
  await new Promise<void>((r) => player2.on('connect', () => r()));
  const recon = await emit<{ session: SessionInfo; room: RoomPublic }>(
    player2,
    ClientEvents.ROOM_RECONNECT,
    { sessionToken: token },
  );
  check(recon.session.playerId === joined.session.playerId, 'reconnect keeps player id');
  check(recon.session.role === 'PLAYER', 'reconnect keeps role');

  // --- Character sheets + server-side modifiers ---
  if (!alexChar) throw new Error('alex character missing');

  await emit(player2, ClientEvents.CHARACTER_UPDATE_ATTRIBUTE, {
    characterId: alexChar.id,
    attribute: 'strength',
    value: 4,
  });
  await emit(player2, ClientEvents.CHARACTER_UPDATE_ATTRIBUTE, {
    characterId: alexChar.id,
    attribute: 'dexterity',
    value: -2,
  });

  const strWait = Promise.all([waitForRoll(gm), waitForRoll(player2), waitForRoll(other, 1200)]);
  await emit(player2, ClientEvents.ROLL_REQUEST, {
    visibility: 'PUBLIC',
    groups: [
      {
        id: 'str1',
        dice: [{ sides: 20, count: 1 }],
        characterId: alexChar.id,
        attribute: 'strength',
        modifier: 999,
      },
    ],
  });
  const [strGm] = await strWait;
  check(!!strGm, 'strength roll delivered');
  check(strGm!.groups[0]!.modifier?.value === 4, 'server used sheet strength +4, not client 999');
  check(
    strGm!.groups[0]!.total === strGm!.groups[0]!.diceTotal + 4,
    'strength total = dice + 4',
  );

  const dexWait = waitForRoll(gm);
  await emit(player2, ClientEvents.ROLL_REQUEST, {
    visibility: 'PUBLIC',
    groups: [
      {
        id: 'dex1',
        dice: [{ sides: 20, count: 1 }],
        characterId: alexChar.id,
        attribute: 'dexterity',
      },
    ],
  });
  const dexRoll = await dexWait;
  check(dexRoll?.groups[0]?.modifier?.value === -2, 'server used sheet dexterity -2');
  check(
    !!dexRoll && dexRoll.groups[0]!.total === dexRoll.groups[0]!.diceTotal - 2,
    'dexterity total = dice - 2',
  );

  let stolen = false;
  try {
    await emit(other, ClientEvents.CHARACTER_UPDATE_ATTRIBUTE, {
      characterId: alexChar.id,
      attribute: 'strength',
      value: 20,
    });
  } catch {
    stolen = true;
  }
  check(stolen, 'other player cannot edit Alex sheet via WS');

  const httpSteal = await fetch(
    `${URL}/api/characters/${alexChar.id}?sessionToken=${otherJoined.session.sessionToken}`,
  );
  check(httpSteal.status === 403 || httpSteal.status === 404, 'HTTP deny other character');
  const stealJson = (await httpSteal.json()) as { ok?: boolean };
  check(stealJson.ok !== true, 'HTTP body does not leak other character');

  const ownHttp = await fetch(
    `${URL}/api/characters/${alexChar.id}?sessionToken=${joined.session.sessionToken}`,
  );
  const ownJson = (await ownHttp.json()) as { ok?: boolean; data?: { character?: Character } };
  check(ownJson.ok === true && ownJson.data?.character?.strength === 4, 'owner can read own sheet via HTTP');

  const gmHttp = await fetch(
    `${URL}/api/characters/${alexChar.id}?sessionToken=${created.session.sessionToken}`,
  );
  const gmJson = (await gmHttp.json()) as { ok?: boolean; data?: { character?: Character } };
  check(gmJson.ok === true && gmJson.data?.character?.dexterity === -2, 'GM can read player sheet via HTTP');

  await emit(player2, ClientEvents.CHARACTER_CREATE_TEXT, {
    characterId: alexChar.id,
    block: {
      id: 'textblk01-smoke-block',
      page: 2,
      x: 0.12,
      y: 0.22,
      width: 0.3,
      text: 'Длинный меч',
      fontSize: 16,
      align: 'left',
    },
  });
  const afterText = await emit<{ session: SessionInfo; room: RoomPublic; characters?: Character[] }>(
    player2,
    ClientEvents.ROOM_RECONNECT,
    { sessionToken: token },
  );
  const restored = afterText.characters?.[0];
  check(
    !!restored?.sheetData.textBlocks.some((b) => b.text === 'Длинный меч' && b.page === 2),
    'text block persisted after reconnect',
  );

  gm.disconnect();
  player2.disconnect();
  other.disconnect();

  console.log(failed === 0 ? '\nAll smoke checks passed' : `\n${failed} smoke checks failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
