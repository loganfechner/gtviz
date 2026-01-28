/**
 * Role Descriptions
 *
 * Provides descriptions for Gas Town agent roles.
 * These are used to display role information in agent cards.
 */

export const ROLE_DESCRIPTIONS = {
  witness: {
    short: 'Health monitor',
    description: 'Monitors agent health, handles stuck agents, and manages cleanup'
  },
  refinery: {
    short: 'Merge processor',
    description: 'Processes completed work from polecats and merges to main branch'
  },
  polecat: {
    short: 'Worker agent',
    description: 'Executes assigned tasks, implements features, and fixes bugs'
  },
  crew: {
    short: 'Interactive worker',
    description: 'Human-directed agent for interactive development work'
  },
  mayor: {
    short: 'Coordinator',
    description: 'Coordinates cross-rig activities and handles global issues'
  }
};

/**
 * Get description for a role
 * @param {string} role - The role name
 * @returns {Object} Role description object with short and full description
 */
export function getRoleDescription(role) {
  const normalizedRole = role?.toLowerCase() || 'unknown';
  return ROLE_DESCRIPTIONS[normalizedRole] || {
    short: 'Agent',
    description: 'Gas Town agent'
  };
}

/**
 * Get short description for a role
 * @param {string} role - The role name
 * @returns {string} Short description
 */
export function getShortDescription(role) {
  return getRoleDescription(role).short;
}
