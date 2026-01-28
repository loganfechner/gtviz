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

## WebSocket API

The server provides real-time updates via WebSocket. Connect to receive live state changes, events, and metrics.

### Connection

```javascript
const ws = new WebSocket('ws://localhost:3001/ws');
```

### Message Types

All messages are JSON with a `type` field indicating the message type.

#### `state` - Full State Update

Sent on connection and whenever state changes (agent status, beads, hooks, etc).

```json
{
  "type": "state",
  "data": {
    "rigs": {},
    "agents": { "<rig>": [{ "name": "...", "status": "...", ... }] },
    "beads": { "<rig>": [{ "id": "...", "status": "...", ... }] },
    "hooks": { "<rig>": { "beadId": "...", "status": "..." } },
    "mail": [{ "from": "...", "to": "...", "subject": "...", ... }],
    "events": [{ "type": "...", "timestamp": "...", ... }],
    "agentHistory": { "<rig>/<agent>": [{ "status": "...", "timestamp": "..." }] },
    "metrics": { ... },
    "beadHistory": { "<rig>/<beadId>": [{ "status": "...", "timestamp": "..." }] },
    "logs": [{ "level": "...", "message": "...", "timestamp": "..." }],
    "agentStats": { "<rig>/<agent>": { "completions": [], "totalCompleted": 0, "avgDuration": 0 } }
  }
}
```

#### `event` - Real-time Events

Sent when events occur (mail, logs, bead status changes).

```json
{
  "type": "event",
  "event": {
    "type": "mail|log|bead_status_change",
    "timestamp": "2026-01-28T12:00:00.000Z",
    ...
  }
}
```

Event subtypes:
- `mail` - New mail received: `{ from, to, subject, preview }`
- `log` - Log entry: `{ level, message, source }`
- `bead_status_change` - Bead status change: `{ beadId, rig, from, to }`

#### `metrics` - Performance Metrics

Broadcast every 5 seconds with server performance data.

```json
{
  "type": "metrics",
  "data": {
    "pollDuration": 150,
    "avgPollDuration": 145,
    "updateFrequency": 2.5,
    "totalPolls": 100,
    "totalEvents": 50,
    "successfulPolls": 98,
    "failedPolls": 2,
    "successRate": 98.0,
    "wsConnections": 3,
    "totalWsConnections": 10,
    "totalWsMessages": 25,
    "bufferSizes": { "pollDurations": 60, "eventVolume": 60, "currentIntervalEvents": 5 },
    "agentActivity": { "active": 2, "hooked": 1, "idle": 0, "error": 0 },
    "history": {
      "pollDurations": [150, 148, ...],
      "eventVolume": [5, 3, ...],
      "timestamps": ["2026-01-28T12:00:00.000Z", ...]
    }
  }
}
```

### Connection Lifecycle

1. **Connect** - Client connects to `ws://localhost:3001/ws`
2. **Initial State** - Server immediately sends `state` message with current full state
3. **Live Updates** - Server pushes `state`, `event`, and `metrics` messages as they occur
4. **Disconnect** - Connection closed; reconnect to resume

### Example Client

```javascript
const ws = new WebSocket('ws://localhost:3001/ws');

ws.onopen = () => console.log('Connected');

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  switch (msg.type) {
    case 'state':
      // Full state update
      updateUI(msg.data);
      break;
    case 'event':
      // Real-time event (mail, log, status change)
      handleEvent(msg.event);
      break;
    case 'metrics':
      // Performance metrics
      updateMetrics(msg.data);
      break;
  }
};

ws.onclose = () => {
  console.log('Disconnected, reconnecting...');
  setTimeout(() => connect(), 1000);
};
```

## Tests

```bash
node --test test/status-detector.test.js
```
