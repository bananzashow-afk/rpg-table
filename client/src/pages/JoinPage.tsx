import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSocket } from '../networking/SocketProvider';

export function JoinPage() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const { joinRoom, lastError, clearError, session } = useSocket();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session && session.roomCode === code.toUpperCase()) {
      navigate(`/room/${session.roomCode}`, { replace: true });
    }
  }, [session, code, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    clearError();
    setBusy(true);
    try {
      const s = await joinRoom({
        playerName: name.trim(),
        code: code.trim(),
      });
      navigate(`/room/${s.roomCode}`);
    } catch {
      /* handled */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="home-hero">
        <h1 className="brand">Приглашение</h1>
        <p className="brand-sub">
          Комната <strong>{code.toUpperCase()}</strong>
        </p>
      </header>

      {lastError && (
        <div className="error-banner" role="alert">
          {lastError.message}
        </div>
      )}

      <form className="panel" style={{ maxWidth: 420, margin: '0 auto' }} onSubmit={onSubmit}>
        <h2 className="panel-title">Войти как игрок</h2>
        <div className="field">
          <label htmlFor="invite-name">Ваше имя</label>
          <input
            id="invite-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Алекс"
            maxLength={32}
            required
            autoFocus
          />
        </div>
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          Подключиться
        </button>
        <p style={{ textAlign: 'center', marginTop: '1rem' }}>
          <Link to="/">На главную</Link>
        </p>
      </form>
    </div>
  );
}
