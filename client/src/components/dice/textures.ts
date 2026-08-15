import * as THREE from 'three';

const textureCache = new Map<string, THREE.CanvasTexture>();

export type FaceShape = 'square' | 'circle' | 'triangle' | 'diamond' | 'pentagon';

export function createFaceTexture(opts: {
  value: string | number;
  body: string;
  number: string;
  size?: number;
  shape?: FaceShape;
}): THREE.CanvasTexture {
  const size = opts.size ?? 256;
  const shape = opts.shape ?? 'circle';
  const key = `${opts.value}|${opts.body}|${opts.number}|${size}|${shape}`;
  const cached = textureCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);

  ctx.save();
  pathForShape(ctx, shape, size);
  ctx.clip();

  ctx.fillStyle = opts.body;
  ctx.fillRect(0, 0, size, size);

  const edge = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.2,
    size / 2,
    size / 2,
    size * 0.7,
  );
  edge.addColorStop(0, 'rgba(255,255,255,0.16)');
  edge.addColorStop(0.55, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(0,0,0,0.32)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, size, size);

  const label = String(opts.value);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fontSize = Math.floor(size * (label.length > 1 ? 0.4 : 0.5));
  ctx.font = `700 ${fontSize}px "Segoe UI", system-ui, sans-serif`;

  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillText(label, size / 2 + 2, size / 2 + 3);
  ctx.fillStyle = opts.number;
  ctx.fillText(label, size / 2, size / 2);
  ctx.restore();

  ctx.save();
  pathForShape(ctx, shape, size);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = size * 0.035;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = size * 0.015;
  ctx.stroke();
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  textureCache.set(key, tex);
  return tex;
}

/**
 * Classic top-reading d4 face: three numbers near the three corners of a triangle.
 * corners[0] = top (toward a vertex), [1] = bottom-left, [2] = bottom-right.
 */
export function createD4FaceTexture(opts: {
  corners: [number, number, number];
  body: string;
  number: string;
  size?: number;
}): THREE.CanvasTexture {
  const size = opts.size ?? 512;
  const [top, bl, br] = opts.corners;
  const key = `d4:${top},${bl},${br}|${opts.body}|${opts.number}|${size}`;
  const cached = textureCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);

  const pTop = { x: size * 0.5, y: size * 0.1 };
  const pBl = { x: size * 0.1, y: size * 0.9 };
  const pBr = { x: size * 0.9, y: size * 0.9 };

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pTop.x, pTop.y);
  ctx.lineTo(pBr.x, pBr.y);
  ctx.lineTo(pBl.x, pBl.y);
  ctx.closePath();
  ctx.clip();

  ctx.fillStyle = opts.body;
  ctx.fillRect(0, 0, size, size);

  // Soft bevel
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, 'rgba(255,255,255,0.18)');
  grad.addColorStop(0.45, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  ctx.restore();

  // Outline
  ctx.beginPath();
  ctx.moveTo(pTop.x, pTop.y);
  ctx.lineTo(pBr.x, pBr.y);
  ctx.lineTo(pBl.x, pBl.y);
  ctx.closePath();
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = size * 0.02;
  ctx.stroke();

  const fontSize = Math.floor(size * 0.2);
  ctx.font = `600 ${fontSize}px "Segoe UI", "Trebuchet MS", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const drawCorner = (label: number, x: number, y: number) => {
    // Slight inset toward triangle center
    const cx = size * 0.5;
    const cy = size * 0.55;
    const ix = x + (cx - x) * 0.28;
    const iy = y + (cy - y) * 0.28;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillText(String(label), ix + 2, iy + 2);
    ctx.fillStyle = opts.number;
    ctx.fillText(String(label), ix, iy);
  };

  drawCorner(top, pTop.x, pTop.y + size * 0.06);
  drawCorner(bl, pBl.x + size * 0.06, pBl.y - size * 0.04);
  drawCorner(br, pBr.x - size * 0.06, pBr.y - size * 0.04);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  textureCache.set(key, tex);
  return tex;
}

function pathForShape(ctx: CanvasRenderingContext2D, shape: FaceShape, size: number): void {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.46;
  ctx.beginPath();
  switch (shape) {
    case 'square': {
      const m = size * 0.08;
      ctx.roundRect(m, m, size - m * 2, size - m * 2, size * 0.1);
      break;
    }
    case 'circle':
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      break;
    case 'triangle':
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r * 0.92, cy + r * 0.72);
      ctx.lineTo(cx - r * 0.92, cy + r * 0.72);
      ctx.closePath();
      break;
    case 'diamond':
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r * 0.72, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r * 0.72, cy);
      ctx.closePath();
      break;
    case 'pentagon': {
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      break;
    }
  }
}

export function createRainbowMap(size = 256): THREE.CanvasTexture {
  const key = `rainbow-map-${size}`;
  const cached = textureCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, '#FF3B5C');
  g.addColorStop(0.2, '#FF8A3D');
  g.addColorStop(0.4, '#FFD93D');
  g.addColorStop(0.55, '#3DDC97');
  g.addColorStop(0.7, '#3DA9FC');
  g.addColorStop(0.85, '#7B5CFF');
  g.addColorStop(1, '#FF5AC8');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const pearl = ctx.createRadialGradient(
    size * 0.35,
    size * 0.3,
    0,
    size * 0.5,
    size * 0.5,
    size * 0.7,
  );
  pearl.addColorStop(0, 'rgba(255,255,255,0.35)');
  pearl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = pearl;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(key, tex);
  return tex;
}

export function createBodyMaterial(
  body: string,
  mode: 'solid' | 'rainbow',
): THREE.MeshPhysicalMaterial {
  if (mode === 'rainbow') {
    return new THREE.MeshPhysicalMaterial({
      map: createRainbowMap(),
      roughness: 0.22,
      metalness: 0.35,
      clearcoat: 0.85,
      clearcoatRoughness: 0.2,
      sheen: 0.4,
      sheenColor: new THREE.Color('#ffffff'),
    });
  }
  return new THREE.MeshPhysicalMaterial({
    color: body,
    roughness: 0.28,
    metalness: 0.18,
    clearcoat: 0.65,
    clearcoatRoughness: 0.25,
  });
}

export function lighten(hex: string, amount: number): string {
  try {
    const c = new THREE.Color(hex);
    c.offsetHSL(0, 0, amount);
    return `#${c.getHexString()}`;
  } catch {
    return hex;
  }
}
