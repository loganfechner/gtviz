<script>
  import SkeletonRow from './SkeletonRow.svelte';

  export let errors = [];
  export let loading = false;

  function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function formatTimeSince(timestamp) {
    if (!timestamp) return '';
    const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }

  function getSeverityColor(severity) {
    switch (severity) {
      case 'error': return '#f85149';
      case 'warning': return '#f0883e';
      case 'info': return '#58a6ff';
      default: return '#8b949e';
    }
  }

  function getSeverityIcon(severity) {
    switch (severity) {
      case 'error': return '\u2717';
      case 'warning': return '\u26A0';
      case 'info': return '\u2139';
      default: return '\u2022';
    }
  }

  $: sortedErrors = [...errors].sort((a, b) =>
    new Date(b.timestamp) - new Date(a.timestamp)
  );

  $: hasErrors = errors.some(e => e.severity === 'error');
  $: hasWarnings = errors.some(e => e.severity === 'warning');
</script>

<div class="error-panel">
  {#if loading}
    <SkeletonRow />
    <SkeletonRow />
    <SkeletonRow />
  {:else if sortedErrors.length === 0}
    <div class="empty">
      <span class="check-icon">&#10003;</span>
      <span>No errors</span>
    </div>
  {:else}
    <div class="summary" class:has-errors={hasErrors} class:has-warnings={hasWarnings && !hasErrors}>
      {#if hasErrors}
        <span class="error-count">{errors.filter(e => e.severity === 'error').length} error(s)</span>
      {/if}
      {#if hasWarnings}
        <span class="warning-count">{errors.filter(e => e.severity === 'warning').length} warning(s)</span>
      {/if}
    </div>

    <ul class="error-list">
      {#each sortedErrors as error (error.id || error.timestamp)}
        <li class="error-item" style="--severity-color: {getSeverityColor(error.severity)}">
          <div class="error-header">
            <span class="severity-icon">{getSeverityIcon(error.severity)}</span>
            <span class="component">{error.component}</span>
            {#if error.operation}
              <span class="operation">{error.operation}</span>
            {/if}
            <span class="time" title={error.timestamp}>{formatTimeSince(error.timestamp)}</span>
          </div>

          <div class="error-message">{error.message}</div>

          {#if error.retryCount !== undefined}
            <div class="retry-info">
              Retry {error.retryCount}/{error.maxRetries || 3}
              {#if error.retryCount >= (error.maxRetries || 3)}
                <span class="exhausted">(exhausted)</span>
              {/if}
            </div>
          {/if}

          {#if error.rig}
            <div class="error-meta">
              <span class="label">Rig:</span>
              <span class="value">{error.rig}</span>
            </div>
          {/if}

          {#if error.path}
            <div class="error-meta">
              <span class="label">Path:</span>
              <span class="value path">{error.path}</span>
            </div>
          {/if}

          {#if error.lastSuccess}
            <div class="error-meta">
              <span class="label">Last success:</span>
              <span class="value">{formatTimeSince(error.lastSuccess)}</span>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .error-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 40px 20px;
    color: #3fb950;
    font-size: 14px;
  }

  .check-icon {
    font-size: 18px;
  }

  .summary {
    display: flex;
    gap: 12px;
    padding: 8px 12px;
    background: #21262d;
    border-radius: 6px;
    font-size: 13px;
  }

  .summary.has-errors {
    border-left: 3px solid #f85149;
  }

  .summary.has-warnings {
    border-left: 3px solid #f0883e;
  }

  .error-count {
    color: #f85149;
    font-weight: 500;
  }

  .warning-count {
    color: #f0883e;
    font-weight: 500;
  }

  .error-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .error-item {
    padding: 10px 12px;
    background: #21262d;
    border-radius: 6px;
    border-left: 3px solid var(--severity-color);
    font-size: 12px;
  }

  .error-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }

  .severity-icon {
    color: var(--severity-color);
    font-weight: bold;
  }

  .component {
    color: #58a6ff;
    font-weight: 500;
  }

  .operation {
    color: #8b949e;
  }

  .operation::before {
    content: '\00B7';
    margin-right: 6px;
  }

  .time {
    margin-left: auto;
    color: #6e7681;
    font-size: 11px;
  }

  .error-message {
    color: #c9d1d9;
    line-height: 1.4;
    word-break: break-word;
  }

  .retry-info {
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid #30363d;
    color: #f0883e;
    font-size: 11px;
  }

  .exhausted {
    color: #f85149;
    font-weight: 500;
  }

  .error-meta {
    margin-top: 4px;
    font-size: 11px;
    display: flex;
    gap: 6px;
  }

  .error-meta .label {
    color: #6e7681;
  }

  .error-meta .value {
    color: #8b949e;
  }

  .error-meta .value.path {
    font-family: monospace;
    font-size: 10px;
    word-break: break-all;
  }
</style>
