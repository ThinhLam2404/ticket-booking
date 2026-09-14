import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BookingStatus,
  MovieStatus,
  PaymentStatus,
  SeatType,
  ShowtimeSeatStatus,
  TicketStatus,
  UserRole,
} from '@prisma/client';

export class PaginationMetaDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;

  @ApiProperty({ example: 100 })
  total!: number;

  @ApiProperty({ example: 5 })
  totalPages!: number;
}

export class UserResponseDto {
  @ApiProperty({ example: 'clx-user-id' })
  id!: string;

  @ApiProperty({ example: 'customer@example.com' })
  email!: string;

  @ApiProperty({ example: 'Nguyen Van A' })
  fullName!: string;

  @ApiProperty({ enum: UserRole, example: UserRole.CUSTOMER })
  role!: UserRole;

  @ApiPropertyOptional({ type: String, example: '2026-09-07T10:00:00.000Z', format: 'date-time', nullable: true })
  createdAt?: string | null;
}

export class AuthResponseDto {
  @ApiProperty({ type: UserResponseDto })
  user!: UserResponseDto;

  @ApiProperty({ example: '<access-token>' })
  accessToken!: string;

  @ApiProperty({ example: '<refresh-token>' })
  refreshToken!: string;
}

export class MovieResponseDto {
  @ApiProperty({ example: 'clx-movie-id' })
  id!: string;

  @ApiProperty({ example: 'Interstellar' })
  title!: string;

  @ApiPropertyOptional({ type: String, example: 'A science fiction film.', nullable: true })
  description?: string | null;

  @ApiProperty({ example: 169 })
  duration!: number;

  @ApiProperty({ enum: MovieStatus, example: MovieStatus.PUBLISHED })
  status!: MovieStatus;

  @ApiProperty({ example: '2026-09-07T10:00:00.000Z', format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ example: '2026-09-07T10:00:00.000Z', format: 'date-time' })
  updatedAt!: string;
}

export class MovieShowtimeResponseDto {
  @ApiProperty({ example: 'clx-showtime-id' })
  id!: string;

  @ApiProperty({ example: '2026-10-01T19:00:00.000Z', format: 'date-time' })
  startsAt!: string;

  @ApiProperty({ example: '2026-10-01T21:49:00.000Z', format: 'date-time' })
  endsAt!: string;

  @ApiProperty({ example: 'clx-movie-id' })
  movieId!: string;

  @ApiProperty({ example: 'clx-room-id' })
  roomId!: string;

  @ApiProperty({ type: () => RoomResponseDto })
  room!: object;

  @ApiProperty({ example: '2026-09-07T10:00:00.000Z', format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ example: '2026-09-07T10:00:00.000Z', format: 'date-time' })
  updatedAt!: string;
}

export class MovieDetailsResponseDto extends MovieResponseDto {
  @ApiProperty({ type: [MovieShowtimeResponseDto] })
  showtimes!: MovieShowtimeResponseDto[];
}

export class CinemaRoomResponseDto {
  @ApiProperty({ example: 'clx-room-id' })
  id!: string;

  @ApiProperty({ example: 'Room 1' })
  name!: string;

  @ApiProperty({ example: 'clx-cinema-id' })
  cinemaId!: string;

  @ApiProperty({ example: 32 })
  seatCount!: number;

  @ApiProperty({ example: '2026-09-07T10:00:00.000Z', format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ example: '2026-09-07T10:00:00.000Z', format: 'date-time' })
  updatedAt!: string;
}

export class CinemaResponseDto {
  @ApiProperty({ example: 'clx-cinema-id' })
  id!: string;

  @ApiProperty({ example: 'Central Cinema' })
  name!: string;

  @ApiProperty({ example: '1 Example Street' })
  address!: string;

  @ApiPropertyOptional({ example: 3 })
  roomCount?: number;

  @ApiProperty({ example: '2026-09-07T10:00:00.000Z', format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ example: '2026-09-07T10:00:00.000Z', format: 'date-time' })
  updatedAt!: string;
}

export class CinemaDetailsResponseDto extends CinemaResponseDto {
  @ApiProperty({ type: [CinemaRoomResponseDto] })
  rooms!: CinemaRoomResponseDto[];
}

export class SeatResponseDto {
  @ApiProperty({ example: 'clx-seat-id' })
  id!: string;

  @ApiProperty({ example: 'A' })
  row!: string;

  @ApiProperty({ example: 1 })
  number!: number;

  @ApiProperty({ enum: SeatType, example: SeatType.STANDARD })
  type!: SeatType;

  @ApiProperty({ example: 'clx-room-id' })
  roomId!: string;
}

export class RoomResponseDto {
  @ApiProperty({ example: 'clx-room-id' })
  id!: string;

  @ApiProperty({ example: 'Room 1' })
  name!: string;

  @ApiProperty({ example: 'clx-cinema-id' })
  cinemaId!: string;

  @ApiPropertyOptional({ type: CinemaResponseDto })
  cinema?: CinemaResponseDto;

  @ApiPropertyOptional({ type: [SeatResponseDto] })
  seats?: SeatResponseDto[];

  @ApiPropertyOptional({ example: 32 })
  seatCount?: number;

  @ApiProperty({ example: '2026-09-07T10:00:00.000Z', format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ example: '2026-09-07T10:00:00.000Z', format: 'date-time' })
  updatedAt!: string;
}

export class ShowtimeSeatResponseDto {
  @ApiProperty({ example: 'clx-showtime-seat-id' })
  id!: string;

  @ApiProperty({ example: '100000.00' })
  price!: string;

  @ApiProperty({ enum: ShowtimeSeatStatus, example: ShowtimeSeatStatus.AVAILABLE })
  status!: ShowtimeSeatStatus;

  @ApiPropertyOptional({ type: String, example: '2026-09-07T10:10:00.000Z', format: 'date-time', nullable: true })
  heldUntil?: string | null;

  @ApiProperty({ example: 'clx-showtime-id' })
  showtimeId!: string;

  @ApiProperty({ example: 'clx-seat-id' })
  seatId!: string;

  @ApiProperty({ type: SeatResponseDto })
  seat!: SeatResponseDto;
}

export class ShowtimeResponseDto {
  @ApiProperty({ example: 'clx-showtime-id' })
  id!: string;

  @ApiProperty({ example: '2026-10-01T19:00:00.000Z', format: 'date-time' })
  startsAt!: string;

  @ApiProperty({ example: '2026-10-01T21:49:00.000Z', format: 'date-time' })
  endsAt!: string;

  @ApiProperty({ example: 'clx-movie-id' })
  movieId!: string;

  @ApiProperty({ type: MovieResponseDto })
  movie!: MovieResponseDto;

  @ApiProperty({ example: 'clx-room-id' })
  roomId!: string;

  @ApiProperty({ type: RoomResponseDto })
  room!: RoomResponseDto;

  @ApiPropertyOptional({ type: [ShowtimeSeatResponseDto] })
  showtimeSeats?: ShowtimeSeatResponseDto[];

  @ApiProperty({ example: '2026-09-07T10:00:00.000Z', format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ example: '2026-09-07T10:00:00.000Z', format: 'date-time' })
  updatedAt!: string;
}

export class ShowtimeSeatsResponseDto {
  @ApiProperty({ example: 'clx-showtime-id' })
  showtimeId!: string;

  @ApiProperty({ example: '2026-10-01T19:00:00.000Z', format: 'date-time' })
  startsAt!: string;

  @ApiProperty({ example: '2026-10-01T21:49:00.000Z', format: 'date-time' })
  endsAt!: string;

  @ApiProperty({ type: [ShowtimeSeatResponseDto] })
  seats!: ShowtimeSeatResponseDto[];
}

export class PaginatedMoviesResponseDto {
  @ApiProperty({ type: [MovieResponseDto] })
  data!: MovieResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class PaginatedShowtimesResponseDto {
  @ApiProperty({ type: [ShowtimeResponseDto] })
  data!: ShowtimeResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class PaymentResponseDto {
  @ApiProperty({ example: 'clx-payment-id' })
  id!: string;

  @ApiProperty({ example: 'MOCK' })
  provider!: string;

  @ApiPropertyOptional({ type: String, example: 'MOCK-PAYMENT-001', nullable: true })
  reference?: string | null;

  @ApiProperty({ enum: PaymentStatus, example: PaymentStatus.SUCCEEDED })
  status!: PaymentStatus;

  @ApiProperty({ example: '100000.00' })
  amount!: string;

  @ApiProperty({ example: 'clx-booking-id' })
  bookingId!: string;

  @ApiProperty({ example: '2026-09-07T10:00:00.000Z', format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ example: '2026-09-07T10:00:00.000Z', format: 'date-time' })
  updatedAt!: string;
}

export class TicketSummaryResponseDto {
  @ApiProperty({ example: 'clx-ticket-id' })
  id!: string;

  @ApiProperty({ example: 'TKT-ABC123' })
  code!: string;

  @ApiProperty({ enum: TicketStatus, example: TicketStatus.ACTIVE })
  status!: TicketStatus;

  @ApiProperty({ example: 'clx-booking-id' })
  bookingId!: string;

  @ApiProperty({ example: 'clx-booking-item-id' })
  bookingItemId!: string;

  @ApiPropertyOptional({ type: String, example: '2026-09-07T10:00:00.000Z', format: 'date-time', nullable: true })
  usedAt?: string | null;

  @ApiProperty({ example: '2026-09-07T10:00:00.000Z', format: 'date-time' })
  createdAt!: string;
}

export class TicketBookingResponseDto {
  @ApiProperty({ example: 'clx-booking-id' })
  id!: string;

  @ApiProperty({ enum: BookingStatus, example: BookingStatus.CONFIRMED })
  status!: BookingStatus;

  @ApiProperty({ example: '200000.00' })
  totalAmount!: string;

  @ApiProperty({ example: '2026-09-07T10:10:00.000Z', format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ example: 'clx-user-id' })
  userId!: string;

  @ApiProperty({ example: 'clx-showtime-id' })
  showtimeId!: string;

  @ApiProperty({ type: ShowtimeResponseDto })
  showtime!: ShowtimeResponseDto;

  @ApiProperty({ example: '2026-09-07T10:00:00.000Z', format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ example: '2026-09-07T10:00:00.000Z', format: 'date-time' })
  updatedAt!: string;
}

export class TicketBookingItemResponseDto {
  @ApiProperty({ example: 'clx-booking-item-id' })
  id!: string;

  @ApiProperty({ example: '100000.00' })
  price!: string;

  @ApiProperty({ example: 'clx-booking-id' })
  bookingId!: string;

  @ApiProperty({ example: 'clx-showtime-seat-id' })
  showtimeSeatId!: string;

  @ApiProperty({ type: ShowtimeSeatResponseDto })
  showtimeSeat!: ShowtimeSeatResponseDto;
}

export class TicketResponseDto extends TicketSummaryResponseDto {
  @ApiProperty({ type: TicketBookingResponseDto })
  booking!: TicketBookingResponseDto;

  @ApiProperty({ type: TicketBookingItemResponseDto })
  bookingItem!: TicketBookingItemResponseDto;
}

export class BookingItemResponseDto {
  @ApiProperty({ example: 'clx-booking-item-id' })
  id!: string;

  @ApiProperty({ example: '100000.00' })
  price!: string;

  @ApiProperty({ example: 'clx-booking-id' })
  bookingId!: string;

  @ApiProperty({ example: 'clx-showtime-seat-id' })
  showtimeSeatId!: string;

  @ApiPropertyOptional({ type: ShowtimeSeatResponseDto })
  showtimeSeat?: ShowtimeSeatResponseDto;

  @ApiPropertyOptional({ type: TicketSummaryResponseDto })
  ticket?: TicketSummaryResponseDto | null;
}

export class BookingResponseDto {
  @ApiProperty({ example: 'clx-booking-id' })
  id!: string;

  @ApiProperty({ enum: BookingStatus, example: BookingStatus.PENDING })
  status!: BookingStatus;

  @ApiProperty({ example: '200000.00' })
  totalAmount!: string;

  @ApiProperty({ example: '2026-09-07T10:10:00.000Z', format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ example: 'clx-user-id' })
  userId!: string;

  @ApiProperty({ example: 'clx-showtime-id' })
  showtimeId!: string;

  @ApiProperty({ type: ShowtimeResponseDto })
  showtime!: ShowtimeResponseDto;

  @ApiProperty({ type: [BookingItemResponseDto] })
  items!: BookingItemResponseDto[];

  @ApiPropertyOptional({ type: PaymentResponseDto })
  payment?: PaymentResponseDto | null;

  @ApiProperty({ type: [TicketSummaryResponseDto] })
  tickets!: TicketSummaryResponseDto[];

  @ApiProperty({ example: '2026-09-07T10:00:00.000Z', format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ example: '2026-09-07T10:00:00.000Z', format: 'date-time' })
  updatedAt!: string;
}

export class MockPaymentResponseDto {
  @ApiProperty({ type: PaymentResponseDto })
  payment!: PaymentResponseDto;

  @ApiProperty({ type: BookingResponseDto })
  booking!: BookingResponseDto;
}

export class HealthResponseDto {
  @ApiProperty({ enum: ['ok', 'degraded'], example: 'ok' })
  status!: 'ok' | 'degraded';

  @ApiPropertyOptional({ example: 'ticket-booking-api' })
  service?: string;

  @ApiPropertyOptional({ example: 123.45 })
  uptime?: number;

  @ApiPropertyOptional({ example: { database: 'up', redis: 'up' } })
  checks?: Record<string, string>;

  @ApiProperty({ example: '2026-09-07T10:00:00.000Z', format: 'date-time' })
  timestamp!: string;
}

export class ApiErrorResponseDto {
  @ApiProperty({ example: 409 })
  statusCode!: number;

  @ApiProperty({ example: 'CONFLICT' })
  code!: string;

  @ApiProperty({ example: 'One or more seats are being held' })
  message!: string;

  @ApiProperty({ example: [], type: [Object] })
  details!: unknown[];

  @ApiProperty({ example: '/api/v1/bookings/hold' })
  path!: string;

  @ApiProperty({ example: 'req_123' })
  requestId!: string;

  @ApiProperty({ example: '2026-09-07T10:00:00.000Z', format: 'date-time' })
  timestamp!: string;
}
