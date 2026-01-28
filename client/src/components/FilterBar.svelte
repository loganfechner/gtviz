<script>
  import { createEventDispatcher } from 'svelte';

  export let searchQuery = '';
  export let statusFilter = null;
  export let roleFilter = null;
  export let sortBy = 'role';
  export let agentCount = 0;
  export let filteredCount = 0;

  const dispatch = createEventDispatcher();

  const statuses = [
    { value: null, label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'hooked', label: 'Hooked' },
    { value: 'idle', label: 'Idle' },
    { value: 'error', label: 'Error' }
  ];

  const roles = [
    { value: null, label: 'All' },
    { value: 'witness', label: 'Witness' },
    { value: 'refinery', label: 'Refinery' },
    { value: 'polecat', label: 'Polecat' }
  ];

  const sortOptions = [
    { value: 'role', label: 'Role' },
    { value: 'name', label: 'Name' },
    { value: 'status', label: 'Status' }
  ];

  function handleSearchInput(e) {
    searchQuery = e.target.value;
    dispatch('filter', { searchQuery, statusFilter, roleFilter, sortBy });
  }

  function setStatusFilter(status) {
    statusFilter = status;
    dispatch('filter', { searchQuery, statusFilter, roleFilter, sortBy });
  }

  function setRoleFilter(role) {
    roleFilter = role;
    dispatch('filter', { searchQuery, statusFilter, roleFilter, sortBy });
  }

  function setSortBy(sort) {
    sortBy = sort;
    dispatch('filter', { searchQuery, statusFilter, roleFilter, sortBy });
  }

  function clearFilters() {
    searchQuery = '';
    statusFilter = null;
    roleFilter = null;
    sortBy = 'role';
    dispatch('filter', { searchQuery, statusFilter, roleFilter, sortBy });
  }

  $: hasActiveFilters = searchQuery || statusFilter || roleFilter || sortBy !== 'role';
</script>

<div class="filter-bar">
  <div class="search-group">
    <input
      type="text"
      placeholder="Search agents..."
      value={searchQuery}
      on:input={handleSearchInput}
      class="search-input"
    />
    {#if searchQuery}
      <button class="clear-search" on:click={() => { searchQuery = ''; dispatch('filter', { searchQuery: '', statusFilter, roleFilter, sortBy }); }}>
        &times;
      </button>
    {/if}
  </div>

  <div class="filter-group">
    <span class="filter-label">Status:</span>
    <div class="filter-buttons">
      {#each statuses as status}
        <button
          class:active={statusFilter === status.value}
          class:status-active={status.value === 'active'}
          class:status-hooked={status.value === 'hooked'}
          class:status-idle={status.value === 'idle'}
          class:status-error={status.value === 'error'}
          on:click={() => setStatusFilter(status.value)}
        >
          {status.label}
        </button>
      {/each}
    </div>
  </div>

  <div class="filter-group">
    <span class="filter-label">Role:</span>
    <div class="filter-buttons">
      {#each roles as role}
        <button
          class:active={roleFilter === role.value}
          on:click={() => setRoleFilter(role.value)}
        >
          {role.label}
        </button>
      {/each}
    </div>
  </div>

  <div class="filter-group">
    <span class="filter-label">Sort:</span>
    <select value={sortBy} on:change={(e) => setSortBy(e.target.value)}>
      {#each sortOptions as option}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
  </div>

  {#if hasActiveFilters}
    <button class="clear-all" on:click={clearFilters}>
      Clear
    </button>
  {/if}

  <div class="count-display">
    {#if filteredCount !== agentCount}
      <span class="filtered-count">{filteredCount}</span> /
    {/if}
    <span>{agentCount} agents</span>
  </div>
</div>

<style>
  .filter-bar {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1rem;
    background: var(--bg-card);
    border-bottom: 1px solid var(--border-color);
    flex-wrap: wrap;
  }

  .search-group {
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-input {
    padding: 0.4rem 0.75rem;
    padding-right: 1.75rem;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-primary);
    font-size: 0.875rem;
    width: 180px;
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .search-input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 2px rgba(233, 69, 96, 0.2);
  }

  .search-input::placeholder {
    color: var(--text-dim);
  }

  .clear-search {
    position: absolute;
    right: 0.25rem;
    padding: 0.2rem 0.4rem;
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
  }

  .clear-search:hover {
    color: var(--text-primary);
    background: transparent;
  }

  .filter-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .filter-label {
    font-size: 0.75rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .filter-buttons {
    display: flex;
    gap: 0;
  }

  .filter-buttons button {
    padding: 0.35rem 0.6rem;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-right: none;
    color: var(--text-secondary);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .filter-buttons button:first-child {
    border-radius: 4px 0 0 4px;
  }

  .filter-buttons button:last-child {
    border-radius: 0 4px 4px 0;
    border-right: 1px solid var(--border-color);
  }

  .filter-buttons button:hover {
    background: var(--border-color);
  }

  .filter-buttons button.active {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }

  .filter-buttons button.active + button {
    border-left-color: var(--accent);
  }

  /* Status-specific active colors */
  .filter-buttons button.status-active.active {
    background: var(--success);
    border-color: var(--success);
  }

  .filter-buttons button.status-hooked.active {
    background: var(--warning);
    border-color: var(--warning);
    color: #1a1a2e;
  }

  .filter-buttons button.status-idle.active {
    background: var(--text-muted);
    border-color: var(--text-muted);
  }

  .filter-buttons button.status-error.active {
    background: var(--error);
    border-color: var(--error);
  }

  select {
    padding: 0.35rem 0.5rem;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-primary);
    font-size: 0.75rem;
    cursor: pointer;
  }

  select:focus {
    outline: none;
    border-color: var(--accent);
  }

  .clear-all {
    padding: 0.35rem 0.6rem;
    background: transparent;
    border: 1px solid var(--text-dim);
    color: var(--text-muted);
    font-size: 0.75rem;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .clear-all:hover {
    border-color: var(--accent);
    color: var(--accent);
    background: transparent;
  }

  .count-display {
    margin-left: auto;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .filtered-count {
    color: var(--accent);
    font-weight: 600;
  }
</style>
