/**
 * Token loader utilities
 */

import { DesignTokens } from '../types/tokens';
import * as fs from 'fs';
import * as path from 'path';

export function loadTokens(tokenFile: string): DesignTokens {
  // Reject anything that isn't a plain basename with a .json extension
  if (!/^[^/\\]+\.json$/.test(tokenFile)) {
    throw new Error(`Invalid token file name: "${tokenFile}"`);
  }

  const tokensDir = path.resolve(process.cwd(), 'tokens');
  const tokenPath = path.resolve(tokensDir, tokenFile);

  // Ensure resolved path stays within the tokens directory
  if (!tokenPath.startsWith(tokensDir + path.sep) && tokenPath !== tokensDir) {
    throw new Error(`Path traversal detected for token file: "${tokenFile}"`);
  }

  const tokenData = fs.readFileSync(tokenPath, 'utf-8');
  return JSON.parse(tokenData) as DesignTokens;
}

export function getAllTokens(): DesignTokens {
  const tokenFiles = ['colors.json', 'typography.json', 'spacing.json', 'shadows.json', 'motion.json', 'borders.json', 'z-index.json', 'opacity.json', 'breakpoints.json', 'toast.json'];
  const allTokens: DesignTokens = {};

  tokenFiles.forEach(file => {
    try {
      const tokens = loadTokens(file);
      Object.assign(allTokens, tokens);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load required token file "${file}": ${message}`);
    }
  });

  return allTokens;
}

/**
 * Resolves a design token by dotted path from the merged DTCG token tree.
 *
 * Path segments map directly to JSON object keys, e.g.:
 *   "color.primary.light.$value"  → traverses color → primary → light → $value
 *   "color.primary"               → if the resolved node contains mode sub-keys
 *                                   ('light'/'dark'), resolves via `mode`
 *                                   and returns `$value`; otherwise returns
 *                                   the raw node.
 *
 * @param path - Dot-separated key path into the token tree.
 * @param mode - Preferred mode for tokens that have 'light'/'dark' variants.
 *               Defaults to 'light'.
 * @returns The resolved `$value` (or raw node) for the path, or `undefined`
 *          when any segment is missing.
 */
export function getTokenValue(
  path: string,
  mode: 'light' | 'dark' = 'light',
): unknown {
  if (!path) return undefined;

  let node: unknown = getAllTokens();

  for (const segment of path.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[segment];
    if (node === undefined) return undefined;
  }

  // If the resolved node is a plain object with both mode keys, resolve by mode.
  if (
    node !== null &&
    typeof node === 'object' &&
    !Array.isArray(node)
  ) {
    const record = node as Record<string, unknown>;

    // Mode-aware resolution: node has 'light' or 'dark' sub-objects that are
    // DTCG token nodes (i.e. contain a '$value' key).
    const modeNode = record[mode] as Record<string, unknown> | undefined;
    if (
      modeNode !== undefined &&
      modeNode !== null &&
      typeof modeNode === 'object' &&
      '$value' in modeNode
    ) {
      return modeNode['$value'];
    }

    // Already a DTCG leaf node — return its $value directly.
    if ('$value' in record) {
      return record['$value'];
    }
  }

  return node;
}
