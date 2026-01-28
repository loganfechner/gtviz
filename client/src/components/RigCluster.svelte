<script>
  import { createEventDispatcher } from 'svelte';

  export let rig;

  const dispatch = createEventDispatcher();

  function handleClick() {
    dispatch('select', { rigName: rig.name });
  }

  $: summary = rig.summary || { total: 0, active: 0, hooked: 0, idle: 0, error: 0 };
  $: hasActivity = summary.active > 0 || summary.hooked > 0;
  $: hasErrors = summary.error > 0;
</script>

<button class="cluster" class:active={hasActivity} class:error={hasErrors} on:click={handleClick}>
  <div class="header">
    <span class="rig-icon">&#x2699;</span>
    <span class="name">{rig.name}</span>
  </div>

  <div class="stats">
    <div class="stat-row">
      <span class="stat active" title="Active agents">
        <span class="dot active"></span>
        {summary.active}
      </span>
      <span class="stat hooked" title="Hooked agents">
        <span class="dot hooked"></span>
        {summary.hooked}
      </span>
      <span class="stat idle" title="Idle agents">
        <span class="dot idle"></span>
        {summary.idle}
      </span>
      {#if summary.error > 0}
        <span class="stat error" title="Error agents">
          <span class="dot error"></span>
          {summary.error}
        </span>
      {/if}
    </div>
    <div class="total">
      {summary.total} agent{summary.total !== 1 ? 's' : ''}
    </div>
  </div>

  <div class="footer">
    <span class="drill-hint">Click to view agents</span>
  </div>
</button>

<style>
  .cluster {
    background: #1f2544;
    border: 2px solid #0f3460;
    border-radius: 12px;
    padding: 1.5rem;
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
    width: 100%;
    font-family: inherit;
    color: inherit;
  }

  .cluster:hover {
    border-color: #e94560;
    box-shadow: 0 4px 20px rgba(233, 69, 96, 0.15);
    transform: translateY(-2px);
  }

  .cluster.active {
    border-color: #4ade80;
    box-shadow: 0 0 20px rgba(74, 222, 128, 0.2);
  }

  .cluster.error {
    border-color: #ef4444;
  }

  .header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .rig-icon {
    font-size: 1.5rem;
    color: #e94560;
  }

  .name {
    font-size: 1.25rem;
    font-weight: 600;
    color: #fff;
  }

  .stats {
    margin-bottom: 1rem;
  }

  .stat-row {
    display: flex;
    gap: 1rem;
    margin-bottom: 0.5rem;
  }

  .stat {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.875rem;
    color: #888;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #666;
  }

  .dot.active {
    background: #4ade80;
    box-shadow: 0 0 6px #4ade80;
  }

  .dot.hooked {
    background: #fbbf24;
  }

  .dot.idle {
    background: #666;
  }

  .dot.error {
    background: #ef4444;
  }

  .total {
    font-size: 0.75rem;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .footer {
    padding-top: 0.75rem;
    border-top: 1px solid #0f3460;
  }

  .drill-hint {
    font-size: 0.75rem;
    color: #e94560;
    opacity: 0.7;
  }

  .cluster:hover .drill-hint {
    opacity: 1;
  }
</style>
