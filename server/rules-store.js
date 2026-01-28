/**
 * Rules Store
 *
 * Simple JSON file-based persistence for alert rules.
 * Provides load/save operations with in-memory cache.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname } from 'path';
import logger from './logger.js';

const DEFAULT_RULES_PATH = './data/alert-rules.json';

export class RulesStore {
  constructor(filePath = DEFAULT_RULES_PATH) {
    this.filePath = filePath;
    this.rules = null; // In-memory cache
  }

  /**
   * Load rules from file
   * @returns {Array} Array of rules
   */
  async loadRules() {
    if (this.rules !== null) {
      return this.rules;
    }

    try {
      if (!existsSync(this.filePath)) {
        // Return default rules if file doesn't exist
        this.rules = this.getDefaultRules();
        // Save default rules to create the file
        await this.saveRules(this.rules);
        return this.rules;
      }

      const content = await readFile(this.filePath, 'utf-8');
      this.rules = JSON.parse(content);
      logger.info('rules-store', 'Loaded rules from file', { count: this.rules.length });
      return this.rules;
    } catch (err) {
      logger.error('rules-store', 'Error loading rules', { error: err.message });
      // Return default rules on error
      this.rules = this.getDefaultRules();
      return this.rules;
    }
  }

  /**
   * Save rules to file
   * @param {Array} rules - Array of rules to save
   */
  async saveRules(rules) {
    try {
      // Ensure directory exists
      const dir = dirname(this.filePath);
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }

      await writeFile(this.filePath, JSON.stringify(rules, null, 2), 'utf-8');
      this.rules = rules;
      logger.debug('rules-store', 'Saved rules to file', { count: rules.length });
    } catch (err) {
      logger.error('rules-store', 'Error saving rules', { error: err.message });
      throw err;
    }
  }

  /**
   * Get default example rules
   * @returns {Array} Array of default rules
   */
  getDefaultRules() {
    return [
      {
        id: 'rule-default-1',
        name: 'Agent Stopped',
        description: 'Alert when any agent stops running',
        enabled: false,
        cooldown: 60,
        condition: {
          type: 'agent_status',
          agent: '*',
          rig: '*',
          to: 'stopped'
        },
        actions: [
          { type: 'toast', duration: 5000 },
          { type: 'log', level: 'warn' }
        ],
        createdAt: new Date().toISOString()
      },
      {
        id: 'rule-default-2',
        name: 'High Error Rate',
        description: 'Alert when 5 or more errors occur in 5 minutes',
        enabled: false,
        cooldown: 300,
        condition: {
          type: 'error_count',
          count: 5,
          windowMs: 300000, // 5 minutes
          agent: '*',
          rig: '*'
        },
        actions: [
          { type: 'toast', duration: 8000 },
          { type: 'log', level: 'error' }
        ],
        createdAt: new Date().toISOString()
      },
      {
        id: 'rule-default-3',
        name: 'Hooked Bead Too Long',
        description: 'Alert when a bead stays hooked for more than 30 seconds',
        enabled: false,
        cooldown: 60,
        condition: {
          type: 'bead_duration',
          status: 'hooked',
          durationMs: 30000, // 30 seconds
          rig: '*'
        },
        actions: [
          { type: 'toast', duration: 5000 },
          { type: 'log', level: 'warn' }
        ],
        createdAt: new Date().toISOString()
      },
      {
        id: 'rule-default-4',
        name: 'Poll Success Rate Low',
        description: 'Alert when poll success rate drops below 90%',
        enabled: false,
        cooldown: 120,
        condition: {
          type: 'metric_threshold',
          metric: 'successRate',
          operator: '<',
          threshold: 90
        },
        actions: [
          { type: 'toast', duration: 5000 },
          { type: 'log', level: 'warn' }
        ],
        createdAt: new Date().toISOString()
      },
      {
        id: 'rule-default-5',
        name: 'Critical Bead Created',
        description: 'Alert when any bead is marked as critical priority',
        enabled: false,
        cooldown: 30,
        condition: {
          type: 'event_pattern',
          eventType: 'bead_status_change',
          pattern: 'critical',
          source: '*'
        },
        actions: [
          { type: 'toast', duration: 10000 },
          { type: 'log', level: 'error' }
        ],
        createdAt: new Date().toISOString()
      }
    ];
  }

  /**
   * Clear in-memory cache
   */
  clearCache() {
    this.rules = null;
  }
}
