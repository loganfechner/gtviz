<script>
  import { onMount } from 'svelte';
  import NetworkGraph from './components/NetworkGraph.svelte';
  import Sidebar from './components/Sidebar.svelte';
  import FilterBar from './components/FilterBar.svelte';
  import Toast from './components/Toast.svelte';
  import MailModal from './components/MailModal.svelte';
  import EventDetailModal from './components/EventDetailModal.svelte';
  import Spinner from './components/Spinner.svelte';
  import { connectWebSocket, state, events, connectionStatus, isStale } from './lib/websocket.js';

  let selectedRig = null;
  let selectedMail = null;
  let selectedEvent = null;

  onMount(() => {
    connectWebSocket((isConnected) => {
      // Status now tracked via connectionStatus store
    });

    // Keyboard shortcuts
    function handleKeydown(e) {
      // Ignore if typing in input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      // Number keys 1-9 for rig selection
      if (e.key >= '1' && e.key <= '9') {
        const index = parseInt(e.key) - 1;
        if (index < rigs.length) {
          selectedRig = rigs[index];
        }
        return;
      }

      // Escape to clear selection
      if (e.key === 'Escape') {
        selectedAgent = null;
        return;
      }

      // Ctrl/Cmd + F to focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        const searchInput = document.querySelector('.filter-bar input');
        if (searchInput) searchInput.focus();
        return;
      }

      // Arrow keys for agent navigation
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (!filteredAgents.length) return;
        const currentIndex = selectedAgent
          ? filteredAgents.findIndex(a => a.name === selectedAgent.name)
          : -1;
        const nextIndex = e.key === 'ArrowRight'
          ? Math.min(currentIndex + 1, filteredAgents.length - 1)
          : Math.max(currentIndex - 1, 0);
        selectedAgent = filteredAgents[nextIndex];
      }
    }

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });

  $: connected = $connectionStatus.connected;
  $: hasInitialData = $connectionStatus.hasInitialData;
  $: reconnecting = $connectionStatus.reconnecting;
  $: statusText = connected
    ? ($isStale ? 'Stale' : 'Live')
    : reconnecting
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
  $: logs = $state.logs || [];
  $: agentStats = $state.agentStats || {};

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

  function handleMailClick(e) {
    selectedMail = e.detail;
  }

  function closeMailModal() {
    selectedMail = null;
  }

  function handleEventClick(e) {
    selectedEvent = e.detail;
  }

  function closeEventModal() {
    selectedEvent = null;
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
    <div class="status" class:connected class:stale={$isStale} class:reconnecting>
      {#if reconnecting || !connected}
        <Spinner size={12} />
      {/if}
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
      {logs}
      {agentStats}
      on:mailclick={handleMailClick}
      on:eventclick={handleEventClick}
      {hasInitialData}
    />
  </main>

  <MailModal
    mail={selectedMail}
    allMail={$state.mail || []}
    on:close={closeMailModal}
  />
  <EventDetailModal
    event={selectedEvent}
    on:close={closeEventModal}
  />
  <Toast />
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
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .status.connected {
    background: #23863666;
    color: #3fb950;
  }

  .status.stale {
    background: #f0883e44;
    color: #f0883e;
  }

  .status.reconnecting {
    background: #58a6ff33;
    color: #58a6ff;
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
