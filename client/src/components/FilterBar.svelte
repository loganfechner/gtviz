<script>
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  export let agents = [];
  export let rigs = [];

  let searchQuery = '';
  let statusFilter = 'all';
  let roleFilter = 'all';

  // Get unique roles from agents
  $: roles = [...new Set(agents.map(a => a.role))].filter(r => r);

  // Get unique statuses from agents
  $: statuses = [...new Set(agents.map(a => a.status))].filter(s => s);

  function applyFilters() {
    dispatch('filter', {
      search: searchQuery.toLowerCase(),
      status: statusFilter,
      role: roleFilter
    });
  }

  $: {
    searchQuery;
    statusFilter;
    roleFilter;
    applyFilters();
  }

  function clearFilters() {
    searchQuery = '';
    statusFilter = 'all';
    roleFilter = 'all';
  }

  $: hasFilters = searchQuery || statusFilter !== 'all' || roleFilter !== 'all';
</script>

<div class="filter-bar">
  <div class="search">
    <input
      type="text"
      placeholder="Search agents..."
      bind:value={searchQuery}
    />
  </div>

  <div class="filters">
    <select bind:value={statusFilter}>
      <option value="all">All Status</option>
      {#each statuses as status}
        <option value={status}>{status}</option>
      {/each}
    </select>

    <select bind:value={roleFilter}>
      <option value="all">All Roles</option>
      {#each roles as role}
        <option value={role}>{role}</option>
      {/each}
    </select>

    {#if hasFilters}
      <button class="clear-btn" on:click={clearFilters}>Clear</button>
    {/if}
  </div>
</div>

<style>
  .filter-bar {
    display: flex;
    gap: 12px;
    padding: 8px 16px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-primary);
    align-items: center;
  }

  .search {
    flex: 1;
    max-width: 250px;
  }

  .search input {
    width: 100%;
    padding: 6px 10px;
    background: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 13px;
    outline: none;
    transition: border-color 0.15s;
  }

  .search input:focus {
    border-color: var(--accent-blue);
  }

  .search input::placeholder {
    color: var(--text-tertiary);
  }

  .filters {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  select {
    padding: 6px 10px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-primary);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 12px;
    cursor: pointer;
    outline: none;
  }

  select:hover {
    background: var(--bg-hover);
  }

  .clear-btn {
    padding: 6px 10px;
    background: transparent;
    border: 1px solid var(--border-primary);
    border-radius: 6px;
    color: var(--text-secondary);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .clear-btn:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }
</style>
