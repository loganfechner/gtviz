<script>
  import { createEventDispatcher } from 'svelte';

  export let rule = null;

  const dispatch = createEventDispatcher();

  // Form state
  let name = rule?.name || '';
  let description = rule?.description || '';
  let cooldown = rule?.cooldown || 60;
  let conditionType = rule?.condition?.type || 'agent_status';

  // Condition-specific fields
  let agentName = rule?.condition?.agent || '*';
  let rigName = rule?.condition?.rig || '*';
  let fromStatus = rule?.condition?.from || '';
  let toStatus = rule?.condition?.to || '';
  let beadId = rule?.condition?.bead || '*';
  let beadStatus = rule?.condition?.status || 'hooked';
  let durationMs = rule?.condition?.durationMs || 30000;
  let metric = rule?.condition?.metric || 'successRate';
  let operator = rule?.condition?.operator || '<';
  let threshold = rule?.condition?.threshold || 90;
  let eventType = rule?.condition?.eventType || '*';
  let pattern = rule?.condition?.pattern || '';
  let errorCount = rule?.condition?.count || 5;
  let windowMs = rule?.condition?.windowMs || 300000;
  let level = rule?.condition?.level || '';
  let priority = rule?.condition?.priority || '';

  // Actions
  let actionToast = rule?.actions?.some(a => a.type === 'toast') ?? true;
  let actionLog = rule?.actions?.some(a => a.type === 'log') ?? true;
  let actionWebhook = rule?.actions?.some(a => a.type === 'webhook') ?? false;
  let webhookUrl = rule?.actions?.find(a => a.type === 'webhook')?.url || '';

  let saving = false;
  let error = null;
  let testResults = null;

  const conditionTypes = [
    { value: 'agent_status', label: 'Agent Status Change' },
    { value: 'bead_status', label: 'Bead Status Change' },
    { value: 'bead_duration', label: 'Bead Duration' },
    { value: 'metric_threshold', label: 'Metric Threshold' },
    { value: 'error_count', label: 'Error Count' },
    { value: 'event_pattern', label: 'Event Pattern' }
  ];

  const agentStatuses = ['running', 'idle', 'stopped', 'error'];
  const beadStatuses = ['open', 'hooked', 'in_progress', 'closed', 'done'];
  const operators = ['<', '<=', '>', '>=', '==', '!='];
  const metrics = [
    { value: 'successRate', label: 'Poll Success Rate (%)' },
    { value: 'avgPollDuration', label: 'Avg Poll Duration (ms)' },
    { value: 'pollDuration', label: 'Last Poll Duration (ms)' },
    { value: 'wsConnections', label: 'WebSocket Connections' },
    { value: 'agentActivity.error', label: 'Agents in Error' },
    { value: 'agentActivity.active', label: 'Active Agents' },
    { value: 'agentActivity.idle', label: 'Idle Agents' }
  ];
  const eventTypes = [
    { value: '*', label: 'Any Event' },
    { value: 'mail', label: 'Mail' },
    { value: 'gt_event', label: 'GT Event' },
    { value: 'feed', label: 'Feed' },
    { value: 'log', label: 'Log' },
    { value: 'bead_status_change', label: 'Bead Status Change' }
  ];

  function buildCondition() {
    switch (conditionType) {
      case 'agent_status':
        return {
          type: 'agent_status',
          agent: agentName,
          rig: rigName,
          from: fromStatus || undefined,
          to: toStatus || undefined
        };
      case 'bead_status':
        return {
          type: 'bead_status',
          bead: beadId,
          rig: rigName,
          from: fromStatus || undefined,
          to: toStatus || undefined,
          priority: priority || undefined
        };
      case 'bead_duration':
        return {
          type: 'bead_duration',
          status: beadStatus,
          durationMs: parseInt(durationMs),
          rig: rigName
        };
      case 'metric_threshold':
        return {
          type: 'metric_threshold',
          metric,
          operator,
          threshold: parseFloat(threshold)
        };
      case 'error_count':
        return {
          type: 'error_count',
          count: parseInt(errorCount),
          windowMs: parseInt(windowMs),
          agent: agentName,
          rig: rigName
        };
      case 'event_pattern':
        return {
          type: 'event_pattern',
          eventType,
          source: rigName,
          pattern: pattern || undefined,
          level: level || undefined
        };
      default:
        return { type: conditionType };
    }
  }

  function buildActions() {
    const actions = [];
    if (actionToast) {
      actions.push({ type: 'toast', duration: 5000 });
    }
    if (actionLog) {
      actions.push({ type: 'log', level: 'warn' });
    }
    if (actionWebhook && webhookUrl) {
      actions.push({ type: 'webhook', url: webhookUrl, method: 'POST' });
    }
    return actions;
  }

  async function handleSave() {
    if (!name.trim()) {
      error = 'Rule name is required';
      return;
    }

    saving = true;
    error = null;

    const ruleData = {
      name: name.trim(),
      description: description.trim() || undefined,
      cooldown: parseInt(cooldown),
      condition: buildCondition(),
      actions: buildActions()
    };

    try {
      const url = rule ? `/api/rules/${rule.id}` : '/api/rules';
      const method = rule ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ruleData)
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save rule');
      }

      dispatch('save');
    } catch (err) {
      error = err.message;
    } finally {
      saving = false;
    }
  }

  async function handleTest() {
    error = null;
    testResults = null;

    const ruleData = {
      condition: buildCondition()
    };

    try {
      const response = await fetch('/api/rules/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ruleData)
      });

      if (response.ok) {
        testResults = await response.json();
      } else {
        const data = await response.json();
        error = data.error || 'Test failed';
      }
    } catch (err) {
      error = err.message;
    }
  }

  function handleCancel() {
    dispatch('cancel');
  }
</script>

<div class="rule-builder">
  <div class="builder-header">
    <h3>{rule ? 'Edit Rule' : 'Create New Rule'}</h3>
    <button class="close-btn" on:click={handleCancel}>&times;</button>
  </div>

  <div class="form-content">
    <div class="form-group">
      <label for="rule-name">Rule Name *</label>
      <input
        id="rule-name"
        type="text"
        bind:value={name}
        placeholder="e.g., Agent Stopped Alert"
      />
    </div>

    <div class="form-group">
      <label for="rule-desc">Description</label>
      <input
        id="rule-desc"
        type="text"
        bind:value={description}
        placeholder="Optional description"
      />
    </div>

    <div class="form-section">
      <h4>Condition</h4>

      <div class="form-group">
        <label for="condition-type">Condition Type</label>
        <select id="condition-type" bind:value={conditionType}>
          {#each conditionTypes as ct}
            <option value={ct.value}>{ct.label}</option>
          {/each}
        </select>
      </div>

      {#if conditionType === 'agent_status'}
        <div class="form-row">
          <div class="form-group">
            <label for="agent-name">Agent</label>
            <input id="agent-name" type="text" bind:value={agentName} placeholder="* for any" />
          </div>
          <div class="form-group">
            <label for="rig-name">Rig</label>
            <input id="rig-name" type="text" bind:value={rigName} placeholder="* for any" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="from-status">From Status</label>
            <select id="from-status" bind:value={fromStatus}>
              <option value="">Any</option>
              {#each agentStatuses as status}
                <option value={status}>{status}</option>
              {/each}
            </select>
          </div>
          <div class="form-group">
            <label for="to-status">To Status</label>
            <select id="to-status" bind:value={toStatus}>
              <option value="">Any</option>
              {#each agentStatuses as status}
                <option value={status}>{status}</option>
              {/each}
            </select>
          </div>
        </div>
      {:else if conditionType === 'bead_status'}
        <div class="form-row">
          <div class="form-group">
            <label for="bead-id">Bead ID</label>
            <input id="bead-id" type="text" bind:value={beadId} placeholder="* for any" />
          </div>
          <div class="form-group">
            <label for="rig-name-bead">Rig</label>
            <input id="rig-name-bead" type="text" bind:value={rigName} placeholder="* for any" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="from-bead-status">From Status</label>
            <select id="from-bead-status" bind:value={fromStatus}>
              <option value="">Any</option>
              {#each beadStatuses as status}
                <option value={status}>{status}</option>
              {/each}
            </select>
          </div>
          <div class="form-group">
            <label for="to-bead-status">To Status</label>
            <select id="to-bead-status" bind:value={toStatus}>
              <option value="">Any</option>
              {#each beadStatuses as status}
                <option value={status}>{status}</option>
              {/each}
            </select>
          </div>
        </div>
      {:else if conditionType === 'bead_duration'}
        <div class="form-row">
          <div class="form-group">
            <label for="bead-status-dur">Status</label>
            <select id="bead-status-dur" bind:value={beadStatus}>
              {#each beadStatuses as status}
                <option value={status}>{status}</option>
              {/each}
            </select>
          </div>
          <div class="form-group">
            <label for="duration">Duration (seconds)</label>
            <input id="duration" type="number" bind:value={durationMs} step="1000" min="1000" />
            <span class="hint">{Math.round(durationMs / 1000)}s</span>
          </div>
        </div>
      {:else if conditionType === 'metric_threshold'}
        <div class="form-group">
          <label for="metric">Metric</label>
          <select id="metric" bind:value={metric}>
            {#each metrics as m}
              <option value={m.value}>{m.label}</option>
            {/each}
          </select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="operator">Operator</label>
            <select id="operator" bind:value={operator}>
              {#each operators as op}
                <option value={op}>{op}</option>
              {/each}
            </select>
          </div>
          <div class="form-group">
            <label for="threshold">Threshold</label>
            <input id="threshold" type="number" bind:value={threshold} />
          </div>
        </div>
      {:else if conditionType === 'error_count'}
        <div class="form-row">
          <div class="form-group">
            <label for="error-count">Error Count</label>
            <input id="error-count" type="number" bind:value={errorCount} min="1" />
          </div>
          <div class="form-group">
            <label for="window">Time Window (minutes)</label>
            <input id="window" type="number" value={windowMs / 60000} on:input={(e) => windowMs = e.target.value * 60000} min="1" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="agent-name-err">Agent</label>
            <input id="agent-name-err" type="text" bind:value={agentName} placeholder="* for any" />
          </div>
          <div class="form-group">
            <label for="rig-name-err">Rig</label>
            <input id="rig-name-err" type="text" bind:value={rigName} placeholder="* for any" />
          </div>
        </div>
      {:else if conditionType === 'event_pattern'}
        <div class="form-row">
          <div class="form-group">
            <label for="event-type">Event Type</label>
            <select id="event-type" bind:value={eventType}>
              {#each eventTypes as et}
                <option value={et.value}>{et.label}</option>
              {/each}
            </select>
          </div>
          <div class="form-group">
            <label for="rig-source">Rig</label>
            <input id="rig-source" type="text" bind:value={rigName} placeholder="* for any" />
          </div>
        </div>
        <div class="form-group">
          <label for="pattern">Pattern (regex)</label>
          <input id="pattern" type="text" bind:value={pattern} placeholder="e.g., error|failed" />
        </div>
        {#if eventType === 'log'}
          <div class="form-group">
            <label for="log-level">Log Level</label>
            <select id="log-level" bind:value={level}>
              <option value="">Any</option>
              <option value="error">Error</option>
              <option value="warn">Warning</option>
              <option value="info">Info</option>
              <option value="debug">Debug</option>
            </select>
          </div>
        {/if}
      {/if}
    </div>

    <div class="form-section">
      <h4>Actions</h4>

      <div class="checkbox-group">
        <label class="checkbox">
          <input type="checkbox" bind:checked={actionToast} />
          <span>Show toast notification</span>
        </label>
        <label class="checkbox">
          <input type="checkbox" bind:checked={actionLog} />
          <span>Log to console</span>
        </label>
        <label class="checkbox">
          <input type="checkbox" bind:checked={actionWebhook} />
          <span>Send webhook</span>
        </label>
      </div>

      {#if actionWebhook}
        <div class="form-group">
          <label for="webhook-url">Webhook URL</label>
          <input id="webhook-url" type="url" bind:value={webhookUrl} placeholder="https://..." />
        </div>
      {/if}
    </div>

    <div class="form-section">
      <h4>Settings</h4>
      <div class="form-group">
        <label for="cooldown">Cooldown (seconds)</label>
        <input id="cooldown" type="number" bind:value={cooldown} min="0" />
        <span class="hint">Minimum time between alerts</span>
      </div>
    </div>

    {#if error}
      <div class="error-message">{error}</div>
    {/if}

    {#if testResults}
      <div class="test-results">
        <h4>Test Results</h4>
        <pre>{JSON.stringify(testResults, null, 2)}</pre>
      </div>
    {/if}
  </div>

  <div class="builder-footer">
    <button class="btn secondary" on:click={handleTest}>
      Test
    </button>
    <div class="footer-right">
      <button class="btn secondary" on:click={handleCancel}>
        Cancel
      </button>
      <button class="btn primary" on:click={handleSave} disabled={saving}>
        {saving ? 'Saving...' : (rule ? 'Update' : 'Create')}
      </button>
    </div>
  </div>
</div>

<style>
  .rule-builder {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: #0d1117;
  }

  .builder-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    border-bottom: 1px solid #30363d;
  }

  .builder-header h3 {
    margin: 0;
    font-size: 14px;
    color: #c9d1d9;
  }

  .close-btn {
    background: none;
    border: none;
    color: #8b949e;
    font-size: 20px;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
  }

  .close-btn:hover {
    color: #c9d1d9;
  }

  .form-content {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
  }

  .form-section {
    margin-bottom: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid #21262d;
  }

  .form-section:last-child {
    border-bottom: none;
  }

  .form-section h4 {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #8b949e;
    margin: 0 0 10px 0;
  }

  .form-group {
    margin-bottom: 10px;
  }

  .form-group label {
    display: block;
    font-size: 11px;
    color: #8b949e;
    margin-bottom: 4px;
  }

  .form-group input,
  .form-group select {
    width: 100%;
    padding: 6px 8px;
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 4px;
    color: #c9d1d9;
    font-size: 12px;
  }

  .form-group input:focus,
  .form-group select:focus {
    outline: none;
    border-color: #58a6ff;
  }

  .form-row {
    display: flex;
    gap: 10px;
  }

  .form-row .form-group {
    flex: 1;
  }

  .hint {
    display: block;
    font-size: 10px;
    color: #6e7681;
    margin-top: 2px;
  }

  .checkbox-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .checkbox {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: #c9d1d9;
    cursor: pointer;
  }

  .checkbox input {
    width: 14px;
    height: 14px;
    accent-color: #238636;
  }

  .error-message {
    padding: 10px;
    background: rgba(248, 81, 73, 0.1);
    border: 1px solid #f85149;
    border-radius: 4px;
    color: #f85149;
    font-size: 12px;
    margin-bottom: 12px;
  }

  .test-results {
    padding: 10px;
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 4px;
    margin-bottom: 12px;
  }

  .test-results h4 {
    font-size: 11px;
    color: #8b949e;
    margin: 0 0 8px 0;
  }

  .test-results pre {
    font-size: 10px;
    color: #c9d1d9;
    margin: 0;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .builder-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    border-top: 1px solid #30363d;
    background: #161b22;
  }

  .footer-right {
    display: flex;
    gap: 8px;
  }

  .btn {
    padding: 6px 14px;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn.primary {
    background: #238636;
    border: none;
    color: #fff;
  }

  .btn.primary:hover:not(:disabled) {
    background: #2ea043;
  }

  .btn.primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn.secondary {
    background: #21262d;
    border: 1px solid #30363d;
    color: #c9d1d9;
  }

  .btn.secondary:hover {
    background: #30363d;
  }
</style>
