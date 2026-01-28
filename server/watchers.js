import chokidar from 'chokidar';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export class FileWatcher {
  constructor(state) {
    this.state = state;
    this.watchers = [];
    this.gtDir = process.env.GT_DIR || `${process.env.HOME}/gt`;
    this.lastEventLines = {};
  }

  start() {
    // Watch the entire gt directory for relevant files
    const patterns = [
      `${this.gtDir}/*/.events.jsonl`,
      `${this.gtDir}/*/.feed.jsonl`,
      `${this.gtDir}/*/mayor/mail/**/*`,
      `${this.gtDir}/*/witness/mail/**/*`,
      `${this.gtDir}/*/refinery/mail/**/*`,
      `${this.gtDir}/*/crew/*/mail/**/*`,
      `${this.gtDir}/*/polecats/*/mail/**/*`,
      `${this.gtDir}/*/.beads/issues.jsonl`
    ];

    const watcher = chokidar.watch(patterns, {
      persistent: true,
      ignoreInitial: true,
      followSymlinks: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50
      }
    });

    watcher.on('add', path => this.handleFile(path, 'add'));
    watcher.on('change', path => this.handleFile(path, 'change'));

    this.watchers.push(watcher);
    console.log('File watcher started');
  }

  stop() {
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];
  }

  handleFile(filePath, eventType) {
    if (filePath.includes('.events.jsonl')) {
      this.handleEventsFile(filePath);
    } else if (filePath.includes('.feed.jsonl')) {
      this.handleFeedFile(filePath);
    } else if (filePath.includes('/mail/')) {
      this.handleMailFile(filePath, eventType);
    } else if (filePath.includes('issues.jsonl')) {
      this.handleBeadsFile(filePath);
    }
  }

  handleEventsFile(filePath) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.trim().split('\n');
      const lastKnown = this.lastEventLines[filePath] || 0;

      // Process only new lines
      const newLines = lines.slice(lastKnown);
      for (const line of newLines) {
        if (line.trim()) {
          try {
            const event = JSON.parse(line);
            this.state.addEvent({
              type: 'gt_event',
              source: this.extractRigName(filePath),
              ...event,
              timestamp: new Date().toISOString()
            });
          } catch {}
        }
      }

      this.lastEventLines[filePath] = lines.length;
    } catch (err) {
      console.error('Error reading events file:', err.message);
    }
  }

  handleFeedFile(filePath) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.trim().split('\n');
      const lastKnown = this.lastEventLines[filePath] || 0;

      const newLines = lines.slice(lastKnown);
      for (const line of newLines) {
        if (line.trim()) {
          try {
            const event = JSON.parse(line);
            this.state.addEvent({
              type: 'feed',
              source: this.extractRigName(filePath),
              ...event,
              timestamp: new Date().toISOString()
            });
          } catch {}
        }
      }

      this.lastEventLines[filePath] = lines.length;
    } catch (err) {
      console.error('Error reading feed file:', err.message);
    }
  }

  handleMailFile(filePath, eventType) {
    const rig = this.extractRigName(filePath);
    const agent = this.extractAgentName(filePath);

    if (eventType === 'add') {
      try {
        const content = readFileSync(filePath, 'utf-8');
        const firstLine = content.split('\n')[0];

        this.state.addMail({
          rig,
          to: agent,
          from: this.extractSenderFromPath(filePath),
          preview: firstLine.slice(0, 100),
          path: filePath,
          timestamp: new Date().toISOString()
        });
      } catch {}
    }
  }

  handleBeadsFile(filePath) {
    // Trigger a re-poll of beads when issues.jsonl changes
    this.state.emit('update', this.state.getState());
  }

  extractRigName(filePath) {
    const match = filePath.match(new RegExp(`${this.gtDir}/([^/]+)/`));
    return match ? match[1] : 'unknown';
  }

  extractAgentName(filePath) {
    // Extract agent from paths like /gt/rig/mayor/mail/... or /gt/rig/crew/name/mail/...
    const parts = filePath.split('/');
    const mailIndex = parts.indexOf('mail');
    if (mailIndex > 0) {
      // Check if it's crew or polecats (nested)
      if (parts[mailIndex - 2] === 'crew' || parts[mailIndex - 2] === 'polecats') {
        return `${parts[mailIndex - 2]}/${parts[mailIndex - 1]}`;
      }
      return parts[mailIndex - 1];
    }
    return 'unknown';
  }

  extractSenderFromPath(filePath) {
    // Try to extract sender from mail path structure
    const parts = filePath.split('/');
    const filename = parts[parts.length - 1];
    // Mail files often have sender info in name
    return filename.split('-')[0] || 'unknown';
  }
}
