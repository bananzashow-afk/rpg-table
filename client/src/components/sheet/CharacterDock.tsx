import { useState } from 'react';
import type { Character, CharacterSummary, Role } from '@rpg-table/shared';

export function CharacterDock({
  role,
  selfId,
  characters,
  summaries,
  onOpen,
}: {
  role: Role;
  selfId: string;
  characters: Character[];
  summaries: CharacterSummary[];
  onOpen: (characterId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const mine = characters.find((c) => c.ownerPlayerId === selfId);

  if (role !== 'GM') {
    return (
      <button
        type="button"
        className="btn btn-secondary btn-block"
        disabled={!mine}
        onClick={() => mine && onOpen(mine.id)}
      >
        Лист персонажа
      </button>
    );
  }

  return (
    <div className="character-dock">
      <div className="actions-bar" style={{ marginBottom: 8 }}>
        <button type="button" className="btn btn-secondary" onClick={() => mine && onOpen(mine.id)} disabled={!mine}>
          Мой лист
        </button>
        <button type="button" className="btn btn-primary" onClick={() => setOpen((v) => !v)}>
          Персонажи
        </button>
      </div>
      {open && (
        <ul className="character-list">
          {summaries.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => onOpen(s.id)}>
                <strong>{s.name || s.ownerName}</strong>
                <span>
                  {s.ownerName}
                  {s.ownerPlayerId === selfId ? ' (вы)' : ''}
                  {s.race ? ` · ${s.race}` : ''}
                </span>
              </button>
            </li>
          ))}
          {summaries.length === 0 && <li className="muted">Пока нет персонажей</li>}
        </ul>
      )}
    </div>
  );
}
