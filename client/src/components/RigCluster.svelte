<script>
  import { createEventDispatcher } from 'svelte';

  export let rig;

  const dispatch = createEventDispatcher();

  $: summary = rig.summary || { total: 0, active: 0, hooked: 0, idle: 0, error: 0 };
  $: hasActivity = summary.active > 0 || summary.hooked > 0;

  function handleClick() {
    dispatch('select', { rigName: rig.name });
  }
</script>

<button class="cluster" class:has-activity={hasActivity} class:has-error={summary.error > 0} on:click={handleClick}>
  <div class="header">
    <span class="name">{rig.name}</span>
    <span class="agent-count">{summary.total} agents</span>
  </div>

  <div class="stats">
    {#if summary.active > 0}
      <div class="stat active">
        <span class="stat-value">{summary.active}</span>
        <span class="stat-label">active</span>
      </div>
    {/if}
    {#if summary.hooked > 0}
      <div class="stat hooked">
        <span class="stat-value">{summary.hooked}</span>
        <span class="stat-label">hooked</span>
      </div>
    {/if}
    {#if summary.idle > 0}
      <div class="stat idle">
        <span class="stat-value">{summary.idle}</span>
        <span class="stat-label">idle</span>
      </div>
    {/if}
    {#if summary.error > 0}
      <div class="stat error">
        <span class="stat-value">{summary.error}</span>
        <span class="stat-label">error</span>
      </div>
    {/if}
  </div>

  <div class="footer">
    <span class="view-hint">Click to view details</span>
  </div>
</button>

<style>
  .cluster {
    display: flex;
    flex-direction: column;
    background: #1f2544;
    border: 2px solid #0f3460;
    border-radius: 12px;
    padding: 1.25rem;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
    width: 100%;
    min-height: 140px;
  }

  .cluster:hover {
    border-color: #e94560;
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(233, 69, 96, 0.15);
  }

  .cluster.has-activity {
    border-color: #4ade80;
    box-shadow: 0 0 16px rgba(74, 222, 128, 0.1);
  }

  .cluster.has-error {
    border-color: #ef4444;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .name {
    font-size: 1.25rem;
    font-weight: 700;
    color: #fff;
  }

  .agent-count {
    font-size: 0.75rem;
    color: #888;
    background: #0f3460;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
  }

  .stats {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
    flex: 1;
  }

  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.5rem 0.75rem;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 6px;
    min-width: 50px;
  }

  .stat-value {
    font-size: 1.5rem;
    font-weight: 700;
  }

  .stat-label {
    font-size: 0.625rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #888;
  }

  .stat.active .stat-value {
    color: #4ade80;
  }

  .stat.hooked .stat-value {
    color: #fbbf24;
  }

  .stat.idle .stat-value {
    color: #666;
  }

  .stat.error .stat-value {
    color: #ef4444;
  }

  .footer {
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid #0f3460;
  }

  .view-hint {
    font-size: 0.75rem;
    color: #555;
    font-style: italic;
  }
</style>
