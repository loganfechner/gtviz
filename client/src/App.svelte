<script>
  import { onMount, onDestroy } from 'svelte';
  import HookStatusPanel from './components/HookStatusPanel.svelte';
  import AgentCard from './components/AgentCard.svelte';

  let hooks = {};
  let connected = false;
  let ws = null;
  let lastUpdated = null;
  let theme = 'dark';

  function getSystemTheme() {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    return 'dark';
  }

  function initTheme() {
    const stored = localStorage.getItem('gtviz-theme');
    if (stored === 'light' || stored === 'dark') {
      theme = stored;
    } else {
      theme = getSystemTheme();
    }
    applyTheme(theme);
  }

  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
  }

  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('gtviz-theme', theme);
    applyTheme(theme);
  }

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
    initTheme();
    connectWebSocket();

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
    const handleChange = (e) => {
      if (!localStorage.getItem('gtviz-theme')) {
        theme = e.matches ? 'light' : 'dark';
        applyTheme(theme);
      }
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
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
    <button class="theme-toggle" on:click={toggleTheme} title="Toggle theme">
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  </header>

  <div class="layout">
    <div class="main-area">
      <h2>Agents</h2>
      <div class="agent-grid">
        {#each agentList as agent (agent.agent)}
          <AgentCard {agent} />
        {/each}

        {#if agentList.length === 0}
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
  :global(:root) {
    --bg-primary: #1a1a2e;
    --bg-secondary: #16213e;
    --bg-card: #1f2544;
    --border-color: #0f3460;
    --text-primary: #eee;
    --text-secondary: #ccc;
    --text-muted: #888;
    --text-dim: #666;
    --text-faint: #555;
    --accent: #e94560;
    --success: #4ade80;
    --warning: #fbbf24;
    --error: #ef4444;
  }

  :global([data-theme="light"]) {
    --bg-primary: #f5f5f7;
    --bg-secondary: #ffffff;
    --bg-card: #ffffff;
    --border-color: #d1d5db;
    --text-primary: #1f2937;
    --text-secondary: #374151;
    --text-muted: #6b7280;
    --text-dim: #9ca3af;
    --text-faint: #d1d5db;
    --accent: #dc2626;
    --success: #16a34a;
    --warning: #d97706;
    --error: #dc2626;
  }

  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :global(body) {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg-primary);
    color: var(--text-primary);
    min-height: 100vh;
    transition: background-color 0.2s, color 0.2s;
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
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-color);
    transition: background-color 0.2s, border-color 0.2s;
  }

  h1 {
    font-size: 1.5rem;
    color: var(--accent);
    font-weight: 700;
    letter-spacing: 0.05em;
  }

  .status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-left: auto;
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  .indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--text-dim);
  }

  .indicator.connected {
    background: var(--success);
    box-shadow: 0 0 8px var(--success);
  }

  button {
    padding: 0.5rem 1rem;
    background: var(--border-color);
    border: 1px solid var(--accent);
    color: var(--accent);
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
    transition: all 0.2s;
  }

  button:hover:not(:disabled) {
    background: var(--accent);
    color: #fff;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .theme-toggle {
    padding: 0.5rem;
    font-size: 1.25rem;
    line-height: 1;
    background: transparent;
    border: 1px solid var(--border-color);
  }

  .theme-toggle:hover {
    background: var(--border-color);
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
    color: var(--accent);
  }

  .agent-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1rem;
  }

  .sidebar {
    width: 350px;
    background: var(--bg-secondary);
    border-left: 1px solid var(--border-color);
    overflow-y: auto;
    transition: background-color 0.2s, border-color 0.2s;
  }

  .empty {
    color: var(--text-dim);
    font-style: italic;
    padding: 2rem;
    text-align: center;
  }
</style>
