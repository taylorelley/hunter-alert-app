import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const execAsync = promisify(execFile);

export interface SupabaseStack {
  apiUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  dbUrl?: string;
}

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const supabaseDir = path.join(repoRoot, 'backend', 'supabase');
const cliBinary = process.env.SUPABASE_BIN || path.join(repoRoot, 'node_modules', '.bin', 'supabase');

async function runSupabase(args: string[], quiet = false): Promise<string> {
  const { stdout, stderr } = await execAsync(cliBinary, args, {
    cwd: supabaseDir,
    env: {
      ...process.env,
      SUPABASE_ANALYTICS_DISABLED: '1',
    },
  });

  if (!quiet && stderr) {
    // Vitest will capture logs; this helps debug CI flakiness without polluting output unnecessarily.
    console.warn(stderr);
  }

  return stdout;
}

function readLocalEnv() {
  const envPath = path.join(supabaseDir, '.env');
  if (!fs.existsSync(envPath)) {
    return {} as Record<string, string>;
  }

  return fs
    .readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, line) => {
      const [key, ...rest] = line.split('=');
      acc[key.trim()] = rest.join('=');
      return acc;
    }, {});
}

function parseStatusPayload(payload: unknown, envVars: Record<string, string>): SupabaseStack {
  const getNested = (value: unknown, path: string[]): unknown => {
    let current: unknown = value;
    for (const key of path) {
      if (typeof current !== 'object' || current === null) return undefined;
      current = (current as Record<string, unknown>)[key];
    }
    return current;
  };

  const asString = (value: unknown): string | undefined =>
    typeof value === 'string' ? value : undefined;

  const apiUrl =
    asString(getNested(payload, ['services', 'api', 'url'])) ||
    asString(getNested(payload, ['api', 'url'])) ||
    envVars.SUPABASE_URL ||
    'http://127.0.0.1:54321';

  const anonKey =
    asString(getNested(payload, ['services', 'api', 'anonKey'])) ||
    asString(getNested(payload, ['api', 'anonKey'])) ||
    envVars.SUPABASE_ANON_KEY ||
    envVars.ANON_KEY ||
    '';

  const serviceRoleKey =
    asString(getNested(payload, ['services', 'api', 'serviceRoleKey'])) ||
    asString(getNested(payload, ['api', 'serviceRoleKey'])) ||
    envVars.SUPABASE_SERVICE_ROLE_KEY ||
    envVars.SERVICE_ROLE_KEY ||
    '';

  const dbUrl =
    asString(getNested(payload, ['db', 'url'])) ||
    envVars.SUPABASE_DB_URL ||
    undefined;

  return { apiUrl, anonKey, serviceRoleKey, dbUrl };
}

export async function startSupabaseStack(): Promise<SupabaseStack> {
  // Ensure any old containers are cleared out to avoid port collisions.
  await runSupabase(['stop']).catch(() => undefined);

  // Launch a minimal stack to keep resource usage low in CI.
  await runSupabase(['start', '-x', 'studio', '-x', 'inbucket', '-x', 'imgproxy', '-x', 'edge-runtime']);

  // Reset ensures migrations are applied from scratch for deterministic tests.
  await runSupabase(['db', 'reset', '--force']);

  const envVars = readLocalEnv();
  const statusOutput = await runSupabase(['status', '--output=json'], true);
  const parsed = statusOutput ? JSON.parse(statusOutput) : {};
  const stack = parseStatusPayload(parsed, envVars);

  if (!stack.anonKey || !stack.serviceRoleKey) {
    throw new Error('Supabase keys missing; ensure CLI is logged in and start completed');
  }

  return stack;
}

export async function stopSupabaseStack() {
  await runSupabase(['stop']).catch(() => undefined);
}

export function createAdminClient(stack: SupabaseStack): SupabaseClient {
  return createClient(stack.apiUrl, stack.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function createUserClient(
  stack: SupabaseStack,
  email: string,
  password: string,
): Promise<{ client: SupabaseClient; userId: string }> {
  const adminClient = await createAdminClient(stack);
  const userResult = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (!userResult.data.user) {
    throw new Error(`Unable to create user: ${userResult.error?.message ?? 'unknown error'}`);
  }

  const authClient = createClient(stack.apiUrl, stack.anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { error } = await authClient.auth.signInWithPassword({ email, password });
  if (error) {
    throw error;
  }

  return { client: authClient, userId: userResult.data.user.id };
}

export function createThrottledFetch(options: {
  latencyMs?: number;
  maxPayloadBytes?: number;
}): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  const latency = options.latencyMs ?? 0;
  const budget = options.maxPayloadBytes ?? Number.POSITIVE_INFINITY;

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (latency > 0) {
      await new Promise((resolve) => setTimeout(resolve, latency));
    }

    // Note: Only validates string bodies. FormData/Blob/ArrayBuffer not checked.
    const body = typeof init?.body === 'string' ? init.body : '';
    if (Buffer.byteLength(body) > budget) {
      throw new Error('Bandwidth cap exceeded for simulated constrained link');
    }

    return fetch(input, init);
  };
}
