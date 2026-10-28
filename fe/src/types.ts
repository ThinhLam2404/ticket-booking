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

export type Province = components['schemas']['ProvinceResponseDto'];
export type User = components['schemas']['UserResponseDto'];
export type AuthResponse = components['schemas']['AuthResponseDto'];
export type EmailVerificationRequiredResponse = JsonResponse<'/api/v1/auth/register', 'post'>;
export type EmailVerificationResponse = JsonResponse<'/api/v1/auth/email/verify', 'post'>;
export type EmailVerificationResendResponse = JsonResponse<'/api/v1/auth/email/resend', 'post'>;
export type Movie = components['schemas']['MovieResponseDto'];
export type MovieDetails = components['schemas']['MovieDetailsResponseDto'];
export type TmdbMovieResponse = components['schemas']['TmdbMovieResponseDto'];
export type Cinema = components['schemas']['CinemaResponseDto'];
export type ProvincesResponse = JsonResponse<'/api/v1/locations/provinces', 'get'>;
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
export type SepayCheckoutResponse = JsonResponse<'/api/v1/payments/bookings/{bookingId}/checkout', 'post'>;

export type RegisterRequest = RequestBody<'/api/v1/auth/register', 'post'>;
export type LoginRequest = RequestBody<'/api/v1/auth/login', 'post'>;
export type RefreshTokenRequest = RequestBody<'/api/v1/auth/refresh', 'post'>;
export type RequestPasswordResetRequest = RequestBody<'/api/v1/auth/password-reset/request', 'post'>;
export type ResetPasswordRequest = RequestBody<'/api/v1/auth/password-reset/confirm', 'post'>;
export type ChangePasswordRequest = RequestBody<'/api/v1/auth/password/change', 'post'>;
export type AuthSession = JsonResponse<'/api/v1/auth/sessions', 'get'>[number];
export type AdminUser = JsonResponse<'/api/v1/users/admin', 'get'>[number];
export type UpdateAdminUserAccessRequest = RequestBody<'/api/v1/users/admin/{id}/access', 'patch'>;
export type AdminAuditLog = {
  id: string;
  requestId: string | null;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  before: unknown;
  after: unknown;
  metadata: unknown;
  createdAt: string;
};
export type AdminUserSession = JsonResponse<'/api/v1/users/admin/{id}/sessions', 'get'>[number];
export type AdminInvitation = JsonResponse<'/api/v1/users/admin/invitations', 'get'>[number];
export type CreateAdminInvitationRequest = RequestBody<'/api/v1/users/admin/invitations', 'post'>;
export type AcceptAdminInvitationRequest = RequestBody<'/api/v1/auth/admin-invitations/accept', 'post'>;
export type AdminInvitationPreview = JsonResponse<'/api/v1/auth/admin-invitations/preview', 'post'>;
export type AdminInvitationAccepted = JsonResponse<'/api/v1/auth/admin-invitations/accept', 'post'>;
export type HoldRequest = RequestBody<'/api/v1/bookings/hold', 'post'>;
export type QuoteRequest = RequestBody<'/api/v1/bookings/quote', 'post'>;
export type QuoteResponse = JsonResponse<'/api/v1/bookings/quote', 'post'>;
export type Voucher = components['schemas']['VoucherResponseDto'];
export type CustomerVoucher = components['schemas']['CustomerVoucherResponseDto'];

export type MovieStatus = Movie['status'];
export type SeatType = Seat['type'];
export type AdminMoviesQuery = NonNullable<paths['/api/v1/movies/admin']['get']['parameters']['query']>;
export type AdminMoviesResponse = JsonResponse<'/api/v1/movies/admin', 'get'>;
export type TmdbMoviesQuery = NonNullable<paths['/api/v1/movies/admin/tmdb']['get']['parameters']['query']>;
export type TmdbMoviesResponse = JsonResponse<'/api/v1/movies/admin/tmdb', 'get'>;
export type TmdbMovieImportResponse = JsonResponse<'/api/v1/movies/admin/tmdb/{tmdbId}/import', 'put'>;
export type TmdbMovieResyncResponse = JsonResponse<'/api/v1/movies/admin/tmdb/{tmdbId}/resync', 'put'>;
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
export type BulkShowtimeRequest = RequestBody<'/api/v1/showtimes/bulk', 'post'>;
export type BulkShowtimePreviewResponse = JsonResponse<'/api/v1/showtimes/bulk/preview', 'post'>;
export type BulkShowtimeResponse = JsonResponse<'/api/v1/showtimes/bulk', 'post'>;
export type CinemaBulkShowtimeRequest = RequestBody<'/api/v1/showtimes/cinema-bulk', 'post'>;
export type CinemaBulkPreviewResponse = JsonResponse<'/api/v1/showtimes/cinema-bulk/preview', 'post'>;
export type CinemaBulkResponse = JsonResponse<'/api/v1/showtimes/cinema-bulk', 'post'>;
export type CinemaFreeSlotsResponse = JsonResponse<'/api/v1/showtimes/cinemas/{cinemaId}/free-slots', 'get'>;
export type ShowtimePricingQuoteRequest = RequestBody<'/api/v1/showtimes/pricing/quote', 'post'>;
export type ShowtimePricingQuoteResponse = JsonResponse<'/api/v1/showtimes/pricing/quote', 'post'>;
export type ShowtimeMutationResponse = JsonResponse<'/api/v1/showtimes', 'post'>;
export type ShowtimeUpdateResponse = JsonResponse<'/api/v1/showtimes/{id}', 'patch'>;
export type ShowtimeDeleteResponse = JsonResponse<'/api/v1/showtimes/{id}', 'delete'>;
export type FreeSlotsResponse = JsonResponse<'/api/v1/showtimes/rooms/{roomId}/free-slots', 'get'>;
export type FreeSlotWindow = FreeSlotsResponse['freeWindows'][number];
export type SepayTransactionsResponse = JsonResponse<'/api/v1/payments/admin/sepay/transactions', 'get'>;
export type CursorPageMeta = { limit: number; hasNextPage: boolean; hasPreviousPage: boolean; nextCursor: string | null; previousCursor: string | null };
export type CursorBookingsResponse = { data: Booking[]; meta: CursorPageMeta };
export type CursorTicketsResponse = { data: Ticket[]; meta: CursorPageMeta };
export type SepayTransaction = components['schemas']['SepayTransactionResponseDto'];
export type CursorSepayTransactionsResponse = { data: SepayTransaction[]; meta: CursorPageMeta };
export type UpdateSepayTransactionRequest = RequestBody<'/api/v1/payments/admin/sepay/transactions/{id}', 'patch'>;
export type OperationsStatus = JsonResponse<'/api/v1/admin/operations/status', 'get'>;
