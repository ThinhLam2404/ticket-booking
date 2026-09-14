import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const executable = process.platform === 'win32'
      ? command === 'openapi-typescript'
        ? 'openapi-typescript.cmd'
        : command === 'npm'
          ? 'npm.cmd'
          : command
      : command;
    const child = process.platform === 'win32'
      ? spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', executable, ...args], {
          cwd: process.cwd(),
          stdio: 'inherit',
        })
      : spawn(executable, args, {
          cwd: process.cwd(),
          stdio: 'inherit',
        });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} failed with code ${code}`));
    });
  });
}

const temporaryDirectory = await mkdtemp(join(tmpdir(), 'ticket-booking-openapi-'));
const temporarySpec = join(temporaryDirectory, 'ticket-booking.openapi.json');
const temporaryTypes = join(temporaryDirectory, 'openapi.d.ts');

try {
  await run('npm', [
    '--prefix',
    'be',
    'run',
    'openapi:export',
    '--',
    temporarySpec,
  ]);
  await run('openapi-typescript', [
    temporarySpec,
    '--output',
    temporaryTypes,
  ]);

  const [expectedSpec, actualSpec, expectedTypes, actualTypes] = await Promise.all([
    readFile('openapi/ticket-booking.openapi.json', 'utf8'),
    readFile(temporarySpec, 'utf8'),
    readFile('fe/src/generated/openapi.d.ts', 'utf8'),
    readFile(temporaryTypes, 'utf8'),
  ]);

  if (expectedSpec !== actualSpec || expectedTypes !== actualTypes) {
    throw new Error(
      'Generated API artifacts are out of date. Run npm run api:generate and review the changes.',
    );
  }

  process.stdout.write('OpenAPI artifacts are up to date\n');
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
