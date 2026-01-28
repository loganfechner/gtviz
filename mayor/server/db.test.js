/**
 * Database Module Tests
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createDatabaseManager } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test database path
const TEST_DB_PATH = path.join(__dirname, '../../data/test-gtviz.db');

describe('Database Module', () => {
  let db;

  beforeEach(() => {
    // Clean up test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    if (fs.existsSync(TEST_DB_PATH + '-wal')) {
      fs.unlinkSync(TEST_DB_PATH + '-wal');
    }
    if (fs.existsSync(TEST_DB_PATH + '-shm')) {
      fs.unlinkSync(TEST_DB_PATH + '-shm');
    }

    db = createDatabaseManager({
      dbPath: TEST_DB_PATH,
      retention: {
        events: 1,
        hooks: 1,
        beads: 1,
        mail: 1,
        metrics: 1
      }
    });
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    // Clean up test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    if (fs.existsSync(TEST_DB_PATH + '-wal')) {
      fs.unlinkSync(TEST_DB_PATH + '-wal');
    }
    if (fs.existsSync(TEST_DB_PATH + '-shm')) {
      fs.unlinkSync(TEST_DB_PATH + '-shm');
    }
  });

  describe('Events', () => {
    it('should record and retrieve events', () => {
      const timestamp = new Date().toISOString();

      db.recordEvent({
        type: 'hooks:updated',
        agent: 'test-agent',
        data: { foo: 'bar' },
        timestamp
      });

      const events = db.getEvents(
        new Date(Date.now() - 3600000).toISOString(),
        new Date(Date.now() + 3600000).toISOString()
      );

      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].type, 'hooks:updated');
      assert.strictEqual(events[0].agent, 'test-agent');
      assert.deepStrictEqual(events[0].data, { foo: 'bar' });
    });

    it('should get events by agent', () => {
      db.recordEvent({
        type: 'hooks:updated',
        agent: 'agent-1',
        data: { value: 1 },
        timestamp: new Date().toISOString()
      });

      db.recordEvent({
        type: 'hooks:updated',
        agent: 'agent-2',
        data: { value: 2 },
        timestamp: new Date().toISOString()
      });

      const events = db.getEventsByAgent(
        'agent-1',
        new Date(Date.now() - 3600000).toISOString()
      );

      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].agent, 'agent-1');
    });
  });

  describe('Hooks', () => {
    it('should record and retrieve hook snapshots', () => {
      const timestamp = new Date().toISOString();

      db.recordHook({
        agent: 'polecat-1',
        status: 'hooked',
        beadId: 'gt-test',
        beadTitle: 'Test bead',
        moleculeId: 'gt-mol-1',
        autonomousMode: true,
        label: 'Working on test',
        timestamp
      });

      const hooks = db.getLatestHooks();

      assert.strictEqual(hooks.length, 1);
      assert.strictEqual(hooks[0].agent, 'polecat-1');
      assert.strictEqual(hooks[0].status, 'hooked');
      assert.strictEqual(hooks[0].bead_id, 'gt-test');
    });

    it('should bulk record hook snapshots', () => {
      const hooks = {
        'agent-1': { status: 'active', beadId: 'gt-1' },
        'agent-2': { status: 'idle', beadId: null },
        'agent-3': { status: 'hooked', beadId: 'gt-2' }
      };

      db.recordHooksSnapshot(hooks);

      const latestHooks = db.getLatestHooks();
      assert.strictEqual(latestHooks.length, 3);
    });

    it('should get hook history for agent', () => {
      const timestamps = [
        new Date(Date.now() - 60000).toISOString(),
        new Date(Date.now() - 30000).toISOString(),
        new Date().toISOString()
      ];

      timestamps.forEach((ts, i) => {
        db.recordHook({
          agent: 'test-agent',
          status: i % 2 === 0 ? 'active' : 'idle',
          timestamp: ts
        });
      });

      const history = db.getHookHistory(
        'test-agent',
        new Date(Date.now() - 120000).toISOString()
      );

      assert.strictEqual(history.length, 3);
    });
  });

  describe('Beads', () => {
    it('should record and retrieve beads', () => {
      db.recordBead({
        beadId: 'gt-bead-1',
        title: 'Test bead',
        agent: 'polecat-1',
        status: 'active',
        attachedAt: new Date().toISOString(),
        data: { priority: 'P1' },
        timestamp: new Date().toISOString()
      });

      const bead = db.getBeadById('gt-bead-1');

      assert.strictEqual(bead.bead_id, 'gt-bead-1');
      assert.strictEqual(bead.title, 'Test bead');
      assert.strictEqual(bead.agent, 'polecat-1');
    });

    it('should update bead status', () => {
      db.recordBead({
        beadId: 'gt-bead-2',
        title: 'Test bead 2',
        status: 'active',
        timestamp: new Date().toISOString()
      });

      const completedAt = new Date().toISOString();
      db.updateBeadStatus('gt-bead-2', 'completed', completedAt);

      const bead = db.getBeadById('gt-bead-2');
      assert.strictEqual(bead.status, 'completed');
    });

    it('should get beads by agent', () => {
      db.recordBead({
        beadId: 'gt-b1',
        agent: 'agent-1',
        timestamp: new Date().toISOString()
      });

      db.recordBead({
        beadId: 'gt-b2',
        agent: 'agent-1',
        timestamp: new Date().toISOString()
      });

      db.recordBead({
        beadId: 'gt-b3',
        agent: 'agent-2',
        timestamp: new Date().toISOString()
      });

      const beads = db.getBeadsByAgent('agent-1');
      assert.strictEqual(beads.length, 2);
    });
  });

  describe('Mail', () => {
    it('should record and retrieve mail', () => {
      db.recordMail({
        mailId: 'mail-1',
        sender: 'mayor',
        recipient: 'polecat-1',
        subject: 'Test mail',
        body: 'Hello world',
        status: 'pending',
        timestamp: new Date().toISOString()
      });

      const mail = db.getMailByRecipient('polecat-1');

      assert.strictEqual(mail.length, 1);
      assert.strictEqual(mail[0].mail_id, 'mail-1');
      assert.strictEqual(mail[0].subject, 'Test mail');
    });

    it('should update mail status', () => {
      db.recordMail({
        mailId: 'mail-2',
        recipient: 'polecat-2',
        status: 'pending',
        timestamp: new Date().toISOString()
      });

      db.updateMailStatus('mail-2', 'read');

      const mail = db.getMailByRecipient('polecat-2');
      assert.strictEqual(mail[0].status, 'read');
    });
  });

  describe('Metrics', () => {
    it('should record and retrieve metrics', () => {
      db.recordMetrics({
        pollDuration: 150,
        eventCount: 5,
        agentActivity: {
          active: 2,
          hooked: 3,
          idle: 1,
          error: 0
        },
        data: { extra: 'info' },
        timestamp: new Date().toISOString()
      });

      const metrics = db.getMetrics(
        new Date(Date.now() - 3600000).toISOString(),
        new Date(Date.now() + 3600000).toISOString()
      );

      assert.strictEqual(metrics.length, 1);
      assert.strictEqual(metrics[0].poll_duration, 150);
      assert.strictEqual(metrics[0].active_agents, 2);
    });
  });

  describe('Trending Queries', () => {
    it('should get agent activity trends', () => {
      // Insert multiple metrics records
      for (let i = 0; i < 5; i++) {
        db.recordMetrics({
          pollDuration: 100 + i * 10,
          eventCount: i,
          agentActivity: {
            active: 2 + i,
            hooked: 3,
            idle: 1,
            error: 0
          },
          timestamp: new Date().toISOString()
        });
      }

      const trends = db.getAgentActivityTrends(
        new Date(Date.now() - 86400000).toISOString(),
        'hour'
      );

      assert.ok(trends.length > 0);
      assert.ok(trends[0].avg_active !== undefined);
    });

    it('should get event trends', () => {
      for (let i = 0; i < 5; i++) {
        db.recordEvent({
          type: 'hooks:updated',
          agent: 'test-agent',
          data: {},
          timestamp: new Date().toISOString()
        });
      }

      const trends = db.getEventTrends(
        new Date(Date.now() - 86400000).toISOString(),
        'hour'
      );

      assert.ok(trends.length > 0);
    });

    it('should get hook status distribution', () => {
      db.recordHook({
        agent: 'test-agent',
        status: 'active',
        timestamp: new Date().toISOString()
      });

      db.recordHook({
        agent: 'test-agent',
        status: 'idle',
        timestamp: new Date().toISOString()
      });

      const distribution = db.getHookStatusDistribution(
        'test-agent',
        new Date(Date.now() - 86400000).toISOString()
      );

      assert.ok(distribution.length > 0);
    });
  });

  describe('Retention', () => {
    it('should get retention policy', () => {
      const policy = db.getRetentionPolicy();

      assert.strictEqual(policy.events, 1);
      assert.strictEqual(policy.hooks, 1);
      assert.strictEqual(policy.beads, 1);
      assert.strictEqual(policy.mail, 1);
      assert.strictEqual(policy.metrics, 1);
    });

    it('should apply retention and clean old data', () => {
      // Add some data
      db.recordEvent({
        type: 'test',
        data: {},
        timestamp: new Date().toISOString()
      });

      const results = db.applyRetention();

      assert.ok(results.events !== undefined);
      assert.ok(results.hooks !== undefined);
      assert.ok(results.beads !== undefined);
      assert.ok(results.mail !== undefined);
      assert.ok(results.metrics !== undefined);
    });
  });

  describe('Statistics', () => {
    it('should get database stats', () => {
      // Add some data
      db.recordEvent({
        type: 'test',
        data: {},
        timestamp: new Date().toISOString()
      });

      const stats = db.getStats();

      assert.ok(stats.events >= 1);
      assert.ok(stats.fileSizeBytes !== undefined);
    });
  });

  describe('Raw Query', () => {
    it('should execute raw queries', () => {
      db.recordEvent({
        type: 'raw-test',
        data: {},
        timestamp: new Date().toISOString()
      });

      const results = db.query(
        'SELECT COUNT(*) as count FROM events WHERE type = ?',
        ['raw-test']
      );

      assert.strictEqual(results[0].count, 1);
    });
  });
});
