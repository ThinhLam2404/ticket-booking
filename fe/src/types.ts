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
export type TmdbMovieResponse = components['schemas']['TmdbMovieResponseDto'];
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
export type ShowtimeResponse = JsonResponse<'/api/v1/showtimes/{id}', 'get'>;
export type ShowtimeSeatsResponse = JsonResponse<'/api/v1/showtimes/{id}/seats', 'get'>;
export type MockPaymentResponse = JsonResponse<'/api/v1/payments/mock/{bookingId}', 'post'>;

export type RegisterRequest = RequestBody<'/api/v1/auth/register', 'post'>;
export type LoginRequest = RequestBody<'/api/v1/auth/login', 'post'>;
export type RefreshTokenRequest = RequestBody<'/api/v1/auth/refresh', 'post'>;
export type HoldRequest = RequestBody<'/api/v1/bookings/hold', 'post'>;
export type MockPaymentRequest = RequestBody<'/api/v1/payments/mock/{bookingId}', 'post'>;

export type MovieStatus = Movie['status'];
export type SeatType = Seat['type'];
export type AdminMoviesQuery = NonNullable<paths['/api/v1/movies/admin']['get']['parameters']['query']>;
export type AdminMoviesResponse = JsonResponse<'/api/v1/movies/admin', 'get'>;
export type TmdbMoviesQuery = NonNullable<paths['/api/v1/movies/admin/tmdb']['get']['parameters']['query']>;
export type TmdbMoviesResponse = JsonResponse<'/api/v1/movies/admin/tmdb', 'get'>;
export type TmdbMovieImportResponse = JsonResponse<'/api/v1/movies/admin/tmdb/{tmdbId}/import', 'put'>;
export type CreateMovieRequest = RequestBody<'/api/v1/movies', 'post'>;
export type UpdateMovieRequest = RequestBody<'/api/v1/movies/{id}', 'patch'>;
export type MovieMutationResponse = JsonResponse<'/api/v1/movies', 'post'>;
export type MovieUpdateResponse = JsonResponse<'/api/v1/movies/{id}', 'patch'>;
export type CinemaDetails = JsonResponse<'/api/v1/cinemas/{id}', 'get'>;
export type CreateCinemaRequest = RequestBody<'/api/v1/cinemas', 'post'>;
export type UpdateCinemaRequest = RequestBody<'/api/v1/cinemas/{id}', 'patch'>;
export type CinemaMutationResponse = JsonResponse<'/api/v1/cinemas', 'post'>;
export type CinemaUpdateResponse = JsonResponse<'/api/v1/cinemas/{id}', 'patch'>;
export type CinemaDeleteResponse = JsonResponse<'/api/v1/cinemas/{id}', 'delete'>;
export type RoomsQuery = NonNullable<paths['/api/v1/rooms']['get']['parameters']['query']>;
export type RoomsResponse = JsonResponse<'/api/v1/rooms', 'get'>;
export type RoomResponse = JsonResponse<'/api/v1/rooms/{id}', 'get'>;
export type CreateRoomRequest = RequestBody<'/api/v1/rooms', 'post'>;
export type UpdateRoomRequest = RequestBody<'/api/v1/rooms/{id}', 'patch'>;
export type RoomMutationResponse = JsonResponse<'/api/v1/rooms', 'post'>;
export type RoomUpdateResponse = JsonResponse<'/api/v1/rooms/{id}', 'patch'>;
export type RoomDeleteResponse = JsonResponse<'/api/v1/rooms/{id}', 'delete'>;
export type SeatsResponse = JsonResponse<'/api/v1/seats/room/{roomId}', 'get'>;
export type CreateSeatRequest = RequestBody<'/api/v1/seats/{roomId}', 'post'>;
export type UpdateSeatRequest = RequestBody<'/api/v1/seats/{id}', 'patch'>;
export type BulkSeatLayoutRequest = RequestBody<'/api/v1/seats/room/{roomId}/layout', 'put'>;
export type SeatMutationResponse = JsonResponse<'/api/v1/seats/{roomId}', 'post'>;
export type SeatUpdateResponse = JsonResponse<'/api/v1/seats/{id}', 'patch'>;
export type SeatDeleteResponse = JsonResponse<'/api/v1/seats/{id}', 'delete'>;
export type AdminShowtimesQuery = NonNullable<paths['/api/v1/showtimes/admin']['get']['parameters']['query']>;
export type AdminShowtimesResponse = JsonResponse<'/api/v1/showtimes/admin', 'get'>;
export type CreateShowtimeRequest = RequestBody<'/api/v1/showtimes', 'post'>;
export type UpdateShowtimeRequest = RequestBody<'/api/v1/showtimes/{id}', 'patch'>;
export type ShowtimeMutationResponse = JsonResponse<'/api/v1/showtimes', 'post'>;
export type ShowtimeUpdateResponse = JsonResponse<'/api/v1/showtimes/{id}', 'patch'>;
export type ShowtimeDeleteResponse = JsonResponse<'/api/v1/showtimes/{id}', 'delete'>;
