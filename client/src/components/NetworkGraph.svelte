<script>
  import { onMount, afterUpdate } from 'svelte';
  import * as d3 from 'd3';
  import AgentCard from './AgentCard.svelte';

  export let agents = [];
  export let mail = [];
  export let rig = null;
  export let focusedAgent = null;

  let container;
  let svg;
  let simulation;
  let width = 800;
  let height = 600;

  // Track animated edges
  let animatedEdges = [];

  $: nodes = agents.map(a => ({
    id: a.name,
    ...a,
    // Position based on role
    fx: a.role === 'mayor' ? width / 2 : null,
    fy: a.role === 'mayor' ? 100 : null
  }));

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

    svg = d3.select(container).select('svg');
    initSimulation();

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

    return () => resizeObserver.disconnect();
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
        class:focused={focusedAgent && focusedAgent.name === node.id}
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

  .card-wrapper.focused {
    z-index: 100;
    animation: focus-pulse 1s ease-in-out infinite;
  }

  .card-wrapper.focused::before {
    content: '';
    position: absolute;
    top: -8px;
    left: -8px;
    right: -8px;
    bottom: -8px;
    border: 2px solid #58a6ff;
    border-radius: 12px;
    animation: focus-border 1s ease-in-out infinite;
  }

  @keyframes focus-pulse {
    0%, 100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.02);
    }
  }

  @keyframes focus-border {
    0%, 100% {
      opacity: 1;
      box-shadow: 0 0 10px #58a6ff;
    }
    50% {
      opacity: 0.6;
      box-shadow: 0 0 20px #58a6ff;
    }
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
