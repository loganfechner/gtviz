<script>
  import { toast } from '../lib/toast.js';
</script>

{#if $toast.length > 0}
  <div class="toast-container">
    {#each $toast as t (t.id)}
      <div class="toast">
        {t.message}
      </div>
    {/each}
  </div>
{/if}

<style>
  .toast-container {
    position: fixed;
    bottom: 20px;
    right: 20px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 10000;
    pointer-events: none;
  }

  .toast {
    background: #238636;
    color: #fff;
    padding: 10px 16px;
    border-radius: 6px;
    font-size: 13px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    animation: slideIn 0.2s ease-out;
  }

  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
</style>
