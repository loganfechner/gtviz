<script>
  import { onMount, afterUpdate } from 'svelte';
  import * as d3 from 'd3';
  import SkeletonRow from './SkeletonRow.svelte';

  export let beads = [];
  export let beadHistory = {};
  export let rig = null;
  export let loading = false;

  let container;
  let tooltip;
  let tooltipContent = { bead: null, stage: null };
  let showTooltip = false;
  let tooltipX = 0;
  let tooltipY = 0;

  // Status lifecycle order
  const LIFECYCLE_ORDER = ['open', 'hooked', 'in_progress', 'done'];
  const STATUS_COLORS = {
    open: '#58a6ff',
    hooked: '#a371f7',
    in_progress: '#f0883e',
    done: '#3fb950',
    closed: '#3fb950'
  };

  // Filters
  let filterStatus = 'all';
  let filterPriority = 'all';
  let sortBy = 'duration';

  // Process beads into waterfall data
  $: waterfallData = processBeadsForWaterfall(beads, beadHistory, rig);
  $: filteredData = applyFilters(waterfallData, filterStatus, filterPriority);
  $: sortedData = sortData(filteredData, sortBy);

  function processBeadsForWaterfall(beads, history, rigName) {
    if (!beads || !beads.length) return [];

    return beads.map(bead => {
      const key = `${rigName}/${bead.id}`;
      const statusHistory = history[key] || bead.statusHistory || [];

      // Build timeline from status history (newest first, so reverse)
      const sortedHistory = [...statusHistory].reverse();

      const stages = [];
      let totalDuration = 0;

      // If we have status history, calculate stage durations
      if (sortedHistory.length > 0) {
        for (let i = 0; i < sortedHistory.length; i++) {
          const current = sortedHistory[i];
          const next = sortedHistory[i + 1];

          const startTime = new Date(current.timestamp).getTime();
          const endTime = next
            ? new Date(next.timestamp).getTime()
            : (bead.closedAt ? new Date(bead.closedAt).getTime() : Date.now());

          const duration = endTime - startTime;

          stages.push({
            status: current.status,
            start: startTime,
            end: endTime,
            duration: duration
          });

          totalDuration += duration;
        }
      } else {
        // Fallback: single stage from created to now
        const createdAt = bead.createdAt ? new Date(bead.createdAt).getTime() : Date.now();
        const endTime = bead.closedAt ? new Date(bead.closedAt).getTime() : Date.now();
        stages.push({
          status: bead.status || 'open',
          start: createdAt,
          end: endTime,
          duration: endTime - createdAt
        });
        totalDuration = endTime - createdAt;
      }

      return {
        id: bead.id,
        title: bead.title || bead.id,
        status: bead.status,
        priority: bead.priority,
        owner: bead.owner,
        stages: stages,
        totalDuration: totalDuration,
        createdAt: bead.createdAt,
        closedAt: bead.closedAt
      };
    });
  }

  function applyFilters(data, status, priority) {
    return data.filter(bead => {
      if (status !== 'all' && bead.status !== status) return false;
      if (priority !== 'all' && bead.priority !== priority) return false;
      return true;
    });
  }

  function sortData(data, by) {
    const sorted = [...data];
    switch (by) {
      case 'duration':
        return sorted.sort((a, b) => b.totalDuration - a.totalDuration);
      case 'recent':
        return sorted.sort((a, b) => {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bTime - aTime;
        });
      case 'id':
        return sorted.sort((a, b) => a.id.localeCompare(b.id));
      default:
        return sorted;
    }
  }

  function formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
    if (ms < 86400000) return `${(ms / 3600000).toFixed(1)}h`;
    return `${(ms / 86400000).toFixed(1)}d`;
  }

  function formatDateTime(timestamp) {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function handleBarHover(event, bead, stage) {
    tooltipContent = { bead, stage };
    showTooltip = true;
    const rect = event.target.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    tooltipX = rect.left - containerRect.left + rect.width / 2;
    tooltipY = rect.top - containerRect.top - 8;
  }

  function handleBarLeave() {
    showTooltip = false;
  }

  function exportCsv() {
    if (!sortedData.length) return;

    const headers = ['bead_id', 'title', 'status', 'priority', 'total_duration_ms', 'created_at', 'closed_at'];
    // Add columns for each stage duration
    LIFECYCLE_ORDER.forEach(status => {
      headers.push(`${status}_duration_ms`);
    });

    const rows = sortedData.map(bead => {
      const row = [
        bead.id,
        `"${(bead.title || '').replace(/"/g, '""')}"`,
        bead.status,
        bead.priority || '',
        bead.totalDuration,
        bead.createdAt || '',
        bead.closedAt || ''
      ];

      // Add stage durations
      LIFECYCLE_ORDER.forEach(status => {
        const stage = bead.stages.find(s => s.status === status);
        row.push(stage ? stage.duration : 0);
      });

      return row.join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bead-lifecycle-${rig || 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Calculate max duration for scale
  $: maxDuration = sortedData.length > 0
    ? Math.max(...sortedData.map(b => b.totalDuration))
    : 0;

  // Get unique priorities for filter
  $: priorities = [...new Set(beads.map(b => b.priority).filter(Boolean))];
</script>

<div class="waterfall" bind:this={container}>
  <div class="header">
    <h3>Bead Lifecycle</h3>
    <div class="controls">
      <select bind:value={filterStatus} class="filter-select">
        <option value="all">All Status</option>
        <option value="open">Open</option>
        <option value="hooked">Hooked</option>
        <option value="in_progress">In Progress</option>
        <option value="done">Done</option>
        <option value="closed">Closed</option>
      </select>
      <select bind:value={filterPriority} class="filter-select">
        <option value="all">All Priority</option>
        {#each priorities as p}
          <option value={p}>{p}</option>
        {/each}
      </select>
      <select bind:value={sortBy} class="filter-select">
        <option value="duration">Longest First</option>
        <option value="recent">Most Recent</option>
        <option value="id">By ID</option>
      </select>
      {#if sortedData.length > 0}
        <button class="export-btn" on:click={exportCsv}>Export CSV</button>
      {/if}
    </div>
  </div>

  <div class="legend">
    {#each LIFECYCLE_ORDER as status}
      <div class="legend-item">
        <span class="legend-color" style="background: {STATUS_COLORS[status]}"></span>
        <span class="legend-label">{status.replace('_', ' ')}</span>
      </div>
    {/each}
  </div>

  {#if loading}
    <div class="chart">
      {#each Array(5) as _}
        <SkeletonRow variant="wide" />
      {/each}
    </div>
  {:else if sortedData.length === 0}
    <div class="empty">No beads with lifecycle data</div>
  {:else}
    <div class="chart">
      {#each sortedData as bead (bead.id)}
        <div class="row">
          <div class="row-label" title={bead.title}>
            <span class="bead-id">{bead.id}</span>
            <span class="bead-title">{bead.title}</span>
          </div>
          <div class="row-bar-container">
            <div class="row-bars">
              {#each bead.stages as stage, i}
                {@const width = maxDuration > 0 ? (stage.duration / maxDuration) * 100 : 0}
                {@const left = bead.stages.slice(0, i).reduce((acc, s) => acc + (maxDuration > 0 ? (s.duration / maxDuration) * 100 : 0), 0)}
                <div
                  class="bar"
                  style="left: {left}%; width: {Math.max(width, 0.5)}%; background: {STATUS_COLORS[stage.status] || '#8b949e'};"
                  on:mouseenter={(e) => handleBarHover(e, bead, stage)}
                  on:mouseleave={handleBarLeave}
                  role="button"
                  tabindex="0"
                ></div>
              {/each}
            </div>
            <span class="duration-label">{formatDuration(bead.totalDuration)}</span>
          </div>
        </div>
      {/each}
    </div>

    <div class="summary">
      <div class="summary-item">
        <span class="summary-label">Total Beads</span>
        <span class="summary-value">{sortedData.length}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">Avg Duration</span>
        <span class="summary-value">
          {formatDuration(sortedData.reduce((acc, b) => acc + b.totalDuration, 0) / sortedData.length)}
        </span>
      </div>
      <div class="summary-item">
        <span class="summary-label">Longest</span>
        <span class="summary-value">{formatDuration(maxDuration)}</span>
      </div>
    </div>
  {/if}

  {#if showTooltip && tooltipContent.bead && tooltipContent.stage}
    <div class="tooltip" style="left: {tooltipX}px; top: {tooltipY}px;">
      <div class="tooltip-header">
        <span class="tooltip-id">{tooltipContent.bead.id}</span>
        <span class="tooltip-status" style="color: {STATUS_COLORS[tooltipContent.stage.status]}">
          {tooltipContent.stage.status.replace('_', ' ')}
        </span>
      </div>
      <div class="tooltip-body">
        <div class="tooltip-row">
          <span class="tooltip-label">Duration:</span>
          <span class="tooltip-value">{formatDuration(tooltipContent.stage.duration)}</span>
        </div>
        <div class="tooltip-row">
          <span class="tooltip-label">Started:</span>
          <span class="tooltip-value">{formatDateTime(tooltipContent.stage.start)}</span>
        </div>
        <div class="tooltip-row">
          <span class="tooltip-label">Ended:</span>
          <span class="tooltip-value">{formatDateTime(tooltipContent.stage.end)}</span>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .waterfall {
    padding: 12px;
    height: 100%;
    overflow-y: auto;
    position: relative;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    flex-wrap: wrap;
    gap: 8px;
  }

  h3 {
    font-size: 14px;
    font-weight: 600;
    color: #e6edf3;
    margin: 0;
  }

  .controls {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .filter-select {
    padding: 4px 8px;
    font-size: 11px;
    background: #21262d;
    border: 1px solid #30363d;
    border-radius: 4px;
    color: #c9d1d9;
    cursor: pointer;
  }

  .filter-select:focus {
    outline: none;
    border-color: #58a6ff;
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

  .legend {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .legend-color {
    width: 12px;
    height: 12px;
    border-radius: 2px;
  }

  .legend-label {
    font-size: 11px;
    color: #8b949e;
    text-transform: capitalize;
  }

  .empty {
    color: #6e7681;
    font-size: 13px;
    text-align: center;
    padding: 24px;
  }

  .chart {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .row-label {
    width: 90px;
    flex-shrink: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .bead-id {
    font-family: monospace;
    font-size: 10px;
    color: #58a6ff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .bead-title {
    font-size: 10px;
    color: #8b949e;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .row-bar-container {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .row-bars {
    flex: 1;
    height: 20px;
    position: relative;
    background: #21262d;
    border-radius: 4px;
    overflow: hidden;
  }

  .bar {
    position: absolute;
    top: 0;
    height: 100%;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .bar:hover {
    opacity: 0.8;
  }

  .duration-label {
    font-size: 10px;
    color: #6e7681;
    font-family: monospace;
    min-width: 40px;
    text-align: right;
  }

  .summary {
    display: flex;
    gap: 20px;
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid #21262d;
  }

  .summary-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .summary-label {
    font-size: 10px;
    color: #6e7681;
  }

  .summary-value {
    font-size: 14px;
    font-weight: 600;
    color: #e6edf3;
  }

  .tooltip {
    position: absolute;
    transform: translate(-50%, -100%);
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 10px 12px;
    z-index: 100;
    pointer-events: none;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    min-width: 160px;
  }

  .tooltip::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 6px solid transparent;
    border-top-color: #30363d;
  }

  .tooltip-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
    padding-bottom: 6px;
    border-bottom: 1px solid #21262d;
  }

  .tooltip-id {
    font-family: monospace;
    font-size: 11px;
    color: #58a6ff;
  }

  .tooltip-status {
    font-size: 10px;
    text-transform: uppercase;
    font-weight: 600;
  }

  .tooltip-body {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .tooltip-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }

  .tooltip-label {
    font-size: 11px;
    color: #6e7681;
  }

  .tooltip-value {
    font-size: 11px;
    color: #c9d1d9;
    font-family: monospace;
  }
</style>
