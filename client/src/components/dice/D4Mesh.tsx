import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { createBodyMaterial, createD4FaceTexture, lighten } from './textures';

/**
 * Top-reading d4: rests on a flat face, tip pointing up.
 * Result = the number at the upward vertex (classic “верхние цифры”).
 */
export function D4Mesh({
  body,
  number,
  mode,
  value,
  settled,
}: {
  body: string;
  number: string;
  mode: 'solid' | 'rainbow';
  value: number;
  settled: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const bodyMat = useMemo(() => createBodyMaterial(body, mode), [body, mode]);
  const plateBody = mode === 'rainbow' ? '#f4f4f4' : lighten(body, 0.05);

  const tipValue = settled ? Math.min(4, Math.max(1, value)) : 1;
  const { bodyGeometry, vertices } = useMemo(() => buildD4Body(), []);

  const facePlates = useMemo(
    () => buildD4FacePlates(vertices, tipValue, plateBody, number),
    [vertices, tipValue, plateBody, number],
  );

  const settleQuat = useMemo(() => {
    if (!settled) return new THREE.Quaternion();
    const tip = vertices[tipValue - 1]!.clone().normalize();
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(tip, new THREE.Vector3(0, 1, 0));
    return q;
  }, [vertices, tipValue, settled]);

  useLayoutEffect(() => {
    if (groupRef.current) groupRef.current.quaternion.copy(settleQuat);
  }, [settleQuat]);

  return (
    <group ref={groupRef} scale={1.08}>
      <mesh geometry={bodyGeometry} material={bodyMat} castShadow receiveShadow />
      {facePlates.map((face) => (
        <mesh key={face.key} geometry={face.geometry}>
          <meshStandardMaterial
            map={face.map}
            transparent
            roughness={0.42}
            metalness={0.04}
            polygonOffset
            polygonOffsetFactor={-2}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function buildD4Body(): {
  bodyGeometry: THREE.BufferGeometry;
  vertices: THREE.Vector3[];
} {
  const vertices = [
    new THREE.Vector3(1, 1, 1),
    new THREE.Vector3(1, -1, -1),
    new THREE.Vector3(-1, 1, -1),
    new THREE.Vector3(-1, -1, 1),
  ].map((v) => v.normalize().multiplyScalar(1.15));

  // Faces opposite each vertex
  const faceIndices: Array<[number, number, number]> = [
    [1, 2, 3],
    [0, 3, 2],
    [0, 1, 3],
    [0, 2, 1],
  ];

  const positions: number[] = [];
  const indices: number[] = [];
  const push = (v: THREE.Vector3) => {
    positions.push(v.x, v.y, v.z);
    return positions.length / 3 - 1;
  };

  for (const triple of faceIndices) {
    let [i0, i1, i2] = triple;
    const a = vertices[i0]!;
    const b = vertices[i1]!;
    const c = vertices[i2]!;
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const center = new THREE.Vector3().addVectors(a, b).add(c).divideScalar(3);
    if (center.dot(n) < 0) [i1, i2] = [i2, i1];

    indices.push(push(vertices[i0]!), push(vertices[i1]!), push(vertices[i2]!));
  }

  const bodyGeometry = new THREE.BufferGeometry();
  bodyGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  bodyGeometry.setIndex(indices);
  bodyGeometry.computeVertexNormals();

  return { bodyGeometry, vertices };
}

function buildD4FacePlates(
  vertices: THREE.Vector3[],
  tipValue: number,
  plateBody: string,
  numberColor: string,
): Array<{ key: string; geometry: THREE.BufferGeometry; map: THREE.CanvasTexture }> {
  const tipIdx = tipValue - 1;
  const faceIndices: Array<[number, number, number]> = [
    [1, 2, 3],
    [0, 3, 2],
    [0, 1, 3],
    [0, 2, 1],
  ];

  return faceIndices.map((triple, faceIdx) => {
    let [i0, i1, i2] = triple;
    const a = vertices[i0]!;
    const b = vertices[i1]!;
    const c = vertices[i2]!;
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const center = new THREE.Vector3().addVectors(a, b).add(c).divideScalar(3);
    if (center.dot(n) < 0) [i1, i2] = [i2, i1];

    let ordered = [i0, i1, i2];
    if (ordered.includes(tipIdx)) {
      const rest = ordered.filter((i) => i !== tipIdx);
      ordered = [tipIdx, rest[0]!, rest[1]!];
      const aa = vertices[ordered[0]!]!;
      const bb = vertices[ordered[1]!]!;
      const cc = vertices[ordered[2]!]!;
      const n2 = new THREE.Vector3().subVectors(bb, aa).cross(new THREE.Vector3().subVectors(cc, aa));
      const ctr = new THREE.Vector3().addVectors(aa, bb).add(cc).divideScalar(3);
      if (ctr.dot(n2) < 0) ordered = [ordered[0]!, ordered[2]!, ordered[1]!];
    }

    const corners: [number, number, number] = [
      ordered[0]! + 1,
      ordered[1]! + 1,
      ordered[2]! + 1,
    ];

    return {
      key: `d4-face-${faceIdx}-tip-${tipValue}`,
      geometry: makeFaceGeometry(
        vertices[ordered[0]!]!,
        vertices[ordered[1]!]!,
        vertices[ordered[2]!]!,
      ),
      map: createD4FaceTexture({ corners, body: plateBody, number: numberColor }),
    };
  });
}

function makeFaceGeometry(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): THREE.BufferGeometry {
  const normal = new THREE.Vector3()
    .subVectors(b, a)
    .cross(new THREE.Vector3().subVectors(c, a))
    .normalize();
  const center = new THREE.Vector3().addVectors(a, b).add(c).divideScalar(3);
  if (center.dot(normal) < 0) normal.negate();

  const lift = 0.02;
  const aa = a.clone().addScaledVector(normal, lift);
  const bb = b.clone().addScaledVector(normal, lift);
  const cc = c.clone().addScaledVector(normal, lift);

  const g = new THREE.BufferGeometry();
  g.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([aa.x, aa.y, aa.z, bb.x, bb.y, bb.z, cc.x, cc.y, cc.z], 3),
  );
  // UV: vertex0 → top, v1 → bottom-left, v2 → bottom-right
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0.5, 0.9, 0.08, 0.08, 0.92, 0.08], 2));
  g.setIndex([0, 1, 2]);
  g.computeVertexNormals();
  return g;
}
