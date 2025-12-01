#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');

const requiredArtifacts = [
  {
    path: path.join(repoRoot, 'android', 'app', 'src', 'main', 'java', 'com', 'hunteralert', 'app', 'NetworkMonitorPlugin.java'),
    snippet: '@CapacitorPlugin',
    description: 'Android plugin source (NetworkMonitorPlugin.java)',
  },
  {
    path: path.join(repoRoot, 'android', 'app', 'src', 'main', 'java', 'com', 'hunteralert', 'app', 'MainActivity.java'),
    snippet: 'registerPlugin(NetworkMonitorPlugin.class);',
    description: 'Android bridge registration in MainActivity.java',
  },
  {
    path: path.join(repoRoot, 'ios', 'App', 'App', 'NetworkMonitorPlugin.swift'),
    snippet: 'CAPBridgedPlugin',
    description: 'iOS plugin source (NetworkMonitorPlugin.swift)',
  },
];

function verifyFile({ path: filePath, snippet, description }) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${description} missing at ${filePath}. Run "npx cap sync" to regenerate native projects.`);
  }

  const contents = fs.readFileSync(filePath, 'utf8');
  if (contents.trim().length === 0) {
    throw new Error(`${description} exists but is empty: ${filePath}`);
  }

  if (snippet && !contents.includes(snippet)) {
    throw new Error(`${description} is missing expected marker "${snippet}". Regenerate native bridges via "npx cap sync".`);
  }
}

function main() {
  try {
    requiredArtifacts.forEach(verifyFile);
    console.log('✅ Capacitor native plugin sources and bridge registrations are present.');
  } catch (error) {
    console.error('❌ Capacitor bridge validation failed:');
    console.error(` - ${error.message}`);
    process.exit(1);
  }
}

main();
