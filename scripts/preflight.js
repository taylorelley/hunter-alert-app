#!/usr/bin/env node

const { spawnSync } = require('child_process');

const steps = [
  { name: 'Lint (eslint)', command: ['pnpm', 'lint'] },
  { name: 'Unit tests (vitest)', command: ['pnpm', 'test'] },
  { name: 'Platform flag checks', command: ['node', 'scripts/check-platform-flags.js'] },
  { name: 'Capacitor plugin & bridge checks', command: ['node', 'scripts/check-capacitor-bridge.js'] },
];

function runStep(step) {
  console.log(`\n▶️  ${step.name}`);
  const result = spawnSync(step.command[0], step.command.slice(1), { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`❌ ${step.name} failed.`);
    process.exit(result.status ?? 1);
  }
  console.log(`✅ ${step.name} succeeded.`);
}

function main() {
  console.log('Running release preflight checklist...');
  steps.forEach(runStep);
  console.log('\nAll preflight checks passed. You are ready to cut a release.');
}

main();
