import { performance } from 'node:perf_hooks';
import { PrismaClient } from '../be/node_modules/@prisma/client/index.js';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://ticket_booking_test:ticket_booking_test@127.0.0.1:55434/ticket_booking_test?schema=public';
const BOOKING_COUNT = Number(process.env.BENCHMARK_BOOKINGS ?? 100_000);
const SHOWTIME_COUNT = Number(process.env.BENCHMARK_SHOWTIMES ?? 100);
const BOOKING_BATCH_SIZE = 5_000;
const ITERATIONS = Number(process.env.BENCHMARK_ITERATIONS ?? 7);
const WARMUPS = 2;

const prisma = new PrismaClient({
  datasources: { db: { url: DATABASE_URL } },
  log: [{ emit: 'event', level: 'query' }],
});

let queryCount = 0;
prisma.$on('query', () => {
  queryCount += 1;
});

const ids = {
  user: 'bench-user-000001',
  movie: 'bench-movie-000001',
  cinema: 'bench-cinema-000001',
  listRoom: 'bench-room-list-000001',
  bulkRoom: 'bench-room-bulk-000001',
  listShowtime: 'bench-showtime-list-000001',
  updateShowtime: 'bench-showtime-update-000001',
};

function resetQueryCount() {
  queryCount = 0;
}

function percentile(values, percentileValue) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentileValue) - 1));
  return sorted[index] ?? 0;
}

function statistics(samples) {
  return {
    medianMs: Number(percentile(samples.map((sample) => sample.durationMs), 0.5).toFixed(2)),
    p95Ms: Number(percentile(samples.map((sample) => sample.durationMs), 0.95).toFixed(2)),
    minMs: Number(Math.min(...samples.map((sample) => sample.durationMs)).toFixed(2)),
    maxMs: Number(Math.max(...samples.map((sample) => sample.durationMs)).toFixed(2)),
    queryCount: Math.round(samples.reduce((sum, sample) => sum + sample.queryCount, 0) / samples.length),
    resultBytes: Math.round(samples.reduce((sum, sample) => sum + (sample.resultBytes ?? 0), 0) / samples.length),
  };
}

async function measure(name, operation, cleanup = async () => undefined) {
  for (let index = 0; index < WARMUPS; index += 1) {
    await operation();
    await cleanup();
  }

  const samples = [];
  for (let index = 0; index < ITERATIONS; index += 1) {
    resetQueryCount();
    const startedAt = performance.now();
    const result = await operation();
    const durationMs = performance.now() - startedAt;
    samples.push({ durationMs, queryCount, resultBytes: result?.resultBytes });
    await cleanup();
  }

  return {
    name,
    ...statistics(samples),
    samples: samples.map((sample) => ({
      durationMs: Number(sample.durationMs.toFixed(2)),
      queryCount: sample.queryCount,
      resultBytes: sample.resultBytes,
    })),
  };
}

async function truncateBenchmarkData() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "BookingItem", "Ticket", "Payment", "Refund", "SepayTransaction",
      "SepayPaymentIntent", "Booking", "ShowtimeSeat", "Showtime", "Seat",
      "Room", "Cinema", "Movie", "User"
    CASCADE
  `);
}

async function seedUsers() {
  await prisma.user.create({
    data: {
      id: ids.user,
      email: 'benchmark@example.test',
      passwordHash: 'benchmark-password-hash',
      fullName: 'Benchmark User',
      role: 'CUSTOMER',
      emailVerifiedAt: new Date(),
    },
  });
}

async function seedCatalog() {
  await prisma.movie.create({
    data: {
      id: ids.movie,
      title: 'Benchmark Movie',
      description: 'Synthetic benchmark movie',
      duration: 120,
      status: 'PUBLISHED',
      genres: ['Benchmark'],
    },
  });

  await prisma.cinema.create({
    data: {
      id: ids.cinema,
      name: 'Benchmark Cinema',
      address: 'Synthetic benchmark address',
      provinceCode: 79,
      rooms: {
        create: [
          { id: ids.listRoom, name: 'List Room', format: 'STANDARD' },
          { id: ids.bulkRoom, name: 'Bulk Room', format: 'STANDARD' },
        ],
      },
    },
  });

  const seatRows = [];
  for (const roomId of [ids.listRoom, ids.bulkRoom]) {
    for (let index = 0; index < 120; index += 1) {
      const row = String.fromCharCode(65 + Math.floor(index / 12));
      const number = (index % 12) + 1;
      const type = index >= 108 ? 'COUPLE' : index >= 72 ? 'VIP' : 'STANDARD';
      seatRows.push({
        id: `bench-seat-${roomId === ids.listRoom ? 'list' : 'bulk'}-${String(index).padStart(3, '0')}`,
        row,
        number,
        type,
        roomId,
      });
    }
  }
  await prisma.seat.createMany({ data: seatRows });
}

function showtimeData(id, roomId, index, baseTime) {
  const startsAt = new Date(baseTime.getTime() + index * 4 * 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);
  return {
    id,
    startsAt,
    endsAt,
    movieId: ids.movie,
    roomId,
    format: 'TWO_D_SUBTITLED',
    basePrice: '100000',
    vipMultiplier: '1.2',
    coupleMultiplier: '1.5',
  };
}

async function seedShowtimes() {
  const baseTime = new Date('2030-01-01T00:00:00.000Z');
  const showtimes = [
    ...Array.from({ length: SHOWTIME_COUNT }, (_, index) => showtimeData(
      `${ids.listShowtime}-${String(index).padStart(4, '0')}`,
      ids.listRoom,
      index,
      baseTime,
    )),
    showtimeData(ids.updateShowtime, ids.listRoom, SHOWTIME_COUNT + 1, baseTime),
  ];
  await prisma.showtime.createMany({ data: showtimes });

  const listSeats = await prisma.seat.findMany({ where: { roomId: ids.listRoom }, select: { id: true, type: true } });
  const snapshots = [];
  for (const showtime of showtimes) {
    for (const seat of listSeats) {
      const multiplier = seat.type === 'VIP' ? 1.2 : seat.type === 'COUPLE' ? 1.5 : 1;
      snapshots.push({ showtimeId: showtime.id, seatId: seat.id, price: String(100000 * multiplier) });
    }
  }
  for (let index = 0; index < snapshots.length; index += 5_000) {
    await prisma.showtimeSeat.createMany({ data: snapshots.slice(index, index + 5_000) });
  }
}

async function seedBookings() {
  const baseTime = new Date('2029-12-31T00:00:00.000Z').getTime();
  for (let offset = 0; offset < BOOKING_COUNT; offset += BOOKING_BATCH_SIZE) {
    const batch = [];
    const end = Math.min(BOOKING_COUNT, offset + BOOKING_BATCH_SIZE);
    for (let index = offset; index < end; index += 1) {
      batch.push({
        id: `bench-booking-${String(index).padStart(8, '0')}`,
        status: index % 20 === 0 ? 'PENDING' : index % 25 === 0 ? 'CANCELLED' : 'CONFIRMED',
        totalAmount: '100000',
        expiresAt: new Date(baseTime + 24 * 60 * 60 * 1000),
        holdToken: `bench-hold-${String(index).padStart(8, '0')}`,
        userId: ids.user,
        showtimeId: `${ids.listShowtime}-${String(index % SHOWTIME_COUNT).padStart(4, '0')}`,
        createdAt: new Date(baseTime - index * 1000),
      });
    }
    await prisma.booking.createMany({ data: batch });
    process.stdout.write(`seeded bookings ${end}/${BOOKING_COUNT}\n`);
  }
}

async function seed() {
  await truncateBenchmarkData();
  await seedUsers();
  await seedCatalog();
  await seedShowtimes();
  await seedBookings();
  await prisma.$executeRawUnsafe('ANALYZE');
}

async function getPaginationAnchor(offset) {
  const rows = await prisma.$queryRaw`
    SELECT "createdAt", id
    FROM "Booking"
    WHERE "userId" = ${ids.user}
    ORDER BY "createdAt" DESC, id DESC
    OFFSET ${offset - 1}
    LIMIT 1
  `;
  if (!rows[0]) throw new Error(`Could not find pagination anchor at offset ${offset}`);
  return rows[0];
}

async function benchmarkPagination() {
  const offset = Math.min(90_000, Math.max(1, BOOKING_COUNT - 20));
  const anchor = await getPaginationAnchor(offset);
  const baseline = await measure('deep offset pagination', async () => {
    const rows = await prisma.$queryRaw`
      SELECT id, "createdAt"
      FROM "Booking"
      WHERE "userId" = ${ids.user}
      ORDER BY "createdAt" DESC, id DESC
      OFFSET ${offset}
      LIMIT 20
    `;
    return { resultBytes: JSON.stringify(rows).length };
  });
  const optimized = await measure('cursor pagination with composite index', async () => {
    const rows = await prisma.$queryRaw`
      SELECT id, "createdAt"
      FROM "Booking"
      WHERE "userId" = ${ids.user}
        AND ("createdAt", id) < (${anchor.createdAt}, ${anchor.id})
      ORDER BY "createdAt" DESC, id DESC
      LIMIT 21
    `;
    return { resultBytes: JSON.stringify(rows).length };
  });
  return {
    dataset: { bookings: BOOKING_COUNT, measuredOffset: offset },
    baseline,
    optimized,
    improvement: {
      medianLatencyPercent: Number(((1 - optimized.medianMs / baseline.medianMs) * 100).toFixed(2)),
      p95LatencyPercent: Number(((1 - optimized.p95Ms / baseline.p95Ms) * 100).toFixed(2)),
    },
  };
}

function bulkShowtimeRows(prefix, count) {
  const baseTime = new Date('2040-01-01T00:00:00.000Z');
  return Array.from({ length: count }, (_, index) => showtimeData(`${prefix}-${index}-${Date.now()}`, ids.bulkRoom, index, baseTime));
}

async function benchmarkBulkScheduling() {
  const count = 20;
  const baseline = await measure('row-by-row showtime creation', async () => {
    const rows = bulkShowtimeRows('bench-baseline', count);
    await prisma.$transaction(async (tx) => {
      const inserted = [];
      for (const row of rows) inserted.push(await tx.showtime.create({ data: row }));
      const seats = await tx.seat.findMany({ where: { roomId: ids.bulkRoom }, select: { id: true, type: true } });
      const seatRows = inserted.flatMap((showtime) => seats.map((seat) => ({
        showtimeId: showtime.id,
        seatId: seat.id,
        price: seat.type === 'VIP' ? '120000' : seat.type === 'COUPLE' ? '150000' : '100000',
      })));
      await tx.showtimeSeat.createMany({ data: seatRows });
    });
    return {};
  }, async () => {
    await prisma.showtime.deleteMany({ where: { id: { startsWith: 'bench-baseline-' } } });
  });

  const optimized = await measure('batch showtime creation', async () => {
    const rows = bulkShowtimeRows('bench-optimized', count);
    await prisma.$transaction(async (tx) => {
      const inserted = await tx.showtime.createManyAndReturn({ data: rows });
      const seats = await tx.seat.findMany({ where: { roomId: ids.bulkRoom }, select: { id: true, type: true } });
      const seatRows = inserted.flatMap((showtime) => seats.map((seat) => ({
        showtimeId: showtime.id,
        seatId: seat.id,
        price: seat.type === 'VIP' ? '120000' : seat.type === 'COUPLE' ? '150000' : '100000',
      })));
      await tx.showtimeSeat.createMany({ data: seatRows });
    });
    return {};
  }, async () => {
    await prisma.showtime.deleteMany({ where: { id: { startsWith: 'bench-optimized-' } } });
  });

  return {
    dataset: { showtimesPerRun: count, seatsPerShowtime: 120 },
    baseline,
    optimized,
    improvement: {
      medianLatencyPercent: Number(((1 - optimized.medianMs / baseline.medianMs) * 100).toFixed(2)),
      queryReductionPercent: Number(((1 - optimized.queryCount / baseline.queryCount) * 100).toFixed(2)),
    },
  };
}

async function benchmarkGroupedSeatUpdates() {
  const showtimeSeats = await prisma.showtimeSeat.findMany({
    where: { showtimeId: ids.updateShowtime },
    select: { id: true, seat: { select: { type: true } } },
  });
  const baseline = await measure('per-seat price updates', async () => {
    await prisma.$transaction(async (tx) => {
      for (const item of showtimeSeats) {
        await tx.showtimeSeat.update({ where: { id: item.id }, data: { price: '110000' } });
      }
    });
    return {};
  });
  const optimized = await measure('grouped seat price updates', async () => {
    await prisma.$transaction(async (tx) => {
      for (const type of ['STANDARD', 'VIP', 'COUPLE']) {
        const idsForType = showtimeSeats.filter((item) => item.seat.type === type).map((item) => item.id);
        if (!idsForType.length) continue;
        await tx.showtimeSeat.updateMany({
          where: { showtimeId: ids.updateShowtime, id: { in: idsForType } },
          data: { price: type === 'VIP' ? '120000' : type === 'COUPLE' ? '150000' : '100000' },
        });
      }
    });
    return {};
  });
  return {
    dataset: { seats: showtimeSeats.length, seatTypes: 3 },
    baseline,
    optimized,
    improvement: {
      medianLatencyPercent: Number(((1 - optimized.medianMs / baseline.medianMs) * 100).toFixed(2)),
      queryReductionPercent: Number(((1 - optimized.queryCount / baseline.queryCount) * 100).toFixed(2)),
    },
  };
}

async function benchmarkSelectiveRead() {
  const baseline = await measure('wide relation read', async () => {
    const rows = await prisma.showtime.findMany({
      where: { roomId: ids.listRoom },
      include: { movie: true, room: { include: { cinema: true } } },
      orderBy: { startsAt: 'asc' },
      take: SHOWTIME_COUNT,
    });
    return { resultBytes: JSON.stringify(rows).length };
  });
  const optimized = await measure('selective relation read', async () => {
    const rows = await prisma.showtime.findMany({
      where: { roomId: ids.listRoom },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        movie: { select: { id: true, title: true, posterUrl: true, rating: true, genres: true, ageRating: true, duration: true, status: true } },
        room: { select: { id: true, name: true, cinemaId: true, format: true, cinema: { select: { id: true, name: true, address: true, provinceCode: true } } } },
      },
      orderBy: { startsAt: 'asc' },
      take: SHOWTIME_COUNT,
    });
    return { resultBytes: JSON.stringify(rows).length };
  });
  return {
    dataset: { showtimes: SHOWTIME_COUNT },
    baseline,
    optimized,
    improvement: {
      medianLatencyPercent: Number(((1 - optimized.medianMs / baseline.medianMs) * 100).toFixed(2)),
      resultBytesPercent: Number(((1 - optimized.resultBytes / baseline.resultBytes) * 100).toFixed(2)),
    },
  };
}

async function main() {
  const shouldSeed = process.argv.includes('--seed');
  if (shouldSeed) {
    process.stdout.write(`Seeding benchmark database with ${BOOKING_COUNT} bookings...\n`);
    await seed();
  }
  const results = {
    generatedAt: new Date().toISOString(),
    config: { database: 'isolated PostgreSQL', bookings: BOOKING_COUNT, showtimes: SHOWTIME_COUNT, iterations: ITERATIONS, warmups: WARMUPS },
    pagination: await benchmarkPagination(),
    bulkScheduling: await benchmarkBulkScheduling(),
    groupedSeatUpdates: await benchmarkGroupedSeatUpdates(),
    selectiveRead: await benchmarkSelectiveRead(),
  };
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
