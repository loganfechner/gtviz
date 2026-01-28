<script>
  export let agents = [];
  export let agentStats = {};
  export let agentHistory = {};
  export let rig = null;
  export let loading = false;

  let sortBy = 'throughput';
  let sortDir = 'desc';

  // Calculate comparison data for each agent
  $: comparisonData = agents.map(agent => {
    const key = `${rig}/${agent.name}`;
    const stats = agentStats[key] || { completions: [], totalCompleted: 0, avgDuration: 0 };
    const history = agentHistory[key] || [];

    // Throughput: tasks completed per hour (based on last 24h)
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const recentCompletions = stats.completions.filter(c =>
      c.completedAt && new Date(c.completedAt).getTime() > dayAgo
    );
    const throughput = recentCompletions.length;

    // Error rate: calculate from status history
    const errorCount = history.filter(h => h.status === 'error' || h.status === 'killed').length;
    const totalStatusChanges = history.length || 1;
    const errorRate = Math.round((errorCount / totalStatusChanges) * 100);

    // Average duration
    const avgDuration = stats.avgDuration || 0;

    // Uptime: percentage of time in 'running' status
    const uptime = calculateUptime(history, agent.status);

    return {
      name: agent.name,
      role: agent.role,
      status: agent.status,
      throughput,
      errorRate,
      avgDuration,
      uptime,
      totalCompleted: stats.totalCompleted
    };
  });

  // Sort data
  $: sortedData = [...comparisonData].sort((a, b) => {
    let aVal = a[sortBy];
    let bVal = b[sortBy];

    // For duration, lower is better, so flip for desc
    if (sortBy === 'avgDuration') {
      [aVal, bVal] = [bVal, aVal];
    }
    // For errorRate, lower is better, so flip for desc
    if (sortBy === 'errorRate') {
      [aVal, bVal] = [bVal, aVal];
    }

    if (sortDir === 'desc') {
      return bVal - aVal;
    }
    return aVal - bVal;
  });

  // Get max values for bar scaling
  $: maxThroughput = Math.max(...comparisonData.map(d => d.throughput), 1);
  $: maxDuration = Math.max(...comparisonData.map(d => d.avgDuration), 1);

  function calculateUptime(history, currentStatus) {
    if (!history.length) {
      // If no history, estimate based on current status
      return currentStatus === 'running' ? 100 : 0;
    }

    const runningCount = history.filter(h => h.status === 'running').length;
    const activeCount = history.filter(h => ['running', 'idle'].includes(h.status)).length;

    // Weight current status
    const currentBonus = currentStatus === 'running' ? 10 : 0;
    return Math.min(100, Math.round(((activeCount + currentBonus) / (history.length + 10)) * 100));
  }

  function formatDuration(ms) {
    if (!ms) return '--';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    return `${Math.round(ms / 60000)}m`;
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

  function getRoleIcon(role) {
    switch (role) {
      case 'mayor': return '👑';
      case 'witness': return '👁';
      case 'refinery': return '⚗️';
      case 'polecat': return '🐱';
      case 'crew': return '👷';
      default: return '🤖';
    }
  }

  function toggleSort(column) {
    if (sortBy === column) {
      sortDir = sortDir === 'desc' ? 'asc' : 'desc';
    } else {
      sortBy = column;
      sortDir = 'desc';
    }
  }

  function getSortIndicator(column) {
    if (sortBy !== column) return '';
    return sortDir === 'desc' ? ' ↓' : ' ↑';
  }
</script>

<div class="comparison-dashboard">
  <h3>Agent Comparison</h3>

  {#if loading}
    <div class="loading-state">
      {#each Array(4) as _}
        <div class="skeleton-row">
          <div class="skeleton-cell name"></div>
          <div class="skeleton-cell metric"></div>
          <div class="skeleton-cell metric"></div>
          <div class="skeleton-cell metric"></div>
          <div class="skeleton-cell metric"></div>
        </div>
      {/each}
    </div>
  {:else if agents.length === 0}
    <p class="empty">No agents to compare</p>
  {:else}
    <div class="table-container">
      <table class="comparison-table">
        <thead>
          <tr>
            <th class="col-agent">Agent</th>
            <th class="col-metric sortable" on:click={() => toggleSort('throughput')}>
              Throughput{getSortIndicator('throughput')}
            </th>
            <th class="col-metric sortable" on:click={() => toggleSort('errorRate')}>
              Error Rate{getSortIndicator('errorRate')}
            </th>
            <th class="col-metric sortable" on:click={() => toggleSort('avgDuration')}>
              Avg Duration{getSortIndicator('avgDuration')}
            </th>
            <th class="col-metric sortable" on:click={() => toggleSort('uptime')}>
              Uptime{getSortIndicator('uptime')}
            </th>
          </tr>
        </thead>
        <tbody>
          {#each sortedData as agent, i}
            <tr class:top={i === 0 && sortedData.length > 1}>
              <td class="col-agent">
                <div class="agent-info">
                  <span class="role-icon">{getRoleIcon(agent.role)}</span>
                  <div class="agent-details">
                    <span class="agent-name">{agent.name}</span>
                    <span class="agent-role">{agent.role}</span>
                  </div>
                  <span class="status-dot" style="background: {getStatusColor(agent.status)}"></span>
                </div>
              </td>
              <td class="col-metric">
                <div class="metric-cell">
                  <span class="metric-value">{agent.throughput}</span>
                  <span class="metric-unit">/24h</span>
                  <div class="metric-bar">
                    <div
                      class="bar-fill throughput"
                      style="width: {(agent.throughput / maxThroughput) * 100}%"
                    ></div>
                  </div>
                </div>
              </td>
              <td class="col-metric">
                <div class="metric-cell">
                  <span class="metric-value" class:error={agent.errorRate > 20}>
                    {agent.errorRate}%
                  </span>
                  <div class="metric-bar">
                    <div
                      class="bar-fill error-rate"
                      class:high={agent.errorRate > 20}
                      style="width: {agent.errorRate}%"
                    ></div>
                  </div>
                </div>
              </td>
              <td class="col-metric">
                <div class="metric-cell">
                  <span class="metric-value">{formatDuration(agent.avgDuration)}</span>
                  <div class="metric-bar">
                    <div
                      class="bar-fill duration"
                      style="width: {agent.avgDuration ? (agent.avgDuration / maxDuration) * 100 : 0}%"
                    ></div>
                  </div>
                </div>
              </td>
              <td class="col-metric">
                <div class="metric-cell">
                  <span class="metric-value" class:good={agent.uptime >= 80}>
                    {agent.uptime}%
                  </span>
                  <div class="metric-bar">
                    <div
                      class="bar-fill uptime"
                      class:high={agent.uptime >= 80}
                      style="width: {agent.uptime}%"
                    ></div>
                  </div>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="summary-cards">
      <div class="summary-card">
        <div class="summary-label">Total Throughput</div>
        <div class="summary-value">{comparisonData.reduce((sum, a) => sum + a.throughput, 0)}</div>
        <div class="summary-detail">tasks in 24h</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Avg Error Rate</div>
        <div class="summary-value" class:error={comparisonData.reduce((sum, a) => sum + a.errorRate, 0) / (comparisonData.length || 1) > 20}>
          {Math.round(comparisonData.reduce((sum, a) => sum + a.errorRate, 0) / (comparisonData.length || 1))}%
        </div>
        <div class="summary-detail">across all agents</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Avg Duration</div>
        <div class="summary-value">
          {formatDuration(comparisonData.reduce((sum, a) => sum + a.avgDuration, 0) / (comparisonData.length || 1))}
        </div>
        <div class="summary-detail">per task</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Avg Uptime</div>
        <div class="summary-value" class:good={comparisonData.reduce((sum, a) => sum + a.uptime, 0) / (comparisonData.length || 1) >= 80}>
          {Math.round(comparisonData.reduce((sum, a) => sum + a.uptime, 0) / (comparisonData.length || 1))}%
        </div>
        <div class="summary-detail">team health</div>
      </div>
    </div>
  {/if}
</div>

<style>
  .comparison-dashboard {
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
  }

  .empty {
    color: #6e7681;
    font-size: 13px;
    text-align: center;
    padding: 20px;
  }

  .table-container {
    overflow-x: auto;
    margin-bottom: 16px;
  }

  .comparison-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
  }

  .comparison-table th {
    text-align: left;
    padding: 8px 6px;
    color: #8b949e;
    font-weight: 500;
    border-bottom: 1px solid #30363d;
    white-space: nowrap;
  }

  .comparison-table th.sortable {
    cursor: pointer;
    user-select: none;
  }

  .comparison-table th.sortable:hover {
    color: #c9d1d9;
  }

  .comparison-table td {
    padding: 8px 6px;
    border-bottom: 1px solid #21262d;
    vertical-align: middle;
  }

  .comparison-table tr:hover {
    background: #161b22;
  }

  .comparison-table tr.top td {
    background: #238636 08;
  }

  .col-agent {
    min-width: 100px;
  }

  .col-metric {
    min-width: 80px;
  }

  .agent-info {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .role-icon {
    font-size: 14px;
  }

  .agent-details {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .agent-name {
    color: #c9d1d9;
    font-weight: 500;
    font-size: 12px;
  }

  .agent-role {
    color: #6e7681;
    font-size: 9px;
    text-transform: uppercase;
  }

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    margin-left: auto;
  }

  .metric-cell {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .metric-value {
    color: #c9d1d9;
    font-weight: 600;
    font-size: 12px;
  }

  .metric-value.error {
    color: #f85149;
  }

  .metric-value.good {
    color: #3fb950;
  }

  .metric-unit {
    color: #6e7681;
    font-size: 9px;
    margin-left: 2px;
  }

  .metric-bar {
    height: 4px;
    background: #21262d;
    border-radius: 2px;
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  .bar-fill.throughput {
    background: #58a6ff;
  }

  .bar-fill.error-rate {
    background: #f0883e;
  }

  .bar-fill.error-rate.high {
    background: #f85149;
  }

  .bar-fill.duration {
    background: #a371f7;
  }

  .bar-fill.uptime {
    background: #8b949e;
  }

  .bar-fill.uptime.high {
    background: #3fb950;
  }

  .summary-cards {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    margin-top: auto;
  }

  .summary-card {
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 10px;
    text-align: center;
  }

  .summary-label {
    font-size: 9px;
    color: #8b949e;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    margin-bottom: 4px;
  }

  .summary-value {
    font-size: 18px;
    font-weight: 600;
    color: #58a6ff;
  }

  .summary-value.error {
    color: #f85149;
  }

  .summary-value.good {
    color: #3fb950;
  }

  .summary-detail {
    font-size: 9px;
    color: #6e7681;
    margin-top: 2px;
  }

  /* Loading skeleton */
  .loading-state {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .skeleton-row {
    display: flex;
    gap: 8px;
    padding: 8px 0;
    border-bottom: 1px solid #21262d;
  }

  .skeleton-cell {
    background: linear-gradient(90deg, #21262d 25%, #30363d 50%, #21262d 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 4px;
    height: 32px;
  }

  .skeleton-cell.name {
    width: 100px;
  }

  .skeleton-cell.metric {
    flex: 1;
  }

  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
</style>
