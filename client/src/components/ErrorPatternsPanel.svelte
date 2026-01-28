<script>
  import SkeletonRow from './SkeletonRow.svelte';

  export let errorPatterns = { patterns: [], summary: {} };
  export let loading = false;

  let selectedPattern = null;
  let filterLevel = 'all';
  let filterScope = 'all';

  $: summary = errorPatterns.summary || {
    totalPatterns: 0,
    totalErrors: 0,
    systemicCount: 0,
    isolatedCount: 0,
    errorCount: 0,
    warnCount: 0,
    affectedAgentsCount: 0
  };

  $: patterns = errorPatterns.patterns || [];

  $: filteredPatterns = patterns.filter(p => {
    if (filterLevel !== 'all' && p.level !== filterLevel) return false;
    if (filterScope === 'systemic' && !p.isSystemic) return false;
    if (filterScope === 'isolated' && p.isSystemic) return false;
    return true;
  });

  function formatTime(timestamp) {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    return d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function formatRelativeTime(timestamp) {
    if (!timestamp) return '';
    const now = Date.now();
    const time = new Date(timestamp).getTime();
    const diff = now - time;

    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  }

  function getLevelColor(level) {
    return level === 'error' ? '#f85149' : '#f0883e';
  }

  function truncatePattern(pattern, maxLen = 60) {
    if (pattern.length <= maxLen) return pattern;
    return pattern.substring(0, maxLen - 3) + '...';
  }

  function selectPattern(pattern) {
    selectedPattern = selectedPattern === pattern ? null : pattern;
  }
</script>

<div class="error-patterns-panel">
  <h3>Error Patterns</h3>

  {#if loading}
    <div class="patterns-list">
      {#each Array(4) as _}
        <SkeletonRow variant="event" />
      {/each}
    </div>
  {:else}
    <div class="summary-cards">
      <div class="summary-card" class:highlight={summary.systemicCount > 0}>
        <div class="card-value" class:error={summary.systemicCount > 0}>{summary.systemicCount}</div>
        <div class="card-label">Systemic</div>
      </div>
      <div class="summary-card">
        <div class="card-value">{summary.isolatedCount}</div>
        <div class="card-label">Isolated</div>
      </div>
      <div class="summary-card">
        <div class="card-value error">{summary.errorCount}</div>
        <div class="card-label">Errors</div>
      </div>
      <div class="summary-card">
        <div class="card-value warn">{summary.warnCount}</div>
        <div class="card-label">Warnings</div>
      </div>
    </div>

    <div class="filters">
      <select bind:value={filterLevel}>
        <option value="all">All Levels</option>
        <option value="error">Errors Only</option>
        <option value="warn">Warnings Only</option>
      </select>
      <select bind:value={filterScope}>
        <option value="all">All Scope</option>
        <option value="systemic">Systemic</option>
        <option value="isolated">Isolated</option>
      </select>
    </div>

    {#if filteredPatterns.length === 0}
      <p class="empty">No error patterns detected</p>
    {:else}
      <div class="patterns-list">
        {#each filteredPatterns as pattern}
          <div
            class="pattern-entry"
            class:selected={selectedPattern === pattern}
            class:systemic={pattern.isSystemic}
            on:click={() => selectPattern(pattern)}
            on:keydown={(e) => e.key === 'Enter' && selectPattern(pattern)}
            role="button"
            tabindex="0"
          >
            <div class="pattern-header">
              <span class="pattern-level" style="color: {getLevelColor(pattern.level)}">
                {pattern.level}
              </span>
              <span class="pattern-count">{pattern.count}x</span>
              {#if pattern.isSystemic}
                <span class="systemic-badge">SYSTEMIC</span>
              {/if}
              <span class="pattern-time">{formatRelativeTime(pattern.lastSeen)}</span>
            </div>
            <div class="pattern-text">{truncatePattern(pattern.pattern)}</div>
            <div class="pattern-meta">
              <span class="affected-agents">
                {pattern.affectedAgents.length} agent{pattern.affectedAgents.length !== 1 ? 's' : ''}
              </span>
              {#if pattern.affectedRigs.length > 0}
                <span class="affected-rigs">
                  {pattern.affectedRigs.join(', ')}
                </span>
              {/if}
            </div>

            {#if selectedPattern === pattern}
              <div class="pattern-details">
                <div class="detail-section">
                  <h4>Affected Agents</h4>
                  <div class="agent-chips">
                    {#each pattern.affectedAgents as agent}
                      <span class="agent-chip">{agent}</span>
                    {/each}
                  </div>
                </div>

                {#if pattern.examples.length > 0}
                  <div class="detail-section">
                    <h4>Example Messages</h4>
                    {#each pattern.examples as example}
                      <div class="example-message">
                        <span class="example-time">{formatTime(example.timestamp)}</span>
                        <span class="example-text">{example.message}</span>
                      </div>
                    {/each}
                  </div>
                {/if}

                {#if pattern.recentErrors.length > 0}
                  <div class="detail-section">
                    <h4>Recent Occurrences ({pattern.recentErrors.length})</h4>
                    <div class="recent-list">
                      {#each pattern.recentErrors.slice(0, 5) as error}
                        <div class="recent-error">
                          <span class="recent-time">{formatTime(error.timestamp)}</span>
                          <span class="recent-agent">{error.agent || 'unknown'}</span>
                        </div>
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .error-patterns-panel {
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

  .summary-cards {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    margin-bottom: 12px;
  }

  .summary-card {
    background: #0d1117;
    border: 1px solid #21262d;
    border-radius: 6px;
    padding: 8px;
    text-align: center;
  }

  .summary-card.highlight {
    border-color: #f85149;
    background: #f8514915;
  }

  .card-value {
    font-size: 18px;
    font-weight: 600;
    color: #c9d1d9;
  }

  .card-value.error {
    color: #f85149;
  }

  .card-value.warn {
    color: #f0883e;
  }

  .card-label {
    font-size: 9px;
    color: #6e7681;
    text-transform: uppercase;
    margin-top: 2px;
  }

  .filters {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
  }

  .filters select {
    flex: 1;
    padding: 6px 8px;
    background: #21262d;
    border: 1px solid #30363d;
    border-radius: 4px;
    color: #c9d1d9;
    font-size: 11px;
    cursor: pointer;
  }

  .filters select:focus {
    outline: none;
    border-color: #58a6ff;
  }

  .empty {
    color: #6e7681;
    font-size: 13px;
    text-align: center;
    padding: 20px;
  }

  .patterns-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow-y: auto;
    flex: 1;
  }

  .pattern-entry {
    padding: 8px 10px;
    background: #0d1117;
    border-radius: 6px;
    border: 1px solid #21262d;
    cursor: pointer;
    transition: all 0.15s;
  }

  .pattern-entry:hover {
    border-color: #30363d;
    background: #161b22;
  }

  .pattern-entry.selected {
    border-color: #58a6ff;
  }

  .pattern-entry.systemic {
    border-left: 3px solid #f85149;
  }

  .pattern-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  .pattern-level {
    font-size: 10px;
    text-transform: uppercase;
    font-weight: 600;
  }

  .pattern-count {
    font-size: 11px;
    color: #8b949e;
    font-weight: 500;
  }

  .systemic-badge {
    font-size: 9px;
    background: #f85149;
    color: white;
    padding: 1px 4px;
    border-radius: 2px;
    font-weight: 600;
  }

  .pattern-time {
    font-size: 10px;
    color: #6e7681;
    margin-left: auto;
  }

  .pattern-text {
    font-size: 11px;
    color: #c9d1d9;
    font-family: monospace;
    word-break: break-word;
    margin-bottom: 4px;
  }

  .pattern-meta {
    display: flex;
    gap: 8px;
    font-size: 10px;
    color: #6e7681;
  }

  .affected-agents {
    color: #58a6ff;
  }

  .affected-rigs {
    color: #8b949e;
  }

  .pattern-details {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid #21262d;
  }

  .detail-section {
    margin-bottom: 10px;
  }

  .detail-section:last-child {
    margin-bottom: 0;
  }

  .detail-section h4 {
    font-size: 10px;
    color: #8b949e;
    margin-bottom: 6px;
    text-transform: uppercase;
  }

  .agent-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .agent-chip {
    font-size: 10px;
    background: #21262d;
    color: #58a6ff;
    padding: 2px 6px;
    border-radius: 3px;
    font-family: monospace;
  }

  .example-message {
    font-size: 10px;
    background: #161b22;
    padding: 4px 6px;
    border-radius: 3px;
    margin-bottom: 4px;
    display: flex;
    gap: 8px;
  }

  .example-time {
    color: #6e7681;
    font-family: monospace;
    flex-shrink: 0;
  }

  .example-text {
    color: #c9d1d9;
    font-family: monospace;
    word-break: break-word;
  }

  .recent-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .recent-error {
    font-size: 10px;
    display: flex;
    gap: 8px;
  }

  .recent-time {
    color: #6e7681;
    font-family: monospace;
  }

  .recent-agent {
    color: #8b949e;
  }
</style>
