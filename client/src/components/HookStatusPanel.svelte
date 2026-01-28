<script>
  import CopyButton from './CopyButton.svelte';

  export let hooks = {};
  export let lastUpdated = null;

  $: hookList = Object.values(hooks);
  $: activeCount = hookList.filter(h => h.status === 'active').length;
  $: hookedCount = hookList.filter(h => h.beadId).length;
  $: idleCount = hookList.filter(h => !h.beadId && h.status !== 'error').length;
  $: errorCount = hookList.filter(h => h.status === 'error').length;

  function formatTime(isoString) {
    if (!isoString) return 'Never';
    const date = new Date(isoString);
    return date.toLocaleTimeString();
  }
</script>

<div class="panel">
  <h3>Hook Status</h3>

  <div class="stats">
    <div class="stat">
      <span class="stat-value active">{activeCount}</span>
      <span class="stat-label">Active</span>
    </div>
    <div class="stat">
      <span class="stat-value hooked">{hookedCount}</span>
      <span class="stat-label">Hooked</span>
    </div>
    <div class="stat">
      <span class="stat-value idle">{idleCount}</span>
      <span class="stat-label">Idle</span>
    </div>
    {#if errorCount > 0}
      <div class="stat">
        <span class="stat-value error">{errorCount}</span>
        <span class="stat-label">Error</span>
      </div>
    {/if}
  </div>

  <div class="divider"></div>

  <div class="hook-list">
    {#each hookList as hook (hook.agent)}
      <div class="hook-item" class:has-work={hook.beadId}>
        <div class="hook-agent">
          <span class="hook-status-dot" class:active={hook.status === 'active'} class:hooked={hook.beadId && hook.status !== 'active'}></span>
          <span class="agent-name">{hook.agent}</span>
          <CopyButton value={hook.agent} label="Copied agent name" />
        </div>
        {#if hook.beadId}
          <div class="hook-bead">
            <span class="bead-id">{hook.beadId}</span>
            <CopyButton value={hook.beadId} label="Copied bead ID" />
          </div>
        {:else}
          <div class="hook-empty">idle</div>
        {/if}
      </div>
    {/each}

    {#if hookList.length === 0}
      <p class="empty">No agents discovered</p>
    {/if}
  </div>

  <div class="footer">
    <span class="last-updated">Updated: {formatTime(lastUpdated)}</span>
  </div>
</div>

<style>
  .panel {
    padding: 1rem;
  }

  h3 {
    font-size: 1rem;
    color: var(--accent);
    margin-bottom: 1rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  h3::before {
    content: '🪝';
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .stat {
    text-align: center;
    padding: 0.5rem;
    background: var(--bg-primary);
    border-radius: 4px;
    transition: background-color 0.2s;
  }

  .stat-value {
    display: block;
    font-size: 1.5rem;
    font-weight: 700;
  }

  .stat-value.active {
    color: var(--success);
  }

  .stat-value.hooked {
    color: var(--warning);
  }

  .stat-value.idle {
    color: var(--text-dim);
  }

  .stat-value.error {
    color: var(--error);
  }

  .stat-label {
    font-size: 0.75rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .divider {
    height: 1px;
    background: var(--border-color);
    margin: 1rem 0;
  }

  .hook-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .hook-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem;
    background: var(--bg-primary);
    border-radius: 4px;
    font-size: 0.875rem;
    transition: background-color 0.2s;
  }

  .hook-item.has-work {
    background: rgba(233, 69, 96, 0.1);
    border: 1px solid rgba(233, 69, 96, 0.2);
  }

  :global([data-theme="light"]) .hook-item.has-work {
    background: rgba(220, 38, 38, 0.1);
    border: 1px solid rgba(220, 38, 38, 0.2);
  }

  .hook-agent {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .hook-status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--text-faint);
  }

  .hook-status-dot.active {
    background: var(--success);
    box-shadow: 0 0 6px var(--success);
  }

  .hook-status-dot.hooked {
    background: var(--warning);
  }

  .agent-name {
    color: var(--text-secondary);
  }

  .hook-bead {
    font-family: monospace;
    font-size: 0.75rem;
  }

  .bead-id {
    color: var(--accent);
  }

  .hook-empty {
    color: var(--text-faint);
    font-style: italic;
    font-size: 0.75rem;
  }

  .footer {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-color);
  }

  .last-updated {
    font-size: 0.75rem;
    color: var(--text-faint);
  }

  .empty {
    color: var(--text-faint);
    font-style: italic;
    text-align: center;
    padding: 1rem;
  }
</style>
