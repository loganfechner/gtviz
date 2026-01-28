<script>
  export let variant = 'default';
</script>

<div class="skeleton-row" class:event={variant === 'event'} class:bead={variant === 'bead'}>
  {#if variant === 'event'}
    <div class="skeleton-icon"></div>
    <div class="skeleton-content">
      <div class="skeleton-header">
        <div class="skeleton-text type"></div>
        <div class="skeleton-text time"></div>
      </div>
      <div class="skeleton-text detail"></div>
    </div>
  {:else if variant === 'bead'}
    <div class="skeleton-header">
      <div class="skeleton-text id"></div>
      <div class="skeleton-text status"></div>
    </div>
    <div class="skeleton-text title"></div>
    <div class="skeleton-text owner"></div>
  {:else}
    <div class="skeleton-text line"></div>
  {/if}
</div>

<style>
  .skeleton-row {
    padding: 8px 0;
    border-bottom: 1px solid #21262d;
  }

  .skeleton-row.event {
    display: flex;
    gap: 10px;
  }

  .skeleton-row.bead {
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 10px 12px;
    margin-bottom: 8px;
  }

  .skeleton-icon {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .skeleton-content {
    flex: 1;
    min-width: 0;
  }

  .skeleton-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }

  .skeleton-icon,
  .skeleton-text {
    background: linear-gradient(90deg, #21262d 25%, #30363d 50%, #21262d 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 4px;
  }

  .skeleton-text.type {
    width: 50px;
    height: 11px;
  }

  .skeleton-text.time {
    width: 60px;
    height: 10px;
  }

  .skeleton-text.detail {
    width: 80%;
    height: 12px;
  }

  .skeleton-text.id {
    width: 60px;
    height: 11px;
  }

  .skeleton-text.status {
    width: 70px;
    height: 10px;
  }

  .skeleton-text.title {
    width: 90%;
    height: 13px;
    margin-bottom: 6px;
  }

  .skeleton-text.owner {
    width: 50%;
    height: 11px;
  }

  .skeleton-text.line {
    width: 100%;
    height: 14px;
  }

  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
</style>
