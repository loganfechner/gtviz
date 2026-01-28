<script>
  import { onMount, onDestroy, afterUpdate } from 'svelte';
  import * as d3 from 'd3';
  import AgentCard from './AgentCard.svelte';

  export let agents = [];
  export let mail = [];
  export let rig = null;

  let container;
  let svg;
  let simulation;
  let width = 800;
  let height = 600;

  // Animation state
  let animatedEdges = [];
  let particles = [];
  let animationQueue = [];
  let animationFrame = null;
  let lastProcessedMailId = null;

  // Animation constants
  const PARTICLE_DURATION = 1200;  // ms for particle to travel
  const PARTICLE_COUNT = 3;        // particles per mail event
  const PARTICLE_SPACING = 150;    // ms between particles in burst
  const MAX_CONCURRENT = 10;       // limit concurrent animations
  const TRAIL_LENGTH = 4;          // number of trail segments

  // Mail type color mapping
  const mailTypeColors = {
    mayor: '#f0883e',      // orange
    witness: '#a371f7',    // purple
    refinery: '#3fb950',   // green
    crew: '#58a6ff',       // blue
    polecat: '#db61a2',    // pink
    default: '#79c0ff'     // light blue
  };

  $: nodes = agents.map(a => ({
    id: a.name,
    ...a,
    fx: a.role === 'mayor' ? width / 2 : null,
    fy: a.role === 'mayor' ? 100 : null
  }));

  $: links = buildLinks(agents, mail);

  function buildLinks(agents, mail) {
    const links = [];
    const agentNames = new Set(agents.map(a => a.name));

    for (const m of mail.slice(0, 20)) {
      if (m.rig === rig && agentNames.has(m.to) && agentNames.has(m.from)) {
        links.push({
          source: m.from,
          target: m.to,
          timestamp: m.timestamp
        });
      }
    }

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

    svg = d3.select(container).select('svg');
    initSimulation();
    startAnimationLoop();

    const resizeObserver = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      if (simulation) {
        simulation.force('center', d3.forceCenter(width / 2, height / 2));
        simulation.alpha(0.3).restart();
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      stopAnimationLoop();
    };
  });

  onDestroy(() => {
    stopAnimationLoop();
  });

  function initSimulation() {
    simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(150))
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(80))
      .on('tick', () => {
        nodes = [...nodes];
        links = [...links];
      });
  }

  afterUpdate(() => {
    if (simulation) {
      simulation.nodes(nodes);
      simulation.force('link').links(links);
      simulation.alpha(0.3).restart();
    }
  });

  // Watch for new mail and queue animations
  $: if (mail.length > 0) {
    const latest = mail[0];
    const mailId = `${latest.from}-${latest.to}-${latest.timestamp}`;
    if (mailId !== lastProcessedMailId && latest.rig === rig) {
      lastProcessedMailId = mailId;
      queueMailAnimation(latest);
    }
  }

  function queueMailAnimation(mailEvent) {
    // Get sender role for color
    const senderAgent = agents.find(a => a.name === mailEvent.from);
    const color = mailTypeColors[senderAgent?.role] || mailTypeColors.default;

    // Queue multiple particles with spacing
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      animationQueue.push({
        from: mailEvent.from,
        to: mailEvent.to,
        color,
        delay: i * PARTICLE_SPACING,
        timestamp: Date.now() + i * PARTICLE_SPACING
      });
    }
  }

  function startAnimationLoop() {
    function tick(currentTime) {
      // Process queue
      processAnimationQueue(currentTime);

      // Update particles
      updateParticles(currentTime);

      // Update animated edges
      updateAnimatedEdges(currentTime);

      // Force Svelte to re-render
      particles = [...particles];
      animatedEdges = [...animatedEdges];

      animationFrame = requestAnimationFrame(tick);
    }
    animationFrame = requestAnimationFrame(tick);
  }

  function stopAnimationLoop() {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
  }

  function processAnimationQueue(currentTime) {
    // Limit concurrent animations
    const activeCount = particles.length;
    if (activeCount >= MAX_CONCURRENT) return;

    // Process ready items from queue
    const ready = animationQueue.filter(item => currentTime >= item.timestamp);
    const toProcess = ready.slice(0, MAX_CONCURRENT - activeCount);

    for (const item of toProcess) {
      createParticle(item);
      // Also create edge glow
      createAnimatedEdge(item);
    }

    // Remove processed items
    animationQueue = animationQueue.filter(item => !toProcess.includes(item));
  }

  function createParticle(item) {
    const id = `particle-${item.from}-${item.to}-${Date.now()}-${Math.random()}`;
    particles.push({
      id,
      from: item.from,
      to: item.to,
      color: item.color,
      startTime: performance.now(),
      progress: 0,
      trail: []  // Store trail positions
    });
  }

  function createAnimatedEdge(item) {
    const id = `edge-${item.from}-${item.to}-${Date.now()}`;
    animatedEdges.push({
      id,
      from: item.from,
      to: item.to,
      color: item.color,
      startTime: performance.now()
    });
  }

  function updateParticles(currentTime) {
    const now = performance.now();

    particles = particles.filter(p => {
      const elapsed = now - p.startTime;
      p.progress = Math.min(elapsed / PARTICLE_DURATION, 1);

      // Store position in trail
      const source = getNodePosition(p.from);
      const target = getNodePosition(p.to);
      const currentPos = interpolatePosition(source, target, easeOutCubic(p.progress));

      p.trail.unshift({ x: currentPos.x, y: currentPos.y, opacity: 1 });

      // Limit trail length and fade
      p.trail = p.trail.slice(0, TRAIL_LENGTH).map((t, i) => ({
        ...t,
        opacity: 1 - (i / TRAIL_LENGTH)
      }));

      // Keep particle if still animating
      return p.progress < 1;
    });
  }

  function updateAnimatedEdges(currentTime) {
    const now = performance.now();
    const edgeDuration = PARTICLE_DURATION + 300;  // Slightly longer than particles

    animatedEdges = animatedEdges.filter(e => {
      const elapsed = now - e.startTime;
      e.progress = Math.min(elapsed / edgeDuration, 1);
      return e.progress < 1;
    });
  }

  function getNodePosition(name) {
    const node = nodes.find(n => n.id === name);
    return node ? { x: node.x || width/2, y: node.y || height/2 } : { x: width/2, y: height/2 };
  }

  function interpolatePosition(source, target, t) {
    return {
      x: source.x + (target.x - source.x) * t,
      y: source.y + (target.y - source.y) * t
    };
  }

  // Easing functions for smooth 60fps feel
  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function easeOutQuad(t) {
    return 1 - (1 - t) * (1 - t);
  }

  function getRoleColor(role) {
    return mailTypeColors[role] || '#8b949e';
  }

  function getParticlePosition(particle) {
    const source = getNodePosition(particle.from);
    const target = getNodePosition(particle.to);
    return interpolatePosition(source, target, easeOutCubic(particle.progress));
  }

  function getEdgeOpacity(edge) {
    // Fade out over time
    return 1 - easeOutQuad(edge.progress);
  }

  function getEdgeStrokeWidth(edge) {
    // Start wide, narrow as it fades
    return 3 - edge.progress * 2;
  }

  function getParticleSize(particle) {
    // Pulse effect: start small, grow, then shrink at end
    const t = particle.progress;
    if (t < 0.2) return 4 + t * 20;  // Grow
    if (t > 0.8) return 8 - (t - 0.8) * 30;  // Shrink
    return 8;  // Full size
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

      <!-- Glow filter for particles -->
      <filter id="particle-glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="3" result="blur"/>
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>

      <!-- Color-specific gradients for each mail type -->
      {#each Object.entries(mailTypeColors) as [type, color]}
        <linearGradient id="gradient-{type}" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color={color} stop-opacity="0"/>
          <stop offset="50%" stop-color={color} stop-opacity="1"/>
          <stop offset="100%" stop-color={color} stop-opacity="0.3"/>
        </linearGradient>
        <marker
          id="arrowhead-{type}"
          viewBox="0 0 10 10"
          refX="25"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={color}/>
        </marker>
      {/each}
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

    <!-- Animated edge glows -->
    {#each animatedEdges as edge (edge.id)}
      {@const source = getNodePosition(edge.from)}
      {@const target = getNodePosition(edge.to)}
      <line
        class="animated-edge"
        x1={source.x}
        y1={source.y}
        x2={target.x}
        y2={target.y}
        stroke={edge.color}
        stroke-width={getEdgeStrokeWidth(edge)}
        stroke-opacity={getEdgeOpacity(edge)}
      />
    {/each}

    <!-- Particle trails -->
    {#each particles as particle (particle.id)}
      {#each particle.trail as trailPoint, i}
        <circle
          cx={trailPoint.x}
          cy={trailPoint.y}
          r={4 - i * 0.8}
          fill={particle.color}
          opacity={trailPoint.opacity * 0.5}
        />
      {/each}
    {/each}

    <!-- Main particles -->
    {#each particles as particle (particle.id)}
      {@const pos = getParticlePosition(particle)}
      {@const size = getParticleSize(particle)}
      <circle
        class="particle"
        cx={pos.x}
        cy={pos.y}
        r={size}
        fill={particle.color}
        filter="url(#particle-glow)"
      />
      <!-- Inner bright core -->
      <circle
        cx={pos.x}
        cy={pos.y}
        r={size * 0.4}
        fill="white"
        opacity="0.8"
      />
    {/each}

    <!-- Pulse rings at destination -->
    {#each animatedEdges as edge (edge.id + '-ring')}
      {@const target = getNodePosition(edge.to)}
      {@const ringProgress = Math.max(0, edge.progress - 0.5) * 2}
      {#if ringProgress > 0}
        <circle
          class="pulse-ring"
          cx={target.x}
          cy={target.y}
          r={20 + ringProgress * 40}
          fill="none"
          stroke={edge.color}
          stroke-width={2 - ringProgress * 1.5}
          stroke-opacity={1 - ringProgress}
        />
      {/if}
    {/each}
  </svg>

  <!-- Agent cards overlaid on SVG -->
  <div class="cards">
    {#each nodes as node (node.id)}
      <div
        class="card-wrapper"
        style="left: {(node.x || width/2) - 70}px; top: {(node.y || height/2) - 40}px;"
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
    transition: left 0.1s, top 0.1s;
  }

  .particle {
    will-change: cx, cy, r;
  }

  .animated-edge {
    will-change: stroke-opacity, stroke-width;
  }

  .pulse-ring {
    will-change: r, stroke-opacity;
  }
</style>
