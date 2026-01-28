<script>
  import { onMount, onDestroy } from 'svelte';
  import * as d3 from 'd3';

  let container;
  let animationId;

  onMount(() => {
    const particles = [];
    const particleCount = 24;
    const duration = 1000;
    const startTime = Date.now();

    // Create particles with random properties
    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2;
      const speed = 80 + Math.random() * 60;
      const size = 3 + Math.random() * 4;
      particles.push({
        x: 0,
        y: 0,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size,
        hue: 280 + Math.random() * 40, // Purple to pink range
        alpha: 1
      });
    }

    // Create SVG
    const svg = d3.select(container)
      .append('svg')
      .attr('class', 'spawn-svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .style('position', 'absolute')
      .style('top', '0')
      .style('left', '0')
      .style('pointer-events', 'none')
      .style('overflow', 'visible');

    // Add glow filter
    const defs = svg.append('defs');
    const filter = defs.append('filter')
      .attr('id', 'polecat-glow')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%');

    filter.append('feGaussianBlur')
      .attr('stdDeviation', '3')
      .attr('result', 'coloredBlur');

    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Create particle group centered in the card
    const g = svg.append('g')
      .attr('transform', 'translate(150, 60)'); // Approximate card center

    // Add central burst
    const burst = g.append('circle')
      .attr('cx', 0)
      .attr('cy', 0)
      .attr('r', 5)
      .attr('fill', '#9333ea')
      .attr('filter', 'url(#polecat-glow)')
      .style('opacity', 1);

    // Create particle circles
    const particleElements = g.selectAll('.particle')
      .data(particles)
      .enter()
      .append('circle')
      .attr('class', 'particle')
      .attr('r', d => d.size)
      .attr('fill', d => `hsl(${d.hue}, 80%, 60%)`)
      .attr('filter', 'url(#polecat-glow)');

    // Add paw prints emanating outward
    const pawPrints = [];
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      pawPrints.push({
        x: 0,
        y: 0,
        targetX: Math.cos(angle) * 60,
        targetY: Math.sin(angle) * 60,
        delay: i * 100,
        opacity: 0
      });
    }

    const pawElements = g.selectAll('.paw')
      .data(pawPrints)
      .enter()
      .append('text')
      .attr('class', 'paw')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', '16px')
      .text('🐾')
      .style('opacity', 0);

    function animate() {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Update particles
      particles.forEach((p, i) => {
        const t = Math.min(elapsed / 800, 1);
        p.x = p.vx * t * (1 - t * 0.5);
        p.y = p.vy * t * (1 - t * 0.5);
        p.alpha = 1 - t;
      });

      particleElements
        .attr('cx', d => d.x)
        .attr('cy', d => d.y)
        .style('opacity', d => d.alpha);

      // Update central burst
      const burstProgress = Math.min(elapsed / 400, 1);
      burst
        .attr('r', 5 + burstProgress * 30)
        .style('opacity', 1 - burstProgress);

      // Update paw prints
      pawPrints.forEach((paw, i) => {
        const pawProgress = Math.max(0, Math.min((elapsed - paw.delay) / 600, 1));
        paw.x = paw.targetX * pawProgress;
        paw.y = paw.targetY * pawProgress;
        paw.opacity = pawProgress < 0.5 ? pawProgress * 2 : 2 - pawProgress * 2;
      });

      pawElements
        .attr('x', d => d.x)
        .attr('y', d => d.y)
        .style('opacity', d => d.opacity);

      if (progress < 1) {
        animationId = requestAnimationFrame(animate);
      }
    }

    animationId = requestAnimationFrame(animate);
  });

  onDestroy(() => {
    if (animationId) {
      cancelAnimationFrame(animationId);
    }
  });
</script>

<div bind:this={container} class="spawn-effect"></div>

<style>
  .spawn-effect {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 100;
  }
</style>
