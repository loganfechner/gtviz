<script>
  import { onMount, onDestroy, afterUpdate } from 'svelte';
  import * as d3 from 'd3';

  export let agents = [];

  let container;
  let svg;
  let simulation;
  let width = 800;
  let height = 600;

  // Position cache to maintain node positions between updates
  const positionCache = new Map();

  // Fixed positions for key roles (relative to container)
  const fixedPositions = {
    witness: { fx: null, fy: 80 },    // Top center, fixed Y
    refinery: { fx: null, fy: null }  // Will be positioned right side
  };

  // Role colors
  const roleColors = {
    witness: '#e94560',
    refinery: '#fbbf24',
    polecat: '#4ade80',
    mayor: '#60a5fa'
  };

  // Status colors for glow effects
  const statusGlow = {
    active: '#4ade80',
    hooked: '#fbbf24',
    error: '#ef4444',
    idle: 'transparent'
  };

  function getNodeRadius(role) {
    switch (role) {
      case 'witness': return 35;
      case 'refinery': return 30;
      case 'mayor': return 35;
      default: return 25;
    }
  }

  function getRoleIcon(role) {
    switch (role) {
      case 'witness': return '\uD83D\uDC41'; // 👁
      case 'refinery': return '\uD83C\uDFED'; // 🏭
      case 'polecat': return '\uD83D\uDC3E'; // 🐾
      case 'mayor': return '\uD83D\uDC51'; // 👑
      default: return '\uD83D\uDD27'; // 🔧
    }
  }

  function createSimulation(nodes) {
    return d3.forceSimulation(nodes)
      // Low alpha decay for smoother, slower movement
      .alphaDecay(0.02)
      // Higher velocity decay to prevent overshoot and bouncing
      .velocityDecay(0.4)
      // Center force - gentle pull toward center
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.05))
      // Collision detection with padding
      .force('collide', d3.forceCollide().radius(d => getNodeRadius(d.role) + 15).strength(0.8))
      // Reduced charge strength to prevent excessive repulsion
      .force('charge', d3.forceManyBody()
        .strength(-150)
        .distanceMin(50)
        .distanceMax(300))
      // Link force for connected nodes (future: for showing relationships)
      .force('y', d3.forceY().y(d => {
        // Layered layout: witness at top, refinery below, polecats in middle
        if (d.role === 'witness') return 80;
        if (d.role === 'refinery') return 150;
        if (d.role === 'mayor') return 80;
        return height / 2;
      }).strength(d => {
        if (d.role === 'witness' || d.role === 'mayor') return 0.3;
        if (d.role === 'refinery') return 0.2;
        return 0.05;
      }))
      .force('x', d3.forceX().x(d => {
        // Refinery on the right
        if (d.role === 'refinery') return width - 100;
        // Witness and mayor in center-left area
        if (d.role === 'witness') return width / 2;
        if (d.role === 'mayor') return 150;
        return width / 2;
      }).strength(d => {
        if (d.role === 'refinery') return 0.3;
        if (d.role === 'witness' || d.role === 'mayor') return 0.2;
        return 0.02;
      }));
  }

  function initGraph() {
    if (!container) return;

    const rect = container.getBoundingClientRect();
    width = rect.width || 800;
    height = rect.height || 600;

    // Clear existing
    d3.select(container).selectAll('*').remove();

    svg = d3.select(container)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', `0 0 ${width} ${height}`);

    // Add defs for glow filters
    const defs = svg.append('defs');

    // Create glow filters for each status
    Object.entries(statusGlow).forEach(([status, color]) => {
      if (color === 'transparent') return;

      const filter = defs.append('filter')
        .attr('id', `glow-${status}`)
        .attr('x', '-50%')
        .attr('y', '-50%')
        .attr('width', '200%')
        .attr('height', '200%');

      filter.append('feGaussianBlur')
        .attr('stdDeviation', '4')
        .attr('result', 'coloredBlur');

      const feMerge = filter.append('feMerge');
      feMerge.append('feMergeNode').attr('in', 'coloredBlur');
      feMerge.append('feMergeNode').attr('in', 'SourceGraphic');
    });

    // Group for nodes
    svg.append('g').attr('class', 'nodes');

    updateGraph();
  }

  function updateGraph() {
    if (!svg) return;

    // Convert agents to nodes, preserving cached positions
    const nodes = agents.map(agent => {
      const cached = positionCache.get(agent.agent);
      const node = {
        id: agent.agent,
        ...agent,
        x: cached?.x ?? width / 2 + (Math.random() - 0.5) * 100,
        y: cached?.y ?? height / 2 + (Math.random() - 0.5) * 100,
        vx: cached?.vx ?? 0,
        vy: cached?.vy ?? 0
      };

      // Apply fixed positions for certain roles
      if (agent.role === 'witness') {
        node.fy = 80;
      }
      if (agent.role === 'mayor') {
        node.fx = 150;
        node.fy = 80;
      }

      return node;
    });

    // Stop existing simulation
    if (simulation) {
      simulation.stop();
    }

    // Create new simulation
    simulation = createSimulation(nodes);

    // Update positions on tick
    simulation.on('tick', () => {
      updateNodePositions();

      // Cache positions
      nodes.forEach(node => {
        positionCache.set(node.id, {
          x: node.x,
          y: node.y,
          vx: node.vx,
          vy: node.vy
        });
      });
    });

    // Freeze simulation after layout settles (low alpha)
    simulation.on('end', () => {
      // Simulation has stabilized
    });

    // Render nodes
    renderNodes(nodes);

    // Reheat simulation gently for updates
    if (positionCache.size > 0) {
      simulation.alpha(0.1).restart();
    } else {
      simulation.alpha(0.5).restart();
    }
  }

  function renderNodes(nodes) {
    const nodeGroup = svg.select('.nodes');

    // Data join
    const nodeElements = nodeGroup
      .selectAll('.node')
      .data(nodes, d => d.id);

    // Exit
    nodeElements.exit()
      .transition()
      .duration(200)
      .attr('opacity', 0)
      .remove();

    // Enter
    const nodeEnter = nodeElements.enter()
      .append('g')
      .attr('class', 'node')
      .attr('opacity', 0)
      .call(drag());

    // Circle background
    nodeEnter.append('circle')
      .attr('class', 'node-bg')
      .attr('r', d => getNodeRadius(d.role))
      .attr('fill', d => roleColors[d.role] || '#666')
      .attr('stroke', '#1a1a2e')
      .attr('stroke-width', 3);

    // Icon
    nodeEnter.append('text')
      .attr('class', 'node-icon')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', d => getNodeRadius(d.role) * 0.8)
      .text(d => getRoleIcon(d.role));

    // Label below
    nodeEnter.append('text')
      .attr('class', 'node-label')
      .attr('text-anchor', 'middle')
      .attr('y', d => getNodeRadius(d.role) + 15)
      .attr('fill', '#ccc')
      .attr('font-size', '11px')
      .attr('font-family', 'system-ui, sans-serif')
      .text(d => d.agent);

    // Fade in
    nodeEnter.transition()
      .duration(300)
      .attr('opacity', 1);

    // Update all (merge enter + update)
    const allNodes = nodeEnter.merge(nodeElements);

    // Update circle appearance based on status
    allNodes.select('.node-bg')
      .transition()
      .duration(200)
      .attr('r', d => getNodeRadius(d.role))
      .attr('fill', d => roleColors[d.role] || '#666')
      .attr('filter', d => {
        const status = d.status || 'idle';
        return statusGlow[status] !== 'transparent' ? `url(#glow-${status})` : null;
      });

    // Update label
    allNodes.select('.node-label')
      .text(d => d.agent);
  }

  function updateNodePositions() {
    svg.select('.nodes')
      .selectAll('.node')
      .attr('transform', d => `translate(${d.x}, ${d.y})`);
  }

  function drag() {
    return d3.drag()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.1).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        // Keep fixed positions for certain roles
        if (d.role !== 'witness' && d.role !== 'mayor') {
          d.fx = null;
        }
        if (d.role !== 'witness' && d.role !== 'mayor') {
          d.fy = null;
        }
      });
  }

  function handleResize() {
    if (!container) return;
    const rect = container.getBoundingClientRect();
    width = rect.width || 800;
    height = rect.height || 600;

    if (svg) {
      svg.attr('viewBox', `0 0 ${width} ${height}`);
      // Update force centers
      if (simulation) {
        simulation.force('center', d3.forceCenter(width / 2, height / 2).strength(0.05));
        simulation.alpha(0.1).restart();
      }
    }
  }

  onMount(() => {
    initGraph();
    window.addEventListener('resize', handleResize);
  });

  onDestroy(() => {
    if (simulation) {
      simulation.stop();
    }
    window.removeEventListener('resize', handleResize);
  });

  // React to agent changes
  $: if (svg && agents) {
    updateGraph();
  }
</script>

<div class="network-graph" bind:this={container}></div>

<style>
  .network-graph {
    width: 100%;
    height: 100%;
    min-height: 400px;
    background: radial-gradient(circle at center, #1f2544 0%, #1a1a2e 100%);
    border-radius: 8px;
    overflow: hidden;
  }

  :global(.network-graph .node) {
    cursor: grab;
  }

  :global(.network-graph .node:active) {
    cursor: grabbing;
  }

  :global(.network-graph .node-icon) {
    pointer-events: none;
    user-select: none;
  }

  :global(.network-graph .node-label) {
    pointer-events: none;
    user-select: none;
  }
</style>
