'use strict';

const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const { spawn } = require('child_process');
const { readFileSync } = require('fs');
const path = require('path');
const os = require('os');
const qrcode = require('qrcode-terminal');

const PORT = Number(process.env.GRASS_PORT) || 3847;
const WEB_HTML = path.join(__dirname, '../../web/index.html');

// ─── Utilities ────────────────────────────────────────────────────────────────

function getLocalIP() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

function stripAnsi(str) {
  return str
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
    .replace(/\x1b[()][A-B0-9]/g, '')
    .replace(/\x1b[=>]/g, '')
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');
}

function broadcast(clients, data) {
  const msg = JSON.stringify(data);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

// ─── Output Parser ────────────────────────────────────────────────────────────
// Parses raw Claude Code stdout/pty output into structured message events.

function parseOutput(raw) {
  const events = [];
  const text = stripAnsi(raw);
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;

    // Permission prompt — Claude shows "Allow [tool]: [command]?" style prompts
    if (
      /allow\s+(bash|command|tool|running|write|edit|read)/i.test(t) ||
      /\bpermission\b/i.test(t)
    ) {
      const cmdMatch = t.match(/(?:bash|run|execute|command|:)\s+(.+)/i);
      events.push({
        type: 'permission',
        command: cmdMatch ? cmdMatch[1].trim() : t,
        id: `perm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      });
      continue;
    }

    // File change — "Created foo.js", "Modified src/bar.ts", etc.
    const fileMatch = t.match(
      /^(Created|Modified|Deleted|Wrote|Updated|Renamed)\s+([\w./\-]+\.\w+)/
    );
    if (fileMatch) {
      events.push({ type: 'file_change', action: fileMatch[1], file: fileMatch[2] });
      continue;
    }

    // Terminal/bash output — lines starting with $ or >
    if (/^[$%>]\s/.test(t)) {
      events.push({ type: 'terminal', content: t });
      continue;
    }

    // Default: Claude text response
    events.push({ type: 'response', content: t, messageType: 'text' });
  }

  return events;
}

// ─── Claude Process ───────────────────────────────────────────────────────────

function launchClaude(cwd, clients) {
  // Try node-pty first (full terminal emulation), fall back to pipe
  let pty;
  try {
    pty = require('node-pty');
  } catch {
    pty = null;
  }

  if (pty) {
    console.log('   Mode: PTY (full terminal emulation)\n');
    const proc = pty.spawn('claude', [], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd,
      env: process.env,
    });

    proc.onData((data) => {
      const events = parseOutput(data);
      for (const ev of events) broadcast(clients, ev);
    });

    proc.onExit(({ exitCode }) => {
      broadcast(clients, { type: 'session_end', exitCode });
      console.log(`\n🌿 Claude exited (code ${exitCode})`);
    });

    proc._isPty = true;
    return proc;
  }

  // Fallback: pipe mode
  console.log('   Mode: Pipe (install node-pty for full terminal support)\n');
  const proc = spawn('claude', [], {
    cwd,
    env: { ...process.env, TERM: 'dumb', NO_COLOR: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  proc.stdout.on('data', (data) => {
    const events = parseOutput(data.toString());
    for (const ev of events) broadcast(clients, ev);
  });

  proc.stderr.on('data', (data) => {
    const clean = stripAnsi(data.toString()).trim();
    if (clean) broadcast(clients, { type: 'terminal', content: clean });
  });

  proc.on('exit', (code) => {
    broadcast(clients, { type: 'session_end', exitCode: code });
    console.log(`\n🌿 Claude exited (code ${code})`);
  });

  proc._isPty = false;
  return proc;
}

// ─── Message Handler ──────────────────────────────────────────────────────────

function handlePhoneMessage(msg, claudeProcess) {
  if (!claudeProcess) return;
  const isPty = claudeProcess._isPty;

  switch (msg.type) {
    case 'prompt': {
      if (!msg.content) return;
      const input = msg.content + (isPty ? '\r' : '\n');
      isPty ? claudeProcess.write(input) : claudeProcess.stdin.write(input);
      console.log(`  → Prompt: "${msg.content.slice(0, 60)}${msg.content.length > 60 ? '…' : ''}"`);
      break;
    }

    case 'permission_response': {
      // Claude Code shows "1) Allow always  2) Deny" or y/n prompts
      const yes = msg.allowed;
      if (isPty) {
        claudeProcess.write(yes ? 'y\r' : 'n\r');
      } else {
        claudeProcess.stdin.write(yes ? 'y\n' : 'n\n');
      }
      console.log(`  → Permission: ${yes ? 'Allowed ✓' : 'Denied ✗'}`);
      break;
    }

    case 'ping':
      break; // keepalive — no action needed

    default:
      break;
  }
}

// ─── Main Server ──────────────────────────────────────────────────────────────

function startServer(cwd) {
  const clients = new Set();
  let claudeProcess = null;

  // HTTP — serves the Grass web app
  const httpServer = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
      try {
        const html = readFileSync(WEB_HTML);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      } catch {
        res.writeHead(500);
        res.end('Web app not found — make sure grass/web/index.html exists.');
      }
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  // WebSocket
  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws) => {
    clients.add(ws);
    console.log(`📱 Phone connected (${clients.size} device${clients.size > 1 ? 's' : ''} active)`);

    // Send initial state
    ws.send(
      JSON.stringify({
        type: 'connected',
        project: path.basename(cwd),
        path: cwd,
        claudeRunning: !!claudeProcess,
      })
    );

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        handlePhoneMessage(msg, claudeProcess);
      } catch (e) {
        console.error('Message parse error:', e.message);
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`📱 Phone disconnected (${clients.size} device${clients.size !== 1 ? 's' : ''} active)`);
    });

    ws.on('error', (err) => console.error('WebSocket error:', err.message));
  });

  // Keepalive pings every 25 seconds
  const pingInterval = setInterval(() => {
    broadcast(clients, { type: 'ping' });
  }, 25000);

  httpServer.on('close', () => clearInterval(pingInterval));

  // Start listening
  httpServer.listen(PORT, () => {
    const ip = getLocalIP();
    const url = `http://${ip}:${PORT}`;

    console.log('\n🌿 Grass is running\n');
    console.log(`   URL:  \x1b[36m${url}\x1b[0m`);
    console.log(`   Port: ${PORT}\n`);
    console.log('   Scan this QR code with your phone:\n');
    qrcode.generate(url, { small: true });
    console.log('\n   Launching Claude Code...\n');
    console.log('─'.repeat(50) + '\n');

    claudeProcess = launchClaude(cwd, clients);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\n🌿 Shutting down Grass...');
    broadcast(clients, { type: 'server_shutdown' });
    if (claudeProcess) {
      claudeProcess._isPty
        ? claudeProcess.kill()
        : claudeProcess.kill('SIGTERM');
    }
    httpServer.close(() => process.exit(0));
  });
}

module.exports = { startServer };
