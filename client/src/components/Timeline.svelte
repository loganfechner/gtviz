<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import {
    mode, MODE, bounds, markers, currentTime,
    timelineProgress, currentTimeFormatted,
    isPlaying, playbackSpeed, PLAYBACK_SPEEDS,
    seekToProgress, goLive, togglePlayback, setPlaybackSpeed
  } from '../stores/timeline.js';

  export let ws = null;

  const dispatch = createEventDispatcher();

  let trackElement;
  let isDragging = false;

  function formatTime(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatDuration(startIso, endIso) {
    if (!startIso || !endIso) return '';
    const start = new Date(startIso).getTime();
    const end = new Date(endIso).getTime();
    const minutes = Math.round((end - start) / 60000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }

  function handleTrackClick(event) {
    if (!trackElement) return;
    const rect = trackElement.getBoundingClientRect();
    const progress = (event.clientX - rect.left) / rect.width;
    seekToProgress(Math.max(0, Math.min(1, progress)), ws);
  }

  function handleMouseDown(event) {
    isDragging = true;
    handleTrackClick(event);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }

  function handleMouseMove(event) {
    if (!isDragging || !trackElement) return;
    const rect = trackElement.getBoundingClientRect();
    const progress = (event.clientX - rect.left) / rect.width;
    seekToProgress(Math.max(0, Math.min(1, progress)), ws);
  }

  function handleMouseUp() {
    isDragging = false;
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowLeft') {
      // Seek backwards 10%
      const newProgress = Math.max(0, $timelineProgress - 0.1);
      seekToProgress(newProgress, ws);
    } else if (event.key === 'ArrowRight') {
      // Seek forwards 10%
      const newProgress = Math.min(1, $timelineProgress + 0.1);
      seekToProgress(newProgress, ws);
    } else if (event.key === ' ') {
      event.preventDefault();
      togglePlayback(ws);
    } else if (event.key === 'l' || event.key === 'L') {
      goLive();
    }
  }

  // Calculate marker positions
  $: markerPositions = $markers.map(marker => {
    if (!$bounds.start || !$bounds.end) return null;
    const start = new Date($bounds.start).getTime();
    const end = new Date($bounds.end).getTime();
    const markerTime = new Date(marker.timestamp).getTime();
    const range = end - start;
    if (range <= 0) return null;
    return {
      ...marker,
      position: ((markerTime - start) / range) * 100
    };
  }).filter(Boolean);

  // Filter to only show markers with changes (to avoid visual clutter)
  $: visibleMarkers = markerPositions.filter(m => m.hasChanges);
</script>

<div class="timeline" on:keydown={handleKeyDown} tabindex="0" role="region" aria-label="Timeline controls">
  <div class="timeline-header">
    <div class="time-display">
      <span class="label">
        {#if $mode === MODE.LIVE}
          <span class="live-indicator"></span>
          Live
        {:else}
          <span class="replay-indicator"></span>
          {$currentTimeFormatted}
        {/if}
      </span>
    </div>

    <div class="controls">
      {#if $mode === MODE.REPLAY}
        <button
          class="control-btn"
          on:click={() => togglePlayback(ws)}
          title={$isPlaying ? 'Pause' : 'Play'}
        >
          {#if $isPlaying}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <rect x="3" y="2" width="4" height="12" />
              <rect x="9" y="2" width="4" height="12" />
            </svg>
          {:else}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <polygon points="3,2 14,8 3,14" />
            </svg>
          {/if}
        </button>

        <select
          class="speed-select"
          value={$playbackSpeed}
          on:change={(e) => setPlaybackSpeed(Number(e.target.value))}
        >
          {#each PLAYBACK_SPEEDS as speed}
            <option value={speed}>{speed}x</option>
          {/each}
        </select>

        <button class="control-btn live-btn" on:click={goLive}>
          Go Live
        </button>
      {/if}
    </div>
  </div>

  <div class="timeline-body">
    <span class="time-label start">{formatTime($bounds.start)}</span>

    <div
      class="track"
      bind:this={trackElement}
      on:mousedown={handleMouseDown}
      role="slider"
      tabindex="0"
      aria-label="Timeline scrubber"
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow={$timelineProgress * 100}
    >
      <div class="track-fill" style="width: {$timelineProgress * 100}%"></div>

      {#each visibleMarkers as marker}
        <div
          class="marker"
          class:has-changes={marker.hasChanges}
          style="left: {marker.position}%"
          title={formatTime(marker.timestamp)}
        ></div>
      {/each}

      <div
        class="scrubber"
        style="left: {$timelineProgress * 100}%"
      ></div>
    </div>

    <span class="time-label end">
      {formatTime($bounds.end)}
      <span class="duration">({formatDuration($bounds.start, $bounds.end)})</span>
    </span>
  </div>
</div>

<style>
  .timeline {
    background: #16213e;
    border-top: 1px solid #0f3460;
    padding: 0.75rem 1rem;
    user-select: none;
  }

  .timeline:focus {
    outline: none;
  }

  .timeline-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .time-display {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: #ccc;
  }

  .live-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #4ade80;
    box-shadow: 0 0 8px #4ade80;
    animation: pulse 2s infinite;
  }

  .replay-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #fbbf24;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .control-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.375rem 0.75rem;
    background: #0f3460;
    border: 1px solid #e94560;
    color: #e94560;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.75rem;
    transition: all 0.2s;
  }

  .control-btn:hover {
    background: #e94560;
    color: #fff;
  }

  .live-btn {
    font-weight: 600;
  }

  .speed-select {
    padding: 0.375rem 0.5rem;
    background: #0f3460;
    border: 1px solid #0f3460;
    color: #ccc;
    border-radius: 4px;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .timeline-body {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .time-label {
    font-size: 0.75rem;
    color: #888;
    white-space: nowrap;
  }

  .time-label.start {
    min-width: 50px;
  }

  .time-label.end {
    min-width: 100px;
    text-align: right;
  }

  .duration {
    color: #666;
    margin-left: 0.25rem;
  }

  .track {
    flex: 1;
    height: 8px;
    background: #0f3460;
    border-radius: 4px;
    position: relative;
    cursor: pointer;
  }

  .track-fill {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    background: linear-gradient(90deg, #e94560, #ff6b6b);
    border-radius: 4px;
    pointer-events: none;
  }

  .marker {
    position: absolute;
    top: -2px;
    width: 4px;
    height: 12px;
    background: #4ade80;
    border-radius: 2px;
    transform: translateX(-50%);
    opacity: 0.6;
    pointer-events: none;
  }

  .marker.has-changes {
    opacity: 1;
  }

  .scrubber {
    position: absolute;
    top: 50%;
    width: 16px;
    height: 16px;
    background: #e94560;
    border: 2px solid #fff;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    cursor: grab;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
    transition: transform 0.1s;
  }

  .scrubber:hover {
    transform: translate(-50%, -50%) scale(1.2);
  }

  .timeline:active .scrubber {
    cursor: grabbing;
  }
</style>
