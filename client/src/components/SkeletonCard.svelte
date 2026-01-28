<script>
  export let width = 160;
  export let height = 100;
</script>

<div class="skeleton-card" style="width: {width}px; height: {height}px;">
  <div class="header">
    <div class="skeleton-text short"></div>
    <div class="skeleton-badge"></div>
  </div>
  <div class="skeleton-text name"></div>
  <div class="skeleton-text task"></div>
</div>

<style>
  .skeleton-card {
    background: #161b22;
    border: 1px solid #30363d;
    border-left: 3px solid #30363d;
    border-radius: 8px;
    padding: 10px 12px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }

  .skeleton-text,
  .skeleton-badge {
    background: linear-gradient(90deg, #21262d 25%, #30363d 50%, #21262d 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 4px;
  }

  .skeleton-text.short {
    width: 40px;
    height: 10px;
  }

  .skeleton-badge {
    width: 50px;
    height: 14px;
    border-radius: 10px;
  }

  .skeleton-text.name {
    width: 80%;
    height: 14px;
    margin-bottom: 8px;
  }

  .skeleton-text.task {
    width: 60%;
    height: 11px;
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
