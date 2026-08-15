import { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, Environment, OrbitControls } from '@react-three/drei';
import { formatModifier, type DieResult, type RollResult } from '@rpg-table/shared';
import { DiceScene } from './DiceScene';

export interface DiceColors {
  body: string;
  number: string;
  mode?: 'solid' | 'rainbow';
}

export function DiceStage({
  roll,
  palette,
  onClose,
}: {
  roll: RollResult;
  palette: DiceColors;
  onClose: () => void;
}) {
  const dice = useMemo(
    () =>
      roll.groups.flatMap((g) =>
        g.dice.map((d, i) => ({
          ...d,
          key: `${g.id}-${i}-${d.sides}-${d.value}`,
          groupId: g.id,
        })),
      ),
    [roll],
  );

  const [settled, setSettled] = useState(false);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    setSettled(false);
    setShowResults(false);
    const settleTimer = window.setTimeout(() => setSettled(true), 2200);
    const resultTimer = window.setTimeout(() => setShowResults(true), 2600);
    return () => {
      window.clearTimeout(settleTimer);
      window.clearTimeout(resultTimer);
    };
  }, [roll.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <aside className="dice-stage-drawer" role="dialog" aria-label="Бросок кубиков">
      <div className="dice-stage-drawer-head">
        <h2 className="roll-result-title">
          Бросок {roll.playerName}
          {roll.visibility !== 'PUBLIC' ? ' · скрытый' : ''}
        </h2>
        <button type="button" className="btn btn-ghost dice-stage-close" onClick={onClose} aria-label="Закрыть">
          ✕
        </button>
      </div>

      <div className="dice-stage-canvas">
        <Canvas
          camera={{ position: [0, 10, 14], fov: 42 }}
          dpr={[1, 1.75]}
          gl={{ antialias: true, alpha: true }}
        >
          <color attach="background" args={['#0c0907']} />
          <ambientLight intensity={0.45} />
          <directionalLight position={[6, 12, 4]} intensity={1.35} castShadow />
          <directionalLight position={[-4, 6, -2]} intensity={0.35} color="#c4a882" />
          <DiceScene dice={dice} palette={palette} settled={settled} />
          <ContactShadows position={[0, -0.01, 0]} opacity={0.55} scale={28} blur={2.5} />
          <Environment preset="warehouse" environmentIntensity={0.35} />
          <OrbitControls
            enablePan={false}
            minPolarAngle={0.3}
            maxPolarAngle={Math.PI / 2.2}
            minDistance={8}
            maxDistance={22}
          />
        </Canvas>
      </div>

      <div className="dice-stage-footer">
        {showResults ? (
          <>
            {roll.groups.map((g, idx) => (
              <div key={g.id} className="result-group">
                <h4>
                  Группа {idx + 1}: {g.expression}
                </h4>
                <div className="result-dice">
                  {g.dice.map((d, i) => (
                    <div key={`${g.id}-${i}`} className="result-die">
                      <span className="sides">D{d.sides}</span>
                      <span className="value">{d.value}</span>
                    </div>
                  ))}
                </div>
                {g.modifier && (
                  <div className="result-mod">
                    {g.modifier.label}: {formatModifier(g.modifier.value)}
                    <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
                      (кубы {g.diceTotal})
                    </span>
                  </div>
                )}
                <div className="result-total">Итого: {g.total}</div>
              </div>
            ))}
            {roll.groups.length > 1 && (
              <p className="result-total" style={{ marginTop: '0.5rem' }}>
                Сумма групп: {roll.grandTotal}
              </p>
            )}
          </>
        ) : (
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>Кубики в полёте…</p>
        )}

        <div style={{ marginTop: '0.85rem' }}>
          <button type="button" className="btn btn-secondary btn-block" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </aside>
  );
}

export type SceneDie = DieResult & { key: string; groupId: string };
