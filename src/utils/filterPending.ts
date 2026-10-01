/**
 * Filters pending validation tasks by search query and milestone.
 *
 * @param tasks - Array of pending validation tasks
 * @param options - Options for filtering
 * @param options.query - Search query to match against vaultName and owner (case-insensitive)
 * @param options.milestone - Milestone to filter by; undefined or empty string returns all milestones
 * @returns Filtered array of tasks
 */
import type { ValidationTask } from '../Zustand/Store';

export interface FilterOptions {
  query?: string;
  milestone?: string;
}

export type PendingTask = ValidationTask;

export function filterPending(
  tasks: PendingTask[],
  options: FilterOptions = {},
): PendingTask[] {
  const { query = '', milestone = '' } = options;
  const normalizedQuery = query.trim().toLowerCase();

  return tasks.filter((task) => {
    // Filter by milestone if provided
    if (milestone && task.milestone !== milestone) {
      return false;
    }

    // Filter by search query if provided (case-insensitive match on vaultName or owner)
    if (normalizedQuery) {
      const vaultNameMatch = task.vaultName.toLowerCase().includes(normalizedQuery);
      const ownerMatch = task.owner.toLowerCase().includes(normalizedQuery);

      if (!vaultNameMatch && !ownerMatch) {
        return false;
      }
    }

    return true;
  });
}
