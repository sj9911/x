#!/usr/bin/env node
'use strict';

const { startServer } = require('../src/server');

const command = process.argv[2] || 'help';

switch (command) {
  case 'start':
    startServer(process.cwd());
    break;

  case 'stop':
    console.log('🌿 Press Ctrl+C in the running Grass terminal to stop.');
    break;

  case 'status':
    console.log('🌿 Run `grass start` in your project directory to see status.');
    break;

  default:
    console.log(`
🌿 Grass — Mobile Remote Interface for Claude Code

Usage:
  grass start     Start the server and launch Claude Code
  grass stop      Stop with Ctrl+C
  grass status    Show connection info

Run from your project directory.
    `.trim());
}
