<script>
  export let size = 16;
  export let text = '';
</script>

<span class="spinner-container">
  <svg
    class="spinner"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
  >
    <circle
      class="track"
      cx="12"
      cy="12"
      r="10"
      stroke-width="3"
    />
    <circle
      class="indicator"
      cx="12"
      cy="12"
      r="10"
      stroke-width="3"
      stroke-linecap="round"
    />
  </svg>
  {#if text}
    <span class="text">{text}</span>
  {/if}
</span>

<style>
  .spinner-container {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .spinner {
    animation: rotate 1s linear infinite;
  }

  .track {
    stroke: #30363d;
  }

  .indicator {
    stroke: #58a6ff;
    stroke-dasharray: 60 200;
    stroke-dashoffset: 0;
    animation: dash 1.5s ease-in-out infinite;
  }

  .text {
    font-size: 12px;
    color: #8b949e;
  }

  @keyframes rotate {
    100% {
      transform: rotate(360deg);
    }
  }

  @keyframes dash {
    0% {
      stroke-dasharray: 1 200;
      stroke-dashoffset: 0;
    }
    50% {
      stroke-dasharray: 60 200;
      stroke-dashoffset: -20;
    }
    100% {
      stroke-dasharray: 60 200;
      stroke-dashoffset: -62;
    }
  }
</style>
