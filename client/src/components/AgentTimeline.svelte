<script>
  import SkeletonRow from './SkeletonRow.svelte';

  export let agent = null;
  export let history = [];
  export let loading = false;

  function formatTime(timestamp) {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function getStatusColor(status) {
    switch (status) {
      case 'running': return '#3fb950';
      case 'idle': return '#58a6ff';
      case 'stopped': return '#f85149';
      case 'killed': return '#f85149';
      default: return '#8b949e';
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

  {#if loading}
    <div class="entries">
      {#each Array(4) as _}
        <SkeletonRow variant="default" />
      {/each}
    </div>
  {:else if history.length === 0}
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
    color: #e6edf3;
    margin: 0;
  }

  .export-btn {
    padding: 4px 10px;
    font-size: 11px;
    background: #21262d;
    border: 1px solid #30363d;
    border-radius: 4px;
    color: #c9d1d9;
    cursor: pointer;
    transition: background 0.15s;
  }

  .export-btn:hover {
    background: #30363d;
  }

  .empty {
    color: #6e7681;
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
    background: #30363d;
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
    color: #6e7681;
    font-family: monospace;
  }
</style>
