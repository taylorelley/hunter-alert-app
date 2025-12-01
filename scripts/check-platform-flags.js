#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');

function readFileOrExit(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Missing required file: ${filePath}`);
    process.exit(1);
  }
  return fs.readFileSync(filePath, 'utf8');
}

function ensure(condition, message, problems) {
  if (!condition) {
    problems.push(message);
  }
}

function checkAndroidManifest() {
  const manifestPath = path.join(repoRoot, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
  const manifest = readFileOrExit(manifestPath);
  const issues = [];

  ensure(
    /<meta-data[^>]*android:name="android\.telephony\.PROPERTY_SATELLITE_DATA_OPTIMIZED"[^>]*android:value="\$\{applicationId\}"[^>]*\/>/m.test(
      manifest,
    ),
    'AndroidManifest.xml must opt into satellite data optimization via android.telephony.PROPERTY_SATELLITE_DATA_OPTIMIZED.',
    issues,
  );

  ensure(
    /<uses-permission[^>]*android:name="android\.permission\.ACCESS_NETWORK_STATE"[^>]*\/>/m.test(manifest),
    'AndroidManifest.xml must request ACCESS_NETWORK_STATE to read constrained network status.',
    issues,
  );

  if (issues.length) {
    console.error('Android manifest checks failed:');
    for (const issue of issues) {
      console.error(` - ${issue}`);
    }
    process.exit(1);
  }
  console.log('✅ Android manifest contains satellite/constrained network flags.');
}

function checkIOSEntitlements() {
  const entitlementsPath = path.join(repoRoot, 'ios', 'App', 'App', 'App.entitlements');
  const entitlements = readFileOrExit(entitlementsPath);
  const issues = [];

  ensure(
    /<key>com\.apple\.developer\.networking\.carrier-constrained\.app-optimized<\/key>\s*<true\s*\/>/m.test(
      entitlements,
    ),
    'App.entitlements must include com.apple.developer.networking.carrier-constrained.app-optimized set to true.',
    issues,
  );

  ensure(
    /<key>com\.apple\.developer\.networking\.carrier-constrained\.appcategory<\/key>\s*<string>messaging<\/string>/m.test(
      entitlements,
    ),
    'App.entitlements must declare the carrier-constrained app category as "messaging".',
    issues,
  );

  if (issues.length) {
    console.error('iOS entitlement checks failed:');
    for (const issue of issues) {
      console.error(` - ${issue}`);
    }
    process.exit(1);
  }
  console.log('✅ iOS entitlements include carrier-constrained network flags.');
}

function main() {
  checkAndroidManifest();
  checkIOSEntitlements();
}

main();
