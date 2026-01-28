# gtviz (cheedo)

Gas Town Visualization with improved mail flow edge animations.

## Features

### Enhanced Mail Flow Animations

- **Traveling particles**: Animated particles travel along edges from sender to receiver using requestAnimationFrame for smooth 60fps animation
- **Color-coded by role**: Different mail types show different colors based on sender role:
  - Mayor: orange (#f0883e)
  - Witness: purple (#a371f7)
  - Refinery: green (#3fb950)
  - Crew: blue (#58a6ff)
  - Polecat: pink (#db61a2)
- **Particle trails**: Each particle leaves a fading trail for visual effect
- **Glow effects**: Particles have SVG filter glow for polish
- **Animation queuing**: Rapid mail bursts queue particles with spacing to prevent conflicts
- **Pulse rings**: Expanding rings appear at destination when mail arrives
- **Concurrent animation limit**: Max 10 concurrent animations to maintain performance

## Running

```bash
# Install dependencies
npm install
cd client && npm install

# Start development server
npm run dev
```

The server runs on http://localhost:3001, client on http://localhost:5173
