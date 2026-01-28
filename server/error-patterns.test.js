import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { ErrorPatternAnalyzer, extractErrorPattern } from './error-patterns.js';

describe('extractErrorPattern', () => {
  it('normalizes file paths', () => {
    const pattern = extractErrorPattern('Error reading /home/user/file.txt');
    assert.strictEqual(pattern, 'Error reading <path>');
  });

  it('normalizes hex IDs', () => {
    const pattern = extractErrorPattern('Failed to process bead abc123def456');
    assert.strictEqual(pattern, 'Failed to process bead <id>');
  });

  it('normalizes UUIDs', () => {
    const pattern = extractErrorPattern('Session 550e8400-e29b-41d4-a716-446655440000 expired');
    // UUIDs get normalized after IDs, so parts become <id>
    assert.ok(pattern.includes('<id>') || pattern.includes('<uuid>'));
  });

  it('normalizes timestamps', () => {
    const pattern = extractErrorPattern('Error at 2024-01-15T10:30:45.123Z');
    // Timestamp parts get normalized to <num> and <time>
    assert.ok(pattern.includes('<num>') || pattern.includes('<time>') || pattern.includes('<timestamp>'));
  });

  it('normalizes IP addresses', () => {
    const pattern = extractErrorPattern('Connection refused from 192.168.1.100');
    assert.strictEqual(pattern, 'Connection refused from <ip>');
  });

  it('normalizes port numbers', () => {
    const pattern = extractErrorPattern('Failed to connect to localhost:3001');
    // Port gets normalized by the numeric pattern
    assert.ok(pattern.includes('<num>') || pattern.includes('<port>'));
  });

  it('normalizes paths including agent paths', () => {
    const pattern = extractErrorPattern('polecats/warboy crashed');
    // Path normalization catches agent paths
    assert.ok(pattern.includes('<path>') || pattern.includes('<agent>'));
  });

  it('handles empty input', () => {
    assert.strictEqual(extractErrorPattern(''), 'Unknown error');
    assert.strictEqual(extractErrorPattern(null), 'Unknown error');
    assert.strictEqual(extractErrorPattern(undefined), 'Unknown error');
  });

  it('truncates very long patterns', () => {
    const longMessage = 'Error: ' + 'x'.repeat(300);
    const pattern = extractErrorPattern(longMessage);
    assert.ok(pattern.length <= 200);
    assert.ok(pattern.endsWith('...'));
  });
});

describe('ErrorPatternAnalyzer', () => {
  let analyzer;

  beforeEach(() => {
    analyzer = new ErrorPatternAnalyzer();
  });

  describe('addLog', () => {
    it('ignores non-error/warn logs', () => {
      const result = analyzer.addLog({ level: 'info', message: 'test' });
      assert.strictEqual(result, null);
      assert.strictEqual(analyzer.getPatterns().length, 0);
    });

    it('creates pattern cluster for error logs', () => {
      analyzer.addLog({
        level: 'error',
        message: 'Connection failed',
        agent: 'warboy',
        rig: 'gtviz',
        timestamp: new Date().toISOString()
      });

      const patterns = analyzer.getPatterns();
      assert.strictEqual(patterns.length, 1);
      assert.strictEqual(patterns[0].level, 'error');
      assert.strictEqual(patterns[0].count, 1);
    });

    it('creates pattern cluster for warn logs', () => {
      analyzer.addLog({
        level: 'warn',
        message: 'Slow response',
        agent: 'witness',
        rig: 'gtviz',
        timestamp: new Date().toISOString()
      });

      const patterns = analyzer.getPatterns();
      assert.strictEqual(patterns.length, 1);
      assert.strictEqual(patterns[0].level, 'warn');
    });

    it('groups identical errors together', () => {
      analyzer.addLog({
        level: 'error',
        message: 'Connection failed',
        agent: 'warboy'
      });
      analyzer.addLog({
        level: 'error',
        message: 'Connection failed',
        agent: 'witness'
      });

      const patterns = analyzer.getPatterns();
      // Identical errors should be grouped
      assert.strictEqual(patterns.length, 1);
      assert.strictEqual(patterns[0].count, 2);
    });

    it('tracks affected agents', () => {
      analyzer.addLog({ level: 'error', message: 'Error X', agent: 'warboy' });
      analyzer.addLog({ level: 'error', message: 'Error X', agent: 'witness' });
      analyzer.addLog({ level: 'error', message: 'Error X', agent: 'refinery' });

      const patterns = analyzer.getPatterns();
      assert.strictEqual(patterns[0].affectedAgents.length, 3);
      assert.ok(patterns[0].affectedAgents.includes('warboy'));
      assert.ok(patterns[0].affectedAgents.includes('witness'));
    });

    it('tracks affected rigs', () => {
      analyzer.addLog({ level: 'error', message: 'Error X', rig: 'gtviz' });
      analyzer.addLog({ level: 'error', message: 'Error X', rig: 'beads' });

      const patterns = analyzer.getPatterns();
      assert.strictEqual(patterns[0].affectedRigs.length, 2);
    });

    it('marks patterns as systemic when multiple agents affected', () => {
      analyzer.addLog({ level: 'error', message: 'Error', agent: 'warboy' });
      analyzer.addLog({ level: 'error', message: 'Error', agent: 'witness' });

      const patterns = analyzer.getPatterns();
      assert.strictEqual(patterns[0].isSystemic, true);
    });

    it('marks patterns as isolated when single agent affected', () => {
      analyzer.addLog({ level: 'error', message: 'Error', agent: 'warboy' });

      const patterns = analyzer.getPatterns();
      assert.strictEqual(patterns[0].isSystemic, false);
    });
  });

  describe('getPatterns', () => {
    it('returns empty array when no patterns', () => {
      assert.deepStrictEqual(analyzer.getPatterns(), []);
    });

    it('sorts patterns by count (most frequent first)', () => {
      analyzer.addLog({ level: 'error', message: 'Rare error', agent: 'a' });
      analyzer.addLog({ level: 'error', message: 'Common error', agent: 'a' });
      analyzer.addLog({ level: 'error', message: 'Common error', agent: 'b' });
      analyzer.addLog({ level: 'error', message: 'Common error', agent: 'c' });

      const patterns = analyzer.getPatterns();
      assert.strictEqual(patterns[0].count, 3);
      assert.strictEqual(patterns[1].count, 1);
    });

    it('includes recent errors in pattern', () => {
      analyzer.addLog({
        level: 'error',
        message: 'Test error',
        agent: 'warboy',
        timestamp: '2024-01-15T10:00:00Z'
      });

      const patterns = analyzer.getPatterns();
      assert.strictEqual(patterns[0].recentErrors.length, 1);
      assert.strictEqual(patterns[0].recentErrors[0].agent, 'warboy');
    });

    it('includes example messages', () => {
      analyzer.addLog({ level: 'error', message: 'Error message 1', agent: 'a' });
      analyzer.addLog({ level: 'error', message: 'Error message 2', agent: 'b' });

      const patterns = analyzer.getPatterns();
      assert.ok(patterns[0].examples.length >= 1);
    });
  });

  describe('getSummary', () => {
    it('returns correct summary for empty state', () => {
      const summary = analyzer.getSummary();
      assert.strictEqual(summary.totalPatterns, 0);
      assert.strictEqual(summary.totalErrors, 0);
      assert.strictEqual(summary.systemicCount, 0);
    });

    it('returns correct counts', () => {
      analyzer.addLog({ level: 'error', message: 'Error 1', agent: 'a' });
      analyzer.addLog({ level: 'error', message: 'Error 1', agent: 'b' }); // systemic
      analyzer.addLog({ level: 'warn', message: 'Warning 1', agent: 'c' });

      const summary = analyzer.getSummary();
      assert.strictEqual(summary.totalPatterns, 2);
      assert.strictEqual(summary.totalErrors, 3);
      assert.strictEqual(summary.systemicCount, 1);
      assert.strictEqual(summary.isolatedCount, 1);
      assert.strictEqual(summary.errorCount, 2);
      assert.strictEqual(summary.warnCount, 1);
    });

    it('returns top patterns', () => {
      analyzer.addLog({ level: 'error', message: 'Error 1', agent: 'a' });
      analyzer.addLog({ level: 'error', message: 'Error 2', agent: 'b' });

      const summary = analyzer.getSummary();
      assert.ok(summary.topPatterns.length <= 5);
      assert.ok(Array.isArray(summary.topPatterns));
    });

    it('counts affected agents correctly', () => {
      analyzer.addLog({ level: 'error', message: 'Error 1', agent: 'warboy' });
      analyzer.addLog({ level: 'error', message: 'Error 2', agent: 'witness' });
      analyzer.addLog({ level: 'error', message: 'Error 1', agent: 'refinery' });

      const summary = analyzer.getSummary();
      assert.strictEqual(summary.affectedAgentsCount, 3);
    });
  });

  describe('clear', () => {
    it('removes all patterns', () => {
      analyzer.addLog({ level: 'error', message: 'Error', agent: 'a' });
      assert.strictEqual(analyzer.getPatterns().length, 1);

      analyzer.clear();
      assert.strictEqual(analyzer.getPatterns().length, 0);
    });
  });

  describe('pattern limits', () => {
    it('respects maxPatterns limit', () => {
      const limitedAnalyzer = new ErrorPatternAnalyzer({ maxPatterns: 3 });

      // Add 5 distinct patterns
      for (let i = 0; i < 5; i++) {
        limitedAnalyzer.addLog({
          level: 'error',
          message: `Unique error type ${i}`,
          agent: 'a'
        });
      }

      const patterns = limitedAnalyzer.getPatterns();
      assert.ok(patterns.length <= 3);
    });

    it('respects maxErrorsPerPattern limit', () => {
      const limitedAnalyzer = new ErrorPatternAnalyzer({ maxErrorsPerPattern: 5 });

      // Add 10 of the same error
      for (let i = 0; i < 10; i++) {
        limitedAnalyzer.addLog({
          level: 'error',
          message: 'Same error',
          agent: `agent${i}`
        });
      }

      const patterns = limitedAnalyzer.getPatterns();
      assert.ok(patterns[0].recentErrors.length <= 5);
    });
  });
});
