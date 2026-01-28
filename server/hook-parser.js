/**
 * Hook Status Parser
 *
 * Parses the output of `gt hook` command to extract:
 * - Agent path and role
 * - Hooked bead (if any)
 * - Attached molecule (if any)
 */

import { parseHookOutput as parseHookOutputShared } from './parser-utils.js';

// Re-export the shared parser for backwards compatibility
export const parseHookOutput = parseHookOutputShared;

/**
 * Get hook status summary for display
 * @param {Object} hookStatus - Parsed hook status
 * @returns {Object} Summary for display
 */
export function getHookSummary(hookStatus) {
  if (!hookStatus.hooked) {
    return {
      status: 'idle',
      label: 'No work hooked',
      beadId: null,
      beadTitle: null
    };
  }

  return {
    status: hookStatus.autonomousMode ? 'active' : 'hooked',
    label: hookStatus.hooked.title,
    beadId: hookStatus.hooked.id,
    beadTitle: hookStatus.hooked.title,
    moleculeId: hookStatus.molecule?.id || null
  };
}
