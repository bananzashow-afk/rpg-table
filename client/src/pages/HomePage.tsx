import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SavedRoomSummary } from '@rpg-table/shared';
import { useSocket } from '../networking/SocketProvider';
import { forgetSession, loadKnownSessions, saveSession } from '../storage/local';

export function HomePage() {
  const navigate = useNavigate();
  const { connected, createRoom, joinRoom, lastError, clearError, session, room, reconnectSession } =
    useSocket();
  const [createName, setCreateName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [joinName, setJoinName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [savedRooms, setSavedRooms] = useState<SavedRoomSummary[]>([]);

  useEffect(() => {
    const tokens = loadKnownSessions().map((s) => s.sessionToken);
    if (tokens.length === 0) {
      setSavedRooms([]);
      return;
    }
    void fetch('/api/sessions/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokens }),
    })
      .then((r) => r.json())
      .then((json: { ok?: boolean; data?: { rooms?: SavedRoomSummary[] } }) => {
        if (json?.ok && json.data?.rooms) setSavedRooms(json.data.rooms);
      })
      .catch(() => {
        /* ignore */
      });
  }, [session, room]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    clearError();
    setBusy(true);
    try {
      const next = await createRoom({
        playerName: createName.trim(),
        roomName: roomName.trim() || undefined,
      });
      navigate(`/room/${next.roomCode}`);
    } catch {
      /* error in context */
    } finally {
      setBusy(false);
    }
  }

  async function onJoin(e: FormEvent) {
    e.preventDefault();
    clearError();
    setBusy(true);
    try {
      const next = await joinRoom({
        playerName: joinName.trim(),
        code: joinCode.trim(),
      });
      navigate(`/room/${next.roomCode}`);
    } catch {
      /* error in context */
    } finally {
      setBusy(false);
    }
  }

  async function onContinue(item: SavedRoomSummary) {
    clearError();
    setBusy(true);
    try {
      saveSession({
        sessionToken: item.sessionToken,
        playerId: item.roomId,
        roomId: item.roomId,
        roomCode: item.roomCode,
        role: item.role,
        playerName: item.playerName,
      });
      const restored = await reconnectSession();
      if (!restored) {
        forgetSession(item.sessionToken);
        setSavedRooms((prev) => prev.filter((r) => r.sessionToken !== item.sessionToken));
        return;
      }
      navigate(`/room/${restored.roomCode}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="home-hero">
        <p className="status-pill" style={{ marginBottom: '1rem' }}>
          <span className={`status-dot ${connected ? 'on' : ''}`} />
          {connected ? 'Сервер онлайн' : 'Подключение…'}
        </p>
        <h1 className="brand">RPG Table</h1>
        <p className="brand-sub">Онлайн-комнаты для D&amp;D и настольных RPG</p>
      </header>

      {session && room && (
        <div className="panel" style={{ marginBottom: '1rem', textAlign: 'center' }}>
          <p style={{ marginTop: 0 }}>
            Активная сессия: <strong>{room.code}</strong> ({session.playerName})
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate(`/room/${session.roomCode}`)}
          >
            Вернуться в комнату
          </button>
        </div>
      )}

      {savedRooms.length > 0 && (
        <section className="panel continue-panel">
          <h2 className="panel-title">Продолжить игру</h2>
          <ul className="continue-list">
            {savedRooms.map((item) => (
              <li key={item.sessionToken}>
                <div>
                  <strong>{item.roomName}</strong>
                  <div className="continue-meta">
                    {item.roomCode} · {item.playerCount}{' '}
                    {pluralPlayers(item.playerCount)} · {item.role === 'GM' ? 'мастер' : item.playerName}
                    <br />
                    Последняя игра: {formatLastPlayed(item.lastPlayedAt)}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => void onContinue(item)}
                >
                  Продолжить
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {lastError && (
        <div className="error-banner" role="alert">
          {lastError.message}
        </div>
      )}

      <div className="home-grid">
        <form className="panel" onSubmit={onCreate}>
          <h2 className="panel-title">Создать комнату</h2>
          <p style={{ marginTop: 0, color: 'var(--text-muted)', fontSize: '0.92rem' }}>
            Вы станете <strong>мастером</strong>. Получите код и ссылку для игроков.
          </p>
          <div className="field">
            <label htmlFor="create-name">Ваше имя</label>
            <input
              id="create-name"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="Мастер"
              maxLength={32}
              required
              autoComplete="nickname"
            />
          </div>
          <div className="field">
            <label htmlFor="room-name">Название комнаты (необязательно)</label>
            <input
              id="room-name"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="Кампания у костра"
              maxLength={48}
            />
          </div>
          <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
            Создать комнату
          </button>
        </form>

        <form className="panel" onSubmit={onJoin}>
          <h2 className="panel-title">Подключиться к комнате</h2>
          <p style={{ marginTop: 0, color: 'var(--text-muted)', fontSize: '0.92rem' }}>
            Введите имя и код комнаты — или откройте ссылку-приглашение.
          </p>
          <div className="field">
            <label htmlFor="join-name">Ваше имя</label>
            <input
              id="join-name"
              value={joinName}
              onChange={(e) => setJoinName(e.target.value)}
              placeholder="Алекс"
              maxLength={32}
              required
              autoComplete="nickname"
            />
          </div>
          <div className="field">
            <label htmlFor="join-code">Код комнаты</label>
            <input
              id="join-code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="DND-8K4M2"
              required
              autoCapitalize="characters"
              spellCheck={false}
            />
          </div>
          <button className="btn btn-secondary btn-block" type="submit" disabled={busy}>
            Войти
          </button>
        </form>
      </div>
    </div>
  );
}

function pluralPlayers(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'игрок';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'игрока';
  return 'игроков';
}

function formatLastPlayed(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'только что';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} мин. назад`;
  const a = new Date(ts);
  const b = new Date();
  const startA = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const startB = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  const days = Math.round((startB - startA) / 86_400_000);
  if (days === 0) return 'сегодня';
  if (days === 1) return 'вчера';
  return a.toLocaleDateString('ru-RU');
}
