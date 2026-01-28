<script>
  export let beads = [];

  // Track expanded beads
  let expandedBeads = new Set();

  function toggleExpand(id) {
    if (expandedBeads.has(id)) {
      expandedBeads.delete(id);
    } else {
      expandedBeads.add(id);
    }
    expandedBeads = expandedBeads; // Trigger reactivity
  }

  function getStatusColor(status) {
    switch (status) {
      case 'open': return '#58a6ff';
      case 'in_progress': return '#f0883e';
      case 'closed': return '#3fb950';
      case 'blocked': return '#f85149';
      case 'deferred': return '#8b949e';
      default: return '#8b949e';
    }
  }

  function getStatusIcon(status) {
    switch (status) {
      case 'open': return '○';
      case 'in_progress': return '◐';
      case 'closed': return '✓';
      case 'blocked': return '⊗';
      case 'deferred': return '◌';
      default: return '○';
    }
  }

  function getPriorityLabel(priority) {
    if (priority === 0 || priority === 1) return 'P' + priority;
    if (priority === 2) return 'P2';
    if (priority === 3) return 'P3';
    return priority !== undefined ? 'P' + priority : '';
  }

  // Group beads by status
  $: groupedBeads = {
    in_progress: beads.filter(b => b.status === 'in_progress'),
    open: beads.filter(b => b.status === 'open'),
    blocked: beads.filter(b => b.status === 'blocked'),
    closed: beads.filter(b => b.status === 'closed'),
    deferred: beads.filter(b => b.status === 'deferred')
  };

  $: statusGroups = [
    { key: 'in_progress', label: 'In Progress', beads: groupedBeads.in_progress },
    { key: 'open', label: 'Open', beads: groupedBeads.open },
    { key: 'blocked', label: 'Blocked', beads: groupedBeads.blocked },
    { key: 'deferred', label: 'Deferred', beads: groupedBeads.deferred },
    { key: 'closed', label: 'Closed', beads: groupedBeads.closed }
  ].filter(g => g.beads.length > 0);
</script>

<div class="beads-list">
  <h3>Beads</h3>

  {#if beads.length === 0}
    <p class="empty">No beads found</p>
  {:else}
    {#each statusGroups as group}
      <div class="status-group">
        <div class="group-header" style="border-left-color: {getStatusColor(group.key)}">
          <span class="group-icon" style="color: {getStatusColor(group.key)}">{getStatusIcon(group.key)}</span>
          <span class="group-label">{group.label}</span>
          <span class="group-count">{group.beads.length}</span>
        </div>

        {#each group.beads as bead}
          <div
            class="bead"
            class:expanded={expandedBeads.has(bead.id)}
            on:click={() => toggleExpand(bead.id)}
            on:keydown={(e) => e.key === 'Enter' && toggleExpand(bead.id)}
            role="button"
            tabindex="0"
          >
            <div class="bead-header">
              <span class="bead-id">{bead.id}</span>
              <div class="bead-meta">
                {#if bead.priority !== undefined}
                  <span class="bead-priority" class:high={bead.priority <= 1}>{getPriorityLabel(bead.priority)}</span>
                {/if}
                {#if bead.type}
                  <span class="bead-type">{bead.type}</span>
                {/if}
              </div>
            </div>
            <div class="bead-title">{bead.title || 'Untitled'}</div>
            {#if bead.assignee}
              <div class="bead-assignee">@{bead.assignee}</div>
            {/if}

            {#if expandedBeads.has(bead.id)}
              <div class="bead-details">
                {#if bead.description}
                  <div class="bead-description">{bead.description.substring(0, 500)}{bead.description.length > 500 ? '...' : ''}</div>
                {/if}
                {#if bead.created_at}
                  <div class="bead-dates">
                    <span>Created: {new Date(bead.created_at).toLocaleDateString()}</span>
                    {#if bead.updated_at}
                      <span>Updated: {new Date(bead.updated_at).toLocaleDateString()}</span>
                    {/if}
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/each}
  {/if}
</div>

<style>
  .beads-list h3 {
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

  .status-group {
    margin-bottom: 16px;
  }

  .group-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    margin-bottom: 8px;
    border-left: 3px solid;
    background: rgba(255, 255, 255, 0.02);
  }

  .group-icon {
    font-size: 12px;
  }

  .group-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    color: #8b949e;
  }

  .group-count {
    font-size: 10px;
    color: #6e7681;
    background: rgba(255, 255, 255, 0.05);
    padding: 2px 6px;
    border-radius: 10px;
  }

  .bead {
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 10px 12px;
    margin-bottom: 6px;
    cursor: pointer;
    transition: border-color 0.15s ease;
  }

  .bead:hover {
    border-color: #58a6ff;
  }

  .bead.expanded {
    border-color: #58a6ff;
    background: #161b22;
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
    color: #58a6ff;
  }

  .bead-meta {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .bead-priority {
    font-size: 9px;
    font-weight: 600;
    padding: 2px 5px;
    border-radius: 3px;
    background: rgba(139, 148, 158, 0.2);
    color: #8b949e;
  }

  .bead-priority.high {
    background: rgba(248, 81, 73, 0.2);
    color: #f85149;
  }

  .bead-type {
    font-size: 9px;
    color: #6e7681;
    text-transform: lowercase;
  }

  .bead-title {
    font-size: 13px;
    color: #e6edf3;
    line-height: 1.4;
  }

  .bead-assignee {
    font-size: 11px;
    color: #8b949e;
    margin-top: 6px;
  }

  .bead-details {
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid #30363d;
  }

  .bead-description {
    font-size: 12px;
    color: #8b949e;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .bead-dates {
    display: flex;
    gap: 16px;
    margin-top: 10px;
    font-size: 10px;
    color: #6e7681;
  }
</style>
