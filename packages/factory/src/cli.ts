#!/usr/bin/env node
import { configFromEnv, runBoundedCycle, status } from './index.js';

const command = process.argv[2] || 'once';
const c = configFromEnv();
async function main() { try {
  if (command === 'status') console.log(JSON.stringify(status(c), null, 2));
  else if (command === 'once' || command === 'canary' || command === 'dry-run') {
    if (command === 'dry-run' || command === 'canary') console.log(JSON.stringify({status:'PASS',mode:command,config:{...c,stateDir:'[configured]'},message:'No gateway call performed'}, null, 2));
    else { const r = await runBoundedCycle(c); console.log(JSON.stringify(r, null, 2)); if (['error','transient_failure','configuration_blocked'].includes(r.status)) process.exitCode=1; }
  } else throw new Error('usage: factory once|status|canary|dry-run');
} catch (e) { console.log(JSON.stringify({status:'FAIL',error:e instanceof Error ? e.message : String(e)})); process.exitCode=1; } }
void main();
