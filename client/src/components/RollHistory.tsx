import { formatModifier, type RollHistoryEntry } from '@rpg-table/shared';

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function summarize(entry: RollHistoryEntry): string {
  return entry.groups
    .map((g) => {
      const vals = g.dice.map((d) => d.value).join(' + ');
      if (g.modifier) {
        return `${g.expression} (${vals}) + ${g.modifier.label} (${formatModifier(g.modifier.value)}) = ${g.total}`;
      }
      return `${g.expression} → ${vals} = ${g.total}`;
    })
    .join(' · ');
}

function visibilityLabel(v: RollHistoryEntry['visibility']): string {
  switch (v) {
    case 'PUBLIC':
      return '';
    case 'PLAYER_AND_GM':
      return 'скрытый';
    case 'GM_ONLY':
      return 'только мастер';
    default:
      return '';
  }
}

export function RollHistory({ history }: { history: RollHistoryEntry[] }) {
  if (history.length === 0) {
    return <p style={{ color: 'var(--text-muted)', margin: 0 }}>Пока нет бросков</p>;
  }

  const items = [...history].reverse();

  return (
    <ul className="history-list">
      {items.map((entry) => {
        const secret = entry.visibility !== 'PUBLIC';
        const tag = visibilityLabel(entry.visibility);
        return (
          <li key={entry.id} className={`history-item ${secret ? 'secret' : ''}`}>
            <div className="history-meta">
              {formatTime(entry.timestamp)} · {entry.playerName}
              {entry.role === 'GM' ? ' (мастер)' : ''}
              {tag ? ` · ${tag}` : ''}
            </div>
            <div>{summarize(entry)}</div>
          </li>
        );
      })}
    </ul>
  );
}
