import { AdminPermission, PrismaClient, SeatType, UserRole } from '@prisma/client';
import { hashPassword } from '../src/common/auth/password.js';

const prisma = new PrismaClient();
const password = 'Password123!';

async function main() {
  await prisma.$transaction([
    prisma.mailOutbox.deleteMany(),
    prisma.refund.deleteMany(),
    prisma.ticket.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.sepayTransaction.deleteMany(),
    prisma.sepayPaymentIntent.deleteMany(),
    prisma.bookingItem.deleteMany(),
    prisma.booking.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.authSession.deleteMany(),
    prisma.passwordResetToken.deleteMany(),
    prisma.userAdminPermission.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.emailVerificationToken.deleteMany(),
    prisma.showtimeSeat.deleteMany({ where: { showtimeId: 'browser-showtime' } }),
    prisma.showtime.deleteMany({ where: { id: 'browser-showtime' } }),
    prisma.seat.deleteMany({ where: { roomId: 'browser-room' } }),
    prisma.room.deleteMany({ where: { id: 'browser-room' } }),
    prisma.cinema.deleteMany({ where: { id: 'browser-cinema' } }),
    prisma.movie.deleteMany({ where: { id: 'browser-movie' } }),
    prisma.user.deleteMany({ where: { id: { in: ['browser-customer', 'browser-admin'] } } }),
  ]);
  const passwordHash = await hashPassword(password);
  await prisma.user.createMany({
    data: [
      {
        id: 'browser-customer',
        email: 'browser.customer@example.com',
        fullName: 'Browser Customer',
        passwordHash,
        role: UserRole.CUSTOMER,
        emailVerifiedAt: new Date(),
      },
      {
        id: 'browser-admin',
        email: 'browser.admin@example.com',
        fullName: 'Browser Admin',
        passwordHash,
        role: UserRole.ADMIN,
        emailVerifiedAt: new Date(),
      },
    ],
    skipDuplicates: true,
  });
  await prisma.userAdminPermission.createMany({
    data: Object.values(AdminPermission).map((permission) => ({ userId: 'browser-admin', permission })),
    skipDuplicates: true,
  });

  await prisma.movie.upsert({
    where: { id: 'browser-movie' },
    update: { title: 'Browser Test Movie', duration: 120, status: 'PUBLISHED' },
    create: {
      id: 'browser-movie',
      title: 'Browser Test Movie',
      duration: 120,
      status: 'PUBLISHED',
    },
  });
  await prisma.cinema.upsert({
    where: { id: 'browser-cinema' },
    update: { name: 'Browser Test Cinema', address: 'Browser test address', provinceCode: 79 },
    create: {
      id: 'browser-cinema',
      name: 'Browser Test Cinema',
      address: 'Browser test address',
      provinceCode: 79,
    },
  });
  await prisma.room.upsert({
    where: { id: 'browser-room' },
    update: { name: 'Browser Room 1', cinemaId: 'browser-cinema' },
    create: {
      id: 'browser-room',
      name: 'Browser Room 1',
      cinemaId: 'browser-cinema',
    },
  });

  const seats = Array.from({ length: 10 }, (_, index) => ({
    id: `browser-seat-${index + 1}`,
    row: 'A',
    number: index + 1,
    type: index >= 8 ? SeatType.COUPLE : SeatType.STANDARD,
    roomId: 'browser-room',
  }));
  for (const seat of seats) {
    await prisma.seat.upsert({
      where: { id: seat.id },
      update: { row: seat.row, number: seat.number, type: seat.type, roomId: seat.roomId },
      create: seat,
    });
  }

  const startsAt = new Date(Date.now() + 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);
  await prisma.showtime.upsert({
    where: { id: 'browser-showtime' },
    create: {
      id: 'browser-showtime',
      movieId: 'browser-movie',
      roomId: 'browser-room',
      startsAt,
      endsAt,
      format: 'TWO_D_SUBTITLED',
      basePrice: '100000.00',
      vipMultiplier: '1.10',
      coupleMultiplier: '1.20',
    },
    update: { startsAt, endsAt, movieId: 'browser-movie', roomId: 'browser-room' },
  });
  for (const seat of seats) {
    await prisma.showtimeSeat.upsert({
      where: { id: `browser-showtime-seat-${seat.number}` },
      update: { showtimeId: 'browser-showtime', seatId: seat.id, price: seat.type === 'COUPLE' ? '120000.00' : '100000.00', status: 'AVAILABLE', heldUntil: null, heldByBookingId: null },
      create: {
        id: `browser-showtime-seat-${seat.number}`,
        showtimeId: 'browser-showtime',
        seatId: seat.id,
        price: seat.type === 'COUPLE' ? '120000.00' : '100000.00',
      },
    });
  }
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
