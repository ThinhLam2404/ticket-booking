import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PrismaClient, RoomFormat, SeatType, ShowtimeFormat, UserRole } from '@prisma/client';
import { hashPassword } from '../src/common/auth/password.js';
import { buildSeatLayout, type SeatLayoutPreset } from '../src/modules/seats/seat-layout.js';

type StaticCinemaRoom = {
  id: string;
  name: string;
  format?: RoomFormat;
  layout?: SeatLayoutPreset;
};

type StaticCinema = {
  id: string;
  name: string;
  address: string;
  provinceCode: number;
  rooms: StaticCinemaRoom[];
};

type StaticCinemaData = {
  version: 1;
  defaultRoomLayout: SeatLayoutPreset;
  cinemas: StaticCinema[];
};

const prisma = new PrismaClient();
const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
const adminPassword = process.env.SEED_ADMIN_PASSWORD;
const movieId = 'seed-movie-interstellar';
const showtimeId = 'seed-showtime-interstellar';
const seedCinemaIdPrefixes = ['cinema-', 'seed-cinema-'];
const seedRoomIdPrefixes = ['room-', 'seed-room-'];
const cinemaDataPath = fileURLToPath(new URL('./data/cinemas.seed.json', import.meta.url));

if (!adminPassword?.trim()) {
  throw new Error('SEED_ADMIN_PASSWORD is required to seed the database');
}

async function readCinemaData() {
  return JSON.parse(await readFile(cinemaDataPath, 'utf8')) as StaticCinemaData;
}

function priceForSeat(type: SeatType) {
  return type === SeatType.STANDARD
    ? '100000.00'
    : type === SeatType.VIP
      ? '110000.00'
      : '132000.00';
}

async function seedCinema(cinemaData: StaticCinemaData, cinema: StaticCinema) {
  await prisma.cinema.upsert({
    where: { id: cinema.id },
    update: {
      name: cinema.name,
      address: cinema.address,
      provinceCode: cinema.provinceCode,
    },
    create: {
      id: cinema.id,
      name: cinema.name,
      address: cinema.address,
      provinceCode: cinema.provinceCode,
    },
  });

  for (const roomData of cinema.rooms) {
    const room = await prisma.room.upsert({
      where: { id: roomData.id },
      update: {
        name: roomData.name,
        cinemaId: cinema.id,
        ...(roomData.format !== undefined && { format: roomData.format }),
      },
      create: {
        id: roomData.id,
        name: roomData.name,
        cinemaId: cinema.id,
        format: roomData.format ?? RoomFormat.STANDARD,
      },
    });
    const hasShowtimes = await prisma.showtime.count({ where: { roomId: room.id } });
    if (hasShowtimes) continue;

    await prisma.seat.deleteMany({ where: { roomId: room.id } });
    const layout = buildSeatLayout(roomData.layout ?? cinemaData.defaultRoomLayout);
    await prisma.seat.createMany({
      data: layout.map((seat) => ({ ...seat, roomId: room.id })),
    });
  }
}

async function cleanupLegacySeedData(cinemaData: StaticCinemaData) {
  const desiredCinemaIds = new Set(cinemaData.cinemas.map((cinema) => cinema.id));
  const desiredRoomIds = new Set(
    cinemaData.cinemas.flatMap((cinema) => cinema.rooms.map((room) => room.id)),
  );
  const staleCinemas = await prisma.cinema.findMany({
    where: {
      id: {
        notIn: [...desiredCinemaIds],
      },
      OR: seedCinemaIdPrefixes.map((prefix) => ({ id: { startsWith: prefix } })),
    },
    select: { id: true },
  });

  for (const { id: cinemaId } of staleCinemas) {
    const showtimes = await prisma.showtime.count({
      where: { room: { cinemaId } },
    });
    if (showtimes > 0) continue;
    await prisma.cinema.delete({ where: { id: cinemaId } });
  }

  const staleRooms = await prisma.room.findMany({
    where: {
      id: {
        notIn: [...desiredRoomIds],
      },
      OR: seedRoomIdPrefixes.map((prefix) => ({ id: { startsWith: prefix } })),
    },
    select: { id: true },
  });
  for (const { id: roomId } of staleRooms) {
    const showtimes = await prisma.showtime.count({ where: { roomId } });
    if (showtimes > 0) continue;
    await prisma.room.delete({ where: { id: roomId } });
  }
}

async function seedDemoShowtime(cinema: StaticCinema) {
  const room = cinema.rooms[0];
  if (!room) throw new Error(`Cinema ${cinema.id} must contain at least one room`);
  const existingShowtime = await prisma.showtime.findUnique({
    where: { id: showtimeId },
    include: { _count: { select: { bookings: true } } },
  });
  if (existingShowtime?._count.bookings) return;

  const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 169 * 60 * 1000);
  if (existingShowtime) {
    await prisma.showtimeSeat.deleteMany({ where: { showtimeId } });
  }
  const showtime = existingShowtime
    ? await prisma.showtime.update({
        where: { id: showtimeId },
        data: {
          movieId,
          roomId: room.id,
          startsAt,
          endsAt,
          format: ShowtimeFormat.TWO_D_SUBTITLED,
          basePrice: '100000.00',
          vipMultiplier: '1.10',
          coupleMultiplier: '1.20',
        },
      })
    : await prisma.showtime.create({
        data: {
          id: showtimeId,
          movieId,
          roomId: room.id,
          startsAt,
          endsAt,
          format: ShowtimeFormat.TWO_D_SUBTITLED,
          basePrice: '100000.00',
          vipMultiplier: '1.10',
          coupleMultiplier: '1.20',
        },
      });

  const seats = await prisma.seat.findMany({ where: { roomId: showtime.roomId } });
  await prisma.showtimeSeat.createMany({
    data: seats.map((seat) => ({
      showtimeId: showtime.id,
      seatId: seat.id,
      price: priceForSeat(seat.type),
    })),
  });
}

async function main() {
  const cinemaData = await readCinemaData();
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

  for (const cinema of cinemaData.cinemas) {
    await seedCinema(cinemaData, cinema);
  }
  const firstCinema = cinemaData.cinemas[0];
  if (!firstCinema) throw new Error('Static cinema data must contain at least one cinema');
  await seedDemoShowtime(firstCinema);
  await cleanupLegacySeedData(cinemaData);
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
