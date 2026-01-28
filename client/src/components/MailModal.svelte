<script>
  import { createEventDispatcher } from 'svelte';

  export let mail = null;
  export let allMail = [];

  const dispatch = createEventDispatcher();

  $: threadedMail = mail ? getThreadBySender(mail.from, allMail) : [];

  function getThreadBySender(sender, mails) {
    return mails
      .filter(m => m.from === sender)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  function formatTime(timestamp) {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
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

  function selectMail(m) {
    mail = m;
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if mail}
  <div class="modal-backdrop" on:click={close} role="button" tabindex="0" on:keydown={handleKeydown}>
    <div class="modal" on:click|stopPropagation role="dialog" aria-modal="true">
      <div class="modal-header">
        <h2>Mail from {mail.from}</h2>
        <button class="close-btn" on:click={close} aria-label="Close">X</button>
      </div>

      <div class="modal-body">
        <div class="thread-sidebar">
          <h3>Thread ({threadedMail.length})</h3>
          <div class="thread-list">
            {#each threadedMail as m}
              <button
                class="thread-item"
                class:active={m.timestamp === mail.timestamp && m.path === mail.path}
                on:click={() => selectMail(m)}
              >
                <span class="thread-to">{m.to}</span>
                <span class="thread-time">{formatTime(m.timestamp)}</span>
                <span class="thread-preview">{m.subject || m.preview}</span>
              </button>
            {/each}
          </div>
        </div>

        <div class="mail-content">
          <div class="mail-header-info">
            <div class="mail-meta">
              <span class="label">From:</span> <span class="value">{mail.from}</span>
            </div>
            <div class="mail-meta">
              <span class="label">To:</span> <span class="value">{mail.to}</span>
            </div>
            <div class="mail-meta">
              <span class="label">Date:</span> <span class="value">{formatTime(mail.timestamp)}</span>
            </div>
            {#if mail.subject}
              <div class="mail-meta">
                <span class="label">Subject:</span> <span class="value">{mail.subject}</span>
              </div>
            {/if}
          </div>
          <div class="mail-body">
            <pre>{mail.content || mail.preview}</pre>
          </div>
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
    max-width: 900px;
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
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .thread-sidebar {
    width: 240px;
    border-right: 1px solid #30363d;
    display: flex;
    flex-direction: column;
    background: #0d1117;
  }

  .thread-sidebar h3 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #8b949e;
    padding: 12px 16px;
    margin: 0;
    border-bottom: 1px solid #21262d;
  }

  .thread-list {
    flex: 1;
    overflow-y: auto;
  }

  .thread-item {
    display: block;
    width: 100%;
    text-align: left;
    padding: 10px 16px;
    background: none;
    border: none;
    border-bottom: 1px solid #21262d;
    cursor: pointer;
    transition: background 0.15s;
  }

  .thread-item:hover {
    background: #161b22;
  }

  .thread-item.active {
    background: #21262d;
    border-left: 2px solid #58a6ff;
  }

  .thread-to {
    display: block;
    font-size: 12px;
    color: #c9d1d9;
    font-weight: 500;
  }

  .thread-time {
    display: block;
    font-size: 10px;
    color: #6e7681;
    margin-top: 2px;
  }

  .thread-preview {
    display: block;
    font-size: 11px;
    color: #8b949e;
    margin-top: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mail-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .mail-header-info {
    padding: 16px 20px;
    border-bottom: 1px solid #30363d;
    background: #0d1117;
  }

  .mail-meta {
    font-size: 13px;
    margin-bottom: 6px;
  }

  .mail-meta:last-child {
    margin-bottom: 0;
  }

  .mail-meta .label {
    color: #8b949e;
    min-width: 60px;
    display: inline-block;
  }

  .mail-meta .value {
    color: #c9d1d9;
  }

  .mail-body {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
  }

  .mail-body pre {
    margin: 0;
    font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
    font-size: 13px;
    color: #c9d1d9;
    white-space: pre-wrap;
    word-wrap: break-word;
    line-height: 1.5;
  }
</style>
