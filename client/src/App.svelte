<script>
  import { onMount, onDestroy } from 'svelte';
  import HookStatusPanel from './components/HookStatusPanel.svelte';
  import AgentCard from './components/AgentCard.svelte';
  import RigCluster from './components/RigCluster.svelte';
  import Breadcrumb from './components/Breadcrumb.svelte';

  // View state: 'overview' or 'rig'
  let currentView = 'overview';
  let selectedRig = null;

  // Data state
  let rigs = {};
  let connected = false;
  let ws = null;
  let lastUpdated = null;

  function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      connected = true;
      console.log('WebSocket connected');
    };

    ws.onclose = () => {
      connected = false;
      console.log('WebSocket disconnected');
      // Reconnect after 3 seconds
      setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleMessage(message);
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    };
  }

  function handleMessage(message) {
    switch (message.type) {
      case 'initial':
        rigs = message.data.rigs || {};
        lastUpdated = message.timestamp;
        break;

      case 'rigs:updated':
        rigs = message.data.rigs || {};
        lastUpdated = message.timestamp;
        break;
    }
  }

  function requestPoll() {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'poll:now' }));
    }
  }

  function handleRigSelect(event) {
    selectedRig = event.detail.rigName;
    currentView = 'rig';
  }

  function handleNavigate(event) {
    if (event.detail.view === 'overview') {
      currentView = 'overview';
      selectedRig = null;
    }
  }

  onMount(() => {
    connectWebSocket();
  });

  onDestroy(() => {
    if (ws) {
      ws.close();
    }
  });

  // Computed values
  $: rigList = Object.values(rigs).sort((a, b) => a.name.localeCompare(b.name));

  $: currentRigData = selectedRig ? rigs[selectedRig] : null;

  $: agentList = currentRigData
    ? Object.values(currentRigData.agents || {}).sort((a, b) => {
        // Sort by role priority: witness, refinery, polecats
        const roleOrder = { witness: 0, refinery: 1, polecat: 2 };
        const orderA = roleOrder[a.role] ?? 3;
        const orderB = roleOrder[b.role] ?? 3;
        if (orderA !== orderB) return orderA - orderB;
        return a.agent.localeCompare(b.agent);
      })
    : [];

  // Get hooks for sidebar - either current rig or all rigs combined
  $: sidebarHooks = currentRigData
    ? currentRigData.agents || {}
    : Object.values(rigs).reduce((acc, rig) => {
        for (const [agentName, agent] of Object.entries(rig.agents || {})) {
          acc[`${rig.name}/${agentName}`] = { ...agent, rig: rig.name };
        }
        return acc;
      }, {});

  // Town-level summary
  $: townSummary = rigList.reduce(
    (acc, rig) => {
      const s = rig.summary || {};
      acc.totalRigs += 1;
      acc.totalAgents += s.total || 0;
      acc.active += s.active || 0;
      acc.hooked += s.hooked || 0;
      acc.idle += s.idle || 0;
      acc.error += s.error || 0;
      return acc;
    },
    { totalRigs: 0, totalAgents: 0, active: 0, hooked: 0, idle: 0, error: 0 }
  );
</script>

<main>
  <header>
    <h1>gtviz</h1>
    {#if currentView === 'rig'}
      <Breadcrumb currentRig={selectedRig} on:navigate={handleNavigate} />
    {/if}
    <div class="status">
      <span class="indicator" class:connected></span>
      {connected ? 'Connected' : 'Disconnected'}
    </div>
    <button on:click={requestPoll} disabled={!connected}>
      Refresh
    </button>
  </header>

  <div class="layout">
    <div class="main-area">
      {#if currentView === 'overview'}
        <!-- Overview Mode: Show all rigs as clusters -->
        <div class="overview-header">
          <h2>Gas Town Overview</h2>
          <div class="town-stats">
            <span class="town-stat">{townSummary.totalRigs} rigs</span>
            <span class="town-stat">{townSummary.totalAgents} agents</span>
            {#if townSummary.active > 0}
              <span class="town-stat active">{townSummary.active} active</span>
            {/if}
          </div>
        </div>

        <div class="rig-grid">
          {#each rigList as rig (rig.name)}
            <RigCluster {rig} on:select={handleRigSelect} />
          {/each}

          {#if rigList.length === 0}
            <p class="empty">No rigs discovered yet...</p>
          {/if}
        </div>
      {:else}
        <!-- Single Rig Mode: Show agents in detail -->
        <h2>{selectedRig}</h2>
        <div class="agent-grid">
          {#each agentList as agent (agent.agent)}
            <AgentCard {agent} />
          {/each}

          {#if agentList.length === 0}
            <p class="empty">No agents in this rig...</p>
          {/if}
        </div>
      {/if}
    </div>

    <aside class="sidebar">
      <HookStatusPanel hooks={sidebarHooks} {lastUpdated} showRig={currentView === 'overview'} />
    </aside>
  </div>
</main>

<style>
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :global(body) {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #1a1a2e;
    color: #eee;
    min-height: 100vh;
  }

  main {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  header {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem 2rem;
    background: #16213e;
    border-bottom: 1px solid #0f3460;
  }

  h1 {
    font-size: 1.5rem;
    color: #e94560;
    font-weight: 700;
    letter-spacing: 0.05em;
  }

  .status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-left: auto;
    font-size: 0.875rem;
    color: #888;
  }

  .indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #666;
  }

  .indicator.connected {
    background: #4ade80;
    box-shadow: 0 0 8px #4ade80;
  }

  button {
    padding: 0.5rem 1rem;
    background: #0f3460;
    border: 1px solid #e94560;
    color: #e94560;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
    transition: all 0.2s;
  }

  button:hover:not(:disabled) {
    background: #e94560;
    color: #fff;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .layout {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .main-area {
    flex: 1;
    padding: 2rem;
    overflow-y: auto;
  }

  .overview-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
  }

  h2 {
    font-size: 1.25rem;
    color: #e94560;
  }

  .town-stats {
    display: flex;
    gap: 1rem;
  }

  .town-stat {
    font-size: 0.875rem;
    color: #888;
    padding: 0.25rem 0.75rem;
    background: #0f3460;
    border-radius: 4px;
  }

  .town-stat.active {
    color: #4ade80;
    background: rgba(74, 222, 128, 0.1);
  }

  .rig-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1.5rem;
  }

  .agent-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1rem;
  }

  .sidebar {
    width: 350px;
    background: #16213e;
    border-left: 1px solid #0f3460;
    overflow-y: auto;
  }

  .empty {
    color: #666;
    font-style: italic;
    padding: 2rem;
    text-align: center;
  }
</style>
