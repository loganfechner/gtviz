<script>
  import { createEventDispatcher } from 'svelte';
  import SkeletonRow from './SkeletonRow.svelte';

  export let events = [];
  export let rig = null;
  export let loading = false;

  const dispatch = createEventDispatcher();

  let searchText = '';
  let typeFilter = 'all';

  $: rigFilteredEvents = rig
    ? events.filter(e => !e.source || e.source === rig)
    : events;

  $: filteredEvents = rigFilteredEvents.filter(e => {
    // Type filter
    if (typeFilter !== 'all' && e.type !== typeFilter) return false;

    // Search filter
    if (searchText) {
      const search = searchText.toLowerCase();
      const matchesContent = (e.content || '').toLowerCase().includes(search);
      const matchesPreview = (e.preview || '').toLowerCase().includes(search);
      const matchesMessage = (e.message || '').toLowerCase().includes(search);
      const matchesAction = (e.action || '').toLowerCase().includes(search);
      const matchesFrom = (e.from || '').toLowerCase().includes(search);
      const matchesTo = (e.to || '').toLowerCase().includes(search);
      const matchesSubject = (e.subject || '').toLowerCase().includes(search);
      if (!(matchesContent || matchesPreview || matchesMessage || matchesAction || matchesFrom || matchesTo || matchesSubject)) {
        return false;
      }
    }
    return true;
  });

  function handleEventClick(event) {
    dispatch('eventclick', event);
  }

  function handleMailClick(event) {
    dispatch('mailclick', event);
  }

  function handleExport(format) {
    const exportUrl = `/api/events/export?format=${format}&rig=${rig || ''}&type=${typeFilter}&search=${encodeURIComponent(searchText)}`;
    window.open(exportUrl, '_blank');
  }

  function formatTime(timestamp) {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    return d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function getEventIcon(type) {
    switch (type) {
      case 'mail': return '\u2709';
      case 'gt_event': return '\u26A1';
      case 'feed': return '\u25B6';
      default: return '\u2022';
    }
  }

  function getEventColor(type) {
    switch (type) {
      case 'mail': return '#58a6ff';
      case 'gt_event': return '#f0883e';
      case 'feed': return '#a371f7';
      default: return '#8b949e';
    }
  }
</script>

<div class="event-log">
  <div class="header">
    <h3>Live Events</h3>
    <div class="export-dropdown">
      <button class="export-btn" title="Export events">
        Export
      </button>
      <div class="dropdown-content">
        <button on:click={() => handleExport('json')}>JSON</button>
        <button on:click={() => handleExport('csv')}>CSV</button>
      </div>
    </div>
  </div>

  <div class="filters">
    <input
      type="text"
      class="search-input"
      placeholder="Search events..."
      bind:value={searchText}
    />
    <select class="type-filter" bind:value={typeFilter}>
      <option value="all">All Types</option>
      <option value="mail">Mail</option>
      <option value="gt_event">GT Event</option>
      <option value="feed">Feed</option>
    </select>
  </div>

  {#if loading}
    <div class="events">
      {#each Array(5) as _}
        <SkeletonRow variant="event" />
      {/each}
    </div>
  {:else if filteredEvents.length === 0}
    <p class="empty">
      {#if searchText || typeFilter !== 'all'}
        No matching events
      {:else}
        Waiting for events...
      {/if}
    </p>
  {:else}
    <div class="events">
      {#each filteredEvents.slice(0, 50) as event}
        <div class="event">
          <span class="icon" style="color: {getEventColor(event.type)}">
            {getEventIcon(event.type)}
          </span>
          <div class="event-content">
            <div class="event-header">
              <span class="event-type">{event.type}</span>
              <span class="event-time">{formatTime(event.timestamp)}</span>
            </div>
            {#if event.type === 'mail'}
              <button class="event-link" on:click={() => handleEventClick(event)}>
                <div class="event-detail">
                  {event.from} → {event.to}
                </div>
                {#if event.preview}
                  <div class="event-preview">{event.preview}</div>
                {/if}
              </button>
            {:else}
              <button class="event-link" on:click={() => handleEventClick(event)}>
                {#if event.message}
                  <div class="event-detail">{event.message}</div>
                {:else if event.action}
                  <div class="event-detail">{event.action}</div>
                {:else}
                  <div class="event-detail">View details</div>
                {/if}
              </button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .event-log {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .header h3 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #8b949e;
    margin: 0;
  }

  .export-dropdown {
    position: relative;
    display: inline-block;
  }

  .export-btn {
    padding: 4px 8px;
    background: #21262d;
    border: 1px solid #30363d;
    border-radius: 4px;
    color: #8b949e;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .export-btn:hover {
    background: #30363d;
    color: #c9d1d9;
  }

  .dropdown-content {
    display: none;
    position: absolute;
    right: 0;
    top: 100%;
    background: #21262d;
    border: 1px solid #30363d;
    border-radius: 4px;
    z-index: 10;
    min-width: 80px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .export-dropdown:hover .dropdown-content {
    display: block;
  }

  .dropdown-content button {
    display: block;
    width: 100%;
    padding: 6px 12px;
    background: none;
    border: none;
    color: #c9d1d9;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }

  .dropdown-content button:hover {
    background: #30363d;
  }

  .filters {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
  }

  .search-input {
    flex: 1;
    padding: 6px 10px;
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 4px;
    color: #c9d1d9;
    font-size: 12px;
  }

  .search-input::placeholder {
    color: #6e7681;
  }

  .search-input:focus {
    outline: none;
    border-color: #58a6ff;
  }

  .type-filter {
    padding: 6px 8px;
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 4px;
    color: #c9d1d9;
    font-size: 12px;
    cursor: pointer;
  }

  .type-filter:focus {
    outline: none;
    border-color: #58a6ff;
  }

  .empty {
    color: #6e7681;
    font-size: 13px;
    text-align: center;
    padding: 20px;
  }

  .events {
    flex: 1;
    overflow-y: auto;
  }

  .event {
    display: flex;
    gap: 10px;
    padding: 8px 0;
    border-bottom: 1px solid #21262d;
  }

  .event:last-child {
    border-bottom: none;
  }

  .icon {
    font-size: 14px;
    width: 20px;
    text-align: center;
    flex-shrink: 0;
  }

  .event-content {
    flex: 1;
    min-width: 0;
  }

  .event-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2px;
  }

  .event-type {
    font-size: 11px;
    text-transform: uppercase;
    color: #8b949e;
    font-weight: 500;
  }

  .event-time {
    font-size: 10px;
    color: #6e7681;
    font-family: monospace;
  }

  .event-detail {
    font-size: 12px;
    color: #c9d1d9;
  }

  .event-preview {
    font-size: 11px;
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

  .event-link {
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    border-radius: 4px;
    transition: background 0.15s;
  }

  .event-link:hover {
    background: #21262d;
  }

  .event-link:hover .event-preview {
    background: #30363d;
  }
</style>
