<script>
  import { onMount, onDestroy, createEventDispatcher, afterUpdate } from 'svelte';
  import * as d3 from 'd3';
  import BeadDetailModal from './BeadDetailModal.svelte';

  const dispatch = createEventDispatcher();

  export let beads = [];
  export let loading = false;

  let container;
  let svgElement;
  let simulation;
  let width = 600;
  let height = 500;

  // Zoom and pan state
  let transform = { x: 0, y: 0, k: 1 };
  let zoom;

  // Position cache for stability
  const positionCache = new Map();
  let layoutSettled = false;

  // Selected bead for detail modal
  let selectedBead = null;

  // Hover state for highlighting
  let hoveredNode = null;

  // Stats
  $: totalBeads = beads.length;
  $: blockedBeads = beads.filter(b => b.dependsOn && b.dependsOn.length > 0).length;
  $: criticalPath = computeCriticalPath(nodes, links);

  // Build graph data
  $: beadMap = new Map(beads.map(b => [b.id, b]));

  $: nodes = beads.map(b => {
    const cached = positionCache.get(b.id);
    return {
      id: b.id,
      ...b,
      x: cached?.x ?? width / 2 + (Math.random() - 0.5) * 200,
      y: cached?.y ?? height / 2 + (Math.random() - 0.5) * 200,
      // Count how many beads depend on this one (dependents)
      dependents: beads.filter(other =>
        other.dependsOn && other.dependsOn.includes(b.id)
      ).length
    };
  });

  $: links = buildLinks(beads, beadMap);

  function buildLinks(beads, beadMap) {
    const links = [];
    for (const bead of beads) {
      if (bead.dependsOn && bead.dependsOn.length > 0) {
        for (const depId of bead.dependsOn) {
          // Only add link if the dependency exists in our bead list
          if (beadMap.has(depId)) {
            links.push({
              source: depId,
              target: bead.id,
              id: `${depId}->${bead.id}`
            });
          }
        }
      }
    }
    return links;
  }

  function computeCriticalPath(nodes, links) {
    if (nodes.length === 0) return { length: 0, path: [] };

    // Build adjacency list
    const adj = new Map();
    for (const node of nodes) {
      adj.set(node.id, []);
    }
    for (const link of links) {
      const sourceId = link.source?.id || link.source;
      const targetId = link.target?.id || link.target;
      if (adj.has(sourceId)) {
        adj.get(sourceId).push(targetId);
      }
    }

    // Find longest path using DFS with memoization
    const memo = new Map();

    function dfs(nodeId, visited) {
      if (visited.has(nodeId)) return { length: 0, path: [] }; // Cycle detected
      if (memo.has(nodeId)) return memo.get(nodeId);

      visited.add(nodeId);
      const neighbors = adj.get(nodeId) || [];

      let best = { length: 0, path: [] };
      for (const neighbor of neighbors) {
        const result = dfs(neighbor, new Set(visited));
        if (result.length >= best.length) {
          best = { length: result.length + 1, path: [neighbor, ...result.path] };
        }
      }

      memo.set(nodeId, best);
      return best;
    }

    let maxPath = { length: 0, path: [] };
    for (const node of nodes) {
      const result = dfs(node.id, new Set());
      if (result.length > maxPath.length) {
        maxPath = { length: result.length, path: [node.id, ...result.path] };
      }
    }

    return maxPath;
  }

  function getStatusColor(status) {
    switch (status) {
      case 'done': case 'closed': return '#3fb950';
      case 'hooked': case 'in_progress': return '#f0883e';
      case 'open': return '#58a6ff';
      default: return '#8b949e';
    }
  }

  function getPriorityColor(priority) {
    switch (priority) {
      case 'critical': return '#f85149';
      case 'high': return '#f0883e';
      case 'normal': return '#58a6ff';
      case 'low': return '#8b949e';
      default: return '#58a6ff';
    }
  }

  function getNodeSize(node) {
    // Larger nodes for more dependents (bottlenecks)
    const base = 8;
    return base + Math.min(node.dependents * 3, 12);
  }

  function isOnCriticalPath(nodeId) {
    return criticalPath.path.includes(nodeId);
  }

  function isHighlighted(nodeId) {
    if (!hoveredNode) return false;
    const hovered = nodes.find(n => n.id === hoveredNode);
    if (!hovered) return false;

    // Highlight if this node is connected to hovered node
    if (nodeId === hoveredNode) return true;
    if (hovered.dependsOn && hovered.dependsOn.includes(nodeId)) return true;
    const thisNode = nodes.find(n => n.id === nodeId);
    if (thisNode && thisNode.dependsOn && thisNode.dependsOn.includes(hoveredNode)) return true;

    return false;
  }

  function getNodePosition(id) {
    const node = nodes.find(n => n.id === id);
    return node ? { x: node.x || width/2, y: node.y || height/2 } : { x: width/2, y: height/2 };
  }

  onMount(() => {
    const rect = container.getBoundingClientRect();
    width = rect.width;
    height = rect.height;

    initSimulation();
    initZoom();

    const resizeObserver = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      if (simulation) {
        simulation.force('center', d3.forceCenter(width / 2, height / 2));
        if (layoutSettled) {
          simulation.alpha(0.1).restart();
        }
      }
    });
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  });

  function initZoom() {
    zoom = d3.zoom()
      .scaleExtent([0.25, 4])
      .on('zoom', (event) => {
        transform = { x: event.transform.x, y: event.transform.y, k: event.transform.k };
      });

    d3.select(svgElement)
      .call(zoom)
      .on('dblclick.zoom', null);
  }

  onDestroy(() => {
    if (simulation) {
      simulation.stop();
      simulation = null;
    }
    if (svgElement && zoom) {
      d3.select(svgElement).on('.zoom', null);
    }
  });

  function initSimulation() {
    simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(100).strength(0.5))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(30))
      .alphaDecay(0.05)
      .velocityDecay(0.4)
      .on('tick', () => {
        for (const node of nodes) {
          if (node.x !== undefined && node.y !== undefined) {
            positionCache.set(node.id, { x: node.x, y: node.y });
          }
        }
        nodes = [...nodes];
        links = [...links];
      })
      .on('end', () => {
        layoutSettled = true;
      });
  }

  let prevBeadCount = 0;

  afterUpdate(() => {
    if (simulation && nodes.length > 0) {
      const countChanged = beads.length !== prevBeadCount;
      prevBeadCount = beads.length;

      simulation.nodes(nodes);
      simulation.force('link').links(links);

      if (countChanged && !layoutSettled) {
        simulation.alpha(0.5).restart();
      } else if (countChanged) {
        simulation.alpha(0.2).restart();
      }
    }
  });

  // Drag handlers
  let dragNode = null;
  let dragOffset = { x: 0, y: 0 };

  function startDrag(e, node) {
    e.preventDefault();
    e.stopPropagation();
    dragNode = node;
    const rect = container.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left - transform.x) / transform.k;
    const mouseY = (e.clientY - rect.top - transform.y) / transform.k;
    dragOffset = {
      x: mouseX - (node.x || width / 2),
      y: mouseY - (node.y || height / 2)
    };

    simulation.alphaTarget(0.1).restart();

    window.addEventListener('mousemove', onDrag);
    window.addEventListener('mouseup', endDrag);
  }

  function onDrag(e) {
    if (!dragNode) return;
    const rect = container.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left - transform.x) / transform.k;
    const mouseY = (e.clientY - rect.top - transform.y) / transform.k;
    const x = mouseX - dragOffset.x;
    const y = mouseY - dragOffset.y;

    dragNode.fx = x;
    dragNode.fy = y;
    dragNode.x = x;
    dragNode.y = y;
    positionCache.set(dragNode.id, { x, y });
    nodes = [...nodes];
  }

  function endDrag() {
    if (dragNode) {
      dragNode.fx = null;
      dragNode.fy = null;
      simulation.alphaTarget(0);
      dragNode = null;
    }
    window.removeEventListener('mousemove', onDrag);
    window.removeEventListener('mouseup', endDrag);
  }

  function handleNodeClick(node) {
    selectedBead = node;
  }

  function closeModal() {
    selectedBead = null;
  }

  function zoomIn() {
    d3.select(svgElement)
      .transition()
      .duration(300)
      .call(zoom.scaleBy, 1.3);
  }

  function zoomOut() {
    d3.select(svgElement)
      .transition()
      .duration(300)
      .call(zoom.scaleBy, 0.7);
  }

  function resetZoom() {
    d3.select(svgElement)
      .transition()
      .duration(300)
      .call(zoom.transform, d3.zoomIdentity);
  }

  function fitToView() {
    if (nodes.length === 0) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const node of nodes) {
      const x = node.x || width / 2;
      const y = node.y || height / 2;
      minX = Math.min(minX, x - 30);
      maxX = Math.max(maxX, x + 30);
      minY = Math.min(minY, y - 30);
      maxY = Math.max(maxY, y + 30);
    }

    const boxWidth = maxX - minX;
    const boxHeight = maxY - minY;
    const scale = Math.min(0.9 * width / boxWidth, 0.9 * height / boxHeight, 2);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const newTransform = d3.zoomIdentity
      .translate(width / 2 - centerX * scale, height / 2 - centerY * scale)
      .scale(scale);

    d3.select(svgElement)
      .transition()
      .duration(500)
      .call(zoom.transform, newTransform);
  }
</script>

<div class="dependency-graph" bind:this={container}>
  {#if loading}
    <div class="loading">Loading dependency data...</div>
  {:else if beads.length === 0}
    <div class="empty">No beads to display</div>
  {:else}
    <!-- Stats bar -->
    <div class="stats-bar">
      <div class="stat">
        <span class="label">Total</span>
        <span class="value">{totalBeads}</span>
      </div>
      <div class="stat">
        <span class="label">Blocked</span>
        <span class="value">{blockedBeads}</span>
      </div>
      <div class="stat">
        <span class="label">Critical Path</span>
        <span class="value critical">{criticalPath.length}</span>
      </div>
    </div>

    <!-- Legend -->
    <div class="legend">
      <div class="legend-item">
        <span class="dot" style="background: #58a6ff;"></span>
        <span>Open</span>
      </div>
      <div class="legend-item">
        <span class="dot" style="background: #f0883e;"></span>
        <span>In Progress</span>
      </div>
      <div class="legend-item">
        <span class="dot" style="background: #3fb950;"></span>
        <span>Done</span>
      </div>
      <div class="legend-item">
        <span class="line critical-line"></span>
        <span>Critical Path</span>
      </div>
    </div>

    <svg bind:this={svgElement} {width} {height}>
      <defs>
        <marker
          id="dep-arrow"
          viewBox="0 0 10 10"
          refX="20"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#484f58"/>
        </marker>
        <marker
          id="dep-arrow-critical"
          viewBox="0 0 10 10"
          refX="20"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#f85149"/>
        </marker>
        <marker
          id="dep-arrow-highlight"
          viewBox="0 0 10 10"
          refX="20"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#58a6ff"/>
        </marker>
      </defs>

      <g transform="translate({transform.x}, {transform.y}) scale({transform.k})">
        <!-- Links -->
        {#each links as link (link.id)}
          {@const source = getNodePosition(link.source?.id || link.source)}
          {@const target = getNodePosition(link.target?.id || link.target)}
          {@const sourceId = link.source?.id || link.source}
          {@const targetId = link.target?.id || link.target}
          {@const isCritical = isOnCriticalPath(sourceId) && isOnCriticalPath(targetId)}
          {@const isHl = isHighlighted(sourceId) && isHighlighted(targetId)}
          <line
            class="link"
            class:critical={isCritical}
            class:highlighted={isHl}
            x1={source.x}
            y1={source.y}
            x2={target.x}
            y2={target.y}
            stroke={isCritical ? '#f85149' : isHl ? '#58a6ff' : '#484f58'}
            stroke-width={isCritical ? 2.5 : isHl ? 2 : 1.5}
            stroke-dasharray={isCritical ? 'none' : 'none'}
            marker-end={isCritical ? 'url(#dep-arrow-critical)' : isHl ? 'url(#dep-arrow-highlight)' : 'url(#dep-arrow)'}
          />
        {/each}

        <!-- Nodes -->
        {#each nodes as node (node.id)}
          {@const isCritical = isOnCriticalPath(node.id)}
          {@const isHl = isHighlighted(node.id)}
          <g
            class="node"
            class:critical={isCritical}
            class:highlighted={isHl}
            class:hovered={hoveredNode === node.id}
            transform="translate({node.x || width/2}, {node.y || height/2})"
            on:mousedown={(e) => startDrag(e, node)}
            on:click={() => handleNodeClick(node)}
            on:mouseenter={() => hoveredNode = node.id}
            on:mouseleave={() => hoveredNode = null}
            role="button"
            tabindex="0"
          >
            <!-- Glow effect for critical path nodes -->
            {#if isCritical}
              <circle
                r={getNodeSize(node) + 4}
                fill="none"
                stroke="#f85149"
                stroke-width="2"
                opacity="0.5"
              />
            {/if}

            <!-- Main node circle -->
            <circle
              r={getNodeSize(node)}
              fill={getStatusColor(node.status)}
              stroke={isCritical ? '#f85149' : isHl ? '#58a6ff' : '#30363d'}
              stroke-width={isCritical || isHl ? 2 : 1}
            />

            <!-- Priority indicator -->
            {#if node.priority === 'critical' || node.priority === 'high'}
              <circle
                cx={getNodeSize(node) * 0.6}
                cy={-getNodeSize(node) * 0.6}
                r="4"
                fill={getPriorityColor(node.priority)}
              />
            {/if}

            <!-- Bottleneck indicator (many dependents) -->
            {#if node.dependents >= 3}
              <text
                y={getNodeSize(node) + 12}
                text-anchor="middle"
                class="bottleneck-label"
              >
                {node.dependents} deps
              </text>
            {/if}
          </g>
        {/each}
      </g>
    </svg>

    <!-- Node labels (HTML for better rendering) -->
    <div class="labels" style="transform: translate({transform.x}px, {transform.y}px) scale({transform.k}); transform-origin: 0 0;">
      {#each nodes as node (node.id)}
        <div
          class="node-label"
          class:critical={isOnCriticalPath(node.id)}
          class:hovered={hoveredNode === node.id}
          style="left: {(node.x || width/2)}px; top: {(node.y || height/2) + getNodeSize(node) + 4}px;"
        >
          {node.id}
        </div>
      {/each}
    </div>

    <!-- Zoom controls -->
    <div class="zoom-controls">
      <button class="zoom-btn" on:click={zoomIn} title="Zoom in">+</button>
      <span class="zoom-level">{Math.round(transform.k * 100)}%</span>
      <button class="zoom-btn" on:click={zoomOut} title="Zoom out">-</button>
      <button class="zoom-btn" on:click={resetZoom} title="Reset">R</button>
      <button class="zoom-btn" on:click={fitToView} title="Fit">F</button>
    </div>

    <!-- Tooltip for hovered node -->
    {#if hoveredNode}
      {@const hovered = nodes.find(n => n.id === hoveredNode)}
      {#if hovered}
        <div class="tooltip" style="left: {(hovered.x || 0) * transform.k + transform.x + 20}px; top: {(hovered.y || 0) * transform.k + transform.y - 20}px;">
          <div class="tooltip-title">{hovered.id}</div>
          <div class="tooltip-subtitle">{hovered.title || 'Untitled'}</div>
          <div class="tooltip-meta">
            <span class="status" style="color: {getStatusColor(hovered.status)}">{hovered.status}</span>
            {#if hovered.priority}
              <span class="priority" style="color: {getPriorityColor(hovered.priority)}">{hovered.priority}</span>
            {/if}
          </div>
          {#if hovered.dependsOn && hovered.dependsOn.length > 0}
            <div class="tooltip-deps">Depends on: {hovered.dependsOn.length}</div>
          {/if}
          {#if hovered.dependents > 0}
            <div class="tooltip-deps">Blocking: {hovered.dependents}</div>
          {/if}
        </div>
      {/if}
    {/if}
  {/if}
</div>

{#if selectedBead}
  <BeadDetailModal bead={selectedBead} on:close={closeModal} />
{/if}

<style>
  .dependency-graph {
    width: 100%;
    height: 100%;
    position: relative;
    background: #0d1117;
    overflow: hidden;
  }

  .loading, .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #8b949e;
    font-size: 14px;
  }

  .stats-bar {
    position: absolute;
    top: 8px;
    left: 8px;
    display: flex;
    gap: 12px;
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 6px 12px;
    z-index: 10;
  }

  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .stat .label {
    font-size: 10px;
    color: #8b949e;
    text-transform: uppercase;
  }

  .stat .value {
    font-size: 16px;
    font-weight: 600;
    color: #c9d1d9;
    font-family: ui-monospace, monospace;
  }

  .stat .value.critical {
    color: #f85149;
  }

  .legend {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    gap: 12px;
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 6px 12px;
    z-index: 10;
    font-size: 11px;
    color: #8b949e;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .legend .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .legend .line {
    width: 16px;
    height: 2px;
    background: #484f58;
  }

  .legend .critical-line {
    background: #f85149;
  }

  svg {
    position: absolute;
    top: 0;
    left: 0;
  }

  .node {
    cursor: grab;
  }

  .node:active {
    cursor: grabbing;
  }

  .link {
    transition: stroke 0.15s, stroke-width 0.15s;
  }

  .labels {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .node-label {
    position: absolute;
    transform: translate(-50%, 0);
    font-size: 9px;
    font-family: ui-monospace, monospace;
    color: #8b949e;
    white-space: nowrap;
    text-overflow: ellipsis;
    max-width: 80px;
    overflow: hidden;
    text-align: center;
  }

  .node-label.critical {
    color: #f85149;
    font-weight: 600;
  }

  .node-label.hovered {
    color: #58a6ff;
    font-weight: 600;
  }

  .bottleneck-label {
    font-size: 8px;
    fill: #f0883e;
    font-family: ui-monospace, monospace;
  }

  .zoom-controls {
    position: absolute;
    bottom: 8px;
    right: 8px;
    display: flex;
    align-items: center;
    gap: 4px;
    background: #21262d;
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 4px;
    z-index: 10;
  }

  .zoom-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: #8b949e;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    transition: background 0.15s, color 0.15s;
  }

  .zoom-btn:hover {
    background: #30363d;
    color: #c9d1d9;
  }

  .zoom-level {
    min-width: 40px;
    text-align: center;
    font-size: 10px;
    font-family: ui-monospace, monospace;
    color: #8b949e;
  }

  .tooltip {
    position: absolute;
    background: #21262d;
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 8px 12px;
    z-index: 100;
    pointer-events: none;
    max-width: 200px;
  }

  .tooltip-title {
    font-size: 12px;
    font-weight: 600;
    color: #c9d1d9;
    font-family: ui-monospace, monospace;
  }

  .tooltip-subtitle {
    font-size: 11px;
    color: #8b949e;
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tooltip-meta {
    display: flex;
    gap: 8px;
    margin-top: 4px;
    font-size: 10px;
    text-transform: uppercase;
  }

  .tooltip-deps {
    font-size: 10px;
    color: #8b949e;
    margin-top: 4px;
  }
</style>
