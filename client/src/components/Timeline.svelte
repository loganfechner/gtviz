<script>
  import { createEventDispatcher } from 'svelte';

  export let events = [];
  export let startTime = null;
  export let endTime = null;
  export let currentTime = null;
  export let isPlaying = false;
  export let isLive = true;
  export let playbackSpeed = 1;

  const dispatch = createEventDispatcher();

  // Format time for display
  function formatTime(isoString) {
    if (!isoString) return '--:--:--';
    const date = new Date(isoString);
    return date.toLocaleTimeString();
  }

  // Format relative time
  function formatRelative(isoString) {
    if (!isoString) return '';
    const diff = Date.now() - new Date(isoString).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m ago`;
  }

  // Calculate position on timeline (0-100%)
  function getPosition(timestamp) {
    if (!startTime || !endTime || !timestamp) return 0;
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    const time = new Date(timestamp).getTime();
    if (end === start) return 50;
    return ((time - start) / (end - start)) * 100;
  }

  // Handle scrubber drag/click
  function handleScrubberClick(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));

    if (!startTime || !endTime) return;

    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    const targetTime = new Date(start + (end - start) * (percent / 100));

    dispatch('seek', { timestamp: targetTime.toISOString() });
  }

  // Handle event marker click
  function handleEventClick(event, e) {
    e.stopPropagation();
    dispatch('seek', { timestamp: event.timestamp });
  }

  function togglePlay() {
    dispatch('togglePlay');
  }

  function goLive() {
    dispatch('goLive');
  }

  function setSpeed(speed) {
    dispatch('setSpeed', { speed });
  }

  $: hasTimeline = startTime && endTime;
  $: currentPosition = getPosition(currentTime);
  $: eventMarkers = events.map(e => ({
    ...e,
    position: getPosition(e.timestamp),
    changeCount: e.changes ? e.changes.length : 0
  }));
</script>

<div class="timeline-container">
  <div class="timeline-header">
    <div class="timeline-title">
      <span class="label">Timeline</span>
      {#if isLive}
        <span class="live-badge">LIVE</span>
      {:else}
        <span class="replay-badge">REPLAY</span>
      {/if}
    </div>
    <div class="timeline-range">
      {#if hasTimeline}
        <span class="time-label">{formatTime(startTime)}</span>
        <span class="separator">to</span>
        <span class="time-label">{formatTime(endTime)}</span>
        <span class="relative">({formatRelative(startTime)})</span>
      {:else}
        <span class="no-data">No timeline data yet</span>
      {/if}
    </div>
  </div>

  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <div
    class="timeline-scrubber"
    on:click={handleScrubberClick}
    on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleScrubberClick(e); }}
    role="slider"
    tabindex="0"
    aria-valuenow={currentPosition}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-label="Timeline scrubber"
  >
    <div class="track">
      <!-- Event markers -->
      {#each eventMarkers as event}
        <button
          class="event-marker"
          style="left: {event.position}%"
          on:click={(e) => handleEventClick(event, e)}
          title="{formatTime(event.timestamp)}: {event.changeCount} change(s)"
        >
          <span class="marker-dot"></span>
        </button>
      {/each}

      <!-- Current position indicator -->
      {#if hasTimeline && currentTime}
        <div class="position-indicator" style="left: {currentPosition}%">
          <div class="indicator-line"></div>
          <div class="indicator-time">{formatTime(currentTime)}</div>
        </div>
      {/if}
    </div>
  </div>

  <div class="timeline-controls">
    <div class="playback-controls">
      {#if isPlaying}
        <button class="control-btn" on:click={togglePlay} title="Pause">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <rect x="6" y="4" width="4" height="16" fill="currentColor"/>
            <rect x="14" y="4" width="4" height="16" fill="currentColor"/>
          </svg>
        </button>
      {:else}
        <button class="control-btn" on:click={togglePlay} title="Play" disabled={isLive || !hasTimeline}>
          <svg viewBox="0 0 24 24" width="20" height="20">
            <polygon points="5,3 19,12 5,21" fill="currentColor"/>
          </svg>
        </button>
      {/if}

      <button class="control-btn live-btn" class:active={isLive} on:click={goLive} title="Go Live">
        Live
      </button>
    </div>

    <div class="speed-controls">
      <span class="speed-label">Speed:</span>
      {#each [0.5, 1, 2, 5] as speed}
        <button
          class="speed-btn"
          class:active={playbackSpeed === speed}
          on:click={() => setSpeed(speed)}
        >
          {speed}x
        </button>
      {/each}
    </div>

    <div class="event-count">
      {events.length} event{events.length !== 1 ? 's' : ''}
    </div>
  </div>
</div>

<style>
  .timeline-container {
    background: #16213e;
    border-top: 1px solid #0f3460;
    padding: 1rem 2rem;
  }

  .timeline-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
  }

  .timeline-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .label {
    font-size: 0.875rem;
    font-weight: 600;
    color: #e94560;
  }

  .live-badge {
    font-size: 0.65rem;
    padding: 0.125rem 0.375rem;
    background: #4ade80;
    color: #000;
    border-radius: 3px;
    font-weight: 700;
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }

  .replay-badge {
    font-size: 0.65rem;
    padding: 0.125rem 0.375rem;
    background: #fbbf24;
    color: #000;
    border-radius: 3px;
    font-weight: 700;
  }

  .timeline-range {
    font-size: 0.75rem;
    color: #888;
  }

  .time-label {
    color: #ccc;
    font-family: monospace;
  }

  .separator {
    margin: 0 0.25rem;
  }

  .relative {
    margin-left: 0.5rem;
    color: #666;
  }

  .no-data {
    color: #666;
    font-style: italic;
  }

  .timeline-scrubber {
    position: relative;
    height: 40px;
    cursor: pointer;
    margin-bottom: 0.75rem;
  }

  .track {
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    height: 4px;
    background: #0f3460;
    border-radius: 2px;
    transform: translateY(-50%);
  }

  .event-marker {
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    background: none;
    border: none;
    padding: 0.5rem;
    cursor: pointer;
    z-index: 1;
  }

  .marker-dot {
    display: block;
    width: 8px;
    height: 8px;
    background: #e94560;
    border-radius: 50%;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .event-marker:hover .marker-dot {
    transform: scale(1.5);
    box-shadow: 0 0 8px #e94560;
  }

  .position-indicator {
    position: absolute;
    top: 50%;
    transform: translateX(-50%);
    z-index: 2;
    pointer-events: none;
  }

  .indicator-line {
    width: 2px;
    height: 24px;
    background: #4ade80;
    margin: 0 auto;
    transform: translateY(-50%);
    box-shadow: 0 0 6px #4ade80;
  }

  .indicator-time {
    position: absolute;
    top: -20px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 0.65rem;
    color: #4ade80;
    font-family: monospace;
    white-space: nowrap;
  }

  .timeline-controls {
    display: flex;
    align-items: center;
    gap: 1.5rem;
  }

  .playback-controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .control-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: #0f3460;
    border: 1px solid #e94560;
    color: #e94560;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .control-btn:hover:not(:disabled) {
    background: #e94560;
    color: #fff;
  }

  .control-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .live-btn {
    width: auto;
    padding: 0 0.75rem;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .live-btn.active {
    background: #4ade80;
    border-color: #4ade80;
    color: #000;
  }

  .speed-controls {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .speed-label {
    font-size: 0.75rem;
    color: #666;
    margin-right: 0.25rem;
  }

  .speed-btn {
    padding: 0.25rem 0.5rem;
    font-size: 0.7rem;
    background: #0f3460;
    border: 1px solid #333;
    color: #888;
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .speed-btn:hover {
    border-color: #e94560;
    color: #e94560;
  }

  .speed-btn.active {
    background: #e94560;
    border-color: #e94560;
    color: #fff;
  }

  .event-count {
    margin-left: auto;
    font-size: 0.75rem;
    color: #666;
  }
</style>
