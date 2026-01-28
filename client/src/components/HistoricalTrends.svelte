<script>
  import { onMount, afterUpdate } from 'svelte';
  import * as d3 from 'd3';
  import TimeRangePicker from './TimeRangePicker.svelte';

  export let loading = false;

  let metricsData = [];
  let summary = null;
  let fetchError = null;
  let chartContainer;
  let agentChartContainer;
  let activeChart = 'poll';

  // Time range state
  let timeRange = {
    start: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    end: new Date().toISOString()
  };

  async function fetchHistoricalData() {
    try {
      fetchError = null;
      const params = new URLSearchParams({
        start: timeRange.start,
        end: timeRange.end
      });

      const [historyRes, summaryRes] = await Promise.all([
        fetch(`/api/metrics/history?${params}`),
        fetch(`/api/metrics/summary?${params}`)
      ]);

      if (!historyRes.ok || !summaryRes.ok) {
        throw new Error('Failed to fetch metrics');
      }

      const historyData = await historyRes.json();
      const summaryData = await summaryRes.json();

      metricsData = historyData.data || [];
      summary = summaryData;
    } catch (err) {
      fetchError = err.message;
      metricsData = [];
      summary = null;
    }
  }

  function handleTimeRangeChange(e) {
    timeRange = { start: e.detail.start, end: e.detail.end };
    fetchHistoricalData();
  }

  function renderChart(data, container, valueExtractor, color, label) {
    if (!container || !data || data.length < 2) return;

    d3.select(container).selectAll('*').remove();

    const margin = { top: 20, right: 20, bottom: 35, left: 45 };
    const width = container.clientWidth - margin.left - margin.right;
    const height = 180 - margin.top - margin.bottom;

    const svg = d3.select(container)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Extract values and timestamps
    const chartData = data.map(d => ({
      time: new Date(d.timestamp),
      value: valueExtractor(d),
      isAnomaly: false
    }));

    // Detect anomalies
    const values = chartData.map(d => d.value).filter(v => v != null);
    const anomalyIndices = detectAnomalies(values);
    anomalyIndices.forEach(i => {
      if (chartData[i]) chartData[i].isAnomaly = true;
    });

    // Scales
    const x = d3.scaleTime()
      .domain(d3.extent(chartData, d => d.time))
      .range([0, width]);

    const maxVal = d3.max(chartData, d => d.value) || 1;
    const y = d3.scaleLinear()
      .domain([0, maxVal * 1.1])
      .range([height, 0]);

    // Area
    const area = d3.area()
      .defined(d => d.value != null)
      .x(d => x(d.time))
      .y0(height)
      .y1(d => y(d.value))
      .curve(d3.curveMonotoneX);

    // Gradient
    const gradientId = `gradient-${Math.random().toString(36).substr(2, 9)}`;
    const defs = svg.append('defs');
    const gradient = defs.append('linearGradient')
      .attr('id', gradientId)
      .attr('x1', '0%').attr('y1', '0%')
      .attr('x2', '0%').attr('y2', '100%');

    gradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', color)
      .attr('stop-opacity', 0.4);

    gradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', color)
      .attr('stop-opacity', 0.05);

    svg.append('path')
      .datum(chartData.filter(d => d.value != null))
      .attr('fill', `url(#${gradientId})`)
      .attr('d', area);

    // Line
    const line = d3.line()
      .defined(d => d.value != null)
      .x(d => x(d.time))
      .y(d => y(d.value))
      .curve(d3.curveMonotoneX);

    svg.append('path')
      .datum(chartData.filter(d => d.value != null))
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('stroke-width', 2)
      .attr('d', line);

    // Anomaly markers
    const anomalies = chartData.filter(d => d.isAnomaly);
    svg.selectAll('.anomaly-marker')
      .data(anomalies)
      .enter()
      .append('circle')
      .attr('class', 'anomaly-marker')
      .attr('cx', d => x(d.time))
      .attr('cy', d => y(d.value))
      .attr('r', 5)
      .attr('fill', '#f85149')
      .attr('stroke', '#fff')
      .attr('stroke-width', 2);

    // X-axis
    const rangeDuration = new Date(timeRange.end) - new Date(timeRange.start);
    let tickFormat;
    let tickCount = 6;

    if (rangeDuration <= 2 * 60 * 60 * 1000) {
      tickFormat = d3.timeFormat('%H:%M');
    } else if (rangeDuration <= 24 * 60 * 60 * 1000) {
      tickFormat = d3.timeFormat('%H:%M');
    } else if (rangeDuration <= 7 * 24 * 60 * 60 * 1000) {
      tickFormat = d3.timeFormat('%m/%d %H:%M');
      tickCount = 5;
    } else {
      tickFormat = d3.timeFormat('%m/%d');
    }

    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(tickCount).tickFormat(tickFormat))
      .selectAll('text')
      .attr('fill', '#6e7681')
      .attr('font-size', '10px');

    svg.selectAll('.domain, .tick line')
      .attr('stroke', '#30363d');

    // Y-axis
    svg.append('g')
      .call(d3.axisLeft(y).ticks(5).tickFormat(d => {
        if (d >= 1000) return `${(d / 1000).toFixed(1)}k`;
        return d;
      }))
      .selectAll('text')
      .attr('fill', '#6e7681')
      .attr('font-size', '10px');

    // Label
    svg.append('text')
      .attr('x', 0)
      .attr('y', -8)
      .attr('fill', '#8b949e')
      .attr('font-size', '11px')
      .text(label);
  }

  function renderAgentChart(data, container) {
    if (!container || !data || data.length < 2) return;

    d3.select(container).selectAll('*').remove();

    const margin = { top: 20, right: 20, bottom: 35, left: 45 };
    const width = container.clientWidth - margin.left - margin.right;
    const height = 180 - margin.top - margin.bottom;

    const svg = d3.select(container)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Transform data for stacked area
    const chartData = data.map(d => {
      const activity = d.agentActivity || {};
      return {
        time: new Date(d.timestamp),
        active: typeof activity.active === 'object' ? activity.active.avg : (activity.active || 0),
        hooked: typeof activity.hooked === 'object' ? activity.hooked.avg : (activity.hooked || 0),
        idle: typeof activity.idle === 'object' ? activity.idle.avg : (activity.idle || 0)
      };
    });

    const keys = ['active', 'hooked', 'idle'];
    const colors = { active: '#3fb950', hooked: '#f0883e', idle: '#8b949e' };

    const stack = d3.stack().keys(keys);
    const stackedData = stack(chartData);

    const x = d3.scaleTime()
      .domain(d3.extent(chartData, d => d.time))
      .range([0, width]);

    const y = d3.scaleLinear()
      .domain([0, d3.max(stackedData[stackedData.length - 1], d => d[1]) || 1])
      .range([height, 0]);

    const area = d3.area()
      .x(d => x(d.data.time))
      .y0(d => y(d[0]))
      .y1(d => y(d[1]))
      .curve(d3.curveMonotoneX);

    svg.selectAll('.layer')
      .data(stackedData)
      .enter()
      .append('path')
      .attr('class', 'layer')
      .attr('fill', d => colors[d.key])
      .attr('fill-opacity', 0.7)
      .attr('d', area);

    // X-axis
    const rangeDuration = new Date(timeRange.end) - new Date(timeRange.start);
    let tickFormat = rangeDuration <= 24 * 60 * 60 * 1000
      ? d3.timeFormat('%H:%M')
      : d3.timeFormat('%m/%d');

    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(6).tickFormat(tickFormat))
      .selectAll('text')
      .attr('fill', '#6e7681')
      .attr('font-size', '10px');

    svg.selectAll('.domain, .tick line')
      .attr('stroke', '#30363d');

    // Y-axis
    svg.append('g')
      .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format('d')))
      .selectAll('text')
      .attr('fill', '#6e7681')
      .attr('font-size', '10px');

    // Legend
    const legend = svg.append('g')
      .attr('transform', `translate(${width - 120}, -10)`);

    keys.forEach((key, i) => {
      legend.append('rect')
        .attr('x', i * 45)
        .attr('y', 0)
        .attr('width', 10)
        .attr('height', 10)
        .attr('fill', colors[key]);

      legend.append('text')
        .attr('x', i * 45 + 14)
        .attr('y', 9)
        .attr('fill', '#8b949e')
        .attr('font-size', '9px')
        .text(key);
    });

    // Label
    svg.append('text')
      .attr('x', 0)
      .attr('y', -8)
      .attr('fill', '#8b949e')
      .attr('font-size', '11px')
      .text('Agent Activity Over Time');
  }

  function detectAnomalies(data) {
    if (data.length < 4) return [];

    const sorted = [...data].filter(v => v != null).sort((a, b) => a - b);
    if (sorted.length < 4) return [];

    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    const anomalies = [];
    for (let i = 0; i < data.length; i++) {
      if (data[i] != null && (data[i] < lowerBound || data[i] > upperBound)) {
        anomalies.push(i);
      }
    }

    return anomalies;
  }

  function extractPollDuration(d) {
    if (typeof d.pollDuration === 'object') {
      return d.pollDuration.avg;
    }
    return d.pollDuration || d.avgPollDuration;
  }

  function extractEventVolume(d) {
    if (typeof d.eventVolume === 'object') {
      return d.eventVolume.total;
    }
    return d.eventVolume;
  }

  $: if (chartContainer && metricsData.length >= 2) {
    if (activeChart === 'poll') {
      renderChart(metricsData, chartContainer, extractPollDuration, '#58a6ff', 'Poll Duration (ms)');
    } else if (activeChart === 'events') {
      renderChart(metricsData, chartContainer, extractEventVolume, '#3fb950', 'Event Volume');
    }
  }

  $: if (agentChartContainer && metricsData.length >= 2) {
    renderAgentChart(metricsData, agentChartContainer);
  }

  onMount(() => {
    fetchHistoricalData();

    const resizeObserver = new ResizeObserver(() => {
      if (chartContainer && metricsData.length >= 2) {
        if (activeChart === 'poll') {
          renderChart(metricsData, chartContainer, extractPollDuration, '#58a6ff', 'Poll Duration (ms)');
        } else if (activeChart === 'events') {
          renderChart(metricsData, chartContainer, extractEventVolume, '#3fb950', 'Event Volume');
        }
      }
      if (agentChartContainer && metricsData.length >= 2) {
        renderAgentChart(metricsData, agentChartContainer);
      }
    });

    if (chartContainer) resizeObserver.observe(chartContainer);
    if (agentChartContainer) resizeObserver.observe(agentChartContainer);

    return () => resizeObserver.disconnect();
  });

  function formatNumber(n) {
    if (n == null) return '--';
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return n.toString();
  }
</script>

<div class="historical-trends">
  <h3>Historical Trends</h3>

  <TimeRangePicker
    start={timeRange.start}
    end={timeRange.end}
    on:change={handleTimeRangeChange}
  />

  {#if loading}
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Loading historical data...</p>
    </div>
  {:else if fetchError}
    <div class="error-state">
      <p>Failed to load data: {fetchError}</p>
      <button on:click={fetchHistoricalData}>Retry</button>
    </div>
  {:else if metricsData.length < 2}
    <div class="empty-state">
      <p>Not enough historical data available yet.</p>
      <p class="hint">Data accumulates over time. Check back later.</p>
    </div>
  {:else}
    {#if summary}
      <div class="summary-cards">
        <div class="summary-card">
          <div class="card-value">{formatNumber(summary.dataPoints)}</div>
          <div class="card-label">Data Points</div>
        </div>
        <div class="summary-card">
          <div class="card-value">{summary.pollDuration?.avg || '--'}ms</div>
          <div class="card-label">Avg Poll Time</div>
        </div>
        <div class="summary-card">
          <div class="card-value">{formatNumber(summary.totalEvents)}</div>
          <div class="card-label">Total Events</div>
        </div>
        {#if summary.pollDuration?.anomalyCount > 0}
          <div class="summary-card anomaly">
            <div class="card-value">{summary.pollDuration.anomalyCount}</div>
            <div class="card-label">Anomalies</div>
          </div>
        {/if}
      </div>
    {/if}

    <div class="chart-section">
      <div class="chart-tabs">
        <button
          class:active={activeChart === 'poll'}
          on:click={() => activeChart = 'poll'}
        >
          Poll Duration
        </button>
        <button
          class:active={activeChart === 'events'}
          on:click={() => activeChart = 'events'}
        >
          Event Volume
        </button>
      </div>
      <div class="chart-container" bind:this={chartContainer}></div>
    </div>

    <div class="chart-section">
      <div class="agent-chart-container" bind:this={agentChartContainer}></div>
    </div>

    {#if summary?.anomalies?.length > 0}
      <div class="anomalies-section">
        <h4>Detected Anomalies</h4>
        <div class="anomalies-list">
          {#each summary.anomalies.slice(0, 5) as anomaly}
            <div class="anomaly-item" class:high={anomaly.type === 'high'}>
              <span class="anomaly-time">
                {new Date(anomaly.timestamp).toLocaleString()}
              </span>
              <span class="anomaly-value">
                {anomaly.value}ms
                <span class="anomaly-type">{anomaly.type === 'high' ? 'spike' : 'drop'}</span>
              </span>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .historical-trends {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  h3 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #8b949e;
    margin-bottom: 4px;
  }

  h4 {
    font-size: 11px;
    color: #8b949e;
    margin-bottom: 8px;
  }

  .loading-state,
  .error-state,
  .empty-state {
    text-align: center;
    padding: 24px;
    color: #6e7681;
  }

  .error-state {
    color: #f85149;
  }

  .error-state button {
    margin-top: 12px;
    padding: 6px 12px;
    background: #21262d;
    border: 1px solid #30363d;
    border-radius: 4px;
    color: #c9d1d9;
    cursor: pointer;
  }

  .hint {
    font-size: 11px;
    margin-top: 8px;
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 2px solid #30363d;
    border-top-color: #58a6ff;
    border-radius: 50%;
    margin: 0 auto 12px;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .summary-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(70px, 1fr));
    gap: 8px;
  }

  .summary-card {
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 8px;
    text-align: center;
  }

  .summary-card.anomaly {
    border-color: #f85149;
    background: #f8514922;
  }

  .card-value {
    font-size: 16px;
    font-weight: 600;
    color: #58a6ff;
  }

  .summary-card.anomaly .card-value {
    color: #f85149;
  }

  .card-label {
    font-size: 9px;
    color: #8b949e;
    margin-top: 2px;
  }

  .chart-section {
    background: #0d1117;
    border: 1px solid #21262d;
    border-radius: 6px;
    padding: 8px;
  }

  .chart-tabs {
    display: flex;
    gap: 4px;
    margin-bottom: 8px;
  }

  .chart-tabs button {
    padding: 4px 10px;
    background: #21262d;
    border: 1px solid #30363d;
    border-radius: 4px;
    color: #8b949e;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .chart-tabs button:hover {
    background: #30363d;
    color: #c9d1d9;
  }

  .chart-tabs button.active {
    background: #388bfd22;
    border-color: #58a6ff;
    color: #58a6ff;
  }

  .chart-container,
  .agent-chart-container {
    min-height: 180px;
  }

  .chart-container :global(svg),
  .agent-chart-container :global(svg) {
    display: block;
  }

  .anomalies-section {
    background: #0d1117;
    border: 1px solid #f8514944;
    border-radius: 6px;
    padding: 10px;
  }

  .anomalies-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .anomaly-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 8px;
    background: #21262d;
    border-radius: 4px;
    font-size: 11px;
  }

  .anomaly-time {
    color: #8b949e;
    font-family: monospace;
  }

  .anomaly-value {
    color: #c9d1d9;
    font-weight: 500;
  }

  .anomaly-type {
    font-size: 9px;
    padding: 1px 4px;
    border-radius: 2px;
    margin-left: 6px;
  }

  .anomaly-item.high .anomaly-type {
    background: #f8514933;
    color: #f85149;
  }

  .anomaly-item:not(.high) .anomaly-type {
    background: #f0883e33;
    color: #f0883e;
  }
</style>
