<script>
  import { onMount, onDestroy } from 'svelte';
  import HookStatusPanel from './components/HookStatusPanel.svelte';
  import AgentCard from './components/AgentCard.svelte';
  import NetworkGraph from './components/NetworkGraph.svelte';

  let hooks = {};
  let connected = false;
  let ws = null;
  let lastUpdated = null;
  let transfers = []; // Track MQ submissions for animation
  let transferCounter = 0;

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
        // Detect MQ submissions: polecat goes from active/hooked to idle
        if (message.data.changes) {
          detectMQSubmissions(message.data.changes);
        }
        hooks = message.data.hooks || {};
        lastUpdated = message.timestamp;
        break;
    }
  }

  function detectMQSubmissions(changes) {
    const refinery = Object.values(hooks).find(h => h.role === 'refinery');
    if (!refinery) return;

    for (const change of changes) {
      const wasWorking = change.previous &&
        (change.previous.status === 'active' || change.previous.status === 'hooked') &&
        change.previous.beadId;

      const isNowIdle = change.current.status === 'idle' || !change.current.beadId;

      const isPolecat = change.current.role === 'polecat';

      // Polecat finished work -> trigger MQ submission animation
      if (isPolecat && wasWorking && isNowIdle) {
        triggerTransferAnimation(change.agent, refinery.agent, change.previous.beadId);
      }
    }
  }

  function triggerTransferAnimation(from, to, beadId) {
    transferCounter++;
    const transfer = {
      id: `transfer-${transferCounter}`,
      from,
      to,
      beadId,
      timestamp: Date.now()
    };
    transfers = [...transfers, transfer];

    // Clean up old transfers after animation
    setTimeout(() => {
      transfers = transfers.filter(t => t.id !== transfer.id);
    }, 3000);
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
  </header>

  <div class="layout">
    <div class="main-area">
      <section class="network-section">
        <h2>Network</h2>
        <div class="network-container">
          <NetworkGraph {hooks} {transfers} />
        </div>
        {#if transfers.length > 0}
          <div class="transfer-indicator">
            <span class="transfer-icon">📦</span>
            <span>MQ submission in progress...</span>
          </div>
        {/if}
      </section>

      <section class="agents-section">
        <h2>Agents</h2>
        <div class="agent-grid">
          {#each agentList as agent (agent.agent)}
            <AgentCard {agent} />
          {/each}

          {#if agentList.length === 0}
            <p class="empty">No agents discovered yet...</p>
          {/if}
        </div>
      </section>
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

  .network-section {
    margin-bottom: 2rem;
  }

  .network-container {
    height: 350px;
    margin-bottom: 0.5rem;
  }

  .transfer-indicator {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid #10b981;
    border-radius: 4px;
    color: #10b981;
    font-size: 0.875rem;
    animation: fadeIn 0.3s ease-in-out;
  }

  .transfer-icon {
    animation: bounce 1s infinite;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes bounce {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-4px); }
  }

  .agents-section h2 {
    margin-top: 0;
  }
</style>
