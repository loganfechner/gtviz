<script>
  import MiniGraph from './MiniGraph.svelte';

  export let metrics = {};

  $: pollDuration = metrics.pollDuration || 0;
  $: avgPollDuration = metrics.avgPollDuration || 0;
  $: updateFrequency = metrics.updateFrequency || 0;
  $: totalPolls = metrics.totalPolls || 0;
  $: totalEvents = metrics.totalEvents || 0;
  $: agentActivity = metrics.agentActivity || { active: 0, hooked: 0, idle: 0, error: 0 };
  $: history = metrics.history || { pollDurations: [], eventVolume: [] };

  // Determine poll duration status color
  $: pollStatusColor = pollDuration < 100 ? '#4ade80' : pollDuration < 500 ? '#fbbf24' : '#ef4444';

  // Calculate activity percentage
  $: totalAgents = agentActivity.active + agentActivity.hooked + agentActivity.idle + agentActivity.error;
  $: activePercent = totalAgents > 0 ? Math.round((agentActivity.active + agentActivity.hooked) / totalAgents * 100) : 0;
</script>

<div class="panel">
  <h3>Performance</h3>

  <div class="metrics-grid">
    <div class="metric">
      <div class="metric-header">
        <span class="metric-label">Poll Time</span>
        <span class="metric-value" style="color: {pollStatusColor}">{pollDuration}ms</span>
      </div>
      <div class="metric-sub">avg: {avgPollDuration}ms</div>
      {#if history.pollDurations.length > 1}
        <MiniGraph data={history.pollDurations} color={pollStatusColor} />
      {/if}
    </div>

    <div class="metric">
      <div class="metric-header">
        <span class="metric-label">Events/min</span>
        <span class="metric-value">{updateFrequency}</span>
      </div>
      <div class="metric-sub">total: {totalEvents}</div>
      {#if history.eventVolume.length > 1}
        <MiniGraph data={history.eventVolume} color="#e94560" />
      {/if}
    </div>
  </div>

  <div class="divider"></div>

  <div class="activity-section">
    <div class="activity-header">
      <span class="activity-label">Agent Activity</span>
      <span class="activity-percent">{activePercent}% working</span>
    </div>

    <div class="activity-bar">
      <div
        class="bar-segment active"
        style="width: {totalAgents > 0 ? (agentActivity.active / totalAgents * 100) : 0}%"
        title="{agentActivity.active} active"
      ></div>
      <div
        class="bar-segment hooked"
        style="width: {totalAgents > 0 ? (agentActivity.hooked / totalAgents * 100) : 0}%"
        title="{agentActivity.hooked} hooked"
      ></div>
      <div
        class="bar-segment idle"
        style="width: {totalAgents > 0 ? (agentActivity.idle / totalAgents * 100) : 0}%"
        title="{agentActivity.idle} idle"
      ></div>
      {#if agentActivity.error > 0}
        <div
          class="bar-segment error"
          style="width: {(agentActivity.error / totalAgents * 100)}%"
          title="{agentActivity.error} error"
        ></div>
      {/if}
    </div>

    <div class="activity-legend">
      <span class="legend-item">
        <span class="legend-dot active"></span>
        {agentActivity.active} active
      </span>
      <span class="legend-item">
        <span class="legend-dot hooked"></span>
        {agentActivity.hooked} hooked
      </span>
      <span class="legend-item">
        <span class="legend-dot idle"></span>
        {agentActivity.idle} idle
      </span>
    </div>
  </div>

  <div class="divider"></div>

  <div class="stats-row">
    <div class="stat-mini">
      <span class="stat-mini-label">Polls</span>
      <span class="stat-mini-value">{totalPolls}</span>
    </div>
    <div class="stat-mini">
      <span class="stat-mini-label">Events</span>
      <span class="stat-mini-value">{totalEvents}</span>
    </div>
    <div class="stat-mini">
      <span class="stat-mini-label">Agents</span>
      <span class="stat-mini-value">{totalAgents}</span>
    </div>
  </div>
</div>

<style>
  .panel {
    padding: 1rem;
    border-top: 1px solid #0f3460;
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
    content: '\u26a1';
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }

  .metric {
    background: #1a1a2e;
    border-radius: 4px;
    padding: 0.75rem;
  }

  .metric-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 0.25rem;
  }

  .metric-label {
    font-size: 0.75rem;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .metric-value {
    font-size: 1.25rem;
    font-weight: 700;
    font-family: monospace;
  }

  .metric-sub {
    font-size: 0.7rem;
    color: #555;
    margin-bottom: 0.5rem;
  }

  .divider {
    height: 1px;
    background: #0f3460;
    margin: 1rem 0;
  }

  .activity-section {
    margin-bottom: 0.5rem;
  }

  .activity-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .activity-label {
    font-size: 0.75rem;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .activity-percent {
    font-size: 0.875rem;
    font-weight: 600;
    color: #4ade80;
  }

  .activity-bar {
    height: 8px;
    background: #1a1a2e;
    border-radius: 4px;
    overflow: hidden;
    display: flex;
  }

  .bar-segment {
    height: 100%;
    transition: width 0.3s ease;
  }

  .bar-segment.active {
    background: #4ade80;
  }

  .bar-segment.hooked {
    background: #fbbf24;
  }

  .bar-segment.idle {
    background: #444;
  }

  .bar-segment.error {
    background: #ef4444;
  }

  .activity-legend {
    display: flex;
    gap: 0.75rem;
    margin-top: 0.5rem;
    flex-wrap: wrap;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.7rem;
    color: #888;
  }

  .legend-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .legend-dot.active {
    background: #4ade80;
  }

  .legend-dot.hooked {
    background: #fbbf24;
  }

  .legend-dot.idle {
    background: #444;
  }

  .stats-row {
    display: flex;
    justify-content: space-between;
  }

  .stat-mini {
    text-align: center;
  }

  .stat-mini-label {
    display: block;
    font-size: 0.65rem;
    color: #555;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .stat-mini-value {
    font-size: 0.875rem;
    font-weight: 600;
    color: #ccc;
    font-family: monospace;
  }
</style>
