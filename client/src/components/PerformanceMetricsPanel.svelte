<script>
  import { onMount, afterUpdate } from 'svelte';
  import * as d3 from 'd3';

  export let metrics = null;

  let pollChartEl;
  let volumeChartEl;

  // Draw poll time sparkline
  function drawPollChart(data) {
    if (!pollChartEl || !data || data.length === 0) return;

    const width = pollChartEl.clientWidth || 280;
    const height = 40;
    const margin = { top: 4, right: 4, bottom: 4, left: 4 };

    d3.select(pollChartEl).selectAll('*').remove();

    const svg = d3.select(pollChartEl)
      .append('svg')
      .attr('width', width)
      .attr('height', height);

    const x = d3.scaleLinear()
      .domain([0, data.length - 1])
      .range([margin.left, width - margin.right]);

    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.value) || 100])
      .range([height - margin.bottom, margin.top]);

    const line = d3.line()
      .x((d, i) => x(i))
      .y(d => y(d.value))
      .curve(d3.curveMonotoneX);

    // Area fill
    const area = d3.area()
      .x((d, i) => x(i))
      .y0(height - margin.bottom)
      .y1(d => y(d.value))
      .curve(d3.curveMonotoneX);

    svg.append('path')
      .datum(data)
      .attr('fill', 'rgba(233, 69, 96, 0.2)')
      .attr('d', area);

    svg.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#e94560')
      .attr('stroke-width', 1.5)
      .attr('d', line);

    // Latest point indicator
    if (data.length > 0) {
      const last = data[data.length - 1];
      svg.append('circle')
        .attr('cx', x(data.length - 1))
        .attr('cy', y(last.value))
        .attr('r', 3)
        .attr('fill', '#e94560');
    }
  }

  // Draw event volume bar chart
  function drawVolumeChart(data) {
    if (!volumeChartEl || !data || data.length === 0) return;

    const width = volumeChartEl.clientWidth || 280;
    const height = 50;
    const margin = { top: 4, right: 4, bottom: 4, left: 4 };

    d3.select(volumeChartEl).selectAll('*').remove();

    const svg = d3.select(volumeChartEl)
      .append('svg')
      .attr('width', width)
      .attr('height', height);

    // Show last 30 data points
    const displayData = data.slice(-30);
    const barWidth = Math.max(2, (width - margin.left - margin.right) / 30 - 1);

    const x = d3.scaleBand()
      .domain(displayData.map((d, i) => i))
      .range([margin.left, width - margin.right])
      .padding(0.2);

    const y = d3.scaleLinear()
      .domain([0, d3.max(displayData, d => d.count) || 1])
      .range([height - margin.bottom, margin.top]);

    svg.selectAll('rect')
      .data(displayData)
      .join('rect')
      .attr('x', (d, i) => x(i))
      .attr('y', d => y(d.count))
      .attr('width', x.bandwidth())
      .attr('height', d => height - margin.bottom - y(d.count))
      .attr('fill', '#4ade80')
      .attr('opacity', 0.8);
  }

  afterUpdate(() => {
    if (metrics) {
      drawPollChart(metrics.pollTime?.history || []);
      drawVolumeChart(metrics.eventVolume || []);
    }
  });

  onMount(() => {
    if (metrics) {
      drawPollChart(metrics.pollTime?.history || []);
      drawVolumeChart(metrics.eventVolume || []);
    }
  });

  $: pollCurrent = metrics?.pollTime?.current || 0;
  $: pollAvg = metrics?.pollTime?.average || 0;
  $: updatesPerMin = metrics?.updateFrequency?.perMinute || 0;
  $: changesPerMin = metrics?.activityRate?.changesPerMinute || 0;
</script>

<div class="panel">
  <h3>Performance</h3>

  <div class="metric-section">
    <div class="metric-header">
      <span class="metric-title">API Response Time</span>
      <span class="metric-value">{pollCurrent}<span class="unit">ms</span></span>
    </div>
    <div class="metric-subtext">
      5-min avg: {pollAvg}ms
    </div>
    <div class="chart" bind:this={pollChartEl}></div>
  </div>

  <div class="divider"></div>

  <div class="metric-row">
    <div class="metric-card">
      <span class="card-value">{updatesPerMin}</span>
      <span class="card-label">Updates/min</span>
    </div>
    <div class="metric-card">
      <span class="card-value activity">{changesPerMin}</span>
      <span class="card-label">Changes/min</span>
    </div>
  </div>

  <div class="divider"></div>

  <div class="metric-section">
    <div class="metric-header">
      <span class="metric-title">Event Volume</span>
    </div>
    <div class="chart" bind:this={volumeChartEl}></div>
    <div class="metric-subtext">Last 30 minutes</div>
  </div>

  {#if metrics?.activityRate?.recentChanges?.length > 0}
    <div class="divider"></div>
    <div class="metric-section">
      <div class="metric-header">
        <span class="metric-title">Recent Activity</span>
      </div>
      <div class="activity-list">
        {#each metrics.activityRate.recentChanges.slice(-5) as change}
          <div class="activity-item">
            <span class="activity-agent">{change.agent}</span>
            <span class="activity-change">
              {change.previous?.status || 'new'} &rarr; {change.current?.status || '?'}
            </span>
          </div>
        {/each}
      </div>
    </div>
  {/if}
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
    content: '\2261';
    font-size: 1.2rem;
  }

  .metric-section {
    margin-bottom: 0.75rem;
  }

  .metric-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 0.25rem;
  }

  .metric-title {
    font-size: 0.75rem;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .metric-value {
    font-size: 1.25rem;
    font-weight: 700;
    color: #e94560;
  }

  .unit {
    font-size: 0.75rem;
    font-weight: 400;
    color: #888;
    margin-left: 2px;
  }

  .metric-subtext {
    font-size: 0.7rem;
    color: #555;
    margin-top: 0.25rem;
  }

  .chart {
    width: 100%;
    height: 40px;
    margin-top: 0.5rem;
    background: #1a1a2e;
    border-radius: 4px;
    overflow: hidden;
  }

  .divider {
    height: 1px;
    background: #0f3460;
    margin: 1rem 0;
  }

  .metric-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }

  .metric-card {
    text-align: center;
    padding: 0.75rem 0.5rem;
    background: #1a1a2e;
    border-radius: 4px;
  }

  .card-value {
    display: block;
    font-size: 1.5rem;
    font-weight: 700;
    color: #4ade80;
  }

  .card-value.activity {
    color: #fbbf24;
  }

  .card-label {
    font-size: 0.65rem;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .activity-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    max-height: 120px;
    overflow-y: auto;
  }

  .activity-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.35rem 0.5rem;
    background: #1a1a2e;
    border-radius: 4px;
    font-size: 0.75rem;
  }

  .activity-agent {
    color: #ccc;
  }

  .activity-change {
    color: #888;
    font-family: monospace;
    font-size: 0.65rem;
  }
</style>
