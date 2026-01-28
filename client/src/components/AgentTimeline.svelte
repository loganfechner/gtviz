<script>
  export let agent = null;
  export let history = [];

  function formatTime(timestamp) {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function getStatusColor(status) {
    switch (status) {
      case 'running': return 'var(--accent-green)';
      case 'idle': return 'var(--accent-blue)';
      case 'stopped': return 'var(--accent-red)';
      case 'killed': return 'var(--accent-red)';
      default: return 'var(--text-secondary)';
    }
  }

  function exportCsv() {
    if (!history.length) return;
    const headers = ['timestamp', 'status', 'agent', 'rig'];
    const rows = history.map(h => [h.timestamp, h.status, h.agent, h.rig].join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${agent?.name || 'agent'}-history.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="timeline">
  <div class="header">
    <h3>{agent?.name || 'Select Agent'} Timeline</h3>
    {#if history.length > 0}
      <button class="export-btn" on:click={exportCsv}>Export CSV</button>
    {/if}
  </div>

  {#if history.length === 0}
    <div class="empty">No history available</div>
  {:else}
    <div class="entries">
      {#each history as entry, i}
        <div class="entry">
          <div class="dot" style="background: {getStatusColor(entry.status)}"></div>
          <div class="line" class:last={i === history.length - 1}></div>
          <div class="content">
            <span class="status" style="color: {getStatusColor(entry.status)}">{entry.status}</span>
            <span class="time">{formatTime(entry.timestamp)}</span>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .timeline {
    padding: 12px;
    height: 100%;
    overflow-y: auto;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  h3 {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .export-btn {
    padding: 4px 10px;
    font-size: 11px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-primary);
    border-radius: 4px;
    color: var(--text-primary);
    cursor: pointer;
    transition: background 0.15s;
  }

  .export-btn:hover {
    background: var(--bg-hover);
  }

  .empty {
    color: var(--text-tertiary);
    font-size: 13px;
    text-align: center;
    padding: 24px;
  }

  .entries {
    position: relative;
  }

  .entry {
    display: flex;
    align-items: flex-start;
    position: relative;
    padding-bottom: 16px;
  }

  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
    z-index: 1;
  }

  .line {
    position: absolute;
    left: 4px;
    top: 10px;
    bottom: 0;
    width: 2px;
    background: var(--border-primary);
  }

  .line.last {
    display: none;
  }

  .content {
    margin-left: 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .status {
    font-size: 12px;
    font-weight: 600;
    text-transform: capitalize;
  }

  .time {
    font-size: 10px;
    color: var(--text-tertiary);
    font-family: monospace;
  }
</style>
