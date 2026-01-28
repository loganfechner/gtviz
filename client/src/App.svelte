<script>
  import { onMount } from 'svelte';
  import NetworkGraph from './components/NetworkGraph.svelte';
  import Sidebar from './components/Sidebar.svelte';
  import { connectWebSocket, state, events } from './lib/websocket.js';

  let selectedRig = null;
  let connected = false;

  onMount(() => {
    connectWebSocket((isConnected) => {
      connected = isConnected;
    });
  });

  $: rigs = Object.keys($state.rigs || {});
  $: if (rigs.length && !selectedRig) selectedRig = rigs[0];
  $: currentAgents = selectedRig ? ($state.agents?.[selectedRig] || []) : [];
  $: currentBeads = selectedRig ? ($state.beads?.[selectedRig] || []) : [];
  $: currentHooks = selectedRig ? ($state.hooks?.[selectedRig] || {}) : {};
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
    <div class="status" class:connected>
      {connected ? 'Live' : 'Connecting...'}
    </div>
  </header>

  <main>
    <div class="graph-container">
      <NetworkGraph
        agents={currentAgents}
        mail={$state.mail || []}
        rig={selectedRig}
      />
    </div>

    <Sidebar
      beads={currentBeads}
      hooks={currentHooks}
      events={$events}
      rig={selectedRig}
    />
  </main>
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
  }

  .status.connected {
    background: #23863666;
    color: #3fb950;
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
