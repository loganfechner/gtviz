<script>
  import { createEventDispatcher } from 'svelte';

  export let event = null;

  const dispatch = createEventDispatcher();

  function close() {
    dispatch('close');
  }

  function handleKeydown(e) {
    if (e.key === 'Escape') close();
  }

  function formatTime(timestamp) {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function getEventTitle(event) {
    switch (event.type) {
      case 'mail': return `Mail from ${event.from}`;
      case 'gt_event': return 'GT Event';
      case 'feed': return 'Feed Event';
      default: return 'Event';
    }
  }

  function getEventPayload(event) {
    // Extract displayable fields excluding metadata
    const { type, source, timestamp, ...payload } = event;
    return payload;
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

<svelte:window on:keydown={handleKeydown} />

{#if event}
  <div class="modal-backdrop" on:click={close} role="button" tabindex="0" on:keydown={handleKeydown}>
    <div class="modal" on:click|stopPropagation role="dialog" aria-modal="true">
      <div class="modal-header">
        <div class="header-title">
          <span class="event-badge" style="background: {getEventColor(event.type)}">
            {event.type}
          </span>
          <h2>{getEventTitle(event)}</h2>
        </div>
        <button class="close-btn" on:click={close} aria-label="Close">X</button>
      </div>

      <div class="modal-body">
        <div class="event-meta">
          <div class="meta-row">
            <span class="label">Source:</span>
            <span class="value">{event.source || 'unknown'}</span>
          </div>
          <div class="meta-row">
            <span class="label">Time:</span>
            <span class="value">{formatTime(event.timestamp)}</span>
          </div>
          {#if event.type === 'mail'}
            <div class="meta-row">
              <span class="label">From:</span>
              <span class="value">{event.from}</span>
            </div>
            <div class="meta-row">
              <span class="label">To:</span>
              <span class="value">{event.to}</span>
            </div>
            {#if event.subject}
              <div class="meta-row">
                <span class="label">Subject:</span>
                <span class="value">{event.subject}</span>
              </div>
            {/if}
          {/if}
        </div>

        <div class="event-content">
          {#if event.type === 'mail'}
            <h3>Content</h3>
            <pre class="content-text">{event.content || event.preview || 'No content'}</pre>
          {:else}
            <h3>Payload</h3>
            <pre class="content-json">{JSON.stringify(getEventPayload(event), null, 2)}</pre>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    width: 90%;
    max-width: 700px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid #30363d;
  }

  .header-title {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .event-badge {
    font-size: 10px;
    text-transform: uppercase;
    padding: 4px 8px;
    border-radius: 4px;
    color: white;
    font-weight: 600;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 16px;
    color: #c9d1d9;
    font-weight: 600;
  }

  .close-btn {
    background: none;
    border: none;
    color: #8b949e;
    font-size: 18px;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
  }

  .close-btn:hover {
    background: #30363d;
    color: #c9d1d9;
  }

  .modal-body {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .event-meta {
    padding: 16px 20px;
    border-bottom: 1px solid #30363d;
    background: #0d1117;
  }

  .meta-row {
    font-size: 13px;
    margin-bottom: 6px;
  }

  .meta-row:last-child {
    margin-bottom: 0;
  }

  .meta-row .label {
    color: #8b949e;
    min-width: 70px;
    display: inline-block;
  }

  .meta-row .value {
    color: #c9d1d9;
  }

  .event-content {
    flex: 1;
    padding: 16px 20px;
    overflow-y: auto;
  }

  .event-content h3 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #8b949e;
    margin: 0 0 12px 0;
  }

  .content-text,
  .content-json {
    margin: 0;
    font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
    font-size: 13px;
    color: #c9d1d9;
    white-space: pre-wrap;
    word-wrap: break-word;
    line-height: 1.5;
    background: #0d1117;
    padding: 12px;
    border-radius: 6px;
    border: 1px solid #21262d;
  }

  .content-json {
    color: #a5d6ff;
  }
</style>
