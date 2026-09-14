import { spawnSync } from 'node:child_process';
import process from 'node:process';

const composeFile = 'docker-compose.integration.yml';
const composeProject = 'ticket-booking-integration';
const keepInfrastructure = process.env.KEEP_INTEGRATION_INFRA === '1';
const integrationEnvironment = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL:
    process.env.DATABASE_URL ??
    'postgresql://ticket_booking_test:ticket_booking_test@127.0.0.1:55432/ticket_booking_test?schema=public',
  REDIS_URL: process.env.REDIS_URL ?? 'redis://127.0.0.1:56379/0',
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? 'integration-access-secret',
  JWT_REFRESH_SECRET:
    process.env.JWT_REFRESH_SECRET ?? 'integration-refresh-secret',
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  ALLOW_INTEGRATION_DB_RESET: '1',
};

function run(command, args, env = integrationEnvironment) {
  const executable = process.platform === 'win32' && command === 'npm'
    ? 'npm.cmd'
    : command;
  const result = process.platform === 'win32' && command === 'npm'
    ? spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', executable, ...args], {
        cwd: process.cwd(),
        env,
        stdio: 'inherit',
      })
    : spawnSync(executable, args, {
        cwd: process.cwd(),
        env,
        stdio: 'inherit',
      });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    throw new Error(`${command} ${args.join(' ')} failed`);
  }
}

function compose(args) {
  run('docker', [
    'compose',
    '-p',
    composeProject,
    '-f',
    composeFile,
    ...args,
  ]);
}

function assertSafeEnvironment() {
  const databaseUrl = new URL(integrationEnvironment.DATABASE_URL);
  const redisUrl = new URL(integrationEnvironment.REDIS_URL);
  if (integrationEnvironment.NODE_ENV !== 'test') {
    throw new Error('Integration tests require NODE_ENV=test');
  }
  if (databaseUrl.hostname !== '127.0.0.1' || !databaseUrl.pathname.endsWith('/ticket_booking_test')) {
    throw new Error('Integration tests require the local ticket_booking_test database');
  }
  if (databaseUrl.port !== '55432') {
    throw new Error('Integration tests require PostgreSQL port 55432');
  }
  if (redisUrl.hostname !== '127.0.0.1' || redisUrl.port !== '56379') {
    throw new Error('Integration tests require the local Redis port 56379');
  }
  if (integrationEnvironment.ALLOW_INTEGRATION_DB_RESET !== '1') {
    throw new Error('Integration tests require ALLOW_INTEGRATION_DB_RESET=1');
  }
}

let failed = false;
try {
  assertSafeEnvironment();
  compose(['up', '-d', '--wait']);
  run('npm', ['run', 'prisma:deploy'], integrationEnvironment);
  run('npm', ['run', 'test:integration:spec'], integrationEnvironment);
} catch {
  failed = true;
} finally {
  if (!keepInfrastructure) {
    try {
      compose(['down', '--volumes', '--remove-orphans']);
    } catch {
      failed = true;
    }
  }
}

if (failed) {
  process.exitCode = 1;
}
