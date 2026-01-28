<script>
  export let agent;
  export let color = '#8b949e';

  function getStatusEmoji(status) {
    switch (status) {
      case 'running': return '';
      case 'idle': return '';
      case 'stopped': return '';
      case 'killed': return '';
      default: return '';
    }
  }

  function getStatusClass(status) {
    switch (status) {
      case 'running': return 'running';
      case 'idle': return 'idle';
      case 'stopped': return 'stopped';
      case 'killed': return 'killed';
      default: return 'unknown';
    }
  }
</script>

<div class="card" style="--accent: {color}">
  <div class="header">
    <span class="role">{agent.role}</span>
    <span class="status {getStatusClass(agent.status)}">{agent.status || 'unknown'}</span>
  </div>
  <div class="name">{agent.name}</div>
  {#if agent.task}
    <div class="task">{agent.task}</div>
  {/if}
  {#if agent.lastOutput}
    <div class="output">{agent.lastOutput.slice(0, 50)}...</div>
  {/if}
</div>

<style>
  .card {
    background: #161b22;
    border: 1px solid #30363d;
    border-left: 3px solid var(--accent);
    border-radius: 8px;
    padding: 10px 12px;
    min-width: 140px;
    max-width: 180px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    transition: transform 0.15s, box-shadow 0.15s;
  }

  .card:hover {
    transform: scale(1.05);
    box-shadow: 0 6px 20px rgba(0,0,0,0.5);
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }

  .role {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--accent);
    font-weight: 600;
  }

  .status {
    font-size: 9px;
    padding: 2px 6px;
    border-radius: 10px;
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

  .status.killed {
    background: #f8514966;
    color: #f85149;
  }

  .status.unknown {
    background: #8b949e22;
    color: #8b949e;
  }

  .name {
    font-size: 13px;
    font-weight: 600;
    color: #e6edf3;
    margin-bottom: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .task {
    font-size: 11px;
    color: #8b949e;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .output {
    font-size: 10px;
    color: #6e7681;
    font-family: monospace;
    margin-top: 4px;
    padding: 4px 6px;
    background: #0d1117;
    border-radius: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
