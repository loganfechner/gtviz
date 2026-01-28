<script>
  import { onMount, onDestroy } from 'svelte';
  import * as d3 from 'd3';

  export let hooks = {};
  export let transfers = []; // Array of { from, to, id, timestamp }

  let container;
  let svg;
  let simulation;
  let width = 600;
  let height = 400;

  // Role-specific colors
  const roleColors = {
    witness: '#8b5cf6',   // Purple
    refinery: '#f59e0b',  // Amber
    polecat: '#3b82f6'    // Blue
  };

  const statusColors = {
    active: '#4ade80',
    hooked: '#fbbf24',
    idle: '#6b7280',
    error: '#ef4444'
  };

  // Convert hooks to nodes array
  $: nodes = Object.values(hooks).map(h => ({
    id: h.agent,
    role: h.role,
    status: h.status,
    beadId: h.beadId,
    label: h.label
  }));

  // Create links: polecats -> refinery, witness -> refinery
  $: links = (() => {
    const refinery = nodes.find(n => n.role === 'refinery');
    if (!refinery) return [];

    return nodes
      .filter(n => n.role === 'polecat' || n.role === 'witness')
      .map(n => ({
        source: n.id,
        target: refinery.id,
        role: n.role
      }));
  })();

  // Active transfers for animation
  let activeTransfers = [];

  // Watch for new transfers
  $: {
    transfers.forEach(t => {
      if (!activeTransfers.find(at => at.id === t.id)) {
        startTransferAnimation(t);
      }
    });
  }

  function startTransferAnimation(transfer) {
    activeTransfers = [...activeTransfers, { ...transfer, progress: 0 }];

    const duration = 1500;
    const startTime = Date.now();

    function animate() {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      activeTransfers = activeTransfers.map(t =>
        t.id === transfer.id ? { ...t, progress } : t
      );

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Remove completed transfer
        setTimeout(() => {
          activeTransfers = activeTransfers.filter(t => t.id !== transfer.id);
        }, 500);
      }
    }

    requestAnimationFrame(animate);
  }

  function getNodePosition(nodeId) {
    const node = simulation?.nodes().find(n => n.id === nodeId);
    return node ? { x: node.x, y: node.y } : { x: 0, y: 0 };
  }

  function initGraph() {
    if (!container || !nodes.length) return;

    const rect = container.getBoundingClientRect();
    width = rect.width || 600;
    height = rect.height || 400;

    // Clear existing
    d3.select(container).selectAll('svg').remove();

    svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', [0, 0, width, height]);

    // Add defs for gradients and markers
    const defs = svg.append('defs');

    // Arrow marker for links
    defs.append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '-0 -5 10 10')
      .attr('refX', 25)
      .attr('refY', 0)
      .attr('orient', 'auto')
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .append('path')
      .attr('d', 'M 0,-5 L 10 ,0 L 0,5')
      .attr('fill', '#4b5563');

    // Gradient for transfer animation
    const gradient = defs.append('linearGradient')
      .attr('id', 'transfer-gradient')
      .attr('gradientUnits', 'userSpaceOnUse');

    gradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', '#10b981');

    gradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', '#34d399');

    // Create force simulation
    simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(120))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(40));

    // Draw links
    const link = svg.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(links)
      .enter()
      .append('line')
      .attr('stroke', '#4b5563')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '4,4')
      .attr('marker-end', 'url(#arrowhead)');

    // Draw nodes
    const node = svg.append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', 'node')
      .call(d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended));

    // Node circle
    node.append('circle')
      .attr('r', d => d.role === 'refinery' ? 28 : d.role === 'witness' ? 24 : 20)
      .attr('fill', d => roleColors[d.role] || '#6b7280')
      .attr('stroke', d => statusColors[d.status] || '#6b7280')
      .attr('stroke-width', 3)
      .style('filter', d => d.status === 'active' ? 'drop-shadow(0 0 8px ' + statusColors.active + ')' : 'none');

    // Role icon
    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-size', d => d.role === 'refinery' ? '18px' : '14px')
      .text(d => {
        switch(d.role) {
          case 'witness': return '👁';
          case 'refinery': return '🏭';
          case 'polecat': return '🐾';
          default: return '🔧';
        }
      });

    // Node label
    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', d => d.role === 'refinery' ? 45 : 38)
      .attr('fill', '#e5e7eb')
      .attr('font-size', '11px')
      .attr('font-weight', '500')
      .text(d => d.id);

    // Status indicator for active nodes
    node.filter(d => d.status === 'active' || d.status === 'hooked')
      .append('circle')
      .attr('r', 5)
      .attr('cx', d => d.role === 'refinery' ? 20 : 15)
      .attr('cy', d => d.role === 'refinery' ? -20 : -15)
      .attr('fill', d => statusColors[d.status])
      .attr('class', 'status-dot');

    // Transfer animation layer
    svg.append('g').attr('class', 'transfers');

    // Tick function
    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      node.attr('transform', d => `translate(${d.x},${d.y})`);

      // Update transfer animations
      updateTransfers();
    });
  }

  function updateTransfers() {
    if (!svg) return;

    const transferGroup = svg.select('.transfers');

    // Update transfer particles
    const particles = transferGroup.selectAll('.transfer-particle')
      .data(activeTransfers, d => d.id);

    // Enter
    const enter = particles.enter()
      .append('g')
      .attr('class', 'transfer-particle');

    // Package icon
    enter.append('circle')
      .attr('r', 8)
      .attr('fill', '#10b981')
      .attr('stroke', '#059669')
      .attr('stroke-width', 2);

    enter.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-size', '10px')
      .text('📦');

    // Glow trail
    enter.append('circle')
      .attr('r', 12)
      .attr('fill', 'none')
      .attr('stroke', '#10b981')
      .attr('stroke-width', 2)
      .attr('opacity', 0.5)
      .attr('class', 'glow');

    // Update positions
    particles.merge(enter)
      .attr('transform', d => {
        const fromNode = simulation?.nodes().find(n => n.id === d.from);
        const toNode = simulation?.nodes().find(n => n.id === d.to);

        if (!fromNode || !toNode) return 'translate(0,0)';

        const x = fromNode.x + (toNode.x - fromNode.x) * d.progress;
        const y = fromNode.y + (toNode.y - fromNode.y) * d.progress;
        return `translate(${x},${y})`;
      })
      .select('.glow')
      .attr('opacity', d => 0.5 * (1 - d.progress));

    // Exit
    particles.exit().remove();
  }

  function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }

  function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }

  // Re-initialize when nodes change
  $: if (container && nodes.length > 0) {
    initGraph();
  }

  onMount(() => {
    const resizeObserver = new ResizeObserver(() => {
      if (nodes.length > 0) initGraph();
    });

    if (container) {
      resizeObserver.observe(container);
    }

    return () => resizeObserver.disconnect();
  });

  onDestroy(() => {
    if (simulation) simulation.stop();
  });
</script>

<div class="network-graph" bind:this={container}>
  {#if nodes.length === 0}
    <div class="empty">
      <span>Waiting for agents...</span>
    </div>
  {/if}
</div>

<style>
  .network-graph {
    width: 100%;
    height: 100%;
    min-height: 300px;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    border-radius: 8px;
    border: 1px solid #0f3460;
    position: relative;
    overflow: hidden;
  }

  .network-graph :global(svg) {
    display: block;
  }

  .network-graph :global(.node) {
    cursor: grab;
  }

  .network-graph :global(.node:active) {
    cursor: grabbing;
  }

  .network-graph :global(.status-dot) {
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.6; transform: scale(1.2); }
  }

  .network-graph :global(.transfer-particle) {
    pointer-events: none;
  }

  .empty {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: #6b7280;
    font-style: italic;
  }
</style>
