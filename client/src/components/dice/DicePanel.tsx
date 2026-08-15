import { useCallback, useMemo, useState } from 'react';
import { v4 as uuid } from 'uuid';
import {
  ATTRIBUTE_LABELS,
  CHARACTER_ATTRIBUTES,
  DICE_SIDES,
  MAX_DICE_PER_ROLL,
  allowedVisibilitiesForRole,
  countDiceInGroups,
  createEmptyDiceSelection,
  formatDiceExpression,
  formatModifier,
  setDieCount,
  type CharacterAttribute,
  type DiceSelection,
  type DiceSides,
  type Role,
  type RollGroupInput,
  type RollMode,
  type RollVisibility,
} from '@rpg-table/shared';
import { useSocket } from '../../networking/SocketProvider';
import { DieIcon } from './DieIcon';

interface LocalGroup {
  id: string;
  dice: DiceSelection[];
  characterId?: string;
  attribute?: CharacterAttribute;
}

function newGroup(): LocalGroup {
  const dice = createEmptyDiceSelection();
  // Default: 1d20 for first convenience when empty — caller decides
  return { id: uuid(), dice };
}

function newGroupWithD20(): LocalGroup {
  const g = newGroup();
  g.dice = setDieCount(g.dice, 20, 1);
  return g;
}

export function DicePanel({ role }: { role: Role }) {
  const { requestRoll, connected, characters, session } = useSocket();
  const myCharacter = characters.find((c) => c.ownerPlayerId === session?.playerId);
  const [groups, setGroups] = useState<LocalGroup[]>(() => [newGroupWithD20()]);
  const [mode, setMode] = useState<RollMode>('combined');
  const visOptions = allowedVisibilitiesForRole(role);
  const [visibility, setVisibility] = useState<RollVisibility>(visOptions[0]!);
  const [busy, setBusy] = useState(false);

  const totalDice = useMemo(
    () => countDiceInGroups(groups.map((g) => ({ id: g.id, dice: g.dice }))),
    [groups],
  );

  const updateCount = useCallback(
    (groupId: string, sides: DiceSides, next: number) => {
      setGroups((prev) =>
        prev.map((g) => {
          if (g.id !== groupId) return g;
          const current = g.dice.find((d) => d.sides === sides)?.count ?? 0;
          const others = countDiceInGroups(
            prev.filter((x) => x.id !== groupId).map((x) => ({ id: x.id, dice: x.dice })),
          );
          const groupOthers = g.dice
            .filter((d) => d.sides !== sides)
            .reduce((s, d) => s + d.count, 0);
          const maxForThis = MAX_DICE_PER_ROLL - others - groupOthers;
          const clamped = Math.max(0, Math.min(next, maxForThis, MAX_DICE_PER_ROLL));
          if (clamped === current) return g;
          return { ...g, dice: setDieCount(g.dice, sides, clamped) };
        }),
      );
    },
    [],
  );

  const addGroup = () => {
    if (groups.length >= 12) return;
    setGroups((prev) => [...prev, newGroup()]);
  };

  const removeGroup = (id: string) => {
    setGroups((prev) => (prev.length <= 1 ? prev : prev.filter((g) => g.id !== id)));
  };

  const resetDice = () => {
    setGroups((prev) =>
      prev.map((g) => ({ ...g, dice: createEmptyDiceSelection() })),
    );
  };

  const toPayloadGroups = (list: LocalGroup[]): RollGroupInput[] =>
    list.map((g) => {
      const characterId =
        role === 'GM' ? g.characterId : myCharacter?.id;
      const out: RollGroupInput = {
        id: g.id,
        dice: g.dice.filter((d) => d.count > 0),
      };
      if (g.attribute && characterId) {
        out.attribute = g.attribute;
        out.characterId = characterId;
      }
      return out;
    });

  async function rollAll() {
    const payloadGroups = toPayloadGroups(groups).filter((g) => g.dice.length > 0);
    if (payloadGroups.length === 0) return;
    setBusy(true);
    try {
      await requestRoll({ visibility, groups: payloadGroups });
    } finally {
      setBusy(false);
    }
  }

  async function rollOne(groupId: string) {
    const payloadGroups = toPayloadGroups(groups);
    const target = payloadGroups.find((g) => g.id === groupId);
    if (!target || target.dice.length === 0) return;
    setBusy(true);
    try {
      await requestRoll({ visibility, groups: payloadGroups, groupId });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dice-panel">
      <div className="actions-bar">
        <div className="seg-control" role="group" aria-label="Режим броска">
          <button
            type="button"
            className={mode === 'combined' ? 'active' : ''}
            onClick={() => setMode('combined')}
          >
            Общий бросок
          </button>
          <button
            type="button"
            className={mode === 'separate' ? 'active' : ''}
            onClick={() => setMode('separate')}
          >
            Бросать отдельно
          </button>
        </div>
        <div className="seg-control" role="group" aria-label="Видимость">
          {visOptions.map((v) => (
            <button
              key={v}
              type="button"
              className={visibility === v ? 'active' : ''}
              onClick={() => setVisibility(v)}
            >
              {visibilityLabel(v, role)}
            </button>
          ))}
        </div>
      </div>

      <p className={`dice-budget ${totalDice >= MAX_DICE_PER_ROLL ? 'warn' : ''}`}>
        Кубиков: {totalDice} / {MAX_DICE_PER_ROLL}
      </p>

      {groups.map((group, index) => (
        <div key={group.id} className="roll-group">
          <div className="roll-group-header">
            <strong>
              Группа {index + 1}
              <span style={{ color: 'var(--text-muted)', fontWeight: 500, marginLeft: 8 }}>
                {formatDiceExpression(group.dice)}
              </span>
            </strong>
            <div style={{ display: 'flex', gap: 6 }}>
              {mode === 'separate' && (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ padding: '0.4rem 0.75rem' }}
                  disabled={busy || !connected || countDiceInGroups([{ id: group.id, dice: group.dice }]) === 0}
                  onClick={() => void rollOne(group.id)}
                >
                  Бросить
                </button>
              )}
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: '0.4rem 0.6rem' }}
                disabled={groups.length <= 1}
                onClick={() => removeGroup(group.id)}
                aria-label="Удалить группу"
              >
                ✕
              </button>
            </div>
          </div>
          <div className="mod-row">
            {role === 'GM' && (
              <label>
                Персонаж
                <select
                  value={group.characterId ?? ''}
                  onChange={(e) =>
                    setGroups((prev) =>
                      prev.map((g) =>
                        g.id === group.id ? { ...g, characterId: e.target.value || undefined } : g,
                      ),
                    )
                  }
                >
                  <option value="">Без персонажа</option>
                  {characters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name || 'Без имени'}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Характеристика
              <select
                value={group.attribute ?? ''}
                onChange={(e) =>
                  setGroups((prev) =>
                    prev.map((g) =>
                      g.id === group.id
                        ? {
                            ...g,
                            attribute: (e.target.value || undefined) as CharacterAttribute | undefined,
                          }
                        : g,
                    ),
                  )
                }
              >
                <option value="">Без модификатора</option>
                {CHARACTER_ATTRIBUTES.map((attr) => {
                  const targetId = role === 'GM' ? group.characterId : myCharacter?.id;
                  const target = characters.find((c) => c.id === targetId);
                  const bonus = target ? formatModifier(target[attr]) : '';
                  return (
                    <option key={attr} value={attr}>
                      {ATTRIBUTE_LABELS[attr]}
                      {target ? ` ${bonus}` : ''}
                    </option>
                  );
                })}
              </select>
            </label>
          </div>
          <div className="dice-grid">
            {DICE_SIDES.map((sides) => {
              const count = group.dice.find((d) => d.sides === sides)?.count ?? 0;
              const canInc = totalDice < MAX_DICE_PER_ROLL;
              return (
                <div key={sides} className={`die-card ${count > 0 ? 'active' : ''}`}>
                  <DieIcon sides={sides} className="die-icon" />
                  <span className="die-label">D{sides}</span>
                  <div className="counter">
                    <button
                      type="button"
                      disabled={count <= 0}
                      onClick={() => updateCount(group.id, sides, count - 1)}
                      aria-label={`Убрать D${sides}`}
                    >
                      −
                    </button>
                    <span>{count}</span>
                    <button
                      type="button"
                      disabled={!canInc}
                      onClick={() => updateCount(group.id, sides, count + 1)}
                      aria-label={`Добавить D${sides}`}
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="actions-bar">
        <button type="button" className="btn btn-secondary" onClick={addGroup}>
          + Добавить бросок
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={totalDice === 0}
          onClick={resetDice}
        >
          Сброс
        </button>
        {mode === 'combined' && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !connected || totalDice === 0}
            onClick={() => void rollAll()}
          >
            Бросить
          </button>
        )}
      </div>
    </div>
  );
}

function visibilityLabel(v: RollVisibility, role: Role): string {
  if (v === 'PUBLIC') return 'Открытый';
  if (v === 'GM_ONLY') return 'Скрытый';
  if (v === 'PLAYER_AND_GM') return role === 'GM' ? 'Игрок+мастер' : 'Скрытый';
  return v;
}
