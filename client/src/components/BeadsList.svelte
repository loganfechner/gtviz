<script>
  export let beads = [];

  function getStatusColor(status) {
    switch (status) {
      case 'open': return 'var(--accent-blue)';
      case 'in_progress': return 'var(--accent-orange)';
      case 'done': return 'var(--accent-green)';
      default: return 'var(--text-secondary)';
    }
  }
</script>

<div class="beads-list">
  <h3>Active Beads</h3>

  {#if beads.length === 0}
    <p class="empty">No beads found</p>
  {:else}
    {#each beads as bead}
      <div class="bead">
        <div class="bead-header">
          <span class="bead-id">{bead.id}</span>
          <span class="bead-status" style="color: {getStatusColor(bead.status)}">
            {bead.status}
          </span>
        </div>
        <div class="bead-title">{bead.title || 'Untitled'}</div>
        {#if bead.owner}
          <div class="bead-owner">Assigned: {bead.owner}</div>
        {/if}
      </div>
    {/each}
  {/if}
</div>

<style>
  .beads-list h3 {
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

  .bead {
    background: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: 6px;
    padding: 10px 12px;
    margin-bottom: 8px;
  }

  .bead-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }

  .bead-id {
    font-family: monospace;
    font-size: 11px;
    color: var(--accent-blue);
  }

  .bead-status {
    font-size: 10px;
    text-transform: uppercase;
    font-weight: 600;
  }

  .bead-title {
    font-size: 13px;
    color: var(--text-primary);
    line-height: 1.4;
  }

  .bead-owner {
    font-size: 11px;
    color: var(--text-secondary);
    margin-top: 6px;
  }
</style>
