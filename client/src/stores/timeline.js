/**
 * Timeline Store
 *
 * Svelte store for managing timeline state, playback, and historical data.
 */

import { writable, derived, get } from 'svelte/store';

// Timeline mode
export const MODE = {
  LIVE: 'live',
  REPLAY: 'replay'
};

// Playback speeds
export const PLAYBACK_SPEEDS = [0.5, 1, 2, 4];

// Core stores
export const mode = writable(MODE.LIVE);
export const events = writable([]);
export const markers = writable([]);
export const bounds = writable({ start: null, end: null });

// Playback state
export const isPlaying = writable(false);
export const playbackSpeed = writable(1);
export const currentTime = writable(null);

// Replay state (when in replay mode)
export const replayState = writable(null);

// Derived: formatted current time for display
export const currentTimeFormatted = derived(
  [currentTime, mode],
  ([$currentTime, $mode]) => {
    if ($mode === MODE.LIVE || !$currentTime) {
      return 'Live';
    }
    const date = new Date($currentTime);
    return date.toLocaleTimeString();
  }
);

// Derived: progress through timeline (0-1)
export const timelineProgress = derived(
  [currentTime, bounds],
  ([$currentTime, $bounds]) => {
    if (!$bounds.start || !$bounds.end || !$currentTime) {
      return 1; // Default to end (live)
    }
    const start = new Date($bounds.start).getTime();
    const end = new Date($bounds.end).getTime();
    const current = new Date($currentTime).getTime();
    const range = end - start;
    if (range <= 0) return 1;
    return Math.max(0, Math.min(1, (current - start) / range));
  }
);

// Playback interval reference
let playbackInterval = null;

/**
 * Initialize timeline with events from server
 * @param {Array} eventList - Array of events
 * @param {Object} timelineBounds - { start, end } timestamps
 * @param {Array} eventMarkers - Array of event markers
 */
export function initTimeline(eventList, timelineBounds, eventMarkers) {
  events.set(eventList || []);
  bounds.set(timelineBounds || { start: null, end: null });
  markers.set(eventMarkers || []);

  // Initialize currentTime to end (live position)
  if (timelineBounds?.end) {
    currentTime.set(timelineBounds.end);
  }
}

/**
 * Update timeline with new event
 * @param {Object} event - New event to add
 */
export function addEvent(event) {
  events.update(e => [...e, event]);
  markers.update(m => [...m, {
    timestamp: event.timestamp,
    type: event.type,
    hasChanges: event.data?.changes?.length > 0
  }]);

  // Update bounds
  bounds.update(b => ({
    start: b.start || event.timestamp,
    end: event.timestamp
  }));

  // If in live mode, update current time
  if (get(mode) === MODE.LIVE) {
    currentTime.set(event.timestamp);
  }
}

/**
 * Seek to a specific time in the timeline
 * @param {string|Date} time - Target timestamp
 * @param {WebSocket} ws - WebSocket connection for fetching state
 */
export function seekToTime(time, ws) {
  const timestamp = typeof time === 'string' ? time : time.toISOString();
  currentTime.set(timestamp);
  mode.set(MODE.REPLAY);

  // Request historical state from server
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'timeline:getState',
      timestamp
    }));
  }
}

/**
 * Seek to a position on the timeline (0-1)
 * @param {number} progress - Position as fraction (0 = start, 1 = end)
 * @param {WebSocket} ws - WebSocket connection
 */
export function seekToProgress(progress, ws) {
  const b = get(bounds);
  if (!b.start || !b.end) return;

  const start = new Date(b.start).getTime();
  const end = new Date(b.end).getTime();
  const target = start + (end - start) * progress;
  const timestamp = new Date(target).toISOString();

  seekToTime(timestamp, ws);
}

/**
 * Go to live mode (current time)
 */
export function goLive() {
  mode.set(MODE.LIVE);
  isPlaying.set(false);
  stopPlayback();
  replayState.set(null);

  const b = get(bounds);
  if (b.end) {
    currentTime.set(b.end);
  }
}

/**
 * Start playback
 * @param {WebSocket} ws - WebSocket connection
 */
export function startPlayback(ws) {
  if (get(mode) === MODE.LIVE) {
    // Can't play forward from live
    return;
  }

  isPlaying.set(true);

  const speed = get(playbackSpeed);
  const eventList = get(events);
  const current = get(currentTime);
  const b = get(bounds);

  if (!current || !b.end) return;

  // Find events after current time
  const currentMs = new Date(current).getTime();
  const endMs = new Date(b.end).getTime();

  // Find next events to play
  const upcomingEvents = eventList.filter(e =>
    new Date(e.timestamp).getTime() > currentMs
  );

  if (upcomingEvents.length === 0) {
    // No more events, go live
    goLive();
    return;
  }

  let eventIndex = 0;

  playbackInterval = setInterval(() => {
    if (eventIndex >= upcomingEvents.length) {
      goLive();
      return;
    }

    const event = upcomingEvents[eventIndex];
    currentTime.set(event.timestamp);

    // Update replay state with this event's data
    if (event.type === 'hooks:updated' || event.type === 'snapshot') {
      replayState.set({
        hooks: event.data.hooks,
        timestamp: event.timestamp,
        isReplay: true
      });
    }

    eventIndex++;
  }, 1000 / speed);
}

/**
 * Pause playback
 */
export function pausePlayback() {
  isPlaying.set(false);
  stopPlayback();
}

/**
 * Toggle play/pause
 * @param {WebSocket} ws - WebSocket connection
 */
export function togglePlayback(ws) {
  if (get(isPlaying)) {
    pausePlayback();
  } else {
    startPlayback(ws);
  }
}

/**
 * Stop and clear playback interval
 */
function stopPlayback() {
  if (playbackInterval) {
    clearInterval(playbackInterval);
    playbackInterval = null;
  }
}

/**
 * Set playback speed
 * @param {number} speed - Speed multiplier
 */
export function setPlaybackSpeed(speed) {
  playbackSpeed.set(speed);

  // If currently playing, restart with new speed
  if (get(isPlaying)) {
    stopPlayback();
    // Will restart on next tick
  }
}

/**
 * Handle timeline state response from server
 * @param {Object} data - State data from server
 */
export function handleTimelineState(data) {
  replayState.set(data);
}

/**
 * Get display state based on mode
 * Returns either live state or replay state
 */
export const displayState = derived(
  [mode, replayState],
  ([$mode, $replayState]) => {
    if ($mode === MODE.REPLAY && $replayState) {
      return $replayState;
    }
    return null; // null means use live state
  }
);
