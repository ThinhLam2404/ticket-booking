import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { AdminPermission, PrismaClient, RoomFormat, SeatType, ShowtimeFormat, UserRole } from '@prisma/client';
import { hashPassword } from '../src/common/auth/password.js';
import { buildSeatLayout, type SeatLayoutPreset } from '../src/modules/seats/seat-layout.js';
import { DEFAULT_COUPLE_MULTIPLIER, DEFAULT_VIP_MULTIPLIER, getPolicyBasePrice } from '../src/modules/showtimes/showtime-policy.js';

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
const scheduledMovies = [
  { id: movieId, title: 'Interstellar', duration: 169, description: 'A science fiction film about space exploration.' },
  { id: 'seed-movie-dune-part-two', title: 'Dune: Part Two', duration: 166, description: 'A science fiction epic about destiny and resistance.' },
  { id: 'seed-movie-oppenheimer', title: 'Oppenheimer', duration: 180, description: 'A historical drama about science and consequence.' },
  { id: 'seed-movie-spider-verse', title: 'Spider-Man: Across the Spider-Verse', duration: 140, description: 'An animated multiverse adventure.' },
] as const;
const seedCinemaIdPrefixes = ['cinema-', 'seed-cinema-'];
const seedRoomIdPrefixes = ['room-', 'seed-room-'];
const cinemaDataPath = fileURLToPath(new URL('./data/cinemas.seed.json', import.meta.url));

if (!adminPassword?.trim()) {
  throw new Error('SEED_ADMIN_PASSWORD is required to seed the database');
}

async function readCinemaData() {
  return JSON.parse(await readFile(cinemaDataPath, 'utf8')) as StaticCinemaData;
}

function priceForSeat(type: SeatType, basePrice: number, vipMultiplier = DEFAULT_VIP_MULTIPLIER, coupleMultiplier = DEFAULT_COUPLE_MULTIPLIER) {
  const multiplier = type === SeatType.VIP
    ? vipMultiplier
    : type === SeatType.COUPLE
      ? vipMultiplier * coupleMultiplier
      : 1;
  return (basePrice * multiplier).toFixed(2);
}

const seededRoomFormats = [RoomFormat.STANDARD, RoomFormat.IMAX, RoomFormat.FOUR_DX, RoomFormat.SCREEN_X] as const;

function generatedRoomName(format: RoomFormat) {
  return format === RoomFormat.STANDARD
    ? 'Phòng Standard'
    : format === RoomFormat.FOUR_DX
      ? 'Phòng 4DX'
      : format === RoomFormat.SCREEN_X
        ? 'Phòng ScreenX'
        : 'Phòng IMAX';
}

function roomDataForCinema(cinema: StaticCinema): StaticCinemaRoom[] {
  const rooms = [...cinema.rooms];
  const formats = new Set(
    rooms.map((room) => room.format ?? RoomFormat.STANDARD),
  );
  const names = new Set(rooms.map((room) => room.name));

  for (const format of seededRoomFormats) {
    if (formats.has(format)) continue;
    const baseName = generatedRoomName(format);
    let name = baseName;
    let suffix = 2;
    while (names.has(name)) name = `${baseName} ${suffix++}`;
    rooms.push({
      id: `room-${cinema.id}-${format.toLowerCase()}`,
      name,
      format,
    });
    names.add(name);
  }
  return rooms;
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

  for (const roomData of roomDataForCinema(cinema)) {
    const existingRoom = await prisma.room.findUnique({ where: { id: roomData.id } });
    const hasShowtimes = existingRoom
      ? (await prisma.showtime.count({ where: { roomId: existingRoom.id } })) > 0
      : false;
    const room = existingRoom
      ? await prisma.room.update({
          where: { id: existingRoom.id },
          data: {
            name: roomData.name,
            cinemaId: cinema.id,
            ...(!hasShowtimes && roomData.format !== undefined
              ? { format: roomData.format }
              : {}),
          },
        })
      : await prisma.room.create({
          data: {
            id: roomData.id,
            name: roomData.name,
            cinemaId: cinema.id,
            format: roomData.format ?? RoomFormat.STANDARD,
          },
        });
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
    cinemaData.cinemas.flatMap((cinema) => roomDataForCinema(cinema).map((room) => room.id)),
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

function seededNumber(value: string) {
  return [...value].reduce((hash, character) => ((hash * 31 + character.charCodeAt(0)) | 0), 7) >>> 0;
}

function seededDate(daysFromNow: number) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function seedPrice(roomFormat: RoomFormat, showtimeFormat: ShowtimeFormat, startsAt: Date) {
  return getPolicyBasePrice(roomFormat, showtimeFormat, startsAt);
}

async function ensureSeededShowtime({
  movie,
  room,
  startsAt,
  format,
}: {
  movie: (typeof scheduledMovies)[number];
  room: { id: string; format: RoomFormat };
  startsAt: Date;
  format: ShowtimeFormat;
}) {
  const endsAt = new Date(startsAt.getTime() + movie.duration * 60 * 1000);
  const existing = await prisma.showtime.findFirst({
    where: { movieId: movie.id, roomId: room.id, startsAt },
    include: { _count: { select: { bookings: true } } },
  });
  if (existing?._count.bookings) return;
  const basePrice = seedPrice(room.format, format, startsAt);
  const showtime = existing
    ? await prisma.showtime.update({
        where: { id: existing.id },
         data: { endsAt, format, basePrice: basePrice.toFixed(2), vipMultiplier: DEFAULT_VIP_MULTIPLIER.toFixed(2), coupleMultiplier: DEFAULT_COUPLE_MULTIPLIER.toFixed(2) },

      })
    : await prisma.showtime.create({
        data: {
          movieId: movie.id,
          roomId: room.id,
          startsAt,
          endsAt,
          format,
          basePrice: basePrice.toFixed(2),
          vipMultiplier: DEFAULT_VIP_MULTIPLIER.toFixed(2),
          coupleMultiplier: DEFAULT_COUPLE_MULTIPLIER.toFixed(2),

        },
      });
  if (existing) await prisma.showtimeSeat.deleteMany({ where: { showtimeId: showtime.id } });
  const seats = await prisma.seat.findMany({ where: { roomId: room.id } });
  await prisma.showtimeSeat.createMany({
    data: seats.map((seat) => ({
      showtimeId: showtime.id,
      seatId: seat.id,
      price: priceForSeat(seat.type, basePrice),
    })),
  });
}

async function seedRandomShowtimes(cinemaData: StaticCinemaData) {
  const scheduleDate = seededDate(2);
  const startTimes = ['09:00:00', '15:00:00'];
  for (const cinema of cinemaData.cinemas) {
    const rooms = roomDataForCinema(cinema).map((room) => ({ id: room.id, format: room.format ?? RoomFormat.STANDARD }));
    for (const room of rooms) {
      const hash = seededNumber(`${cinema.id}:${room.id}`);
      for (let index = 0; index < startTimes.length; index += 1) {
        const movie = scheduledMovies[(hash + index) % scheduledMovies.length]!;
        const format = (hash + index) % 3 === 0
          ? ShowtimeFormat.THREE_D_SUBTITLED
          : ShowtimeFormat.TWO_D_SUBTITLED;
        await ensureSeededShowtime({
          movie,
          room,
          startsAt: new Date(`${scheduleDate}T${startTimes[index]}+07:00`),
          format,
        });
      }
    }
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

  // Keep the demo showtime in a deterministic local-time slot between the
  // generated 09:00 and 15:00 screenings. This makes the seed repeatable
  // without colliding with stale generated showtimes from a previous day.
  const startsAt = new Date(`${seededDate(1)}T12:00:00+07:00`);
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
          basePrice: getPolicyBasePrice(room.format ?? RoomFormat.STANDARD, ShowtimeFormat.TWO_D_SUBTITLED, startsAt).toFixed(2),
          vipMultiplier: DEFAULT_VIP_MULTIPLIER.toFixed(2),
          coupleMultiplier: DEFAULT_COUPLE_MULTIPLIER.toFixed(2),
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
          basePrice: getPolicyBasePrice(room.format ?? RoomFormat.STANDARD, ShowtimeFormat.TWO_D_SUBTITLED, startsAt).toFixed(2),
          vipMultiplier: DEFAULT_VIP_MULTIPLIER.toFixed(2),
          coupleMultiplier: DEFAULT_COUPLE_MULTIPLIER.toFixed(2),
        },
      });

  const seats = await prisma.seat.findMany({ where: { roomId: showtime.roomId } });
  const basePrice = getPolicyBasePrice(room.format ?? RoomFormat.STANDARD, ShowtimeFormat.TWO_D_SUBTITLED, startsAt);
  await prisma.showtimeSeat.createMany({
    data: seats.map((seat) => ({
      showtimeId: showtime.id,
      seatId: seat.id,
      price: priceForSeat(seat.type, basePrice),
    })),
  });
}

async function main() {
  const cinemaData = await readCinemaData();
  const passwordHash = await hashPassword(adminPassword);
  const admin = await prisma.user.upsert({
    where: { email: adminEmail.toLowerCase() },
    update: { fullName: 'System Admin', passwordHash, role: UserRole.ADMIN, emailVerifiedAt: new Date() },
    create: {
      email: adminEmail.toLowerCase(),
      fullName: 'System Admin',
      passwordHash,
      role: UserRole.ADMIN,
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.userAdminPermission.createMany({
    data: Object.values(AdminPermission).map((permission) => ({ userId: admin.id, permission })),
    skipDuplicates: true,
  });

  for (const movie of scheduledMovies) {
    await prisma.movie.upsert({
      where: { id: movie.id },
      update: {
        title: movie.title,
        description: movie.description,
        duration: movie.duration,
        status: 'PUBLISHED',
      },
      create: {
        id: movie.id,
        title: movie.title,
        description: movie.description,
        duration: movie.duration,
        status: 'PUBLISHED',
      },
    });
  }

  for (const cinema of cinemaData.cinemas) {
    await seedCinema(cinemaData, cinema);
  }
  const firstCinema = cinemaData.cinemas[0];
  if (!firstCinema) throw new Error('Static cinema data must contain at least one cinema');
  await seedDemoShowtime(firstCinema);
  await seedRandomShowtimes(cinemaData);
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
