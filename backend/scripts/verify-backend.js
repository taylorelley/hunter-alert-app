const fs = require('fs');
const path = require('path');

const requiredEnvKeys = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_JWT_SECRET',
];

const envPath = path.join(__dirname, '..', '.env.example');
const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '0001_init.sql');

function checkEnvSample() {
  const body = fs.readFileSync(envPath, 'utf8');
  requiredEnvKeys.forEach((key) => {
    if (!body.includes(key)) {
      throw new Error(`Missing ${key} in .env.example`);
    }
  });
}

function checkMigration() {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  const mustContain = [
    'create table if not exists profiles',
    'create table if not exists conversations',
    'create table if not exists messages',
    'create table if not exists sync_cursors',
    'send_message_batch',
    'pull_updates',
    'enable row level security',
  ];

  mustContain.forEach((snippet) => {
    if (!sql.toLowerCase().includes(snippet)) {
      throw new Error(`Migration missing expected content: ${snippet}`);
    }
  });

  if (!/jsonb_array_length\(messages\) > max_count/i.test(sql)) {
    throw new Error('Batch size guard for send_message_batch is missing');
  }

  if (!/max_rows int := coalesce\(current_setting\('app.max_pull_limit'/i.test(sql)) {
    throw new Error('pull_updates limit configuration missing');
  }
}

function main() {
  checkEnvSample();
  checkMigration();
  console.log('Backend checks passed: env sample and migrations are present with expected guards.');
}

main();
