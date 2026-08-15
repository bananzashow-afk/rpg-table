import * as THREE from 'three';

export interface DieFaceInfo {
  value: number;
  normal: THREE.Vector3;
  center: THREE.Vector3;
  /** Approximate face width for decal sizing */
  size: number;
}

interface Tri {
  a: THREE.Vector3;
  b: THREE.Vector3;
  c: THREE.Vector3;
  normal: THREE.Vector3;
  center: THREE.Vector3;
}

/**
 * Merge coplanar triangles into die faces and assign values 1..N.
 */
export function extractDieFaces(
  geometry: THREE.BufferGeometry,
  faceCount: number,
): DieFaceInfo[] {
  const tris = collectTriangles(geometry);
  const groups: Tri[][] = [];

  for (const tri of tris) {
    let found = false;
    for (const group of groups) {
      const ref = group[0]!;
      if (tri.normal.dot(ref.normal) > 0.92 && coplanar(tri, ref)) {
        group.push(tri);
        found = true;
        break;
      }
    }
    if (!found) groups.push([tri]);
  }

  // Prefer the largest faceCount groups (handles subdivided faces)
  groups.sort((a, b) => b.length - a.length);
  const chosen = groups.slice(0, faceCount);

  const faces: DieFaceInfo[] = chosen.map((group, index) => {
    const normal = new THREE.Vector3();
    const center = new THREE.Vector3();
    let maxSpan = 0;
    for (const t of group) {
      normal.add(t.normal);
      center.add(t.center);
      maxSpan = Math.max(maxSpan, t.a.distanceTo(t.b), t.b.distanceTo(t.c), t.c.distanceTo(t.a));
    }
    normal.normalize();
    center.divideScalar(group.length);
    // Push center slightly outward in case of numerical issues
    if (center.lengthSq() > 1e-6 && center.dot(normal) < 0) {
      normal.negate();
    }
    return {
      value: index + 1,
      normal,
      center,
      size: maxSpan * 0.55,
    };
  });

  // Stable order: sort by normal angles so values are deterministic
  faces.sort((a, b) => {
    const ya = a.normal.y - b.normal.y;
    if (Math.abs(ya) > 0.05) return ya;
    const angA = Math.atan2(a.normal.z, a.normal.x);
    const angB = Math.atan2(b.normal.z, b.normal.x);
    return angA - angB;
  });
  faces.forEach((f, i) => {
    f.value = i + 1;
  });

  // Ensure we have exactly faceCount (pad/truncate edge cases)
  return faces.slice(0, faceCount);
}

function collectTriangles(geometry: THREE.BufferGeometry): Tri[] {
  const pos = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const tris: Tri[] = [];

  const get = (i: number) => new THREE.Vector3().fromBufferAttribute(pos, i);

  const push = (ia: number, ib: number, ic: number) => {
    const a = get(ia);
    const b = get(ib);
    const c = get(ic);
    const normal = new THREE.Vector3()
      .subVectors(b, a)
      .cross(new THREE.Vector3().subVectors(c, a))
      .normalize();
    if (normal.lengthSq() < 1e-8) return;
    const center = new THREE.Vector3().addVectors(a, b).add(c).divideScalar(3);
    tris.push({ a, b, c, normal, center });
  };

  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      push(index.getX(i), index.getX(i + 1), index.getX(i + 2));
    }
  } else {
    for (let i = 0; i < pos.count; i += 3) {
      push(i, i + 1, i + 2);
    }
  }
  return tris;
}

function coplanar(a: Tri, b: Tri): boolean {
  const diff = new THREE.Vector3().subVectors(a.center, b.center);
  return Math.abs(diff.dot(b.normal)) < 0.08;
}

/** Quaternion that rotates `normal` to world +Y */
export function quatFaceUp(normal: THREE.Vector3): THREE.Quaternion {
  const n = normal.clone().normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();
  if (n.dot(up) < -0.999) {
    // 180° flip
    q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
    return q;
  }
  q.setFromUnitVectors(n, up);
  return q;
}
