import { spawn, spawnSync } from 'node:child_process';
import process from 'node:process';

const composeFile = 'be/docker-compose.integration.yml';
const composeProject = 'ticket-booking-browser';
const apiPort = 3301;
const postgresPort = 55433;
const redisPort = 56380;
const smtpPort = 55025;
const smtpApiPort = 58025;
const keepInfrastructure = process.env.KEEP_BROWSER_INFRA === '1';
const environment = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: `postgresql://ticket_booking_test:ticket_booking_test@127.0.0.1:${postgresPort}/ticket_booking_test?schema=public`,
  REDIS_URL: `redis://127.0.0.1:${redisPort}/0`,
  JWT_ACCESS_SECRET: 'browser-access-secret',
  JWT_REFRESH_SECRET: 'browser-refresh-secret',
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '7d',
  SEPAY_ACCOUNT_NUMBER: 'browser-account',
  SEPAY_WEBHOOK_API_KEY: 'browser-webhook-key',
  MAIL_WORKER_ENABLED: 'true',
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: String(smtpPort),
  SMTP_SECURE: 'false',
  SMTP_FROM: 'CineBook Browser <browser@example.com>',
  PUBLIC_APP_URL: 'http://127.0.0.1:4173',
  SERVER_PORT: String(apiPort),
  CORS_ORIGINS: 'http://127.0.0.1:4173',
  VITE_API_URL: `http://127.0.0.1:${apiPort}/api/v1`,
  ALLOW_INTEGRATION_DB_RESET: '1',
};

function run(command, args, env = environment) {
  const result = spawnSync(command, args, { cwd: process.cwd(), env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed`);
}

function compose(args) {
  run('docker', ['compose', '-p', composeProject, '-f', composeFile, ...args], {
    ...environment,
    INTEGRATION_POSTGRES_PORT: String(postgresPort),
    INTEGRATION_REDIS_PORT: String(redisPort),
    INTEGRATION_SMTP_PORT: String(smtpPort),
    INTEGRATION_SMTP_API_PORT: String(smtpApiPort),
  });
}

function startServer() {
  const server = spawn('npm', ['--prefix', 'be', 'run', 'start:prod'], {
    cwd: process.cwd(),
    env: environment,
    stdio: 'inherit',
    detached: true,
  });
  return server.pid;
}

function stopServer(pid) {
  if (!pid) return;
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    // The child may already have exited.
  }
}

let serverPid;
let failed = false;
try {
  compose(['up', '-d', '--wait']);
  run('npm', ['run', 'prisma:deploy'], environment);
  run('npm', ['--prefix', 'be', 'exec', '--', 'tsx', 'scripts/seed-browser-fixture.ts'], environment);
  run('npm', ['run', 'build:be'], environment);
  run('npm', ['run', 'build:fe'], environment);
  serverPid = startServer();
  run('node', ['scripts/wait-for-url.mjs', `http://127.0.0.1:${apiPort}/api/v1/health/ready`], environment);
  run('npm', ['run', 'test:browser'], {
    ...environment,
    PLAYWRIGHT_BASE_URL: 'http://127.0.0.1:4173',
    PLAYWRIGHT_API_URL: `http://127.0.0.1:${apiPort}/api/v1`,
    PLAYWRIGHT_SMTP_API_URL: `http://127.0.0.1:${smtpApiPort}`,
    PLAYWRIGHT_SEPAY_WEBHOOK_API_KEY: 'browser-webhook-key',
    PLAYWRIGHT_FULL_STACK: '1',
    VITE_API_URL: `http://127.0.0.1:${apiPort}/api/v1`,
  });
} catch {
  failed = true;
} finally {
  stopServer(serverPid);
  if (!keepInfrastructure) {
    try {
      compose(['down', '--volumes', '--remove-orphans']);
    } catch {
      failed = true;
    }
  }
}

if (failed) process.exitCode = 1;
