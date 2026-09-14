import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, UserRole } from '@prisma/client';
import { Redis } from 'ioredis';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/config/app.config.js';
import { JwtTokenService } from '../../src/modules/auth/jwt-token.service.js';
import { BookingExpiryScheduler } from '../../src/modules/bookings/booking-expiry.scheduler.js';

export interface IntegrationFixture {
  customerA: { id: string; token: string };
  customerB: { id: string; token: string };
  showtimeId: string;
  showtimeSeatIds: string[];
}

const databaseUrl = process.env.DATABASE_URL ?? '';
const redisUrl = process.env.REDIS_URL ?? '';

export const adminPrisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
export const adminRedis = new Redis(redisUrl);

export async function createIntegrationApp(): Promise<INestApplication> {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(BookingExpiryScheduler)
    .useValue({ expirePendingBookings: async () => undefined })
    .compile();

  const app = moduleFixture.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

export async function resetIntegrationState() {
  const database = new URL(databaseUrl);
  const redis = new URL(redisUrl);
  if (
    process.env.NODE_ENV !== 'test' ||
    process.env.ALLOW_INTEGRATION_DB_RESET !== '1' ||
    database.hostname !== '127.0.0.1' ||
    !databaseUrl.endsWith('/ticket_booking_test?schema=public')
  ) {
    throw new Error('Refusing to reset a non-test database');
  }
  if (redis.hostname !== '127.0.0.1' || redis.port !== '56379') {
    throw new Error('Refusing to flush a non-test Redis instance');
  }

  const currentDatabase = await adminPrisma.$queryRaw<Array<{ current_database: string }>>`
    SELECT current_database()
  `;
  if (currentDatabase[0]?.current_database !== 'ticket_booking_test') {
    throw new Error('Refusing to reset an unexpected database');
  }

  await adminPrisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "RefreshToken",
      "Ticket",
      "Payment",
      "BookingItem",
      "ShowtimeSeat",
      "Booking",
      "Showtime",
      "Seat",
      "Room",
      "Cinema",
      "Movie",
      "User"
    RESTART IDENTITY CASCADE
  `);
  await adminRedis.flushdb();
}

export async function createFixture(app: INestApplication): Promise<IntegrationFixture> {
  const suffix = randomUUID();
  const [customerA, customerB] = await Promise.all([
    adminPrisma.user.create({
      data: {
        email: `customer-a-${suffix}@example.com`,
        fullName: 'Customer A',
        passwordHash: 'integration-only',
        role: UserRole.CUSTOMER,
      },
    }),
    adminPrisma.user.create({
      data: {
        email: `customer-b-${suffix}@example.com`,
        fullName: 'Customer B',
        passwordHash: 'integration-only',
        role: UserRole.CUSTOMER,
      },
    }),
  ]);
  const movie = await adminPrisma.movie.create({
    data: {
      title: `Integration Movie ${suffix}`,
      duration: 120,
      status: 'PUBLISHED',
    },
  });
  const cinema = await adminPrisma.cinema.create({
    data: { name: `Integration Cinema ${suffix}`, address: 'Test address' },
  });
  const room = await adminPrisma.room.create({
    data: { name: `Integration Room ${suffix}`, cinemaId: cinema.id },
  });
  const seats = await Promise.all(
    ['A', 'B', 'C'].map((row, index) =>
      adminPrisma.seat.create({
        data: { row, number: index + 1, roomId: room.id, type: 'STANDARD' },
      }),
    ),
  );
  const showtime = await adminPrisma.showtime.create({
    data: {
      movieId: movie.id,
      roomId: room.id,
      startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      endsAt: new Date(Date.now() + 26 * 60 * 60 * 1000),
      showtimeSeats: {
        create: seats.map((seat) => ({ seatId: seat.id, price: '100000.00' })),
      },
    },
    include: { showtimeSeats: true },
  });
  const tokenService = app.get(JwtTokenService);
  return {
    customerA: {
      id: customerA.id,
      token: tokenService.createAccessToken(customerA),
    },
    customerB: {
      id: customerB.id,
      token: tokenService.createAccessToken(customerB),
    },
    showtimeId: showtime.id,
    showtimeSeatIds: showtime.showtimeSeats.map((seat) => seat.id),
  };
}
