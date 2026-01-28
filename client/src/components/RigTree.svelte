<script>
  import { createEventDispatcher } from 'svelte';

  export let agents = [];
  export let rig = null;

  const dispatch = createEventDispatcher();

  // Build tree structure from agents
  $: tree = buildTree(agents);

  // Track expanded directories
  let expanded = {
    mayor: true,
    witness: true,
    refinery: true,
    crew: true,
    polecats: true
  };

  function buildTree(agents) {
    const structure = {
      mayor: { agents: [], hasActive: false },
      witness: { agents: [], hasActive: false },
      refinery: { agents: [], hasActive: false },
      crew: { agents: [], hasActive: false },
      polecats: { agents: [], hasActive: false }
    };

    for (const agent of agents) {
      const role = agent.role;
      if (role === 'mayor') {
        structure.mayor.agents.push(agent);
        if (agent.status === 'running') structure.mayor.hasActive = true;
      } else if (role === 'witness') {
        structure.witness.agents.push(agent);
        if (agent.status === 'running') structure.witness.hasActive = true;
      } else if (role === 'refinery') {
        structure.refinery.agents.push(agent);
        if (agent.status === 'running') structure.refinery.hasActive = true;
      } else if (role === 'crew') {
        structure.crew.agents.push(agent);
        if (agent.status === 'running') structure.crew.hasActive = true;
      } else if (role === 'polecat') {
        structure.polecats.agents.push(agent);
        if (agent.status === 'running') structure.polecats.hasActive = true;
      }
    }

    return structure;
  }

  function toggleExpand(dir) {
    expanded[dir] = !expanded[dir];
    expanded = expanded;
  }

  function focusAgent(agent) {
    dispatch('focus', { agent });
  }

  function getStatusColor(status) {
    switch (status) {
      case 'running': return '#3fb950';
      case 'idle': return '#f0883e';
      case 'stopped': return '#8b949e';
      case 'killed': return '#f85149';
      default: return '#8b949e';
    }
  }

  function getStatusIcon(status) {
    switch (status) {
      case 'running': return '●';
      case 'idle': return '○';
      case 'stopped': return '○';
      case 'killed': return '✕';
      default: return '○';
    }
  }
</script>

<div class="tree">
  {#if rig}
    <div class="rig-name">{rig}/</div>
  {/if}

  {#each Object.entries(tree) as [dir, data]}
    <div class="tree-item">
      <button
        class="dir-toggle"
        class:has-active={data.hasActive}
        on:click={() => toggleExpand(dir)}
      >
        <span class="toggle-icon">{expanded[dir] ? '▼' : '▶'}</span>
        <span class="dir-name">{dir}/</span>
        {#if data.hasActive}
          <span class="active-indicator">●</span>
        {/if}
        <span class="count">({data.agents.length})</span>
      </button>

      {#if expanded[dir] && data.agents.length > 0}
        <div class="children">
          {#each data.agents as agent}
            <button
              class="agent-item"
              on:click={() => focusAgent(agent)}
            >
              <span
                class="status-dot"
                style="color: {getStatusColor(agent.status)}"
              >
                {getStatusIcon(agent.status)}
              </span>
              <span class="agent-name">{agent.name}</span>
              {#if agent.task}
                <span class="task-preview" title={agent.task}>
                  {agent.task.slice(0, 20)}{agent.task.length > 20 ? '...' : ''}
                </span>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .tree {
    font-family: monospace;
    font-size: 13px;
  }

  .rig-name {
    color: #58a6ff;
    font-weight: bold;
    padding-bottom: 8px;
    border-bottom: 1px solid #30363d;
    margin-bottom: 8px;
  }

  .tree-item {
    margin-bottom: 4px;
  }

  .dir-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 6px 8px;
    background: none;
    border: none;
    border-radius: 4px;
    color: #c9d1d9;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;
  }

  .dir-toggle:hover {
    background: #21262d;
  }

  .dir-toggle.has-active {
    color: #3fb950;
  }

  .toggle-icon {
    color: #8b949e;
    font-size: 10px;
    width: 12px;
  }

  .dir-name {
    font-weight: 500;
  }

  .active-indicator {
    color: #3fb950;
    font-size: 10px;
  }

  .count {
    color: #8b949e;
    font-size: 11px;
    margin-left: auto;
  }

  .children {
    margin-left: 20px;
    border-left: 1px solid #30363d;
    padding-left: 8px;
  }

  .agent-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 5px 8px;
    background: none;
    border: none;
    border-radius: 4px;
    color: #c9d1d9;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;
  }

  .agent-item:hover {
    background: #21262d;
  }

  .status-dot {
    font-size: 10px;
  }

  .agent-name {
    flex-shrink: 0;
  }

  .task-preview {
    color: #8b949e;
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
