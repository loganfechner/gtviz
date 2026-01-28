<script>
  import { onMount, onDestroy } from 'svelte';
  import { fade, scale, fly } from 'svelte/transition';
  import { elasticOut, cubicOut } from 'svelte/easing';
  import HookStatusPanel from './components/HookStatusPanel.svelte';
  import AgentCard from './components/AgentCard.svelte';
  import PolecatSpawnEffect from './components/PolecatSpawnEffect.svelte';

  let hooks = {};
  let connected = false;
  let ws = null;
  let lastUpdated = null;

  // Track newly spawned polecats for special effect
  let spawningPolecats = new Set();
  // Track agents being removed for death animation
  let dyingAgents = new Map(); // agentName -> agent data
  let previousAgentNames = new Set();

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
        handleHooksUpdate(message.data.hooks || {}, true);
        lastUpdated = message.timestamp;
        break;

      case 'hooks:updated':
        handleHooksUpdate(message.data.hooks || {}, false);
        lastUpdated = message.timestamp;
        break;
    }
  }

  function handleHooksUpdate(newHooks, isInitial) {
    const newAgentNames = new Set(Object.keys(newHooks));

    // Detect newly added agents
    if (!isInitial) {
      for (const agentName of newAgentNames) {
        if (!previousAgentNames.has(agentName)) {
          const agent = newHooks[agentName];
          // Trigger polecat spawn effect
          if (agent.role === 'polecat') {
            spawningPolecats.add(agentName);
            spawningPolecats = spawningPolecats; // Trigger reactivity
            // Clear spawn effect after animation completes
            setTimeout(() => {
              spawningPolecats.delete(agentName);
              spawningPolecats = spawningPolecats;
            }, 1200);
          }
        }
      }

      // Detect removed agents - trigger death animation
      for (const agentName of previousAgentNames) {
        if (!newAgentNames.has(agentName)) {
          const agent = hooks[agentName];
          if (agent) {
            dyingAgents.set(agentName, { ...agent, dying: true });
            dyingAgents = dyingAgents; // Trigger reactivity
            // Remove after death animation completes
            setTimeout(() => {
              dyingAgents.delete(agentName);
              dyingAgents = dyingAgents;
            }, 600);
          }
        }
      }
    }

    previousAgentNames = newAgentNames;
    hooks = newHooks;
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

  // Combine live agents with dying agents for display
  $: displayAgents = [
    ...agentList.map(a => ({ ...a, dying: false, spawning: spawningPolecats.has(a.agent) })),
    ...Array.from(dyingAgents.values())
  ];

  // Custom transition for agent spawn
  function spawnIn(node, { duration = 400, delay = 0, isPolecat = false }) {
    if (isPolecat) {
      // Polecats get a more dramatic entrance
      return {
        delay,
        duration: 600,
        css: (t) => {
          const eased = elasticOut(t);
          return `
            opacity: ${t};
            transform: scale(${0.3 + eased * 0.7}) rotate(${(1 - t) * 10}deg);
            filter: brightness(${1 + (1 - t) * 0.5});
          `;
        }
      };
    }
    // Standard agents get fade + scale
    return {
      delay,
      duration,
      css: (t) => {
        const eased = cubicOut(t);
        return `
          opacity: ${t};
          transform: scale(${0.8 + eased * 0.2});
        `;
      }
    };
  }

  // Death animation
  function deathOut(node, { duration = 500 }) {
    return {
      duration,
      css: (t) => `
        opacity: ${t};
        transform: scale(${0.8 + t * 0.2}) translateY(${(1 - t) * 20}px);
        filter: grayscale(${(1 - t) * 100}%) brightness(${0.5 + t * 0.5});
      `
    };
  }
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
      <h2>Agents</h2>
      <div class="agent-grid">
        {#each displayAgents as agent (agent.agent)}
          <div
            class="agent-wrapper"
            class:spawning={agent.spawning}
            in:spawnIn={{ isPolecat: agent.role === 'polecat' }}
            out:deathOut
          >
            <AgentCard {agent} />
            {#if agent.spawning && agent.role === 'polecat'}
              <PolecatSpawnEffect />
            {/if}
          </div>
        {/each}

        {#if displayAgents.length === 0}
          <p class="empty">No agents discovered yet...</p>
        {/if}
      </div>
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

  .agent-wrapper {
    position: relative;
  }

  .agent-wrapper.spawning {
    z-index: 10;
  }
</style>
