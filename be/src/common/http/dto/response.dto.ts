import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

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

  @ApiPropertyOptional({ example: '2026-09-07T10:00:00.000Z' })
  createdAt?: Date | string;
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

  @ApiPropertyOptional({ example: 'A science fiction film.' })
  description?: string | null;

  @ApiProperty({ example: 169 })
  duration!: number;

  @ApiProperty({ example: 'PUBLISHED' })
  status!: string;

  @ApiProperty({ example: '2026-09-07T10:00:00.000Z' })
  createdAt!: Date | string;

  @ApiProperty({ example: '2026-09-07T10:00:00.000Z' })
  updatedAt!: Date | string;
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
}

export class SeatResponseDto {
  @ApiProperty({ example: 'clx-seat-id' })
  id!: string;

  @ApiProperty({ example: 'A' })
  row!: string;

  @ApiProperty({ example: 1 })
  number!: number;

  @ApiProperty({ example: 'STANDARD' })
  type!: string;

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
}

export class ShowtimeSeatResponseDto {
  @ApiProperty({ example: 'clx-showtime-seat-id' })
  id!: string;

  @ApiProperty({ example: '100000.00' })
  price!: string;

  @ApiProperty({ example: 'AVAILABLE' })
  status!: string;

  @ApiPropertyOptional({ example: '2026-09-07T10:10:00.000Z' })
  heldUntil?: Date | string | null;

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

  @ApiProperty({ example: '2026-10-01T19:00:00.000Z' })
  startsAt!: Date | string;

  @ApiProperty({ example: '2026-10-01T21:49:00.000Z' })
  endsAt!: Date | string;

  @ApiProperty({ type: MovieResponseDto })
  movie!: MovieResponseDto;

  @ApiProperty({ type: RoomResponseDto })
  room!: RoomResponseDto;

  @ApiPropertyOptional({ type: [ShowtimeSeatResponseDto] })
  showtimeSeats?: ShowtimeSeatResponseDto[];
}

export class PaymentResponseDto {
  @ApiProperty({ example: 'clx-payment-id' })
  id!: string;

  @ApiProperty({ example: 'MOCK' })
  provider!: string;

  @ApiPropertyOptional({ example: 'MOCK-PAYMENT-001' })
  reference?: string | null;

  @ApiProperty({ example: 'SUCCEEDED' })
  status!: string;

  @ApiProperty({ example: '100000.00' })
  amount!: string;

  @ApiProperty({ example: 'clx-booking-id' })
  bookingId!: string;

  @ApiProperty({ example: '2026-09-07T10:00:00.000Z' })
  createdAt!: Date | string;

  @ApiProperty({ example: '2026-09-07T10:00:00.000Z' })
  updatedAt!: Date | string;
}

export class TicketResponseDto {
  @ApiProperty({ example: 'clx-ticket-id' })
  id!: string;

  @ApiProperty({ example: 'TKT-ABC123' })
  code!: string;

  @ApiProperty({ example: 'ACTIVE' })
  status!: string;

  @ApiProperty({ example: 'clx-booking-id' })
  bookingId!: string;

  @ApiProperty({ example: 'clx-booking-item-id' })
  bookingItemId!: string;

  @ApiPropertyOptional({ example: '2026-09-07T10:00:00.000Z' })
  usedAt?: Date | string | null;

  @ApiProperty({ example: '2026-09-07T10:00:00.000Z' })
  createdAt!: Date | string;

  @ApiPropertyOptional({ type: MovieResponseDto })
  movie?: MovieResponseDto;

  @ApiPropertyOptional({ type: CinemaResponseDto })
  cinema?: CinemaResponseDto;

  @ApiPropertyOptional({ type: RoomResponseDto })
  room?: RoomResponseDto;

  @ApiPropertyOptional({ type: SeatResponseDto })
  seat?: SeatResponseDto;
}

export class BookingItemResponseDto {
  @ApiProperty({ example: 'clx-booking-item-id' })
  id!: string;

  @ApiProperty({ example: '100000.00' })
  price!: string;

  @ApiProperty({ example: 'clx-showtime-seat-id' })
  showtimeSeatId!: string;

  @ApiPropertyOptional({ type: ShowtimeSeatResponseDto })
  showtimeSeat?: ShowtimeSeatResponseDto;

  @ApiPropertyOptional({ type: TicketResponseDto })
  ticket?: TicketResponseDto | null;
}

export class BookingResponseDto {
  @ApiProperty({ example: 'clx-booking-id' })
  id!: string;

  @ApiProperty({ example: 'PENDING' })
  status!: string;

  @ApiProperty({ example: '200000.00' })
  totalAmount!: string;

  @ApiProperty({ example: '2026-09-07T10:10:00.000Z' })
  expiresAt!: Date | string;

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

  @ApiProperty({ type: [TicketResponseDto] })
  tickets!: TicketResponseDto[];

  @ApiProperty({ example: '2026-09-07T10:00:00.000Z' })
  createdAt!: Date | string;

  @ApiProperty({ example: '2026-09-07T10:00:00.000Z' })
  updatedAt!: Date | string;
}

export class HealthResponseDto {
  @ApiProperty({ example: 'ok' })
  status!: string;

  @ApiPropertyOptional({ example: 'ticket-booking-api' })
  service?: string;

  @ApiPropertyOptional({ example: 123.45 })
  uptime?: number;

  @ApiPropertyOptional({ example: { database: 'up', redis: 'up' } })
  checks?: Record<string, string>;

  @ApiProperty({ example: '2026-09-07T10:00:00.000Z' })
  timestamp!: string;
}

export class ApiErrorResponseDto {
  @ApiProperty({ example: 409 })
  statusCode!: number;

  @ApiProperty({ example: 'SEAT_UNAVAILABLE' })
  code!: string;

  @ApiProperty({ example: 'One or more seats are being held' })
  message!: string;

  @ApiProperty({ example: [], type: [Object] })
  details!: unknown[];

  @ApiProperty({ example: '/api/v1/bookings/hold' })
  path!: string;

  @ApiProperty({ example: 'req_123' })
  requestId!: string;

  @ApiProperty({ example: '2026-09-07T10:00:00.000Z' })
  timestamp!: string;
}
