<script>
  import Spinner from './Spinner.svelte';

  export let alerts = [];
  export let loading = false;

  // Filter state
  let showAcknowledged = false;
  let showResolved = false;
  let severityFilter = 'all';

  $: filteredAlerts = alerts.filter(alert => {
    if (!showAcknowledged && alert.acknowledged && !alert.resolved) return false;
    if (!showResolved && alert.resolved) return false;
    if (severityFilter !== 'all' && alert.severity !== severityFilter) return false;
    return true;
  });

  $: unacknowledgedCount = alerts.filter(a => !a.acknowledged && !a.resolved).length;
  $: criticalCount = alerts.filter(a => a.severity === 'critical' && !a.resolved).length;
  $: warningCount = alerts.filter(a => a.severity === 'warning' && !a.resolved).length;

  function getSeverityIcon(severity) {
    switch (severity) {
      case 'critical': return '!';
      case 'warning': return '!';
      case 'info': return 'i';
      default: return '?';
    }
  }

  function getSeverityClass(severity) {
    return `severity-${severity}`;
  }

  function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function formatRelativeTime(timestamp) {
    const now = Date.now();
    const then = new Date(timestamp).getTime();
    const diff = now - then;

    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  }

  async function acknowledgeAlert(alertId) {
    try {
      const serverPort = import.meta.env.VITE_SERVER_PORT || 3001;
      await fetch(`http://localhost:${serverPort}/api/alerts/${alertId}/acknowledge`, {
        method: 'POST'
      });
    } catch (err) {
      console.error('Failed to acknowledge alert:', err);
    }
  }

  async function resolveAlert(alertId) {
    try {
      const serverPort = import.meta.env.VITE_SERVER_PORT || 3001;
      await fetch(`http://localhost:${serverPort}/api/alerts/${alertId}/resolve`, {
        method: 'POST'
      });
    } catch (err) {
      console.error('Failed to resolve alert:', err);
    }
  }

  async function dismissAlert(alertId) {
    try {
      const serverPort = import.meta.env.VITE_SERVER_PORT || 3001;
      await fetch(`http://localhost:${serverPort}/api/alerts/${alertId}`, {
        method: 'DELETE'
      });
    } catch (err) {
      console.error('Failed to dismiss alert:', err);
    }
  }
</script>

<div class="alerts-panel">
  {#if loading}
    <div class="loading">
      <Spinner size="24" />
      <span>Loading alerts...</span>
    </div>
  {:else}
    <!-- Summary bar -->
    <div class="summary-bar">
      <div class="summary-item" class:has-alerts={unacknowledgedCount > 0}>
        <span class="count">{unacknowledgedCount}</span>
        <span class="label">Unread</span>
      </div>
      <div class="summary-item critical" class:has-alerts={criticalCount > 0}>
        <span class="count">{criticalCount}</span>
        <span class="label">Critical</span>
      </div>
      <div class="summary-item warning" class:has-alerts={warningCount > 0}>
        <span class="count">{warningCount}</span>
        <span class="label">Warning</span>
      </div>
    </div>

    <!-- Filters -->
    <div class="filters">
      <label class="filter-checkbox">
        <input type="checkbox" bind:checked={showAcknowledged} />
        <span>Acknowledged</span>
      </label>
      <label class="filter-checkbox">
        <input type="checkbox" bind:checked={showResolved} />
        <span>Resolved</span>
      </label>
      <select bind:value={severityFilter} class="severity-select">
        <option value="all">All Severities</option>
        <option value="critical">Critical</option>
        <option value="warning">Warning</option>
        <option value="info">Info</option>
      </select>
    </div>

    <!-- Alerts list -->
    <div class="alerts-list">
      {#if filteredAlerts.length === 0}
        <div class="empty-state">
          <span class="empty-icon">-</span>
          <p>No alerts</p>
        </div>
      {:else}
        {#each filteredAlerts as alert (alert.id)}
          <div class="alert-card {getSeverityClass(alert.severity)}"
               class:acknowledged={alert.acknowledged}
               class:resolved={alert.resolved}>
            <div class="alert-header">
              <span class="severity-badge {alert.severity}">
                {getSeverityIcon(alert.severity)}
              </span>
              <span class="alert-type">{alert.type.replace(/_/g, ' ')}</span>
              <span class="alert-time" title={alert.timestamp}>
                {formatRelativeTime(alert.timestamp)}
              </span>
            </div>
            <div class="alert-message">
              {alert.message}
            </div>
            {#if alert.details && Object.keys(alert.details).length > 0}
              <div class="alert-details">
                {#each Object.entries(alert.details) as [key, value]}
                  <span class="detail-item">
                    <span class="detail-key">{key}:</span>
                    <span class="detail-value">{value}</span>
                  </span>
                {/each}
              </div>
            {/if}
            <div class="alert-actions">
              {#if !alert.acknowledged && !alert.resolved}
                <button class="action-btn ack" on:click={() => acknowledgeAlert(alert.id)}>
                  Acknowledge
                </button>
              {/if}
              {#if !alert.resolved}
                <button class="action-btn resolve" on:click={() => resolveAlert(alert.id)}>
                  Resolve
                </button>
              {/if}
              <button class="action-btn dismiss" on:click={() => dismissAlert(alert.id)}>
                Dismiss
              </button>
            </div>
            {#if alert.acknowledged && !alert.resolved}
              <div class="alert-status">
                Acknowledged {formatRelativeTime(alert.acknowledgedAt)}
              </div>
            {/if}
            {#if alert.resolved}
              <div class="alert-status resolved-status">
                Resolved {formatRelativeTime(alert.resolvedAt)}
              </div>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .alerts-panel {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 40px;
    color: #8b949e;
  }

  .summary-bar {
    display: flex;
    gap: 8px;
    padding: 8px;
    background: #21262d;
    border-radius: 6px;
  }

  .summary-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px;
    border-radius: 4px;
    background: #161b22;
  }

  .summary-item.has-alerts {
    background: #21262d;
  }

  .summary-item.critical.has-alerts {
    background: rgba(248, 81, 73, 0.1);
    border: 1px solid rgba(248, 81, 73, 0.3);
  }

  .summary-item.warning.has-alerts {
    background: rgba(210, 153, 34, 0.1);
    border: 1px solid rgba(210, 153, 34, 0.3);
  }

  .summary-item .count {
    font-size: 18px;
    font-weight: 600;
    color: #c9d1d9;
  }

  .summary-item.critical .count {
    color: #f85149;
  }

  .summary-item.warning .count {
    color: #d29922;
  }

  .summary-item .label {
    font-size: 11px;
    color: #8b949e;
  }

  .filters {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
  }

  .filter-checkbox {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: #8b949e;
    cursor: pointer;
  }

  .filter-checkbox input {
    cursor: pointer;
  }

  .severity-select {
    padding: 4px 8px;
    font-size: 12px;
    background: #21262d;
    border: 1px solid #30363d;
    border-radius: 4px;
    color: #c9d1d9;
    cursor: pointer;
  }

  .alerts-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px;
    color: #8b949e;
  }

  .empty-icon {
    font-size: 32px;
    margin-bottom: 8px;
  }

  .alert-card {
    padding: 12px;
    background: #21262d;
    border-radius: 6px;
    border-left: 3px solid #30363d;
  }

  .alert-card.severity-critical {
    border-left-color: #f85149;
  }

  .alert-card.severity-warning {
    border-left-color: #d29922;
  }

  .alert-card.severity-info {
    border-left-color: #58a6ff;
  }

  .alert-card.acknowledged {
    opacity: 0.7;
  }

  .alert-card.resolved {
    opacity: 0.5;
    background: #161b22;
  }

  .alert-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .severity-badge {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    font-size: 11px;
    font-weight: 600;
  }

  .severity-badge.critical {
    background: rgba(248, 81, 73, 0.2);
    color: #f85149;
  }

  .severity-badge.warning {
    background: rgba(210, 153, 34, 0.2);
    color: #d29922;
  }

  .severity-badge.info {
    background: rgba(88, 166, 255, 0.2);
    color: #58a6ff;
  }

  .alert-type {
    font-size: 12px;
    font-weight: 500;
    color: #c9d1d9;
    text-transform: capitalize;
  }

  .alert-time {
    margin-left: auto;
    font-size: 11px;
    color: #8b949e;
  }

  .alert-message {
    font-size: 13px;
    color: #c9d1d9;
    line-height: 1.4;
    margin-bottom: 8px;
  }

  .alert-details {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 8px;
    font-size: 11px;
  }

  .detail-item {
    background: #161b22;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .detail-key {
    color: #8b949e;
  }

  .detail-value {
    color: #58a6ff;
    font-family: monospace;
  }

  .alert-actions {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }

  .action-btn {
    padding: 4px 10px;
    font-size: 11px;
    border: 1px solid #30363d;
    border-radius: 4px;
    background: #21262d;
    color: #8b949e;
    cursor: pointer;
    transition: all 0.15s;
  }

  .action-btn:hover {
    background: #30363d;
    color: #c9d1d9;
  }

  .action-btn.ack:hover {
    border-color: #58a6ff;
    color: #58a6ff;
  }

  .action-btn.resolve:hover {
    border-color: #3fb950;
    color: #3fb950;
  }

  .action-btn.dismiss:hover {
    border-color: #f85149;
    color: #f85149;
  }

  .alert-status {
    font-size: 11px;
    color: #8b949e;
    margin-top: 8px;
    font-style: italic;
  }

  .resolved-status {
    color: #3fb950;
  }
</style>
