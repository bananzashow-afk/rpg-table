/**
 * Lightweight validation / privacy smoke tests for shared dice logic.
 * Run: node --experimental-strip-types shared/src/dice.test.ts
 * Or after build: node shared/dist/dice.test.js
 */
import {
  canViewerSeeRoll,
  canUseVisibility,
  validateRollRequest,
  resolveGroups,
} from './dice.js';
import { MAX_DICE_PER_ROLL } from './types.js';

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

console.log('dice / visibility tests');

assert(canUseVisibility('GM', 'PUBLIC'), 'GM can PUBLIC');
assert(canUseVisibility('GM', 'GM_ONLY'), 'GM can GM_ONLY');
assert(!canUseVisibility('GM', 'PLAYER_AND_GM'), 'GM cannot PLAYER_AND_GM');
assert(canUseVisibility('PLAYER', 'PUBLIC'), 'PLAYER can PUBLIC');
assert(canUseVisibility('PLAYER', 'PLAYER_AND_GM'), 'PLAYER can PLAYER_AND_GM');
assert(!canUseVisibility('PLAYER', 'GM_ONLY'), 'PLAYER cannot GM_ONLY');

assert(
  canViewerSeeRoll({
    visibility: 'GM_ONLY',
    rollerId: 'gm',
    rollerRole: 'GM',
    viewerId: 'p1',
    viewerRole: 'PLAYER',
  }) === false,
  'player cannot see GM_ONLY',
);

assert(
  canViewerSeeRoll({
    visibility: 'PLAYER_AND_GM',
    rollerId: 'p1',
    rollerRole: 'PLAYER',
    viewerId: 'p2',
    viewerRole: 'PLAYER',
  }) === false,
  'other player cannot see PLAYER_AND_GM',
);

assert(
  canViewerSeeRoll({
    visibility: 'PLAYER_AND_GM',
    rollerId: 'p1',
    rollerRole: 'PLAYER',
    viewerId: 'gm',
    viewerRole: 'GM',
  }) === true,
  'GM can see PLAYER_AND_GM',
);

const over = validateRollRequest(
  {
    visibility: 'PUBLIC',
    groups: [
      {
        id: 'g1',
        dice: [{ sides: 6, count: MAX_DICE_PER_ROLL + 1 }],
      },
    ],
  },
  'PLAYER',
);
assert(!over.ok, 'rejects >20 dice');

const ok = validateRollRequest(
  {
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
  },
  'PLAYER',
);
assert(ok.ok, 'accepts multi-group roll');

if (ok.ok) {
  let i = 0;
  const fakeRng = (size: number) => {
    const a = new Uint8Array(size);
    a[0] = (i++ * 17) % 256;
    return a;
  };
  const groups = resolveGroups(ok.groups, fakeRng);
  assert(groups.length === 3, 'three group results');
  assert(groups[0]!.dice.length === 1, 'group1: 1 die');
  assert(groups[1]!.dice.length === 3, 'group2: 3 dice');
  assert(groups[2]!.dice.length === 4, 'group3: 4 dice');
  for (const g of groups) {
    const sum = g.dice.reduce((s, d) => s + d.value, 0);
    assert(sum === g.diceTotal, `group ${g.id} diceTotal matches`);
    assert(sum === g.total, `group ${g.id} total matches`);
    assert(!g.modifier, `group ${g.id} has no client modifier`);
    for (const d of g.dice) {
      assert(d.value >= 1 && d.value <= d.sides, `die D${d.sides}=${d.value} in range`);
    }
  }
}

const withFakeMod = validateRollRequest(
  {
    visibility: 'PUBLIC',
    groups: [
      {
        id: 'hack',
        dice: [{ sides: 20, count: 1 }],
        attribute: 'strength',
        characterId: 'char_test01',
        modifier: 999,
      } as never,
    ],
  },
  'PLAYER',
);
assert(withFakeMod.ok, 'accepts attribute + characterId');
if (withFakeMod.ok) {
  assert(withFakeMod.groups[0]!.attribute === 'strength', 'keeps attribute key');
  assert(withFakeMod.groups[0]!.characterId === 'char_test01', 'keeps characterId');
  assert(!('modifier' in withFakeMod.groups[0]!), 'strips client modifier');
}

const badVis = validateRollRequest(
  { visibility: 'GM_ONLY', groups: [{ id: 'g', dice: [{ sides: 20, count: 1 }] }] },
  'PLAYER',
);
assert(!badVis.ok, 'player cannot request GM_ONLY');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
