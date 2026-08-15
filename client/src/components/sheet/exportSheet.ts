import {
  CHARACTER_ATTRIBUTES,
  SHEET_BASE,
  SHEET_LAYOUT_V1,
  SHEET_META_LAYOUT_V1,
  SHEET_PAGE_SRC,
  formatModifier,
  type Character,
  type SheetPage,
} from '@rpg-table/shared';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Не удалось загрузить шаблон листа'));
    img.src = src;
  });
}

export async function renderSheetPage(character: Character, page: SheetPage): Promise<HTMLCanvasElement> {
  const img = await loadImage(SHEET_PAGE_SRC[page]);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || SHEET_BASE.width;
  canvas.height = img.naturalHeight || SHEET_BASE.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#1a1510';
  ctx.textBaseline = 'middle';

  if (page === 1) {
    drawField(ctx, canvas, SHEET_META_LAYOUT_V1.name, character.name, 'left', 18);
    drawField(ctx, canvas, SHEET_META_LAYOUT_V1.race, character.race, 'left', 18);
    for (const attr of CHARACTER_ATTRIBUTES) {
      drawField(
        ctx,
        canvas,
        SHEET_LAYOUT_V1[attr],
        formatModifier(character[attr]),
        'center',
        20,
      );
    }
  }

  for (const block of character.sheetData.textBlocks.filter((b) => b.page === page)) {
    const x = block.x * canvas.width;
    const y = block.y * canvas.height;
    const w = block.width * canvas.width;
    const size = Math.max(10, block.fontSize * (canvas.width / SHEET_BASE.width));
    ctx.font = `600 ${size}px Georgia, 'Times New Roman', serif`;
    ctx.textAlign = block.align;
    ctx.textBaseline = 'top';
    const tx = block.align === 'center' ? x + w / 2 : block.align === 'right' ? x + w : x;
    wrapText(ctx, block.text, tx, y, w, size * 1.25);
  }

  return canvas;
}

function drawField(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  rect: { x: number; y: number; w: number; h: number },
  text: string,
  align: CanvasTextAlign,
  fontSize: number,
): void {
  if (!text) return;
  const x = rect.x * canvas.width;
  const y = rect.y * canvas.height;
  const w = rect.w * canvas.width;
  const h = rect.h * canvas.height;
  const size = fontSize * (canvas.width / SHEET_BASE.width);
  ctx.font = `700 ${size}px Georgia, 'Times New Roman', serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  const tx = align === 'center' ? x + w / 2 : align === 'right' ? x + w - 4 : x + 4;
  ctx.fillText(text, tx, y + h / 2, w - 6);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): void {
  const paragraphs = text.split('\n');
  let cy = y;
  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, cy);
        line = word;
        cy += lineHeight;
      } else {
        line = test;
      }
    }
    ctx.fillText(line, x, cy);
    cy += lineHeight;
  }
}

export async function downloadSheetPng(character: Character, page: SheetPage): Promise<void> {
  const canvas = await renderSheetPage(character, page);
  await downloadCanvas(canvas, `${fileBase(character)}-page-${page}.png`);
}

export async function downloadAllSheetPng(character: Character): Promise<void> {
  for (const page of [1, 2, 3] as SheetPage[]) {
    await downloadSheetPng(character, page);
  }
}

export async function printCharacterSheets(character: Character): Promise<void> {
  const pages: SheetPage[] = [1, 2, 3];
  const canvases = await Promise.all(pages.map((p) => renderSheetPage(character, p)));
  const win = window.open('', '_blank');
  if (!win) throw new Error('Разрешите всплывающие окна для печати');
  win.document.write(
    `<!doctype html><title>${escapeHtml(character.name || 'Персонаж')}</title>
     <style>
       @page { size: A4; margin: 8mm; }
       body { margin: 0; background: #fff; }
       img { width: 100%; page-break-after: always; display: block; }
       img:last-child { page-break-after: auto; }
     </style>`,
  );
  for (const canvas of canvases) {
    const img = win.document.createElement('img');
    img.src = canvas.toDataURL('image/png');
    win.document.body.appendChild(img);
  }
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
  }, 400);
}

function downloadCanvas(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Не удалось создать PNG'));
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      resolve();
    }, 'image/png');
  });
}

export function downloadCharacterFile(character: Character, file: unknown): void {
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileBase(character)}.rpgcharacter`;
  a.click();
  URL.revokeObjectURL(url);
}

function fileBase(character: Character): string {
  const raw = (character.name || 'character').toLowerCase().replace(/[^a-z0-9а-яё_-]+/gi, '-');
  return raw.replace(/^-|-$/g, '') || 'character';
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => {
    const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return map[ch] ?? ch;
  });
}
