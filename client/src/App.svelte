<script>
  import { onMount, onDestroy } from 'svelte';
  import AgentCard from './components/AgentCard.svelte';

  let agents = [];
  let rig = '';
  let connected = false;
  let lastUpdated = null;
  let ws = null;

  function connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
      connected = true;
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'initial' || data.type === 'update') {
        agents = data.agents || [];
        rig = data.rig || rig;
        lastUpdated = data.timestamp || new Date().toISOString();
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected, reconnecting...');
      connected = false;
      setTimeout(connect, 3000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  onMount(() => {
    connect();
  });

  onDestroy(() => {
    if (ws) ws.close();
  });

  // Sort agents: witness, refinery, mayor first, then polecats, then crew
  $: sortedAgents = agents.sort((a, b) => {
    const order = { witness: 0, refinery: 1, mayor: 2, polecat: 3, crew: 4 };
    const aOrder = order[a.role] ?? 5;
    const bOrder = order[b.role] ?? 5;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.name.localeCompare(b.name);
  });
</script>

<div class="app">
  <header>
    <h1>GTViz</h1>
    <div class="status">
      <span class="rig">{rig || 'Loading...'}</span>
      <span class="connection" class:connected>
        {connected ? 'Connected' : 'Disconnected'}
      </span>
    </div>
  </header>

  <main>
    {#if agents.length === 0}
      <div class="loading">
        <p>Loading agents...</p>
      </div>
    {:else}
      <div class="agent-grid">
        {#each sortedAgents as agent (agent.name)}
          <AgentCard {agent} />
        {/each}
      </div>
    {/if}
  </main>

  <footer>
    <span>Last updated: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : '-'}</span>
    <span>{agents.length} agents</span>
  </footer>
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    padding: 1rem;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    background: #161b22;
    border-radius: 8px;
    margin-bottom: 1rem;
  }

  h1 {
    font-size: 1.5rem;
    font-weight: 600;
    color: #58a6ff;
  }

  .status {
    display: flex;
    gap: 1rem;
    align-items: center;
  }

  .rig {
    font-size: 0.875rem;
    color: #8b949e;
    padding: 0.25rem 0.75rem;
    background: #21262d;
    border-radius: 16px;
  }

  .connection {
    font-size: 0.75rem;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    background: #f8514933;
    color: #f85149;
  }

  .connection.connected {
    background: #23863633;
    color: #3fb950;
  }

  main {
    flex: 1;
  }

  .loading {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 200px;
    color: #8b949e;
  }

  .agent-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 1rem;
  }

  footer {
    display: flex;
    justify-content: space-between;
    padding: 1rem;
    margin-top: 1rem;
    font-size: 0.75rem;
    color: #6e7681;
    border-top: 1px solid #21262d;
  }
</style>
