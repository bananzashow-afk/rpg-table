import { useLayoutEffect, useMemo, useRef } from 'react';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import type { DiceSides } from '@rpg-table/shared';
import { extractDieFaces, quatFaceUp, type DieFaceInfo } from './faces';
import {
  createBodyMaterial,
  createFaceTexture,
  lighten,
  type FaceShape,
} from './textures';
import { D4Mesh } from './D4Mesh';

export function DieMesh({
  sides,
  body,
  number,
  mode = 'solid',
  value,
  settled = true,
}: {
  sides: DiceSides;
  body: string;
  number: string;
  mode?: 'solid' | 'rainbow';
  value: number;
  settled?: boolean;
}) {
  if (sides === 4) {
    return (
      <D4Mesh body={body} number={number} mode={mode} value={value} settled={settled} />
    );
  }
  if (sides === 6) {
    return (
      <D6Mesh body={body} number={number} mode={mode} value={value} settled={settled} />
    );
  }
  return (
    <PolyDieMesh
      sides={sides}
      body={body}
      number={number}
      mode={mode}
      value={value}
      settled={settled}
    />
  );
}

function D6Mesh({
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
  const bodyMat = useMemo(() => createBodyMaterial(body, mode), [body, mode]);
  const plateBody = mode === 'rainbow' ? '#f7f7f7' : lighten(body, 0.06);

  const faces = useMemo(() => {
    const faceValues = [1, 6, 2, 5, 3, 4] as const;
    return faceValues.map((n) =>
      createFaceTexture({ value: n, body: plateBody, number, shape: 'square' }),
    );
  }, [plateBody, number]);

  const rot = useMemo(
    (): [number, number, number] => (settled ? d6RotationForValue(value) : [0, 0, 0]),
    [value, settled],
  );
  const s = 1.18;
  const half = s / 2 + 0.004;

  return (
    <group rotation={rot}>
      <RoundedBox
        args={[s, s, s]}
        radius={0.14}
        smoothness={5}
        material={bodyMat}
        castShadow
        receiveShadow
      />
      <FacePlane map={faces[0]!} position={[0, half, 0]} rotation={[-Math.PI / 2, 0, 0]} />
      <FacePlane map={faces[1]!} position={[0, -half, 0]} rotation={[Math.PI / 2, 0, 0]} />
      <FacePlane map={faces[2]!} position={[0, 0, half]} rotation={[0, 0, 0]} />
      <FacePlane map={faces[3]!} position={[0, 0, -half]} rotation={[0, Math.PI, 0]} />
      <FacePlane map={faces[4]!} position={[half, 0, 0]} rotation={[0, Math.PI / 2, 0]} />
      <FacePlane map={faces[5]!} position={[-half, 0, 0]} rotation={[0, -Math.PI / 2, 0]} />
    </group>
  );
}

function FacePlane({
  map,
  position,
  rotation,
}: {
  map: THREE.CanvasTexture;
  position: [number, number, number];
  rotation: [number, number, number];
}) {
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[0.92, 0.92]} />
      <meshStandardMaterial
        map={map}
        transparent
        roughness={0.35}
        metalness={0.08}
        polygonOffset
        polygonOffsetFactor={-1}
      />
    </mesh>
  );
}

/** Local faces: +Y=1, −Y=6, +Z=2, −Z=5, +X=3, −X=4 */
function d6RotationForValue(value: number): [number, number, number] {
  switch (value) {
    case 1:
      return [0, 0, 0];
    case 6:
      return [Math.PI, 0, 0];
    case 2:
      return [-Math.PI / 2, 0, 0];
    case 5:
      return [Math.PI / 2, 0, 0];
    case 3:
      return [0, 0, Math.PI / 2];
    case 4:
      return [0, 0, -Math.PI / 2];
    default:
      return [0, 0, 0];
  }
}

function PolyDieMesh({
  sides,
  body,
  number,
  mode,
  value,
  settled,
}: {
  sides: DiceSides;
  body: string;
  number: string;
  mode: 'solid' | 'rainbow';
  value: number;
  settled: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const bodyMat = useMemo(() => createBodyMaterial(body, mode), [body, mode]);
  const edgeMat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: '#0a0806',
        transparent: true,
        opacity: 0.4,
      }),
    [],
  );

  const built = useMemo(() => createPolyGeometry(sides), [sides]);
  const { geometry, scale, shape, faces: explicitFaces } = built;
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry, 20), [geometry]);

  const faceInfos = useMemo(() => {
    if (explicitFaces) return explicitFaces;
    return extractDieFaces(geometry, sides);
  }, [geometry, sides, explicitFaces]);

  const plateBody = mode === 'rainbow' ? '#f7f7f7' : lighten(body, 0.08);
  const decals = useMemo(
    () =>
      faceInfos.map((face) => ({
        face,
        map: createFaceTexture({
          value: face.value,
          body: plateBody,
          number,
          shape,
        }),
      })),
    [faceInfos, plateBody, number, shape],
  );

  const settleQuat = useMemo(() => {
    if (!settled) return new THREE.Quaternion();
    const clamped = ((value - 1) % faceInfos.length) + 1;
    const face =
      faceInfos.find((f) => f.value === value) ??
      faceInfos.find((f) => f.value === clamped) ??
      faceInfos[0];
    if (!face) return new THREE.Quaternion();
    return quatFaceUp(face.normal);
  }, [faceInfos, value, settled]);

  useLayoutEffect(() => {
    if (groupRef.current) {
      groupRef.current.quaternion.copy(settleQuat);
    }
  }, [settleQuat]);

  return (
    <group ref={groupRef} scale={scale}>
      <mesh geometry={geometry} material={bodyMat} castShadow receiveShadow />
      <lineSegments geometry={edges} material={edgeMat} />
      {decals.map(({ face, map }) => (
        <FaceDecal key={face.value} face={face} map={map} />
      ))}
    </group>
  );
}

function FaceDecal({ face, map }: { face: DieFaceInfo; map: THREE.CanvasTexture }) {
  const quaternion = useMemo(() => {
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), face.normal.clone().normalize());
    return q;
  }, [face.normal]);

  const position = useMemo(
    () => face.center.clone().add(face.normal.clone().normalize().multiplyScalar(0.025)),
    [face.center, face.normal],
  );

  const size = Math.max(0.32, Math.min(0.78, face.size * 1.05));

  return (
    <mesh position={position} quaternion={quaternion}>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial
        map={map}
        transparent
        roughness={0.35}
        metalness={0.06}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-2}
      />
    </mesh>
  );
}

function createPolyGeometry(sides: DiceSides): {
  geometry: THREE.BufferGeometry;
  scale: number;
  shape: FaceShape;
  faces?: DieFaceInfo[];
} {
  switch (sides) {
    case 4:
      return { geometry: new THREE.TetrahedronGeometry(1.15, 0), scale: 0.95, shape: 'triangle' };
    case 8:
      return { geometry: new THREE.OctahedronGeometry(1.12, 0), scale: 0.9, shape: 'triangle' };
    case 10:
      return { ...createD10(), scale: 0.92, shape: 'diamond' };
    case 12:
      return { geometry: new THREE.DodecahedronGeometry(1.12, 0), scale: 0.8, shape: 'pentagon' };
    case 20:
      return { geometry: new THREE.IcosahedronGeometry(1.15, 0), scale: 0.85, shape: 'triangle' };
    default:
      return { geometry: new THREE.BoxGeometry(1.15, 1.15, 1.15), scale: 0.85, shape: 'square' };
  }
}

/** d10 with explicit planar kite faces + matching face metadata */
function createD10(): { geometry: THREE.BufferGeometry; faces: DieFaceInfo[] } {
  const radius = 1;
  const height = 1.4;
  const n = 5;

  const top = new THREE.Vector3(0, height / 2, 0);
  const bottom = new THREE.Vector3(0, -height / 2, 0);
  const upper: THREE.Vector3[] = [];
  const lower: THREE.Vector3[] = [];

  for (let i = 0; i < n; i++) {
    const aU = (i / n) * Math.PI * 2 - Math.PI / 2;
    const aL = aU + Math.PI / n;
    upper.push(new THREE.Vector3(Math.cos(aU) * radius, height * 0.1, Math.sin(aU) * radius));
    lower.push(new THREE.Vector3(Math.cos(aL) * radius, -height * 0.1, Math.sin(aL) * radius));
  }

  const positions: number[] = [];
  const indices: number[] = [];
  const faces: DieFaceInfo[] = [];

  const pushVertex = (v: THREE.Vector3) => {
    positions.push(v.x, v.y, v.z);
    return positions.length / 3 - 1;
  };

  // Build each kite as its own planar quad (two triangles), duplicated verts for flat normals
  const addKite = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, value: number) => {
    // Force planarity: project c and d onto plane of a,b and midpoint
    const ab = new THREE.Vector3().subVectors(b, a);
    const mid = new THREE.Vector3().addVectors(c, d).multiplyScalar(0.5);
    const ac = new THREE.Vector3().subVectors(mid, a);
    let normal = new THREE.Vector3().crossVectors(ab, ac);
    if (normal.lengthSq() < 1e-8) {
      normal = new THREE.Vector3().subVectors(c, a).cross(new THREE.Vector3().subVectors(d, a));
    }
    normal.normalize();
    // Ensure outward (away from origin)
    const center = new THREE.Vector3().addVectors(a, b).add(c).add(d).multiplyScalar(0.25);
    if (center.dot(normal) < 0) normal.negate();

    const ia = pushVertex(a);
    const ib = pushVertex(b);
    const ic = pushVertex(c);
    const id = pushVertex(d);
    indices.push(ia, ib, ic);
    indices.push(ia, ic, id);

    faces.push({
      value,
      normal: normal.clone(),
      center,
      size: Math.max(a.distanceTo(c), b.distanceTo(d)) * 0.42,
    });
  };

  for (let i = 0; i < n; i++) {
    const u = upper[i]!;
    const uNext = upper[(i + 1) % n]!;
    const l = lower[i]!;
    const lNext = lower[(i + 1) % n]!;

    // Upper kite: top – u – l – uNext
    addKite(top, u, l, uNext, i + 1);
    // Lower kite: bottom – lNext – uNext – l  (winding for outward)
    addKite(bottom, lNext, uNext, l, i + 6);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return { geometry, faces };
}
