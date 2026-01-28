<script>
  import { onMount, onDestroy } from 'svelte';
  import HookStatusPanel from './components/HookStatusPanel.svelte';
  import AgentCard from './components/AgentCard.svelte';
  import Timeline from './components/Timeline.svelte';

  let hooks = {};
  let connected = false;
  let ws = null;
  let lastUpdated = null;

  // Timeline state
  let timelineEvents = [];
  let timelineStart = null;
  let timelineEnd = null;
  let currentTime = null;
  let isLive = true;
  let isPlaying = false;
  let playbackSpeed = 1;
  let playbackInterval = null;

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
        // Initialize timeline from server data
        if (message.data.timeline) {
          const { summary, events } = message.data.timeline;
          timelineEvents = events || [];
          timelineStart = summary?.startTime || null;
          timelineEnd = summary?.endTime || null;
          currentTime = timelineEnd;
        }
        break;

      case 'hooks:updated':
        // Only update live state if we're in live mode
        if (isLive) {
          hooks = message.data.hooks || {};
          lastUpdated = message.timestamp;
          currentTime = message.timestamp;
        }
        break;

      case 'timeline:updated':
        // New event added to timeline
        if (message.data.entry) {
          // Only add events that have changes
          if (message.data.entry.changes && message.data.entry.changes.length > 0) {
            timelineEvents = [...timelineEvents, message.data.entry];
          }
          timelineEnd = message.data.entry.timestamp;
          if (isLive) {
            currentTime = message.data.entry.timestamp;
          }
        }
        break;

      case 'timeline:data':
        // Full timeline data response
        if (message.data) {
          const { summary, events } = message.data;
          timelineEvents = events || [];
          timelineStart = summary?.startTime || null;
          timelineEnd = summary?.endTime || null;
        }
        break;

      case 'timeline:state':
        // Historical state at requested time
        if (message.data && !isLive) {
          hooks = message.data.hooks || {};
          lastUpdated = message.requestedTime;
        }
        break;
    }
  }

  function requestPoll() {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'poll:now' }));
    }
  }

  // Request state at a specific time from server
  function seekToTime(timestamp) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      isLive = false;
      currentTime = timestamp;
      ws.send(JSON.stringify({ type: 'timeline:at', timestamp }));
    }
  }

  // Timeline control handlers
  function handleSeek(event) {
    const { timestamp } = event.detail;
    stopPlayback();
    seekToTime(timestamp);
  }

  function handleTogglePlay() {
    if (isPlaying) {
      stopPlayback();
    } else {
      startPlayback();
    }
  }

  function handleGoLive() {
    stopPlayback();
    isLive = true;
    currentTime = timelineEnd;
    // Request fresh state
    requestPoll();
  }

  function handleSetSpeed(event) {
    playbackSpeed = event.detail.speed;
    // If playing, restart with new speed
    if (isPlaying) {
      stopPlayback();
      startPlayback();
    }
  }

  function startPlayback() {
    if (!timelineEvents.length) return;

    isLive = false;
    isPlaying = true;

    // Find current event index
    let currentIndex = 0;
    if (currentTime) {
      const currentMs = new Date(currentTime).getTime();
      currentIndex = timelineEvents.findIndex(e =>
        new Date(e.timestamp).getTime() > currentMs
      );
      if (currentIndex === -1) currentIndex = 0;
    }

    // Play through events at configured speed
    const playNext = () => {
      if (currentIndex >= timelineEvents.length) {
        // Reached end, go live
        handleGoLive();
        return;
      }

      const event = timelineEvents[currentIndex];
      hooks = event.hooks || {};
      currentTime = event.timestamp;
      lastUpdated = event.timestamp;
      currentIndex++;

      // Calculate delay until next event
      if (currentIndex < timelineEvents.length) {
        const current = new Date(event.timestamp).getTime();
        const next = new Date(timelineEvents[currentIndex].timestamp).getTime();
        const delay = Math.max(100, (next - current) / playbackSpeed);
        playbackInterval = setTimeout(playNext, delay);
      } else {
        // Last event, go live after short delay
        playbackInterval = setTimeout(handleGoLive, 1000);
      }
    };

    playNext();
  }

  function stopPlayback() {
    isPlaying = false;
    if (playbackInterval) {
      clearTimeout(playbackInterval);
      playbackInterval = null;
    }
  }

  onMount(() => {
    connectWebSocket();
  });

  onDestroy(() => {
    stopPlayback();
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

  <Timeline
    events={timelineEvents}
    startTime={timelineStart}
    endTime={timelineEnd}
    {currentTime}
    {isPlaying}
    {isLive}
    {playbackSpeed}
    on:seek={handleSeek}
    on:togglePlay={handleTogglePlay}
    on:goLive={handleGoLive}
    on:setSpeed={handleSetSpeed}
  />
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
</style>
