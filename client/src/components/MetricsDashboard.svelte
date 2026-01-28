<script>
  export let metrics = {};

  $: pollSuccess = metrics.successfulPolls || 0;
  $: pollFailed = metrics.failedPolls || 0;
  $: pollTotal = pollSuccess + pollFailed;
  $: successRate = pollTotal > 0 ? Math.round((pollSuccess / pollTotal) * 100) : 100;

  $: wsConnections = metrics.wsConnections || 0;
  $: totalEvents = metrics.totalEvents || 0;
  $: lastPollMs = metrics.lastPollDuration || 0;

  $: agentActivity = metrics.agentActivity || { active: 0, hooked: 0, idle: 0 };
</script>

<div class="metrics-dashboard">
  <h3>System Metrics</h3>

  <div class="metrics-grid">
    <div class="metric-card">
      <div class="metric-value">{successRate}%</div>
      <div class="metric-label">Poll Success</div>
      <div class="metric-detail">{pollSuccess}/{pollTotal} polls</div>
    </div>

    <div class="metric-card">
      <div class="metric-value">{lastPollMs}ms</div>
      <div class="metric-label">Last Poll</div>
      <div class="metric-detail">response time</div>
    </div>

    <div class="metric-card">
      <div class="metric-value">{wsConnections}</div>
      <div class="metric-label">Connections</div>
      <div class="metric-detail">active WebSocket</div>
    </div>

    <div class="metric-card">
      <div class="metric-value">{totalEvents}</div>
      <div class="metric-label">Events</div>
      <div class="metric-detail">total processed</div>
    </div>
  </div>

  <div class="agent-activity">
    <h4>Agent Activity</h4>
    <div class="activity-bars">
      <div class="activity-row">
        <span class="activity-label">Active</span>
        <div class="activity-bar">
          <div class="bar-fill active" style="width: {agentActivity.active * 10}%"></div>
        </div>
        <span class="activity-count">{agentActivity.active}</span>
      </div>
      <div class="activity-row">
        <span class="activity-label">Hooked</span>
        <div class="activity-bar">
          <div class="bar-fill hooked" style="width: {agentActivity.hooked * 10}%"></div>
        </div>
        <span class="activity-count">{agentActivity.hooked}</span>
      </div>
      <div class="activity-row">
        <span class="activity-label">Idle</span>
        <div class="activity-bar">
          <div class="bar-fill idle" style="width: {agentActivity.idle * 10}%"></div>
        </div>
        <span class="activity-count">{agentActivity.idle}</span>
      </div>
    </div>
  </div>
</div>

<style>
  .metrics-dashboard {
    padding: 12px;
  }

  h3 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #8b949e;
    margin-bottom: 12px;
  }

  h4 {
    font-size: 11px;
    color: #8b949e;
    margin: 16px 0 8px;
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .metric-card {
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 10px;
    text-align: center;
  }

  .metric-value {
    font-size: 20px;
    font-weight: 600;
    color: #58a6ff;
  }

  .metric-label {
    font-size: 11px;
    color: #c9d1d9;
    margin-top: 4px;
  }

  .metric-detail {
    font-size: 9px;
    color: #6e7681;
    margin-top: 2px;
  }

  .agent-activity {
    margin-top: 12px;
  }

  .activity-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  .activity-label {
    font-size: 10px;
    color: #8b949e;
    width: 50px;
  }

  .activity-bar {
    flex: 1;
    height: 8px;
    background: #21262d;
    border-radius: 4px;
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.3s ease;
  }

  .bar-fill.active { background: #3fb950; }
  .bar-fill.hooked { background: #f0883e; }
  .bar-fill.idle { background: #8b949e; }

  .activity-count {
    font-size: 10px;
    color: #6e7681;
    width: 20px;
    text-align: right;
  }
</style>
