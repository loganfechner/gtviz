/**
 * Hook Status Parser
 *
 * Parses the output of `gt hook` command to extract:
 * - Agent path and role
 * - Hooked bead (current task)
 * - Attached molecule (workflow)
 */

/**
 * Parse gt hook output into structured data
 * @param {string} output - Raw output from `gt hook` command
 * @returns {Object} Parsed hook status
 */
export function parseHookOutput(output) {
  const result = {
    agentPath: null,
    role: null,
    autonomousMode: false,
    hooked: null,
    molecule: null,
    progress: null
  };

  if (!output) {
    return result;
  }

  const lines = output.split('\n');

  for (const line of lines) {
    // Parse hook status line: "🪝 Hook Status: gtviz/polecats/rictus"
    const statusMatch = line.match(/Hook Status:\s*(.+)/);
    if (statusMatch) {
      result.agentPath = statusMatch[1].trim();
      continue;
    }

    // Parse role line: "Role: polecat"
    const roleMatch = line.match(/^Role:\s*(.+)/);
    if (roleMatch) {
      result.role = roleMatch[1].trim();
      continue;
    }

    // Check for autonomous mode
    if (line.includes('AUTONOMOUS MODE')) {
      result.autonomousMode = true;
      continue;
    }

    // Parse hooked bead: "🪝 Hooked: gt-z0n: P1: Parse and display hook status"
    const hookedMatch = line.match(/Hooked:\s*([a-zA-Z0-9-]+):\s*(.+)/);
    if (hookedMatch) {
      result.hooked = {
        id: hookedMatch[1].trim(),
        title: hookedMatch[2].trim()
      };
      continue;
    }

    // Parse molecule: "🧬 Molecule: gt-wisp-by4:"
    const moleculeMatch = line.match(/Molecule:\s*([a-zA-Z0-9-]+)/);
    if (moleculeMatch) {
      result.molecule = {
        id: moleculeMatch[1].trim()
      };
      continue;
    }

    // Parse attached time: "   Attached: 2026-01-28T02:28:36Z"
    if (result.molecule) {
      const attachedMatch = line.match(/Attached:\s*(.+)/);
      if (attachedMatch) {
        result.molecule.attachedAt = attachedMatch[1].trim();
      }
    }

    // Parse progress: "Progress: [████░░░░░░░░░░░░░░░░] 20% (2/10 steps)"
    const progressMatch = line.match(/Progress:.*?(\d+)%.*?\((\d+)\/(\d+)/);
    if (progressMatch) {
      result.progress = {
        percent: parseInt(progressMatch[1]),
        completed: parseInt(progressMatch[2]),
        total: parseInt(progressMatch[3])
      };
      continue;
    }
  }

  return result;
}

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
      task: null,
      beadId: null,
      beadTitle: null
    };
  }

  return {
    status: hookStatus.autonomousMode ? 'active' : 'hooked',
    label: hookStatus.hooked.title,
    task: hookStatus.hooked.title,
    beadId: hookStatus.hooked.id,
    beadTitle: hookStatus.hooked.title,
    moleculeId: hookStatus.molecule?.id || null,
    progress: hookStatus.progress || null
  };
}
