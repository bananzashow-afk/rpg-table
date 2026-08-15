import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import {
  ATTRIBUTE_LABELS,
  CHARACTER_ATTRIBUTES,
  DEFAULT_TEXT_FONT_SIZE,
  MAX_TEXT_FONT_SIZE,
  MIN_TEXT_FONT_SIZE,
  SHEET_BASE,
  SHEET_LAYOUT_V1,
  SHEET_META_LAYOUT_V1,
  SHEET_PAGE_SRC,
  SHEET_ZOOM_MAX,
  SHEET_ZOOM_MIN,
  buildCharacterExport,
  formatModifier,
  type Character,
  type CharacterAttribute,
  type SheetPage,
  type SheetTextBlock,
  type TextAlign,
} from '@rpg-table/shared';
import { v4 as uuid } from 'uuid';
import { useSocket } from '../../networking/SocketProvider';
import { loadSheetUi, saveSheetUi } from '../../storage/local';
import { downloadAllSheetPng, downloadCharacterFile, printCharacterSheets } from './exportSheet';

const SAVE_DEBOUNCE_MS = 450;

export function CharacterSheetWindow({
  characterId,
  onClose,
}: {
  characterId: string;
  onClose: () => void;
}) {
  const {
    characters,
    session,
    updateAttribute,
    updateMeta,
    createTextBlock,
    updateTextBlock,
    moveTextBlock,
    deleteTextBlock,
    importCharacterFile,
  } = useSocket();

  const character = characters.find((c) => c.id === characterId) ?? null;
  const stored = useMemo(() => loadSheetUi(characterId), [characterId]);

  const [page, setPage] = useState<SheetPage>(stored?.page ?? 1);
  const [zoom, setZoom] = useState(stored?.zoom ?? 0.85);
  const [pan, setPan] = useState({ x: stored?.panX ?? 12, y: stored?.panY ?? 8 });
  const [win, setWin] = useState({
    x: stored?.winX ?? 48,
    y: stored?.winY ?? 36,
    w: stored?.winW ?? Math.min(720, window.innerWidth - 32),
    h: stored?.winH ?? Math.min(780, window.innerHeight - 48),
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('saved');
  const [menuOpen, setMenuOpen] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ dist: number; zoom: number } | null>(null);
  const dragWin = useRef<{ dx: number; dy: number } | null>(null);
  const dragPan = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const dragText = useRef<{ id: string; ox: number; oy: number } | null>(null);
  const dragPosRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null);
  const resizeWin = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const textTimers = useRef(new Map<string, number>());
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    saveSheetUi(characterId, {
      page,
      zoom,
      panX: pan.x,
      panY: pan.y,
      winX: win.x,
      winY: win.y,
      winW: win.w,
      winH: win.h,
    });
  }, [characterId, page, zoom, pan.x, pan.y, win]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(true);
      if (e.key === 'Escape') {
        if (editingId) {
          setEditingId(null);
          return;
        }
        if (selectedId) {
          setSelectedId(null);
          return;
        }
        onClose();
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && !editingId) {
        e.preventDefault();
        void markSaving(deleteTextBlock(characterId, selectedId));
        setSelectedId(null);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onUp);
    };
  }, [characterId, deleteTextBlock, editingId, onClose, selectedId]);

  const blocks = character?.sheetData.textBlocks.filter((b) => b.page === page) ?? [];
  const selected = blocks.find((b) => b.id === selectedId) ?? null;

  function cyclePage(dir: 1 | -1) {
    setPage((p) => {
      const next = ((((p - 1 + dir) % 3) + 3) % 3) + 1;
      return next as SheetPage;
    });
    setSelectedId(null);
    setEditingId(null);
  }

  async function markSaving(op: Promise<unknown>) {
    setSaveState('saving');
    try {
      await op;
      setSaveState('saved');
    } catch {
      setSaveState('idle');
    }
  }

  function clientToNorm(clientX: number, clientY: number): { x: number; y: number } | null {
    const el = canvasRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    };
  }

  const onWheel = (e: ReactWheelEvent) => {
    e.preventDefault();
    const vp = viewportRef.current;
    if (!vp) return;
    const rect = vp.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    const next = Math.min(SHEET_ZOOM_MAX, Math.max(SHEET_ZOOM_MIN, zoom * factor));
    const canvasX = (cx - pan.x) / zoom;
    const canvasY = (cy - pan.y) / zoom;
    setZoom(next);
    setPan({ x: cx - canvasX * next, y: cy - canvasY * next });
  };

  const onViewportPointerDown = (e: ReactPointerEvent) => {
    if (e.button === 1 || spaceDown || (e.pointerType === 'touch' && pointers.current.size === 0 && e.altKey)) {
      e.preventDefault();
      dragPan.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const pts = [...pointers.current.values()];
      const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      pinchStart.current = { dist, zoom };
    }
  };

  const onViewportPointerMove = (e: ReactPointerEvent) => {
    if (dragPan.current) {
      setPan({
        x: dragPan.current.px + (e.clientX - dragPan.current.x),
        y: dragPan.current.py + (e.clientY - dragPan.current.y),
      });
      return;
    }
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (pointers.current.size === 2 && pinchStart.current) {
      const pts = [...pointers.current.values()];
      const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      if (pinchStart.current.dist > 0) {
        const next = Math.min(
          SHEET_ZOOM_MAX,
          Math.max(SHEET_ZOOM_MIN, pinchStart.current.zoom * (dist / pinchStart.current.dist)),
        );
        setZoom(next);
      }
    }
    if (dragText.current) {
      const pos = clientToNorm(e.clientX, e.clientY);
      if (!pos) return;
      const nx = Math.min(0.98, Math.max(0, pos.x - dragText.current.ox));
      const ny = Math.min(0.98, Math.max(0, pos.y - dragText.current.oy));
      const next = { id: dragText.current.id, x: nx, y: ny };
      dragPosRef.current = next;
      setDragPos(next);
    }
  };

  const onViewportPointerUp = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    dragPan.current = null;
    const dropped = dragPosRef.current;
    if (dragText.current && dropped && dropped.id === dragText.current.id) {
      void markSaving(moveTextBlock(characterId, dropped.id, dropped.x, dropped.y));
    }
    dragText.current = null;
    dragPosRef.current = null;
    setDragPos(null);
  };

  const onBlankClick = (e: ReactPointerEvent) => {
    if (e.button !== 0 || spaceDown || dragPan.current) return;
    if (pointers.current.size > 1) return;
    const pos = clientToNorm(e.clientX, e.clientY);
    if (!pos || !character) return;
    setEditingId(null);
    const id = uuid();
    const block: SheetTextBlock = {
      id,
      page,
      x: Math.min(0.92, Math.max(0, pos.x - 0.02)),
      y: Math.min(0.97, Math.max(0, pos.y - 0.01)),
      width: 0.28,
      text: '',
      fontSize: DEFAULT_TEXT_FONT_SIZE,
      align: 'left',
    };
    void markSaving(createTextBlock(characterId, block));
    setSelectedId(id);
    setEditingId(id);
  };

  const scheduleTextSave = useCallback(
    (blockId: string, text: string) => {
      const prev = textTimers.current.get(blockId);
      if (prev) window.clearTimeout(prev);
      setSaveState('saving');
      const t = window.setTimeout(() => {
        void updateTextBlock(characterId, blockId, { text }).then(
          () => setSaveState('saved'),
          () => setSaveState('idle'),
        );
      }, SAVE_DEBOUNCE_MS);
      textTimers.current.set(blockId, t);
    },
    [characterId, updateTextBlock],
  );

  if (!character || !session) return null;

  const isOwn = character.ownerPlayerId === session.playerId;

  return (
    <div
      className="sheet-window"
      style={{ left: win.x, top: win.y, width: win.w, height: win.h }}
      role="dialog"
      aria-label="Лист персонажа"
    >
      <header
        className="sheet-window-head"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button,select,input')) return;
          dragWin.current = { dx: e.clientX - win.x, dy: e.clientY - win.y };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!dragWin.current) return;
          setWin((w) => ({
            ...w,
            x: Math.max(0, e.clientX - dragWin.current!.dx),
            y: Math.max(0, e.clientY - dragWin.current!.dy),
          }));
        }}
        onPointerUp={() => {
          dragWin.current = null;
        }}
      >
        <div>
          <strong>{character.name || 'Без имени'}</strong>
          <span className="sheet-window-sub">
            {isOwn ? 'ваш лист' : 'лист игрока'} · {saveLabel(saveState)}
          </span>
        </div>
        <div className="sheet-window-actions">
          <button type="button" className="btn btn-ghost" onClick={() => cyclePage(-1)} aria-label="Предыдущая страница">
            ←
          </button>
          <span className="sheet-page-indicator">
            {page} / 3
          </span>
          <button type="button" className="btn btn-ghost" onClick={() => cyclePage(1)} aria-label="Следующая страница">
            →
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setMenuOpen((v) => !v)}>
            Файл
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </div>
      </header>

      {menuOpen && (
        <div className="sheet-file-menu">
          <button
            type="button"
            onClick={() => {
              downloadCharacterFile(character, buildCharacterExport(character));
              setMenuOpen(false);
            }}
          >
            Скачать персонажа
          </button>
          <button
            type="button"
            onClick={() => {
              fileRef.current?.click();
              setMenuOpen(false);
            }}
          >
            Загрузить персонажа
          </button>
          <button
            type="button"
            onClick={() => {
              void downloadAllSheetPng(character);
              setMenuOpen(false);
            }}
          >
            Экспорт PNG
          </button>
          <button
            type="button"
            onClick={() => {
              void printCharacterSheets(character);
              setMenuOpen(false);
            }}
          >
            Печать / PDF
          </button>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".rpgcharacter,.json,application/json"
        className="visually-hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          void file.text().then(async (text) => {
            const json = JSON.parse(text) as unknown;
            await markSaving(importCharacterFile(json, character.ownerPlayerId));
          });
        }}
      />

      {selected && !editingId && (
        <div className="sheet-text-toolbar">
          <button
            type="button"
            onClick={() =>
              void markSaving(
                updateTextBlock(characterId, selected.id, {
                  fontSize: Math.max(MIN_TEXT_FONT_SIZE, selected.fontSize - 1),
                }),
              )
            }
          >
            −
          </button>
          <span>{selected.fontSize}</span>
          <button
            type="button"
            onClick={() =>
              void markSaving(
                updateTextBlock(characterId, selected.id, {
                  fontSize: Math.min(MAX_TEXT_FONT_SIZE, selected.fontSize + 1),
                }),
              )
            }
          >
            +
          </button>
          {(['left', 'center', 'right'] as TextAlign[]).map((a) => (
            <button
              key={a}
              type="button"
              className={selected.align === a ? 'active' : ''}
              onClick={() => void markSaving(updateTextBlock(characterId, selected.id, { align: a }))}
            >
              {a === 'left' ? '⟸' : a === 'center' ? '≡' : '⟹'}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              void markSaving(deleteTextBlock(characterId, selected.id));
              setSelectedId(null);
            }}
          >
            Удалить
          </button>
        </div>
      )}

      <div
        ref={viewportRef}
        className={`sheet-viewport ${spaceDown ? 'panning' : ''}`}
        onWheel={onWheel}
        onPointerDown={onViewportPointerDown}
        onPointerMove={onViewportPointerMove}
        onPointerUp={onViewportPointerUp}
        onPointerCancel={onViewportPointerUp}
      >
        <div
          ref={canvasRef}
          className="sheet-canvas"
          style={{
            width: SHEET_BASE.width,
            height: SHEET_BASE.height,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          <img src={SHEET_PAGE_SRC[page]} alt="" draggable={false} className="sheet-template" />
          <div className="sheet-hit" onPointerDown={onBlankClick} />
          {page === 1 && (
            <StructuredFields
              character={character}
              onMeta={(patch) => void markSaving(updateMeta(characterId, patch))}
              onAttr={(attr, value) => void markSaving(updateAttribute(characterId, attr, value))}
            />
          )}
          {blocks.map((block) => (
            <TextBlockView
              key={block.id}
              block={
                dragPos && dragPos.id === block.id ? { ...block, x: dragPos.x, y: dragPos.y } : block
              }
              selected={selectedId === block.id}
              editing={editingId === block.id}
              onSelect={() => {
                setSelectedId(block.id);
              }}
              onEdit={() => {
                setSelectedId(block.id);
                setEditingId(block.id);
              }}
              onCommit={() => setEditingId(null)}
              onCancel={() => setEditingId(null)}
              onLocalText={(text) => scheduleTextSave(block.id, text)}
              onDragStart={(e) => {
                const pos = clientToNorm(e.clientX, e.clientY);
                if (!pos) return;
                dragText.current = { id: block.id, ox: pos.x - block.x, oy: pos.y - block.y };
              }}
            />
          ))}
        </div>
      </div>

      <div
        className="sheet-resize"
        onPointerDown={(e) => {
          e.stopPropagation();
          resizeWin.current = { x: e.clientX, y: e.clientY, w: win.w, h: win.h };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!resizeWin.current) return;
          setWin((w) => ({
            ...w,
            w: Math.max(320, resizeWin.current!.w + (e.clientX - resizeWin.current!.x)),
            h: Math.max(360, resizeWin.current!.h + (e.clientY - resizeWin.current!.y)),
          }));
        }}
        onPointerUp={() => {
          resizeWin.current = null;
        }}
      />
    </div>
  );
}

function StructuredFields({
  character,
  onMeta,
  onAttr,
}: {
  character: Character;
  onMeta: (patch: { name?: string; race?: string }) => void;
  onAttr: (attr: CharacterAttribute, value: number) => void;
}) {
  return (
    <>
      <OverlayInput
        rect={SHEET_META_LAYOUT_V1.name}
        value={character.name}
        ariaLabel="Имя персонажа"
        onCommit={(v) => onMeta({ name: v })}
      />
      <OverlayInput
        rect={SHEET_META_LAYOUT_V1.race}
        value={character.race}
        ariaLabel="Раса"
        onCommit={(v) => onMeta({ race: v })}
      />
      {CHARACTER_ATTRIBUTES.map((attr) => (
        <OverlayInput
          key={attr}
          rect={SHEET_LAYOUT_V1[attr]}
          value={formatModifier(character[attr])}
          ariaLabel={ATTRIBUTE_LABELS[attr]}
          align="center"
          onCommit={(v) => onAttr(attr, parseModifierInput(v))}
        />
      ))}
    </>
  );
}

function OverlayInput({
  rect,
  value,
  ariaLabel,
  align = 'left',
  onCommit,
}: {
  rect: { x: number; y: number; w: number; h: number };
  value: string;
  ariaLabel: string;
  align?: 'left' | 'center';
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(value);
  }, [value, focused]);

  return (
    <input
      className={`sheet-field ${align === 'center' ? 'center' : ''}`}
      style={{
        left: `${rect.x * 100}%`,
        top: `${rect.y * 100}%`,
        width: `${rect.w * 100}%`,
        height: `${rect.h * 100}%`,
      }}
      value={draft}
      aria-label={ariaLabel}
      onFocus={() => setFocused(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setFocused(false);
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setDraft(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}

function TextBlockView({
  block,
  selected,
  editing,
  onSelect,
  onEdit,
  onCommit,
  onCancel,
  onLocalText,
  onDragStart,
}: {
  block: SheetTextBlock;
  selected: boolean;
  editing: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onCommit: () => void;
  onCancel: () => void;
  onLocalText: (text: string) => void;
  onDragStart: (e: ReactPointerEvent) => void;
}) {
  const [text, setText] = useState(block.text);
  useEffect(() => {
    if (!editing) setText(block.text);
  }, [block.text, editing]);

  return (
    <div
      className={`sheet-text ${selected ? 'selected' : ''} ${editing ? 'editing' : ''}`}
      style={{
        left: `${block.x * 100}%`,
        top: `${block.y * 100}%`,
        width: `${block.width * 100}%`,
        fontSize: block.fontSize,
        textAlign: block.align,
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.button !== 0) return;
        onSelect();
        if (!editing) onDragStart(e);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onEdit();
      }}
    >
      {editing ? (
        <textarea
          value={text}
          autoFocus
          rows={Math.max(1, text.split('\n').length)}
          onChange={(e) => {
            setText(e.target.value);
            onLocalText(e.target.value);
          }}
          onBlur={onCommit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onCommit();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              setText(block.text);
              onCancel();
            }
          }}
          onPointerDown={(e) => e.stopPropagation()}
        />
      ) : (
        <span>{block.text || ' '}</span>
      )}
    </div>
  );
}

function parseModifierInput(raw: string): number {
  const t = raw.trim().replace(/^\+/, '');
  const n = Number(t);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-20, Math.min(20, Math.trunc(n)));
}

function saveLabel(state: 'idle' | 'saving' | 'saved'): string {
  if (state === 'saving') return 'Сохранение…';
  if (state === 'saved') return 'Сохранено';
  return '';
}
