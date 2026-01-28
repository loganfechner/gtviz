<script>
  import { onMount } from 'svelte';
  import NetworkGraph from './components/NetworkGraph.svelte';
  import Sidebar from './components/Sidebar.svelte';
  import FilterBar from './components/FilterBar.svelte';
  import Toast from './components/Toast.svelte';
  import MailModal from './components/MailModal.svelte';
  import EventDetailModal from './components/EventDetailModal.svelte';
  import AgentPeekModal from './components/AgentPeekModal.svelte';
  import Spinner from './components/Spinner.svelte';
  import { connectWebSocket, state, events, errors, errorPatterns, connectionStatus, isStale, presence } from './lib/websocket.js';
  import PresencePanel from './components/PresencePanel.svelte';

  let selectedRig = null;
  let selectedMail = null;
  let selectedEvent = null;
  let showPresencePanel = false;
  let peekAgent = null;

  onMount(() => {
    connectWebSocket((isConnected) => {
      // Status now tracked via connectionStatus store
    });

    // Keyboard shortcuts
    function handleClickOutside(e) {
      // Close presence panel if clicking outside of it
      if (showPresencePanel) {
        const presenceWrapper = document.querySelector('.presence-indicator-wrapper');
        if (presenceWrapper && !presenceWrapper.contains(e.target)) {
          showPresencePanel = false;
        }
      }
    }

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
    window.addEventListener('click', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('click', handleClickOutside);
    };
  });

  $: connected = $connectionStatus.connected;
  $: hasInitialData = $connectionStatus.hasInitialData;
  $: reconnecting = $connectionStatus.reconnecting;
  $: statusText = connected
    ? ($isStale ? 'Stale' : 'Live')
    : reconnecting
      ? `Reconnecting (${$connectionStatus.attempt})...`
      : 'Connecting...';

  $: errorCount = $errors.filter(e => e.severity === 'error').length;
  $: warningCount = $errors.filter(e => e.severity === 'warning').length;

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
  $: alerts = $state.alerts || [];

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

  function handlePresenceNavigate(e) {
    const { rig, agent } = e.detail;
    if (rig) selectedRig = rig;
    if (agent) {
      // Find agent in the rig
      const agents = $state.agents?.[rig] || [];
      const found = agents.find(a => a.name === agent);
      if (found) selectedAgent = found;
    }
  }

  function handleAgentPeek(agent) {
    peekAgent = agent;
  }

  function closePeekModal() {
    peekAgent = null;
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
    {#if errorCount > 0 || warningCount > 0}
      <div class="error-indicator" class:has-errors={errorCount > 0}>
        {#if errorCount > 0}
          <span class="error-count">{errorCount} error{errorCount !== 1 ? 's' : ''}</span>
        {/if}
        {#if warningCount > 0}
          <span class="warning-count">{warningCount} warning{warningCount !== 1 ? 's' : ''}</span>
        {/if}
      </div>
    {/if}
    <div class="presence-indicator-wrapper">
      <button
        class="presence-indicator"
        on:click={() => showPresencePanel = !showPresencePanel}
        class:active={showPresencePanel}
      >
        <span class="presence-dot"></span>
        {$presence.users.length} online
      </button>
      {#if showPresencePanel}
        <div class="presence-dropdown">
          <PresencePanel
            currentRig={selectedRig}
            currentAgent={selectedAgent}
            on:navigate={handlePresenceNavigate}
          />
        </div>
      {/if}
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
        on:peek={(e) => handleAgentPeek(e.detail)}
      />
    </div>

    <Sidebar
      beads={currentBeads}
      hooks={currentHooks}
      events={$events}
      errors={$errors}
      mail={$state.mail || []}
      errorPatterns={$errorPatterns}
      rig={selectedRig}
      agents={currentAgents}
      {agentHistory}
      beadHistory={$state.beadHistory || {}}
      {selectedAgent}
      {metrics}
      {logs}
      {agentStats}
      {alerts}
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
  <AgentPeekModal
    agent={peekAgent}
    rig={selectedRig}
    on:close={closePeekModal}
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

  .error-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
    padding: 4px 10px;
    background: #f0883e33;
    border-radius: 12px;
    font-size: 12px;
  }

  .error-indicator.has-errors {
    background: #f8514933;
  }

  .error-indicator .error-count {
    color: #f85149;
    font-weight: 500;
  }

  .error-indicator .warning-count {
    color: #f0883e;
    font-weight: 500;
  }

  .status {
    margin-left: 12px;
    padding: 4px 10px;
    background: #f8514966;
    border-radius: 12px;
    font-size: 12px;
    color: #f85149;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .error-indicator + .status {
    margin-left: 12px;
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

  .presence-indicator-wrapper {
    position: relative;
    margin-left: auto;
  }

  .presence-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: #21262d;
    border: 1px solid #30363d;
    border-radius: 12px;
    font-size: 12px;
    color: #8b949e;
    cursor: pointer;
    transition: all 0.15s;
  }

  .presence-indicator:hover {
    background: #30363d;
    color: #c9d1d9;
  }

  .presence-indicator.active {
    background: #30363d;
    border-color: #58a6ff;
    color: #c9d1d9;
  }

  .presence-dot {
    width: 8px;
    height: 8px;
    background: #3fb950;
    border-radius: 50%;
  }

  .presence-dropdown {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    width: 280px;
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    z-index: 100;
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
