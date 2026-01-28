<script>
  export let hooks = {};
  export let lastUpdated = null;
  export let showRig = false;

  $: hookList = Object.entries(hooks).map(([key, hook]) => ({
    ...hook,
    displayName: showRig && hook.rig ? `${hook.rig}/${hook.agent}` : hook.agent
  }));
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
    {#each hookList as hook (hook.displayName)}
      <div class="hook-item" class:has-work={hook.beadId}>
        <div class="hook-agent">
          <span class="hook-status-dot" class:active={hook.status === 'active'} class:hooked={hook.beadId && hook.status !== 'active'}></span>
          <span class="agent-name">{hook.displayName}</span>
        </div>
        {#if hook.beadId}
          <div class="hook-bead">
            <span class="bead-id">{hook.beadId}</span>
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
    color: #e94560;
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
    background: #1a1a2e;
    border-radius: 4px;
  }

  .stat-value {
    display: block;
    font-size: 1.5rem;
    font-weight: 700;
  }

  .stat-value.active {
    color: #4ade80;
  }

  .stat-value.hooked {
    color: #fbbf24;
  }

  .stat-value.idle {
    color: #666;
  }

  .stat-value.error {
    color: #ef4444;
  }

  .stat-label {
    font-size: 0.75rem;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .divider {
    height: 1px;
    background: #0f3460;
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
    background: #1a1a2e;
    border-radius: 4px;
    font-size: 0.875rem;
  }

  .hook-item.has-work {
    background: rgba(233, 69, 96, 0.1);
    border: 1px solid rgba(233, 69, 96, 0.2);
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
    background: #444;
  }

  .hook-status-dot.active {
    background: #4ade80;
    box-shadow: 0 0 6px #4ade80;
  }

  .hook-status-dot.hooked {
    background: #fbbf24;
  }

  .agent-name {
    color: #ccc;
  }

  .hook-bead {
    font-family: monospace;
    font-size: 0.75rem;
  }

  .bead-id {
    color: #e94560;
  }

  .hook-empty {
    color: #555;
    font-style: italic;
    font-size: 0.75rem;
  }

  .footer {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid #0f3460;
  }

  .last-updated {
    font-size: 0.75rem;
    color: #555;
  }

  .empty {
    color: #555;
    font-style: italic;
    text-align: center;
    padding: 1rem;
  }
</style>
