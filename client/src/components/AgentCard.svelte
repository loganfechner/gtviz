<script>
  export let agent;

  let expanded = false;
  let showTooltip = false;

  $: statusClass = getStatusClass(agent.status);
  $: roleIcon = getRoleIcon(agent.role);
  $: hasTask = agent.task || agent.beadId;
  $: progressPercent = agent.progress?.percent || 0;

  function getRoleIcon(role) {
    switch (role) {
      case 'witness': return '👁';
      case 'refinery': return '🏭';
      case 'polecat': return '🐾';
      case 'crew': return '👤';
      case 'mayor': return '🏛';
      default: return '🔧';
    }
  }

  function getStatusClass(status) {
    switch (status) {
      case 'active': return 'active';
      case 'hooked': return 'hooked';
      case 'idle': return 'idle';
      case 'error': return 'error';
      default: return 'unknown';
    }
  }

  function formatBeadId(id) {
    if (!id) return '';
    return id.length > 12 ? id.slice(0, 12) + '...' : id;
  }

  function formatTime(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  }

  function toggleExpand() {
    expanded = !expanded;
  }
</script>

<div
  class="card {statusClass}"
  class:expanded
  on:click={toggleExpand}
  on:keydown={(e) => e.key === 'Enter' && toggleExpand()}
  role="button"
  tabindex="0"
  on:mouseenter={() => showTooltip = true}
  on:mouseleave={() => showTooltip = false}
>
  <!-- Header with role icon, name, and description -->
  <div class="header">
    <span class="role-icon" title={agent.fullDescription}>{roleIcon}</span>
    <div class="name-section">
      <span class="name">{agent.name}</span>
      <span class="description">{agent.description}</span>
    </div>
    <span class="role-badge">{agent.role}</span>
  </div>

  <!-- Current task section -->
  <div class="task-section">
    {#if hasTask}
      <div class="task-info">
        <span class="task-icon">🪝</span>
        <div class="task-details">
          <span class="bead-id">{formatBeadId(agent.beadId)}</span>
          <span class="task-title">{agent.task || agent.beadTitle}</span>
        </div>
      </div>

      {#if agent.moleculeId}
        <div class="molecule-info">
          <span class="molecule-icon">🧬</span>
          <span class="molecule-id">{agent.moleculeId}</span>
          {#if agent.progress}
            <div class="progress-bar">
              <div class="progress-fill" style="width: {progressPercent}%"></div>
            </div>
            <span class="progress-text">{progressPercent}%</span>
          {/if}
        </div>
      {/if}
    {:else if agent.status === 'error'}
      <div class="error-info">
        <span class="error-icon">⚠</span>
        <span class="error-text">{agent.error || 'Error fetching status'}</span>
      </div>
    {:else}
      <div class="idle-info">
        <span class="idle-text">No work hooked</span>
      </div>
    {/if}
  </div>

  <!-- Last output section (collapsible) -->
  {#if agent.lastOutput || expanded}
    <div class="output-section" class:visible={expanded || agent.lastOutput}>
      {#if agent.lastOutput}
        <div class="output-label">Last output:</div>
        <div class="output-content">{agent.lastOutput}</div>
      {:else}
        <div class="output-label">No recent output</div>
      {/if}
    </div>
  {/if}

  <!-- Footer with status and last activity -->
  <div class="footer">
    <div class="status-indicator">
      <span class="status-dot" class:active={statusClass === 'active'}></span>
      <span class="status-text">{agent.status}</span>
    </div>
    {#if agent.lastActivity}
      <span class="last-activity">{formatTime(agent.lastActivity)}</span>
    {/if}
  </div>

  <!-- Tooltip with full description (on hover) -->
  {#if showTooltip && agent.fullDescription}
    <div class="tooltip">
      <div class="tooltip-title">{agent.role}</div>
      <div class="tooltip-content">{agent.fullDescription}</div>
    </div>
  {/if}
</div>

<style>
  .card {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 1rem;
    cursor: pointer;
    transition: all 0.2s;
    position: relative;
  }

  .card:hover {
    border-color: #58a6ff;
    box-shadow: 0 4px 12px rgba(88, 166, 255, 0.1);
  }

  .card.active {
    border-color: #3fb950;
    box-shadow: 0 0 12px rgba(63, 185, 80, 0.15);
  }

  .card.hooked {
    border-color: #d29922;
  }

  .card.error {
    border-color: #f85149;
  }

  .card.expanded {
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  }

  /* Header */
  .header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .role-icon {
    font-size: 1.5rem;
    flex-shrink: 0;
  }

  .name-section {
    flex: 1;
    min-width: 0;
  }

  .name {
    display: block;
    font-weight: 600;
    color: #e6edf3;
    font-size: 1rem;
  }

  .description {
    display: block;
    font-size: 0.75rem;
    color: #8b949e;
    margin-top: 0.125rem;
  }

  .role-badge {
    font-size: 0.625rem;
    padding: 0.125rem 0.5rem;
    background: #21262d;
    border-radius: 4px;
    color: #8b949e;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  /* Task section */
  .task-section {
    min-height: 3rem;
    margin-bottom: 0.5rem;
  }

  .task-info {
    display: flex;
    gap: 0.5rem;
    align-items: flex-start;
  }

  .task-icon {
    font-size: 1rem;
    flex-shrink: 0;
  }

  .task-details {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    overflow: hidden;
  }

  .bead-id {
    font-family: monospace;
    font-size: 0.75rem;
    color: #58a6ff;
  }

  .task-title {
    font-size: 0.875rem;
    color: #e6edf3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .molecule-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.5rem;
    font-size: 0.75rem;
    color: #8b949e;
  }

  .molecule-icon {
    font-size: 0.875rem;
  }

  .molecule-id {
    font-family: monospace;
  }

  .progress-bar {
    flex: 1;
    height: 4px;
    background: #21262d;
    border-radius: 2px;
    overflow: hidden;
    max-width: 80px;
  }

  .progress-fill {
    height: 100%;
    background: #3fb950;
    transition: width 0.3s;
  }

  .progress-text {
    font-size: 0.625rem;
    color: #3fb950;
  }

  .error-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #f85149;
    font-size: 0.875rem;
  }

  .idle-info {
    color: #6e7681;
    font-style: italic;
    font-size: 0.875rem;
  }

  /* Output section */
  .output-section {
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid #21262d;
    display: none;
  }

  .output-section.visible {
    display: block;
  }

  .output-label {
    font-size: 0.625rem;
    color: #6e7681;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.25rem;
  }

  .output-content {
    font-family: monospace;
    font-size: 0.75rem;
    color: #8b949e;
    background: #0d1117;
    padding: 0.5rem;
    border-radius: 4px;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 100px;
    overflow-y: auto;
  }

  /* Footer */
  .footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid #21262d;
  }

  .status-indicator {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #6e7681;
  }

  .status-dot.active {
    background: #3fb950;
    box-shadow: 0 0 8px #3fb950;
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .status-text {
    font-size: 0.75rem;
    color: #8b949e;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .last-activity {
    font-size: 0.625rem;
    color: #6e7681;
  }

  /* Tooltip */
  .tooltip {
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-top: 0.5rem;
    padding: 0.75rem;
    background: #21262d;
    border: 1px solid #30363d;
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    z-index: 100;
    min-width: 200px;
    max-width: 300px;
    pointer-events: none;
  }

  .tooltip-title {
    font-size: 0.75rem;
    font-weight: 600;
    color: #58a6ff;
    text-transform: uppercase;
    margin-bottom: 0.25rem;
  }

  .tooltip-content {
    font-size: 0.8125rem;
    color: #e6edf3;
    line-height: 1.4;
  }
</style>
