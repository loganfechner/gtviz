<script>
  import { onMount } from 'svelte';
  import * as d3 from 'd3';
  import SkeletonRow from './SkeletonRow.svelte';

  export let logs = [];
  export let agentStats = {};
  export let selectedAgent = null;
  export let rig = null;
  export let loading = false;

  let activeSubTab = 'logs';
  let chartContainer;

  $: agentKey = selectedAgent && rig ? `${rig}/${selectedAgent.name}` : null;
  $: currentStats = agentKey ? (agentStats[agentKey] || { completions: [], totalCompleted: 0, avgDuration: 0 }) : { completions: [], totalCompleted: 0, avgDuration: 0 };

  // Filter logs for selected agent
  $: filteredLogs = selectedAgent
    ? logs.filter(log => {
        if (!log.agent) return false;
        const logAgentName = log.agent.includes('/') ? log.agent.split('/').pop() : log.agent;
        return logAgentName === selectedAgent.name || log.agent === selectedAgent.name;
      })
    : logs.filter(log => log.rig === rig);

  // Calculate performance metrics
  $: completionRate = currentStats.completions.length > 0
    ? Math.round((currentStats.completions.filter(c => c.duration !== null).length / currentStats.completions.length) * 100)
    : 0;

  $: avgDurationFormatted = currentStats.avgDuration > 0
    ? formatDuration(currentStats.avgDuration)
    : '--';

  // Group completions by hour for activity chart
  $: activityData = groupByHour(currentStats.completions);

  function formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    return `${Math.round(ms / 60000)}m`;
  }

  function formatTime(timestamp) {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    return d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function getLevelColor(level) {
    switch (level) {
      case 'error': return '#f85149';
      case 'warn': return '#f0883e';
      case 'debug': return '#8b949e';
      default: return '#3fb950';
    }
  }

  function groupByHour(completions) {
    const groups = {};
    const now = new Date();

    // Initialize last 24 hours
    for (let i = 23; i >= 0; i--) {
      const hour = new Date(now);
      hour.setHours(hour.getHours() - i, 0, 0, 0);
      groups[hour.toISOString()] = { time: hour, count: 0 };
    }

    // Count completions per hour
    for (const completion of completions) {
      if (completion.completedAt) {
        const d = new Date(completion.completedAt);
        d.setMinutes(0, 0, 0);
        const key = d.toISOString();
        if (groups[key]) {
          groups[key].count++;
        }
      }
    }

    return Object.values(groups);
  }

  function renderChart(data) {
    if (!chartContainer || !data.length) return;

    // Clear previous chart
    d3.select(chartContainer).selectAll('*').remove();

    const margin = { top: 10, right: 10, bottom: 25, left: 25 };
    const width = chartContainer.clientWidth - margin.left - margin.right;
    const height = 100 - margin.top - margin.bottom;

    const svg = d3.select(chartContainer)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scaleTime()
      .domain(d3.extent(data, d => d.time))
      .range([0, width]);

    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.count) || 1])
      .range([height, 0]);

    // Add area
    const area = d3.area()
      .x(d => x(d.time))
      .y0(height)
      .y1(d => y(d.count))
      .curve(d3.curveMonotoneX);

    svg.append('path')
      .datum(data)
      .attr('fill', '#238636')
      .attr('fill-opacity', 0.3)
      .attr('d', area);

    // Add line
    const line = d3.line()
      .x(d => x(d.time))
      .y(d => y(d.count))
      .curve(d3.curveMonotoneX);

    svg.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#3fb950')
      .attr('stroke-width', 2)
      .attr('d', line);

    // Add x-axis
    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(6).tickFormat(d3.timeFormat('%H:%M')))
      .selectAll('text')
      .attr('fill', '#6e7681')
      .attr('font-size', '9px');

    svg.selectAll('.domain, .tick line')
      .attr('stroke', '#30363d');

    // Add y-axis
    svg.append('g')
      .call(d3.axisLeft(y).ticks(3).tickFormat(d3.format('d')))
      .selectAll('text')
      .attr('fill', '#6e7681')
      .attr('font-size', '9px');
  }

  $: if (activeSubTab === 'performance' && chartContainer) {
    renderChart(activityData);
  }

  onMount(() => {
    const resizeObserver = new ResizeObserver(() => {
      if (activeSubTab === 'performance') {
        renderChart(activityData);
      }
    });
    if (chartContainer) {
      resizeObserver.observe(chartContainer);
    }
    return () => resizeObserver.disconnect();
  });
</script>

<div class="insights-panel">
  <h3>
    Agent Insights
    {#if selectedAgent}
      <span class="agent-name">{selectedAgent.name}</span>
    {/if}
  </h3>

  <nav class="subtabs">
    <button class:active={activeSubTab === 'logs'} on:click={() => activeSubTab = 'logs'}>
      Logs
    </button>
    <button class:active={activeSubTab === 'tasks'} on:click={() => activeSubTab = 'tasks'}>
      Tasks
    </button>
    <button class:active={activeSubTab === 'performance'} on:click={() => activeSubTab = 'performance'}>
      Performance
    </button>
  </nav>

  <div class="panel-content">
    {#if loading}
      <div class="logs-list">
        {#each Array(5) as _}
          <SkeletonRow variant="event" />
        {/each}
      </div>
    {:else if activeSubTab === 'logs'}
      {#if !selectedAgent}
        <p class="empty">Select an agent to view logs</p>
      {:else if filteredLogs.length === 0}
        <p class="empty">No logs for this agent</p>
      {:else}
        <div class="logs-list">
          {#each filteredLogs.slice(0, 100) as log}
            <div class="log-entry">
              <div class="log-header">
                <span class="log-level" style="color: {getLevelColor(log.level)}">{log.level}</span>
                <span class="log-type">{log.logType}</span>
                <span class="log-time">{formatTime(log.timestamp)}</span>
              </div>
              <div class="log-message">{log.message}</div>
            </div>
          {/each}
        </div>
      {/if}

    {:else if activeSubTab === 'tasks'}
      {#if !selectedAgent}
        <p class="empty">Select an agent to view tasks</p>
      {:else if currentStats.completions.length === 0}
        <p class="empty">No completed tasks</p>
      {:else}
        <div class="tasks-list">
          {#each currentStats.completions as completion}
            <div class="task-entry">
              <div class="task-header">
                <span class="task-bead">{completion.beadId}</span>
                <span class="task-duration">
                  {completion.duration ? formatDuration(completion.duration) : '--'}
                </span>
              </div>
              {#if completion.title}
                <div class="task-title">{completion.title}</div>
              {/if}
              <div class="task-time">{formatTime(completion.completedAt)}</div>
            </div>
          {/each}
        </div>
      {/if}

    {:else if activeSubTab === 'performance'}
      {#if !selectedAgent}
        <p class="empty">Select an agent to view performance</p>
      {:else}
        <div class="performance-view">
          <div class="metrics-row">
            <div class="metric">
              <div class="metric-value">{currentStats.totalCompleted}</div>
              <div class="metric-label">Completed</div>
            </div>
            <div class="metric">
              <div class="metric-value">{avgDurationFormatted}</div>
              <div class="metric-label">Avg Duration</div>
            </div>
            <div class="metric">
              <div class="metric-value">{completionRate}%</div>
              <div class="metric-label">Track Rate</div>
            </div>
          </div>

          <div class="chart-section">
            <h4>Activity (24h)</h4>
            <div class="chart-container" bind:this={chartContainer}></div>
          </div>
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .insights-panel {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  h3 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #8b949e;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .agent-name {
    color: #58a6ff;
    text-transform: none;
    font-weight: 600;
  }

  .subtabs {
    display: flex;
    gap: 4px;
    margin-bottom: 12px;
  }

  .subtabs button {
    flex: 1;
    padding: 6px 8px;
    background: #21262d;
    border: 1px solid #30363d;
    border-radius: 4px;
    color: #8b949e;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .subtabs button:hover {
    background: #30363d;
    color: #c9d1d9;
  }

  .subtabs button.active {
    background: #388bfd22;
    border-color: #58a6ff;
    color: #58a6ff;
  }

  .panel-content {
    flex: 1;
    overflow-y: auto;
  }

  .empty {
    color: #6e7681;
    font-size: 13px;
    text-align: center;
    padding: 20px;
  }

  /* Logs styles */
  .logs-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .log-entry {
    padding: 6px 8px;
    background: #0d1117;
    border-radius: 4px;
    border: 1px solid #21262d;
  }

  .log-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 2px;
  }

  .log-level {
    font-size: 10px;
    text-transform: uppercase;
    font-weight: 600;
  }

  .log-type {
    font-size: 10px;
    color: #6e7681;
    background: #21262d;
    padding: 1px 4px;
    border-radius: 2px;
  }

  .log-time {
    font-size: 10px;
    color: #6e7681;
    font-family: monospace;
    margin-left: auto;
  }

  .log-message {
    font-size: 11px;
    color: #c9d1d9;
    font-family: monospace;
    word-break: break-word;
  }

  /* Tasks styles */
  .tasks-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .task-entry {
    padding: 8px 10px;
    background: #0d1117;
    border-radius: 6px;
    border: 1px solid #21262d;
  }

  .task-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }

  .task-bead {
    font-size: 12px;
    font-weight: 600;
    color: #58a6ff;
    font-family: monospace;
  }

  .task-duration {
    font-size: 11px;
    color: #3fb950;
    font-weight: 500;
  }

  .task-title {
    font-size: 12px;
    color: #c9d1d9;
    margin-bottom: 4px;
  }

  .task-time {
    font-size: 10px;
    color: #6e7681;
    font-family: monospace;
  }

  /* Performance styles */
  .performance-view {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .metrics-row {
    display: flex;
    gap: 8px;
  }

  .metric {
    flex: 1;
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 10px;
    text-align: center;
  }

  .metric-value {
    font-size: 18px;
    font-weight: 600;
    color: #58a6ff;
  }

  .metric-label {
    font-size: 10px;
    color: #8b949e;
    margin-top: 2px;
  }

  .chart-section h4 {
    font-size: 11px;
    color: #8b949e;
    margin-bottom: 8px;
  }

  .chart-container {
    background: #0d1117;
    border: 1px solid #21262d;
    border-radius: 6px;
    padding: 8px;
    min-height: 100px;
  }

  .chart-container :global(svg) {
    display: block;
  }
</style>
