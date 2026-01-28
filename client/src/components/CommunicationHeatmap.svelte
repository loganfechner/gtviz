<script>
  export let mail = [];
  export let agents = [];
  export let rig = null;
  export let loading = false;

  // Time bucket configuration
  const BUCKET_COUNT = 12;
  const BUCKET_MINUTES = 5;

  // Build agent communication data from mail
  $: communicationData = buildCommunicationData(mail, agents, rig);

  function buildCommunicationData(mail, agents, rig) {
    const now = Date.now();
    const bucketMs = BUCKET_MINUTES * 60 * 1000;

    // Filter mail for current rig
    const rigMail = mail.filter(m => m.rig === rig);

    // Get unique agent names involved in communication
    const agentNames = new Set();
    for (const m of rigMail) {
      if (m.from) agentNames.add(m.from);
      if (m.to) agentNames.add(m.to);
    }

    // Build time buckets
    const buckets = [];
    for (let i = BUCKET_COUNT - 1; i >= 0; i--) {
      const startTime = now - (i + 1) * bucketMs;
      const endTime = now - i * bucketMs;
      buckets.push({ startTime, endTime, label: formatBucketLabel(i) });
    }

    // Build communication pairs matrix
    const pairs = [];
    const sortedAgents = Array.from(agentNames).sort();

    for (const from of sortedAgents) {
      for (const to of sortedAgents) {
        if (from === to) continue;

        const pairData = {
          from,
          to,
          label: `${truncateName(from)} → ${truncateName(to)}`,
          buckets: buckets.map(bucket => {
            const count = rigMail.filter(m => {
              const mailTime = new Date(m.timestamp).getTime();
              return m.from === from &&
                     m.to === to &&
                     mailTime >= bucket.startTime &&
                     mailTime < bucket.endTime;
            }).length;
            return { ...bucket, count };
          }),
          total: rigMail.filter(m => m.from === from && m.to === to).length
        };

        // Only include pairs with at least one message
        if (pairData.total > 0) {
          pairs.push(pairData);
        }
      }
    }

    // Sort by total messages descending
    pairs.sort((a, b) => b.total - a.total);

    // Calculate max count for color scaling
    const maxCount = Math.max(1, ...pairs.flatMap(p => p.buckets.map(b => b.count)));

    return { pairs, buckets, maxCount };
  }

  function formatBucketLabel(bucketsAgo) {
    if (bucketsAgo === 0) return 'Now';
    const mins = bucketsAgo * BUCKET_MINUTES;
    if (mins < 60) return `-${mins}m`;
    return `-${Math.round(mins / 60)}h`;
  }

  function truncateName(name) {
    if (!name) return '?';
    // Remove common prefixes like "polecats/" or "crew/"
    const shortName = name.replace(/^(polecats|crew)\//, '');
    return shortName.length > 8 ? shortName.slice(0, 7) + '…' : shortName;
  }

  function getHeatColor(count, maxCount) {
    if (count === 0) return '#161b22';
    const intensity = count / maxCount;

    // Color scale: dark blue -> cyan -> yellow -> orange
    if (intensity < 0.25) {
      return `rgba(88, 166, 255, ${0.2 + intensity * 2})`; // blue
    } else if (intensity < 0.5) {
      return `rgba(63, 185, 80, ${0.4 + intensity})`; // green
    } else if (intensity < 0.75) {
      return `rgba(240, 136, 62, ${0.5 + intensity * 0.5})`; // orange
    } else {
      return `rgba(248, 81, 73, ${0.7 + intensity * 0.3})`; // red (bottleneck)
    }
  }

  // Summary statistics
  $: totalMessages = communicationData.pairs.reduce((sum, p) => sum + p.total, 0);
  $: activePairs = communicationData.pairs.length;
  $: busiestPair = communicationData.pairs[0] || null;
</script>

<div class="heatmap-container">
  <h3>Communication Heatmap</h3>

  {#if loading}
    <div class="loading">
      <div class="skeleton-grid">
        {#each Array(5) as _}
          <div class="skeleton-row">
            <div class="skeleton-label"></div>
            {#each Array(BUCKET_COUNT) as __}
              <div class="skeleton-cell"></div>
            {/each}
          </div>
        {/each}
      </div>
    </div>
  {:else if communicationData.pairs.length === 0}
    <div class="empty-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <p>No communication data yet</p>
      <span>Messages between agents will appear here</span>
    </div>
  {:else}
    <!-- Summary stats -->
    <div class="stats-row">
      <div class="stat">
        <span class="stat-value">{totalMessages}</span>
        <span class="stat-label">messages</span>
      </div>
      <div class="stat">
        <span class="stat-value">{activePairs}</span>
        <span class="stat-label">active pairs</span>
      </div>
      {#if busiestPair}
        <div class="stat busiest">
          <span class="stat-value">{busiestPair.total}</span>
          <span class="stat-label">{busiestPair.label}</span>
        </div>
      {/if}
    </div>

    <!-- Time axis labels -->
    <div class="time-axis">
      <div class="axis-spacer"></div>
      {#each communicationData.buckets as bucket}
        <div class="time-label">{bucket.label}</div>
      {/each}
    </div>

    <!-- Heatmap grid -->
    <div class="heatmap-grid">
      {#each communicationData.pairs as pair}
        <div class="heatmap-row">
          <div class="pair-label" title="{pair.from} → {pair.to}">
            {pair.label}
          </div>
          {#each pair.buckets as bucket}
            <div
              class="heatmap-cell"
              class:has-data={bucket.count > 0}
              style="background-color: {getHeatColor(bucket.count, communicationData.maxCount)}"
              title="{pair.from} → {pair.to}: {bucket.count} message{bucket.count !== 1 ? 's' : ''} ({bucket.label})"
            >
              {#if bucket.count > 0}
                <span class="cell-count">{bucket.count}</span>
              {/if}
            </div>
          {/each}
          <div class="row-total">{pair.total}</div>
        </div>
      {/each}
    </div>

    <!-- Legend -->
    <div class="legend">
      <span class="legend-label">Low</span>
      <div class="legend-gradient"></div>
      <span class="legend-label">High</span>
      <span class="legend-note">(bottleneck)</span>
    </div>
  {/if}
</div>

<style>
  .heatmap-container {
    padding: 12px;
  }

  h3 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #8b949e;
    margin-bottom: 12px;
  }

  .stats-row {
    display: flex;
    gap: 12px;
    margin-bottom: 12px;
  }

  .stat {
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 8px 10px;
    flex: 1;
    text-align: center;
  }

  .stat.busiest {
    border-color: #f0883e44;
    background: #f0883e11;
  }

  .stat-value {
    display: block;
    font-size: 16px;
    font-weight: 600;
    color: #58a6ff;
  }

  .stat.busiest .stat-value {
    color: #f0883e;
  }

  .stat-label {
    font-size: 9px;
    color: #6e7681;
    text-transform: uppercase;
  }

  .time-axis {
    display: flex;
    margin-bottom: 4px;
  }

  .axis-spacer {
    width: 80px;
    flex-shrink: 0;
  }

  .time-label {
    flex: 1;
    text-align: center;
    font-size: 9px;
    color: #6e7681;
  }

  .heatmap-grid {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 300px;
    overflow-y: auto;
  }

  .heatmap-row {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .pair-label {
    width: 80px;
    flex-shrink: 0;
    font-size: 10px;
    color: #8b949e;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding-right: 4px;
  }

  .heatmap-cell {
    flex: 1;
    height: 20px;
    border-radius: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.1s, box-shadow 0.1s;
    cursor: default;
  }

  .heatmap-cell.has-data:hover {
    transform: scale(1.1);
    box-shadow: 0 0 8px rgba(88, 166, 255, 0.4);
    z-index: 1;
  }

  .cell-count {
    font-size: 9px;
    font-weight: 600;
    color: white;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  }

  .row-total {
    width: 24px;
    flex-shrink: 0;
    text-align: right;
    font-size: 10px;
    font-weight: 500;
    color: #6e7681;
  }

  .legend {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid #21262d;
  }

  .legend-label {
    font-size: 9px;
    color: #6e7681;
  }

  .legend-note {
    font-size: 9px;
    color: #f85149;
  }

  .legend-gradient {
    width: 100px;
    height: 8px;
    border-radius: 4px;
    background: linear-gradient(to right,
      rgba(88, 166, 255, 0.3),
      rgba(63, 185, 80, 0.6),
      rgba(240, 136, 62, 0.8),
      rgba(248, 81, 73, 1)
    );
  }

  .empty-state {
    text-align: center;
    padding: 40px 20px;
    color: #6e7681;
  }

  .empty-state svg {
    margin-bottom: 12px;
    opacity: 0.5;
  }

  .empty-state p {
    margin: 0;
    font-size: 13px;
    color: #8b949e;
  }

  .empty-state span {
    font-size: 11px;
  }

  /* Skeleton loading styles */
  .skeleton-grid {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .skeleton-row {
    display: flex;
    gap: 2px;
  }

  .skeleton-label {
    width: 80px;
    height: 20px;
    background: linear-gradient(90deg, #21262d 25%, #30363d 50%, #21262d 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 4px;
  }

  .skeleton-cell {
    flex: 1;
    height: 20px;
    background: linear-gradient(90deg, #21262d 25%, #30363d 50%, #21262d 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 2px;
  }

  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
</style>
