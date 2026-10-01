/**
 * Token validation utilities
 */

export function isValidHexColor(color: string): boolean {
  return /^#(?:[0-9A-F]{3}|[0-9A-F]{4}|[0-9A-F]{6}|[0-9A-F]{1})$/i.test(color);
}

export function isValidRgbColor(color: string): boolean {
  return /^rgb\(\d+,\s*\d+,\s*\d+\)$/.test(color);
}

export function isValidHslColor(color: string): boolean {
  return /^hsl\(\d+,\s*\d+%,\s*\d+%\)$/.test(color);
}

export function isKebabCase(str: string): boolean {
  return /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(str);
}

export function hasValidTokenPrefix(tokenName: string): boolean {
  const validPrefixes = ['chart', 'color', 'font', 'spacing', 'typography', 'shadow', 'radius', 'border', 'motion', 'z-index'];
  return validPrefixes.some(prefix => tokenName.startsWith(prefix + '-'));
}
export function isValidColorString(color: string): boolean {
  return isValidHexColor(color) || isValidRgbColor(color) || isValidHslColor(color);
}

export function isValidColorToken(token: unknown): boolean {
  if (!token || typeof token !== 'object') return false;
  
  const tokenObj = token as Record<string, unknown>;
  if (tokenObj.$type !== 'color') return false;
  if (typeof tokenObj.$value !== 'string' || !isValidColorString(tokenObj.$value)) return false;

  // Validate accessibility properties if present
  if (tokenObj.accessibility) {
    const acc = tokenObj.accessibility;
    if (typeof acc !== 'object' || acc === null) return false;
    const accObj = acc as Record<string, unknown>;
    if (accObj.wcagLevel !== undefined && accObj.wcagLevel !== 'AA' && accObj.wcagLevel !== 'AAA') return false;
    if (accObj.colorblindSafe !== undefined && typeof accObj.colorblindSafe !== 'boolean') return false;
    if (accObj.colorblindSimulation) {
      const sim = accObj.colorblindSimulation;
      if (typeof sim !== 'object' || sim === null) return false;
      const simObj = sim as Record<string, unknown>;
      if (simObj.protanopia !== undefined && (typeof simObj.protanopia !== 'string' || !isValidColorString(simObj.protanopia))) return false;
      if (simObj.deuteranopia !== undefined && (typeof simObj.deuteranopia !== 'string' || !isValidColorString(simObj.deuteranopia))) return false;
      if (simObj.tritanopia !== undefined && (typeof simObj.tritanopia !== 'string' || !isValidColorString(simObj.tritanopia))) return false;
    }
  }
  return true;
}

export function isValidChartTokens(chart: unknown): boolean {
  if (!chart || typeof chart !== 'object') return false;
  
  const chartObj = chart as Record<string, unknown>;

  // 1. Validate surface tokens
  const surfaceKeys = ['axis', 'grid', 'tooltipBg', 'tooltipBorder', 'tooltipText', 'tooltipLabel'];
  for (const key of surfaceKeys) {
    const tokenGroup = chartObj[key];
    if (!tokenGroup || typeof tokenGroup !== 'object') return false;
    const tokenGroupObj = tokenGroup as Record<string, unknown>;
    if (!isValidColorToken(tokenGroupObj.light) || !isValidColorToken(tokenGroupObj.dark)) return false;
  }

  // 2. Validate categorical ramp
  const categorical = chartObj.categorical;
  if (!categorical || typeof categorical !== 'object') return false;
  const categoricalObj = categorical as Record<string, unknown>;
  const catSteps = Object.keys(categoricalObj);
  if (catSteps.length < 5) return false;
  for (const step of catSteps) {
    const tokenGroup = categoricalObj[step];
    if (!tokenGroup || typeof tokenGroup !== 'object') return false;
    const tokenGroupObj = tokenGroup as Record<string, unknown>;
    if (!isValidColorToken(tokenGroupObj.light) || !isValidColorToken(tokenGroupObj.dark)) return false;
  }

  // 3. Validate sequential ramp
  const sequential = chartObj.sequential;
  if (!sequential || typeof sequential !== 'object') return false;
  const sequentialObj = sequential as Record<string, unknown>;
  const seqSteps = Object.keys(sequentialObj);
  if (seqSteps.length < 5) return false;
  for (const step of seqSteps) {
    const tokenGroup = sequentialObj[step];
    if (!tokenGroup || typeof tokenGroup !== 'object') return false;
    const tokenGroupObj = tokenGroup as Record<string, unknown>;
    if (!isValidColorToken(tokenGroupObj.light) || !isValidColorToken(tokenGroupObj.dark)) return false;
  }

  return true;
}
