import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSocket } from '../networking/SocketProvider';
import { PlayerList } from '../components/PlayerList';
import { RollHistory } from '../components/RollHistory';
import { DicePanel } from '../components/dice/DicePanel';
import { DiceStage } from '../components/dice/DiceStage';
import { PaletteSettings } from '../components/dice/PaletteSettings';
import { useDicePalette } from '../hooks/useDicePalette';
import { CharacterDock } from '../components/sheet/CharacterDock';
import { CharacterSheetWindow } from '../components/sheet/CharacterSheetWindow';

export function RoomPage() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const {
    connected,
    session,
    room,
    history,
    lastRoll,
    lastError,
    clearError,
    clearLastRoll,
    leaveRoom,
    reconnectSession,
    characters,
    summaries,
  } = useSocket();
  const palette = useDicePalette();
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [stageOpen, setStageOpen] = useState(false);
  const [openSheetId, setOpenSheetId] = useState<string | null>(null);

  useEffect(() => {
    if (lastRoll) setStageOpen(true);
  }, [lastRoll]);

  useEffect(() => {
    if (session && room) return;
    if (!connected) return;

    void reconnectSession().then((s) => {
      if (!s) navigate('/');
    });
  }, [session, room, connected, reconnectSession, navigate]);

  if (!session || !room) {
    return (
      <div className="page">
        <p className="brand-sub">Восстановление сессии…</p>
        <Link to="/">На главную</Link>
      </div>
    );
  }

  const inviteUrl = `${window.location.origin}/join/${room.code}`;

  async function copy(text: string, kind: 'code' | 'link') {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* ignore */
    }
  }

  async function onLeave() {
    await leaveRoom();
    navigate('/');
  }

  return (
    <div className={`page ${stageOpen && lastRoll ? 'page-with-drawer' : ''}`}>
      <div className="room-header">
        <div>
          <p className="status-pill" style={{ marginBottom: '0.5rem' }}>
            <span className={`status-dot ${connected ? 'on' : ''}`} />
            {connected ? 'Подключено' : 'Переподключение…'}
          </p>
          <h1 className="room-code">{room.code}</h1>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)' }}>
            {room.name} · вы — {session.role === 'GM' ? 'мастер' : session.playerName}
          </p>
          <div className="invite-row">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void copy(room.code, 'code')}
            >
              {copied === 'code' ? 'Скопировано' : 'Копировать код'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void copy(inviteUrl, 'link')}
            >
              {copied === 'link' ? 'Скопировано' : 'Копировать ссылку'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => void onLeave()}>
              Выйти
            </button>
          </div>
        </div>
      </div>

      {lastError && (
        <div className="error-banner" role="alert" onClick={clearError}>
          {lastError.message}
        </div>
      )}

      {/* Soft check: URL code vs session */}
      {code.toUpperCase() !== room.code && (
        <div className="error-banner">Код в адресе не совпадает с вашей комнатой ({room.code}).</div>
      )}

      <div className="room-layout">
        <aside>
          <div className="panel">
            <h2 className="panel-title">Участники</h2>
            <PlayerList players={room.players} selfId={session.playerId} />
          </div>
          <div className="panel">
            <h2 className="panel-title">Персонажи</h2>
            <CharacterDock
              role={session.role}
              selfId={session.playerId}
              characters={characters}
              summaries={summaries}
              onOpen={setOpenSheetId}
            />
          </div>
          <div className="panel">
            <h2 className="panel-title">История бросков</h2>
            <RollHistory history={history} />
          </div>
        </aside>

        <main>
          <div className="panel">
            <h2 className="panel-title">Бросить кубики</h2>
            <DicePanel role={session.role} />
          </div>
          <div className="panel">
            <h2 className="panel-title">Палитра кубиков</h2>
            <PaletteSettings palette={palette} />
          </div>
        </main>
      </div>

      {openSheetId && (
        <CharacterSheetWindow characterId={openSheetId} onClose={() => setOpenSheetId(null)} />
      )}

      {stageOpen && lastRoll && (
        <DiceStage
          roll={lastRoll}
          palette={palette.colors}
          onClose={() => {
            setStageOpen(false);
            clearLastRoll();
          }}
        />
      )}
    </div>
  );
}
