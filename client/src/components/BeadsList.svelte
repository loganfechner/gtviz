<script>
  import { createEventDispatcher } from 'svelte';
  import CopyButton from './CopyButton.svelte';
  import SkeletonRow from './SkeletonRow.svelte';
  import BeadDetailModal from './BeadDetailModal.svelte';

  export let beads = [];
  export let loading = false;

  const dispatch = createEventDispatcher();

  let searchQuery = '';
  let statusFilter = 'all';
  let priorityFilter = 'all';
  let groupByStatus = true;
  let selectedBead = null;

  const statusOrder = ['hooked', 'in_progress', 'open', 'closed', 'done'];
  const priorities = ['critical', 'high', 'normal', 'low'];

  function getStatusColor(status) {
    switch (status) {
      case 'open': return '#58a6ff';
      case 'hooked': return '#a371f7';
      case 'in_progress': return '#f0883e';
      case 'closed': case 'done': return '#3fb950';
      default: return '#8b949e';
    }
  }

  function getPriorityColor(priority) {
    switch (priority) {
      case 'critical': return '#f85149';
      case 'high': return '#f0883e';
      case 'normal': return '#58a6ff';
      case 'low': return '#8b949e';
      default: return '#8b949e';
    }
  }

  function getStatusLabel(status) {
    switch (status) {
      case 'hooked': return 'Hooked';
      case 'in_progress': return 'In Progress';
      case 'open': return 'Open';
      case 'closed': return 'Closed';
      case 'done': return 'Done';
      default: return status;
    }
  }

  $: filteredBeads = beads.filter(bead => {
    const matchesSearch = !searchQuery ||
      bead.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      bead.id?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || bead.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || bead.priority === priorityFilter;
    return matchesSearch && matchesStatus && matchesPriority;
  });

  $: groupedBeads = groupByStatus ? groupBeadsByStatus(filteredBeads) : { all: filteredBeads };

  function groupBeadsByStatus(beadList) {
    const groups = {};
    for (const bead of beadList) {
      const status = bead.status || 'unknown';
      if (!groups[status]) groups[status] = [];
      groups[status].push(bead);
    }
    return groups;
  }

  $: sortedGroups = Object.keys(groupedBeads).sort((a, b) => {
    const aIndex = statusOrder.indexOf(a);
    const bIndex = statusOrder.indexOf(b);
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  $: uniqueStatuses = [...new Set(beads.map(b => b.status).filter(Boolean))];

  function clearFilters() {
    searchQuery = '';
    statusFilter = 'all';
    priorityFilter = 'all';
  }

  $: hasFilters = searchQuery || statusFilter !== 'all' || priorityFilter !== 'all';

  function openBead(bead) {
    selectedBead = bead;
  }

  function closeModal() {
    selectedBead = null;
  }
</script>

<div class="beads-list">
  <div class="beads-header">
    <h3>Beads</h3>
    <label class="group-toggle">
      <input type="checkbox" bind:checked={groupByStatus} />
      Group by status
    </label>
  </div>

  <div class="filter-bar">
    <input
      type="text"
      class="search-input"
      placeholder="Search beads..."
      bind:value={searchQuery}
    />
    <select bind:value={statusFilter}>
      <option value="all">All Status</option>
      {#each uniqueStatuses as status}
        <option value={status}>{getStatusLabel(status)}</option>
      {/each}
    </select>
    <select bind:value={priorityFilter}>
      <option value="all">All Priority</option>
      {#each priorities as priority}
        <option value={priority}>{priority}</option>
      {/each}
    </select>
    {#if hasFilters}
      <button class="clear-btn" on:click={clearFilters}>Clear</button>
    {/if}
  </div>

  {#if loading}
    {#each Array(3) as _}
      <SkeletonRow variant="bead" />
    {/each}
  {:else if filteredBeads.length === 0}
    <p class="empty">No beads found</p>
  {:else if groupByStatus}
    {#each sortedGroups as status}
      <div class="status-group">
        <div class="group-header">
          <span class="group-status" style="color: {getStatusColor(status)}">
            {getStatusLabel(status)}
          </span>
          <span class="group-count">{groupedBeads[status].length}</span>
        </div>
        {#each groupedBeads[status] as bead}
          <button class="bead" on:click={() => openBead(bead)}>
            <div class="bead-header">
              <span class="bead-id">{bead.id}</span>
              <CopyButton value={bead.id} label="Copied bead ID" />
              {#if bead.priority}
                <span class="bead-priority" style="color: {getPriorityColor(bead.priority)}">
                  {bead.priority}
                </span>
              {/if}
            </div>
            <div class="bead-title">{bead.title || 'Untitled'}</div>
            {#if bead.owner}
              <div class="bead-owner">Assigned: {bead.owner}</div>
            {/if}
          </button>
        {/each}
      </div>
    {/each}
  {:else}
    {#each filteredBeads as bead}
      <button class="bead" on:click={() => openBead(bead)}>
        <div class="bead-header">
          <span class="bead-id">{bead.id}</span>
          <CopyButton value={bead.id} label="Copied bead ID" />
          <span class="bead-status" style="color: {getStatusColor(bead.status)}">
            {bead.status}
          </span>
          {#if bead.priority}
            <span class="bead-priority" style="color: {getPriorityColor(bead.priority)}">
              {bead.priority}
            </span>
          {/if}
        </div>
        <div class="bead-title">{bead.title || 'Untitled'}</div>
        {#if bead.owner}
          <div class="bead-owner">Assigned: {bead.owner}</div>
        {/if}
      </button>
    {/each}
  {/if}
</div>

<BeadDetailModal bead={selectedBead} on:close={closeModal} />

<style>
  .beads-list {
    display: flex;
    flex-direction: column;
  }

  .beads-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .beads-header h3 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #8b949e;
    margin: 0;
  }

  .group-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: #8b949e;
    cursor: pointer;
  }

  .group-toggle input {
    cursor: pointer;
  }

  .filter-bar {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }

  .search-input {
    flex: 1;
    min-width: 120px;
    padding: 6px 10px;
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #c9d1d9;
    font-size: 12px;
    outline: none;
  }

  .search-input:focus {
    border-color: #58a6ff;
  }

  .search-input::placeholder {
    color: #6e7681;
  }

  select {
    padding: 6px 8px;
    background: #21262d;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #c9d1d9;
    font-size: 11px;
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
    font-size: 11px;
    cursor: pointer;
  }

  .clear-btn:hover {
    background: #21262d;
    color: #c9d1d9;
  }

  .empty {
    color: #6e7681;
    font-size: 13px;
    text-align: center;
    padding: 20px;
  }

  .status-group {
    margin-bottom: 16px;
  }

  .group-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    padding-bottom: 6px;
    border-bottom: 1px solid #21262d;
  }

  .group-status {
    font-size: 11px;
    text-transform: uppercase;
    font-weight: 600;
    letter-spacing: 0.5px;
  }

  .group-count {
    font-size: 10px;
    color: #6e7681;
    background: #21262d;
    padding: 2px 6px;
    border-radius: 10px;
  }

  .bead {
    display: block;
    width: 100%;
    text-align: left;
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 10px 12px;
    margin-bottom: 8px;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
  }

  .bead:hover {
    border-color: #58a6ff;
    background: #161b22;
  }

  .bead-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  .bead-id {
    font-family: monospace;
    font-size: 11px;
    color: #58a6ff;
  }

  .bead-status {
    font-size: 10px;
    text-transform: uppercase;
    font-weight: 600;
    margin-left: auto;
  }

  .bead-priority {
    font-size: 9px;
    text-transform: uppercase;
    font-weight: 600;
    padding: 1px 5px;
    border: 1px solid currentColor;
    border-radius: 3px;
    margin-left: auto;
  }

  .bead-title {
    font-size: 13px;
    color: #e6edf3;
    line-height: 1.4;
  }

  .bead-owner {
    font-size: 11px;
    color: #8b949e;
    margin-top: 6px;
  }
</style>
