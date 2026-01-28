<script>
  import { createEventDispatcher } from 'svelte';
  import BeadsList from './BeadsList.svelte';
  import EventLog from './EventLog.svelte';
  import HookStatus from './HookStatus.svelte';
  import AgentTimeline from './AgentTimeline.svelte';
  import MetricsDashboard from './MetricsDashboard.svelte';
  import AgentInsightsPanel from './AgentInsightsPanel.svelte';
  import ErrorPanel from './ErrorPanel.svelte';

  export let beads = [];
  export let hooks = {};
  export let events = [];
  export let errors = [];
  export let rig = null;
  export let agents = [];
  export let agentHistory = {};
  export let selectedAgent = null;
  export let metrics = {};
  export let hasInitialData = false;
  export let logs = [];
  export let agentStats = {};

  $: errorCount = errors.filter(e => e.severity === 'error').length;
  $: warningCount = errors.filter(e => e.severity === 'warning').length;
  $: hasActiveErrors = errorCount > 0 || warningCount > 0;

  const dispatch = createEventDispatcher();

  let activeTab = 'events';

  $: currentAgentHistory = selectedAgent
    ? (agentHistory[`${rig}/${selectedAgent.name}`] || [])
    : [];

  function handleMailClick(e) {
    dispatch('mailclick', e.detail);
  }

  function handleEventClick(e) {
    dispatch('eventclick', e.detail);
  }
</script>

<aside class="sidebar">
  <nav class="tabs">
    <button class:active={activeTab === 'events'} on:click={() => activeTab = 'events'}>
      Events
    </button>
    <button class:active={activeTab === 'beads'} on:click={() => activeTab = 'beads'}>
      Beads
    </button>
    <button class:active={activeTab === 'hooks'} on:click={() => activeTab = 'hooks'}>
      Hooks
    </button>
    <button class:active={activeTab === 'timeline'} on:click={() => activeTab = 'timeline'}>
      Timeline
    </button>
    <button class:active={activeTab === 'insights'} on:click={() => activeTab = 'insights'}>
      Insights
    </button>
    <button class:active={activeTab === 'metrics'} on:click={() => activeTab = 'metrics'}>
      Metrics
    </button>
    <button class:active={activeTab === 'errors'} class:has-errors={hasActiveErrors} on:click={() => activeTab = 'errors'}>
      Errors
      {#if errorCount > 0}
        <span class="error-badge">{errorCount}</span>
      {:else if warningCount > 0}
        <span class="warning-badge">{warningCount}</span>
      {/if}
    </button>
  </nav>

  <div class="content">
    {#if activeTab === 'events'}
      <EventLog {events} {rig} on:mailclick={handleMailClick} on:eventclick={handleEventClick} loading={!hasInitialData} />
    {:else if activeTab === 'beads'}
      <BeadsList {beads} loading={!hasInitialData} />
    {:else if activeTab === 'hooks'}
      <HookStatus {hooks} loading={!hasInitialData} />
    {:else if activeTab === 'timeline'}
      <AgentTimeline agent={selectedAgent} history={currentAgentHistory} loading={!hasInitialData} />
    {:else if activeTab === 'insights'}
      <AgentInsightsPanel {logs} {agentStats} {selectedAgent} {rig} loading={!hasInitialData} />
    {:else if activeTab === 'metrics'}
      <MetricsDashboard {metrics} loading={!hasInitialData} />
    {:else if activeTab === 'errors'}
      <ErrorPanel {errors} loading={!hasInitialData} />
    {/if}
  </div>
</aside>

<style>
  .sidebar {
    width: 320px;
    background: #161b22;
    border-left: 1px solid #30363d;
    display: flex;
    flex-direction: column;
  }

  .tabs {
    display: flex;
    border-bottom: 1px solid #30363d;
    padding: 0 8px;
  }

  .tabs button {
    flex: 1;
    padding: 12px 8px;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: #8b949e;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .tabs button:hover {
    color: #c9d1d9;
  }

  .tabs button.active {
    color: #58a6ff;
    border-bottom-color: #58a6ff;
  }

  .tabs button.has-errors {
    color: #f85149;
  }

  .tabs button.has-errors.active {
    border-bottom-color: #f85149;
  }

  .error-badge, .warning-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 8px;
    font-size: 10px;
    font-weight: 600;
    margin-left: 4px;
  }

  .error-badge {
    background: #f85149;
    color: white;
  }

  .warning-badge {
    background: #f0883e;
    color: white;
  }

  .content {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
  }
</style>
