import { PrismaClient, SeatType, UserRole } from '@prisma/client';
import { hashPassword } from '../src/common/auth/password.js';

const prisma = new PrismaClient();

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
const adminPassword = process.env.SEED_ADMIN_PASSWORD;

if (!adminPassword?.trim()) {
  throw new Error('SEED_ADMIN_PASSWORD is required to seed the database');
}

const movieId = 'seed-movie-interstellar';
const cinemaId = 'seed-cinema-central';
const roomId = 'seed-room-1';
const showtimeId = 'seed-showtime-interstellar';

async function main() {
  const passwordHash = await hashPassword(adminPassword);
  await prisma.user.upsert({
    where: { email: adminEmail.toLowerCase() },
    update: { fullName: 'System Admin', role: UserRole.ADMIN },
    create: {
      email: adminEmail.toLowerCase(),
      fullName: 'System Admin',
      passwordHash,
      role: UserRole.ADMIN,
    },
  });

  await prisma.movie.upsert({
    where: { id: movieId },
    update: {
      title: 'Interstellar',
      description: 'A science fiction film about space exploration.',
      duration: 169,
      status: 'PUBLISHED',
    },
    create: {
      id: movieId,
      title: 'Interstellar',
      description: 'A science fiction film about space exploration.',
      duration: 169,
      status: 'PUBLISHED',
    },
  });

  await prisma.cinema.upsert({
    where: { id: cinemaId },
    update: { name: 'Central Cinema', address: '1 Example Street' },
    create: { id: cinemaId, name: 'Central Cinema', address: '1 Example Street' },
  });

  await prisma.room.upsert({
    where: { id: roomId },
    update: { name: 'Room 1', cinemaId },
    create: { id: roomId, name: 'Room 1', cinemaId },
  });

  for (const row of ['A', 'B', 'C', 'D']) {
    for (let number = 1; number <= 8; number += 1) {
      await prisma.seat.upsert({
        where: { roomId_row_number: { roomId, row, number } },
        update: { type: row === 'D' ? SeatType.VIP : SeatType.STANDARD },
        create: {
          roomId,
          row,
          number,
          type: row === 'D' ? SeatType.VIP : SeatType.STANDARD,
        },
      });
    }
  }

  const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 169 * 60 * 1000);
  await prisma.showtime.upsert({
    where: { id: showtimeId },
    update: { movieId, roomId, startsAt, endsAt },
    create: { id: showtimeId, movieId, roomId, startsAt, endsAt },
  });

  const seats = await prisma.seat.findMany({ where: { roomId } });
  for (const seat of seats) {
    const price = seat.type === SeatType.VIP ? '150000.00' : '100000.00';
    await prisma.showtimeSeat.upsert({
      where: { showtimeId_seatId: { showtimeId, seatId: seat.id } },
      update: { price },
      create: { showtimeId, seatId: seat.id, price },
    });
  }

  console.log('Seed completed');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
