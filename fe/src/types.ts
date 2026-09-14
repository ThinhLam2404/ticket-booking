import type { components, paths } from './generated/openapi';

type JsonResponse<Path extends keyof paths, Method extends keyof paths[Path]> =
  paths[Path][Method] extends { responses: infer Responses }
    ? 200 extends keyof Responses
      ? Responses[200] extends { content: { 'application/json': infer Body } }
        ? Body
        : never
      : 201 extends keyof Responses
        ? Responses[201] extends { content: { 'application/json': infer Body } }
          ? Body
          : never
        : never
    : never;

type RequestBody<Path extends keyof paths, Method extends keyof paths[Path]> =
  paths[Path][Method] extends {
    requestBody: { content: { 'application/json': infer Body } };
  }
    ? Body
    : never;

export type User = components['schemas']['UserResponseDto'];
export type AuthResponse = components['schemas']['AuthResponseDto'];
export type Movie = components['schemas']['MovieResponseDto'];
export type MovieDetails = components['schemas']['MovieDetailsResponseDto'];
export type Cinema = components['schemas']['CinemaResponseDto'];
export type Seat = components['schemas']['SeatResponseDto'];
export type ShowtimeSeat = components['schemas']['ShowtimeSeatResponseDto'];
export type Showtime = components['schemas']['ShowtimeResponseDto'];
export type BookingItem = components['schemas']['BookingItemResponseDto'];
export type Payment = components['schemas']['PaymentResponseDto'];
export type Booking = components['schemas']['BookingResponseDto'];
export type Ticket = components['schemas']['TicketResponseDto'];
export type ApiError = components['schemas']['ApiErrorResponseDto'];

export type MoviesResponse = JsonResponse<'/api/v1/movies', 'get'>;
export type MovieResponse = JsonResponse<'/api/v1/movies/{id}', 'get'>;
export type ShowtimesResponse = JsonResponse<'/api/v1/showtimes', 'get'>;
export type ShowtimeSeatsResponse = JsonResponse<'/api/v1/showtimes/{id}/seats', 'get'>;
export type MockPaymentResponse = JsonResponse<'/api/v1/payments/mock/{bookingId}', 'post'>;

export type RegisterRequest = RequestBody<'/api/v1/auth/register', 'post'>;
export type LoginRequest = RequestBody<'/api/v1/auth/login', 'post'>;
export type RefreshTokenRequest = RequestBody<'/api/v1/auth/refresh', 'post'>;
export type HoldRequest = RequestBody<'/api/v1/bookings/hold', 'post'>;
export type MockPaymentRequest = RequestBody<'/api/v1/payments/mock/{bookingId}', 'post'>;
