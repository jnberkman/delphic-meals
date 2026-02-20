#!/usr/bin/env node
// ─────────────────────────────────────────────────────
//  Auto Push + Deploy watcher for Google Apps Script
//  Watches Code.gs → clasp push → clasp deploy (same URL)
// ─────────────────────────────────────────────────────
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEPLOYMENT_ID = 'AKfycbz9cIYGawV81WL26gK6Sq66tGgUZ29v6iMZjMC1wstX40nTdm98-2oPJ8zWTeiXa1Gxiw';
const CLASP = '/opt/homebrew/bin/clasp';
const DIR = __dirname;
const ENV = { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH || ''}` };

let debounce = null;
let busy = false;

function run(label, cmd) {
  process.stdout.write(label + ' ... ');
  execSync(cmd, { cwd: DIR, env: ENV, stdio: ['ignore', 'ignore', 'pipe'] });
  console.log('done');
}

function pushAndDeploy() {
  if (busy) return;
  busy = true;
  const stamp = new Date().toLocaleTimeString();
  console.log(`\n[${stamp}] Change detected — pushing to Apps Script`);
  try {
    run('  pushing code', `${CLASP} push`);
    run('  deploying  ', `${CLASP} deploy -i ${DEPLOYMENT_ID}`);
    console.log('  frontend live — no URL change');
  } catch (e) {
    const msg = e.stderr ? e.stderr.toString().trim() : e.message;
    console.error('  ERROR:', msg);
  }
  busy = false;
}

// Watch Code.gs for saves
fs.watch(path.join(DIR, 'Code.gs'), (event) => {
  if (event !== 'change') return;
  clearTimeout(debounce);
  debounce = setTimeout(pushAndDeploy, 800); // debounce rapid saves
});

console.log('Watching Code.gs — save to auto-push and deploy');
console.log('Deployment: ' + DEPLOYMENT_ID.slice(0, 20) + '...');
console.log('Press Ctrl+C to stop\n');
