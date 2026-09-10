import { PrismaClient, MovieStatus, SeatType, UserRole } from '@prisma/client';
import { hashPassword } from '../src/common/auth/password.js';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = (
    process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com'
  ).trim().toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD?.trim();
  if (!adminPassword) {
    throw new Error('SEED_ADMIN_PASSWORD is required to run the seed');
  }

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: UserRole.ADMIN, fullName: 'System Admin' },
    create: {
      email: adminEmail,
      fullName: 'System Admin',
      passwordHash: await hashPassword(adminPassword),
      role: UserRole.ADMIN,
    },
  });

  const movie = await prisma.movie.upsert({
    where: { id: 'seed-movie-interstellar' },
    update: {
      title: 'Interstellar',
      description: 'A science fiction movie about space exploration.',
      duration: 169,
      status: MovieStatus.PUBLISHED,
    },
    create: {
      id: 'seed-movie-interstellar',
      title: 'Interstellar',
      description: 'A science fiction movie about space exploration.',
      duration: 169,
      status: MovieStatus.PUBLISHED,
    },
  });

  const cinema = await prisma.cinema.upsert({
    where: { id: 'seed-cinema-central' },
    update: { name: 'Central Cinema', address: '1 Example Street' },
    create: {
      id: 'seed-cinema-central',
      name: 'Central Cinema',
      address: '1 Example Street',
    },
  });

  const room = await prisma.room.upsert({
    where: { id: 'seed-room-1' },
    update: { name: 'Room 1', cinemaId: cinema.id },
    create: { id: 'seed-room-1', name: 'Room 1', cinemaId: cinema.id },
  });

  const seats = [];
  for (const row of ['A', 'B', 'C', 'D']) {
    for (let number = 1; number <= 8; number += 1) {
      const type = row === 'D' ? SeatType.VIP : SeatType.STANDARD;
      seats.push(
        await prisma.seat.upsert({
          where: {
            roomId_row_number: { roomId: room.id, row, number },
          },
          update: { type },
          create: { roomId: room.id, row, number, type },
        }),
      );
    }
  }

  const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  startsAt.setMinutes(0, 0, 0);
  const endsAt = new Date(startsAt.getTime() + movie.duration * 60 * 1000);

  const showtime = await prisma.showtime.upsert({
    where: { id: 'seed-showtime-interstellar' },
    update: { movieId: movie.id, roomId: room.id, startsAt, endsAt },
    create: {
      id: 'seed-showtime-interstellar',
      movieId: movie.id,
      roomId: room.id,
      startsAt,
      endsAt,
    },
  });

  for (const seat of seats) {
    const price = seat.type === SeatType.VIP ? '150000.00' : '100000.00';
    await prisma.showtimeSeat.upsert({
      where: { showtimeId_seatId: { showtimeId: showtime.id, seatId: seat.id } },
      update: { price },
      create: { showtimeId: showtime.id, seatId: seat.id, price },
    });
  }

  console.log(`Seeded admin ${adminEmail} and showtime ${showtime.id}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
