<script>
  import { onMount, onDestroy } from 'svelte';
  import HookStatusPanel from './components/HookStatusPanel.svelte';
  import AgentCard from './components/AgentCard.svelte';
  import NetworkGraph from './components/NetworkGraph.svelte';

  let hooks = {};
  let connected = false;
  let ws = null;
  let lastUpdated = null;
  let viewMode = 'graph'; // 'graph' or 'grid'

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
        hooks = message.data.hooks || {};
        lastUpdated = message.timestamp;
        break;

      case 'hooks:updated':
        hooks = message.data.hooks || {};
        lastUpdated = message.timestamp;
        break;
    }
  }

  function requestPoll() {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'poll:now' }));
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

  $: agentList = Object.values(hooks).sort((a, b) => {
    // Sort by role priority: witness, refinery, polecats
    const roleOrder = { witness: 0, refinery: 1, polecat: 2 };
    const orderA = roleOrder[a.role] ?? 3;
    const orderB = roleOrder[b.role] ?? 3;
    if (orderA !== orderB) return orderA - orderB;
    return a.agent.localeCompare(b.agent);
  });
</script>

<main>
  <header>
    <h1>gtviz</h1>
    <div class="status">
      <span class="indicator" class:connected></span>
      {connected ? 'Connected' : 'Disconnected'}
    </div>
    <button on:click={requestPoll} disabled={!connected}>
      Refresh
    </button>
    <div class="view-toggle">
      <button
        class:active={viewMode === 'graph'}
        on:click={() => viewMode = 'graph'}
      >
        Graph
      </button>
      <button
        class:active={viewMode === 'grid'}
        on:click={() => viewMode = 'grid'}
      >
        Grid
      </button>
    </div>
  </header>

  <div class="layout">
    <div class="main-area">
      {#if viewMode === 'graph'}
        <div class="graph-container">
          <NetworkGraph agents={agentList} />
        </div>
        {#if agentList.length === 0}
          <p class="empty overlay">No agents discovered yet...</p>
        {/if}
      {:else}
        <h2>Agents</h2>
        <div class="agent-grid">
          {#each agentList as agent (agent.agent)}
            <AgentCard {agent} />
          {/each}

          {#if agentList.length === 0}
            <p class="empty">No agents discovered yet...</p>
          {/if}
        </div>
      {/if}
    </div>

    <aside class="sidebar">
      <HookStatusPanel {hooks} {lastUpdated} />
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
    position: relative;
  }

  .main-area:has(.graph-container) {
    padding: 1rem;
    overflow: hidden;
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

  .empty.overlay {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }

  .view-toggle {
    display: flex;
    gap: 0;
    margin-left: 1rem;
  }

  .view-toggle button {
    border-radius: 0;
    border-right: none;
  }

  .view-toggle button:first-child {
    border-radius: 4px 0 0 4px;
  }

  .view-toggle button:last-child {
    border-radius: 0 4px 4px 0;
    border-right: 1px solid #e94560;
  }

  .view-toggle button.active {
    background: #e94560;
    color: #fff;
  }

  .graph-container {
    height: calc(100vh - 120px);
    position: relative;
  }
</style>
