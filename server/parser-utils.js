/**
 * Shared parsing utilities for beads and hooks
 *
 * Consolidated from gt-poller.js and hook-parser.js to reduce duplication
 */

/**
 * Convert bead status symbol to string status
 * @param {string} symbol - Status symbol (?, ○, ●, ✓, ✗)
 * @returns {string} Status string
 */
export function parseStatusFromSymbol(symbol) {
  switch (symbol) {
    case '?': return 'open';
    case '○': return 'open';
    case '●': return 'hooked';
    case '✓': return 'done';
    case '✗': return 'closed';
    default: return 'open';
  }
}

/**
 * Normalize priority string to standard format
 * @param {string|null} p - Priority string (P1, P2, critical, high, etc.)
 * @returns {string|null} Normalized priority (critical, high, normal, low)
 */
export function normalizePriority(p) {
  if (!p) return null;
  const lower = p.toLowerCase();
  if (lower === 'p1' || lower === 'critical') return 'critical';
  if (lower === 'p2' || lower === 'high') return 'high';
  if (lower === 'p3' || lower === 'normal') return 'normal';
  if (lower === 'p4' || lower === 'low') return 'low';
  return lower;
}

/**
 * Parse a bead header line
 * Handles formats like:
 * - "? gt-abc123 · Add feature [● P2 · HOOKED]"
 * - "○ gt-xyz · Title [● P3 · OPEN]"
 *
 * @param {string} line - Header line to parse
 * @returns {Object|null} Parsed bead header or null if no match
 */
export function parseBeadHeader(line) {
  // Parse: status-symbol id · title [● priority · STATUS]
  const match = line.match(/^([?○●✓✗])\s+(\S+)\s*·?\s*(.+?)(?:\s+\[([^\]]+)\])?$/);
  if (!match) return null;

  const [, symbol, id, title, meta] = match;
  const result = {
    id,
    title: title.trim(),
    status: parseStatusFromSymbol(symbol),
    priority: null,
    statusFromMeta: null
  };

  if (meta) {
    // Parse metadata like "● P2 · HOOKED" or "● critical · OPEN"
    const priorityMatch = meta.match(/P([1-4])|critical|high|normal|low/i);
    if (priorityMatch) {
      result.priority = normalizePriority(priorityMatch[0]);
    }
    const statusMatch = meta.match(/HOOKED|OPEN|IN_PROGRESS|CLOSED|DONE/i);
    if (statusMatch) {
      result.statusFromMeta = statusMatch[0].toLowerCase().replace('_', '_');
    }
  }

  // Use status from metadata if available
  if (result.statusFromMeta) {
    result.status = result.statusFromMeta;
  }

  return result;
}

/**
 * Parse hook output text (from `gt hook` command)
 * Returns a standardized structure for hook status
 *
 * @param {string} output - Raw output from `gt hook` command
 * @returns {Object} Parsed hook status
 */
export function parseHookOutput(output) {
  const result = {
    agentPath: null,
    role: null,
    autonomousMode: false,
    hooked: null,
    molecule: null
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
  }

  return result;
}

/**
 * Convert parsed hook output to a simpler format for polling
 * Used by gt-poller.js for agent-centric hook tracking
 *
 * @param {Object} hookData - Parsed hook data from parseHookOutput
 * @param {string} agent - Agent name
 * @returns {Object|null} Simplified hook data for polling
 */
export function toPollerHookFormat(hookData, agent) {
  if (!hookData.hooked) return null;

  return {
    agent,
    bead: hookData.hooked.id,
    title: hookData.hooked.title,
    molecule: hookData.molecule?.id || null,
    autonomousMode: hookData.autonomousMode,
    attachedAt: hookData.molecule?.attachedAt || null
  };
}

/**
 * Parse metadata fields from bead detail lines
 * Handles fields like "Owner: mayor", "Type: bug", etc.
 *
 * @param {string} line - Line to parse
 * @returns {Object|null} Field name and value, or null if no match
 */
export function parseMetadataField(line) {
  const fieldPatterns = [
    { pattern: /^Owner:\s*(.+)/, field: 'owner' },
    { pattern: /^Assignee:\s*(.+)/, field: 'assignee' },
    { pattern: /^Type:\s*(.+)/, field: 'type' },
    { pattern: /^Created:\s*(.+)/, field: 'createdAt' },
    { pattern: /^Updated:\s*(.+)/, field: 'updatedAt' }
  ];

  for (const { pattern, field } of fieldPatterns) {
    const match = line.match(pattern);
    if (match) {
      return { field, value: match[1].trim() };
    }
  }

  return null;
}

/**
 * Parse dependency reference from bead detail lines
 * Handles lines like "  → ○ gt-xyz: Title"
 *
 * @param {string} line - Line to parse
 * @returns {string|null} Dependency bead ID or null
 */
export function parseDependency(line) {
  const depMatch = line.match(/^\s*→\s*[○●]\s*(\S+):/);
  return depMatch ? depMatch[1] : null;
}
