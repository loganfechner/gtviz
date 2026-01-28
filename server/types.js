/**
 * JSDoc Type Definitions for gtviz
 *
 * This file provides type definitions for IDE support and documentation.
 * Import types using: @typedef {import('./types.js').TypeName}
 *
 * @module types
 */

// =============================================================================
// Agent Types
// =============================================================================

/**
 * Agent status values
 * @typedef {'running' | 'idle' | 'stopped' | 'unknown'} AgentStatusValue
 */

/**
 * Agent role in Gas Town
 * @typedef {'polecat' | 'crew' | 'witness' | 'refinery' | 'mayor' | 'agent'} AgentRole
 */

/**
 * Agent object representing a Gas Town agent
 * @typedef {Object} Agent
 * @property {string} name - Agent name (e.g., 'rictus', 'witness')
 * @property {AgentRole} role - Agent role in the rig
 * @property {string} rig - Rig name the agent belongs to
 * @property {AgentStatusValue} status - Current agent status
 * @property {boolean} [sessionRunning] - Whether agent has an active session
 * @property {string} [state] - Agent state from gt CLI (e.g., 'working', 'ready')
 * @property {boolean} [hasWork] - Whether agent has work on hook
 * @property {string|null} [currentBead] - Bead ID currently hooked
 * @property {string|null} [hookBead] - Alias for currentBead
 * @property {string} [sessionId] - Unique session identifier
 */

/**
 * Agent status change event
 * @typedef {Object} AgentStatusChange
 * @property {string} rig - Rig name
 * @property {string} name - Agent name
 * @property {AgentStatusValue|null} oldStatus - Previous status
 * @property {AgentStatusValue} newStatus - New status
 * @property {string} timestamp - ISO timestamp of change
 */

/**
 * Agent status history entry
 * @typedef {Object} AgentHistoryEntry
 * @property {AgentStatusValue} status - Status at this point in time
 * @property {string} timestamp - ISO timestamp
 * @property {string} agent - Agent name
 * @property {string} rig - Rig name
 */

/**
 * Agent completion record for performance tracking
 * @typedef {Object} AgentCompletion
 * @property {string} beadId - ID of completed bead
 * @property {string} title - Title of completed bead
 * @property {string} completedAt - ISO timestamp of completion
 * @property {number|null} duration - Duration in milliseconds (null if unknown)
 */

/**
 * Agent statistics for performance tracking
 * @typedef {Object} AgentStats
 * @property {AgentCompletion[]} completions - Recent completions (max 50)
 * @property {number} totalCompleted - Total completion count
 * @property {number} avgDuration - Average completion duration in ms
 */

// =============================================================================
// Bead Types
// =============================================================================

/**
 * Bead status values
 * @typedef {'open' | 'hooked' | 'in_progress' | 'done' | 'closed'} BeadStatus
 */

/**
 * Bead priority values
 * @typedef {'critical' | 'high' | 'normal' | 'low' | null} BeadPriority
 */

/**
 * Bead type values
 * @typedef {'task' | 'bug' | 'feature' | 'epic' | 'chore' | null} BeadType
 */

/**
 * Bead object representing a Gas Town issue/task
 * @typedef {Object} Bead
 * @property {string} id - Unique bead identifier (e.g., 'gt-abc123')
 * @property {string} title - Bead title/summary
 * @property {BeadStatus} status - Current status
 * @property {BeadPriority} priority - Priority level
 * @property {string[]} labels - Labels/tags
 * @property {string|null} owner - Owner (who created it)
 * @property {string|null} assignee - Assignee (who's working on it)
 * @property {BeadType} type - Bead type
 * @property {string} [description] - Full description
 * @property {string[]} [notes] - Notes/comments
 * @property {string[]} [dependsOn] - IDs of beads this depends on
 * @property {string|null} [createdAt] - Creation timestamp
 * @property {string|null} [updatedAt] - Last update timestamp
 * @property {string|null} [closedAt] - Close timestamp
 * @property {string} [rig] - Rig name (added during polling)
 * @property {BeadHistoryEntry[]} [statusHistory] - Status change history
 */

/**
 * Bead status history entry
 * @typedef {Object} BeadHistoryEntry
 * @property {BeadStatus} status - Status at this point in time
 * @property {string} timestamp - ISO timestamp
 * @property {string} beadId - Bead ID
 * @property {string} rig - Rig name
 */

// =============================================================================
// Hook Types
// =============================================================================

/**
 * Parsed hook status from `gt hook` command
 * @typedef {Object} HookStatus
 * @property {string|null} agentPath - Full agent path (e.g., 'gtviz/polecats/rictus')
 * @property {AgentRole|null} role - Agent role
 * @property {boolean} autonomousMode - Whether in autonomous work mode
 * @property {HookedBead|null} hooked - Currently hooked bead info
 * @property {HookedMolecule|null} molecule - Attached molecule info
 */

/**
 * Hooked bead information
 * @typedef {Object} HookedBead
 * @property {string} id - Bead ID
 * @property {string} title - Bead title
 */

/**
 * Attached molecule information
 * @typedef {Object} HookedMolecule
 * @property {string} id - Molecule ID
 * @property {string} [attachedAt] - ISO timestamp when attached
 */

/**
 * Hook summary for display
 * @typedef {Object} HookSummary
 * @property {'idle' | 'active' | 'hooked'} status - Hook status category
 * @property {string} label - Display label
 * @property {string|null} beadId - Hooked bead ID
 * @property {string|null} beadTitle - Hooked bead title
 * @property {string|null} [moleculeId] - Attached molecule ID
 */

/**
 * Hook data from polling
 * @typedef {Object} HookData
 * @property {string} agent - Agent name
 * @property {string} bead - Hooked bead ID
 * @property {string} title - Bead title
 * @property {string|null} molecule - Molecule ID if attached
 * @property {boolean} autonomousMode - Whether in autonomous mode
 * @property {string|null} attachedAt - ISO timestamp when attached
 */

// =============================================================================
// Rig Types
// =============================================================================

/**
 * Rig object representing a Gas Town rig/project
 * @typedef {Object} Rig
 * @property {string} name - Rig name
 * @property {number} polecats - Number of polecats
 * @property {number} crew - Number of crew members
 * @property {string[]} agents - List of agent names
 * @property {'unknown' | 'active' | 'idle'} status - Rig status
 */

// =============================================================================
// Event Types
// =============================================================================

/**
 * Event type values
 * @typedef {'bead_status_change' | 'mail' | 'log' | 'agent_status_change'} EventType
 */

/**
 * Base event object
 * @typedef {Object} BaseEvent
 * @property {EventType} type - Event type
 * @property {string} timestamp - ISO timestamp
 */

/**
 * Bead status change event
 * @typedef {Object} BeadStatusChangeEvent
 * @property {'bead_status_change'} type - Event type
 * @property {string} beadId - Bead ID
 * @property {string} rig - Rig name
 * @property {BeadStatus} from - Previous status
 * @property {BeadStatus} to - New status
 * @property {string} timestamp - ISO timestamp
 */

/**
 * Mail event
 * @typedef {Object} MailEvent
 * @property {'mail'} type - Event type
 * @property {string} [from] - Sender
 * @property {string} [to] - Recipient
 * @property {string} [subject] - Mail subject
 * @property {string} timestamp - ISO timestamp
 */

/**
 * Generic event (union of all event types)
 * @typedef {BeadStatusChangeEvent | MailEvent | LogEntry} Event
 */

// =============================================================================
// Log Types
// =============================================================================

/**
 * Log level values
 * @typedef {'error' | 'warn' | 'info' | 'debug'} LogLevel
 */

/**
 * Log type values
 * @typedef {'town' | 'daemon' | 'unknown' | string} LogType
 */

/**
 * Parsed log entry
 * @typedef {Object} LogEntry
 * @property {string} timestamp - ISO timestamp
 * @property {LogLevel} level - Log level
 * @property {string} message - Log message content
 * @property {string} rig - Rig name
 * @property {string|null} agent - Agent name (e.g., 'polecats/rictus')
 * @property {LogType} logType - Type of log file
 * @property {string} source - Full file path
 */

// =============================================================================
// Metrics Types
// =============================================================================

/**
 * Agent activity counts
 * @typedef {Object} AgentActivity
 * @property {number} active - Agents actively working
 * @property {number} hooked - Agents with work hooked
 * @property {number} idle - Idle agents
 * @property {number} error - Agents in error state
 */

/**
 * Metrics buffer sizes
 * @typedef {Object} MetricsBufferSizes
 * @property {number} pollDurations - Size of poll duration buffer
 * @property {number} eventVolume - Size of event volume buffer
 * @property {number} currentIntervalEvents - Events in current interval
 */

/**
 * Metrics history for graphs
 * @typedef {Object} MetricsHistory
 * @property {number[]} pollDurations - Historical poll durations
 * @property {number[]} eventVolume - Historical event counts per interval
 * @property {string[]} timestamps - ISO timestamps for each data point
 */

/**
 * Complete metrics snapshot
 * @typedef {Object} Metrics
 * @property {number} pollDuration - Last poll duration in ms
 * @property {number} avgPollDuration - Average poll duration in ms
 * @property {number} updateFrequency - Events per minute (recent average)
 * @property {number} totalPolls - Total number of polls
 * @property {number} totalEvents - Total number of events
 * @property {number} successfulPolls - Number of successful polls
 * @property {number} failedPolls - Number of failed polls
 * @property {number} successRate - Poll success rate percentage
 * @property {number} wsConnections - Current WebSocket connections
 * @property {number} totalWsConnections - Total WebSocket connections ever
 * @property {number} totalWsMessages - Total WebSocket messages sent
 * @property {MetricsBufferSizes} bufferSizes - Buffer size info
 * @property {AgentActivity} agentActivity - Agent activity counts
 * @property {MetricsHistory} history - Historical data for graphs
 */

// =============================================================================
// State Types
// =============================================================================

/**
 * Main application state shape
 * @typedef {Object} State
 * @property {Object<string, Rig>} rigs - Rigs by name
 * @property {Object<string, Agent[]>} agents - Agents by rig name
 * @property {Object<string, Bead[]>} beads - Beads by rig name
 * @property {Object<string, Object<string, HookData>>} hooks - Hooks by rig, then agent
 * @property {MailEvent[]} mail - Recent mail (max 50)
 * @property {Event[]} events - Recent events (max 100)
 * @property {Object<string, AgentHistoryEntry[]>} agentHistory - Status history by agent key
 * @property {Metrics} metrics - System metrics
 * @property {Object<string, BeadHistoryEntry[]>} beadHistory - Status history by bead key
 * @property {LogEntry[]} logs - Recent log entries (max 500)
 * @property {Object<string, AgentStats>} agentStats - Performance stats by agent key
 */

// =============================================================================
// Prediction Types
// =============================================================================

/**
 * Load prediction for a specific time horizon
 * @typedef {Object} LoadPrediction
 * @property {number} horizon - Minutes ahead
 * @property {string} timestamp - ISO timestamp of predicted time
 * @property {number} predicted - Predicted load value
 * @property {number} lower - Lower confidence bound
 * @property {number} upper - Upper confidence bound
 */

/**
 * Queue depth prediction
 * @typedef {Object} QueuePrediction
 * @property {number} horizon - Minutes ahead
 * @property {string} timestamp - ISO timestamp of predicted time
 * @property {number} currentQueue - Current queue depth
 * @property {number} predicted - Predicted queue depth
 * @property {number} completionRate - Beads per minute completion rate
 */

/**
 * Completion time estimate for a bead
 * @typedef {Object} CompletionEstimate
 * @property {string} beadId - Bead ID
 * @property {string} title - Bead title
 * @property {string} status - Current bead status
 * @property {string} rig - Rig name
 * @property {number} queuePosition - Position in queue
 * @property {string} estimatedCompletionTime - ISO timestamp of estimated completion
 * @property {number} estimatedMinutes - Estimated minutes until completion
 * @property {number} confidence - Confidence score 0-1
 */

/**
 * Agent capacity analysis
 * @typedef {Object} AgentCapacityAnalysis
 * @property {string} name - Agent name
 * @property {string} rig - Rig name
 * @property {string} status - Current status
 * @property {boolean} hasWork - Whether agent has work
 * @property {string|null} currentBead - Current bead ID
 * @property {number} throughputPerHour - Completions per hour
 * @property {number} avgDurationMin - Average duration in minutes
 * @property {number} recentCompletions - Recent completion count
 * @property {boolean} isBottleneck - Whether agent is a bottleneck
 */

/**
 * Spike prediction
 * @typedef {Object} SpikePrediction
 * @property {number} horizon - Minutes until spike
 * @property {string} timestamp - ISO timestamp of predicted spike
 * @property {number} predictedLoad - Predicted load at spike
 * @property {number} threshold - Spike threshold
 * @property {'high' | 'medium'} severity - Spike severity
 * @property {string} recommendation - Recommended action
 */

/**
 * Complete forecast data
 * @typedef {Object} Forecasts
 * @property {LoadPrediction[]} loadPredictions - Load predictions at horizons
 * @property {QueuePrediction[]} queuePredictions - Queue depth predictions
 * @property {Object<string, CompletionEstimate>} completionEstimates - ETA per bead
 * @property {Object} capacityAnalysis - Capacity analysis summary and per-agent
 * @property {SpikePrediction[]} spikePredictions - Predicted spikes
 * @property {string|null} lastUpdated - Last forecast update timestamp
 * @property {number} confidence - Overall confidence 0-1
 * @property {number} [dataPoints] - Number of data points used
 * @property {number} [historyWindow] - History window in ms
 */

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Status detector options
 * @typedef {Object} StatusDetectorOptions
 * @property {number} [pollInterval=5000] - Polling interval in milliseconds
 */

/**
 * Retry configuration
 * @typedef {Object} RetryConfig
 * @property {number} maxRetries - Maximum retry attempts
 * @property {number} initialDelayMs - Initial delay between retries
 * @property {number} maxDelayMs - Maximum delay between retries
 * @property {number} backoffMultiplier - Multiplier for exponential backoff
 */

// Export empty object to make this a module
export {};
