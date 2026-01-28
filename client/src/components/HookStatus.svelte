<script>
  export let hooks = {};

  $: hookEntries = Object.entries(hooks);

  function formatTime(timestamp) {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }
</script>

<div class="hook-status">
  <h3>Hook Status</h3>

  {#if hookEntries.length === 0}
    <p class="empty">No hooks active</p>
  {:else}
    {#each hookEntries as [agent, hook]}
      <div class="hook">
        <div class="hook-header">
          <span class="hook-agent">{agent}</span>
          {#if hook?.autonomousMode}
            <span class="badge autonomous">AUTO</span>
          {/if}
        </div>
        {#if hook}
          <div class="hook-content">
            <div class="hook-bead">{hook.bead || 'Unknown bead'}</div>
            {#if hook.title}
              <div class="hook-title">{hook.title}</div>
            {/if}
            {#if hook.molecule}
              <div class="hook-molecule">
                <span class="label">Molecule:</span> {hook.molecule}
              </div>
            {/if}
            {#if hook.attachedAt}
              <div class="hook-time">
                <span class="label">Attached:</span> {formatTime(hook.attachedAt)}
              </div>
            {/if}
          </div>
        {:else}
          <div class="hook-empty">Nothing on hook</div>
        {/if}
      </div>
    {/each}
  {/if}
</div>

<style>
  .hook-status h3 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-secondary);
    margin-bottom: 12px;
  }

  .empty {
    color: var(--text-tertiary);
    font-size: 13px;
    text-align: center;
    padding: 20px;
  }

  .hook {
    background: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: 6px;
    padding: 10px 12px;
    margin-bottom: 8px;
  }

  .hook-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  .hook-agent {
    font-size: 12px;
    font-weight: 600;
    color: var(--accent-orange);
  }

  .badge {
    font-size: 9px;
    padding: 2px 6px;
    border-radius: 10px;
    font-weight: 600;
    text-transform: uppercase;
  }

  .badge.autonomous {
    background: var(--accent-green);
    color: #fff;
  }

  .hook-content {
    padding-left: 8px;
    border-left: 2px solid var(--accent-green);
  }

  .hook-bead {
    font-family: monospace;
    font-size: 12px;
    color: var(--accent-blue);
  }

  .hook-title {
    font-size: 11px;
    color: var(--text-primary);
    margin-top: 4px;
  }

  .hook-molecule {
    font-size: 10px;
    color: var(--accent-purple);
    margin-top: 4px;
    font-family: monospace;
  }

  .hook-time {
    font-size: 10px;
    color: var(--text-tertiary);
    margin-top: 4px;
  }

  .label {
    color: var(--text-secondary);
  }

  .hook-empty {
    font-size: 12px;
    color: var(--text-tertiary);
    font-style: italic;
  }
</style>
