<script>
  export let metrics = {};
  export let loading = false;

  $: health = metrics.health || {};
  $: score = health.score ?? 0;
  $: status = health.status || 'unknown';
  $: components = health.components || {};
  $: history = health.history || { scores: [], timestamps: [] };

  // Component scores
  $: uptimeScore = components.uptime ?? 0;
  $: errorRateScore = components.errorRate ?? 0;
  $: throughputScore = components.throughput ?? 0;
  $: latencyScore = components.latency ?? 0;

  // Status colors
  $: statusColor = status === 'healthy' ? '#3fb950'
    : status === 'degraded' ? '#f0883e'
    : status === 'critical' ? '#f85149'
    : '#8b949e';

  // Score to color
  function scoreColor(s) {
    if (s >= 80) return '#3fb950';
    if (s >= 50) return '#f0883e';
    return '#f85149';
  }

  // Generate sparkline path from data
  function sparklinePath(data, width, height) {
    if (!data || data.length < 2) return '';
    const max = Math.max(...data, 100);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const step = width / (data.length - 1);

    const points = data.map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    });

    return `M${points.join(' L')}`;
  }

  // Calculate gauge arc path
  function gaugeArc(percentage, radius, strokeWidth) {
    const angle = (percentage / 100) * 270; // 270 degrees max
    const startAngle = 135; // Start at bottom-left
    const endAngle = startAngle + angle;

    const start = polarToCartesian(50, 50, radius, startAngle);
    const end = polarToCartesian(50, 50, radius, endAngle);
    const largeArcFlag = angle > 180 ? 1 : 0;

    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
  }

  function polarToCartesian(cx, cy, r, angleDegrees) {
    const angleRadians = (angleDegrees * Math.PI) / 180;
    return {
      x: cx + r * Math.cos(angleRadians),
      y: cy + r * Math.sin(angleRadians)
    };
  }
</script>

<div class="health-dashboard">
  <h3>System Health</h3>

  {#if loading}
    <div class="health-gauge skeleton-gauge">
      <div class="skeleton-circle"></div>
    </div>
    <div class="components-grid">
      {#each Array(4) as _}
        <div class="component-card skeleton">
          <div class="skeleton-bar"></div>
          <div class="skeleton-label"></div>
        </div>
      {/each}
    </div>
  {:else}
    <!-- Main Health Score Gauge -->
    <div class="health-gauge">
      <svg viewBox="0 0 100 100" class="gauge-svg">
        <!-- Background arc -->
        <path
          d={gaugeArc(100, 40, 8)}
          fill="none"
          stroke="#21262d"
          stroke-width="8"
          stroke-linecap="round"
        />
        <!-- Score arc -->
        <path
          d={gaugeArc(score, 40, 8)}
          fill="none"
          stroke={statusColor}
          stroke-width="8"
          stroke-linecap="round"
          class="score-arc"
        />
      </svg>
      <div class="gauge-center">
        <div class="score-value" style="color: {statusColor}">{score}</div>
        <div class="score-label">Health Score</div>
        <div class="status-badge" style="background: {statusColor}20; color: {statusColor}">
          {status}
        </div>
      </div>
    </div>

    <!-- Historical Trend -->
    {#if history.scores.length > 1}
      <div class="trend-section">
        <h4>Trend</h4>
        <svg class="trend-chart" viewBox="0 0 280 40" preserveAspectRatio="none">
          <defs>
            <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color={statusColor} stop-opacity="0.3" />
              <stop offset="100%" stop-color={statusColor} stop-opacity="0" />
            </linearGradient>
          </defs>
          <path d={sparklinePath(history.scores, 280, 40)} fill="none" stroke={statusColor} stroke-width="2" />
        </svg>
      </div>
    {/if}

    <!-- Component Breakdown -->
    <div class="components-section">
      <h4>Components</h4>
      <div class="components-grid">
        <div class="component-card">
          <div class="component-bar">
            <div class="bar-fill" style="width: {uptimeScore}%; background: {scoreColor(uptimeScore)}"></div>
          </div>
          <div class="component-info">
            <span class="component-label">Uptime</span>
            <span class="component-value" style="color: {scoreColor(uptimeScore)}">{uptimeScore}</span>
          </div>
        </div>

        <div class="component-card">
          <div class="component-bar">
            <div class="bar-fill" style="width: {errorRateScore}%; background: {scoreColor(errorRateScore)}"></div>
          </div>
          <div class="component-info">
            <span class="component-label">Error Rate</span>
            <span class="component-value" style="color: {scoreColor(errorRateScore)}">{errorRateScore}</span>
          </div>
        </div>

        <div class="component-card">
          <div class="component-bar">
            <div class="bar-fill" style="width: {throughputScore}%; background: {scoreColor(throughputScore)}"></div>
          </div>
          <div class="component-info">
            <span class="component-label">Throughput</span>
            <span class="component-value" style="color: {scoreColor(throughputScore)}">{throughputScore}</span>
          </div>
        </div>

        <div class="component-card">
          <div class="component-bar">
            <div class="bar-fill" style="width: {latencyScore}%; background: {scoreColor(latencyScore)}"></div>
          </div>
          <div class="component-info">
            <span class="component-label">Latency</span>
            <span class="component-value" style="color: {scoreColor(latencyScore)}">{latencyScore}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Score Weights Info -->
    <div class="weights-info">
      <span class="weight-item">Error 35%</span>
      <span class="weight-item">Uptime 30%</span>
      <span class="weight-item">Latency 20%</span>
      <span class="weight-item">Throughput 15%</span>
    </div>
  {/if}
</div>

<style>
  .health-dashboard {
    padding: 12px;
  }

  h3 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #8b949e;
    margin-bottom: 16px;
  }

  h4 {
    font-size: 11px;
    color: #8b949e;
    margin: 16px 0 8px;
  }

  /* Health Gauge */
  .health-gauge {
    position: relative;
    width: 160px;
    height: 120px;
    margin: 0 auto 16px;
  }

  .gauge-svg {
    width: 160px;
    height: 120px;
    transform: translateY(-10px);
  }

  .score-arc {
    transition: stroke-dashoffset 0.5s ease;
  }

  .gauge-center {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -40%);
    text-align: center;
  }

  .score-value {
    font-size: 36px;
    font-weight: 700;
    line-height: 1;
  }

  .score-label {
    font-size: 10px;
    color: #8b949e;
    margin-top: 2px;
  }

  .status-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 10px;
    font-weight: 500;
    text-transform: capitalize;
    margin-top: 4px;
  }

  /* Trend Chart */
  .trend-section {
    margin-bottom: 16px;
  }

  .trend-chart {
    width: 100%;
    height: 40px;
    background: #0d1117;
    border-radius: 6px;
  }

  /* Components */
  .components-section {
    margin-bottom: 12px;
  }

  .components-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .component-card {
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 10px;
  }

  .component-bar {
    height: 6px;
    background: #21262d;
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 6px;
  }

  .bar-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.3s ease;
  }

  .component-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .component-label {
    font-size: 10px;
    color: #8b949e;
  }

  .component-value {
    font-size: 12px;
    font-weight: 600;
  }

  /* Weights Info */
  .weights-info {
    display: flex;
    justify-content: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 8px;
  }

  .weight-item {
    font-size: 9px;
    color: #6e7681;
    padding: 2px 6px;
    background: #21262d;
    border-radius: 4px;
  }

  /* Skeleton styles */
  .skeleton-gauge {
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .skeleton-circle {
    width: 120px;
    height: 120px;
    border-radius: 50%;
    background: linear-gradient(90deg, #21262d 25%, #30363d 50%, #21262d 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
  }

  .component-card.skeleton {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .skeleton-bar {
    height: 6px;
    background: linear-gradient(90deg, #21262d 25%, #30363d 50%, #21262d 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 3px;
  }

  .skeleton-label {
    height: 10px;
    width: 60%;
    background: linear-gradient(90deg, #21262d 25%, #30363d 50%, #21262d 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 4px;
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
