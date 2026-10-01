/**
 * vaultFilter.ts
 *
 * Pure functions for filtering and sorting vault lists.
 * Extracted for unit-testability in isolation from React components.
 *
 * Invariants enforced by this module:
 *   - Neither exported function mutates its input array.
 *   - Filtering and sorting are deterministic for the same inputs.
 *   - Sorting is totally ordered (id tiebreaker) and thus stable and
 *     consistent across engines.
 *   - Malformed inputs (non-arrays, invalid dates, NaN amounts) degrade
 *     gracefully instead of throwing or producing unsafe ordering.
 *   - Search matching is case-insensitive and whitespace-trimmed.
 */

import type { Vault, VaultStatus } from '../types/vault';

/**
 * Filter options for vault list.
 */
export interface VaultFilters {
  /** Status to filter by; undefined or 'all' returns all statuses */
  status: VaultStatus | 'all';
  /** Search query to match against vault name (case-insensitive) */
  query: string;
}

/**
 * Sort options for vault list.
 */
export interface VaultSortOptions {
  /** Field to sort by */
  by: 'deadline' | 'amount';
  /** Sort direction: 'asc' for ascending, 'desc' for descending */
  dir: 'asc' | 'desc';
}

/**
 * Returns true when the value is a non-null object (arrays included).
 */
function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

/**
 * Safely coerces an unknown value to a trimmed lowercase string.
 * Non-string inputs are treated as empty to avoid throwing on malformed
 * runtime data (e.g. fetch responses that bypass TypeScript).
 */
function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/**
 * Converts a deadline value to a numeric timestamp.
 * Returns Number.POSITIVE_INFINITY for invalid/missing dates so that
 * undated vaults sort last in ascending order and first in descending
 * order, without ever producing NaN comparisons.
 */
function toTimestamp(deadline: unknown): number {
  if (deadline === null || deadline === undefined) {
    return Number.POSITIVE_INFINITY;
  }

  const time = new Date(deadline as string | number | Date).getTime();
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

/**
 * Coerces an amount to a finite number. Non-numeric or non-finite values
 * are treated as Number.POSITIVE_INFINITY so they group at the end of
 * ascending orders and do not corrupt the comparator.
 */
function toAmount(amount: unknown): number {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    return Number.POSITIVE_INFINITY;
  }
  return amount;
}

/**
 * Returns a stable identifier for tiebreaking. Missing ids fall back to
 * an empty string so comparisons never throw.
 */
function toId(id: unknown): string {
  return typeof id === 'string' ? id : '';
}

/**
 * Filters vaults by status and/or name search query.
 *
 * @param vaults - Array of vaults to filter
 * @param options - Filter options (status, query)
 * @returns Filtered array of vaults (new array, does not mutate input)
 *
 * @example
 * filterVaults(vaults, { status: 'active', query: 'alpha' })
 */
export function filterVaults(
  vaults: Vault[],
  options: Partial<VaultFilters> = {},
): Vault[] {
  // Defensive guard: a non-array (e.g. undefined from a failed fetch)
  // must not throw. Return an empty list so callers render an empty state.
  if (!Array.isArray(vaults)) {
    return [];
  }

  const safeOptions = isObject(options) ? options : {};
  const status = safeOptions.status;
  const rawQuery = safeOptions.query;
  const normalizedQuery = normalizeString(rawQuery);

  // Whitespace-only query should return empty results.
  // Only trigger when a string was actually provided and it collapsed to ''.
  if (typeof rawQuery === 'string' && rawQuery !== '' && !normalizedQuery) {
    return [];
  }

  return vaults.filter((vault) => {
    if (!isObject(vault)) {
      return false;
    }

    // Filter by status if provided (and not 'all')
    if (status && status !== 'all' && vault.status !== status) {
      return false;
    }

    // Filter by search query if provided (case-insensitive match on name)
    if (normalizedQuery) {
      const name = normalizeString(vault.name);
      if (!name.includes(normalizedQuery)) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Sorts vaults by deadline or amount.
 *
 * @param vaults - Array of vaults to sort
 * @param options - Sort options (by, dir)
 * @returns Sorted array of vaults (new array, does not mutate input)
 *
 * @example
 * sortVaults(vaults, { by: 'deadline', dir: 'asc' })
 */
export function sortVaults(
  vaults: Vault[],
  options: VaultSortOptions,
): Vault[] {
  // Defensive guard: non-array inputs yield an empty list rather than throwing.
  if (!Array.isArray(vaults)) {
    return [];
  }

  const safeOptions = isObject(options) ? options : {} as VaultSortOptions;
  const by = safeOptions.by === 'amount' ? 'amount' : 'deadline';
  const dir = safeOptions.dir === 'desc' ? 'desc' : 'asc';
  const multiplier = dir === 'asc' ? 1 : -1;

  return [...vaults].sort((a, b) => {
    let comparison = 0;

    if (by === 'deadline') {
      comparison = toTimestamp(a.deadline) - toTimestamp(b.deadline);
    } else {
      comparison = toAmount(a.amount) - toAmount(b.amount);
    }

    // Stable sort: use id as tiebreaker to maintain consistent ordering.
    // The tiebreaker is always ascending by id so that equal elements can
    // never flip based on the primary direction.
    if (comparison === 0) {
      return toId(a.id).localeCompare(toId(b.id));
    }

    return comparison * multiplier;
  });
}
