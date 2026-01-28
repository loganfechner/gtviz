# gtviz

Gas Town Visualization

## Features

### Agent Task/Description Display (gt-g4l)

Agent cards now display:

- **Role descriptions**: Each agent type shows a brief description of its purpose
  - Witness: Health monitor
  - Refinery: Merge processor
  - Polecat: Worker agent
  - Crew: Interactive worker
  - Mayor: Coordinator

- **Current task**: Shows hooked bead ID and title from `gt hook`

- **Progress**: For molecule workflows, shows completion percentage

- **Last output**: Expandable section showing recent agent activity

- **Tooltip**: Hover over role icon for full description

## Running

```bash
# Install dependencies
npm install
cd client && npm install

# Start server
npm run dev

# In another terminal, start client dev server
cd client && npm run dev
```

Server runs on port 3000 by default.

## Configuration

Environment variables:
- `PORT`: Server port (default: 3000)
- `GT_DIR`: Gas Town directory (default: ~/gt)
- `RIG_NAME`: Rig to monitor (default: gtviz)
- `POLL_INTERVAL`: Polling interval in ms (default: 5000)
