<script>
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import Spinner from './Spinner.svelte';

  export let agent = null;
  export let rig = null;

  const dispatch = createEventDispatcher();

  let output = '';
  let loading = false;
  let error = null;
  let autoRefresh = true;
  let refreshInterval = null;
  let outputContainer;

  $: agentPath = agent ? getAgentPath(agent) : '';

  function getAgentPath(agent) {
    if (agent.role === 'polecat') {
      return `${rig}/polecats/${agent.name}`;
    } else if (agent.role === 'crew') {
      return `${rig}/crew/${agent.name}`;
    } else {
      return `${rig}/${agent.name}`;
    }
  }

  async function fetchPeek() {
    if (!agent || !rig) return;

    loading = true;
    error = null;

    try {
      const response = await fetch(`/api/agents/${encodeURIComponent(rig)}/${encodeURIComponent(agent.role)}/${encodeURIComponent(agent.name)}/peek`);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `Failed to fetch: ${response.status}`);
      }

      const data = await response.json();
      output = data.output || '';

      // Auto-scroll to bottom
      if (outputContainer) {
        setTimeout(() => {
          outputContainer.scrollTop = outputContainer.scrollHeight;
        }, 0);
      }
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  function startAutoRefresh() {
    if (refreshInterval) clearInterval(refreshInterval);
    if (autoRefresh) {
      refreshInterval = setInterval(fetchPeek, 3000);
    }
  }

  function toggleAutoRefresh() {
    autoRefresh = !autoRefresh;
    if (autoRefresh) {
      startAutoRefresh();
    } else if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
  }

  function close() {
    dispatch('close');
  }

  function handleKeydown(e) {
    if (e.key === 'Escape') close();
    if (e.key === 'r' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      fetchPeek();
    }
  }

  onMount(() => {
    fetchPeek();
    startAutoRefresh();
  });

  onDestroy(() => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }
  });

  function getStatusClass(status) {
    switch (status) {
      case 'running': return 'running';
      case 'idle': return 'idle';
      case 'stopped': return 'stopped';
      default: return 'unknown';
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if agent}
  <div class="modal-backdrop" on:click={close} role="button" tabindex="0" on:keydown={handleKeydown}>
    <div class="modal" on:click|stopPropagation role="dialog" aria-modal="true">
      <div class="modal-header">
        <div class="header-left">
          <span class="role-badge">{agent.role}</span>
          <h2>{agent.name}</h2>
          <span class="status {getStatusClass(agent.status)}">{agent.status || 'unknown'}</span>
        </div>
        <div class="header-right">
          <button
            class="auto-refresh-btn"
            class:active={autoRefresh}
            on:click={toggleAutoRefresh}
            title={autoRefresh ? 'Auto-refresh ON (3s)' : 'Auto-refresh OFF'}
          >
            {autoRefresh ? 'Auto' : 'Manual'}
          </button>
          <button class="refresh-btn" on:click={fetchPeek} title="Refresh (Ctrl+R)" disabled={loading}>
            {#if loading}
              <Spinner size={14} />
            {:else}
              Refresh
            {/if}
          </button>
          <button class="close-btn" on:click={close} aria-label="Close">X</button>
        </div>
      </div>

      <div class="modal-info">
        <span class="path">{agentPath}</span>
        {#if agent.currentBead}
          <span class="bead">Working on: {agent.currentBead}</span>
        {/if}
      </div>

      <div class="modal-body" bind:this={outputContainer}>
        {#if error}
          <div class="error-message">
            <span class="error-icon">!</span>
            {error}
          </div>
        {:else if output}
          <pre class="output">{output}</pre>
        {:else if loading}
          <div class="loading-state">
            <Spinner size={24} />
            <span>Fetching session output...</span>
          </div>
        {:else}
          <div class="empty-state">
            No session output available. The agent may not have an active session.
          </div>
        {/if}
      </div>

      <div class="modal-footer">
        <span class="hint">Press <kbd>Esc</kbd> to close, <kbd>Ctrl+R</kbd> to refresh</span>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 12px;
    width: 90%;
    max-width: 1200px;
    height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid #30363d;
    background: #161b22;
    border-radius: 12px 12px 0 0;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .role-badge {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 4px 8px;
    background: #238636;
    color: white;
    border-radius: 4px;
    font-weight: 600;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 18px;
    color: #e6edf3;
    font-weight: 600;
  }

  .status {
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 12px;
    font-weight: 500;
  }

  .status.running {
    background: #23863633;
    color: #3fb950;
  }

  .status.idle {
    background: #58a6ff22;
    color: #58a6ff;
  }

  .status.stopped {
    background: #f8514933;
    color: #f85149;
  }

  .status.unknown {
    background: #8b949e22;
    color: #8b949e;
  }

  .auto-refresh-btn {
    padding: 6px 12px;
    background: #21262d;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #8b949e;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.15s;
  }

  .auto-refresh-btn:hover {
    background: #30363d;
    color: #c9d1d9;
  }

  .auto-refresh-btn.active {
    background: #238636;
    border-color: #238636;
    color: white;
  }

  .refresh-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: #21262d;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #c9d1d9;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.15s;
    min-width: 70px;
    justify-content: center;
  }

  .refresh-btn:hover:not(:disabled) {
    background: #30363d;
  }

  .refresh-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .close-btn {
    background: none;
    border: none;
    color: #8b949e;
    font-size: 18px;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    margin-left: 8px;
  }

  .close-btn:hover {
    background: #30363d;
    color: #c9d1d9;
  }

  .modal-info {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 20px;
    background: #161b22;
    border-bottom: 1px solid #21262d;
    font-size: 12px;
  }

  .path {
    color: #8b949e;
    font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
  }

  .bead {
    color: #58a6ff;
  }

  .modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 0;
    background: #0d1117;
  }

  .output {
    margin: 0;
    padding: 16px 20px;
    font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
    font-size: 12px;
    line-height: 1.5;
    color: #c9d1d9;
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  .error-message {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 20px;
    color: #f85149;
    font-size: 14px;
  }

  .error-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background: #f8514933;
    border-radius: 50%;
    font-weight: 600;
  }

  .loading-state, .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 40px;
    color: #8b949e;
    font-size: 14px;
  }

  .modal-footer {
    padding: 10px 20px;
    border-top: 1px solid #21262d;
    background: #161b22;
    border-radius: 0 0 12px 12px;
  }

  .hint {
    font-size: 11px;
    color: #6e7681;
  }

  kbd {
    display: inline-block;
    padding: 2px 6px;
    font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
    font-size: 10px;
    background: #21262d;
    border: 1px solid #30363d;
    border-radius: 4px;
    color: #8b949e;
  }
</style>
