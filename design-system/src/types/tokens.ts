/**
 * Design token type definitions for type-safe token access
 */

export interface ColorToken {
  $type: 'color';
  $value: string;
  $description?: string;
  /**
   * Contrast ratios keyed by the surface they were measured against
   * (e.g. `onWhite`, `onNeutral50`). Numeric only; callers that only need
   * `light`/`dark` can read those keys directly.
   */
  contrast?: Record<string, number>;
  accessibility?: {
    contrastRatios?: Record<string, number>;
    wcagLevel?: 'AA' | 'AAA';
    colorblindSafe?: boolean;
    colorblindSimulation?: {
      protanopia?: string;
      deuteranopia?: string;
      tritanopia?: string;
    };
  };
}

export interface TypographyToken {
  $type: 'typography';
  fontFamily?: { $value: string };
  fontSize?: { $value: string };
  lineHeight?: { $value: string };
  fontWeight?: { $value: number };
  letterSpacing?: { $value: string };
  $description?: string;
}

export interface SpacingToken {
  $type: 'dimension';
  $value: string;
  $description?: string;
}

export interface ShadowLayer {
  offsetX: string;
  offsetY: string;
  blur: string;
  spread: string;
  color: string;
}

/**
 * Shadow tokens are either an explicit layer stack or the `'none'` sentinel
 * used by the flat `level-0` token in `tokens/shadows.json`.
 */
export interface ShadowToken {
  $type: 'shadow';
  $value: ShadowLayer | ShadowLayer[] | 'none';
  $description?: string;
}

/**
 * Motion tokens cover the three DTCG shapes shipped in `tokens/motion.json`:
 * `duration` (e.g. "200ms"), `cubicBezier` (exactly four unit-less numbers),
 * and `boolean` (e.g. the `reducedMotion` preference flag).
 *
 * The `boolean` member was added to describe already-shipped data; it is an
 * additive, backwards-compatible widening of this union.
 */
export interface MotionToken {
  $type: 'duration' | 'cubicBezier' | 'boolean';
  $value: string | number[] | boolean;
  $description?: string;
}

export interface ZIndexToken {
  $type: 'number';
  $value: number;
  $description?: string;
}

export interface OpacityToken {
  $type: 'number';
  $value: number;
  $description?: string;
}

export interface BorderToken {
  $type: 'dimension' | 'color';
  $value: string;
  $description?: string;
}

export type ColorTokenNode = ColorToken | { [key: string]: ColorTokenNode };

export interface ToastToken {
  $type: 'number';
  $value: number;
  $description?: string;
}

export interface DesignTokens {
  color?: Record<string, ColorTokenNode>;
  typography?: Record<string, TypographyToken>;
  spacing?: Record<string, SpacingToken | Record<string, SpacingToken>>;
  shadow?: Record<string, ShadowToken>;
  motion?: Record<string, MotionToken>;
  border?: Record<string, BorderToken>;
  zIndex?: Record<string, ZIndexToken>;
  opacity?: Record<string, OpacityToken>;
  breakpoint?: Record<string, SpacingToken>;
  /** Timing / capacity tokens from tokens/toast.json (DTCG number leaves). */
  toast?: Record<string, ToastToken>;
}

