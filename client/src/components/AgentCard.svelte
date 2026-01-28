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
    background: var(--bg-secondary);
    border: 1px solid var(--border-primary);
    border-left: 3px solid var(--accent);
    border-radius: 8px;
    padding: 10px 12px;
    min-width: 140px;
    max-width: 180px;
    box-shadow: var(--shadow-md);
    transition: transform 0.15s, box-shadow 0.15s;
  }

  .card:hover {
    transform: scale(1.05);
    box-shadow: var(--shadow-lg);
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
    background: var(--status-running-bg);
    color: var(--status-running);
  }

  .status.idle {
    background: var(--status-idle-bg);
    color: var(--accent-blue);
  }

  .status.stopped {
    background: var(--status-stopped-bg);
    color: var(--status-stopped);
  }

  .status.killed {
    background: var(--status-killed-bg);
    color: var(--status-killed);
  }

  .status.unknown {
    background: var(--status-idle-bg);
    color: var(--text-secondary);
  }

  .name {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .task {
    font-size: 11px;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .output {
    font-size: 10px;
    color: var(--text-tertiary);
    font-family: monospace;
    margin-top: 4px;
    padding: 4px 6px;
    background: var(--bg-primary);
    border-radius: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
