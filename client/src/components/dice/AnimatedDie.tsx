import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import type { DiceSides } from '@rpg-table/shared';
import type { DiceColors } from './DiceStage';
import { DieMesh } from './DieMesh';

/** Soft neutral cream glow for the result digit */
const GLOW = '#F4EFE4';

export function AnimatedDie({
  sides,
  value,
  target,
  palette,
  settled,
  seed,
}: {
  sides: DiceSides;
  value: number;
  target: { x: number; z: number };
  palette: DiceColors;
  settled: boolean;
  seed: number;
}) {
  const group = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Group>(null);
  const rng = useMemo(() => mulberry32(seed), [seed]);

  const motion = useMemo(() => {
    const startX = target.x + (rng() - 0.5) * 6;
    const startZ = target.z + (rng() - 0.5) * 4;
    const startY = 6 + rng() * 4;
    const spin = new THREE.Vector3(
      (rng() - 0.5) * 18,
      (rng() - 0.5) * 22,
      (rng() - 0.5) * 18,
    );
    const bounce = 0.35 + rng() * 0.45;
    return { startX, startY, startZ, spin, bounce, duration: 1.9 + rng() * 0.4 };
  }, [rng, target.x, target.z]);

  const start = useRef<number | null>(null);
  const upright = useMemo(() => new THREE.Quaternion(), []);

  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    if (start.current === null) start.current = clock.elapsedTime;
    const t = clock.elapsedTime - start.current;
    const u = Math.min(1, t / motion.duration);
    const ease = settled ? 1 : easeOutCubic(u);

    const yRaw = motion.startY * (1 - ease) + bounceHeight(ease, motion.bounce);
    const x = THREE.MathUtils.lerp(motion.startX, target.x, ease);
    const z = THREE.MathUtils.lerp(motion.startZ, target.z, ease);
    // d4 rests on a flat face (tip up) — lower center than cubes
    const restY = sides === 4 ? 0.4 : 0.62;
    g.position.set(x, Math.max(restY, yRaw), z);

    if (!settled && u < 1) {
      g.rotation.x = motion.spin.x * t;
      g.rotation.y = motion.spin.y * t;
      g.rotation.z = motion.spin.z * t;
    } else {
      // Settle upright so face plate / D6 mapping stays readable
      g.quaternion.slerp(upright, 0.18);
    }

    if (glowRef.current && settled) {
      const pulse = 0.92 + Math.sin(clock.elapsedTime * 2.4) * 0.08;
      glowRef.current.scale.setScalar(pulse);
    }
  });

  return (
    <group ref={group} castShadow>
      <DieMesh
        sides={sides}
        body={palette.body}
        number={palette.number}
        mode={palette.mode}
        value={value}
        settled={settled}
      />

      {settled && (
        <group ref={glowRef} position={[0, sides === 4 ? 1.35 : 1.15, 0]}>
          {/* Soft neutral bloom layers */}
          <Text
            fontSize={0.95}
            color={GLOW}
            anchorX="center"
            anchorY="middle"
            fillOpacity={0.12}
            outlineWidth={0.12}
            outlineColor={GLOW}
            outlineOpacity={0.35}
          >
            {String(value)}
          </Text>
          <Text
            position={[0, 0, 0.01]}
            fontSize={0.72}
            color={GLOW}
            anchorX="center"
            anchorY="middle"
            fillOpacity={0.22}
            outlineWidth={0.08}
            outlineColor={GLOW}
            outlineOpacity={0.45}
          >
            {String(value)}
          </Text>
          <Text
            position={[0, 0, 0.02]}
            fontSize={0.55}
            color={palette.number}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.035}
            outlineColor={GLOW}
            outlineOpacity={0.9}
          >
            {String(value)}
          </Text>
          {/* Light halo under the digit */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.95, 0]}>
            <circleGeometry args={[0.55, 32]} />
            <meshBasicMaterial color={GLOW} transparent opacity={0.22} depthWrite={false} />
          </mesh>
        </group>
      )}
    </group>
  );
}

function bounceHeight(u: number, strength: number): number {
  if (u < 0.7) {
    const local = u / 0.7;
    return (1 - local) * (1 - local) * 0.1;
  }
  const local = (u - 0.7) / 0.3;
  return Math.sin(local * Math.PI) * strength * (1 - local);
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function mulberry32(a: number): () => number {
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
