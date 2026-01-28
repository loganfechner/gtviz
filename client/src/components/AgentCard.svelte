<script>
  export let agent;

  $: statusClass = agent.status || 'idle';
  $: roleIcon = getRoleIcon(agent.role);

  function getRoleIcon(role) {
    switch (role) {
      case 'witness': return '👁';
      case 'refinery': return '🏭';
      case 'polecat': return '🐾';
      default: return '🔧';
    }
  }

  function formatBeadId(id) {
    if (!id) return '';
    // Truncate long IDs
    return id.length > 12 ? id.slice(0, 12) + '...' : id;
  }
</script>

<div class="card" class:active={statusClass === 'active'} class:hooked={statusClass === 'hooked'} class:error={statusClass === 'error'}>
  <div class="header">
    <span class="role-icon">{roleIcon}</span>
    <span class="name">{agent.agent}</span>
    <span class="role-badge">{agent.role}</span>
  </div>

  <div class="content">
    {#if agent.beadId}
      <div class="hook-info">
        <span class="hook-icon">🪝</span>
        <div class="hook-details">
          <span class="bead-id">{formatBeadId(agent.beadId)}</span>
          <span class="bead-title">{agent.beadTitle || agent.label}</span>
        </div>
      </div>

      {#if agent.moleculeId}
        <div class="molecule-info">
          <span class="molecule-icon">🧬</span>
          <span class="molecule-id">{agent.moleculeId}</span>
        </div>
      {/if}
    {:else if agent.status === 'error'}
      <div class="error-info">
        <span class="error-icon">⚠</span>
        <span class="error-text">{agent.label || 'Error'}</span>
      </div>
    {:else}
      <div class="idle-info">
        <span class="idle-text">No work hooked</span>
      </div>
    {/if}
  </div>

  <div class="footer">
    <span class="status-indicator" class:active={statusClass === 'active'}></span>
    <span class="status-text">{statusClass}</span>
  </div>
</div>

<style>
  .card {
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 1rem;
    transition: all 0.2s;
  }

  .card:hover {
    border-color: var(--accent);
    box-shadow: 0 4px 12px rgba(233, 69, 96, 0.1);
  }

  .card.active {
    border-color: var(--success);
    box-shadow: 0 0 12px rgba(74, 222, 128, 0.2);
  }

  .card.hooked {
    border-color: var(--warning);
  }

  .card.error {
    border-color: var(--error);
  }

  .header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .role-icon {
    font-size: 1.25rem;
  }

  .name {
    font-weight: 600;
    color: var(--text-primary);
  }

  .role-badge {
    margin-left: auto;
    font-size: 0.75rem;
    padding: 0.125rem 0.5rem;
    background: var(--border-color);
    border-radius: 4px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .content {
    min-height: 3rem;
  }

  .hook-info {
    display: flex;
    gap: 0.5rem;
    align-items: flex-start;
  }

  .hook-icon {
    font-size: 1rem;
    flex-shrink: 0;
  }

  .hook-details {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    overflow: hidden;
  }

  .bead-id {
    font-family: monospace;
    font-size: 0.75rem;
    color: var(--accent);
  }

  .bead-title {
    font-size: 0.875rem;
    color: var(--text-secondary);
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
    color: var(--text-muted);
  }

  .molecule-icon {
    font-size: 0.875rem;
  }

  .molecule-id {
    font-family: monospace;
  }

  .error-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--error);
  }

  .idle-info {
    color: var(--text-dim);
    font-style: italic;
  }

  .footer {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--border-color);
  }

  .status-indicator {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--text-dim);
  }

  .status-indicator.active {
    background: var(--success);
    box-shadow: 0 0 6px var(--success);
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .status-text {
    font-size: 0.75rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
</style>
