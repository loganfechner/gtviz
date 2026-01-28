<script>
  import { createEventDispatcher } from 'svelte';

  export let currentRig = null;

  const dispatch = createEventDispatcher();

  function goToOverview() {
    dispatch('navigate', { view: 'overview' });
  }
</script>

<nav class="breadcrumb">
  <button class="crumb" class:active={!currentRig} on:click={goToOverview}>
    All Rigs
  </button>
  {#if currentRig}
    <span class="separator">/</span>
    <span class="crumb current">{currentRig}</span>
  {/if}
</nav>

<style>
  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: rgba(15, 52, 96, 0.5);
    border-radius: 6px;
  }

  .crumb {
    font-size: 0.875rem;
    color: #888;
    background: none;
    border: none;
    padding: 0.25rem 0.5rem;
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.2s;
  }

  .crumb:hover:not(.current) {
    color: #e94560;
    background: rgba(233, 69, 96, 0.1);
  }

  .crumb.active {
    color: #e94560;
  }

  .crumb.current {
    color: #fff;
    cursor: default;
    font-weight: 600;
  }

  .separator {
    color: #555;
  }
</style>
