import type { DiceSides } from '@rpg-table/shared';

const colors = {
  stroke: 'currentColor',
  fill: 'currentColor',
  fillOpacity: 0.15,
};

export function DieIcon({ sides, className }: { sides: DiceSides; className?: string }) {
  const props = {
    className,
    viewBox: '0 0 48 48',
    width: 48,
    height: 48,
    'aria-hidden': true as const,
  };

  switch (sides) {
    case 4:
      // Tetrahedron / pyramid
      return (
        <svg {...props}>
          <polygon points="24,6 42,40 6,40" fill={colors.fill} fillOpacity={colors.fillOpacity} stroke={colors.stroke} strokeWidth="2" />
          <line x1="24" y1="6" x2="24" y2="40" stroke={colors.stroke} strokeWidth="1.5" opacity="0.5" />
          <line x1="6" y1="40" x2="33" y2="23" stroke={colors.stroke} strokeWidth="1" opacity="0.35" />
          <line x1="42" y1="40" x2="15" y2="23" stroke={colors.stroke} strokeWidth="1" opacity="0.35" />
        </svg>
      );
    case 6:
      return (
        <svg {...props}>
          <rect x="10" y="10" width="28" height="28" rx="3" fill={colors.fill} fillOpacity={colors.fillOpacity} stroke={colors.stroke} strokeWidth="2" />
          <circle cx="18" cy="18" r="2" fill={colors.stroke} />
          <circle cx="30" cy="18" r="2" fill={colors.stroke} />
          <circle cx="18" cy="30" r="2" fill={colors.stroke} />
          <circle cx="30" cy="30" r="2" fill={colors.stroke} />
          <circle cx="24" cy="24" r="2" fill={colors.stroke} />
        </svg>
      );
    case 8:
      return (
        <svg {...props}>
          <polygon points="24,4 44,24 24,44 4,24" fill={colors.fill} fillOpacity={colors.fillOpacity} stroke={colors.stroke} strokeWidth="2" />
          <polygon points="24,4 44,24 24,24" fill="none" stroke={colors.stroke} strokeWidth="1" opacity="0.45" />
          <polygon points="24,24 44,24 24,44" fill="none" stroke={colors.stroke} strokeWidth="1" opacity="0.45" />
        </svg>
      );
    case 10:
      return (
        <svg {...props}>
          <polygon points="24,4 40,18 34,42 14,42 8,18" fill={colors.fill} fillOpacity={colors.fillOpacity} stroke={colors.stroke} strokeWidth="2" />
          <polyline points="24,4 24,42" fill="none" stroke={colors.stroke} strokeWidth="1.2" opacity="0.4" />
          <polyline points="8,18 40,18" fill="none" stroke={colors.stroke} strokeWidth="1.2" opacity="0.4" />
          <polyline points="14,42 24,18 34,42" fill="none" stroke={colors.stroke} strokeWidth="1" opacity="0.35" />
        </svg>
      );
    case 12:
      return (
        <svg {...props}>
          <polygon
            points="24,5 35,10 42,20 40,32 30,42 18,42 8,32 6,20 13,10"
            fill={colors.fill}
            fillOpacity={colors.fillOpacity}
            stroke={colors.stroke}
            strokeWidth="2"
          />
          <polygon points="24,16 32,20 30,28 18,28 16,20" fill="none" stroke={colors.stroke} strokeWidth="1.2" opacity="0.5" />
        </svg>
      );
    case 20:
      return (
        <svg {...props}>
          <polygon points="24,4 42,16 42,34 24,44 6,34 6,16" fill={colors.fill} fillOpacity={colors.fillOpacity} stroke={colors.stroke} strokeWidth="2" />
          <polygon points="24,4 36,28 12,28" fill="none" stroke={colors.stroke} strokeWidth="1.2" opacity="0.45" />
          <polyline points="6,16 24,44 42,16" fill="none" stroke={colors.stroke} strokeWidth="1" opacity="0.35" />
        </svg>
      );
    default:
      return null;
  }
}
