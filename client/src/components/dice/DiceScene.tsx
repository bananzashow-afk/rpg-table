import { useMemo } from 'react';
import type { DiceColors, SceneDie } from './DiceStage';
import { AnimatedDie } from './AnimatedDie';

export function DiceScene({
  dice,
  palette,
  settled,
}: {
  dice: SceneDie[];
  palette: DiceColors;
  settled: boolean;
}) {
  const layout = useMemo(() => layoutDice(dice.length), [dice.length]);

  return (
    <group>
      {/* Felt / wood table */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <circleGeometry args={[11, 64]} />
        <meshStandardMaterial color="#2a1c12" roughness={0.85} metalness={0.05} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <circleGeometry args={[9.2, 64]} />
        <meshStandardMaterial color="#1f3d2a" roughness={0.95} metalness={0} />
      </mesh>

      {dice.map((die, i) => (
        <AnimatedDie
          key={die.key}
          sides={die.sides}
          value={die.value}
          target={layout[i]!}
          palette={palette}
          settled={settled}
          seed={hashSeed(die.key)}
        />
      ))}
    </group>
  );
}

function layoutDice(count: number): Array<{ x: number; z: number }> {
  if (count <= 0) return [];
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const spacing = count > 12 ? 1.35 : 1.7;
  const positions: Array<{ x: number; z: number }> = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const x = (col - (cols - 1) / 2) * spacing;
    const z = (row - (rows - 1) / 2) * spacing;
    positions.push({ x, z });
  }
  return positions;
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
