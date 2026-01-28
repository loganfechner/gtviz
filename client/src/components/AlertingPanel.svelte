<script>
  import { onMount } from 'svelte';
  import { alerts, rules, fetchRules, fetchAlerts } from '../lib/websocket.js';
  import SkeletonRow from './SkeletonRow.svelte';
  import RuleBuilder from './RuleBuilder.svelte';

  export let loading = false;

  let showRuleBuilder = false;
  let editingRule = null;
  let activeSubTab = 'rules';

  onMount(async () => {
    await Promise.all([fetchRules(), fetchAlerts()]);
  });

  async function handleToggleRule(rule) {
    try {
      const response = await fetch(`/api/rules/${rule.id}/toggle`, {
        method: 'POST'
      });
      if (response.ok) {
        await fetchRules();
      }
    } catch (err) {
      console.error('Failed to toggle rule:', err);
    }
  }

  async function handleDeleteRule(rule) {
    if (!confirm(`Delete rule "${rule.name}"?`)) return;

    try {
      const response = await fetch(`/api/rules/${rule.id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        await fetchRules();
      }
    } catch (err) {
      console.error('Failed to delete rule:', err);
    }
  }

  function handleEditRule(rule) {
    editingRule = rule;
    showRuleBuilder = true;
  }

  function handleCreateRule() {
    editingRule = null;
    showRuleBuilder = true;
  }

  async function handleRuleSaved() {
    showRuleBuilder = false;
    editingRule = null;
    await fetchRules();
  }

  function handleRuleCancel() {
    showRuleBuilder = false;
    editingRule = null;
  }

  function formatTime(timestamp) {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    return d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function formatCondition(condition) {
    switch (condition.type) {
      case 'agent_status':
        return `Agent ${condition.agent || '*'} → ${condition.to || '*'}`;
      case 'bead_status':
        return `Bead → ${condition.to || '*'}`;
      case 'metric_threshold':
        return `${condition.metric} ${condition.operator} ${condition.threshold}`;
      case 'error_count':
        return `${condition.count}+ errors in ${Math.round(condition.windowMs / 60000)}m`;
      case 'bead_duration':
        return `Bead ${condition.status} > ${Math.round(condition.durationMs / 1000)}s`;
      case 'event_pattern':
        return `Event: ${condition.pattern || condition.eventType || '*'}`;
      default:
        return condition.type;
    }
  }

  function getAlertColor(context) {
    switch (context.type) {
      case 'error_count':
      case 'metric_threshold':
        return '#f85149';
      case 'agent_status':
        return '#f0883e';
      case 'bead_status':
      case 'bead_duration':
        return '#a371f7';
      default:
        return '#58a6ff';
    }
  }

  function getAlertIcon(context) {
    switch (context.type) {
      case 'error_count':
        return '\u26A0'; // Warning
      case 'metric_threshold':
        return '\u26A1'; // Lightning
      case 'agent_status':
        return '\u2699'; // Gear
      case 'bead_status':
      case 'bead_duration':
        return '\u25CF'; // Circle
      default:
        return '\u2022'; // Bullet
    }
  }

  function formatAlertMessage(alert) {
    const { context } = alert;
    switch (context.type) {
      case 'agent_status':
        return `${context.agent} changed to ${context.to}`;
      case 'bead_status':
        return `Bead ${context.beadId} → ${context.to}`;
      case 'metric_threshold':
        return `${context.metric}: ${context.value} ${context.operator} ${context.threshold}`;
      case 'error_count':
        return `${context.count} errors in window`;
      case 'bead_duration':
        return `Bead ${context.beadId} in ${context.status} for ${Math.round(context.duration / 1000)}s`;
      default:
        return alert.ruleName;
    }
  }
</script>

{#if showRuleBuilder}
  <RuleBuilder
    rule={editingRule}
    on:save={handleRuleSaved}
    on:cancel={handleRuleCancel}
  />
{:else}
  <div class="alerting-panel">
    <div class="header">
      <h3>Alerting</h3>
      <button class="add-btn" on:click={handleCreateRule} title="Create new rule">
        + New Rule
      </button>
    </div>

    <nav class="sub-tabs">
      <button class:active={activeSubTab === 'rules'} on:click={() => activeSubTab = 'rules'}>
        Rules ({$rules.length})
      </button>
      <button class:active={activeSubTab === 'history'} on:click={() => activeSubTab = 'history'}>
        History ({$alerts.length})
      </button>
    </nav>

    {#if activeSubTab === 'rules'}
      {#if loading}
        <div class="rules-list">
          {#each Array(3) as _}
            <SkeletonRow variant="event" />
          {/each}
        </div>
      {:else if $rules.length === 0}
        <div class="empty">
          <p>No alert rules configured</p>
          <button class="create-first-btn" on:click={handleCreateRule}>
            Create your first rule
          </button>
        </div>
      {:else}
        <div class="rules-list">
          {#each $rules as rule}
            <div class="rule-card" class:disabled={!rule.enabled}>
              <div class="rule-header">
                <label class="toggle">
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    on:change={() => handleToggleRule(rule)}
                  />
                  <span class="toggle-slider"></span>
                </label>
                <span class="rule-name">{rule.name}</span>
              </div>
              <div class="rule-condition">
                {formatCondition(rule.condition)}
              </div>
              {#if rule.description}
                <div class="rule-description">{rule.description}</div>
              {/if}
              <div class="rule-actions">
                <button class="action-btn" on:click={() => handleEditRule(rule)}>
                  Edit
                </button>
                <button class="action-btn delete" on:click={() => handleDeleteRule(rule)}>
                  Delete
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {:else if activeSubTab === 'history'}
      {#if $alerts.length === 0}
        <p class="empty">No alerts triggered yet</p>
      {:else}
        <div class="alerts-list">
          {#each $alerts as alert}
            <div class="alert-item">
              <span class="alert-icon" style="color: {getAlertColor(alert.context)}">
                {getAlertIcon(alert.context)}
              </span>
              <div class="alert-content">
                <div class="alert-header">
                  <span class="alert-rule">{alert.ruleName}</span>
                  <span class="alert-time">{formatTime(alert.timestamp)}</span>
                </div>
                <div class="alert-message">
                  {formatAlertMessage(alert)}
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .alerting-panel {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .header h3 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #8b949e;
    margin: 0;
  }

  .add-btn {
    padding: 4px 10px;
    background: #238636;
    border: none;
    border-radius: 4px;
    color: #fff;
    font-size: 11px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .add-btn:hover {
    background: #2ea043;
  }

  .sub-tabs {
    display: flex;
    gap: 4px;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid #30363d;
  }

  .sub-tabs button {
    flex: 1;
    padding: 6px 8px;
    background: none;
    border: 1px solid transparent;
    border-radius: 4px;
    color: #8b949e;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .sub-tabs button:hover {
    color: #c9d1d9;
    background: #21262d;
  }

  .sub-tabs button.active {
    color: #c9d1d9;
    background: #21262d;
    border-color: #30363d;
  }

  .empty {
    color: #6e7681;
    font-size: 13px;
    text-align: center;
    padding: 30px 20px;
  }

  .empty p {
    margin-bottom: 16px;
  }

  .create-first-btn {
    padding: 8px 16px;
    background: #21262d;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #58a6ff;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .create-first-btn:hover {
    background: #30363d;
    border-color: #58a6ff;
  }

  .rules-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .rule-card {
    padding: 12px;
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    transition: opacity 0.15s;
  }

  .rule-card.disabled {
    opacity: 0.5;
  }

  .rule-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 6px;
  }

  .toggle {
    position: relative;
    display: inline-block;
    width: 32px;
    height: 18px;
    flex-shrink: 0;
  }

  .toggle input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle-slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #30363d;
    transition: 0.2s;
    border-radius: 18px;
  }

  .toggle-slider:before {
    position: absolute;
    content: "";
    height: 12px;
    width: 12px;
    left: 3px;
    bottom: 3px;
    background-color: #8b949e;
    transition: 0.2s;
    border-radius: 50%;
  }

  .toggle input:checked + .toggle-slider {
    background-color: #238636;
  }

  .toggle input:checked + .toggle-slider:before {
    transform: translateX(14px);
    background-color: #fff;
  }

  .rule-name {
    font-size: 13px;
    font-weight: 500;
    color: #c9d1d9;
  }

  .rule-condition {
    font-size: 11px;
    font-family: monospace;
    color: #58a6ff;
    background: #21262d;
    padding: 4px 8px;
    border-radius: 4px;
    margin-bottom: 6px;
    display: inline-block;
  }

  .rule-description {
    font-size: 11px;
    color: #8b949e;
    margin-bottom: 8px;
  }

  .rule-actions {
    display: flex;
    gap: 8px;
  }

  .action-btn {
    padding: 4px 8px;
    background: none;
    border: 1px solid #30363d;
    border-radius: 4px;
    color: #8b949e;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .action-btn:hover {
    background: #21262d;
    color: #c9d1d9;
  }

  .action-btn.delete:hover {
    border-color: #f85149;
    color: #f85149;
  }

  .alerts-list {
    flex: 1;
    overflow-y: auto;
  }

  .alert-item {
    display: flex;
    gap: 10px;
    padding: 10px 0;
    border-bottom: 1px solid #21262d;
  }

  .alert-item:last-child {
    border-bottom: none;
  }

  .alert-icon {
    font-size: 14px;
    width: 20px;
    text-align: center;
    flex-shrink: 0;
  }

  .alert-content {
    flex: 1;
    min-width: 0;
  }

  .alert-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2px;
  }

  .alert-rule {
    font-size: 12px;
    font-weight: 500;
    color: #c9d1d9;
  }

  .alert-time {
    font-size: 10px;
    color: #6e7681;
    font-family: monospace;
  }

  .alert-message {
    font-size: 11px;
    color: #8b949e;
  }
</style>
