<script>
  import { onMount, onDestroy } from 'svelte';
  import * as d3 from 'd3';

  export let animations = [];

  let svgElement;
  let containerRect = null;
  let activeAnimations = new Map();
  let animationId = 0;

  function updateContainerRect() {
    if (svgElement && svgElement.parentElement) {
      containerRect = svgElement.parentElement.getBoundingClientRect();
    }
  }

  function getElementCenter(selector) {
    const element = document.querySelector(selector);
    if (!element || !containerRect) return null;

    const rect = element.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2 - containerRect.left,
      y: rect.top + rect.height / 2 - containerRect.top
    };
  }

  function createParticlePath(source, target) {
    const midX = (source.x + target.x) / 2;
    const midY = Math.min(source.y, target.y) - 50;

    return d3.line().curve(d3.curveBasis)([
      [source.x, source.y],
      [midX, midY],
      [target.x, target.y]
    ]);
  }

  function runAnimation(anim) {
    if (!svgElement || !containerRect) return;

    const id = ++animationId;
    const svg = d3.select(svgElement);

    const sourcePos = anim.sourceSelector
      ? getElementCenter(anim.sourceSelector)
      : { x: containerRect.width / 2, y: -20 };

    const targetPos = getElementCenter(anim.targetSelector);

    if (!targetPos) return;
    if (anim.sourceSelector && !sourcePos) return;

    const pathData = createParticlePath(sourcePos, targetPos);

    const group = svg.append('g')
      .attr('class', 'animation-group')
      .attr('data-id', id);

    const path = group.append('path')
      .attr('d', pathData)
      .attr('fill', 'none')
      .attr('stroke', 'rgba(233, 69, 96, 0.3)')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '5,5');

    const pathLength = path.node().getTotalLength();

    const particleCount = 5;
    const particles = [];

    for (let i = 0; i < particleCount; i++) {
      const particle = group.append('circle')
        .attr('r', 4)
        .attr('fill', anim.type === 'mq-submit' ? '#fbbf24' : '#e94560')
        .attr('filter', 'url(#glow)')
        .style('opacity', 0);

      particles.push(particle);
    }

    particles.forEach((particle, i) => {
      const delay = i * 100;

      particle
        .transition()
        .delay(delay)
        .duration(0)
        .style('opacity', 1)
        .transition()
        .duration(800)
        .ease(d3.easeQuadOut)
        .attrTween('transform', function() {
          return function(t) {
            const point = path.node().getPointAtLength(t * pathLength);
            return `translate(${point.x}, ${point.y})`;
          };
        })
        .transition()
        .duration(200)
        .style('opacity', 0);
    });

    setTimeout(() => {
      group.remove();
      activeAnimations.delete(id);
    }, 1500);

    activeAnimations.set(id, group);
  }

  $: if (animations.length > 0 && svgElement) {
    updateContainerRect();
    animations.forEach(anim => {
      if (!anim.processed) {
        anim.processed = true;
        runAnimation(anim);
      }
    });
  }

  onMount(() => {
    updateContainerRect();
    window.addEventListener('resize', updateContainerRect);
  });

  onDestroy(() => {
    window.removeEventListener('resize', updateContainerRect);
    activeAnimations.forEach(group => group.remove());
  });
</script>

<svg bind:this={svgElement} class="animation-overlay">
  <defs>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
</svg>

<style>
  .animation-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 1000;
    overflow: visible;
  }
</style>
