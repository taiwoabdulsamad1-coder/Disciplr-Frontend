import {
  hasValidTokenPrefix,
  isKebabCase,
  isValidChartTokens,
  isValidColorString,
  isValidColorToken,
  isValidHexColor,
  isValidHslColor,
  isValidRgbColor,
} from '../utils/validators';

const colorToken = (value = '#112233') => ({
  $type: 'color',
  $value: value,
});

const tokenGroup = (value = '#112233') => ({
  light: colorToken(value),
  dark: colorToken(value),
});

const ramp = (steps = 5) =>
  Object.fromEntries(
    Array.from({ length: steps }, (_, index) => [
      `step-${index + 1}`,
      tokenGroup(`#11223${index}`),
    ]),
  );

const validChart = () => ({
  axis: tokenGroup(),
  grid: tokenGroup(),
  tooltipBg: tokenGroup(),
  tooltipBorder: tokenGroup(),
  tooltipText: tokenGroup(),
  tooltipLabel: tokenGroup(),
  categorical: ramp(5),
  sequential: ramp(5),
});

describe('standalone color string validators', () => {
  it('validates supported hex color lengths', () => {
    expect(isValidHexColor('#ABCDEF')).toBe(true);
    expect(isValidHexColor('#abcdef')).toBe(true);
    expect(isValidHexColor('#abc')).toBe(true);
    expect(isValidHexColor('#abcd')).toBe(true);
    expect(isValidHexColor('#3B82F6AA')).toBe(true);
    expect(isValidHexColor('#123abz')).toBe(false);
    expect(isValidHexColor('ABCDEF')).toBe(false);
  });

  it('validates rgb colors with numeric channels', () => {
    expect(isValidRgbColor('rgb(0,0,0)')).toBe(true);
    expect(isValidRgbColor('rgb(255, 255, 255)')).toBe(true);
    expect(isValidRgbColor('rgba(0, 0, 0, 1)')).toBe(false);
    expect(isValidRgbColor('rgb(a, b, c)')).toBe(false);
  });

  it('validates hsl colors with percentage saturation and lightness', () => {
    expect(isValidHslColor('hsl(210, 50%, 40%)')).toBe(true);
    expect(isValidHslColor('hsl(210, 50, 40)')).toBe(false);
    expect(isValidHslColor('hsla(210, 50%, 40%, 1)')).toBe(false);
  });

  it('accepts any supported color string format', () => {
    expect(isValidColorString('#112233')).toBe(true);
    expect(isValidColorString('rgb(17, 34, 51)')).toBe(true);
    expect(isValidColorString('hsl(210, 50%, 13%)')).toBe(true);
    expect(isValidColorString('var(--accent)')).toBe(false);
  });
});

describe('token name validators', () => {
  it('validates kebab-case names', () => {
    expect(isKebabCase('color-chart-step-1')).toBe(true);
    expect(isKebabCase('color')).toBe(true);
    expect(isKebabCase('Color-chart')).toBe(false);
    expect(isKebabCase('color--chart')).toBe(false);
    expect(isKebabCase('-color-chart')).toBe(false);
  });

  it('requires one of the supported token prefixes', () => {
    expect(hasValidTokenPrefix('color-accent')).toBe(true);
    expect(hasValidTokenPrefix('spacing-4')).toBe(true);
    expect(hasValidTokenPrefix('typography-title')).toBe(true);
    expect(hasValidTokenPrefix('shadow-card')).toBe(true);
    expect(hasValidTokenPrefix('radius-md')).toBe(true);
    expect(hasValidTokenPrefix('border-default')).toBe(true);
    expect(hasValidTokenPrefix('motion-fast')).toBe(true);
    expect(hasValidTokenPrefix('chart-accent')).toBe(true);
    expect(hasValidTokenPrefix('color')).toBe(false);
  });
});

describe('isValidHexColor boundary table', () => {
  it('accepts supported hex color lengths', () => {
    expect(isValidHexColor('#0A7668')).toBe(true);
    expect(isValidHexColor('#000000')).toBe(true);
    expect(isValidHexColor('#FFFFFF')).toBe(true);
    expect(isValidHexColor('#0a7668')).toBe(true);
    expect(isValidHexColor('#abc')).toBe(true);
    expect(isValidHexColor('#ABCD')).toBe(true);
    expect(isValidHexColor('#0A7668FF')).toBe(true);
  });

  it('rejects malformed hex colors', () => {
    expect(isValidHexColor('#ab')).toBe(false); // too short
    expect(isValidHexColor('#0A7668FFF')).toBe(false); // too long
    expect(isValidHexColor('0A7668')).toBe(false); // missing #
    expect(isValidHexColor('#12345g')).toBe(false); // non-hex char
    expect(isValidHexColor('')).toBe(false); // empty
    expect(isValidHexColor(' ')).toBe(false); // whitespace
    expect(isValidHexColor(' #0A7668 ')).toBe(false); // surrounding whitespace
  });
});

describe('isValidRgbColor boundary table', () => {
  it('accepts canonical rgb colors', () => {
    expect(isValidRgbColor('rgb(0,0,0)')).toBe(true);
    expect(isValidRgbColor('rgb(255, 255, 255)')).toBe(true);
  });

  it('rejects malformed rgb colors', () => {
    expect(isValidRgbColor('rgb( 0, 0, 0 )')).toBe(false); // extra spaces
    expect(isValidRgbColor('rgb(0,, 0, 0)')).toBe(false); // extra comma
    expect(isValidRgbColor('rgb(0, 0)')).toBe(false); // missing channel
    expect(isValidRgbColor('rgba(0, 0, 0, 1)')).toBe(false); // alpha variant
    expect(isValidRgbColor('')).toBe(false); // empty
    expect(isValidRgbColor('  ')).toBe(false); // whitespace
  });
});

describe('isValidHslColor boundary table', () => {
  it('accepts canonical hsl colors', () => {
    expect(isValidHslColor('hsl(0, 0%, 0%)')).toBe(true);
    expect(isValidHslColor('hsl(210, 50%, 40%)')).toBe(true);
    expect(isValidHslColor('hsl(210,50%,40%)')).toBe(true);
  });

  it('rejects malformed hsl colors', () => {
    expect(isValidHslColor('hsl(210, 50, 40)')).toBe(false); // missing %
    expect(isValidHslColor('hsla(210, 50%, 40%, 1)')).toBe(false); // alpha variant
    expect(isValidHslColor('hsl( 210, 50%, 40% )')).toBe(false); // extra spaces
    expect(isValidHslColor('')).toBe(false); // empty
    expect(isValidHslColor('  ')).toBe(false); // whitespace
  });
});

describe('isKebabCase boundary table', () => {
  it('accepts kebab-case names', () => {
    expect(isKebabCase('chart-grid')).toBe(true);
    expect(isKebabCase('chart')).toBe(true);
    expect(isKebabCase('chart-grid-1')).toBe(true);
  });

  it('rejects non-kebab-case names', () => {
    expect(isKebabCase('Chart-Grid')).toBe(false); // mixed case
    expect(isKebabCase('chart_grid')).toBe(false); // underscore
    expect(isKebabCase('1chart')).toBe(false); // leading digit
    expect(isKebabCase('chart-')).toBe(false); // trailing hyphen
    expect(isKebabCase('')).toBe(false); // empty
    expect(isKebabCase(' ')).toBe(false); // whitespace
  });
});

describe('hasValidTokenPrefix boundary table', () => {
  it('accepts each documented prefix', () => {
    expect(hasValidTokenPrefix('chart-categorical-1')).toBe(true);
    expect(hasValidTokenPrefix('chart-sequential-3')).toBe(true);
    expect(hasValidTokenPrefix('color-accent')).toBe(true);
    expect(hasValidTokenPrefix('font-body')).toBe(true);
    expect(hasValidTokenPrefix('spacing-4')).toBe(true);
    expect(hasValidTokenPrefix('typography-title')).toBe(true);
    expect(hasValidTokenPrefix('shadow-card')).toBe(true);
    expect(hasValidTokenPrefix('radius-md')).toBe(true);
    expect(hasValidTokenPrefix('border-default')).toBe(true);
    expect(hasValidTokenPrefix('motion-fast')).toBe(true);
    expect(hasValidTokenPrefix('z-index-modal')).toBe(true);
  });

  it('rejects unknown prefixes and prefixes without a hyphen', () => {
    expect(hasValidTokenPrefix('unknown-foo')).toBe(false); // unknown prefix
    expect(hasValidTokenPrefix('color')).toBe(false); // prefix without hyphen
    expect(hasValidTokenPrefix('colorfoo')).toBe(false); // prefix without hyphen
    expect(hasValidTokenPrefix('')).toBe(false); // empty
    expect(hasValidTokenPrefix(' ')).toBe(false); // whitespace
  });
});

describe('isValidColorToken', () => {
  it('accepts a valid color token with optional accessibility metadata', () => {
    expect(
      isValidColorToken({
        ...colorToken(),
        accessibility: {
          wcagLevel: 'AAA',
          colorblindSafe: true,
          colorblindSimulation: {
            protanopia: '#112234',
            deuteranopia: 'rgb(17, 34, 53)',
            tritanopia: 'hsl(210, 50%, 13%)',
          },
        },
      }),
    ).toBe(true);
  });

  it('rejects non-token and malformed token values', () => {
    expect(isValidColorToken(null)).toBe(false);
    expect(isValidColorToken('not-an-object')).toBe(false);
    expect(isValidColorToken({ $type: 'dimension', $value: '#112233' })).toBe(
      false,
    );
    expect(isValidColorToken({ $type: 'color', $value: 123 })).toBe(false);
    expect(isValidColorToken({ $type: 'color', $value: '#bad' })).toBe(false);
    expect(isValidColorToken({ $type: 'color', $value: '#abc' })).toBe(true);
    expect(isValidColorToken({ $type: 'color', $value: '#3B82F6AA' })).toBe(true);
  });

  it('validates accessibility metadata branches', () => {
    const valid = colorToken();

    expect(
      isValidColorToken({ ...valid, accessibility: { wcagLevel: 'AA' } }),
    ).toBe(true);
    expect(
      isValidColorToken({ ...valid, accessibility: { wcagLevel: 'A' } }),
    ).toBe(false);
    expect(
      isValidColorToken({
        ...valid,
        accessibility: { colorblindSafe: 'true' },
      }),
    ).toBe(false);
    expect(
      isValidColorToken({ ...valid, accessibility: 'not-an-object' }),
    ).toBe(false);
    expect(
      isValidColorToken({
        ...valid,
        accessibility: { colorblindSimulation: 'not-an-object' },
      }),
    ).toBe(false);
  });

  it('rejects malformed colorblind simulations for each supported key', () => {
    expect(
      isValidColorToken({
        ...colorToken(),
        accessibility: { colorblindSimulation: { protanopia: 'bad' } },
      }),
    ).toBe(false);
    expect(
      isValidColorToken({
        ...colorToken(),
        accessibility: { colorblindSimulation: { deuteranopia: 'bad' } },
      }),
    ).toBe(false);
    expect(
      isValidColorToken({
        ...colorToken(),
        accessibility: { colorblindSimulation: { tritanopia: 'bad' } },
      }),
    ).toBe(false);
  });

  it('rejects primitive types and edge cases', () => {
    expect(isValidColorToken(undefined)).toBe(false);
    expect(isValidColorToken(null)).toBe(false);
    expect(isValidColorToken(123)).toBe(false);
    expect(isValidColorToken(true)).toBe(false);
    expect(isValidColorToken(false)).toBe(false);
    expect(isValidColorToken('')).toBe(false);
    expect(isValidColorToken(Symbol('test'))).toBe(false);
  });

  it('rejects partially-shaped objects with missing required field', () => {
    expect(isValidColorToken({})).toBe(false);
    expect(isValidColorToken({ $type: 'color' })).toBe(false);
    expect(isValidColorToken({ $value: '#112233' })).toBe(false);
    expect(isValidColorToken({ $type: 'color', $value: null })).toBe(false);
    expect(isValidColorToken({ $type: 'color', $value: 123 })).toBe(false);
  });

  it('rejects objects with wrong $type', () => {
    expect(isValidColorToken({ $type: 'dimension', $value: '#112233' })).toBe(false);
    expect(isValidColorToken({ $type: 'typography', $value: '#112233' })).toBe(false);
    expect(isValidColorToken({ $type: null, $value: '#112233' })).toBe(false);
    expect(isValidColorToken({ $type: 123, $value: '#112233' })).toBe(false);
  });

  it('rejects malformed accessibility objects', () => {
    expect(isValidColorToken({ ...colorToken(), accessibility: null })).toBe(false);
    expect(isValidColorToken({ ...colorToken(), accessibility: 'string' })).toBe(false);
    expect(isValidColorToken({ ...colorToken(), accessibility: 123 })).toBe(false);
    expect(isValidColorToken({ ...colorToken(), accessibility: [] })).toBe(false);
    expect(isValidColorToken({ ...colorToken(), accessibility: { wcagLevel: 'A' } })).toBe(false);
    expect(isValidColorToken({ ...colorToken(), accessibility: { wcagLevel: 'BB' } })).toBe(false);
    expect(isValidColorToken({ ...colorToken(), accessibility: { colorblindSafe: 'true' } })).toBe(false);
    expect(isValidColorToken({ ...colorToken(), accessibility: { colorblindSafe: 1 } })).toBe(false);
  });

  it('rejects malformed colorblind simulation objects', () => {
    expect(isValidColorToken({ ...colorToken(), accessibility: { colorblindSimulation: null } })).toBe(false);
    expect(isValidColorToken({ ...colorToken(), accessibility: { colorblindSimulation: 'string' } })).toBe(false);
    expect(isValidColorToken({ ...colorToken(), accessibility: { colorblindSimulation: {} } })).toBe(true);
  });
});

describe('isValidChartTokens', () => {
  it('accepts a well-formed chart token group', () => {
    expect(isValidChartTokens(validChart())).toBe(true);
  });

  it('accepts shorthand and alpha hex colors in chart tokens', () => {
    const chart = validChart();
    chart.axis = tokenGroup('#fff');
    chart.grid = tokenGroup('#ffff');
    chart.tooltipBg = tokenGroup('#3B82F6AA');
    expect(isValidChartTokens(chart)).toBe(true);
  });

  it('rejects malformed chart token groups', () => {
    expect(isValidChartTokens(null)).toBe(false);
    expect(isValidChartTokens({})).toBe(false);
    expect(isValidChartTokens({ ...validChart(), axis: tokenGroup('#bad') })).toBe(false);
  });
});
