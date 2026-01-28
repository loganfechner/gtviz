<script>
  export let hooks = {};

  $: hookEntries = Object.entries(hooks);
</script>

<div class="hook-status">
  <h3>Hook Status</h3>

  {#if hookEntries.length === 0}
    <p class="empty">No hooks active</p>
  {:else}
    {#each hookEntries as [agent, hook]}
      <div class="hook">
        <div class="hook-agent">{agent}</div>
        {#if hook}
          <div class="hook-content">
            <div class="hook-bead">{hook.bead || 'Unknown bead'}</div>
            {#if hook.task}
              <div class="hook-task">{hook.task}</div>
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
    color: #8b949e;
    margin-bottom: 12px;
  }

  .empty {
    color: #6e7681;
    font-size: 13px;
    text-align: center;
    padding: 20px;
  }

  .hook {
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 10px 12px;
    margin-bottom: 8px;
  }

  .hook-agent {
    font-size: 12px;
    font-weight: 600;
    color: #f0883e;
    margin-bottom: 6px;
  }

  .hook-content {
    padding-left: 8px;
    border-left: 2px solid #238636;
  }

  .hook-bead {
    font-family: monospace;
    font-size: 12px;
    color: #58a6ff;
  }

  .hook-task {
    font-size: 11px;
    color: #8b949e;
    margin-top: 4px;
  }

  .hook-empty {
    font-size: 12px;
    color: #6e7681;
    font-style: italic;
  }
</style>
