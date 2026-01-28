<script>
  import { onMount } from 'svelte';
  import NetworkGraph from './components/NetworkGraph.svelte';
  import Sidebar from './components/Sidebar.svelte';
  import FilterBar from './components/FilterBar.svelte';
  import { connectWebSocket, state, events, connectionStatus } from './lib/websocket.js';

  let selectedRig = null;

  onMount(() => {
    connectWebSocket((isConnected) => {
      // Status now tracked via connectionStatus store
    });
  });

  $: connected = $connectionStatus.connected;
  $: statusText = connected
    ? 'Live'
    : $connectionStatus.reconnecting
      ? `Reconnecting (${$connectionStatus.attempt})...`
      : 'Connecting...';

  let selectedAgent = null;
  let filters = { search: '', status: 'all', role: 'all' };

  $: rigs = Object.keys($state.rigs || {}).sort();
  $: if (rigs.length && !selectedRig) selectedRig = rigs[0];
  $: currentAgents = selectedRig ? ($state.agents?.[selectedRig] || []) : [];
  $: currentBeads = selectedRig ? ($state.beads?.[selectedRig] || []) : [];
  $: currentHooks = selectedRig ? ($state.hooks?.[selectedRig] || {}) : {};
  $: agentHistory = $state.agentHistory || {};
  $: metrics = $state.metrics || {};

  // Apply filters to agents
  $: filteredAgents = currentAgents.filter(agent => {
    if (filters.search && !agent.name.toLowerCase().includes(filters.search)) return false;
    if (filters.status !== 'all' && agent.status !== filters.status) return false;
    if (filters.role !== 'all' && agent.role !== filters.role) return false;
    return true;
  });

  function handleAgentSelect(agent) {
    selectedAgent = agent;
  }

  function handleFilter(e) {
    filters = e.detail;
  }
</script>

<div class="app">
  <header>
    <h1>gtviz</h1>
    <div class="rig-selector">
      {#each rigs as rig}
        <button
          class:active={selectedRig === rig}
          on:click={() => selectedRig = rig}
        >
          {rig}
        </button>
      {/each}
    </div>
    <div class="status" class:connected>
      {statusText}
    </div>
  </header>

  <FilterBar
    agents={currentAgents}
    {rigs}
    on:filter={handleFilter}
  />

  <main>
    <div class="graph-container">
      <NetworkGraph
        agents={filteredAgents}
        mail={$state.mail || []}
        rig={selectedRig}
        on:select={(e) => handleAgentSelect(e.detail)}
      />
    </div>

    <Sidebar
      beads={currentBeads}
      hooks={currentHooks}
      events={$events}
      rig={selectedRig}
      agents={currentAgents}
      {agentHistory}
      {selectedAgent}
      {metrics}
    />
  </main>
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: #0d1117;
  }

  header {
    display: flex;
    align-items: center;
    padding: 12px 20px;
    background: #161b22;
    border-bottom: 1px solid #30363d;
    gap: 20px;
  }

  h1 {
    font-size: 18px;
    font-weight: 600;
    color: #58a6ff;
    margin: 0;
  }

  .rig-selector {
    display: flex;
    gap: 8px;
  }

  .rig-selector button {
    padding: 6px 12px;
    background: #21262d;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #c9d1d9;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.15s;
  }

  .rig-selector button:hover {
    background: #30363d;
  }

  .rig-selector button.active {
    background: #238636;
    border-color: #238636;
    color: white;
  }

  .status {
    margin-left: auto;
    padding: 4px 10px;
    background: #f8514966;
    border-radius: 12px;
    font-size: 12px;
    color: #f85149;
  }

  .status.connected {
    background: #23863666;
    color: #3fb950;
  }

  main {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .graph-container {
    flex: 1;
    position: relative;
    overflow: hidden;
  }
</style>
