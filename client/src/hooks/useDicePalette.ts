import { useMemo, useState } from 'react';
import {
  DEFAULT_PALETTE_ID,
  DEFAULT_PALETTES,
  type DicePalette,
} from '@rpg-table/shared';
import { loadPalette, savePalette, type StoredPalette } from '../storage/local';

export interface PaletteColors {
  body: string;
  number: string;
  mode: 'solid' | 'rainbow';
}

export interface PaletteState {
  paletteId: string;
  colors: PaletteColors;
  custom: boolean;
  setPreset: (palette: DicePalette) => void;
  setCustomColors: (body: string, number: string) => void;
}

function resolveInitial(): StoredPalette {
  const stored = loadPalette();
  if (stored) {
    const preset = DEFAULT_PALETTES.find((p) => p.id === stored.paletteId);
    return {
      ...stored,
      mode: stored.custom ? 'solid' : stored.mode ?? preset?.mode ?? 'solid',
    };
  }
  const preset = DEFAULT_PALETTES.find((p) => p.id === DEFAULT_PALETTE_ID)!;
  return {
    paletteId: preset.id,
    body: preset.body,
    number: preset.number,
    custom: false,
    mode: preset.mode ?? 'solid',
  };
}

export function useDicePalette(): PaletteState {
  const [state, setState] = useState<StoredPalette>(resolveInitial);

  const api = useMemo<PaletteState>(
    () => ({
      paletteId: state.paletteId,
      colors: {
        body: state.body,
        number: state.number,
        mode: state.mode ?? 'solid',
      },
      custom: state.custom,
      setPreset: (palette) => {
        const next: StoredPalette = {
          paletteId: palette.id,
          body: palette.body,
          number: palette.number,
          custom: false,
          mode: palette.mode ?? 'solid',
        };
        setState(next);
        savePalette(next);
      },
      setCustomColors: (body, number) => {
        const next: StoredPalette = {
          paletteId: 'custom',
          body,
          number,
          custom: true,
          mode: 'solid',
        };
        setState(next);
        savePalette(next);
      },
    }),
    [state],
  );

  return api;
}
