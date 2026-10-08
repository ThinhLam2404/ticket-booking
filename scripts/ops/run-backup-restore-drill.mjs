import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const composeFile = resolve(repoRoot, "be/docker-compose.ops.yml");
const project = "ticket-booking-ops-drill";
const sourceUrl =
  "postgresql://ticket_booking_ops:ticket_booking_ops@127.0.0.1:55433/ticket_booking_ops_source";
const targetUrl =
  "postgresql://ticket_booking_ops:ticket_booking_ops@127.0.0.1:55433/ticket_booking_ops_target";
const dumpDirectory = resolve(repoRoot, ".tmp/ops-drill");
const dumpFile = resolve(dumpDirectory, "cinebook-ops-drill.dump");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: { ...process.env, ...options.env },
    input: options.input,
    encoding: "utf8",
    stdio: options.capture
      ? ["pipe", "pipe", "inherit"]
      : options.input !== undefined
        ? ["pipe", "inherit", "inherit"]
        : "inherit",
  });
  if (result.error) throw result.error;
  if (options.expectFailure) {
    if (result.status === null || result.status === 0) {
      throw new Error(`${command} ${args.join(" ")} unexpectedly succeeded`);
    }
    return result.stdout?.trim() ?? "";
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with exit code ${result.status}`,
    );
  }
  return result.stdout?.trim() ?? "";
}

function compose(args) {
  return run("docker", ["compose", "-p", project, "-f", composeFile, ...args]);
}

function postgresClient(args, options = {}) {
  const containerEnvironment = Object.entries(
    options.containerEnv ?? {},
  ).flatMap(([key, value]) => ["-e", `${key}=${value}`]);
  return run(
    "docker",
    [
      "run",
      "--rm",
      "--network",
      "host",
      ...(options.interactive ? ["-i"] : []),
      "--user",
      `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
      ...containerEnvironment,
      "-v",
      `${repoRoot}:/workspace:Z`,
      "-w",
      "/workspace",
      "postgres:17-alpine",
      ...args,
    ],
    options,
  );
}

const fixtureSql = `
INSERT INTO "User" ("id", "email", "passwordHash", "fullName", "role", "createdAt", "updatedAt")
VALUES ('ops-user', 'ops@example.com', 'not-a-real-password-hash', 'Ops Drill', 'CUSTOMER', NOW(), NOW());
INSERT INTO "Movie" ("id", "title", "duration", "status", "createdAt", "updatedAt")
VALUES ('ops-movie', 'Ops Drill Movie', 120, 'PUBLISHED', NOW(), NOW());
INSERT INTO "Cinema" ("id", "name", "address", "provinceCode", "createdAt", "updatedAt")
VALUES ('ops-cinema', 'Ops Drill Cinema', 'Isolated database', 79, NOW(), NOW());
INSERT INTO "Room" ("id", "name", "format", "cinemaId", "createdAt", "updatedAt")
VALUES ('ops-room', 'Room 1', 'STANDARD', 'ops-cinema', NOW(), NOW());
INSERT INTO "Seat" ("id", "row", "number", "type", "roomId")
VALUES ('ops-seat', 'A', 1, 'STANDARD', 'ops-room');
INSERT INTO "Showtime" ("id", "startsAt", "endsAt", "movieId", "roomId", "format", "basePrice", "vipMultiplier", "coupleMultiplier", "createdAt", "updatedAt")
VALUES ('ops-showtime', NOW() + INTERVAL '1 day', NOW() + INTERVAL '1 day 2 hours', 'ops-movie', 'ops-room', 'TWO_D_SUBTITLED', 100000, 1.10, 1.20, NOW(), NOW());
INSERT INTO "ShowtimeSeat" ("id", "price", "status", "showtimeId", "seatId")
VALUES ('ops-showtime-seat', 100000, 'AVAILABLE', 'ops-showtime', 'ops-seat');
INSERT INTO "Booking" ("id", "status", "totalAmount", "expiresAt", "holdToken", "userId", "showtimeId", "createdAt", "updatedAt")
VALUES ('ops-booking', 'PENDING', 100000, NOW() + INTERVAL '10 minutes', 'ops-hold-token', 'ops-user', 'ops-showtime', NOW(), NOW());
UPDATE "ShowtimeSeat" SET "status" = 'HELD', "heldByBookingId" = 'ops-booking', "heldUntil" = NOW() + INTERVAL '10 minutes' WHERE "id" = 'ops-showtime-seat';
INSERT INTO "Payment" ("id", "provider", "reference", "status", "amount", "bookingId", "createdAt", "updatedAt")
VALUES ('ops-payment', 'SEPAY', 'OPS-DRILL', 'PENDING', 100000, 'ops-booking', NOW(), NOW());
INSERT INTO "MailOutbox" ("id", "type", "status", "recipient", "dedupeKey", "payload", "createdAt", "updatedAt")
VALUES ('ops-outbox', 'EMAIL_VERIFICATION', 'PENDING', 'ops@example.com', 'OPS-DRILL', '{"drill":true}'::jsonb, NOW(), NOW());
`;

const verificationSql = `
SELECT concat(
  (SELECT count(*) FROM "Booking" WHERE "id" = 'ops-booking'), ':',
  (SELECT count(*) FROM "Payment" WHERE "bookingId" = 'ops-booking'), ':',
  (SELECT count(*) FROM "MailOutbox" WHERE "dedupeKey" = 'OPS-DRILL'), ':',
  (SELECT "totalAmount"::text FROM "Booking" WHERE "id" = 'ops-booking')
);
`;

mkdirSync(dumpDirectory, { recursive: true });
rmSync(dumpFile, { force: true });

try {
  compose(["up", "-d", "--wait"]);
  run("npm", ["--prefix", "be", "run", "prisma:deploy"], {
    env: { DATABASE_URL: `${sourceUrl}?schema=public` },
  });
  postgresClient(
    ["psql", sourceUrl, "--no-psqlrc", "--set", "ON_ERROR_STOP=1"],
    {
      interactive: true,
      input: fixtureSql,
    },
  );
  postgresClient([
    "psql",
    sourceUrl.replace("/ticket_booking_ops_source", "/postgres"),
    "--no-psqlrc",
    "--set",
    "ON_ERROR_STOP=1",
    "--command",
    "CREATE DATABASE ticket_booking_ops_target;",
  ]);
  postgresClient(
    [
      "sh",
      "scripts/ops/backup-postgres.sh",
      "/workspace/.tmp/ops-drill/cinebook-ops-drill.dump",
    ],
    { containerEnv: { BACKUP_DATABASE_URL: sourceUrl } },
  );
  postgresClient(
    [
      "sh",
      "scripts/ops/restore-postgres.sh",
      "/workspace/.tmp/ops-drill/cinebook-ops-drill.dump",
    ],
    {
      containerEnv: {
        RESTORE_DATABASE_URL: targetUrl,
        CONFIRM_RESTORE_DATABASE: "wrong-target",
      },
      expectFailure: true,
    },
  );
  postgresClient(
    [
      "sh",
      "scripts/ops/restore-postgres.sh",
      "/workspace/.tmp/ops-drill/cinebook-ops-drill.dump",
    ],
    {
      containerEnv: {
        RESTORE_DATABASE_URL: targetUrl,
        CONFIRM_RESTORE_DATABASE: "ticket_booking_ops_target",
      },
    },
  );
  postgresClient(
    [
      "sh",
      "scripts/ops/restore-postgres.sh",
      "/workspace/.tmp/ops-drill/cinebook-ops-drill.dump",
    ],
    {
      containerEnv: {
        RESTORE_DATABASE_URL: targetUrl,
        CONFIRM_RESTORE_DATABASE: "ticket_booking_ops_target",
      },
      expectFailure: true,
    },
  );

  const sourceChecksum = postgresClient(
    [
      "psql",
      sourceUrl,
      "--no-psqlrc",
      "--tuples-only",
      "--no-align",
      "--command",
      verificationSql,
    ],
    { capture: true },
  );
  const targetChecksum = postgresClient(
    [
      "psql",
      targetUrl,
      "--no-psqlrc",
      "--tuples-only",
      "--no-align",
      "--command",
      verificationSql,
    ],
    { capture: true },
  );
  if (
    sourceChecksum !== targetChecksum ||
    targetChecksum !== "1:1:1:100000.00"
  ) {
    throw new Error(
      `Restore verification failed: source=${sourceChecksum} target=${targetChecksum}`,
    );
  }

  run("npm", ["exec", "--", "prisma", "migrate", "status"], {
    cwd: resolve(repoRoot, "be"),
    env: { DATABASE_URL: `${targetUrl}?schema=public` },
  });
  process.stdout.write(`Backup/restore drill passed: ${targetChecksum}\n`);
} finally {
  compose(["down", "-v", "--remove-orphans"]);
  rmSync(dumpDirectory, { recursive: true, force: true });
}
