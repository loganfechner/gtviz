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
    background: #161b22;
    border-bottom: 1px solid #30363d;
    align-items: center;
  }

  .search {
    flex: 1;
    max-width: 250px;
  }

  .search input {
    width: 100%;
    padding: 6px 10px;
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #c9d1d9;
    font-size: 13px;
    outline: none;
    transition: border-color 0.15s;
  }

  .search input:focus {
    border-color: #58a6ff;
  }

  .search input::placeholder {
    color: #6e7681;
  }

  .filters {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  select {
    padding: 6px 10px;
    background: #21262d;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #c9d1d9;
    font-size: 12px;
    cursor: pointer;
    outline: none;
  }

  select:hover {
    background: #30363d;
  }

  .clear-btn {
    padding: 6px 10px;
    background: transparent;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #8b949e;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .clear-btn:hover {
    background: #21262d;
    color: #c9d1d9;
  }
</style>
