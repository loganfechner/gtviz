<script>
  import { onMount, afterUpdate, createEventDispatcher } from 'svelte';
  import * as d3 from 'd3';
  import AgentCard from './AgentCard.svelte';

  const dispatch = createEventDispatcher();

  export let agents = [];
  export let mail = [];
  export let rig = null;

  let container;
  let svgElement;
  let simulation;
  let width = 800;
  let height = 600;

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

  // Drag behavior for manual positioning
  function handleDragStart(event, node) {
    if (!event.active) simulation.alphaTarget(0.1).restart();
    node.fx = node.x;
    node.fy = node.y;
  }

  function handleDrag(event, node) {
    node.fx = event.x;
    node.fy = event.y;
  }

  function handleDragEnd(event, node) {
    if (!event.active) simulation.alphaTarget(0);
    // Keep position fixed after drag for non-fixed-role nodes
    // Users can manually position nodes and they'll stay put
    const fixed = getFixedPosition(node.role, width, height);
    if (fixed.fx === null) {
      // Not a fixed-role node, but keep the dragged position
      node.fx = event.x;
      node.fy = event.y;
      positionCache.set(node.id, { x: event.x, y: event.y });
    }
  }

  // Simple drag implementation for Svelte
  let dragNode = null;
  let dragOffset = { x: 0, y: 0 };

  function startDrag(e, node) {
    // Only allow dragging non-fixed-role nodes
    const fixed = getFixedPosition(node.role, width, height);
    if (fixed.fx !== null) return;

    e.preventDefault();
    dragNode = node;
    const rect = container.getBoundingClientRect();
    dragOffset = {
      x: e.clientX - rect.left - (node.x || width / 2),
      y: e.clientY - rect.top - (node.y || height / 2)
    };

    simulation.alphaTarget(0.1).restart();

    window.addEventListener('mousemove', onDrag);
    window.addEventListener('mouseup', endDrag);
  }

  function onDrag(e) {
    if (!dragNode) return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left - dragOffset.x;
    const y = e.clientY - rect.top - dragOffset.y;

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
  <svg {width} {height}>
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
  </svg>

  <!-- Agent cards overlaid on SVG -->
  <div class="cards">
    {#each nodes as node (node.id)}
      <div
        class="card-wrapper"
        class:draggable={getFixedPosition(node.role, width, height).fx === null}
        style="left: {(node.x || width/2) - 70}px; top: {(node.y || height/2) - 40}px;"
        on:mousedown={(e) => startDrag(e, node)}
        on:click={() => dispatch('select', node)}
        role="button"
        tabindex="0"
      >
        <AgentCard agent={node} color={getRoleColor(node.role)} />
      </div>
    {/each}
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
</style>
