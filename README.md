# gtviz

Gas Town Agent Status Visualization - Real-time detection and display of agent runtime status.

## Status Detection

Detects agent status by querying the gt CLI:

- **running** (green) - Session active, work assigned on hook
- **idle** (blue) - Session active, no work assigned
- **stopped** (red) - Session not running

## Usage

### CLI

```bash
# Show current agent status
node src/index.js

# Watch for status changes in real-time
node src/index.js watch

# Output status as JSON
node src/index.js json

# Start HTTP API server (default port 3847)
node src/index.js serve [port]
```

### Module

```javascript
import { StatusDetector, getAllAgentStatus, AgentStatus } from 'gtviz';

// One-shot status check
const status = await getAllAgentStatus();
// Returns: { "rig-name": [{ rig, name, status, hasWork, currentBead, ... }] }

// Real-time polling
const detector = new StatusDetector({ pollInterval: 5000 });

detector.subscribe((status, changes) => {
  for (const change of changes) {
    console.log(`${change.rig}/${change.name}: ${change.oldStatus} → ${change.newStatus}`);
  }
});

detector.start();
// ... later
detector.stop();
```

### HTTP API

Start the server with `node src/index.js serve` and access:

- `GET /status` - Agent status grouped by rig
- `GET /status/flat` - All agents as flat array
- `GET /health` - Health check

## How It Works

1. Queries `gt session list` to find all active sessions
2. Queries `gt polecat list <rig>` for each rig
3. Checks agent bead (`gt bd show gt-{rig}-polecat-{name}`) for `hook_bead` field
4. Determines status:
   - `session_running: false` → **stopped**
   - `hook_bead` is set → **running**
   - Session running but no work → **idle**

## Tests

```bash
node --test test/status-detector.test.js
```
