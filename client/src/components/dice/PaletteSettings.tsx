import { DEFAULT_PALETTES } from '@rpg-table/shared';
import type { PaletteState } from '../../hooks/useDicePalette';

const RAINBOW_CSS =
  'linear-gradient(135deg, #FF3B5C, #FF8A3D, #FFD93D, #3DDC97, #3DA9FC, #7B5CFF, #FF5AC8)';

export function PaletteSettings({ palette }: { palette: PaletteState }) {
  return (
    <div>
      <div className="palette-grid">
        {DEFAULT_PALETTES.map((p) => {
          const selected = !palette.custom && palette.paletteId === p.id;
          const isRainbow = p.mode === 'rainbow';
          return (
            <button
              key={p.id}
              type="button"
              className={`palette-swatch ${selected ? 'selected' : ''}`}
              onClick={() => palette.setPreset(p)}
            >
              <div
                className="swatch-preview"
                style={{
                  background: isRainbow ? RAINBOW_CSS : p.body,
                  color: p.number,
                }}
              >
                20
              </div>
              <span style={{ fontSize: '0.78rem' }}>{p.name}</span>
            </button>
          );
        })}
      </div>
      <div className="color-pickers">
        <label>
          Основной цвет
          <input
            type="color"
            value={palette.colors.body}
            disabled={palette.colors.mode === 'rainbow' && !palette.custom}
            onChange={(e) => palette.setCustomColors(e.target.value, palette.colors.number)}
          />
        </label>
        <label>
          Цвет цифр
          <input
            type="color"
            value={palette.colors.number}
            onChange={(e) => palette.setCustomColors(palette.colors.body, e.target.value)}
          />
        </label>
      </div>
    </div>
  );
}
