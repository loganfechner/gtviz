/**
 * Agent Output Fetcher
 *
 * Fetches last output snippet from agent activity files.
 * Looks at .events.jsonl, .feed.jsonl, and mail directories.
 */

import { readFile, stat, readdir } from 'fs/promises';
import { join } from 'path';

const MAX_OUTPUT_LENGTH = 100;

/**
 * Get the last output snippet from an agent's activity
 * @param {string} agentPath - Path to the agent directory
 * @returns {Promise<string|null>} Last output snippet or null
 */
export async function getLastOutput(agentPath) {
  const sources = [
    { file: '.events.jsonl', parser: parseEventsJsonl },
    { file: '.feed.jsonl', parser: parseFeedJsonl }
  ];

  for (const source of sources) {
    try {
      const filePath = join(agentPath, source.file);
      const content = await readLastLines(filePath, 10);
      if (content) {
        const output = source.parser(content);
        if (output) return truncate(output, MAX_OUTPUT_LENGTH);
      }
    } catch {
      // File doesn't exist or can't be read, try next source
    }
  }

  // Try to get last mail subject as fallback
  try {
    const mailPath = join(agentPath, 'mail');
    const mailOutput = await getLastMailSubject(mailPath);
    if (mailOutput) return truncate(mailOutput, MAX_OUTPUT_LENGTH);
  } catch {
    // No mail found
  }

  return null;
}

/**
 * Read last N lines from a file
 * @param {string} filePath - Path to the file
 * @param {number} numLines - Number of lines to read
 * @returns {Promise<string>} Last lines content
 */
async function readLastLines(filePath, numLines) {
  const content = await readFile(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  return lines.slice(-numLines).join('\n');
}

/**
 * Parse events.jsonl to extract last meaningful output
 * @param {string} content - JSONL content
 * @returns {string|null} Extracted output
 */
function parseEventsJsonl(content) {
  const lines = content.trim().split('\n').reverse();

  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      // Look for tool results or assistant messages
      if (event.type === 'tool_result' && event.output) {
        return event.output;
      }
      if (event.type === 'assistant' && event.content) {
        return typeof event.content === 'string'
          ? event.content
          : JSON.stringify(event.content);
      }
      if (event.message) {
        return event.message;
      }
    } catch {
      // Skip invalid JSON lines
    }
  }

  return null;
}

/**
 * Parse feed.jsonl to extract last meaningful output
 * @param {string} content - JSONL content
 * @returns {string|null} Extracted output
 */
function parseFeedJsonl(content) {
  const lines = content.trim().split('\n').reverse();

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.text || entry.content || entry.output) {
        return entry.text || entry.content || entry.output;
      }
    } catch {
      // Skip invalid JSON lines
    }
  }

  return null;
}

/**
 * Get the subject of the most recent mail
 * @param {string} mailPath - Path to mail directory
 * @returns {Promise<string|null>} Mail subject or null
 */
async function getLastMailSubject(mailPath) {
  try {
    const files = await readdir(mailPath);
    if (files.length === 0) return null;

    // Get the most recently modified mail file
    let latestFile = null;
    let latestMtime = 0;

    for (const file of files) {
      const filePath = join(mailPath, file);
      const fileStat = await stat(filePath);
      if (fileStat.mtimeMs > latestMtime) {
        latestMtime = fileStat.mtimeMs;
        latestFile = filePath;
      }
    }

    if (!latestFile) return null;

    const content = await readFile(latestFile, 'utf-8');
    const subjectMatch = content.match(/^Subject:\s*(.+)$/m);
    if (subjectMatch) {
      return `Mail: ${subjectMatch[1]}`;
    }

    // Try JSON format
    try {
      const mail = JSON.parse(content);
      if (mail.subject) return `Mail: ${mail.subject}`;
    } catch {
      // Not JSON format
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Truncate string to max length with ellipsis
 * @param {string} str - String to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated string
 */
function truncate(str, maxLength) {
  if (!str) return '';
  const cleaned = str.replace(/\n/g, ' ').trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength - 3) + '...';
}

/**
 * Get last activity timestamp for an agent
 * @param {string} agentPath - Path to the agent directory
 * @returns {Promise<Date|null>} Last activity timestamp
 */
export async function getLastActivity(agentPath) {
  const files = ['.events.jsonl', '.feed.jsonl', 'session.json'];
  let latestTime = null;

  for (const file of files) {
    try {
      const filePath = join(agentPath, file);
      const fileStat = await stat(filePath);
      if (!latestTime || fileStat.mtime > latestTime) {
        latestTime = fileStat.mtime;
      }
    } catch {
      // File doesn't exist
    }
  }

  return latestTime;
}
