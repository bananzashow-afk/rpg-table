import type { PlayerPublic } from '@rpg-table/shared';

export function PlayerList({
  players,
  selfId,
}: {
  players: PlayerPublic[];
  selfId: string;
}) {
  const sorted = [...players].sort((a, b) => {
    if (a.role !== b.role) return a.role === 'GM' ? -1 : 1;
    return a.joinedAt - b.joinedAt;
  });

  return (
    <ul className="player-list">
      {sorted.map((p) => (
        <li key={p.id} className={`player-item ${p.connected ? '' : 'offline'}`}>
          <div>
            <span className="player-name">
              {p.name}
              {p.id === selfId ? ' (вы)' : ''}
            </span>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
              {p.connected ? 'в сети' : 'офлайн'}
            </div>
          </div>
          <span className={`role-badge ${p.role === 'GM' ? '' : 'player'}`}>
            {p.role === 'GM' ? 'Мастер' : 'Игрок'}
          </span>
        </li>
      ))}
    </ul>
  );
}
