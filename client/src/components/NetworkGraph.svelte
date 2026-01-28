<script>
  import { onMount, onDestroy, afterUpdate, createEventDispatcher } from 'svelte';
  import * as d3 from 'd3';
  import AgentCard from './AgentCard.svelte';
  import { presence } from '../lib/websocket.js';

  const dispatch = createEventDispatcher();

  export let agents = [];
  export let mail = [];
  export let rig = null;

  // Get viewers for a specific agent
  function getAgentViewers(agentName) {
    return $presence.users.filter(u =>
      u.currentView?.rig === rig && u.currentView?.agent === agentName
    );
  }

  let container;
  let svgElement;
  let simulation;
  let width = 800;
  let height = 600;

  // Zoom and pan state
  let transform = { x: 0, y: 0, k: 1 };
  let zoom;

  // Track animated edges
  let animatedEdges = [];

  // Position cache to maintain node positions between updates
  const positionCache = new Map();

  // Track if initial layout has settled
  let layoutSettled = false;

  // Get fixed position for role-based nodes
  function getFixedPosition(role, w, h) {
    switch (role) {
      case 'mayor':
        return { fx: w / 2, fy: 80 };
      case 'witness':
        return { fx: 100, fy: h / 2 };
      case 'refinery':
        return { fx: w - 100, fy: h / 2 };
      default:
        return { fx: null, fy: null };
    }
  }

  $: nodes = agents.map(a => {
    const cached = positionCache.get(a.name);
    const fixed = getFixedPosition(a.role, width, height);
    return {
      id: a.name,
      ...a,
      // Use cached position if available, otherwise use fixed or let simulation decide
      x: cached?.x ?? (fixed.fx ?? width / 2),
      y: cached?.y ?? (fixed.fy ?? height / 2),
      fx: fixed.fx,
      fy: fixed.fy
    };
  });

  $: links = buildLinks(agents, mail);

  function buildLinks(agents, mail) {
    const links = [];
    const agentNames = new Set(agents.map(a => a.name));

    // Build links from recent mail
    for (const m of mail.slice(0, 20)) {
      if (m.rig === rig && agentNames.has(m.to) && agentNames.has(m.from)) {
        links.push({
          source: m.from,
          target: m.to,
          timestamp: m.timestamp
        });
      }
    }

    // Add structural links (witness monitors everyone, refinery connects to mayor)
    const witnessAgent = agents.find(a => a.role === 'witness');
    const refineryAgent = agents.find(a => a.role === 'refinery');
    const mayorAgent = agents.find(a => a.role === 'mayor');

    if (witnessAgent) {
      for (const a of agents) {
        if (a.name !== witnessAgent.name) {
          links.push({
            source: witnessAgent.name,
            target: a.name,
            structural: true
          });
        }
      }
    }

    if (refineryAgent && mayorAgent) {
      links.push({
        source: refineryAgent.name,
        target: mayorAgent.name,
        structural: true
      });
    }

    return links;
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
        // Only gently restart on resize if layout has settled
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
      .on('dblclick.zoom', null); // Disable double-click zoom

    // Add keyboard shortcuts
    window.addEventListener('keydown', handleKeydown);
  }

  function handleKeydown(e) {
    // Only handle if focus is not in an input/textarea
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    switch (e.key) {
      case '+':
      case '=':
        e.preventDefault();
        zoomIn();
        break;
      case '-':
        e.preventDefault();
        zoomOut();
        break;
      case '0':
        e.preventDefault();
        resetZoom();
        break;
      case 'f':
        e.preventDefault();
        fitToView();
        break;
    }
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

    // Calculate bounding box of all nodes
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const node of nodes) {
      const x = node.x || width / 2;
      const y = node.y || height / 2;
      minX = Math.min(minX, x - 80);
      maxX = Math.max(maxX, x + 80);
      minY = Math.min(minY, y - 50);
      maxY = Math.max(maxY, y + 50);
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

  // Cleanup on component destroy to prevent memory leaks
  onDestroy(() => {
    // Remove any lingering window event listeners
    window.removeEventListener('mousemove', onDrag);
    window.removeEventListener('mouseup', endDrag);
    window.removeEventListener('keydown', handleKeydown);

    // Stop the D3 simulation
    if (simulation) {
      simulation.stop();
      simulation = null;
    }

    // Clean up zoom behavior
    if (svgElement && zoom) {
      d3.select(svgElement).on('.zoom', null);
    }
  });

  function initSimulation() {
    simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(180).strength(0.3))
      .force('charge', d3.forceManyBody().strength(-150))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(90))
      // Slower decay for smoother movement
      .alphaDecay(0.05)
      .velocityDecay(0.4)
      .on('tick', () => {
        // Cache positions for stability between updates
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

  // Track previous agent count to detect changes
  let prevAgentCount = 0;

  afterUpdate(() => {
    if (simulation) {
      const agentCountChanged = agents.length !== prevAgentCount;
      prevAgentCount = agents.length;

      simulation.nodes(nodes);
      simulation.force('link').links(links);

      // Only restart with significant alpha if agents changed
      // Otherwise use very low alpha for minimal adjustment
      if (agentCountChanged && !layoutSettled) {
        simulation.alpha(0.3).restart();
      } else if (agentCountChanged) {
        // New agent added after layout settled - gentle adjustment
        simulation.alpha(0.1).restart();
      }
      // Don't restart for other updates (mail, etc.) - positions stay stable
    }
  });

  // Drag implementation for Svelte
  let dragNode = null;
  let dragOffset = { x: 0, y: 0 };

  function startDrag(e, node) {
    // Only allow dragging non-fixed-role nodes
    const fixed = getFixedPosition(node.role, width, height);
    if (fixed.fx !== null) return;

    e.preventDefault();
    e.stopPropagation();
    dragNode = node;
    const rect = container.getBoundingClientRect();
    // Account for zoom transform when calculating offset
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
    // Account for zoom transform when calculating position
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
      simulation.alphaTarget(0);
      dragNode = null;
    }
    window.removeEventListener('mousemove', onDrag);
    window.removeEventListener('mouseup', endDrag);
  }

  // Animate edge when new mail arrives
  $: if (mail.length > 0) {
    const latest = mail[0];
    if (latest.rig === rig) {
      animateEdge(latest.from, latest.to);
    }
  }

  function animateEdge(from, to) {
    const id = `${from}-${to}-${Date.now()}`;
    animatedEdges = [...animatedEdges, { id, from, to }];

    // Remove animation after it completes
    setTimeout(() => {
      animatedEdges = animatedEdges.filter(e => e.id !== id);
    }, 1500);
  }

  function getNodePosition(name) {
    const node = nodes.find(n => n.id === name);
    return node ? { x: node.x || width/2, y: node.y || height/2 } : { x: width/2, y: height/2 };
  }

  function getRoleColor(role) {
    const colors = {
      mayor: '#f0883e',
      witness: '#a371f7',
      refinery: '#3fb950',
      crew: '#58a6ff',
      polecat: '#db61a2'
    };
    return colors[role] || '#8b949e';
  }
</script>

<div class="graph" bind:this={container}>
  <svg bind:this={svgElement} {width} {height}>
    <defs>
      <marker
        id="arrowhead"
        viewBox="0 0 10 10"
        refX="25"
        refY="5"
        markerWidth="6"
        markerHeight="6"
        orient="auto"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#30363d"/>
      </marker>
      <marker
        id="arrowhead-active"
        viewBox="0 0 10 10"
        refX="25"
        refY="5"
        markerWidth="6"
        markerHeight="6"
        orient="auto"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#58a6ff"/>
      </marker>
    </defs>

    <g transform="translate({transform.x}, {transform.y}) scale({transform.k})">
      <!-- Structural links (faded) -->
      {#each links.filter(l => l.structural) as link}
        {@const source = getNodePosition(link.source?.id || link.source)}
        {@const target = getNodePosition(link.target?.id || link.target)}
        <line
          x1={source.x}
          y1={source.y}
          x2={target.x}
          y2={target.y}
          stroke="#21262d"
          stroke-width="1"
          stroke-dasharray="4,4"
        />
      {/each}

      <!-- Active links -->
      {#each links.filter(l => !l.structural) as link}
        {@const source = getNodePosition(link.source?.id || link.source)}
        {@const target = getNodePosition(link.target?.id || link.target)}
        <line
          x1={source.x}
          y1={source.y}
          x2={target.x}
          y2={target.y}
          stroke="#30363d"
          stroke-width="2"
          marker-end="url(#arrowhead)"
        />
      {/each}

      <!-- Animated edges -->
      {#each animatedEdges as edge (edge.id)}
        {@const source = getNodePosition(edge.from)}
        {@const target = getNodePosition(edge.to)}
        <line
          class="animated-edge"
          x1={source.x}
          y1={source.y}
          x2={target.x}
          y2={target.y}
          stroke="#58a6ff"
          stroke-width="3"
          marker-end="url(#arrowhead-active)"
        />
        <circle
          class="pulse"
          cx={target.x}
          cy={target.y}
          r="20"
          fill="none"
          stroke="#58a6ff"
        />
      {/each}
    </g>
  </svg>

  <!-- Agent cards overlaid on SVG -->
  <div class="cards" style="transform: translate({transform.x}px, {transform.y}px) scale({transform.k}); transform-origin: 0 0;">
    {#each nodes as node (node.id)}
      <div
        class="card-wrapper"
        class:draggable={getFixedPosition(node.role, width, height).fx === null}
        style="left: {(node.x || width/2) - 70}px; top: {(node.y || height/2) - 40}px;"
        on:mousedown={(e) => startDrag(e, node)}
        on:click={() => dispatch('select', node)}
        on:dblclick={() => dispatch('peek', node)}
        role="button"
        tabindex="0"
      >
        <AgentCard agent={node} color={getRoleColor(node.role)} viewers={getAgentViewers(node.name)} />
      </div>
    {/each}
  </div>

  <!-- Zoom controls -->
  <div class="zoom-controls">
    <button class="zoom-btn" on:click={zoomIn} title="Zoom in">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
      </svg>
    </button>
    <span class="zoom-level">{Math.round(transform.k * 100)}%</span>
    <button class="zoom-btn" on:click={zoomOut} title="Zoom out">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M4 8a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7A.5.5 0 0 1 4 8z"/>
      </svg>
    </button>
    <button class="zoom-btn" on:click={resetZoom} title="Reset zoom">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
        <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
      </svg>
    </button>
    <button class="zoom-btn" on:click={fitToView} title="Fit to view">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M1.5 1a.5.5 0 0 0-.5.5v4a.5.5 0 0 1-1 0v-4A1.5 1.5 0 0 1 1.5 0h4a.5.5 0 0 1 0 1h-4zM10 .5a.5.5 0 0 1 .5-.5h4A1.5 1.5 0 0 1 16 1.5v4a.5.5 0 0 1-1 0v-4a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 1-.5-.5zM.5 10a.5.5 0 0 1 .5.5v4a.5.5 0 0 0 .5.5h4a.5.5 0 0 1 0 1h-4A1.5 1.5 0 0 1 0 14.5v-4a.5.5 0 0 1 .5-.5zm15 0a.5.5 0 0 1 .5.5v4a1.5 1.5 0 0 1-1.5 1.5h-4a.5.5 0 0 1 0-1h4a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 1 .5-.5z"/>
      </svg>
    </button>
  </div>
</div>

<style>
  .graph {
    width: 100%;
    height: 100%;
    position: relative;
    background: radial-gradient(circle at center, #161b22 0%, #0d1117 100%);
  }

  svg {
    position: absolute;
    top: 0;
    left: 0;
  }

  .cards {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .card-wrapper {
    position: absolute;
    pointer-events: auto;
    transition: left 0.15s ease-out, top 0.15s ease-out;
    user-select: none;
  }

  .card-wrapper.draggable {
    cursor: grab;
  }

  .card-wrapper.draggable:active {
    cursor: grabbing;
    transition: none;
  }

  .animated-edge {
    animation: pulse-line 1.5s ease-out forwards;
  }

  .pulse {
    animation: pulse-ring 1.5s ease-out forwards;
  }

  @keyframes pulse-line {
    0% {
      stroke-opacity: 1;
      stroke-width: 4;
    }
    100% {
      stroke-opacity: 0;
      stroke-width: 1;
    }
  }

  @keyframes pulse-ring {
    0% {
      r: 20;
      stroke-opacity: 1;
      stroke-width: 3;
    }
    100% {
      r: 50;
      stroke-opacity: 0;
      stroke-width: 0;
    }
  }

  .zoom-controls {
    position: absolute;
    bottom: 16px;
    right: 16px;
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
    width: 28px;
    height: 28px;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: #8b949e;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .zoom-btn:hover {
    background: #30363d;
    color: #c9d1d9;
  }

  .zoom-btn:active {
    background: #484f58;
  }

  .zoom-level {
    min-width: 48px;
    text-align: center;
    font-size: 12px;
    font-family: ui-monospace, monospace;
    color: #8b949e;
    user-select: none;
  }
</style>
