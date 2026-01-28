<script>
  export let events = [];
  export let rig = null;

  $: filteredEvents = rig
    ? events.filter(e => !e.source || e.source === rig)
    : events;

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
  <h3>Live Events</h3>

  {#if filteredEvents.length === 0}
    <p class="empty">Waiting for events...</p>
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
              <div class="event-detail">
                {event.from} → {event.to}
              </div>
              {#if event.preview}
                <div class="event-preview">{event.preview}</div>
              {/if}
            {:else if event.message}
              <div class="event-detail">{event.message}</div>
            {:else if event.action}
              <div class="event-detail">{event.action}</div>
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

  .event-log h3 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #8b949e;
    margin-bottom: 12px;
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
</style>
