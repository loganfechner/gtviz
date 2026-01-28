<script>
  import { onMount, onDestroy } from 'svelte';
  import HookStatusPanel from './components/HookStatusPanel.svelte';
  import AgentCard from './components/AgentCard.svelte';
  import RigCluster from './components/RigCluster.svelte';

  let rigs = {};
  let connected = false;
  let ws = null;
  let lastUpdated = null;

  // View state: null = overview, string = selected rig name
  let selectedRig = null;

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
        // Handle both legacy (hooks) and new (rigs) format
        if (message.data.rigs) {
          rigs = message.data.rigs;
        } else if (message.data.hooks) {
          // Legacy format - convert to single rig
          rigs = {
            'default': {
              name: 'default',
              agents: message.data.hooks,
              summary: calculateSummary(message.data.hooks)
            }
          };
        }
        lastUpdated = message.timestamp;
        break;

      case 'rigs:updated':
        rigs = message.data.rigs || {};
        lastUpdated = message.timestamp;
        break;

      case 'hooks:updated':
        // Legacy format - convert to single rig
        rigs = {
          'default': {
            name: 'default',
            agents: message.data.hooks,
            summary: calculateSummary(message.data.hooks)
          }
        };
        lastUpdated = message.timestamp;
        break;
    }
  }

  function calculateSummary(agents) {
    const agentList = Object.values(agents);
    return {
      total: agentList.length,
      active: agentList.filter(a => a.status === 'active').length,
      hooked: agentList.filter(a => a.status === 'hooked').length,
      idle: agentList.filter(a => a.status === 'idle').length,
      error: agentList.filter(a => a.status === 'error').length
    };
  }

  function requestPoll() {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'poll:now' }));
    }
  }

  function selectRig(event) {
    selectedRig = event.detail.rigName;
  }

  function backToOverview() {
    selectedRig = null;
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
  $: currentRig = selectedRig ? rigs[selectedRig] : null;
  $: agentList = currentRig
    ? Object.values(currentRig.agents || {}).sort((a, b) => {
        // Sort by role priority: witness, refinery, polecats
        const roleOrder = { witness: 0, refinery: 1, polecat: 2 };
        const orderA = roleOrder[a.role] ?? 3;
        const orderB = roleOrder[b.role] ?? 3;
        if (orderA !== orderB) return orderA - orderB;
        return a.agent.localeCompare(b.agent);
      })
    : [];

  // For sidebar panel - flatten all agents when in overview, show rig agents when drilled in
  $: allAgents = selectedRig
    ? (currentRig?.agents || {})
    : Object.values(rigs).reduce((acc, rig) => {
        for (const [name, agent] of Object.entries(rig.agents || {})) {
          acc[`${rig.name}/${name}`] = { ...agent, rig: rig.name };
        }
        return acc;
      }, {});

  // Auto-drill if only one rig
  $: if (rigList.length === 1 && !selectedRig) {
    selectedRig = rigList[0].name;
  }
</script>

<main>
  <header>
    <h1>gtviz</h1>

    {#if selectedRig}
      <nav class="breadcrumb">
        <button class="breadcrumb-link" on:click={backToOverview}>All Rigs</button>
        <span class="breadcrumb-sep">/</span>
        <span class="breadcrumb-current">{selectedRig}</span>
      </nav>
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
      {#if selectedRig}
        <!-- Single Rig View -->
        <h2>{selectedRig} Agents</h2>
        <div class="agent-grid">
          {#each agentList as agent (agent.agent)}
            <AgentCard {agent} />
          {/each}

          {#if agentList.length === 0}
            <p class="empty">No agents discovered in this rig...</p>
          {/if}
        </div>
      {:else}
        <!-- Multi-Rig Overview -->
        <h2>Rigs Overview</h2>
        <div class="rig-grid">
          {#each rigList as rig (rig.name)}
            <RigCluster {rig} on:select={selectRig} />
          {/each}

          {#if rigList.length === 0}
            <p class="empty">No rigs discovered yet...</p>
          {/if}
        </div>
      {/if}
    </div>

    <aside class="sidebar">
      <HookStatusPanel hooks={allAgents} {lastUpdated} />
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

  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
  }

  .breadcrumb-link {
    background: none;
    border: none;
    color: #e94560;
    cursor: pointer;
    font-size: inherit;
    font-family: inherit;
    padding: 0;
  }

  .breadcrumb-link:hover {
    text-decoration: underline;
  }

  .breadcrumb-sep {
    color: #666;
  }

  .breadcrumb-current {
    color: #888;
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

  h2 {
    font-size: 1.25rem;
    margin-bottom: 1rem;
    color: #e94560;
  }

  .agent-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1rem;
  }

  .rig-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1.5rem;
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
