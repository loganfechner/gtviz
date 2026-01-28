<script>
  import { createEventDispatcher } from 'svelte';
  import CopyButton from './CopyButton.svelte';

  export let bead = null;

  const dispatch = createEventDispatcher();

  function getPriorityColor(priority) {
    switch (priority) {
      case 'critical': return '#f85149';
      case 'high': return '#f0883e';
      case 'normal': return '#58a6ff';
      case 'low': return '#8b949e';
      default: return '#8b949e';
    }
  }

  function getStatusColor(status) {
    switch (status) {
      case 'open': return '#58a6ff';
      case 'hooked': return '#a371f7';
      case 'in_progress': return '#f0883e';
      case 'closed': case 'done': return '#3fb950';
      default: return '#8b949e';
    }
  }

  function formatTime(timestamp) {
    if (!timestamp) return '-';
    const d = new Date(timestamp);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function close() {
    dispatch('close');
  }

  function handleKeydown(e) {
    if (e.key === 'Escape') close();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if bead}
  <div class="modal-backdrop" on:click={close} role="button" tabindex="0" on:keydown={handleKeydown}>
    <div class="modal" on:click|stopPropagation role="dialog" aria-modal="true">
      <div class="modal-header">
        <div class="header-left">
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
        <button class="close-btn" on:click={close} aria-label="Close">X</button>
      </div>

      <div class="modal-body">
        <h2 class="bead-title">{bead.title || 'Untitled'}</h2>

        {#if bead.labels && bead.labels.length > 0}
          <div class="labels">
            {#each bead.labels as label}
              <span class="label">{label}</span>
            {/each}
          </div>
        {/if}

        <div class="section">
          <h3>Details</h3>
          <div class="meta-grid">
            <div class="meta-item">
              <span class="meta-label">Owner</span>
              <span class="meta-value">{bead.owner || '-'}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Assignee</span>
              <span class="meta-value">{bead.assignee || '-'}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Type</span>
              <span class="meta-value">{bead.type || '-'}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Rig</span>
              <span class="meta-value">{bead.rig || '-'}</span>
            </div>
          </div>
        </div>

        {#if bead.description}
          <div class="section">
            <h3>Description</h3>
            <div class="description">
              <pre>{bead.description}</pre>
            </div>
          </div>
        {/if}

        {#if bead.notes && bead.notes.length > 0}
          <div class="section">
            <h3>Notes</h3>
            <div class="notes">
              {#each bead.notes as note}
                <div class="note">
                  <div class="note-header">
                    <span class="note-author">{note.author || 'Unknown'}</span>
                    <span class="note-time">{formatTime(note.timestamp)}</span>
                  </div>
                  <pre class="note-content">{note.content}</pre>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <div class="section">
          <h3>Lifecycle</h3>
          <div class="lifecycle">
            <div class="lifecycle-item">
              <span class="lifecycle-label">Created</span>
              <span class="lifecycle-value">{formatTime(bead.createdAt)}</span>
            </div>
            <div class="lifecycle-item">
              <span class="lifecycle-label">Updated</span>
              <span class="lifecycle-value">{formatTime(bead.updatedAt)}</span>
            </div>
            {#if bead.closedAt}
              <div class="lifecycle-item">
                <span class="lifecycle-label">Closed</span>
                <span class="lifecycle-value">{formatTime(bead.closedAt)}</span>
              </div>
            {/if}
          </div>
          {#if bead.statusHistory && bead.statusHistory.length > 0}
            <div class="status-history">
              <h4>Status History</h4>
              {#each bead.statusHistory as change}
                <div class="history-item">
                  <span class="history-status" style="color: {getStatusColor(change.status)}">
                    {change.status}
                  </span>
                  <span class="history-time">{formatTime(change.timestamp)}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        {#if bead.dependsOn && bead.dependsOn.length > 0}
          <div class="section">
            <h3>Dependencies</h3>
            <div class="dependencies">
              {#each bead.dependsOn as dep}
                <div class="dependency">{dep}</div>
              {/each}
            </div>
          </div>
        {/if}
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

  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .bead-id {
    font-family: monospace;
    font-size: 13px;
    color: #58a6ff;
  }

  .bead-status {
    font-size: 11px;
    text-transform: uppercase;
    font-weight: 600;
    padding: 2px 8px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
  }

  .bead-priority {
    font-size: 10px;
    text-transform: uppercase;
    font-weight: 600;
    padding: 2px 6px;
    border: 1px solid currentColor;
    border-radius: 4px;
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
    padding: 20px;
  }

  .bead-title {
    margin: 0 0 16px 0;
    font-size: 18px;
    color: #e6edf3;
    font-weight: 600;
    line-height: 1.4;
  }

  .labels {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 20px;
  }

  .label {
    font-size: 11px;
    padding: 2px 8px;
    background: #21262d;
    border: 1px solid #30363d;
    border-radius: 12px;
    color: #c9d1d9;
  }

  .section {
    margin-bottom: 24px;
  }

  .section h3 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #8b949e;
    margin: 0 0 12px 0;
    padding-bottom: 8px;
    border-bottom: 1px solid #21262d;
  }

  .meta-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  .meta-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .meta-label {
    font-size: 11px;
    color: #6e7681;
  }

  .meta-value {
    font-size: 13px;
    color: #c9d1d9;
  }

  .description pre {
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

  .notes {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .note {
    background: #0d1117;
    border: 1px solid #21262d;
    border-radius: 6px;
    padding: 12px;
  }

  .note-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .note-author {
    font-size: 12px;
    color: #58a6ff;
    font-weight: 500;
  }

  .note-time {
    font-size: 11px;
    color: #6e7681;
  }

  .note-content {
    margin: 0;
    font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
    font-size: 12px;
    color: #c9d1d9;
    white-space: pre-wrap;
    word-wrap: break-word;
    line-height: 1.4;
  }

  .lifecycle {
    display: flex;
    gap: 24px;
    margin-bottom: 16px;
  }

  .lifecycle-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .lifecycle-label {
    font-size: 11px;
    color: #6e7681;
  }

  .lifecycle-value {
    font-size: 13px;
    color: #c9d1d9;
  }

  .status-history h4 {
    font-size: 11px;
    color: #6e7681;
    margin: 0 0 8px 0;
    font-weight: 400;
  }

  .history-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 0;
    border-bottom: 1px solid #21262d;
  }

  .history-item:last-child {
    border-bottom: none;
  }

  .history-status {
    font-size: 11px;
    text-transform: uppercase;
    font-weight: 600;
    min-width: 80px;
  }

  .history-time {
    font-size: 12px;
    color: #8b949e;
  }

  .dependencies {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .dependency {
    font-family: monospace;
    font-size: 12px;
    color: #58a6ff;
    padding: 6px 10px;
    background: #0d1117;
    border: 1px solid #21262d;
    border-radius: 4px;
  }
</style>
