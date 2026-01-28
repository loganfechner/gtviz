<script>
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  export let start = null;
  export let end = null;

  // Preset ranges
  const presets = [
    { label: 'Last Hour', value: 'hour', duration: 60 * 60 * 1000 },
    { label: 'Last 24h', value: '24h', duration: 24 * 60 * 60 * 1000 },
    { label: 'Last 7 Days', value: '7d', duration: 7 * 24 * 60 * 60 * 1000 },
    { label: 'Last 30 Days', value: '30d', duration: 30 * 24 * 60 * 60 * 1000 },
    { label: 'Custom', value: 'custom', duration: null }
  ];

  let selectedPreset = '24h';
  let showCustom = false;
  let customStart = '';
  let customEnd = '';

  // Format date for datetime-local input
  function formatForInput(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toISOString().slice(0, 16);
  }

  // Initialize custom inputs from props
  $: if (start && end) {
    customStart = formatForInput(start);
    customEnd = formatForInput(end);
  }

  function selectPreset(preset) {
    selectedPreset = preset.value;
    showCustom = preset.value === 'custom';

    if (preset.duration) {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - preset.duration);
      emitRange(startDate, endDate);
    }
  }

  function applyCustomRange() {
    if (customStart && customEnd) {
      const startDate = new Date(customStart);
      const endDate = new Date(customEnd);

      if (startDate < endDate) {
        emitRange(startDate, endDate);
      }
    }
  }

  function emitRange(startDate, endDate) {
    dispatch('change', {
      start: startDate.toISOString(),
      end: endDate.toISOString()
    });
  }

  // Format display range
  function formatRange(start, end) {
    if (!start || !end) return 'Select range';

    const s = new Date(start);
    const e = new Date(end);
    const duration = e.getTime() - s.getTime();

    if (duration <= 60 * 60 * 1000) {
      return 'Last hour';
    } else if (duration <= 24 * 60 * 60 * 1000) {
      return 'Last 24 hours';
    } else if (duration <= 7 * 24 * 60 * 60 * 1000) {
      return `${Math.round(duration / (24 * 60 * 60 * 1000))} days`;
    } else {
      return `${s.toLocaleDateString()} - ${e.toLocaleDateString()}`;
    }
  }
</script>

<div class="time-range-picker">
  <div class="presets">
    {#each presets as preset}
      <button
        class="preset-btn"
        class:active={selectedPreset === preset.value}
        on:click={() => selectPreset(preset)}
      >
        {preset.label}
      </button>
    {/each}
  </div>

  {#if showCustom}
    <div class="custom-range">
      <div class="date-input">
        <label for="range-start">Start</label>
        <input
          id="range-start"
          type="datetime-local"
          bind:value={customStart}
          max={customEnd || formatForInput(new Date())}
        />
      </div>
      <div class="date-input">
        <label for="range-end">End</label>
        <input
          id="range-end"
          type="datetime-local"
          bind:value={customEnd}
          min={customStart}
          max={formatForInput(new Date())}
        />
      </div>
      <button class="apply-btn" on:click={applyCustomRange}>
        Apply
      </button>
    </div>
  {/if}

  <div class="range-display">
    {formatRange(start, end)}
  </div>
</div>

<style>
  .time-range-picker {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 6px;
  }

  .presets {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .preset-btn {
    padding: 4px 10px;
    background: #21262d;
    border: 1px solid #30363d;
    border-radius: 4px;
    color: #8b949e;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .preset-btn:hover {
    background: #30363d;
    color: #c9d1d9;
  }

  .preset-btn.active {
    background: #1f6feb;
    border-color: #1f6feb;
    color: #fff;
  }

  .custom-range {
    display: flex;
    gap: 8px;
    align-items: flex-end;
    padding: 8px 0;
    border-top: 1px solid #30363d;
  }

  .date-input {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .date-input label {
    font-size: 10px;
    color: #8b949e;
    text-transform: uppercase;
  }

  .date-input input {
    padding: 4px 8px;
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 4px;
    color: #c9d1d9;
    font-size: 12px;
    outline: none;
  }

  .date-input input:focus {
    border-color: #58a6ff;
  }

  .apply-btn {
    padding: 4px 12px;
    background: #238636;
    border: none;
    border-radius: 4px;
    color: #fff;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .apply-btn:hover {
    background: #2ea043;
  }

  .range-display {
    font-size: 11px;
    color: #6e7681;
    text-align: right;
  }
</style>
