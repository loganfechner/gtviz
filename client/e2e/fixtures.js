/**
 * Mock data and WebSocket setup for E2E tests
 */

export const mockAgents = [
  { name: 'mayor-1', role: 'mayor', status: 'running', task: 'Coordinating agents' },
  { name: 'witness-1', role: 'witness', status: 'running', task: 'Monitoring system' },
  { name: 'refinery-1', role: 'refinery', status: 'idle', task: null },
  { name: 'crew-alpha', role: 'crew', status: 'running', task: 'Processing data' },
  { name: 'crew-beta', role: 'crew', status: 'stopped', task: null },
  { name: 'polecat-1', role: 'polecat', status: 'running', task: 'Building feature' },
];

export const mockBeads = [
  { id: 'bead-1', title: 'Add feature X', status: 'in_progress', priority: 'high', dependsOn: [] },
  { id: 'bead-2', title: 'Fix bug Y', status: 'pending', priority: 'normal', dependsOn: ['bead-1'] },
  { id: 'bead-3', title: 'Write tests', status: 'open', priority: 'normal', dependsOn: ['bead-1', 'bead-2'] },
  { id: 'bead-4', title: 'Deploy to staging', status: 'open', priority: 'critical', dependsOn: ['bead-3'] },
];

export const mockHooks = {
  'polecat-1': { bead: 'bead-1', autonomous: true },
};

export const mockEvents = [
  { type: 'status', agent: 'crew-alpha', message: 'Started task', timestamp: Date.now() },
  { type: 'mail', from: 'mayor-1', to: 'crew-alpha', message: 'Begin work', timestamp: Date.now() - 1000 },
];

export const mockState = {
  rigs: { 'test-rig': true },
  agents: { 'test-rig': mockAgents },
  beads: { 'test-rig': mockBeads },
  hooks: { 'test-rig': mockHooks },
  mail: [],
  agentHistory: {},
  metrics: {
    pollDuration: { avg: 50, min: 20, max: 100 },
    updateFrequency: 2.5,
    successRate: 0.99,
  },
};

/**
 * Set up WebSocket mock that injects state into the app
 */
export async function setupMockWebSocket(page) {
  // Intercept WebSocket creation and immediately send mock state
  await page.addInitScript(() => {
    const mockState = {
      rigs: { 'test-rig': true },
      agents: {
        'test-rig': [
          { name: 'mayor-1', role: 'mayor', status: 'running', task: 'Coordinating agents' },
          { name: 'witness-1', role: 'witness', status: 'running', task: 'Monitoring system' },
          { name: 'refinery-1', role: 'refinery', status: 'idle', task: null },
          { name: 'crew-alpha', role: 'crew', status: 'running', task: 'Processing data' },
          { name: 'crew-beta', role: 'crew', status: 'stopped', task: null },
          { name: 'polecat-1', role: 'polecat', status: 'running', task: 'Building feature' },
        ],
      },
      beads: {
        'test-rig': [
          { id: 'bead-1', title: 'Add feature X', status: 'in_progress', priority: 'high', dependsOn: [] },
          { id: 'bead-2', title: 'Fix bug Y', status: 'pending', priority: 'normal', dependsOn: ['bead-1'] },
          { id: 'bead-3', title: 'Write tests', status: 'open', priority: 'normal', dependsOn: ['bead-1', 'bead-2'] },
          { id: 'bead-4', title: 'Deploy to staging', status: 'open', priority: 'critical', dependsOn: ['bead-3'] },
        ],
      },
      hooks: {
        'test-rig': { 'polecat-1': { bead: 'bead-1', autonomous: true } },
      },
      mail: [],
      agentHistory: {},
      metrics: {
        pollDuration: { avg: 50, min: 20, max: 100 },
        updateFrequency: 2.5,
        successRate: 0.99,
      },
    };

    // Override WebSocket
    const OriginalWebSocket = window.WebSocket;
    window.WebSocket = function (url) {
      const ws = {
        url,
        readyState: 1, // OPEN
        onopen: null,
        onmessage: null,
        onclose: null,
        onerror: null,
        send: () => {},
        close: () => {},
      };

      // Trigger onopen and send mock state after a tick
      setTimeout(() => {
        if (ws.onopen) ws.onopen({});
        if (ws.onmessage) {
          ws.onmessage({
            data: JSON.stringify({ type: 'state', data: mockState }),
          });
        }
      }, 50);

      return ws;
    };
    window.WebSocket.CONNECTING = 0;
    window.WebSocket.OPEN = 1;
    window.WebSocket.CLOSING = 2;
    window.WebSocket.CLOSED = 3;
  });
}

/**
 * Wait for the app to be fully loaded with agents visible
 */
export async function waitForAppReady(page) {
  // Wait for the network graph to have agent cards
  await page.waitForSelector('.card-wrapper', { timeout: 10000 });
}
