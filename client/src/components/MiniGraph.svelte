<script>
  import { onMount, afterUpdate } from 'svelte';
  import * as d3 from 'd3';

  export let data = [];
  export let color = '#e94560';
  export let width = 180;
  export let height = 40;
  export let showArea = true;

  let svg;

  function renderGraph() {
    if (!svg || !data || data.length < 2) return;

    // Clear previous content
    d3.select(svg).selectAll('*').remove();

    const margin = { top: 2, right: 2, bottom: 2, left: 2 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const g = d3.select(svg)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales
    const x = d3.scaleLinear()
      .domain([0, data.length - 1])
      .range([0, innerWidth]);

    const maxVal = d3.max(data) || 1;
    const y = d3.scaleLinear()
      .domain([0, maxVal * 1.1])  // Add 10% padding
      .range([innerHeight, 0]);

    // Line generator
    const line = d3.line()
      .x((d, i) => x(i))
      .y(d => y(d))
      .curve(d3.curveMonotoneX);

    // Area generator (for gradient fill)
    if (showArea) {
      const area = d3.area()
        .x((d, i) => x(i))
        .y0(innerHeight)
        .y1(d => y(d))
        .curve(d3.curveMonotoneX);

      // Create gradient
      const gradientId = `area-gradient-${Math.random().toString(36).substr(2, 9)}`;
      const defs = d3.select(svg).append('defs');
      const gradient = defs.append('linearGradient')
        .attr('id', gradientId)
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '0%')
        .attr('y2', '100%');

      gradient.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', color)
        .attr('stop-opacity', 0.3);

      gradient.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', color)
        .attr('stop-opacity', 0.05);

      // Draw area
      g.append('path')
        .datum(data)
        .attr('d', area)
        .attr('fill', `url(#${gradientId})`);
    }

    // Draw line
    g.append('path')
      .datum(data)
      .attr('d', line)
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('stroke-width', 1.5)
      .attr('stroke-linecap', 'round')
      .attr('stroke-linejoin', 'round');

    // Add dot at the end
    if (data.length > 0) {
      const lastValue = data[data.length - 1];
      g.append('circle')
        .attr('cx', x(data.length - 1))
        .attr('cy', y(lastValue))
        .attr('r', 3)
        .attr('fill', color);
    }
  }

  onMount(() => {
    renderGraph();
  });

  afterUpdate(() => {
    renderGraph();
  });
</script>

<svg bind:this={svg} {width} {height} class="mini-graph"></svg>

<style>
  .mini-graph {
    display: block;
  }
</style>
